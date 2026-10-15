/* Life Board – Training: Textschicht (Befund, Insights, Begrüßung, Repair Guide, Coach-Fragen).
   Alles regelbasiert aus den gerechneten Zahlen – keine KI, nichts dazuerfunden. TrainingText.narrate(R, opts) */
(function (root) {
'use strict';
const C = root.TrainingCore || (typeof require !== 'undefined' ? require('./training-core.js') : null);
const F = C.fmt;
const n0 = v => F.num(v, 0), n1 = v => F.num(v, 1), n2 = v => F.num(v, 2);
const pc = v => F.num(v, 0) + ' %';
const zoneName = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5'];

function formWord(f) { return f < -25 ? 'sehr belastet' : f <= -10 ? 'im Aufbau' : f <= 5 ? 'ausgeglichen' : f <= 15 ? 'frisch' : 'sehr frisch' }
function acwrWord(a) { return a == null ? '–' : a < 0.8 ? 'unter dem Gewohnten' : a <= 1.3 ? 'im Zielkorridor' : a <= 1.5 ? 'erhöht' : 'deutlich erhöht' }

function narrate(R, o) {
  o = o || {};
  const out = { befund: null, insights: [], greeting: '', chips: [], repair: null, qa: [], model: R.model };
  if (!R || !R.ok) return out;
  const L = R._L || [];
  const name = (o.name || '').trim();
  const run = R.totals.runs;
  const zones = R.zones;
  const z3lo = zones[1];

  /* ---------- Befund ---------- */
  const cands = [];
  const ER = R.easyRuns;
  if (R.jump && R.jump.weeksAgo <= 3) cands.push({
    id: 'jump', score: 0.95,
    head: 'Dein Umfang wuchs zu schnell', headParts: ['Dein Umfang wuchs', 'zu schnell'],
    text: 'Die Woche ab ' + F.date(R.jump.start) + ' brachte ' + n1(R.jump.km) + ' km, der Schnitt der vier Wochen davor lag bei ' + n1(R.jump.avg4) + ' km.',
    nums: [{ v: '+' + n0(R.jump.pct) + ' %', l: 'gegenüber dem Vorschnitt' }, { v: n1(R.jump.km) + ' km', l: 'Sprungwoche' }, { v: n1(R.jump.avg4) + ' km', l: 'Schnitt davor' }],
    way: ['Wochen laufen Montag bis Sonntag, nur Lauf und Trail zählen.', 'Sprung = ab 30 km und mehr als 30 % über dem Schnitt der vier Wochen davor.', n1(R.jump.km) + ' ÷ ' + n1(R.jump.avg4) + ' = ' + n2(R.jump.km / R.jump.avg4)],
    chart: { type: 'weeks' }
  });
  if (R.acwr != null && (R.acwr > 1.5 || R.form < -25)) cands.push({
    id: 'load', score: R.acwr > 1.5 ? 0.9 : 0.8,
    head: 'Deine Belastung ist zu hoch', headParts: ['Deine Belastung ist', 'zu hoch'],
    text: 'Die letzten sieben Tage brachten ' + n0(R.load7) + ' Punkte, das ist das ' + n2(R.acwr) + '-Fache deines Wochenschnitts der 28 Tage davor.',
    nums: [{ v: n2(R.acwr), l: 'akut zu chronisch' }, { v: F.signed(R.form, 0), l: 'Form heute' }, { v: F.signed(R.ramp, 1), l: 'Fitness-Rampe, 7 Tage' }],
    way: ['Akut = Last der letzten 7 Tage: ' + n0(R.load7) + ' Punkte.', 'Chronisch = Wochenschnitt der 28 Tage davor.', 'Form = Fitness (' + n0(R.fitness) + ') minus Ermüdung (' + n0(R.fatigue) + ') = ' + F.signed(R.form, 0)],
    chart: { type: 'form', limit: -25 }
  });
  if (ER.n >= 6 && ER.z3 / ER.n >= 0.4) cands.push({
    id: 'easy', score: 0.5 + ER.z3 / ER.n * 0.5,
    head: 'Dein Lockeres ist zu hart', headParts: ['Dein Lockeres ist', 'zu hart'],
    text: ER.z3 + ' von ' + ER.n + ' lockeren Läufen der letzten zwölf Wochen lagen mit ihrem Durchschnittspuls in Zone 3 oder höher.',
    nums: [{ v: ER.z3 + ' von ' + ER.n, l: 'lockere Läufe ab Zone 3' }, { v: n0(ER.medHr), l: 'Median-Puls' }, { v: z3lo, l: 'Zone 3 beginnt bei' }],
    way: ['Locker = Lauf, 5 bis 22 km, langsamer als dein Marathontempo, Name ohne Qualitätswort.', 'Zone 3 beginnt bei 90 % des Schwellenpulses (' + R.thr + ') = ' + z3lo + '.', 'Median-Tempo dieser Läufe: ' + F.pace(ER.medPace) + ' /km.'],
    chart: { type: 'scatter', kind: 'easy', limit: z3lo }
  });
  if (R.hardRuns.nHr >= 3 && R.hardRuns.overThr / R.hardRuns.nHr >= 0.5) cands.push({
    id: 'hard', score: 0.5 + R.hardRuns.overThr / R.hardRuns.nHr * 0.4,
    head: 'Deine Intervalle sind zu hart', headParts: ['Deine Intervalle sind', 'zu hart'],
    text: R.hardRuns.overThr + ' von ' + R.hardRuns.nHr + ' harten Einheiten liegen mit dem Durchschnittspuls der ganzen Einheit am oder über dem Schwellenpuls.',
    nums: [{ v: R.hardRuns.overThr + ' von ' + R.hardRuns.nHr, l: 'harte Einheiten' }, { v: R.thr, l: 'Schwellenpuls' }, { v: R.hardRuns.b2b, l: 'harte Tage direkt nacheinander' }],
    way: ['Harte Einheit = Lauf mit Intervall-, Schwellen- oder Tempo-Namen, kein Rennen.', 'Einlaufen und Pausen ziehen den Schnitt nach unten.', 'Liegt der Schnitt trotzdem auf Schwelle, waren die schnellen Teile deutlich zu hart.'],
    chart: { type: 'form', limit: -25 }
  });
  const w = R.weeks.filter(x => !x.cur);
  if (w.length >= 8) {
    const a = C.sum(w.slice(-4).map(x => x.km)), b = C.sum(w.slice(-8, -4).map(x => x.km));
    if (b >= 40 && a < b * 0.6) cands.push({
      id: 'slump', score: 0.75,
      head: 'Dein Umfang ist eingebrochen', headParts: ['Dein Umfang ist', 'eingebrochen'],
      text: 'In den letzten vier Wochen standen ' + n0(a) + ' km im Buch, in den vier davor ' + n0(b) + ' km.',
      nums: [{ v: '−' + n0((1 - a / b) * 100) + ' %', l: 'Umfang' }, { v: n0(a) + ' km', l: 'letzte 4 Wochen' }, { v: n0(b) + ' km', l: 'die 4 davor' }],
      way: ['Summe der Lauf- und Trailkilometer je vier abgeschlossene Wochen.', n0(a) + ' ÷ ' + n0(b) + ' = ' + n2(a / b), 'Unter 0,6 gilt als Einbruch.'],
      chart: { type: 'weeks' }
    });
  }
  if (R.monotony != null && R.monotony > 2 && R.load7 > 150) cands.push({
    id: 'mono', score: 0.6,
    head: 'Dein Training ist zu gleichförmig', headParts: ['Dein Training ist', 'zu gleichförmig'],
    text: 'Die Tageslasten der letzten sieben Tage streuen kaum: Mittelwert geteilt durch Streuung ergibt ' + n2(R.monotony) + '.',
    nums: [{ v: n2(R.monotony), l: 'Monotonie' }, { v: n0(R.load7), l: 'Punkte in 7 Tagen' }, { v: R.acwr != null ? n2(R.acwr) : '–', l: 'akut zu chronisch' }],
    way: ['Monotonie = Mittelwert der letzten 7 Tageslasten ÷ Standardabweichung (durch n).', 'Über 2 heißt: kaum harte und kaum leichte Tage.', 'Ruhetage und Qualitätstage bringen Kontrast.'],
    chart: { type: 'form', limit: -25 }
  });
  if (R.same.trend && R.same.trend.delta <= -8) cands.push({
    id: 'progress', score: 0.7 + Math.min(0.2, -R.same.trend.delta / 100),
    head: 'Du wirst schneller bei gleichem Puls', headParts: ['Du wirst schneller bei', 'gleichem Puls'],
    text: 'Im Pulsband ' + R.same.band[0] + ' bis ' + R.same.band[1] + ' liefen deine sauberen Läufe im letzten Quartal ' + Math.abs(R.same.trend.delta) + ' Sekunden pro Kilometer schneller als im ersten.',
    nums: [{ v: F.pace(R.same.trend.last), l: 'Tempo letztes Quartal' }, { v: F.pace(R.same.trend.first), l: 'Tempo erstes Quartal' }, { v: F.signed(R.same.trend.delta, 0) + ' s', l: 'pro Kilometer' }],
    way: ['Nur gleichmäßige Läufe von 6 bis 25 km ohne Rennen und ohne Qualitätsnamen.', 'Band mit den meisten Läufen: ' + R.same.band[0] + ' bis ' + R.same.band[1] + ' Schläge (' + R.same.nBand + ' Läufe, ' + R.same.dropped + ' aussortiert).', F.pace(R.same.trend.last) + ' gegen ' + F.pace(R.same.trend.first) + ' = ' + F.signed(R.same.trend.delta, 0) + ' s'],
    chart: { type: 'pace' }
  });
  cands.sort((a, b) => b.score - a.score);
  let bf = cands[0];
  if (!bf) bf = {
    id: 'clean', score: 0,
    head: 'Deine Daten sind sauber', headParts: ['Deine Daten sind', 'sauber'],
    text: 'Weder Sprung, Überlast noch zu hartes Lockeres fallen auf: Form ' + F.signed(R.form, 0) + ', akut zu chronisch ' + (R.acwr != null ? n2(R.acwr) : '–') + '.',
    nums: [{ v: F.signed(R.form, 0), l: 'Form heute' }, { v: R.acwr != null ? n2(R.acwr) : '–', l: 'akut zu chronisch' }, { v: ER.n ? ER.z3 + ' von ' + ER.n : '–', l: 'lockere Läufe ab Zone 3' }],
    way: ['Geprüft: Umfangssprung, Belastungsverhältnis, Form, lockere und harte Läufe, Einbruch, Monotonie.', 'Kein Schwellenwert wurde gerissen.', 'Ehrlich gesagt: Hier gibt es nichts zu reparieren.'],
    chart: { type: 'form', limit: -25 }
  };
  out.befund = Object.assign({ n: run, model: R.model }, bf);

  /* ---------- Insights ---------- */
  const ins = [];
  // Fortschritt
  if (R.vdot) {
    const old = L.filter(a => a.sport === 'Lauf' && a.km >= 3 && a.vdot && a.loc.di <= R.todayDi - 150 && a.loc.di > R.todayDi - 330).reduce((b, a) => !b || a.vdot > b.vdot ? a : b, null);
    const src = R.vdotSrc;
    const d = old ? Math.round(R.vdot * 10) / 10 - Math.round(old.vdot * 10) / 10 : null;
    ins.push({ id: 'progress', icon: 'trend', title: 'Fitness im Vergleich', big: n1(R.vdot), unit: 'VDOT',
      sentence: old ? 'Dein bester Lauf der letzten 150 Tage liegt ' + (Math.abs(d) < 0.05 ? 'auf dem Niveau' : n1(Math.abs(d)) + (d > 0 ? ' Punkte über' : ' Punkte unter')) + ' dem früheren Bestwert (' + n1(old.vdot) + ').' : 'Gerechnet aus deinem besten Lauf ab 3 km in den letzten 150 Tagen.',
      evidence: n1(src.km) + ' km am ' + F.date(src.date) + ' in ' + F.time(src.sec), grade: src.ageDays <= 60 ? 'belegt' : 'Hinweis', target: 'm-leistung' });
  }
  // Risiko
  if (R.acwr != null) ins.push({ id: 'risk', icon: 'shield', warn: R.acwr > 1.5, title: 'Belastung im Verhältnis', big: n2(R.acwr),
    sentence: 'Deine letzten sieben Tage liegen ' + acwrWord(R.acwr) + '. Die Fitness hat sich in einer Woche um ' + F.signed(R.ramp, 1) + ' Punkte bewegt.',
    evidence: n0(R.load7) + ' Punkte in 7 Tagen · Monotonie ' + (R.monotony != null ? n2(R.monotony) : '–'), grade: 'Hinweis', target: 'm-form' });
  // Rennen
  if (R.race && R.race.calc && R.race.target) ins.push({ id: 'race', icon: 'flag', title: 'Chance auf deine Zielzeit', big: pc(R.race.calc.chance),
    sentence: 'Die Rechnung kommt auf ' + F.time(R.race.calc.race) + ' am Renntag, dein Ziel sind ' + F.time(R.race.target) + '.',
    evidence: 'Fitness ' + F.time(R.race.calc.fit) + ' · Wetter ' + (R.race.calc.wx ? '+' + F.time(R.race.calc.wx) : 'nichts') + ' · Strecke ' + (R.race.calc.course ? '+' + F.time(R.race.calc.course) : 'flach'), grade: R.race.calc.why.length ? 'Hinweis' : 'belegt', target: 'm-leistung' });
  else if (R.pred) { const p = R.pred[2]; ins.push({ id: 'race', icon: 'flag', title: 'Halbmarathon-Prognose', big: F.time(p.sec),
    sentence: 'Aus VDOT ' + n1(R.vdot) + ' ergibt sich ein Tempo von ' + F.pace(p.pace) + ' /km.',
    evidence: p.riegel ? 'Riegel aus deinem längsten Rennen: ' + F.time(p.riegel) : 'Kein Rennen im Jahr für die zweite Rechnung', grade: p.riegel ? 'belegt' : 'Hinweis', target: 'm-leistung' }) }
  // Konstanz
  ins.push({ id: 'consist', icon: 'cal', title: 'Konstanz über Wochen', big: R.consist.cur + (R.consist.cur === 1 ? ' Woche' : ' Wochen'),
    sentence: 'So viele abgeschlossene Wochen in Folge hattest du mindestens drei Läufe. Deine längste Serie liegt bei ' + R.consist.longest + '.',
    evidence: R.consist.hits6 + ' von 6 letzten Wochen mit drei Läufen · ' + R.activeDays + ' aktive Tage', grade: 'belegt', target: 'm-umfang' });
  // Gewohnheit
  if (R.habit.n >= 8) ins.push({ id: 'habit', icon: 'sun', title: 'Wann du läufst', big: pc(R.habit.before9),
    sentence: 'So viele deiner Läufe beginnen vor 9 Uhr. Dein häufigster Termin ist ' + C.WDL[R.habit.top.wd] + ' um ' + R.habit.top.h + ' Uhr.',
    evidence: R.habit.top.n + ' von ' + R.habit.n + ' Läufen in diesem Fenster', grade: R.habit.n >= 20 ? 'belegt' : 'Hinweis', target: 'm-gewohnheit' });
  // Material
  const sh = R.shoes.active[0];
  if (sh) ins.push({ id: 'gear', icon: 'shoe', warn: sh.km >= 600, title: 'Schuhe im Blick', big: n0(sh.km) + ' km',
    sentence: sh.name + ' ist dein meistgenutzter Schuh der letzten 90 Tage' + (sh.km >= 600 ? ' und nähert sich der Grenze von 800 km.' : '.'),
    evidence: n0(sh.km4) + ' km in den letzten vier Wochen · seit ' + F.date(sh.first), grade: 'belegt', target: 'm-material' });
  const drop = { load: 'risk', progress: 'progress' }[bf.id];
  out.insights = ins.filter(i => i.id !== drop).slice(0, 6);

  /* ---------- Begrüßung ---------- */
  const hr = o.hour != null ? o.hour : 12;
  const hello = hr < 11 ? 'Guten Morgen' : hr < 18 ? 'Hallo' : 'Guten Abend';
  out.hello = hello + (name ? ',' : '.'); out.name = name;
  const tgt = R.weekTarget;
  out.greeting = 'Deine Form ist ' + formWord(R.form) + ' (' + F.signed(R.form, 0) + '), diese Woche stehen ' + n1(R.weekKm) + ' von ' + n1(tgt) + ' km' + (R.weekTargetDerived ? ' (abgeleitet)' : '') + ' im Buch.';
  out.chips = [];
  out.chips.push('Form ' + F.signed(R.form, 0));
  if (R.vdot) out.chips.push('VDOT ' + n1(R.vdot));
  if (R.race && R.race.days >= 0) out.chips.push(R.race.days + ' Tage bis ' + R.race.name);
  else out.chips.push('Serie ' + R.consist.cur + ' Wochen');
  out.chips = out.chips.slice(0, 3);

  /* ---------- Repair Guide ---------- */
  out.repair = repair(R);

  /* ---------- Fragen ---------- */
  const qa = [];
  qa.push({ q: 'Wie fit bin ich gerade?', h: R.vdot ? 'Dein VDOT liegt bei ' + n1(R.vdot) : 'Zu wenig Läufe für einen VDOT',
    p: [R.vdot ? 'Ich rechne aus deinem besten Lauf der letzten 150 Tage (' + n1(R.vdotSrc.km) + ' km am ' + F.date(R.vdotSrc.date) + ' in ' + F.time(R.vdotSrc.sec) + ') auf deine heutige Form hoch.' : 'Mir fehlt ein Lauf ab 3 km in den letzten 150 Tagen.',
      'Deine Fitness steht bei ' + n0(R.fitness) + ', die Ermüdung bei ' + n0(R.fatigue) + ' – die Form ist damit ' + formWord(R.form) + '.'],
    nums: [{ v: R.vdot ? n1(R.vdot) : '–', l: 'VDOT' }, { v: n0(R.fitness), l: 'Fitness' }, { v: F.signed(R.form, 0), l: 'Form' }] });
  qa.push({ q: 'Laufe ich zu hart?', h: ER.n ? (ER.z3 / ER.n >= 0.4 ? 'Dein Lockeres ist nicht locker genug' : 'Dein Lockeres ist locker') : 'Zu wenige lockere Läufe',
    p: [ER.n ? 'Ich zähle ' + ER.z3 + ' von ' + ER.n + ' lockeren Läufen der letzten zwölf Wochen in Zone 3 oder höher, ab ' + z3lo + ' Puls.' : 'Ich finde keine lockeren Läufe mit Puls in den letzten zwölf Wochen.',
      'Insgesamt laufen ' + (R.easyShare != null ? pc(R.easyShare) : '–') + ' deiner Laufzeit in Zone 1 und 2; üblich sind rund 80.'],
    nums: [{ v: ER.n ? ER.z3 + ' von ' + ER.n : '–', l: 'locker ab Z3' }, { v: R.easyShare != null ? pc(R.easyShare) : '–', l: 'Z1 plus Z2' }, { v: R.hardRuns.nHr ? R.hardRuns.overThr + ' von ' + R.hardRuns.nHr : '–', l: 'hart über Schwelle' }] });
  if (R.race && R.race.calc) {
    const c = R.race.calc;
    qa.push({ q: 'Bin ich bereit für ' + R.race.name + '?', h: R.race.target ? 'Deine Chance liegt bei ' + pc(c.chance) : 'Deine Renntagszeit liegt bei ' + F.time(c.race),
      p: ['Ich komme auf ' + F.time(c.fit) + ' Fitness' + (c.wx ? ', ' + F.time(c.wx) + ' Wetteraufschlag' : '') + (c.course ? ' und ' + F.time(c.course) + ' für die Höhenmeter' : '') + ' – zusammen ' + F.time(c.race) + '.',
        R.race.taper ? 'Bis zum Start sinkt die Last im Taper, die Form am Renntag liegt dann bei etwa ' + F.signed(R.race.taper.form, 0) + '.' : 'Das Rennen liegt hinter oder auf heute.'],
      nums: [{ v: F.time(c.race), l: 'Renntagszeit' }, { v: R.race.target ? F.time(R.race.target) : '–', l: 'Ziel' }, { v: '± ' + F.time(c.sd), l: 'Streuung' }] });
  } else if (R.pred) {
    const p = R.pred[1];
    qa.push({ q: 'Was kann ich auf 10 km laufen?', h: 'Rund ' + F.time(p.sec),
      p: ['Aus VDOT ' + n1(R.vdot) + ' rechne ich ' + F.time(p.sec) + ' bei ' + F.pace(p.pace) + ' /km.', p.riegel ? 'Aus deinem längsten Rennen komme ich per Riegel auf ' + F.time(p.riegel) + '.' : 'Ein Rennen im letzten Jahr würde die zweite Rechnung stützen.'],
      nums: [{ v: F.time(p.sec), l: '10 km' }, { v: F.pace(p.pace), l: '/km' }, { v: R.pb['10k'] ? F.time(R.pb['10k'].sec) : '–', l: 'Bestzeit' }] });
  }
  const next = Math.round(R.avg4 * (R.acwr != null && R.acwr > 1.3 ? 0.85 : 1.05));
  qa.push({ q: 'Wie viel soll ich nächste Woche laufen?', h: 'Rund ' + n0(next) + ' Kilometer',
    p: ['Dein Schnitt der letzten vier abgeschlossenen Wochen liegt bei ' + n1(R.avg4) + ' km. ' + (R.acwr != null && R.acwr > 1.3 ? 'Weil deine Belastung erhöht ist, rechne ich 15 % darunter.' : 'Ich lege 5 % obendrauf, mehr nicht.'),
      'Bleib bei mindestens drei Läufen, damit deine Serie von ' + R.consist.cur + ' Wochen hält.'],
    nums: [{ v: n0(next) + ' km', l: 'Vorschlag' }, { v: n1(R.avg4) + ' km', l: 'Schnitt 4 Wochen' }, { v: R.acwr != null ? n2(R.acwr) : '–', l: 'akut zu chronisch' }] });
  out.qa = qa;
  return out;
}

function repair(R) {
  const days = R.plan.days, today = R.todayDi;
  const up = days.filter(d => d.di >= today && !d.done && d.kind !== 'rest');
  const keyK = k => k === 'long' || k === 'hard' || k === 'race';
  const lbl = d => (d.label || C.plan.kindLabel(d.kind)) + (d.km ? ' · ' + F.num(d.km, 0) + ' km' : '');
  const none = why => ({ changed: false, why });
  if (!up.length) return none('Für den Rest der Woche steht nichts mehr an.');
  const ER = R.easyRuns;
  // 1) zwei Schlüsseltage hintereinander
  for (let i = 0; i < days.length - 1; i++) {
    const a = days[i], b = days[i + 1];
    if (b.di < today || a.done) continue;
    if (keyK(a.kind) && keyK(b.kind)) {
      // lieber eine andere Einheit leichter machen: lockerer Lauf davor
      const easyBefore = days.slice(Math.max(0, i - 2), i).reverse().find(d => d.kind === 'easy' && d.di >= today && !d.done);
      const tgt = easyBefore || (a.kind === 'hard' ? a : null);
      if (tgt) {
        const nw = tgt === easyBefore ? { kind: 'rest', km: 0, label: 'Ruhetag' } : { kind: 'easy', km: Math.round((tgt.km || 8) * 0.8), label: 'Lockerer Lauf' };
        return { changed: true, idx: tgt.wd, old: lbl(tgt), neu: nw.kind === 'rest' ? 'Ruhetag' : nw.label + ' · ' + nw.km + ' km', title: 'Ich lege vor deine zwei Schlüsseleinheiten Luft',
          reason: 'Ich sehe ' + C.WDL[a.wd] + ' (' + lbl(a) + ') und ' + C.WDL[b.wd] + ' (' + lbl(b) + ') direkt hintereinander. Deine Form liegt bei ' + F.signed(R.form, 0) + ' und akut zu chronisch bei ' + (R.acwr != null ? n2(R.acwr) : '–') + ', darum mache ich ' + C.WDL[tgt.wd] + ' leichter, damit beide Schlüsseleinheiten gelingen.',
          keeps: 'Die beiden Schlüsseleinheiten bleiben, wie sie sind.', nums: [{ v: F.signed(R.form, 0), l: 'Form' }, { v: R.acwr != null ? n2(R.acwr) : '–', l: 'akut zu chronisch' }, { v: n0(R.load7), l: 'Punkte in 7 Tagen' }] };
      }
    }
  }
  // 2) lockeres zu hart
  const nextEasy = up.find(d => d.kind === 'easy');
  if (nextEasy && ER.n >= 6 && ER.z3 / ER.n >= 0.4) {
    return { changed: true, idx: nextEasy.wd, old: lbl(nextEasy), neu: 'Lockerer Lauf · ' + (nextEasy.km ? n0(nextEasy.km) + ' km · ' : '') + 'Puls unter ' + R.zones[1], title: 'Ich nehme das Tempo aus deinem Lockeren',
      reason: 'Ich sehe, dass ' + ER.z3 + ' von ' + ER.n + ' lockeren Läufen in Zone 3 oder höher lagen. Dein Median-Puls dort ist ' + n0(ER.medHr) + ', Zone 3 beginnt bei ' + R.zones[1] + '. Genau diese Einheit bremst dich, weil sie die Erholung für deine Schlüsseleinheiten frisst.',
      keeps: 'Länge und Tag bleiben, nur der Puls bleibt unter ' + R.zones[1] + '.', nums: [{ v: ER.z3 + ' von ' + ER.n, l: 'locker ab Z3' }, { v: n0(ER.medHr), l: 'Median-Puls' }, { v: R.zones[1], l: 'Grenze Z3' }] };
  }
  // 3) Wochenumfang zu hoch
  const planKm = C.sum(days.map(d => d.kind === 'other' || d.kind === 'rest' ? 0 : d.km || 0));
  if (!R.weekTargetDerived && R.avg4 > 0 && planKm >= 30 && planKm > R.avg4 * 1.3) {
    const e = days.filter(d => d.kind === 'easy' && d.di >= today && !d.done && d.km).sort((a, b) => b.km - a.km)[0];
    if (e) { const cut = Math.round(Math.min(e.km * 0.4, planKm - R.avg4 * 1.3)); return { changed: true, idx: e.wd, old: lbl(e), neu: 'Lockerer Lauf · ' + n0(e.km - cut) + ' km', title: 'Ich kürze einen lockeren Lauf',
      reason: 'Ich sehe ' + n0(planKm) + ' km im Plan gegen ' + n0(R.avg4) + ' km Schnitt der letzten vier Wochen, das sind ' + n0((planKm / R.avg4 - 1) * 100) + ' % mehr. Ich nehme ' + cut + ' km aus dem längsten lockeren Lauf, weil Schlüsseleinheiten Vorrang haben.',
      keeps: 'Lange Läufe und harte Einheiten bleiben unangetastet.', nums: [{ v: n0(planKm) + ' km', l: 'Plan' }, { v: n0(R.avg4) + ' km', l: 'Schnitt 4 Wochen' }, { v: '−' + cut + ' km', l: 'Kürzung' }] } }
  }
  // 4) Überlast
  if ((R.acwr != null && R.acwr > 1.5) || R.form < -25) {
    const e = up.find(d => d.kind === 'easy');
    if (e) return { changed: true, idx: e.wd, old: lbl(e), neu: 'Ruhetag', title: 'Ich streiche einen lockeren Lauf',
      reason: 'Ich sehe eine Form von ' + F.signed(R.form, 0) + ' und akut zu chronisch ' + (R.acwr != null ? n2(R.acwr) : '–') + '. Der nächste lockere Lauf bringt dir kaum etwas, kostet aber Erholung.',
      keeps: 'Alle Schlüsseleinheiten bleiben.', nums: [{ v: F.signed(R.form, 0), l: 'Form' }, { v: R.acwr != null ? n2(R.acwr) : '–', l: 'akut zu chronisch' }, { v: n0(R.load7), l: 'Punkte in 7 Tagen' }] };
  }
  return none('Die Woche passt: ' + n0(planKm) + ' km im Plan' + (R.avg4 ? ' gegen ' + n0(R.avg4) + ' km Schnitt' : '') + ', keine zwei Schlüsseltage hintereinander, Form ' + F.signed(R.form, 0) + '.');
}

root.TrainingText = { narrate, formWord, acwrWord };
if (typeof module !== 'undefined' && module.exports) module.exports = root.TrainingText;
})(typeof window !== 'undefined' ? window : globalThis);
