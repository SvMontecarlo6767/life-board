/* Life Board – Trainingsplan (oben im Reiter Training). Eigenes Modul: liest training/settings nur (Gym-Workouts für den Startplan),
   schreibt ausschließlich in users/{uid}/plan/ (v_JJJJ-MM-TT = Planversionen, settings = Einstellungen). Rechnen: plan-core.js. */
(function () {
'use strict';
const P = window.PlanCore, $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const S = { base: '', versions: [], cur: null, draft: null, dirty: false, edit: false, tab: 'week', unit: null, day: null, set: P.cleanSettings({}), seeded: false, viewV: null, msg: '', err: false, busy: false, loaded: false };
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
    const vs = []; q.docs.forEach(d => { const x = d.data() || {}; if (/^v_\d{4}-\d{2}-\d{2}$/.test(d.id)) vs.push(Object.assign(P.clean(x), { from: d.id.slice(2), at: x.at || 0 })); else if (d.id === 'settings') S.set = P.cleanSettings(x) });
    S.versions = P.sortVersions(vs);
    S.cur = P.versionAt(S.versions, todayKey()) || S.versions[S.versions.length - 1] || null;
    if (!S.cur) {   // noch kein Plan: Startplan vorschlagen (nicht gespeichert, bis du ihn übernimmst)
      let wo = []; try { const s = await fs.doc(S.base + '/training/settings').get(); wo = (s.exists && (s.data() || {}).workouts) || [] } catch (e) {}
      S.cur = P.seed(wo); S.seeded = true;
    }
  } catch (e) { S.msg = 'Plan konnte nicht geladen werden: ' + errText(e); S.err = true; S.cur = P.seed([]); S.seeded = true }
  S.loaded = true; draw(); window.__planReady = true;
}
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
function overview() {
  const p = S.cur, k = todayKey(), tw = P.wdOf(k), sel = S.day == null ? tw : S.day;
  let h = '<div class="pn-top"><h2 style="margin:0">📋 Trainingsplan</h2><button type="button" data-a="edit">✎ Bearbeiten</button></div>';
  if (S.seeded) h += '<div class="pn-info">Das ist dein Startplan aus deinen Angaben. Noch nicht gespeichert. Prüf ihn kurz und übernimm ihn, dann gilt er ab heute.<div class="btns"><button type="button" class="primary" data-a="adopt">Startplan übernehmen</button><button type="button" data-a="edit">Erst anpassen</button></div></div>';
  h += '<div class="pn-today"><span class="mu">Heute, ' + P.WD_LONG[tw] + ':</span> <b>' + esc(P.dayText(p, tw)) + '</b></div>';
  h += '<div class="pn-week" role="group" aria-label="Wochentage">' + P.WD.map((w, i) => '<button type="button" data-a="day" data-d="' + i + '" aria-pressed="' + (i === sel) + '"' + (i === tw ? ' class="today"' : '') + '><b>' + w + '</b><small>' + esc(shortDay(p, i)) + '</small></button>').join('') + '</div>';
  h += '<div class="pn-dayh">' + P.WD_LONG[sel] + (sel === tw ? ' (heute)' : '') + ': ' + esc(P.dayText(p, sel)) + '</div>' + dayDetail(p, sel);
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
    '<div class="btns"><button type="button" data-a="setsave">Einstellungen speichern</button></div><div class="sub" style="margin-top:8px">Einstellungen gelten sofort und sind keine Planversion.</div>';
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
    case 'day': S.day = d; break;
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
    case 'setsave': saveSettings(); return;
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
  });
  host.addEventListener('change', e => { const t = e.target; if (t.dataset.sf) S.set = P.cleanSettings(Object.assign({}, S.set, { [t.dataset.sf]: t.value === '' ? null : +t.value })) });
  window.addEventListener('beforeunload', e => { if (S.edit && S.dirty) { e.preventDefault(); e.returnValue = '' } });
}
window.LBPlan = { state: S };
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { bind(); draw(); load() }); else { bind(); draw(); load() }
})();
