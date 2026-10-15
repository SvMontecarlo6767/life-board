"""Browsertest für heute.html (Chromium, iPad-Breiten 1024 und 820) mit Firebase-Mock und Puzzle-Daten aus der Sicherung.
Aufruf: python3 tools/browser/test_heute.py <puzzle-sicherung.json> <screenshot-ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
back=json.load(open(sys.argv[1])); shots=sys.argv[2]; os.makedirs(shots,exist_ok=True)
seed={}
for d,v in back['days'].items(): seed['users/u1/puzzle/'+d]=v
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
H=functools.partial(Q,directory=root)
srv=socketserver.TCPServer(('127.0.0.1',0),H); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{port}/heute.html'
res=[];fails=0
def ck(name,cond,extra=''):
    global fails
    res.append(('ok ' if cond else 'FEHLER ')+name+(' '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
def run(p,w,h):
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True,accept_downloads=True)
    ctx.add_init_script('window.__seed='+json.dumps(seed)+';')
    ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-app-compat\.js'),lambda r:r.fulfill(body=mock,content_type='application/javascript'))
    ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-auth-compat\.js'),lambda r:r.fulfill(body='',content_type='application/javascript'))
    ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-firestore-compat\.js'),lambda r:r.fulfill(body='',content_type='application/javascript'))
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.clock.set_fixed_time('2026-10-14T12:00:00+02:00')
    pg.goto(URL); pg.wait_for_selector('.chip[data-id]')
    tag=f'[{w}px] '
    ck(tag+'keine Konsolenfehler',not errs,errs[:2])
    ck(tag+'kein Seitwärtsscrollen',pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth'),pg.evaluate('document.documentElement.scrollWidth'))
    ck(tag+'360 Chips + PUZ nicht tippbar',pg.locator('.chip[data-id]').count()==360,pg.locator('.chip[data-id]').count())
    ck(tag+'Datum heute 14.10.',pg.inner_text('#dt').startswith('Mi, 14.10.'),pg.inner_text('#dt').replace('\n',' '))
    ck(tag+'Puzzle-Tageswert 330 sichtbar','+330' in pg.inner_text('#puzCard'),pg.inner_text('#puzCard')[:80].replace('\n',' '))
    ck(tag+'Heute startet mit Puzzle-Wert',pg.inner_text('#netTop')=='+330',pg.inner_text('#netTop'))
    small=pg.evaluate('Math.min(...[...document.querySelectorAll(".chip[data-id]:not(.note)")].map(e=>e.getBoundingClientRect().height))')
    ck(tag+'Chips mindestens 44px hoch',small>=44,round(small))
    small=pg.evaluate('Math.min(...[...document.querySelectorAll("button")].filter(b=>b.offsetParent).map(e=>e.getBoundingClientRect().height))')
    ck(tag+'Buttons mindestens 44px (Minus-Knopf ausgenommen)',small>=44,round(small))
    pg.screenshot(path=f'{shots}/heute-{w}-start.png')
    pg.tap('.chip[data-id="MOR-01"]'); pg.wait_for_timeout(700)
    st=pg.evaluate('window.__store["users/u1/days/2026-10-14"]')
    ck(tag+'Tippen speichert Tagesdokument',bool(st) and st['a']=={'MOR-01':1} and st['rulesVersion']==1 and st['net']==390 and st['rank']=='C',st)
    pg.tap('.chip[data-id="MOR-01"]'); pg.wait_for_timeout(700)
    ck(tag+'zweites Tippen nimmt zurück',pg.evaluate('window.__store["users/u1/days/2026-10-14"].net')==330)
    pg.tap('.chip[data-id="SLP-01"]'); pg.tap('.chip[data-id="SLP-03"]')
    on=pg.evaluate('[...document.querySelectorAll(".chip.on")].map(e=>e.dataset.id)')
    ck(tag+'Stufen-Gruppe: nur eine aktiv',on==['SLP-03'],on)
    for _ in range(5): pg.tap('.chip[data-id="ERN-19"]')
    ck(tag+'Zähler stoppt am Maximum 3',pg.inner_text('.chip[data-id="ERN-19"] .cnt b')=='3 / 3')
    pg.tap('[data-minus="ERN-19"]')
    ck(tag+'Minus-Knopf',pg.inner_text('.chip[data-id="ERN-19"] .cnt b')=='2 / 3')
    pg.tap('.chip[data-id="SLP-30"]'); pg.wait_for_timeout(100)
    pg.tap('#prev'); pg.wait_for_selector('.chip[data-id="SLP-30"].dead')
    ck(tag+'Wochenbonus am Vortag gesperrt','schon am 14.10.' in pg.inner_text('.chip[data-id="SLP-30"]'))
    pg.tap('#next'); pg.wait_for_timeout(300)
    ck(tag+'Folgetag-Knopf bei heute gesperrt',pg.is_disabled('#next'))
    # Level-Aufstieg
    for i in ['MOR-14','SPA-07','SPK-01']: pg.tap(f'.chip[data-id="{i}"]')
    pg.wait_for_selector('#ov:not([hidden]) .lvlup',timeout=3000)
    ck(tag+'Level-Aufstieg-Animation erscheint',True)
    pg.screenshot(path=f'{shots}/heute-{w}-levelup.png')
    pg.tap('#ov'); pg.wait_for_timeout(200)
    ck(tag+'Level 2 im Kopf',pg.inner_text('#hLvl')=='Level 2',pg.inner_text('#hLvl'))
    # Multiplikator
    pg.tap('.chip[data-id="STR-08"]')
    ck(tag+'Sport-Multiplikator wird angezeigt','×0,30' in pg.inner_text('#hMods'),pg.inner_text('#hMods'))
    pg.tap('.chip[data-id="STR-08"]')
    # Suche
    pg.fill('#q','SLP-01'); ck(tag+'Suche filtert',pg.locator('.chip[data-id]').count()==1,pg.locator('.chip[data-id]').count())
    pg.fill('#q',''); pg.check('#onlyOn'); n=pg.locator('.chip.on').count(); ck(tag+'nur getippte',pg.locator('.chip[data-id]').count()==n,n); pg.uncheck('#onlyOn')
    # Tagesabschluss
    pg.fill('#focus','Latein wiederholen'); pg.tap('#closeBtn'); pg.wait_for_selector('#ov:not([hidden]) .sum')
    st=pg.evaluate('window.__store["users/u1/days/2026-10-14"]')
    ck(tag+'Abschluss: closed, ABD-01/02, Fokus, puz eingefroren',st['closed'] and st['a'].get('ABD-01')==1 and st['a'].get('ABD-02')==1 and st['focus']=='Latein wiederholen' and st['puz']==330,{k:st[k] for k in('closed','focus','puz')})
    pg.screenshot(path=f'{shots}/heute-{w}-abschluss.png'); pg.tap('#ovOk')
    # Reload: Zustand kommt aus dem Speicher
    keep=pg.evaluate('JSON.stringify(window.__store)'); net=pg.inner_text('#netTop')
    pg.reload(); pg.wait_for_selector('.chip[data-id]')
    ck(tag+'Reload: gleicher Tageswert',pg.inner_text('#netTop')==net,(net,pg.inner_text('#netTop')))
    ck(tag+'Reload: Abschluss bleibt',pg.inner_text('#closeBtn')=='Wieder öffnen')
    # Fokus von gestern am Folgetag (Uhr auf 15.10. 10:00)
    pg.clock.set_fixed_time('2026-10-15T10:00:00+02:00'); pg.reload(); pg.wait_for_selector('.chip[data-id]')
    ck(tag+'Folgetag: Fokus von gestern',pg.is_visible('#yFocus') and 'Latein wiederholen' in pg.inner_text('#yFocus'))
    ck(tag+'Folgetag: Level/Konto aus Vortag',pg.inner_text('#hLvl')=='Level 2')
    pg.screenshot(path=f'{shots}/heute-{w}-folgetag.png')
    # 03:59 Berlin gehört zum Vortag
    pg.clock.set_fixed_time('2026-10-15T03:59:00+02:00'); pg.reload(); pg.wait_for_selector('.chip[data-id]')
    ck(tag+'03:59 Uhr zählt noch zum 14.10.',pg.inner_text('#dt').startswith('Mi, 14.10.'),pg.inner_text('#dt').replace('\n',' '))
    # Schreibfehler
    pg.clock.set_fixed_time('2026-10-15T10:00:00+02:00'); pg.reload(); pg.wait_for_selector('.chip[data-id]')
    pg.evaluate('window.__failWrites=true'); pg.tap('.chip[data-id="MOR-02"]'); pg.wait_for_timeout(900)
    ck(tag+'Schreibfehler wird angezeigt','verweigert' in pg.inner_text('#msg') and pg.inner_text('#save')=='Fehler',pg.inner_text('#msg')[:50])
    pg.evaluate('window.__failWrites=false')
    # Export
    with pg.expect_download() as dl: pg.tap('#exportBtn')
    d=json.load(open(dl.value.path()))
    ck(tag+'Export enthält Tage + Regelwerk',d['app']=='life-board-heute' and '2026-10-14' in d['days'] and '1' in d['rules'],list(d['days']))
    pg.wait_for_timeout(300)
    ck(tag+'Export merkt sich Zeitpunkt','Letzter Export vor 0 Tagen' in pg.inner_text('#setInfo'),pg.inner_text('#setInfo')[-40:])
    pg.screenshot(path=f'{shots}/heute-{w}-ende.png',full_page=False)
    b.close()
with sync_playwright() as p:
    for w,h in((1024,768),(820,1180)): run(p,w,h)
print('\n'.join(res)); print('\n%d Fehler'%fails if fails else '\nALLE OK'); sys.exit(1 if fails else 0)
