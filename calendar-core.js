/* Life Board – Kalender: Rechenkern (reine Funktionen, läuft im Browser und in Node; Tests: tools/test-calendar.mjs).
   Termine, Wiederholungen, Erinnerungen, Datumsangaben in Worten, Tagesfakten aus den anderen Reitern, Heatmap-Stufen.
   Alle Tage sind 'YYYY-MM-DD' in Europe/Berlin; gerechnet wird über UTC-Tageszähler (keine Sommerzeit-Sprünge). */
(function(root){
'use strict';
const TZ='Europe/Berlin';
const pad=n=>String(n).padStart(2,'0');
const dayNum=k=>{const [y,m,d]=k.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/864e5)};
const fromNum=n=>{const d=new Date(n*864e5);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
const addDays=(k,n)=>fromNum(dayNum(k)+n);
const dowOf=k=>(new Date(dayNum(k)*864e5).getUTCDay()+6)%7;            // 0 = Montag
const isDate=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&fromNum(dayNum(s))===s;
const isTime=s=>typeof s==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(s);
const WD=['Mo','Di','Mi','Do','Fr','Sa','So'],WDL=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
const MONL=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const daysInMonth=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();           // m = 1..12
const ymd=k=>{const [y,m,d]=k.split('-').map(Number);return{y,m,d}};
const mk=(y,m,d)=>y+'-'+pad(m)+'-'+pad(d);
function todayBerlin(now){return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(now||new Date())}
function nowHM(now){const p=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(now||new Date());return p}
/* Berlin-Ortszeit -> Millisekunden (UTC) */
function offsetAt(ms){
  const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(ms)),o={};
  p.forEach(x=>o[x.type]=x.value);
  return Date.UTC(+o.year,+o.month-1,+o.day,+o.hour%24,+o.minute,+o.second)-Math.floor(ms/1000)*1000;
}
function berlinMs(date,hm){
  const {y,m,d}=ymd(date),[h,mi]=(hm||'00:00').split(':').map(Number),guess=Date.UTC(y,m-1,d,h,mi);
  let ms=guess-offsetAt(guess);ms=guess-offsetAt(ms);return ms;
}

/* ---------- Kategorien ---------- */
const CATS=[
  {id:'termin',name:'Termin',icon:'📌',rgb:[58,215,255]},
  {id:'frist',name:'Frist',icon:'⏰',rgb:[255,84,96]},
  {id:'training',name:'Training',icon:'🏃',rgb:[255,154,92]},
  {id:'lernen',name:'Lernen',icon:'📚',rgb:[150,125,255]},
  {id:'puzzle',name:'Puzzle',icon:'🧩',rgb:[255,150,60]},
  {id:'privat',name:'Privat',icon:'🏠',rgb:[52,235,170]}
];
const catOf=id=>CATS.find(c=>c.id===id)||CATS[0];
const REPS=[{id:'none',name:'Einmalig'},{id:'daily',name:'Täglich'},{id:'weekly',name:'Wöchentlich'},{id:'monthly',name:'Monatlich'},{id:'yearly',name:'Jährlich'}];
const REMS=[{v:null,name:'Keine Erinnerung'},{v:0,name:'Zur Startzeit'},{v:10,name:'10 Min vorher'},{v:30,name:'30 Min vorher'},{v:60,name:'1 Std vorher'},{v:1440,name:'1 Tag vorher'}];
const ALLDAY_HM='09:00';       // Anker für Erinnerungen bei ganztägigen Terminen

/* ---------- Termine prüfen / normalisieren ---------- */
function newId(){return 'e'+Date.now().toString(36)+Math.random().toString(36).slice(2,6)}
function normalize(o){
  o=o||{};const title=String(o.title==null?'':o.title).replace(/\s+/g,' ').trim();
  if(!title)return{err:'Der Termin braucht einen Titel.'};
  if(title.length>120)return{err:'Der Titel ist zu lang (höchstens 120 Zeichen).'};
  if(!isDate(o.date))return{err:'Das Datum ist ungültig.'};
  const e={id:o.id||newId(),title,date:o.date,cat:CATS.some(c=>c.id===o.cat)?o.cat:'termin'};
  if(o.time){if(!isTime(o.time))return{err:'Die Uhrzeit ist ungültig.'};e.time=o.time}
  if(o.end){if(!e.time)return{err:'Ein Ende braucht eine Startzeit.'};if(!isTime(o.end))return{err:'Die Endzeit ist ungültig.'}
    if(o.end<=e.time&&!(o.endDate&&o.endDate>o.date))return{err:'Das Ende muss nach dem Start liegen.'};e.end=o.end}
  if(o.endDate&&o.endDate!==o.date){
    if(!isDate(o.endDate))return{err:'Das Enddatum ist ungültig.'};
    if(o.endDate<o.date)return{err:'Das Enddatum liegt vor dem Start.'};
    if(dayNum(o.endDate)-dayNum(o.date)>60)return{err:'Ein Termin kann höchstens 61 Tage dauern.'};
    e.endDate=o.endDate}
  const note=String(o.note==null?'':o.note).trim();if(note)e.note=note.slice(0,2000);
  if(o.rem!=null&&o.rem!==''){const r=Number(o.rem);if(!isFinite(r)||r<0||r>10080)return{err:'Die Erinnerung ist ungültig.'};e.rem=Math.round(r)}
  const rep=o.rep||'none';if(!REPS.some(r=>r.id===rep))return{err:'Die Wiederholung ist ungültig.'};
  if(rep!=='none'){e.rep=rep;const ev=Math.round(Number(o.every)||1);if(ev<1||ev>52)return{err:'Das Intervall ist ungültig.'};if(ev>1)e.every=ev;
    if(rep==='weekly'&&Array.isArray(o.wd)&&o.wd.length){const w=[...new Set(o.wd.map(Number))].filter(x=>x>=0&&x<=6).sort();if(w.length&&!(w.length===1&&w[0]===dowOf(o.date)))e.wd=w}
    if(o.until){if(!isDate(o.until))return{err:'Das Ende der Wiederholung ist ungültig.'};if(o.until<o.date)return{err:'Die Wiederholung endet vor dem Start.'};e.until=o.until}}
  if(Array.isArray(o.exc)&&o.exc.length)e.exc=[...new Set(o.exc.filter(isDate))].sort();
  if(Array.isArray(o.doneOn)&&o.doneOn.length)e.doneOn=[...new Set(o.doneOn.filter(isDate))].sort();
  if(o.track)e.track=true;                       // Planung: mit Abhak-Kästchen
  return{e};
}

/* ---------- Wiederholungen auflösen ---------- */
function startsBetween(e,from,to){
  const s=e.date,out=[];if(to<s)return out;
  const limit=e.until&&e.until<to?e.until:to;if(limit<s)return out;
  const span=e.endDate?dayNum(e.endDate)-dayNum(s):0,lo=addDays(from,-span);
  const rep=e.rep||'none',ev=e.every||1,sN=dayNum(s);
  if(rep==='none'){if(s>=lo&&s<=limit)out.push(s);return out}
  if(rep==='daily'){const step=ev;let k=Math.max(0,Math.ceil((dayNum(lo)-sN)/step));for(;sN+k*step<=dayNum(limit);k++)out.push(fromNum(sN+k*step));return out}
  if(rep==='weekly'){
    const wd=e.wd||[dowOf(s)],wk0=sN-dowOf(s);                       // Montag der Startwoche
    let w=Math.max(0,Math.floor((dayNum(lo)-wk0)/(7*ev))-1);
    for(;wk0+w*7*ev<=dayNum(limit);w++)for(const d of wd){const n=wk0+w*7*ev+d;if(n>=sN&&n>=dayNum(lo)&&n<=dayNum(limit))out.push(fromNum(n))}
    return out;
  }
  const {y:y0,m:m0,d:d0}=ymd(s);
  if(rep==='monthly'){for(let i=0;i<12*120;i+=ev){const t=(m0-1)+i,y=y0+Math.floor(t/12),m=t%12+1,d=Math.min(d0,daysInMonth(y,m)),k=mk(y,m,d);if(k>limit)break;if(k>=lo)out.push(k)}return out}
  if(rep==='yearly'){for(let i=0;i<120;i+=ev){const y=y0+i,d=Math.min(d0,daysInMonth(y,m0)),k=mk(y,m0,d);if(k>limit)break;if(k>=lo)out.push(k)}return out}
  return out;
}
/* Alle Vorkommen im Zeitraum [from,to] (einzelne Tage; mehrtägige Termine erscheinen an jedem Tag) */
function occurrences(events,from,to){
  const out=[];
  (events||[]).forEach(e=>{
    const span=e.endDate?dayNum(e.endDate)-dayNum(e.date):0,exc=e.exc||[],done=e.doneOn||[];
    startsBetween(e,from,to).forEach(s=>{
      if(exc.includes(s))return;
      for(let i=0;i<=span;i++){const d=addDays(s,i);if(d<from||d>to)continue;
        out.push({id:e.id,key:e.id+'|'+s,date:d,startDate:s,dayIdx:i,span,first:i===0,last:i===span,title:e.title,cat:e.cat,time:i===0?e.time||null:null,end:i===span?e.end||null:null,allDay:!(i===0&&e.time),note:e.note||'',rem:e.rem==null?null:e.rem,rep:e.rep||'none',track:!!e.track,done:done.includes(s)})}
    });
  });
  return sortOcc(out);
}
function sortOcc(a){return a.sort((x,y)=>x.date<y.date?-1:x.date>y.date?1:(x.time||'')<(y.time||'')?-1:(x.time||'')>(y.time||'')?1:x.title<y.title?-1:x.title>y.title?1:0)}
/* Innerhalb eines Tages: ganztägig zuerst, dann nach Uhrzeit */
function dayList(occs,date){return occs.filter(o=>o.date===date).sort((a,b)=>(a.allDay===b.allDay?0:a.allDay?-1:1)||(a.time||'').localeCompare(b.time||'')||a.title.localeCompare(b.title))}
/* Überschneidungen für die Wochen-/Tagesansicht: Spalten für gleichzeitige Termine */
function layoutDay(list){
  const items=list.filter(o=>o.time).map(o=>{const s=hm2m(o.time),e=o.end?hm2m(o.end):Math.min(s+60,1440);return{o,s,e:Math.max(e,s+20)}}).sort((a,b)=>a.s-b.s||b.e-a.e);
  const cols=[];let group=[];const out=[];
  const flush=()=>{const n=Math.max(1,...group.map(g=>g.col+1));group.forEach(g=>{g.n=n;out.push(g)});group=[]};
  let gEnd=-1;
  items.forEach(it=>{
    if(group.length&&it.s>=gEnd){flush();cols.length=0;gEnd=-1}
    let c=cols.findIndex(end=>end<=it.s);if(c<0){c=cols.length;cols.push(0)}cols[c]=it.e;it.col=c;group.push(it);gEnd=Math.max(gEnd,it.e);
  });
  if(group.length)flush();
  return out;
}
const hm2m=hm=>{const [h,m]=hm.split(':').map(Number);return h*60+m};
const m2hm=m=>pad(Math.floor(m/60))+':'+pad(m%60);

/* ---------- Erinnerungen ---------- */
function startMs(o){return berlinMs(o.startDate,o.time||ALLDAY_HM)}
function remindersDue(events,nowMs,acked){
  const today=todayBerlin(new Date(nowMs)),from=addDays(today,-1),to=addDays(today,8);
  acked=acked||{};
  return occurrences(events,from,to).filter(o=>o.first&&o.rem!=null&&!o.done).map(o=>{const st=startMs(o),fire=st-o.rem*60000;return Object.assign({},o,{fire,startMs:st})})
    .filter(o=>o.fire<=nowMs&&nowMs<o.startMs+(o.allDay?15*36e5:3*36e5)&&!acked[o.key]).sort((a,b)=>a.fire-b.fire);
}
function minutesUntil(o,nowMs){return Math.round((startMs(o)-nowMs)/6e4)}
function relText(min){
  if(min>=60*24)return 'in '+Math.round(min/1440)+' Tagen';
  if(min>=60)return 'in '+Math.floor(min/60)+' Std'+(min%60?' '+(min%60)+' Min':'');
  if(min>1)return 'in '+min+' Min';if(min>=-1)return 'jetzt';
  if(min>-60)return 'vor '+(-min)+' Min';return 'vor '+Math.round(-min/60)+' Std';
}

/* ---------- Datum und Uhrzeit aus Worten (für Jarvis) ---------- */
const norm=s=>String(s==null?'':s).toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9.\-:/ ]+/g,' ').replace(/\s+/g,' ').trim();
const WDN={montag:0,mo:0,dienstag:1,di:1,mittwoch:2,mi:2,donnerstag:3,do:3,freitag:4,fr:4,samstag:5,sa:5,sonntag:6,so:6};
function resolveDate(s,today){
  const t=norm(s);if(!t)return null;
  if(isDate(t))return t;
  if(t==='heute')return today;if(t==='morgen')return addDays(today,1);if(t==='uebermorgen')return addDays(today,2);if(t==='gestern')return addDays(today,-1);
  let m=/^(?:in )?(\d{1,3}) (tag|tagen|woche|wochen)$/.exec(t);if(m)return addDays(today,+m[1]*(m[2][0]==='w'?7:1));
  m=/^(?:(naechsten|naechste|kommenden|kommenden|diesen|dieser|am) )?(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)$/.exec(t);
  if(m){const w=WDN[m[2]],cur=dowOf(today);let diff=(w-cur+7)%7;if(diff===0)diff=7;return addDays(today,diff)}
  m=/^(\d{1,2})\.(\d{1,2})\.?(?:(\d{4}|\d{2}))?$/.exec(t);
  if(m){const d=+m[1],mo=+m[2];let y=m[3]?(m[3].length===2?2000+ +m[3]:+m[3]):ymd(today).y;
    const mkk=yy=>(mo>=1&&mo<=12&&d>=1&&d<=daysInMonth(yy,mo))?mk(yy,mo,d):null;let r=mkk(y);
    if(r&&!m[3]&&r<today){const r2=mkk(y+1);if(r2)r=r2}return r}
  return null;
}
function resolveTime(s){
  const t=norm(s).replace(/ uhr$/,'').replace(/uhr$/,'');if(!t)return null;
  let m=/^(\d{1,2})(?:[:.](\d{2}))?$/.exec(t);if(!m)return null;
  const h=+m[1],mi=+(m[2]||0);if(h>23||mi>59)return null;return pad(h)+':'+pad(mi);
}

/* ---------- Texte ---------- */
function dateLong(k){const {y,m,d}=ymd(k);return WDL[dowOf(k)]+', '+d+'. '+MONL[m-1]+' '+y}
function dateShort(k){const {m,d}=ymd(k);return WD[dowOf(k)]+' '+d+'.'+m+'.'}
function occText(o){return (o.time?o.time+(o.end?'–'+o.end:'')+' ':o.span?'':'ganztägig ')+o.title+(o.span?' ('+(o.dayIdx+1)+'. von '+(o.span+1)+' Tagen)':'')+(o.track&&o.done?' ✓':'')}
function agendaText(occs,from,to,today){
  if(!occs.length)return 'Keine Termine'+(from===to?' am '+dateLong(from):' von '+dateShort(from)+' bis '+dateShort(to))+'.';
  const by={};occs.forEach(o=>(by[o.date]=by[o.date]||[]).push(o));
  return Object.keys(by).sort().map(d=>(d===today?'Heute':d===addDays(today,1)?'Morgen':dateLong(d))+': '+dayList(by[d],d).map(occText).join('; ')).join('\n');
}

/* ---------- Tagesfakten aus den anderen Reitern ----------
   src = {days:{d:{net,rank,closed,sick}}, whoop:{d:{rec,strain,asleep,workouts,wlist:[{sport,min}]}}, training:{d:[{name,km,min,sport}]},
          puzzle:{d:Anzahl}, learn:{d:Runden}, notes:{d:{t,m}}} – alles optional, fehlende Teile werden übersprungen. */
const MOODS=['','😖','😕','😐','🙂','😄'];
function fmt1(v,d){return v==null||!isFinite(v)?'–':(Math.round(v*Math.pow(10,d||0))/Math.pow(10,d||0)).toLocaleString('de-DE',{maximumFractionDigits:d||0})}
function dayFacts(date,src){
  src=src||{};const f=[],D=(src.days||{})[date],W=(src.whoop||{})[date],T=(src.training||{})[date],P=(src.puzzle||{})[date],L=(src.learn||{})[date],N=(src.notes||{})[date];
  if(D&&(D.closed||D.net!=null)&&D.rank)f.push({k:'heute',icon:'🎯',text:'Heute-Rang '+D.rank+(D.net!=null?' ('+(D.net>0?'+':'')+fmt1(D.net,0)+' Punkte)':'')+(D.closed?'':' · Tag nicht abgeschlossen'),v:D.rank});
  if(D&&D.sick)f.push({k:'krank',icon:'🤒',text:'Als krank markiert'});
  if(W&&W.rec!=null)f.push({k:'rec',icon:'💚',text:'Recovery '+fmt1(W.rec,0)+' %'+(W.hrv!=null?' · HRV '+fmt1(W.hrv,0)+' ms':''),v:W.rec});
  if(W&&W.asleep!=null)f.push({k:'sleep',icon:'😴',text:'Schlaf '+fmt1(W.asleep,1)+' Std'+(W.perf!=null?' · Performance '+fmt1(W.perf,0)+' %':''),v:W.asleep});
  if(W&&W.strain!=null)f.push({k:'strain',icon:'🔥',text:'Strain '+fmt1(W.strain,1),v:W.strain});
  if(W&&W.wlist&&W.wlist.length)f.push({k:'whoopw',icon:'⌚',text:'Whoop-Workout: '+W.wlist.map(w=>w.sport+(w.min?' '+Math.round(w.min)+' Min':'')).join(', ')});
  if(T&&T.length)f.push({k:'training',icon:'🏃',text:'Training: '+T.map(a=>(a.name||a.sport||'Einheit')+(a.km?' '+fmt1(a.km,1)+' km':'')+(a.min?' '+Math.round(a.min)+' Min':'')).join(', '),v:T.reduce((s,a)=>s+(a.min||0),0)});
  if(P)f.push({k:'puzzle',icon:'🧩',text:'Puzzle: '+P+(P===1?' Spiel':' Spiele'),v:P});
  if(L)f.push({k:'learn',icon:'📚',text:'Lernen: '+L+(L===1?' Runde':' Runden'),v:L});
  if(N&&N.m)f.push({k:'mood',icon:MOODS[N.m]||'🙂',text:'Stimmung '+N.m+' von 5',v:N.m});
  return f;
}
/* Der „Fokus für morgen“ aus dem Tagesabschluss in Heute gilt für den Folgetag */
function planFor(date,src){const D=((src||{}).days||{})[addDays(date,-1)];return D&&D.focus&&String(D.focus).trim()?String(D.focus).trim():''}
/* Heatmap-Stufe 1..4 (null = keine Daten). 1 schwach, 4 stark – „stark“ ist je Metrik gut oder viel, nie bewertend gemeint. */
const METRICS=[{id:'rank',name:'Heute-Rang'},{id:'rec',name:'Recovery'},{id:'strain',name:'Strain'},{id:'training',name:'Training'},{id:'puzzle',name:'Puzzle'},{id:'mood',name:'Stimmung'},{id:'events',name:'Termine'}];
function heatLevel(metric,date,src,occsByDate){
  src=src||{};
  if(metric==='rank'){const D=(src.days||{})[date];if(!D||!D.rank)return null;return {C:1,B:2,A:3,S:4}[D.rank]||null}
  if(metric==='rec'){const W=(src.whoop||{})[date];if(!W||W.rec==null)return null;return W.rec<34?1:W.rec<67?2:W.rec<80?3:4}
  if(metric==='strain'){const W=(src.whoop||{})[date];if(!W||W.strain==null)return null;return W.strain<8?1:W.strain<12?2:W.strain<16?3:4}
  if(metric==='training'){const T=(src.training||{})[date],W=(src.whoop||{})[date];const tm=(T||[]).reduce((s,a)=>s+(a.min||0),0),wm=((W&&W.wlist)||[]).reduce((s,w)=>s+(w.min||0),0),min=Math.max(tm,wm);   // dieselbe Einheit kann in beiden stehen: nicht doppelt zählen
    if(!min)return null;return min<30?1:min<60?2:min<90?3:4}
  if(metric==='puzzle'){const P=(src.puzzle||{})[date];if(!P)return null;return P<2?1:P<4?2:P<7?3:4}
  if(metric==='mood'){const N=(src.notes||{})[date];if(!N||!N.m)return null;return Math.max(1,Math.min(4,N.m-1||1))}
  if(metric==='events'){const n=((occsByDate||{})[date]||[]).length;if(!n)return null;return n<2?1:n<3?2:n<5?3:4}
  return null;
}

/* ---------- Suche ---------- */
function findEvents(events,query,from,to){
  const q=norm(query),toks=q.split(' ').filter(Boolean);if(!toks.length)return[];
  const occ=occurrences(events,from,to);
  return occ.filter(o=>{const t=norm(o.title);return toks.every(x=>t.includes(x))});
}
function searchText(events,query,today){
  const q=norm(query);if(!q)return[];
  const from=addDays(today,-366),to=addDays(today,366*2);
  return occurrences(events,from,to).filter(o=>norm(o.title+' '+o.note).includes(q));
}

/* ---------- Kalender-Raster ---------- */
function monthGrid(y,m){                       // m = 1..12; 6 Wochen ab Montag
  const first=mk(y,m,1),start=addDays(first,-dowOf(first)),cells=[];
  for(let i=0;i<42;i++){const d=addDays(start,i);cells.push({date:d,inMonth:ymd(d).m===m})}
  return cells;
}
function weekStart(k){return addDays(k,-dowOf(k))}
function isoWeek(k){                           // ISO-Kalenderwoche
  const n=dayNum(k),th=n-dowOf(k)+3,y=ymd(fromNum(th)).y,j4=dayNum(mk(y,1,4));
  return{week:1+Math.round((th-(j4-dowOf(fromNum(j4))+3))/7),year:y};
}
/* Kalendereinladung (.ics) für Apple Kalender / Erinnerungen außerhalb der App */
function toICS(events,now){
  const esc=s=>String(s).replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
  const stamp=(now?new Date(now):new Date()).toISOString().replace(/[-:]/g,'').replace(/\.\d+/,'');
  const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Life Board//Kalender//DE','CALSCALE:GREGORIAN'];
  const d8=k=>k.replace(/-/g,''),loc=(k,hm)=>d8(k)+'T'+hm.replace(':','')+'00';
  events.forEach(e=>{
    L.push('BEGIN:VEVENT','UID:'+e.id+'@life-board','DTSTAMP:'+stamp,'SUMMARY:'+esc(e.title));
    if(e.time){L.push('DTSTART;TZID=Europe/Berlin:'+loc(e.date,e.time));L.push('DTEND;TZID=Europe/Berlin:'+loc(e.endDate||e.date,e.end||(e.endDate?e.time:m2hm(Math.min(hm2m(e.time)+60,1439)))))}
    else{L.push('DTSTART;VALUE=DATE:'+d8(e.date));L.push('DTEND;VALUE=DATE:'+d8(addDays(e.endDate||e.date,1)))}
    if(e.note)L.push('DESCRIPTION:'+esc(e.note));
    if(e.rep&&e.rep!=='none'){let r='RRULE:FREQ='+{daily:'DAILY',weekly:'WEEKLY',monthly:'MONTHLY',yearly:'YEARLY'}[e.rep];if(e.every)r+=';INTERVAL='+e.every;
      if(e.rep==='weekly'&&e.wd)r+=';BYDAY='+e.wd.map(d=>['MO','TU','WE','TH','FR','SA','SU'][d]).join(',');if(e.until)r+=';UNTIL='+d8(e.until)+'T235959Z';L.push(r)}
    if(e.exc&&e.exc.length&&e.time)L.push('EXDATE;TZID=Europe/Berlin:'+e.exc.map(x=>loc(x,e.time)).join(','));
    if(e.rem!=null)L.push('BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+esc(e.title),'TRIGGER:-PT'+e.rem+'M','END:VALARM');
    L.push('END:VEVENT');
  });
  L.push('END:VCALENDAR');return L.join('\r\n')+'\r\n';
}

const API={TZ,CATS,catOf,REPS,REMS,MOODS,METRICS,WD,WDL,MONL,dayNum,fromNum,addDays,dowOf,isDate,isTime,daysInMonth,ymd,mk,todayBerlin,nowHM,berlinMs,
  newId,normalize,startsBetween,occurrences,dayList,layoutDay,hm2m,m2hm,remindersDue,minutesUntil,relText,startMs,resolveDate,resolveTime,norm,
  dateLong,dateShort,occText,agendaText,dayFacts,planFor,heatLevel,findEvents,searchText,monthGrid,weekStart,isoWeek,toICS};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.CalCore=API;
})(typeof self!=='undefined'?self:this);
