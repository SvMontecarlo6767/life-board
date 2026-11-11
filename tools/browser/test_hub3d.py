"""Hub-Karussell + Weltraum-Welt (lb-hub3d.js, lb-space.js). Prüft auf iPhone und iPad (Touch): Karussell nur im Cockpit bei voller Leistung,
Check-in startet vorne, Wischen dreht, seitliche Karte antippen dreht nach vorne, vorderste Karte antippen öffnet den Reiter,
Gewohnheiten nicht antippbar, Live-Werte (Recovery, Check-in, Training, Kalender, Überblick), Stimmung je Recovery-Zone,
Dschungel/Performance-Modus/„Bewegung reduzieren“ = Kachelliste ohne WebGL, WebGL-Absturz = ruhiger Ersatz, kein Seitwärtsscroll,
Tippflächen mindestens 40 px, keine Schreibzugriffe, Warp-Flug (Abflug ≤ 0,8 s, Ankunft sofort bedienbar, kurzer Warp über die Reiterleiste, kein Warp in Dschungel/Performance). Aufruf: python3 tools/browser/test_hub3d.py <Ordner>"""
import re, json, sys, os, math, threading, http.server, socketserver, functools, datetime, subprocess
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); out=sys.argv[1] if len(sys.argv)>1 else '/tmp/hub3d'; os.makedirs(out,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
H=3.6e6; days={}; today=datetime.date.today()
for i in range(20,-1,-1):
    d=(today-datetime.timedelta(days=i)).isoformat()
    days[d]={'cycle':{'score':{'strain':9}},'recovery':{'score':{'recovery_score':22 if i==0 else 70,'hrv_rmssd_milli':55,'resting_heart_rate':60}},'workouts':[]}
VER=json.loads(subprocess.check_output(['node','-e',"const P=require('./plan-core.js');console.log(JSON.stringify(Object.assign(P.seed([]),{from:'2026-01-01',at:1})))"],cwd=root))
t=today.isoformat()
seed={'users/u1/plan/v_2026-01-01':VER,'users/u1/journal/'+t:{'m':{'mood':4,'energy':3,'sleep':4}},
 'users/u1/calendar/ev_'+t[:4]:{'list':[{'id':'e1','title':'Zahnarzt','date':(today+datetime.timedelta(days=1)).isoformat(),'time':'09:15','cat':'termin'}]}}
news={'at':1,'n':26,'minutes':9,'sections':[{'id':'top','title':'Top','items':[{'t':'Testmeldung','url':'https://x'}]}]}
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
DEV={'iphone':dict(viewport={'width':393,'height':852},device_scale_factor=3,is_mobile=True,has_touch=True,user_agent=UA),
     'ipad':dict(viewport={'width':820,'height':1180},device_scale_factor=2,is_mobile=True,has_touch=True)}
def ctx_for(b,dev,ui=None,reduced=False,force=True):
    ctx=b.new_context(reduced_motion='reduce' if reduced else 'no-preference',**DEV[dev])
    if force: ctx.add_init_script('window.__lbForceSpace=true;')   # Testbrowser hat nur Software-WebGL
    ctx.add_init_script('window.__seed='+json.dumps(seed)+';if(!sessionStorage.getItem("__i")){sessionStorage.setItem("__i",1);localStorage.clear();'+('localStorage.setItem("lb_ui",%s);'%json.dumps(json.dumps(ui)) if ui else '')+'localStorage.setItem("lb_news",%s)}'%json.dumps(json.dumps(news)))
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'workers\.dev'),worker); ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    return ctx
def open_hub(ctx,errs,warm=True):
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'GL Driver' not in m.text else None)
    if warm:   # Whoop-Speicher auf dem Gerät füllen (wie nach einem Besuch im Recovery-Reiter)
        pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_selector('#content:not([hidden])',timeout=20000); pg.wait_for_timeout(400)
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_selector('#hub:not([hidden])'); pg.wait_for_timeout(2500)
    return pg
def front(pg): return pg.evaluate('LBHub3D.front')
def settle(pg):
    pg.wait_for_timeout(200)
    try: pg.wait_for_function('()=>!LBHub3D.busy&&!!document.querySelector(".h3c.front")',timeout=8000)
    except Exception: pass
    pg.wait_for_timeout(150)
def swipe(pg,dx):
    box=pg.locator('.h3-stage').bounding_box(); y=box['y']+box['height']/2; x0=box['x']+box['width']/2
    pg.mouse.move(x0,y); pg.mouse.down()
    for i in range(1,9): pg.mouse.move(x0+dx*i/8,y+2,steps=1); pg.wait_for_timeout(16)
    pg.mouse.up(); settle(pg)
small_js="""()=>[...document.querySelectorAll('#hub a,#hub button,#hub [role=button]')].filter(e=>{const r=e.getBoundingClientRect(),cs=getComputedStyle(e);return r.width>0&&r.height>0&&cs.visibility!=='hidden'&&+cs.opacity>.05&&!e.closest('#tiles')&&!e.classList.contains('h3c')&&(r.height<40||r.width<40)}).map(e=>(e.className||e.tagName)+' '+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))"""
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for dev in DEV:
        ctx=ctx_for(b,dev); errs=[]; pg=open_hub(ctx,errs)
        writes0=pg.evaluate('window.__writes||0')
        ck(f'{dev}: Karussell an, Kachelliste aus',pg.evaluate("document.documentElement.getAttribute('data-hub3d')==='on' && !!document.querySelector('#hub3d:not([hidden])') && getComputedStyle(document.getElementById('tiles')).display==='none'"))
        ids=pg.evaluate('[...document.querySelectorAll(".h3c")].map(e=>e.dataset.id)')
        ck(f'{dev}: Reihenfolge der Karten',ids==['checkin','news','muster','kalender','training','recovery','habits'],ids)
        settle(pg); ck(f'{dev}: Check-in startet vorne',front(pg)==0,front(pg))
        hrefs=pg.evaluate('[...document.querySelectorAll(".h3c")].map(e=>e.getAttribute("href"))')
        tiles=pg.evaluate('[...document.querySelectorAll("#tiles a.tile")].map(e=>e.getAttribute("href"))')
        ck(f'{dev}: Karten führen zu denselben Seiten wie die Kacheln',sorted(h for h in hrefs if h)==sorted(tiles) and hrefs[6] is None,(hrefs,tiles))
        txt=lambda i:pg.evaluate(f'document.querySelectorAll(".h3c")[{i}].textContent')
        try: pg.wait_for_function('()=>{const c=document.querySelectorAll(".h3c");return /Niedrig/.test(c[5].textContent)&&/von/.test(c[4].textContent)&&/Zahnarzt/.test(c[3].textContent)}',timeout=15000)
        except Exception: pass
        ck(f'{dev}: Check-in-Karte zeigt ckTxt (Stimmung 4/5)','Stimmung 4/5' in txt(0) and 'Erledigt' in txt(0),txt(0))
        ck(f'{dev}: Recovery-Karte zeigt 22 % und Zone Niedrig','22' in txt(5) and 'Niedrig' in txt(5),txt(5))
        ck(f'{dev}: Training-Karte zeigt Wochenfortschritt','von' in txt(4) and 'Einheiten diese Woche' in txt(4),txt(4))
        ck(f'{dev}: Kalender-Karte zeigt nächsten Termin','Zahnarzt' in txt(3) and '09:15' in txt(3),txt(3))
        ck(f'{dev}: Überblick-Karte zeigt letzten Stand','Testmeldung' in txt(1),txt(1))
        ck(f'{dev}: Weltraum läuft, Stimmung rot (Recovery 22 %)',pg.evaluate("LBBG.mode==='space'&&LBSpace.current&&LBSpace.current.zone==='r'"),pg.evaluate("[LBBG.mode,LBSpace.current&&LBSpace.current.zone]"))
        pg.screenshot(path=f'{out}/{dev}-front.png')
        swipe(pg,-160); f1=front(pg); ck(f'{dev}: Wischen nach links dreht weiter',f1 in(1,2),f1)
        swipe(pg,160); swipe(pg,160) if front(pg)!=0 else None; ck(f'{dev}: Wischen zurück',front(pg)==0,front(pg))
        swipe(pg,170); ck(f'{dev}: Wischen nach rechts von Check-in landet bei Gewohnheiten (Ring)',front(pg) in(6,5),front(pg))
        hab=pg.evaluate('document.querySelector(".h3c[data-id=habits]").tagName')
        ck(f'{dev}: Gewohnheiten ist kein Link',hab=='DIV')
        if front(pg)==6:
            u=pg.url; r=pg.locator('.h3c[data-id=habits]').bounding_box(); pg.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2); pg.wait_for_timeout(600)
            ck(f'{dev}: Gewohnheiten antippen öffnet nichts',pg.url==u)
        pg.evaluate('LBHub3D.goTo(0)'); settle(pg)
        # seitliche Karte antippen -> nach vorne
        side=pg.evaluate('(()=>{const e=document.querySelector(".h3c[data-id=news]").getBoundingClientRect();return [Math.min(innerWidth-6,Math.max(e.left,0)+Math.min(e.width,innerWidth-Math.max(e.left,0))/2),e.top+e.height/2]})()')
        pg.mouse.click(side[0],side[1]); settle(pg)
        ck(f'{dev}: seitliche Karte antippen dreht sie nach vorne (ohne zu öffnen)',front(pg)==1 and 'index.html' in pg.url,(front(pg),pg.url))
        ck(f'{dev}: kein Seitwärtsscroll',pg.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        sm=pg.evaluate(small_js); ck(f'{dev}: Tippflächen mindestens 40 px',not sm,sm)
        fw=pg.evaluate('(()=>{const r=document.querySelector(".h3c.front").getBoundingClientRect();return [r.width,r.height]})()')
        ck(f'{dev}: vorderste Karte groß',fw[0]>=280 and fw[1]>=320,fw)
        ck(f'{dev}: keine Schreibzugriffe durch den Hub',pg.evaluate('window.__writes||0')==writes0)
        ck(f'{dev}: Zahnrad hat Whoop, Sicherung, App',pg.evaluate("!!document.querySelector('#lb-set #lb-acc-wh')&&!!document.querySelector('#lb-set #lb-acc-bk')&&!!document.querySelector('#lb-set #lb-acc-app')"))
        # vorderste Karte antippen öffnet
        pg.evaluate('LBHub3D.goTo(0)'); settle(pg)
        r=pg.locator('.h3c.front').bounding_box(); import time; t0=time.time(); pg.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2)
        pg.wait_for_timeout(120); warping=pg.evaluate("!!document.querySelector('canvas.lb-warp')")
        try: pg.wait_for_url(re.compile('checkin.html'),timeout=5000,wait_until='commit'); ok=True
        except Exception: ok=False
        dt=time.time()-t0
        ck(f'{dev}: vorderste Karte antippen öffnet den Check-in (Warp-Abflug)',ok and warping,(pg.url,warping))
        ck(f'{dev}: keine Fehler',not errs,errs[:3]); ctx.close()
        # Warp-Flug, Zeit in der Seite gemessen (Tippen -> Seitenwechsel); ohne Software-Weltraum, der den Testbrowser ausbremst
        ctx=ctx_for(b,dev,force=False); ctx.add_init_script("addEventListener('pagehide',()=>{try{sessionStorage.setItem('__left',String(performance.now()-(window.__tap||0)))}catch(e){}});addEventListener('pointerdown',()=>{window.__tap=performance.now()},true)")
        errs=[]; pg=open_hub(ctx,errs,warm=False); settle(pg)
        r=pg.locator('.h3c.front').bounding_box(); pg.mouse.click(r['x']+r['width']/2,r['y']+r['height']/2)
        pg.wait_for_url(re.compile('checkin.html'),timeout=5000,wait_until='commit')
        pg.wait_for_selector('#lb-nav',state='attached'); pg.wait_for_timeout(150)
        dt=float(pg.evaluate("sessionStorage.getItem('__left')||'9999'"))
        ck(f'{dev}: Warp-Abflug (Karte) höchstens ca. 0,8 s',dt<850,round(dt))
        pg.wait_for_selector('#lb-nav',state='attached'); pg.wait_for_timeout(150)
        st=pg.evaluate("[document.documentElement.classList.contains('lb-arrived'),!!document.querySelector('canvas.lb-warp'),(document.querySelector('canvas.lb-warp')||{style:{}}).style.pointerEvents,sessionStorage.getItem('lb_warp')]")
        ck(f'{dev}: Ankunft: Warp-Ebene läuft, fängt keine Klicks, Merker verbraucht',st[0] and st[1] and st[2]=='none' and st[3] is None,st)
        hit=pg.evaluate("(()=>{const b=document.querySelector('#lb-nav a.tab[data-tab=hub]');const r=b.getBoundingClientRect();const h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!h&&!!h.closest('#lb-nav')})()")
        ck(f'{dev}: Ankunft: sofort bedienbar (Reiterleiste trifft)',hit)
        pg.wait_for_timeout(2500); ck(f'{dev}: Ankunft: Warp-Ebene danach entfernt, Seite sichtbar',pg.evaluate("!document.querySelector('canvas.lb-warp')&&getComputedStyle(document.body).opacity==='1'"))
        # kurzer Warp über die Reiterleiste
        pg.locator('#lb-nav a.tab[data-tab=recovery]').click(); pg.wait_for_timeout(60); w2=pg.evaluate("!!document.querySelector('canvas.lb-warp')")
        try: pg.wait_for_url(re.compile('recovery.html'),timeout=5000,wait_until='commit'); ok=True
        except Exception: ok=False
        pg.wait_for_selector('#lb-nav',state='attached'); dt=float(pg.evaluate("sessionStorage.getItem('__left')||'9999'"))
        ck(f'{dev}: Reiterleiste: kurzer Warp (höchstens ca. 0,5 s), öffnet Recovery',ok and w2 and dt<550,(ok,w2,round(dt)))
        pg.wait_for_selector('#lb-nav',state='attached'); pg.wait_for_timeout(400)
        ck(f'{dev}: Ankunft nach Reiterleiste',pg.evaluate("document.documentElement.classList.contains('lb-arrived')"))
        pg.reload(); pg.wait_for_selector('#lb-nav',state='attached'); pg.wait_for_timeout(300)
        ck(f'{dev}: Neu laden: kein erneuter Warp',not pg.evaluate("document.documentElement.classList.contains('lb-arrived')||!!document.querySelector('canvas.lb-warp')"))
        ck(f'{dev}: Warp ohne Fehler',not errs,errs[:3]); ctx.close()
        # Dschungel, Performance-Modus, Bewegung reduzieren: Kachelliste, kein WebGL
        for name,ui,red in(('Dschungel',{'theme':'jungle'},False),('Performance-Modus',{'perf':True},False),('Bewegung reduzieren',None,True)):
            ctx=ctx_for(b,dev,ui,red); errs=[]; pg=open_hub(ctx,errs,warm=False)
            st=pg.evaluate("[!document.documentElement.hasAttribute('data-hub3d'),getComputedStyle(document.getElementById('tiles')).display!=='none',!document.querySelector('#hub3d:not([hidden])'),!(window.LBSpace&&LBSpace.current)]")
            ck(f'{dev} {name}: Kachelliste wie bisher, kein Karussell, kein WebGL',all(st),st)
            ck(f'{dev} {name}: Sicherung/Whoop im Zahnrad, keine Fehler',pg.evaluate("!!document.querySelector('#lb-set #bkDl')") and not errs,errs[:2])
            pg.locator('#lb-nav a.tab[data-tab=muster]').click(); pg.wait_for_timeout(60); w=pg.evaluate("!!document.querySelector('canvas.lb-warp')")
            pg.wait_for_url(re.compile('muster.html'),timeout=5000); pg.wait_for_timeout(300)
            ck(f'{dev} {name}: kein Warp, Seite normal',not w and not pg.evaluate("document.documentElement.classList.contains('lb-arrived')||!!document.querySelector('canvas.lb-warp')"))
            pg.screenshot(path=f'{out}/{dev}-{name.split()[0].lower()}.png'); ctx.close()
        # live umschalten: Cockpit -> Dschungel -> Cockpit
        ctx=ctx_for(b,dev); errs=[]; pg=open_hub(ctx,errs,warm=False)
        pg.click('#lb-gear'); pg.click('.lb-th[data-th="jungle"]'); pg.wait_for_timeout(900)
        a=pg.evaluate("getComputedStyle(document.getElementById('tiles')).display!=='none'&&!document.querySelector('#hub3d:not([hidden])')")
        pg.click('.lb-th[data-th="cockpit"]'); pg.wait_for_timeout(900)
        c=pg.evaluate("getComputedStyle(document.getElementById('tiles')).display==='none'&&!!document.querySelector('#hub3d:not([hidden])')")
        ck(f'{dev}: Design-Wechsel schaltet Karussell/Liste live um',a and c,(a,c))
        # WebGL stürzt ab -> ruhiger Ersatz, Seite bleibt bedienbar
        pg.click('#lb-gear') if pg.locator('#lb-set').is_visible() else None
        pg.wait_for_function("window.LBSpace&&LBSpace.current",timeout=10000)
        pg.evaluate("(()=>{const c=document.querySelector('.lb-bgl.on canvas');const gl=c.getContext('webgl');gl.getExtension('WEBGL_lose_context').loseContext()})()")
        try: pg.wait_for_function("LBBG.mode==='light'||LBBG.mode==='space'&&!LBSpace.current",timeout=8000)
        except Exception: pass
        pg.wait_for_timeout(1200)
        ck(f'{dev}: WebGL-Absturz: Ersatz-Hintergrund, Karussell bleibt',pg.evaluate("LBBG.mode")!='space' or not pg.evaluate("!!LBSpace.current"),pg.evaluate("LBBG.mode"))
        ck(f'{dev}: nach Absturz keine Fehler',not [e for e in errs if 'CONTEXT_LOST' not in e and 'context lost' not in e.lower()],errs[:3]); ctx.close()
    # nur Software-WebGL (wie hier im Testbrowser): ruhiger Ersatz, Karussell läuft trotzdem
    ctx=ctx_for(b,'iphone',force=False); errs=[]; pg=open_hub(ctx,errs,warm=False); pg.wait_for_timeout(2500)
    ck('Software-WebGL: Ersatz-Hintergrund statt Weltraum, Karussell an, keine Fehler',pg.evaluate("LBBG.mode")!='space' and pg.evaluate("document.documentElement.getAttribute('data-hub3d')==='on'") and not errs,(pg.evaluate("LBBG.mode"),errs[:2])); ctx.close()
    b.close()
print('\nFEHLER:',len(fails)); sys.exit(1 if fails else 0)
