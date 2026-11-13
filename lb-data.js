/* Life Board – gemeinsame Live-Werte für Hub-Karussell und 3D-Objekte (lb-hub3d.js, lb-obj3d.js). NUR LESEN, nie schreiben.
   Quellen über bestehende Module: Whoop-Speicher auf dem Gerät (LBWhoop.peek), Trainingsplan (plan-core.js + plan/ und
   training/gym_JJJJ, gleiche Rechnung wie weekStats in plan.js), Kalender (calendar-core.js + calendar/), Check-in (journal/{Tag}). Fehlende Module werden bei Bedarf nachgeladen. */
(function(){
'use strict';
if(window.LBData)return;
const loaded={};
function script(src){if(!loaded[src])loaded[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=res;s.onerror=()=>{delete loaded[src];rej(new Error(src))};document.head.append(s)});return loaded[src]}
const berlin=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(new Date());
const berlinHour=()=>+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(new Date());
const ZCOL={g:[78,227,160],y:[255,193,90],r:[255,106,92]};
const KCOL={kraft:[255,154,92],iso:[127,227,255],z2:[79,209,197],lauf:[94,230,168],sport:[232,220,80],hiit:[255,112,196],mobil:[111,168,255],prae:[181,140,255],sonst:[143,166,189]};   // wie KSTY in plan.js
const memo={};
const once=(k,f)=>memo[k]||(memo[k]=f().catch(e=>{delete memo[k];throw e}));
function user(){return new Promise(res=>{try{const off=auth.onAuthStateChanged(u=>{try{off()}catch(e){}res(u||null)})}catch(e){res(null)}})}
/* Recovery: letzter bewerteter Tag */
function recovery(){return once('rec',async()=>{
  const u=await user();if(!u)return null;if(!window.LBWhoop)await script('whoop-cache.js');
  const d=await LBWhoop.peek(u.uid);if(!d)return null;
  const k=Object.keys(d).filter(k=>/^\d{4}-\d\d-\d\d$/.test(k)).sort().reverse().find(k=>{const s=d[k]&&d[k].recovery&&d[k].recovery.score;return s&&typeof s.recovery_score==='number'});
  if(!k)return null;const s=d[k].recovery.score,v=Math.round(s.recovery_score),z=v>=67?'g':v>=34?'y':'r';
  return{v,zone:z,label:{g:'Hoch',y:'Mittel',r:'Niedrig'}[z],rgb:ZCOL[z],date:k,today:k===berlin(),
    rhr:typeof s.resting_heart_rate==='number'?Math.round(s.resting_heart_rate):null,hrv:typeof s.hrv_rmssd_milli==='number'?Math.round(s.hrv_rmssd_milli):null};
})}
/* Training: Woche Mo–So und heute */
function week(){return once('week',async()=>{
  const u=await user();if(!u)return null;if(!window.PlanCore)await script('plan-core.js?v=7');
  const P=window.PlanCore,base='users/'+u.uid,q=await fs.collection(base+'/plan').get(),vs=[],days={},hist={};
  q.docs.forEach(d=>{const x=d.data()||{};if(/^v_\d{4}-\d{2}-\d{2}$/.test(d.id))vs.push(Object.assign(P.clean(x),{from:d.id.slice(2),at:x.at||0}));else if(/^t_\d{4}-\d{2}-\d{2}$/.test(d.id)){hist[d.id.slice(2)]=x;days[d.id.slice(2)]=P.cleanDay(x)}});
  const versions=P.sortVersions(vs),t=P.berlinKey(Date.now());
  if(!versions.length)return{seeded:true};
  let gym=[];try{const g=await fs.doc(base+'/training/gym_'+t.slice(0,4)).get();gym=((g.exists&&(g.data()||{}).list)||[]).map(o=>({id:o.i,date:o.d,plan:o.p||'',skip:Array.isArray(o.k)?o.k:[],ex:(o.e||[]).map(e=>({n:e.n,s:e.s||[]}))}))}catch(e){}
  const planAt=k=>P.versionAt(versions,k)||versions[versions.length-1],mon=P.addDays(t,-P.wdOf(t)),out=[];let plan=0,done=0,today=null;
  for(let i=0;i<7;i++){
    const k=P.addDays(mon,i),v=P.todayView(planAt(k),k,days[k]||null,gym.filter(g=>g.date===k),[]),live=v.slots.filter(x=>x.unit&&!x.skip),hd=new Set(((hist[k]||{}).done||[]).map(x=>x.u));
    const dn=live.filter(x=>x.done||hd.has(x.unit.id)),n=live.length;plan+=n;done+=dn.length;
    const pick=dn[0]||live[0];
    out.push({k,st:!n?'rest':dn.length>=n?'done':dn.length?'part':k<t?'miss':'plan',now:k===t,letter:P.WD[i].charAt(0),rgb:pick?(KCOL[pick.unit.kind]||KCOL.sonst):null,n,d:dn.length});
    if(k===t)today=live.map(x=>({name:x.unit.name,kind:x.unit.kind,done:x.done||hd.has(x.unit.id)}));
  }
  return{seeded:false,plan,done,days:out,today:today||[]};
})}
/* Kalender: nächste Termine (14 Tage) */
function next(){return once('next',async()=>{
  const u=await user();if(!u)return null;if(!window.CalCore)await script('calendar-core.js?v=3');
  const C=window.CalCore,snap=await fs.collection('users/'+u.uid+'/calendar').get(),ev=[];
  snap.docs.forEach(d=>{if(/^ev_\d{4}$/.test(d.id))((d.data()||{}).list||[]).forEach(o=>{const r=C.normalize(o);if(r.e)ev.push(r.e)})});
  const now=Date.now(),t=C.todayBerlin();
  return C.occurrences(ev,t,C.addDays(t,14)).filter(o=>o.first&&(o.allDay?o.date>=t:C.startMs(o)>=now-15*6e4)).map(o=>({date:o.date,time:o.time,title:o.title,
    day:o.date===t?'Heute':o.date===C.addDays(t,1)?'Morgen':C.dateShort(o.date),inDays:C.dayNum(o.date)-C.dayNum(t),rel:o.time&&o.date===t?C.relText(C.minutesUntil(o,now)):''}));
})}
/* Check-in heute: Stimmung, erledigt? */
function checkin(){return once('ck',async()=>{
  const u=await user();if(!u)return null;
  const k=window.LBDay?LBDay.dayKey(new Date(),'Europe/Berlin',4):berlin(),s=await fs.doc('users/'+u.uid+'/journal/'+k).get(),d=s.exists?s.data():null;
  const eve=berlinHour()>=17,morning=!!(d&&d.m),evening=!!(d&&d.e&&d.e.stress);
  return{eve,morning,evening,done:eve?evening:morning,mood:d&&d.m&&d.m.mood||null,energy:d&&d.m&&d.m.energy||null};
})}
window.LBData={recovery,week,next,checkin,ZCOL,KCOL,script,berlinHour};
})();
