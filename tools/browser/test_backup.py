"""Browsertest Sicherung/Wiederherstellung und App-Modus. Aufruf: python3 tools/browser/test_backup.py"""
import re, json, sys, os, threading, http.server, socketserver, functools, tempfile
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
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
SEED={'users/u1/puzzle/p1':{'a':1},'users/u1/training/acts_2026':{'list':[{'i':'m1','t':1,'r':'Kraft','s':3600}]},'users/u1/training/gym_2026':{'list':[{'i':'x1','d':'2026-10-01','t':1,'m':60,'x':7,'n':'','p':'Push','e':[{'n':'Bank','s':[{'w':80,'r':8}]}]}]},'users/u1/learn/l1':{'q':'x'}}
with sync_playwright() as p:
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1024,'height':900},has_touch=True,accept_downloads=True)
    ctx.add_init_script('window.__seed='+json.dumps(SEED)+';')
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'workers\.dev|fonts\.(googleapis|gstatic)'),lambda r:r.fulfill(body='{}',headers={'access-control-allow-origin':'*','content-type':'application/json'}))
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('dialog',lambda d:d.accept())
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_selector('#bkDl',state='attached'); pg.wait_for_timeout(800)
    with pg.expect_download() as dl: pg.evaluate("document.getElementById('bkDl').click()")
    path=dl.value.path(); data=json.load(open(path))
    ck('Sicherung enthält alle Bereiche',set(data['collections'])>={'puzzle','training','learn'} and 'gym_2026' in data['collections']['training'],list(data['collections']))
    # Daten löschen, dann wiederherstellen
    pg.evaluate("Object.keys(window.__store).forEach(k=>delete window.__store[k])")
    pg.evaluate("document.getElementById('bk').classList.add('sheet-open');document.getElementById('bkRestore').open=true")
    f=tempfile.mktemp(suffix='.json'); open(f,'w').write(json.dumps(data))
    pg.set_input_files('#bkFile',f); pg.wait_for_timeout(400)
    ck('Vorschau zeigt Inhalt, Knopf erscheint','Dokumente' in pg.inner_text('#bkPrev') and pg.is_visible('#bkGo'),pg.inner_text('#bkPrev'))
    ck('Vor dem Bestätigen wurde nichts geschrieben',len(pg.evaluate("Object.keys(window.__store)"))==0)
    pg.tap('#bkGo'); pg.wait_for_timeout(600)
    st=pg.evaluate('window.__store')
    ck('Wiederhergestellt',set(st)=={'users/u1/puzzle/p1','users/u1/training/acts_2026','users/u1/training/gym_2026','users/u1/learn/l1'} and st['users/u1/training/gym_2026']['list'][0]['p']=='Push',list(st))
    ck('Meldung',pg.inner_text('#bkPrev').startswith('✓'),pg.inner_text('#bkPrev'))
    # Ungültige Dateien
    for name,content in(('fremd',{'app':'other','collections':{}}),('unbekannt',{'app':'life-board','collections':{'hacks':{'a':{}}}}),('kaputt',{'app':'life-board','collections':{'puzzle':{'a':[1]}}}),('id',{'app':'life-board','collections':{'puzzle':{'../x':{}}}})):
        open(f,'w').write(json.dumps(content)); pg.set_input_files('#bkFile',f); pg.wait_for_timeout(300)
        ck('Ungültige Datei wird abgelehnt ('+name+')',not pg.is_visible('#bkGo') and pg.inner_text('#bkPrev')!='',pg.inner_text('#bkPrev'))
    open(f,'w').write('kein json'); pg.set_input_files('#bkFile',f); pg.wait_for_timeout(300)
    ck('Kaputte Datei wird abgelehnt','nicht gelesen' in pg.inner_text('#bkPrev'),pg.inner_text('#bkPrev'))
    ck('Keine Seitenfehler',errs==[],errs[:3])
    # App-Modus
    for pgname in ['index','heute','recovery','learn','puzzle','training']:
        s=open(os.path.join(root,pgname+'.html')).read()
        ck(f'{pgname}.html: Manifest, Symbol, App-Tags','rel="manifest"' in s and 'apple-touch-icon' in s and 'apple-mobile-web-app-capable' in s and 'theme-color' in s)
    m=json.load(open(os.path.join(root,'manifest.webmanifest')))
    ck('Manifest gültig',m['display']=='standalone' and all(os.path.exists(os.path.join(root,i['src'])) for i in m['icons']) and m['start_url']=='index.html')
    from PIL import Image
    ck('Symbole haben die richtige Größe',[Image.open(os.path.join(root,'icons',n)).size for n in ['apple-touch-icon.png','icon-192.png','icon-512.png']]==[(180,180),(192,192),(512,512)])
    # Service Worker (echt, nur hier erlaubt)
    ctx2=b.new_context(); pg2=ctx2.new_page()
    pg2.goto(f'http://127.0.0.1:{port}/manifest.webmanifest')
    ok=pg2.evaluate("""async()=>{try{const r=await navigator.serviceWorker.register('/sw.js');await navigator.serviceWorker.ready;return r.active?true:true}catch(e){return String(e)}}""")
    pg2.wait_for_timeout(1500)
    keys=pg2.evaluate("caches.keys().then(k=>k)")
    n=pg2.evaluate("caches.open('lb-shell-v3').then(c=>c.keys()).then(k=>k.length)")
    ck('Service Worker registriert und legt Offline-Kopie an',ok is True and 'lb-shell-v3' in keys and n>=20,(ok,keys,n))
    b.close()
print('\nFEHLER:',fails if fails else 'keine'); sys.exit(1 if fails else 0)
