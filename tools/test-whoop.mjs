import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const W=require('../whoop-row.js');
let fail=0; const eq=(n,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b)){fail++;console.log('FEHLER',n,'ist',JSON.stringify(a),'soll',JSON.stringify(b))}else console.log('ok',n)};
eq('leer → null',W.row(null),null);
const d={recovery:{score:{recovery_score:71,hrv_rmssd_milli:62.5,resting_heart_rate:54}},
  sleep:{start:'2026-10-13T20:30:00.000Z',tz:'+02:00',score:{sleep_performance_percentage:90,stage_summary:{total_light_sleep_time_milli:240*6e4,total_slow_wave_sleep_time_milli:90*6e4,total_rem_sleep_time_milli:120*6e4}}},
  cycle:{score:{strain:12.3},steps:9000},
  workouts:[{sport:'running',start:'2026-10-14T16:00:00Z',end:'2026-10-14T16:45:00Z',score:{strain:10,distance_meter:8000,zone_durations:{zone_two_milli:20*6e4}}},{sport:'x',start:'a',end:'b'}]};
const r=W.row(d);
eq('Recovery/HRV/Ruhepuls',[r.rec,r.hrv,r.rhr],[71,62.5,54]);
eq('Schlaf in Minuten',[r.asleep,r.deep,r.rem],[450,90,120]);
eq('Einschlafen 22:30 Ortszeit',r.onset,22*60+30);
eq('Strain/Schritte',[r.strain,r.steps,r.perf],[12.3,9000,90]);
eq('Workouts (ungültige raus)',r.workouts.map(w=>[w.sport,w.min,w.dist,w.z2]),[['running',45,8000,20]]);
const late=W.row({sleep:{start:'2026-10-13T23:30:00Z',tz:'+02:00'}});
eq('nach Mitternacht → über 1440',late.onset,1440+90);
if(fail){console.log(fail+' Fehler');process.exit(1)}else console.log('alle ok');
