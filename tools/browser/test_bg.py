"""Animierte Hintergründe (lb-bg.js). Prüft je Design und Gerät: richtige Variante, liegt hinter allem und fängt keine Klicks ab,
weicher Wechsel beim Design-Umschalten, Auswahl im Einstellungs-Panel, Performance-Modus und „Bewegung reduzieren“ = aus,
ohne Bibliotheken läuft alles weiter, keine Fehler, kein Seitwärtsscroll. Aufruf: python3 tools/browser/test_bg.py <Ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); out=sys.argv[1]; os.makedirs(out,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
fails=[]
def ck(msg,c,info=''):
    print(('ok     ' if c else 'FEHLER ')+msg,('' if c else info))
    if not c: fails.append(msg)
DEV={'handy':dict(viewport={'width':390,'height':844},has_touch=True,is_mobile=True,device_scale_factor=3,screen={'width':390,'height':844}),
     'ipad':dict(viewport={'width':820,'height':1180},has_touch=True,is_mobile=True,device_scale_factor=2,screen={'width':820,'height':1180})}
def page(p,dev,ui=None,block=None,reduced=False,url='index.html'):
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=b.new_context(reduced_motion='reduce' if reduced else 'no-preference',**DEV[dev])
    init='localStorage.clear();'+('localStorage.setItem("lb_ui",%s);'%json.dumps(json.dumps(ui)) if ui else '')+'localStorage.setItem("lb_bgslow","0");'
    ctx.add_init_script('if(!sessionStorage.getItem("__i")){sessionStorage.setItem("__i","1");'+init+'}')
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com|workers\.dev'),lambda r,_q=None:r.abort())
    if block: ctx.route(re.compile(block),lambda r,_q=None:r.abort())
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'GL Driver' not in m.text else None)
    pg.goto(f'http://127.0.0.1:{port}/{url}'); pg.wait_for_selector('#lb-nav')
    return b,pg,errs
def wait_mode(pg,modes,t=12000):
    try: pg.wait_for_function('(m)=>window.LBBG&&m.includes(LBBG.mode)&&(LBBG.mode==="none"||document.querySelector(".lb-bgl.on"))',arg=modes,timeout=t)
    except Exception: pass
    pg.wait_for_timeout(1100)
    return pg.evaluate('window.LBBG?LBBG.mode:null')
def layers(pg):
    return pg.evaluate('''()=>[...document.querySelectorAll(".lb-bgl")].map(e=>{const s=getComputedStyle(e);return{on:e.classList.contains("on"),z:s.zIndex,pe:s.pointerEvents,pos:s.position,canvas:!!e.querySelector("canvas")||e.tagName==="CANVAS",op:+s.opacity}})''')
def behind(pg):
    # Antippen trifft Inhalte, nie den Hintergrund
    return pg.evaluate('''()=>{const els=[...document.querySelectorAll("#lb-nav a.tab, #lb-gear, a.tile, button")].filter(e=>{const r=e.getBoundingClientRect();return r.width>10&&r.height>10&&r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth});
      return els.length>0&&els.every(e=>{const r=e.getBoundingClientRect(),h=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return h&&!h.closest(".lb-bgl,#lb-bg")})}''')
def drawn(pg):
    # tsParticles-Ebene hat wirklich etwas gezeichnet (2D-Canvas)
    return pg.evaluate("""()=>{const c=document.querySelector('.lb-bgl.on canvas');if(!c)return 0;const x=c.getContext('2d');if(!x)return -1;const d=x.getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n}""")
def noscroll(pg): return pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
with sync_playwright() as p:
    # Automatisch: Handy leicht, iPad 3D-Netz
    for dev,exp in(('handy',['light']),('ipad',['vanta','light'])):
        b,pg,errs=page(p,dev); m=wait_mode(pg,exp); L=layers(pg); on=[l for l in L if l['on']]
        ck(f'{dev} Cockpit automatisch: {exp[0]}',m in exp,m)
        ck(f'{dev} Cockpit: genau eine sichtbare Ebene mit Canvas, hinter allem, ohne Klicks',len(on)==1 and on[0]['canvas'] and on[0]['z']=='-1' and on[0]['pe']=='none' and on[0]['pos']=='fixed',L)
        ck(f'{dev} Cockpit: Antippen trifft Kacheln/Knöpfe, nicht den Hintergrund',behind(pg))
        if m=='light': ck(f'{dev} Cockpit leicht: Partikel werden gezeichnet',drawn(pg)>200,drawn(pg))
        pg.screenshot(path=f'{out}/{dev}-cockpit-{m}.png')
        # Design wechseln -> Dschungel/Glühwürmchen, weicher Wechsel
        pg.click('#lb-gear'); pg.click('.lb-th[data-th="jungle"]'); pg.wait_for_timeout(250)
        mid=pg.evaluate('document.querySelectorAll(".lb-bgl").length')
        m2=wait_mode(pg,['fireflies']); L=layers(pg)
        ck(f'{dev} Wechsel zu Dschungel: Glühwürmchen, alte Ebene ausgeblendet und entfernt',m2=='fireflies' and len([l for l in L if l['on']])==1 and len(L)==1,(m2,L,mid))
        sel=pg.evaluate('[...document.querySelectorAll("#lb-bgsel [data-bg]")].map(b=>b.textContent)')
        ck(f'{dev} Glühwürmchen werden gezeichnet',drawn(pg)>200,drawn(pg))
        ck(f'{dev} Panel zeigt Dschungel-Auswahl',sel==['Automatisch','Glühwürmchen','Blätter','Klassik 3D'],sel)
        pg.click('#lb-gear'); pg.wait_for_timeout(200)
        pg.screenshot(path=f'{out}/{dev}-jungle-fireflies.png')
        # Blätter, Klassik über das Panel
        for opt in('leaves','classic'):
            if pg.locator('#lb-set').is_hidden(): pg.click('#lb-gear')
            pg.click(f'#lb-bgsel [data-bg="{opt}"]'); m3=wait_mode(pg,[opt]); L=layers(pg)
            saved=pg.evaluate('JSON.parse(localStorage.getItem("lb_ui")).bgj')
            ck(f'{dev} Dschungel {opt}: aktiv, gespeichert, eine Ebene',m3==opt and saved==opt and len([l for l in L if l['on']])==1,(m3,saved,L))
            if opt=='leaves': ck(f'{dev} Blätter werden gezeichnet',drawn(pg)>200,drawn(pg))
            pg.click('#lb-gear'); pg.wait_for_timeout(200); pg.screenshot(path=f'{out}/{dev}-jungle-{opt}.png')
        ck(f'{dev}: Antippen trifft Inhalte',behind(pg))
        # zurück zu Cockpit, 3D-Netz fest gewählt
        pg.click('#lb-gear'); pg.click('.lb-th[data-th="cockpit"]'); pg.wait_for_timeout(300); pg.click('#lb-bgsel [data-bg="vanta"]')
        m4=wait_mode(pg,['vanta']); L=layers(pg)
        ck(f'{dev} Cockpit 3D-Netz (Vanta) gewählt: läuft, eine Ebene',m4=='vanta' and len([l for l in L if l['on']])==1,(m4,L))
        acc=pg.evaluate('getComputedStyle(document.documentElement).getPropertyValue("--acc").trim()')
        pg.click('#lb-gear'); pg.wait_for_timeout(200); pg.screenshot(path=f'{out}/{dev}-cockpit-vanta.png')
        # Performance-Modus an -> alles aus
        pg.click('#lb-gear'); pg.click('.lb-sw[data-k="perf"]'); m5=wait_mode(pg,['none'])
        ck(f'{dev} Performance-Modus: kein animierter Hintergrund',m5=='none' and not any(l['on'] for l in layers(pg)),(m5,layers(pg)))
        pg.click('.lb-sw[data-k="perf"]'); m6=wait_mode(pg,['vanta'])
        ck(f'{dev} Performance-Modus aus: Hintergrund kommt zurück',m6=='vanta',m6)
        # Tab versteckt -> Pause (Vanta/rAF: Browser; hier: kein Fehler)
        pg.evaluate('Object.defineProperty(document,"hidden",{configurable:true,get:()=>true});document.dispatchEvent(new Event("visibilitychange"))'); pg.wait_for_timeout(300)
        ck(f'{dev}: kein Seitwärtsscroll',noscroll(pg))
        ck(f'{dev}: keine Fehler',not errs,errs[:4]); b.close()
    # Bewegung reduzieren
    b,pg,errs=page(p,'handy',reduced=True); m=wait_mode(pg,['none'],4000)
    ck('Bewegung reduzieren: kein animierter Hintergrund, keine Fehler',m=='none' and not any(l['on'] for l in layers(pg)) and not errs,(m,errs)); b.close()
    # Performance-Modus ab Start: Bibliotheken werden gar nicht geladen
    b,pg,errs=page(p,'ipad',ui={'perf':True}); pg.wait_for_timeout(3000)
    r=pg.evaluate('[...document.scripts].map(s=>s.src).filter(s=>/tsparticles|vanta|three|lb-bg/.test(s))')
    ck('Performance-Modus ab Start: keine Hintergrund-Bibliothek geladen',r==[],r); b.close()
    # Bibliotheken laden nicht -> ruhiger Verlauf, Board läuft
    for dev,pat in(('handy',r'tsparticles'),('ipad',r'tsparticles|vanta|three')):
        b,pg,errs=page(p,dev,block=pat); pg.wait_for_timeout(4000)
        ck(f'{dev} ohne Bibliothek: keine sichtbare Ebene, Board bedienbar, keine Fehler',not any(l['on'] for l in layers(pg)) and behind(pg) and not errs,(layers(pg),errs))
        pg.click('#lb-gear'); ck(f'{dev} ohne Bibliothek: Einstellungen öffnen',pg.locator('#lb-set').is_visible()); b.close()
    # Unterseite: Recovery mit Glühwürmchen, Graphen bleiben bedienbar
    b,pg,errs=page(p,'handy',ui={'theme':'jungle'},url='recovery.html'); m=wait_mode(pg,['fireflies'])
    ck('Recovery im Dschungel: Glühwürmchen, keine Fehler',m=='fireflies' and not [e for e in errs if 'Whoop' not in e],errs[:3]); b.close()
print('\nFEHLER:',len(fails))
sys.exit(1 if fails else 0)
