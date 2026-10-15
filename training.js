/* Life Board – Training: Daten laden/speichern, Strava und CSV, Aufbau der Seite. Rechnen steckt in training-core.js / training-text.js. */
(function () {
'use strict';
const C = window.TrainingCore, T = window.TrainingText, V = window.TrainingViz, F = C.fmt, esc = V.esc;
const WORKER = 'https://life-board-whoop.momo-haskamp.workers.dev';
const $ = id => document.getElementById(id);
const f0 = v => F.num(v, 0), f1 = v => F.num(v, 1);
const noAnim = () => matchMedia('(prefers-reduced-motion: reduce)').matches || (window.LBUI && LBUI.settings.perf) || navigator.webdriver;
let stvNote = '', user = null, base = '', ST = { name: '', rest: null, race: null, planText: '' }, ACTS = [], R = null, N = null, period = 12, mode = 'km', rdIdx = 0, rdTarget = null, qaIdx = 0, logSport = 'Alle', logSort = ['t', -1], logAll = false, strava = null;
const todayKey = () => C.local(Date.now()).key;

/* ---------- Worker ---------- */
async function wfetch(path, body) {
  const t = await user.getIdToken();
  const r = await fetch(WORKER + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  let d = null; try { d = await r.json() } catch (e) {}
  if (!r.ok) { const e = new Error((d && d.error) || ('Fehler ' + r.status)); e.code = d && d.code; e.status = r.status; throw e }
  return d;
}
const say = (t, err) => { const m = $('msg'); m.textContent = t || ''; m.className = 'msg' + (err ? ' err' : '') };

/* ---------- Speichern / Laden ---------- */
const compact = a => ({ i: a.id, t: a.t, r: a.raw || '', n: a.name || '', k: a.km, s: a.sec, h: a.hr, m: a.hrmax, e: a.elev, c: a.cad, g: a.gear, q: a.kcal, p: a.steps, x: a.rpe || null, w: a.strain || null });
const expand = o => { const a = { id: o.i, t: o.t, raw: o.r, name: o.n, km: o.k == null ? null : o.k, sec: o.s, hr: o.h == null ? null : o.h, hrmax: o.m == null ? null : o.m, elev: o.e == null ? null : o.e, cad: o.c == null ? null : o.c, gear: o.g || null, kcal: o.q == null ? null : o.q, steps: o.p == null ? null : o.p, rpe: o.x || null, strain: o.w || null, src: /^w/.test(o.i) ? 'whoop' : null }; a.sport = C.classify(a.raw, a.name, a.km, a.elev); if (a.cad != null && a.cad < 120 && (a.sport === 'Lauf' || a.sport === 'Trail')) a.cad *= 2; return a };
const YEARS = new Set(), GYEARS = new Set();
let GYM = [];
async function loadAll() {
  const s = await fs.doc(base + '/training/settings').get();
  if (s.exists) ST = Object.assign(ST, s.data());
  const q = await fs.collection(base + '/training').get();
  GYM = []; q.docs.forEach(d => { if (/^gym_\d{4}$/.test(d.id)) { GYEARS.add(d.id.slice(4)); (d.data().list || []).forEach(o => GYM.push(gExpand(o))) } });
  const list = []; q.docs.forEach(d => { if (/^acts_\d{4}$/.test(d.id)) YEARS.add(d.id.slice(5)); if (/^acts_\d{4}$/.test(d.id)) (d.data().list || []).forEach(o => list.push(expand(o))) });
  ACTS = dedupe(list);
  try { localStorage.setItem('lb_tr_n', String(ACTS.length)) } catch (e) {}
}
function dedupe(list) {
  const m = new Map(); list.forEach(a => { const k = a.id; if (!m.has(k)) m.set(k, a) });
  const byT = new Map(); [...m.values()].sort((a, b) => a.t - b.t).forEach(a => { const k = Math.round(a.t / 60000) + '|' + Math.round((a.km || 0) * 10); const p = byT.get(k); if (!p || (a.hr && !p.hr)) byT.set(k, a) });
  return [...byT.values()].sort((a, b) => a.t - b.t);
}
const gCompact = s => ({ i: s.id, d: s.date, t: s.t, m: s.min, x: s.rpe, n: s.note || '', p: s.plan || '', e: s.ex.map(e => ({ n: e.n, s: e.s.map(x => ({ w: x.w, r: x.r })) })) });
const gExpand = o => ({ id: o.i, date: o.d, t: o.t, min: o.m, rpe: o.x, note: o.n || '', plan: o.p || '', ex: (o.e || []).map(e => ({ n: e.n, s: (e.s || []).map(x => ({ w: x.w, r: x.r })) })) });
async function saveGym() {
  const by = {}; GYM.forEach(s => { const y = s.date.slice(0, 4); (by[y] = by[y] || []).push(gCompact(s)) });
  for (const y of Object.keys(by)) { await fs.doc(base + '/training/gym_' + y).set({ list: JSON.parse(JSON.stringify(by[y])) }); GYEARS.add(y) }
  for (const y of [...GYEARS]) if (!by[y]) await fs.doc(base + '/training/gym_' + y).set({ list: [] });
}
async function addGym(o) {
  const G = window.TrainingGym.core, [y, m, d] = o.date.split('-').map(Number), now = C.local(Date.now());
  const t = o.date === now.key ? Date.now() : C.localToMs(y, m, d, 18, 0, 0);
  const s = { id: 'x' + t.toString(36) + Math.random().toString(36).slice(2, 6), date: o.date, t, min: o.min, rpe: o.rpe, note: o.note, plan: o.plan, ex: o.ex };
  const prs = G.prsOf(GYM, s, todayKey());
  const keepG = GYM.slice(), keepA = ACTS.slice();
  GYM = GYM.concat([s]);
  const a = { id: 'g' + s.id, t, raw: 'Kraft', name: s.plan || 'Gym', km: null, sec: s.min * 60, hr: null, hrmax: null, elev: null, cad: null, gear: null, kcal: null, steps: null, rpe: s.rpe };
  a.sport = 'Kraft'; ACTS = dedupe(ACTS.concat([a]));
  try { await saveGym(); await saveActs() } catch (e) { GYM = keepG; ACTS = keepA; throw e }
  renderAll(); return prs;
}
async function removeGym(id) {
  const keepG = GYM.slice(), keepA = ACTS.slice();
  GYM = GYM.filter(s => s.id !== id); ACTS = ACTS.filter(a => a.id !== 'g' + id);
  try { await saveGym(); await saveActs() } catch (e) { GYM = keepG; ACTS = keepA; throw e }
  renderAll();
}
async function saveSettings() { await fs.doc(base + '/training/settings').set(JSON.parse(JSON.stringify(ST))) }
async function saveActs() {
  const by = {}; ACTS.forEach(a => { const y = new Date(a.t).getUTCFullYear(); (by[y] = by[y] || []).push(compact(a)) });
  for (const y of Object.keys(by)) { await fs.doc(base + '/training/acts_' + y).set({ list: JSON.parse(JSON.stringify(by[y])) }); YEARS.add(y) }
  for (const y of [...YEARS]) if (!by[y]) await fs.doc(base + '/training/acts_' + y).set({ list: [] });
}
async function saveSummary() {
  if (!R || !R.ok) return;
  if (isMulti()) { const t = window.TrainingMulti.summary(R, ST); if (t) try { await fs.doc(base + '/training/summary').set({ text: t, at: Date.now() }) } catch (e) {} return }
  const L = ['TRAINING (Laufanalyse, Stand ' + R.today + '): ' + R.totals.runs + ' Läufe in 12 Monaten, ' + f0(R.totals.runKm) + ' km.'];
  L.push('  Form ' + F.signed(R.form, 0) + ' (Fitness ' + f0(R.fitness) + ', Ermüdung ' + f0(R.fatigue) + '), akut zu chronisch ' + (R.acwr != null ? F.num(R.acwr, 2) : '–') + ', VDOT ' + (R.vdot ? f1(R.vdot) : '–') + ', Schwellenpuls ' + R.thr + ', Maximalpuls ' + R.maxHr + '.');
  if (R.pred) L.push('  Prognosen: 5 km ' + F.time(R.pred[0].sec) + ', 10 km ' + F.time(R.pred[1].sec) + ', Halbmarathon ' + F.time(R.pred[2].sec) + ', Marathon ' + F.time(R.pred[3].sec) + '.');
  if (R.race && R.race.calc) L.push('  Rennen "' + R.race.name + '" am ' + R.race.date + ' (' + R.race.km + ' km): Renntagszeit ' + F.time(R.race.calc.race) + (R.race.target ? ', Ziel ' + F.time(R.race.target) + ', Chance ' + R.race.calc.chance + ' %' : '') + '.');
  L.push('  Woche: ' + f1(R.weekKm) + ' von ' + f1(R.weekTarget) + ' km. Befund: ' + N.befund.head + ' – ' + N.befund.text);
  try { await fs.doc(base + '/training/summary').set({ text: L.join('\n'), at: Date.now() }) } catch (e) {}
}

/* ---------- Analyse + Seite ---------- */
function analyze() {
  const race = ST.race && ST.race.date && ST.race.km ? ST.race : null;
  const plan = ST.planText && ST.planText.trim() ? C.plan.parse(ST.planText) : null;
  R = C.analyze(ACTS, { today: todayKey(), rest: ST.rest || null, race, plan });
  N = R.ok && !isMulti() ? T.narrate(R, { name: ST.name, hour: new Date().getHours() }) : null;
  window.LB_PAGE_CONTEXT = () => isMulti() ? (R && R.ok ? window.TrainingMulti.summary(R, ST) : 'Training: noch keine Einheiten') : R && R.ok ? 'TRAINING-SEITE: Form ' + F.signed(R.form, 0) + ', VDOT ' + (R.vdot ? f1(R.vdot) : '–') + ', Befund: ' + N.befund.head + '. ' + N.befund.text : 'Training: noch keine Daten';
}
const isMulti = () => ST.view !== 'lauf';
function show(which) { $('setup').hidden = which !== 'setup'; $('content').hidden = which !== 'content'; $('mcontent').hidden = which !== 'multi'; $('trNav').style.display = which === 'content' || which === 'multi' ? '' : 'none'; document.querySelectorAll('#viewSw [data-v]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.v === 'lauf') === !isMulti())) ) }
function homeOnboard() { const o = $('onboard'), g = $('setup').querySelector('.g'); if (o && g && o.parentNode !== g) g.prepend(o) }
let stvInit = false;
function multiCtx() {
  return { st: ST, todayKey: todayKey(), say, noAnim, importNode: $('onboard'), add: addAct, remove: removeAct, gym: { sessions: GYM, today: todayKey(), save: addGym, remove: removeGym }, saveProfile: async o => { Object.assign(ST, o); await saveSettings(); renderAll() } };
}
function renderMulti() {
  show('multi'); say(''); window.TrainingMulti.render($('mcontent'), R, multiCtx());
  if (!$('whoopBox')) { const w = document.createElement('div'); w.id = 'whoopBox'; w.style.marginBottom = '18px'; w.innerHTML = whoopBox(); bindWhoop(w); $('mImp').prepend(w) } else $('mImp').prepend($('whoopBox'));
  if (!stvInit) { stvInit = true; stravaUI($('stravaBox')) }
  $('ftDate').textContent = F.dateLong(R.ok ? R.today : todayKey());
  saveSummary();
}
async function addAct(o) {
  const [y, m, d] = o.date.split('-').map(Number), now = C.local(Date.now());
  const t = o.date === now.key ? Date.now() : C.localToMs(y, m, d, 18, 0, 0);
  const a = { id: 'm' + t.toString(36) + Math.random().toString(36).slice(2, 6), t, raw: o.sport, name: o.name || '', km: o.km || null, sec: Math.round(o.min * 60), hr: o.hr || null, hrmax: null, elev: null, cad: null, gear: null, kcal: null, steps: null, rpe: o.rpe || null };
  a.sport = C.classify(a.raw, a.name, a.km, a.elev);
  const keep = ACTS.slice(); ACTS = dedupe(ACTS.concat([a]));
  try { await saveActs() } catch (e) { ACTS = keep; throw e }
  renderAll();
}
async function removeAct(id) {
  if (/^g/.test(id)) return removeGym(id.slice(1));
  const keep = ACTS.slice(); ACTS = ACTS.filter(a => a.id !== id);
  try { if (/^w/.test(id)) { ST.hide = (ST.hide || []).concat([id]).slice(-500); await saveSettings() } await saveActs() } catch (e) { ACTS = keep; throw e }
  renderAll();
}
function renderAll() {
  analyze();
  if (isMulti()) return renderMulti();
  homeOnboard();
  if (!R.ok) { show('setup'); buildSetup(); say(ACTS.length ? 'Keine auswertbaren Einheiten gefunden.' : 'Noch keine Trainingsdaten.'); return }
  show('content'); say('');
  buildNav(); buildOverview(); buildInsights(); buildForm(); buildPerformance(); buildVolume(); buildIntensity(); buildRecords(); buildPlan(); buildMaterial(); buildProfile($('profile2'), 'p2');
  $('ftDate').textContent = F.dateLong(R.today);
  saveSummary();
  ensureWeather();
}

/* ---------- Navigation ---------- */
const SECS = [['ueber', 'Übersicht'], ['insights', 'Insights'], ['form', 'Form'], ['leistung', 'Leistung'], ['umfang', 'Umfang'], ['intensitaet', 'Intensität'], ['rekorde', 'Rekorde'], ['plan', 'Plan & Coach'], ['material', 'Material']];
function buildNav() {
  const n = $('trNav');
  n.innerHTML = SECS.map(s => '<a href="#' + (s[0] === 'ueber' ? 's-ueber' : s[0]) + '" data-s="' + s[0] + '">' + s[1] + '</a>').join('') + '<span class="sp"></span><span class="seg" role="group" aria-label="Zeitraum">' + [3, 6, 12].map(m => '<button data-p="' + m + '" aria-pressed="' + (m === period) + '">' + m + 'M</button>').join('') + '</span><button id="shareBtn">Teilen</button>';
  n.querySelectorAll('a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); const t = $(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({ behavior: noAnim() ? 'auto' : 'smooth', block: 'start' }) }));
  n.querySelectorAll('[data-p]').forEach(b => b.addEventListener('click', () => { period = +b.dataset.p; n.querySelectorAll('[data-p]').forEach(x => x.setAttribute('aria-pressed', String(+x.dataset.p === period))); renderPeriod() }));
  $('shareBtn').addEventListener('click', openShare);
}
let io = null;
function watchSections() {
  if (io) io.disconnect(); if (!('IntersectionObserver' in window)) return;
  io = new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { document.querySelectorAll('#trNav a').forEach(a => a.classList.toggle('on', a.dataset.s === e.target.dataset.s)) } }) }, { rootMargin: '-30% 0px -60% 0px' });
  SECS.forEach(s => { const el = $(s[0] === 'ueber' ? 's-ueber' : s[0]); if (el) { el.dataset.s = s[0]; io.observe(el) } });
}

/* ---------- Übersicht ---------- */
function formPos(f) { return Math.max(0, Math.min(1, (f + 40) / 70)) }
function buildOverview() {
  const h = $('s-ueber'); const raceHtml = R.race && R.race.calc ? '<div class="card"><h2>' + esc(R.race.name) + '</h2><div class="sub">' + esc(F.dateLong(R.race.date)) + (R.race.place ? ' · ' + esc(R.race.place) : '') + '</div>' + (R.race.days >= 0 ? '<div class="days">' + R.race.days + '<small class="mu" style="font-size:14px;font-family:system-ui"> Tage</small></div>' : '<div class="mu">Das Rennen liegt hinter dir.</div>') + '<div class="kv"><span>Am Renntag</span><b>' + F.time(R.race.calc.race) + '</b></div>' + (R.race.target ? '<div class="kv"><span>Ziel</span><b>' + F.time(R.race.target) + '</b></div><div class="bar" style="margin:6px 0"><i style="width:' + Math.max(3, R.race.calc.chance) + '%"></i></div><div class="kv"><span>Chance</span><b>' + R.race.calc.chance + ' %</b></div>' : '') + '</div>' : '<div class="card"><h2>Nächstes Rennen</h2><div class="sub">Kein Wettkampf eingetragen – Race Day rechnet flach und ohne Wetter.</div><button class="chip a" id="addRace">Rennen eintragen</button></div>';
  const fp = formPos(R.form);
  const pills = [-40, -25, -10, 5, 15, 30].slice(0, 5).map((v, i) => { const lo = [-40, -25, -10, 5, 15][i], hi = [-25, -10, 5, 15, 30][i]; return '<i class="' + (R.form >= lo && R.form < hi ? 'on' : '') + '"></i>' }).join('');
  h.innerHTML = '<div class="o1"><div class="avatar" aria-hidden="true">🏃<b></b></div><div class="hello">' + esc(N.hello) + (N.name ? '<br>' + esc(N.name) + '<i>.</i>' : '') + '</div><p class="sentence">' + esc(N.greeting) + '</p><div class="chips">' + N.chips.map(c => '<span class="chip a">' + esc(c) + '</span>').join('') + '</div></div>' +
    '<div class="card year o2"><div class="top"><h2 style="margin:0">Dein Jahr · 12 Monate</h2><span class="seg" role="group" aria-label="Skyline"><button data-m="km" aria-pressed="true">Kilometer</button><button data-m="load" aria-pressed="false">Belastung</button></span></div><div class="bignum"><span id="kmBig">0</span><small>km</small></div><div class="trio"><span><b>' + f0(R.totals.runs) + '</b>Läufe</span><span><b>' + f0(R.totals.hoursBy.Lauf + R.totals.hoursBy.Trail) + '</b>Laufstunden</span><span><b>' + f0(R.totals.elev) + '</b>Höhenmeter</span></div><div id="sky"></div><div class="note">Nur Laufen. Die Summen aller Sportarten stehen unter „In Zahlen“.</div></div>' +
    '<div class="o3"><div class="card"><h2>Form heute</h2><div class="formval">' + F.signed(R.form, 0) + '<small>' + esc(T.formWord(R.form)) + '</small></div><div class="pills">' + pills + '<u style="left:' + (fp * 100).toFixed(1) + '%"></u></div><div class="pillends"><span>belastet</span><span>frisch</span></div><div class="mini"><div><span>Fitness</span><b>' + f0(R.fitness) + '</b></div><div><span>Ermüdung</span><b>' + f0(R.fatigue) + '</b></div></div></div>' + raceHtml + '</div>';
  const big = $('kmBig'); const fmtK = v => f0(v);
  if (window.LBUI && !navigator.webdriver) LBUI.countUp(big, R.totals.runKm, { fmt: fmtK, dur: 1100 }); else big.textContent = fmtK(R.totals.runKm);
  V.skyline($('sky'), R, mode);
  h.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { mode = b.dataset.m; h.querySelectorAll('[data-m]').forEach(x => x.setAttribute('aria-pressed', String(x === b))); V.skyline($('sky'), R, mode); const k = $('kmBig'); k.nextElementSibling.textContent = mode === 'load' ? 'Punkte' : 'km'; k.textContent = f0(mode === 'load' ? R.days.reduce((s, d) => s + d.load, 0) : R.totals.runKm) }));
  const ar = $('addRace'); if (ar) ar.addEventListener('click', () => { const e = $('profile2'); e.scrollIntoView({ block: 'center' }); const i = $('p2_rname'); if (i) i.focus() });
}

/* ---------- Insights ---------- */
const ICO = { trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>', shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>', flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>', sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>', shoe: '<path d="M3 16c0-3 2-4 4-4l3-4 2 2 3 1c3 1 6 2 6 5v2H3z"/>' };
const TARGET = { 'm-leistung': 'raceday', 'm-form': 'form', 'm-umfang': 'umfang', 'm-gewohnheit': 'habit', 'm-material': 'material' };
function buildInsights() {
  const b = N.befund; $('insSub').textContent = N.insights.length + ' Insights aus deinen Daten · belegt = solide Grundlage, Hinweis = dünne oder alte Grundlage';
  const parts = b.headParts;
  $('insBox').innerHTML = '<div class="card"><div class="reveal"><div><span class="orb"></span><span class="chip a">Der Befund</span> <span class="mu" style="font-size:12px">aus ' + b.n + ' Läufen · ' + esc(R.model) + '</span><h3>' + esc(parts[0]) + ' <em>' + esc(parts[1]) + '</em></h3><p class="sentence">' + esc(b.text) + '</p><div class="nums3">' + b.nums.map(n => '<div><b>' + esc(n.v) + '</b><span>' + esc(n.l) + '</span></div>').join('') + '</div><details class="way"><summary>Rechenweg</summary><ol>' + b.way.map(w => '<li>' + esc(w) + '</li>').join('') + '</ol></details></div><div id="bchart"></div></div></div>' +
    '<div class="itiles">' + N.insights.map((i, k) => '<div class="card itile" data-t="' + i.target + '"><div class="hd"><span class="ic' + (i.warn ? ' w' : '') + '"><svg viewBox="0 0 24 24">' + ICO[i.icon] + '</svg></span><span class="chip' + (i.grade === 'belegt' ? ' a' : '') + '">' + i.grade + '</span><span class="big2">' + esc(i.big) + '</span></div><h4>' + esc(i.title) + '</h4><p>' + esc(i.sentence) + '</p><div class="ev">' + esc(i.evidence) + ' →</div></div>').join('') + '</div>';
  drawBefund();
  $('insBox').querySelectorAll('.itile').forEach(t => t.addEventListener('click', () => { const el = $(TARGET[t.dataset.t]); if (!el) return; el.scrollIntoView({ behavior: noAnim() ? 'auto' : 'smooth', block: 'center' }); el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash') }));
}
function drawBefund() {
  const c = N.befund.chart, el = $('bchart'); if (!el) return;
  if (c.type === 'scatter') V.scatter(el, R.easyRuns.list, c.limit, 'Zone 3 · ab ' + c.limit + ' Puls');
  else if (c.type === 'weeks') V.weeksChart(el, R, 26);
  else if (c.type === 'pace') V.paceChart(el, R.same.months);
  else V.formChart(el, R, 180);
}

/* ---------- Form ---------- */
function buildForm() {
  V.formChart($('c-form'), R, period * 30.4 | 0);
  V.gauge($('c-gauge'), R.acwr);
  $('gaugeMini').innerHTML = '<div><span>Rampe</span><b>' + F.signed(R.ramp, 1) + '</b><small>Fitness in 7 Tagen</small></div><div><span>Monotonie</span><b>' + (R.monotony != null ? F.num(R.monotony, 2) : '–') + '</b><small>7 Tage</small></div><div><span>Punkte</span><b>' + f0(R.load7) + '</b><small>letzte 7 Tage</small></div>';
}

/* ---------- Leistung ---------- */
const RD_N = ['5 km', '10 km', 'HM', 'M'];
function raceCalcFor(i) {
  if (i === 4) return R.race.calc;
  if (R.race && R.race.calc && Math.abs(R.race.km * 1000 - R.rdFlat[i].dm) < 120) return R.race.calc;
  return R.rdFlat[i].calc;
}
function isRaceTab(i) { return R.race && R.race.calc && (i === 4 || Math.abs(R.race.km * 1000 - R.rdFlat[i].dm) < 120) }
function buildPerformance() {
  const box = $('raceday');
  if (!R.vdot) { box.innerHTML = '<h2>Race Day</h2><div class="mu">Für Prognosen braucht es einen Lauf ab 3 km in den letzten 150 Tagen.</div>'; $('preds').innerHTML = ''; return }
  if (R.race && R.race.calc) { const m = [0, 1, 2, 3].find(i => Math.abs(R.race.km * 1000 - R.rdFlat[i].dm) < 120); rdIdx = m != null ? m : 4; rdTarget = R.race.target || R.race.calc.fit } else { rdIdx = Math.min(rdIdx, 3); rdTarget = null }
  drawRaceDay(true);
  const pr = $('preds');
  pr.innerHTML = '<h2>Rennprognosen</h2><div class="sub">VDOT ' + f1(R.vdot) + ' · Beleg: ' + f1(R.vdotSrc.km) + ' km am ' + F.date(R.vdotSrc.date) + ' in ' + F.time(R.vdotSrc.sec) + '</div><table class="pr">' + R.pred.map((p, i) => { const pb = R.pb[p.id]; const mine = isRaceTab(i) && i !== 4; return '<tr class="' + (mine ? 'mine' : '') + '"><td>' + p.n + '<div class="mu" style="font-size:12px">' + (mine && R.race.target ? 'Ziel ' + F.time(R.race.target) : pb ? 'Bestzeit ' + F.time(pb.sec) : p.riegel ? 'Riegel ' + F.time(p.riegel) : '') + '</div></td><td><b>' + F.time(p.sec) + '</b>' + F.pace(p.pace) + ' /km</td></tr>' }).join('') + '</table><div class="note">Easy-Tempo: ' + F.pace(R.easy.fast) + ' bis ' + F.pace(R.easy.slow) + ' /km (70 % und 62 % des VDOT).</div><button class="txt" id="playRd">Zielzeit durchspielen →</button>';
  $('playRd').addEventListener('click', () => $('raceday').scrollIntoView({ behavior: noAnim() ? 'auto' : 'smooth', block: 'center' }));
  buildSame();
}
function drawRaceDay(full) {
  const box = $('raceday'), tabs = RD_N.slice(); if (R.race && R.race.calc && !isRaceTab(0) && ![1, 2, 3].some(isRaceTab)) tabs.push(F.num(R.race.km, 1) + ' km');
  const rd = raceCalcFor(rdIdx), dm = rdIdx === 4 ? R.race.km * 1000 : R.rdFlat[rdIdx].dm, mine = isRaceTab(rdIdx);
  const fit = rd.fit, lo = Math.round(fit * .9 / 5) * 5, hi = Math.round(fit * 1.1 / 5) * 5;
  if (rdTarget == null || rdTarget < lo || rdTarget > hi) rdTarget = Math.max(lo, Math.min(hi, Math.round((mine && R.race.target ? R.race.target : fit) / 5) * 5));
  const ch = C.chanceFor(rd, rdTarget), word = ch < 20 ? 'unwahrscheinlich' : ch < 40 ? 'eher nicht' : ch < 60 ? 'offen' : ch < 80 ? 'gut möglich' : 'sehr wahrscheinlich';
  const needV = C.vdot(dm, rdTarget), pace = rdTarget / (dm / 1000);
  const wxTxt = !mine ? '–' : rd.wbgt == null ? 'nicht abgerufen' : rd.wx ? '+' + F.time(rd.wx) : 'nichts', crTxt = !mine ? '–' : rd.course ? '+' + F.time(rd.course) : 'flach';
  const wx = mine && R.race.wx;
  if (full) {
    box.innerHTML = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ff5460" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg><span class="chip a">Race Day</span><span class="mu" style="font-size:13px">' + (R.race ? esc(R.race.name) + ' · ' + esc(F.dateLong(R.race.date)) + (R.race.place ? ' · ' + esc(R.race.place) : '') : 'ohne Wettkampf: flach, ohne Wetter') + '</span><span style="flex:1"></span>' + (R.race && R.race.days >= 0 ? '<span class="chip">in ' + R.race.days + ' Tagen</span>' : '') + '</div>' +
      '<div class="rd"><div><div class="chance"><span id="rdCh"></span><small>%</small></div><div id="rdWord" style="margin:6px 0"></div><div class="field"><span class="seg" id="rdTabs" role="group" aria-label="Distanz"></span><div class="mu" style="font-size:12px;margin-top:10px">Zielzeit</div><div class="tbig" id="rdT"></div><input type="range" id="rdSl" aria-label="Zielzeit"><div class="two" style="margin-top:8px"><div><span>Nötiger VDOT</span><b id="rdV"></b></div><div><span>Tempo</span><b id="rdP"></b></div></div></div></div>' +
      '<div><div id="c-bell"></div></div><div><h2 style="margin-top:0">So entsteht die Zahl</h2><ul class="how" id="rdHow"></ul><div class="racetot"><span class="mu">Am Renntag</span><b id="rdTot"></b></div></div></div><div class="note" id="rdNote"></div>';
    $('rdSl').addEventListener('input', e => { rdTarget = +e.target.value; drawRaceDay(false) });
  }
  $('rdTabs').innerHTML = tabs.map((n, i) => '<button data-i="' + i + '" aria-pressed="' + (i === rdIdx) + '">' + n + '</button>').join('');
  $('rdTabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { rdIdx = +b.dataset.i; rdTarget = null; drawRaceDay(false) }));
  const sl = $('rdSl'); sl.min = lo; sl.max = hi; sl.step = 5; sl.value = rdTarget;
  $('rdCh').textContent = ch; $('rdWord').innerHTML = 'Chance auf <b>' + F.time(rdTarget) + '</b> · ' + word;
  $('rdT').textContent = F.time(rdTarget); $('rdV').textContent = f1(needV); $('rdP').textContent = F.pace(pace) + ' /km';
  const IC = { fit: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>', wx: '<path d="M7 18a4 4 0 010-8 5 5 0 019.6-1A4 4 0 0117 18z"/>', co: '<path d="M3 20l6-9 4 5 3-4 5 8z"/>', un: '<path d="M12 3v18M6 9l-3 3 3 3M18 9l3 3-3 3"/>' };
  const row = (ic, t, s, v) => '<li><svg viewBox="0 0 24 24">' + IC[ic] + '</svg><div class="t"><b style="font-weight:600">' + t + '</b><small>' + s + '</small></div><b>' + v + '</b></li>';
  $('rdHow').innerHTML = row('fit', 'Fitness', 'VDOT ' + f1(R.vdot) + ' · Beleg ' + f1(R.vdotSrc.km) + ' km am ' + F.date(R.vdotSrc.date), F.time(rd.fit)) +
    row('wx', 'Wetter', !mine ? 'nur für deine Rennstrecke' : rd.wbgt == null ? 'noch kein Wetter abgerufen' : f0(rd.T) + ' °C, Taupunkt ' + f0(wx.td) + ' °C · ' + esc(wx.src || 'geschätzt'), wxTxt) +
    row('co', 'Strecke', !mine ? 'nur für deine Rennstrecke' : (R.race.elev ? f0(R.race.elev) + ' Höhenmeter · ' + esc(R.race.elevSrc) : 'flach gerechnet'), crTxt) +
    row('un', 'Unsicherheit', rd.why.length ? rd.why.join(', ') : 'Streuung der Distanz (' + F.num(C.bandFor(dm) * 100, 1) + ' %)', '± ' + F.time(rd.sd));
  $('rdTot').textContent = F.time(rd.race);
  $('rdNote').textContent = '* Chance = Anteil einer Normalverteilung um die Renntagszeit, der unter deiner Zielzeit liegt. Wetter: Open-Meteo (Klimamittel des Renntags oder Vorhersage), sonst nicht eingerechnet. Zeit = Fitness + Wetter + Strecke.';
  V.bell($('c-bell'), rd, rdTarget);
}
function buildSame() {
  const s = R.same, sub = $('sameSub'), hd = $('sameHead'), ch = $('c-same'), nt = $('sameNote');
  if (!s.band) { sub.textContent = ''; hd.innerHTML = '<div class="mu">Zu wenige saubere Läufe mit Puls – kein Vergleich möglich.</div>'; ch.innerHTML = ''; nt.textContent = ''; return }
  sub.textContent = 'Pulsband ' + s.band[0] + '–' + s.band[1] + ' · ' + s.nBand + ' Läufe';
  if (s.trend) hd.innerHTML = '<div style="display:flex;gap:16px;align-items:baseline;flex-wrap:wrap"><span class="formval">' + F.signed(s.trend.delta, 0) + '<small>s pro km</small></span><span class="mu" style="font-size:13.5px">früh ' + F.pace(s.trend.first) + ' gegen spät ' + F.pace(s.trend.last) + ' /km – ' + (s.trend.delta < 0 ? 'schneller' : s.trend.delta > 0 ? 'langsamer' : 'gleich') + ' bei gleichem Puls.</span></div>'; else hd.innerHTML = '<div class="mu">Für einen Quartalsvergleich fehlen Läufe im ersten oder letzten Quartal.</div>';
  const mo = s.months.filter(m => period >= 12 || m.m >= C.keyOfIdx(R.todayDi - period * 30).slice(0, 7));
  V.paceChart(ch, mo);
  nt.textContent = '* Aussortiert: ' + s.dropped + ' Läufe (Rennen, Intervalle, Trail, zu kurz/lang, hügelig, ohne Puls). Nur Monate mit mindestens drei Läufen im Band.';
}

/* ---------- Umfang ---------- */
function buildVolume() {
  const n = period === 3 ? 13 : period === 6 ? 26 : 53; $('wkSub').textContent = 'Läufe und Trail · Linie = Schnitt der 4 Wochen davor · gestrichelt = laufende Woche';
  V.weeksChart($('c-weeks'), R, n);
  const pctW = R.weekTarget ? R.weekKm / R.weekTarget : 0, pctC = R.consist.hits6 / 6, pctP = R.planPct;
  V.rings($('c-rings'), [pctW, pctC, pctP || 0]);
  $('ringsLeg').innerHTML = [[AC_('#ff5460'), f0(pctW * 100) + ' %', 'Woche', f1(R.weekKm) + ' von ' + f1(R.weekTarget) + ' km'], [AC_('#ff7a85'), f0(pctC * 100) + ' %', 'Konstanz', R.consist.hits6 + ' von 6 Wochen mit 3 Läufen'], [AC_('#ffb0b6'), pctP == null ? '–' : f0(pctP * 100) + ' %', 'Plan', pctP == null ? 'noch kein Tag vorbei' : 'erfüllt bis gestern']].map(r => '<div><i style="background:' + r[0] + '"></i><b>' + r[1] + '</b><span>' + r[2] + '<br>' + r[3] + '</span></div>').join('');
  $('ringsMini').innerHTML = '<div><span>Serie</span><b>' + R.consist.cur + '</b><small>Wochen</small></div><div><span>Längste</span><b>' + R.consist.longest + '</b><small>Wochen</small></div><div><span>Aktive Tage</span><b>' + R.activeDays + '</b><small>von 365</small></div>';
  V.calendar($('c-cal'), R);
  $('calStats').innerHTML = [['Aktive Tage', R.activeDays + ' von 365'], ['Längste Serie', R.longestDayStreak + ' Tage'], ['Bester Monat', R.bestMonth ? C.MON[+R.bestMonth.month.slice(5) - 1] + ' · ' + f0(R.bestMonth.km) + ' km' : '–']].map(r => '<div class="card" style="margin-bottom:10px;padding:12px"><span class="mu" style="font-size:12px">' + r[0] + '</span><div style="font-family:var(--font-hud);font-size:20px">' + r[1] + '</div></div>').join('');
  $('calLeg').innerHTML = '<span>weniger</span>' + ['rgba(255,84,96,.28)', 'rgba(255,84,96,.48)', 'rgba(255,84,96,.68)', 'rgba(255,84,96,.88)', '#ffb3b9'].map(c => '<i style="width:14px;height:14px;border-radius:4px;background:' + c + ';height:14px;margin:0"></i>').join('') + '<span>mehr</span><span class="mu">(bis 6, 10, 15, 22 km)</span>';
}
const AC_ = c => c;

/* ---------- Intensität und Gewohnheit ---------- */
function aggPeriod() {
  const from = R.todayDi - Math.round(period * 30.4), runs = R._L.filter(a => (a.sport === 'Lauf' || a.sport === 'Trail') && a.loc.di > from);
  const z = [0, 0, 0, 0, 0]; runs.forEach(a => { if (a.hr) { const k = a.hr < R.zones[0] ? 0 : a.hr < R.zones[1] ? 1 : a.hr < R.zones[2] ? 2 : a.hr < R.zones[3] ? 3 : 4; z[k] += a.sec / 60 } });
  const t = C.sum(z), pct = z.map(v => t ? v / t * 100 : 0);
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0)); runs.forEach(a => grid[a.loc.wd][a.loc.h]++);
  let top = { n: 0, wd: 0, h: 0 }; grid.forEach((r, wd) => r.forEach((n, h) => { if (n > top.n) top = { n, wd, h } }));
  const hours = {}; C.SPORTS.forEach(s => hours[s] = 0); R._L.filter(a => a.loc.di > from).forEach(a => hours[a.sport] += a.sec / 3600);
  return { pct, easy: pct[0] + pct[1], grid, top, n: runs.length, before9: runs.length ? runs.filter(a => a.loc.h < 9).length / runs.length * 100 : null, hours };
}
function buildIntensity() {
  const A = aggPeriod(), ER = R.easyRuns, HR = R.hardRuns;
  $('intens').innerHTML = '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="formval">' + (A.pct.some(x => x) ? f0(A.easy) + ' %' : '–') + '</span><span class="mu" style="font-size:13px">locker (Z1 + Z2) · üblich sind rund 80</span></div><div id="zb" style="margin-top:12px"></div><div class="mini"><div><span>Lockere Läufe ab Z3</span><b>' + (ER.n ? ER.z3 + ' von ' + ER.n : '–') + '</b><small>letzte 12 Wochen</small></div><div><span>Harte Einheiten ≥ Schwelle</span><b>' + (HR.nHr ? HR.overThr + ' von ' + HR.nHr : '–') + '</b><small>letzte 12 Wochen</small></div><div><span>Zwei harte Tage in Folge</span><b>' + HR.b2b + '×</b><small>Rennen zählt als hart</small></div></div><div class="note">* Jede Einheit zählt komplett in der Zone ihres Durchschnittspulses.</div>';
  if (A.pct.some(x => x)) V.zoneBar($('zb'), A.pct, R.zones); else $('zb').innerHTML = '<div class="mu">Keine Läufe mit Puls im Zeitraum.</div>';
  const day = A.top.n ? C.WDL[A.top.wd] + ' um ' + A.top.h + ' Uhr' : '–';
  $('habit').innerHTML = '<div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap"><span class="formval">' + (A.before9 != null ? f0(A.before9) + ' %' : '–') + '</span><span class="mu" style="font-size:13px">der Läufe vor 9 Uhr · häufigster Termin: ' + day + '</span></div><div id="hg" style="margin-top:10px"></div>';
  V.habitGrid($('hg'), A);
}

/* ---------- Rekorde ---------- */
function buildRecords() {
  const r = R.records, pb = R.pb, cutoff = R.todayDi - 21;
  const rec = (l, v, d, di, hl) => '<div class="rec' + (hl ? ' hl' : '') + '"><span>' + l + '</span>' + (di != null && di > cutoff ? '<i class="nw">Neu</i>' : '') + '<b>' + v + '</b><small>' + (d ? F.date(d) : '&nbsp;') + '</small></div>';
  $('recs').innerHTML = rec('5 km', pb['5k'] ? F.time(pb['5k'].sec) : '–', pb['5k'] && pb['5k'].date, pb['5k'] && pb['5k'].di) + rec('10 km', pb['10k'] ? F.time(pb['10k'].sec) : '–', pb['10k'] && pb['10k'].date, pb['10k'] && pb['10k'].di) + rec('Halbmarathon', pb.hm ? F.time(pb.hm.sec) : '–', pb.hm && pb.hm.date, pb.hm && pb.hm.di) + rec('Längster Lauf', r.longest ? f1(r.longest.km) + ' km' : '–', r.longest && r.longest.date, r.longest && r.longest.di) +
    rec('Größte Woche', r.bigWeek ? f1(r.bigWeek.km) + ' km' : '–', r.bigWeek && r.bigWeek.date, r.bigWeek && r.bigWeek.di) + rec('Meiste Höhenmeter', r.mostElev ? f0(r.mostElev.elev) + ' m' : '–', r.mostElev && r.mostElev.date, r.mostElev && r.mostElev.di) + rec('Früheste Einheit', r.earliest ? r.earliest.h + ':' + String(r.earliest.mi).padStart(2, '0') : '–', r.earliest && r.earliest.date, r.earliest && r.earliest.di) + rec('Längste Tagesserie', R.longestDayStreak + ' Tage', '', null);
  const T2 = R.totals, steps = T2.steps;
  const nums = [['Erdumrundung', F.num(T2.runKm / 40075 * 100, 1) + ' %', 'der 40.075 km'], ['Marathons', F.num(T2.runKm / 42.195, 1), 'Distanzen'], ['Mount Everest', F.num(T2.elev / 8849, 1) + '×', 'Höhenmeter'], ['Tage in Bewegung', F.num(T2.hours / 24, 1), 'aus ' + f0(T2.hours) + ' Stunden'], ['Schritte', steps ? f0(steps) : '–', 'geschätzt'], ['Pizzen', T2.kcal ? f0(T2.kcal / 800) : '–', 'verbrannt (800 kcal)']];
  $('nums').innerHTML = nums.map(n => '<div class="rec"><span>' + n[0] + '</span><b style="font-size:17px">' + n[1] + '</b><small>' + n[2] + '</small></div>').join('');
  startNums();
}
let numT = null;
function startNums() {
  if (numT) clearInterval(numT); const el = [...$('nums').children]; if (noAnim() || !el.length) return; let i = 0;
  numT = setInterval(() => { if (document.hidden) return; el.forEach(x => x.classList.remove('hl')); el[i++ % el.length].classList.add('hl') }, 2600);
}

/* ---------- Plan und Coach ---------- */
function buildPlan() {
  const p = R.plan, rp = N.repair;
  $('planSub').innerHTML = (p.derived ? 'abgeleitet aus deinen letzten vier Wochen' : 'dein Plan') + (rp && rp.changed ? ' <span class="chip a" style="margin-left:6px">Repair Guide · 1 Einheit repariert</span>' : '');
  $('planList').innerHTML = p.days.map((d, i) => {
    const fix = rp && rp.changed && rp.idx === i, bl = d.label && d.label !== 'Ruhetag' ? d.label : C.plan.kindLabel(d.kind), label = bl + (d.km && !/km/i.test(bl) ? ' · ' + f0(d.km) + ' km' : '');
    const ist = d.done && d.kind !== 'rest' ? (d.actKm ? f1(d.actKm) + ' km' + (d.actPace ? ' · ' + F.pace(d.actPace) + ' /km' : '') : f0(d.actMin) + ' min') : '';
    return '<li class="' + (d.isToday ? 'today ' : '') + (fix ? 'fix' : '') + '"><div class="d"><b>' + C.WD[i] + '</b>' + F.dateShort(d.date) + '</div><div class="w">' + (fix ? '<s>' + esc(label) + '</s><span class="nw">' + esc(rp.neu) + '</span>' : esc(label)) + (ist ? '<small>Ist: ' + ist + '</small>' : '') + '</div><span class="ck' + (d.done ? ' on' : '') + '">' + (d.done ? '<svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10"/></svg>' : '') + '</span></li>';
  }).join('');
  $('repair').innerHTML = rp.changed ? '<div class="repair"><span class="orb"></span><span class="chip a">Repair Guide</span><h4>' + esc(rp.title) + '</h4><p style="margin:0 0 8px;color:var(--ink2);font-size:14px">' + esc(rp.reason) + '</p><p style="margin:0 0 8px;font-size:14px">' + esc(rp.keeps) + '</p><div class="nums3">' + rp.nums.map(n => '<div><b>' + esc(n.v) + '</b><span>' + esc(n.l) + '</span></div>').join('') + '</div></div>' : '<div class="repair"><span class="chip">Repair Guide</span><p style="margin:8px 0 0;color:var(--ink2);font-size:14px">' + esc(rp.why) + '</p></div>';
  $('qs').innerHTML = N.qa.map((q, i) => '<button class="chip' + (i === qaIdx ? ' on' : '') + '" data-q="' + i + '">' + esc(q.q) + '</button>').join('');
  $('qs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { qaIdx = +b.dataset.q; $('qs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); answer(qaIdx) }));
  answer(qaIdx, true);
  $('askGo').onclick = ownQ; $('askIn').onkeydown = e => { if (e.key === 'Enter') ownQ() };
}
let typeT = null;
function answer(i, instant) {
  const q = N.qa[i], box = $('ans'); if (typeT) clearTimeout(typeT);
  const nums = '<div class="nums3">' + q.nums.map(n => '<div><b>' + esc(n.v) + '</b><span>' + esc(n.l) + '</span></div>').join('') + '</div>';
  if (instant || noAnim()) { box.innerHTML = '<h4>' + esc(q.h) + '</h4><p>' + esc(q.p[0]) + '</p><p>' + esc(q.p[1]) + '</p>' + nums; return }
  box.innerHTML = '<h4>' + esc(q.h) + '</h4><p id="t0" class="cur"></p><p id="t1"></p><div id="tn"></div>';
  const words = [q.p[0].split(' '), q.p[1].split(' ')]; let a = 0, b = 0;
  (function step() { if (a < words[0].length) { $('t0').textContent = words[0].slice(0, ++a).join(' ') } else if (b < words[1].length) { $('t0').classList.remove('cur'); $('t1').classList.add('cur'); $('t1').textContent = words[1].slice(0, ++b).join(' ') } else { $('t1').classList.remove('cur'); $('tn').innerHTML = nums; return } typeT = setTimeout(step, 28) })();
}
function ownQ() {
  const v = $('askIn').value.trim(), m = $('askMsg'); if (!v) return;
  if (window.Jarvis && Jarvis.ask) { m.textContent = 'Ich frage J.A.R.V.I.S – die Antwort erscheint dort.'; try { Jarvis.open(); Jarvis.ask(v) } catch (e) { m.textContent = 'Konnte J.A.R.V.I.S nicht erreichen.' } $('askIn').value = ''; return }
  try { navigator.clipboard.writeText(v); m.textContent = 'Frage kopiert – stell sie im KI-Chat des Life Boards.' } catch (e) { m.textContent = 'Stell die Frage im KI-Chat des Life Boards.' }
}

/* ---------- Material, Daten, Logbuch ---------- */
function buildMaterial() {
  const sh = R.shoes;
  $('shoes').innerHTML = (sh.active.length ? sh.active.map(s => '<div class="shoe"><div class="kv"><span>' + esc(s.name) + '</span><b>' + f0(s.km) + ' km</b></div><div class="bar" style="' + (s.km >= 600 ? 'background:rgba(255,160,90,.2)' : '') + '"><i style="width:' + Math.min(100, s.km / 8) + '%;' + (s.km >= 600 ? 'background:#ffa05a' : '') + '"></i><u></u></div></div>').join('') : '<div class="mu">Keine Schuhe in den letzten 90 Tagen erfasst.</div>') + (sh.retired.length ? '<div class="note">Ausgemustert: ' + sh.retired.map(s => esc(s.name) + ' (' + f0(s.km) + ' km)').join(', ') + '</div>' : '') + '<div class="note">Balken bis 800 km, Marke bei 700.</div>';
  const A = aggPeriod(), tot = Math.max.apply(null, C.SPORTS.map(s => A.hours[s]).concat([.01]));
  $('sports').innerHTML = C.SPORTS.filter(s => A.hours[s] > 0).sort((a, b) => A.hours[b] - A.hours[a]).map(s => '<div class="hb"><span>' + s + '</span><div class="bar"><i style="width:' + A.hours[s] / tot * 100 + '%"></i></div><b>' + f0(A.hours[s]) + ' h</b></div>').join('') || '<div class="mu">–</div>';
  const th = R.thrSrc, rc = R.race;
  $('assume').innerHTML = [['Quelle', ST.source || 'Strava / CSV'], ['Zeitraum', F.date(R.from) + ' bis ' + F.date(R.to)], ['Maximalpuls', R.maxHr + (R.maxHrAssumed ? ' (angenommen)' : '')], ['Ruhepuls', R.rest + (R.restAssumed ? ' (angenommen)' : '')], ['Schwellenpuls', R.thr + (R.thrAssumed ? ' (angenommen)' : th ? ' · Lauf ' + F.date(th.date) + ', ' + f1(th.km) + ' km' : '')], ['Ohne Puls geschätzt', R.estLoad + ' Einheiten'], ['Rennwetter', rc ? (rc.wx ? esc(rc.wx.src || 'geschätzt') : 'nicht abgerufen') : '–'], ['Höhenmeter Strecke', rc ? (rc.elev ? f0(rc.elev) + ' m · ' + esc(rc.elevSrc) : 'flach') : '–']].map(r => '<div class="kv"><span class="mu">' + r[0] + '</span><b style="text-align:right">' + r[1] + '</b></div>').join('') + '<div class="note">Belastung je Einheit = Stunden × ((Puls − Ruhepuls) ÷ (Schwellenpuls − Ruhepuls))² × 100; ohne Puls Stunden × Faktor² × 100.</div>';
  buildLog();
}
function buildLog() {
  const sp = ['Alle'].concat(C.SPORTS.filter(s => R.counts[s] > 0));
  $('logChips').innerHTML = sp.map(s => '<button class="chip' + (s === logSport ? ' on' : '') + '" data-s="' + s + '">' + s + (s === 'Alle' ? '' : ' · ' + R.counts[s]) + '</button>').join('');
  $('logChips').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { logSport = b.dataset.s; logAll = false; buildLog() }));
  const cols = [['t', 'Datum'], ['name', 'Einheit'], ['sport', 'Sport'], ['km', 'Distanz'], ['sec', 'Zeit'], ['pace', 'Tempo'], ['hr', 'Puls'], ['elev', 'Höhe'], ['load', 'Last']];
  let rows = R.log.filter(r => logSport === 'Alle' || r.sport === logSport).map(r => Object.assign({ pace: r.km ? r.sec / r.km : null }, r));
  const [k, dir] = logSort; rows.sort((a, b) => { const x = a[k], y = b[k]; if (x == null && y == null) return 0; if (x == null) return 1; if (y == null) return -1; return (x < y ? -1 : x > y ? 1 : 0) * dir });
  const shown = logAll ? rows : rows.slice(0, 12);
  $('log').innerHTML = '<thead><tr>' + cols.map(c => '<th data-k="' + c[0] + '">' + c[1] + (logSort[0] === c[0] ? (logSort[1] < 0 ? ' ↓' : ' ↑') : '') + '</th>').join('') + '</tr></thead><tbody>' + shown.map(r => '<tr><td>' + F.date(r.date) + ' ' + r.h + ':' + String(r.mi).padStart(2, '0') + '</td><td>' + esc(r.name || '–') + '</td><td><span class="chip' + (r.sport === 'Lauf' ? ' a' : '') + '" style="min-height:22px">' + r.sport + '</span></td><td>' + (r.km ? f1(r.km) + ' km' : '–') + '</td><td>' + F.time(r.sec) + '</td><td>' + (r.pace && (r.sport === 'Lauf' || r.sport === 'Trail') ? F.pace(r.pace) : '–') + '</td><td>' + (r.hr ? f0(r.hr) : '–') + '</td><td>' + (r.elev != null ? f0(r.elev) + ' m' : '–') + '</td><td>' + f0(r.load) + (r.est ? '*' : '') + '</td></tr>').join('') + '</tbody>';
  $('log').querySelectorAll('th').forEach(th => th.addEventListener('click', () => { const kk = th.dataset.k; logSort = [kk, logSort[0] === kk ? -logSort[1] : (kk === 'name' || kk === 'sport' ? 1 : -1)]; buildLog() }));
  const mb = $('logMore'); mb.hidden = rows.length <= 12; mb.textContent = logAll ? 'Weniger anzeigen' : 'Alle ' + rows.length + ' anzeigen'; mb.onclick = () => { logAll = !logAll; buildLog() };
}

/* ---------- Zeitraum ---------- */
function renderPeriod() { buildForm(); buildSame(); buildVolume(); buildIntensity(); buildMaterial(); }

/* ---------- Teilen ---------- */
function openShare() {
  const b = N.befund, el = $('share'); el.hidden = false;
  el.innerHTML = '<div class="sc"><div class="u"><h3>' + esc(N.name ? N.name : 'Training') + '</h3><div class="k">' + f0(R.totals.runKm) + ' km</div><div style="opacity:.8;font-size:13px">in 12 Monaten gelaufen</div><div id="shSky" style="margin-top:auto"></div></div><div class="l"><h4>' + esc(b.head) + '</h4><div class="n3">' + b.nums.map(n => '<div><b>' + esc(n.v) + '</b><span>' + esc(n.l) + '</span></div>').join('') + '</div><div class="f">Training · Life Board</div></div></div>';
  V.skyline($('shSky'), R, 'km'); el.onclick = () => { el.hidden = true; el.innerHTML = '' };
}

/* ---------- Profil ---------- */
function buildProfile(el, p) {
  const r = ST.race || {}, rt = r.target ? F.time(r.target) : '';
  const dists = [[5, '5 km'], [10, '10 km'], [21.0975, 'Halbmarathon'], [42.195, 'Marathon']];
  const ownKm = r.km && !dists.some(d => Math.abs(d[0] - r.km) < .05);
  el.innerHTML = '<h2>Deine Angaben</h2><div class="sub">Alles optional. Ohne Ruhepuls rechne ich mit 50 („angenommen“), ohne Plan mit deiner typischen Woche.</div>' +
    '<div class="row"><div><label for="' + p + '_name">Vorname</label><input id="' + p + '_name" value="' + esc(ST.name || '') + '" autocomplete="off"></div><div><label for="' + p + '_rest">Ruhepuls</label><input id="' + p + '_rest" inputmode="numeric" placeholder="50" value="' + (ST.rest || '') + '"></div></div>' +
    '<h3 style="margin:16px 0 0;font-size:14px">Nächster Wettkampf</h3>' +
    '<div class="row"><div><label for="' + p + '_rname">Name</label><input id="' + p + '_rname" value="' + esc(r.name || '') + '"></div><div><label for="' + p + '_rplace">Ort</label><input id="' + p + '_rplace" value="' + esc(r.place || '') + '"></div></div>' +
    '<div class="row"><div><label for="' + p + '_rdate">Datum</label><input id="' + p + '_rdate" type="date" value="' + esc(r.date || '') + '"></div><div><label for="' + p + '_rkm">Distanz</label><select id="' + p + '_rkm" style="width:100%;min-height:44px;border-radius:12px;border:1px solid var(--border);background:rgba(6,12,22,.6);color:var(--ink);padding:0 10px;font-size:15px">' + dists.map(d => '<option value="' + d[0] + '"' + (r.km && Math.abs(r.km - d[0]) < .05 ? ' selected' : '') + '>' + d[1] + '</option>').join('') + '<option value="own"' + (ownKm ? ' selected' : '') + '>andere …</option></select></div></div>' +
    '<div class="row"><div id="' + p + '_ownw" ' + (ownKm ? '' : 'hidden') + '><label for="' + p + '_rown">Distanz in km</label><input id="' + p + '_rown" inputmode="decimal" value="' + (ownKm ? r.km : '') + '"></div><div><label for="' + p + '_rtime">Zielzeit (h:mm:ss)</label><input id="' + p + '_rtime" placeholder="1:30:00" value="' + rt + '"></div><div><label for="' + p + '_relev">Höhenmeter Strecke</label><input id="' + p + '_relev" inputmode="numeric" placeholder="unbekannt = flach" value="' + (r.elev || '') + '"></div></div>' +
    '<label for="' + p + '_plan">Trainingsplan dieser Woche (eine Zeile pro Tag, z. B. „Di 10 km locker“, „Do 6x1000 Schwelle 12 km“, „So lang 24 km“)</label><textarea id="' + p + '_plan" placeholder="Mo frei&#10;Di 8 km locker&#10;Do 10 km Schwelle&#10;Sa lang 20 km">' + esc(ST.planText || '') + '</textarea>' +
    '<div class="btns"><button class="primary" id="' + p + '_save">Speichern</button><button id="' + p + '_clr">Rennen löschen</button></div><div class="msg" id="' + p + '_msg"></div>' +
    (p === 'p2' ? '<h3 style="margin:18px 0 6px;font-size:14px">Daten</h3><div id="stravaBox2"></div><div class="btns"><label class="btn" style="display:inline-flex;align-items:center;padding:0 16px;border:1px solid var(--border);border-radius:12px;cursor:pointer">CSV nachladen<input type="file" id="csvFile2" accept=".csv,text/csv,text/plain" hidden></label></div>' : '');
  const sel = $(p + '_rkm'); sel.addEventListener('change', () => { $(p + '_ownw').hidden = sel.value !== 'own' });
  $(p + '_save').addEventListener('click', () => saveProfile(p));
  $(p + '_clr').addEventListener('click', async () => { ST.race = null; await saveSettings(); renderAll() });
  if (p === 'p2') { $('csvFile2').addEventListener('change', onCsv); stravaUI($('stravaBox2')) }
}
async function saveProfile(p) {
  const m = $(p + '_msg'); m.textContent = 'Speichere …'; m.className = 'msg';
  try {
    ST.name = $(p + '_name').value.trim(); const rest = parseInt($(p + '_rest').value, 10); ST.rest = rest >= 30 && rest <= 100 ? rest : null;
    ST.planText = $(p + '_plan').value;
    const date = $(p + '_rdate').value, sel = $(p + '_rkm').value, km = sel === 'own' ? parseFloat(($(p + '_rown').value || '').replace(',', '.')) : parseFloat(sel);
    if (date && km > 0) {
      const old = ST.race || {}, place = $(p + '_rplace').value.trim(), tg = C.durOf($(p + '_rtime').value), elev = parseInt($(p + '_relev').value, 10) || 0;
      const race = { name: $(p + '_rname').value.trim() || 'Wettkampf', place, date, km, target: tg && tg > 0 ? Math.round(tg) : null, elev, elevSrc: elev ? 'von dir angegeben' : 'flach gerechnet' };
      if (place && place === old.place && old.lat != null) { race.lat = old.lat; race.lon = old.lon }
      if (place && race.lat == null) { m.textContent = 'Suche Ort …'; const g = await geocode(place); if (g) { race.lat = g.lat; race.lon = g.lon } }
      if (old.date === date && race.lat === old.lat && old.wx) race.wx = old.wx;
      ST.race = race;
    }
    await saveSettings(); m.textContent = 'Gespeichert.'; renderAll(); const m2 = $(p + '_msg'); if (m2) m2.textContent = 'Gespeichert.';
  } catch (e) { m.textContent = 'Nicht gespeichert: ' + e.message; m.className = 'msg err' }
}

/* ---------- Wetter (Open-Meteo, einziger externer Abruf) ---------- */
async function geocode(name) {
  try {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
    const r = await fetch('https://geocoding-api.open-meteo.com/v1/search?count=1&language=de&name=' + encodeURIComponent(name), { signal: c.signal }); clearTimeout(t);
    const d = await r.json(); const x = d.results && d.results[0]; return x ? { lat: Math.round(x.latitude * 100) / 100, lon: Math.round(x.longitude * 100) / 100 } : null;
  } catch (e) { return null }
}
let wxBusy = false;
async function ensureWeather() {
  const r = ST.race; if (wxBusy || !r || !r.date || r.lat == null || location.protocol === 'about:') return;
  const days = C.dayIdxOfKey(r.date) - R.todayDi; if (days < 0) return;
  const fresh = r.wx && (r.wx.src !== 'Vorhersage' || Date.now() - (r.wx.at || 0) < 6 * 3600e3) && (days <= 14) === (r.wx.src === 'Vorhersage'); if (fresh) return;
  wxBusy = true;
  try {
    const ctl = new AbortController(), to = setTimeout(() => ctl.abort(), 8000);
    const fetchJ = async u => { const x = await fetch(u, { signal: ctl.signal }); if (!x.ok) throw new Error('wx'); return x.json() };
    let wx = null;
    if (days <= 14) {
      const d = await fetchJ('https://api.open-meteo.com/v1/forecast?latitude=' + r.lat + '&longitude=' + r.lon + '&daily=temperature_2m_max,dew_point_2m_mean&timezone=auto&forecast_days=16');
      const i = (d.daily.time || []).indexOf(r.date); if (i >= 0 && d.daily.temperature_2m_max[i] != null && d.daily.dew_point_2m_mean[i] != null) wx = { tmax: d.daily.temperature_2m_max[i], td: d.daily.dew_point_2m_mean[i], src: 'Vorhersage', at: Date.now() };
    } else {
      const y = new Date().getUTCFullYear(), y1 = y - 1, y0 = y - 20;
      const d = await fetchJ('https://archive-api.open-meteo.com/v1/archive?latitude=' + r.lat + '&longitude=' + r.lon + '&start_date=' + y0 + '-01-01&end_date=' + y1 + '-12-31&daily=temperature_2m_max,dew_point_2m_mean&timezone=auto');
      const [, rm, rd] = r.date.split('-').map(Number); const T1 = [], T2 = [];
      (d.daily.time || []).forEach((k, i) => { const [yy, mm, dd] = k.split('-').map(Number); const dist = Math.min(...[-1, 0, 1].map(o => Math.abs(Date.UTC(yy, mm - 1, dd) - Date.UTC(yy + o, rm - 1, rd)) / 864e5)); const a = d.daily.temperature_2m_max[i], b = d.daily.dew_point_2m_mean[i]; if (dist <= 3 && a != null && b != null) { T1.push(a); T2.push(b) } });
      if (T1.length) wx = { tmax: Math.round(C.mean(T1) * 10) / 10, td: Math.round(C.mean(T2) * 10) / 10, src: 'Mittel ' + y0 + '–' + y1, at: Date.now() };
    }
    clearTimeout(to);
    if (wx) { ST.race.wx = wx; await saveSettings(); const keep = [window.scrollX, window.scrollY]; analyze(); buildOverview(); buildInsights(); buildPerformance(); buildMaterial(); window.scrollTo(keep[0], keep[1]) }
  } catch (e) { /* still: ohne Netz bleibt alles, wie es ist */ } finally { wxBusy = false }
}

/* ---------- Strava und CSV ---------- */
async function stravaUI(box) {
  const q = sel => box.querySelector(sel);
  box.innerHTML = '<div class="mu" style="font-size:13px">Strava wird geprüft …</div>';
  try { strava = await wfetch('/strava/status') } catch (e) { box.innerHTML = '<div class="msg err">Der Cloudflare-Worker antwortet nicht (' + esc(e.message) + ').</div>'; return }
  if (!strava.configured) {
    box.innerHTML = '<details class="way"><summary>Strava direkt verbinden (einmalig einrichten)</summary><ol class="how2"><li>Auf <b>strava.com/settings/api</b> eine App anlegen: Name z. B. „Life Board“, Kategorie beliebig, Webseite = deine Life-Board-Adresse.</li><li><b>Authorization Callback Domain</b> = die Adresse deines Workers ohne https:// (z. B. <code>life-board-whoop.momo-haskamp.workers.dev</code>).</li><li>Client-ID und Client-Secret kopieren und in Cloudflare beim Worker unter <b>Settings → Variables and Secrets</b> als Secret <code>STRAVA_CLIENT_ID</code> und <code>STRAVA_CLIENT_SECRET</code> eintragen (nicht in den Chat).</li><li>Aktuelle <code>worker/worker.js</code> aus GitHub in den Cloudflare-Editor kopieren und „Deploy“ drücken.</li><li>Diese Seite neu laden – dann erscheint „Mit Strava verbinden“.</li></ol></details>';
    return;
  }
  if (!strava.connected) { box.innerHTML = '<button class="primary stvGo">Mit Strava verbinden</button><div class="msg stvMsg"></div>'; q('.stvGo').addEventListener('click', async () => { try { const d = await wfetch('/strava/start', {}); location.href = d.url } catch (e) { q('.stvMsg').textContent = e.message; q('.stvMsg').className = 'msg err stvMsg' } }); return }
  box.innerHTML = '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="chip a">Strava verbunden' + (strava.athlete && strava.athlete.name ? ' · ' + esc(strava.athlete.name) : '') + '</span><button class="primary stvSync" id="stvSync' + (box.id === 'stravaBox2' ? '2' : '') + '">Jetzt synchronisieren</button><button class="stvOff">Trennen</button></div><div class="msg stvMsg"></div>';
  q('.stvMsg').textContent = stvNote || (strava.last_sync ? 'Letzter Abruf: ' + new Date(strava.last_sync.at).toLocaleString('de-DE') : '');
  q('.stvSync').addEventListener('click', () => syncStrava());
  q('.stvOff').addEventListener('click', async () => { try { await wfetch('/strava/disconnect', {}); stvNote = ''; stravaUI(box) } catch (e) { q('.stvMsg').textContent = e.message } });
}
let whoopNote = '';
async function syncWhoop(mode) {
  const out = t => { whoopNote = t; document.querySelectorAll('.whMsg').forEach(x => { x.textContent = t }) };
  document.querySelectorAll('.whGo').forEach(b => b.disabled = true);
  try {
    if (mode === 'sync' || mode === 'year') { out('Hole Workouts von Whoop …'); await wfetch('/sync', { days: mode === 'year' ? 365 : 14 }) }
    const to = todayKey(), from = C.keyOfIdx(C.dayIdxOfKey(to) - 365);
    const d = await wfetch('/data?from=' + from + '&to=' + to);
    const list = C.fromWhoop(d.days), before = ACTS.length;
    const have = new Set(ACTS.map(a => a.id));
    const hide = new Set(ST.hide || []);
    const fresh = list.filter(a => !have.has(a.id) && !hide.has(a.id));
    if (fresh.length) { ACTS = dedupe(ACTS.concat(fresh)); await saveActs() }
    const n = ACTS.length - before;
    out(list.length ? list.length + ' Whoop-Workouts gefunden, ' + (n > 0 ? n + ' neu übernommen.' : 'nichts Neues.') : 'Keine Workouts in den gespeicherten Whoop-Daten. Tipp: „12 Monate nachholen“.');
    if (n > 0) renderAll();
  } catch (e) { out(mode ? 'Whoop: ' + e.message : '') }
  finally { document.querySelectorAll('.whGo').forEach(b => b.disabled = false) }
}
function whoopBox() {
  return '<h3 style="margin:0 0 6px;font-size:14px">Whoop-Workouts</h3><div class="mu" style="font-size:13px;margin-bottom:8px">Deine Whoop-Workouts kommen mit Puls, Strain und Kalorien automatisch ins Training – kein Strava nötig. Doppelte Einträge (Whoop + von Hand) löschst du im Logbuch.</div><div class="btns"><button type="button" class="primary whGo" data-m="sync">Jetzt abgleichen</button><button type="button" class="whGo" data-m="year">12 Monate nachholen</button></div><div class="msg whMsg" aria-live="polite">' + esc(whoopNote) + '</div>';
}
function bindWhoop(root) { root.querySelectorAll('.whGo').forEach(b => b.addEventListener('click', () => syncWhoop(b.dataset.m))) }
async function syncStrava(auto) {
  const out = (t, err) => { const l = document.querySelectorAll('.stvMsg'); if (l.length) l.forEach(x => { x.textContent = t; x.className = 'msg stvMsg' + (err ? ' err' : '') }); else say(t, err) };
  let page = 1, got = 0;
  const after = ACTS.length ? Math.max(0, Math.floor(ACTS[ACTS.length - 1].t / 1000) - 3 * 86400) : 0;
  document.querySelectorAll('.stvSync').forEach(b => b.disabled = true);
  try {
    for (; page <= 6; page++) {
      out('Hole Seite ' + page + ' von Strava … (' + got + ' Einheiten)');
      const d = await wfetch('/strava/activities', { page, after });
      const list = C.fromStrava(d.acts); got += list.length; ACTS = dedupe(ACTS.concat(list));
      if (!d.more) { page = 99; break }
    }
    ST.source = 'Strava'; ST.lastSync = Date.now(); await saveActs(); await saveSettings();
    stvNote = got + ' Einheiten geholt' + (page <= 7 ? ' – es gibt noch mehr, tippe nochmal auf „Synchronisieren“.' : '.');
    out(stvNote); renderAll();
  } catch (e) { out(e.message, true) }
  finally { document.querySelectorAll('.stvSync').forEach(b => b.disabled = false) }
}
async function onCsv(ev) {
  const f = ev.target.files && ev.target.files[0]; if (!f) return; const m = $('msg'); say('Lese ' + f.name + ' …');
  try {
    const txt = await f.text(), res = C.importCSV(txt);
    if (!res.acts.length) { say('In der Datei habe ich keine Einheiten gefunden' + (res.info && res.info.error ? ' (' + res.info.error + ')' : '') + '. Erwartet wird activities.csv aus dem Strava-Export.', true); return }
    const before = ACTS.length; ACTS = dedupe(ACTS.concat(res.acts)); ST.source = ST.source || res.info.source;
    await saveActs(); await saveSettings(); say(res.acts.length + ' Einheiten gelesen, ' + (ACTS.length - before) + ' neu (' + res.info.noHr + ' ohne Puls, ' + res.info.skipped + ' übersprungen).'); renderAll();
    if (!ST.name && !ACTS.length) buildSetup();
  } catch (e) { say('Datei konnte nicht gelesen werden: ' + e.message, true) }
  ev.target.value = '';
}
function buildSetup() { buildProfile($('profile'), 'p1'); stravaUI($('stravaBox')); }

/* ---------- Start ---------- */
(async function init() {
  try {
    user = await requireUser(); base = 'users/' + user.uid;
    $('csvFile').addEventListener('change', onCsv);
    const q = new URLSearchParams(location.search), sv = q.get('strava');
    await loadAll();
    renderAll(); watchSections();
    syncWhoop('');
    if (!isMulti() && (!R || !R.ok)) { show('setup'); }
    document.querySelectorAll('#viewSw [data-v]').forEach(b => b.addEventListener('click', async () => { const v = b.dataset.v; if ((v === 'lauf') === (ST.view === 'lauf')) return; ST.view = v; try { await saveSettings() } catch (e) {} renderAll(); watchSections(); window.scrollTo(0, 0) }));
    if (sv) { history.replaceState(null, '', 'training.html'); if (sv === 'connected') { say('Strava verbunden – hole deine Einheiten …'); await syncStrava(true) } else say('Strava-Verbindung nicht zustande gekommen (' + sv + ').', true) }
    window.__trainingReady = true;
  } catch (e) { say('Training konnte nicht geladen werden: ' + e.message, true); window.__trainingReady = true }
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (R && R.ok && !$('mcontent').hidden) window.TrainingMulti.draw(); else if (R && R.ok && !$('content').hidden) { buildForm(); buildVolume(); drawBefund(); V.skyline($('sky'), R, mode); if ($('c-bell')) drawRaceDay(false); buildSame(); V.calendar($('c-cal'), R); buildIntensity() } }, 200) });
})();
})();
