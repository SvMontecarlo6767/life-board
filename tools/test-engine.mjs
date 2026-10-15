import {createRequire} from 'module'; import fs from 'fs';
const require=createRequire(import.meta.url);
const E=require('../engine.js'); const R=JSON.parse(fs.readFileSync(new URL('../rules/v1.json',import.meta.url)));
let fail=0; const eq=(n,a,b)=>{if(JSON.stringify(a)!==JSON.stringify(b)){fail++;console.log('FEHLER',n,'ist',a,'soll',b)}else console.log('ok',n)};
// Regeln
eq('361 Aktionen',R.actions.length,361);
eq('keine Sozial/Kreativ/Finanz',R.actions.filter(a=>['SOZ','KRE','FIN'].includes(a.cat)).length,0);
eq('keine Ne-Zeilen',R.actions.filter(a=>['MOR-09','SPP-04','PLN-08','LRN-10'].includes(a.id)).length,0);
eq('SLP-10 +150',R.actions.find(a=>a.id==='SLP-10').points,150);
eq('ERN-19',[R.actions.find(a=>a.id==='ERN-19').points,R.actions.find(a=>a.id==='ERN-19').max],[-225,3]);
// Level-Kurve gegen Tabelle im Dokument (gerundet angegeben)
const tbl={3:[9000,15000],4:[12690,27700],5:[16960,44600],10:[41670,203100],12:[50850,300300],13:[55060,355400],91:[479000,17054000],100:[598200,21941000]};
for(const [n,[c,cu]] of Object.entries(tbl)){
  const ok=Math.abs(R.level.costs[n-1]-c)/c<0.002 && Math.abs(R.level.cumulative[n-1]-cu)/cu<0.002;
  eq('Level '+n+' ~Tabelle',ok,true);
}
// Level-Grenzen
eq('Level bei 0',E.levelInfo(R,0).level,1);
eq('Level bei 6000',E.levelInfo(R,6000).level,2);
eq('Level bei 5999',E.levelInfo(R,5999).level,1);
eq('Level bei -500',E.levelInfo(R,-500).level,1);
eq('Level max',E.levelInfo(R,9e9).level,100);
// Ränge
eq('Rang 18000',E.rankOf(R,18000),'S');eq('Rang 17999',E.rankOf(R,17999),'A');eq('Rang 11000',E.rankOf(R,11000),'A');
eq('Rang 10999',E.rankOf(R,10999),'B');eq('Rang 5000',E.rankOf(R,5000),'B');eq('Rang 4999',E.rankOf(R,4999),'C');eq('Rang -12275',E.rankOf(R,-12275),'C');
// Rechnen
eq('Maximum zählt',E.computeDay(R,{'ERN-19':5}).net,-675);
eq('Stufe: nur höchste',E.computeDay(R,{'SLP-01':1,'SLP-03':1}).net,1650);
eq('Alkohol Stufe',E.computeDay(R,{'ALK-04':1}).net,-1800);
eq('Puzzle addiert',E.computeDay(R,{'MOR-01':1},{puz:330}).net,390);
eq('Zeitraum gesperrt',E.computeDay(R,{'SLP-30':1},{blocked:{'SLP-30':true}}).net,0);
eq('PR-Limit 2',E.computeDay(R,{'SPP-01':1,'SPP-02':1,'SPP-03':1}).net,1150+575);
eq('Multiplikator Rot≥14 x0,3',E.computeDay(R,{'SPK-01':1,'STR-08':1}).net,Math.round(1750*0.3)-575);
eq('STR-11 hebt auf',E.computeDay(R,{'SPK-01':1,'STR-08':1,'STR-11':1}).net,1750-575);
eq('STR-09 max 0,5',E.computeDay(R,{'SPK-01':1,'STR-09':1,'STR-10':1}).net,Math.round(1750*0.5));
eq('Minus wird nicht multipliziert',E.computeDay(R,{'SPK-19':1,'STR-07':1}).net,-975);
// Tageswechsel 04:00 Berlin
eq('03:59 Berlin = Vortag',E.dayKey(new Date('2026-10-15T01:59:00Z')),'2026-10-14'); // 03:59 MESZ
eq('04:00 Berlin = neuer Tag',E.dayKey(new Date('2026-10-15T02:00:00Z')),'2026-10-15');
eq('Winterzeit 03:59 (MEZ)',E.dayKey(new Date('2026-12-15T02:59:00Z')),'2026-12-14');
eq('Winterzeit 04:00 (MEZ)',E.dayKey(new Date('2026-12-15T03:00:00Z')),'2026-12-15');
eq('Umstellung Okt: 25.10.2026 04:00 MEZ',E.dayKey(new Date('2026-10-25T03:00:00Z')),'2026-10-25');
eq('Woche (Do 15.10.)',E.weekKey('2026-10-15'),'2026-10-12');eq('Woche (So 18.10.)',E.weekKey('2026-10-18'),'2026-10-12');
eq('Monat',E.monthKey('2026-10-15'),'2026-10');
console.log(fail?fail+' FEHLER':'ALLE OK');process.exit(fail?1:0);
