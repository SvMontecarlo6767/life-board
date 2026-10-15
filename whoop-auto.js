/* Whoop → automatische Aktionen (Regelwerk v2). Reine Funktionen; Eingabe = Tage aus dem Worker (/data).
   Liefert pro Tag die Aktions-IDs, die Whoop selbst auslöst. Alles, was vom Tagesverlauf abhängt (Strain, Schritte),
   zählt erst, wenn der Tag vorbei oder abgeschlossen ist (opt.final), damit morgens nichts Falsches steht. */
(function(root){
const num=v=>typeof v==='number'&&isFinite(v)?v:null;
const MIN=60000;
function addDays(key,n){const [y,m,d]=key.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d+n));return t.getUTCFullYear()+'-'+String(t.getUTCMonth()+1).padStart(2,'0')+'-'+String(t.getUTCDate()).padStart(2,'0')}
function dow(key){const [y,m,d]=key.split('-').map(Number);return new Date(Date.UTC(y,m-1,d)).getUTCDay()} // 0 = So
function tzMin(tz){const m=/^([+-])(\d\d):?(\d\d)$/.exec(tz||'');return m?(m[1]==='-'?-1:1)*(+m[2]*60+ +m[3]):0}
const SPORTS={
  strength:/weight|strength|power|cross|functional|gym|kraft/i,
  run:/^run|running|jog|lauf/i,
  spin:/spin|cycl|bike|rad/i
};
/* Tag → flache Werte */
function row(d){
  if(!d)return null;
  const rs=d.recovery&&d.recovery.score||null, ss=d.sleep&&d.sleep.score||null, cs=d.cycle&&d.cycle.score||null;
  const st=ss&&ss.stage_summary||{};
  const L=num(st.total_light_sleep_time_milli),S=num(st.total_slow_wave_sleep_time_milli),R=num(st.total_rem_sleep_time_milli);
  let onset=null;
  if(d.sleep&&d.sleep.start){
    const t=Date.parse(d.sleep.start);
    if(!isNaN(t)){const l=new Date(t+tzMin(d.sleep.tz)*MIN);let m=l.getUTCHours()*60+l.getUTCMinutes();if(m<12*60)m+=1440;onset=m} // 0:00 = 1440
  }
  return{
    rec:num(rs&&rs.recovery_score),hrv:num(rs&&rs.hrv_rmssd_milli),rhr:num(rs&&rs.resting_heart_rate),
    asleep:(L!=null&&S!=null&&R!=null)?(L+S+R)/MIN:null,deep:S!=null?S/MIN:null,rem:R!=null?R/MIN:null,
    perf:num(ss&&ss.sleep_performance_percentage),cons:num(ss&&ss.sleep_consistency_percentage),eff:num(ss&&ss.sleep_efficiency_percentage),
    onset,strain:num(cs&&cs.strain),steps:num(d.cycle&&d.cycle.steps),
    workouts:(d.workouts||[]).map(w=>{
      const sc=w.score||{},z=sc.zone_durations||{};
      return{sport:String(w.sport||''),min:(Date.parse(w.end)-Date.parse(w.start))/MIN,strain:num(sc.strain),dist:num(sc.distance_meter),
        z2:(num(z.zone_two_milli)||0)/MIN,z4:(num(z.zone_four_milli)||0)/MIN,z5:(num(z.zone_five_milli)||0)/MIN}
    }).filter(w=>isFinite(w.min)&&w.min>0)
  };
}
const mean=a=>{a=a.filter(v=>v!=null);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null};
const zone=r=>r==null?null:r>=67?'g':r>=34?'y':'r';
function sleepTier(m){return m>615?'SLP-08':m>=586?'SLP-02':m>=555?'SLP-01':m>=540?'SLP-02':m>=480?'SLP-03':m>=420?'SLP-04':m>=360?'SLP-05':m>=300?'SLP-06':'SLP-07'}

/* days: {datum: Tag}; key: Tag; opt: {final, target:'HH:MM'|null, prevAlcohol:boolean, manualSport:boolean} */
function autoDay(days,key,opt){
  opt=opt||{};const out={};const why={};const add=(id,t)=>{out[id]=1;why[id]=t};
  const r=row(days[key]);
  const have={recovery:!!(r&&r.rec!=null),sleep:!!(r&&r.asleep!=null),strain:!!(r&&r.strain!=null),workouts:r?r.workouts.length:0,steps:r?r.steps:null};
  if(!r)return{counts:out,why,have,row:null};
  const prev=[1,2,3,4,5,6,7].map(i=>row(days[addDays(key,-i)]));
  const z=zone(r.rec);
  // Schlaf
  if(r.asleep!=null){
    add(sleepTier(r.asleep),'Schlaf '+Math.floor(r.asleep/60)+':'+String(Math.round(r.asleep%60)).padStart(2,'0')+' h');
    if(r.asleep<360)add('STR-10','Schlaf unter 6 h');
  }
  if(r.cons!=null&&r.cons>=80)add('SLP-15','Konsistenz '+Math.round(r.cons)+' %');
  if(r.perf!=null){
    if(r.perf>=100)add('SLP-16','Performance '+Math.round(r.perf)+' %');
    else if(r.perf>=85)add('SLP-17','Performance '+Math.round(r.perf)+' %');
    else if(r.perf<70)add('SLP-18','Performance '+Math.round(r.perf)+' %');
  }
  if(r.eff!=null&&r.eff>=90)add('SLP-19','Effizienz '+Math.round(r.eff)+' %');
  if(r.deep!=null&&r.deep>=90)add('SLP-20','Tiefschlaf '+Math.round(r.deep)+' Min');
  if(r.rem!=null&&r.rem>=90)add('SLP-21','REM '+Math.round(r.rem)+' Min');
  if(r.onset!=null){
    const wd=dow(key);
    if(wd===0||wd===6){                       // Wochenende: 1:30 ist die Höchstgrenze
      if(r.onset<=1440+90)add('SLP-13','eingeschlafen bis 1:30');
      else if(r.onset>1440+150)add('SLP-14','nach 2:30 eingeschlafen');
    }else if(opt.target){
      const [h,m]=opt.target.split(':').map(Number);let t=h*60+m;if(t<12*60)t+=1440;
      const diff=Math.abs(r.onset-t);
      if(diff<=30)add('SLP-09','Einschlafen ±30 Min um '+opt.target);
      else if(diff<=60)add('SLP-10','Einschlafen ±60 Min um '+opt.target);
      else if(diff>150)add('SLP-12','mehr als 150 Min daneben');
      else if(diff>90)add('SLP-11','mehr als 90 Min daneben');
    }
  }
  // Recovery
  if(r.rec!=null){
    add(z==='g'?'REC-01':z==='y'?'REC-02':'REC-03','Recovery '+Math.round(r.rec)+' %');
    const hv=mean(prev.map(p=>p&&p.hrv)),rv=mean(prev.map(p=>p&&p.rhr));
    if(r.hrv!=null&&hv!=null&&prev.filter(p=>p&&p.hrv!=null).length>=3&&r.hrv>hv)add('REC-04','HRV '+Math.round(r.hrv)+' über Ø '+Math.round(hv));
    if(r.rhr!=null&&rv!=null&&prev.filter(p=>p&&p.rhr!=null).length>=3&&r.rhr<rv)add('REC-05','Ruhepuls '+Math.round(r.rhr)+' unter Ø '+Math.round(rv));
    if(r.rec>=67&&prev[0]&&prev[0].rec>=67&&prev[1]&&prev[1].rec>=67)add('REC-06','3 Tage grün');
    if(prev[0]&&prev[0].rec!=null&&r.rec-prev[0].rec>=20)add('REC-07','+'+Math.round(r.rec-prev[0].rec)+' zum Vortag');
    if(opt.prevAlcohol){
      if(z==='r')add('ALK-07','Recovery rot nach Alkohol');
      else if(z==='y')add('ALK-08','Recovery gelb nach Alkohol');
    }
  }
  if(opt.prevAlcohol)add('STR-09','Alkohol am Vorabend');
  // Workouts
  const best=(re)=>r.workouts.filter(w=>re.test(w.sport)).sort((a,b)=>b.min-a.min)[0];
  const ws=best(SPORTS.strength);
  if(ws){ if(ws.min>=30)add('SPK-01','Whoop: '+Math.round(ws.min)+' Min '+ws.sport); if(ws.min>=45)add('SPK-02','≥ 45 Min'); if(ws.min>=60)add('SPK-03','≥ 60 Min') }
  const wr=best(SPORTS.run);
  if(wr){
    if(wr.min>=40)add('SPA-02','Lauf '+Math.round(wr.min)+' Min');else if(wr.min>=20)add('SPA-01','Lauf '+Math.round(wr.min)+' Min');
    if(wr.z2>=30)add('SPA-03','Zone 2: '+Math.round(wr.z2)+' Min');
    if(wr.z5>=5)add('SPA-07','Zone 5: '+Math.round(wr.z5)+' Min');
    if(wr.z4+wr.z5>=15)add('SPA-08','Zone 4–5: '+Math.round(wr.z4+wr.z5)+' Min');
    if(wr.strain!=null){ if(wr.strain>=16)add('SPA-11','Lauf-Strain '+wr.strain.toFixed(1));else if(wr.strain>=12)add('SPA-10','Lauf-Strain '+wr.strain.toFixed(1));else if(wr.strain>=8)add('SPA-09','Lauf-Strain '+wr.strain.toFixed(1)) }
    if(wr.dist!=null){ if(wr.dist>=10000)add('SPA-13','Strecke '+(wr.dist/1000).toFixed(1)+' km');else if(wr.dist>=5000)add('SPA-12','Strecke '+(wr.dist/1000).toFixed(1)+' km');
      let prevMax=0;Object.keys(days).filter(k=>k<key).forEach(k=>{const q=row(days[k]);if(q)q.workouts.filter(w=>SPORTS.run.test(w.sport)&&w.dist).forEach(w=>{prevMax=Math.max(prevMax,w.dist)})});
      if(prevMax>0&&wr.dist>prevMax)add('SPP-10','längster Lauf bisher') }
  }
  const wp=best(SPORTS.spin);
  if(wp){
    if(wp.min>=80)add('SPB-03','Spinning '+Math.round(wp.min)+' Min');else if(wp.min>=60)add('SPB-02','Spinning '+Math.round(wp.min)+' Min');else if(wp.min>=40)add('SPB-01','Spinning '+Math.round(wp.min)+' Min');
    if(wp.strain!=null){ if(wp.strain>=16)add('SPB-06','Spinning-Strain '+wp.strain.toFixed(1));else if(wp.strain>=12)add('SPB-05','Spinning-Strain '+wp.strain.toFixed(1));else if(wp.strain>=8)add('SPB-04','Spinning-Strain '+wp.strain.toFixed(1)) }
    if(wp.z2>=30)add('SPB-07','Zone 2: '+Math.round(wp.z2)+' Min');
  }
  // Tagesverlauf-abhängig: erst wenn der Tag vorbei oder abgeschlossen ist
  if(opt.final){
    if(r.strain!=null&&r.rec!=null){
      const s=r.strain,st='Strain '+s.toFixed(1);
      if(z==='g'){ if(s>=18)add('STR-02',st+' bei grün'); else if(s>=14)add('STR-01',st+' bei grün'); else if(s<10)add('STR-03',st+' bei grün (verschenkt)') }
      else if(z==='y'){ if(s>=10&&s<14)add('STR-04',st+' bei gelb') }
      else{ if(s<=9)add('STR-06',st+' bei rot'); else if(s<14)add('STR-07',st+' bei rot'); else add('STR-08',st+' bei rot') }
    }
    if(r.strain!=null&&r.strain>=14&&prev[0]&&prev[0].strain>=14&&prev[1]&&prev[1].strain>=14)add('STR-14','3 Tage Strain ≥ 14');
    if(r.steps!=null){
      if(r.steps>=12000)add('SPU-12',r.steps+' Schritte');else if(r.steps>=8000)add('SPU-11',r.steps+' Schritte');
      else if(r.steps<4000&&!r.workouts.length&&!opt.manualSport)add('SPU-13','nur '+r.steps+' Schritte, kein Training');
    }
  }
  return{counts:out,why,have,row:r};
}
/* Welche Tap-Knöpfe ersetzt Whoop an diesem Tag? -> {buttonId: Minuten} */
function workoutMinutes(days,key){
  const r=row(days[key]);const o={};if(!r)return o;
  const best=(re)=>r.workouts.filter(w=>re.test(w.sport)).sort((a,b)=>b.min-a.min)[0];
  const s=best(SPORTS.strength),l=best(SPORTS.run),p=best(SPORTS.spin);
  if(s)o.kraft=Math.round(s.min);if(l)o.lauf=Math.round(l.min);if(p)o.spinning=Math.round(p.min);
  return o;
}
const api={autoDay,workoutMinutes,row,SPORTS};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WhoopAuto=api;
})(typeof window!=='undefined'?window:globalThis);
