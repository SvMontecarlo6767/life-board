/* Life Board – Training: Rechenkern (reine Funktionen, läuft im Browser und in Node).
   TrainingCore.parseCSV / importCSV / fromStrava / analyze / fmt.* / plan.parse
   Alles Rechnen steht hier, damit es getestet werden kann (tools/test-training.mjs). */
(function (root) {
'use strict';
const TZ = 'Europe/Berlin';
const SPORTS = ['Lauf', 'Trail', 'Rad', 'Kraft', 'Wandern', 'Schwimmen', 'Sonstiges'];
const NF = {};
const nf = d => NF[d] || (NF[d] = new Intl.NumberFormat('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }));

/* ---------- Formatierung (deutsch) ---------- */
const fmt = {
  num(v, d) { if (v == null || !isFinite(v)) return '–'; d = d || 0; let s = nf(d).format(Math.abs(v)); const neg = v < 0 && Number(s.replace(/\./g, '').replace(',', '.')) !== 0; return (neg ? '−' : '') + s.replace(/\./g, ' '); },
  signed(v, d) { if (v == null || !isFinite(v)) return '–'; const s = fmt.num(v, d); return (v > 0 && s !== fmt.num(0, d) ? '+' : '') + s; },
  time(sec) { if (sec == null || !isFinite(sec)) return '–'; sec = Math.round(sec); const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60; return h ? h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0') : m + ':' + String(s).padStart(2, '0'); },
  pace(secKm) { if (secKm == null || !isFinite(secKm)) return '–'; secKm = Math.round(secKm); return Math.floor(secKm / 60) + ':' + String(secKm % 60).padStart(2, '0'); },
  date(key) { const [y, m, d] = key.split('-'); return d + '.' + m + '.' + y.slice(2); },
  dateLong(key) { const dt = new Date(key + 'T12:00:00Z'); return dt.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); },
  dateShort(key) { const dt = new Date(key + 'T12:00:00Z'); return dt.toLocaleDateString('de-DE', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
};
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WDL = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const MON = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

/* ---------- Zeit in Europe/Berlin ---------- */
let _fmt = null;
function parts(ms) {
  if (!_fmt) _fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const o = {}; for (const p of _fmt.formatToParts(new Date(ms))) o[p.type] = p.value;
  return { y: +o.year, m: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
}
const dayIdxOfKey = k => { const [y, m, d] = k.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5) };
const keyOfIdx = i => new Date(i * 864e5).toISOString().slice(0, 10);
const wdOfIdx = i => (((i + 3) % 7) + 7) % 7; // Montag = 0
function local(ms) { const p = parts(ms); const key = p.y + '-' + String(p.m).padStart(2, '0') + '-' + String(p.d).padStart(2, '0'); const di = dayIdxOfKey(key); return { key, di, h: p.h, mi: p.mi, wd: (((di + 3) % 7) + 7) % 7 }; }
// lokale Berliner Uhrzeit → UTC-Millisekunden
function localToMs(y, m, d, h, mi, s) {
  const guess = Date.UTC(y, m - 1, d, h, mi, s || 0);
  for (const off of [0, -3600e3, -7200e3, 3600e3, 7200e3]) {
    const g = guess + off, p = parts(g);
    if (p.y === y && p.m === m && p.d === d && p.h === h && p.mi === mi) return g;
  }
  return guess - 3600e3;
}

/* ---------- CSV ---------- */
function parseCSV(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.slice(0, 2000).split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++ } else q = false } else cur += c }
    else if (c === '"') q = true;
    else if (c === sep) { row.push(cur); cur = '' }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = [] }
    else cur += c;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row) }
  return rows;
}
function numOf(s) { // "10,2" / "1.234,5" / "10.2"; leer → null (fehlend heißt fehlend)
  if (s == null) return null; s = String(s).trim(); if (s === '' || s === '--' || s === '-') return null;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  else if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  const v = parseFloat(s); return isFinite(v) ? v : null;
}
function durOf(s) { // Sekunden oder "00:48:12" / "48:12"
  if (s == null) return null; s = String(s).trim(); if (s === '' || s === '--') return null;
  if (s.includes(':')) { const p = s.replace(',', '.').split(':').map(parseFloat); if (p.some(isNaN)) return null; return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1]; }
  return numOf(s);
}
const EN_MON = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function dateOf(s) { // → ms (UTC-Zeitpunkt)
  s = String(s || '').trim(); if (!s) return null;
  let m = s.match(/^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?/i); // Strava-Export, UTC
  if (m && EN_MON[m[1].toLowerCase()]) { let h = +m[4]; const ap = (m[7] || '').toUpperCase(); if (ap === 'PM' && h < 12) h += 12; if (ap === 'AM' && h === 12) h = 0; return Date.UTC(+m[3], EN_MON[m[1].toLowerCase()] - 1, +m[2], h, +m[5], +(m[6] || 0)); }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):?(\d{2})?(Z|[+-]\d{2}:?\d{2})?/); // ISO
  if (m) { if (m[7]) { const t = Date.parse(s.replace(' ', 'T')); return isNaN(t) ? null : t } return localToMs(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)); }
  m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/); // deutsch, lokal
  if (m) return localToMs(+m[3] < 100 ? 2000 + +m[3] : +m[3], +m[2], +m[1], +m[4], +m[5], +(m[6] || 0));
  return null;
}
function classify(raw, name, km, elev) {
  const t = String(raw || '').toLowerCase();
  if (/trail|berglauf|mountain/.test(t)) return 'Trail';
  if (/^(run|lauf|virtual ?run|laufen|treadmill|laufband|virtueller lauf)/.test(t) || /\brun\b/.test(t)) {
    if (km && km >= 3 && elev != null && elev / km > 45) return 'Trail';
    return 'Lauf';
  }
  if (/ride|rad|bike|cycl|rolle|velo|spinning|e-?bike/.test(t)) return 'Rad';
  if (/weight|kraft|strength|crossfit|gewicht/.test(t)) return 'Kraft';
  if (/hik|wander|walk|spazier|gehen/.test(t)) return 'Wandern';
  if (/swim|schwimm/.test(t)) return 'Schwimmen';
  return 'Sonstiges';
}
const HEAD = {
  date: ['activity date', 'datum der aktivität', 'aktivitätsdatum', 'datum', 'date', 'start time', 'startzeit', 'beginn'],
  name: ['activity name', 'aktivitätsname', 'titel', 'name'],
  type: ['activity type', 'aktivitätstyp', 'typ der aktivität', 'aktivitätsart', 'typ', 'sportart'],
  dist: ['distance', 'distanz', 'strecke'],
  moving: ['moving time', 'zeit in bewegung', 'bewegungszeit'],
  elapsed: ['elapsed time', 'verstrichene zeit', 'gesamtzeit', 'dauer', 'zeit'],
  hr: ['average heart rate', 'durchschnittliche herzfrequenz', 'ø herzfrequenz', 'durchschn. herzfrequenz', 'avg hr', 'avg. hr', 'herzfrequenz'],
  hrmax: ['max heart rate', 'maximale herzfrequenz', 'max. herzfrequenz', 'max hr', 'max. hf'],
  elev: ['elevation gain', 'anstieg gesamt', 'gesamtanstieg', 'höhenmeter', 'aufstieg', 'total ascent'],
  cad: ['average cadence', 'durchschnittliche schrittfrequenz (laufen)', 'durchschnittliche schrittfrequenz', 'ø schrittfrequenz', 'avg run cadence'],
  gear: ['activity gear', 'gear', 'ausrüstung', 'schuhe', 'equipment'],
  kcal: ['calories', 'kalorien'],
  steps: ['steps', 'schritte'],
  id: ['activity id', 'aktivitäts-id', 'id']
};
function importCSV(text) {
  const rows = parseCSV(text);
  if (rows.length < 2) return { acts: [], info: { error: 'leer' } };
  const head = rows[0].map(h => h.trim().toLowerCase());
  const idxs = key => { const out = []; for (const a of HEAD[key]) head.forEach((h, i) => { if (h === a && !out.includes(i)) out.push(i) }); return out };
  const data = rows.slice(1);
  const col = key => idxs(key);
  const cols = {}; for (const k in HEAD) cols[k] = col(k);
  if (!cols.date.length) return { acts: [], info: { error: 'Spalte mit dem Datum nicht gefunden' } };
  // Doppelte Distanz-Spalten: nach Größenordnung entscheiden (Meter oder Kilometer)
  const distCols = cols.dist.map(i => {
    const v = data.map(r => numOf(r[i])).filter(x => x != null && x > 0).sort((a, b) => a - b);
    const med = v.length ? v[Math.floor(v.length / 2)] : 0;
    return { i, med, meters: med > 300 };
  });
  const dm = distCols.find(c => c.meters), dk = distCols.find(c => !c.meters && c.med > 0);
  const acts = []; let noHr = 0, skipped = 0;
  data.forEach((r, n) => {
    const t = dateOf(r[cols.date[0]]); if (t == null) { skipped++; return }
    let km = null;
    if (dm) { const v = numOf(r[dm.i]); if (v != null) km = v / 1000 }
    if (km == null && dk) { const v = numOf(r[dk.i]); if (v != null) km = v }
    // Zeit: Moving Time, sonst Elapsed (zuerst gefundene brauchbare Spalte)
    const pick = list => { for (const i of list) { const v = durOf(r[i]); if (v != null && v > 0) return v } return null };
    const moving = pick(cols.moving);
    const elapsed = pick(cols.elapsed);
    const sec = moving || elapsed; if (!sec) { skipped++; return }
    const hr = (() => { for (const i of cols.hr) { const v = numOf(r[i]); if (v && v > 30 && v < 230) return v } return null })();
    let hrmax = null; for (const i of cols.hrmax) { const v = numOf(r[i]); if (v != null && v > 30 && v < 260 && (hrmax == null || v > hrmax)) hrmax = v }
    const raw = cols.type.length ? r[cols.type[0]] : '';
    const elev = cols.elev.length ? numOf(r[cols.elev[0]]) : null;
    const a = {
      id: cols.id.length && r[cols.id[0]] ? String(r[cols.id[0]]).trim() : 'c' + n,
      t, raw, name: cols.name.length ? String(r[cols.name[0]] || '').trim() : '',
      km: km != null && km > 0 ? Math.round(km * 1000) / 1000 : null, sec: Math.round(sec), hr, hrmax, elev,
      cad: cols.cad.length ? numOf(r[cols.cad[0]]) : null,
      gear: cols.gear.length ? String(r[cols.gear[0]] || '').trim() || null : null,
      kcal: cols.kcal.length ? numOf(r[cols.kcal[0]]) : null,
      steps: cols.steps.length ? numOf(r[cols.steps[0]]) : null
    };
    a.sport = classify(raw, a.name, a.km, a.elev);
    if (a.cad != null && a.cad < 120 && (a.sport === 'Lauf' || a.sport === 'Trail')) a.cad *= 2; // Strava zählt einen Fuß
    if (hr == null) noHr++;
    acts.push(a);
  });
  acts.sort((a, b) => a.t - b.t);
  return { acts, info: { rows: data.length, skipped, noHr, from: acts[0] && local(acts[0].t).key, to: acts.length && local(acts[acts.length - 1].t).key, source: 'CSV-Export' } };
}
// Strava-API (vom Worker bereits vereinheitlicht: t in ms, sport_type, Meter, Sekunden)
function fromStrava(list) {
  const acts = (list || []).map(s => {
    const km = s.distance != null ? s.distance / 1000 : null;
    const a = { id: String(s.id), t: s.t, raw: s.sport_type || s.type || '', name: s.name || '', km: km && km > 0 ? Math.round(km * 1000) / 1000 : null, sec: Math.round(s.moving_time || s.elapsed_time || 0), hr: s.avg_hr && s.avg_hr > 30 ? s.avg_hr : null, hrmax: s.max_hr && s.max_hr > 30 ? s.max_hr : null, elev: s.elev != null ? s.elev : null, cad: s.cad != null ? s.cad : null, gear: s.gear || null, kcal: s.kcal != null ? s.kcal : null, steps: null };
    a.sport = classify(a.raw, a.name, a.km, a.elev);
    if (a.cad != null && a.cad < 120 && (a.sport === 'Lauf' || a.sport === 'Trail')) a.cad *= 2;
    return a;
  }).filter(a => a.sec > 0 && a.t);
  acts.sort((a, b) => a.t - b.t); return acts;
}

/* ---------- Läufer-Mathematik ---------- */
function vdot(dm, sec) {
  const t = sec / 60, v = dm / t;
  const vo2 = -4.60 + 0.182258 * v + 0.000104 * v * v;
  const pct = 0.8 + 0.1894393 * Math.exp(-0.012778 * t) + 0.2989558 * Math.exp(-0.1932605 * t);
  return vo2 / pct;
}
function timeForVdot(dm, vd) { // Bisektion
  let lo = dm / 1000 * 120, hi = dm / 1000 * 1000;
  for (let i = 0; i < 70; i++) { const mid = (lo + hi) / 2; if (vdot(dm, mid) > vd) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function paceForVo2(vo2) { // m/min → s/km
  const a = 0.000104, b = 0.182258, c = -4.60 - vo2;
  const v = (-b + Math.sqrt(b * b - 4 * a * c)) / (2 * a); return 60000 / v;
}
const erf = x => { const s = x < 0 ? -1 : 1; x = Math.abs(x); const t = 1 / (1 + 0.3275911 * x); const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return s * y };
const cdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2 };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const sum = a => a.reduce((x, y) => x + y, 0);
function bandFor(dm) { return dm <= 7500 ? 0.02 : dm <= 15000 ? 0.022 : dm <= 30000 ? 0.028 : 0.04 }
const QUALITY = /(\d\s*[x×]\s*\d)|×|schwelle|tempo|intervall|interval|rennen|wettkampf|steigerung|einlaufen|threshold|race|fartlek|strides/i;
const HARDNAME = /(\d\s*[x×]\s*\d)|×|intervall|interval|schwelle|tempo|threshold|fartlek/i;

/* Wetter-Aufschlag (öffentlich, damit die Seite nach dem Abruf neu rechnen kann) */
function raceDay(o) {
  // o: {dm, fitSec, vdotShown, tmax, td, elev, target, belegKm, belegAgeDays}
  const out = { fit: Math.round(o.fitSec) };
  const fitH = out.fit / 3600;
  let wxSec = 0, wbgt = null, T = null;
  if (o.tmax != null && o.td != null) {
    T = o.tmax - 3.5;
    const es = x => 6.112 * Math.exp(17.62 * x / (243.12 + x));
    const e = Math.min(es(o.td), es(T));
    wbgt = 0.567 * T + 0.393 * e + 3.94;
    const lvl = Math.max(1, Math.min(2.8, 1 + (55 - o.vdotShown) * 0.045));
    const dur = Math.pow(Math.min(fitH / 2.5, 1), 0.6);
    wxSec = Math.round(out.fit * 0.00363 * Math.max(wbgt - 15, 0) * lvl * dur);
  }
  const courseSec = o.elev ? Math.round(out.fit * (o.elev / 100 * 450 / o.dm)) : 0;
  out.wx = wxSec; out.course = courseSec; out.T = T; out.wbgt = wbgt;
  out.race = out.fit + wxSec + courseSec;
  let sd = out.race * bandFor(o.dm), why = [];
  if (o.belegAgeDays > 90) { sd *= 1.25; why.push('Beleglauf älter als 90 Tage') }
  if (o.belegKm != null && o.belegKm * 1000 < o.dm / 4) { sd *= 1.25; why.push('Beleglauf kürzer als ein Viertel der Strecke') }
  out.sd = sd; out.why = why;
  if (o.target != null) out.chance = Math.round(cdf((o.target - out.race) / sd) * 100);
  return out;
}
function chanceFor(rd, target) { return Math.round(cdf((target - rd.race) / rd.sd) * 100) }

/* ---------- Plan ---------- */
const plan = {
  // Text wie "Mo frei / Di 10 km locker / Do 6x1000 Schwelle 12 km / Sa lang 24 km" → 7 Einträge
  parse(text) {
    const days = Array(7).fill(null);
    const names = { mo: 0, mon: 0, montag: 0, di: 1, die: 1, dienstag: 1, mi: 2, mit: 2, mittwoch: 2, do: 3, don: 3, donnerstag: 3, fr: 4, fre: 4, freitag: 4, sa: 5, sam: 5, samstag: 5, so: 6, son: 6, sonntag: 6 };
    String(text || '').split(/\n|;|\|/).forEach(line => {
      const m = line.trim().match(/^([A-Za-zäöü]+)\.?\s*[:\-–]?\s*(.*)$/); if (!m) return;
      const di = names[m[1].toLowerCase()]; if (di == null) return;
      const rest = m[2].trim(); const km = (rest.match(/(\d+(?:[.,]\d+)?)\s*km/i) || [])[1];
      let kind = 'easy';
      if (!rest || /frei|ruhe|pause|off|rest/i.test(rest)) kind = 'rest';
      else if (/lang|long/i.test(rest)) kind = 'long';
      else if (/rennen|wettkampf|race/i.test(rest)) kind = 'race';
      else if (/schwelle|intervall|tempo|interval|\d\s*[x×]\s*\d|fartlek/i.test(rest)) kind = 'hard';
      else if (/rad|bike|kraft|schwimm|yoga|wander|rolle/i.test(rest)) kind = 'other';
      days[di] = { kind, km: km ? parseFloat(km.replace(',', '.')) : (kind === 'rest' ? 0 : null), label: rest || 'Ruhetag' };
    });
    return days.map(d => d || { kind: 'rest', km: 0, label: 'Ruhetag' });
  },
  kindLabel: k => ({ rest: 'Ruhetag', easy: 'Lockerer Lauf', hard: 'Harte Einheit', long: 'Langer Lauf', race: 'Rennen', other: 'Anderer Sport' }[k] || k)
};

/* ---------- Analyse ---------- */
function analyze(acts, o) {
  o = o || {};
  const R = { ok: false };
  if (!acts || !acts.length) return R;
  acts = acts.slice().sort((a, b) => a.t - b.t);
  const L = acts.map(a => Object.assign({ loc: local(a.t) }, a));
  const lastDi = L[L.length - 1].loc.di;
  const todayDi = o.today ? Math.max(dayIdxOfKey(o.today), lastDi) : lastDi;
  const today = keyOfIdx(todayDi);
  R.today = today; R.todayDi = todayDi;
  const win = L.filter(a => a.loc.di > todayDi - 365 && a.loc.di <= todayDi);
  const isRun = a => a.sport === 'Lauf' || a.sport === 'Trail';
  const pure = a => a.sport === 'Lauf' && a.km && a.sec;
  const rest = o.rest != null ? o.rest : 50; R.rest = rest; R.restAssumed = o.rest == null;
  R.counts = {}; SPORTS.forEach(s => R.counts[s] = win.filter(a => a.sport === s).length);
  R.from = L[0].loc.key; R.to = today;

  // Maximalpuls
  const hrm = L.filter(a => isRun(a) && a.hrmax && a.hrmax <= 215).map(a => a.hrmax).sort((a, b) => b - a);
  let maxHr = null;
  for (let i = 0; i < hrm.length; i++) if (hrm.some((v, j) => j !== i && v >= hrm[i] - 3)) { maxHr = hrm[i]; break }
  R.maxHrAssumed = false;
  if (maxHr == null) { maxHr = hrm.length ? hrm[0] : 190; R.maxHrAssumed = !hrm.length }
  R.maxHr = maxHr;

  // VDOT je Lauf
  L.forEach(a => { a.vdot = pure(a) ? vdot(a.km * 1000, a.sec) : null; a.pace = a.km ? a.sec / a.km : null; });
  const runs12 = win.filter(pure);
  const best12 = runs12.filter(a => a.km >= 3).reduce((b, a) => !b || a.vdot > b.vdot ? a : b, null);

  // Schwellenpuls
  let thr = null, thrSrc = null;
  const thrRuns = (runs12.filter(a => a.km >= 9.5 && a.km <= 21.5 && a.hr)); const thrPool = thrRuns.length ? thrRuns : L.filter(a => pure(a) && a.km >= 9.5 && a.km <= 21.5 && a.hr);
  const thrRun = thrPool.reduce((b, a) => !b || a.vdot > b.vdot ? a : b, null);
  if (thrRun) { thr = Math.round(thrRun.hr * (thrRun.km < 15 ? 0.98 : 1)); thrSrc = thrRun }
  R.thrAssumed = !thrRun; if (!thr) thr = Math.round(maxHr * 0.89);
  R.thr = thr; R.thrSrc = thrSrc ? { date: thrSrc.loc.key, km: thrSrc.km, hr: thrSrc.hr, name: thrSrc.name } : null;
  R.zones = [0.85, 0.90, 0.95, 1.0].map(f => Math.round(thr * f));

  // Belastung
  const F = { Kraft: 0.55, Rad: 0.65, Wandern: 0.6, Lauf: 0.75, Trail: 0.8 };
  let est = 0;
  L.forEach(a => {
    const h = a.sec / 3600;
    if (a.hr) { const fr = (a.hr - rest) / (thr - rest); a.load = h * fr * fr * 100; a.est = false }
    else { const f = F[a.sport] != null ? F[a.sport] : 0.5; a.load = h * f * f * 100; a.est = true; est++ }
  });
  R.estLoad = est; R.noHr = L.filter(a => !a.hr).length;
  const d0 = L[0].loc.di, nDays = todayDi - d0 + 1;
  const daily = new Array(nDays).fill(0), dailyAct = new Array(nDays).fill(0);
  L.forEach(a => { const k = a.loc.di - d0; if (k >= 0 && k < nDays) { daily[k] += a.load; dailyAct[k]++ } });
  const init = mean(daily.slice(0, 28));
  let fit = init, fat = init; const fitS = [], fatS = [];
  for (let i = 0; i < nDays; i++) { fit += (daily[i] - fit) / 42; fat += (daily[i] - fat) / 7; fitS.push(fit); fatS.push(fat) }
  const at = (arr, di) => arr[di - d0];
  R.fitness = fit; R.fatigue = fat; R.form = fit - fat;
  R.ramp = fit - (nDays > 7 ? fitS[nDays - 8] : fitS[0]);
  const last7 = daily.slice(-7), prev28 = daily.slice(-35, -7);
  R.load7 = sum(last7);
  R.acwr = prev28.length >= 14 && sum(prev28) > 0 ? sum(last7) / (sum(prev28) / (prev28.length / 7)) : null;
  { const m = mean(last7), sd = Math.sqrt(mean(last7.map(x => (x - m) ** 2))); R.monotony = sd > 0 ? m / sd : null }
  // Reihen (12 Monate)
  R.series = [];
  for (let di = Math.max(d0, todayDi - 364); di <= todayDi; di++) { const k = di - d0; R.series.push({ k: keyOfIdx(di), load: Math.round(daily[k] * 10) / 10, fit: Math.round(fitS[k] * 10) / 10, fat: Math.round(fatS[k] * 10) / 10, form: Math.round((fitS[k] - fatS[k]) * 10) / 10 }) }

  // Wochen
  const wkStart = di => di - wdOfIdx(di);
  const curWk = wkStart(todayDi);
  const wkMap = new Map();
  L.forEach(a => { const w = wkStart(a.loc.di); let o2 = wkMap.get(w); if (!o2) wkMap.set(w, o2 = { km: 0, runs: 0, hours: 0, load: 0 }); if (isRun(a) && a.km) { o2.km += a.km; o2.runs++ } o2.hours += a.sec / 3600; o2.load += a.load });
  R.weeks = [];
  for (let w = curWk - 52 * 7; w <= curWk; w += 7) { const o2 = wkMap.get(w) || { km: 0, runs: 0, hours: 0, load: 0 }; R.weeks.push({ di: w, start: keyOfIdx(w), km: Math.round(o2.km * 10) / 10, runs: o2.runs, hours: Math.round(o2.hours * 10) / 10, load: Math.round(o2.load), cur: w === curWk }) }
  const done = R.weeks.filter(w => !w.cur);
  R.weeks.forEach((w, i) => { const pr = R.weeks.slice(Math.max(0, i - 4), i); w.avg4 = pr.length ? mean(pr.map(x => x.km)) : null });
  R.jump = null;
  for (let i = done.length - 1; i >= 4; i--) { const w = done[i], a4 = mean(done.slice(i - 4, i).map(x => x.km)); if (w.km >= 30 && a4 != null && w.km > a4 * 1.3) { R.jump = { start: w.start, km: w.km, avg4: Math.round(a4 * 10) / 10, pct: Math.round((w.km / a4 - 1) * 100), weeksAgo: done.length - 1 - i }; break } }
  const l4 = done.slice(-4);
  R.avg4 = mean(l4.map(w => w.km));
  // Konstanz
  const hit = done.map(w => w.runs >= 3);
  let cs = 0; for (let i = hit.length - 1; i >= 0 && hit[i]; i--) cs++;
  let ls = 0, c2 = 0; hit.forEach(h => { c2 = h ? c2 + 1 : 0; ls = Math.max(ls, c2) });
  R.consist = { cur: cs, longest: ls, hits6: hit.slice(-6).filter(Boolean).length };
  const actDays = new Set(win.map(a => a.loc.di));
  let ad = 0, ads = 0; for (let di = todayDi - 364; di <= todayDi; di++) { if (actDays.has(di)) { ad++; ads = Math.max(ads, 0) } }
  { let run = 0; for (let di = todayDi - 364; di <= todayDi; di++) { run = actDays.has(di) ? run + 1 : 0; ads = Math.max(ads, run) } }
  R.activeDays = ad; R.longestDayStreak = ads;

  // VDOT, Rennen, Prognosen
  const recent = L.filter(a => pure(a) && a.km >= 3 && a.loc.di > todayDi - 150);
  const cur = recent.reduce((b, a) => !b || a.vdot > b.vdot ? a : b, null);
  R.vdot = cur ? cur.vdot : null;
  R.vdotSrc = cur ? { date: cur.loc.key, km: cur.km, sec: cur.sec, ageDays: todayDi - cur.loc.di, name: cur.name } : null;
  const raceBase = runs12.filter(a => a.km >= 4.9).reduce((m, a) => Math.max(m, a.vdot), 0);
  const races = runs12.filter(a => a.km >= 4.9 && a.vdot >= raceBase - 2.5);
  const raceSet = new Set(races.map(a => a.id)); L.forEach(a => a.isRace = raceSet.has(a.id));
  R.races = races.map(a => ({ id: a.id, date: a.loc.key, di: a.loc.di, km: a.km, sec: a.sec, name: a.name, vdot: a.vdot })).sort((a, b) => a.di - b.di);
  const longestRace = races.reduce((b, a) => !b || a.km > b.km ? a : b, null);
  const DIST = [{ id: '5k', n: '5 km', dm: 5000 }, { id: '10k', n: '10 km', dm: 10000 }, { id: 'hm', n: 'Halbmarathon', dm: 21097.5 }, { id: 'm', n: 'Marathon', dm: 42195 }];
  R.pred = null;
  if (R.vdot) R.pred = DIST.map(d => {
    const t = Math.round(timeForVdot(d.dm, R.vdot));
    const rg = longestRace ? Math.round(longestRace.sec * Math.pow(d.dm / (longestRace.km * 1000), 1.06)) : null;
    return { id: d.id, n: d.n, dm: d.dm, sec: t, pace: t / (d.dm / 1000), riegel: rg };
  });
  R.easy = R.vdot ? { fast: paceForVo2(0.70 * R.vdot), slow: paceForVo2(0.62 * R.vdot) } : null;
  const marPace = R.pred ? R.pred[3].pace : null;

  // Rennen des Nutzers: Race Day
  const rc = o.race && o.race.date ? o.race : null;
  R.race = null;
  const dists = rc ? rc.km * 1000 : null;
  const mkRace = (dm, target, elev, wx, lat) => {
    const fitSec = R.pred ? (R.pred.find(p => Math.abs(p.dm - dm) < 60) || { sec: timeForVdot(dm, R.vdot) }).sec : null;
    if (fitSec == null) return null;
    return raceDay({ dm, fitSec, vdotShown: Math.round(R.vdot * 10) / 10, tmax: wx && wx.tmax, td: wx && wx.td, elev: elev || 0, target, belegKm: R.vdotSrc && R.vdotSrc.km, belegAgeDays: R.vdotSrc && R.vdotSrc.ageDays });
  };
  if (rc && R.vdot) {
    const days = dayIdxOfKey(rc.date) - todayDi;
    const rd = mkRace(dists, rc.target || null, rc.elev || 0, rc.wx || null);
    R.race = Object.assign({ name: rc.name || 'Wettkampf', place: rc.place || '', date: rc.date, days, km: rc.km, target: rc.target || null, elev: rc.elev || 0, elevSrc: rc.elevSrc || (rc.elev ? 'angegeben' : 'flach gerechnet'), wx: rc.wx || null, lat: rc.lat, lon: rc.lon }, { calc: rd });
    // Taper
    if (days >= 0) {
      const base = mean(daily.slice(-28)), start = dayIdxOfKey(rc.date) - 14;
      let f = fit, t = fat;
      for (let di = todayDi + 1; di <= dayIdxOfKey(rc.date); di++) { const l = di >= start ? base * 0.55 : base; f += (l - f) / 42; t += (l - t) / 7 }
      R.race.taper = { start: keyOfIdx(Math.max(start, todayDi)), form: f - t, fitness: f, fatigue: t };
    }
  }
  R.rdFlat = R.vdot ? DIST.map(d => { const rd = mkRace(d.dm, null, 0, null); return { id: d.id, n: d.n, dm: d.dm, calc: rd } }) : null;

  // Bestzeiten & Rekorde
  const pbOf = (lo, hi, dm) => {
    let best = null;
    runs12.concat(L.filter(a => pure(a) && a.loc.di <= todayDi - 365)).forEach(a => {
      if (a.km < lo || a.km > hi) return;
      let sec = a.sec; if (a.km * 1000 > dm * 1.02) sec = sec * (dm / (a.km * 1000));
      if (!best || sec < best.sec) best = { sec: Math.round(sec), date: a.loc.key, di: a.loc.di, km: a.km };
    });
    return best;
  };
  R.pb = { '5k': pbOf(4.95, 5.3, 5000), '10k': pbOf(9.9, 10.5, 10000), hm: pbOf(21.0, 21.5, 21097.5) };
  const longest = win.filter(isRun).reduce((b, a) => !b || a.km > b.km ? a : b, null);
  const bigWeek = R.weeks.reduce((b, w) => !b || w.km > b.km ? w : b, null);
  const mostElev = win.filter(a => a.elev != null).reduce((b, a) => !b || a.elev > b.elev ? a : b, null);
  const earliest = win.reduce((b, a) => { const m = a.loc.h * 60 + a.loc.mi; return !b || m < b.m ? { m, a } : b }, null);
  R.records = {
    longest: longest && { km: longest.km, date: longest.loc.key, di: longest.loc.di },
    bigWeek: bigWeek && bigWeek.km > 0 ? { km: bigWeek.km, date: bigWeek.start, di: bigWeek.di + 6 } : null,
    mostElev: mostElev && mostElev.elev > 0 ? { elev: Math.round(mostElev.elev), date: mostElev.loc.key, di: mostElev.loc.di } : null,
    earliest: earliest && { h: earliest.a.loc.h, mi: earliest.a.loc.mi, date: earliest.a.loc.key, di: earliest.a.loc.di },
    streak: { n: ads }
  };
  { // bester Monat
    const mm = {}; win.filter(isRun).forEach(a => { const k = a.loc.key.slice(0, 7); mm[k] = (mm[k] || 0) + (a.km || 0) });
    const b = Object.entries(mm).sort((a, b) => b[1] - a[1])[0]; R.bestMonth = b ? { month: b[0], km: Math.round(b[1] * 10) / 10 } : null;
  }

  // Tempo bei gleichem Puls
  const medPace = median(runs12.map(a => a.pace));
  const eligible = []; let dropped = 0;
  runs12.forEach(a => {
    if (!a.hr) return;
    const ok = a.km >= 6 && a.km <= 25 && (a.elev == null || a.elev / a.km <= 12) && Math.abs(a.pace - medPace) <= medPace * 0.25 && !a.isRace && !QUALITY.test(a.name);
    if (ok) eligible.push(a); else dropped++;
  });
  R.same = { n: eligible.length, dropped, band: null, months: [], trend: null };
  if (eligible.length >= 3) {
    let best = null;
    for (let lo = 100; lo <= 200; lo++) { const c = eligible.filter(a => Math.round(a.hr) >= lo && Math.round(a.hr) <= lo + 5); if (!best || c.length > best.n) best = { lo, n: c.length } }
    const inb = eligible.filter(a => Math.round(a.hr) >= best.lo && Math.round(a.hr) <= best.lo + 5);
    R.same.band = [best.lo, best.lo + 5]; R.same.nBand = inb.length;
    R.same.runs = inb.map(a => ({ di: a.loc.di, date: a.loc.key, pace: a.pace, hr: a.hr, km: a.km }));
    const mo = {}; inb.forEach(a => { (mo[a.loc.key.slice(0, 7)] = mo[a.loc.key.slice(0, 7)] || []).push(a.pace) });
    R.same.months = Object.entries(mo).filter(([, v]) => v.length >= 3).map(([m, v]) => ({ m, pace: median(v), n: v.length })).sort((a, b) => a.m < b.m ? -1 : 1);
    const q1 = inb.filter(a => a.loc.di <= todayDi - 364 + 90).map(a => a.pace), q4 = inb.filter(a => a.loc.di > todayDi - 91).map(a => a.pace);
    if (q1.length >= 2 && q4.length >= 2) { const a = Math.round(median(q1)), b = Math.round(median(q4)); R.same.trend = { first: a, last: b, delta: b - a, n1: q1.length, n4: q4.length } }
  }

  // Intensität
  const zoneOf = hr => hr < R.zones[0] ? 0 : hr < R.zones[1] ? 1 : hr < R.zones[2] ? 2 : hr < R.zones[3] ? 3 : 4;
  const zmin = [0, 0, 0, 0, 0];
  const zrange = (from, to) => { const z = [0, 0, 0, 0, 0]; L.forEach(a => { if (isRun(a) && a.hr && a.loc.di > from && a.loc.di <= to) z[zoneOf(a.hr)] += a.sec / 60 }); return z };
  const zw = zrange(todayDi - 365, todayDi); zw.forEach((v, i) => zmin[i] = v);
  const zt = sum(zmin);
  R.zoneMin = zmin; R.zonePct = zmin.map(v => zt ? v / zt * 100 : 0); R.easyShare = zt ? (zmin[0] + zmin[1]) / zt * 100 : null;
  const w12 = L.filter(a => a.loc.di > todayDi - 84 && a.loc.di <= todayDi);
  const easy = w12.filter(a => a.sport === 'Lauf' && a.km >= 5 && a.km <= 22 && marPace && a.pace > marPace && !QUALITY.test(a.name));
  const easyHr = easy.filter(a => a.hr);
  R.easyRuns = { n: easyHr.length, z3: easyHr.filter(a => zoneOf(a.hr) >= 2).length, medHr: median(easyHr.map(a => a.hr)), medPace: median(easyHr.map(a => a.pace)), list: easyHr.map(a => ({ date: a.loc.key, di: a.loc.di, hr: a.hr, pace: a.pace, km: a.km, z3: zoneOf(a.hr) >= 2 })) };
  const hard = w12.filter(a => a.sport === 'Lauf' && HARDNAME.test(a.name) && !a.isRace);
  const hardHr = hard.filter(a => a.hr);
  R.hardRuns = { n: hard.length, nHr: hardHr.length, overThr: hardHr.filter(a => a.hr >= thr).length };
  { const hd = new Set(); w12.forEach(a => { if (a.isRace || (a.sport === 'Lauf' && HARDNAME.test(a.name))) hd.add(a.loc.di) }); let b2b = 0; hd.forEach(d => { if (hd.has(d + 1)) b2b++ }); R.hardRuns.b2b = b2b; R.hardRuns.days = hd.size }

  // Gewohnheit
  const rr = win.filter(a => isRun(a));
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0)); rr.forEach(a => grid[a.loc.wd][a.loc.h]++);
  let top = { n: 0, wd: 0, h: 0 }; grid.forEach((r, wd) => r.forEach((n, h) => { if (n > top.n) top = { n, wd, h } }));
  R.habit = { grid, top, n: rr.length, before9: rr.length ? rr.filter(a => a.loc.h < 9).length / rr.length * 100 : null };

  // Material
  const gm = new Map();
  L.forEach(a => { if (!a.gear || !a.km) return; let g = gm.get(a.gear); if (!g) gm.set(a.gear, g = { name: a.gear, km: 0, first: a.loc.key, last: a.loc.key, lastDi: a.loc.di, km4: 0 }); g.km += a.km; if (a.loc.key > g.last) { g.last = a.loc.key; g.lastDi = a.loc.di } if (a.loc.di > todayDi - 28) g.km4 += a.km });
  const gl = [...gm.values()].map(g => Object.assign(g, { km: Math.round(g.km), km4: Math.round(g.km4) })).sort((a, b) => b.km - a.km);
  R.shoes = { active: gl.filter(g => g.lastDi > todayDi - 90), retired: gl.filter(g => g.lastDi <= todayDi - 90) };

  // Summen
  const hours = {}; SPORTS.forEach(s => hours[s] = 0); win.forEach(a => hours[a.sport] += a.sec / 3600);
  const runsW = win.filter(isRun);
  let steps = 0, stepsKnown = false; win.forEach(a => { if (a.steps) { steps += a.steps; stepsKnown = true } else if (isRun(a) && a.cad) { steps += a.cad * a.sec / 60; stepsKnown = true } });
  R.totals = { runKm: sum(runsW.map(a => a.km || 0)), elev: sum(runsW.map(a => a.elev || 0)), hours: sum(win.map(a => a.sec / 3600)), kcal: win.some(a => a.kcal) ? sum(win.map(a => a.kcal || 0)) : null, steps: stepsKnown ? Math.round(steps) : null, acts: win.length, runs: runsW.length, hoursBy: hours, loadBy: SPORTS.reduce((m, s) => (m[s] = sum(win.filter(a => a.sport === s).map(a => a.load)), m), {}) };

  // Tage (Skyline / Kalender): je Tag Lauf-km, Last, aktiv
  const dayMap = new Map(); win.forEach(a => { let d = dayMap.get(a.loc.di); if (!d) dayMap.set(a.loc.di, d = { km: 0, load: 0, act: 0 }); d.act++; d.load += a.load; if (isRun(a) && a.km) d.km += a.km });
  R.days = []; for (let di = todayDi - 364; di <= todayDi; di++) { const d = dayMap.get(di); R.days.push({ di, k: keyOfIdx(di), km: d ? Math.round(d.km * 10) / 10 : 0, load: d ? Math.round(d.load) : 0, act: d ? d.act : 0 }) }

  // Log (12 Monate)
  R.log = win.slice().reverse().map(a => ({ id: a.id, t: a.t, date: a.loc.key, h: a.loc.h, mi: a.loc.mi, name: a.name, sport: a.sport, km: a.km, sec: a.sec, hr: a.hr, elev: a.elev, load: Math.round(a.load), est: a.est, gear: a.gear }));

  // Diese Woche: Plan gegen Ist
  const wkDays = []; for (let i = 0; i < 7; i++) wkDays.push(curWk + i);
  const actual = wkDays.map(di => { const A = L.filter(a => a.loc.di === di); const rk = sum(A.filter(isRun).map(a => a.km || 0)); const rs = sum(A.filter(isRun).map(a => a.sec)); const oth = sum(A.filter(a => !isRun(a)).map(a => a.sec)) / 60; return { di, km: rk, pace: rk ? rs / rk : null, otherMin: oth, n: A.length } });
  let planDays = null, planDerived = false;
  if (o.plan && o.plan.length === 7 && o.plan.some(d => d.kind !== 'rest')) planDays = o.plan.map(d => Object.assign({}, d));
  else {
    planDerived = true;
    const kinds = Array.from({ length: 7 }, () => ({}));
    const kms = Array.from({ length: 7 }, () => ({}));
    for (const w of done.slice(-4)) {
      const wl = L.filter(a => wkStart(a.loc.di) === w.di && isRun(a));
      const longest = wl.reduce((b, a) => !b || a.km > b.km ? a : b, null);
      for (let i = 0; i < 7; i++) {
        const A = L.filter(a => a.loc.di === w.di + i); let kind = 'rest', km = 0;
        const rs = A.filter(isRun);
        if (rs.length) { km = sum(rs.map(a => a.km || 0)); const big = rs.reduce((b, a) => !b || a.km > b.km ? a : b); kind = longest && big.id === longest.id && big.km >= w.km / 4 ? 'long' : rs.some(a => a.isRace || HARDNAME.test(a.name)) ? 'hard' : 'easy' }
        else if (A.length) kind = 'other';
        kinds[i][kind] = (kinds[i][kind] || 0) + 1; (kms[i][kind] = kms[i][kind] || []).push(km);
      }
    }
    planDays = kinds.map((k, i) => { const ks = Object.keys(k); if (!ks.length) return { kind: 'rest', km: 0, label: 'Ruhetag' }; const kind = ks.sort((a, b) => k[b] - k[a])[0]; const km = Math.round((mean(kms[i][kind]) || 0) * 10) / 10; return { kind, km, label: plan.kindLabel(kind) } });
  }
  R.plan = { derived: planDerived, days: planDays.map((d, i) => {
    const ac = actual[i], past = wkDays[i] <= todayDi;
    let doneFlag = false;
    if (d.kind === 'rest') doneFlag = past && wkDays[i] < todayDi;
    else if (d.kind === 'other') doneFlag = ac.otherMin > 0 || ac.km > 0;
    else doneFlag = ac.km >= Math.max(1, (d.km || 0) * 0.8);
    return Object.assign({}, d, { di: wkDays[i], date: keyOfIdx(wkDays[i]), wd: i, isToday: wkDays[i] === todayDi, past, done: doneFlag, actKm: ac.km, actPace: ac.pace, actMin: ac.otherMin });
  }) };
  R.weekTarget = planDerived ? R.avg4 : sum(planDays.map(d => d.kind === 'other' || d.kind === 'rest' ? 0 : d.km || 0));
  R.weekTargetDerived = planDerived;
  R.weekKm = R.weeks[R.weeks.length - 1].km;
  const planned = R.plan.days.filter(d => d.past && d.kind !== 'rest' && d.wd <= wdOfIdx(todayDi) && !d.isToday);
  R.planPct = planned.length ? planned.filter(d => d.done).length / planned.length : null;
  R.model = o.model || 'Regel-Analyse';
  R.ok = true;
  R._L = L; R._daily = daily; R._fitS = fitS; R._fatS = fatS; R._d0 = d0;
  return R;
}

root.TrainingCore = { SPORTS, WD, WDL, MON, fmt, parseCSV, importCSV, fromStrava, classify, dateOf, durOf, numOf, local, dayIdxOfKey, keyOfIdx, vdot, timeForVdot, paceForVo2, cdf, median, mean, sum, raceDay, chanceFor, bandFor, plan, analyze, QUALITY, HARDNAME };
if (typeof module !== 'undefined' && module.exports) module.exports = root.TrainingCore;
})(typeof window !== 'undefined' ? window : globalThis);
