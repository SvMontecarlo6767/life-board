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
// Heute ändern
const MO = '2026-11-09', DI = '2026-11-10';
let v = P.todayView(s, MO, null, []);
ok(v.wd === 0 && v.slots.length === 2 && v.slots[0].unit.id === 'beine' && !v.devs.length && !v.slots[0].done, 'Montag ohne Änderungen: Beine + Haltung, keine Abweichung');
v = P.todayView(s, DI, { pick: { 'fussball|z2': 'z2' } }, []);
ok(v.slots[1].unit.id === 'z2' && !v.devs.length, 'Alternative wählen ist keine Abweichung');
ok(P.todayView(s, DI, { pick: { 'fussball|z2': 'quatsch' } }, []).slots[1].unit.id === 'fussball', 'Unbekannte Wahl → erste Alternative');
const day = { units: { beine: { ex: { beine_3: { skip: true }, beine_5: { sets: 1 } } } }, reason: 'zeit' };
v = P.todayView(s, MO, day, []);
ok(v.devs.map(d => d.text).join('|') === 'Split Squat Jumps weggelassen|Nordic Curls 2 → 1 Satz' && v.reason === 'zeit', 'Übung weglassen und Sätze reduzieren', v.devs);
ok(P.unitById(s, 'beine').ex[5].sets === 2, 'Vorlage bleibt unverändert');
v = P.todayView(s, MO, { units: { beine: { skip: true, done: true } } }, []);
ok(v.slots[0].skip && !v.slots[0].done && v.devs[0].text === 'Beine heute weggelassen', 'Einheit heute weglassen');
const gym = [{ id: 'g1', date: MO, plan: 'Beine', ex: [{ n: 'Nordic Curls', s: [{ w: 0, r: 5 }] }, { n: 'Pogo Jumps', s: [{}, {}] }], skip: ['Box Jumps'] }, { id: 'g0', date: '2026-11-08', plan: 'Beine', ex: [] }];
v = P.todayView(s, MO, null, gym);
const bx = n => v.slots[0].ex.find(x => x.e.n === n);
ok(v.slots[0].done && v.slots[0].gym.length === 1 && bx('Nordic Curls').gym === 1 && bx('Pogo Jumps').gym === 2 && bx('Box Jumps').gym === 0 && bx('Wadenheben').gym === null, 'Gym-Eintrag von heute verknüpft: erledigt, Sätze je Übung, unbekannt bleibt unbekannt');
ok(v.devs.map(d => d.t).join() === 'gym,gym', 'Weniger Sätze laut Gym-Log werden als Abweichung gezeigt', v.devs);
const doc = P.dayDoc(P.todayView(s, MO, day, gym), '2026-11-05');
ok(doc.date === MO && doc.ver === '2026-11-05' && doc.gym.join() === 'g1' && doc.planned.length === 2 && doc.planned[0].ex.length === 8 && doc.done.length === 1 && doc.done[0].ex.find(e => e.n === 'Nordic Curls').sets === 1 && !doc.done[0].ex.find(e => e.n === 'Split Squat Jumps') && doc.dev.length >= 2 && doc.reason === 'zeit', 'Tagesdokument: geplant, gemacht, Abweichung, Grund, Gym-Verknüpfung', doc.done);
const cd = P.cleanDay({ units: { a: { ex: { e: { skip: false } } }, b: { done: 1, ex: { x: { sets: '99' } } } }, reason: 'quatsch', gym: ['g', 'g'] });
ok(!cd.units.a && cd.units.b.done === true && cd.units.b.ex.x.sets === 20 && cd.reason === '' && cd.gym.length === 1, 'Tagesdaten bereinigen', cd);
ok(P.todayView(P.clean(null), MO, null, []).slots.length === 0, 'Leerer Plan: kein Training');
// Vorschläge (Phase 3)
const W = (rec, perf, bedUtc, strain) => ({ recovery: rec == null ? undefined : { score: { recovery_score: rec } }, sleep: bedUtc ? { start: bedUtc, tz: '+01:00', nap: false, score: { sleep_performance_percentage: perf } } : undefined, cycle: strain == null ? undefined : { score: { strain } } });
const days = {}; for (let i = 1; i <= 14; i++) { const k = P.addDays(MO, -i); days[k] = W(70, 90, P.addDays(k, -1) + 'T22:00:00Z', 8) }   // sonst 23:00 Uhr
const sug = (dd, day, set, hist, k) => P.suggest({ plan: s, view: P.todayView(s, k || MO, day || null, []), days: dd, set: set || {}, hist: hist || {} });
let r = sug(Object.assign({}, days, { [MO]: W(80, 92, '2026-11-08T22:10:00Z') }));
ok(r.open.length === 0 && r.zone === 'grün', 'Grün und normaler Schlaf: keine Vorschläge');
r = sug(Object.assign({}, days, { [MO]: W(50, 92, '2026-11-08T22:10:00Z') }));
ok(r.open.length === 1 && r.open[0].id === 'a' && r.open[0].ops.map(o => o.text).join() === 'Split Squat Jumps weglassen' && /Recovery 50 % \(gelb\)/.test(r.open[0].why[0]), 'a) Gelb + Beintag: zuerst weglassen', r.open);
r = sug(Object.assign({}, days, { [MO]: W(20, 92, '2026-11-08T22:10:00Z') }));
ok(r.open[0].ops.map(o => o.text).join('|') === 'Split Squat Jumps weglassen|Wadenheben auf 1 Satz' && r.zone === 'rot', 'a) Rot: zusätzlich kürzbar auf 1 Satz', r.open[0].ops);
ok(r.open.every(x => x.ops.every(o => !o.ex || P.unitById(s, o.u).ex.find(e => e.id === o.ex).prio !== 'kern')), 'Kern wird nie angetastet');
ok(sug(Object.assign({}, days, { [MO]: W(50) }), null, { rules: { a: { yellow: false } } }).open.length === 0, 'a) Gelb abschaltbar');
ok(sug(Object.assign({}, days, { [MO]: W(20) }), null, { rules: { a: { on: false } } }).open.length === 0, 'a) Regel ausschaltbar');
ok(sug(Object.assign({}, days, { [DI]: W(20) }), null, null, null, DI).open.length === 0, 'a) Kein Beintag (Di Pull) → nichts');
r = sug(Object.assign({}, days, { [MO]: W(80, 55, '2026-11-09T00:40:00Z') }));
ok(r.open.length === 1 && r.open[0].id === 'b' && r.open[0].why.some(w => /Schlafleistung 55 %/.test(w)) && r.open[0].why.some(w => /eingeschlafen 01:40, sonst 23:00 \(\+160 min\)/.test(w)), 'b) Schlaf schlecht und spät + Beintag', r.open[0] && r.open[0].why);
ok(sug(Object.assign({}, days, { [MO]: W(80, 90, '2026-11-08T22:30:00Z') })).open.length === 0, 'b) 30 min später ist noch normal');
r = sug(Object.assign({}, days, { [MO]: W(80, 90, '2026-11-08T22:00:00Z') }), { units: { beine: { ex: { beine_3: { skip: true } } } } }, { rules: { a: { red: 90, yellowMax: 95 } } });
ok(r.open.length === 1 && r.open[0].ops.length === 1 && r.open[0].ops[0].text === 'Wadenheben auf 1 Satz', 'Schon Weggelassenes wird nicht nochmal vorgeschlagen', r.open);
// c) Strain gestern
const MI = '2026-11-11'; const dc = Object.assign({}, days, { '2026-11-10': W(70, 90, null, 18) });
r = sug(dc, { pick: { 'fussball|lauf_np': 'lauf_np' } }, null, null, MI);
ok(r.open.length === 1 && r.open[0].id === 'c' && /Strain gestern 18/.test(r.open[0].why[0]) && r.open[0].ops.some(o => o.pick) === false, 'c) Strain hoch + harte Einheit (Lauf ohne Zone-2-Alternative → Hinweis)', r.open);
const s3 = P.copy(s); s3.week[2].slots[1].alts.push('z2'); const r3 = P.suggest({ plan: s3, view: P.todayView(s3, MI, { pick: { 'fussball|lauf_np|z2': 'lauf_np' } }, []), days: dc, set: {}, hist: {} });
ok(r3.open[0].ops.find(o => o.pick).text === 'Zone 2 statt Laufen (Norwegian Protocol)', 'c) Zone 2 statt Lauf, wenn als Alternative da', r3.open[0].ops);
// d) harte Tage in Folge
const dd = Object.assign({}, days, { '2026-11-07': W(70, 90, null, 15), '2026-11-08': W(70, 90, null, 9) });
const hist = { '2026-11-08': { planned: [{ u: 'push', hard: true }], done: [{ u: 'push' }] } };
r = sug(dd, null, null, hist);
ok(r.open.length === 1 && r.open[0].id === 'd' && r.open[0].hint && /3 harte Tage/.test(r.open[0].title), 'd) Sa (Strain) + So (harte Einheit erledigt) + heute Beine → Hinweis', r.open);
ok(sug(dd).open.length === 0, 'd) ohne erledigte Einheit am So nur 1 harter Tag');
// e) heute kurz
r = sug({}, { short: true }, { rules: { e: { target: 30 } } });
const e = r.open.find(x => x.id === 'e');
ok(e && e.ops[0].text === 'Split Squat Jumps weglassen' && !e.ops.some(o => /Mobilisieren/.test(o.text)) && /≈ \d+ → \d+ min/.test(e.title), 'e) Heute kurz: nach Priorität, Kern bleibt', e);
const lo = P.dayMin(P.todayView(s, MO, P.applyOps({ short: true }, e.ops), []));
ok(lo < P.dayMin(P.todayView(s, MO, null, [])), 'e) Übernehmen macht den Tag kürzer (' + lo + ' min)');
ok(!sug({}, null, { rules: { e: { target: 30 } } }).open.length, 'e) nur mit Schalter „heute kurz“');
// f) Zone 2 bei Rot
r = sug(Object.assign({}, days, { [DI]: W(20) }), { pick: { 'fussball|z2': 'z2' } }, null, null, DI);
ok(r.open.length === 1 && r.open[0].id === 'f' && r.open[0].ops[0].min === 25, 'f) Zone 2 bei Rot: 45 → 25 min', r.open);
const tv = P.todayView(s, DI, P.applyOps({ pick: { 'fussball|z2': 'z2' } }, r.open[0].ops), []);
ok(tv.devs.some(d => d.text === 'Zone-2-Spin 45 → 25 min'), 'f) Übernommen = Abweichung mit Minuten');
// Entscheidungen
r = sug(Object.assign({}, days, { [MO]: W(50) }), { sug: { a: { d: 'no', at: 1, title: 'x' } } });
ok(r.open.length === 0 && r.decided.length === 1 && r.decided[0].d === 'no', 'Entschiedene Vorschläge erscheinen nicht erneut');
ok(P.cleanRules({ a: { red: 200, yellowMax: 10 }, c: { strain: '15,5' } }).a.red === 98 && P.cleanRules({ a: { red: 200 } }).a.yellowMax === 99 && P.cleanRules({ c: { strain: '15,5' } }).c.strain === 15.5, 'Regel-Einstellungen begrenzt');
console.log(fail ? fail + ' FEHLER' : 'alle Tests ok'); process.exit(fail ? 1 : 0);
