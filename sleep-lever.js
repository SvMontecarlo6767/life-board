/* Schlaf-Hebel-Analyse (Phase 6). Reine, deterministische Funktionen: gleiche Daten ergeben immer dasselbe Ergebnis.
   Kein Gemini, keine Zufallswerte. Eingabe sind Whoop-Tage (Worker /data) und meine Tageseinträge.
   Rechenweg siehe README, Abschnitt "Schlaf-Hebel". Keine ärztliche Beratung, keine Diagnose. */
(function(root){
'use strict';
const MIN=60000, DAY=1440, EV=18*60;               // Tag wechselt um 18:00 (Minuten seit 18:00)
const num=v=>typeof v==='number'&&isFinite(v)?v:null;
const pad=n=>String(n).padStart(2,'0');
function tzMin(tz){const m=/^([+-])(\d\d):?(\d\d)$/.exec(tz||'');return m?(m[1]==='-'?-1:1)*(+m[2]*60+ +m[3]):0}
function addDays(key,n){const [y,m,d]=key.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d+n));return t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate())}
function dowOf(key){const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)).getUTCDay()}  // 0 = So
function diffDays(a,b){const f=k=>{const [y,m,d]=k.split('-').map(Number);return Date.UTC(y,m-1,d)/864e5};return f(b)-f(a)}
/* Ortszeit eines Zeitstempels (ISO) mit Whoop-Zeitzonenversatz → {date, min (Minute des Tages)} */
function local(iso,tz){const t=Date.parse(iso);if(isNaN(t))return null;const d=new Date(t+tzMin(tz)*MIN);
  return{date:d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate()),min:d.getUTCHours()*60+d.getUTCMinutes(),t}}
/* Abend-Zuordnung einer Zubettgehzeit: nach Mitternacht (bis 18:00) gehört sie zum Vorabend. Rückgabe: Abend-Datum + Minuten seit 18:00 */
function eveningOfBed(l){return l.min>=EV?{E:l.date,m:l.min-EV}:{E:addDays(l.date,-1),m:l.min+DAY-EV}}
/* Training: Einheiten bis 4:00 Uhr gehören noch zum Vorabend, sonst zum eigenen Tag */
function eveningOfWork(l){return l.min<4*60?addDays(l.date,-1):l.date}
function median(a){if(!a.length)return null;const s=a.slice().sort((x,y)=>x-y),n=s.length;return n%2?s[(n-1)/2]:(s[n/2-1]+s[n/2])/2}
function spread(a){const m=median(a);return m==null?null:median(a.map(v=>Math.abs(v-m)))}   // Median der Abstände zum eigenen Gruppenmedian
const clock=m=>{m=((Math.round(m)+EV)%DAY+DAY)%DAY;return pad(Math.floor(m/60))+':'+pad(m%60)}   // Minuten seit 18:00 → HH:MM
const dur=m=>{m=Math.round(m);return Math.floor(m/60)+':'+pad(m%60)+' h'}
const r1=v=>(Math.round(v*10)/10).toString().replace('.',',');
const parseHM=s=>{const m=/^(\d{1,2}):(\d\d)$/.exec(s||'');if(!m||+m[1]>23||+m[2]>59)return null;let x=+m[1]*60+ +m[2]-EV;if(x<0)x+=DAY;return x}   // 'HH:MM' → Minuten seit 18:00

const MEASURES={
  hrv:{label:'HRV (rMSSD)',unit:'ms',dir:1,get:n=>n.hrv},
  rhr:{label:'Ruhepuls',unit:'bpm',dir:-1,get:n=>n.rhr},
  rec:{label:'Whoop-Recovery',unit:'%',dir:1,get:n=>n.rec},
  perf:{label:'Schlaf-Performance (Whoop)',unit:'%',dir:1,get:n=>n.perf}
};
const SUSPECTS=[
  {id:1,key:'training',name:'Harte Einheit endet weniger als 3 Stunden vor dem Zubettgehen'},
  {id:2,key:'bed',name:'Unregelmäßige Bettzeit'},
  {id:3,key:'short',name:'Kurze Nächte an sich'},
  {id:4,key:'jump',name:'Sprung im Trainingsumfang in der Woche davor'},
  {id:5,key:'alcohol',name:'Alkohol am Abend'},
  {id:6,key:'meal',name:'Späte große Mahlzeit'}
];

/* ---------- Daten lesen ---------- */
function readNights(days,opt){
  const off=opt.bedOffset||0, notes=[], nights={};
  let usedStart=0, total=0;
  Object.keys(days||{}).sort().forEach(k=>{
    const d=days[k]; if(!d||!d.sleep||d.sleep.nap||!d.sleep.start)return;
    const l=local(d.sleep.start,d.sleep.tz); if(!l)return;
    const ev=eveningOfBed(l); total++;
    const sc=d.sleep.score||{}, st=sc.stage_summary||{}, rs=(d.recovery&&d.recovery.score)||{};
    const L=num(st.total_light_sleep_time_milli),S=num(st.total_slow_wave_sleep_time_milli),R=num(st.total_rem_sleep_time_milli);
    let asleep=(L!=null&&S!=null&&R!=null)?(L+S+R)/MIN:null;
    if(asleep!=null&&(asleep<120||asleep>960))asleep=null;                       // unplausibel (Minuten/Stunden-Verwechslung etc.)
    const ok=(v,lo,hi)=>v!=null&&v>=lo&&v<=hi?v:null;
    let bed=ev.m-off; if(bed<-240)bed+=DAY;
    const n={E:ev.E,wake:k,bed,asleep,
      hrv:ok(num(rs.hrv_rmssd_milli),5,300),rhr:ok(num(rs.resting_heart_rate),25,130),rec:ok(num(rs.recovery_score),0,100),
      perf:ok(num(sc.sleep_performance_percentage),0,100),dow:dowOf(ev.E)};
    if(!nights[ev.E]||Date.parse(d.sleep.end)>nights[ev.E]._end){n._end=Date.parse(d.sleep.end)||0;n._bedAbs=l.t-off*MIN;nights[ev.E]=n}
    usedStart++;
  });
  return{nights,total,usedStart};
}
function readWorkouts(days,opt,rated){
  const out=[];
  Object.keys(days||{}).forEach(k=>{
    ((days[k]&&days[k].workouts)||[]).forEach(w=>{
      const s=local(w.start,w.tz),e=Date.parse(w.end);if(!s||isNaN(e))return;
      const min=(e-s.t)/MIN; if(!(min>=5&&min<=600))return;                    // Dauer plausibilisieren
      const sc=w.score||{};
      out.push({id:String(w.id||''),sport:w.sport||'',E:eveningOfWork(s),start:s.t,end:e,min,strain:num(sc.strain),rpe:rated&&rated[w.id]!=null?+rated[w.id]:null});
    });
  });
  return out.sort((a,b)=>a.start-b.start);
}
function pickMeasure(nights){
  const arr=Object.values(nights),n=arr.length||1,miss=f=>arr.filter(x=>f(x)==null).length/n;
  const mh=miss(x=>x.hrv),mr=miss(x=>x.rhr);
  if(mh<=.25)return{key:'hrv',why:'HRV ist in '+Math.round((1-mh)*100)+' % der Nächte vorhanden (Standard).'};
  if(mr<=.25)return{key:'rhr',why:'HRV fehlt in '+Math.round(mh*100)+' % der Nächte (mehr als ein Viertel), der Ruhepuls seltener ('+Math.round(mr*100)+' %).'};
  const mc=miss(x=>x.rec),mp=miss(x=>x.perf);
  if(mc<=.25)return{key:'rec',why:'HRV und Ruhepuls fehlen in mehr als einem Viertel der Nächte; genommen wurde das Whoop-Recovery-Prozent (nicht die rohe HRV).'};
  if(mp<=.25)return{key:'perf',why:'HRV, Ruhepuls und Recovery fehlen häufig; genommen wurde die Whoop-Schlaf-Performance.'};
  return null;
}

/* ---------- Gruppenvergleich ---------- */
function stageOf(nMin){return nMin<10?{label:'unter 10 Nächte in der kleineren Gruppe: mindestens das 2fache der Schwankung',f:2}
  :nMin<20?{label:'10 bis 19 Nächte in der kleineren Gruppe: mindestens das 1,3fache der Schwankung',f:1.3}
  :{label:'20 und mehr Nächte in der kleineren Gruppe: mindestens das 0,9fache der Schwankung',f:.9}}
/* with/without: Arrays von {E,v}. dir: +1 mehr ist besser, -1 weniger ist besser */
function compare(withG,withoutG,dir){
  const n1=withG.length,n0=withoutG.length,res={n1,n0};
  if(n1<5||n0<5){res.state='unchecked';res.reason='ungeprüft: zu wenige Nächte in einer Gruppe (mit '+n1+', ohne '+n0+', nötig sind je 5)';return res}
  const v1=withG.map(x=>x.v),v0=withoutG.map(x=>x.v);
  res.med1=median(v1);res.med0=median(v0);
  res.sp1=spread(v1);res.sp0=spread(v0);res.spread=Math.max(res.sp1,res.sp0);
  const st=stageOf(Math.min(n1,n0));res.stage=st.label;res.factor=st.f;
  res.diff=Math.abs(res.med1-res.med0);
  res.worse=dir*(res.med1-res.med0)<0;
  if(res.spread===0){res.state='unchecked';res.reason='ungeprüft: Schwankung ist 0, die Werte sind zu grob aufgelöst für eine Schwelle';return res}
  res.ratio=res.diff/res.spread;
  if(!res.worse){res.state='nolever';res.reason=res.med1===res.med0?'geprüft: kein Unterschied der Mediane':'geprüft: die Nächte mit Merkmal stehen nicht schlechter da (Zufall oder umgekehrte Ursache)';return res}
  if(res.diff<res.factor*res.spread){res.state='nolever';res.reason='geprüft: Unterschied '+r1(res.diff)+' liegt unter der Schwelle '+r1(res.factor*res.spread);return res}
  // strengste Probe: schlechteste Nacht mit Merkmal und beste ohne raus (bei Gleichstand die frühere)
  const pick=(g,worst)=>{let idx=0;for(let i=1;i<g.length;i++){const a=dir*g[i].v,b=dir*g[idx].v;if(worst?(a<b||(a===b&&g[i].E<g[idx].E)):(a>b||(a===b&&g[i].E<g[idx].E)))idx=i}return idx};
  const w2=withG.slice(),o2=withoutG.slice();
  const iw=pick(w2,true),io=pick(o2,false);
  const rem1=w2.splice(iw,1)[0],rem0=o2.splice(io,1)[0];
  const m1=median(w2.map(x=>x.v)),m0=median(o2.map(x=>x.v)),s=Math.max(spread(w2.map(x=>x.v)),spread(o2.map(x=>x.v)));
  const pr={med1:m1,med0:m0,spread:s,diff:Math.abs(m1-m0),removedWith:rem1,removedWithout:rem0};
  pr.stillWorse=dir*(m1-m0)<0;
  pr.pass=s>0&&pr.stillWorse&&pr.diff>=res.factor*s;
  res.probe=pr;
  if(!pr.pass){res.state='nolever';res.reason='bestanden, fällt aber bei der strengsten Probe durch ('+(pr.stillWorse?'Unterschied '+r1(pr.diff)+' unter Schwelle '+r1(res.factor*s):'Richtung dreht')+')';return res}
  res.state='lever';return res;
}

/* ---------- Hauptfunktion ---------- */
/* opt: {days, entries:{datum:{alcohol:true|false|null, meal:'HH:MM'|null, sick:bool}}, rated:{workoutId:rpe}, safety:'ja'|'nein'|null,
         corrections:{bedOffset:Min, hardMin:Min}, today:'YYYY-MM-DD', prevCard:{...}} */
function analyze(opt){
  opt=opt||{};
  const cor=opt.corrections||{}, entries=opt.entries||{};
  const hardMin=num(cor.hardMin)!=null?cor.hardMin:90;
  const off=num(cor.bedOffset)||0;
  const rd=readNights(opt.days,{bedOffset:off});
  const works=readWorkouts(opt.days,opt,opt.rated);
  const lesart=[],assumed=[];
  const E_ALL=Object.keys(rd.nights).sort();
  // Krankmodus: Nächte ausschließen
  const sickN=E_ALL.filter(e=>entries[e]&&entries[e].sick);
  sickN.forEach(e=>{delete rd.nights[e]});
  const keys=Object.keys(rd.nights).sort(), nights=rd.nights;
  const out={version:1,nightsTotal:E_ALL.length,sickExcluded:sickN.length,suspects:[],lesart,assumed,safety:null,lever:null};
  lesart.push('Datierung: Eine Nacht gehört zu dem Tag, an dem ich abends ins Bett gegangen bin. Der Tag wechselt um 18:00 (Zubettgehzeit nach Mitternacht = Vorabend, Zeiten in Ortszeit Europe/Berlin laut Whoop-Versatz). Training wird demselben Abend zugeordnet (Einheiten bis 4:00 Uhr zählen noch zum Vorabend).');
  lesart.push('Zubettgehzeit: Whoop liefert keine echte Zubettgehzeit, als Ersatz gilt der Schlafbeginn laut Whoop'+(off?' (minus '+off+' Min laut deiner Korrektur)':'')+'. Bei Verdächtigem 1 fällt der Befund dadurch eher zu schwach als zu stark aus.');
  if(sickN.length)lesart.push('Krankmodus: '+sickN.length+' Nacht'+(sickN.length===1?'':'e')+' aus der Auswertung ausgeschlossen.');
  out.period=keys.length?{from:keys[0],to:keys[keys.length-1]}:null;
  const meas=pickMeasure(nights);
  const usableKeys=meas?keys.filter(e=>MEASURES[meas.key].get(nights[e])!=null):[];
  out.nights=keys.length;out.usable=usableKeys.length;
  out.measure=meas?{key:meas.key,label:MEASURES[meas.key].label,unit:MEASURES[meas.key].unit,why:meas.why}:null;
  if(meas)lesart.push('Wirkungswert: '+MEASURES[meas.key].label+' – '+meas.why+(MEASURES[meas.key].dir>0?' Mehr ist besser.':' Weniger ist besser.')+' Genommen wird der Wert der Nacht nach dem Merkmal.');
  // Zu wenige Nächte
  if(!meas||usableKeys.length<14){
    out.status='insufficient';
    out.part1='Noch nicht prüfbar: '+usableKeys.length+' auswertbare Nächte, nötig sind 14 (ideal 4–8 Wochen).';
    out.part2=usableKeys.length+' von 14 Nächten'+(sickN.length?' ('+sickN.length+' Krankmodus-Nächte ausgeschlossen)':'')+'.';
    out.zettel=zettel(opt,keys,works,entries);
    out.missing=Math.max(0,14-usableKeys.length);
    finish(out,opt,[],nights,keys,meas);return out;
  }
  if(usableKeys.length<=14)lesart.push('Genau 14 Nächte: die meisten Verdächtigen werden als ungeprüft herauskommen.');
  const M=MEASURES[meas.key], val=e=>M.get(nights[e]);
  const nextVal=e=>{const n=nights[addDays(e,1)];return n?M.get(n):null};
  // Gruppenbasis
  const beds={wd:[],we:[]};
  usableKeys.forEach(e=>{(nights[e].dow===5||nights[e].dow===6?beds.we:beds.wd).push(nights[e].bed)});
  const medBed={wd:median(beds.wd),we:median(beds.we)};
  const allBed=median(usableKeys.map(e=>nights[e].bed));
  const medDur=median(usableKeys.map(e=>nights[e].asleep).filter(v=>v!=null));
  out.base={medianValue:median(usableKeys.map(val)),medianSleep:medDur,medianBed:allBed};
  lesart.push('Bettzeit-Median getrennt für Werktag-Abende (So–Do'+(medBed.wd!=null?', '+clock(medBed.wd):'')+') und Wochenend-Abende (Fr, Sa'+(medBed.we!=null?', '+clock(medBed.we):'')+'); jede Nacht wird gegen den Median ihrer eigenen Art gemessen.');
  lesart.push('„Mittlere“ heißt überall Median. Gruppenvergleich über den Median des Wirkungswerts.');
  const sus=[];
  // 1 Training
  {
    const s={id:1,name:SUSPECTS[0].name};
    const haveDur=works.length>0;
    if(!haveDur){s.state='unchecked';s.reason='ungeprüft: keine Trainingsdauern vorhanden, Verdächtiger 1 fällt aus';}
    else{
      const ratedAny=works.some(w=>w.rpe!=null);
      const hard=new Set();
      works.forEach(w=>{if((w.rpe!=null&&w.rpe>=7)||w.min>hardMin)hard.add(w);});
      let fb=false;
      if(!ratedAny){fb=true;const first=keys[0];const wk={};works.forEach(w=>{const b=Math.floor(diffDays(first,w.E)/7);if(!wk[b]||w.min>wk[b].min)wk[b]=w});Object.values(wk).forEach(w=>hard.add(w))}
      const withSet=new Set();
      hard.forEach(w=>{const n=nights[w.E];if(!n)return;const gap=(n._bedAbs-w.end)/MIN;if(gap>=0&&gap<180)withSet.add(w.E)});
      const wg=[],og=[];usableKeys.forEach(e=>{(withSet.has(e)?wg:og).push({E:e,v:val(e)})});
      Object.assign(s,compare(wg,og,M.dir));
      s.defHard='hart = von mir mit RPE ≥ 7 bewertet'+(ratedAny?'':' (keine Bewertungen vorhanden)')+' oder länger als '+hardMin+' Min'+(fb?'; ohne Bewertungen zusätzlich je Woche die längste Einheit':'');
      if(fb){s.assumption='Als „hart“ galt ersatzweise die längste Einheit je Woche, weil keine Selbstbewertungen vorliegen.';assumed.push(s.assumption)}
      s.set=[...withSet];
    }
    sus.push(s);
  }
  // 2 Bettzeit
  {
    const s={id:2,name:SUSPECTS[1].name};
    const wg=[],og=[];let late=0;
    usableKeys.forEach(e=>{const n=nights[e],we=n.dow===5||n.dow===6,med=we?medBed.we:medBed.wd;
      if(med==null||Math.abs(n.bed-med)<=60){og.push({E:e,v:val(e)});return}
      wg.push({E:e,v:val(e)});if(n.bed>med)late++});
    Object.assign(s,compare(wg,og,M.dir));s.late=late;s.set=wg.map(x=>x.E);
    if(s.state==='lever'&&late===0){s.state='nolever';s.reason='geprüft: nur frühe Abweichungen von der Bettzeit, frühe Abende sind nie das Problem'}
    sus.push(s);
  }
  // 3 Kurze Nächte (HRV der FOLGENDEN Nacht in beiden Gruppen)
  {
    const s={id:3,name:SUSPECTS[2].name};
    const wg=[],og=[];
    if(medDur!=null)usableKeys.forEach(e=>{const a=nights[e].asleep;if(a==null)return;const nv=nextVal(e);if(nv==null)return;((a<medDur-45)?wg:og).push({E:e,v:nv})});
    Object.assign(s,compare(wg,og,M.dir));s.set=wg.map(x=>x.E);
    sus.push(s);
  }
  // 4 Sprung
  {
    const s={id:4,name:SUSPECTS[3].name};
    const first=keys[0],vol={},cnt={};
    works.forEach(w=>{const b=Math.floor(diffDays(first,w.E)/7);if(b<0)return;vol[b]=(vol[b]||0)+w.min/60;cnt[b]=(cnt[b]||0)+1});
    const hasD=works.length>0;
    if(!hasD){s.state='unchecked';s.reason='ungeprüft: keine Trainingsdaten vorhanden'}
    else{
      const jumpWeeks=new Set(),skip=[];
      const wkOf=e=>Math.floor(diffDays(first,e)/7);
      Object.keys(vol).map(Number).forEach(b=>{if(b===0)return;const pv=vol[b-1]||0;if(pv<1){if(vol[b]>0)skip.push(b);return}if(vol[b]>1.3*pv)jumpWeeks.add(b)});
      const wg=[],og=[];usableKeys.forEach(e=>{const b=wkOf(e);if(b<=0)return;(jumpWeeks.has(b)?wg:og).push({E:e,v:val(e)})});
      Object.assign(s,compare(wg,og,M.dir));s.set=wg.map(x=>x.E);s.jumpWeeks=jumpWeeks.size;
      s.note=(skip.length?skip.length+' Woche(n) mit Vorwoche unter 1 h zählen nicht als Sprung. ':'')+'Die erste Woche hat keine Vorwoche, ihre Nächte bleiben außen vor. Umfang in Trainingsstunden über alle Sportarten.';
    }
    sus.push(s);
  }
  // 5 Alkohol
  {
    const s={id:5,name:SUSPECTS[4].name};
    const wg=[],og=[];let unk=0;
    usableKeys.forEach(e=>{const a=entries[e]&&entries[e].alcohol;if(a===true)wg.push({E:e,v:val(e)});else if(a===false)og.push({E:e,v:val(e)});else unk++});
    Object.assign(s,compare(wg,og,M.dir));s.unknown=unk;s.set=wg.map(x=>x.E);
    if(s.state==='unchecked'&&unk)s.reason+=' ('+unk+' Abende ohne Eintrag = unbekannt)';
    sus.push(s);
  }
  // 6 Späte Mahlzeit
  {
    const s={id:6,name:SUSPECTS[5].name};
    const wg=[],og=[];let unk=0;const cut=allBed!=null?allBed-180:null;
    usableKeys.forEach(e=>{const t=parseHM(entries[e]&&entries[e].meal);if(t==null||cut==null){unk++;return}((t>cut)?wg:og).push({E:e,v:val(e)})});
    Object.assign(s,compare(wg,og,M.dir));s.unknown=unk;s.cut=cut;s.set=wg.map(x=>x.E);
    if(s.state==='unchecked'&&unk)s.reason+=' ('+unk+' Abende ohne Uhrzeit = unbekannt)';
    sus.push(s);
  }
  // Angenommen-Hebel dürfen nie DER Hebel sein
  sus.forEach(s=>{if(s.state==='lever'&&s.assumption){s.state='assumption';s.reason='bestanden, aber auf einer Annahme gebaut ('+s.assumption+')'}});
  out.suspects=sus;
  const levers=sus.filter(s=>s.state==='lever').sort((a,b)=>b.ratio-a.ratio||a.id-b.id);
  const lv=levers[0]||null;out.lever=lv?lv.id:null;
  out.status=lv?'lever':'none';
  if(lv&&levers.length>1){
    const o=levers[1],a=new Set(lv.set||[]),b=new Set(o.set||[]);let inter=0;a.forEach(x=>{if(b.has(x))inter++});
    const uni=a.size+b.size-inter;
    if(uni&&inter/uni>=.6)out.coNote='Verdächtiger '+lv.id+' und '+o.id+' treten meist am selben Abend auf; das ist ein Zusammenhang, kein zweiter Hebel.';
  }
  finish(out,opt,sus,nights,keys,meas,{medBed,allBed,medDur,lv,M,usableKeys,val});
  return out;
}

const DEF_ACTION={
  1:c=>'Leg harte Einheiten so, dass sie spätestens 3 Stunden vor deiner mittleren Zubettgehzeit ('+clock(c.allBed)+') enden, also bis '+clock(c.allBed-180)+'.',
  2:c=>'Zieh die späten Abende an deinen Median heran: Werktag-Abende um '+clock(c.medBed.wd)+(c.medBed.we!=null?', Wochenend-Abende um '+clock(c.medBed.we):'')+'. Frühe Abende sind nicht das Problem.',
  3:c=>'Plane die Nacht so, dass du bei mindestens '+dur(c.medDur-45)+' Schlaf landest (dein Median ist '+dur(c.medDur)+'): Wenn du früh raus musst, leg dich entsprechend früher hin.',
  4:c=>'Steigere den Wochenumfang im Training um höchstens 30 % gegenüber der Vorwoche.',
  5:c=>'Lass in den nächsten zwei Wochen den Alkohol am Abend weg und prüfe danach erneut.',
  6:c=>'Leg die große Mahlzeit früher, spätestens auf '+clock(c.allBed-180)+' (3 Stunden vor deiner mittleren Zubettgehzeit). Du isst insgesamt nicht weniger; nach einem späten Training darfst du essen, was du zum Auffüllen brauchst.'
};
const WORDS={
  1:(s,u)=>'Nach harten Einheiten, die weniger als 3 Stunden vor dem Zubettgehen enden, ist dein '+u+' schlechter.',
  2:(s,u)=>'In Nächten mit unregelmäßiger Bettzeit (mehr als 60 Min neben deinem Median) ist dein '+u+' schlechter.',
  3:(s,u)=>'Nach kurzen Nächten (mehr als 45 Min unter deinem Median) ist dein '+u+' in der Folgenacht schlechter.',
  4:(s,u)=>'In Wochen, in denen dein Trainingsumfang um mehr als 30 % über der Vorwoche liegt, ist dein '+u+' schlechter.',
  5:(s,u)=>'An Abenden mit Alkohol ist dein '+u+' schlechter.',
  6:(s,u)=>'Nach großen Mahlzeiten weniger als 3 Stunden vor deiner mittleren Bettzeit ist dein '+u+' schlechter.'
};
function belegLine(s,M){
  const f=v=>r1(v)+' '+M.unit;
  return 'Mit: Median '+f(s.med1)+' (n='+s.n1+') | Ohne: Median '+f(s.med0)+' (n='+s.n0+') | Schwankung '+r1(s.spread)+' | Stufe: '+s.stage+' | nach der strengsten Probe: '+(s.probe?(s.probe.pass?'Unterschied bleibt ('+f(s.probe.diff)+' bei Schwankung '+r1(s.probe.spread)+')':'fällt durch'):'nicht geprüft');
}
function zettel(opt,keys,works,entries){
  const items=[];
  const recent=keys.slice(-14);
  const noMeal=recent.filter(e=>!(entries[e]&&entries[e].meal)).length;
  const noAlc=recent.filter(e=>!(entries[e]&&(entries[e].alcohol===true||entries[e].alcohol===false))).length;
  items.push('Ende der harten Einheit: kommt aus Whoop-Workouts'+(works.length?' (vorhanden)':' (bisher keine Workouts gefunden)')+'; Selbstbewertung in der Trainingsansicht ergänzen.');
  items.push('Letzte große Mahlzeit: im Check-in eintragen (Abend)'+(keys.length?' (bei '+noMeal+' der letzten '+recent.length+' Nächte fehlt sie)':'')+'.');
  items.push('Alkohol ja/nein: im Check-in (Abend)'+(keys.length?' (bei '+noAlc+' der letzten '+recent.length+' Nächte kein Eintrag)':'')+'.');
  items.push('Bettzeit: kommt automatisch aus Whoop (Schlafbeginn), nichts zu tun.');
  return{title:'Zwei-Wochen-Zettel',items,note:'Nach zwei Wochen erneut prüfen, über den GANZEN Zeitraum.'};
}
function finish(out,opt,sus,nights,keys,meas,ctx){
  const lesart=out.lesart;
  out.honesty='Weil sechs Verdächtige geprüft und der größte genommen wird, reißt auch bei reinem Zufall ab und zu einer die Schwelle. Deshalb ist die erneute Prüfung in zwei Wochen die eigentliche Bestätigung.';
  out.disclaimer='Erster Anhaltspunkt, ersetzt keine Schlafmedizin und keine ärztliche Beratung.';
  // Sicherheit
  const sf=opt.safety||null;
  out.safety={answer:sf==='ja'||sf==='nein'?sf:'unbekannt',ask:sf!=='ja'&&sf!=='nein',top:null,extra:null};
  const qText='Schnarchst du, hat dir jemand Atemaussetzer im Schlaf berichtet, oder bist du tagsüber massiv müde, obwohl die Nacht lang war?';
  out.safety.question=qText;
  if(sf==='ja')out.safety.top='Schnarchen, berichtete Atemaussetzer oder massive Tagesmüdigkeit trotz langer Nacht gehören ärztlich abgeklärt, bevor irgendein Hebel zählt. Schlafapnoe ist häufig und gut behandelbar und sieht in den Daten wie schlechte Erholung aus.';
  if(ctx&&meas&&ctx.usableKeys.length>=14){
    const ks=ctx.usableKeys,cut=Math.floor(ks.length*2/3),early=ks.slice(0,cut),late=ks.slice(cut);
    const vs=(arr,f)=>arr.map(e=>f(nights[e])).filter(v=>v!=null);
    const hE=vs(early,n=>n.hrv),hL=vs(late,n=>n.hrv),rE=vs(early,n=>n.rhr),rL=vs(late,n=>n.rhr);
    const long=ctx.medDur!=null&&ctx.medDur>=480;
    const trainingExplains=out.suspects.some(s=>(s.id===1||s.id===4)&&s.state==='lever');
    if(long&&hE.length>=5&&hL.length>=5&&rE.length>=5&&rL.length>=5&&median(hL)<median(hE)-(spread(hE)||0)&&median(rL)>median(rE)+(spread(rE)||0)&&!trainingExplains){
      out.safety.extra='Deine Nächte sind lang, die HRV ist zuletzt niedriger und der Ruhepuls höher als vorher, ohne dass das Training es erklärt. Wachst du morgens deutlich zu früh auf, und macht dir seit Wochen wenig Freude? Falls ja, gehört das abgeklärt (Schlafapnoe und Depression sind häufig, gut behandelbar und sehen in den Daten wie schlechte Erholung aus).';
      out.safety.ask=out.safety.answer==='unbekannt'?true:out.safety.ask;
    }
  }
  if(out.status==='insufficient'||!ctx){return}
  const c=ctx,M=c.M,lv=c.lv;
  const lvS=lv?out.suspects.find(x=>x.id===out.lever):null;
  if(sf==='ja'){out.part1='Kein Hebel – hier steht erst ein Verdacht im Weg, der abgeklärt gehört.';out.part2='Die Zahlen bestätigen den Verdacht weder noch räumen sie ihn aus.';out.action=null}
  else if(lvS){
    out.part1=WORDS[lvS.id](lvS,M.label)+' '+r1(lvS.med1)+' '+M.unit+' gegen '+r1(lvS.med0)+' '+M.unit+'.';
    out.part2=belegLine(lvS,M);
    out.action=DEF_ACTION[lvS.id](c);
  }else{
    const best=out.suspects.filter(s=>s.state==='nolever'||s.state==='assumption'||s.state==='unchecked').sort((a,b)=>(b.ratio||0)-(a.ratio||0))[0];
    const un=out.suspects.filter(s=>s.state==='unchecked').length;
    out.part1='Kein Hebel: Die Daten geben das noch nicht her ('+(un?un+' von 6 ungeprüft, ':'')+'keiner hat die Schwelle samt strengster Probe bestanden).';
    out.part2=best?('Knappste tragende Zahl – Verdächtiger '+best.id+': '+(best.n1!=null?'mit '+best.n1+' / ohne '+best.n0+' Nächte':'')+(best.diff!=null?', Unterschied '+r1(best.diff)+' bei Schwelle '+r1(best.factor*best.spread):'')+(best.state==='unchecked'?' ('+best.reason+')':'')+'.'):'Keine tragende Zahl.';
    out.action=null;out.zettel=zettel(opt,Object.keys(nights).sort(),[],opt.entries||{});
  }
  if(lvS)lesart.push(lvS.defHard||'');
  out.lesart=lesart.filter(Boolean);
  // Karte fortschreiben
  out.keep=keepCheck(opt.prevCard,out,opt.today,nights,c);
}
/* Prüft, ob der Hebel der letzten Karte gehalten hat. Ehrlich, nie als Wirkungsbeleg. */
function keepCheck(prev,out,today,nights,c){
  if(!prev||prev.hebelId==null)return null;
  const age=today&&prev.stand?diffDays(prev.stand,today):0;
  if(age>92)return{text:'Die letzte Karte ist älter als drei Monate (Vorgeschichte). Der Hebel wurde neu geprüft statt übernommen.'};
  const same=out.lever===prev.hebelId;
  if(same)return{text:'Der Hebel der letzten Karte (Verdächtiger '+prev.hebelId+') hat gehalten: er besteht auch im neuen Zeitraum.'};
  const s=(out.suspects||[]).find(x=>x.id===prev.hebelId);
  if(!s)return{text:'Der Hebel der letzten Karte (Verdächtiger '+prev.hebelId+') konnte nicht neu geprüft werden.'};
  const rare=s.n1!=null&&s.n1+s.n0>0&&s.n1/(s.n1+s.n0)<.1;
  if(rare)return{text:'Der Hebel der letzten Karte (Verdächtiger '+prev.hebelId+') hat nicht gehalten; das Merkmal kommt kaum noch vor (n='+s.n1+' von '+(s.n1+s.n0)+'), das spricht dafür, dass du die Handlung umgesetzt hast. Ein einzelner Vorher-Nachher-Vergleich belegt keine Wirkung.'};
  return{text:'Der Hebel der letzten Karte (Verdächtiger '+prev.hebelId+') hat nicht gehalten: '+(s.reason||'er besteht im neuen Zeitraum nicht mehr')+'.'};
}

/* Schlaf-Karte (Firestore) aus dem Ergebnis */
function buildCard(res,opt){
  opt=opt||{};const ent=opt.entries||{},last=k=>{const ks=Object.keys(ent).filter(d=>ent[d]&&ent[d][k]!=null&&ent[d][k]!=='').sort();return ks.length?ent[ks[ks.length-1]][k]:null};
  const lv=res.lever!=null?res.suspects.find(s=>s.id===res.lever):null,M=res.measure;
  const fmt=v=>r1(v)+' '+(M?M.unit:'');
  const alc=last('alcohol'),meal=last('meal');
  return{
    stand:opt.today||null,
    zeitraum:res.period?{von:res.period.from,bis:res.period.to,naechte:res.usable||0}:null,
    geraet:'Whoop, Wirkungswert: '+(M?M.label:'keiner'),
    basis:res.base?{wirkungswertMedian:res.base.medianValue,schlafdauerMedianMin:res.base.medianSleep}:null,
    hebel:lv?(WORDS[lv.id](lv,M.label)+' Mit: '+fmt(lv.med1)+' (n='+lv.n1+') | Ohne: '+fmt(lv.med0)+' (n='+lv.n0+')'):'noch keiner',
    hebelId:lv?lv.id:null,
    handlung:res.action||null,
    geprueftOhneBefund:(res.suspects||[]).filter(s=>s.id!==res.lever).map(s=>s.id+': '+(s.reason||'')),
    angaben:{alkohol:alc===true?'ja':alc===false?'nein':'unbekannt',spaetesEssen:meal||'unbekannt'},
    schnarchenTagesmuedigkeit:res.safety?res.safety.answer:'unbekannt',
    offen:(res.suspects||[]).filter(s=>s.state==='unchecked').map(s=>s.id+': '+s.reason),
    createdAt:Date.now()
  };
}
const API={analyze,buildCard,compare,median,spread,clock,parseHM,eveningOfBed,eveningOfWork,local,SUSPECTS,MEASURES,keepCheck,dur,r1,addDays};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.SleepLever=API;
})(typeof self!=='undefined'?self:this);
