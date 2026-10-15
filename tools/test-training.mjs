import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const C = require('../training-core.js'); const T = require('../training-text.js');
let fail = 0; const ok = (c, m) => { console.log((c ? 'ok    ' : 'FEHLER ') + m); if (!c) fail++; };
const near = (a, b, e) => Math.abs(a - b) <= e;
const F = C.fmt;

/* Formeln */
ok(near(C.vdot(10000, 2400), 51.9, 0.1), 'VDOT 10 km in 40:00 ≈ 51,9');
ok(near(C.vdot(5000, 1200), 49.8, 0.2), 'VDOT 5 km in 20:00 ≈ 49,8');
ok(Math.abs(C.timeForVdot(10000, C.vdot(10000, 2500)) - 2500) < 0.5, 'Bisektion trifft Zeit zurück');
ok(near(C.cdf(0), 0.5, 1e-6) && near(C.cdf(1.2816), 0.9, 0.002), 'Normalverteilung');
ok(F.time(10079) === '2:47:59' && F.pace(259) === '4:19' && F.num(-3.5, 1) === '−3,5' && F.num(12345) === '12 345', 'Formatierung deutsch');
ok(F.signed(0.2, 0) === '0' && F.signed(5, 0) === '+5', 'Vorzeichen, kein „+0“');

/* Zeit */
ok(C.dateOf('Sep 27, 2026, 6:02:11 AM') === Date.UTC(2026, 8, 27, 6, 2, 11), 'Strava-Datum englisch = UTC');
ok(C.local(C.dateOf('Sep 27, 2026, 11:30:00 PM')).key === '2026-09-28', 'UTC 23:30 → Berlin am nächsten Tag');
ok(C.dateOf('27.09.2026, 06:02:11') === Date.UTC(2026, 8, 27, 4, 2, 11), 'Deutsches Datum lokal (Sommerzeit)');
ok(C.dateOf('2026-01-10 07:00:00') === Date.UTC(2026, 0, 10, 6, 0, 0), 'ISO lokal (Winterzeit)');
ok(C.durOf('00:48:12') === 2892 && C.durOf('48:12') === 2892 && C.numOf('10,5') === 10.5 && C.numOf('1.234,5') === 1234.5 && C.numOf('') === null, 'Dauer/Zahl, leer ≠ 0');

/* CSV im Strava-Stil mit doppelten Spalten */
const csv = 'Activity ID,Activity Date,Activity Name,Activity Type,Elapsed Time,Distance,Max Heart Rate,Moving Time,Distance,Elapsed Time,Max Heart Rate,Average Heart Rate,Average Cadence,Elevation Gain,Activity Gear,Calories\n' +
 '1,"Sep 27, 2026, 6:02:11 AM",Morgenlauf,Run,3000,10.0,172,2900,10000.5,3000,170,150,82,45,Nike Pegasus,700\n' +
 '2,"Sep 28, 2026, 6:02:11 AM","Kraft",Weight Training,3600,,,3500,,3600,,,,,,200\n' +
 '3,"Sep 29, 2026, 5:00:00 AM","Trail",Run,6000,12.0,170,5900,12000,6000,168,155,80,700,,900\n';
const r = C.importCSV(csv);
ok(r.acts.length === 3, 'CSV: drei Einheiten');
ok(r.acts[0].km === 10.0005 || near(r.acts[0].km, 10.0, 0.01), 'CSV: Distanz aus der Meter-Spalte');
ok(r.acts[0].sec === 2900, 'CSV: Moving Time statt Elapsed');
ok(r.acts[0].hrmax === 172, 'CSV: höchster Maximalpuls aus beiden Spalten');
ok(r.acts[0].cad === 164, 'CSV: Kadenz < 120 verdoppelt');
ok(r.acts[1].km === null && r.acts[1].hr === null, 'CSV: fehlend bleibt fehlend');
ok(r.acts[1].sport === 'Kraft' && r.acts[2].sport === 'Trail', 'CSV: Sportarten Kraft/Trail (Höhe je km)');
const de = 'Aktivitätstyp;Datum;Titel;Distanz;Zeit;Ø Herzfrequenz;Gesamtanstieg\nLaufen;2026-09-27 07:00:00;Lauf;"10,5";"00:55:10";"148";"60"\n';
const rd = C.importCSV(de);
ok(rd.acts.length === 1 && near(rd.acts[0].km, 10.5, 1e-9) && rd.acts[0].sec === 3310 && rd.acts[0].hr === 148 && rd.acts[0].sport === 'Lauf', 'CSV deutsch (Garmin-Stil)');

/* Synthetische Saison: 400 Tage, 4 Läufe pro Woche, ein Rennen */
function season(opt) {
  opt = opt || {}; const acts = []; let id = 1; const end = Date.UTC(2026, 9, 11, 7, 0, 0);
  for (let d = 400; d >= 0; d--) {
    const t = end - d * 864e5, wd = (new Date(t).getUTCDay() + 6) % 7;
    const prog = (400 - d) / 400;
    const add = (name, km, pace, hr, elev, sport) => acts.push({ id: String(id++), t, raw: sport === 'Rad' ? 'Ride' : 'Run', sport: sport || 'Lauf', name, km, sec: Math.round(km * pace), hr, hrmax: hr ? hr + 18 : null, elev, cad: 84, gear: 'Pegasus', kcal: km * 60 });
    if (wd === 1) add('Lockerer Lauf', 8 + prog * 2, 340 - prog * 15, opt.hardEasy ? 158 : 138, 40);
    if (wd === 3) add('Schwelle 3x2km', 10, 280 - prog * 10, 160, 50);
    if (wd === 5) add('Lockerer Lauf', 7, 345 - prog * 15, opt.hardEasy ? 160 : 140, 30);
    if (wd === 6) add('Langer Lauf', 16 + prog * 4, 335 - prog * 15, 148, 120);
    if (d % 14 === 5) acts.push({ id: String(id++), t, raw: 'Weight Training', sport: 'Kraft', name: 'Kraft', km: null, sec: 3000, hr: null, hrmax: null, elev: null, cad: null, gear: null });
  }
  if (!opt.noRace) acts.push({ id: String(id++), t: end - 20 * 864e5 + 3600e3, raw: 'Run', sport: 'Lauf', name: 'Halbmarathon Rennen', km: 21.1, sec: 5400, hr: 172, hrmax: 188, elev: 80, cad: 90, gear: 'Pegasus' });
  return acts;
}
const A = season();
const R = C.analyze(A, { today: '2026-10-11', race: { name: 'Teststadt Halbmarathon', place: 'Teststadt', date: '2026-11-15', km: 21.0975, target: 5400, elev: 150, elevSrc: 'geschätzt', wx: { tmax: 14, td: 8 } }, plan: C.plan.parse('Mo frei\nDi 8 km locker\nMi frei\nDo 6x1000 Schwelle 10 km\nFr 10 km locker\nSa lang 20 km\nSo frei') });
ok(R.ok, 'Analyse läuft');
ok(R.maxHr >= 170 && R.maxHr <= 215, 'Maximalpuls plausibel ' + R.maxHr);
ok(R.thr > 140 && R.thr < 185 && R.thrSrc, 'Schwellenpuls ' + R.thr + ' aus Lauf ' + (R.thrSrc && R.thrSrc.date));
ok(R.zones.length === 4 && R.zones[0] < R.zones[1] && R.zones[3] === R.thr, 'Zonengrenzen ' + R.zones.join('/'));
ok(R.vdot > 35 && R.vdot < 60, 'Aktueller VDOT ' + R.vdot.toFixed(1));
ok(R.races.length >= 1 && R.races.some(x => /Halbmarathon/.test(x.name)), 'Rennen erkannt');
ok(R.pred.length === 4 && R.pred[0].sec < R.pred[1].sec && R.pred[2].sec < R.pred[3].sec, 'Prognosen aufsteigend');
ok(R.pred.every(p => near(C.vdot(p.dm, p.sec), R.vdot, 0.05)), 'Prognosen passen zum VDOT');
ok(R.pred[2].riegel && R.pred[2].riegel > 4000, 'Riegel-Spanne vorhanden');
ok(R.easy.slow > R.easy.fast, 'Lockerbereich: langsames Ende langsamer');
ok(R.weeks.length === 53 && R.weeks[52].cur, '52 abgeschlossene + laufende Woche');
const sumDaily = C.sum(R._daily); const sumLoad = C.sum(R._L.map(a => a.load));
ok(near(sumDaily, sumLoad, 1e-6), 'Tageslast = Summe der Einheiten');
ok(R.fitness > 0 && R.fatigue > 0 && near(R.form, R.fitness - R.fatigue, 1e-9), 'Form = Fitness − Ermüdung');
ok(R.acwr > 0.3 && R.acwr < 2.5, 'ACWR ' + R.acwr.toFixed(2));
ok(R.race.calc && R.race.calc.race === R.race.calc.fit + R.race.calc.wx + R.race.calc.course, 'Race Day: Fitness + Wetter + Strecke = Renntagszeit');
ok(R.race.calc.course === Math.round(R.race.calc.fit * (150 / 100 * 450 / 21097.5)), 'Streckenaufschlag laut Formel');
ok(R.race.calc.wbgt != null && R.race.calc.wbgt < 15 ? R.race.calc.wx === 0 : true, 'Unter 15 °C WBGT kostet das Wetter nichts (WBGT ' + (R.race.calc.wbgt || 0).toFixed(1) + ')');
ok(R.race.calc.chance >= 0 && R.race.calc.chance <= 100, 'Chance ' + R.race.calc.chance + ' %');
const rdHot = C.raceDay({ dm: 21097.5, fitSec: 5400, vdotShown: 45, tmax: 32, td: 18, elev: 0, target: 5400, belegKm: 21, belegAgeDays: 10 });
ok(rdHot.wx > 0 && rdHot.chance < 50, 'Hitze kostet Zeit und senkt die Chance (' + rdHot.wx + ' s)');
const rdOld = C.raceDay({ dm: 21097.5, fitSec: 5400, vdotShown: 45, elev: 0, target: 5400, belegKm: 3, belegAgeDays: 120 });
ok(near(rdOld.sd, 5400 * 0.028 * 1.5625, 0.01), 'Streuung ×1,25 zweimal');
ok(R.race.taper && R.race.taper.start === '2026-11-01', 'Taper beginnt 14 Tage vor dem Rennen');
ok(R.pb['5k'] === null || R.pb['5k'].sec > 0, 'Bestzeiten ohne Fehler');
ok(R.plan.days.length === 7 && R.plan.days[3].kind === 'hard' && R.plan.days[5].kind === 'long', 'Plan gelesen');
ok(R.weekTarget === 8 + 10 + 10 + 20, 'Wochenziel = Summe des Plans (' + R.weekTarget + ')');
ok(R.counts.Kraft > 10 && R.counts.Lauf > 100, 'Einheiten je Sportart');
ok(R.log.length === R.totals.acts, 'Logbuch = alle Einheiten der zwölf Monate');
ok(R.same.n > 10 && R.same.band, 'Tempo bei gleichem Puls: Band ' + (R.same.band || []).join('–') + ', ' + R.same.n + ' Läufe');
ok(R.same.trend && R.same.trend.delta < 0, 'Tempo bei gleichem Puls: schneller (' + (R.same.trend && R.same.trend.delta) + ' s)');
ok(R.same.trend.delta === R.same.trend.last - R.same.trend.first, 'Differenz aus gerundeten Werten');
ok(R.habit.n > 100 && R.habit.top.n > 0, 'Gewohnheit');
ok(R.shoes.active.length === 1 && R.shoes.active[0].km > 500, 'Schuhe');

/* Ohne Puls / ohne Plan / kurze Daten */
const R2 = C.analyze(A.map(a => Object.assign({}, a, { hr: null, hrmax: null })), { today: '2026-10-11' });
ok(R2.ok && R2.estLoad === A.length && R2.thrAssumed && R2.maxHrAssumed, 'Ohne Puls: Last geschätzt, Annahmen markiert');
ok(R2.plan.derived && R2.weekTargetDerived, 'Ohne Plan: abgeleitet');
const R3 = C.analyze(A.slice(-3), { today: '2026-10-11' });
ok(R3.ok, 'Sehr wenige Daten: keine Ausnahme');
ok(!C.analyze([], {}).ok, 'Leere Daten: ok=false');

/* Texte */
const N = T.narrate(R, { name: 'Test', hour: 7 });
ok(N.befund && N.befund.head && N.befund.nums.length === 3 && N.befund.way.length === 3, 'Befund vollständig: ' + N.befund.head);
ok(N.befund.headParts.join(' ').replace(/\s+/g, ' ') === N.befund.head, 'Überschrift = zwei Teile');
ok(N.insights.length >= 4 && N.insights.every(i => i.title.split(' ').length <= 6 && (i.grade === 'belegt' || i.grade === 'Hinweis')), 'Insights: Titel ≤ 6 Wörter');
ok(N.hello === 'Guten Morgen,' && N.chips.length === 3 && N.qa.length === 4 && N.qa.every(q => q.nums.length === 3 && q.p.length === 2), 'Begrüßung, Chips, vier Fragen');
ok(N.repair && (N.repair.changed ? N.repair.nums.length === 3 : !!N.repair.why), 'Repair Guide: ' + (N.repair.changed ? N.repair.title : 'Woche passt'));
const NH = T.narrate(C.analyze(season({ hardEasy: true, noRace: true }), { today: '2026-10-12', plan: C.plan.parse('Di 8 km locker\nDo 10 km Schwelle\nSa lang 20 km') }), {});
ok(NH.befund.id === 'easy' && /zu hart$/.test(NH.befund.head), 'Zu hartes Lockeres wird als Befund erkannt (' + NH.befund.id + ')');
ok(NH.repair.changed && /Puls unter/.test(NH.repair.neu), 'Repair: Lockeres leichter');
const bad = JSON.stringify(N).match(/\b\w*(ae|oe|ue)\w*\b/g) || [];
ok(!bad.some(w => /^(Duell|Aktuell|Quelle|Frueh|Fuer|Laeufe|Waehrend|Ueber)/.test(w)), 'Keine ae/oe/ue-Ersatzschreibung');
ok(!/NaN|undefined|Infinity/.test(JSON.stringify(N)), 'Keine NaN/undefined in Texten');
console.log(fail ? '\nFEHLER: ' + fail : '\nalles ok');
process.exit(fail ? 1 : 0);
