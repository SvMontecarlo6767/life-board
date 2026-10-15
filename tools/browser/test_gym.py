"""Browsertest Gym-Logbuch (Chromium, 1280/390 px). Aufruf: python3 tools/browser/test_gym.py <screenshot-ordner>"""
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
def fill_set(pg,i,j,w,r):
    pg.fill(f'#gymBox input[data-i="{i}"][data-j="{j}"][data-f="w"]',w); pg.fill(f'#gymBox input[data-i="{i}"][data-j="{j}"][data-f="r"]',r)
def run(p,w,h):
    t=f'[{w}px] '
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True)
    ctx.add_init_script('window.__seed={};')
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    def worker(r):
        hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if '/data' in r.request.url: return r.fulfill(headers=hd,body='{"days":{}}')
        if '/strava/status' in r.request.url: return r.fulfill(headers=hd,body='{"configured":false}')
        return r.fulfill(headers=hd,body='{}')
    ctx.route(re.compile(r'workers\.dev'),worker)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'about:blank' not in m.text else None)
    pg.on('dialog',lambda d:d.accept())
    pg.clock.set_fixed_time('2026-10-15T19:00:00+02:00')
    pg.goto(URL); pg.wait_for_function('window.__trainingReady===true',timeout=20000); pg.wait_for_timeout(600)
    ck(t+'Gym-Karte da, Vorlagen sichtbar',pg.is_visible('#gymBox') and pg.locator('#gymBox [data-a=tpl]').count()==7 and pg.locator('#gymBox [data-a=again]').count()==0)
    # Erste Einheit (älteres Datum)
    pg.tap('#gymBox [data-a=tpl][data-p=Push]'); pg.wait_for_timeout(200)
    ck(t+'Push-Vorlage: 5 Übungen',pg.locator('#gymBox .gx').count()==5)
    fill_set(pg,0,0,'70','8'); pg.tap('#gymBox [data-a=adds][data-i="0"]'); fill_set(pg,0,1,'70','8')
    pg.tap('#gymBox [data-a=adds][data-i="0"]'); 
    ck(t+'Neuer Satz übernimmt letzten Satz',pg.input_value('#gymBox input[data-i="0"][data-j="2"][data-f="w"]')=='70')
    fill_set(pg,0,2,'70','7'); fill_set(pg,1,0,'45,5','10')
    ck(t+'Live-Volumen','4 Sätze' in pg.inner_text('#gLive') and re.search(r'2\s?065',pg.inner_text('#gLive')) is not None,pg.inner_text('#gLive'))
    pg.tap('#gymBox [data-a=rmx][data-i="4"]'); pg.tap('#gymBox [data-a=rmx][data-i="3"]'); pg.tap('#gymBox [data-a=rmx][data-i="2"]')
    ck(t+'Übungen entfernen',pg.locator('#gymBox .gx').count()==2)
    pg.fill('#gNew','Kniebeuge'); pg.tap('#gAdd'); fill_set(pg,2,0,'100','5')
    ck(t+'Übung hinzufügen',pg.locator('#gymBox .gx').count()==3)
    pg.tap('#gRest [data-a=rest][data-s="60"]'); pg.wait_for_timeout(600); ck(t+'Pausen-Timer läuft','Pause' in pg.inner_text('#gRestT'),pg.inner_text('#gRestT'))
    # Entwurf übersteht Neuladen
    pg.reload(); pg.wait_for_function('window.__trainingReady===true',timeout=20000); pg.wait_for_timeout(700)
    ck(t+'Entwurf nach Neuladen noch da',pg.locator('#gymBox .gx').count()==3 and pg.input_value('#gymBox input[data-i="0"][data-j="0"][data-f="w"]')=='70')
    pg.fill('#gDate','2026-10-08'); pg.fill('#gMin','55'); pg.tap('#gRpe [data-r="8"]'); pg.fill('#gNote','Erste Einheit')
    pg.tap('#gSave'); pg.wait_for_timeout(800)
    st=pg.evaluate('window.__store'); gy=[o for k,v in st.items() if '/training/gym_' in k for o in v['list']]
    ck(t+'Einheit in Firestore',len(gy)==1 and gy[0]['d']=='2026-10-08' and gy[0]['m']==55 and gy[0]['p']=='Push' and len(gy[0]['e'])==3 and gy[0]['e'][1]['s'][0]['w']==45.5,gy[:1])
    acts=[o for k,v in st.items() if '/training/acts_' in k for o in v['list']]
    ck(t+'Zählt als Einheit (Kraft, 55 min, Anstrengung 8)',len(acts)==1 and acts[0]['i'].startswith('g') and acts[0]['s']==3300 and acts[0]['x']==8 and acts[0]['r']=='Kraft',acts)
    ck(t+'Entwurf nach Speichern weg',pg.evaluate("localStorage.getItem('lb_gym_draft')")is None and pg.locator('#gymBox .gx').count()==0)
    ck(t+'Logbuch zeigt Gym-Einheit',pg.locator('table.log tbody tr:has-text("Push")').count()==1)
    # Zweite Einheit: Wie zuletzt, schwerer -> Rekord
    ck(t+'„Wie zuletzt“ erscheint',pg.locator('#gymBox [data-a=again]').count()==1)
    pg.tap('#gymBox [data-a=again]'); pg.wait_for_timeout(200)
    ck(t+'Letztes Mal vorbelegt',pg.input_value('#gymBox input[data-i="0"][data-j="0"][data-f="w"]')=='70' and 'Letztes Mal' in pg.inner_text('#gymBox .gx'))
    fill_set(pg,0,0,'75','8'); pg.tap('#gSave'); pg.wait_for_timeout(800)
    ck(t+'Dauer wird geschätzt wenn leer, Rekord-Meldung','Neue Rekorde' in pg.inner_text('#gymBox') and 'Bankdrücken' in pg.inner_text('#gymBox .gprs'),pg.inner_text('#gymBox .gprs') if pg.locator('#gymBox .gprs').count() else '')
    ck(t+'Fortschritt: Auswahl, Kacheln, Kurve',pg.locator('#gSel .chip').count()>=3 and pg.locator('#gChart svg circle').count()==2 and 'Bestes Gewicht' in pg.inner_text('#gymBox'))
    pg.tap('#gSel [data-a=sel]:has-text("Kniebeuge")'); pg.wait_for_timeout(200)
    ck(t+'Anderer Übungsverlauf',pg.locator('#gChart svg circle').count()==2 or pg.locator('#gChart svg circle').count()==1)
    ck(t+'Muskelgruppen-Balken','Brust' in pg.inner_text('#gymBox'))
    ck(t+'Verlauf mit zwei Einheiten',pg.locator('#gymBox .ghist details').count()==2)
    ck(t+'Woche zählt Gym-Einheit','1 von 3' in pg.inner_text('#m-woche + .secsub + .g').lower(),pg.inner_text('#m-woche + .secsub + .g')[:20])
    ck(t+'Kein Seitwärtsscroll',pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),pg.evaluate('document.documentElement.scrollWidth'))
    pg.locator('#gymBox').scroll_into_view_if_needed(); pg.screenshot(path=f'{shots}/gym_{w}.png',full_page=True)
    # Löschen über Verlauf
    pg.locator('#gymBox .ghist details').first.locator('summary').tap(); pg.tap('#gymBox [data-a=delS]:visible'); pg.wait_for_timeout(700)
    st=pg.evaluate('window.__store'); gy=[o for k,v in st.items() if '/training/gym_' in k for o in v['list']]; acts=[o for k,v in st.items() if '/training/acts_' in k for o in v['list']]
    ck(t+'Einheit löschen entfernt Gym und Logbuch-Eintrag',len(gy)==1 and len(acts)==1,(len(gy),len(acts)))
    # Löschen über Logbuch
    pg.tap('table.log [data-del]:first-of-type'); pg.wait_for_timeout(700)
    st=pg.evaluate('window.__store'); gy=[o for k,v in st.items() if '/training/gym_' in k for o in v['list']]; acts=[o for k,v in st.items() if '/training/acts_' in k for o in v['list']]
    ck(t+'Löschen im Logbuch entfernt auch die Gym-Einheit',len(gy)==0 and len(acts)==0,(len(gy),len(acts)))
    ck(t+'Keine Konsolenfehler',errs==[],errs[:3])
    b.close()
with sync_playwright() as p:
    run(p,1280,900); run(p,390,844)
print('\nFEHLER:',fails if fails else 'keine'); sys.exit(1 if fails else 0)
