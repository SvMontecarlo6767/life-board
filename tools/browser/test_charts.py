"""Chart.js-Schicht (lb-chart.js): Recovery und Muster. Prüft: Diagramme werden zu Chart.js, Werte exakt gleich den Whoop-Daten,
Antippen zeigt Datum und Wert, Vollbild unverändert, Performance-Modus ohne Animation, Designwechsel, Rückfall aufs SVG wenn
Chart.js nicht lädt, Handy- und iPad-Größe ohne Seitwärtsscroll. Aufruf: python3 tools/browser/test_charts.py <Ordner>"""
import re, json, sys, os, math, threading, http.server, socketserver, functools, datetime
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); out=sys.argv[1]; os.makedirs(out,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
H=3.6e6; days={}; today=datetime.date.today()
for i in range(89,-1,-1):
    if i in (5,17): continue                      # Lücken: fehlende Tage dürfen nicht aufgefüllt werden
    d=(today-datetime.timedelta(days=i)).isoformat(); b=60+25*math.sin(i/6)
    days[d]={'cycle':{'steps':6000+(i%7)*1300,'score':{'strain':8+6*abs(math.sin(i/4)),'kilojoule':9000+(i%9)*700,'average_heart_rate':70}},
     'recovery':{'score':{'recovery_score':round(b),'hrv_rmssd_milli':60+b/4,'resting_heart_rate':58-b/12,'spo2_percentage':96+(i%3)/2,'skin_temp_celsius':33+(i%5)/10}},
     'sleep':{'score':{'sleep_performance_percentage':70+(i%25),'sleep_efficiency_percentage':88+(i%8),'sleep_consistency_percentage':70+(i%20),'respiratory_rate':15+(i%4)/4,
       'stage_summary':{'total_light_sleep_time_milli':(3+(i%4)*.3)*H,'total_slow_wave_sleep_time_milli':(1.3+(i%3)*.2)*H,'total_rem_sleep_time_milli':(1.7+(i%5)*.1)*H,'total_awake_time_milli':(.4+(i%3)*.1)*H}}},
     'workouts':[]}
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
fails=[]
def ck(msg,c,info=''):
    print(('ok     ' if c else 'FEHLER ')+msg,('' if c else info))
    if not c: fails.append(msg)
def ctx_for(p,w,h,ui=None,block_chart=False,seed=None):
    b=p.chromium.launch(); ctx=b.new_context(viewport={'width':w,'height':h},has_touch=True,is_mobile=w<700,device_scale_factor=2)
    init='localStorage.clear();'+('localStorage.setItem("lb_ui",%s);'%json.dumps(json.dumps(ui)) if ui else '')
    if seed: init+='window.__seed=%s;'%json.dumps(seed)
    ctx.add_init_script('if(!sessionStorage.getItem("__i")){sessionStorage.setItem("__i","1");'+init+'}')
    for n,body in(('app',mock),('auth',''),('firestore','')):
        ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
    ctx.route(re.compile(r'fonts\.(googleapis|gstatic)\.com'),lambda r,_q=None:r.abort())
    ctx.route(re.compile(r'workers\.dev'),lambda r,_q=None:r.fulfill(headers={'access-control-allow-origin':'*','content-type':'application/json'},body=json.dumps({'days':days,'pages':[]})) if r.request.method!='OPTIONS' else r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'}))
    if block_chart: ctx.route(re.compile(r'chart\.umd\.min\.js'),lambda r,_q=None:r.abort())
    return b,ctx
def open_rec(ctx,errs):
    pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.on('console',lambda m:errs.append(m.text) if m.type=='error' and 'favicon' not in m.text and 'ERR_FAILED' not in m.text else None)
    pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_selector('#content:not([hidden])')
    return pg
CH=['c-rec','c-hrv','c-rhr','c-sleep','c-perf','c-strain','c-resp','c-spo2','c-skin','c-kcal','c-steps']
with sync_playwright() as p:
    for w,h,name in((390,844,'handy'),(820,1180,'ipad')):
        errs=[]; b,ctx=ctx_for(p,w,h); pg=open_rec(ctx,errs)
        pg.wait_for_function('document.querySelectorAll(".lbc canvas").length>=11',timeout=15000)
        n=pg.evaluate('(ids)=>ids.filter(id=>{const h=document.getElementById(id);return h.querySelector(".lbc canvas")&&h.querySelector("svg").style.display==="none"}).length',CH)
        ck(f'{name}: alle 11 Tagesgraphen mit Chart.js, SVG versteckt im DOM',n==11,n)
        pg.click('button[data-d="90"]'); pg.wait_for_timeout(400)
        got=pg.evaluate('''()=>{const h=document.getElementById("c-rec"),ch=h._lbw._chart;return{l:ch.data.labels,d:ch.data.datasets[0].data}}''')
        exp=[days[d]['recovery']['score']['recovery_score'] if d in days else None for d in got['l']]
        ck(f'{name}: Recovery-Werte exakt wie Whoop (90 Tage, Lücken bleiben leer)',got['d']==exp and None in got['d'],(got['d'][:5],exp[:5]))
        got=pg.evaluate('''()=>{const ch=document.getElementById("c-steps")._lbw._chart;return{l:ch.data.labels,d:ch.data.datasets[0].data}}''')
        exp=[days[d]['cycle']['steps'] if d in days else None for d in got['l']]
        ck(f'{name}: Schritte exakt wie Whoop',got['d']==exp,(got['d'][:5],exp[:5]))
        same=pg.evaluate('''(ids)=>ids.every(id=>{const h=document.getElementById(id),s=h.querySelector("svg"),ch=h._lbw._chart;return JSON.stringify(s._lbc.sets[0].data)===JSON.stringify(ch.data.datasets[0].data)&&JSON.stringify(s._lbc.labels)===JSON.stringify(ch.data.labels)})''',CH)
        ck(f'{name}: alle Graphen zeigen exakt die Werte des alten SVG',same)
        # Antippen
        bx=pg.locator('#c-rec .lbc canvas').bounding_box(); pg.locator('#c-rec .lbc canvas').scroll_into_view_if_needed(); bx=pg.locator('#c-rec .lbc canvas').bounding_box()
        pg.touchscreen.tap(bx['x']+bx['width']*.6,bx['y']+bx['height']*.5); pg.wait_for_timeout(300)
        tip=pg.evaluate('''()=>{const t=document.getElementById("c-rec")._lbw._chart.tooltip;return{o:t.getActiveElements().length,title:t.title,body:(t.body||[]).map(b=>b.lines.join(" ")),foot:t.footer}}''')
        ck(f'{name}: Antippen zeigt Datum und Wert',tip['o']>0 and tip['title'] and tip['body'] and '%' in tip['body'][0],tip)
        pg.screenshot(path=f'{out}/rec-{name}.png',full_page=False)
        # Vollbild
        pg.locator('#c-hrv').scroll_into_view_if_needed(); pg.evaluate('document.getElementById("c-hrv").closest(".card").querySelector(".gf-btn").click()')
        pg.wait_for_selector('#gf .gf-t'); st=pg.locator('#gf .gf-stats').inner_text()
        st=st.lower();ck(f'{name}: Vollbild öffnet mit Statistiken','durchschnitt' in st and 'bestwert' in st and 'tiefstwert' in st,st[:120])
        pg.screenshot(path=f'{out}/rec-{name}-voll.png'); pg.click('#gfX'); pg.wait_for_timeout(800)
        ck(f'{name}: Vollbild schließt',pg.locator('#gf').count()==0)
        # Design wechseln
        pg.click('#lb-gear'); pg.click('.lb-th[data-th="jungle"]'); pg.wait_for_timeout(700)
        col=pg.evaluate('document.getElementById("c-rec")._lbw._chart.data.datasets[0].borderColor')
        ck(f'{name}: Designwechsel färbt Graphen um (Dschungel)',col.lower() in('#a6e35c',),col)
        sw=pg.evaluate('document.documentElement.scrollWidth<=innerWidth')
        ck(f'{name}: kein Seitwärtsscroll',sw)
        ck(f'{name}: keine Fehler',not errs,errs); b.close()
    # Performance-Modus: keine Animation
    errs=[]; b,ctx=ctx_for(p,390,844,ui={'perf':True}); pg=open_rec(ctx,errs)
    pg.wait_for_function('document.querySelectorAll(".lbc canvas").length>=11',timeout=15000)
    ck('Performance-Modus: Graphen ohne Animation',pg.evaluate('document.getElementById("c-rec")._lbw._chart.options.animation===false'))
    ck('Performance-Modus: keine Fehler',not errs,errs); b.close()
    # Rückfall: Chart.js lädt nicht
    errs=[]; b,ctx=ctx_for(p,390,844,block_chart=True); pg=open_rec(ctx,[]); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.wait_for_timeout(2500)
    r=pg.evaluate('''(ids)=>({lbc:document.querySelectorAll(".lbc").length,svg:ids.filter(id=>{const s=document.querySelector("#"+id+" svg");return s&&s.style.display!=="none"&&s.getBoundingClientRect().height>50}).length,st:LBChart.state})''',CH)
    ck('Ohne Chart.js: alte SVG-Graphen sichtbar, keine Fehler',r['lbc']==0 and r['svg']==11 and r['st']=='failed' and not errs,(r,errs))
    pg.evaluate('document.getElementById("c-rec").closest(".card").querySelector(".gf-btn").click()'); pg.wait_for_selector('#gf .gf-t')
    ck('Ohne Chart.js: Vollbild funktioniert',pg.locator('#gf .gf-t').count()>2); b.close()
    # Hub: Sparkline in der Recovery-Kachel aus dem Gerätespeicher
    errs=[]; b,ctx=ctx_for(p,390,844); pg=open_rec(ctx,errs); pg.wait_for_timeout(800)
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_selector('#hub:not([hidden])')
    try: pg.wait_for_selector('.lb-spark',timeout=8000)
    except Exception: pass
    last=days[max(days)]['recovery']['score']['recovery_score']
    txt=pg.evaluate('(document.querySelector("a.tile[href^=\'recovery.html\'] .lb-spark .lb-spk")||{}).textContent||""')
    ck('Hub: Recovery-Kachel zeigt Mini-Verlauf mit letztem Wert',txt.startswith(f'{last} %'),txt)
    pg.locator('a.tile[href^="recovery.html"]').scroll_into_view_if_needed(); pg.screenshot(path=f'{out}/hub-handy.png')
    ck('Hub: keine Fehler, kein Seitwärtsscroll',not errs and pg.evaluate('document.documentElement.scrollWidth<=innerWidth'),errs); b.close()
    errs=[]; b,ctx=ctx_for(p,390,844); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
    pg.goto(f'http://127.0.0.1:{port}/index.html'); pg.wait_for_selector('#hub:not([hidden])'); pg.wait_for_timeout(1500)
    ck('Hub ohne Speicher: Kachel unverändert, keine Fehler',pg.locator('.lb-spark').count()==0 and not errs,errs); b.close()
    # Muster: Vergleich mit zwei Kurven
    seed={}
    for i in range(40,-1,-1):
        d=(today-datetime.timedelta(days=i)).isoformat()
        seed[f'users/u1/journal/{d}']={'m':{'mood':1+(i*7)%5,'energy':1+(i*3)%5,'sleep':3},'e':{'good':[],'stress':2,'line':''},'notes':[],'t':{},'updatedAt':1}
    for w,h,name in((390,844,'handy'),(820,1180,'ipad')):
        errs=[]; b,ctx=ctx_for(p,w,h,seed=seed); pg=ctx.new_page(); pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{port}/muster.html'); pg.wait_for_timeout(600)
        try: pg.wait_for_function('document.querySelector("#ch + .lbc canvas")',timeout=15000)
        except Exception: pass
        r=pg.evaluate('''()=>{const s=document.getElementById("ch"),w=s._lbw;if(!w)return null;const ch=w._chart;return{n:ch.data.datasets.length,hid:s.style.display,a:JSON.stringify(ch.data.datasets.map(d=>d.data))===JSON.stringify(s._lbc.sets.map(x=>x.data))}}''')
        ck(f'Muster {name}: Vergleich mit Chart.js, zwei Kurven, Werte wie SVG',r and r['n']==2 and r['hid']=='none' and r['a'],r)
        pg.screenshot(path=f'{out}/muster-{name}.png',full_page=True)
        btn=pg.evaluate('!!document.getElementById("ch").closest(".card").querySelector(".gf-btn:not([hidden])")')
        ck(f'Muster {name}: Vollbild-Knopf am Vergleich',btn)
        if btn:
            pg.evaluate('document.getElementById("ch").closest(".card").querySelector(".gf-btn").click()'); pg.wait_for_selector('#gf .gf-t',timeout=5000)
            st=pg.locator('#gf .gf-stats').inner_text().lower()
            ck(f'Muster {name}: Vollbild mit Statistiken','durchschnitt' in st and 'bestwert' in st,st[:100]); pg.screenshot(path=f'{out}/muster-{name}-voll.png')
        ck(f'Muster {name}: kein Seitwärtsscroll',pg.evaluate('document.documentElement.scrollWidth<=innerWidth'))
        ck(f'Muster {name}: keine Fehler',not errs,errs); b.close()
print('\nFEHLER:',len(fails))
sys.exit(1 if fails else 0)
