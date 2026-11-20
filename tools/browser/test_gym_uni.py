"""Browsertest Gym-Logbuch: Übungen verschieben (Pfeile und Ziehen per Touch), einbeinige Übungen (Seite L/R pro Satz,
abwechselnd, gespeichert, Links-gegen-rechts), feste Wiederholungen (kein Plateau-Hinweis, kein Steigerungs-Vorschlag).
Handy, iPad, Dschungel. Aufruf: python3 tools/browser/test_gym_uni.py <screenshot-ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1] if len(sys.argv)>1 else '/tmp/gymuni'; os.makedirs(shots,exist_ok=True)
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
# 7 Einheiten Pogo Jumps immer 20 (würde sonst ein Plateau melden), über 6 Wochen
DAY=86400000; T0=1789142400000   # 11.09.2026
sess=[{'i':'p%d'%k,'d':'2026-%02d-%02d'%((9 if 11+k*6<=30 else 10),(11+k*6 if 11+k*6<=30 else 11+k*6-30)),'t':T0+k*6*DAY,'m':45,'x':6,'n':'','p':'Beine',
       'e':[{'n':'Pogo Jumps','s':[{'w':0,'r':20},{'w':0,'r':20}]}]} for k in range(7)]
SEED={'users/u1/training/gym_2026':{'list':sess},'users/u1/training/settings':{'workouts':[{'id':'wb','name':'Beine','ex':['Nordic Curls','Pogo Jumps','Split Squats']}]}}
def run(p,w,h,tag,theme=None):
    t=f'[{tag}{"/"+theme if theme else ""}] '
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=w<500)
    ctx.add_init_script('window.__seed=%s;'%json.dumps(SEED)+("localStorage.setItem('lb_ui',JSON.stringify({theme:'%s'}));"%theme if theme else ''))
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
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text else None)
    pg.on('dialog',lambda d:d.accept())
    pg.clock.set_fixed_time('2026-10-28T18:00:00+01:00')
    pg.goto(f'http://127.0.0.1:{port}/training.html'); pg.wait_for_function('window.__trainingReady===true',timeout=20000); pg.wait_for_timeout(600)
    st=lambda k: pg.evaluate('window.__store[%s]'%json.dumps(k))
    names=lambda: pg.eval_on_selector_all('#gymBox .gx .gxh>b',"x=>x.map(e=>e.textContent)")
    # Plateau vorher da
    ins=pg.inner_text('#gymBox .gins')
    ck(t+'Ohne Einstellung: Pogo Jumps melden ein Plateau',re.search(r'Pogo Jumps.*seit 5 Einheiten',ins) is not None)
    pg.tap('#gymBox [data-a=wst][data-id=wb]'); pg.wait_for_timeout(200)
    ck(t+'Workout geladen in alter Reihenfolge',names()==['Nordic Curls','Pogo Jumps','Split Squats'],names())
    # Pfeile
    pg.tap('#gymBox .gx[data-i="1"] [data-a=mv][data-d="-1"]'); pg.wait_for_timeout(150)
    ck(t+'▲ verschiebt nach oben',names()==['Pogo Jumps','Nordic Curls','Split Squats'],names())
    ck(t+'Erste Übung: ▲ gesperrt',pg.locator('#gymBox .gx[data-i="0"] [data-a=mv][data-d="-1"]').is_disabled())
    # Ziehen per Touch (Pointer-Ereignisse wie am Finger): Nordic Curls ans Ende
    hd=pg.locator('#gymBox .gx[data-i="1"] .gdrag'); hd.scroll_into_view_if_needed(); bb=hd.bounding_box()
    tgt=pg.locator('#gymBox .gx[data-i="2"]').bounding_box()
    x,y=bb['x']+bb['width']/2,bb['y']+bb['height']/2
    pg.evaluate("""([x,y,ty])=>{const h=document.querySelector('#gymBox .gx[data-i="1"] .gdrag');const o={pointerId:7,pointerType:'touch',isPrimary:true,bubbles:true,clientX:x};
      h.dispatchEvent(new PointerEvent('pointerdown',Object.assign({clientY:y,button:0},o)));
      for(let k=1;k<=6;k++)h.dispatchEvent(new PointerEvent('pointermove',Object.assign({clientY:y+(ty-y)*k/6},o)));
      h.dispatchEvent(new PointerEvent('pointerup',Object.assign({clientY:ty},o)))}""",[x,y,tgt['y']+tgt['height']-10])
    pg.wait_for_timeout(200)
    ck(t+'Ziehen am Griff verschiebt (Touch)',names()==['Pogo Jumps','Split Squats','Nordic Curls'],names())
    ck(t+'Hinweis: Reihenfolge ins Workout übernehmen',re.search('Reihenfolge geändert',pg.inner_text('#gMsg')) is not None)
    pg.tap('#gymBox [data-a=wupd]'); pg.wait_for_timeout(400)
    ck(t+'Reihenfolge im Workout gespeichert',st('users/u1/training/settings')['workouts'][0]['ex']==['Pogo Jumps','Split Squats','Nordic Curls'])
    # Einbeinig
    pg.tap('#gymBox [data-a=opt][data-f=u][data-n="Split Squats"]'); pg.wait_for_timeout(400)
    ck(t+'Einbeinig gespeichert',st('users/u1/training/settings').get('exopt',{}).get('split squats',{}).get('u')==1)
    i=names().index('Split Squats')
    for _ in range(3): pg.tap(f'#gymBox .gx[data-i="{i}"] [data-a=adds]'); pg.wait_for_timeout(80)
    sides=pg.eval_on_selector_all(f'#gymBox .gx[data-i="{i}"] .gsd',"x=>x.map(e=>e.textContent)")
    ck(t+'Seiten wechseln automatisch L, R, L, R',sides==['1 L','2 R','3 L','4 R'],sides)
    for j,(wt,r) in enumerate([('20','10'),('20','10'),('20','8'),('20','8')]):
        pg.fill(f'#gymBox input[data-i="{i}"][data-j="{j}"][data-f="w"]',wt); pg.fill(f'#gymBox input[data-i="{i}"][data-j="{j}"][data-f="r"]',r)
    pg.tap(f'#gymBox .gx[data-i="{i}"] .gsd >> nth=2'); pg.wait_for_timeout(100)
    pg.tap(f'#gymBox .gx[data-i="{i}"] .gsd >> nth=2'); pg.wait_for_timeout(100)
    ck(t+'Seite per Tippen umschaltbar',pg.inner_text(f'#gymBox .gx[data-i="{i}"] .gsd >> nth=2')=='3 L')
    # Feste Wiederholungen
    pg.tap('#gymBox [data-a=opt][data-f=f][data-n="Pogo Jumps"]'); pg.wait_for_timeout(400)
    for j in range(2): pg.fill(f'#gymBox input[data-i="0"][data-j="{j}"][data-f="r"]','20')
    if shots: pg.screenshot(path=f'{shots}/gym_{tag}{"_"+theme if theme else ""}_editor.png',full_page=False)
    ok_scroll=pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1')
    ck(t+'Kein Seitwärtsscroll',ok_scroll)
    small=pg.eval_on_selector_all('#gymBox .gdrag,#gymBox .gmv,#gymBox .gsd',"x=>x.filter(e=>!e.disabled&&(e.getBoundingClientRect().height<40||e.getBoundingClientRect().width<40)).length")
    ck(t+'Griff, Pfeile, Seiten groß genug zum Tippen',small==0,small)
    pg.tap('#gSave'); pg.wait_for_timeout(700)
    L=st('users/u1/training/gym_2026')['list']; last=max(L,key=lambda s:s['t'])
    ss=[e for e in last['e'] if e['n']=='Split Squats'][0]['s']; pj=[e for e in last['e'] if e['n']=='Pogo Jumps'][0]['s']
    ck(t+'Gespeichert: Seiten bei Split Squats, keine bei Pogo',[x.get('sd') for x in ss]==['l','r','l','r'] and all('sd' not in x for x in pj),ss)
    ck(t+'Gespeichert in Übungsreihenfolge',[e['n'] for e in last['e']]==['Pogo Jumps','Split Squats'])
    ins=pg.inner_text('#gymBox .gins')
    ck(t+'Feste Wdh.: kein Plateau mehr für Pogo Jumps','Pogo Jumps' not in ins or re.search(r'Pogo Jumps.*seit 5 Einheiten',ins) is None)
    pg.tap('#gymBox [data-a=sel][data-k="split squats"]'); pg.wait_for_timeout(200)
    side=pg.inner_text('#gymBox .gside')
    ck(t+'Links gegen rechts im Fortschritt',re.search('Links',side) and re.search('Rechts',side) and re.search('schwächer|ausgeglichen',side),side.replace('\n',' | '))
    hist=pg.inner_text('#gymBox .ghist')
    pg.locator('#gymBox .ghist details').first.locator('summary').click(); pg.wait_for_timeout(100); hist=pg.inner_text('#gymBox .ghist')
    ck(t+'Verlauf zeigt Seiten',re.search(r'L 20×10, R 20×10',hist) is not None,hist[:200])
    # Bearbeiten behält Seiten
    pg.locator('#gymBox .ghist [data-a=editS]').first.click(); pg.wait_for_timeout(250)
    i=names().index('Split Squats')
    ck(t+'Bearbeiten behält die Seiten',pg.eval_on_selector_all(f'#gymBox .gx[data-i="{i}"] .gsd',"x=>x.map(e=>e.textContent)")==['1 L','2 R','3 L','4 R'])
    pg.tap('#gDrop'); pg.wait_for_timeout(200)
    # Neuladen: Einstellungen bleiben (Firestore-Mock übersteht Reload)
    pg.reload(); pg.wait_for_function('window.__trainingReady===true',timeout=20000); pg.wait_for_timeout(500)
    pg.tap('#gymBox [data-a=wst][data-id=wb]'); pg.wait_for_timeout(200)
    ck(t+'Nach Neuladen: Reihenfolge, Einbeinig und Feste Wdh. bleiben',names()==['Pogo Jumps','Split Squats','Nordic Curls'] and pg.get_attribute('#gymBox [data-a=opt][data-f=u][data-n="Split Squats"]','aria-pressed')=='true' and pg.get_attribute('#gymBox [data-a=opt][data-f=f][data-n="Pogo Jumps"]','aria-pressed')=='true')
    ck(t+'Keine Seitenfehler',not errs,errs)
    b.close()
with sync_playwright() as p:
    run(p,390,844,'handy'); run(p,1024,1366,'ipad'); run(p,390,844,'handy','jungle')
print('alles ok' if not fails else f'{fails} FEHLER'); sys.exit(1 if fails else 0)
