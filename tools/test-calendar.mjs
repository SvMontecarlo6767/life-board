import {createRequire} from 'module';const require=createRequire(import.meta.url);
const C=require('../calendar-core.js');
let bad=0;const ok=(c,m)=>{console.log((c?'ok   ':'FAIL ')+m);if(!c)bad++};
const eq=(a,b,m)=>ok(JSON.stringify(a)===JSON.stringify(b),m+(JSON.stringify(a)===JSON.stringify(b)?'':' → '+JSON.stringify(a)+' ≠ '+JSON.stringify(b)));
const N=o=>{const r=C.normalize(o);if(r.err)throw new Error(r.err);return r.e};
// Datum
eq(C.dowOf('2026-10-16'),4,'16.10.2026 = Freitag');eq(C.isoWeek('2026-10-16'),{week:42,year:2026},'KW 42');eq(C.isoWeek('2026-01-01'),{week:1,year:2026},'KW 1 2026');eq(C.isoWeek('2027-01-01'),{week:53,year:2026},'1.1.2027 gehört zu KW 53/2026');
eq(C.monthGrid(2026,10)[0].date,'2026-09-28','Oktober 2026 beginnt im Raster am Mo 28.9.');eq(C.monthGrid(2026,10).length,42,'42 Zellen');
// Berlin-Zeit / Sommerzeit
eq(C.berlinMs('2026-07-01','12:00'),Date.UTC(2026,6,1,10,0),'Sommer: 12:00 Berlin = 10:00 UTC');eq(C.berlinMs('2026-01-15','12:00'),Date.UTC(2026,0,15,11,0),'Winter: 12:00 = 11:00 UTC');
eq(C.berlinMs('2026-03-29','12:00'),Date.UTC(2026,2,29,10,0),'Umstellungstag 29.3.: mittags schon Sommerzeit');eq(C.berlinMs('2026-10-25','12:00'),Date.UTC(2026,9,25,11,0),'25.10.: mittags Winterzeit');
// Normalisieren
ok(C.normalize({title:'',date:'2026-10-16'}).err,'leerer Titel abgelehnt');ok(C.normalize({title:'x',date:'2026-02-30'}).err,'30. Februar abgelehnt');ok(C.normalize({title:'x',date:'2026-10-16',time:'25:00'}).err,'Uhrzeit 25:00 abgelehnt');
ok(C.normalize({title:'x',date:'2026-10-16',time:'10:00',end:'09:00'}).err,'Ende vor Start abgelehnt');ok(C.normalize({title:'x',date:'2026-10-16',endDate:'2026-10-10'}).err,'Enddatum vor Start abgelehnt');
ok(C.normalize({title:'x',date:'2026-10-16',rem:-5}).err,'negative Erinnerung abgelehnt');ok(C.normalize({title:'x',date:'2026-10-16',rep:'jeden'}).err,'unbekannte Wiederholung abgelehnt');
eq(N({title:' Zahnarzt  ',date:'2026-10-16',cat:'komisch'}).cat,'termin','Unbekannte Kategorie -> Termin');
// Einmalig + mehrtägig
let ev=[N({id:'a',title:'Zahnarzt',date:'2026-10-20',time:'15:00',end:'16:00'}),N({id:'b',title:'Urlaub',date:'2026-10-30',endDate:'2026-11-02'})];
let oc=C.occurrences(ev,'2026-10-01','2026-10-31');eq(oc.map(o=>o.date+o.title),['2026-10-20Zahnarzt','2026-10-30Urlaub','2026-10-31Urlaub'],'Einmalig und Urlaub im Oktober (2 Tage)');
oc=C.occurrences(ev,'2026-11-01','2026-11-30');eq(oc.map(o=>o.date+'/'+o.dayIdx),['2026-11-01/2','2026-11-02/3'],'Urlaub läuft in den Folgemonat hinein');
eq(C.occurrences(ev,'2026-10-31','2026-10-31')[0].title,'Urlaub','Fenster mitten im Mehrtagestermin');
// Täglich / wöchentlich
const dly=N({id:'d',title:'Lesen',date:'2026-10-01',rep:'daily',every:3,until:'2026-10-13'});eq(C.occurrences([dly],'2026-10-05','2026-10-20').map(o=>o.date),['2026-10-07','2026-10-10','2026-10-13'],'Alle 3 Tage, bis 13.10.');
const wk=N({id:'w',title:'Lauf',date:'2026-10-05',rep:'weekly',wd:[0,2,5]});eq(wk.date,'2026-10-05','Wochentage gespeichert');
eq(C.occurrences([wk],'2026-10-01','2026-10-18').map(o=>o.date),['2026-10-05','2026-10-07','2026-10-10','2026-10-12','2026-10-14','2026-10-17'],'Mo/Mi/Sa wöchentlich ab 5.10.');
const wk2=N({id:'w2',title:'Review',date:'2026-10-06',rep:'weekly',every:2});eq(C.occurrences([wk2],'2026-10-01','2026-11-10').map(o=>o.date),['2026-10-06','2026-10-20','2026-11-03'],'Alle 2 Wochen Dienstag');
eq(C.occurrences([wk],'2026-09-01','2026-10-04').length,0,'Wiederholung beginnt nicht vor dem Startdatum');
// Monatlich / jährlich mit Randfällen
const mo=N({id:'m',title:'Miete',date:'2026-01-31',rep:'monthly'});eq(C.occurrences([mo],'2026-01-01','2026-05-31').map(o=>o.date),['2026-01-31','2026-02-28','2026-03-31','2026-04-30','2026-05-31'],'Monatlich am 31.: kurzer Monat -> letzter Tag');
const yr=N({id:'y',title:'Schaltgeburtstag',date:'2024-02-29',rep:'yearly'});eq(C.occurrences([yr],'2025-01-01','2028-12-31').map(o=>o.date),['2025-02-28','2026-02-28','2027-02-28','2028-02-29'],'Jährlich 29.2.: 28.2. in Nicht-Schaltjahren');
eq(C.occurrences([N({id:'j',title:'Jahrestag',date:'2020-12-24',rep:'yearly'})],'2026-12-20','2026-12-31').length,1,'Jährlich aus Vorjahren sichtbar');
// Ausnahmen / erledigt
const ex=N({id:'x',title:'Yoga',date:'2026-10-05',rep:'weekly',exc:['2026-10-12'],doneOn:['2026-10-19'],track:true});oc=C.occurrences([ex],'2026-10-05','2026-10-26');
eq(oc.map(o=>o.date),['2026-10-05','2026-10-19','2026-10-26'],'Ausnahme-Tag entfällt');eq(oc.map(o=>o.done),[false,true,false],'Nur der abgehakte Tag ist erledigt');
// Sortierung
oc=C.dayList(C.occurrences([N({id:'1',title:'B',date:'2026-10-16',time:'14:00'}),N({id:'2',title:'A',date:'2026-10-16',time:'09:00'}),N({id:'3',title:'Z ganztägig',date:'2026-10-16'})],'2026-10-16','2026-10-16'),'2026-10-16');
eq(oc.map(o=>o.title),['Z ganztägig','A','B'],'Ganztägig zuerst, dann Uhrzeit');
// Layout überschneidender Termine
const lay=C.layoutDay(C.occurrences([N({id:'1',title:'A',date:'2026-10-16',time:'09:00',end:'11:00'}),N({id:'2',title:'B',date:'2026-10-16',time:'10:00',end:'12:00'}),N({id:'3',title:'C',date:'2026-10-16',time:'13:00',end:'14:00'})],'2026-10-16','2026-10-16'));
eq(lay.map(l=>[l.o.title,l.col,l.n]),[['A',0,2],['B',1,2],['C',0,1]],'Überschneidung A/B zwei Spalten, C allein');
// Erinnerungen
const rem=[N({id:'r',title:'Zahnarzt',date:'2026-10-16',time:'15:00',rem:30}),N({id:'q',title:'Ganztag',date:'2026-10-17',rem:0}),N({id:'n',title:'ohne',date:'2026-10-16',time:'15:00'})];
let now=C.berlinMs('2026-10-16','14:20');eq(C.remindersDue(rem,now).map(r=>r.id),[],'14:20: noch nicht fällig (fällig ab 14:30)');
now=C.berlinMs('2026-10-16','14:31');eq(C.remindersDue(rem,now).map(r=>r.id),['r'],'14:31: Zahnarzt fällig');
eq(C.remindersDue(rem,now,{'r|2026-10-16':1}).length,0,'bestätigte Erinnerung kommt nicht wieder');
now=C.berlinMs('2026-10-16','18:30');eq(C.remindersDue(rem,now).length,0,'3 Stunden nach Start verfällt sie');
now=C.berlinMs('2026-10-17','09:05');eq(C.remindersDue(rem,now).map(r=>r.id),['q'],'Ganztägig: ab 9 Uhr am Tag');
eq(C.remindersDue([N({id:'k',title:'Abgehakt',date:'2026-10-16',time:'15:00',rem:0,doneOn:['2026-10-16']})],C.berlinMs('2026-10-16','15:01')).length,0,'Erledigte Termine erinnern nicht');
eq(C.relText(90),'in 1 Std 30 Min','Relativtext Stunden');eq(C.relText(0),'jetzt','Relativtext jetzt');eq(C.relText(-15),'vor 15 Min','Relativtext vorbei');
// Worte -> Datum / Zeit
const T='2026-10-16';
eq([C.resolveDate('morgen',T),C.resolveDate('übermorgen',T),C.resolveDate('heute',T),C.resolveDate('gestern',T)],['2026-10-17','2026-10-18','2026-10-16','2026-10-15'],'heute/morgen/übermorgen/gestern');
eq([C.resolveDate('Montag',T),C.resolveDate('nächsten Freitag',T),C.resolveDate('Sonntag',T)],['2026-10-19','2026-10-23','2026-10-18'],'Wochentage zählen vorwärts (Freitag heute -> nächste Woche)');
eq([C.resolveDate('in 3 Tagen',T),C.resolveDate('in 2 Wochen',T),C.resolveDate('2026-11-05',T)],['2026-10-19','2026-10-30','2026-11-05'],'in n Tagen/Wochen, ISO');
eq([C.resolveDate('5.11.',T),C.resolveDate('3.2.',T),C.resolveDate('24.12.2026',T),C.resolveDate('31.2.',T)],['2026-11-05','2027-02-03','2026-12-24',null],'Datum mit Punkt; vergangenes ohne Jahr -> nächstes Jahr; 31.2. ungültig');
eq([C.resolveTime('15 Uhr'),C.resolveTime('9:30'),C.resolveTime('7.05'),C.resolveTime('25:00'),C.resolveTime('abends')],['15:00','09:30','07:05',null,null],'Uhrzeit aus Worten');
// Tagesfakten + Heatmap
const src={days:{[T]:{net:12,rank:'A',closed:true}},whoop:{[T]:{rec:72,strain:11.6,asleep:7.4,perf:88,wlist:[{sport:'Running',min:42}]}},training:{[T]:[{name:'Intervalle',km:8,min:50}]},puzzle:{[T]:3},learn:{[T]:2},notes:{[T]:{t:'gut',m:4}}};
const f=C.dayFacts(T,src);eq(f.map(x=>x.k),['heute','rec','sleep','strain','whoopw','training','puzzle','learn','mood'],'Tagesfakten vollständig und geordnet');eq(C.dayFacts('2026-01-01',src),[],'Tag ohne Daten: keine Fakten (nichts erfunden)');
eq(['rank','rec','strain','training','puzzle','mood','events'].map(m=>C.heatLevel(m,T,src,{[T]:[1,2]})),[3,3,2,2,2,3,2],'Heatmap-Stufen (Training zählt Whoop+Eintrag nicht doppelt)');eq(C.heatLevel('rank','2026-01-01',src),null,'Keine Daten = null, nicht 0');
eq([C.planFor('2026-10-17',{days:{'2026-10-16':{focus:' Lernen + Lauf '}}}),C.planFor('2026-10-18',{days:{'2026-10-16':{focus:'x'}}})],['Lernen + Lauf',''],'Plan = Fokus vom Vortag');
// Suche
const all=[N({id:'a',title:'Zahnarzt Dr. Meier',date:'2026-10-20',time:'15:00'}),N({id:'b',title:'Zahnreinigung',date:'2026-11-03'})];
eq(C.findEvents(all,'zahnarzt','2026-10-01','2026-12-31').map(o=>o.id),['a'],'findEvents: Treffer nur Zahnarzt');eq(C.searchText(all,'zahn',T).map(o=>o.id),['a','b'],'Suche über Titel');
// ICS
const ics=C.toICS([N({id:'a',title:'Zahnarzt, Dr; Meier',date:'2026-10-20',time:'15:00',end:'16:00',rem:30,rep:'weekly',until:'2026-12-01'}),N({id:'g',title:'Urlaub',date:'2026-10-30',endDate:'2026-11-02'})],0);
ok(/DTSTART;TZID=Europe\/Berlin:20261020T150000/.test(ics)&&/TRIGGER:-PT30M/.test(ics)&&/RRULE:FREQ=WEEKLY;UNTIL=20261201T235959Z/.test(ics)&&/Zahnarzt\\, Dr\\; Meier/.test(ics),'ICS: Zeit, Erinnerung, Wiederholung, Maskierung');
ok(/DTSTART;VALUE=DATE:20261030/.test(ics)&&/DTEND;VALUE=DATE:20261103/.test(ics),'ICS: ganztägig mehrtägig, Ende exklusiv');
console.log(bad?('\n'+bad+' FEHLER'):'\nalle Tests grün');process.exit(bad?1:0);
