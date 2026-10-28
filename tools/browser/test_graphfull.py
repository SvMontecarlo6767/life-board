"""Browsertest Graph-Vollbild (Recovery, Training). Aufruf: python3 tools/browser/test_graphfull.py <screenshot-ordner>"""
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
    days={};end=dt.date(2026,10,15)
    for i in range(n):
        d=end-dt.timedelta(days=i);k=d.isoformat()
        if dt.date(2026,9,10)<=d<=dt.date(2026,9,14): continue
        days[k]={'workouts':[],'recovery':{'score':{'hrv_rmssd_milli':60+(i*7)%23,'resting_heart_rate':50+(i*3)%9,'recovery_score':(i*13)%100}},
                 'sleep':{'id':'s%d'%i,'start':k+'T00:00:00Z','end':k+'T07:00:00Z','tz':'+02:00','nap':False,'score':{'sleep_performance_percentage':70+(i%25),'stage_summary':{'total_light_sleep_time_milli':3.6e6*3.5,'total_slow_wave_sleep_time_milli':3.6e6*1.5,'total_rem_sleep_time_milli':3.6e6*2}}},
                 'cycle':{'steps':6000+(i*311)%6000,'score':{'strain':8+(i%9),'kilojoule':9000}}}
    return days
def ctxs(p,w,h,days,touch=True):
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=touch)
    ctx.add_init_script('window.__seed={};')
    for nm,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%nm),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    def worker(r):
        hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if '/data' in r.request.url: return r.fulfill(headers=hd,body=json.dumps({'days':days}))
        return r.fulfill(headers=hd,body='{}')
    ctx.route(re.compile(r'workers\.dev'),worker)
    return b,ctx
def ptr(pg,sel,typ,pid,x,y):
    pg.evaluate("""([sel,typ,pid,x,y])=>{const e=document.querySelector(sel);e.dispatchEvent(new PointerEvent(typ,{pointerId:pid,pointerType:'touch',clientX:x,clientY:y,bubbles:true,isPrimary:pid===1}))}""",[sel,typ,pid,x,y])
def run(p,w,h,tag,animate=False):
    t=f'[{w}x{h}] '
    days=build(400)
    b,ctx=ctxs(p,w,h,days); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'about:blank' not in m.text else None)
    if animate: pg.add_init_script('window.__gfAnimate=true;')
    pg.clock.set_fixed_time('2026-10-15T19:00:00+02:00')
    pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_selector('#c-hrv svg',timeout=20000); pg.wait_for_timeout(900)
    try: pg.wait_for_function("document.querySelectorAll('.gf-btn:not([hidden])').length>=11",timeout=4000)
    except Exception: pass
    n=pg.locator('.gf-btn:not([hidden])').count()
    ck(t+'Vergrößern-Knöpfe an den Graphen',n>=11,n)
    bb=pg.locator('#c-hrv').evaluate("e=>{const b=e.closest('.card').querySelector('.gf-btn');const r=b.getBoundingClientRect();return [r.width,r.height]}")
    ck(t+'Knopf mind. 44 px',bb[0]>=44 and bb[1]>=44,bb)
    sy0=pg.evaluate('scrollY')
    pg.evaluate("document.querySelector('#c-hrv').closest('.card').scrollIntoView({block:'center'})"); sy1=pg.evaluate('scrollY')
    pg.locator('#c-hrv').evaluate("e=>e.closest('.card').querySelector('.gf-btn').click()"); pg.wait_for_selector('#gf .gf-stage svg',timeout=5000); pg.wait_for_timeout(900)
    ck(t+'Vollbild offen mit Titel','HRV' in pg.inner_text('#gf h2'))
    tiles=pg.inner_text('#gfStats'); ck(t+'Statistik: Durchschnitt, Median, Bestwert, Tiefstwert, Trend, Datenpunkte',all(x in tiles for x in ['DURCHSCHNITT','MEDIAN','BESTWERT','TIEFSTWERT','TREND','DATENPUNKTE']) or all(x.lower() in tiles.lower() for x in ['Durchschnitt','Median','Bestwert','Tiefstwert','Trend','Datenpunkte']),tiles[:90].replace('\n',' '))
    if not animate: pg.screenshot(path=os.path.join(shots,f'gf_{tag}_open.png'))
    # Zeitraum wechseln
    rs=pg.eval_on_selector_all('#gfRanges .gf-r','els=>els.map(e=>e.textContent)'); ck(t+'Zeiträume 7/30/3 Monate/1 Jahr/Alles',rs==['7 Tage','30 Tage','3 Monate','1 Jahr','Alles'],rs)
    before=pg.inner_text('#gfStats'); pg.click('#gfRanges [data-r="7"]'); pg.wait_for_timeout(500); after=pg.inner_text('#gfStats')
    ck(t+'Statistik passt sich dem Zeitraum an',before!=after and '7' in pg.inner_text('#gfStats'))
    pg.click('#gfRanges [data-r="30"]'); pg.wait_for_timeout(500)
    # Lücke: 10.–14.9. = Tage ohne Daten; Tippen zeigt "keine Daten"
    pg.click('#gfRanges [data-r="90"]'); pg.wait_for_timeout(400)
    box=pg.locator('#gfStage').bounding_box()
    g=pg.evaluate("()=>{const S=GraphFull.state();const x=S.X(Math.round(Date.UTC(2026,8,12)/864e5));const r=S.stage.getBoundingClientRect();return r.left+x*(r.width/S.geo.W)}")
    y=box['y']+box['height']/2
    ptr(pg,'#gfStage','pointerdown',1,g,y); ptr(pg,'#gfStage','pointerup',1,g,y); pg.wait_for_timeout(250)
    ck(t+'Tippen auf Lücke: „keine Daten“','keine Daten' in pg.inner_text('#gfStage'))
    # Tippen auf einen Punkt: Tooltip mit Datum und Wert
    pg.click('#gfRanges [data-r="30"]'); pg.wait_for_timeout(400)
    ptr(pg,'#gfStage','pointerdown',1,box['x']+box['width']*0.6,y); ptr(pg,'#gfStage','pointerup',1,box['x']+box['width']*0.6,y); pg.wait_for_timeout(250)
    tip=pg.inner_text('.gf-tip') if pg.locator('.gf-tip').count() else ''
    ck(t+'Tippen auf Punkt: Wochentag, Datum, Wert, Einheit',re.search(r'(Mo|Di|Mi|Do|Fr|Sa|So), \d\d\.\d\d\.2026',tip) is not None and 'ms' in tip,tip.replace('\n',' | '))
    if not animate: pg.screenshot(path=os.path.join(shots,f'gf_{tag}_tip.png'))
    # Tippen daneben schließt Fenster
    ptr(pg,'#gfStage','pointerdown',1,box['x']+10,y-box['height']*0.45); ptr(pg,'#gfStage','pointerup',1,box['x']+10,y-box['height']*0.45); pg.wait_for_timeout(200)
    ck(t+'Tippen daneben schließt das Fenster',pg.locator('.gf-tip').count()==0)
    # Wischen: Markierung folgt, bleibt stehen
    x1=box['x']+box['width']*0.3; x2=box['x']+box['width']*0.7
    ptr(pg,'#gfStage','pointerdown',1,x1,y)
    for k in range(1,6): ptr(pg,'#gfStage','pointermove',1,x1+(x2-x1)*k/5,y)
    live=pg.locator('.gf-tip').count()==1
    ptr(pg,'#gfStage','pointerup',1,x2,y); pg.wait_for_timeout(200)
    ck(t+'Wischen: Markierung mit Wert, bleibt nach Loslassen',live and pg.locator('.gf-tip').count()==1)
    # Zwei-Finger-Zoom
    sp0=pg.evaluate('GraphFull.state().x1-GraphFull.state().x0')
    cx=box['x']+box['width']/2
    ptr(pg,'#gfStage','pointerdown',1,cx-30,y); ptr(pg,'#gfStage','pointerdown',2,cx+30,y)
    for k in range(1,6):
        ptr(pg,'#gfStage','pointermove',1,cx-30-k*25,y); ptr(pg,'#gfStage','pointermove',2,cx+30+k*25,y)
    ptr(pg,'#gfStage','pointerup',1,cx-155,y); ptr(pg,'#gfStage','pointerup',2,cx+155,y); pg.wait_for_timeout(200)
    sp1=pg.evaluate('GraphFull.state().x1-GraphFull.state().x0'); ck(t+'Zwei-Finger-Zoom verkleinert den Ausschnitt',sp1<sp0-0.5,(sp0,sp1))
    # Verschieben mit einem Finger (gezoomt)
    a0=pg.evaluate('GraphFull.state().x0'); ptr(pg,'#gfStage','pointerdown',1,cx,y)
    for k in range(1,6): ptr(pg,'#gfStage','pointermove',1,cx+k*20,y)
    ptr(pg,'#gfStage','pointerup',1,cx+100,y); a1=pg.evaluate('GraphFull.state().x0'); ck(t+'Verschieben im gezoomten Zustand',a1<a0,(a0,a1))
    pg.click('#gfChips [data-a="reset"]'); pg.wait_for_function('(()=>{const S=GraphFull.state();return Math.abs((S.x1-S.x0)-(S.full[1]-S.full[0]))<0.01})()',timeout=6000)
    sp2=pg.evaluate('GraphFull.state().x1-GraphFull.state().x0'); ck(t+'Zurücksetzen stellt Ausgangsansicht her',abs(sp2-sp0)<0.01,(sp0,sp2))
    # Bestwert / Tiefstwert / Heute / Datum
    pg.click('#gfChips [data-a="best"]'); pg.wait_for_timeout(700); ck(t+'Bestwert springt und markiert','gf-tip' in pg.content())
    pg.click('#gfChips [data-a="worst"]'); pg.wait_for_timeout(700)
    pg.click('#gfChips [data-a="today"]'); pg.wait_for_timeout(700); ck(t+'Heute springt','15.10.2026' in pg.inner_text('.gf-tip'),pg.inner_text('.gf-tip')[:40] if pg.locator('.gf-tip').count() else '')
    pg.click('#gfCal'); pg.wait_for_selector('.gf-cal button[data-d]',timeout=3000)
    dis=pg.locator('.gf-cal button[data-d][disabled]').count(); en=pg.locator('.gf-cal button[data-d]:not([disabled])').count()
    ck(t+'Datumswähler zeigt wählbare Tage',en>0 and en+dis>=28,(en,dis))
    pg.click('.gf-cal [data-m="-1"]'); pg.wait_for_timeout(100)   # September: Lücke 10.-14. ausgegraut
    d12=pg.locator('.gf-cal button[data-d="2026-09-12"]').is_disabled(); d09=pg.locator('.gf-cal button[data-d="2026-09-09"]').is_disabled()
    ck(t+'Tage ohne Daten ausgegraut',d12 and not d09)
    pg.click('.gf-cal button[data-d="2026-09-09"]'); pg.wait_for_timeout(900)
    ck(t+'Datumswahl springt, markiert, zeigt Wert','09.09.2026' in pg.inner_text('.gf-tip'),pg.inner_text('.gf-tip')[:60] if pg.locator('.gf-tip').count() else 'kein Tip')
    # Jarvis-Kontext
    ctxt=pg.evaluate('window.LB_PAGE_CONTEXT&&window.LB_PAGE_CONTEXT()'); ck(t+'Jarvis bekommt Graphname, Zeitraum, Statistik',ctxt and 'GRAPH-VOLLBILD' in ctxt and 'HRV' in ctxt and 'Durchschnitt' in ctxt,(ctxt or '')[-160:])
    if not animate: pg.screenshot(path=os.path.join(shots,f'gf_{tag}_date.png'))
    # Schließen per X; Seite bleibt
    pg.click('#gfX'); pg.wait_for_timeout(900 if animate else 300); ck(t+'Schließen entfernt Vollbild',pg.locator('#gf').count()==0)
    sy2=pg.evaluate('scrollY'); ck(t+'Scrollposition unverändert',abs(sy2-sy1)<2,(sy1,sy2))
    ck(t+'Jarvis-Kontext zurückgesetzt',pg.evaluate('typeof window.LB_PAGE_CONTEXT')!='function' or 'GRAPH-VOLLBILD' not in (pg.evaluate('window.LB_PAGE_CONTEXT()') or ''))
    # Schließen per Wischen nach unten am Griff
    pg.locator('#c-rec').evaluate("e=>e.closest('.card').querySelector('.gf-btn').click()"); pg.wait_for_selector('#gfGrab',timeout=3000); pg.wait_for_timeout(400)
    gb=pg.locator('#gfGrab').bounding_box(); gx=gb['x']+gb['width']/2; gy=gb['y']+gb['height']/2
    ptr(pg,'#gfGrab','pointerdown',1,gx,gy)
    for k in range(1,7): ptr(pg,'#gfGrab','pointermove',1,gx,gy+k*30)
    ptr(pg,'#gfGrab','pointerup',1,gx,gy+180)
    try: pg.wait_for_selector('#gf',state='detached',timeout=5000)
    except Exception: pass
    ck(t+'Wischen nach unten am Griff schließt',pg.locator('#gf').count()==0)
    # Wischen auf der Graphfläche schließt NICHT
    pg.locator('#c-rec').evaluate("e=>e.closest('.card').querySelector('.gf-btn').click()"); pg.wait_for_selector('#gfStage svg',timeout=3000); pg.wait_for_timeout(300)
    b2=pg.locator('#gfStage').bounding_box(); ptr(pg,'#gfStage','pointerdown',1,b2['x']+100,b2['y']+20)
    for k in range(1,7): ptr(pg,'#gfStage','pointermove',1,b2['x']+100,b2['y']+20+k*30)
    ptr(pg,'#gfStage','pointerup',1,b2['x']+100,b2['y']+200); pg.wait_for_timeout(300); ck(t+'Wischen auf der Graphfläche schließt nicht',pg.locator('#gf').count()==1)
    # Querformat
    pg.set_viewport_size({'width':h,'height':w}); pg.wait_for_timeout(500)
    r=pg.evaluate("()=>{const a=document.querySelector('#gfStage').getBoundingClientRect(),s=document.querySelector('#gfStats').getBoundingClientRect();return{sw:a.width,sx:s.left,over:document.documentElement.scrollWidth>innerWidth}}")
    ck(t+'Drehen: Graph nutzt Breite, Statistik daneben',r['sw']>h*0.45 and not r['over'],r)
    if not animate: pg.screenshot(path=os.path.join(shots,f'gf_{tag}_land.png'))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    ck(t+'keine Konsolenfehler',not errs,errs[:3]); b.close()
def clone_test(p):
    t='[Clone] '; b,ctx=ctxs(p,1024,900,{}); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    seed={}
    pg.clock.set_fixed_time('2026-10-15T19:00:00+02:00')
    pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_timeout(1500)
    b.close()
WHICH=sys.argv[2] if len(sys.argv)>2 else 'all'
with sync_playwright() as p:
    if WHICH in('all','ipad'): run(p,834,1112,'ipad')
    if WHICH in('all','phone'): run(p,393,852,'phone')
    if WHICH in('all','anim'): run(p,834,1112,'ipad_anim',animate=True)
    if WHICH in('all','edge'):
        b,ctx=ctxs(p,834,1112,{'2026-10-14':{'workouts':[],'recovery':{'score':{'hrv_rmssd_milli':70,'resting_heart_rate':50,'recovery_score':80}}}})
        pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.clock.set_fixed_time('2026-10-15T19:00:00+02:00')
        pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_selector('#c-hrv svg',timeout=20000); pg.wait_for_timeout(800)
        pg.locator('#c-hrv').evaluate("e=>e.closest('.card').querySelector('.gf-btn').click()"); pg.wait_for_selector('#gf .gf-stage svg',timeout=5000); pg.wait_for_timeout(500)
        ck('[1 Datenpunkt] nur ein Zeitraum, Statistik ohne Trend',pg.locator('#gfRanges .gf-r').count()==1 and 'Kein vorheriger' in pg.inner_text('#gfStats'))
        ck('[1 Datenpunkt] keine Fehler',not errs,errs)
        pg.keyboard.press('Escape'); pg.locator('#c-skin').evaluate("e=>e.closest('.card').querySelector('.gf-btn').click()"); pg.wait_for_timeout(500)
        ck('[leer] Hauttemperatur ohne Daten: freundliche Meldung','keine daten' in pg.inner_text('#gf').lower())
        b.close()

def training(p,seedf):
    t='[Training] '; seed=json.load(open(seedf)); k='users/u1/training/settings'; seed[k]=dict(seed.get(k,{}),view='multi')
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':834,'height':1112},has_touch=True)
    ctx.add_init_script('window.__seed='+json.dumps(seed)+';')
    for nm,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%nm),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    ctx.route(re.compile(r'workers\.dev'),lambda r:r.fulfill(headers={'access-control-allow-origin':'*','content-type':'application/json'},body='{"days":{},"configured":false}') if r.request.method!='OPTIONS' else r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}))
    pg=ctx.new_page();errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.clock.set_fixed_time('2026-10-15T19:00:00+02:00')
    pg.goto(f'http://127.0.0.1:{port}/training.html'); pg.wait_for_function('window.__trainingReady===true',timeout=25000); pg.wait_for_timeout(2500)
    try: pg.wait_for_function('GraphFull.list().some(g=>g.clone)',timeout=10000)
    except Exception: pass
    ids=pg.evaluate('GraphFull.list().map(g=>g.id+(g.clone?"*":""))'); ck(t+'Zeitreihen und automatisch erkannte Graphen',all(x in ids for x in ['t-form','t-load','t-weeks']) and any(x.endswith('*') for x in ids),ids)
    pg.evaluate("GraphFull.open('t-weeks')"); pg.wait_for_selector('#gf .gf-stage svg',timeout=5000); pg.wait_for_timeout(600)
    ck(t+'Wochenstunden: Summe und Kennzahlen','SUMME' in pg.inner_text('#gfStats').upper() and 'MEDIAN' in pg.inner_text('#gfStats').upper(),pg.inner_text('#gfStats')[:80].replace('\n',' '))
    pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
    clone=[x[:-1] for x in ids if x.endswith('*')][0]
    pg.evaluate("GraphFull.open(%s)"%json.dumps(clone)); pg.wait_for_selector('#gf .gf-stage.clone svg',timeout=5000); pg.wait_for_timeout(500)
    ck(t+'Clone-Graph vergrößert, ohne Zeitraum/Statistik',pg.locator('#gfRanges').count()==0 and pg.locator('#gfStats').count()==0 and pg.locator('#gf .gf-stage.clone svg').count()==1)
    pg.click('#gfX'); pg.wait_for_timeout(400)
    r=pg.evaluate("GraphFull.openByName('Trainingsstunden')"); ck(t+'Jarvis: Graph per Name öffnen',r['ok'] and pg.locator('#gf').count()==1,r); pg.wait_for_timeout(500)
    r2=pg.evaluate("GraphFull.setRange('90')"); ck(t+'Jarvis: Zeitraum wechseln',r2['ok'] and pg.evaluate('GraphFull.current.range')=='90',r2)
    r3=pg.evaluate("GraphFull.gotoDate('2026-09-15')"); ck(t+'Jarvis: zu Datum springen',r3['ok'],r3)
    ck(t+'keine Konsolenfehler',not errs,errs[:3]); b.close()
if WHICH in('all','training'):
    with sync_playwright() as p: training(p,sys.argv[3] if len(sys.argv)>3 else '/tmp/claude-0/-home-claude-life-board/dc8e3abd-3bd5-5402-abb6-0a1d0ba8c616/scratchpad/tseed.json')
srv.shutdown(); print('FEHLER: '+str(fails) if fails else 'FEHLER: keine'); sys.exit(1 if fails else 0)
