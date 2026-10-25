/* Life Board – Training, Gym-Logbuch: Übungen, Sätze, Wiederholungen, Gewicht, Fortschritt, Rekorde.
   Teil 1 (rechnen, ohne Seite) ist in Node testbar: tools/test-gym.mjs. Teil 2 baut die Oberfläche. Regelbasiert, keine KI. */
(function (root) {
'use strict';
/* ================= Teil 1: Rechnen ================= */
const key = n => String(n || '').toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const e1rm = (w, r) => w > 0 && r > 0 ? (r === 1 ? w : w * (1 + Math.min(r, 12) / 30)) : 0;
const diOf = k => Math.round(Date.parse(k + 'T12:00:00Z') / 864e5);
const MUSCLES = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Beine', 'Gesäß', 'Bauch', 'Waden', 'Andere'];
const MAP = [
  ['Waden', /wade|calf/], ['Gesäß', /hip ?thrust|glute|gesäß|hüftstreck/],
  ['Beine', /rum[äa]n|rdl|romanian|stiff|leg (curl|press|extension)|bein(curl|beuger|strecker|presse)|kniebeuge|squat|ausfall|lunge|bulgar|hack|adduktor|abduktor/],
  ['Bauch', /crunch|plank|bauch|sit ?up|beinheben|leg raise|ab ?wheel|russian/],
  ['Trizeps', /trizeps|tricep|french|skull|pushdown|kickback|enge?s? bank|close ?grip/],
  ['Bizeps', /bizeps|bicep|curl|hammer/],
  ['Schultern', /schulter|shoulder|military|overhead|seitheben|lateral|frontheben|arnold|shrug|face ?pull|reverse fl|nacken|ohp/],
  ['Rücken', /klimm|pull ?up|chin|rudern|row|latzug|lat |kreuzheb|deadlift|(^| )rücken|hyperext|pulldown|pullover/],
  ['Brust', /bank|bench|brust|chest|fliegende|fly|butterfly|peck|dip|liegestütz|push ?up|cable cross/]
];
const muscle = n => { const k = key(n) + ' '; for (const m of MAP) if (m[1].test(k)) return m[0]; return 'Andere' };
const TEMPLATES = {
  Push: ['Bankdrücken', 'Schulterdrücken', 'Schrägbankdrücken Kurzhantel', 'Seitheben', 'Trizepsdrücken'],
  Pull: ['Klimmzüge', 'Rudern', 'Latzug', 'Face Pulls', 'Bizepscurls'],
  Beine: ['Kniebeuge', 'Rumänisches Kreuzheben', 'Beinpresse', 'Beinbeuger', 'Wadenheben'],
  Oberkörper: ['Bankdrücken', 'Rudern', 'Schulterdrücken', 'Latzug', 'Bizepscurls', 'Trizepsdrücken'],
  Unterkörper: ['Kniebeuge', 'Rumänisches Kreuzheben', 'Ausfallschritte', 'Hip Thrust', 'Wadenheben'],
  Ganzkörper: ['Kniebeuge', 'Bankdrücken', 'Rudern', 'Schulterdrücken', 'Plank'],
  Isometrie: ['Wandsitz', 'Plank', 'Isometrische Kniebeuge', 'Klimmzug-Halt', 'Seitstütz'],
  Plyometrie: ['Box Jumps', 'Counter Movement Jumps', 'Drop Jumps', 'Broad Jumps', 'Skippings']
};
const COMMON = ['Bankdrücken', 'Schrägbankdrücken', 'Kniebeuge', 'Kreuzheben', 'Rumänisches Kreuzheben', 'Schulterdrücken', 'Klimmzüge', 'Rudern', 'Latzug', 'Beinpresse', 'Ausfallschritte', 'Hip Thrust', 'Bizepscurls', 'Trizepsdrücken', 'Seitheben', 'Face Pulls', 'Beinbeuger', 'Beinstrecker', 'Wadenheben', 'Dips', 'Liegestütze', 'Plank', 'Crunches'];

const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : NaN };
function cleanSession(s) { // nur gültige Sätze behalten
  const ex = (s.ex || []).map(e => ({ n: String(e.n || '').trim().slice(0, 60), s: (e.s || []).map(x => ({ w: num(x.w) || 0, r: Math.round(num(x.r)) })).filter(x => x.r > 0 && x.r <= 200 && x.w >= 0 && x.w <= 1000) })).filter(e => e.n && e.s.length);
  return Object.assign({}, s, { ex });
}
function sessStats(s) { let vol = 0, sets = 0, reps = 0; s.ex.forEach(e => e.s.forEach(x => { if (x.r > 0) { sets++; reps += x.r; vol += x.w * x.r } })); return { vol: Math.round(vol), sets, reps } }

function analyze(sessions, today) {
  const S = sessions.slice().sort((a, b) => a.t - b.t), ex = new Map(), td = today ? diOf(today) : (S.length ? diOf(S[S.length - 1].date) : 0);
  const mus = {}; MUSCLES.forEach(m => mus[m] = { w1: 0, w4: 0 });
  S.forEach(s => {
    const d = diOf(s.date);
    s.ex.forEach(e => {
      const k = key(e.n); if (!k) return; const ok = e.s.filter(x => x.r > 0); if (!ok.length) return;
      let o = ex.get(k); if (!o) ex.set(k, o = { key: k, name: e.n, muscle: muscle(e.n), n: 0, sets: 0, series: [], best: null, bestE: null, last: null, lastDate: null });
      o.name = e.n; o.n++; o.sets += ok.length; let top = null, e1 = 0, vol = 0;
      ok.forEach(x => {
        vol += x.w * x.r; const v = e1rm(x.w, x.r); if (v > e1) e1 = v;
        if (!top || x.w > top.w || (x.w === top.w && x.r > top.r)) top = { w: x.w, r: x.r };
        if (!o.best || x.w > o.best.w || (x.w === o.best.w && x.r > o.best.r)) o.best = { w: x.w, r: x.r, date: s.date };
        if (v > 0 && (!o.bestE || v > o.bestE.v)) o.bestE = { v, w: x.w, r: x.r, date: s.date };
      });
      o.series.push({ date: s.date, e1: Math.round(e1 * 10) / 10, top: top.w, topR: top.r, vol: Math.round(vol) });
      o.last = ok.map(x => ({ w: x.w, r: x.r })); o.lastDate = s.date;
      const m = mus[o.muscle]; if (td - d < 7 && td - d >= 0) m.w1 += ok.length; else if (td - d >= 7 && td - d < 35) m.w4 += ok.length;
    });
  });
  const list = [...ex.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  list.forEach(o => { const bd = o.best && diOf(o.best.date), ed = o.bestE && diOf(o.bestE.date); o.pr7 = o.n >= 2 && ((bd != null && td - bd < 7 && td - bd >= 0) || (ed != null && td - ed < 7 && td - ed >= 0)) });
  const muscles = MUSCLES.map(m => ({ m, w1: mus[m].w1, avg4: Math.round(mus[m].w4 / 4 * 10) / 10 })).filter(x => x.w1 || x.avg4);
  const recent = S.filter(s => td - diOf(s.date) < 28 && td - diOf(s.date) >= 0);
  const vol28 = recent.reduce((a, s) => a + sessStats(s).vol, 0);
  return { ex: list, byKey: ex, muscles, sessions: S.slice().reverse(), n28: recent.length, vol28, td };
}
// Rekorde, die eine neue Einheit gegenüber dem bisherigen Stand bricht
function prsOf(prev, sess, today) {
  const A = analyze(prev, today), out = [];
  sess.ex.forEach(e => {
    const o = A.byKey.get(key(e.n)); const ok = e.s.filter(x => x.r > 0); if (!o || !ok.length) return;
    const top = ok.reduce((b, x) => !b || x.w > b.w || (x.w === b.w && x.r > b.r) ? x : b, null), e1 = Math.max.apply(null, ok.map(x => e1rm(x.w, x.r)));
    if (top.w > o.best.w) out.push({ n: e.n, kind: 'Gewicht', w: top.w, r: top.r });
    else if (top.w === o.best.w && top.r > o.best.r && top.w > 0) out.push({ n: e.n, kind: 'Wiederholungen', w: top.w, r: top.r });
    else if (top.w === 0 && top.r > o.best.r) out.push({ n: e.n, kind: 'Wiederholungen', w: 0, r: top.r });
    else if (e1 > o.bestE.v + 0.05) out.push({ n: e.n, kind: 'geschätztes 1RM', w: top.w, r: top.r });
  });
  return out;
}
// Regel für die nächste Einheit (Doppelprogression), nur ein Vorschlag
function hint(o) {
  if (!o || !o.last || !o.last.length) return '';
  const tw = Math.max.apply(null, o.last.map(x => x.w)), at = o.last.filter(x => x.w === tw);
  if (tw === 0) return at.every(x => x.r >= 12) ? 'Mit Zusatzgewicht oder schwerer Variante probieren' : '+1 Wiederholung pro Satz';
  if (at.length >= 2 && at.every(x => x.r >= 10)) return 'Alles geschafft: ' + fmtW(tw + (tw >= 40 ? 2.5 : 1.25)) + ' kg probieren';
  if (at.every(x => x.r >= 8)) return 'Gewicht halten, +1 Wiederholung pro Satz';
  return 'Gewicht halten und sauber auf 8 Wiederholungen kommen';
}
const fmtW = w => (Math.round(w * 100) / 100).toString().replace('.', ',');
const setStr = s => s.map(x => (x.w ? fmtW(x.w) + '×' : '') + x.r).join(', ');

const Core = { key, e1rm, muscle, MUSCLES, TEMPLATES, COMMON, cleanSession, sessStats, analyze, prsOf, hint, fmtW, setStr, num };
root.TrainingGymCore = Core;
if (typeof module !== 'undefined' && module.exports) module.exports = Core;
if (typeof window === 'undefined') return;

/* ================= Teil 2: Oberfläche ================= */
const V = window.TrainingViz, esc = V.esc, DRAFT_KEY = 'lb_gym_draft';
const $ = id => document.getElementById(id);
const nf = (v, d) => window.TrainingCore.fmt.num(v, d || 0);
const G = { ctx: null, host: null, draft: null, A: null, sel: null, rest: null, msg: '', prs: null, openId: null };

function loadDraft() { try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (d && Array.isArray(d.ex)) return d } catch (e) {} return null }
function saveDraft() { try { if (G.draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(G.draft)); else localStorage.removeItem(DRAFT_KEY) } catch (e) {} }
function newDraft(plan, names) {
  const d = { plan: plan || '', start: Date.now(), date: G.ctx.today, ex: [], min: '', rpe: 7, note: '' };
  (names || []).forEach(n => addEx(d, n)); return d;
}
function addEx(d, name) {
  name = String(name || '').trim(); if (!name) return;
  const o = G.A.byKey.get(key(name));
  d.ex.push({ n: o ? o.name : name, s: o && o.last ? o.last.map(x => ({ w: x.w ? fmtW(x.w) : '', r: String(x.r) })) : [{ w: '', r: '' }] });
}
function liveStats() { const s = sessStats(cleanSession({ ex: G.draft.ex })); return s }

function render(host, ctx) {
  G.host = host; G.ctx = ctx; G.A = analyze(ctx.sessions, ctx.today);
  if (!G.draft) G.draft = loadDraft();
  if (!G.sel || !G.A.byKey.has(G.sel)) G.sel = G.A.ex[0] ? G.A.ex[0].key : null;
  draw();
}
function draw() {
  const A = G.A, d = G.draft;
  let h = '<h2>Gym-Logbuch</h2><div class="sub">Übungen, Sätze und Gewichte. Das Board merkt sich, was du zuletzt gemacht hast.</div>';
  if (G.prs && G.prs.length) h += '<div class="gprs" role="status">🏆 <b>Neue Rekorde:</b> ' + G.prs.map(p => esc(p.n) + ' (' + p.kind + ': ' + (p.w ? fmtW(p.w) + ' kg × ' : '') + p.r + ')').join(' · ') + '</div>';
  h += d ? editor(d) : starter();
  h += '<div class="msg" id="gMsg" aria-live="polite">' + esc(G.msg) + '</div>';
  if (A.ex.length) h += progress() + muscles() + history();
  G.host.innerHTML = h; bind(); if (A.ex.length) chart();
}
function starter() {
  const last = G.A.sessions[0];
  return '<div class="gstart"><div class="chips">' + Object.keys(TEMPLATES).map(p => '<button type="button" class="chip" data-a="tpl" data-p="' + p + '">' + p + '</button>').join('') +
    (last ? '<button type="button" class="chip a" data-a="again">↻ Wie zuletzt' + (last.plan ? ': ' + esc(last.plan) : '') + '</button>' : '') +
    '<button type="button" class="chip" data-a="tpl" data-p="">+ Leer starten</button></div></div>';
}
function editor(d) {
  const st = liveStats(), known = [...new Set(G.A.ex.map(o => o.name).concat(COMMON))];
  let h = '<div class="gedit"><div class="gtop"><b>' + (d.plan ? esc(d.plan) : 'Gym-Einheit') + '</b><span class="mu" id="gLive">' + st.sets + ' Sätze · ' + nf(st.vol) + ' kg Volumen</span></div>' + (d.link ? '<div class="mu" style="margin:4px 0 8px">⌚ Gehört zur Whoop-Einheit vom ' + window.TrainingCore.fmt.date(d.date) + ' – zählt nur einmal.</div>' : '');
  h += '<div class="grest" id="gRest">' + [60, 90, 120, 180].map(s => '<button type="button" class="chip" data-a="rest" data-s="' + s + '">' + (s >= 120 ? s / 60 + ' min' : s + ' s') + '</button>').join('') + '<span id="gRestT" class="grt" aria-live="off"></span></div>';
  d.ex.forEach((e, i) => {
    const o = G.A.byKey.get(key(e.n));
    h += '<div class="gx" data-i="' + i + '"><div class="gxh"><b>' + esc(e.n) + '</b><button type="button" class="txt" data-a="rmx" data-i="' + i + '" aria-label="Übung ' + esc(e.n) + ' entfernen">✕</button></div>' +
      (o && o.last ? '<div class="mu gsm">Letztes Mal (' + window.TrainingCore.fmt.date(o.lastDate) + '): ' + esc(setStr(o.last)) + (hint(o) ? ' · Idee: ' + esc(hint(o)) : '') + '</div>' : '<div class="mu gsm">Neu – noch keine Vergleichswerte.</div>') +
      '<div class="gsets">' + e.s.map((x, j) => '<div class="gs"><span>' + (j + 1) + '</span><input type="text" inputmode="decimal" placeholder="kg" aria-label="Gewicht Satz ' + (j + 1) + '" data-i="' + i + '" data-j="' + j + '" data-f="w" value="' + esc(x.w) + '"><input type="text" inputmode="numeric" placeholder="Wdh" aria-label="Wiederholungen Satz ' + (j + 1) + '" data-i="' + i + '" data-j="' + j + '" data-f="r" value="' + esc(x.r) + '"><button type="button" class="txt" data-a="rms" data-i="' + i + '" data-j="' + j + '" aria-label="Satz ' + (j + 1) + ' entfernen">–</button></div>').join('') + '</div>' +
      '<button type="button" class="chip" data-a="adds" data-i="' + i + '">+ Satz</button></div>';
  });
  h += '<div class="gadd"><input id="gNew" list="gList" type="text" placeholder="Übung hinzufügen …" aria-label="Übung hinzufügen" maxlength="60"><datalist id="gList">' + known.map(n => '<option value="' + esc(n) + '">').join('') + '</datalist><button type="button" id="gAdd">Hinzufügen</button></div>';
  h += '<div class="fm"><div class="row"><div><label for="gDate">Datum</label><input id="gDate" type="date" max="' + G.ctx.today + '" value="' + esc(d.date) + '"></div><div><label for="gMin">Dauer (Minuten)</label><input id="gMin" type="number" inputmode="numeric" min="5" max="400" placeholder="' + (d.start ? Math.max(5, Math.round((Date.now() - d.start) / 60000)) : 60) + '" value="' + esc(d.min) + '"></div></div>' +
    '<label>Wie anstrengend? <b id="gRpeT">' + d.rpe + '/10</b></label><div class="seg rpe" id="gRpe" role="group" aria-label="Anstrengung">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => '<button type="button" data-r="' + n + '" aria-pressed="' + (n === d.rpe) + '">' + n + '</button>').join('') + '</div>' +
    '<label for="gNote">Notiz (optional)</label><input id="gNote" type="text" maxlength="120" value="' + esc(d.note) + '" placeholder="z. B. Schulter zwickt"></div>' +
    '<div class="btns"><button type="button" class="primary" id="gSave">Einheit speichern</button><button type="button" id="gDrop">Verwerfen</button></div></div>';
  return h;
}
function progress() {
  const A = G.A, o = A.byKey.get(G.sel);
  return '<h3 class="gh">Fortschritt</h3><div class="chips" id="gSel">' + A.ex.slice(0, 14).map(e => '<button type="button" class="chip' + (e.key === G.sel ? ' on' : '') + '" data-a="sel" data-k="' + esc(e.key) + '">' + esc(e.name) + (e.pr7 ? ' 🏆' : '') + '</button>').join('') + '</div>' +
    (o ? '<div class="tiles4 gt"><div class="rec"><span>Bestes Gewicht</span><b>' + (o.best.w ? fmtW(o.best.w) + ' kg' : o.best.r + ' Wdh') + '</b><small>' + (o.best.w ? '× ' + o.best.r + ' · ' : '') + window.TrainingCore.fmt.date(o.best.date) + '</small></div>' +
      '<div class="rec"><span>Geschätztes 1RM</span><b>' + (o.bestE ? nf(o.bestE.v, 1) + ' kg' : '–') + '</b><small>' + (o.bestE ? window.TrainingCore.fmt.date(o.bestE.date) : 'nur mit Gewicht') + '</small></div>' +
      '<div class="rec"><span>Einheiten · Sätze</span><b>' + o.n + ' · ' + o.sets + '</b><small>' + esc(o.muscle) + '</small></div>' +
      '<div class="rec"><span>Letztes Mal</span><b style="font-size:16px">' + esc(setStr(o.last)) + '</b><small>' + (hint(o) ? esc(hint(o)) : window.TrainingCore.fmt.date(o.lastDate)) + '</small></div></div><div id="gChart"></div>' : '');
}
function muscles() {
  const m = G.A.muscles; if (!m.length) return '';
  const mx = Math.max.apply(null, m.map(x => Math.max(x.w1, x.avg4)).concat([1]));
  return '<h3 class="gh">Sätze pro Muskelgruppe</h3><div class="sub" style="margin-bottom:6px">Letzte 7 Tage gegen deinen Schnitt der 4 Wochen davor. Zuordnung nach dem Namen der Übung.</div>' +
    m.map(x => '<div class="hb"><span style="width:84px">' + x.m + '</span><div class="bar"><i style="width:' + (x.w1 / mx * 100).toFixed(0) + '%"></i></div><b style="width:auto;min-width:96px">' + x.w1 + ' (Ø ' + nf(x.avg4, 1) + ')</b></div>').join('');
}
function history() {
  const list = G.A.sessions.slice(0, 8), F = window.TrainingCore.fmt;
  return '<h3 class="gh">Letzte Einheiten</h3><div class="ghist">' + list.map(s => { const st = sessStats(s); return '<details data-id="' + esc(s.id) + '"' + (G.openId === s.id ? ' open' : '') + '><summary>' + F.date(s.date) + ' · ' + esc(s.plan || 'Gym') + ' · ' + st.sets + ' Sätze · ' + nf(st.vol) + ' kg</summary><div class="gdet">' + s.ex.map(e => '<div><b>' + esc(e.n) + '</b> <span class="mu">' + esc(setStr(e.s)) + '</span></div>').join('') + (s.note ? '<div class="mu">„' + esc(s.note) + '“</div>' : '') + '<div class="btns"><button type="button" class="txt" data-a="delS" data-id="' + esc(s.id) + '">Einheit löschen</button></div></div></details>' }).join('') + '</div>';
}
function chart() {
  const el = $('gChart'), o = G.A.byKey.get(G.sel); if (!el || !o) return;
  const pts = o.series.slice(-40), w = V.W(el), h = 220, pl = 38, pr = 12, pt = 16, pb = 24;
  const useE = pts.some(p => p.e1 > 0), val = p => useE ? p.e1 : p.topR, mx = Math.max.apply(null, pts.map(val).concat([1])) * 1.15;
  const X = i => pl + (w - pl - pr) * (pts.length === 1 ? .5 : i / (pts.length - 1)), Y = v => pt + (h - pt - pb) * (1 - v / mx);
  let s = V.grid(w, h, pl, pr, pt, pb, mx, '', 4); const tt = [];
  s += '<path d="' + pts.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(val(p)).toFixed(1)).join('') + '" fill="none" stroke="#ff5460" stroke-width="2.5" stroke-linejoin="round"/>';
  pts.forEach((p, i) => { tt.push({ t: window.TrainingCore.fmt.dateLong(p.date), rows: [['#ff5460', useE ? 'Geschätztes 1RM' : 'Wiederholungen', useE ? nf(p.e1, 1) + ' kg' : p.topR + ''], [null, 'Bestes Gewicht', p.top ? fmtW(p.top) + ' kg × ' + p.topR : '–'], [null, 'Volumen', nf(p.vol) + ' kg']] }); s += '<circle data-tt="' + i + '" cx="' + X(i).toFixed(1) + '" cy="' + Y(val(p)).toFixed(1) + '" r="6" fill="#ff5460" stroke="#04080f" stroke-width="2"/>' });
  el.innerHTML = '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Verlauf ' + esc(o.name) + '">' + s + '</svg>' + V.sr('Verlauf ' + o.name, pts.map(p => [p.date, useE ? nf(p.e1, 1) + ' kg' : p.topR + ' Wdh']));
  V.bindTT(el, tt);
}

/* ---------- Pausen-Timer ---------- */
function startRest(sec) {
  stopRest(); const end = Date.now() + sec * 1000;
  const tick = () => { const t = $('gRestT'); if (!t) { stopRest(); return } const left = Math.max(0, Math.ceil((end - Date.now()) / 1000)); t.textContent = 'Pause ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'); if (left <= 0) { stopRest(); t.textContent = 'Weiter geht’s!'; beep() } };
  G.rest = setInterval(tick, 250); tick();
}
function stopRest() { if (G.rest) clearInterval(G.rest); G.rest = null }
function beep() { try { const c = new (window.AudioContext || window.webkitAudioContext)(), o = c.createOscillator(), g = c.createGain(); o.frequency.value = 880; g.gain.value = .08; o.connect(g); g.connect(c.destination); o.start(); setTimeout(() => { o.stop(); c.close() }, 350) } catch (e) {} }

/* ---------- Ereignisse ---------- */
function setMsg(t, err) { G.msg = t; const m = $('gMsg'); if (m) { m.textContent = t; m.className = 'msg' + (err ? ' err' : '') } }
function bind() {
  const host = G.host, d = G.draft;
  host.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a, i = +b.dataset.i, j = +b.dataset.j;
    if (a === 'tpl') { G.prs = null; G.msg = ''; G.draft = newDraft(b.dataset.p, TEMPLATES[b.dataset.p]); if (!b.dataset.p) G.draft.plan = ''; saveDraft(); draw(); return }
    if (a === 'again') { const l = G.A.sessions[0]; G.prs = null; G.msg = ''; G.draft = newDraft(l.plan, l.ex.map(x => x.n)); saveDraft(); draw(); return }
    if (a === 'sel') { G.sel = b.dataset.k; draw(); return }
    if (a === 'rest') { startRest(+b.dataset.s); return }
    if (a === 'delS') { const s = G.A.sessions.find(x => x.id === b.dataset.id); if (!s || !confirm('Einheit vom ' + window.TrainingCore.fmt.date(s.date) + ' löschen?')) return; try { await G.ctx.remove(s.id); G.msg = 'Gelöscht.' } catch (er) { setMsg('Konnte nicht löschen: ' + er.message, true) } return }
    if (!d) return;
    if (a === 'rmx') { if (d.ex[i].s.some(x => x.w || x.r) && !confirm(d.ex[i].n + ' entfernen?')) return; d.ex.splice(i, 1) }
    else if (a === 'adds') { const p = d.ex[i].s[d.ex[i].s.length - 1]; d.ex[i].s.push({ w: p ? p.w : '', r: p ? p.r : '' }) }
    else if (a === 'rms') { d.ex[i].s.splice(j, 1); if (!d.ex[i].s.length) d.ex[i].s.push({ w: '', r: '' }) }
    saveDraft(); draw();
  };
  if (!d) return;
  host.oninput = e => {
    const t = e.target; if (t.dataset.f) { d.ex[+t.dataset.i].s[+t.dataset.j][t.dataset.f] = t.value; saveDraft(); const l = $('gLive'); if (l) { const s = liveStats(); l.textContent = s.sets + ' Sätze · ' + nf(s.vol) + ' kg Volumen' } }
    else if (t.id === 'gDate') d.date = t.value; else if (t.id === 'gMin') d.min = t.value; else if (t.id === 'gNote') d.note = t.value; saveDraft();
  };
  host.querySelectorAll('#gRpe [data-r]').forEach(b => b.addEventListener('click', () => { d.rpe = +b.dataset.r; host.querySelectorAll('#gRpe [data-r]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); $('gRpeT').textContent = d.rpe + '/10'; saveDraft() }));
  const add = () => { const i = $('gNew'); if (!i.value.trim()) return; addEx(d, i.value); saveDraft(); draw(); const n = $('gNew'); if (n) n.focus() };
  $('gAdd').addEventListener('click', add); $('gNew').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); add() } });
  $('gDrop').addEventListener('click', () => { if (d.ex.some(e => e.s.some(x => x.r)) && !confirm('Einheit verwerfen? Eingaben gehen verloren.')) return; stopRest(); G.draft = null; saveDraft(); draw() });
  $('gSave').addEventListener('click', async () => {
    const c = cleanSession(d);
    if (!c.ex.length) return setMsg('Trag mindestens einen Satz mit Wiederholungen ein.', true);
    if (!d.date || d.date > G.ctx.today) return setMsg('Bitte ein Datum bis heute wählen.', true);
    const typed = num(d.min), auto = d.start ? Math.round((Date.now() - d.start) / 60000) : 0;
    const est = c.ex.reduce((a, e) => a + e.s.length, 0) * 3 + 8, min = isFinite(typed) ? typed : (auto >= 5 && auto <= 400 ? auto : est);
    if (!(min >= 5 && min <= 400)) return setMsg('Dauer bitte zwischen 5 und 400 Minuten.', true);
    $('gSave').disabled = true;
    try {
      const prs = await G.ctx.save({ plan: d.plan || '', date: d.date, min: Math.round(min), rpe: d.rpe, note: String(d.note || '').trim().slice(0, 120), ex: c.ex, link: d.link || null });
      stopRest(); G.draft = null; saveDraft(); G.prs = prs; G.msg = 'Gespeichert: ' + c.ex.length + ' Übungen, ' + sessStats(c).sets + ' Sätze.'; draw();
    } catch (er) { $('gSave').disabled = false; setMsg('Konnte nicht speichern: ' + er.message, true) }
  });
}
/* Übungen zu einer Whoop-Einheit eintragen (aus „Noch ergänzen“): Vorlage nach Fokus, Datum und Dauer vorbelegt */
function start(o) { G.prs = null; G.msg = ''; const p = TEMPLATES[o.plan] ? o.plan : ''; G.draft = newDraft(p || o.plan || '', TEMPLATES[p] || []); G.draft.date = o.date; G.draft.min = o.min ? String(o.min) : ''; G.draft.start = null; G.draft.link = o.link || null; if (o.rpe) G.draft.rpe = o.rpe; saveDraft(); if (G.host) draw() }
window.TrainingGym = { render, start, draw: () => { if (G.host && G.A) chart() }, core: Core };
})(typeof window !== 'undefined' ? window : globalThis);
