// Browsertest Graph-Vollbild mit Daten (Recovery + Training): gestapelte Säulen, umschaltbare Kurven, Fakten, Workout-Details.
// Aufruf: node tools/browser/test_full.mjs [screenshot-ordner]
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');const shots=process.argv[2];if(shots)fs.mkdirSync(shots,{recursive:true});
const mock=fs.readFileSync(path.join(root,'tools/browser/firebase-mock.js'),'utf8');
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'application/javascript'});r.end(fs.readFileSync(f))});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const URL='http://127.0.0.1:'+srv.address().port;
const H=3600000,add=(k,n)=>new Date(Date.parse(k+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
let rs=3;const rnd=()=>(rs=(rs*16807)%2147483647)/2147483647;
const whoop={};
for(let i=0;i<60;i++){const k=add('2026-08-27',i),p=add(k,-1);const st=8+rnd()*10;
  whoop[k]={recovery:{score:{recovery_score:Math.round(40+rnd()*50),hrv_rmssd_milli:50+rnd()*30,resting_heart_rate:50+rnd()*8,spo2_percentage:96,skin_temp_celsius:33.5}},
   sleep:{start:p+'T21:30:00.000Z',end:k+'T06:00:00.000Z',tz:'+02:00',score:{sleep_performance_percentage:80+rnd()*20,sleep_consistency_percentage:60+rnd()*35,sleep_efficiency_percentage:85+rnd()*12,respiratory_rate:15,
     stage_summary:{total_light_sleep_time_milli:(3.5+rnd())*H,total_slow_wave_sleep_time_milli:(1.2+rnd()*.8)*H,total_rem_sleep_time_milli:(1.5+rnd()*.7)*H,total_awake_time_milli:.5*H},
     sleep_needed:{baseline_milli:8*H,need_from_sleep_debt_milli:rnd()*H,need_from_recent_strain_milli:.2*H,need_from_recent_nap_milli:0}}},
   cycle:{score:{strain:st,kilojoule:9000},steps:8000},
   workouts:i%2?[{sport:i%4===1?'functional-fitness':'running',start:k+'T15:00:00.000Z',end:k+'T16:05:00.000Z',score:{strain:12+rnd()*4,average_heart_rate:140,max_heart_rate:181,kilojoule:2500,distance_meter:i%4===1?null:9000,
     zone_durations:{zone_zero_milli:60000,zone_one_milli:6e5,zone_two_milli:15e5,zone_three_milli:9e5,zone_four_milli:5e5,zone_five_milli:1e5}}}]:[]}}
let fails=0;const ck=(n,c,x='')=>{console.log((c?'ok ':'FEHLER ')+n+(x!==''?' '+x:''));if(!c)fails++};
const b=await chromium.launch();
async function page(file,w,hh,seed){const ctx=await b.newContext({viewport:{width:w,height:hh},deviceScaleFactor:2,hasTouch:true});await ctx.addInitScript('window.__seed='+JSON.stringify(seed||{})+';');
  for(const n of['app','auth','firestore'])await ctx.route(new RegExp('gstatic\\.com/firebasejs/.*/firebase-'+n+'-compat\\.js'),r=>r.fulfill({body:n==='app'?mock:'',contentType:'application/javascript'}));
  await ctx.route(/life-board-whoop\.momo-haskamp\.workers\.dev/,r=>{const h={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:h});return r.fulfill({headers:h,body:JSON.stringify(r.request().url().includes('/data')?{days:whoop}:r.request().url().includes('/status')?{connected:true}:{ok:true})})});
  const pg=await ctx.newPage();pg.errs=[];pg.on('pageerror',e=>pg.errs.push(String(e)));await pg.clock.setFixedTime(new Date('2026-10-25T12:00:00+01:00'));await pg.goto(URL+'/'+file);return pg}
const openFull=async(pg,host)=>{await pg.evaluate(h=>{const b=document.querySelector(h).closest('.card').querySelector('.gf-btn');b.click()},host);await pg.waitForSelector('#gf .gf-t',{timeout:5000})};
const closeFull=async pg=>{await pg.click('#gfX');await pg.waitForTimeout(800)};
// Recovery
const LW=+(process.env.W||820),LH=+(process.env.H||1180);
const pg=await page('recovery.html',LW,LH);
await pg.waitForSelector('#c-stages svg',{timeout:15000});await pg.waitForTimeout(800);
await openFull(pg,'#c-stages');
let txt=await pg.textContent('#gfStats');ck('Schlafphasen: Fakten',/Ø Tiefschlaf/.test(txt)&&/Verteilung/.test(txt)&&/So wird das berechnet/.test(txt));
ck('Schlafphasen: gestapelte Säulen',(await pg.$$eval('#gfStage rect',r=>new Set(r.map(x=>getComputedStyle(x).fill)).size))>=4);
if(shots)await pg.screenshot({path:shots+'/full-stages.png'});await closeFull(pg);
await openFull(pg,'#c-need');txt=await pg.textContent('#gfStats');
ck('Schlafbedarf: zwei Kurven + Fakten',(await pg.$$eval('#gfLayers [aria-pressed=true]',x=>x.length))===2&&/Bedarf gedeckt/.test(txt));
await pg.click('#gfLayers [data-l=debt]');ck('Ebene zuschaltbar',(await pg.$$eval('#gfLayers [aria-pressed=true]',x=>x.length))===3);
if(shots)await pg.screenshot({path:shots+'/full-need.png'});await closeFull(pg);
await openFull(pg,'#c-eff');ck('Effizienz/Konsistenz: Fakten',/Recovery bei Konsistenz/.test(await pg.textContent('#gfStats')));await closeFull(pg);
await openFull(pg,'#c-scatter');txt=await pg.textContent('#gfStats');ck('Belastung→Erholung: Auswertung',/Pro \+1 Strain/.test(txt)&&/Recovery nach Strain/.test(txt));
if(shots)await pg.screenshot({path:shots+'/full-scatter.png'});await closeFull(pg);
await pg.click('#c-workouts tr.wo');await pg.waitForSelector('.wov');txt=await pg.textContent('.wov');
ck('Workout-Details',/Pulszonen/.test(txt)&&/Recovery am Morgen danach/.test(txt)&&/Einheiten insgesamt/.test(txt));
if(shots)await pg.screenshot({path:shots+'/workout.png'});
ck('Recovery ohne Seitenfehler',!pg.errs.length,pg.errs.join(' | '));
globalThis.__b=b;
if(!process.env.ONLY_REC){const m=await import('./test_full_training.mjs').catch(()=>null);if(m)fails+=await m.default({page,openFull,closeFull,ck:(n,c,x)=>ck(n,c,x),shots})}
await b.close();srv.close();console.log(fails?fails+' FEHLER':'alles ok');process.exit(fails?1:0);
