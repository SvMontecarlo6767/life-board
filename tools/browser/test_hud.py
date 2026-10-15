"""Tests der HUD-Schicht: Navigation, Einstellungen (Performance-Modus, Sounds), Speicherung, Reiterwechsel, Reduced Motion, 3D-Hintergrund."""
import re, json, sys, os, threading, http.server, socketserver, functools, io
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];fails=0
def ck(n,c,x=''):
    global fails
    res.append(('ok ' if c else 'FEHLER ')+n+(' '+str(x) if x!='' else ''))
    if not c: fails+=1
def ctxof(b,**kw):
    ctx=b.new_context(viewport={'width':1024,'height':768},has_touch=True,**kw)
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'workers\.dev'),lambda r:r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'}) if r.request.method=='OPTIONS' else r.fulfill(headers={'access-control-allow-origin':'*','content-type':'application/json'},body='{"days":{},"pages":[]}'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.fulfill(body='',content_type='text/css'))
    return ctx
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    ctx=ctxof(b); pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.goto(f'http://127.0.0.1:{port}/learn.html'); pg.wait_for_selector('#lb-nav'); pg.wait_for_timeout(1200)
    ck('Navigation mit 5 Reitern',pg.locator('#lb-nav a.tab').count()==5)
    ck('Aktiver Reiter = Lernen',pg.inner_text('#lb-nav a.tab.act').strip().lower()=='lernen')
    ck('Akzent Lernen = Violett',pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()")=='150 125 255')
    ck('3D-Hintergrund da',pg.evaluate("!!document.getElementById('lb-bg')"))
    from PIL import Image
    im=Image.open(io.BytesIO(pg.locator('#lb-bg').screenshot())).convert('L'); px=list(im.getdata())
    ck('3D-Hintergrund zeichnet etwas (nicht leer)',max(px)>25 and len(set(px))>8,(min(px),max(px)))
    ck('Tab-Leiste: alle Touchflächen ≥ 44 px',pg.evaluate("Math.min(...[...document.querySelectorAll('#lb-nav a.tab,#lb-gear')].map(e=>e.offsetHeight))")>=44)
    # Einstellungen
    pg.tap('#lb-gear'); ck('Einstellungs-Panel öffnet',pg.is_visible('#lb-set'))
    ck('Schalter ≥ 44 px hoch',pg.evaluate("Math.min(...[...document.querySelectorAll('#lb-set .lb-sw')].map(e=>e.offsetHeight))")>=44)
    ck('Standard: Sounds an, Performance aus',pg.get_attribute('[data-k=sounds]','aria-checked')=='true' and pg.get_attribute('[data-k=perf]','aria-checked')=='false')
    pg.tap('[data-k=perf]'); pg.wait_for_timeout(300)
    ck('Performance-Modus aktiv (html[data-perf])',pg.evaluate("document.documentElement.hasAttribute('data-perf')"))
    ck('Performance: Blur aus, Hintergrund-Canvas ausgeblendet',pg.evaluate("getComputedStyle(document.querySelector('.card')).backdropFilter")=='none' and pg.evaluate("getComputedStyle(document.getElementById('lb-bg')).display")=='none')
    ck('Einstellung gespeichert (lokal)',json.loads(pg.evaluate("localStorage.getItem('lb_ui')"))['perf']==True)
    ck('Einstellung gespeichert (Firestore)',pg.evaluate("Object.values(window.__store).some(v=>v&&v.ui&&v.ui.perf===true)"))
    pg.tap('[data-k=sounds]'); ck('Sounds aus gespeichert',json.loads(pg.evaluate("localStorage.getItem('lb_ui')"))['sounds']==False)
    pg.reload(); pg.wait_for_selector('#lb-nav'); pg.wait_for_timeout(600)
    ck('Nach Neuladen: Performance bleibt an, kein 3D geladen',pg.evaluate("document.documentElement.hasAttribute('data-perf')") and not pg.evaluate("!!document.getElementById('lb-bg')"))
    pg.tap('#lb-gear'); ck('Nach Neuladen: Schalter stimmen',pg.get_attribute('[data-k=perf]','aria-checked')=='true' and pg.get_attribute('[data-k=sounds]','aria-checked')=='false')
    pg.tap('[data-k=perf]'); pg.wait_for_timeout(800)
    ck('Performance wieder aus: 3D startet',pg.evaluate("!!document.getElementById('lb-bg')") and pg.evaluate("getComputedStyle(document.getElementById('lb-bg')).display")!='none')
    pg.keyboard.press('Escape'); pg.tap('.bar,h1') if False else None
    # Reiterwechsel + Akzent
    pg.tap('#lb-gear') if pg.is_visible('#lb-set') else None
    pg.tap('#lb-nav a.tab[data-tab=recovery]'); pg.wait_for_url(re.compile('recovery.html'),timeout=8000); pg.wait_for_selector('#lb-nav'); pg.wait_for_timeout(1000)
    ck('Reiterwechsel mit Übergang',pg.inner_text('#lb-nav a.tab.act').strip().lower()=='recovery')
    ck('Akzent Recovery = Grün',pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--acc').trim()")=='52 235 170')
    # neuer Reiter per Config
    pg.evaluate("LBUI.registerTab({id:'test',name:'Test',file:'test.html',href:'test.html',rgb:[255,0,0],rgb2:[0,0,255]})")
    ck('Neuer Reiter per registerTab',pg.locator('#lb-nav a.tab').count()==6)
    ck('Keine Konsolenfehler',not errs,errs[:3])
    ctx.close()
    # Reduced Motion
    ctx=ctxof(b,reduced_motion='reduce'); pg=ctx.new_page(); pg.goto(f'http://127.0.0.1:{port}/heute.html'); pg.wait_for_selector('#lb-nav'); pg.wait_for_timeout(800)
    ck('Reduced Motion: keine Einblend-Verzögerung',pg.evaluate("document.querySelectorAll('.rv').length")==0)
    ctx.close()
    # Zurück-Taste / bfcache: Seite nicht ausgeblendet
    ctx=ctxof(b); pg=ctx.new_page(); pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_selector('#lb-nav'); pg.wait_for_timeout(500)
    pg.tap('#lb-nav a.tab[data-tab=lernen]'); pg.wait_for_url(re.compile('learn.html')); pg.go_back(); pg.wait_for_selector('#lb-nav'); pg.wait_for_timeout(600)
    ck('Zurück-Taste: Seite sichtbar',pg.evaluate("!document.documentElement.classList.contains('lb-leave') && getComputedStyle(document.body).opacity")!='0' )
    b.close()
print('\n'.join(res)); print('FEHLER:',fails); sys.exit(1 if fails else 0)
