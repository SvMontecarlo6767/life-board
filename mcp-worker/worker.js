// Life Board – MCP-Server (Cloudflare Worker), nur lesend
//
// Gibt Claude Lesezugriff auf dein Life Board:
//   get_today    – heutiger Stand: Whoop (Recovery, Schlaf, Workouts), Check-in, Lernen
//   get_week     – Verlauf der letzten Tage (Standard 7, höchstens 30)
//   get_learning – Lernstand: Stufen, fällig, überfällig, pro Thema
//   get_range    – kompakte Tagestabelle (CSV) für bis zu 400 Tage: Whoop, Check-in, Gym in einer Zeile pro Tag
//   get_gym      – Krafteinheiten mit Sätzen, Bestwerte pro Übung
//   get_correlations – rechnet Zusammenhänge im Worker (z. B. Strain gestern → Recovery heute) und liefert nur das Ergebnis
//
// Benötigt in Cloudflare (siehe mcp-worker/README.md):
//   Secrets:   MCP_TOKEN (langes Zufallspasswort), SA_JSON (Service-Account-Schlüssel, nur Leserechte)
//   Variablen: OWNER_UID (deine Firebase-Nutzer-ID), FIREBASE_PROJECT_ID
//   KV-Binding: WB (derselbe KV-Speicher wie beim Whoop-Worker, wird nur gelesen)

const FS = 'https://firestore.googleapis.com/v1';
const TZ = 'Europe/Berlin', CHANGE_HOUR = 4;
const enc = new TextEncoder();
const pad = n => String(n).padStart(2, '0');

// ---------- Board-Tag (wie day.js: Berliner Zeit, Wechsel um 4 Uhr) ----------
function dayKey(now = new Date()) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).forEach(x => { p[x.type] = x.value; });
  let d = new Date(Date.UTC(+p.year, +p.month - 1, +p.day));
  if (+p.hour < CHANGE_HOUR) d = new Date(d.getTime() - 864e5);
  return d.toISOString().slice(0, 10);
}
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };

// ---------- Zugriff prüfen ----------
function safeEqual(a, b) {
  a = enc.encode(String(a)); b = enc.encode(String(b));
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a[i] || 0) ^ (b[i] || 0);
  return diff === 0;
}
function authorized(request, url, env) {
  const tok = String(env.MCP_TOKEN || '');
  if (tok.length < 24) return false; // zu kurzes Token = Server gilt als nicht eingerichtet
  const h = request.headers.get('Authorization') || '';
  if (h.startsWith('Bearer ') && safeEqual(h.slice(7), tok)) return true;
  const m = /^\/mcp\/([^/]+)\/?$/.exec(url.pathname); // für Clients ohne eigene Header: Token im Pfad
  return !!(m && safeEqual(decodeURIComponent(m[1]), tok));
}

// ---------- Google-Zugriff mit Service-Account (nur Leserechte) ----------
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
let tokenCache = { tok: null, exp: 0 };
async function googleToken(env) {
  if (tokenCache.tok && Date.now() < tokenCache.exp - 60e3) return tokenCache.tok;
  const sa = JSON.parse(env.SA_JSON);
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(enc.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = b64u(enc.encode(JSON.stringify({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/datastore', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })));
  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), c => c.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(head + '.' + claim));
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64u(sig) })
  });
  if (!r.ok) throw new Error('Google-Anmeldung fehlgeschlagen (' + r.status + ')');
  const d = await r.json();
  tokenCache = { tok: d.access_token, exp: Date.now() + (d.expires_in || 3600) * 1000 };
  return tokenCache.tok;
}

// Firestore-Werte (typisiert) → normales JSON
function val(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(val);
  if ('mapValue' in v) return obj(v.mapValue.fields);
  return null;
}
const obj = f => Object.fromEntries(Object.entries(f || {}).map(([k, v]) => [k, val(v)]));

const base = env => `${FS}/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
async function fsCall(env, url, init = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: 'Bearer ' + await googleToken(env), 'Content-Type': 'application/json' } });
  if (!r.ok) throw new Error('Firestore ' + r.status);
  return r.json();
}
// Mehrere Dokumente einer Sammlung in einem Aufruf
async function getDocs(env, col, ids) {
  const root = `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${env.OWNER_UID}/${col}`;
  const res = await fsCall(env, base(env) + ':batchGet', { method: 'POST', body: JSON.stringify({ documents: ids.map(i => `${root}/${i}`) }) });
  const out = {};
  res.forEach(x => { if (x.found) out[x.found.name.split('/').pop()] = obj(x.found.fields); });
  return out;
}
// Ganze Sammlung (nur die gewünschten Felder), seitenweise
async function listCol(env, col, fields) {
  const out = []; let page = '';
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ pageSize: '300' }); if (page) q.set('pageToken', page);
    let url = `${base(env)}/users/${env.OWNER_UID}/${col}?${q}`;
    fields.forEach(f => { url += '&mask.fieldPaths=' + encodeURIComponent(f); });
    const d = await fsCall(env, url);
    (d.documents || []).forEach(x => out.push({ id: x.name.split('/').pop(), ...obj(x.fields) }));
    if (!d.nextPageToken) break; page = d.nextPageToken;
  }
  return out;
}

// ---------- Whoop-Daten aus dem KV des Whoop-Workers ----------
async function whoopRange(env, from, to) {
  const months = new Set();
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 864e5) months.add(new Date(t).toISOString().slice(0, 7));
  const raws = await Promise.all([...months].map(m => env.WB.get('m:' + m)));
  const out = {};
  raws.forEach(raw => { const cur = JSON.parse(raw || '{}'); for (const d of Object.keys(cur)) if (d >= from && d <= to) out[d] = cur[d]; });
  return out;
}
const r1 = x => (typeof x === 'number' && isFinite(x)) ? Math.round(x * 10) / 10 : null;
function whoopDay(w) {
  if (!w) return null;
  const rs = w.recovery && w.recovery.score, sl = w.sleep, ss = sl && sl.score, st = ss && ss.stage_summary, cs = w.cycle && w.cycle.score;
  let sleepH = null;
  if (st && st.total_in_bed_time_milli != null) sleepH = r1((st.total_in_bed_time_milli - (st.total_awake_time_milli || 0)) / 36e5);
  else if (sl && sl.start && sl.end) sleepH = r1((Date.parse(sl.end) - Date.parse(sl.start)) / 36e5);
  return {
    recovery: rs ? { score: r1(rs.recovery_score), hrv_ms: r1(rs.hrv_rmssd_milli), ruhepuls: r1(rs.resting_heart_rate), spo2: r1(rs.spo2_percentage) } : null,
    schlaf: sl ? { stunden: sleepH, leistung_prozent: r1(ss && ss.sleep_performance_percentage), effizienz_prozent: r1(ss && ss.sleep_efficiency_percentage), ins_bett: sl.start, aufgewacht: sl.end } : null,
    strain: cs ? r1(cs.strain) : null,
    schritte: (w.cycle && w.cycle.steps) ?? null,
    workouts: (w.workouts || []).map(x => ({ sport: x.sport, start: x.start, minuten: x.start && x.end ? Math.round((Date.parse(x.end) - Date.parse(x.start)) / 6e4) : null, strain: x.score ? r1(x.score.strain) : null, puls_durchschnitt: x.score ? r1(x.score.average_heart_rate) : null, puls_max: x.score ? r1(x.score.max_heart_rate) : null }))
  };
}

// ---------- Check-in (users/{uid}/journal/{Tag}) ----------
function journalDay(j) {
  if (!j) return null;
  const goals = Array.isArray(j.g) ? j.g : [];
  return {
    stimmung: j.m ? { stimmung_1_5: j.m.mood ?? null, energie_1_5: j.m.energy ?? null, schlafgefuehl_1_5: j.m.sleep ?? null, gefuehl: j.m.feel || null } : null,
    abend: j.e ? { stress_1_5: j.e.stress ?? null, gut_heute: (j.e.good || []).filter(Boolean), zeile: j.e.line || null } : null,
    alkohol: j.alc ?? null, letzte_mahlzeit: j.meal || null, krank: j.sick || false,
    tagesziele: goals.length ? { erledigt: goals.filter(g => g && g.done).length, gesamt: goals.length } : null,
    tracker: j.t && Object.keys(j.t).length ? j.t : null
  };
}

// ---------- Lernen (users/{uid}/questions) ----------
function learnStats(qs, today) {
  const st = { fragen_gesamt: qs.length, neu: 0, faellig_heute: 0, ueberfaellig: 0, stufen: { 1: 0, 2: 0, 3: 0, 4: 0 } };
  const topics = {};
  for (const q of qs) {
    const t = topics[q.pageTitle || q.pageId || '?'] ||= { fragen: 0, neu: 0, faellig: 0, stufe4: 0 };
    t.fragen++;
    if (!q.reps) { st.neu++; t.neu++; continue; }
    st.stufen[q.stage || 1]++;
    if ((q.stage || 1) === 4) t.stufe4++;
    if (q.due && q.due <= today) { st.faellig_heute++; t.faellig++; if (q.due < today) st.ueberfaellig++; }
  }
  st.stufe_4_anteil_prozent = qs.length ? Math.round(100 * st.stufen[4] / qs.length) : 0;
  return { ...st, themen: topics };
}
const learnQs = env => listCol(env, 'questions', ['stage', 'due', 'reps', 'pageId', 'pageTitle']);

// ---------- Tagestabelle: Whoop + Check-in + Gym in einer Zeile pro Tag ----------
const MAX_RANGE = 400;
const COLS = ['rec', 'hrv', 'rhr', 'sleep_h', 'sleep_perf', 'bed', 'strain', 'steps', 'wk_n', 'wk_min', 'mood', 'energy', 'stress', 'alc', 'sick', 'goals_pct', 'gym', 'gym_min', 'gym_sets', 'gym_vol', 'gym_rpe'];
const LEGEND = 'rec=Recovery %, hrv=HRV ms, rhr=Ruhepuls, sleep_h=Schlafstunden, sleep_perf=Schlafleistung %, bed=Einschlafzeit als Uhrzeit (24.5 = 0:30 Uhr), strain=Tagesbelastung 0-21, steps=Schritte, wk_n/wk_min=Whoop-Workouts Anzahl/Minuten, mood/energy/stress=Check-in 1-5, alc=Alkohol (1/0), sick=krank (1/0), goals_pct=erledigte Tagesziele %, gym=Krafteinheit (1/0), gym_min/gym_sets/gym_vol(kg)/gym_rpe=Gym-Werte. Der Tag wechselt um 4 Uhr. Leer = keine Daten. Recovery, HRV, Ruhepuls und Schlaf gehören zur Nacht VOR dem Datum; strain gehört zum Tag selbst.';
function dayRange(from, to) { const out = []; for (let k = from; k <= to; k = addDays(k, 1)) out.push(k); return out; }
function checkRange(args, defDays) {
  const today = dayKey();
  let to = args && /^\d{4}-\d{2}-\d{2}$/.test(args.to || '') ? args.to : today;
  if (to > today) to = today;
  let from = args && /^\d{4}-\d{2}-\d{2}$/.test(args.from || '') ? args.from : addDays(to, -((parseInt(args && args.days, 10) || defDays) - 1));
  if (from > to) from = to;
  if ((Date.parse(to) - Date.parse(from)) / 864e5 + 1 > MAX_RANGE) from = addDays(to, -(MAX_RANGE - 1));
  return { from, to };
}
function localHour(iso, tz) { // Uhrzeit des Zeitstempels in der gespeicherten Zeitzone, nachts nach 24 verlängert (0:30 → 24.5)
  let min = 0; const m = /^([+-])(\d{2}):(\d{2})$/.exec(tz || '');
  if (m) min = (m[1] === '-' ? -1 : 1) * (+m[2] * 60 + +m[3]);
  const h = (((Date.parse(iso) + min * 6e4) / 36e5) % 24 + 24) % 24;
  return r1(h < 12 ? h + 24 : h);
}
function whoopFlat(w) {
  if (!w) return {};
  const d = whoopDay(w), o = {};
  if (d.recovery) { o.rec = d.recovery.score; o.hrv = d.recovery.hrv_ms; o.rhr = d.recovery.ruhepuls; }
  if (d.schlaf) { o.sleep_h = d.schlaf.stunden; o.sleep_perf = d.schlaf.leistung_prozent; if (w.sleep && w.sleep.start) o.bed = localHour(w.sleep.start, w.sleep.tz); }
  o.strain = d.strain; o.steps = d.schritte; o.wk_n = d.workouts.length; o.wk_min = d.workouts.reduce((s, x) => s + (x.minuten || 0), 0);
  return o;
}
async function journalRange(env, from, to) {
  const docs = await listCol(env, 'journal', ['m', 'e.stress', 'alc', 'sick', 'g']);
  const out = {}; docs.forEach(d => { if (d.id >= from && d.id <= to) out[d.id] = d; });
  return out;
}
function journalFlat(j) {
  if (!j) return {};
  const o = {};
  if (j.m) { o.mood = j.m.mood ?? null; o.energy = j.m.energy ?? null; }
  if (j.e) o.stress = j.e.stress ?? null;
  if (typeof j.alc === 'boolean') o.alc = j.alc ? 1 : 0;
  o.sick = j.sick ? 1 : 0;
  const g = Array.isArray(j.g) ? j.g : [];
  if (g.length) o.goals_pct = Math.round(100 * g.filter(x => x && x.done).length / g.length);
  return o;
}
async function gymSessions(env, from, to) {
  const ids = []; for (let y = +from.slice(0, 4); y <= +to.slice(0, 4); y++) ids.push('gym_' + y);
  const docs = await getDocs(env, 'training', ids), out = [];
  Object.values(docs).forEach(d => (d.list || []).forEach(s => { if (s && s.d >= from && s.d <= to) out.push(s); }));
  return out.sort((a, b) => a.d < b.d ? -1 : a.d > b.d ? 1 : (a.t || 0) - (b.t || 0));
}
const setsOf = s => (s.e || []).flatMap(e => e.s || []);
function gymFlat(list, haveData) {
  if (!list || !list.length) return haveData ? { gym: 0 } : {};
  const sets = list.flatMap(setsOf), rp = list.map(s => s.x).filter(x => typeof x === 'number');
  return { gym: 1, gym_min: list.reduce((a, s) => a + (s.m || 0), 0) || null, gym_sets: sets.length, gym_vol: Math.round(sets.reduce((a, x) => a + (x.w || 0) * (x.r || 0), 0)), gym_rpe: avg(rp) };
}
async function dayTable(env, from, to) {
  const [w, j, g] = await Promise.all([whoopRange(env, from, to), journalRange(env, from, to), gymSessions(env, from, to)]);
  const gBy = {}; g.forEach(s => (gBy[s.d] ||= []).push(s));
  const haveGym = g.length > 0;
  return dayRange(from, to).map(k => ({ date: k, ...whoopFlat(w[k]), ...journalFlat(j[k]), ...gymFlat(gBy[k], haveGym) }));
}
function toCsv(rows, cols) {
  return ['date,' + cols.join(',')].concat(rows.map(r => r.date + ',' + cols.map(c => r[c] == null ? '' : r[c]).join(','))).join('\n');
}

// ---------- Zusammenhänge rechnen ----------
function pearson(xs, ys) {
  const n = xs.length; if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
}
// Paare (x vom Vortag bzw. gleicher Tag, y von heute)
function pairs(rows, x, y, lag) {
  const xs = [], ys = [];
  for (let i = lag; i < rows.length; i++) {
    const a = rows[i - lag][x], b = rows[i][y];
    if (typeof a === 'number' && typeof b === 'number') { xs.push(a); ys.push(b); }
  }
  return { xs, ys };
}
const isBinary = xs => xs.every(v => v === 0 || v === 1);
function describe(x, y, lag, xs, ys) {
  const r = pearson(xs, ys); if (r == null) return null;
  const o = { x, y, vortag: lag === 1, r: Math.round(r * 100) / 100, n: xs.length };
  if (isBinary(xs)) {
    const a = ys.filter((_, i) => xs[i] === 1), b = ys.filter((_, i) => xs[i] === 0);
    if (a.length < 5 || b.length < 5) return null;
    o.mittel_bei_ja = avg(a); o.mittel_bei_nein = avg(b); o.tage_ja = a.length; o.tage_nein = b.length;
  } else {
    const idx = xs.map((v, i) => i).sort((p, q) => xs[p] - xs[q]), t = Math.floor(xs.length / 3);
    if (t < 5) return null;
    o.mittel_y_bei_niedrigem_x = avg(idx.slice(0, t).map(i => ys[i]));
    o.mittel_y_bei_hohem_x = avg(idx.slice(-t).map(i => ys[i]));
  }
  return o;
}
const TARGETS = ['rec', 'hrv', 'rhr', 'sleep_h', 'sleep_perf', 'mood', 'energy', 'stress'];
const SAME_FAMILY = [['rec', 'hrv', 'rhr'], ['sleep_h', 'sleep_perf'], ['gym', 'gym_min', 'gym_sets', 'gym_vol', 'gym_rpe'], ['wk_n', 'wk_min']];
const related = (a, b) => SAME_FAMILY.some(f => f.includes(a) && f.includes(b));
function scan(rows) {
  const out = [];
  for (const y of TARGETS) for (const x of COLS) for (const lag of [0, 1]) {
    if (x === y || (lag === 0 && related(x, y))) continue;
    const { xs, ys } = pairs(rows, x, y, lag);
    if (xs.length < 20) continue;
    const d = describe(x, y, lag, xs, ys);
    if (d && Math.abs(d.r) >= 0.2) out.push(d);
  }
  return out.sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 20);
}

// ---------- Tools ----------
const TOOLS = [
  { name: 'get_today', description: 'Heutiger Stand im Life Board: Whoop (Recovery, Schlaf, Strain, Workouts), Check-in (Stimmung, Tagesziele) und Lernstand. Der Tag wechselt um 4 Uhr.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_week', description: 'Tagesweiser Verlauf der letzten Tage mit Whoop-Werten und Check-in, dazu Durchschnitte. Standard 7 Tage, höchstens 30.', inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 30, description: 'Anzahl Tage inklusive heute (Standard 7)' } }, additionalProperties: false } },
  { name: 'get_range', description: 'Kompakte Tagestabelle (CSV) für einen frei wählbaren Zeitraum bis 400 Tage, eine Zeile pro Tag: Whoop (Recovery, HRV, Ruhepuls, Schlaf, Einschlafzeit, Strain, Schritte, Workouts), Check-in (Stimmung, Energie, Stress, Alkohol, krank, Tagesziele) und Gym. Gut für Fragen über Wochen oder Monate. Mit "columns" lässt sich die Tabelle auf bestimmte Spalten verkleinern.', inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 400, description: 'Anzahl Tage bis heute (Standard 90)' }, from: { type: 'string', description: 'Startdatum JJJJ-MM-TT (statt days)' }, to: { type: 'string', description: 'Enddatum JJJJ-MM-TT (Standard heute)' }, columns: { type: 'array', items: { type: 'string', enum: COLS }, description: 'nur diese Spalten ausgeben' } }, additionalProperties: false } },
  { name: 'get_gym', description: 'Krafteinheiten mit Übungen und Sätzen (Gewicht x Wiederholungen) sowie Bestwerte pro Übung (geschätztes 1-Wiederholungs-Maximum). Mit "exercise" nur Einheiten, die diese Übung enthalten.', inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 400, description: 'Zeitraum in Tagen bis heute (Standard 90)' }, exercise: { type: 'string', description: 'Teil des Übungsnamens, z. B. "bank"' } }, additionalProperties: false } },
  { name: 'get_correlations', description: 'Rechnet Zusammenhänge im Worker und liefert nur das Ergebnis, ohne Rohdaten. Ohne x und y: die stärksten Zusammenhänge im Zeitraum (Standard 365 Tage). Mit x und y: ein bestimmtes Paar. lag=1 vergleicht x vom Vortag mit y von heute (z. B. strain gestern gegen Recovery heute). Metriken: ' + COLS.join(', ') + '. Hinweis: Korrelation ist keine Ursache, und bei vielen Paaren sind einzelne Treffer Zufall.', inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 14, maximum: 400 }, x: { type: 'string', enum: COLS }, y: { type: 'string', enum: COLS }, lag: { type: 'integer', enum: [0, 1], description: '1 = x vom Vortag' } }, additionalProperties: false } },
  { name: 'get_learning', description: 'Lernstand der Wiederholungsfragen: Stufen 1–4, neue, fällige und überfällige Fragen, aufgeschlüsselt nach Thema.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } }
];
const avg = a => { a = a.filter(x => typeof x === 'number'); return a.length ? r1(a.reduce((s, x) => s + x, 0) / a.length) : null; };

async function callTool(env, name, args) {
  const today = dayKey();
  if (name === 'get_today') {
    const [w, j, qs] = await Promise.all([whoopRange(env, today, today), getDocs(env, 'journal', [today]), learnQs(env)]);
    const L = learnStats(qs, today);
    return { tag: today, whoop: whoopDay(w[today]), checkin: journalDay(j[today]), lernen: { faellig_heute: L.faellig_heute, ueberfaellig: L.ueberfaellig, neu: L.neu } };
  }
  if (name === 'get_week') {
    const n = Math.min(30, Math.max(1, parseInt(args && args.days, 10) || 7));
    const from = addDays(today, -(n - 1)), keys = Array.from({ length: n }, (_, i) => addDays(from, i));
    const [w, j] = await Promise.all([whoopRange(env, from, today), getDocs(env, 'journal', keys)]);
    const tage = keys.map(k => ({ tag: k, whoop: whoopDay(w[k]), checkin: journalDay(j[k]) }));
    return {
      von: from, bis: today, tage,
      durchschnitt: {
        recovery: avg(tage.map(t => t.whoop && t.whoop.recovery && t.whoop.recovery.score)),
        schlaf_stunden: avg(tage.map(t => t.whoop && t.whoop.schlaf && t.whoop.schlaf.stunden)),
        strain: avg(tage.map(t => t.whoop && t.whoop.strain)),
        stimmung: avg(tage.map(t => t.checkin && t.checkin.stimmung && t.checkin.stimmung.stimmung_1_5)),
        workouts_gesamt: tage.reduce((s, t) => s + (t.whoop ? t.whoop.workouts.length : 0), 0)
      }
    };
  }
  if (name === 'get_range') {
    const { from, to } = checkRange(args, 90);
    const cols = Array.isArray(args && args.columns) && args.columns.length ? args.columns.filter(c => COLS.includes(c)) : COLS;
    const rows = await dayTable(env, from, to);
    return 'Zeitraum ' + from + ' bis ' + to + ' (' + rows.length + ' Tage)\n' + LEGEND + '\n\n' + toCsv(rows, cols);
  }
  if (name === 'get_correlations') {
    const days = Math.min(MAX_RANGE, Math.max(14, parseInt(args && args.days, 10) || 365));
    const { from, to } = checkRange({ days }, days);
    const rows = await dayTable(env, from, to);
    const base = { zeitraum: from + ' bis ' + to, tage: rows.length, hinweis: 'Korrelation ist keine Ursache. Bei vielen geprüften Paaren sind einzelne Treffer Zufall. r nahe 0 = kaum Zusammenhang, ab etwa 0.3 deutlich, ab 0.5 stark.' };
    if (args && args.x && args.y) {
      if (!COLS.includes(args.x) || !COLS.includes(args.y)) { const e = new Error('Unbekannte Metrik'); e.rpc = -32602; throw e; }
      const lag = args.lag === 1 ? 1 : 0, { xs, ys } = pairs(rows, args.x, args.y, lag);
      return { ...base, ergebnis: xs.length >= 10 ? describe(args.x, args.y, lag, xs, ys) : 'Zu wenige gemeinsame Tage (' + xs.length + ')' };
    }
    return { ...base, staerkste_zusammenhaenge: scan(rows) };
  }
  if (name === 'get_gym') {
    const { from, to } = checkRange(args, 90), ex = String((args && args.exercise) || '').toLowerCase().trim();
    let list = await gymSessions(env, from, to);
    if (ex) list = list.map(s => ({ ...s, e: (s.e || []).filter(e => String(e.n || '').toLowerCase().includes(ex)) })).filter(s => s.e.length);
    const best = {};
    list.forEach(s => (s.e || []).forEach(e => {
      const b = best[e.n] ||= { einheiten: 0, erster_tag: s.d, letzter_tag: s.d, bester_e1rm_kg: 0, bester_satz: null };
      b.einheiten++; b.letzter_tag = s.d;
      (e.s || []).forEach(x => { const v = x.w > 0 && x.r > 0 ? (x.r === 1 ? x.w : x.w * (1 + Math.min(x.r, 12) / 30)) : 0; if (v > b.bester_e1rm_kg) { b.bester_e1rm_kg = r1(v); b.bester_satz = x.w + 'x' + x.r; } });
    }));
    const fmt = s => ({ tag: s.d, plan: s.p || null, minuten: s.m ?? null, rpe_1_10: s.x ?? null, notiz: s.n || null, uebungen: (s.e || []).map(e => ({ name: e.n, saetze: (e.s || []).map(x => x.w + 'x' + x.r).join(', ') })) });
    return { zeitraum: from + ' bis ' + to, einheiten: list.length, uebungen: best, letzte_einheiten: list.slice(-30).map(fmt), hinweis: list.length > 30 ? 'Nur die letzten 30 Einheiten im Detail, die Bestwerte gelten für den ganzen Zeitraum.' : undefined };
  }
  if (name === 'get_learning') return { tag: today, ...learnStats(await learnQs(env), today) };
  const e = new Error('Unbekanntes Tool: ' + name); e.rpc = -32602; throw e;
}

// ---------- MCP über HTTP (JSON-RPC, ohne Sitzungen) ----------
const rpcOk = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
async function handle(env, msg) {
  const { id, method, params } = msg || {};
  if (id === undefined) return null; // Benachrichtigungen (z. B. notifications/initialized) brauchen keine Antwort
  if (method === 'initialize') return rpcOk(id, { protocolVersion: (params && params.protocolVersion) || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'life-board', version: '1.1.0' } });
  if (method === 'ping') return rpcOk(id, {});
  if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const data = await callTool(env, params && params.name, params && params.arguments);
      return rpcOk(id, { content: [{ type: 'text', text: typeof data === 'string' ? data : JSON.stringify(data, null, 1) }] });
    } catch (e) {
      if (e.rpc) return rpcErr(id, e.rpc, e.message);
      return rpcOk(id, { isError: true, content: [{ type: 'text', text: 'Fehler: ' + (e.message || e) }] });
    }
  }
  return rpcErr(id, -32601, 'Methode nicht unterstützt: ' + method);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!/^\/mcp(\/|$)/.test(url.pathname)) return new Response('Life Board MCP', { status: 404 });
    if (!authorized(request, url, env)) return new Response('Nicht erlaubt', { status: 401, headers: { 'WWW-Authenticate': 'Bearer' } });
    if (request.method !== 'POST') return new Response('Nur POST', { status: 405, headers: { Allow: 'POST' } });
    let body; try { body = await request.json(); } catch (e) { return Response.json(rpcErr(null, -32700, 'Ungültiges JSON'), { status: 400 }); }
    if (Array.isArray(body)) {
      const out = (await Promise.all(body.map(m => handle(env, m)))).filter(Boolean);
      return out.length ? Response.json(out) : new Response(null, { status: 202 });
    }
    const out = await handle(env, body);
    return out ? Response.json(out) : new Response(null, { status: 202 });
  }
};
