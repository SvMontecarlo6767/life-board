// Browsertest Erinnerungen im Check-in (Push-Anmeldung des Geräts simuliert): Einstellungen, Glocke an Zielen, Abgleich mit dem Worker.
// Aufruf: node tools/browser/test_push.mjs [screenshot-ordner]
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');
import http from 'node:http';import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..','..');const shots=process.argv[2];
const mock=fs.readFileSync(path.join(root,'tools/browser/firebase-mock.js'),'utf8');
const srv=http.createServer((q,r)=>{const f=path.join(root,decodeURIComponent(q.url.split('?')[0]));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.writeHead(404);return r.end()}
  r.writeHead(200,{'content-type':f.endsWith('.html')?'text/html':f.endsWith('.json')?'application/json':f.endsWith('.css')?'text/css':'application/javascript'});r.end(fs.readFileSync(f))});
await new Promise(ok=>srv.listen(0,'127.0.0.1',ok));const URL='http://127.0.0.1:'+srv.address().port;
let fails=0;const ck=(n,c,x='')=>{console.log((c?'ok ':'FEHLER ')+n+(x!==''?' '+x:''));if(!c)fails++};
const b=await chromium.launch();const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
await ctx.addInitScript('window.__seed={};');
for(const n of['app','auth','firestore'])await ctx.route(new RegExp('gstatic\\.com/firebasejs/.*/firebase-'+n+'-compat\\.js'),r=>r.fulfill({body:n==='app'?mock:'',contentType:'application/javascript'}));
const calls=[];
await ctx.route(/life-board-whoop\.momo-haskamp\.workers\.dev/,r=>{const h={'access-control-allow-origin':'*','access-control-allow-headers':'*','content-type':'application/json'};if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:h});
  const u=new globalThis.URL(r.request().url());if(u.pathname.startsWith('/push/'))calls.push({p:u.pathname,b:r.request().postDataJSON&&r.request().method()==='POST'?r.request().postDataJSON():null});
  const body=u.pathname==='/push/status'?{subs:1,quiet:{days:[1,2,3,4,5],from:'08:00',to:'15:30'},morning:{on:true,wd:'06:45',we:'09:30'},lead:0}:u.pathname==='/push/test'?{sent:1,subs:1}:u.pathname==='/data'?{days:{}}:{ok:true};
  return r.fulfill({headers:h,body:JSON.stringify(body)})});
const pg=await ctx.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e)));pg.on('dialog',d=>d.accept());
await pg.clock.setFixedTime(new Date('2026-10-26T07:10:00+01:00'));   // Montag
await pg.goto(URL+'/checkin.html');await pg.waitForFunction(()=>window.__checkinReady,null,{timeout:15000});await pg.waitForTimeout(500);
ck('Erinnerungs-Karte da',/Erinnerungen/.test(await pg.textContent('#push')));
await pg.close();
// Gerät „angemeldet“ simulieren
const pg2=await ctx.newPage();pg2.on('pageerror',e=>errs.push(String(e)));pg2.on('dialog',d=>d.accept());
await pg2.addInitScript(()=>{let v;Object.defineProperty(window,'LBPush',{configurable:true,get:()=>v,set:x=>{v=x;v.state=async()=>({ok:true,on:true})}})});
await pg2.clock.setFixedTime(new Date('2026-10-26T07:10:00+01:00'));
await pg2.goto(URL+'/checkin.html');await pg2.waitForFunction(()=>window.__checkinReady,null,{timeout:15000});await pg2.waitForTimeout(600);
ck('Einstellungen sichtbar',/Erinnerungen · an/.test(await pg2.textContent('#push'))&&/Ruhezeit/.test(await pg2.textContent('#push')));
await pg2.fill('#gdT','Kraft Unterkörper');await pg2.fill('#gdA','18:00');await pg2.click('#gdAdd');await pg2.waitForTimeout(300);
let j=await pg2.evaluate(()=>window.__store['users/u1/journal/2026-10-26']);
ck('Ziel mit Glocke gespeichert',j.g[0].r===true&&j.g[0].at==='18:00');
let sch=calls.filter(c=>c.p==='/push/schedule').pop();
ck('Zeitplan an den Worker',sch&&sch.b.items.length===1&&sch.b.items[0].title==='Kraft Unterkörper'&&sch.b.days.includes('2026-10-27'),JSON.stringify(sch&&sch.b));
await pg2.fill('#gdT','Vokabeln');await pg2.fill('#gdA','10:00');await pg2.click('#gdAdd');await pg2.waitForTimeout(300);
ck('Hinweis bei Schulzeit',/kommt um 15:30/.test(await pg2.textContent('#goals')));
await pg2.click('[data-d-bell="0"]');await pg2.waitForTimeout(300);   // Vokabeln (10:00) steht zuerst
sch=calls.filter(c=>c.p==='/push/schedule').pop();ck('Glocke aus nimmt Erinnerung raus',sch.b.items.length===1&&sch.b.items[0].title==='Kraft Unterkörper');
await pg2.click('#pM');await pg2.waitForTimeout(200);
ck('Morgen-Erinnerung umschaltbar',calls.filter(c=>c.p==='/push/config').pop().b.morning.on===false);
await pg2.click('#pTest');await pg2.waitForTimeout(200);ck('Test gesendet',calls.some(c=>c.p==='/push/test'));
await pg2.click('[data-s=mood] [data-v="4"]');await pg2.click('[data-s=energy] [data-v="3"]');await pg2.click('#mSave');await pg2.waitForTimeout(400);
ck('Morgen-Check meldet „erledigt“',calls.some(c=>c.p==='/push/done'&&c.b.day==='2026-10-26'));
if(shots)await pg2.screenshot({path:shots+'/push.png',fullPage:true});
ck('keine Seitenfehler',!errs.length,errs.join(' | '));
await b.close();srv.close();console.log(fails?fails+' FEHLER':'alles ok');process.exit(fails?1:0);
