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
  { id: 'sport', name: 'Mannschaftssport' }, { id: 'mobil', name: 'Haltung / Mobility' }, { id: 'prae', name: 'Verletzungsprävention' }, { id: 'sonst', name: 'Sonstiges' }
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
  return { id: txt(e.id, 24) || 'e' + i, n: txt(e.n, 60), sets: int(e.sets, 0, 20) == null ? 2 : int(e.sets, 0, 20), amt: txt(e.amt, 40), rest: int(e.rest, 0, 900), note: txt(e.note, 160), prio: PRIO_IDS.includes(e.prio) ? e.prio : 'norm', gym: e.gym !== false };
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
  return { budget: int(s.budget, 15, 240) || 60, z2lo: int(s.z2lo, 60, 220), z2hi: int(s.z2hi, 60, 220), rules: cleanRules(s.rules) };
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
      Object.assign(E('Mobilisieren und Aufwärmen', 1, 'mind. 5 min', 0, 'kern'), { gym: false }),
      E('Pogo Jumps', 2, '30–90 s', 90, 'norm', 'im Gym-Log: Anzahl Sprünge'),
      E('Box Jumps', 2, '4 Wdh.', 120, 'norm'),
      E('Split Squat Jumps', 2, '12 Sprünge', 90, 'weg', '6 pro Bein, Beinwechsel in der Luft'),
      E('Bulgarian Split Squats', 2, 'pro Bein', 90, 'norm', 'Supersatz links/rechts'),
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
const RULE_IDS = ['a', 'b', 'c', 'd', 'e', 'f'];
/* Vorlagen zum schnellen Anlegen (Name und Art frei änderbar) */
const TEMPLATES = [
  { name: 'Spinning', kind: 'z2', min: 45 }, { name: 'Long Run', kind: 'lauf', hard: true, legs: true, min: 75 },
  { name: 'Intervalle', kind: 'lauf', hard: true, legs: true, min: 45 }, { name: 'Tempolauf', kind: 'lauf', hard: true, legs: true, min: 40 },
  { name: 'Verletzungsprävention', kind: 'prae', min: 20 }, { name: 'Haltungstraining', kind: 'mobil', min: 15 },
  { name: 'Fußballtraining', kind: 'sport', hard: true, legs: true, min: 90 }
];
/* Kalendertag in Berlin (wie im Training: Tageswechsel um Mitternacht) */
let _bf = null;
let _bh = null;
function berlinHour(ms) { if (!_bh) _bh = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }); return +_bh.format(new Date(ms)) }
function berlinKey(ms) { if (!_bf) _bf = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit' }); return _bf.format(new Date(ms)) }
/* Whoop-Workouts, die an diesem Tag (Berlin) begonnen haben – aus den Whoop-Tagen des Board-Speichers */
function whoopWorkouts(days, key) {
  const out = [], seen = new Set();
  [addDays(key, -1), key, addDays(key, 1)].forEach(k => ((days && days[k] && days[k].workouts) || []).forEach(w => {
    const t = Date.parse(w && w.start); if (!w || isNaN(t) || berlinKey(t) !== key) return; const id = String(w.id || t); if (seen.has(id)) return; seen.add(id);
    const e = Date.parse(w.end), sc = w.score || {};
    out.push({ id, sport: String(w.sport || 'Workout'), t, min: isNaN(e) ? null : Math.round((e - t) / 60000), strain: num(sc.strain), hr: num(sc.average_heart_rate) });
  }));
  return out.sort((a, b) => a.t - b.t);
}
const REASONS = [{ id: 'zeit', name: 'Zeit' }, { id: 'recovery', name: 'Recovery' }, { id: 'schmerz', name: 'Schmerz' }, { id: 'lust', name: 'Lust' }, { id: 'sonst', name: 'Sonstiges' }];
const nkey = s => String(s || '').toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
const slotKey = s => s.alts.join('|');
function cleanDay(d) {
  d = d || {}; const o = { pick: {}, units: {}, reason: '', gym: [], short: !!d.short, sug: {} };
  if (d.pick && typeof d.pick === 'object') Object.keys(d.pick).slice(0, 12).forEach(k => { o.pick[txt(k, 120)] = txt(d.pick[k], 24) });
  if (d.units && typeof d.units === 'object') Object.keys(d.units).slice(0, 12).forEach(u => {
    const x = d.units[u] || {}, ex = {};
    if (x.ex && typeof x.ex === 'object') Object.keys(x.ex).slice(0, 40).forEach(e => { const y = x.ex[e] || {}, z = {}; if (y.skip) z.skip = true; const s = int(y.sets, 0, 20); if (s != null) z.sets = s; if (Object.keys(z).length) ex[txt(e, 24)] = z });
    const v = {}; if (x.skip) v.skip = true; if (x.done) v.done = true; const mn = int(x.min, 0, 600); if (mn != null) v.min = mn; if (Object.keys(ex).length) v.ex = ex;
    const rp = int(x.rpe, 1, 10); if (rp != null) v.rpe = rp; const nt = txt(x.note, 160); if (nt) v.note = nt; const wh = txt(x.whoop, 40); if (wh) v.whoop = wh;
    if (Object.keys(v).length) o.units[txt(u, 24)] = v;
  });
  if (REASONS.some(r => r.id === d.reason)) o.reason = d.reason;
  if (d.sug && typeof d.sug === 'object') Object.keys(d.sug).filter(k => RULE_IDS.includes(k)).forEach(k => { const x = d.sug[k] || {}; if (x.d === 'ok' || x.d === 'no') o.sug[k] = { d: x.d, at: +x.at || 0, title: txt(x.title, 120), why: (Array.isArray(x.why) ? x.why : []).slice(0, 6).map(w => txt(w, 160)), ops: (Array.isArray(x.ops) ? x.ops : []).slice(0, 30).map(t => txt(t, 120)) } });
  if (Array.isArray(d.gym)) o.gym = [...new Set(d.gym.map(x => txt(x, 40)).filter(Boolean))].slice(0, 10);
  return o;
}
/* gym: Gym-Einheiten (aus training/gym_JJJJ, nur gelesen) – Felder {id, date, plan, ex:[{n, s:[{w,r}]}], skip:[Namen]} */
function todayView(plan, key, day, gym, wk) {
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
    const wo = o.whoop ? (wk || []).find(w => w.id === o.whoop) || { id: o.whoop, sport: 'Whoop', min: null, strain: null } : null;
    const skip = !!o.skip, done = !skip && (!!o.done || g.length > 0 || !!wo);
    if (skip) devs.push({ t: 'unit', u: unit.id, text: unit.name + ' heute weggelassen' });
    else ex.forEach(x => {
      if (x.skip) devs.push({ t: 'ex', u: unit.id, ex: x.e.id, text: x.e.n + ' weggelassen' });
      else if (x.sets !== x.e.sets) devs.push({ t: 'sets', u: unit.id, ex: x.e.id, from: x.e.sets, to: x.sets, text: x.e.n + ' ' + x.e.sets + ' → ' + x.sets + ' ' + (x.sets === 1 ? 'Satz' : 'Sätze') });
      if (!x.skip && x.gym != null && x.gym < x.sets) devs.push({ t: 'gym', u: unit.id, ex: x.e.id, from: x.sets, to: x.gym, text: 'laut Gym-Log: ' + x.e.n + ' ' + x.gym + ' statt ' + x.sets + ' ' + (x.sets === 1 ? 'Satz' : 'Sätze') });
    });
    slots.push({ key: k, alts: s.alts, pick, unit, skip, done, ex, gym: g, min: o.min == null ? null : o.min, rpe: o.rpe || null, note: o.note || '', whoop: wo });
    if (!skip && o.min != null && o.min !== unit.min) devs.push({ t: 'min', u: unit.id, from: unit.min, to: o.min, text: unit.name + ' ' + (unit.min || '?') + ' → ' + o.min + ' min' });
  });
  const used = new Set(slots.filter(s => s.whoop).map(s => s.whoop.id));
  return { key, wd, slots, devs, gym: gToday, reason: day.reason, day, wk: wk || [], wkFree: (wk || []).filter(w => !used.has(w.id)) };
}
/* Was gespeichert wird: Abweichungen + Schnappschuss geplant/gemacht */
function dayDoc(view, ver) {
  const d = view.day, units = view.slots.filter(s => s.unit);
  const exDone = s => s.ex.filter(x => !x.skip && x.sets > 0).map(x => ({ n: x.e.n, sets: x.gym != null ? Math.min(x.gym, x.sets) : x.sets }));
  return Object.assign({}, d, {
    date: view.key, ver: ver || null, at: Date.now(), gym: [...new Set(d.gym.concat(view.gym.map(g => g.id)))].slice(0, 10),
    planned: units.map(s => ({ u: s.unit.id, name: s.unit.name, kind: s.unit.kind, hard: s.unit.hard, legs: s.unit.legs, min: s.unit.min, ex: s.unit.ex.map(e => ({ n: e.n, sets: e.sets, prio: e.prio })) })),
    done: units.filter(s => s.done).map(s => Object.assign({ u: s.unit.id, name: s.unit.name, ex: exDone(s), gym: s.gym.map(g => g.id) }, s.rpe ? { rpe: s.rpe } : {}, s.note ? { note: s.note } : {}, s.whoop ? { whoop: { id: s.whoop.id, sport: s.whoop.sport, min: s.whoop.min, strain: s.whoop.strain } } : {})),
    skipped: units.filter(s => s.skip).map(s => s.unit.id),
    dev: view.devs.map(x => x.text).slice(0, 40)
  });
}

/* ---------- Vorschläge (Phase 3): regelbasiert, nur Empfehlung ----------
   Ein Vorschlag ändert nie die Vorlage, nie Kern-Übungen und streicht nie ganze Einheiten.
   „Übernehmen“ schreibt seine Schritte (ops) in den heutigen Tag, die Entscheidung landet in day.sug. */
const RULES = [
  { id: 'a', name: 'Recovery niedrig + Beintag' }, { id: 'b', name: 'Schlaf schlecht oder spät + Beintag' },
  { id: 'c', name: 'Strain gestern hoch + harte Einheit' }, { id: 'd', name: 'Harte Tage in Folge' },
  { id: 'e', name: '„Heute kurz“' }, { id: 'f', name: 'Zone 2 bei roter Recovery' }
];
const RULE_DEF = { a: { on: true, yellow: true, red: 33, yellowMax: 66 }, b: { on: true, perf: 70, late: 60 }, c: { on: true, strain: 16 }, d: { on: true, n: 3, hard: 14 }, e: { on: true, target: 60 }, f: { on: true, keep: 60 } };
const RULE_LIM = { red: [1, 98], yellowMax: [2, 99], perf: [30, 100], late: [15, 240], strain: [5, 21], n: [2, 7], hard: [5, 21], target: [15, 240], keep: [20, 90] };
function cleanRules(r) {
  const o = {}; r = r && typeof r === 'object' ? r : {};
  Object.keys(RULE_DEF).forEach(id => {
    const d = RULE_DEF[id], x = r[id] && typeof r[id] === 'object' ? r[id] : {}, y = {};
    Object.keys(d).forEach(k => {
      if (typeof d[k] === 'boolean') y[k] = x[k] == null ? d[k] : !!x[k];
      else { const v = parseFloat(String(x[k] == null ? '' : x[k]).replace(',', '.')); y[k] = isFinite(v) ? Math.max(RULE_LIM[k][0], Math.min(RULE_LIM[k][1], k === 'strain' || k === 'hard' ? Math.round(v * 10) / 10 : Math.round(v))) : d[k] }
    });
    o[id] = y;
  });
  if (o.a.yellowMax <= o.a.red) o.a.yellowMax = Math.min(99, o.a.red + 1);
  return o;
}
const tzMin = tz => { const m = /^([+-])(\d\d):?(\d\d)$/.exec(tz || ''); return m ? (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]) : 0 };
const num = v => typeof v === 'number' && isFinite(v) ? v : null;
/* Einschlafzeit als Minuten seit 18:00 (nach Mitternacht = über 360) */
function bedMin(sl) {
  if (!sl || sl.nap || !sl.start) return null; const t = Date.parse(sl.start); if (isNaN(t)) return null;
  const d = new Date(t + tzMin(sl.tz) * 60000), m = d.getUTCHours() * 60 + d.getUTCMinutes();
  return ((m - 1080) % 1440 + 1440) % 1440;
}
const clockOf = m => pad(Math.floor(((m + 1080) % 1440) / 60)) + ':' + pad((m + 1080) % 60);
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 };
/* Whoop-Werte für einen Tag (days = Whoop-Tage wie im Board-Speicher). Recovery und Schlaf gehören zur Nacht vor dem Tag. */
function facts(days, key) {
  days = days || {}; const d = days[key] || {}, y = days[addDays(key, -1)] || {};
  const rs = d.recovery && d.recovery.score, sl = d.sleep, ss = sl && sl.score;
  const bed = bedMin(sl), prev = [];
  for (let i = 1; i <= 14; i++) { const b = bedMin((days[addDays(key, -i)] || {}).sleep); if (b != null) prev.push(b) }
  return {
    rec: rs ? num(rs.recovery_score) : null, perf: ss ? num(ss.sleep_performance_percentage) : null,
    bed, bedUsual: prev.length >= 5 ? median(prev) : null, nBed: prev.length,
    strainY: y.cycle && y.cycle.score ? num(y.cycle.score.strain) : null,
    strainOf: k => { const c = (days[k] || {}).cycle; return c && c.score ? num(c.score.strain) : null }
  };
}
const zone = (rec, a) => rec == null ? null : rec <= a.red ? 'rot' : rec <= a.yellowMax ? 'gelb' : 'grün';
const r0 = v => String(Math.round(v)), r1 = v => String(Math.round(v * 10) / 10).replace('.', ',');
/* Minuten einer Einheit heute (mit Anpassungen des Tages) */
function slotMin(s) {
  if (!s.unit || s.skip) return 0;
  if (s.min != null) return s.min;
  if (!s.ex.length || (['z2', 'lauf', 'sport'].includes(s.unit.kind) && s.unit.min)) return s.unit.min || 0;
  return estMin(Object.assign({}, s.unit, { ex: s.ex.filter(x => !x.skip).map(x => Object.assign({}, x.e, { sets: x.sets })) }));
}
const dayMin = v => v.slots.reduce((n, s) => n + slotMin(s), 0);
/* Kürzen nach Priorität: level 1 = „zuerst weglassen“ weg, level 2 = zusätzlich „kürzbar“ auf 1 Satz. Kern und Normal bleiben. */
function trimOps(v, filter, level) {
  const ops = [];
  v.slots.forEach(s => {
    if (!s.unit || s.skip || !filter(s.unit)) return;
    s.ex.forEach(x => {
      if (x.skip) return;
      if (x.e.prio === 'weg') ops.push({ u: s.unit.id, ex: x.e.id, skip: true, text: x.e.n + ' weglassen' });
      else if (level >= 2 && x.e.prio === 'kurz' && x.sets > 1) ops.push({ u: s.unit.id, ex: x.e.id, sets: 1, text: x.e.n + ' auf 1 Satz' });
    });
  });
  return ops;
}
/* „Heute kurz“: so lange nach Priorität kürzen, bis die Zielzeit erreicht ist */
function shortOps(v, target) {
  const w = JSON.parse(JSON.stringify({ slots: v.slots.map(s => ({ unit: s.unit && { id: s.unit.id, min: s.unit.min, ex: [] }, skip: s.skip, min: s.min, ex: (s.ex || []).map(x => ({ e: x.e, skip: x.skip, sets: x.sets })) })) }));
  w.slots.forEach(s => { if (s.unit) s.unit.ex = s.ex.map(x => x.e) });
  const ops = [], steps = [];
  const each = f => w.slots.forEach(s => { if (s.unit && !s.skip) s.ex.forEach(x => { if (!x.skip) f(s, x) }) });
  each((s, x) => { if (x.e.prio === 'weg') steps.push(() => { x.skip = true; return { u: s.unit.id, ex: x.e.id, skip: true, text: x.e.n + ' weglassen' } }) });
  each((s, x) => { if (x.e.prio === 'kurz' && x.sets > 1) steps.push(() => { x.sets = 1; return { u: s.unit.id, ex: x.e.id, sets: 1, text: x.e.n + ' auf 1 Satz' } }) });
  each((s, x) => { if (x.e.prio === 'kurz') steps.push(() => { x.skip = true; return { u: s.unit.id, ex: x.e.id, skip: true, text: x.e.n + ' weglassen' } }) });
  each((s, x) => { if (x.e.prio === 'norm' && x.sets > 1) steps.push(() => { x.sets = Math.max(1, x.sets - 1); return { u: s.unit.id, ex: x.e.id, sets: x.sets, text: x.e.n + ' auf ' + x.sets + ' ' + (x.sets === 1 ? 'Satz' : 'Sätze') } }) });
  const before = dayMin(w);
  for (const st of steps) { if (dayMin(w) <= target) break; ops.push(st()) }
  const merged = new Map(); ops.forEach(o => merged.set(o.u + '|' + o.ex, o));   // spätere Schritte ersetzen frühere bei derselben Übung
  return { ops: [...merged.values()], from: before, to: dayMin(w) };
}
/* hist: Tagesdokumente {datum: doc} (für harte Tage), days: Whoop-Tage, set: Einstellungen inkl. rules */
function suggest(o) {
  const v = o.view, R = cleanRules(o.set && o.set.rules), F = facts(o.days, v.key), out = [];
  const live = v.slots.filter(s => s.unit && !s.skip), legs = live.filter(s => s.unit.legs && s.ex.length), z = zone(F.rec, R.a);
  const add = (id, title, why, ops, hint) => { ops = (ops || []).filter(Boolean); if (!hint && !ops.length) return; out.push({ id, title, why, ops, hint: !!hint }) };
  // a) Recovery rot/gelb + Beintag
  if (R.a.on && legs.length && (z === 'rot' || (z === 'gelb' && R.a.yellow)))
    add('a', 'Recovery ' + z + ': Beintag heute mit weniger Volumen?', ['Recovery ' + r0(F.rec) + ' % (' + z + ')', 'geplant: ' + legs.map(s => s.unit.name).join(', ')], trimOps(v, u => u.legs, z === 'rot' ? 2 : 1));
  // b) Schlaf schlecht oder spät + Beintag
  if (R.b.on && legs.length) {
    const why = [];
    if (F.perf != null && F.perf < R.b.perf) why.push('Schlafleistung ' + r0(F.perf) + ' % (Schwelle ' + R.b.perf + ' %)');
    if (F.bed != null && F.bedUsual != null && F.bed - F.bedUsual >= R.b.late) why.push('eingeschlafen ' + clockOf(F.bed) + ', sonst ' + clockOf(Math.round(F.bedUsual)) + ' (+' + Math.round(F.bed - F.bedUsual) + ' min)');
    if (why.length) add('b', 'Schlaf ' + (why.length > 1 ? 'kurz und spät' : /Schlafleistung/.test(why[0]) ? 'schlecht' : 'spät') + ': Beintag heute leichter?', why.concat(['Schlaf ist in deinen Daten der stärkste Recovery-Faktor']), trimOps(v, u => u.legs, 1));
  }
  // c) Strain gestern hoch + harte Einheit heute
  const hard = live.filter(s => s.unit.hard);
  if (R.c.on && hard.length && F.strainY != null && F.strainY >= R.c.strain) {
    const ops = [];
    v.slots.forEach(s => { if (s.unit && !s.skip && s.unit.kind === 'lauf') { const z2 = s.alts.find(a => a && o.plan && (unitById(o.plan, a) || {}).kind === 'z2'); if (z2) ops.push({ pick: { key: s.key, u: z2 }, text: 'Zone 2 statt ' + s.unit.name }) } });
    trimOps(v, u => u.hard && u.kind === 'kraft', 1).forEach(x => ops.push(x));
    add('c', 'Strain gestern hoch: heute Intensität senken?', ['Strain gestern ' + r1(F.strainY) + ' (Schwelle ' + r1(R.c.strain) + ')', 'heute hart: ' + hard.map(s => s.unit.name).join(', ')], ops, !ops.length);
  }
  // d) harte Tage in Folge (heute wäre der n-te)
  if (R.d.on && hard.length) {
    const hist = o.hist || {}, isHard = k => { const st = F.strainOf(k), h = hist[k]; return (st != null && st >= R.d.hard) || !!(h && (h.done || []).some(x => ((h.planned || []).find(p => p.u === x.u) || {}).hard)) };
    let n = 0; while (n < R.d.n - 1 && isHard(addDays(v.key, -(n + 1)))) n++;
    if (n >= R.d.n - 1) add('d', (n + 1) + ' harte Tage in Folge: heute eher Erholung?', ['die letzten ' + n + ' Tage hart (Strain ab ' + r1(R.d.hard) + ' oder harte Einheit erledigt)', 'heute hart geplant: ' + hard.map(s => s.unit.name).join(', ')], [], true);
  }
  // e) heute kurz
  if (R.e.on && v.day.short) {
    const r = shortOps(v, R.e.target);
    if (r.ops.length) add('e', 'Heute kurz: ≈ ' + r.from + ' → ' + r.to + ' min', ['Ziel ' + R.e.target + ' min', r.to > R.e.target ? 'mehr geht nur mit Kern- oder Normal-Übungen bzw. Einheiten ohne Übungen' : 'gekürzt nach Priorität, Kern bleibt'], r.ops);
  }
  // f) Zone 2 bei roter Recovery
  if (R.f.on && z === 'rot') live.filter(s => s.unit.kind === 'z2').forEach(s => {
    const m = slotMin(s); if (!m) return; const to = Math.max(15, Math.round(m * R.f.keep / 100 / 5) * 5);
    if (to < m) add('f', 'Recovery rot: Zone 2 kürzer?', ['Recovery ' + r0(F.rec) + ' % (rot)', s.unit.name + ' ' + m + ' min geplant'], [{ u: s.unit.id, min: to, text: s.unit.name + ' auf ' + to + ' min (oder ganz weglassen)' }]);
  });
  const sug = (v.day && v.day.sug) || {};
  return { open: out.filter(x => !sug[x.id]), decided: RULE_IDS.filter(id => sug[id]).map(id => ({ id, d: sug[id].d, title: sug[id].title || (RULES.find(r => r.id === id) || {}).name, why: sug[id].why || [] })), facts: F, zone: z };
}
/* Schritte eines Vorschlags in den heutigen Tag übernehmen (nur Tagesdaten, nie die Vorlage) */
function applyOps(day, ops) {
  const d = cleanDay(day);
  (ops || []).forEach(o => {
    if (o.pick) { d.pick[o.pick.key] = o.pick.u; return }
    const u = d.units[o.u] = d.units[o.u] || {};
    if (o.min != null) { u.min = o.min; return }
    u.ex = u.ex || {}; const e = u.ex[o.ex] = u.ex[o.ex] || {};
    if (o.skip) e.skip = true; if (o.sets != null) e.sets = o.sets;
  });
  return cleanDay(d);
}

const api = { TEMPLATES, berlinKey, berlinHour, whoopWorkouts, WD, WD_LONG, PRIO, KINDS, LIM, REASONS, RULES, RULE_DEF, cleanRules, facts, bedMin, clockOf, zone, slotMin, dayMin, trimOps, shortOps, suggest, applyOps, isDate, wdOf, addDays, uid, copy, clean, cleanUnit, cleanEx, cleanSettings, seed, versionAt, sortVersions, unitById, slotText, dayText, workSec, estMin, diff, nkey, slotKey, cleanDay, todayView, dayDoc };
if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PlanCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
