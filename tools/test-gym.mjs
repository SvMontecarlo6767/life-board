// Tests für das Gym-Rechnen (training-gym.js, Teil 1). Aufruf: node tools/test-gym.mjs
import G from '../training-gym.js';
let fail = 0; const ok = (c, n) => { console.log((c ? 'ok     ' : 'FEHLER ') + n); if (!c) fail++ };
const S = (id, date, plan, ex) => ({ id, date, t: Date.parse(date + 'T17:00:00Z'), min: 60, rpe: 7, plan, ex: ex.map(([n, s]) => ({ n, s: s.map(([w, r]) => ({ w, r })) })) });
ok(Math.abs(G.e1rm(100, 5) - 116.67) < .01 && G.e1rm(100, 1) === 100 && G.e1rm(0, 10) === 0, 'e1RM (Epley) und Sonderfälle');
ok(G.muscle('Bankdrücken') === 'Brust' && G.muscle('Schrägbankdrücken Kurzhantel') === 'Brust' && G.muscle('Klimmzüge') === 'Rücken' && G.muscle('Kniebeuge') === 'Oberschenkel vorne' && G.muscle('Beinbeuger') === 'Oberschenkel hinten' && G.muscle('Bizepscurls') === 'Bizeps' && G.muscle('Trizepsdrücken') === 'Trizeps' && G.muscle('Seitheben') === 'Schultern' && G.muscle('Wadenheben') === 'Waden' && G.muscle('Hip Thrust') === 'Gesäß' && G.muscle('Plank') === 'Bauch' && G.muscle('Rumänisches Kreuzheben') === 'Oberschenkel hinten' && G.muscle('Kreuzheben') === 'Rücken' && G.muscle('Enges Bankdrücken') === 'Trizeps' && G.muscle('Gartenarbeit') === 'Andere', 'Muskelgruppen nach Übungsname');
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
ok(mk['Oberschenkel vorne'] === 2 && mk['Gesäß'] === 2, 'Zweiter Hauptmuskel zählt voll (Kniebeuge: Oberschenkel vorne + Gesäß)');
ok(G.profileText(G.profile('Bankdrücken')) === 'Brust (Haupt) · Schultern, Trizeps (Hilfs)' && G.muscle('Liegestütze') === 'Brust' && G.muscle('Seitstütz') === 'Bauch' && G.muscle('Box Jumps') === 'Oberschenkel vorne' && G.muscle('Wandsitz') === 'Oberschenkel vorne', 'Standard-Zuordnung inkl. Hilfsmuskeln, Isometrie und Sprünge');
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

// ---- Erkenntnisse ----
const dk = (k, n) => new Date(Date.parse(k + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const T0 = '2026-08-01', TD = '2026-10-20';
// Bankdrücken steigt (60 → 70 kg × 8), Klimmzüge stagnieren seit 6 Einheiten, Beine kostet Erholung, Pull kaum
const sess = [], rec = {};
for (let i = 0; i < 81; i++) rec[dk(T0, i)] = 70 + (i * 7) % 5;   // ruhiger Grundwert 70–74
for (let i = 0; i < 12; i++) {
  const d = dk(T0, 7 * i), dB = dk(d, 2), w = 60 + i * 0.9;
  sess.push(S('p' + i, d, 'Pull', [['Bankdrücken', [[w, 8]]], ['Klimmzüge', [[0, i < 4 ? 8 + i : (i === 3 ? 11 : 10)]]]]));
  sess.push(S('b' + i, dB, 'Beine', [['Kniebeuge', [[100, 5]]]]));
  rec[dk(dB, 1)] = 55 + (i % 3);   // Folgetag nach Beine deutlich tiefer
}
const IA = G.analyze(sess, TD), I = G.insights(IA, rec, TD);
const tb = I.trend.find(t => t.name === 'Bankdrücken');
ok(tb && tb.dir === 1 && tb.ch > 5 && tb.weeks >= 7, 'Trend: Bankdrücken steigt (' + (tb && tb.ch.toFixed(1)) + ' % in ' + (tb && tb.weeks) + ' Wochen)');
ok(I.plateau.some(p => p.name === 'Klimmzüge') && !I.plateau.some(p => p.name === 'Bankdrücken'), 'Plateau: Klimmzüge ohne neuen Bestwert, Bankdrücken nicht (' + I.plateau.map(p => p.name) + ')');
const beine = I.cost.groups.find(g => g.name === 'Beine'), pull = I.cost.groups.find(g => g.name === 'Pull');
ok(beine && beine.n >= 5 && beine.m < -10 && pull && Math.abs(pull.m) < 5, 'Erholungskosten: Beine deutlich negativ, Pull kaum (' + (beine && beine.m.toFixed(1)) + ' / ' + (pull && pull.m.toFixed(1)) + ')');
ok(I.cost.verdict && I.cost.verdict.a === 'Beine' && I.cost.verdict.b === 'Pull', 'Erholungskosten: klare Aussage Beine kostet mehr als Pull');
// zu wenige Daten: keine Aussagen
const few = G.insights(G.analyze(sess.slice(0, 6), dk(T0, 20)), rec, dk(T0, 20));
ok(!few.zone.ready && (!few.cost.verdict) && few.cost.groups.every(g => g.n < 5), 'Wenig Daten: keine Zonen- oder Kosten-Aussage');
// Zonen: an grünen Tagen stärker
const zs = [], zr = {};
for (let i = 0; i < 16; i++) { const d = dk(T0, 3 * i), g = i % 2 === 0; zr[d] = g ? 80 : 45; zs.push(S('z' + i, d, 'Push', [['Bankdrücken', [[g ? 82 : 78, 8]]]])) }
const IZ = G.insights(G.analyze(zs, dk(T0, 50)), zr, dk(T0, 50));
ok(IZ.zone.ready && IZ.zone.z.g.m > IZ.zone.z.y.m && IZ.zone.t >= 2, 'Zonen: grüne Tage stärker als gelbe (' + IZ.zone.z.g.m.toFixed(1) + ' / ' + IZ.zone.z.y.m.toFixed(1) + ', t ' + (IZ.zone.t || 0).toFixed(1) + ')');
// Rauschen ohne echten Unterschied: keine Aussage
const ns = [], nr = {};
for (let i = 0; i < 16; i++) { const d = dk(T0, 3 * i); nr[d] = i % 2 ? 80 : 45; ns.push(S('n' + i, d, 'Push', [['Bankdrücken', [[[80, 78, 82, 79][Math.floor(i / 2) % 4], 8]]]])) }
const IN = G.insights(G.analyze(ns, dk(T0, 50)), nr, dk(T0, 50));
ok(IN.zone.ready && Math.abs(IN.zone.t || 0) < 2, 'Zonen: zufällige Schwankung ergibt keine Aussage (t ' + (IN.zone.t || 0).toFixed(2) + ')');
ok(!/NaN|undefined/.test(JSON.stringify(I)), 'Erkenntnisse ohne NaN');
// Einbeinig, feste Wiederholungen, Körpergewicht ohne Absturz
{
  const SS = (id, date, ex) => ({ id, date, t: Date.parse(date + 'T17:00:00Z'), min: 45, rpe: 6, plan: 'Beine', ex: ex.map(([n, s]) => ({ n, s: s.map(([w, r, sd]) => sd ? { w, r, sd } : { w, r }) })) });
  const pog = []; for (let k = 0; k < 7; k++) pog.push(SS('p' + k, dk(T0, k * 6), [['Pogo Jumps', [[0, 20], [0, 20]]], ['Split Squats', [[20, 10, 'l'], [20, 10, 'r'], [20, 8, 'l'], [20, 9, 'r']]]]));
  const td = dk(T0, 40), opt = G.cleanExopt({ 'Pogo Jumps': { f: true }, 'Split-Squats': { u: 1, x: 5 }, leer: {} });
  ok(JSON.stringify(opt) === JSON.stringify({ 'pogo jumps': { f: 1 }, 'split squats': { u: 1 } }), 'Optionen je Übung werden gesäubert (' + JSON.stringify(opt) + ')');
  const c2 = G.cleanSession({ ex: [{ n: 'Split Squats', s: [{ w: '20', r: '10', sd: 'l' }, { w: '20', r: '10', sd: 'x' }] }] });
  ok(c2.ex[0].s[0].sd === 'l' && !('sd' in c2.ex[0].s[1]), 'Seite pro Satz bleibt beim Bereinigen (nur l/r)');
  const ohne = G.insights(G.analyze(pog, td), {}, td), mit = G.insights(G.analyze(pog, td, null, opt), {}, td);
  ok(ohne.plateau.some(p => p.name === 'Pogo Jumps') && !mit.plateau.some(p => p.name === 'Pogo Jumps') && !mit.trend.some(t => t.name === 'Pogo Jumps'), 'Feste Wiederholungen: kein Plateau, kein Wdh-Trend');
  const A3 = G.analyze(pog, td, null, opt), po = A3.byKey.get('pogo jumps'), sq = A3.byKey.get('split squats');
  ok(po.fix && G.hint(po) === '' && G.hint(A3.byKey.get('split squats')) !== '', 'Feste Wiederholungen: kein Steigerungs-Vorschlag');
  ok(sq.uni && sq.side.l.n === 14 && sq.side.r.n === 14 && sq.side.l.r === 126 && sq.side.r.r === 133, 'Links gegen rechts: Sätze und Wiederholungen je Seite (' + JSON.stringify(sq.side) + ')');
  const mb = Object.fromEntries(A3.muscles.map(m => [m.m, m.w1])), mb0 = Object.fromEntries(G.analyze(pog, td).muscles.map(m => [m.m, m.w1]));
  ok(mb0['Oberschenkel vorne'] - mb['Oberschenkel vorne'] === 2, 'Einbeinig: links + rechts zählt als ein Satz pro Muskelgruppe');
  ok(G.setStr(pog[0].ex[1].s) === 'L 20×10, R 20×10, L 20×8, R 20×9', 'Sätze mit Seite als Text');
  let err = null, pr = null; try { pr = G.prsOf(pog, SS('n', dk(T0, 41), [['Pogo Jumps', [[0, 20]]]]), dk(T0, 41), opt) } catch (e) { err = e }
  ok(!err && pr.length === 0, 'Körpergewicht mit gleichen Wdh.: Speichern stürzt nicht ab, kein Rekord' + (err ? ' – ' + err.message : ''));
  let err2 = null; try { G.prsOf(pog, SS('n', dk(T0, 41), [['Pogo Jumps', [[0, 20]]]]), dk(T0, 41)) } catch (e) { err2 = e }
  ok(!err2, 'Auch ohne Optionen kein Absturz bei Körpergewicht');
}
// Beine aufgeteilt: vorne, hinten, Adduktoren, Hüftbeuger; alte eigene Zuordnung „Beine“ wird übernommen
{
  const m = n => G.muscle(n);
  ok(m('Nordic Curls') === 'Oberschenkel hinten' && m('Reverse Nordics') === 'Oberschenkel vorne' && m('Pogo Jumps') === 'Waden' && m('Copenhagen Plank') === 'Adduktoren' && m('Hip Flexor Drive') === 'Hüftbeuger' && m('Hip Flexor Raise') === 'Hüftbeuger'
    && m('Bulgarian Split Squats') === 'Oberschenkel vorne' && m('Split Squat Jumps') === 'Oberschenkel vorne' && m('Einbeiniges Wandsitzen') === 'Oberschenkel vorne' && m('Split Squat Holds') === 'Oberschenkel vorne' && m('Wadenheben') === 'Waden' && m('Beinheben') === 'Bauch',
    'Beine aufgeteilt: ' + ['Nordic Curls', 'Reverse Nordics', 'Pogo Jumps', 'Copenhagen Plank', 'Hip Flexor Drive', 'Bulgarian Split Squats', 'Beinheben'].map(n => n + '=' + m(n)).join(', '));
  const own = G.cleanProfiles({ 'Mein Squat': { Beine: 'h', Gesäß: 's' }, 'Zwei': { Beine: 's', 'Oberschenkel vorne': 'h' } });
  ok(JSON.stringify(own) === JSON.stringify({ 'mein squat': { 'Oberschenkel vorne': 'h', 'Gesäß': 's' }, 'zwei': { 'Oberschenkel vorne': 'h' } }), 'Alte eigene Zuordnung „Beine“ wird zu „Oberschenkel vorne“ (' + JSON.stringify(own) + ')');
}
{ // Varianten im Workout (z. B. Incline Curls oder Hammer Curls)
  const W = G.cleanWorkouts([{ id: 'wp', name: 'Pull', ex: ['Klimmzüge', 'Incline Curls'], alt: { 'Incline Curls': ['Hammer Curls', ' hammer curls ', 'Incline Curls', ''], 'Fremd': ['X'], 'Klimmzüge': 'kaputt' } }, { id: 'wq', name: 'Ohne', ex: ['A'] }]);
  ok(JSON.stringify(W[0].alt) === JSON.stringify({ 'Incline Curls': ['Hammer Curls'] }) && !('alt' in W[1]), 'Varianten werden gesäubert (doppelt, leer, fremd, kaputt) (' + JSON.stringify(W) + ')');
  const g = G.slotOf('hammer curls', W[0].alt);
  ok(g && g.slot === 'Incline Curls' && g.opts.join() === 'Incline Curls,Hammer Curls' && G.slotOf('Klimmzüge', W[0].alt) === null, 'Variante findet ihre Übung im Workout');
  const by = G.analyze([S('a', '2026-11-01', 'Pull', [['Incline Curls', [[12, 10]]]]), S('b', '2026-11-08', 'Pull', [['Hammer Curls', [[14, 10]]]])], '2026-11-10').byKey;
  ok(G.pickVariant(['Incline Curls', 'Hammer Curls'], by) === 'Incline Curls' && G.pickVariant(['Incline Curls', 'Hammer Curls', 'Spider Curls'], by) === 'Spider Curls', 'Abwechselnd: die am längsten her ist (nie gemacht zuerst)');
  ok(by.get('incline curls').best.w === 12 && by.get('hammer curls').best.w === 14, 'Fortschritt je Variante getrennt');
}
console.log(fail ? '\nFEHLER: ' + fail : '\nalles ok'); process.exit(fail ? 1 : 0);
