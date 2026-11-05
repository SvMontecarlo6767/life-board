/* Life Board – Trainingsplan (oben im Reiter Training). Eigenes Modul: liest training/settings nur (Gym-Workouts für den Startplan),
   schreibt ausschließlich in users/{uid}/plan/ (v_JJJJ-MM-TT = Planversionen, settings = Einstellungen). Rechnen: plan-core.js. */
(function () {
'use strict';
const P = window.PlanCore, $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { base: '', versions: [], cur: null, draft: null, dirty: false, edit: false, tab: 'week', unit: null, day: null, set: P.cleanSettings({}), seeded: false, viewV: null, msg: '', err: false, busy: false, loaded: false, tday: null, gym: [], adj: false, tmsg: '', whoop: {}, hist: {}, whoopOk: false };
const WORKER = 'https://life-board-whoop.momo-haskamp.workers.dev';   // derselbe Worker wie im Training (nur lesen: /data)
const todayKey = () => (window.TrainingCore ? window.TrainingCore.local(Date.now()).key : new Date().toISOString().slice(0, 10));
const fmtD = k => k ? k.slice(8, 10) + '.' + k.slice(5, 7) + '.' + k.slice(0, 4) : '';
const kindName = id => (P.KINDS.find(k => k.id === id) || {}).name || '';
const prioName = id => (P.PRIO.find(p => p.id === id) || {}).name || '';
const errText = e => (e && (e.code === 'permission-denied' || /permission|insufficient/i.test(e.message || ''))) ?
  'Firestore lässt den Zugriff auf „plan“ nicht zu. In der Firebase-Konsole → Firestore → Regeln prüfen, ob unter users/{uid} alle Sammlungen erlaubt sind, z. B. match /users/{uid}/{document=**} { allow read, write: if request.auth != null && request.auth.uid == uid; }' :
  ((e && (e.code || e.message)) || 'unbekannter Fehler');
const plan = () => S.edit ? S.draft : S.cur;

/* ---------- Laden / Speichern ---------- */
async function load() {
  const u = await requireUser(); S.base = 'users/' + u.uid;
  try {
    const q = await fs.collection(S.base + '/plan').get();
    const vs = []; q.docs.forEach(d => { const x = d.data() || {}; if (/^v_\d{4}-\d{2}-\d{2}$/.test(d.id)) vs.push(Object.assign(P.clean(x), { from: d.id.slice(2), at: x.at || 0 })); else if (d.id === 'settings') S.set = P.cleanSettings(x); else if (/^t_\d{4}-\d{2}-\d{2}$/.test(d.id)) { S.hist[d.id.slice(2)] = x; if (d.id === 't_' + todayKey()) S.tday = P.cleanDay(x) } });
    S.versions = P.sortVersions(vs);
    S.cur = P.versionAt(S.versions, todayKey()) || S.versions[S.versions.length - 1] || null;
    if (!S.cur) {   // noch kein Plan: Startplan vorschlagen (nicht gespeichert, bis du ihn übernimmst)
      let wo = []; try { const s = await fs.doc(S.base + '/training/settings').get(); wo = (s.exists && (s.data() || {}).workouts) || [] } catch (e) {}
      S.cur = P.seed(wo); S.seeded = true;
    }
  } catch (e) { S.msg = 'Plan konnte nicht geladen werden: ' + errText(e); S.err = true; S.cur = P.seed([]); S.seeded = true }
  await loadGym();
  S.loaded = true; draw(); autoLink();
  await loadWhoop(u); draw(); window.__planReady = true;
}
/* Whoop der letzten 30 Tage aus dem Gerätespeicher (whoop-cache.js), frische Tage vom Worker – nur lesen */
async function loadWhoop(u) {
  if (!window.LBWhoop) return; const to = todayKey(), from = P.addDays(to, -30);
  const get = async (f, t) => { const tok = await u.getIdToken(), r = await fetch(WORKER + '/data?from=' + f + '&to=' + t, { headers: { Authorization: 'Bearer ' + tok } }); if (!r.ok) throw new Error('Whoop ' + r.status); return r.json() };
  try { S.whoop = await LBWhoop.load({ uid: u.uid, from, to, fetch: get }) || {}; S.whoopOk = true } catch (e) { S.whoop = {}; S.whoopOk = false }
}
/* Gym-Einheiten von heute (training/gym_JJJJ) – nur lesen, nie schreiben */
async function loadGym() {
  const k = todayKey();
  try { const g = await fs.doc(S.base + '/training/gym_' + k.slice(0, 4)).get(); S.gym = ((g.exists && (g.data() || {}).list) || []).filter(o => o && o.d === k).map(o => ({ id: o.i, date: o.d, plan: o.p || '', skip: Array.isArray(o.k) ? o.k : [], ex: (o.e || []).map(e => ({ n: e.n, s: e.s || [] })) })) } catch (e) { S.gym = [] }
}
/* Neuer Gym-Eintrag passt zu einer geplanten Einheit: Verknüpfung im Tagesdokument festhalten (nur plan/, der Gym-Eintrag bleibt unberührt) */
function autoLink() {
  if (S.seeded || !S.gym.length) return; const v = view(), known = new Set((S.tday && S.tday.gym) || []);
  if (v.slots.some(s => s.unit && s.gym && s.gym.some(g => !known.has(g.id)))) saveDay(true);
}
let gymT = 0;
function watchGym() {   // nach dem Speichern im Gym-Logbuch (gleiche Seite) und beim Zurückkehren in die App neu lesen
  const again = () => { clearTimeout(gymT); gymT = setTimeout(async () => { if (!S.loaded) return; const n = JSON.stringify(S.gym); await loadGym(); if (JSON.stringify(S.gym) !== n) { if (!S.edit) draw(); autoLink() } }, 1200) };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) again() });
  const tryObs = () => { const m = $('mcontent'); if (!m) return setTimeout(tryObs, 1000); new MutationObserver(again).observe(m, { childList: true }) };
  tryObs();
}
const view = () => P.todayView(S.cur, todayKey(), S.tday, S.gym);
let dayT = 0;
function saveDay(now) {
  clearTimeout(dayT); S.tmsg = 'speichert …'; tsay();
  dayT = setTimeout(async () => {
    const k = todayKey(), doc = P.dayDoc(view(), S.cur.from || null);
    try { await fs.doc(S.base + '/plan/t_' + k).set(JSON.parse(JSON.stringify(doc))); S.tday = P.cleanDay(doc); S.tmsg = 'für heute gespeichert ✓' }
    catch (e) { S.tmsg = 'Nicht gespeichert: ' + errText(e) }
    tsay();
  }, now ? 0 : 500);
}
function tsay() { const m = $('pnTMsg'); if (m) { m.textContent = S.tmsg; m.className = 'mu pn-tmsg' + (/^Nicht/.test(S.tmsg) ? ' err' : '') } }
async function savePlan() {
  if (S.busy) return; const k = todayKey(), src = S.edit ? S.draft : S.cur;
  const empty = src.units.reduce((n, u) => n + u.ex.filter(e => !String(e.n || '').trim()).length, 0);
  const v = Object.assign(P.clean(src), { from: k, at: Date.now() });
  S.busy = true; say('Speichere …');
  try {
    await fs.doc(S.base + '/plan/v_' + k).set(JSON.parse(JSON.stringify(v)));
    S.versions = P.sortVersions(S.versions.filter(x => x.from !== k).concat([v])); S.cur = v; S.draft = null; S.dirty = false; S.edit = false; S.seeded = false; S.unit = null;
    say('✓ Gespeichert – gilt ab heute (' + P.WD[P.wdOf(k)] + ', ' + fmtD(k) + ')' + (empty ? '. ' + empty + ' Übung(en) ohne Namen wurden weggelassen.' : '.'));
  } catch (e) { say('Nicht gespeichert: ' + errText(e), true) }
  S.busy = false; draw();
}
async function saveSettings() {
  try { await fs.doc(S.base + '/plan/settings').set(JSON.parse(JSON.stringify(S.set))); say('✓ Einstellungen gespeichert.') } catch (e) { say('Einstellungen nicht gespeichert: ' + errText(e), true) }
  draw();
}
function say(t, err) { S.msg = t || ''; S.err = !!err; const m = $('pnMsg'); if (m) { m.textContent = S.msg; m.className = 'msg' + (S.err ? ' err' : '') } }

/* ---------- Anzeige ---------- */
function exLine(e) {
  const bits = [e.sets ? e.sets + ' ' + (e.sets === 1 ? 'Satz' : 'Sätze') : '', e.amt, e.rest ? e.rest + ' s Pause' : ''].filter(Boolean).join(' · ');
  return '<li><span class="pn-n">' + esc(e.n) + '</span><span class="pn-d">' + esc(bits) + (e.note ? ' · <i>' + esc(e.note) + '</i>' : '') + '</span>' + (e.prio !== 'norm' ? '<span class="pn-p ' + e.prio + '">' + esc(prioName(e.prio)) + '</span>' : '') + '</li>';
}
function unitBlock(p, id) {
  if (id === '') return '<div class="pn-unit pn-none">nichts / Pause</div>';
  const u = P.unitById(p, id); if (!u) return '';
  const est = P.estMin(u), meta = [kindName(u.kind), u.min ? u.min + ' min' : '', u.ex.length && est ? '≈ ' + est + ' min laut Übungen' : '', u.hard ? 'hart' : '', u.legs ? 'Beine' : ''].filter(Boolean).join(' · ');
  const hr = u.kind === 'z2' && (S.set.z2lo || S.set.z2hi) ? '<div class="pn-d">Puls ' + (S.set.z2lo || '?') + '–' + (S.set.z2hi || '?') + ' bpm</div>' : '';
  return '<div class="pn-unit"><b>' + esc(u.name) + '</b> <span class="mu pn-meta">' + esc(meta) + '</span>' + hr + (u.ex.length ? '<ul class="pn-ex">' + u.ex.map(exLine).join('') + '</ul>' : '<div class="mu pn-d">Noch keine Übungen eingetragen.</div>') + '</div>';
}
function dayDetail(p, wd) {
  const d = p.week[wd];
  if (!d.slots.length) return '<div class="mu">Kein Training geplant.</div>';
  return d.slots.map(s => '<div class="pn-slot">' + s.alts.map(a => unitBlock(p, a)).join('<div class="pn-or">oder</div>') + '</div>').join('');
}
function shortDay(p, wd) {
  const d = p.week[wd]; if (!d.slots.length) return 'Pause';
  const s = d.slots[0], u = s.alts[0] === '' ? null : P.unitById(p, s.alts[0]);
  return (u ? u.name.split(/[ (]/)[0] : 'Pause') + (d.slots.length > 1 || s.alts.length > 1 ? ' +' : '');
}
/* Heute: gewählte Alternative, Anpassungen nur für heute, erledigt, Grund */
function sugBox(v) {
  const r = P.suggest({ plan: S.cur, view: v, days: S.whoop, set: S.set, hist: S.hist }), F = r.facts;
  const vals = [F.rec != null ? 'Recovery ' + Math.round(F.rec) + ' %' + (r.zone ? ' (' + r.zone + ')' : '') : '', F.perf != null ? 'Schlaf ' + Math.round(F.perf) + ' %' : '', F.bed != null ? 'eingeschlafen ' + P.clockOf(F.bed) : '', F.strainY != null ? 'Strain gestern ' + String(Math.round(F.strainY * 10) / 10).replace('.', ',') : ''].filter(Boolean);
  let h = '<div class="mu pn-facts">' + (vals.length ? esc(vals.join(' · ')) : S.whoopOk ? 'Whoop-Werte von heute fehlen noch – Vorschläge, die Recovery oder Schlaf brauchen, warten darauf.' : 'Keine Whoop-Daten – nur „heute kurz“ und Hinweise aus deinem Plan.') + '</div>';
  r.open.forEach(x => {
    h += '<div class="pn-sug" data-sug="' + x.id + '"><b>' + esc(x.title) + '</b><div class="pn-why">Grund: ' + esc(x.why.join(' · ')) + '</div>' +
      (x.ops.length ? '<div class="pn-d">Vorschlag: ' + esc(x.ops.map(o => o.text).join(' · ')) + '</div>' : '') +
      '<div class="btns"><button type="button" class="primary" data-a="sugok" data-r="' + x.id + '">Übernehmen</button><button type="button" data-a="sugno" data-r="' + x.id + '">Ignorieren</button></div></div>';
  });
  r.decided.forEach(x => { h += '<div class="mu pn-sugd">' + (x.d === 'ok' ? '✓ übernommen: ' : '✕ ignoriert: ') + esc(x.title) + ' <button type="button" class="txt" data-a="sugundo" data-r="' + x.id + '">Entscheidung zurücknehmen</button></div>' });
  return h;
}
function todayBox(tw) {
  const v = view(), A = S.adj && !S.seeded;
  const any = !S.seeded && v.slots.some(s => s.unit);
  let h = '<div class="pn-tbox"><div class="pn-top"><b class="pn-th">Heute · ' + P.WD_LONG[tw] + '</b>' + (any ? '<span class="pn-row" style="margin:0"><button type="button" class="chip' + (v.day.short ? ' on' : '') + '" data-a="short" aria-pressed="' + !!v.day.short + '">⏱ heute kurz</button><button type="button" data-a="adj" aria-pressed="' + A + '">' + (A ? '✓ Fertig' : '✎ Heute anpassen') + '</button></span>' : '') + '</div>';
  if (any) h += sugBox(v);
  if (!v.slots.length) return h + '<div class="mu">Heute ist kein Training geplant.</div></div>';
  if (S.seeded) return h + '<div><b>' + esc(P.dayText(S.cur, tw)) + '</b></div><div class="mu pn-d">Anpassen und Abhaken geht, sobald der Plan übernommen ist.</div></div>';
  v.slots.forEach(s => {
    h += '<div class="pn-slot">';
    if (s.alts.length > 1) h += '<div class="chips pn-pick" role="group" aria-label="Alternative wählen">' + s.alts.map(a => '<button type="button" class="chip' + (a === s.pick ? ' on' : '') + '" aria-pressed="' + (a === s.pick) + '" data-a="pick" data-k="' + esc(s.key) + '" data-u="' + esc(a) + '">' + esc(a === '' ? 'nichts' : (P.unitById(S.cur, a) || {}).name || '?') + '</button>').join('') + '</div>';
    if (!s.unit) { h += '<div class="mu pn-none">' + (s.alts.length > 1 ? 'heute nichts' : '') + '</div></div>'; return }
    const u = s.unit;
    h += '<div class="pn-urow"><div><b' + (s.skip ? ' class="pn-strike"' : '') + '>' + esc(u.name) + '</b> <span class="mu pn-meta">' + esc([u.min ? u.min + ' min' : '', u.ex.length ? s.ex.filter(x => !x.skip && x.sets > 0).length + '/' + u.ex.length + ' Übungen' : ''].filter(Boolean).join(' · ')) + '</span>' +
      (s.gym.length ? '<div class="pn-d">🔗 Gym-Eintrag: ' + esc(s.gym.map(g => (g.plan || 'Gym') + ' · ' + g.ex.reduce((n, e) => n + e.s.length, 0) + ' Sätze').join(', ')) + '</div>' : '') + '</div>' +
      (s.skip ? '<button type="button" data-a="uskip" data-u="' + esc(u.id) + '">Doch machen</button>' : '<button type="button" class="pn-done' + (s.done ? ' on' : '') + '" data-a="udone" data-u="' + esc(u.id) + '" aria-pressed="' + s.done + '"' + (s.gym.length ? ' disabled title="aus dem Gym-Log"' : '') + '>' + (s.done ? '✓ erledigt' : 'erledigt?') + '</button>') + '</div>';
    if (!s.skip && s.ex.length) h += '<ul class="pn-ex pn-tex">' + s.ex.map(x => {
      const ch = x.sets !== x.e.sets;
      return '<li class="' + (x.skip ? 'pn-off' : '') + '"><span class="pn-n">' + esc(x.e.n) + '</span><span class="pn-d">' + (x.skip ? 'heute weggelassen' : (ch ? '<s>' + x.e.sets + '</s> ' : '') + x.sets + ' ' + (x.sets === 1 ? 'Satz' : 'Sätze') + (x.e.amt ? ' · ' + esc(x.e.amt) : '') + (x.gym != null ? ' · Gym: ' + x.gym : '')) + '</span>' +
        (A ? '<span class="pn-tact">' + (x.skip ? '' : '<button type="button" data-a="tsets" data-u="' + esc(u.id) + '" data-e="' + esc(x.e.id) + '" data-d="-1" aria-label="ein Satz weniger">−</button><button type="button" data-a="tsets" data-u="' + esc(u.id) + '" data-e="' + esc(x.e.id) + '" data-d="1" aria-label="ein Satz mehr">+</button>') + '<button type="button" data-a="exskip" data-u="' + esc(u.id) + '" data-e="' + esc(x.e.id) + '">' + (x.skip ? 'doch machen' : 'weglassen') + '</button></span>' : (x.e.prio !== 'norm' ? '<span class="pn-p ' + x.e.prio + '">' + esc(prioName(x.e.prio)) + '</span>' : '')) + '</li>';
    }).join('') + '</ul>';
    if (A && !s.skip) h += '<div class="pn-row"><button type="button" data-a="uskip" data-u="' + esc(u.id) + '">' + esc(u.name) + ' heute weglassen</button></div>';
    h += '</div>';
  });
  if (v.devs.length) {
    h += '<div class="pn-dev"><b>Abweichung heute:</b> ' + esc(v.devs.map(d => d.text).join(' · ')) + '</div>';
    h += '<div class="pn-row"><span class="mu" style="font-size:13px">Grund (optional):</span>' + P.REASONS.map(r => '<button type="button" class="chip' + (v.reason === r.id ? ' on' : '') + '" aria-pressed="' + (v.reason === r.id) + '" data-a="reason" data-r="' + r.id + '">' + r.name + '</button>').join('') + '</div>';
  }
  if (A && S.tday && (Object.keys(S.tday.units).length || Object.keys(S.tday.pick).length)) h += '<div class="pn-row"><button type="button" class="txt" data-a="treset">Heute zurück auf den Plan</button></div>';
  return h + '<div class="mu pn-tmsg" id="pnTMsg" aria-live="polite">' + esc(S.tmsg) + '</div></div>';
}
function overview() {
  const p = S.cur, k = todayKey(), tw = P.wdOf(k), sel = S.day == null ? -1 : S.day;
  let h = '<div class="pn-top"><h2 style="margin:0">📋 Trainingsplan</h2><button type="button" data-a="edit">✎ Bearbeiten</button></div>';
  if (S.seeded) h += '<div class="pn-info">Das ist dein Startplan aus deinen Angaben. Noch nicht gespeichert. Prüf ihn kurz und übernimm ihn, dann gilt er ab heute.<div class="btns"><button type="button" class="primary" data-a="adopt">Startplan übernehmen</button><button type="button" data-a="edit">Erst anpassen</button></div></div>';
  h += todayBox(tw);
  h += '<div class="pn-week" role="group" aria-label="Wochentage">' + P.WD.map((w, i) => '<button type="button" data-a="day" data-d="' + i + '" aria-pressed="' + (i === sel) + '"' + (i === tw ? ' class="today"' : '') + '><b>' + w + '</b><small>' + esc(shortDay(p, i)) + '</small></button>').join('') + '</div>';
  if (S.day != null) h += '<div class="pn-dayh">' + P.WD_LONG[sel] + (sel === tw ? ' (heute, laut Vorlage)' : '') + ': ' + esc(P.dayText(p, sel)) + '</div>' + dayDetail(p, sel);
  else h += '<div class="mu pn-foot">Tag antippen zeigt die Vorlage für diesen Tag.</div>';
  if (!S.seeded && S.cur.from) h += '<div class="mu pn-foot">Plan gilt seit ' + fmtD(S.cur.from) + ' · ' + S.versions.length + ' ' + (S.versions.length === 1 ? 'Version' : 'Versionen') + '</div>';
  return h;
}

/* ---------- Bearbeiten ---------- */
const sel = (attrs, opts, ph) => '<select ' + attrs + '><option value="__">' + esc(ph) + '</option>' + opts + '</select>';
const unitOpts = (p, withNone) => p.units.map(u => '<option value="' + esc(u.id) + '">' + esc(u.name) + '</option>').join('') + (withNone ? '<option value="">nichts (Pause)</option>' : '');
function weekEditor(p) {
  return '<div class="sub">Pro Tag ein oder mehrere Blöcke. Ein Block mit mehreren Einträgen heißt „A oder B“. „nichts“ macht einen Block optional.</div>' + P.WD_LONG.map((w, d) => {
    const day = p.week[d];
    return '<div class="pn-eday"><b>' + w + '</b>' + day.slots.map((s, si) =>
      '<div class="pn-eslot"><div class="chips">' + s.alts.map((a, ai) => (ai ? '<span class="mu pn-or2">oder</span>' : '') + '<span class="chip a">' + esc(a === '' ? 'nichts' : (P.unitById(p, a) || {}).name || '?') + '<button type="button" class="pn-x" data-a="altdel" data-d="' + d + '" data-s="' + si + '" data-i="' + ai + '" aria-label="entfernen">✕</button></span>').join('') + '</div>' +
      '<div class="pn-row">' + (s.alts.length < P.LIM.alts ? sel('data-a="altadd" data-d="' + d + '" data-s="' + si + '" aria-label="Alternative hinzufügen"', unitOpts(p, true), '+ oder …') : '') + (si ? '<button type="button" data-a="slotup" data-d="' + d + '" data-s="' + si + '" aria-label="Block nach oben">↑</button>' : '') + '<button type="button" data-a="slotdel" data-d="' + d + '" data-s="' + si + '">Block löschen</button></div></div>').join('') +
      (day.slots.length < P.LIM.slots ? '<div class="pn-row">' + sel('data-a="slotadd" data-d="' + d + '" aria-label="Einheit hinzufügen"', unitOpts(p, false), day.slots.length ? '+ dazu (und …)' : '+ Einheit') + '</div>' : '') + '</div>';
  }).join('');
}
function unitList(p) {
  return '<div class="sub">Tippe eine Einheit an, um Übungen, Sätze und Prioritäten zu ändern.</div><div class="pn-ulist">' + p.units.map(u => {
    const est = P.estMin(u);
    return '<button type="button" data-a="uopen" data-u="' + esc(u.id) + '"><b>' + esc(u.name) + '</b><small>' + esc([kindName(u.kind), u.ex.length + ' Übungen', u.ex.length && est ? '≈ ' + est + ' min' : (u.min ? u.min + ' min' : '')].filter(Boolean).join(' · ')) + '</small></button>';
  }).join('') + '</div><div class="btns"><button type="button" data-a="unew">+ Neue Einheit</button></div>';
}
function unitEditor(p, u) {
  const est = P.estMin(u), over = est > S.set.budget;
  let h = '<button type="button" class="txt" data-a="uback">← alle Einheiten</button>';
  h += '<div class="pn-row2"><div><label for="pnUName">Name</label><input id="pnUName" type="text" maxlength="40" data-uf="name" value="' + esc(u.name) + '"></div>' +
    '<div><label for="pnUKind">Art</label><select id="pnUKind" data-uf="kind">' + P.KINDS.map(k => '<option value="' + k.id + '"' + (k.id === u.kind ? ' selected' : '') + '>' + esc(k.name) + '</option>').join('') + '</select></div>' +
    '<div><label for="pnUMin">Minuten (geplant)</label><input id="pnUMin" type="number" inputmode="numeric" min="0" max="600" data-uf="min" value="' + (u.min == null ? '' : u.min) + '"></div></div>';
  h += '<div class="pn-row" style="margin-top:10px"><button type="button" class="chip' + (u.hard ? ' on' : '') + '" data-a="utog" data-k="hard" aria-pressed="' + u.hard + '">harte Einheit</button><button type="button" class="chip' + (u.legs ? ' on' : '') + '" data-a="utog" data-k="legs" aria-pressed="' + u.legs + '">belastet die Beine</button></div>';
  h += '<div class="mu pn-est" id="pnEst">' + (u.ex.length ? '≈ ' + est + ' min laut Übungen' + (over ? ' · über deinem Zeitbudget von ' + S.set.budget + ' min' : '') : '') + '</div>';
  h += u.ex.map((e, i) => '<div class="pn-ed" data-i="' + i + '">' +
    '<div class="pn-row"><input type="text" maxlength="60" data-ef="n" data-i="' + i + '" value="' + esc(e.n) + '" placeholder="Name der Übung" aria-label="Name der Übung" class="pn-grow">' +
    '<button type="button" data-a="exmv" data-i="' + i + '" data-d="-1" aria-label="nach oben"' + (i ? '' : ' disabled') + '>↑</button><button type="button" data-a="exmv" data-i="' + i + '" data-d="1" aria-label="nach unten"' + (i < u.ex.length - 1 ? '' : ' disabled') + '>↓</button><button type="button" data-a="exdel" data-i="' + i + '" aria-label="Übung löschen">✕</button></div>' +
    '<div class="pn-row2"><div><label>Sätze</label><div class="pn-step"><button type="button" data-a="sets" data-i="' + i + '" data-d="-1" aria-label="weniger Sätze">−</button><b>' + e.sets + '</b><button type="button" data-a="sets" data-i="' + i + '" data-d="1" aria-label="mehr Sätze">+</button></div></div>' +
    '<div><label>Wdh. oder Dauer</label><input type="text" maxlength="40" data-ef="amt" data-i="' + i + '" value="' + esc(e.amt) + '" placeholder="z. B. 8 Wdh. / 30 s"></div>' +
    '<div><label>Pause (s)</label><input type="number" inputmode="numeric" min="0" max="900" data-ef="rest" data-i="' + i + '" value="' + (e.rest == null ? '' : e.rest) + '"></div></div>' +
    '<label>Notiz</label><input type="text" maxlength="160" data-ef="note" data-i="' + i + '" value="' + esc(e.note) + '">' +
    '<label>Priorität</label><div class="seg pn-prio" role="group" aria-label="Priorität">' + P.PRIO.map(pr => '<button type="button" data-a="prio" data-i="' + i + '" data-p="' + pr.id + '" aria-pressed="' + (e.prio === pr.id) + '" title="' + esc(pr.hint) + '">' + esc(pr.name) + '</button>').join('') + '</div></div>').join('');
  h += '<div class="btns"><button type="button" data-a="exadd">+ Übung</button><button type="button" class="txt" data-a="udel" style="margin-left:auto">Einheit löschen</button></div>';
  return h;
}
function settingsEditor() {
  const s = S.set;
  return '<div class="pn-row2"><div><label for="pnBudget">Zeitbudget pro Einheit (min)</label><input id="pnBudget" type="number" inputmode="numeric" min="15" max="240" data-sf="budget" value="' + s.budget + '"></div>' +
    '<div><label for="pnZ2lo">Zone-2-Puls von</label><input id="pnZ2lo" type="number" inputmode="numeric" min="60" max="220" data-sf="z2lo" value="' + (s.z2lo || '') + '" placeholder="bpm"></div>' +
    '<div><label for="pnZ2hi">bis</label><input id="pnZ2hi" type="number" inputmode="numeric" min="60" max="220" data-sf="z2hi" value="' + (s.z2hi || '') + '" placeholder="bpm"></div></div>' +
    rulesEditor() +
    '<div class="btns"><button type="button" data-a="setsave">Einstellungen speichern</button></div><div class="sub" style="margin-top:8px">Einstellungen gelten sofort und sind keine Planversion.</div>';
}
function rulesEditor() {
  const R = S.set.rules, inp = (id, k, lab, step) => '<div><label>' + esc(lab) + '</label><input type="text" inputmode="decimal" maxlength="5" data-rf="' + id + '.' + k + '" value="' + String(R[id][k]).replace('.', ',') + '"></div>';
  const tog = (id, k, lab) => '<button type="button" class="chip' + (R[id][k] ? ' on' : '') + '" data-a="rtog" data-r="' + id + '" data-k="' + k + '" aria-pressed="' + R[id][k] + '">' + esc(lab) + '</button>';
  const row = (id, extra) => { const r = P.RULES.find(x => x.id === id); return '<div class="pn-rule"><div class="pn-row">' + tog(id, 'on', R[id].on ? 'an' : 'aus') + '<b>' + id + ') ' + esc(r.name) + '</b></div>' + (extra ? '<div class="pn-row2">' + extra + '</div>' : '') + '</div>' };
  return '<h3 class="pn-h3">Vorschläge</h3><div class="sub">Nur Empfehlungen – du entscheidest mit Übernehmen oder Ignorieren. Kern-Übungen werden nie zum Streichen vorgeschlagen, ganze Einheiten nie gestrichen.</div>' +
    row('a', inp('a', 'red', 'Rot bis Recovery %') + inp('a', 'yellowMax', 'Gelb bis Recovery %') + '<div><label>Auch bei Gelb</label>' + tog('a', 'yellow', R.a.yellow ? 'ja' : 'nein') + '</div>') +
    row('b', inp('b', 'perf', 'Schlafleistung unter %') + inp('b', 'late', 'Einschlafen später als sonst um min')) +
    row('c', inp('c', 'strain', 'Strain gestern ab', 0.5)) +
    row('d', inp('d', 'n', 'Anzahl Tage') + inp('d', 'hard', 'Harter Tag ab Strain', 0.5)) +
    row('e', inp('e', 'target', 'Zielzeit heute (min)')) +
    row('f', inp('f', 'keep', 'Kürzen auf % der Dauer'));
}
function versionsList() {
  if (!S.versions.length) return '<div class="mu">Noch keine gespeicherte Version.</div>';
  return '<div class="sub">Jede gespeicherte Änderung wird zu einer Version, die ab ihrem Datum gilt. Mehrere Änderungen am selben Tag ergeben eine Version.</div>' + S.versions.map((v, i) => {
    const prev = S.versions[i + 1] || null, open = S.viewV === v.from;
    return '<div class="pn-ver"><div class="pn-row"><b>ab ' + fmtD(v.from) + '</b>' + (v === S.cur ? ' <span class="chip a">gilt heute</span>' : '') + '<button type="button" class="txt" data-a="vview" data-v="' + v.from + '" style="margin-left:auto">' + (open ? 'zuklappen' : 'ansehen') + '</button></div>' +
      '<div class="mu pn-d">' + esc(P.diff(prev, v).join(' · ')) + '</div>' +
      (open ? '<ul class="pn-ex">' + P.WD.map((w, d) => '<li><span class="pn-n">' + w + '</span><span class="pn-d">' + esc(P.dayText(v, d)) + '</span></li>').join('') + '</ul><div class="btns"><button type="button" data-a="vload" data-v="' + v.from + '">Als Grundlage für den Entwurf nehmen</button></div>' : '') + '</div>';
  }).join('');
}
function editor() {
  const p = S.draft, u = S.unit && P.unitById(p, S.unit);
  let h = '<div class="pn-top"><h2 style="margin:0">📋 Plan bearbeiten</h2></div>';
  h += '<div class="seg pn-tabs" role="group" aria-label="Bereich">' + [['week', 'Woche'], ['units', 'Einheiten'], ['set', 'Einstellungen'], ['ver', 'Versionen']].map(t => '<button type="button" data-a="tab" data-t="' + t[0] + '" aria-pressed="' + (S.tab === t[0]) + '">' + t[1] + '</button>').join('') + '</div>';
  h += '<div class="fm pn-body">' + (S.tab === 'week' ? weekEditor(p) : S.tab === 'units' ? (u ? unitEditor(p, u) : unitList(p)) : S.tab === 'set' ? settingsEditor() : versionsList()) + '</div>';
  h += '<div class="pn-bar"><span class="mu" id="pnDirty">' + (S.dirty ? 'Ungespeicherte Änderungen' : 'Keine Änderungen') + '</span><button type="button" data-a="cancel">' + (S.dirty ? 'Verwerfen' : 'Fertig') + '</button><button type="button" class="primary" data-a="save"' + (S.dirty || S.seeded ? '' : ' disabled') + '>Speichern – gilt ab heute</button></div>';
  return h;
}
function draw() {
  const host = $('planCard'); if (!host) return;
  if (!S.loaded) { host.innerHTML = '<h2>📋 Trainingsplan</h2><div class="mu">Lade Plan …</div>'; return }
  const y = window.scrollY;
  host.innerHTML = (S.edit ? editor() : overview()) + '<div class="msg' + (S.err ? ' err' : '') + '" id="pnMsg" aria-live="polite">' + esc(S.msg) + '</div>';
  if (Math.abs(window.scrollY - y) > 2) window.scrollTo(0, y);
}
function markDirty() { S.dirty = true; const d = $('pnDirty'); if (d) d.textContent = 'Ungespeicherte Änderungen'; const b = document.querySelector('#planCard [data-a=save]'); if (b) b.disabled = false; const c = document.querySelector('#planCard [data-a=cancel]'); if (c) c.textContent = 'Verwerfen' }
function updEst() { const u = S.unit && P.unitById(S.draft, S.unit), el = $('pnEst'); if (!u || !el) return; const v = P.cleanUnit(u), est = P.estMin(v); el.textContent = v.ex.length ? '≈ ' + est + ' min laut Übungen' + (est > S.set.budget ? ' · über deinem Zeitbudget von ' + S.set.budget + ' min' : '') : '' }

/* ---------- Bedienung ---------- */
function act(a, b) {
  const p = S.draft, d = +b.dataset.d, si = +b.dataset.s, i = +b.dataset.i, u = S.unit && p && P.unitById(p, S.unit);
  switch (a) {
    case 'day': S.day = S.day === d ? null : d; break;
    case 'adj': S.adj = !S.adj; break;
    case 'short': case 'sugok': case 'sugno': case 'sugundo': {
      let t = S.tday = P.cleanDay(S.tday || {}), id = b.dataset.r;
      if (a === 'short') t.short = !t.short;
      else if (a === 'sugundo') { if (!confirm('Entscheidung zurücknehmen? Schon übernommene Änderungen bleiben – die kannst du unter „Heute anpassen“ ändern.')) return; delete t.sug[id] }
      else {
        const x = P.suggest({ plan: S.cur, view: view(), days: S.whoop, set: S.set, hist: S.hist }).open.find(y => y.id === id); if (!x) return;
        if (a === 'sugok') t = P.applyOps(t, x.ops);
        t.sug[id] = { d: a === 'sugok' ? 'ok' : 'no', at: Date.now(), title: x.title, why: x.why, ops: x.ops.map(o => o.text) };
      }
      S.tday = P.cleanDay(t); saveDay(); break }
    case 'rtog': { const R = S.set.rules[b.dataset.r]; R[b.dataset.k] = !R[b.dataset.k]; break }
    case 'pick': case 'udone': case 'uskip': case 'exskip': case 'tsets': case 'reason': case 'treset': {
      const t = S.tday = S.tday || P.cleanDay({}), uid = b.dataset.u, ue = () => (t.units[uid] = t.units[uid] || {}), ee = () => { const x = ue(); x.ex = x.ex || {}; return (x.ex[b.dataset.e] = x.ex[b.dataset.e] || {}) };
      if (a === 'pick') t.pick[b.dataset.k] = uid;
      else if (a === 'udone') ue().done = !ue().done;
      else if (a === 'uskip') { ue().skip = !ue().skip; if (ue().skip) ue().done = false }
      else if (a === 'exskip') { const x = ee(); x.skip = !x.skip }
      else if (a === 'tsets') { const ex = (P.unitById(S.cur, uid) || { ex: [] }).ex.find(e => e.id === b.dataset.e); if (!ex) return; const x = ee(), cur = x.sets == null ? ex.sets : x.sets; x.sets = Math.max(0, Math.min(20, cur + d)); if (x.sets === ex.sets) delete x.sets }
      else if (a === 'reason') t.reason = t.reason === b.dataset.r ? '' : b.dataset.r;
      else if (a === 'treset') { if (!confirm('Alle Anpassungen von heute verwerfen? Erledigt-Haken bleiben.')) return; Object.keys(t.units).forEach(k => { t.units[k] = t.units[k].done ? { done: true } : {} }); t.pick = {}; t.reason = ''; t.short = false }
      S.tday = P.cleanDay(t); saveDay(); break }
    case 'edit': S.edit = true; S.draft = P.copy(S.cur); S.dirty = false; S.tab = 'week'; S.unit = null; say(''); break;
    case 'adopt': savePlan(); return;
    case 'save': savePlan(); return;
    case 'cancel': if (S.dirty && !confirm('Änderungen verwerfen?')) return; S.edit = false; S.draft = null; S.dirty = false; S.unit = null; say(''); break;
    case 'tab': S.tab = b.dataset.t; S.unit = null; break;
    case 'altdel': p.week[d].slots[si].alts.splice(i, 1); if (!p.week[d].slots[si].alts.length) p.week[d].slots.splice(si, 1); S.dirty = true; break;
    case 'slotdel': p.week[d].slots.splice(si, 1); S.dirty = true; break;
    case 'slotup': { const s = p.week[d].slots; [s[si - 1], s[si]] = [s[si], s[si - 1]]; S.dirty = true; break }
    case 'uopen': S.unit = b.dataset.u; break;
    case 'uback': S.unit = null; break;
    case 'unew': { const id = P.uid('u'); p.units.push({ id, name: 'Neue Einheit', kind: 'kraft', hard: false, legs: false, min: null, ex: [] }); S.unit = id; S.dirty = true; break }
    case 'udel': if (!u || !confirm('Einheit „' + u.name + '“ löschen? Sie verschwindet auch aus der Woche (ab der nächsten Version).')) return; p.units = p.units.filter(x => x.id !== u.id); p.week.forEach(w => { w.slots.forEach(s => { s.alts = s.alts.filter(x => x !== u.id) }); w.slots = w.slots.filter(s => s.alts.length && !(s.alts.length === 1 && s.alts[0] === '')) }); S.unit = null; S.dirty = true; break;
    case 'utog': u[b.dataset.k] = !u[b.dataset.k]; S.dirty = true; break;
    case 'exadd': u.ex.push({ id: P.uid('e'), n: '', sets: 2, amt: '', rest: 60, note: '', prio: 'norm' }); S.dirty = true; draw(); { const f = document.querySelector('#planCard [data-ef=n][data-i="' + (u.ex.length - 1) + '"]'); if (f) { f.focus(); f.scrollIntoView({ block: 'center' }) } } return;
    case 'exdel': if (!confirm('Übung „' + (u.ex[i].n || 'ohne Namen') + '“ löschen?')) return; u.ex.splice(i, 1); S.dirty = true; break;
    case 'exmv': { const j = i + d; if (j < 0 || j >= u.ex.length) return; [u.ex[i], u.ex[j]] = [u.ex[j], u.ex[i]]; S.dirty = true; break }
    case 'sets': u.ex[i].sets = Math.max(0, Math.min(20, (u.ex[i].sets || 0) + d)); S.dirty = true; break;
    case 'prio': u.ex[i].prio = b.dataset.p; S.dirty = true; break;
    case 'setsave': S.set = P.cleanSettings(S.set); saveSettings(); return;
    case 'vview': S.viewV = S.viewV === b.dataset.v ? null : b.dataset.v; break;
    case 'vload': { const v = S.versions.find(x => x.from === b.dataset.v); if (!v || (S.dirty && !confirm('Dein ungespeicherter Entwurf wird ersetzt. Weiter?'))) return; S.draft = P.copy({ units: v.units, week: v.week }); S.dirty = true; S.tab = 'week'; say('Version vom ' + fmtD(v.from) + ' ist jetzt dein Entwurf. Speichern macht sie ab heute gültig.'); break }
    default: return;
  }
  draw();
}
function bind() {
  const host = $('planCard'); if (!host) return;
  host.addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b || b.disabled || !host.contains(b)) return; act(b.dataset.a, b) });
  host.addEventListener('change', e => {
    const t = e.target, a = t.dataset.a; if (t.tagName !== 'SELECT' || !a || t.value === '__') return;
    const p = S.draft, d = +t.dataset.d, si = +t.dataset.s;
    if (a === 'altadd') { const s = p.week[d].slots[si]; if (!s.alts.includes(t.value)) s.alts.push(t.value); S.dirty = true; draw() }
    else if (a === 'slotadd') { p.week[d].slots.push({ alts: [t.value] }); S.dirty = true; draw() }
  });
  host.addEventListener('input', e => {
    const t = e.target, p = S.draft; if (!p && !t.dataset.sf) return;
    const u = S.unit && p && P.unitById(p, S.unit);
    if (t.dataset.uf && u) { const f = t.dataset.uf; u[f] = f === 'min' ? (t.value === '' ? null : Math.max(0, Math.min(600, Math.round(+t.value) || 0))) : t.value; markDirty(); updEst() }
    else if (t.dataset.ef && u) { const ex = u.ex[+t.dataset.i], f = t.dataset.ef; if (!ex) return; ex[f] = f === 'rest' ? (t.value === '' ? null : Math.max(0, Math.min(900, Math.round(+t.value) || 0))) : t.value; markDirty(); updEst() }
    else if (t.dataset.sf) { S.set[t.dataset.sf] = t.value === '' ? null : +t.value }
    else if (t.dataset.rf) { const [id, k] = t.dataset.rf.split('.'); S.set.rules[id][k] = t.value }
  });
  host.addEventListener('change', e => { const t = e.target; if (t.dataset.rf) S.set.rules = P.cleanRules(S.set.rules); if (t.dataset.sf) S.set = P.cleanSettings(Object.assign({}, S.set, { [t.dataset.sf]: t.value === '' ? null : +t.value })) });
  window.addEventListener('beforeunload', e => { if (S.edit && S.dirty) { e.preventDefault(); e.returnValue = '' } });
}
window.LBPlan = { state: S };
const go = () => { bind(); draw(); load(); watchGym() };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
})();
