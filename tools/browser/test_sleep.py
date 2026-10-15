"""Browsertest Schlaf-Hebel (Recovery-Karte + Heute-Eingabe). Aufruf: python3 tools/browser/test_sleep.py <screenshot-ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools, datetime as dt
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1]; os.makedirs(shots,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
fails=0
def ck(n,c,x=''):
    global fails
    print(('ok     ' if c else 'FEHLER ')+n+(' '+str(x) if x!='' else ''),flush=True)
    if not c: fails+=1
def build(n):
    days={};seed={}
    start=dt.date(2026,10,14)-dt.timedelta(days=n-1)
    for i in range(n):
        e=start+dt.timedelta(days=i); alc=(i%3==0)
        bed=dt.datetime(e.year,e.month,e.day,20,30,tzinfo=dt.timezone.utc)      # 22:30 Ortszeit (+02:00)
        end=bed+dt.timedelta(minutes=480); wake=(end+dt.timedelta(hours=2)).date().isoformat()
        st=450*60e3
        days[wake]={'workouts':[],'sleep':{'id':'s%d'%i,'start':bed.isoformat().replace('+00:00','Z'),'end':end.isoformat().replace('+00:00','Z'),'tz':'+02:00','nap':False,
            'score':{'stage_summary':{'total_light_sleep_time_milli':st*.5,'total_slow_wave_sleep_time_milli':st*.25,'total_rem_sleep_time_milli':st*.25},'sleep_performance_percentage':82}},
            'recovery':{'score':{'hrv_rmssd_milli':(45 if alc else 75)+(i*3)%5,'resting_heart_rate':55,'recovery_score':60}}}
        seed['users/u1/days/'+e.isoformat()]={'date':e.isoformat(),'in':{'alkohol':1} if alc else {'dummy':0},'closed':True,'rulesVersion':2}
    return days,seed
def run(p,w,h,n,expect):
    t=f'[{w}px, {n} Nächte] '
    days,seed=build(n)
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True)
    ctx.add_init_script('window.__seed='+json.dumps(seed)+';')
    for nm,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%nm),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    def worker(r):
        hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if '/data' in r.request.url: return r.fulfill(headers=hd,body=json.dumps({'days':days}))
        return r.fulfill(headers=hd,body='{}')
    ctx.route(re.compile(r'workers\.dev'),worker)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'about:blank' not in m.text else None)
    pg.clock.set_fixed_time('2026-10-15T19:00:00+02:00')
    pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_selector('#sleepLever .slLine',timeout=20000); pg.wait_for_timeout(500)
    txt=pg.inner_text('#sleepLever')
    ck(t+'Karte zeigt Befund',expect in txt,txt[:160].replace('\n',' | '))
    if n>=14:
        ck(t+'Belegzeile mit n und Median','Mit: Median' in txt and 'Ohne: Median' in txt and 'n=' in txt)
        ck(t+'Handlung + Geprüft-Liste + Angenommen + Ehrlichkeitssatz','Handlung:' in txt and 'Geprüft und kein Hebel' in txt and 'Angenommen' in txt and 'reißt auch bei reinem Zufall' in txt)
        ck(t+'Sicherheitsfrage offen (unbekannt)','Sicherheitsfrage' in txt and 'Aktuell: unbekannt' in txt)
        ck(t+'Schlaf-Karte als Text','SCHLAF-KARTE' in txt and 'Schnarchen/Tagesmüdigkeit: unbekannt' in txt)
        st=pg.evaluate('window.__store');cards=[k for k in st if '/sleepcards/' in k]
        ck(t+'Karte in Firestore (neue Collection)',len(cards)==1 and st[cards[0]]['hebelId']==5,cards)
        pg.tap('#sleepLever [data-sf=ja]'); pg.wait_for_timeout(500)
        txt=pg.inner_text('#sleepLever');ck(t+'Antwort „ja“: Abklärung oben, kein Hebel','Zuerst abklären' in txt and 'Kein Hebel – hier steht erst ein Verdacht' in txt)
        st=pg.evaluate('window.__store');ck(t+'Antwort gespeichert',st.get('users/u1/sleepcfg/main',{}).get('safety')=='ja')
        pg.tap('#sleepLever [data-sf=nein]') if pg.locator('#sleepLever [data-sf=nein]').count() else None
    else:
        ck(t+'Zettel mit vier Dingen',pg.locator('#sleepLever ul li').count()==4)
    pg.screenshot(path=os.path.join(shots,f'sleep_{w}_{n}.png'),full_page=False)
    ck(t+'keine Konsolenfehler',not errs,errs[:3])
    b.close()
with sync_playwright() as p:
    run(p,1280,900,40,'Alkohol')
    run(p,393,852,40,'Alkohol')
    run(p,1024,800,9,'Noch nicht prüfbar')
    # Heute: Mahlzeit & Krank
    days,seed=build(5)
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1024,'height':900})
    ctx.add_init_script('window.__seed={};')
    for nm,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%nm),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    ctx.route(re.compile(r'workers\.dev'),lambda r:r.fulfill(headers={'access-control-allow-origin':'*','content-type':'application/json'},body='{"days":{}}') if r.request.method!='OPTIONS' else r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}))
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.clock.set_fixed_time('2026-10-15T19:00:00+02:00')
    pg.goto(f'http://127.0.0.1:{port}/heute.html');pg.wait_for_selector('#meal',timeout=20000);pg.wait_for_timeout(800)
    pg.fill('#meal','21:15');pg.dispatch_event('#meal','change');pg.wait_for_timeout(500)
    st=pg.evaluate('window.__store');dk=[k for k in st if '/days/' in k]
    ck('[Heute] Mahlzeit gespeichert',any(st[k].get('meal')=='21:15' for k in dk),dk)
    pg.check('#sickBox');pg.wait_for_timeout(400);st=pg.evaluate('window.__store')
    ck('[Heute] Krank gespeichert',any(st[k].get('sick') is True for k in dk if k in st))
    ck('[Heute] keine Fehler',not errs,errs[:2])
    b.close()
srv.shutdown()
print('FEHLER: '+str(fails) if fails else 'FEHLER: keine');sys.exit(1 if fails else 0)
