/* Life Board – Trainingsplan, Rechenkern (ohne Seite, in Node testbar: node tools/test-plan.mjs).
   Eigenes Modul: liest bestehende Daten nur, schreibt ausschließlich in users/{uid}/plan/.
   Plan = { units:[Einheit], week:[7 Tage Mo..So] }.
   Einheit = { id, name, kind, hard, legs, min, ex:[Übung] }
   Übung   = { id, n, sets, amt (Wdh. oder Dauer, Text), rest (Sekunden), note, prio }
   Tag     = { slots:[{ alts:[unitId | ''] }] }  – ein Block mit mehreren Alternativen heißt „A oder B“, '' = nichts/Pause.
   Versionen: Dokument plan/v_JJJJ-MM-DD gilt ab diesem Tag bis zur nächsten Version. Regelbasiert, keine KI. */
(function (root) {
'use strict';
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WD_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const PRIO = [
  { id: 'kern', name: 'Kern', hint: 'wird nie zum Streichen vorgeschlagen' },
  { id: 'norm', name: 'Normal', hint: 'bleibt, solange es geht' },
  { id: 'kurz', name: 'kürzbar', hint: 'Sätze dürfen reduziert werden' },
  { id: 'weg', name: 'zuerst weglassen', hint: 'fällt als Erstes weg' }
];
const KINDS = [
  { id: 'kraft', name: 'Kraft' }, { id: 'iso', name: 'Isometrie' }, { id: 'z2', name: 'Zone 2' }, { id: 'lauf', name: 'Lauf' },
  { id: 'sport', name: 'Mannschaftssport' }, { id: 'mobil', name: 'Haltung / Mobility' }, { id: 'sonst', name: 'Sonstiges' }
];
const PRIO_IDS = PRIO.map(p => p.id), KIND_IDS = KINDS.map(k => k.id);
const LIM = { units: 40, ex: 30, slots: 4, alts: 4 };

const pad = n => String(n).padStart(2, '0');
const isDate = k => /^\d{4}-\d{2}-\d{2}$/.test(String(k || ''));
const wdOf = key => { const [y, m, d] = key.split('-').map(Number); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7 };   // 0 = Montag
const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1, d + n)); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()) };
const txt = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
const int = (v, lo, hi) => { const x = Math.round(parseFloat(String(v == null ? '' : v).replace(',', '.'))); return isFinite(x) ? Math.max(lo, Math.min(hi, x)) : null };
let seq = 0;
const uid = p => p + Date.now().toString(36).slice(-5) + (seq++).toString(36) + Math.random().toString(36).slice(2, 5);
const copy = o => JSON.parse(JSON.stringify(o));

/* ---------- Bereinigen (alles, was gespeichert oder geladen wird, geht hier durch) ---------- */
function cleanEx(e, i) {
  e = e || {};
  return { id: txt(e.id, 24) || 'e' + i, n: txt(e.n, 60), sets: int(e.sets, 0, 20) == null ? 2 : int(e.sets, 0, 20), amt: txt(e.amt, 40), rest: int(e.rest, 0, 900), note: txt(e.note, 160), prio: PRIO_IDS.includes(e.prio) ? e.prio : 'norm' };
}
function cleanUnit(u, i) {
  u = u || {};
  const ex = (Array.isArray(u.ex) ? u.ex : []).slice(0, LIM.ex).map(cleanEx).filter(e => e.n);
  const ids = new Set(); ex.forEach((e, j) => { if (ids.has(e.id)) e.id = e.id + '_' + j; ids.add(e.id) });
  return { id: txt(u.id, 24) || 'u' + i, name: txt(u.name, 40) || 'Einheit', kind: KIND_IDS.includes(u.kind) ? u.kind : 'sonst', hard: !!u.hard, legs: !!u.legs, min: int(u.min, 0, 600), ex };
}
function clean(p) {
  p = p || {};
  const units = (Array.isArray(p.units) ? p.units : []).slice(0, LIM.units).map(cleanUnit);
  const seen = new Set(); units.forEach((u, i) => { if (seen.has(u.id)) u.id = u.id + '_' + i; seen.add(u.id) });
  const known = new Set(units.map(u => u.id));
  const week = [];
  for (let d = 0; d < 7; d++) {
    const day = (Array.isArray(p.week) && p.week[d]) || {};
    const slots = (Array.isArray(day.slots) ? day.slots : []).slice(0, LIM.slots).map(s => {
      const alts = [...new Set((s && Array.isArray(s.alts) ? s.alts : []).map(a => a === '' ? '' : txt(a, 24)).filter(a => a === '' || known.has(a)))].slice(0, LIM.alts);
      return { alts };
    }).filter(s => s.alts.length && !(s.alts.length === 1 && s.alts[0] === ''));
    week.push({ slots });
  }
  return { units, week };
}
function cleanSettings(s) {
  s = s || {};
  return { budget: int(s.budget, 15, 240) || 60, z2lo: int(s.z2lo, 60, 220), z2hi: int(s.z2hi, 60, 220) };
}

/* ---------- Startplan aus deinen Angaben (alles editierbar) ---------- */
/* workouts: optionale gespeicherte Gym-Workouts (training/settings.workouts) – nur gelesen, um Push/Pull mit deinen Übungen vorzubelegen */
function seed(workouts) {
  const E = (n, sets, amt, rest, prio, note) => ({ n, sets, amt: amt || '', rest: rest == null ? null : rest, prio: prio || 'norm', note: note || '' });
  const fromGym = (name, fallback, rules) => {
    const w = (Array.isArray(workouts) ? workouts : []).find(x => x && String(x.name || '').trim().toLowerCase() === name.toLowerCase());
    const list = w && Array.isArray(w.ex) && w.ex.length ? w.ex.map(n => E(String(n), 2, '', null, 'norm')) : fallback;
    return list.map(e => { for (const [re, prio, note] of rules) if (re.test(e.n.toLowerCase())) return Object.assign({}, e, { prio, note: e.note || note || '' }); return e });
  };
  const units = [
    { id: 'beine', name: 'Beine', kind: 'kraft', hard: true, legs: true, min: 60, ex: [
      E('Mobilisieren und Aufwärmen', 1, 'mind. 5 min', 0, 'kern'),
      E('Pogo Jumps', 2, '30–90 s', 90, 'norm'),
      E('Box Jumps', 2, '4 Wdh.', 120, 'norm'),
      E('Split Squat Jumps', 2, '6 pro Bein', 90, 'weg'),
      E('Bulgarian Split Squats', 2, '', 90, 'norm', 'Supersatz links/rechts'),
      E('Nordic Curls', 2, '4–5 Wdh.', 100, 'norm', 'so langsam wie möglich'),
      E('Reverse Nordics', 2, '', 90, 'norm'),
      E('Wadenheben', 2, 'pro Bein', 60, 'kurz', '2–3 Sätze pro Bein')
    ] },
    { id: 'iso', name: 'Isometrie Hüftbeuger', kind: 'iso', hard: false, legs: false, min: 20, ex: [
      E('Hip Flexor Drive', 3, 'pro Bein', 60, 'kern'),
      E('Hip Flexor Raise', 3, 'pro Bein', 60, 'kern'),
      E('Copenhagen Plank', 3, 'pro Bein', 60, 'kern'),
      E('Einbeiniges Wandsitzen', 2, 'pro Bein', 60, 'weg', 'manchmal'),
      E('Split Squat Holds', 2, 'pro Bein', 60, 'weg', 'manchmal')
    ] },
    { id: 'haltung', name: 'Haltungsübungen', kind: 'mobil', hard: false, legs: false, min: 15, ex: [] },
    { id: 'push', name: 'Push', kind: 'kraft', hard: true, legs: false, min: 60, ex: fromGym('Push',
      [E('Liegestütze', 2, '', 90), E('Dips', 2, '', 90), E('Trizeps-Isolation', 2, '', 60, 'kurz')],
      [[/trizeps|tricep|pushdown|french|skull|kickback/, 'kurz', 'Push-ups und Dips decken den Trizeps ab']]) },
    { id: 'pull', name: 'Pull', kind: 'kraft', hard: true, legs: false, min: 60, ex: fromGym('Pull',
      [E('Klimmzüge', 2, '', 120), E('Rudern', 2, '', 90), E('Bauch', 2, '', 60, 'norm', 'behalten'), E('Hintere Schulter', 2, '', 60, 'kurz')],
      [[/bauch|plank|crunch|leg raise|beinheben|hollow|ab ?wheel/, 'norm', 'behalten'], [/hintere schulter|face ?pull|reverse fl|rear ?delt/, 'kurz', '']]) },
    { id: 'fussball', name: 'Fußball', kind: 'sport', hard: true, legs: true, min: 90, ex: [] },
    { id: 'z2', name: 'Zone-2-Spin', kind: 'z2', hard: false, legs: false, min: 45, ex: [E('Spinning in Zone 2', 1, '45–60 min', 0, 'norm')] },
    { id: 'lauf_np', name: 'Laufen (Norwegian Protocol)', kind: 'lauf', hard: true, legs: true, min: null, ex: [] },
    { id: 'lauf', name: 'Lauf', kind: 'lauf', hard: true, legs: true, min: null, ex: [] }
  ];
  units.forEach(u => u.ex.forEach((e, i) => { e.id = u.id + '_' + i }));
  const S = (...alts) => ({ alts });
  const week = [
    { slots: [S('beine'), S('haltung')] },            // Mo
    { slots: [S('pull'), S('fussball', 'z2')] },       // Di
    { slots: [S('push'), S('fussball', 'lauf_np')] },  // Mi
    { slots: [S('haltung'), S('z2', '')] },            // Do: Pause, Haltung, evtl. Zone 2
    { slots: [S('beine')] },                           // Fr
    { slots: [S('pull', ''), S('lauf', '')] },         // Sa: Pull und Lauf oder Pause
    { slots: [S('push', ''), S('lauf', '')] }          // So: Push und Lauf oder Pause
  ];
  return clean({ units, week });
}

/* ---------- Versionen ---------- */
/* versions: [{from:'JJJJ-MM-TT', at, units, week}] → die am Tag `key` gültige (oder null, wenn es da noch keinen Plan gab) */
function versionAt(versions, key) {
  let best = null;
  (versions || []).forEach(v => { if (v && isDate(v.from) && v.from <= key && (!best || v.from > best.from || (v.from === best.from && (v.at || 0) > (best.at || 0)))) best = v });
  return best;
}
const sortVersions = vs => (vs || []).filter(v => v && isDate(v.from)).sort((a, b) => b.from.localeCompare(a.from) || (b.at || 0) - (a.at || 0));

/* ---------- Anzeige-Helfer ---------- */
const unitById = (plan, id) => (plan.units || []).find(u => u.id === id) || null;
function slotText(plan, slot) {
  const names = slot.alts.map(a => a === '' ? 'nichts' : (unitById(plan, a) || {}).name || '?');
  return names.join(' oder ');
}
function dayText(plan, wd) {
  const d = plan.week[wd]; if (!d || !d.slots.length) return 'Pause';
  return d.slots.map(s => { const t = slotText(plan, s); return s.alts.length > 1 && d.slots.length > 1 ? '(' + t + ')' : t }).join(' + ');
}
/* Arbeitszeit pro Satz in Sekunden aus dem Text „30–90 s“, „mind. 5 min“, „4–5 Wdh.“ … (Schätzung, Mitte eines Bereichs) */
function workSec(amt) {
  const s = String(amt || '').toLowerCase().replace(',', '.');
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:[–-]\s*(\d+(?:\.\d+)?))?\s*(min|s\b|sek|sec)/);
  if (m) { const a = +m[1], b = m[2] ? +m[2] : a, v = (a + b) / 2; return m[3] === 'min' ? v * 60 : v }
  const r = s.match(/(\d+)\s*(?:[–-]\s*(\d+))?/);
  const reps = r ? ((+r[1]) + (r[2] ? +r[2] : +r[1])) / 2 : 8;
  return Math.min(120, Math.max(20, reps * 4)) * (/pro bein|je bein|pro seite|links\/rechts/.test(s) ? 2 : 1);
}
/* geschätzte Minuten einer Einheit aus ihren Übungen (Sätze × (Arbeit + Pause)); ohne Übungen die eingetragenen Minuten */
function estMin(u) {
  if (!u) return 0;
  if (!u.ex.length) return u.min || 0;
  let sec = 0; u.ex.forEach(e => { const n = e.sets || 0; if (!n) return; const w = workSec(e.amt + ' ' + e.note); sec += n * w + Math.max(0, n - 1) * (e.rest == null ? 60 : e.rest) + 30 });
  return Math.round(sec / 60);
}
/* Kurztext, was sich zwischen zwei Plänen geändert hat */
function diff(a, b) {
  if (!a) return ['erste Version'];
  const out = [], A = new Map(a.units.map(u => [u.id, u])), B = new Map(b.units.map(u => [u.id, u]));
  b.units.forEach(u => { const o = A.get(u.id); if (!o) out.push('neu: ' + u.name); else if (JSON.stringify(o) !== JSON.stringify(u)) out.push(u.name + ' geändert') });
  a.units.forEach(u => { if (!B.has(u.id)) out.push('entfernt: ' + u.name) });
  for (let d = 0; d < 7; d++) if (JSON.stringify(a.week[d]) !== JSON.stringify(b.week[d])) out.push(WD[d] + ': ' + dayText(b, d));
  return out.length ? out : ['keine Änderung'];
}

/* ---------- Heute ändern (Phase 2) ----------
   Tagesdokument plan/t_JJJJ-MM-TT: nur Abweichungen für diesen Tag, die Vorlage bleibt unverändert.
   { pick:{Blockschlüssel: unitId|''}, units:{unitId:{skip, done, ex:{exId:{skip, sets}}}}, reason, gym:[Gym-IDs] }
   Beim Speichern kommen geplant (Schnappschuss), gemacht, ausgelassen und die Abweichungstexte dazu – für Muster und MCP. */
const REASONS = [{ id: 'zeit', name: 'Zeit' }, { id: 'recovery', name: 'Recovery' }, { id: 'schmerz', name: 'Schmerz' }, { id: 'lust', name: 'Lust' }, { id: 'sonst', name: 'Sonstiges' }];
const nkey = s => String(s || '').toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
const slotKey = s => s.alts.join('|');
function cleanDay(d) {
  d = d || {}; const o = { pick: {}, units: {}, reason: '', gym: [] };
  if (d.pick && typeof d.pick === 'object') Object.keys(d.pick).slice(0, 12).forEach(k => { o.pick[txt(k, 120)] = txt(d.pick[k], 24) });
  if (d.units && typeof d.units === 'object') Object.keys(d.units).slice(0, 12).forEach(u => {
    const x = d.units[u] || {}, ex = {};
    if (x.ex && typeof x.ex === 'object') Object.keys(x.ex).slice(0, 40).forEach(e => { const y = x.ex[e] || {}, z = {}; if (y.skip) z.skip = true; const s = int(y.sets, 0, 20); if (s != null) z.sets = s; if (Object.keys(z).length) ex[txt(e, 24)] = z });
    const v = {}; if (x.skip) v.skip = true; if (x.done) v.done = true; if (Object.keys(ex).length) v.ex = ex;
    if (Object.keys(v).length) o.units[txt(u, 24)] = v;
  });
  if (REASONS.some(r => r.id === d.reason)) o.reason = d.reason;
  if (Array.isArray(d.gym)) o.gym = [...new Set(d.gym.map(x => txt(x, 40)).filter(Boolean))].slice(0, 10);
  return o;
}
/* gym: Gym-Einheiten (aus training/gym_JJJJ, nur gelesen) – Felder {id, date, plan, ex:[{n, s:[{w,r}]}], skip:[Namen]} */
function todayView(plan, key, day, gym) {
  day = cleanDay(day); const wd = wdOf(key), slots = [], devs = [];
  const gToday = (gym || []).filter(s => s && s.date === key);
  (plan.week[wd] || { slots: [] }).slots.forEach(s => {
    const k = slotKey(s), want = day.pick[k], pick = want !== undefined && s.alts.includes(want) ? want : s.alts[0];
    const unit = pick === '' ? null : unitById(plan, pick);
    if (!unit) { slots.push({ key: k, alts: s.alts, pick, unit: null }); return }
    const o = day.units[unit.id] || {}, uex = o.ex || {};
    const g = gToday.filter(x => { const a = nkey(x.plan), b = nkey(unit.name); return a && b && (a === b || a.includes(b) || b.includes(a)) });
    const gEx = new Map(), gSkip = new Set(); g.forEach(x => { (x.ex || []).forEach(e => gEx.set(nkey(e.n), (gEx.get(nkey(e.n)) || 0) + (e.s || []).length)); (x.skip || []).forEach(n => gSkip.add(nkey(n))) });
    const ex = unit.ex.map(e => {
      const v = uex[e.id] || {}, sets = v.sets == null ? e.sets : v.sets, gk = nkey(e.n);
      return { e, skip: !!v.skip, sets, gym: g.length ? (gEx.has(gk) ? gEx.get(gk) : gSkip.has(gk) ? 0 : null) : null };
    });
    const skip = !!o.skip, done = !skip && (!!o.done || g.length > 0);
    if (skip) devs.push({ t: 'unit', u: unit.id, text: unit.name + ' heute weggelassen' });
    else ex.forEach(x => {
      if (x.skip) devs.push({ t: 'ex', u: unit.id, ex: x.e.id, text: x.e.n + ' weggelassen' });
      else if (x.sets !== x.e.sets) devs.push({ t: 'sets', u: unit.id, ex: x.e.id, from: x.e.sets, to: x.sets, text: x.e.n + ' ' + x.e.sets + ' → ' + x.sets + ' ' + (x.sets === 1 ? 'Satz' : 'Sätze') });
      if (!x.skip && x.gym != null && x.gym < x.sets) devs.push({ t: 'gym', u: unit.id, ex: x.e.id, from: x.sets, to: x.gym, text: 'laut Gym-Log: ' + x.e.n + ' ' + x.gym + ' statt ' + x.sets + ' ' + (x.sets === 1 ? 'Satz' : 'Sätze') });
    });
    slots.push({ key: k, alts: s.alts, pick, unit, skip, done, ex, gym: g });
  });
  return { key, wd, slots, devs, gym: gToday, reason: day.reason, day };
}
/* Was gespeichert wird: Abweichungen + Schnappschuss geplant/gemacht */
function dayDoc(view, ver) {
  const d = view.day, units = view.slots.filter(s => s.unit);
  const exDone = s => s.ex.filter(x => !x.skip && x.sets > 0).map(x => ({ n: x.e.n, sets: x.gym != null ? Math.min(x.gym, x.sets) : x.sets }));
  return Object.assign({}, d, {
    date: view.key, ver: ver || null, at: Date.now(), gym: [...new Set(d.gym.concat(view.gym.map(g => g.id)))].slice(0, 10),
    planned: units.map(s => ({ u: s.unit.id, name: s.unit.name, kind: s.unit.kind, hard: s.unit.hard, legs: s.unit.legs, min: s.unit.min, ex: s.unit.ex.map(e => ({ n: e.n, sets: e.sets, prio: e.prio })) })),
    done: units.filter(s => s.done).map(s => ({ u: s.unit.id, name: s.unit.name, ex: exDone(s), gym: s.gym.map(g => g.id) })),
    skipped: units.filter(s => s.skip).map(s => s.unit.id),
    dev: view.devs.map(x => x.text).slice(0, 40)
  });
}

const api = { WD, WD_LONG, PRIO, KINDS, LIM, REASONS, isDate, wdOf, addDays, uid, copy, clean, cleanUnit, cleanEx, cleanSettings, seed, versionAt, sortVersions, unitById, slotText, dayText, workSec, estMin, diff, nkey, slotKey, cleanDay, todayView, dayDoc };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PlanCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
