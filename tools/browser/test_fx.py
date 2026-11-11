"""Bewegungs-Effekte im Inhalt (lb-fx.js): Zahlen zählen hoch (beim Öffnen und beim Runterscrollen), Ende = exakter Originaltext,
Chart.js-Graphen laufen von links ein, SVG-Linien zeichnen sich, Graph-Vollbild baut sich langsamer auf; Dschungel/Performance/
„Bewegung reduzieren“: nichts davon; keine Fehler. Aufruf: python3 tools/browser/test_fx.py <Ordner>"""
import re, json, sys, os, math, threading, http.server, socketserver, functools, datetime
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); out=sys.argv[1] if len(sys.argv)>1 else '/tmp/fx'; os.makedirs(out,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
H=3.6e6; days={}; today=datetime.date.today()
for i in range(40,-1,-1):
    d=(today-datetime.timedelta(days=i)).isoformat(); b=60+25*math.sin(i/6)
    days[d]={'cycle':{'steps':6000+(i%7)*1300,'score':{'strain':8+6*abs(math.sin(i/4))}},'recovery':{'score':{'recovery_score':round(b),'hrv_rmssd_milli':60+b/4,'resting_heart_rate':58-b/12}},
     'sleep':{'start':d+'T20:30:00.000Z','end':d+'T05:30:00.000Z','tz':'+01:00','nap':False,'score':{'sleep_performance_percentage':70+(i%25),'sleep_efficiency_percentage':90,'sleep_consistency_percentage':80,'stage_summary':{'total_light_sleep_time_milli':4*H,'total_slow_wave_sleep_time_milli':1.5*H,'total_rem_sleep_time_milli':2*H,'total_awake_time_milli':.4*H}}},'workouts':[]}
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
fails=[]
def ck(msg,c,info=''):
    print(('ok     ' if c else 'FEHLER ')+msg,('' if c else info),flush=True)
    if not c: fails.append(msg)
def worker(r):
    hd={'access-control-allow-origin':'*','content-type':'application/json'}
    if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
    return r.fulfill(headers=hd,body=json.dumps({'days':days}))
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
DEV={'iphone':dict(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True,user_agent=UA),'ipad':dict(viewport={'width':820,'height':1180},device_scale_factor=1,is_mobile=True,has_touch=True)}
# Beobachter: merkt sich für jeden Textknoten mit Zahl alle Zwischenstände
WATCH="""window.__lbFxTest=true;window.__seen=[];new MutationObserver(ms=>ms.forEach(m=>{if(m.type==='characterData'){const t=m.target.nodeValue;if(/\\d/.test(t)&&t.length<15)window.__seen.push([m.oldValue,t])}})).observe(document,{subtree:true,characterData:true,characterDataOldValue:true});"""
def ctx_for(b,dev,ui=None,reduced=False):
    ctx=b.new_context(reduced_motion='reduce' if reduced else 'no-preference',**DEV[dev])
    ctx.add_init_script('if(!sessionStorage.getItem("__i")){sessionStorage.setItem("__i",1);localStorage.clear();'+('localStorage.setItem("lb_ui",%s);'%json.dumps(json.dumps(ui)) if ui else '')+'}')
    ctx.add_init_script("document.addEventListener('DOMContentLoaded',()=>{"+WATCH+"})")
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'workers\.dev'),worker); ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    return ctx
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for dev in DEV:
        ctx=ctx_for(b,dev); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_selector('#content:not([hidden])',timeout=20000); pg.wait_for_timeout(3500)
        ck(f'{dev}: lb-fx geladen',pg.evaluate('!!window.LBFx'))
        seen=pg.evaluate('window.__seen')
        ups=[s for s in seen if s[0] and s[1] and re.sub(r'[\d.,]','',s[0])==re.sub(r'[\d.,]','',s[1])]
        ck(f'{dev}: Zahlen zählen beim Öffnen hoch',len(ups)>=3,seen[:6])
        # Ende = Originalwert: die großen Recovery-Zahlen stehen wieder genau wie vorher
        a=pg.evaluate("(()=>{const v=[...document.querySelectorAll('.hv-li b')].map(e=>e.textContent);return v})()")
        pg.wait_for_timeout(1500); a2=pg.evaluate("[...document.querySelectorAll('.hv-li b')].map(e=>e.textContent)")
        ck(f'{dev}: nach dem Hochzählen stehen die Werte fest',a==a2 and len(a)>0,(a,a2))
        an=pg.evaluate("document.getAnimations().map(a=>a.effect&&a.effect.getKeyframes().map(k=>Object.keys(k).join(',')).join('|')).join(' ; ')")
        # weiter unten: beim Scrollen zählen neue Zahlen, Graphen zeichnen sich
        pg.evaluate('window.__seen=[]')
        n0=pg.evaluate("[...document.querySelectorAll('.lbc')].filter(e=>e._lbfx).length")
        for y in range(1,9): pg.evaluate(f'window.scrollTo(0,{y*700})'); pg.wait_for_timeout(450)
        n1=pg.evaluate("[...document.querySelectorAll('.lbc')].filter(e=>e._lbfx).length")
        ck(f'{dev}: Graphen zeichnen sich beim Runterscrollen (Chart.js)',n1>n0 and n1>=3,(n0,n1))
        sv=pg.evaluate("[...document.querySelectorAll('main svg')].filter(s=>s._lbfx).length")
        ck(f'{dev}: SVG-Graphen werden beim Scrollen gezeichnet',sv>=1,sv)
        pg.screenshot(path=f'{out}/{dev}-scrolled.png')
        # Vollbild: Kurve baut sich langsamer auf (nur im Cockpit)
        pg.evaluate("window.__gfAnimate=true;window.scrollTo(0,0)"); pg.wait_for_timeout(300)
        pg.evaluate('document.getElementById("c-rec").closest(".card").querySelector(".gf-btn").click()'); pg.wait_for_timeout(500)
        d=pg.evaluate("(()=>{const p=document.querySelector('#gf .gf-ln');if(!p)return 'keine Kurve';if(p.classList.contains('gf-draw'))return getComputedStyle(p).animationDuration;const a=p.getAnimations();return a.length?'waapi '+Math.round(a[0].effect.getTiming().duration):'keine Animation'})()")
        ck(f'{dev}: Graph-Vollbild baut die Kurve sichtbar auf',d=='1.8s' or d.startswith('waapi'),d)
        pg.wait_for_timeout(1000); pg.screenshot(path=f'{out}/{dev}-full.png')
        ck(f'{dev}: keine Fehler, kein Seitwärtsscroll',not errs and pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),errs[:3]); ctx.close()
    for name,ui,red in(('Dschungel',{'theme':'jungle'},False),('Performance-Modus',{'perf':True},False),('Bewegung reduzieren',None,True)):
        ctx=ctx_for(b,'iphone',ui,red); pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_selector('#content:not([hidden])',timeout=20000); pg.wait_for_timeout(3000)
        seen=pg.evaluate('window.__seen'); ups=[s for s in seen if s[0] and s[1] and re.sub(r'[\d.,]','',s[0])==re.sub(r'[\d.,]','',s[1])]
        ck(f'{name}: kein Hochzählen, keine Effekte, keine Fehler',not pg.evaluate('!!window.LBFx') and not errs,(pg.evaluate('!!window.LBFx'),errs[:2])); ctx.close()
    b.close()
print('\nFEHLER:',len(fails)); sys.exit(1 if fails else 0)
