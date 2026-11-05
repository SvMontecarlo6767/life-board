"""Browsertest Trainingsplan (plan.js) im Reiter Training: Startplan, Bearbeiten per Touch, Versionen, Fehler, beide Designs, Handy und iPad.
Aufruf: python3 tools/browser/test_plan.py <screenshot-ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1]; os.makedirs(shots,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{port}/training.html'
fails=0
def ck(n,c,x=''):
    global fails
    print(('ok     ' if c else 'FEHLER ')+n+(' '+str(x) if x!='' else ''),flush=True)
    if not c: fails+=1
SEED={'users/u1/training/settings':{'workouts':[{'id':'w1','name':'Pull','ex':['Klimmzüge','Face Pulls','Hanging Leg Raise']}]}}
def ctx_for(b,w,h,seed,theme=None):
    ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=w<500)
    ctx.add_init_script('window.__seed=%s;'%json.dumps(seed)+("localStorage.setItem('lb_ui',JSON.stringify({theme:'%s'}));"%theme if theme else ''))
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    def worker(r):
        hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if '/strava/status' in r.request.url: return r.fulfill(headers=hd,body=json.dumps({'configured':False}))
        return r.fulfill(headers=hd,body='{}')
    ctx.route(re.compile(r'workers\.dev'),worker)
    return ctx
def page(ctx):
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'about:blank' not in m.text else None)
    pg.on('dialog',lambda d:d.accept())
    pg.clock.set_fixed_time('2026-11-05T09:00:00+01:00')   # Donnerstag
    pg.goto(URL); pg.wait_for_function('window.__planReady===true',timeout=20000); pg.wait_for_function('window.__trainingReady===true',timeout=20000); pg.wait_for_timeout(400)
    return pg,errs
def noscroll(pg): return pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1')
def small_targets(pg):
    return pg.evaluate("""[...document.querySelectorAll('#planCard button, #planCard select, #planCard input')].filter(e=>e.offsetParent).filter(e=>{const r=e.getBoundingClientRect();return r.height<32||r.width<30}).map(e=>e.outerHTML.slice(0,80))""")
def run(p,w,h,tag,theme=None):
    t=f'[{tag}{"/"+theme if theme else ""}] '
    a=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']
    try: b=p.chromium.launch(args=a)
    except Exception: b=p.chromium.launch(args=a,executable_path=os.environ.get('PW_CHROMIUM','/opt/pw-browsers/chromium'))
    ctx=ctx_for(b,w,h,SEED,theme); pg,errs=page(ctx)
    txt=pg.inner_text('#planCard')
    ck(t+'Plan steht oben im Training (vor den Abschnitten)',pg.evaluate("document.getElementById('planCard').compareDocumentPosition(document.getElementById('mcontent'))&4")>0)
    ck(t+'Bestehende Allround-Ansicht läuft weiter',pg.is_visible('#mcontent') and pg.is_visible('#mSave'))
    ck(t+'Startplan-Hinweis, nichts gespeichert','Startplan übernehmen' in txt and not any('/plan/' in k for k in pg.evaluate('window.__store')))
    ck(t+'Heute = Donnerstag mit Haltung, evtl. Zone 2','Heute, Donnerstag: Haltungsübungen + (Zone-2-Spin oder nichts)' in txt,txt[:200])
    ck(t+'Pull aus deinem Gym-Workout vorbelegt (nur gelesen)',pg.evaluate("LBPlan.state.cur.units.find(u=>u.id==='pull').ex.map(e=>e.n).join()")=='Klimmzüge,Face Pulls,Hanging Leg Raise' and pg.evaluate("JSON.stringify(window.__store['users/u1/training/settings'].workouts)")==json.dumps(SEED['users/u1/training/settings']['workouts'],separators=(',',':'),ensure_ascii=False))
    ck(t+'Kein seitliches Scrollen',noscroll(pg))
    pg.tap('#planCard [data-a=day][data-d="0"]'); pg.wait_for_timeout(100); d=pg.inner_text('#planCard')
    ck(t+'Montag antippen zeigt Beintag mit Übungen','Nordic Curls' in d and 'so langsam wie möglich' in d and 'zuerst weglassen' in d and 'Kern' in d)
    pg.screenshot(path=f'{shots}/plan_{tag}{"_"+theme if theme else ""}_uebersicht.png',full_page=False)
    # übernehmen
    pg.tap('#planCard [data-a=adopt]'); pg.wait_for_timeout(300)
    st=pg.evaluate('window.__store'); v=st.get('users/u1/plan/v_2026-11-05')
    ck(t+'Startplan übernommen → Version ab heute',v is not None and v['from']=='2026-11-05' and len(v['units'])==9 and len(v['week'])==7)
    ck(t+'Hinweis weg, Fußzeile mit Version','Startplan übernehmen' not in pg.inner_text('#planCard') and 'Plan gilt seit 05.11.2026 · 1 Version' in pg.inner_text('#planCard'))
    # bearbeiten: Einheit Beine
    pg.tap('#planCard [data-a=edit]'); pg.tap('#planCard [data-a=tab][data-t=units]'); pg.tap('#planCard [data-a=uopen][data-u=beine]'); pg.wait_for_timeout(100)
    ck(t+'Einheiten-Editor offen (8 Übungen)',pg.locator('#planCard .pn-ed').count()==8)
    small=small_targets(pg); ck(t+'Alle Bedienelemente groß genug für Touch',not small,small[:3])
    ck(t+'Kein seitliches Scrollen im Editor',noscroll(pg))
    pg.screenshot(path=f'{shots}/plan_{tag}{"_"+theme if theme else ""}_editor.png',full_page=False)
    pg.tap('#planCard [data-a=sets][data-i="5"][data-d="1"]')                        # Nordics 2→3
    pg.tap('#planCard [data-a=prio][data-i="7"][data-p=weg]')                         # Waden → zuerst weglassen
    pg.tap('#planCard [data-a=exmv][data-i="3"][data-d="1"]')                         # Split Squat Jumps nach unten
    pg.fill('#planCard [data-ef=note][data-i="1"]','barfuß')                         # Notiz Pogo
    ck(t+'Ungespeichert-Hinweis',pg.inner_text('#pnDirty')=='Ungespeicherte Änderungen')
    pg.tap('#planCard [data-a=exadd]'); pg.fill('#planCard [data-ef=n][data-i="8"]','Tibialis Raises'); pg.fill('#planCard [data-ef=rest][data-i="8"]','45')
    pg.tap('#planCard [data-a=exdel][data-i="2"]')                                    # Box Jumps löschen
    ex=pg.evaluate("LBPlan.state.draft.units.find(u=>u.id==='beine').ex.map(e=>[e.n,e.sets,e.prio,e.rest,e.note])")
    ck(t+'Entwurf: Sätze, Priorität, Reihenfolge, Notiz, neue Übung, gelöscht',[e[0] for e in ex]==['Mobilisieren und Aufwärmen','Pogo Jumps','Bulgarian Split Squats','Split Squat Jumps','Nordic Curls','Reverse Nordics','Wadenheben','Tibialis Raises'] and ex[4][1]==3 and ex[6][2]=='weg' and ex[1][4]=='barfuß' and ex[7][3]==45,ex)
    # Woche: Do Zone-2-Alternative weg, Fr Isometrie dazu
    pg.tap('#planCard [data-a=tab][data-t=week]')
    pg.tap('#planCard [data-a=altdel][data-d="3"][data-s="1"][data-i="1"]')
    pg.select_option('#planCard select[data-a=slotadd][data-d="4"]','iso')
    pg.select_option('#planCard select[data-a=altadd][data-d="0"][data-s="1"]','')
    wk=pg.evaluate('LBPlan.state.draft.week')
    ck(t+'Woche: Alternative entfernt, Einheit dazu, „oder nichts“',wk[3]['slots'][1]['alts']==['z2'] and wk[4]['slots'][1]['alts']==['iso'] and wk[0]['slots'][1]['alts']==['haltung',''],wk[:5])
    ck(t+'Vorlage selbst noch unverändert',pg.evaluate("LBPlan.state.cur.units.find(u=>u.id==='beine').ex.length")==8)
    pg.tap('#planCard [data-a=save]'); pg.wait_for_timeout(300)
    st=pg.evaluate('window.__store'); v=st['users/u1/plan/v_2026-11-05']
    be=[u for u in v['units'] if u['id']=='beine'][0]
    ck(t+'Gespeichert (gleicher Tag = eine Version)',len([k for k in st if '/plan/v_' in k])==1 and len(be['ex'])==8 and be['ex'][4]['sets']==3 and v['week'][4]['slots'][1]['alts']==['iso'])
    ck(t+'Meldung „gilt ab heute“','gilt ab heute (Do, 05.11.2026)' in pg.inner_text('#planCard'))
    ck(t+'Freitag zeigt Isometrie',(pg.tap('#planCard [data-a=day][data-d="4"]') or True) and 'Hip Flexor Drive' in pg.inner_text('#planCard'))
    # Einstellungen
    pg.tap('#planCard [data-a=edit]'); pg.tap('#planCard [data-a=tab][data-t=set]'); pg.fill('#pnZ2lo','125'); pg.fill('#pnZ2hi','140'); pg.fill('#pnBudget','55'); pg.locator('#pnBudget').dispatch_event('change'); pg.locator('#pnZ2hi').dispatch_event('change'); pg.locator('#pnZ2lo').dispatch_event('change')
    pg.tap('#planCard [data-a=setsave]'); pg.wait_for_timeout(200)
    ck(t+'Einstellungen gespeichert',pg.evaluate('window.__store')['users/u1/plan/settings']=={'budget':55,'z2lo':125,'z2hi':140},pg.evaluate('window.__store').get('users/u1/plan/settings'))
    # Versionen
    pg.tap('#planCard [data-a=tab][data-t=ver]'); vt=pg.inner_text('#planCard')
    ck(t+'Versionsliste mit „gilt heute“','ab 05.11.2026' in vt and 'gilt heute' in vt)
    pg.tap('#planCard [data-a=cancel]')
    # Neu laden: alles da, Zone-2-Puls angezeigt
    pg.reload(); pg.wait_for_function('window.__planReady===true',timeout=20000)
    pg.tap('#planCard [data-a=day][data-d="1"]')
    ck(t+'Nach Neuladen: Plan + Puls 125–140','Puls 125–140 bpm' in pg.inner_text('#planCard') and 'Startplan' not in pg.inner_text('#planCard'))
    # Schreibfehler
    pg.evaluate('window.__failWrites=true'); pg.tap('#planCard [data-a=edit]'); pg.tap('#planCard [data-a=tab][data-t=units]'); pg.tap('#planCard [data-a=uopen][data-u=push]'); pg.tap('#planCard [data-a=sets][data-i="0"][data-d="1"]'); pg.tap('#planCard [data-a=save]'); pg.wait_for_timeout(200)
    ck(t+'Schreibfehler: klare Meldung zu den Regeln, Entwurf bleibt','Firestore lässt den Zugriff' in pg.inner_text('#pnMsg') and pg.evaluate('LBPlan.state.dirty'))
    ck(t+'Keine JS-Fehler',not errs,errs[:3])
    ctx.close()
    # leere Daten, Lesefehler
    ctx=ctx_for(b,w,h,{}); pg,errs=page(ctx)
    ck(t+'Leere Daten: Startplan mit Platzhaltern für Pull','Klimmzüge' in pg.evaluate("LBPlan.state.cur.units.find(u=>u.id==='pull').ex.map(e=>e.n).join()") and not errs,errs[:3])
    ctx.close()
    ctx=ctx_for(b,w,h,{}); ctx.add_init_script("localStorage.setItem('__failreads','1')"); pg=ctx.new_page(); e2=[]; pg.on('pageerror',lambda e:e2.append(str(e)))
    pg.goto(URL); pg.wait_for_function('window.__planReady===true',timeout=20000)
    ck(t+'Lesefehler: Meldung statt leerer Karte','Plan konnte nicht geladen werden' in pg.inner_text('#planCard') and not e2,e2[:2])
    ctx.close(); b.close()
with sync_playwright() as p:
    run(p,390,844,'handy'); run(p,1024,1366,'ipad'); run(p,390,844,'handy','jungle')
print('FEHLER: %d'%fails if fails else 'alle Tests ok'); sys.exit(1 if fails else 0)
