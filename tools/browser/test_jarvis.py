"""Browsertest für Jarvis (Kern, Zustände, Push-to-talk mit Mikrofon-Attrappe, Sprachausgabe, Text, Verlauf, Fehlerfälle).
Aufruf: python3 tools/browser/test_jarvis.py <Ordner für Screenshots> <tts.b64>"""
import re, json, sys, os, threading, http.server, socketserver, functools, base64
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1]; os.makedirs(shots,exist_ok=True)
TTS=open(sys.argv[2]).read().strip()
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
res=[];fails=0
def ck(n,c,x=''):
    global fails
    res.append(('ok ' if c else 'FEHLER ')+n+(' '+str(x)[:160] if x!='' else ''))
    if not c: fails+=1
def run(p,w,h):
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required'])
    ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True)
    ctx.add_init_script("window.__states=[];window.addEventListener('lb-jarvis',e=>window.__states.push(e.detail.state));")
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.fulfill(body='',content_type='text/css'))
    S={'stt':'Wie war meine Recovery diese Woche?','calls':[],'ttsfail':False,'asks':0}
    def worker(r):
        u=r.request.url; hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if S.get('offline'): return r.abort('internetdisconnected')
        path=re.sub(r'^https://[^/]+','',u).split('?')[0]; S['calls'].append(path)
        body=r.request.post_data or ''
        if path=='/stt':
            S['stt_body']=json.loads(body); return r.fulfill(headers=hd,body=json.dumps({'text':S['stt'],'used':1,'limit':150}))
        if path=='/ask':
            S['asks']+=1; S['ask_body']=json.loads(body)
            return r.fulfill(headers=hd,body=json.dumps({'answer':'Deine Recovery lag im Schnitt bei 63 Prozent. Solide.' if S['ask_body'].get('voice') else 'Deine Recovery lag im Schnitt bei 63 Prozent, mit einem Tief am Dienstag (41 %). Details stehen im Verlauf.','used':S['asks'],'limit':150}))
        if path=='/tts':
            if S['ttsfail']: return r.fulfill(status=502,headers=hd,body='{"error":"Sprachausgabe nicht verfügbar"}')
            S['tts_body']=json.loads(body); return r.fulfill(headers=hd,body=json.dumps({'audio':TTS,'mime':'audio/wav'}))
        return r.fulfill(headers=hd,body=json.dumps({'days':{},'pages':[]}))
    ctx.route(re.compile(r'workers\.dev'),worker)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'TUNNEL' not in m.text and '502' not in m.text and 'ERR_' not in m.text and 'Failed to load resource' not in m.text else None)
    t=f'[{w}px] '
    pg.goto(f'http://127.0.0.1:{port}/heute.html'); pg.wait_for_selector('#jv-orb',timeout=20000); pg.wait_for_timeout(1500)
    pg.screenshot(path=f'{shots}/jarvis_{w}_docked.png')
    box=pg.locator('#jv-orb').bounding_box()
    ck(t+'Kern sichtbar, unten mittig, klein',abs(box['x']+box['width']/2-w/2)<3 and box['width']<100 and box['y']+box['height']<=h,box)
    ck(t+'Seiteninhalt wird nicht verdeckt (Platz unten)',pg.evaluate("parseInt(getComputedStyle(document.body).paddingBottom)>=100"))
    ck(t+'Name J.A.R.V.I.S im Kern vorhanden','J.A.R.V.I.S' in pg.inner_text('#jv-name') or pg.evaluate("document.getElementById('jv-name').textContent")=='J.A.R.V.I.S')
    # Tippen öffnet
    pg.tap('#jv-hit'); pg.wait_for_timeout(800)
    ck(t+'Antippen öffnet Jarvis',pg.get_attribute('#jv','data-open')=='1')
    ob=pg.locator('#jv-orb').bounding_box(); ck(t+'Kern wächst',ob['width']>250,ob['width'])
    ck(t+'Name sichtbar im geöffneten Zustand',float(pg.evaluate("getComputedStyle(document.getElementById('jv-name')).opacity"))>.5)
    pg.wait_for_timeout(600); pg.screenshot(path=f'{shots}/jarvis_{w}_open.png')
    # Push-to-talk: halten
    def ptt(ms):
        pg.evaluate("(()=>{const o=document.getElementById('jv-orb');o.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true,isPrimary:true}))})()")
        pg.wait_for_function("document.getElementById('jv').dataset.state==='listening'",timeout=8000)
        pg.wait_for_timeout(ms)
    ptt(1500); pg.screenshot(path=f'{shots}/jarvis_{w}_listening.png')
    ck(t+'Zustand "Zuhören" beim Halten',pg.get_attribute('#jv','data-state')=='listening')
    pg.evaluate("document.getElementById('jv-orb').dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}))")
    pg.wait_for_function("document.getElementById('jv').dataset.state==='thinking'||document.getElementById('jv').dataset.state==='speaking'",timeout=8000)
    pg.wait_for_function("document.getElementById('jv').dataset.state==='speaking'",timeout=15000); pg.screenshot(path=f'{shots}/jarvis_{w}_speaking.png')
    ck(t+'Zustand "Sprechen" während der Ausgabe',True)
    pg.wait_for_function("document.getElementById('jv').dataset.state==='idle'",timeout=20000)
    st=pg.evaluate('window.__states')
    ck(t+'Zustandsfolge listening → thinking → speaking → idle',all(x in st for x in('listening','thinking','speaking','idle')) and st.index('listening')<st.index('thinking')<st.index('speaking'),st)
    aud=base64.b64decode(S['stt_body']['audio']); ck(t+'Aufnahme als 16-kHz-WAV gesendet',aud[:4]==b'RIFF' and int.from_bytes(aud[24:28],'little')==16000 and len(aud)>20000,len(aud))
    ck(t+'Eigene Worte als Untertitel','Wie war meine Recovery' in pg.inner_text('#jv-you'))
    ck(t+'Antwort vollständig als Untertitel','Solide' in pg.inner_text('#jv-say'))
    ck(t+'Sprachantwort wurde kurz angefordert (voice=true)',S['ask_body'].get('voice') is True)
    ck(t+'Stimme Charon an TTS gesendet',S['tts_body'].get('voice')=='Charon' and 'Solide' in S['tts_body']['text'])
    ck(t+'Gesprochene Antwort als Text gespeichert',pg.evaluate("Object.values(window.__store).some(v=>v&&v.messages&&v.messages.some(m=>m.content.includes('Solide')))"))
    # Text -> nur schriftlich
    n_tts=S['calls'].count('/tts'); pg.fill('#jv-in','Und der Schlaf?'); pg.press('#jv-in','Enter')
    pg.wait_for_function("document.getElementById('jv-say').textContent.includes('Details stehen im Verlauf')",timeout=10000)
    ck(t+'Texteingabe: Antwort nur schriftlich (kein TTS)',S['calls'].count('/tts')==n_tts and S['ask_body'].get('voice') is False)
    # Zuruf: nur schriftlich
    S['stt']='Antworte ab jetzt nur noch schriftlich'; asks=S['asks']; ptt(1200)
    pg.evaluate("document.getElementById('jv-orb').dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}))")
    pg.wait_for_function("document.getElementById('jv-say').textContent.includes('nur noch schriftlich')",timeout=15000)
    ck(t+'Zuruf "nur schriftlich" ändert Einstellung ohne KI-Anfrage',S['asks']==asks and json.loads(pg.evaluate("localStorage.getItem('lb_ui')"))['speak']==False)
    ck(t+'Schalter im Jarvis-Panel zeigt "Nur Text"','Nur Text' in pg.inner_text('#jv-mode'))
    # Sprachaufnahme bei Nur-Text: Antwort nur Text
    S['stt']='Wie war mein Schlaf?'; n_tts=S['calls'].count('/tts'); ptt(1200)
    pg.evaluate("document.getElementById('jv-orb').dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}))")
    pg.wait_for_function("document.getElementById('jv-say').textContent.includes('Details stehen')",timeout=15000)
    ck(t+'Nur-Text-Modus: Sprachfrage wird nur schriftlich beantwortet',S['calls'].count('/tts')==n_tts and S['ask_body'].get('voice') is False)
    # Zuruf: sprich mit mir
    S['stt']='Sprich wieder mit mir'; ptt(1200)
    pg.evaluate("document.getElementById('jv-orb').dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}))")
    pg.wait_for_function("document.getElementById('jv').dataset.state==='speaking'",timeout=15000)
    ck(t+'Zuruf "sprich mit mir" schaltet Sprachausgabe wieder ein',json.loads(pg.evaluate("localStorage.getItem('lb_ui')"))['speak']==True)
    pg.wait_for_function("document.getElementById('jv').dataset.state==='idle'",timeout=20000)
    # TTS fällt aus -> Ersatzstimme
    pg.evaluate("window.speechSynthesis.speak=u=>setTimeout(()=>u.onend&&u.onend(),400);window.speechSynthesis.cancel=()=>{}")
    S['ttsfail']=True; S['stt']='Wie viele Punkte habe ich?'; ptt(1200)
    pg.evaluate("document.getElementById('jv-orb').dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}))")
    pg.wait_for_function("document.getElementById('jv-hint').textContent.includes('Ersatzstimme')",timeout=15000)
    ck(t+'TTS-Ausfall: Ersatzstimme springt ein',True)
    pg.wait_for_function("document.getElementById('jv').dataset.state==='idle'",timeout=15000)
    ck(t+'Nach Ersatzstimme: Text vollständig','Solide' in pg.inner_text('#jv-say'))
    S['ttsfail']=False
    # zu kurze Aufnahme
    pg.evaluate("(()=>{const o=document.getElementById('jv-orb');o.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true}))})()")
    pg.wait_for_function("document.getElementById('jv').dataset.state==='listening'",timeout=8000); pg.evaluate("document.getElementById('jv-orb').dispatchEvent(new PointerEvent('pointerup',{pointerId:7,bubbles:true}))")
    pg.wait_for_timeout(500); ck(t+'Zu kurze Aufnahme: freundlicher Hinweis, keine Anfrage','nichts gehört' in pg.inner_text('#jv-say') and pg.get_attribute('#jv','data-state')=='idle')
    # Verlauf
    pg.tap('#jv-histb'); pg.wait_for_timeout(600); pg.screenshot(path=f'{shots}/jarvis_{w}_hist.png')
    ck(t+'Verlauf-Panel zeigt Unterhaltung','Und der Schlaf?' in pg.inner_text('#jv-hbody') and 'Solide' in pg.inner_text('#jv-hbody'))
    pg.tap('#jv-hist .tabs [data-t=all]'); pg.wait_for_selector('#jv-hbody .c')
    ck(t+'Chatliste mit gespeichertem Chat',pg.locator('#jv-hbody .c').count()>=1)
    pg.tap('#jv-hnew'); pg.wait_for_timeout(300); pg.fill('#jv-in','Neuer Chat Test'); pg.press('#jv-in','Enter'); pg.wait_for_function("document.getElementById('jv-say').textContent.includes('Details')",timeout=10000)
    pg.tap('#jv-hist .tabs [data-t=all]'); pg.wait_for_function("document.querySelectorAll('#jv-hbody .c').length==2",timeout=5000)
    ck(t+'Zwei getrennte Chats gespeichert',True)
    pg.locator('#jv-hbody .c').nth(1).click(); pg.wait_for_timeout(500)
    ck(t+'Alter Chat lässt sich öffnen','geöffnet' in pg.inner_text('#jv-say'))
    pg.tap('#jv-hx')
    # Fehler: offline
    S['offline']=True; pg.fill('#jv-in','Test offline'); pg.press('#jv-in','Enter'); pg.wait_for_timeout(1200)
    ck(t+'Offline: verständliche Meldung','offline' in pg.inner_text('#jv-say').lower() or 'nicht erreichbar' in pg.inner_text('#jv-say').lower(),pg.inner_text('#jv-say'))
    S['offline']=False; pg.wait_for_function("document.getElementById('jv').dataset.state==='idle'",timeout=5000)
    # Performance-Modus: Kern wird neu gebaut, kein Fehler
    pg.evaluate("LBUI.setSetting('perf',true)"); pg.wait_for_timeout(1200); pg.evaluate("LBUI.setSetting('perf',false)"); pg.wait_for_timeout(1200)
    ck(t+'Performance-Modus an/aus ohne Fehler',pg.is_visible('#jv-orb canvas'))
    # Schließen
    pg.tap('#jv-close'); pg.wait_for_timeout(1000); bb=pg.evaluate("document.getElementById('jv-orb').offsetWidth"); ck(t+'Schließen: Kern wieder klein',bb<100,(bb,pg.get_attribute('#jv','data-open')))
    ck(t+'Keine Konsolenfehler',not errs,errs[:3])
    # Mikrofon verweigert
    ctx2=b.new_context(viewport={'width':w,'height':h},has_touch=True)
    ctx2.add_init_script("navigator.mediaDevices.getUserMedia=()=>Promise.reject(Object.assign(new Error('x'),{name:'NotAllowedError'}));")
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx2.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx2.route(re.compile(r'fonts\.|workers\.dev'),lambda r:r.fulfill(headers={'access-control-allow-origin':'*','content-type':'application/json'},body='{}'))
    p2=ctx2.new_page(); p2.goto(f'http://127.0.0.1:{port}/learn.html'); p2.wait_for_selector('#jv-orb'); p2.wait_for_timeout(800)
    p2.evaluate("document.getElementById('jv-orb').dispatchEvent(new PointerEvent('pointerdown',{pointerId:3,bubbles:true}))"); p2.wait_for_timeout(900)
    ck(t+'Mikrofon verweigert: klare Meldung','Mikrofon verweigert' in p2.inner_text('#jv-say') and 'Einstellungen' in p2.inner_text('#jv-say'),p2.inner_text('#jv-say'))
    p2.screenshot(path=f'{shots}/jarvis_{w}_error.png')
    b.close()
with sync_playwright() as p:
    run(p,1024,768); run(p,820,1180)
print('\n'.join(res)); print('FEHLER:',fails); sys.exit(1 if fails else 0)
