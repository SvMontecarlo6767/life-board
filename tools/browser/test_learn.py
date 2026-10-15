"""Browsertest für learn.html (Chromium, 1024 und 820 px): Firebase-Mock, Worker-Mock mit Notion-Testdaten.
Aufruf: python3 tools/browser/test_learn.py <screenshot-ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1]; os.makedirs(shots,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
PAGES=[{'id':'a'*32,'title':'Thema 66 Spieltheorie','edited':'2026-10-07T19:29:00.000Z'},{'id':'b'*32,'title':'Nonverbale Kommunikation','edited':'2026-05-19T17:34:00.000Z'},{'id':'c'*32,'title':'Thema 9 Wahlsysteme','edited':'2026-10-01T10:00:00.000Z'},{'id':'d'*32,'title':'Thema 10 Lobby','edited':'2026-10-02T10:00:00.000Z'}]
QUEST={'a'*32:['Was ist eine dominante Strategie?','Warum Kooperation bei Wiederholung?','Rückwärtsinduktion?','Zwei Gründe für Kooperation?','Gemischte Strategie?','Kartelle instabil?','Bluff?'],
 'b'*32:['Unterschied dominant/unsicher?','Dauer Mikroausdruck?','Welcher Körperteil lügt am seltensten?','3 der 7 Ausdrücke?','Füße zur Tür?'],
 'c'*32:['Mehrheitswahl?','Verhältniswahl?'],'d'*32:['Lobby %d?'%i for i in range(20)]}
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{port}/learn.html'
res=[];fails=0
def ck(n,c,x=''):
    global fails
    res.append(('ok ' if c else 'FEHLER ')+n+(' '+str(x) if x!='' else ''))
    if not c: fails+=1
def run(p,w,h):
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True)
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    st={'qcalls':0,'noion':False}
    def worker(r):
        u=r.request.url
        hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if st['noion']: return r.fulfill(status=409,headers=hd,body='{"error":"x","code":"NO_NOTION"}')
        if '/notion/pages' in u: return r.fulfill(headers=hd,body=json.dumps({'pages':PAGES}))
        m=re.search(r'id=(\w+)',u); st['qcalls']+=1
        pid=m.group(1); return r.fulfill(headers=hd,body=json.dumps({'id':pid,'title':'t','questions':QUEST[pid],'ref':'KERNIDEE Testtext '+pid[:1]}))
    ctx.route(re.compile(r'life-board-whoop\.momo-haskamp\.workers\.dev'),worker)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' else None)
    pg.clock.set_fixed_time('2026-10-15T12:00:00+02:00')
    pg.goto(URL); t=f'[{w}px] '
    pg.wait_for_function("document.getElementById('syncMsg').textContent.includes('neue Fragen')",timeout=15000)
    ck(t+'Erstes Laden holt alle Fragen',('34 neue Fragen aus 4 Seiten' in pg.inner_text('#syncMsg')),pg.inner_text('#syncMsg'))
    ck(t+'Fragen in Firestore',sum(1 for k in pg.evaluate('Object.keys(window.__store)') if '/questions/' in k)==34)
    ck(t+'Seite mit Zusammenfassung gespeichert',pg.evaluate("window.__store['users/u1/learnpages/%s'].ref.includes('Testtext')"%('a'*32)))
    ck(t+'Statistik: 34 neu',' 34 ' in ' '+' '.join(pg.inner_text('#stats').split())+' ',' '.join(pg.inner_text('#stats').split())[:80])
    # zweiter Abruf: nichts Neues, keine doppelten Fragen
    before=st['qcalls']; pg.click('#sync'); pg.wait_for_function("document.getElementById('syncMsg').textContent.includes('0 neue')")
    ck(t+'Erneuter Abruf lädt unveränderte Seiten nicht neu',st['qcalls']==before,(before,st['qcalls']))
    # Runde
    pg.click('#go'); 
    for i in range(5):
        pg.wait_for_selector('#show'); pg.fill('#ans','Test'); pg.click('#show'); pg.wait_for_selector('[data-r]')
        ck(t+f'Frage {i+1}: Nachschlagen sichtbar','Testtext' in pg.inner_text('.ref'))
        pg.click('[data-r="ok"]' if i<4 else '[data-r="bad"]')
    pg.wait_for_selector('#again')
    ck(t+'Rundenergebnis 4 von 5','4 von 5' in pg.inner_text('#round'),pg.inner_text('#round')[:60])
    day=pg.evaluate("window.__store['users/u1/learn/2026-10-15']")
    ck(t+'Tag gespeichert mit Zähler',day['counts']=={'WDH-01':1,'LRN-07':1},day['counts'])
    qs=pg.evaluate("Object.values(window.__store).filter(v=>v&&v.reps===1)")
    ck(t+'5 Fragen terminiert',len(qs)==5 and sum(1 for q in qs if q['stage']==2 and q['due']=='2026-10-16')==4 and sum(1 for q in qs if q['stage']==1 and q['due']=='2026-10-16')==1)
    pg.screenshot(path=f'{shots}/learn_{w}_fertig.png')
    pg.click('#done'); pg.wait_for_selector('#go')
    ck(t+'Heute-Anzeige 1 Runde','1 Runde' in pg.inner_text('#start'),pg.inner_text('#start')[-120:])
    # nach Neuladen: Stand bleibt
    pg.reload(); pg.wait_for_selector('#go')
    ck(t+'Nach Neuladen: Runde + Fragen noch da','1 Runde' in pg.inner_text('#start') and ' 29 ' in ' '+' '.join(pg.inner_text('#stats').split())+' ')
    # Mischrunde mit >=3 Themen
    pg.click('#gomix')
    for i in range(5):
        pg.wait_for_selector('#show'); pg.click('#show'); pg.wait_for_selector('[data-r]'); pg.click('[data-r="ok"]')
    pg.wait_for_selector('#again'); day=pg.evaluate("window.__store['users/u1/learn/2026-10-15']")
    ck(t+'Mischrunde zählt als WDH-13',day['counts'].get('WDH-13')==1 and day['counts'].get('WDH-01')==1,day['counts'])
    pg.click('#done'); pg.wait_for_selector('#go')
    for r in range(3):
        pg.click('#go')
        for i in range(5):
            pg.wait_for_selector('#show'); pg.click('#show'); pg.wait_for_selector('[data-r]'); pg.click('[data-r="bad"]')
        pg.wait_for_selector('#done'); pg.click('#done'); pg.wait_for_selector('#go')
    day=pg.evaluate("window.__store['users/u1/learn/2026-10-15']")
    ck(t+'Mehr als 3 Runden: Zähler bleibt bei 3',sum(v for k,v in day['counts'].items() if k.startswith('WDH'))==3,day['counts'])
    ck(t+'Hinweis zum Tageslimit','weitere Runden geben keine Punkte' in pg.inner_text('#start'))
    ck(t+'keine Konsolenfehler',not errs,errs[:2]); ck(t+'kein Seitwärtsscrollen',pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
    pg.screenshot(path=f'{shots}/learn_{w}.png')
    # Notion nicht eingerichtet -> verständliche Meldung
    st['noion']=True; pg.click('#sync'); pg.wait_for_selector('.info.warn')
    ck(t+'Meldung bei fehlendem Token','NOTION_TOKEN' in pg.inner_text('#msg'),pg.inner_text('#msg')[:90])
    b.close()
with sync_playwright() as p:
    run(p,1024,768); run(p,820,1180)
print('\n'.join(res)); print('FEHLER:',fails); sys.exit(1 if fails else 0)
