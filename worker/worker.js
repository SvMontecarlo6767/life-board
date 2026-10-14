// Life Board – Whoop-Zwischenserver (Cloudflare Worker)
//
// Aufgaben:
//  1. Whoop-Login (OAuth) abwickeln, das Client-Secret bleibt hier und nie im Browser.
//  2. Tokens in KV speichern und zuverlässig erneuern (Whoop rotiert das Refresh-Token bei jeder Erneuerung).
//  3. Whoop-Daten regelmäßig abholen (Cron) und tagesweise in KV ablegen.
//  4. Dem Board die Daten liefern, aber nur mit gültigem Firebase-Login des Besitzers.
//
// Benötigte Einstellungen in Cloudflare (siehe worker/README.md):
//  Secrets:   WHOOP_CLIENT_ID, WHOOP_CLIENT_SECRET, OWNER_EMAIL
//  Variablen: FIREBASE_PROJECT_ID, ALLOWED_ORIGIN, BOARD_URL
//  Optional:  WHOOP_API_BASE (Standard: https://api.prod.whoop.com/developer)
//  KV-Binding: WB

const WHOOP_AUTH = 'https://api.prod.whoop.com/oauth/oauth2/auth';
const WHOOP_TOKEN = 'https://api.prod.whoop.com/oauth/oauth2/token';
const DEFAULT_API = 'https://api.prod.whoop.com/developer';
const SCOPES = 'offline read:recovery read:sleep read:cycles read:workout read:profile read:body_measurement';
const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';
const MAX_RANGE_DAYS = 60; // pro Abruf, wegen der Anfrage-Grenze pro Worker-Aufruf
const MAX_PAGES = 6;       // Seiten pro Datentyp und Abruf (je 25 Einträge)

// ---------- Hilfsfunktionen ----------
const enc = new TextEncoder();
const b64uToBytes = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const b64uToJson = s => JSON.parse(new TextDecoder().decode(b64uToBytes(s)));
const randomId = () => [...crypto.getRandomValues(new Uint8Array(24))].map(b => b.toString(16).padStart(2, '0')).join('');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function cors(env, extra = {}) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
    ...extra
  };
}
const json = (env, data, status = 200) => new Response(JSON.stringify(data), { status, headers: cors(env, { 'Content-Type': 'application/json' }) });

// Lokales Datum (YYYY-MM-DD) eines Zeitstempels mit der gespeicherten Zeitzone ("+02:00", "-05:00" oder "Z")
function localDate(iso, offset) {
  let min = 0;
  const m = /^([+-])(\d{2}):(\d{2})$/.exec(offset || '');
  if (m) min = (m[1] === '-' ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3], 10));
  return new Date(Date.parse(iso) + min * 60000).toISOString().slice(0, 10);
}

// ---------- Firebase-Login prüfen (nur der Besitzer darf rein) ----------
let jwksCache = { at: 0, keys: null };
async function getJwks() {
  if (jwksCache.keys && Date.now() - jwksCache.at < 3600e3) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error('jwks');
  jwksCache = { at: Date.now(), keys: (await r.json()).keys };
  return jwksCache.keys;
}
async function verifyIdToken(token, env) {
  const parts = (token || '').split('.');
  if (parts.length !== 3) throw new Error('format');
  const header = b64uToJson(parts[0]), p = b64uToJson(parts[1]);
  if (header.alg !== 'RS256') throw new Error('alg');
  const jwk = (await getJwks()).find(k => k.kid === header.kid);
  if (!jwk) throw new Error('kid');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64uToBytes(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('signature');
  const now = Math.floor(Date.now() / 1000);
  if (p.aud !== env.FIREBASE_PROJECT_ID || p.iss !== 'https://securetoken.google.com/' + env.FIREBASE_PROJECT_ID) throw new Error('claims');
  if (!p.sub || p.exp < now || p.iat > now + 60) throw new Error('time');
  if (!p.email || p.email_verified !== true) throw new Error('email');
  if (p.email.toLowerCase() !== String(env.OWNER_EMAIL || '').trim().toLowerCase()) throw new Error('owner');
  return p;
}
async function requireOwner(request, env) {
  const h = request.headers.get('Authorization') || '';
  try { return await verifyIdToken(h.replace(/^Bearer\s+/i, ''), env); }
  catch (e) { return null; }
}

// ---------- Whoop-Token ----------
async function tokenRequest(env, params) {
  const body = new URLSearchParams({ client_id: env.WHOOP_CLIENT_ID, client_secret: env.WHOOP_CLIENT_SECRET, ...params });
  const r = await fetch(WHOOP_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await r.text();
  let data = {}; try { data = JSON.parse(text); } catch (e) {}
  if (!r.ok) { const err = new Error('token ' + r.status + ' ' + (data.error || '')); err.status = r.status; throw err; }
  return data;
}
async function saveTokens(env, t, prev) {
  const rec = {
    access: t.access_token,
    refresh: t.refresh_token || (prev && prev.refresh) || null, // Whoop rotiert: immer das neueste behalten
    expires_at: Date.now() + (t.expires_in || 3600) * 1000,
    saved_at: Date.now()
  };
  await env.WB.put('tokens', JSON.stringify(rec));
  return rec;
}
// Gibt ein gültiges Access-Token zurück. Erneuert bei Bedarf, immer nur ein Vorgang gleichzeitig (so gut KV das erlaubt).
async function getAccessToken(env) {
  let rec = JSON.parse((await env.WB.get('tokens')) || 'null');
  if (!rec) { const e = new Error('nicht verbunden'); e.code = 'NOT_CONNECTED'; throw e; }
  if (rec.expires_at - 120e3 > Date.now()) return rec.access;
  if (!rec.refresh) { const e = new Error('kein Refresh-Token'); e.code = 'RECONNECT'; throw e; }
  if (await env.WB.get('refresh_lock')) { // jemand erneuert gerade → kurz warten und neu lesen
    await sleep(2500);
    rec = JSON.parse((await env.WB.get('tokens')) || 'null');
    if (rec && rec.expires_at - 60e3 > Date.now()) return rec.access;
  }
  await env.WB.put('refresh_lock', '1', { expirationTtl: 60 });
  try {
    const t = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: rec.refresh, scope: 'offline' });
    rec = await saveTokens(env, t, rec);
    return rec.access;
  } catch (e) {
    if (e.status === 400 || e.status === 401) { await env.WB.put('needs_reconnect', String(Date.now())); e.code = 'RECONNECT'; }
    throw e;
  } finally { await env.WB.delete('refresh_lock'); }
}

// ---------- Whoop-Daten ----------
async function whoopGet(env, access, path, query) {
  const base = (env.WHOOP_API_BASE || DEFAULT_API).replace(/\/$/, '');
  const url = base + path + (query ? '?' + new URLSearchParams(query) : '');
  const r = await fetch(url, { headers: { Authorization: 'Bearer ' + access } });
  if (r.status === 429) { const e = new Error('Whoop-Limit erreicht'); e.code = 'RATE'; throw e; }
  if (!r.ok) { const e = new Error('Whoop ' + r.status + ' bei ' + path); e.status = r.status; throw e; }
  return r.json();
}
async function fetchAll(env, access, path, startIso, endIso) {
  const out = []; let next = null;
  for (let i = 0; i < MAX_PAGES; i++) {
    const q = { limit: '25', start: startIso, end: endIso }; if (next) q.nextToken = next;
    const d = await whoopGet(env, access, path, q);
    out.push(...(d.records || []));
    next = d.next_token; if (!next) break;
  }
  return out;
}
// Ordnet Zyklen, Erholung, Schlaf und Workouts einem lokalen Tag zu. Rohdaten der Werte bleiben unverändert erhalten.
function buildDays(cycles, recoveries, sleeps, workouts) {
  const days = {}; const cycleDate = {};
  const day = d => (days[d] = days[d] || { workouts: [] });
  cycles.forEach(c => {
    const d = localDate(c.start, c.timezone_offset); cycleDate[c.id] = d;
    day(d).cycle = { id: c.id, start: c.start, end: c.end || null, tz: c.timezone_offset, state: c.score_state, score: c.score || null, steps: c.step_count ?? null };
  });
  recoveries.forEach(r => {
    const d = cycleDate[r.cycle_id] || (r.created_at && r.created_at.slice(0, 10)); if (!d) return;
    day(d).recovery = { cycle_id: r.cycle_id, state: r.score_state, score: r.score || null };
  });
  sleeps.forEach(s => {
    const d = localDate(s.end, s.timezone_offset);
    const rec = { id: s.id, start: s.start, end: s.end, tz: s.timezone_offset, nap: !!s.nap, state: s.score_state, score: s.score || null };
    if (s.nap) (day(d).naps = day(d).naps || []).push(rec);
    else { const cur = day(d).sleep; if (!cur || Date.parse(rec.end) > Date.parse(cur.end)) day(d).sleep = rec; }
  });
  workouts.forEach(w => {
    const d = localDate(w.start, w.timezone_offset);
    day(d).workouts.push({ id: w.id, sport: w.sport_name, start: w.start, end: w.end, tz: w.timezone_offset, state: w.score_state, score: w.score || null });
  });
  return days;
}
async function mergeIntoKv(env, days) {
  const byMonth = {};
  Object.keys(days).forEach(d => (byMonth[d.slice(0, 7)] = byMonth[d.slice(0, 7)] || []).push(d));
  for (const [mk, list] of Object.entries(byMonth)) {
    const cur = JSON.parse((await env.WB.get('m:' + mk)) || '{}');
    list.forEach(d => { cur[d] = days[d]; });
    await env.WB.put('m:' + mk, JSON.stringify(cur));
  }
}
// Holt den Zeitraum [fromDate, toDate] (YYYY-MM-DD, jeweils inklusive) und speichert ihn
async function syncRange(env, fromDate, toDate) {
  const from = Date.parse(fromDate + 'T00:00:00Z') - 86400e3; // ein Tag Puffer wegen Zeitzonen
  const to = Date.parse(toDate + 'T00:00:00Z') + 2 * 86400e3;
  if (!(from < to) || (to - from) / 86400e3 > MAX_RANGE_DAYS + 3) throw Object.assign(new Error('Zeitraum ungültig oder zu lang'), { code: 'RANGE' });
  const s = new Date(from).toISOString(), e = new Date(to).toISOString();
  const access = await getAccessToken(env);
  const [cycles, recoveries, sleeps, workouts] = [
    await fetchAll(env, access, '/v2/cycle', s, e),
    await fetchAll(env, access, '/v2/recovery', s, e),
    await fetchAll(env, access, '/v2/activity/sleep', s, e),
    await fetchAll(env, access, '/v2/activity/workout', s, e)
  ];
  const days = buildDays(cycles, recoveries, sleeps, workouts);
  await mergeIntoKv(env, days);
  const meta = { at: Date.now(), from: fromDate, to: toDate, counts: { cycles: cycles.length, recoveries: recoveries.length, sleeps: sleeps.length, workouts: workouts.length } };
  await env.WB.put('last_sync', JSON.stringify(meta));
  await env.WB.delete('needs_reconnect');
  return meta;
}
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = n => new Date(Date.now() - n * 86400e3).toISOString().slice(0, 10);
const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d || '') && !isNaN(Date.parse(d));

async function readRange(env, from, to) {
  const out = {}; const months = new Set();
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400e3) months.add(new Date(t).toISOString().slice(0, 7));
  for (const mk of months) {
    const cur = JSON.parse((await env.WB.get('m:' + mk)) || '{}');
    Object.keys(cur).forEach(d => { if (d >= from && d <= to) out[d] = cur[d]; });
  }
  return out;
}

// ---------- Routen ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env) });

    // Rückkehr von Whoop nach dem Login (kommt direkt vom Browser, daher nur per state geschützt)
    if (url.pathname === '/callback') {
      const back = (q) => Response.redirect(env.BOARD_URL + (env.BOARD_URL.includes('?') ? '&' : '?') + q, 302);
      const state = url.searchParams.get('state'), code = url.searchParams.get('code');
      if (url.searchParams.get('error')) return back('whoop=error');
      if (!state || !code || !(await env.WB.get('state:' + state))) return back('whoop=badstate');
      await env.WB.delete('state:' + state);
      try {
        const t = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: url.origin + '/callback' });
        await saveTokens(env, t, null);
        await env.WB.delete('needs_reconnect');
        return back('whoop=connected');
      } catch (e) { return back('whoop=tokenfail'); }
    }

    const me = await requireOwner(request, env);
    if (!me) return json(env, { error: 'nicht angemeldet' }, 401);

    try {
      if (url.pathname === '/start' && request.method === 'POST') {
        const state = randomId();
        await env.WB.put('state:' + state, '1', { expirationTtl: 600 });
        const q = new URLSearchParams({ response_type: 'code', client_id: env.WHOOP_CLIENT_ID, redirect_uri: url.origin + '/callback', scope: SCOPES, state });
        return json(env, { url: WHOOP_AUTH + '?' + q });
      }
      if (url.pathname === '/status') {
        const rec = JSON.parse((await env.WB.get('tokens')) || 'null');
        return json(env, {
          connected: !!rec,
          needs_reconnect: !!(await env.WB.get('needs_reconnect')),
          last_sync: JSON.parse((await env.WB.get('last_sync')) || 'null')
        });
      }
      if (url.pathname === '/check') { // prüft die Verbindung mit einer kleinen Abfrage (Profil)
        const access = await getAccessToken(env);
        const p = await whoopGet(env, access, '/v2/user/profile/basic');
        return json(env, { ok: true, first_name: p.first_name || null });
      }
      if (url.pathname === '/sync' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        const to = validDate(b.to) ? b.to : today();
        const from = validDate(b.from) ? b.from : daysAgo(Math.min(parseInt(b.days, 10) || 14, MAX_RANGE_DAYS));
        return json(env, await syncRange(env, from, to));
      }
      if (url.pathname === '/data') {
        const to = validDate(url.searchParams.get('to')) ? url.searchParams.get('to') : today();
        const from = validDate(url.searchParams.get('from')) ? url.searchParams.get('from') : daysAgo(30);
        return json(env, { days: await readRange(env, from, to) });
      }
      if (url.pathname === '/disconnect' && request.method === 'POST') {
        await env.WB.delete('tokens');
        return json(env, { ok: true });
      }
      return json(env, { error: 'unbekannt' }, 404);
    } catch (e) {
      const code = e.code || 'ERROR';
      return json(env, { error: e.message, code }, code === 'NOT_CONNECTED' || code === 'RECONNECT' ? 409 : code === 'RANGE' ? 400 : 502);
    }
  },

  // Cron: holt regelmäßig die letzten Tage, hält so die Tokens frisch und die Daten aktuell
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try { await syncRange(env, daysAgo(3), today()); }
      catch (e) { await env.WB.put('last_error', JSON.stringify({ at: Date.now(), msg: e.message })); }
    })());
  }
};

