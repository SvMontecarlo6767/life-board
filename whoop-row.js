/* Whoop-Tag → flache Werte (Recovery, HRV, Schlaf, Strain, Workouts). Reine Funktion; Eingabe = ein Tag aus dem Worker (/data).
   Benutzt von insights-core.js (Muster); Tests: node tools/test-whoop.mjs. */
(function(root){
const num=v=>typeof v==='number'&&isFinite(v)?v:null;
const MIN=60000;
function tzMin(tz){const m=/^([+-])(\d\d):?(\d\d)$/.exec(tz||'');return m?(m[1]==='-'?-1:1)*(+m[2]*60+ +m[3]):0}
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
const api={row};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WhoopRow=api;
})(typeof window!=='undefined'?window:globalThis);
