"""Browsertest für heute.html (Chromium, iPad-Breiten 1024 und 820): Firebase-Mock, Worker-Mock mit Whoop-Testdaten,
echte Puzzle-Daten aus der Sicherung. Aufruf: python3 tools/browser/test_heute.py <puzzle-sicherung.json> <screenshot-ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..'))
back=json.load(open(sys.argv[1])); shots=sys.argv[2]; os.makedirs(shots,exist_ok=True)
seed={}
seed['users/u1/days/2026-10-14']={'date':'2026-10-14','rulesVersion':1,'a':{'MOR-01':1},'puz':330,'net':390,'rank':'C','closed':False,'focus':'','updatedAt':1}
for d,v in back['days'].items(): seed['users/u1/puzzle/'+d]=v
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
# Whoop-Testdaten: 7 gelbe Vortage (HRV 70, Ruhepuls 55), heute grün mit gutem Schlaf und einer Spinning-Einheit (62 Min)
H=3600000
whoop={}
for i in range(7,14):
    whoop['2026-10-%02d'%i]={'recovery':{'score':{'recovery_score':60,'hrv_rmssd_milli':70,'resting_heart_rate':55}},'cycle':{'score':{'strain':10.0},'steps':5000},'workouts':[]}
whoop['2026-10-14']={
 'recovery':{'score':{'recovery_score':72,'hrv_rmssd_milli':85,'resting_heart_rate':50}},
 'sleep':{'start':'2026-10-13T20:30:00.000Z','end':'2026-10-14T06:30:00.000Z','tz':'+02:00','nap':False,'score':{
   'sleep_performance_percentage':100,'sleep_consistency_percentage':85,'sleep_efficiency_percentage':92,
   'stage_summary':{'total_light_sleep_time_milli':int(4*H),'total_slow_wave_sleep_time_milli':int(2.5*H),'total_rem_sleep_time_milli':int(2.5*H)}}},
 'cycle':{'score':{'strain':11.5},'steps':9000},
 'workouts':[{'sport':'spinning','start':'2026-10-14T08:00:00.000Z','end':'2026-10-14T09:02:00.000Z','score':{'strain':13.0,'zone_durations':{}}}]}
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{port}/heute.html'
res=[];fails=0
def ck(name,cond,extra=''):
    global fails
    res.append(('ok ' if cond else 'FEHLER ')+name+(' '+str(extra) if extra!='' else ''))
    if not cond: fails+=1
def val(t): return int(re.sub(r'[^\d−-]','',t).replace('−','-'))
def run(p,w,h):
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True,accept_downloads=True)
    ctx.add_init_script('window.__seed='+json.dumps(seed)+';')
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    state={'syncs':0,'fail':False}
    def worker(r):
        u=r.request.url
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if state['fail']: return r.fulfill(status=500,headers=hd,body='{"error":"Worker kaputt"}')
        if '/sync' in u: state['syncs']+=1; return r.fulfill(headers=hd,body='{"ok":true}')
        return r.fulfill(headers=hd,body=json.dumps({'days':whoop}))
    ctx.route(re.compile(r'life-board-whoop\.momo-haskamp\.workers\.dev'),worker)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:(errs.append(m.text) if m.type=='error' else None) or (print('LOG',m.text[:300]) if 'PERSIST' in m.text else None))
    pg.clock.set_fixed_time('2026-10-14T12:00:00+02:00')
    pg.goto(URL); pg.wait_for_selector('.chip[data-b]'); pg.wait_for_function("document.getElementById('whState').textContent==='verbunden'")
    t=f'[{w}px] '
    ck(t+'keine Konsolenfehler',not [e for e in errs if 'TUNNEL' not in e],errs[:2])
    ck(t+'kein Seitwärtsscrollen',pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth'))
    ck(t+'Alter v1-Tag wurde auf v2 umgestellt, Altwert gesichert',pg.evaluate('window.__store["users/u1/days/2026-10-14"].legacyV1!==undefined'))
    n=pg.locator('.chip[data-b]').count(); ck(t+'höchstens 30 Tipp-Knöpfe',n<=30,n)
    fx=' '.join(pg.inner_text('#facts').split()); ck(t+'Whoop-Fakten sichtbar','Recovery 72 %' in fx and 'spinning 62 Min' in fx,fx[:90])
    wl=pg.inner_text('#whList')
    ck(t+'Whoop-Punkte automatisch da (Schlaf/Recovery/HRV/Spinning)',all(x in wl for x in('SLP-02','SLP-16','SLP-15','SLP-19','SLP-20','SLP-21','REC-01','REC-04','REC-05','SPB-02','SPB-05')),wl.count('\n'))
    ck(t+'Strain/Schritte heute noch nicht gezählt','STR-' not in wl and 'SPU-' not in wl)
    ck(t+'Zielzeit-Hinweis ohne Zielzeit','Zielzeit' in pg.inner_text('#whNote'))
    base=val(pg.inner_text('#netTop'))
    ck(t+'Start = Whoop (4.500+2.525) + Puzzle 330',base==7355,base)
    ck(t+'Spinning-Knopf kommt von Whoop, nicht tippbar',pg.inner_text('.chip[data-b="spinning"] .st')=='Whoop: 62 Min')
    pg.tap('.chip[data-b="spinning"]'); ck(t+'Tippen auf Whoop-Knopf ändert nichts',val(pg.inner_text('#netTop'))==base)
    # Zielzeit
    pg.fill('#bt','22:15'); pg.wait_for_timeout(400)
    ck(t+'Zielzeit: Bettzeit-Punkte (SLP-09 +750)','SLP-09' in pg.inner_text('#whList') and val(pg.inner_text('#netTop'))==base+750,pg.inner_text('#netTop'))
    base+=750
    pg.screenshot(path=f'{shots}/heute-{w}-start.png')
    # Krafttraining: Minuten durchtippen
    exp=[(30,1750),(45,1950),(60,2250),(90,2250)]
    ok=True
    for m,pts in exp:
        pg.tap('.chip[data-b="kraft"]'); cur=val(pg.inner_text('#netTop'))
        if cur!=base+pts or ('%d Min'%m) not in pg.inner_text('.chip[data-b="kraft"] .st'): ok=False; print('kraft',m,cur-base)
    ck(t+'Krafttraining: Minuten durchschalten (30/45/60/90) mit Punkten',ok)
    pg.tap('.chip[data-b="kraft"]'); ck(t+'Krafttraining: fünftes Tippen = aus',val(pg.inner_text('#netTop'))==base)
    pg.wait_for_timeout(300)
    st=pg.evaluate('window.__store["users/u1/days/2026-10-14"]')
    ck(t+'Tagesdokument gespeichert (v2, Eingaben, Netto)',st['rulesVersion']==2 and st['net']==base and st['in']=={} ,{k:st[k] for k in('rulesVersion','net','in')})
    # Auswahl-Knopf und Zähler
    pg.tap('.chip[data-b="alkohol"]'); ck(t+'Alkohol: 1–2 Getränke −600',val(pg.inner_text('#netTop'))==base-600)
    for _ in range(4): pg.tap('.chip[data-b="alkohol"]')
    ck(t+'Alkohol: nach der letzten Stufe aus',val(pg.inner_text('#netTop'))==base)
    for _ in range(5): pg.tap('.chip[data-b="suess"]')
    ck(t+'Süßigkeiten: Maximum 3 → −675',pg.inner_text('.chip[data-b="suess"] .st')=='3 / 3' and val(pg.inner_text('#netTop'))==base-675)
    for _ in range(3): pg.tap('[data-minus="suess"]')
    ck(t+'Süßigkeiten: Minus-Knopf bis 0',val(pg.inner_text('#netTop'))==base)
    pg.wait_for_timeout(300)
    ck(t+'Speicherstatus bestätigt','gespeichert' in pg.inner_text('#save'),pg.inner_text('#save'))
    ck(t+'Konto-Dokument state/current geschrieben',pg.evaluate('window.__store["users/u1/state/current"]!==undefined'))
    # Level-Aufstieg (Level 2 → 3 ab 15.000): Start 8.105
    ck(t+'Level 2 am Anfang',pg.inner_text('#hLvl')=='Level 2',pg.inner_text('#hLvl'))
    for k,times in(('kraft',3),('lernblock',3),('thema',1),('wdh',3),('morgen',1)):
        for _ in range(times): pg.tap(f'.chip[data-b="{k}"]')
    pg.wait_for_selector('#ov:not([hidden]) .lvlup',timeout=3000)
    ck(t+'Level-Aufstieg-Animation erscheint',True)
    pg.screenshot(path=f'{shots}/heute-{w}-levelup.png')
    pg.tap('#ov'); pg.wait_for_timeout(200)
    ck(t+'Level 3',pg.inner_text('#hLvl')=='Level 3',pg.inner_text('#hLvl'))
    pg.screenshot(path=f'{shots}/heute-{w}-viel.png')
    # Schreibfehler: lokale Sicherung + Meldung
    pg.evaluate('window.__failWrites=true'); pg.tap('.chip[data-b="dusche"]'); pg.wait_for_timeout(500)
    ck(t+'Schreibfehler: rote Meldung + NICHT gespeichert','Nicht gespeichert' in pg.inner_text('#msg') and 'NICHT' in pg.inner_text('#save'),pg.inner_text('#save'))
    ck(t+'Schreibfehler: lokal gesichert',pg.evaluate("Object.keys(JSON.parse(localStorage.getItem('lb_pending_days_u1')||'{}')).includes('2026-10-14')"))
    pg.evaluate('window.__failWrites=false')
    pg.reload(); pg.wait_for_selector('.chip[data-b]'); pg.wait_for_function("document.getElementById('whState').textContent==='verbunden'"); pg.wait_for_timeout(500)
    ck(t+'Nach Reload: lokale Eingabe erneut gesendet (Dusche im Server-Speicher)',pg.evaluate('window.__store["users/u1/days/2026-10-14"].in.dusche')==1)
    ck(t+'Nach Reload: Dusche noch an','on' in pg.get_attribute('.chip[data-b="dusche"]','class'))
    # Whoop fällt aus, Tag noch offen: Punkte dürfen nicht verschwinden
    open_net=pg.inner_text('#netTop'); acc=pg.inner_text('#hAcc')
    state['fail']=True; pg.reload(); pg.wait_for_selector('.chip[data-b]'); pg.wait_for_function("document.getElementById('whState').textContent==='nicht erreichbar'")
    ck(t+'Whoop aus, Tag offen: Punkte und Konto bleiben (gespeicherter Whoop-Stand)',pg.inner_text('#netTop')==open_net and pg.inner_text('#hAcc')==acc,(open_net,pg.inner_text('#netTop'),acc,pg.inner_text('#hAcc')))
    state['fail']=False; pg.reload(); pg.wait_for_selector('.chip[data-b]'); pg.wait_for_function("document.getElementById('whState').textContent==='verbunden'")
    # Firestore-Lesen verboten/kaputt: Seite zeigt trotzdem Knöpfe, Punkte und Zielzeit aus dem lokalen Stand
    pg.evaluate("localStorage.setItem('__failreads','1')"); pg.reload(); pg.wait_for_selector('.chip[data-b]')
    pg.wait_for_function("document.getElementById('diag').textContent.includes('✗ Tage')")
    ck(t+'Lesen verboten: Knöpfe + Punkte + Konto bleiben (lokaler Stand)',pg.locator('.chip[data-b]').count()==28 and pg.inner_text('#netTop')==open_net and pg.inner_text('#hAcc')==acc,(open_net,pg.inner_text('#netTop')))
    ck(t+'Lesen verboten: Zielzeit bleibt eingetragen',pg.input_value('#bt')=='22:15',pg.input_value('#bt'))
    ck(t+'Lesen verboten: klare Meldung','Tage konnten nicht geladen werden' in pg.inner_text('#msg'))
    pg.evaluate("localStorage.removeItem('__failreads')"); pg.reload(); pg.wait_for_selector('.chip[data-b]'); pg.wait_for_function("document.getElementById('whState').textContent==='verbunden'")
    ck(t+'Zielzeit nach Reload noch da (Server)',pg.input_value('#bt')=='22:15')
    # Zurückkehren nach App-Wechsel: Seite startet sauber neu, nichts geht verloren
    pg.evaluate("window.__marker=1; window.scrollTo(0,700)"); before_net=pg.inner_text('#netTop'); before_acc=pg.inner_text('#hAcc')
    pg.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'))")
    pg.clock.set_fixed_time('2026-10-14T12:01:00+02:00')
    pg.evaluate("Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_function("window.__marker===undefined"); pg.wait_for_selector('.chip[data-b]'); pg.wait_for_function("document.getElementById('whState').textContent==='verbunden'")
    ck(t+'Rückkehr nach Pause: Neustart, gleiche Punkte und gleiches Konto',pg.inner_text('#netTop')==before_net and pg.inner_text('#hAcc')==before_acc,(before_net,pg.inner_text('#netTop')))
    ck(t+'Rückkehr nach Pause: Scrollposition wiederhergestellt',pg.evaluate('window.scrollY')>300,pg.evaluate('window.scrollY'))
    pg.evaluate("document.getElementById('grid').innerHTML=''"); pg.evaluate("window.__marker=2")
    pg.evaluate("document.dispatchEvent(new Event('visibilitychange'))")
    pg.wait_for_function("window.__marker===undefined"); pg.wait_for_selector('.chip[data-b]')
    ck(t+'Leere Seite wird beim Zurückkehren selbst repariert',pg.locator('.chip[data-b]').count()==28)
    # Startseite zeigt das Konto
    hub=ctx.new_page(); hub.goto(URL.replace('heute.html','index.html')); hub.wait_for_function("document.getElementById('dopTxt').textContent.includes('Dopamin insgesamt')",timeout=8000)
    ck(t+'Startseite zeigt Konto + Level + heute',all(x.lower() in hub.inner_text('#dopTxt').lower() for x in('Level 3','Heute (14.10.)','Rang')),hub.inner_text('#dopTxt').replace('\n',' '))
    hub.screenshot(path=f'{shots}/hub-{w}.png'); hub.close()
    # Tagesabschluss
    before=val(pg.inner_text('#netTop'))
    pg.fill('#focus','Latein wiederholen'); pg.tap('#closeBtn'); pg.wait_for_selector('#ov:not([hidden]) .sum')
    st=pg.evaluate('window.__store["users/u1/days/2026-10-14"]')
    ck(t+'Abschluss: Schritte (+300) + Tagesabschluss (+600) + Fokus (+375)',st['closed'] and st['net']==before+300+600+375,(st['net'],before))
    ck(t+'Abschluss: Whoop-Stand eingefroren',st['auto'].get('SPU-11')==1 and st['auto'].get('SPB-02')==1 and st['x']=={'ABD-01':1,'ABD-02':1})
    pg.screenshot(path=f'{shots}/heute-{w}-abschluss.png')
    pg.evaluate("document.getElementById('ov').hidden=true")
    netc=pg.inner_text('#netTop')
    # Whoop fällt aus: abgeschlossener Tag bleibt unverändert
    state['fail']=True; pg.reload(); pg.wait_for_selector('.chip[data-b]'); pg.wait_for_function("document.getElementById('whState').textContent==='nicht erreichbar'")
    ck(t+'Whoop aus: abgeschlossener Tag unverändert',pg.inner_text('#netTop')==netc,(netc,pg.inner_text('#netTop')))
    ck(t+'Whoop aus: Hinweis sichtbar','nicht erreichbar' in pg.inner_text('#whNote'))
    state['fail']=False; pg.tap('#whRefresh'); pg.wait_for_function("document.getElementById('whState').textContent==='verbunden'")
    ck(t+'Whoop jetzt aktualisieren ruft /sync',state['syncs']>=1)
    # Folgetag
    pg.clock.set_fixed_time('2026-10-15T10:00:00+02:00'); pg.reload(); pg.wait_for_selector('.chip[data-b]'); pg.wait_for_function("document.getElementById('whState').textContent==='verbunden'")
    ck(t+'Folgetag: Fokus von gestern','Latein wiederholen' in pg.inner_text('#yFocus'))
    ck(t+'Folgetag: Konto enthält Vortag',pg.inner_text('#hLvl')=='Level 3')
    ck(t+'Folgetag: Hinweis noch keine Whoop-Daten','noch keine' in pg.inner_text('#whNote'),pg.inner_text('#whNote')[:60])
    pg.screenshot(path=f'{shots}/heute-{w}-folgetag.png')
    # Vortag zeigt Strain-Punkte (Tag vorbei, kein Abschluss nötig): 13.10. gelb + Strain 10
    pg.tap('#prev'); pg.tap('#prev'); pg.wait_for_timeout(300)
    ck(t+'Vergangener Tag (13.10.): Strain-Punkte STR-04 automatisch','STR-04' in pg.inner_text('#whList'),pg.inner_text('#whList')[:80])
    # 03:59 gehört zum Vortag
    pg.clock.set_fixed_time('2026-10-15T03:59:00+02:00'); pg.reload(); pg.wait_for_selector('.chip[data-b]')
    ck(t+'03:59 Uhr zählt noch zum 14.10.',pg.inner_text('#dt').startswith('Mi, 14.10.'))
    # Export
    with pg.expect_download() as dl: pg.tap('#exportBtn')
    d=json.load(open(dl.value.path()))
    ck(t+'Export enthält Tage, Regelwerk v2, Zielzeit',d['app']=='life-board-heute' and '2026-10-14' in d['days'] and '2' in d['rules'] and d['settings'].get('bedtimeTarget')=='22:15',list(d['days']))
    # Maße
    small=pg.evaluate('Math.min(...[...document.querySelectorAll(".chip[data-b]")].map(e=>e.getBoundingClientRect().height))')
    ck(t+'Knöpfe mindestens 44px hoch',small>=44,round(small))
    small=pg.evaluate('Math.min(...[...document.querySelectorAll("button")].filter(b=>b.offsetParent&&!b.classList.contains("minus")).map(e=>e.offsetHeight))')
    ck(t+'Buttons mindestens 44px',small>=44,[round(small),pg.evaluate('(()=>{const b=[...document.querySelectorAll("button")].filter(b=>b.offsetParent&&!b.classList.contains("minus")).sort((a,c)=>a.getBoundingClientRect().height-c.getBoundingClientRect().height)[0];return b.id+"|"+b.className+"|"+b.textContent.slice(0,20)})()')])
    b.close()
with sync_playwright() as p:
    for w,h in((1024,768),(820,1180)):
        try: run(p,w,h)
        except Exception as ex: print('ABBRUCH',w,str(ex)[:200]); fails+=1; break
print('\n'.join(res)); print('\n%d Fehler'%fails if fails else '\nALLE OK'); sys.exit(1 if fails else 0)
