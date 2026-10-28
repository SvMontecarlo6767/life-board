// Life Board – MCP-Server (Cloudflare Worker), nur lesend
//
// Gibt Claude Lesezugriff auf dein Life Board:
//   get_today    – heutiger Stand: Whoop (Recovery, Schlaf, Workouts), Check-in, Lernen
//   get_week     – Verlauf der letzten Tage (Standard 7, höchstens 30)
//   get_learning – Lernstand: Stufen, fällig, überfällig, pro Thema
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

// ---------- Tools ----------
const TOOLS = [
  { name: 'get_today', description: 'Heutiger Stand im Life Board: Whoop (Recovery, Schlaf, Strain, Workouts), Check-in (Stimmung, Tagesziele) und Lernstand. Der Tag wechselt um 4 Uhr.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_week', description: 'Tagesweiser Verlauf der letzten Tage mit Whoop-Werten und Check-in, dazu Durchschnitte. Standard 7 Tage, höchstens 30.', inputSchema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 30, description: 'Anzahl Tage inklusive heute (Standard 7)' } }, additionalProperties: false } },
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
  if (name === 'get_learning') return { tag: today, ...learnStats(await learnQs(env), today) };
  const e = new Error('Unbekanntes Tool: ' + name); e.rpc = -32602; throw e;
}

// ---------- MCP über HTTP (JSON-RPC, ohne Sitzungen) ----------
const rpcOk = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
async function handle(env, msg) {
  const { id, method, params } = msg || {};
  if (id === undefined) return null; // Benachrichtigungen (z. B. notifications/initialized) brauchen keine Antwort
  if (method === 'initialize') return rpcOk(id, { protocolVersion: (params && params.protocolVersion) || '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'life-board', version: '1.0.0' } });
  if (method === 'ping') return rpcOk(id, {});
  if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const data = await callTool(env, params && params.name, params && params.arguments);
      return rpcOk(id, { content: [{ type: 'text', text: JSON.stringify(data, null, 1) }] });
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
