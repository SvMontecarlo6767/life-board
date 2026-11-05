// Tests für den Trainingsplan-Rechenkern (plan-core.js). Aufruf: node tools/test-plan.mjs
import P from '../plan-core.js';
let fail = 0; const ok = (c, n, x) => { console.log((c ? 'ok     ' : 'FEHLER ') + n + (c || x === undefined ? '' : ' ' + JSON.stringify(x))); if (!c) fail++ };
const s = P.seed([]);
ok(s.units.length === 9 && s.week.length === 7, 'Startplan: 9 Einheiten, 7 Tage');
ok(P.dayText(s, 0) === 'Beine + Haltungsübungen', 'Mo: Beine + Haltung', P.dayText(s, 0));
ok(P.dayText(s, 1) === 'Pull + (Fußball oder Zone-2-Spin)', 'Di: Pull und Fußball oder Zone 2', P.dayText(s, 1));
ok(P.dayText(s, 2) === 'Push + (Fußball oder Laufen (Norwegian Protocol))', 'Mi: Push und Fußball oder Lauf NP');
ok(P.dayText(s, 3) === 'Haltungsübungen + (Zone-2-Spin oder nichts)', 'Do: Haltung, evtl. Zone 2', P.dayText(s, 3));
ok(P.dayText(s, 4) === 'Beine', 'Fr: Beine');
ok(P.dayText(s, 5) === '(Pull oder nichts) + (Lauf oder nichts)', 'Sa: Pull und Lauf oder Pause', P.dayText(s, 5));
const B = P.unitById(s, 'beine');
ok(B.legs && B.hard && B.ex.length === 8 && B.ex.filter(e => e.n !== 'Mobilisieren und Aufwärmen').every(e => e.sets === 2), 'Beintag: 8 Übungen, Start mit 2 Sätzen');
const pr = n => B.ex.find(e => e.n === n).prio;
ok(pr('Mobilisieren und Aufwärmen') === 'kern' && pr('Split Squat Jumps') === 'weg' && pr('Wadenheben') === 'kurz' && pr('Nordic Curls') === 'norm', 'Beintag-Prioritäten');
ok(B.ex.find(e => e.n === 'Nordic Curls').rest === 100 && B.ex.find(e => e.n === 'Box Jumps').rest === 120 && B.ex.find(e => e.n === 'Pogo Jumps').rest === 90, 'Pausen aus deinem Plan');
const I = P.unitById(s, 'iso');
ok(I.ex.slice(0, 3).every(e => e.prio === 'kern' && e.sets === 3), 'Isometrie Hüftbeuger: Kern, 3 Sätze');
ok(P.unitById(s, 'push').ex.find(e => /Trizeps/.test(e.n)).prio === 'kurz' && P.unitById(s, 'pull').ex.find(e => /Hintere/.test(e.n)).prio === 'kurz' && P.unitById(s, 'pull').ex.find(e => e.n === 'Bauch').prio === 'norm', 'Push/Pull: Trizeps und hintere Schulter kürzbar, Bauch bleibt');
// Gym-Workouts als Vorlage (nur gelesen)
const g = P.seed([{ name: 'pull', ex: ['Klimmzüge', 'Face Pulls', 'Hanging Leg Raise'] }, { name: 'Push', ex: ['Bankdrücken', 'Trizepsdrücken'] }]);
const gp = P.unitById(g, 'pull').ex;
ok(gp.length === 3 && gp[1].prio === 'kurz' && gp[2].prio === 'norm' && P.unitById(g, 'push').ex[1].prio === 'kurz', 'Push/Pull aus deinen Gym-Workouts, Prioritäten nach Regeln', gp);
// Bereinigen
const c = P.clean({ units: [{ id: 'a', name: '  X  ', kind: 'quatsch', ex: [{ n: '', sets: 3 }, { n: 'Y', sets: '99', rest: '-5', prio: 'nein' }] }, { id: 'a', name: 'Z' }], week: [{ slots: [{ alts: ['a', 'zzz', 'a'] }, { alts: [''] }] }] });
ok(c.units[0].name === 'X' && c.units[0].kind === 'sonst' && c.units[0].ex.length === 1 && c.units[0].ex[0].sets === 20 && c.units[0].ex[0].rest === 0 && c.units[0].ex[0].prio === 'norm', 'Bereinigen: Grenzen, leere Übungen weg', c.units[0]);
ok(c.units[1].id !== 'a' && c.week[0].slots.length === 1 && c.week[0].slots[0].alts.join() === 'a' && c.week.length === 7, 'Doppelte IDs, unbekannte Einheiten, leere Blöcke', c.week[0]);
ok(JSON.stringify(P.clean(s)) === JSON.stringify(s), 'Startplan übersteht Bereinigen unverändert');
ok(P.clean(null).week.length === 7 && P.clean(null).units.length === 0, 'Leere Daten');
// Versionen
const V = [{ from: '2026-10-01', at: 1, units: [], week: [] }, { from: '2026-11-05', at: 2 }, { from: '2026-11-05', at: 3 }, { from: '2026-12-01', at: 4 }];
ok(P.versionAt(V, '2026-09-30') === null && P.versionAt(V, '2026-10-20').from === '2026-10-01' && P.versionAt(V, '2026-11-05').at === 3 && P.versionAt(V, '2027-01-01').from === '2026-12-01', 'Gültige Version je Datum');
ok(P.sortVersions(V)[0].from === '2026-12-01', 'Versionen neueste zuerst');
// Datum, Zeit
ok(P.wdOf('2026-11-05') === 3 && P.wdOf('2026-11-09') === 0 && P.addDays('2026-12-31', 1) === '2027-01-01', 'Wochentag (Do), Montag, Jahreswechsel');
ok(P.workSec('30–90 s') === 60 && P.workSec('mind. 5 min') === 300 && P.workSec('6 pro Bein') === 48 && P.workSec('') === 32, 'Arbeitszeit pro Satz');
const est = P.estMin(B); ok(est > 25 && est < 70, 'Beintag-Schätzung plausibel (' + est + ' min)');
ok(P.estMin(P.unitById(s, 'fussball')) === 90, 'Ohne Übungen zählen die geplanten Minuten');
// Diff
const s2 = P.copy(s); s2.units[0].ex[1].sets = 3; s2.week[3].slots.pop();
ok(P.diff(s, s2).join('|') === 'Beine geändert|Do: Haltungsübungen', 'Änderungstext', P.diff(s, s2));
ok(P.diff(null, s)[0] === 'erste Version' && P.diff(s, s)[0] === 'keine Änderung', 'Erste Version / keine Änderung');
ok(P.cleanSettings({}).budget === 60 && P.cleanSettings({ budget: 5, z2lo: '130' }).budget === 15 && P.cleanSettings({ z2lo: '130' }).z2lo === 130, 'Einstellungen: Standard 60 min, Grenzen');
console.log(fail ? fail + ' FEHLER' : 'alle Tests ok'); process.exit(fail ? 1 : 0);
