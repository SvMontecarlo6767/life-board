"""Design-Umschalter: Cockpit <-> Dschungel. Prüft: Umschalten per Zahnrad, Speicherung, Reiterfarben, keine Konsolenfehler,
kein Seitwärtsscroll, Graph-Vollbild funktioniert unverändert. Aufruf: python3 tools/browser/test_theme.py <Ordner>"""
import re, json, sys, os, math, threading, http.server, socketserver, functools, datetime
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); out=sys.argv[1]; os.makedirs(out,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
H=3.6e6; days={}; today=datetime.date(2026,10,14)
for i in range(44,-1,-1):
    d=(today-datetime.timedelta(days=i)).isoformat(); b=60+25*math.sin(i/6)
    days[d]={'cycle':{'steps':6000+(i%7)*1300,'score':{'strain':8+6*abs(math.sin(i/4))}},'recovery':{'score':{'recovery_score':round(b),'hrv_rmssd_milli':60+b/4,'resting_heart_rate':58-b/12}},
     'sleep':{'start':d+'T20:30:00.000Z','end':d+'T05:30:00.000Z','tz':'+02:00','nap':False,'score':{'sleep_performance_percentage':70+(i%25),'sleep_efficiency_percentage':90,'sleep_consistency_percentage':80,'stage_summary':{'total_light_sleep_time_milli':4*H,'total_slow_wave_sleep_time_milli':1.5*H,'total_rem_sleep_time_milli':2*H,'total_awake_time_milli':.4*H}}},'workouts':[]}
seed={'users/u1/days/2026-10-14':{'date':'2026-10-14','rulesVersion':2,'in':{'kraft':1,'lernblock':50},'a':{},'x':{},'net':900,'rank':'B','closed':False,'updatedAt':1},
 'users/u1/state/current':{'account':12840,'level':4,'levelProgress':.42,'days':9,'todayNet':900,'todayRank':'B'},
 'users/u1/questions/q1':{'id':'q1','pageId':'p1','pageTitle':'Thema 66 Spieltheorie','idx':0,'text':'Was ist eine dominante Strategie?','stage':1,'reps':0,'due':'2026-10-14'}}
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
def worker(r):
    hd={'access-control-allow-origin':'*','content-type':'application/json'}
    if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
    if '/notion' in r.request.url: return r.fulfill(headers=hd,body='{"pages":[]}')
    return r.fulfill(headers=hd,body=json.dumps({'days':days}))
PAGES=[('index.html','#hub:not([hidden])'),('checkin.html','#morning'),('recovery.html','#content:not([hidden])'),('learn.html','#stats'),
       ('training.html','#lb-nav'),('muster.html','#lb-nav'),('calendar.html','#lb-nav'),('checkin.html','#lb-nav'),('news.html','#lb-nav')]
fails=[]
def check(c,msg):
    print(('  ok   ' if c else '  FAIL ')+msg)
    if not c: fails.append(msg)
with sync_playwright() as p:
    for w,h in((1024,768),(390,844)):
        b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True)
        ctx.add_init_script('window.__seed='+json.dumps(seed)+';')
        for n,body in(('app',mock),('auth',''),('firestore','')):
            ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
        ctx.route(re.compile(r'workers\.dev'),worker)
        ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
        print(f'== Breite {w}')
        # 1) Umschalten per Zahnrad auf der Recovery-Seite
        pg=ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'fonts' not in m.text and 'ERR_FAILED' not in m.text else None)
        pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_selector('#content:not([hidden])',timeout=15000); pg.wait_for_timeout(800)
        check(pg.evaluate("!document.documentElement.hasAttribute('data-theme')"),'Start: Cockpit (kein data-theme)')
        acc0=pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()")
        pg.screenshot(path=f'{out}/recovery-cockpit-{w}.png')
        pg.click('#lb-gear'); pg.wait_for_selector('#lb-set .lb-th[data-th=jungle]')
        check(pg.evaluate("document.querySelectorAll('#lb-set .lb-th[data-th]').length")==2,'Zahnrad zeigt zwei Designs')
        pg.click('#lb-set .lb-th[data-th=jungle]'); pg.wait_for_timeout(1200)
        check(pg.evaluate("document.documentElement.getAttribute('data-theme')")=='jungle','Klick setzt data-theme=jungle')
        acc1=pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()")
        check(acc1!=acc0,f'Akzent wechselt ({acc0} -> {acc1})')
        check(json.loads(pg.evaluate("localStorage.getItem('lb_ui')")).get('theme')=='jungle','Auswahl in localStorage gespeichert')
        check(pg.evaluate("document.querySelector('#lb-nav a.tab.act').style.getPropertyValue('--tc').trim()")==acc1,'aktiver Reiter hat Dschungel-Farbe')
        check(pg.evaluate("document.querySelector('meta[name=theme-color]').content")=='#050d08','theme-color angepasst')
        pg.click('#lb-gear'); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{out}/recovery-jungle-{w}.png')
        # 2) Graph-Vollbild funktioniert im Dschungel wie vorher
        btn=pg.query_selector('.gf-btn:not([hidden])')
        if btn:
            btn.scroll_into_view_if_needed(); btn.click(); pg.wait_for_timeout(900)
            ov=pg.query_selector('#gf .gf-stage svg')
            check(ov is not None,'Graph-Vollbild öffnet im Dschungel-Design')
            pg.screenshot(path=f'{out}/graphfull-jungle-{w}.png')
        else: print('  (Vergrößern-Knopf-Selektor nicht gefunden, siehe test_graphfull.py)')
        check(not errs,f'keine Konsolenfehler beim Umschalten {errs[:2]}')
        pg.close()
        # 2b) bleibt nach Neuladen und auf allen Seiten, ohne Flackern (Attribut schon vor dem Rendern)
        for page,sel in PAGES:
            pg=ctx.new_page(); errs=[]
            pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'fonts' not in m.text and 'ERR_FAILED' not in m.text else None)
            pg.goto(f'http://127.0.0.1:{port}/{page}',wait_until='commit')
            pg.wait_for_function("document.documentElement.getAttribute('data-theme')==='jungle'",timeout=3000)
            pg.wait_for_selector(sel,timeout=15000); pg.wait_for_timeout(1300)
            ok_scroll=pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
            try: pg.wait_for_selector('.lb-bgl.on',state='attached',timeout=12000)
            except Exception: pass
            bg=pg.evaluate("!!document.querySelector('.lb-bgl.on')")
            check(not errs and ok_scroll and bg,f'{page}: Dschungel, Fehler={errs[:1]}, kein Seitwärtsscroll={ok_scroll}, Hintergrund={bg}')
            pg.screenshot(path=f'{out}/jungle-{page[:-5]}-{w}.png'); pg.close()
        # 3) zurück auf Cockpit
        pg=ctx.new_page(); pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_selector('#hub:not([hidden])'); pg.wait_for_timeout(600)
        pg.click('#lb-gear'); pg.click('#lb-set .lb-th[data-th=cockpit]'); pg.wait_for_timeout(1200)
        check(pg.evaluate("!document.documentElement.hasAttribute('data-theme')"),'zurück auf Cockpit entfernt data-theme')
        check(pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()")==pg.evaluate("document.querySelector('#lb-nav a.tab.act').style.getPropertyValue('--tc').trim()"),'Cockpit-Akzent passt zum Reiter')
        pg.close(); ctx.clear_cookies(); b.close()
print('FEHLER:',len(fails)); sys.exit(1 if fails else 0)
