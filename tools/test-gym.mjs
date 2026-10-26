// Tests für das Gym-Rechnen (training-gym.js, Teil 1). Aufruf: node tools/test-gym.mjs
import G from '../training-gym.js';
let fail = 0; const ok = (c, n) => { console.log((c ? 'ok     ' : 'FEHLER ') + n); if (!c) fail++ };
const S = (id, date, plan, ex) => ({ id, date, t: Date.parse(date + 'T17:00:00Z'), min: 60, rpe: 7, plan, ex: ex.map(([n, s]) => ({ n, s: s.map(([w, r]) => ({ w, r })) })) });
ok(Math.abs(G.e1rm(100, 5) - 116.67) < .01 && G.e1rm(100, 1) === 100 && G.e1rm(0, 10) === 0, 'e1RM (Epley) und Sonderfälle');
ok(G.muscle('Bankdrücken') === 'Brust' && G.muscle('Schrägbankdrücken Kurzhantel') === 'Brust' && G.muscle('Klimmzüge') === 'Rücken' && G.muscle('Kniebeuge') === 'Beine' && G.muscle('Beinbeuger') === 'Beine' && G.muscle('Bizepscurls') === 'Bizeps' && G.muscle('Trizepsdrücken') === 'Trizeps' && G.muscle('Seitheben') === 'Schultern' && G.muscle('Wadenheben') === 'Waden' && G.muscle('Hip Thrust') === 'Gesäß' && G.muscle('Plank') === 'Bauch' && G.muscle('Rumänisches Kreuzheben') === 'Beine' && G.muscle('Kreuzheben') === 'Rücken' && G.muscle('Enges Bankdrücken') === 'Trizeps' && G.muscle('Gartenarbeit') === 'Andere', 'Muskelgruppen nach Übungsname');
ok(G.key('  Bank-Drücken!! ') === 'bank drücken', 'Übungsnamen werden normalisiert');
const c = G.cleanSession({ ex: [{ n: ' Bank ', s: [{ w: '82,5', r: '8' }, { w: '80', r: '' }, { w: 'x', r: '5' }, { w: '5000', r: '5' }] }, { n: '', s: [{ w: 1, r: 1 }] }, { n: 'Leer', s: [] }] });
ok(c.ex.length === 1 && c.ex[0].n === 'Bank' && c.ex[0].s.length === 2 && c.ex[0].s[0].w === 82.5 && c.ex[0].s[1].w === 0, 'Eingaben werden bereinigt (Komma, leere/ungültige Sätze)');
const st = G.sessStats(S('a', '2026-10-01', 'Push', [['Bank', [[80, 8], [80, 8]]], ['Dips', [[0, 10]]]]));
ok(st.sets === 3 && st.vol === 1280 && st.reps === 26, 'Volumen, Sätze, Wiederholungen');
const hist = [
  S('1', '2026-09-10', 'Push', [['Bankdrücken', [[70, 8], [70, 8], [70, 7]]], ['Kniebeuge', [[100, 5]]]]),
  S('2', '2026-09-24', 'Push', [['Bankdrücken', [[75, 8], [75, 6]]]]),
  S('3', '2026-10-12', 'Push', [['Bankdrücken', [[80, 5]]], ['Seitheben', [[10, 12]]]])
];
const A = G.analyze(hist, '2026-10-15'), bank = A.byKey.get('bankdrücken');
ok(bank.n === 3 && bank.best.w === 80 && bank.best.date === '2026-10-12' && bank.last[0].w === 80 && bank.series.length === 3, 'Analyse: Bestwert, letztes Mal, Verlauf');
ok(bank.pr7 === true && A.byKey.get('kniebeuge').pr7 === false, 'Rekord der letzten 7 Tage wird markiert');
ok(A.sessions[0].id === '3' && A.n28 === 2, 'Einheiten neueste zuerst, 28-Tage-Zähler');
const mu = Object.fromEntries(A.muscles.map(m => [m.m, m]));
ok(mu['Brust'].w1 === 1 && mu['Brust'].avg4 === 0.5 && mu['Schultern'].w1 === 1.5 && mu['Schultern'].s1 === 0.5 && mu['Trizeps'].w1 === 0.5, 'Sätze je Muskelgruppe: Haupt voll, Hilfs halb (' + JSON.stringify(mu['Schultern']) + ')');
const mk = Object.fromEntries(G.analyze([S('k', '2026-10-14', 'Beine', [['Kniebeuge', [[100, 5], [100, 5]]]])], '2026-10-15').muscles.map(m => [m.m, m.w1]));
ok(mk['Beine'] === 2 && mk['Gesäß'] === 2, 'Zweiter Hauptmuskel zählt voll (Kniebeuge: Beine + Gesäß)');
ok(G.profileText(G.profile('Bankdrücken')) === 'Brust (Haupt) · Schultern, Trizeps (Hilfs)' && G.muscle('Liegestütze') === 'Brust' && G.muscle('Seitstütz') === 'Bauch' && G.muscle('Box Jumps') === 'Beine' && G.muscle('Wandsitz') === 'Beine', 'Standard-Zuordnung inkl. Hilfsmuskeln, Isometrie und Sprünge');
const own = G.cleanProfiles({ 'Bank-Drücken': { Brust: 'h', Schultern: 'h2', Quatsch: 'h', Trizeps: 'x' }, leer: {}, 'x': 5 });
ok(JSON.stringify(own) === JSON.stringify({ 'bank drücken': { Brust: 'h', Schultern: 'h2' } }), 'Eigene Zuordnung wird gesäubert (' + JSON.stringify(own) + ')');
const A2 = G.analyze(hist, '2026-10-15', { 'bankdrücken': { Brust: 'h', Schultern: 'h2' } }), mu2 = Object.fromEntries(A2.muscles.map(m => [m.m, m]));
ok(mu2['Schultern'].w1 === 2 && !mu2['Trizeps'] && A2.byKey.get('bankdrücken').muscle === 'Brust', 'Eigene Zuordnung geht vor (2. Haupt zählt voll, Trizeps entfällt)');
const next = S('4', '2026-10-15', 'Push', [['Bankdrücken', [[82.5, 3]]], ['Seitheben', [[10, 12]]], ['Neu', [[20, 10]]], ['Kniebeuge', [[90, 5]]]]);
const prs = G.prsOf(hist, next, '2026-10-15');
ok(prs.length === 1 && prs[0].n === 'Bankdrücken' && prs[0].kind === 'Gewicht', 'Neuer Rekord wird erkannt, Neues und Gleiches nicht (' + prs.map(p => p.n + ':' + p.kind) + ')');
const prs2 = G.prsOf(hist, S('5', '2026-10-15', '', [['Bankdrücken', [[80, 7]]]]), '2026-10-15');
ok(prs2.length === 1 && prs2[0].kind === 'Wiederholungen', 'Mehr Wiederholungen bei gleichem Gewicht');
const prs3 = G.prsOf(hist, S('6', '2026-10-15', '', [['Bankdrücken', [[70, 15]]]]), '2026-10-15');
ok(prs3.length === 1 && prs3[0].kind === 'geschätztes 1RM', 'Leichteres Gewicht mit vielen Wdh zählt als besseres 1RM (' + prs3.map(p => p.kind) + ')');
ok(G.hint({ last: [{ w: 60, r: 10 }, { w: 60, r: 11 }] }) === 'Alles geschafft: 62,5 kg probieren', 'Hinweis: Gewicht steigern (' + G.hint({ last: [{ w: 60, r: 10 }, { w: 60, r: 11 }] }) + ')');
ok(/Wiederholung/.test(G.hint({ last: [{ w: 60, r: 8 }, { w: 60, r: 8 }] })) && /8 Wiederholungen/.test(G.hint({ last: [{ w: 60, r: 6 }, { w: 60, r: 5 }] })), 'Hinweis: halten / aufbauen');
ok(G.setStr([{ w: 82.5, r: 8 }, { w: 0, r: 12 }]) === '82,5×8, 12', 'Satz-Text');
ok(!/NaN|undefined/.test(JSON.stringify(A)), 'Keine NaN/undefined');
console.log(fail ? '\nFEHLER: ' + fail : '\nalles ok'); process.exit(fail ? 1 : 0);
