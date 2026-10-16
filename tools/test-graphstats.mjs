import {createRequire} from 'module';const require=createRequire(import.meta.url);
const G=require('../graph-stats.js');
let bad=0;const ok=(c,m)=>{console.log((c?'ok   ':'FAIL ')+m);if(!c)bad++};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),m+(JSON.stringify(a)===JSON.stringify(b)?'':' → '+JSON.stringify(a)+' ≠ '+JSON.stringify(b)));
const ser=(start,vals)=>vals.map((v,i)=>({date:G.addDays(start,i),value:v})).filter(p=>p.value!==undefined);
eq(G.median([1,3,2]),2,'Median ungerade');eq(G.median([1,2,3,10]),2.5,'Median gerade');eq(G.median([]),null,'Median leer');
eq(G.dayNum('2026-03-29')-G.dayNum('2026-03-28'),1,'Sommerzeit-Umstellung: Tage zählen 1');eq(G.addDays('2026-10-25','1'*1),'2026-10-26','Winterzeit-Tag');eq(G.dayNum('2026-10-26')-G.dayNum('2026-10-25'),1,'Winterzeit: 1 Tag');
eq(G.addDays('2026-12-31',1),'2027-01-01','Jahreswechsel');eq(G.dowOf('2026-10-16'),4,'16.10.2026 = Freitag (Mo=0)');
const s=ser('2026-01-01',[10,20,null,40,50,30,20,10,60,70]);              // 10 Tage, ein Loch
let st=G.compute(s,'2026-01-01','2026-01-10',{dir:1});
eq([st.n,st.days],[9,10],'Datenpunkte 9 von 10 Tagen (Lücke nicht mitgerechnet)');
eq(Math.round(st.mean*100)/100,34.44,'Mittelwert ohne Lücke');eq(st.median,30,'Median');
eq([st.best.value,st.best.date,st.worst.value,st.worst.date],[70,'2026-01-10',10,'2026-01-01'],'Bestwert/Tiefstwert (mehr = besser), Gleichstand: früherer Tag');
st=G.compute(s,'2026-01-01','2026-01-10',{dir:-1});eq([st.best.value,st.worst.value],[10,70],'Richtung weniger = besser dreht Best/Tief (Ruhepuls)');
st=G.compute(s,'2026-01-01','2026-01-10',{dir:0});ok(st.neutralExtremes&&st.best.value===70,'neutral: Höchstwert/Tiefstwert');
eq(G.compute(s,'2026-03-01','2026-03-07',{}).empty,true,'leerer Zeitraum');
st=G.compute(ser('2026-01-01',[5]),'2026-01-01','2026-01-01',{dir:1});eq([st.n,st.mean,st.median,st.trend],[1,5,5,undefined],'nur ein Datenpunkt');
// Trend gegen Vorzeitraum
const t=ser('2026-01-01',[10,10,10,10,10,20,20,20,20,20]);
st=G.compute(t,'2026-01-06','2026-01-10',{dir:1});eq([st.trend.diff,st.trend.pct,st.trend.good],[10,100,true],'Trend: +10 (+100 %), gut');
st=G.compute(t,'2026-01-06','2026-01-10',{dir:-1});eq(st.trend.good,false,'Trend bei Ruhepuls: Anstieg ist schlecht');
st=G.compute(t,'2026-01-01','2026-01-05',{dir:1});eq(st.trend,undefined,'kein Vorzeitraum → kein Trend');
// Summe, gute Tage, Streak
const g=ser('2026-01-01',[70,80,20,70,75,90,10,70]);
st=G.compute(g,'2026-01-01','2026-01-08',{dir:1,goodMin:67,sum:true});eq([st.goodDays,st.streakBest,st.streakNow,st.sum],[6,3,1,485],'gute Tage, längster Streak, aktueller Streak, Summe');
const gap=[{date:'2026-01-01',value:70},{date:'2026-01-03',value:70}];
eq(G.compute(gap,'2026-01-01','2026-01-03',{dir:1,goodMin:67}).streakBest,1,'Streak reißt bei fehlendem Kalendertag');
// Wochentage
const many=[];for(let i=0;i<28;i++)many.push({date:G.addDays('2026-01-05',i),value:G.dowOf(G.addDays('2026-01-05',i))===5?100:50});
st=G.compute(many,'2026-01-05','2026-02-01',{dir:1});eq([st.dowBest.name,st.dowWorst.n>0,st.dow[5].mean],['Samstag',true,100],'bester Wochentag');
st=G.compute(many.slice(0,6),'2026-01-05','2026-01-10',{dir:1});eq(st.dowBest,undefined,'Wochentags-Auswertung erst ab 14 Punkten');
// Bereiche
eq(G.availableRanges(ser('2026-01-01',Array(10).fill(1))).map(r=>r.id),['7','30'],'10 Tage Daten: 7 und 30');
eq(G.availableRanges(ser('2026-01-01',Array(3).fill(1))).map(r=>r.id),['7'],'3 Tage Daten: nur 7');
eq(G.availableRanges(ser('2025-01-01',Array(400).fill(1))).map(r=>r.id),['7','30','90','365','all'],'400 Tage: alles');
eq(G.availableRanges([]),[],'keine Daten, keine Zeiträume');
eq(G.bounds(s,'7').from,'2026-01-04','Zeitraum 7 Tage endet am letzten Datenpunkt');
eq(G.bounds(s,'all',undefined).from,'2026-01-01','Alles ab erstem Punkt');
// Downsampling: Extrema bleiben, Statistik bleibt aus Original
const big=[];for(let i=0;i<5000;i++)big.push({date:G.addDays('2013-01-01',i),value:(i*37)%101});big[2500].value=500;big[1700].value=-9;
const ds=G.downsample(big,200);ok(ds.length<=210&&ds.some(p=>p.value===500)&&ds.some(p=>p.value===-9),'Downsampling erhält Spitzen ('+ds.length+')');
eq(G.compute(big,big[0].date,big[4999].date,{}).max.value,500,'Statistik aus Originaldaten');
eq(G.clean([{date:'2026-01-01',value:NaN},{date:'2026-01-02',value:'x'},{date:'2026-01-03',value:3}]).length,1,'ungültige Werte werden ignoriert');
eq(G.todayBerlin(new Date('2026-03-28T23:30:00Z')),'2026-03-29','Berlin: 23:30 UTC ist schon der nächste Tag');
ok(/Durchschnitt/.test(G.describe('HRV','ms',0,G.compute(s,'2026-01-01','2026-01-10',{dir:1}),'30 Tage')),'Jarvis-Text');
console.log(bad?'\nFEHLER: '+bad:'\nalles ok');process.exit(bad?1:0);
