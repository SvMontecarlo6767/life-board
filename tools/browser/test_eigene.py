"""Browsertest: gespeicherte Gym-Einheit nachträglich bearbeiten (vergessene Übung ergänzen, nichts doppelt) und
eigene Einheit im Trainingsplan (z. B. Hyrox): Belastung aus Dauer × Anstrengung oder Whoop-Strain, ohne Whoop zusätzlich
ins Training-Logbuch (im Training über die Seite, im Check-in direkt), mit Whoop nur verknüpft, Entfernen löscht den Logbuch-Eintrag.
Aufruf: python3 tools/browser/test_eigene.py <screenshot-ordner>"""
import re, json, sys, os, threading, http.server, socketserver, functools, subprocess
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1] if len(sys.argv)>1 else '/tmp/eigene'; os.makedirs(shots,exist_ok=True)
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
VER=json.loads(subprocess.check_output(['node','-e',"const P=require('./plan-core.js');console.log(JSON.stringify(Object.assign(P.seed([]),{from:'2026-11-01',at:1})))"],cwd=root))
T0=1793872800000   # 4.11.2026 18:00 Berlin
GYM={'users/u1/training/gym_2026':{'list':[{'i':'x1','d':'2026-11-04','t':T0,'m':60,'x':7,'n':'','p':'Beine','e':[{'n':'Kniebeuge','s':[{'w':80,'r':8},{'w':80,'r':8}]}]}]},
     'users/u1/training/acts_2026':{'list':[{'i':'gx1','t':T0,'r':'Kraft','n':'Beine','s':3600,'x':7}]}}
def ctx_for(b,w,h,seed,whoop=None):
    ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=w<500)
    ctx.add_init_script('window.__seed=%s;'%json.dumps(seed))
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    def worker(r):
        hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if '/data' in r.request.url: return r.fulfill(headers=hd,body=json.dumps({'days':whoop or {}}))
        if '/strava/status' in r.request.url: return r.fulfill(headers=hd,body=json.dumps({'configured':False}))
        return r.fulfill(headers=hd,body='{}')
    ctx.route(re.compile(r'workers\.dev'),worker)
    return ctx
def page(ctx,url,ready):
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text else None)
    pg.on('dialog',lambda d:d.accept())
    pg.clock.set_fixed_time('2026-11-05T09:00:00+01:00')
    pg.goto(f'http://127.0.0.1:{port}/'+url)
    for r in ready: pg.wait_for_function(r,timeout=20000)
    pg.wait_for_timeout(500); return pg,errs
def settle(pg):
    for _ in range(80):
        pg.wait_for_timeout(100)
        if not pg.evaluate("[...document.querySelectorAll('#planCard [data-tmsg]')].some(e=>/speichert|trägt/.test(e.textContent))"): break
    pg.wait_for_timeout(150)
st=lambda pg,k: pg.evaluate('window.__store[%s]'%json.dumps(k))
def done_count(pg):
    m=re.search(r'(\d+) von (\d+)',pg.inner_text('#planCard .pn-wkt b')); return (int(m.group(1)),int(m.group(2))) if m else None
def own_form(pg,k,name=None,minutes=None,rpe=None,kind=None):
    pg.tap(f'#planCard [data-a=oopen][data-k="{k}"]'); pg.wait_for_timeout(150)
    if name: pg.fill('#planCard [data-of=n]',name)
    if kind: pg.select_option('#planCard select[data-of=kind]',kind)
    if minutes: pg.fill('#planCard [data-of=min]',str(minutes))
    if rpe: pg.tap(f'#planCard [data-a=orpe][data-r="{rpe}"]'); pg.wait_for_timeout(100)
with sync_playwright() as p:
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
    for w,h,tag in((390,844,'handy'),(1024,1366,'ipad')):
        t=f'[{tag}] '
        # ---------- 1) Gym-Einheit nachträglich bearbeiten ----------
        ctx=ctx_for(b,w,h,dict(GYM)); pg,errs=page(ctx,'training.html',['window.__trainingReady===true'])
        pg.locator('#gymBox details[data-id="x1"] summary').click(); pg.wait_for_timeout(150)
        pg.locator('#gymBox [data-a=editS][data-id="x1"]').click(); pg.wait_for_timeout(250)
        ck(t+'Bearbeiten öffnet die gespeicherte Einheit mit ihren Sätzen',pg.locator('#gymBox .gediting').count()==1 and pg.input_value('#gymBox input[data-i="0"][data-j="1"][data-f="r"]')=='8' and 'Änderungen speichern' in pg.inner_text('#gSave'))
        pg.fill('#gNew','Wadenheben'); pg.tap('#gAdd'); pg.wait_for_timeout(100)
        pg.fill('#gymBox input[data-i="1"][data-j="0"][data-f="w"]','40'); pg.fill('#gymBox input[data-i="1"][data-j="0"][data-f="r"]','15')
        pg.tap('#gSave'); pg.wait_for_timeout(700)
        g=st(pg,'users/u1/training/gym_2026')['list']; a=st(pg,'users/u1/training/acts_2026')['list']
        ck(t+'Speichern ersetzt die Einheit: gleiche ID, vergessene Übung drin, nichts doppelt',len(g)==1 and g[0]['i']=='x1' and [e['n'] for e in g[0]['e']]==['Kniebeuge','Wadenheben'] and len([x for x in a if x['i']=='gx1'])==1,(g,a))
        ck(t+'Meldung „Geändert“',pg.inner_text('#gMsg').startswith('Geändert'),pg.inner_text('#gMsg'))
        # neue Einheit speichern -> „Doch noch ändern“
        pg.tap('#gymBox [data-a=empty]'); pg.wait_for_timeout(100); pg.fill('#gNew','Klimmzüge'); pg.tap('#gAdd')
        pg.fill('#gymBox input[data-i="0"][data-j="0"][data-f="r"]','10'); pg.tap('#gSave'); pg.wait_for_timeout(700)
        ck(t+'Nach dem Speichern: Knopf „Doch noch ändern“',pg.locator('#gymBox > .btns [data-a=editS]').count()==1 and len(st(pg,'users/u1/training/gym_2026')['list'])==2)
        pg.locator('#gymBox > .btns [data-a=editS]').click(); pg.wait_for_timeout(200); pg.tap('#gDrop'); pg.wait_for_timeout(200)
        ck(t+'Abbrechen lässt die Einheit unverändert',len(st(pg,'users/u1/training/gym_2026')['list'])==2 and pg.locator('#gymBox .gedit').count()==0)
        ck(t+'Gym: keine Fehler',not errs,errs[:2]); ctx.close()
        # ---------- 2) eigene Einheit ohne Whoop (Training): Logbuch über die Seite ----------
        ctx=ctx_for(b,w,h,{'users/u1/plan/v_2026-11-01':VER}); pg,errs=page(ctx,'training.html',['window.__planReady===true','window.__trainingReady===true'])
        d0=done_count(pg)
        own_form(pg,'2026-11-05','Hyrox',75,9,'hiit')
        pg.locator('#planCard .pn-ownf').scroll_into_view_if_needed(); pg.screenshot(path=f'{shots}/{tag}-form.png')
        ck(t+'Vorschau: Belastung sehr hart (75 × 9 = 675)','sehr hart' in pg.inner_text('#planCard [data-oload]') and '675' in pg.inner_text('#planCard [data-oload]'),pg.inner_text('#planCard [data-oload]'))
        pg.tap('#planCard [data-a=osave]'); settle(pg)
        o=(st(pg,'users/u1/plan/t_2026-11-05') or {}).get('own',[]); acts=(st(pg,'users/u1/training/acts_2026') or {}).get('list',[])
        ck(t+'Eigene Einheit gespeichert, mit Logbuch-Verweis',len(o)==1 and o[0]['n']=='Hyrox' and o[0]['kind']=='hiit' and o[0]['min']==75 and o[0]['rpe']==9 and str(o[0].get('log','')).startswith('m'),o)
        ck(t+'Im Training-Logbuch eingetragen (75 min, Anstrengung 9, HIIT)',any(x['i']==o[0].get('log') and x['s']==4500 and x['x']==9 and x['r']=='HIIT' for x in acts),acts)
        hist=st(pg,'users/u1/plan/t_2026-11-05')
        ck(t+'Tag: als harte eigene Einheit mit Belastung gespeichert',hist.get('ownUnits',[{}])[0].get('hard') is True and hist['ownUnits'][0].get('load')=='sehr hart',hist.get('ownUnits'))
        txt=pg.inner_text('#planCard')
        ck(t+'Anzeige: Hyrox mit Belastung, Wochenfortschritt +1','Hyrox' in txt and 'Belastung: sehr hart' in txt and done_count(pg)==(d0[0]+1,d0[1]+1),(done_count(pg),d0))
        pg.locator('#planCard .pn-own').scroll_into_view_if_needed(); pg.screenshot(path=f'{shots}/{tag}-hyrox.png',full_page=False)
        pg.tap('#planCard [data-a=odel]'); settle(pg); pg.wait_for_timeout(600)
        acts=(st(pg,'users/u1/training/acts_2026') or {}).get('list',[])
        ck(t+'Entfernen löscht auch den Logbuch-Eintrag',not st(pg,'users/u1/plan/t_2026-11-05').get('own') and not any(x['i'].startswith('m') for x in acts),acts)
        ck(t+'Plan: keine Fehler',not errs,errs[:2]); ctx.close()
        # ---------- 3) eigene Einheit mit Whoop (Training): nur verknüpfen, Strain zählt ----------
        WH={'2026-11-05':{'recovery':{'score':{'recovery_score':70}},'workouts':[{'id':888,'sport':'Functional Fitness','start':'2026-11-05T06:30:00.000Z','end':'2026-11-05T07:42:00.000Z','score':{'strain':15.2,'average_heart_rate':150}}]}}
        ctx=ctx_for(b,w,h,{'users/u1/plan/v_2026-11-01':VER},WH); pg,errs=page(ctx,'training.html',['window.__planReady===true','window.__trainingReady===true'])
        pg.wait_for_timeout(800); own_form(pg,'2026-11-05','Hyrox')
        ck(t+'Whoop-Einheit zum Verknüpfen angeboten',pg.locator('#planCard [data-a=owh][data-w="888"]').count()==1)
        pg.tap('#planCard [data-a=owh][data-w="888"]'); pg.wait_for_timeout(150)
        ck(t+'Vorschau: Belastung aus Whoop-Strain (hart)','hart' in pg.inner_text('#planCard [data-oload]') and 'Strain 15,2' in pg.inner_text('#planCard [data-oload]'),pg.inner_text('#planCard [data-oload]'))
        n_acts=len((st(pg,'users/u1/training/acts_2026') or {}).get('list',[]))
        pg.tap('#planCard [data-a=osave]'); settle(pg)
        o=st(pg,'users/u1/plan/t_2026-11-05').get('own',[])
        ck(t+'Mit Whoop: verknüpft, Dauer und Strain von Whoop, kein Logbuch-Eintrag',len(o)==1 and o[0].get('wh')=='888' and o[0]['min']==72 and o[0].get('strain')==15.2 and not o[0].get('log') and len((st(pg,'users/u1/training/acts_2026') or {}).get('list',[]))==n_acts,o)
        ck(t+'Whoop-Einheit nicht mehr als „frei“ angeboten',pg.locator('#planCard .pn-wkbox [data-w="888"]').count()==0)
        ck(t+'Whoop: keine Fehler',not errs,errs[:2]); ctx.close()
    # ---------- 4) Check-in (ohne Training-Seite): Logbuch direkt ----------
    ctx=ctx_for(b,390,844,{'users/u1/plan/v_2026-11-01':VER,'users/u1/training/acts_2026':{'list':[{'i':'w9','t':T0,'r':'Lauf','n':'','s':1800}]}}); pg,errs=page(ctx,'checkin.html',['window.__checkinReady===true','window.__planReady===true'])
    if pg.locator('#planCard [data-a=oopen][data-k="2026-11-05"]').count()==0: pg.tap('#planCard [data-a=dopen][data-k="2026-11-05"]'); pg.wait_for_timeout(200)
    own_form(pg,'2026-11-05','Hyrox',60,8,'hiit'); pg.tap('#planCard [data-a=osave]'); settle(pg); pg.wait_for_timeout(400)
    acts=st(pg,'users/u1/training/acts_2026')['list']; o=st(pg,'users/u1/plan/t_2026-11-05').get('own',[])
    ck('[check-in] Eigene Einheit: direkt ins Logbuch, bestehende Einträge bleiben',len(acts)==2 and acts[0]['i']=='w9' and acts[1]['i']==o[0].get('log') and acts[1]['s']==3600,acts)
    pg.tap('#planCard [data-a=odel]'); settle(pg); pg.wait_for_timeout(600)
    ck('[check-in] Entfernen löscht den Logbuch-Eintrag direkt',[x['i'] for x in st(pg,'users/u1/training/acts_2026')['list']]==['w9'])
    ck('[check-in] keine Fehler, kein Seitwärtsscroll',not errs and pg.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),errs[:2]); ctx.close()
    b.close()
print('\nFEHLER:',fails); sys.exit(1 if fails else 0)
