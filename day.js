/* Life Board – Tage: Board-Tag (Europe/Berlin, Wechsel um 4 Uhr) und Datumsrechnung. Reine Funktionen.
   Benutzt von checkin.html, muster.html, learn.html und dem Hub; Tests: node tools/test-day.mjs. */
(function(root){
function pad(n){return String(n).padStart(2,'0')}
/* Board-Tag: Berliner Wandzeit, vor changeHour (4 Uhr) zählt noch der Vortag */
function dayKey(now,tz,hour){
  tz=tz||'Europe/Berlin';hour=hour==null?4:hour;
  const p={};new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'})
    .formatToParts(now||new Date()).forEach(x=>{p[x.type]=x.value});
  let d=new Date(Date.UTC(+p.year,+p.month-1,+p.day));
  if(+p.hour<hour)d=new Date(d.getTime()-864e5);
  return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
}
function addDays(key,n){const [y,m,d]=key.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d+n));return t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate())}
/* Montag der Woche */
function weekKey(key){const [y,m,d]=key.split('-').map(Number);const dow=(new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7;return addDays(key,-dow)}
const api={dayKey,addDays,weekKey};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LBDay=api;
})(typeof window!=='undefined'?window:globalThis);
