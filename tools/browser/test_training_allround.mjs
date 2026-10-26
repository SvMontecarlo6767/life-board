// Browsertest Training (Allround): Whoop-Einheiten ergänzen (Sportart, Fokus, Anstrengung, Notiz), Übungen verknüpfen ohne
// Doppelzählung, Balance-Ampel, Bestwerte. Aufruf: node tools/browser/test_training_allround.mjs [screenshot-ordner]
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import http from 'node:http';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';import {execFileSync} from 'node:child_process';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'..','..');const shots=process.argv[2];
const mock=fs.readFileSync(path.join(root,'tools/browser/firebase-mock.js'),'utf8');
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'application/javascript'});r.end(fs.readFileSync(f))});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const URL='http://127.0.0.1:'+srv.address().port;
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lbt-')),file=path.join(dir,'seed.json');
execFileSync('node',[path.join(here,'gen_training_seed.mjs'),file,'2026-10-25']);
const seed=JSON.parse(fs.readFileSync(file,'utf8'));seed['users/u1/training/settings'].view='allround';
// zwei Whoop-Einheiten „functional-fitness“ (noch nicht ergänzt) und eine Gym-Einheit mit Klimmzügen
const t1=Date.parse('2026-10-24T15:00:00Z'),t2=Date.parse('2026-10-23T15:00:00Z');
seed['users/u1/training/acts_2026'].list.push({i:'w901',t:t1,r:'functional-fitness',n:'',k:null,s:3900,h:138,m:176,e:null,c:null,g:null,q:500,p:null,x:null,w:13.1},{i:'w902',t:t2,r:'functional-fitness',n:'',k:null,s:2700,h:150,m:182,e:null,c:null,g:null,q:400,p:null,x:null,w:11.2});
seed['users/u1/training/gym_2026']={list:[{i:'x1',d:'2026-10-10',t:Date.parse('2026-10-10T16:00:00Z'),m:50,x:7,n:'',p:'Pull',e:[{n:'Klimmzüge',s:[{w:0,r:9},{w:0,r:8}]},{n:'Rudern',s:[{w:40,r:10}]}]},{i:'x2',d:'2026-10-17',t:Date.parse('2026-10-17T16:00:00Z'),m:50,x:7,n:'',p:'Pull',e:[{n:'Klimmzüge',s:[{w:0,r:11},{w:10,r:5}]}]}]};
let fails=0;const ck=(n,c,x='')=>{console.log((c?'ok ':'FEHLER ')+n+(x!==''?' '+x:''));if(!c)fails++};
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await ctx.addInitScript('window.__seed='+JSON.stringify(seed)+';');
for(const n of['app','auth','firestore'])await ctx.route(new RegExp('gstatic\\.com/firebasejs/.*/firebase-'+n+'-compat\\.js'),r=>r.fulfill({body:n==='app'?mock:'',contentType:'application/javascript'}));
await ctx.route(/workers\.dev/,r=>r.fulfill({headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'},body:'{"days":{}}'}));
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>d.accept());
await pg.clock.setFixedTime(new Date('2026-10-25T12:00:00+01:00'));
await pg.goto(URL+'/training.html');await pg.waitForSelector('#m-todo',{timeout:20000}).catch(()=>{});
ck('Karte „Noch ergänzen“ mit 2 Whoop-Einheiten',(await pg.$$eval('#m-todo .todo',x=>x.length))===2);
ck('Functional Fitness startet als Kraft',(await pg.$eval('#m-todo .todo [data-tsp].on',x=>x.dataset.tsp))==='Kraft');
if(shots)await pg.screenshot({path:shots+'/todo.png'});
// erste: Plyometrie, Sprungkraft, 8, Notiz
await pg.click('.todo[data-id=w901] [data-tsp=Plyometrie]');await pg.click('.todo[data-id=w901] [data-tfo=Sprungkraft]');await pg.click('.todo[data-id=w901] [data-trp="8"]');
await pg.fill('.todo[data-id=w901] .tnote','Knie gut');await pg.click('.todo[data-id=w901] [data-tsave]');await pg.waitForTimeout(400);
const st=()=>pg.evaluate(()=>window.__store['users/u1/training/acts_2026'].list);
let a=(await st()).find(x=>x.i==='w901');ck('Ergänzung gespeichert',a.o==='Plyometrie'&&a.f==='Sprungkraft'&&a.x===8&&a.no==='Knie gut'&&a.ok===1,JSON.stringify(a));
ck('danach nur noch 1 offen',(await pg.$$eval('#m-todo .todo',x=>x.length))===1);
// zweite: Kraft, Pull -> Übungen eintragen (verknüpft)
await pg.click('.todo[data-id=w902] [data-tfo=Pull]');await pg.click('.todo[data-id=w902] [data-trp="7"]');await pg.click('.todo[data-id=w902] [data-tgym]');await pg.waitForTimeout(400);
ck('Gym-Logbuch mit Pull-Vorlage und Verknüpfung',/Gehört zur Whoop-Einheit/.test(await pg.textContent('#gymBox'))&&/Klimmzüge/.test(await pg.textContent('#gymBox')));
const before=(await st()).length;
await pg.evaluate(()=>{const inp=[...document.querySelectorAll('#gymBox input')].filter(i=>/Wdh|wdh|r/i.test(i.placeholder||i.getAttribute('aria-label')||''));});
// einen Satz eintragen und speichern
const inputs=await pg.$$('#gymBox .gset input, #gymBox input[inputmode=decimal], #gymBox input[inputmode=numeric]');
if(inputs.length>=2){await inputs[0].fill('0');await inputs[1].fill('12')}
await pg.click('#gSave').catch(()=>{});await pg.waitForTimeout(500);
const gym=await pg.evaluate(()=>window.__store['users/u1/training/gym_2026'].list);
const lastG=gym[gym.length-1];
ck('Gym-Einheit verknüpft gespeichert',lastG&&lastG.w==='w902',JSON.stringify(lastG&&{w:lastG.w,e:lastG.e}));
ck('keine zweite Einheit angelegt (zählt einmal)',(await st()).length===before&&!(await st()).some(x=>x.i==='g'+(lastG&&lastG.i)));
ck('Balance-Ampel da',(await pg.$$eval('#m-bal .bal .bc',x=>x.length))===4);
const bal=await pg.textContent('#m-bal');ck('Plyometrie zählt als Explosiv',/Explosiv\s*1/.test(bal.replace(/\s+/g,' ')),bal.slice(0,200));
const best=await pg.textContent('#m-best');ck('Bestwerte: Klimmzüge 12 (neu), +10 kg',/Klimmzüge am Stück\s*12/.test(best)&&/\+10 kg/.test(best),best.slice(0,200));
ck('Bestwerte: 5 km und 10 km',/5 km/.test(best)&&/10 km/.test(best));
if(shots){await pg.evaluate(()=>document.getElementById('m-bal').scrollIntoView());await pg.screenshot({path:shots+'/balance.png'});await pg.evaluate(()=>document.getElementById('m-best').scrollIntoView());await pg.screenshot({path:shots+'/best.png'})}
// Muskeln: Hilfsmuskeln und eigene Zuordnung
await pg.evaluate(()=>document.getElementById('gymBox').scrollIntoView());
const mb='#gymBox .gmus[data-at=p]',mName=await pg.getAttribute(mb,'data-n');
ck('Muskel-Zeile mit Haupt und Hilfs',/\(Haupt\)/.test(await pg.textContent(mb)),await pg.textContent(mb));
const musTxt=()=>pg.textContent('#gymBox').then(t=>t.replace(/\s+/g,' '));
ck('Sätze pro Muskelgruppe mit Hilfsmuskel-Hinweis',/Hilfsmuskeln einen halben/.test(await musTxt()));
await pg.click(mb);await pg.waitForSelector('#gymBox .gmp');
if(shots)await pg.screenshot({path:shots+'/muskeln.png'});
await pg.click('#gymBox .gmp [data-m=Bauch][data-r=h2]');await pg.waitForTimeout(300);
let cfg=await pg.evaluate(()=>window.__store['users/u1/training/settings'].muscles||{});
const mk=mName.toLowerCase().replace(/[^a-zäöüß0-9 ]/g,' ').replace(/\s+/g,' ').trim();
ck('Eigene Zuordnung gespeichert (Bauch als 2. Haupt)',cfg[mk]&&cfg[mk].Bauch==='h2',JSON.stringify(cfg));
ck('Anzeige zeigt eigene Zuordnung',/Bauch \(2\. Haupt\)/.test(await pg.textContent(mb))&&/eigene/.test(await pg.textContent(mb)));
ck('Bauch erscheint bei den Muskelgruppen',/Bauch/.test(await pg.textContent('#gymBox')));
await pg.click('#gymBox .gmp [data-a=mreset]');await pg.waitForTimeout(300);
cfg=await pg.evaluate(()=>window.__store['users/u1/training/settings'].muscles||{});
ck('Standard wiederhergestellt',!cfg[mk]&&!/eigene/.test(await pg.textContent(mb)),JSON.stringify(cfg));
await pg.click('#gymBox .gmus[data-at=p]');ck('Auswahl schließt wieder',!(await pg.$('#gymBox .gmp')));
ck('keine Seitenfehler',!errs.length,errs.join(' | '));
await b.close();srv.close();console.log(fails?fails+' FEHLER':'alles ok');process.exit(fails?1:0);
