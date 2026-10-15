"""Browsertest für training.html (Chromium, 1280/1024/390 px): Firebase-Mock, Worker-Mock (Strava), Open-Meteo-Mock.
Aufruf: python3 tools/browser/test_training.py <screenshot-ordner> <seed.json>"""
import re, json, sys, os, threading, http.server, socketserver, functools
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1]; seedf=sys.argv[2]; os.makedirs(shots,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
SEED=json.load(open(seedf))
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
URL=f'http://127.0.0.1:{port}/training.html'
res=[];fails=0
def ck(n,c,x=''):
    global fails
    res.append(('ok     ' if c else 'FEHLER ')+n+(' '+str(x) if x!='' else '')); print(res[-1],flush=True)
    if not c: fails+=1
CSV='Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Max Heart Rate,Moving Time,Distance,Elapsed Time,Max Heart Rate,Average Heart Rate,Average Cadence,Elevation Gain,Activity Gear,Calories\n'
import datetime
for i in range(40):
    d=datetime.date(2026,9,1)+datetime.timedelta(days=i)
    CSV+='%d,"%s 7:00:00 AM",Lauf %d,Run,3100,10.0,170,3000,10000,3100,170,%d,82,40,Nike,600\n'%(5000+i,d.strftime('%b %d, %Y,').replace(' 0',' '),i,150+i%5)
def run(p,w,h,mode):
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True)
    seed=SEED if mode=='data' else {'users/u1/training/settings':{'view':'lauf'}}
    ctx.add_init_script('window.__seed='+json.dumps(seed)+';')
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    st={'stv':{'configured':mode!='empty','connected':mode=='strava','athlete':{'name':'Max M'}},'wx':[], 'geo':0, 'acts':0}
    def worker(r):
        u=r.request.url; hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if '/strava/status' in u: return r.fulfill(headers=hd,body=json.dumps(st['stv']))
        if '/strava/activities' in u:
            st['acts']+=1
            t=1760000000000+st['acts']*86400000
            return r.fulfill(headers=hd,body=json.dumps({'acts':[{'id':777000+st['acts'],'t':t,'name':'Strava-Lauf','sport_type':'Run','distance':8000,'moving_time':2600,'elapsed_time':2700,'avg_hr':150,'max_hr':170,'elev':30,'cad':84,'gear':'Nike'}],'more':False,'page':1}))
        if '/strava/start' in u: return r.fulfill(headers=hd,body=json.dumps({'url':'about:blank#strava'}))
        return r.fulfill(headers=hd,body='{}')
    ctx.route(re.compile(r'workers\.dev'),worker)
    def meteo(r):
        u=r.request.url; hd={'access-control-allow-origin':'*','content-type':'application/json'}
        st['wx'].append(u)
        if 'geocoding' in u: st['geo']+=1; return r.fulfill(headers=hd,body=json.dumps({'results':[{'latitude':50.1109,'longitude':8.6821}]}))
        if 'archive' in u:
            y0=2006; time=[];tm=[];td=[]
            for y in range(2006,2026):
                for dd in range(15,30):
                    if True:
                        time.append('%d-11-%02d'%(y,dd)); tm.append(8.0); td.append(4.0)
            return r.fulfill(headers=hd,body=json.dumps({'daily':{'time':time,'temperature_2m_max':tm,'dew_point_2m_mean':td}}))
        return r.fulfill(status=500,headers=hd,body='{}')
    ctx.route(re.compile(r'open-meteo\.com'),meteo)
    pg=ctx.new_page(); errs=[]
    pg.on('pageerror',lambda e:errs.append(str(e))); pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'ERR_FAILED' not in m.text and 'about:blank' not in m.text else None)
    pg.clock.set_fixed_time('2026-10-15T09:00:00+02:00')
    pg.goto(URL); pg.wait_for_function('window.__trainingReady===true',timeout=20000); t=f'[{w}px {mode}] '
    return b,ctx,pg,errs,st,t
with sync_playwright() as p:
    for w,h in((1280,900),(390,844)):
        b,ctx,pg,errs,st,t=run(p,w,h,'data')
        pg.wait_for_selector('#s-ueber .hello',timeout=10000); pg.wait_for_timeout(800)
        ck(t+'Inhalt sichtbar',pg.is_visible('#content') and not pg.is_visible('#setup'))
        ck(t+'Begrüßung mit Namen','Max' in pg.inner_text('.hello'),pg.inner_text('.hello').replace('\n',' '))
        ck(t+'Skyline gezeichnet',pg.evaluate("document.querySelectorAll('#sky polygon').length")>300)
        ck(t+'Lime-Tag vorhanden',pg.evaluate("!!document.querySelector('#sky polygon[fill=\"#d8ff4f\"]')"))
        ck(t+'Jahres-Kilometer > 1000',int(pg.inner_text('#kmBig').replace(' ',''))>1000,pg.inner_text('#kmBig'))
        ck(t+'Befund mit zwei Wörtern in Akzent',pg.inner_text('.reveal h3 em').strip()!='',pg.inner_text('.reveal h3').replace('\n',' '))
        ck(t+'Insight-Kacheln',pg.locator('.itile').count()>=4,pg.locator('.itile').count())
        ck(t+'Form-Diagramm',pg.evaluate("!!document.querySelector('#c-form svg path#fline')"))
        ck(t+'Tacho',pg.evaluate("!!document.querySelector('#c-gauge svg')"))
        ck(t+'Race Day Chance',pg.inner_text('#rdCh').isdigit(),pg.inner_text('#rdCh'))
        c0=int(pg.inner_text('#rdCh')); t0=pg.inner_text('#rdT')
        pg.evaluate("const s=document.getElementById('rdSl');s.value=String(+s.min);s.dispatchEvent(new Event('input'))")
        ck(t+'Regler ändert Zielzeit und Chance',pg.inner_text('#rdT')!=t0 and int(pg.inner_text('#rdCh'))!=c0,(t0,pg.inner_text('#rdT'),c0,pg.inner_text('#rdCh')))
        tot=pg.inner_text('#rdTot'); how=pg.inner_text('#rdHow')
        ck(t+'Wetter aus Open-Meteo (Klimamittel)','Mittel 2006–2025' in how,how.replace('\n',' ')[:160])
        ck(t+'Renntagszeit sichtbar',':' in tot,tot)
        ck(t+'Glockenkurve',pg.evaluate("!!document.querySelector('#c-bell svg path')"))
        pg.click('#rdTabs button:nth-child(2)'); ck(t+'Distanz wechseln (10 km): Wetter –','–' in pg.inner_text('#rdHow'))
        ck(t+'Prognosetabelle mit 4 Zeilen',pg.locator('#preds tr').count()==4)
        ck(t+'Wochenumfang Säulen',pg.evaluate("document.querySelectorAll('#c-weeks path[data-tt]').length")>=40)
        ck(t+'Ringe',pg.evaluate("document.querySelectorAll('#c-rings circle').length")==6)
        ck(t+'Kalender 365 Tage',pg.evaluate("document.querySelectorAll('#c-cal .cal i[data-tt]').length")==365)
        ck(t+'Intensität: 5 Zonen',pg.evaluate("document.querySelectorAll('#zb > div > i').length")==5)
        ck(t+'Gewohnheits-Raster',pg.evaluate("document.querySelectorAll('#hg circle').length")==168)
        ck(t+'Rekorde 8',pg.locator('#recs .rec').count()==8)
        ck(t+'In Zahlen 6',pg.locator('#nums .rec').count()==6)
        ck(t+'Plan 7 Tage',pg.locator('#planList li').count()==7)
        ck(t+'Repair Guide vorhanden',pg.inner_text('#repair').strip()!='',pg.inner_text('#repair')[:80].replace('\n',' '))
        pg.click('#qs button:nth-child(2)'); pg.wait_for_timeout(1800)
        ck(t+'Coach-Antwort getippt',len(pg.inner_text('#ans'))>60,pg.inner_text('#ans')[:60].replace('\n',' '))
        ck(t+'Schuhe',pg.locator('#shoes .shoe').count()>=1)
        n0=pg.locator('#log tbody tr').count(); ck(t+'Logbuch 12 Zeilen',n0==12,n0)
        pg.click('#logMore'); ck(t+'Logbuch alle',pg.locator('#log tbody tr').count()>12)
        pg.click('#log th[data-k="km"]'); k1=pg.inner_text('#log tbody tr:first-child td:nth-child(4)'); ck(t+'Logbuch sortierbar',k1.strip().endswith('km'),k1)
        pg.click('#logChips button:nth-child(2)'); ck(t+'Logbuch Filter',pg.locator('#log tbody tr').count()>0)
        # Zeitraum
        a=pg.evaluate("document.querySelectorAll('#c-weeks path[data-tt]').length")
        pg.click('#trNav [data-p="3"]'); pg.wait_for_timeout(300)
        b2=pg.evaluate("document.querySelectorAll('#c-weeks path[data-tt],#c-weeks rect[data-tt]').length")
        ck(t+'Zeitraum 3M kürzt Wochen',b2<a and b2<=14,(a,b2))
        pg.click('#trNav [data-p="12"]')
        # Skyline-Modus
        pg.click('[data-m="load"]'); ck(t+'Skyline Belastung',pg.inner_text('#kmBig').replace(' ','').isdigit() and 'Punkte' in pg.inner_text('.bignum'))
        pg.click('[data-m="km"]')
        # Teilen
        pg.click('#shareBtn'); ck(t+'Teilen-Karte',pg.is_visible('#share .sc') and pg.evaluate("document.querySelectorAll('#shSky polygon').length")>100)
        pg.screenshot(path=f'{shots}/training_{w}_share.png'); pg.click('#share'); ck(t+'Teilen schließt',not pg.is_visible('#share'))
        # Insight-Kachel springt
        pg.click('.itile:nth-child(1)'); pg.wait_for_timeout(300)
        # Overflow
        ov=pg.evaluate('document.documentElement.scrollWidth<=window.innerWidth+1'); ck(t+'Kein Seitwärtsscroll',ov,pg.evaluate('document.documentElement.scrollWidth'))
        # Navigation klebt
        pg.evaluate('window.scrollTo(0,1500)'); pg.wait_for_timeout(300)
        top=pg.evaluate("document.getElementById('trNav').getBoundingClientRect().top"); ck(t+'Reiterleiste klebt',top<110,top)
        pg.evaluate('window.scrollTo(0,0)'); pg.wait_for_timeout(300)
        pg.screenshot(path=f'{shots}/training_{w}_top.png')
        for sid in('insights','form','leistung','umfang','intensitaet','rekorde','plan','material'):
            pg.evaluate("document.getElementById('%s').scrollIntoView()"%sid); pg.wait_for_timeout(250); pg.screenshot(path=f'{shots}/training_{w}_{sid}.png')
        # Tooltip
        pg.evaluate("document.getElementById('umfang').scrollIntoView()"); pg.wait_for_timeout(200)
        pg.locator('#c-weeks path[data-tt]').nth(20).dispatch_event('pointerdown'); 
        ck(t+'Tooltip bei Antippen',pg.is_visible('#tip') and 'Woche ab' in pg.inner_text('#tip'),pg.inner_text('#tip')[:40].replace('\n',' '))
        # Wetter gespeichert
        wx=pg.evaluate("Object.values(window.__store).find(v=>v&&v.race&&v.race.name)")
        ck(t+'Wetter in den Einstellungen gespeichert',bool(wx and wx['race'].get('wx') and wx['race']['wx']['src'].startswith('Mittel')),wx and wx['race'].get('wx'))
        n_arch=sum(1 for u in st['wx'] if 'archive' in u); ck(t+'Open-Meteo: genau ein Archiv-Abruf, keine weiteren',n_arch==1 and len(st['wx'])==1,len(st['wx']))
        sm=pg.evaluate("window.__store['users/u1/training/summary']"); ck(t+'Zusammenfassung für den KI-Assistenten',bool(sm) and 'TRAINING' in sm['text'])
        ck(t+'Keine Konsolenfehler',not errs,errs[:3])
        b.close()
    # Speichern der Angaben
    b,ctx,pg,errs,st,t=run(p,1024,800,'data'); t='[Angaben] '
    pg.wait_for_selector('#p2_save'); pg.fill('#p2_name','Anna'); pg.fill('#p2_rplace','Berlin'); pg.fill('#p2_rtime','1:35:00'); pg.fill('#p2_rest','45')
    pg.click('#p2_save'); pg.wait_for_function("document.getElementById('p2_msg')&&document.getElementById('p2_msg').textContent.includes('Gespeichert')",timeout=8000)
    s=pg.evaluate("window.__store['users/u1/training/settings']"); ck(t+'Angaben gespeichert',s['name']=='Anna' and s['rest']==45 and s['race']['target']==5700 and s['race']['place']=='Berlin',json.dumps(s['race'])[:120])
    ck(t+'Ort wurde nachgeschlagen',st['geo']==1 and abs(s['race']['lat']-50.11)<.01)
    pg.wait_for_timeout(500); ck(t+'Neuer Name in der Begrüßung','Anna' in pg.inner_text('.hello'))
    ck(t+'Ruhepuls nicht mehr „angenommen“','angenommen' not in pg.inner_text('#assume').split('Ruhepuls')[1].split('\n')[0])
    b.close()
    # Leerer Zustand + CSV
    b,ctx,pg,errs,st,t=run(p,1024,800,'empty'); t='[leer] '
    ck(t+'Einrichtung sichtbar',pg.is_visible('#setup') and not pg.is_visible('#content'))
    pg.wait_for_selector('#stravaBox details',timeout=5000); ck(t+'Strava-Anleitung bei fehlender Einrichtung','STRAVA_CLIENT_ID' in pg.text_content('#stravaBox'))
    pg.screenshot(path=f'{shots}/training_empty.png')
    pg.set_input_files('#csvFile',buffer={'name':'activities.csv','mimeType':'text/csv','buffer':CSV.encode()}) if False else pg.set_input_files('#csvFile',files=[{'name':'activities.csv','mimeType':'text/csv','buffer':CSV.encode()}])
    pg.wait_for_selector('#content:not([hidden])',timeout=10000); pg.wait_for_timeout(500)
    ck(t+'CSV importiert und ausgewertet',pg.locator('#log tbody tr').count()>0 and '40' in pg.inner_text('#logChips'),pg.inner_text('#logChips')[:40])
    acts=sum(len(v['list']) for k,v in pg.evaluate('window.__store').items() if '/training/acts_' in k); ck(t+'Einheiten in Firestore gespeichert',acts==40,acts)
    ck(t+'Ruhepuls wird als angenommen markiert','angenommen' in pg.inner_text('#assume'))
    ck(t+'Keine Konsolenfehler',not errs,errs[:3]); b.close()
    # Strava verbunden
    b,ctx,pg,errs,st,t=run(p,1024,800,'strava'); t='[strava] '
    pg.wait_for_selector('#stvSync',timeout=8000); ck(t+'Verbunden-Status',"Max M" in pg.inner_text('#stravaBox'))
    pg.click('#stvSync'); pg.wait_for_function("[...document.querySelectorAll('.stvMsg')].some(x=>x.textContent.includes('Einheiten geholt'))",timeout=8000)
    acts=sum(len(v['list']) for k,v in pg.evaluate('window.__store').items() if '/training/acts_' in k); ck(t+'Strava-Einheit gespeichert',acts==1,acts)
    pg.wait_for_selector('#stvSync2',timeout=8000); pg.click('#stvSync2'); pg.wait_for_timeout(1200); acts=sum(len(v['list']) for k,v in pg.evaluate('window.__store').items() if '/training/acts_' in k); ck(t+'Zweiter Abruf ergänzt (neue Tage)',acts==2,acts)
    b.close()
print('\nFEHLER: %d'%fails if fails else '\nalles ok'); sys.exit(1 if fails else 0)
