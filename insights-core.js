/* Life Board – Muster: Zusammenhänge, Verläufe und Rückblick aus Check-in und Whoop. Reine Statistik, keine KI.
   Reine Funktionen (keine Abhängigkeit von Firebase oder DOM); benutzt von muster.html, Tests: node tools/test-insights.mjs. */
(function(root){
const J=root.LBJournal||(typeof require!=='undefined'?require('./journal-core.js'):null);
const WA=root.WhoopRow||(typeof require!=='undefined'?require('./whoop-row.js'):null);
function addDays(key,n){const [y,m,d]=key.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d+n));return t.getUTCFullYear()+'-'+String(t.getUTCMonth()+1).padStart(2,'0')+'-'+String(t.getUTCDate()).padStart(2,'0')}
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
const sd=a=>{if(a.length<2)return 0;const m=mean(a);return Math.sqrt(a.reduce((s,x)=>s+(x-m)*(x-m),0)/(a.length-1))};

/* Kennzahlen: better = 1 (höher ist besser), -1 (niedriger ist besser) */
const OUTCOMES={
  mood:{art:'deine',name:'Stimmung (morgens)',unit:'/5',better:1,dec:1},
  moodAvg:{art:'deine',name:'Stimmung (Tagesschnitt)',unit:'/5',better:1,dec:1},
  energy:{art:'deine',name:'Energie',unit:'/5',better:1,dec:1},
  stress:{art:'dein',name:'Stress',unit:'/5',better:-1,dec:1},
  rec:{art:'deine',name:'Whoop-Recovery',unit:' %',better:1,dec:0},
  hrv:{art:'deine',name:'HRV',unit:' ms',better:1,dec:0},
  rhr:{art:'dein',name:'Ruhepuls',unit:' bpm',better:-1,dec:0},
  sleepH:{art:'dein',name:'Schlaf',unit:' h',better:1,dec:1},
  sleepFelt:{art:'dein',name:'Ausgeschlafen-Gefühl',unit:'/5',better:1,dec:1}
};

/* Ein Datensatz pro Tag: {datum: {kennzahl: Wert}}; Faktoren als 0/1 (bool) oder Zahl */
function build(opt){
  const journal=opt.journal||{},days=opt.days||{},whoop=opt.whoop||{},rules=opt.rules,trackers=opt.trackers||[];
  const btn=rules&&rules.ui?rules.ui.buttons:[];
  const keys=new Set([...Object.keys(journal),...Object.keys(days),...Object.keys(whoop)]);
  const out={},factors={};
  const fac=(id,name,kind)=>{if(!factors[id])factors[id]={id,name,kind}};
  for(const k of keys){
    const v={};
    Object.assign(v,J.dayValues(journal[k]));
    const r=WA&&whoop[k]?WA.row(whoop[k]):null;
    if(r){if(r.rec!=null)v.rec=r.rec;if(r.hrv!=null)v.hrv=r.hrv;if(r.rhr!=null)v.rhr=r.rhr;if(r.asleep!=null)v.sleepH=r.asleep/60;if(r.strain!=null)v.strain=r.strain;if(r.steps!=null)v.steps=r.steps}
    const d=days[k];
    if(d||r){
      const inp=(d&&d.in)||{};
      let sport=r&&r.workouts.length?1:0;
      for(const b of btn){
        const val=inp[b.id]|0;
        if(b.group==='sport'){if(val>0)sport=1;continue}
        if(d&&b.id==='alkohol'){v.alk=val>0?1:0;continue}   // ältere Heute-Einträge: Alkohol wie im Check-in
        if(d){v['in_'+b.id]=val>0?1:0;fac('in_'+b.id,b.label,'bool')}
      }
      v.sport=sport;fac('sport','Sport / Training','bool');
    }
    const jd=journal[k];   // Check-in: Alkohol und späte Mahlzeit (gehen vor ältere Heute-Einträge)
    if(jd&&(jd.alc===true||jd.alc===false))v.alk=jd.alc?1:0;
    if(jd&&jd.meal)v.lateMeal=jd.meal>='20:30'?1:0;
    if(v.alk!=null)fac('alk','Alkohol','bool');if(v.lateMeal!=null)fac('lateMeal','Späte große Mahlzeit (ab 20:30)','bool');
    for(const t of trackers){const x=journal[k]&&journal[k].t&&journal[k].t[t.id];if(x!=null){v['t_'+t.id]=x;fac('t_'+t.id,t.name,t.kind==='bool'?'bool':'num')}}
    out[k]=v;
  }
  return{byDay:out,factors};
}

/* Zusammenhänge: Faktor (gleicher Tag oder Vortag) gegen Kennzahl. Mindestens minN Tage je Gruppe, sonst nichts – lieber
   keine Aussage als eine zufällige. Effektstärke d = Unterschied / gemeinsame Streuung. */
function findings(data,opt){
  opt=opt||{};const minN=opt.minN||5,minD=opt.minD||0.5,{byDay,factors}=data;
  const keys=Object.keys(byDay).sort();const res=[];
  for(const f of Object.values(factors)){
    for(const [oid,O] of Object.entries(OUTCOMES)){
      for(const lag of [0,1]){
        if(lag===0&&(oid==='rec'||oid==='hrv'||oid==='rhr'||oid==='sleepH'||oid==='sleepFelt'||oid==='mood'||oid==='energy'))continue; // Morgenwerte entstehen vor dem Tag: nur Vortag-Effekt sinnvoll
        const pairs=[];
        for(const k of keys){const fv=byDay[k][f.id];if(fv==null)continue;const ov=(byDay[addDays(k,lag)]||{})[oid];if(ov==null)continue;pairs.push([fv,ov])}
        if(pairs.length<minN*2)continue;
        let split;
        if(f.kind==='bool')split=x=>x>0;
        else{const vs=pairs.map(p=>p[0]).sort((a,b)=>a-b),med=vs[Math.floor(vs.length/2)];if(vs[0]===vs[vs.length-1])continue;split=med>vs[0]?x=>x>=med:x=>x>med}   // Zahl: obere gegen untere Hälfte
        const a=pairs.filter(p=>split(p[0])===true).map(p=>p[1]),b=pairs.filter(p=>split(p[0])!==true).map(p=>p[1]);
        if(a.length<minN||b.length<minN)continue;
        const ma=mean(a),mb=mean(b),s=Math.sqrt(((a.length-1)*sd(a)**2+(b.length-1)*sd(b)**2)/(a.length+b.length-2))||0;
        if(!s&&ma===mb)continue;
        const d=s?(ma-mb)/s:Math.sign(ma-mb)*3;   // ohne Streuung, aber mit klarem Unterschied: sehr deutlich
        if(Math.abs(d)<minD)continue;
        const se=s*Math.sqrt(1/a.length+1/b.length);
        if(se&&Math.abs(ma-mb)/se<(opt.minT||2.2))continue;   // t-Test: zu unsicher bei wenigen oder stark streuenden Tagen
        res.push({factor:f.id,factorName:f.name,kind:f.kind,outcome:oid,outcomeName:O.name,lag,withMean:ma,withoutMean:mb,nWith:a.length,nWithout:b.length,d,good:d*O.better>0});
      }
    }
  }
  // je Faktor/Kennzahl nur der stärkere der beiden Zeitbezüge
  const best={};for(const r of res){const k=r.factor+'|'+r.outcome;if(!best[k]||Math.abs(r.d)>Math.abs(best[k].d))best[k]=r}
  return Object.values(best).sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));
}
function fmtNum(v,dec){return(Math.round(v*10**dec)/10**dec).toLocaleString('de-DE',{minimumFractionDigits:dec,maximumFractionDigits:dec})}
/* Satz für eine Erkenntnis */
function sentence(r){
  const O=OUTCOMES[r.outcome];const diff=r.withMean-r.withoutMean;
  const when=r.kind==='bool'?(r.lag?'Nach Tagen mit „'+r.factorName+'“':'An Tagen mit „'+r.factorName+'“'):(r.lag?'Nach Tagen mit viel „'+r.factorName+'“':'An Tagen mit viel „'+r.factorName+'“');
  const dir=diff>0?'höher':'niedriger';
  return when+' ist '+(r.lag?'am nächsten Tag ':'')+O.art+' '+O.name+' im Schnitt '+fmtNum(Math.abs(diff),O.dec)+O.unit.replace(' %',' Punkte')+' '+dir+' ('+fmtNum(r.withMean,O.dec)+' statt '+fmtNum(r.withoutMean,O.dec)+'; '+r.nWith+' gegen '+r.nWithout+' Tage).';
}
/* Stärke in Worten */
function strength(d){d=Math.abs(d);return d>=1.2?'sehr deutlich':d>=0.8?'deutlich':'erkennbar'}

/* Verlauf zweier Kennzahlen für die Grafik */
function series(data,id,from,to){const o=[];for(let k=from;k<=to;k=addDays(k,1)){const v=(data.byDay[k]||{})[id];o.push({k,v:v==null?null:v})}return o}

/* Rückblick für einen Zeitraum [from,to] im Vergleich zum Zeitraum davor */
function review(data,journal,from,to){
  const len=Math.round((Date.parse(to)-Date.parse(from))/864e5)+1,pf=addDays(from,-len),pt=addDays(from,-1);
  const avg=(id,a,b)=>{const v=[];for(let k=a;k<=b;k=addDays(k,1)){const x=(data.byDay[k]||{})[id];if(x!=null)v.push(x)}return v.length?{v:mean(v),n:v.length}:null};
  const stats={};for(const id of ['mood','moodAvg','energy','stress','rec','sleepH','hrv'])stats[id]={cur:avg(id,from,to),prev:avg(id,pf,pt)};
  let best=null,worst=null,checkins=0,streak=0,run=0;const feel={};const good=[];
  for(let k=from;k<=to;k=addDays(k,1)){
    const j=journal[k];const v=data.byDay[k]||{};const m=v.moodAvg!=null?v.moodAvg:v.mood;
    if(m!=null){if(!best||m>best.v)best={k,v:m};if(!worst||m<worst.v)worst={k,v:m}}
    if(j&&(j.m||(j.notes||[]).length||j.e)){checkins++;run++;streak=Math.max(streak,run)}else run=0;
    if(j&&j.m&&j.m.feel)feel[j.m.feel]=(feel[j.m.feel]||0)+1;
    if(j&&j.e)for(const g of j.e.good||[])if(g&&g.trim())good.push({k,t:g.trim()});
  }
  const feelings=Object.entries(feel).sort((a,b)=>b[1]-a[1]).slice(0,5);
  return{from,to,days:len,stats,best,worst,checkins,streak,feelings,good};
}
const api={OUTCOMES,build,findings,sentence,strength,series,review,addDays,mean,fmtNum};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LBInsights=api;
})(typeof window!=='undefined'?window:globalThis);
