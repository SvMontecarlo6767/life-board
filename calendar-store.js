/* Life Board – Kalender: Speicher (Firestore users/{uid}/calendar) und Erinnerungen.
   Dokumente: ev_YYYY = {list:[Termine, nach Startjahr]}, notes_YYYY = {n:{'YYYY-MM-DD':{t:Text,m:Stimmung 1-5}}}.
   Jede Änderung liest das Jahres-Dokument frisch, ändert nur den einen Eintrag und schreibt zurück
   (damit zwei Geräte sich nicht gegenseitig überschreiben). Braucht fb.js (fs, requireUser) und calendar-core.js. */
(function(root){
'use strict';
const C=root.CalCore;
const S={events:[],notes:{},loaded:false,base:null,listeners:[]};
const clone=o=>JSON.parse(JSON.stringify(o));
const yearOf=d=>String(d).slice(0,4);
const emit=()=>S.listeners.forEach(f=>{try{f(S)}catch(e){}});
async function base(){if(S.base)return S.base;const u=await requireUser();S.base='users/'+u.uid+'/calendar';return S.base}
async function loadAll(){
  const b=await base(),snap=await fs.collection(b).get(),ev=[],notes={};
  snap.docs.forEach(d=>{const x=d.data()||{};
    if(/^ev_\d{4}$/.test(d.id))(x.list||[]).forEach(o=>{const r=C.normalize(o);if(r.e)ev.push(r.e)});
    else if(/^notes_\d{4}$/.test(d.id))Object.assign(notes,x.n||{});
  });
  S.events=ev;S.notes=notes;S.loaded=true;emit();return S;
}
async function mutateEvents(y,fn){
  const ref=fs.doc((await base())+'/ev_'+y),s=await ref.get();
  let list=s.exists?((s.data()||{}).list||[]):[];list=fn(list.slice());
  await ref.set({list:clone(list)});return list;
}
/* Speichert (neu oder geändert). Gibt den geprüften Termin zurück oder wirft einen Fehler mit lesbarem Text. */
async function upsert(o){
  const r=C.normalize(o);if(r.err)throw new Error(r.err);const e=r.e;
  const old=S.events.find(x=>x.id===e.id);
  if(old&&yearOf(old.date)!==yearOf(e.date))await mutateEvents(yearOf(old.date),l=>l.filter(x=>x.id!==e.id));
  await mutateEvents(yearOf(e.date),l=>{const i=l.findIndex(x=>x.id===e.id);if(i>=0)l[i]=e;else l.push(e);return l});
  const i=S.events.findIndex(x=>x.id===e.id);if(i>=0)S.events[i]=e;else S.events.push(e);
  emit();return e;
}
async function remove(id){
  const old=S.events.find(x=>x.id===id);if(!old)return;
  await mutateEvents(yearOf(old.date),l=>l.filter(x=>x.id!==id));
  S.events=S.events.filter(x=>x.id!==id);emit();
}
/* Einzelnes Vorkommen einer Wiederholung entfernen / abhaken */
async function skipOccurrence(id,startDate){
  const e=S.events.find(x=>x.id===id);if(!e)return;
  const n=Object.assign({},e,{exc:[...(e.exc||[]),startDate]});return upsert(n);
}
async function setDone(id,startDate,done){
  const e=S.events.find(x=>x.id===id);if(!e)return;
  const set=new Set(e.doneOn||[]);if(done)set.add(startDate);else set.delete(startDate);
  return upsert(Object.assign({},e,{doneOn:[...set].sort()}));
}
async function setNote(date,v){
  if(!C.isDate(date))throw new Error('Das Datum ist ungültig.');
  const t=String((v&&v.t)||'').slice(0,5000),m=v&&v.m>=1&&v.m<=5?Math.round(v.m):0,y=yearOf(date);
  const ref=fs.doc((await base())+'/notes_'+y),s=await ref.get(),n=s.exists?Object.assign({},(s.data()||{}).n||{}):{};
  if(!t.trim()&&!m)delete n[date];else n[date]={t,m:m||null};
  await ref.set({n:clone(n)});
  if(!t.trim()&&!m)delete S.notes[date];else S.notes[date]={t,m:m||null};
  emit();
}

/* ---------- Erinnerungen (laufen auf jeder Seite, solange die App offen ist) ---------- */
const ACK='lb_cal_ack';
function acked(){try{const o=JSON.parse(localStorage.getItem(ACK)||'{}'),cut=Date.now()-14*864e5;Object.keys(o).forEach(k=>{if(o[k]<cut)delete o[k]});return o}catch(e){return{}}}
function ack(key){try{const o=acked();o[key]=Date.now();localStorage.setItem(ACK,JSON.stringify(o))}catch(e){}}
function due(now){return C.remindersDue(S.events,now||Date.now(),acked())}
async function notifyOS(title,body){
  try{if(!('Notification' in root)||Notification.permission!=='granted')return false;
    const reg=navigator.serviceWorker&&await navigator.serviceWorker.getRegistration();
    if(reg&&reg.showNotification){await reg.showNotification(title,{body,icon:'icons/icon-192.png',tag:title+body});return true}
    new Notification(title,{body,icon:'icons/icon-192.png'});return true;
  }catch(e){return false}
}
let timer=null;
function startReminders(onDue){
  if(timer)return;
  const tick=()=>{if(!S.loaded)return;due().forEach(o=>{ack(o.key);const min=C.minutesUntil(o,Date.now()),txt='Erinnerung: '+o.title+(o.time?' · '+o.time+' Uhr ('+C.relText(min)+')':' · heute');
    notifyOS('Life Board',txt);onDue&&onDue(o,txt)})};
  tick();timer=setInterval(tick,30000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)tick()});
}
root.CalStore={state:S,loadAll,upsert,remove,skipOccurrence,setDone,setNote,due,ack,acked,startReminders,notifyOS};
})(typeof self!=='undefined'?self:this);
