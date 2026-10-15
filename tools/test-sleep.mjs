import {createRequire} from 'module';const require=createRequire(import.meta.url);
const S=require('../sleep-lever.js');
let bad=0;const ok=(c,m)=>{console.log((c?'ok   ':'FAIL ')+m);if(!c)bad++};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),m+(JSON.stringify(a)===JSON.stringify(b)?'':' → '+JSON.stringify(a)+' ≠ '+JSON.stringify(b)));
// Helfer
eq(S.median([3,1,2]),2,'Median ungerade');eq(S.median([1,2,3,10]),2.5,'Median gerade = Mittel der mittleren');
eq(S.spread([1,2,3,4,100]),1,'Schwankung = Median der Abstände zum eigenen Median');
eq(S.parseHM('18:00'),0,'18:00 = 0');eq(S.parseHM('00:30'),390,'0:30 = 390');eq(S.clock(390),'00:30','clock zurück');
// Datierung um 18:00
const l1=S.local('2026-03-10T23:30:00.000Z','+01:00');                   // 00:30 Ortszeit am 11.
eq(S.eveningOfBed(l1),{E:'2026-03-10',m:390},'Bettzeit 0:30 gehört zum Vorabend');
const l2=S.local('2026-03-10T21:00:00.000Z','+01:00');                   // 22:00 am 10.
eq(S.eveningOfBed(l2),{E:'2026-03-10',m:240},'Bettzeit 22:00 gehört zum selben Tag');
eq(S.eveningOfBed({date:'2026-03-10',min:17*60+59}).E,'2026-03-09','17:59 → Vorabend');eq(S.eveningOfBed({date:'2026-03-10',min:18*60}).E,'2026-03-10','18:00 → selber Tag');
eq(S.eveningOfWork({date:'2026-03-11',min:90}),'2026-03-10','Training 1:30 zählt zum Vorabend');eq(S.eveningOfWork({date:'2026-03-11',min:7*60}),'2026-03-11','Training 7:00 zählt zum Tag');
// Sommerzeit: Versatz kommt aus Whoop; 00:30 +02:00
eq(S.local('2026-07-10T22:30:00.000Z','+02:00').min,30,'Zeitzonenversatz Sommerzeit');
// Gruppenvergleich
const g=(vals,off=0)=>vals.map((v,i)=>({E:'2026-01-'+String(i+1+off).padStart(2,'0'),v}));
let c=S.compare(g([50,50,50,50]),g(Array(10).fill(60)),1);eq(c.state,'unchecked','unter 5 Nächte = ungeprüft');eq([c.n1,c.n0],[4,10],'Gruppengrößen sichtbar');
c=S.compare(g([40,41,42,43,44,45]),g([60,62,64,66,68,70]),1);eq([c.stage.slice(0,8),c.factor],['unter 10',2],'Stufe <10');
c=S.compare(g([30,32,34,36,38,40,42,44,46,48]),g([60,62,64,66,68,70,72,74,76,78,80]),1);eq(c.factor,1.3,'Stufe 10–19');
c=S.compare(g(Array.from({length:20},(_,i)=>40+i)),g(Array.from({length:22},(_,i)=>70+i),0),1);eq(c.factor,0.9,'Stufe ≥20');
c=S.compare(g([50,50,50,50,50]),g([60,60,60,60,60]),1);eq(c.state,'unchecked','Schwankung 0 = ungeprüft, keine Schwelle 0');
c=S.compare(g([70,72,74,76,78]),g([40,42,44,46,48]),1);eq(c.state,'nolever','Gruppe MIT Merkmal besser = kein Hebel');
// klarer Hebel besteht; Probe
const a1=[40,42,44,46,48,50],a0=[70,72,74,76,78,80];
c=S.compare(g(a1),g(a0),1);eq(c.state,'lever','klarer Hebel');eq([c.probe.removedWith.v,c.probe.removedWithout.v],[40,80],'Probe: schlechteste MIT und beste OHNE fliegen raus (mehr=besser)');
c=S.compare(g([60,61,62,63,64,40]),g([70,71,72,73,74,75]),1); // ein Ausreißer trägt nichts
ok(c.state!=='lever'||c.probe.pass,'Ausreißer-Hebel hält die Probe nicht ohne Weiteres');
// Ruhepuls: weniger ist besser → Richtung
c=S.compare(g([64,65,66,67,68,69]),g([50,51,52,53,54,55]),-1);eq(c.state,'lever','Ruhepuls: höher mit Merkmal ist schlechter → Hebel');
c=S.compare(g([50,51,52,53,54,55]),g([64,65,66,67,68,69]),-1);eq(c.state,'nolever','Ruhepuls: niedriger mit Merkmal = kein Hebel');
// Gleichstand: frühere Nacht fliegt raus
const tie=[{E:'2026-01-05',v:40},{E:'2026-01-02',v:40},{E:'2026-01-03',v:44},{E:'2026-01-04',v:46},{E:'2026-01-06',v:48}];
c=S.compare(tie,g([70,72,74,76,78]),1);eq(c.probe&&c.probe.removedWith.E,'2026-01-02','Gleichstand: frühere Nacht');

// ---- Syntheseraum: Whoop-Tage ----
function mk(n,fn){ // fn(i) → {bedH:Stunde (ortszeit), hrv, asleepMin, workouts:[], tz}
  const days={},entries={};const start=Date.UTC(2026,0,5);
  for(let i=0;i<n;i++){
    const o=fn(i),tz='+01:00';
    const evMs=start+i*864e5;                      // Abend-Datum i, Ortszeit 00:00 UTC-basiert
    const bedLocal=evMs+o.bedH*3600e3;             // z. B. 22.5 oder 24.5
    const bedUtc=bedLocal-3600e3;
    const endUtc=bedUtc+(o.asleepMin+30)*60e3;
    const wake=new Date(endUtc+3600e3).toISOString().slice(0,10);
    const st=o.asleepMin*60e3;
    days[wake]=days[wake]||{workouts:[]};
    days[wake].sleep={id:'s'+i,start:new Date(bedUtc).toISOString(),end:new Date(endUtc).toISOString(),tz,nap:false,score:{stage_summary:{total_light_sleep_time_milli:st*.5,total_slow_wave_sleep_time_milli:st*.25,total_rem_sleep_time_milli:st*.25},sleep_performance_percentage:80}};
    days[wake].recovery={score:{hrv_rmssd_milli:o.hrv,resting_heart_rate:o.rhr??55,recovery_score:60}};
    (o.workouts||[]).forEach((w,j)=>{const d=new Date(evMs+w.startH*3600e3-3600e3);const wd=d.toISOString().slice(0,10);days[wd]=days[wd]||{workouts:[]};
      days[wd].workouts.push({id:'w'+i+'_'+j,sport:'x',start:d.toISOString(),end:new Date(d.getTime()+w.min*60e3).toISOString(),tz})});
    entries[new Date(evMs).toISOString().slice(0,10)]=o.entry||{};
  }
  return{days,entries};
}
const base=i=>({bedH:22.5+((i*7)%3)*0.1,asleepMin:450,hrv:70+((i*5)%7)});
let r=S.analyze({days:mk(10,base).days});eq([r.status,r.usable],['insufficient',10],'unter 14 Nächte: noch nicht prüfbar');ok(r.zettel&&r.zettel.items.length===4,'Zettel mit vier Dingen');ok(/10 von 14/.test(r.part2),'Zahl der Nächte genannt');
// Hebel Alkohol
let d1=mk(40,i=>{const alc=i%3===0;return Object.assign(base(i),{hrv:(alc?45:75)+((i*3)%5),entry:{alcohol:alc}})});
r=S.analyze({days:d1.days,entries:d1.entries,today:'2026-03-01'});
eq([r.status,r.lever],['lever',5],'Alkohol als Hebel gefunden');ok(/Mit: Median/.test(r.part2)&&/n=\d+/.test(r.part2)&&/Ohne: Median/.test(r.part2),'Belegzeile mit zwei Zahlen und Gruppengrößen');
ok(/Alkohol/.test(r.action),'Handlung zum Alkohol');ok(!/signifikant/i.test(JSON.stringify(r)),'kein „signifikant“');
ok(r.suspects.length===6,'sechs Verdächtige, nicht mehr');
// Determinismus
eq(S.analyze({days:d1.days,entries:d1.entries,today:'2026-03-01'}),r,'gleiche Daten → gleiches Ergebnis');
// Krankmodus schließt aus
const d2=JSON.parse(JSON.stringify(d1.entries));Object.keys(d2).slice(0,5).forEach(k=>{d2[k].sick=true});
r=S.analyze({days:d1.days,entries:d2});eq(r.sickExcluded,5,'Krankmodus-Nächte ausgeschlossen & gezählt');ok(r.lesart.some(x=>/Krankmodus/.test(x)),'steht in der Lesart');
// Späte Mahlzeit: Verbot "weniger essen"
let d3=mk(40,i=>{const late=i%2===0;return Object.assign(base(i),{hrv:(late?45:75)+((i*3)%5),entry:{meal:late?'23:15':'18:30'}})});
r=S.analyze({days:d3.days,entries:d3.entries});eq(r.lever,6,'späte Mahlzeit als Hebel');ok(/früher/.test(r.action)&&!/weniger essen|nichts essen/.test(r.action),'Handlung: früher essen, nicht weniger');
// Bettzeit: nur späte Abende → Handlung ans Median
let d4=mk(42,i=>{const lateN=i%4===0;return Object.assign(base(i),{bedH:lateN?25.2:22.5,asleepMin:450,hrv:(lateN?45:75)+((i*3)%5)})});
r=S.analyze({days:d4.days});eq(r.lever,2,'unregelmäßige Bettzeit als Hebel');ok(/späten Abende/.test(r.action)&&!/später ins Bett/.test(r.action),'Handlung: späte Abende heranziehen');
// Nacht nach Mitternacht gehört zum Vorabend (E)
ok(S.analyze({days:d4.days}).period.from==='2026-01-05','erste Nacht = Abend-Datum');
// Weekend/Werktag-Trennung: Wochenende 0:30 normal
let d5=mk(42,i=>{const dow=new Date(Date.UTC(2026,0,5+i)).getUTCDay();const we=dow===5||dow===6;return Object.assign(base(i),{bedH:we?24.5:22.5,hrv:70+((i*5)%7)})});
r=S.analyze({days:d5.days});const s2=r.suspects.find(s=>s.id===2);ok(s2.n1===0||s2.state==='unchecked','regelmäßiges Wochenend-0:30 zählt nicht als unregelmäßig (n mit Merkmal='+s2.n1+')');
// Folgenacht bei Verdächtigem 3: letzte Nacht hat keine Folgenacht → fällt raus
let d6=mk(30,i=>Object.assign(base(i),{asleepMin:i%3===0?330:450}));r=S.analyze({days:d6.days});const s3=r.suspects.find(s=>s.id===3);ok(s3.n1+s3.n0<=29,'Verdächtiger 3: Nächte ohne Folgenacht fallen heraus ('+(s3.n1+s3.n0)+' von 30)');
// Verdächtiger 1: ohne Workouts = ungeprüft; mit Workouts testbar
eq(r.suspects.find(s=>s.id===1).state,'unchecked','ohne Trainingsdauern fällt Verdächtiger 1 aus');
let d7=mk(42,i=>{const hard=i%3===0;return Object.assign(base(i),{hrv:(hard?45:75)+((i*3)%5),workouts:hard?[{startH:19.5,min:100}]:[{startH:7,min:40}]})});
r=S.analyze({days:d7.days});eq(r.suspects.find(s=>s.id===1).state,'assumption','harte späte Einheit ohne Bewertung: bestanden, aber Annahme');
ok(r.assumed.length===1,'ohne Selbstbewertung: Ersatzregel als Annahme genannt');
// Annahme-gebauter Hebel wird nie DER Hebel
eq([r.status],['none'],'Hebel nur auf Annahme (Wochenlängste statt Bewertung) ist nie DER Hebel');
eq(r.suspects.find(s=>s.id===1).state,'assumption','steht als „bestanden, aber auf Annahme gebaut“');
const rated={};Object.values(d7.days).forEach(d=>d.workouts.forEach(w=>{rated[w.id]=(new Date(w.end)-new Date(w.start))/6e4>60?8:3}));
r=S.analyze({days:d7.days,rated});eq(r.lever,1,'mit Selbstbewertung ist Verdächtiger 1 DER Hebel');ok(/spätestens/.test(r.action)&&!/später hart/.test(r.action),'Handlung: früher enden');
// Sprung
let d8=mk(56,i=>{const wk=Math.floor(i/7);const jump=wk%2===1;return Object.assign(base(i),{hrv:(jump?45:75)+((i*3)%5),workouts:[{startH:7,min:jump?60:25}]})});
r=S.analyze({days:d8.days});const s4=r.suspects.find(s=>s.id===4);ok(s4.n1>=5,'Sprungwochen erkannt (n='+s4.n1+')');
// SPRUNG: erste Woche ohne Vorwoche bleibt außen vor
ok(s4.n1+s4.n0<=49,'erste Woche (7 Nächte) außen vor ('+(s4.n1+s4.n0)+')');
// Sicherheit
r=S.analyze({days:d1.days,entries:d1.entries,safety:'ja'});ok(/Kein Hebel – hier steht erst ein Verdacht/.test(r.part1)&&r.safety.top&&r.action===null,'Sicherheitsfrage „ja“: zwei Sätze oben, kein Hebel');
r=S.analyze({days:d1.days,entries:d1.entries});eq([r.safety.answer,r.safety.ask],['unbekannt',true],'Schweigen ist kein „nein“');
// Wirkungswert-Fallback
const dr=JSON.parse(JSON.stringify(d1.days));Object.values(dr).forEach((d,i)=>{if(d.recovery&&i%2===0)delete d.recovery.score.hrv_rmssd_milli});
r=S.analyze({days:dr,entries:d1.entries});eq(r.measure.key,'rhr','HRV in >25 % fehlend, Ruhepuls vorhanden → Ruhepuls');
// Keine Verbotsworte irgendwo
const all=JSON.stringify(S.analyze({days:d1.days,entries:d1.entries}));ok(!/Koffein|Kaffee|Melatonin|weniger essen|kürzer schlafen/i.test(all),'keine verbotenen Empfehlungen');
// Karte
const card=S.buildCard(S.analyze({days:d1.days,entries:d1.entries,today:'2026-03-01'}),{today:'2026-03-01',entries:d1.entries});
ok(card.hebelId===5&&card.stand==='2026-03-01'&&card.zeitraum.naechte>=14&&card.schnarchenTagesmuedigkeit==='unbekannt','Karte: Felder gesetzt');
// Fortschreiben
const prev={hebelId:5,stand:'2025-10-01'};r=S.analyze({days:d1.days,entries:d1.entries,today:'2026-03-01',prevCard:prev});ok(/drei Monate/.test(r.keep.text),'Karte älter als 3 Monate = Vorgeschichte');
r=S.analyze({days:d1.days,entries:d1.entries,today:'2026-03-01',prevCard:{hebelId:5,stand:'2026-02-10'}});ok(/gehalten/.test(r.keep.text),'Hebel gehalten');
r=S.analyze({days:d1.days,entries:d1.entries,today:'2026-03-01',prevCard:{hebelId:3,stand:'2026-02-10'}});ok(/nicht gehalten/.test(r.keep.text),'Hebel nicht gehalten wird ehrlich gesagt');
console.log(bad?'\nFEHLER: '+bad:'\nalles ok');process.exit(bad?1:0);
