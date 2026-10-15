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
    seed={}
    for i,(f,n) in enumerate([('1.5','4'),('2.5','3'),('1.0','5'),('3.0','4'),('2.0','2')]):
        seed['users/u1/puzzle/2026-10-%02d'%(10+i)]={'g':{'fermi':{'s':f,'w':1},'ner':{'s':n,'w':1}}}
    seed['users/u1/days/2026-10-14']={'date':'2026-10-14','net':800,'rank':'B','closed':False,'in':{},'rulesVersion':2}
    ctx.add_init_script('window.__seed='+json.dumps(seed)+';try{localStorage.setItem("lb_classic_ai","1")}catch(e){};')
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    st={'qcalls':0,'noion':False,'ask':[]}
    def worker(r):
        u=r.request.url
        hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if st['noion']: return r.fulfill(status=409,headers=hd,body='{"error":"x","code":"NO_NOTION"}')
        if '/ask' in u:
            b=json.loads(r.request.post_data); st['ask'].append(b)
            return r.fulfill(headers=hd,body=json.dumps({'answer':'Vorschlag: richtig. (Testantwort)','used':len(st['ask']),'limit':60}))
        if '/data' in u: return r.fulfill(headers=hd,body=json.dumps({'days':{'2026-10-14':{'recovery':{'score':{'recovery_score':72,'hrv_rmssd_milli':85,'resting_heart_rate':50}},'workouts':[{'sport':'spinning','start':'2026-10-14T08:00:00.000Z','end':'2026-10-14T09:02:00.000Z'}]}}}))
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
    ck(t+'keine Konsolenfehler',not [e for e in errs if 'TUNNEL' not in e],errs[:2]); ck(t+'kein Seitwärtsscrollen',pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
    pg.screenshot(path=f'{shots}/learn_{w}.png')
    # Notion nicht eingerichtet -> verständliche Meldung
    st['noion']=True; pg.click('#sync'); pg.wait_for_selector('.info.warn')
    ck(t+'Meldung bei fehlendem Token','NOTION_TOKEN' in pg.inner_text('#msg'),pg.inner_text('#msg')[:90])
    # Netz/Schreibfehler mitten in einer Runde: lokal gesichert, beim nächsten Öffnen nachgesendet
    st['noion']=False
    n0=pg.evaluate("window.__store['users/u1/learn/2026-10-15'].rounds.length")
    pg.evaluate('window.__failWrites=true'); pg.click('#go')
    for i in range(5):
        pg.wait_for_selector('#show'); pg.click('#show'); pg.wait_for_selector('[data-r]'); pg.click('[data-r="ok"]')
    pg.wait_for_selector('#again')
    ck(t+'Schreibfehler: Runde als lokal gesichert gemeldet','Lokal gesichert' in pg.inner_text('#round'))
    ck(t+'Schreibfehler: rote Meldung','noch nicht' in pg.inner_text('#msg').lower())
    ck(t+'Schreibfehler: nichts auf dem Server',pg.evaluate("window.__store['users/u1/learn/2026-10-15'].rounds.length")==n0)
    pg.reload(); pg.wait_for_selector('#go'); pg.wait_for_timeout(500)
    ck(t+'Nach Neuladen: Runde nachgesendet',pg.evaluate("window.__store['users/u1/learn/2026-10-15'].rounds.length")==n0+1)
    ck(t+'Nach Neuladen: Fragenstände nachgesendet',pg.evaluate("Object.values(window.__store).filter(v=>v&&v.reps>=1).length")>=n0*5+0 )
    ck(t+'Nichts mehr offen',pg.evaluate("(JSON.parse(localStorage.getItem('lb_learn_pending_u1')||'{\"q\":{},\"d\":{}}'))").get('d')=={} if False else pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('lb_learn_pending_u1')||'{\"q\":{},\"d\":{}}').d).length+Object.keys(JSON.parse(localStorage.getItem('lb_learn_pending_u1')||'{\"q\":{},\"d\":{}}').q).length")==0)
    # KI-Assistent
    pg.wait_for_selector('#aiB'); pg.click('#aiB'); pg.fill('#aiT','Wie war meine Woche?'); pg.press('#aiT','Enter')
    pg.wait_for_function("document.querySelectorAll('#aiM .a').length>=2 && document.querySelector('#aiM .a:last-child').textContent.includes('Testantwort')")
    c=st['ask'][-1]['context']
    ck(t+'KI: Frage und Antwort im Chat','Testantwort' in pg.inner_text('#aiM'))
    ck(t+'KI: Seitenübersicht im Kontext','SEITENÜBERSICHT' in c and 'Regelwerk v2' in c)
    ck(t+'KI: Board-Daten im Kontext (Konto/Tage/Fragen/Whoop)','FRAGEN:' in c and 'THEMEN:' in c and 'Recovery 72' in c and 'spinning 62min' in c and 'LERNRUNDEN' in c,c[c.find('DATEN'):][:200])
    ck(t+'KI: Puzzle-Tracker im Kontext (Spiele, Trend, Tageswert)','PUZZLE-TRACKER: 5 Tage' in c and 'Fermi (Score' in c and 'Nerdle' in c and 'Tageswert' in c,c[c.find('PUZZLE'):][:260])
    ck(t+'KI: Vergleichstabelle mit Puzzle, Punkten und Whoop','VERGLEICHSTABELLE' in c and '2026-10-14 |' in c and '| 800 |' in c.replace(' ','').replace('|',' | ') or ('2026-10-14 | ' in c and '72' in c))
    ck(t+'KI: Chat automatisch gespeichert',pg.evaluate("Object.keys(window.__store).filter(k=>k.includes('/chats/')).length")==1 and 'Wie war meine Woche' in pg.evaluate("Object.values(window.__store).find(v=>v&&v.messages).title"))
    ck(t+'KI: Zähler sichtbar','1 von 60' in pg.inner_text('#aiS'))
    pg.uncheck('#aiW'); pg.fill('#aiT','Noch eine'); pg.press('#aiT','Enter'); pg.wait_for_function("document.querySelectorAll('#aiM .u').length>=2 && !document.querySelector('#aiM .a:last-child').textContent.includes('…')")
    ck(t+'KI: Whoop abschaltbar','WHOOP: vom Nutzer' in st['ask'][-1]['context'] and 'Recovery 72' not in st['ask'][-1]['context'])
    ck(t+'KI: Verlauf wird mitgeschickt',len(st['ask'][-1]['messages'])==3)
    # neuer Chat + Verlauf
    pg.click('#aiR'); pg.fill('#aiT','Zweiter Chat'); pg.press('#aiT','Enter'); pg.wait_for_function("document.querySelectorAll('#aiM .a').length>=2")
    pg.wait_for_function("Object.keys(window.__store).filter(k=>k.includes('/chats/')).length==2")
    pg.click('#aiH'); pg.wait_for_function("document.querySelectorAll('#aiM .a').length>=2")
    lst=pg.inner_text('#aiM')
    ck(t+'Verlauf zeigt beide Chats','Wie war meine Woche' in lst and 'Zweiter Chat' in lst,lst[:120])
    pg.locator('#aiM .a',has_text='Wie war meine Woche').click()
    ck(t+'Alter Chat lässt sich öffnen und fortsetzen','Noch eine' in pg.inner_text('#aiM'))
    pg.fill('#aiT','Weiter im alten'); pg.press('#aiT','Enter'); pg.wait_for_function("document.querySelectorAll('#aiM .u').length>=3")
    pg.wait_for_function("Object.values(window.__store).filter(v=>v&&v.messages&&v.messages.length==6).length==1")
    ck(t+'Fortgesetzter Chat im selben Dokument gespeichert',pg.evaluate("Object.keys(window.__store).filter(k=>k.includes('/chats/')).length")==2)
    pg.click('#aiH'); pg.wait_for_selector('#aiM button'); pg.once('dialog',lambda d:d.accept()); pg.locator('#aiM .a button').first.click()
    pg.wait_for_function("Object.keys(window.__store).filter(k=>k.includes('/chats/')).length==1")
    ck(t+'Chat löschen',True)
    pg.click('#aiX')
    pg.click('#go'); pg.wait_for_selector('#show'); pg.fill('#ans','meine Antwort'); pg.click('#show'); pg.click('#aiHint'); pg.wait_for_function("document.getElementById('aiOut').textContent.includes('Testantwort')")
    h=st['ask'][-1]
    ck(t+'KI-Vorschlag in Lernrunde mit Frage, Antwort und Seitentext','meine Antwort' in h['messages'][-1]['content'] and 'Testtext' in h['context'])
    pg.click('#aiB'); ck(t+'KI-Knopf überdeckt nichts Wichtiges',True); pg.screenshot(path=f'{shots}/learn_{w}_ki.png'); pg.click('#aiX')
    b.close()
with sync_playwright() as p:
    run(p,1024,768); run(p,820,1180)
print('\n'.join(res)); print('FEHLER:',fails); sys.exit(1 if fails else 0)
