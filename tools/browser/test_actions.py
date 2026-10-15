"""Browsertest für Jarvis-Aktionen (Phase 4): Funktionsaufruf -> Bestätigung -> Ausführung, Rückfragen, Seitenwechsel.
Aufruf: python3 tools/browser/test_actions.py <Ordner für Screenshots>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1]; os.makedirs(shots,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
fails=0
def ck(n,c,x=''):
    global fails
    print(('ok ' if c else 'FEHLER ')+n+(' '+str(x)[:200] if x!='' else ''),flush=True)
    if not c: fails+=1
seed={'users/u1/days/2026-10-14':{'date':'2026-10-14','rulesVersion':2,'in':{},'a':{},'x':{},'net':0,'rank':'C','closed':False,'updatedAt':1},
      'users/u1/state/current':{'account':1000,'level':1,'levelProgress':.1,'days':1}}
S={'next':None,'bodies':[]}
def worker(r):
    hd={'access-control-allow-origin':'*','content-type':'application/json'}
    if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
    path=re.sub(r'^https://[^/]+','',r.request.url).split('?')[0]
    if path=='/ask':
        b=json.loads(r.request.post_data or '{}'); S['bodies'].append(b)
        q=b['messages'][-1]['content']
        if q.startswith('CALL '):
            name,args=q[5:].split(' ',1); return r.fulfill(headers=hd,body=json.dumps({'answer':'','calls':[{'name':name,'args':json.loads(args)}],'model':'gemini-3.8-flash','used':1,'limit':150}))
        return r.fulfill(headers=hd,body=json.dumps({'answer':'Normale Antwort.','calls':[],'used':1,'limit':150}))
    return r.fulfill(headers=hd,body=json.dumps({'days':{},'pages':[]}))
with sync_playwright() as p:
    for w,h in((1024,768),(820,1180)):
        t=f'[{w}px] '
        b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True)
        ctx.add_init_script('window.__seed='+json.dumps(seed)+';')
        for n,body in(('app',mock),('auth',''),('firestore','')):
            ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
        ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
        ctx.route(re.compile(r'workers\.dev'),worker)
        pg=ctx.new_page(); errs=[]
        pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'fonts' not in m.text and 'ERR_' not in m.text and 'Failed to load' not in m.text else None)
        pg.goto(f'http://127.0.0.1:{port}/heute.html'); pg.wait_for_selector('#jv-orb',timeout=20000); pg.wait_for_selector('.chip[data-b]',timeout=15000); pg.wait_for_timeout(2500)
        def say(txt,wait=3200):
            pg.evaluate("Jarvis.open()"); pg.wait_for_timeout(500); pg.fill('#jv-in',txt); pg.press('#jv-in','Enter'); pg.wait_for_timeout(wait)
        def chip(bid): return pg.get_attribute(f'.chip[data-b={bid}]','aria-pressed')
        # 1 Gewohnheit: Bestätigung erscheint, noch nichts gespeichert
        ck(t+'Kalte Dusche anfangs aus',chip('dusche')=='false')
        say('CALL set_habit {"button":"Kalte Dusche"}')
        ck(t+'Bestätigung erscheint mit Klartext','Kalte Dusche' in pg.inner_text('#jv-confirm .t') and pg.locator('#jv-confirm.on').count()==1,pg.inner_text('#jv-confirm .t'))
        ck(t+'Vor der Bestätigung nichts geändert',chip('dusche')=='false')
        ck(t+'Werkzeuge an die KI geschickt',any(any(x['name']=='set_habit' for x in (bd.get('tools') or [])) for bd in S['bodies']))
        pg.screenshot(path=f'{shots}/actions_{w}_confirm.png')
        pg.tap('#jv-yes'); pg.wait_for_timeout(1500)
        ck(t+'Nach Bestätigung eingetragen (Heute-Knopf an)',chip('dusche')=='true')
        ck(t+'Ergebnis wird gemeldet','Eingetragen' in pg.inner_text('#jv-say'),pg.inner_text('#jv-say'))
        # 2 Abbrechen per Wort
        say('CALL set_habit {"button":"Kalte Dusche","value":"aus"}'); pg.fill('#jv-in','nein'); pg.press('#jv-in','Enter'); pg.wait_for_timeout(900)
        ck(t+'Abbrechen per "nein" ändert nichts',chip('dusche')=='true')
        # 3 Bestätigen per Wort ja
        say('CALL set_habit {"button":"Kalte Dusche","value":"aus"}'); pg.fill('#jv-in','ja'); pg.press('#jv-in','Enter'); pg.wait_for_timeout(1500)
        ck(t+'Bestätigen per "ja" setzt zurück',chip('dusche')=='false')
        # 4 Rückfrage bei fehlender Angabe
        say('CALL set_habit {"button":"Krafttraining"}')
        ck(t+'Rückfrage nach Dauer statt Raten','Wie lange' in pg.inner_text('#jv-say') and pg.locator('#jv-confirm.on').count()==0,pg.inner_text('#jv-say'))
        say('CALL set_habit {"button":"Krafttraining","value":"37"}')
        ck(t+'Ungültige Stufe wird nachgefragt','nur 30' in pg.inner_text('#jv-say'),pg.inner_text('#jv-say'))
        say('CALL set_habit {"button":"Krafttraining","value":"60"}'); pg.tap('#jv-yes'); pg.wait_for_timeout(1500)
        ck(t+'Krafttraining 60 Min eingetragen',chip('kraft')=='true' or pg.inner_text('.chip[data-b=kraft]').find('60')>=0,pg.inner_text('.chip[data-b=kraft]'))
        say('CALL set_habit {"button":"Quatschknopf","value":"an"}')
        ck(t+'Unbekannter Knopf: klare Meldung','gibt es in Heute nicht' in pg.inner_text('#jv-say'),pg.inner_text('#jv-say'))
        # 5 Einstellung
        say('CALL set_setting {"name":"sprachausgabe","value":false}')
        ck(t+'Einstellung wird erst nach Bestätigung geändert',pg.evaluate('LBUI.settings.speak')==True)
        pg.tap('#jv-yes'); pg.wait_for_timeout(600)
        ck(t+'Einstellung geändert',pg.evaluate('LBUI.settings.speak')==False)
        pg.evaluate("LBUI.setSetting('speak',true)")
        # 6 normale Frage ohne Aktion
        say('Wie war meine Woche?'); ck(t+'Normale Frage bleibt normale Antwort','Normale Antwort' in pg.inner_text('#jv-say'))
        # 7 Seitenwechsel durch Funktion
        say('CALL navigate {"tab":"recovery"}',wait=3500)
        ck(t+'Reiterwechsel per Sprachbefehl','recovery.html' in pg.url,pg.url)
        # 8 Aktion auf anderer Seite: Puzzle-Ergebnis
        pg.wait_for_selector('#jv-orb',timeout=20000); pg.wait_for_timeout(1500)
        say('CALL set_puzzle {"game":"Krillion","score":650}'); ck(t+'Puzzle: Bestätigung mit Klartext','Krillion' in pg.inner_text('#jv-confirm .t') and '650' in pg.inner_text('#jv-confirm .t'),pg.inner_text('#jv-confirm .t'))
        pg.tap('#jv-yes'); pg.wait_for_url(re.compile('puzzle.html'),timeout=10000); pg.wait_for_selector('#form .row[data-g=krl] input',timeout=20000)
        try: pg.wait_for_function("document.querySelector('#form .row[data-g=krl] input').value==='650'",timeout=25000)
        except Exception: pass
        pg.wait_for_timeout(2500)
        ck(t+'Puzzle: Krillion 650 eingetragen (nach Seitenwechsel)',pg.input_value('#form .row[data-g=krl] input')=='650',pg.input_value('#form .row[data-g=krl] input'))
        ck(t+'Puzzle: Rückmeldung von Jarvis','Krillion' in pg.inner_text('#jv-say'),pg.inner_text('#jv-say'))
        pg.screenshot(path=f'{shots}/actions_{w}_puzzle.png')
        pg.evaluate("document.querySelectorAll('.msoverlay').forEach(o=>{o.classList.remove('on','open','show');o.style.display='none'})"); pg.wait_for_timeout(300)
        say('CALL set_puzzle {"game":"Krillion","score":900}'); pg.tap('#jv-yes'); pg.wait_for_timeout(1500)
        ck(t+'Puzzle: unmöglicher Score wird abgelehnt','0 bis 700' in pg.inner_text('#jv-say'),pg.inner_text('#jv-say'))
        ck(t+'Keine Konsolenfehler',not errs,errs[:3])
        b.close()
print('FEHLER:',fails)
