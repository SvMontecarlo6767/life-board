"""iPhone-Screenshots aller Seiten (393x852, 3x, Touch) + Check auf Seitwärtsscroll und zu kleine Tippflächen.
Aufruf: python3 tools/browser/shot_phone.py <Ordner> [seed.json für Training]"""
import re, json, sys, os, math, threading, http.server, socketserver, functools, datetime
src=open(os.path.join(os.path.dirname(os.path.abspath(__file__)),'shot_hud.py')).read().split('class Q')[0]
exec(src)
from playwright.sync_api import sync_playwright
tr=json.load(open(sys.argv[2])) if len(sys.argv)>2 else {}
tr.pop('users/u1/training/settings',None)
seed.update(tr)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
PAGES=[('index.html','#hub:not([hidden])'),('checkin.html','#morning'),('recovery.html','#content:not([hidden])'),('learn.html','#stats'),('puzzle.html','#form'),('training.html','#mcontent:not([hidden])'),('calendar.html','.cell')]
def worker(r):
    hd={'access-control-allow-origin':'*','content-type':'application/json'}
    if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
    if '/notion' in r.request.url: return r.fulfill(headers=hd,body='{"pages":[]}')
    if '/strava' in r.request.url: return r.fulfill(headers=hd,body='{"configured":false}')
    return r.fulfill(headers=hd,body=json.dumps({'days':days}))
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':393,'height':852},device_scale_factor=2,is_mobile=True,has_touch=True,user_agent=UA)
    ctx.add_init_script('window.__seed='+json.dumps(seed)+';')
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'workers\.dev'),worker); ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    for page,sel in PAGES:
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{port}/{page}'); pg.wait_for_selector(sel,timeout=20000); pg.wait_for_timeout(2500)
        sw=pg.evaluate('[document.documentElement.scrollWidth,innerWidth]')
        small=pg.evaluate("""[...document.querySelectorAll('a,button,input,select,summary,[role=button]')].filter(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&(r.height<40||r.width<32)&&e.getBoundingClientRect().top<document.documentElement.scrollHeight}).slice(0,6).map(e=>(e.id||e.className||e.tagName).toString().slice(0,24)+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))""")
        h=pg.evaluate('document.documentElement.scrollHeight')
        print(f'{page}: scrollWidth={sw} höhe={h} Fehler={errs[:2]} kleine={small}',flush=True)
        pg.screenshot(path=f'{out}/{page.split(".")[0]}_top.png'); pg.screenshot(path=f'{out}/{page.split(".")[0]}_full.png',full_page=True); pg.close()
    b.close()
