"""Screenshots von recovery.html mit Whoop-Testdaten. Aufruf: python3 tools/browser/shot_recovery.py <Ordner>"""
import re, json, sys, os, math, threading, http.server, socketserver, functools, datetime
from playwright.sync_api import sync_playwright
root=os.path.abspath(os.path.join(os.path.dirname(__file__),'..','..')); out=sys.argv[1]; os.makedirs(out,exist_ok=True)
mock=open(os.path.join(root,'tools/browser/firebase-mock.js')).read()
H=3.6e6; days={}; today=datetime.date(2026,10,14)
for i in range(89,-1,-1):
    d=(today-datetime.timedelta(days=i)).isoformat(); b=60+25*math.sin(i/6)
    days[d]={'cycle':{'steps':6000+(i%7)*1300,'score':{'strain':8+6*abs(math.sin(i/4)),'kilojoule':9000+(i%9)*700,'average_heart_rate':70}},
     'recovery':{'score':{'recovery_score':round(b),'hrv_rmssd_milli':60+b/4,'resting_heart_rate':58-b/12,'spo2_percentage':96+(i%3)/2,'skin_temp_celsius':33+(i%5)/10}},
     'sleep':{'score':{'sleep_performance_percentage':70+(i%25),'sleep_efficiency_percentage':88+(i%8),'sleep_consistency_percentage':70+(i%20),'respiratory_rate':15+(i%4)/4,
       'sleep_needed':{'baseline_milli':8*H,'need_from_sleep_debt_milli':(i%4)*.2*H,'need_from_recent_strain_milli':.4*H,'need_from_recent_nap_milli':0},
       'stage_summary':{'total_light_sleep_time_milli':(3+(i%4)*.3)*H,'total_slow_wave_sleep_time_milli':(1.3+(i%3)*.2)*H,'total_rem_sleep_time_milli':(1.7+(i%5)*.1)*H,'total_awake_time_milli':(.4+(i%3)*.1)*H}}},
     'workouts':([{'sport':['running','spinning','weightlifting'][i%3],'start':d+'T08:00:00Z','end':d+'T08:%02d:00Z'%(30+i%25),'score':{'strain':9+i%6,'average_heart_rate':140+i%20,'max_heart_rate':175,'kilojoule':1500+i*10,'distance_meter':6000+i*40 if i%3==0 else None,
        'zone_durations':{'zone_zero_milli':6e4,'zone_one_milli':6e5,'zone_two_milli':12e5+(i%5)*1e5,'zone_three_milli':6e5,'zone_four_milli':3e5,'zone_five_milli':(i%4)*5e4}}}] if i%2==0 else [])}
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*a): pass
srv=socketserver.TCPServer(('127.0.0.1',0),functools.partial(Q,directory=root)); port=srv.server_address[1]
threading.Thread(target=srv.serve_forever,daemon=True).start()
with sync_playwright() as p:
    for w,h in((1024,768),(820,1180)):
        b=p.chromium.launch(); ctx=b.new_context(viewport={'width':w,'height':h})
        for n,body in(('app',mock),('auth',''),('firestore','')):
            ctx.route(re.compile(r'gstatic\.com/firebasejs/.*/firebase-%s-compat\.js'%n),lambda r,_q=None,body=body:r.fulfill(body=body,content_type='application/javascript'))
        ctx.route(re.compile(r'workers\.dev'),lambda r,_q=None:r.fulfill(headers={'access-control-allow-origin':'*','content-type':'application/json'},body=json.dumps({'days':days})) if r.request.method!='OPTIONS' else r.fulfill(status=204,headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'}))
        pg=ctx.new_page(); errs=[]; pg.on('pageerror',lambda e:errs.append(str(e)))
        pg.goto(f'http://127.0.0.1:{port}/recovery.html'); pg.wait_for_selector('#content:not([hidden])'); pg.click('button[data-d="90"]'); pg.wait_for_timeout(500)
        print(w,'Fehler:',errs,'scrollW',pg.evaluate('document.documentElement.scrollWidth'))
        pg.screenshot(path=f'{out}/rec-{w}-full.png',full_page=True); b.close()
