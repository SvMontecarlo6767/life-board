"""Browsertest Training, Allround-Ansicht (Chromium, 1280/390 px): Einheit eintragen, Wochenziel, Logbuch, Löschen, Whoop-Abgleich, Ansicht-Umschalter.
Aufruf: python3 tools/browser/test_training_multi.py <screenshot-ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1]; os.makedirs(shots,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{port}/training.html'
fails=0
def ck(n,c,x=''):
    global fails
    print(('ok     ' if c else 'FEHLER ')+n+(' '+str(x) if x!='' else ''),flush=True)
    if not c: fails+=1
WHOOP={'days':{'2026-10-12':{'workouts':[{'id':501,'sport':'Weightlifting','start':'2026-10-12T16:00:00.000Z','end':'2026-10-12T17:00:00.000Z','score':{'strain':9.4,'average_heart_rate':120,'max_heart_rate':165,'kilojoule':1100}}]},'2026-10-13':{'workouts':[{'id':502,'sport':'Soccer','start':'2026-10-13T16:00:00.000Z','end':'2026-10-13T17:30:00.000Z','score':{'strain':12.5,'average_heart_rate':140,'max_heart_rate':186,'distance_meter':7000}}]}}}
def run(p,w,h):
    t=f'[{w}px] '
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True)
    ctx.add_init_script('window.__seed={};')
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    calls=[]
    def worker(r):
        u=r.request.url; hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        calls.append(u)
        if '/data' in u: return r.fulfill(headers=hd,body=json.dumps(WHOOP))
        if '/strava/status' in u: return r.fulfill(headers=hd,body=json.dumps({'configured':False}))
        return r.fulfill(headers=hd,body='{}')
    ctx.route(re.compile(r'workers\.dev'),worker)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'about:blank' not in m.text else None)
    pg.on('dialog',lambda d:d.accept())
    pg.clock.set_fixed_time('2026-10-15T09:00:00+02:00')
    pg.goto(URL); pg.wait_for_function('window.__trainingReady===true',timeout=20000); pg.wait_for_timeout(600)
    ck(t+'Allround ist die Standardansicht',pg.is_visible('#mcontent') and not pg.is_visible('#content'))
    ck(t+'Eintrag-Formular da',pg.is_visible('#mSave') and pg.locator('#mSports [data-s]').count()==14)
    # Whoop kam automatisch
    n=pg.evaluate("document.querySelectorAll('#m-log tbody tr, table.log tbody tr').length")
    ck(t+'Whoop-Workouts automatisch übernommen (2)',n==2,n)
    ck(t+'Strain im Logbuch','Strain 12,5' in pg.inner_text('table.log'))
    ck(t+'Fußball aus Whoop erkannt','Fußball' in pg.inner_text('table.log'))
    # Eintragen
    pg.tap('#mSports [data-s=Kraft]'); pg.fill('#mMin','75'); pg.tap('#mRpe [data-r="8"]')
    ck(t+'Belastungsschätzung sichtbar','Belastungspunkte' in pg.inner_text('#mEst'),pg.inner_text('#mEst'))
    pg.tap('#mSave'); pg.wait_for_timeout(700)
    ck(t+'Eintrag gespeichert und im Logbuch',pg.evaluate("document.querySelectorAll('table.log tbody tr').length")==3)
    st=pg.evaluate('window.__store'); acts=[o for k,v in st.items() if '/training/acts_' in k for o in v['list']]
    mine=[o for o in acts if o['i'].startswith('m')]
    ck(t+'In Firestore (Anstrengung 8)',len(mine)==1 and mine[0]['x']==8 and mine[0]['s']==4500 and mine[0]['r']=='Kraft',mine)
    # Validierung
    pg.fill('#mMin','2'); pg.tap('#mSave'); ck(t+'Zu kurze Dauer wird abgelehnt','zwischen 5' in pg.inner_text('#mMsg'))
    # weitere Einträge an anderen Tagen
    for d,s,mn in(('2026-10-13','Fußball',90),('2026-10-11','Yoga',40),('2026-10-09','Rad',120),('2026-10-08','Kraft',60)):
        pg.fill('#mDate',d); pg.tap('#mSports [data-s=%s]'%s); pg.fill('#mMin',str(mn))
        if s=='Rad': pg.fill('#mKm','45')
        pg.tap('#mSave'); pg.wait_for_timeout(500)
    ck(t+'Sieben Einträge im Logbuch',pg.evaluate("document.querySelectorAll('table.log tbody tr').length")==7)
    ck(t+'Woche zählt Einheiten','von 3' in pg.inner_text('#m-woche + .secsub + .g') or 'von 3' in pg.inner_text('body'))
    ck(t+'Wochen-Diagramm gezeichnet',pg.locator('#m-weeks svg rect').count()>5)
    ck(t+'Form-Diagramm + Tacho',pg.locator('#c-form svg').count()==1 and pg.locator('#c-gauge svg').count()==1)
    ck(t+'Skyline + Kalender + Raster',pg.locator('#sky svg').count()==1 and pg.locator('#c-cal .cal i').count()>300 and pg.locator('#habit svg').count()==1)
    ck(t+'Sportarten-Verteilung',pg.locator('.hb').count()>=4)
    ck(t+'Rekorde',pg.locator('.rec').count()>=9 and 'Weiteste Radtour' in pg.inner_text('#mcontent'))
    pg.tap('#mLogChips [data-ls=Kraft]'); pg.wait_for_timeout(300)
    ck(t+'Logbuch-Filter',pg.evaluate("document.querySelectorAll('table.log tbody tr').length")==3)
    pg.tap('#mLogChips [data-ls=Alle]'); pg.wait_for_timeout(300)
    # Wochen-Umschalter
    pg.tap('[data-w=n]'); pg.wait_for_timeout(300); ck(t+'Wochen: Einheiten mit Ziellinie','Ziel 3' in pg.inner_text('#m-weeks'))
    pg.tap('[data-m=load]'); pg.wait_for_timeout(300); ck(t+'Skyline: Belastung',pg.locator('#sky svg').count()==1)
    # Profil
    pg.fill('#pName','Max'); pg.tap('#pGoal [data-g="4"]'); pg.tap('#pSave'); pg.wait_for_timeout(600)
    ck(t+'Profil: Name und Wochenziel',pg.evaluate("window.__store['users/u1/training/settings'].goal")==4 and 'Max' in pg.inner_text('.hello'))
    # Löschen: eigener und Whoop
    pg.tap('table.log [data-del]:first-of-type'); pg.wait_for_timeout(600)
    ck(t+'Löschen entfernt Eintrag',pg.evaluate("document.querySelectorAll('table.log tbody tr').length")==6)
    wbtn=pg.locator('table.log tr:has-text("Strain 12,5") [data-del]'); wbtn.tap(); pg.wait_for_timeout(600)
    ck(t+'Whoop-Eintrag gelöscht',pg.evaluate("document.querySelectorAll('table.log tbody tr').length")==5)
    pg.tap('.whGo[data-m=sync]'); pg.wait_for_timeout(900)
    ck(t+'Abgleich holt Gelöschtes nicht zurück','Strain 12,5' not in pg.inner_text('table.log'))
    ck(t+'Abgleich ruft /sync und /data',any('/sync' in u for u in calls) and any('/data' in u for u in calls))
    ck(t+'Kein Seitwärtsscroll',pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),pg.evaluate('document.documentElement.scrollWidth'))
    pg.screenshot(path=f'{shots}/multi_{w}.png',full_page=True)
    # Reload: bleibt erhalten
    pg.reload(); pg.wait_for_function('window.__trainingReady===true',timeout=20000); pg.wait_for_timeout(800)
    ck(t+'Nach Neuladen noch alles da',pg.evaluate("document.querySelectorAll('table.log tbody tr').length")==5)
    # Umschalter
    pg.tap('#viewSw [data-v=lauf]'); pg.wait_for_timeout(600)
    ck(t+'Läufer-Ansicht öffnet',(pg.is_visible('#content') or pg.is_visible('#setup')) and not pg.is_visible('#mcontent'))
    pg.tap('#viewSw [data-v=multi]'); pg.wait_for_timeout(600)
    ck(t+'Zurück zu Allround, Import-Karte wieder da',pg.is_visible('#mcontent') and pg.locator('#mImp #onboard').count()==1)
    ck(t+'Keine Konsolenfehler',errs==[],errs[:3])
    b.close()
with sync_playwright() as p:
    run(p,1280,900); run(p,390,844)
print('\nFEHLER:',fails if fails else 'keine'); sys.exit(1 if fails else 0)
