"""Screenshots aller Seiten im HUD-Design + Konsolenfehler-Check. Aufruf: python3 tools/browser/shot_hud.py <Ordner> [perf]"""
import re, json, sys, os, math, threading, http.server, socketserver, functools, datetime
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); out=sys.argv[1]; os.makedirs(out,exist_ok=True); perf=len(sys.argv)>2
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
fails=0
with sync_playwright() as p:
    for w,h in((1024,768),(820,1180)):
        b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True)
        ctx.add_init_script('window.__seed='+json.dumps(seed)+';'+("localStorage.setItem('lb_ui',JSON.stringify({perf:true,sounds:true}));" if perf else ''))
        for n,body in(('app',mock),('auth',''),('firestore','')):
            ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
        ctx.route(re.compile(r'workers\.dev'),worker)
        ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
        for page,sel in(('index.html','#hub:not([hidden])'),('checkin.html','#morning'),('recovery.html','#content:not([hidden])'),('learn.html','#stats')):
            pg=ctx.new_page(); errs=[]
            pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'fonts' not in m.text and 'ERR_FAILED' not in m.text else None)
            pg.clock.set_fixed_time('2026-10-14T12:00:00+02:00') if False else None
            pg.goto(f'http://127.0.0.1:{port}/{page}'); pg.wait_for_selector(sel,timeout=15000); pg.wait_for_timeout(1500)
            bgc=pg.evaluate("!!document.getElementById('lb-bg')")
            ov=pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
            nav=pg.evaluate("!!document.getElementById('lb-nav')")
            print(f'[{w}] {page}: Fehler={errs[:2]} bg3d={bgc} nav={nav} kein-Seitwärtsscroll={ov}')
            if errs or not nav or not ov or (bgc==perf): fails+=1
            pg.screenshot(path=f'{out}/hud-{"perf-" if perf else ""}{page[:-5]}-{w}.png'); pg.close()
        b.close()
print('FEHLER:',fails); sys.exit(1 if fails else 0)
