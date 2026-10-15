import {createRequire} from 'module'; import fs from 'fs';
const require=createRequire(import.meta.url);
const W=require('../whoop-auto.js'), E=require('../engine.js'); const R=JSON.parse(fs.readFileSync(new URL('../rules/v2.json',import.meta.url)));
let fail=0; const eq=(n,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b)){fail++;console.log('FEHLER',n,'ist',JSON.stringify(a),'soll',JSON.stringify(b))}else console.log('ok',n)};
const H=36e5;
const sleepDay=(min,extra={})=>({sleep:{start:extra.start||'2026-10-13T20:30:00.000Z',end:'x',tz:'+02:00',score:{stage_summary:{total_light_sleep_time_milli:min*6e4,total_slow_wave_sleep_time_milli:0,total_rem_sleep_time_milli:0},...(extra.score||{})}},...(extra.rest||{})});
const tier=m=>Object.keys(W.autoDay({'2026-10-14':sleepDay(m)},'2026-10-14',{}).counts).filter(k=>k.startsWith('SLP-0')&&+k.slice(4)<=8);
eq('Schlaf 10:16 → SLP-08',tier(616),['SLP-08']);eq('Schlaf 10:15 → SLP-02',tier(615),['SLP-02']);
eq('Schlaf 9:46 → SLP-02',tier(586),['SLP-02']);eq('Schlaf 9:45 → SLP-01',tier(585),['SLP-01']);eq('Schlaf 9:15 → SLP-01',tier(555),['SLP-01']);
eq('Schlaf 9:14 → SLP-02',tier(554),['SLP-02']);eq('Schlaf 9:00 → SLP-02',tier(540),['SLP-02']);eq('Schlaf 8:59 → SLP-03',tier(539),['SLP-03']);
eq('Schlaf 7:00 → SLP-04',tier(420),['SLP-04']);eq('Schlaf 6:59 → SLP-05',tier(419),['SLP-05']);eq('Schlaf 5:59 → SLP-06',tier(359),['SLP-06']);eq('Schlaf 4:59 → SLP-07',tier(299),['SLP-07']);
// Bettzeit: Mi 14.10. (Wochentag), Einschlafen 22:30 Ortszeit (20:30Z +02:00)
const bt=(t)=>W.autoDay({'2026-10-14':sleepDay(500)},'2026-10-14',{target:t}).counts;
eq('Wochentag ohne Zielzeit: nichts',Object.keys(bt(null)).filter(k=>/SLP-(09|1[0-2])/.test(k)),[]);
eq('±30 → SLP-09',Object.keys(bt('22:15')).filter(k=>/SLP-(09|1[0-2])/.test(k)),['SLP-09']);
eq('±60 → SLP-10',Object.keys(bt('21:45')).filter(k=>/SLP-(09|1[0-2])/.test(k)),['SLP-10']);
eq('>90 → SLP-11',Object.keys(bt('20:45')).filter(k=>/SLP-(09|1[0-2])/.test(k)),['SLP-11']);
eq('>150 → SLP-12',Object.keys(bt('19:30')).filter(k=>/SLP-(09|1[0-2])/.test(k)),['SLP-12']);
// Wochenende (Sa 17.10.): 01:00 ok, 03:00 zu spät
const we=(startZ)=>Object.keys(W.autoDay({'2026-10-17':{sleep:{start:startZ,end:'x',tz:'+02:00',score:{stage_summary:{total_light_sleep_time_milli:3e7,total_slow_wave_sleep_time_milli:0,total_rem_sleep_time_milli:0}}}}},'2026-10-17',{}).counts).filter(k=>/SLP-1[34]/.test(k));
eq('Sa 01:00 → SLP-13',we('2026-10-16T23:00:00Z'),['SLP-13']);eq('Sa 03:00 → SLP-14',we('2026-10-17T01:00:00Z'),['SLP-14']);eq('Sa 02:00 → nichts',we('2026-10-17T00:00:00Z'),[]);
// Recovery-Zonen + Strain erst "final"
const day=(rec,strain,steps)=>({recovery:{score:{recovery_score:rec}},cycle:{score:{strain},steps},workouts:[]});
const ids=(d,o)=>Object.keys(W.autoDay({'2026-10-14':d},'2026-10-14',o).counts).sort();
eq('grün 67 → REC-01',ids(day(67,15),{}),['REC-01']);eq('gelb 66 → REC-02',ids(day(66,15),{}),['REC-02']);eq('rot 33 → REC-03',ids(day(33,15),{}),['REC-03']);
eq('Strain zählt nicht vor final',ids(day(80,15,9000),{}).filter(k=>/^(STR|SPU)/.test(k)),[]);
eq('grün + Strain 15 → STR-01',ids(day(80,15),{final:true}).filter(k=>k.startsWith('STR')),['STR-01']);
eq('grün + Strain 18 → STR-02',ids(day(80,18),{final:true}).filter(k=>k.startsWith('STR')),['STR-02']);
eq('grün + Strain 9 → STR-03',ids(day(80,9),{final:true}).filter(k=>k.startsWith('STR')),['STR-03']);
eq('gelb + Strain 12 → STR-04',ids(day(50,12),{final:true}).filter(k=>k.startsWith('STR')),['STR-04']);
eq('rot + Strain 8 → STR-06',ids(day(20,8),{final:true}).filter(k=>k.startsWith('STR')),['STR-06']);
eq('rot + Strain 12 → STR-07',ids(day(20,12),{final:true}).filter(k=>k.startsWith('STR')),['STR-07']);
eq('rot + Strain 15 → STR-08',ids(day(20,15),{final:true}).filter(k=>k.startsWith('STR')),['STR-08']);
eq('Schritte 12000 → SPU-12',ids(day(50,12,12000),{final:true}).filter(k=>k.startsWith('SPU')),['SPU-12']);
eq('Schritte 3000 ohne Training → SPU-13',ids(day(50,12,3000),{final:true}).filter(k=>k.startsWith('SPU')),['SPU-13']);
eq('Schritte 3000 mit manuellem Sport → nichts',ids(day(50,12,3000),{final:true,manualSport:true}).filter(k=>k.startsWith('SPU')),[]);
eq('Alkohol am Vorabend + rot',ids(day(20,5),{prevAlcohol:true}).filter(k=>/^(ALK|STR-09)/.test(k)),['ALK-07','STR-09']);
// HRV/RHR gegen 7-Tage-Schnitt, 3 Tage grün, +20
const days={};for(let i=11;i<=13;i++)days['2026-10-'+i]={recovery:{score:{recovery_score:70,hrv_rmssd_milli:60,resting_heart_rate:60}}};
days['2026-10-14']={recovery:{score:{recovery_score:92,hrv_rmssd_milli:80,resting_heart_rate:50}}};
eq('HRV/RHR/3 grün/+20',Object.keys(W.autoDay(days,'2026-10-14',{}).counts).sort(),['REC-01','REC-04','REC-05','REC-06','REC-07']);
// Workouts
const wd=(sport,min,sc)=>({recovery:{score:{recovery_score:50}},workouts:[{sport,start:'2026-10-14T08:00:00Z',end:new Date(Date.parse('2026-10-14T08:00:00Z')+min*6e4).toISOString(),score:sc||{}}]});
eq('Weightlifting 62 Min → SPK-01/02/03',ids(wd('weightlifting',62),{}).filter(k=>k.startsWith('SPK')),['SPK-01','SPK-02','SPK-03']);
eq('Weightlifting 20 Min → nichts',ids(wd('weightlifting',20),{}).filter(k=>k.startsWith('SPK')),[]);
eq('Lauf 45 Min Strain 13 Zone5 6 Min 10,2 km',ids(wd('running',45,{strain:13,distance_meter:10200,zone_durations:{zone_five_milli:6*6e4}}),{}).filter(k=>/^SP[AP]/.test(k)),['SPA-02','SPA-07','SPA-10','SPA-13']);
eq('Spinning 85 Min',ids(wd('spinning',85,{strain:16.5}),{}).filter(k=>k.startsWith('SPB')),['SPB-03','SPB-06']);
eq('Workout-Minuten fürs Knopf-Ersetzen',W.workoutMinutes({'2026-10-14':wd('spinning',62)},'2026-10-14'),{spinning:62});
// Regelwerk v2
eq('höchstens 30 Knöpfe',R.ui.buttons.length<=30,true);
eq('v2 hat dieselben Punkte wie v1',(()=>{const v1=JSON.parse(fs.readFileSync(new URL('../rules/v1.json',import.meta.url)));return v1.actions.every(a=>R.actions.find(b=>b.id===a.id).points===a.points)})(),true);
const cnt=(inp)=>E.deriveCounts(R,inp,{});
eq('Lernblock 100 → LRN-05+06',cnt({lernblock:100}),{'LRN-05':1,'LRN-06':1});
eq('Kraft 60 → 01+02+03',cnt({kraft:60}),{'SPK-01':1,'SPK-02':1,'SPK-03':1});
eq('Lauf 40 → nur SPA-02',cnt({lauf:40}),{'SPA-02':1});
eq('Süßigkeiten 3',cnt({suess:3}),{'ERN-19':3});
eq('Whoop ersetzt Knopf',E.deriveCounts(R,{spinning:60},{spinning:true}),{});
eq('Tippen: Spinning 40→60→80→aus',[E.nextValue(R.ui.buttons.find(b=>b.id==='spinning'),0),E.nextValue(R.ui.buttons.find(b=>b.id==='spinning'),40),E.nextValue(R.ui.buttons.find(b=>b.id==='spinning'),60),E.nextValue(R.ui.buttons.find(b=>b.id==='spinning'),80)],[40,60,80,0]);
console.log(fail?fail+' FEHLER':'ALLE OK');process.exit(fail?1:0);
