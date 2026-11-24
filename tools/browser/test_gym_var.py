"""Browsertest Gym-Logbuch: Varianten (z. B. Incline Curls oder Hammer Curls an derselben Stelle im Pull-Workout).
Prüft: abwechselnd vorbelegt, Umschalten per Tippen mit eigenen Werten, getrennt gespeichert und gezählt, Variante anlegen/entfernen
und im Workout speichern, „Wie zuletzt“, Trainingsplan-Start. Handy, iPad, Dschungel. Aufruf: python3 tools/browser/test_gym_var.py <ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1] if len(sys.argv)>1 else '/tmp/gymvar'; os.makedirs(shots,exist_ok=True)
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
DAY=86400000; T0=1789142400000   # 11.09.2026
def S(i,d,k,n,w): return {'i':i,'d':d,'t':T0+k*DAY,'m':50,'x':7,'n':'','p':'Pull','e':[{'n':'Klimmzüge','s':[{'w':0,'r':8}]},{'n':n,'s':[{'w':w,'r':10},{'w':w,'r':9}]}]}
sess=[S('a','2026-10-20',39,'Incline Curls',12),S('b','2026-10-24',43,'Hammer Curls',16)]
SEED={'users/u1/training/gym_2026':{'list':sess},'users/u1/training/settings':{'workouts':[{'id':'wp','name':'Pull','ex':['Klimmzüge','Incline Curls'],'alt':{'Incline Curls':['Hammer Curls']}},{'id':'wr','name':'Rücken','ex':['Rudern']}]}}
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
    pg.tap('#gymBox [data-a=wst][data-id=wp]'); pg.wait_for_timeout(200)
    ck(t+'Pull startet mit der Variante, die länger her ist (Incline)',names()==['Klimmzüge','Incline Curls'],names())
    chips=pg.eval_on_selector_all('#gymBox .gx[data-i="1"] .gvar [data-a=var]',"x=>x.map(e=>e.textContent+'|'+e.getAttribute('aria-pressed'))")
    ck(t+'Auswahl Incline/Hammer sichtbar',chips==['✓ Incline Curls|true','Hammer Curls|false'],chips)
    ck(t+'Vorbelegt mit Incline-Werten',pg.input_value('#gymBox input[data-i="1"][data-j="0"][data-f="w"]')=='12')
    pg.fill('#gymBox input[data-i="1"][data-j="0"][data-f="r"]','11')
    pg.tap('#gymBox .gx[data-i="1"] [data-a=var][data-v="1"]'); pg.wait_for_timeout(150)
    ck(t+'Antippen wechselt auf Hammer mit Hammer-Werten',names()[1]=='Hammer Curls' and pg.input_value('#gymBox input[data-i="1"][data-j="0"][data-f="w"]')=='16')
    ck(t+'Letztes Mal zeigt Hammer',re.search(r'Letztes Mal.*16×10',pg.inner_text('#gymBox .gx[data-i="1"]')) is not None)
    pg.tap('#gymBox .gx[data-i="1"] [data-a=var][data-v="0"]'); pg.wait_for_timeout(150)
    ck(t+'Zurück auf Incline: Eingabe bleibt erhalten',names()[1]=='Incline Curls' and pg.input_value('#gymBox input[data-i="1"][data-j="0"][data-f="r"]')=='11')
    pg.tap('#gymBox .gx[data-i="1"] [data-a=var][data-v="1"]'); pg.wait_for_timeout(150)
    if shots: pg.locator('#gymBox .gx[data-i="1"]').scroll_into_view_if_needed(); pg.screenshot(path=f'{shots}/var_{tag}{"_"+theme if theme else ""}.png',full_page=False)
    ck(t+'Kein Seitwärtsscroll',pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
    small=pg.eval_on_selector_all('#gymBox .gvar .chip,#gymBox [data-a=valt]',"x=>x.filter(e=>e.getBoundingClientRect().height<36).length")
    ck(t+'Varianten-Knöpfe groß genug zum Tippen',small==0,small)
    pg.fill('#gymBox input[data-i="1"][data-j="0"][data-f="w"]','18')
    pg.tap('#gSave'); pg.wait_for_timeout(700)
    L=st('users/u1/training/gym_2026')['list']; last=max(L,key=lambda s:s['t'])
    ck(t+'Gespeichert unter Hammer Curls, nichts ausgelassen',[e['n'] for e in last['e']]==['Klimmzüge','Hammer Curls'] and not last.get('k'),[last.get('e'),last.get('k')])
    ck(t+'Workout bleibt Incline mit Variante Hammer',st('users/u1/training/settings')['workouts'][0].get('alt')=={'Incline Curls':['Hammer Curls']} and st('users/u1/training/settings')['workouts'][0]['ex']==['Klimmzüge','Incline Curls'])
    pg.tap('#gymBox [data-a=sel][data-k="hammer curls"]'); pg.wait_for_timeout(200)
    ck(t+'Fortschritt Hammer getrennt (Bestwert 18 kg)','18 kg' in pg.inner_text('#gymBox .gt'))
    pg.tap('#gymBox [data-a=sel][data-k="incline curls"]'); pg.wait_for_timeout(200)
    ck(t+'Fortschritt Incline unverändert (12 kg)','12 kg' in pg.inner_text('#gymBox .gt'))
    # Wie zuletzt: dieselbe Variante, Auswahl bleibt möglich
    pg.tap('#gymBox [data-a=again]'); pg.wait_for_timeout(200)
    ck(t+'Wie zuletzt: Hammer, mit Auswahl',names()==['Klimmzüge','Hammer Curls'] and pg.locator('#gymBox .gvar [data-a=var]').count()==2)
    pg.tap('#gDrop'); pg.wait_for_timeout(150)
    pg.tap('#gymBox [data-a=wst][data-id=wp]'); pg.wait_for_timeout(200)
    ck(t+'Nächstes Pull: wieder Incline dran',names()==['Klimmzüge','Incline Curls'],names())
    # Variante hinzufügen und wieder entfernen (wird im Workout gespeichert)
    pg.tap('#gymBox .gx[data-i="1"] [data-a=valt]'); pg.wait_for_timeout(150)
    pg.fill('#gVar','Spider Curls'); pg.tap('#gymBox [data-a=vadd][data-i="1"]'); pg.wait_for_timeout(400)
    ck(t+'Neue Variante im Workout gespeichert',st('users/u1/training/settings')['workouts'][0].get('alt')=={'Incline Curls':['Hammer Curls','Spider Curls']})
    ck(t+'Drei Varianten zur Auswahl',pg.locator('#gymBox .gx[data-i="1"] .gvar [data-a=var]').count()==3)
    pg.tap('#gymBox .gx[data-i="1"] [data-a=valt]'); pg.wait_for_timeout(150)
    pg.tap('#gymBox [data-a=vdel][data-n="Spider Curls"]'); pg.wait_for_timeout(400)
    ck(t+'Variante entfernt und gespeichert',st('users/u1/training/settings')['workouts'][0].get('alt')=={'Incline Curls':['Hammer Curls']})
    # Variante bei einer Übung ohne Varianten anlegen (Rücken: Rudern → Kabelrudern)
    pg.tap('#gDrop'); pg.wait_for_timeout(150); pg.tap('#gymBox [data-a=wst][data-id=wr]'); pg.wait_for_timeout(200)
    ck(t+'Ohne Varianten keine Auswahl',pg.locator('#gymBox .gvar').count()==0)
    pg.tap('#gymBox .gx[data-i="0"] [data-a=valt]'); pg.fill('#gVar','Kabelrudern'); pg.tap('#gymBox [data-a=vadd][data-i="0"]'); pg.wait_for_timeout(400)
    ck(t+'Erste Variante angelegt',st('users/u1/training/settings')['workouts'][1].get('alt')=={'Rudern':['Kabelrudern']} and pg.locator('#gymBox .gvar [data-a=var]').count()==2)
    pg.tap('#gDrop'); pg.wait_for_timeout(150)
    # Aus dem Trainingsplan gestartet (TrainingGym.start mit Sätzen): Variante gewählt, Satzzahl vom Plan
    pg.evaluate("TrainingGym.start({plan:'Pull',date:'2026-10-28',ex:[{n:'Klimmzüge',sets:3},{n:'Incline Curls',sets:4}]})"); pg.wait_for_timeout(250)
    ck(t+'Plan-Start: Variante gewählt, Satzzahl übernommen',names()==['Klimmzüge','Incline Curls'] and pg.locator('#gymBox .gx[data-i="1"] .gs').count()==4,names())
    pg.tap('#gDrop'); pg.wait_for_timeout(150)
    ck(t+'Keine Seitenfehler',not errs,errs)
    b.close()
with sync_playwright() as p:
    run(p,390,844,'handy'); run(p,1024,1366,'ipad'); run(p,390,844,'handy','jungle')
print('alles ok' if not fails else f'{fails} FEHLER'); sys.exit(1 if fails else 0)
