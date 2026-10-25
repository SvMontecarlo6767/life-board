// Browsertest Tagesüberblick (news.html) und Verknüpfung im Check-in. Aufruf: node tools/browser/test_news.mjs [screenshot-ordner]
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');const shots=process.argv[2];
const mock=fs.readFileSync(path.join(root,'tools/browser/firebase-mock.js'),'utf8');
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'application/javascript'});r.end(fs.readFileSync(f))});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const URL='http://127.0.0.1:'+srv.address().port;
const at=Date.parse('2026-10-26T05:45:00Z');
const NEWS={at,day:'2026-10-26',n:4,minutes:3,sources:[{name:'tagesschau',ok:true},{name:'tagesschau Wissen',ok:false}],sections:[
  {id:'welt',title:'Deutschland & Welt',items:[{t:'Bundestag beschließt Haushalt',s:'Der Bundestag hat den Haushalt verabschiedet.',url:'https://www.tagesschau.de/a/1',src:'tagesschau',time:at-3600e3},{t:'Waffenruhe vereinbart',s:'Beide Seiten stimmen zu.',url:'https://www.tagesschau.de/a/2',src:'tagesschau',time:at-7200e3},{t:'<script>x</script>Streik',s:'',url:'',src:'tagesschau',time:null}]},
  {id:'tech',title:'Technik & Wissen',items:[{t:'Neues Sprachmodell',s:'Es soll schneller sein.',url:'https://www.heise.de/news/1.html',src:'heise',time:at-3600e3}]}]};
let fails=0;const ck=(n,c,x='')=>{console.log((c?'ok ':'FEHLER ')+n+(x!==''?' '+x:''));if(!c)fails++};
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await ctx.addInitScript('window.__seed={};');
for(const n of['app','auth','firestore'])await ctx.route(new RegExp('gstatic\\.com/firebasejs/.*/firebase-'+n+'-compat\\.js'),r=>r.fulfill({body:n==='app'?mock:'',contentType:'application/javascript'}));
let refresh=0,fail=false;
await ctx.route(/life-board-whoop\.momo-haskamp\.workers\.dev/,r=>{const h={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:h});
  const u=new globalThis.URL(r.request().url());if(u.pathname==='/news'){if(u.searchParams.get('refresh'))refresh++;if(fail)return r.fulfill({status:500,headers:h,body:'{"error":"kaputt"}'});return r.fulfill({headers:h,body:JSON.stringify(NEWS)})}
  return r.fulfill({headers:h,body:u.pathname==='/data'?'{"days":{}}':'{}'})});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
await pg.clock.setFixedTime(new Date(at+600000));
await pg.goto(URL+'/news.html');await pg.waitForFunction(()=>window.__newsReady,null,{timeout:15000});
ck('Kopfzeile mit Anzahl und Lesezeit',/4 Meldungen · ca\. 3 Min/.test(await pg.textContent('#sub')));
ck('zwei Bereiche, kein Sport',(await pg.$$eval('#main section h3',x=>x.map(h=>h.textContent)).then(a=>a.join('|')))==='Deutschland & Welt|Technik & Wissen');
ck('Schlagzeile mit Kurztext und Link',(await pg.$eval('#main .it',a=>a.href))==='https://www.tagesschau.de/a/1'&&/verabschiedet/.test(await pg.textContent('#main .it')));
ck('Text wird nicht als HTML ausgeführt',!(await pg.$('#main script'))&&/<script>x<\/script>Streik/.test(await pg.textContent('#main')));
ck('ausgefallene Quelle wird genannt',/Gerade nicht erreichbar: tagesschau Wissen/.test(await pg.textContent('#src')));
if(shots)await pg.screenshot({path:shots+'/news.png',fullPage:true});
await pg.click('#ref');await pg.waitForTimeout(300);ck('Neu laden fragt frisch an',refresh===1);
fail=true;await pg.reload();await pg.waitForFunction(()=>window.__newsReady,null,{timeout:15000});
ck('ohne Worker: letzter Stand bleibt',/Bundestag/.test(await pg.textContent('#main'))&&/zuletzt geladenen/.test(await pg.textContent('#msg')));
// Check-in: nach dem Morgen-Check der Knopf zum Überblick
const p2=await ctx.newPage();p2.on('pageerror',e=>errs.push(String(e)));await p2.clock.setFixedTime(new Date(at+600000));
await p2.goto(URL+'/checkin.html?v=1&news=1');await p2.waitForFunction(()=>window.__checkinReady,null,{timeout:15000});
await p2.click('[data-s=mood] [data-v="4"]');await p2.click('[data-s=energy] [data-v="3"]');await p2.click('#mSave');await p2.waitForTimeout(400);
ck('Check-in zeigt „Tagesüberblick lesen“ (hervorgehoben aus der Nachricht)',(await p2.$eval('#morning a[href^="news.html"] button',x=>x.className))==='primary');
ck('Hub hat die Kachel',fs.readFileSync(path.join(root,'index.html'),'utf8').includes('href="news.html?v=1"'));
ck('keine Seitenfehler',!errs.length,errs.join(' | '));
await b.close();srv.close();console.log(fails?fails+' FEHLER':'alles ok');process.exit(fails?1:0);
