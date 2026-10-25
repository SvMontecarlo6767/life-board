// Browsertest Whoop-Zwischenspeicher: zweites Öffnen lädt nur die letzten Tage, ohne Netz bleibt der gespeicherte Stand.
// Aufruf: node tools/browser/test_cache.mjs
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');
const mock=fs.readFileSync(path.join(root,'tools/browser/firebase-mock.js'),'utf8');
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'application/javascript'});r.end(fs.readFileSync(f))});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const URL='http://127.0.0.1:'+srv.address().port;
const add=(k,n)=>new Date(Date.parse(k+'T00:00:00Z')+n*864e5).toISOString().slice(0,10);
const whoop={};for(let i=0;i<120;i++){const k=add('2026-06-28',i);whoop[k]={recovery:{score:{recovery_score:50+i%40,hrv_rmssd_milli:60,resting_heart_rate:55}},cycle:{score:{strain:10}},workouts:[]}}
let fails=0;const ck=(n,c,x='')=>{console.log((c?'ok ':'FEHLER ')+n+(x!==''?' '+x:''));if(!c)fails++};
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:820,height:1180}});await ctx.addInitScript('window.__seed={};');
for(const n of['app','auth','firestore'])await ctx.route(new RegExp('gstatic\\.com/firebasejs/.*/firebase-'+n+'-compat\\.js'),r=>r.fulfill({body:n==='app'?mock:'',contentType:'application/javascript'}));
const reqs=[];let offline=false;
await ctx.route(/life-board-whoop\.momo-haskamp\.workers\.dev/,r=>{const h={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:h});
  const u=new globalThis.URL(r.request().url());if(u.pathname==='/data'){reqs.push(u.searchParams.get('from'));if(offline)return r.abort();const f=u.searchParams.get('from'),t=u.searchParams.get('to');const d={};for(const k in whoop)if(k>=f&&k<=t)d[k]=whoop[k];return r.fulfill({headers:h,body:JSON.stringify({days:d})})}
  return r.fulfill({headers:h,body:'{}'})});
const pg=await ctx.newPage();pg.on('pageerror',e=>console.log('ERR',String(e)));pg.on('console',m=>{if(m.type()==='error')console.log('CON',m.text())});await pg.clock.setFixedTime(new Date('2026-10-25T12:00:00+01:00'));
await pg.goto(URL+'/recovery.html');await pg.waitForSelector('#c-rec svg',{timeout:15000});
ck('erstes Öffnen lädt das ganze Jahr',reqs[0]<'2025-11-01',reqs[0]);
await pg.reload();await pg.waitForSelector('#c-rec svg',{timeout:15000});
ck('zweites Öffnen lädt nur die letzten Tage',reqs[1]>='2026-10-15',reqs[1]);
ck('trotzdem alle Tage da',(await pg.evaluate(()=>ALL.length))===120);
offline=true;await pg.reload();await pg.waitForSelector('#c-rec svg',{timeout:15000}).catch(()=>{});
ck('ohne Netz: gespeicherter Stand',(await pg.evaluate(()=>typeof ALL!=='undefined'?ALL.length:0))===120);
await b.close();srv.close();console.log(fails?fails+' FEHLER':'alles ok');process.exit(fails?1:0);
