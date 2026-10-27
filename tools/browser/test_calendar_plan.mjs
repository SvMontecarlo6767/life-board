// Browsertest Kalender: Wochenplan wird einmalig eingetragen (Schule, Fußball, Trainer), ein Vorkommen einzeln ändern,
// Serie bleibt. Aufruf: node tools/browser/test_calendar_plan.mjs [screenshot-ordner]
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');const shots=process.argv[2];if(shots)fs.mkdirSync(shots,{recursive:true});
const mock=fs.readFileSync(path.join(root,'tools/browser/firebase-mock.js'),'utf8');
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'application/javascript'});r.end(fs.readFileSync(f))});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const URL='http://127.0.0.1:'+srv.address().port;
let fails=0;const ck=(n,c,x='')=>{console.log((c?'ok ':'FEHLER ')+n+(x!==''?' '+x:''));if(!c)fails++};
const b=await chromium.launch();
for(const [W,H] of [[390,844],[1180,820]]){
  const t='['+W+'] ';
  const ctx=await b.newContext({viewport:{width:W,height:H},isMobile:W<700,hasTouch:W<700});await ctx.addInitScript('window.__seed={};');
  for(const n of['app','auth','firestore'])await ctx.route(new RegExp('gstatic\\.com/firebasejs/.*/firebase-'+n+'-compat\\.js'),r=>r.fulfill({body:n==='app'?mock:'',contentType:'application/javascript'}));
  await ctx.route(/workers\.dev/,r=>r.fulfill({headers:{'access-control-allow-origin':'*','content-type':'application/json'},body:'{"days":{}}'}));
  const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));
  await pg.clock.setFixedTime(new Date('2026-10-27T10:00:00+01:00'));
  await pg.goto(URL+'/calendar.html');await pg.waitForSelector('#side .it',{timeout:20000});await pg.waitForTimeout(500);
  const list=()=>pg.evaluate(()=>(window.__store['users/u1/calendar/ev_2026']||{}).list||[]);
  let L=await list();
  ck(t+'Wochenplan eingetragen (6 Serien)',L.length===6&&L.every(e=>e.src==='wochenplan-2026-10'),L.length);
  ck(t+'Merker gesetzt',!!(await pg.evaluate(()=>(window.__store['users/u1/calendar/meta']||{}).seeded))['wochenplan-2026-10']);
  const side=(await pg.textContent('#side')).replace(/\s+/g,' ');
  ck(t+'Heute (Di 27.10.): Schule bis 15:30 und Fußball 17:30',/08:00.{0,40}Schule/.test(side)&&/17:30.{0,40}Fußball/.test(side),side.slice(0,200));
  if(shots)await pg.screenshot({path:shots+'/plan_'+W+'.png'});
  // Kein zweites Eintragen nach Neuladen
  await pg.reload();await pg.waitForSelector('#side .it');await pg.waitForTimeout(400);
  ck(t+'Kein doppeltes Eintragen nach Neuladen',(await list()).length===6);
  // Fußball heute einzeln auf 18:00 verschieben
  await pg.click('#side .it:has-text("Fußball")');await pg.waitForSelector('#eT');
  ck(t+'Hinweis „Wiederholter Termin“ im Editor',/Wiederholter Termin/.test(await pg.textContent('#ed')));
  await pg.fill('#eS','18:00');await pg.click('#eSave');await pg.waitForSelector('#sOne');
  if(shots)await pg.screenshot({path:shots+'/plan_wahl_'+W+'.png'});
  await pg.click('#sOne');await pg.waitForTimeout(500);
  L=await list();const fb=L.find(e=>e.title==='Fußball'&&e.rep==='weekly'),one=L.find(e=>e.title==='Fußball'&&!e.rep);
  ck(t+'Nur dieser Tag: Serie lässt 27.10. aus, Einzeltermin 18:00',fb&&JSON.stringify(fb.exc)==='["2026-10-27"]'&&one&&one.date==='2026-10-27'&&one.time==='18:00'&&one.end==='19:00',JSON.stringify({fb:fb&&fb.exc,one}));
  const C=await pg.evaluate(()=>{const C=CalCore,o=C.occurrences(CalStore.state.events,'2026-10-27','2026-10-28').filter(x=>x.title==='Fußball');return o.map(x=>x.date+' '+x.time)});
  ck(t+'Mittwoch bleibt 17:30, Dienstag jetzt 18:00',JSON.stringify(C)==='["2026-10-27 18:00","2026-10-28 17:30"]',JSON.stringify(C));
  // Alle Wiederholungen ändern (Trainer auf 17:15)
  await pg.locator('[data-d="2026-10-29"]').first().click();await pg.waitForTimeout(300);
  await pg.click('#side .it:has-text("Trainer")');await pg.waitForSelector('#eT');await pg.fill('#eS','17:15');await pg.click('#eSave');await pg.click('#sAll');await pg.waitForTimeout(400);
  L=await list();const tr=L.filter(e=>e.title==='Trainer (Fußball)');
  ck(t+'Alle Wiederholungen: Serie geändert, kein Einzeltermin',tr.length===1&&tr[0].time==='17:15'&&tr[0].rep==='weekly',JSON.stringify(tr));
  // Alles löschen → kommt nicht zurück
  await pg.evaluate(async()=>{for(const e of CalStore.state.events.slice())await CalStore.remove(e.id)});
  await pg.reload();await pg.waitForTimeout(1500);
  ck(t+'Gelöschter Wochenplan kommt nicht zurück',(await list()).length===0);
  ck(t+'keine Seitenfehler',!errs.length,errs.join(' | '));
  await ctx.close();
}
await b.close();srv.close();console.log(fails?fails+' FEHLER':'alles ok');process.exit(fails?1:0);
