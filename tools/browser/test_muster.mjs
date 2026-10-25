// Browsertest Muster-Seite (iPhone-Größe, Firebase-Mock, Worker-Mock mit 50 Tagen Testdaten).
// Aufruf: node tools/browser/test_muster.mjs [screenshot-ordner]
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');const shots=process.argv[2];if(shots)fs.mkdirSync(shots,{recursive:true});
const mock=fs.readFileSync(path.join(root,'tools/browser/firebase-mock.js'),'utf8');
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'application/javascript'});r.end(fs.readFileSync(f))});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const URL='http://127.0.0.1:'+srv.address().port;
const add=(k,n)=>{const t=new Date(Date.parse(k+'T00:00:00Z')+n*864e5);return t.toISOString().slice(0,10)};
let rs=7;const rnd=()=>(rs=(rs*16807)%2147483647)/2147483647;   // feste Zufallsfolge
const seed={'users/u1/settings/main':{trackers:[{id:'kaffee',name:'Kaffee',unit:'Tassen',kind:'count'},{id:'freunde',name:'Zeit mit Freunden',kind:'bool'}]}},whoop={};
for(let i=0;i<50;i++){const k=add('2026-09-06',i),alk=i%4===0,prevAlk=(i-1)%4===0,fr=rnd()<0.35,kf=Math.floor(rnd()*4);
  seed['users/u1/days/'+k]={date:k,rulesVersion:2,in:alk?{alkohol:1}:{},net:500,closed:true};
  seed['users/u1/journal/'+k]={m:{mood:fr?5:3,energy:prevAlk?2:4,sleep:3},e:{good:['Sonne','Training','Essen'],stress:alk?4:2,line:''},notes:[],t:{kaffee:kf,freunde:fr?1:0},updatedAt:1};
  whoop[k]={recovery:{score:{recovery_score:prevAlk?38:72,hrv_rmssd_milli:prevAlk?50:70,resting_heart_rate:55}},cycle:{score:{strain:10}},workouts:[]}}
let fails=0;const ck=(n,c,x='')=>{console.log((c?'ok ':'FEHLER ')+n+(x!==''?' '+x:''));if(!c)fails++};
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},deviceScaleFactor:2,hasTouch:true,isMobile:true});
await ctx.addInitScript('window.__seed='+JSON.stringify(seed)+';');
for(const n of['app','auth','firestore'])await ctx.route(new RegExp('gstatic\\.com/firebasejs/.*/firebase-'+n+'-compat\\.js'),r=>r.fulfill({body:n==='app'?mock:'',contentType:'application/javascript'}));
await ctx.route(/life-board-whoop\.momo-haskamp\.workers\.dev/,r=>{const h={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:h});return r.fulfill({headers:h,body:JSON.stringify({days:whoop})})});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
await pg.clock.setFixedTime(new Date('2026-10-25T12:00:00+01:00'));
await pg.goto(URL+'/muster.html');await pg.waitForFunction(()=>window.__musterReady,null,{timeout:15000});
const bad=await pg.textContent('#badL'),good=await pg.textContent('#goodL');
ck('Alkohol → Recovery am Folgetag erkannt',/Alkohol.*nächsten Tag.*Whoop-Recovery/.test(bad),bad.slice(0,200));
ck('Freunde → Stimmung als gut erkannt',/Zeit mit Freunden.*Stimmung/.test(good),good.slice(0,200));
ck('kein Zufallsmuster bei Kaffee',!/Kaffee/.test(good+bad));
ck('Kurven gezeichnet',(await pg.$$eval('#ch path',p=>p.length))===2);
ck('Gleichlauf berechnet',/r = /.test(await pg.textContent('#corr')));
ck('Rückblick mit Check-ins',/Check-ins/.test(await pg.textContent('#rev')));
await pg.click('#per [data-p=m]');ck('Monatsrückblick',/01\.10\./.test(await pg.textContent('#rev')));
if(shots)await pg.screenshot({path:shots+'/muster.png',fullPage:true});
ck('keine Seitenfehler',!errs.length,errs.join(' | '));
await b.close();srv.close();console.log(fails?fails+' FEHLER':'alles ok');process.exit(fails?1:0);
