/* Statistiken für das Graph-Vollbild (Phase 7). Reine, deterministische Funktionen, kein Gemini.
   Einheitliches Format: Serie = [{date:'YYYY-MM-DD', value:Zahl|null}] aufsteigend nach Datum.
   Richtung dir: 1 = mehr ist besser, -1 = weniger ist besser, 0 = neutral (Höchst-/Tiefstwert).
   Fehlende Tage (kein Eintrag oder value=null) werden nie mitgerechnet und nie aufgefüllt. Statistiken laufen immer über die
   Originaldaten, nie über ein für die Darstellung verkleinertes Array. */
(function(root){
'use strict';
const pad=n=>String(n).padStart(2,'0');
const dayNum=k=>{const [y,m,d]=k.split('-').map(Number);return Math.round(Date.UTC(y,m-1,d)/864e5)};          // Tageszähler (UTC, daher ohne Sommerzeit-Sprünge)
const fromNum=n=>{const d=new Date(n*864e5);return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate())};
const addDays=(k,n)=>fromNum(dayNum(k)+n);
const dowOf=k=>(new Date(dayNum(k)*864e5).getUTCDay()+6)%7;                                                       // 0 = Montag
/* Heutiges Datum in Europe/Berlin */
function todayBerlin(now){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(now||new Date());return p}
const ok=v=>typeof v==='number'&&isFinite(v);
const clean=s=>(s||[]).filter(p=>p&&typeof p.date==='string'&&ok(p.value)).sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
function mean(a){return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
function median(a){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2}
const WD=['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'],WDS=['Mo','Di','Mi','Do','Fr','Sa','So'];
/* Zeiträume: Tage zurück ab "to" (inklusive). 'all' = ab erstem Datenpunkt. */
const RANGES=[{id:'7',days:7,label:'7 Tage'},{id:'30',days:30,label:'30 Tage'},{id:'90',days:90,label:'3 Monate'},{id:'365',days:365,label:'1 Jahr'},{id:'all',days:null,label:'Alles'}];
function bounds(series,rangeId,to){
  const s=clean(series);if(!s.length)return null;
  to=to||s[s.length-1].date;
  const r=RANGES.find(x=>x.id===String(rangeId))||RANGES[1];
  const from=r.days==null?s[0].date:addDays(to,-(r.days-1));
  return{from,to,days:dayNum(to)-dayNum(from)+1}
}
/* Welche Zeiträume gibt es für diese Daten? Nur solche, die über den nächstkleineren hinausreichen ("Alles" nur, wenn es mehr gibt als 1 Jahr nicht zwingend, aber immer mit Daten). */
function availableRanges(series,to){
  const s=clean(series);if(!s.length)return[];
  to=to||s[s.length-1].date;const span=dayNum(to)-dayNum(s[0].date)+1;
  const out=[];let prev=0,lastDays=0;
  RANGES.forEach(r=>{
    if(r.days==null){if(span>lastDays)out.push(r);return}
    if(!out.length||span>prev){out.push(r);lastDays=r.days}
    prev=r.days;
  });
  return out;
}
function inWindow(s,from,to){return s.filter(p=>p.date>=from&&p.date<=to)}
/* Kennzahlen für [from,to]. opt: {dir, goodMin, goodMax, sum:true} */
function compute(series,from,to,opt){
  opt=opt||{};const dir=opt.dir==null?0:opt.dir;
  const s=clean(series),w=inWindow(s,from,to),days=dayNum(to)-dayNum(from)+1,vals=w.map(p=>p.value);
  const out={from,to,days,n:w.length,coverage:days?w.length/days:0,empty:!w.length};
  if(!w.length)return out;
  out.mean=mean(vals);out.median=median(vals);
  const pickBest=(hi)=>{let b=w[0];for(const p of w){if(hi?p.value>b.value:p.value<b.value)b=p}return{date:b.date,value:b.value}};   // bei Gleichstand der frühere Tag
  const mx=pickBest(true),mn=pickBest(false);
  out.max=mx;out.min=mn;
  out.best=dir<0?mn:mx;out.worst=dir<0?mx:mn;out.neutralExtremes=dir===0;
  if(opt.sum)out.sum=vals.reduce((x,y)=>x+y,0);
  // Trend gegen den vorherigen gleich langen Zeitraum
  const pTo=addDays(from,-1),pFrom=addDays(from,-days),pw=inWindow(s,pFrom,pTo);
  if(pw.length){const pm=mean(pw.map(p=>p.value));out.prev={from:pFrom,to:pTo,n:pw.length,mean:pm};out.trend={diff:out.mean-pm,pct:pm!==0?(out.mean-pm)/Math.abs(pm)*100:null};
    out.trend.dir=Math.abs(out.trend.diff)<1e-9?0:out.trend.diff>0?1:-1;out.trend.good=dir===0||out.trend.dir===0?null:out.trend.dir===dir}
  // gute Tage / Streak
  if(ok(opt.goodMin)||ok(opt.goodMax)){
    const good=v=>(!ok(opt.goodMin)||v>=opt.goodMin)&&(!ok(opt.goodMax)||v<=opt.goodMax);
    out.goodDays=w.filter(p=>good(p.value)).length;
    let best=0,cur=0,prevD=null;                                         // Streak = aufeinanderfolgende Kalendertage mit gutem Wert
    w.forEach(p=>{if(good(p.value)){cur=(prevD&&dayNum(p.date)-dayNum(prevD)===1&&cur>0)?cur+1:1}else cur=0;prevD=p.date;if(cur>best)best=cur});
    out.streakBest=best;
    let c=0,pd=null;for(let i=w.length-1;i>=0;i--){const p=w[i];if(!good(p.value))break;if(pd&&dayNum(pd)-dayNum(p.date)!==1)break;c++;pd=p.date}
    out.streakNow=(w[w.length-1].date===to||dayNum(to)-dayNum(w[w.length-1].date)<=1)?c:0;
  }
  // Wochentage
  const by=Array.from({length:7},()=>[]);w.forEach(p=>by[dowOf(p.date)].push(p.value));
  out.dow=by.map((a,i)=>({i,name:WD[i],short:WDS[i],n:a.length,mean:a.length?mean(a):null}));
  const have=out.dow.filter(d=>d.n>0);
  if(have.length>=3&&w.length>=14){                                       // nur sinnvoll, wenn jeder Wochentag mehrfach vorkommt
    let hi=have[0],lo=have[0];have.forEach(d=>{if(d.mean>hi.mean)hi=d;if(d.mean<lo.mean)lo=d});
    out.dowBest=dir<0?lo:hi;out.dowWorst=dir<0?hi:lo;
  }
  return out;
}
/* Nur zur Darstellung: höchstens maxPts Punkte (Min/Max je Abschnitt bleiben erhalten). Statistiken nie damit rechnen. */
function downsample(series,maxPts){
  const s=series||[];if(s.length<=maxPts||maxPts<4)return s.slice();
  const buckets=Math.floor(maxPts/2),size=s.length/buckets,out=[];
  for(let b=0;b<buckets;b++){
    const a=Math.floor(b*size),e=Math.min(s.length,Math.floor((b+1)*size)),seg=s.slice(a,e).filter(p=>p&&ok(p.value));
    if(!seg.length){if(s[a])out.push(s[a]);continue}
    let lo=seg[0],hi=seg[0];seg.forEach(p=>{if(p.value<lo.value)lo=p;if(p.value>hi.value)hi=p});
    (lo.date<=hi.date?[lo,hi]:[hi,lo]).forEach((p,i,arr)=>{if(i===0||p!==arr[0])out.push(p)});
  }
  return out;
}
/* Kompakter Text für Jarvis (nur die vom Board berechneten Werte) */
function describe(name,unit,digits,st,rangeLabel){
  if(!st||st.empty)return name+', '+rangeLabel+': keine Daten im Zeitraum.';
  const f=v=>(Math.round(v*Math.pow(10,digits))/Math.pow(10,digits)).toLocaleString('de-DE',{maximumFractionDigits:digits})+(unit?' '+unit.trim():'');
  const p=[name+', Zeitraum '+rangeLabel+' ('+st.from+' bis '+st.to+'): '+st.n+' von '+st.days+' Tagen mit Daten','Durchschnitt '+f(st.mean),'Median '+f(st.median),
    (st.neutralExtremes?'Höchstwert ':'Bestwert ')+f(st.best.value)+' am '+st.best.date,(st.neutralExtremes?'Tiefstwert ':'Tiefstwert ')+f(st.worst.value)+' am '+st.worst.date];
  if(st.trend)p.push('Trend gegen den Vorzeitraum: '+(st.trend.diff>=0?'+':'')+(Math.abs(st.trend.diff)<1&&st.trend.diff!==0?(Math.round(st.trend.diff*10)/10).toLocaleString('de-DE')+(unit?' '+unit.trim():''):f(st.trend.diff))+(st.trend.pct!=null?' ('+(st.trend.pct>=0?'+':'')+Math.round(st.trend.pct)+' %)':''));
  if(st.sum!=null)p.push('Summe '+f(st.sum));if(st.goodDays!=null)p.push('gute Tage '+st.goodDays);
  if(st.dowBest)p.push('bester Wochentag '+st.dowBest.name+', schlechtester '+st.dowWorst.name);
  return p.join('; ')+'.';
}
const API={clean,mean,median,compute,bounds,availableRanges,downsample,describe,todayBerlin,addDays,dayNum,fromNum,dowOf,RANGES,WD,WDS};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.GraphStats=API;
})(typeof self!=='undefined'?self:this);
