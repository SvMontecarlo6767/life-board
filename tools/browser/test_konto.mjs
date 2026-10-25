// Browsertest Dopamin-Konto (Chromium, Firebase-Mock, Worker-Mock): Tage, an denen das Board nicht geöffnet war,
// zählen mit und werden in „Heute“ nachgetragen; der Hub zeigt denselben Stand. Aufruf: node tools/browser/test_konto.mjs
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const mock=fs.readFileSync(path.join(root,'tools/browser/firebase-mock.js'),'utf8');
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'application/javascript'});r.end(fs.readFileSync(f))});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const URL='http://127.0.0.1:'+srv.address().port;
// zuletzt am 20.10. im Board (abgeschlossen, 9177), danach vier Tage nicht geöffnet; heute = 25.10.
const seed={'users/u1/days/2026-10-20':{date:'2026-10-20',rulesVersion:2,in:{},a:{},x:{},auto:{},net:9177,rank:'S',closed:true,focus:'',updatedAt:1}};
const H=3600000,whoop={};
for(let d=10;d<=25;d++){const k='2026-10-'+String(d).padStart(2,'0'),prev='2026-10-'+String(d-1).padStart(2,'0');
  whoop[k]={recovery:{score:{recovery_score:75,hrv_rmssd_milli:80,resting_heart_rate:50}},cycle:{score:{strain:12},steps:9000},workouts:[],
    sleep:{start:prev+'T21:00:00.000Z',end:k+'T07:00:00.000Z',tz:'+02:00',nap:false,score:{sleep_performance_percentage:95,sleep_consistency_percentage:85,sleep_efficiency_percentage:92,
      stage_summary:{total_light_sleep_time_milli:4.5*H,total_slow_wave_sleep_time_milli:2*H,total_rem_sleep_time_milli:2.5*H}}}}}
let fails=0;const ck=(n,c,x='')=>{console.log((c?'ok ':'FEHLER ')+n+(x!==''?' '+x:''));if(!c)fails++};
const num=t=>+t.replace(/[^\d−-]/g,'').replace('−','-');
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:1024,height:1366}});
await ctx.addInitScript('window.__seed='+JSON.stringify(seed)+';');
for(const n of['app','auth','firestore'])await ctx.route(new RegExp('gstatic\\.com/firebasejs/.*/firebase-'+n+'-compat\\.js'),r=>r.fulfill({body:n==='app'?mock:'',contentType:'application/javascript'}));
await ctx.route(/life-board-whoop\.momo-haskamp\.workers\.dev/,r=>{const h={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:h});return r.fulfill({headers:h,body:JSON.stringify(r.request().url().includes('/data')?{days:whoop}:{ok:true})})});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
await pg.clock.setFixedTime(new Date('2026-10-25T12:00:00+02:00'));
await pg.goto(URL+'/heute.html');await pg.waitForFunction(()=>window.__heuteReady,null,{timeout:20000});
await pg.waitForFunction(()=>['21','22','23','24','25'].every(d=>window.__store['users/u1/days/2026-10-'+d]),null,{timeout:10000}).catch(()=>{});
const st=await pg.evaluate(()=>window.__store);
const nets=['21','22','23','24','25'].map(d=>(st['users/u1/days/2026-10-'+d]||{}).net);
ck('verpasste Tage nachgetragen',nets.every(n=>typeof n==='number'&&n!==0),JSON.stringify(nets));
const sum=9177+nets.reduce((s,n)=>s+(n||0),0);
await pg.waitForTimeout(300);
ck('Konto heute = 9177 + alle Tage seitdem',num(await pg.textContent('#hAcc'))===sum,await pg.textContent('#hAcc')+' / '+sum);
ck('state/current stimmt',(await pg.evaluate(()=>window.__store['users/u1/state/current'].account))===sum);
await pg.click('#prev');await pg.waitForTimeout(300);
ck('Samstag: Konto bis einschließlich Samstag',num(await pg.textContent('#hAcc'))===sum-nets[4],await pg.textContent('#hAcc'));
// Hub: Stand nach einem weiteren Whoop-Tag ohne Öffnen von „Heute“ live gerechnet
await pg.evaluate(()=>{const s=window.__store['users/u1/state/current'];s.account=1;localStorage.setItem('__mockstore',JSON.stringify(window.__store))});
await pg.goto(URL+'/index.html');
await pg.waitForFunction(()=>/Dopamin insgesamt/.test(document.getElementById('dopTxt').textContent)&&!/aktualisiert/.test(document.getElementById('dopTxt').textContent),null,{timeout:20000});
ck('Hub zeigt den live gerechneten Stand',num((await pg.textContent('#dopTxt span')))===sum,await pg.textContent('#dopTxt'));
ck('keine Seitenfehler',!errs.length,errs.join(' | '));
await b.close();srv.close();
console.log(fails?fails+' FEHLER':'alles ok');process.exit(fails?1:0);
