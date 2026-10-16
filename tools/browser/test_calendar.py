"""Browsertest Kalender. Aufruf: python3 tools/browser/test_calendar.py <screenshot-ordner> [ipad|phone|all]"""
import re, json, sys, os, threading, http.server, socketserver, functools, datetime as dt
from zoneinfo import ZoneInfo
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); shots=sys.argv[1]; os.makedirs(shots,exist_ok=True)
mode=sys.argv[2] if len(sys.argv)>2 else 'all'
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
now=dt.datetime.now(ZoneInfo('Europe/Berlin')); today=now.date(); iso=lambda d:d.isoformat()
def seed():
    s={}
    tm=iso(today+dt.timedelta(days=1)); y=today.year
    ev=[{'id':'e1','title':'Zahnarzt','date':tm,'time':'15:00','end':'16:00','cat':'termin','rem':30},
        {'id':'e2','title':'Lauf','date':iso(today-dt.timedelta(days=14)),'cat':'training','rep':'weekly','track':True},
        {'id':'e3','title':'Miete','date':f'{y}-01-01','cat':'frist','rep':'monthly'},
        {'id':'e4','title':'Urlaub','date':iso(today+dt.timedelta(days=5)),'endDate':iso(today+dt.timedelta(days=7)),'cat':'privat'}]
    past=(now-dt.timedelta(minutes=5)).strftime('%H:%M')
    if now.hour>=1: ev.append({'id':'e5','title':'Anruf Oma','date':iso(today),'time':past,'cat':'privat','rem':10})
    s[f'users/u1/calendar/ev_{y}']={'list':ev}
    s[f'users/u1/calendar/notes_{y}']={'n':{iso(today-dt.timedelta(days=1)):{'t':'Guter Tag','m':4}}}
    yd=iso(today-dt.timedelta(days=1))
    s[f'users/u1/days/{yd}']={'date':yd,'net':14,'rank':'A','closed':True}
    s[f'users/u1/puzzle/{yd}']={'g':{'fermi':{'s':3},'ner':{'s':4}},'t':1}
    s[f'users/u1/learn/{yd}']={'rounds':[{},{}]}
    s[f'users/u1/training/acts_{y}']={'list':[{'i':'a1','t':int(dt.datetime.combine(today-dt.timedelta(days=1),dt.time(18,0),ZoneInfo('Europe/Berlin')).timestamp()*1000),'r':'','n':'Intervalle','k':8.0,'s':2700}]}
    return s
def whoopdays():
    d={}
    for i in range(1,6):
        k=iso(today-dt.timedelta(days=i))
        d[k]={'recovery':{'score':{'recovery_score':40+i*8,'hrv_rmssd_milli':60}},'sleep':{'score':{'stage_summary':{'total_light_sleep_time_milli':2e7,'total_slow_wave_sleep_time_milli':5e6,'total_rem_sleep_time_milli':5e6},'sleep_performance_percentage':85}},'cycle':{'score':{'strain':8+i}},'workouts':[]}
    return d
def run(p,w,h,phone):
    t=f'[{w}px] '
    b=p.chromium.launch(args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=phone,device_scale_factor=1)
    ctx.add_init_script('window.__seed='+json.dumps(seed())+';')
    for nm,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%nm),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r:r.abort())
    def worker(r):
        hd={'access-control-allow-origin':'*','content-type':'application/json'}
        if r.request.method=='OPTIONS': return r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'})
        if '/data' in r.request.url: return r.fulfill(headers=hd,body=json.dumps({'days':whoopdays()}))
        return r.fulfill(headers=hd,body='{}')
    ctx.route(re.compile(r'workers\.dev'),worker)
    pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{port}/calendar.html',timeout=60000); pg.wait_for_selector('.cell',timeout=40000); pg.wait_for_timeout(1500)
    tag='ipad' if not phone else 'phone'
    ck(t+'Monat: 42 Zellen',pg.locator('.cell').count()==42)
    ck(t+'heute markiert',pg.locator('.cell.today').count()==1)
    ck(t+'Termin „Zahnarzt“ im Monat',pg.locator('.cell',has_text='Zahnarzt').count()>=1 or phone and pg.evaluate("CalStore.state.events.some(e=>e.title==='Zahnarzt')"))
    ck(t+'wiederholter Lauf erscheint mehrfach',pg.evaluate("CalCore.occurrences(CalStore.state.events,CalCore.monthGrid(...Object.values(Object.fromEntries([['y',+CalCore.todayBerlin().slice(0,4)],['m',+CalCore.todayBerlin().slice(5,7)]]))).slice(0,1)[0].date,CalCore.todayBerlin()).filter(o=>o.title==='Lauf').length")>=2)
    ck(t+'Whoop-Daten geladen (Heatmap Recovery vorhanden)',pg.evaluate("Object.keys(CalendarPage.SRC.whoop).length")>=5)
    pg.screenshot(path=f'{shots}/cal_{tag}_month.png')
    # Erinnerung
    if now.hour>=1:
        pg.wait_for_selector('.rem',timeout=8000); ck(t+'Erinnerung „Anruf Oma“ erscheint',pg.locator('.rem',has_text='Anruf Oma').count()==1)
        pg.locator('.rem button').first.click(); ck(t+'Erinnerung lässt sich wegklicken',pg.locator('.rem').count()==0)
        pg.reload(); pg.wait_for_selector('.cell',timeout=40000); pg.wait_for_timeout(1500)
        ck(t+'bestätigte Erinnerung kommt nach Reload nicht wieder',pg.locator('.rem').count()==0)
    # Tag mit Daten auswählen
    yd=iso(today-dt.timedelta(days=1))
    pg.evaluate(f"CalendarPage.state.cur='{yd}';CalendarPage.state.sel='{yd}';CalendarPage.refresh()")
    pg.wait_for_timeout(400)
    side=pg.locator('#side').inner_text()
    ck(t+'Rückblick: Heute-Rang',('Heute-Rang A' in side),side[:200].replace('\n',' | '))
    ck(t+'Rückblick: Recovery, Training, Puzzle, Lernen',all(x in side for x in ['Recovery','Intervalle','Puzzle: 2','Lernen: 2 Runden']))
    ck(t+'Notiz + Stimmung geladen',pg.input_value('#nt')=='Guter Tag' and pg.locator('#moods .on').count()==1)
    pg.screenshot(path=f'{shots}/cal_{tag}_day_side.png',full_page=True)
    # Notiz schreiben
    pg.fill('#nt','Guter Tag und Sport'); pg.evaluate("document.getElementById('nt').blur()"); pg.wait_for_timeout(500)
    st=pg.evaluate("window.__store"); nk=[k for k in st if '/notes_' in k][0]
    ck(t+'Notiz gespeichert',st[nk]['n'][yd]['t']=='Guter Tag und Sport',st[nk]['n'].get(yd))
    pg.locator('#moods [data-m="5"]').click(); pg.wait_for_timeout(400)
    ck(t+'Stimmung 5 gespeichert',pg.evaluate("window.__store")[nk]['n'][yd]['m']==5)
    pg.locator('#moods [data-m="5"]').click(); pg.wait_for_timeout(400)
    ck(t+'Stimmung lässt sich abwählen',pg.evaluate("window.__store")[nk]['n'][yd]['m'] in (None,0))
    # neuer Termin über Editor
    pg.evaluate(f"CalendarPage.state.sel='{iso(today)}';CalendarPage.refresh()"); pg.wait_for_timeout(200)
    pg.click('#add'); pg.wait_for_selector('#eT'); pg.fill('#eT','Testtermin'); pg.uncheck('#eAll'); pg.fill('#eS','10:00'); pg.fill('#eE','11:00')
    pg.select_option('#eM','30'); pg.locator('#eC [data-c="lernen"]').click()
    pg.screenshot(path=f'{shots}/cal_{tag}_editor.png')
    pg.click('#eSave'); pg.wait_for_timeout(500)
    evk=[k for k in pg.evaluate("window.__store") if '/ev_' in k][0]; lst=pg.evaluate("window.__store")[evk]['list']
    me=[e for e in lst if e['title']=='Testtermin']
    ck(t+'Termin gespeichert (Zeit, Ende, Erinnerung, Kategorie)',len(me)==1 and me[0]['time']=='10:00' and me[0]['end']=='11:00' and me[0]['rem']==30 and me[0]['cat']=='lernen',me)
    ck(t+'Editor schließt',pg.locator('#ed').is_hidden())
    # Fehlerfall
    pg.click('#add'); pg.wait_for_selector('#eT'); pg.fill('#eT','   '); pg.click('#eSave'); pg.wait_for_timeout(300)
    ck(t+'leerer Titel: Fehlermeldung, nichts gespeichert','Titel' in pg.inner_text('#eErr') and len([e for e in pg.evaluate("window.__store")[evk]['list']])==len(lst))
    pg.click('#eCancel')
    # Bearbeiten
    pg.locator('#side .it',has_text='Testtermin').click(); pg.wait_for_selector('#eT'); pg.fill('#eT','Testtermin 2'); pg.click('#eSave'); pg.wait_for_timeout(400)
    ck(t+'Bearbeiten ändert den Titel, keine Kopie',[e['title'] for e in pg.evaluate("window.__store")[evk]['list']].count('Testtermin 2')==1 and [e['title'] for e in pg.evaluate("window.__store")[evk]['list']].count('Testtermin')==0)
    # Löschen
    pg.locator('#side .it',has_text='Testtermin 2').click(); pg.wait_for_selector('#eDel'); pg.click('#eDel'); pg.click('#dYes'); pg.wait_for_timeout(400)
    ck(t+'Löschen entfernt den Termin',all(e['title']!='Testtermin 2' for e in pg.evaluate("window.__store")[evk]['list']))
    # Wiederholung: nur ein Tag löschen
    pg.evaluate(f"CalendarPage.state.sel='{iso(today-dt.timedelta(days=7))}';CalendarPage.refresh()"); pg.wait_for_timeout(300)
    pg.locator('#side .it',has_text='Lauf').click(); pg.wait_for_selector('#eDel'); pg.click('#eDel'); pg.wait_for_selector('#dOne'); pg.click('#dOne'); pg.wait_for_timeout(400)
    e2=[e for e in pg.evaluate("window.__store")[evk]['list'] if e['id']=='e2'][0]
    ck(t+'Serie: nur dieses Vorkommen entfällt',e2.get('exc')==[iso(today-dt.timedelta(days=7))],e2.get('exc'))
    # Abhaken
    pg.evaluate(f"CalendarPage.state.sel='{iso(today-dt.timedelta(days=14))}';CalendarPage.refresh()"); pg.wait_for_timeout(300)
    pg.locator('#side .chk').first.click(); pg.wait_for_timeout(400)
    e2=[e for e in pg.evaluate("window.__store")[evk]['list'] if e['id']=='e2'][0]
    ck(t+'Abhaken gespeichert',e2.get('doneOn')==[iso(today-dt.timedelta(days=14))],e2.get('doneOn'))
    # Schnell eintragen
    pg.fill('#qt','Schnell dran'); pg.fill('#qh','08:30'); pg.click('#qa'); pg.wait_for_timeout(400)
    ck(t+'Schnell-Eintrag',any(e['title']=='Schnell dran' and e['time']=='08:30' for e in pg.evaluate("window.__store")[evk]['list']))
    # Ansichten
    for v,sel in (('week','.tg' if not phone else '.wl'),('day','.tg' if not phone else '#main'),('year','.yg')):
        pg.click(f'#seg [data-v="{v}"]'); pg.wait_for_selector(sel,timeout=8000); pg.wait_for_timeout(500)
        ck(t+f'Ansicht {v}',pg.locator(sel).count()>=1)
        pg.screenshot(path=f'{shots}/cal_{tag}_{v}.png',full_page=phone)
        ow=pg.evaluate('[document.documentElement.scrollWidth,innerWidth]'); ck(t+f'{v}: kein Seitwärtsscroll',ow[0]<=ow[1]+1,ow)
    ck(t+'Jahr: 365/366 Tagesfelder',pg.locator('.yd:not(.o)').count() in (365,366),pg.locator('.yd:not(.o)').count())
    ck(t+'Jahr: Tage mit Daten gefärbt',pg.locator('.yd.l1,.yd.l2,.yd.l3,.yd.l4').count()>=1)
    pg.click('.yd:not(.o)>>nth=40'); pg.wait_for_timeout(300); pg.click('#today'); pg.wait_for_timeout(200)
    # Metrik, Suche, Navigation
    pg.click('#seg [data-v="month"]'); pg.select_option('#metric','rec'); pg.wait_for_timeout(300)
    ck(t+'Heatmap Recovery: gefärbte Tage',pg.locator('.cell .heat.l1,.cell .heat.l2,.cell .heat.l3,.cell .heat.l4').count()>=3)
    if phone: pg.click('#qbtn')
    pg.fill('#q','zahn'); pg.wait_for_timeout(300); ck(t+'Suche findet Zahnarzt',pg.locator('.res button',has_text='Zahnarzt').count()==1)
    pg.fill('#q','xyzxyz'); pg.wait_for_timeout(300); ck(t+'Suche ohne Treffer meldet das',pg.locator('#main',has_text='Nichts gefunden').count()==1)
    pg.fill('#q',''); pg.wait_for_timeout(200)
    t0=pg.inner_text('#ttl'); pg.click('#next'); t1=pg.inner_text('#ttl'); pg.click('#prev'); ck(t+'Vor/Zurück',t0!=t1 and pg.inner_text('#ttl')==t0,(t0,t1))
    pg.click('#next'); pg.click('#today'); ck(t+'Heute-Knopf',pg.inner_text('#ttl')==t0)
    # Jarvis-Handler
    r=pg.evaluate("JarvisHandlers.calendar_add({title:'Per Sprache',date:'morgen',time:'16 Uhr',reminder_minutes:30})"); pg.wait_for_timeout(300)
    ck(t+'Jarvis trägt Termin ein',('Eingetragen' in (r.get('say') or '')) and any(e['title']=='Per Sprache' and e['time']=='16:00' and e['rem']==30 for e in pg.evaluate("window.__store")[evk]['list']),r)
    r=pg.evaluate("JarvisHandlers.calendar_add({title:'Ohne Tag'})"); ck(t+'Jarvis fragt nach fehlendem Tag','ask' in r,r)
    r=pg.evaluate("JarvisHandlers.calendar_add({title:'Quatsch',date:'irgendwann'})"); ck(t+'Jarvis: unverständliches Datum wird nachgefragt','ask' in r,r)
    r=pg.evaluate("JarvisHandlers.calendar_note({text:'Per Sprache notiert'})"); ck(t+'Jarvis ergänzt Notiz','ergänzt' in (r.get('say') or ''),r)
    ag=pg.evaluate("(()=>{const C=CalCore,t=C.todayBerlin();return C.agendaText(C.occurrences(CalStore.state.events,C.addDays(t,1),C.addDays(t,1)),C.addDays(t,1),C.addDays(t,1),t)})()")
    ck(t+'Tagesplan morgen enthält Zahnarzt und Per Sprache','Zahnarzt' in ag and 'Per Sprache' in ag,ag)
    ctxs=pg.evaluate("window.LB_PAGE_CONTEXT()"); ck(t+'Seitenkontext für Jarvis','KALENDER-SEITE' in ctxs)
    # Erinnerungs-Speicher blockiert nicht, wenn Schreiben fehlschlägt
    pg.evaluate("window.__failWrites=true"); pg.click('#add'); pg.wait_for_selector('#eT'); pg.fill('#eT','Geht nicht'); pg.click('#eSave'); pg.wait_for_timeout(400)
    ck(t+'Schreibfehler: Meldung, Editor bleibt offen',('Nicht gespeichert' in pg.inner_text('#eErr')) and pg.locator('#ed').is_visible())
    pg.evaluate("window.__failWrites=false"); pg.click('#eCancel')
    ck(t+'keine JS-Fehler',not errs,errs[:3])
    b.close()
with sync_playwright() as p:
    if mode in('ipad','all'): run(p,1180,820,False)
    if mode in('phone','all'): run(p,393,852,True)
print('\nFEHLER gesamt:',fails); sys.exit(1 if fails else 0)
