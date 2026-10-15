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
//  Strava (optional, Training-Reiter): Secrets STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET
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
// Wichtig: Ein Whoop-Zyklus beginnt nicht mit dem Aufwachen. Je nachdem, ob man vor oder nach Mitternacht einschläft,
// läge sein Startdatum mal auf dem Vortag und mal auf dem Aufwachtag. Deshalb zählt für Erholung, Schlaf und Belastung
// einheitlich der Tag des Aufwachens (Ende des Hauptschlafs). Die Erholung verweist per sleep_id direkt auf ihren Schlaf.
function buildDays(cycles, recoveries, sleeps, workouts) {
  const days = {}; const cycleDate = {};
  const day = d => (days[d] = days[d] || { workouts: [] });
  const wakeDate = s => localDate(s.end, s.timezone_offset);
  const sleepById = {}; sleeps.forEach(s => { sleepById[s.id] = s; });
  const mains = sleeps.filter(s => !s.nap);
  const recByCycle = {}; recoveries.forEach(r => { recByCycle[r.cycle_id] = r; });
  cycles.forEach(c => {
    let d = null;
    const r = recByCycle[c.id];
    if (r && sleepById[r.sleep_id]) d = wakeDate(sleepById[r.sleep_id]);
    if (!d) { // kein Recovery (z. B. laufender Zyklus): Hauptschlaf suchen, der etwa beim Zyklusbeginn startet
      let best = null, bd = 6 * 3600e3;
      mains.forEach(s => { const diff = Math.abs(Date.parse(s.start) - Date.parse(c.start)); if (diff < bd) { bd = diff; best = s; } });
      if (best) d = wakeDate(best);
    }
    if (!d) d = localDate(c.start, c.timezone_offset);
    cycleDate[c.id] = d;
    day(d).cycle = { id: c.id, start: c.start, end: c.end || null, tz: c.timezone_offset, state: c.score_state, score: c.score || null, steps: c.step_count ?? null };
  });
  recoveries.forEach(r => {
    const d = (sleepById[r.sleep_id] && wakeDate(sleepById[r.sleep_id])) || cycleDate[r.cycle_id] || (r.created_at && r.created_at.slice(0, 10)); if (!d) return;
    day(d).recovery = { cycle_id: r.cycle_id, sleep_id: r.sleep_id || null, state: r.score_state, score: r.score || null };
  });
  sleeps.forEach(s => {
    const d = wakeDate(s);
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
// Ersetzt alle Tage im Zeitraum [fromDate, toDate] durch den neu berechneten Stand (veraltete Zuordnungen verschwinden dabei).
async function mergeIntoKv(env, days, fromDate, toDate) {
  const inRange = d => d >= fromDate && d <= toDate;
  const fresh = {}; Object.keys(days).filter(inRange).forEach(d => { fresh[d] = days[d]; });
  const months = new Set();
  for (let t = Date.parse(fromDate + 'T00:00:00Z'); t <= Date.parse(toDate + 'T00:00:00Z'); t += 86400e3) months.add(new Date(t).toISOString().slice(0, 7));
  for (const mk of months) {
    const cur = JSON.parse((await env.WB.get('m:' + mk)) || '{}');
    Object.keys(cur).forEach(d => { if (inRange(d)) delete cur[d]; });
    Object.keys(fresh).forEach(d => { if (d.slice(0, 7) === mk) cur[d] = fresh[d]; });
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
  await mergeIntoKv(env, days, fromDate, toDate);
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


// ---------- Notion (nur lesen) ----------
const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';
const DEFAULT_PARENT = '6a5dedb8b8174ab49d70d6097bcd0e39'; // Seite "Lernzusammenfassungen"
const Q_HEAD = /active\s*recall|mini-?wiederholung/i;

function notionId(s) { const h = String(s || '').replace(/-/g, ''); return /^[0-9a-f]{32}$/i.test(h) ? h.toLowerCase() : null; }

async function notionGet(env, path) {
  if (!env.NOTION_TOKEN) { const e = new Error('NOTION_TOKEN fehlt'); e.code = 'NO_NOTION'; throw e; }
  const r = await fetch(NOTION_API + path, { headers: { Authorization: 'Bearer ' + env.NOTION_TOKEN, 'Notion-Version': NOTION_VERSION } });
  if (!r.ok) { const e = new Error('Notion ' + r.status); e.code = r.status === 404 || r.status === 403 ? 'NOTION_ACCESS' : 'NOTION'; throw e; }
  return r.json();
}
async function notionChildren(env, id) {
  const out = []; let cursor = null;
  for (let i = 0; i < 10; i++) {
    const r = await notionGet(env, '/blocks/' + id + '/children?page_size=100' + (cursor ? '&start_cursor=' + cursor : ''));
    out.push(...(r.results || []));
    if (!r.has_more) break; cursor = r.next_cursor;
  }
  return out;
}
const rt = (b) => { const o = b && b[b.type]; return o && o.rich_text ? o.rich_text.map(t => t.plain_text).join('') : ''; };

// Fragen + Nachschlagetext aus den Blöcken einer Lernseite
export function parseLearnBlocks(blocks) {
  const questions = []; const ref = []; let inQ = false, seenQ = false;
  for (const b of blocks) {
    const t = rt(b).trim();
    if (b.type === 'heading_1' || b.type === 'heading_2' || b.type === 'heading_3') {
      if (Q_HEAD.test(t)) { inQ = true; seenQ = true; continue; }
      if (inQ) inQ = false;
    }
    if (b.type === 'divider') { if (inQ && questions.length) inQ = false; continue; }
    if (inQ) {
      if (b.type === 'numbered_list_item' && t) questions.push(t);
      else if (b.type === 'paragraph' && /^\d+[.)]\s+/.test(t)) questions.push(t.replace(/^\d+[.)]\s+/, ''));
      continue;
    }
    if (!seenQ && t && b.type !== 'callout') ref.push((b.type.startsWith('heading') ? '\n## ' : b.type === 'bulleted_list_item' ? '• ' : '') + t);
  }
  return { questions, ref: ref.join('\n').slice(0, 7000) };
}

async function notionPages(env) {
  const parent = notionId(env.NOTION_PARENT_ID) || DEFAULT_PARENT;
  const blocks = await notionChildren(env, parent);
  return blocks.filter(b => b.type === 'child_page').map(b => ({ id: b.id.replace(/-/g, ''), title: b.child_page.title, edited: b.last_edited_time }));
}
async function notionQuestions(env, id) {
  const blocks = await notionChildren(env, id);
  const meta = await notionGet(env, '/pages/' + id);
  const title = Object.values(meta.properties || {}).find(p => p.type === 'title');
  return { id, title: title ? title.title.map(t => t.plain_text).join('') : '', edited: meta.last_edited_time, ...parseLearnBlocks(blocks) };
}

// ---------- KI-Assistent (Gemini, kostenloses Kontingent) ----------
const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta/models/';
const AI_SYSTEM = 'Du bist J.A.R.V.I.S, der persönliche Assistent im "Life Board" einer einzelnen Person (Whoop-Daten, Dopamin-Punkte-System, Lernen mit Wiederholungen, Puzzle-Tracker). ' +
  'Persönlichkeit: ruhig, souverän, knapp, leicht trocken, wie der Jarvis aus Iron Man. Du sprichst die Person mit "du" an und antwortest auf Deutsch, ohne Floskeln und ohne Begrüßungsformeln. ' +
  'Stütze dich auf die mitgelieferten Daten und die Seitenbeschreibung; erfinde keine Zahlen. Wenn Daten fehlen, sag das. Gib keine medizinischen Diagnosen. ' +
  'Bei Bewertungen von Lernantworten: nenne einen Vorschlag (richtig / fast / falsch) mit kurzer Begründung; die Person entscheidet selbst.';
const AI_TOOLS = ' Du kannst Funktionen aufrufen, um Reiter zu wechseln, Einträge in Heute oder im Puzzle-Tracker zu machen und Einstellungen zu ändern. Rufe eine Funktion nur auf, wenn der Nutzer das ausdrücklich möchte. Antworte nie, etwas sei eingetragen, ohne die Funktion aufzurufen. Fehlt eine Angabe, frage kurz nach, statt zu raten. Reine Fragen zu den Daten beantwortest du ohne Funktion.';
const AI_VOICE = '\n\nDIESE ANTWORT WIRD VORGELESEN: höchstens 2 kurze Sätze (unter 40 Wörtern), reiner Fließtext ohne Listen, Markdown, Emojis oder Klammern. Ausführliches nur anbieten ("Details stehen im Verlauf") statt vorlesen.';
const mkModel = (m) => String(m).replace(/^models\//, '').replace(/[^a-z0-9.\-]/gi, '');
async function aiCount(env, kind, limit) {
  const dk = new Date().toISOString().slice(0, 10), key = kind + ':' + dk;
  const used = parseInt((await env.WB.get(key)) || '0', 10);
  if (used >= limit) { const e = new Error('Tageslimit erreicht (' + limit + ' ' + (kind === 'tts' ? 'Sprachausgaben' : 'KI-Anfragen') + ')'); e.code = 'AI_LIMIT'; throw e; }
  await env.WB.put(key, String(used + 1), { expirationTtl: 172800 });
  return used + 1;
}
// Textmodell mit Ersatzlogik: gemerktes Modell, konfiguriertes, bekannte Namen, sonst Modellliste des Keys
async function geminiGenerate(env, payload) {
  const call = async (model) => {
    const r = await fetch(GEMINI_API + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY }, body: JSON.stringify(payload) });
    return { r, d: await r.json().catch(() => ({})) };
  };
  const tried = []; let r, d;
  const cached = await env.WB.get('ai_model');
  // Qualität zuerst: großes Flash-Modell, bei Kontingent-/Verfügbarkeitsproblemen das nächstkleinere
  const first = [env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', cached].filter(Boolean).map(mkModel);
  for (const model of [...new Set(first)]) {
    tried.push(model); ({ r, d } = await call(model));
    if (r.ok) { await env.WB.put('ai_model', model); d = Object.assign({}, d, { _model: model }); break; }
    if (r.status !== 404 && r.status !== 429 && r.status !== 403) break;
  }
  if (r.status === 404) {
    const lm = await fetch(GEMINI_API.replace(/models\/$/, 'models') + '?pageSize=200', { headers: { 'x-goog-api-key': env.GEMINI_KEY } });
    const ld = await lm.json().catch(() => ({}));
    const avail = (ld.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /flash/i.test(m.name) && !/image|tts|live|audio|embed|thinking|exp|preview|robotics|computer|native/i.test(m.name)).map(m => mkModel(m.name));
    avail.sort((x, y) => (/lite/.test(y) ? 1 : 0) - (/lite/.test(x) ? 1 : 0) || (x < y ? 1 : -1));
    for (const model of avail.filter(m => !tried.includes(m)).slice(0, 4)) {
      tried.push(model); ({ r, d } = await call(model));
      if (r.status !== 404) { if (r.ok) { await env.WB.put('ai_model', model); d = Object.assign({}, d, { _model: model }) } break; }
    }
    if (r.status === 404) d = { error: { message: 'kein passendes Modell gefunden; vom Key unterstützt: ' + (avail.slice(0, 8).join(', ') || (ld.error && ld.error.message) || 'keine') } };
  }
  if (!r.ok) { const e = new Error(r.status === 429 ? 'Gemini-Kontingent gerade aufgebraucht, später erneut versuchen' : 'Gemini ' + r.status + (d && d.error && d.error.message ? ': ' + String(d.error.message).slice(0, 200) : '') + ' (versucht: ' + tried.join(', ') + ')'); e.code = r.status === 429 ? 'AI_LIMIT' : 'AI'; throw e; }
  return d;
}
const textOf = (d) => { const p = (((d.candidates || [])[0] || {}).content || {}).parts; return p ? p.map(x => x.text || '').join('') : ''; };
function needKey(env) { if (!env.GEMINI_KEY) { const e = new Error('GEMINI_KEY fehlt'); e.code = 'NO_AI'; throw e; } }
// Weitere KI-Anbieter (OpenAI-kompatibel). Schlüssel als Secret im Worker: GROQ_KEY, OPENROUTER_KEY, MISTRAL_KEY.
const PROVIDERS = {
  groq: { name: 'Groq', url: 'https://api.groq.com/openai/v1/chat/completions', key: 'GROQ_KEY', model: 'llama-3.3-70b-versatile', modelVar: 'GROQ_MODEL' },
  openrouter: { name: 'OpenRouter', url: 'https://openrouter.ai/api/v1/chat/completions', key: 'OPENROUTER_KEY', model: 'meta-llama/llama-3.3-70b-instruct:free', modelVar: 'OPENROUTER_MODEL' },
  mistral: { name: 'Mistral', url: 'https://api.mistral.ai/v1/chat/completions', key: 'MISTRAL_KEY', model: 'mistral-small-latest', modelVar: 'MISTRAL_MODEL' }
};
async function askOther(env, body, pv) {
  const P = PROVIDERS[pv];
  if (!env[P.key]) { const e = new Error(P.key + ' fehlt im Worker – als Secret in Cloudflare eintragen oder in den Optionen auf Gemini zurückstellen'); e.code = 'NO_AI'; throw e; }
  const msgs = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!msgs.length) { const e = new Error('keine Frage'); e.code = 'RANGE'; throw e; }
  const limit = parseInt(env.AI_DAILY_LIMIT, 10) || 150;
  const used = await aiCount(env, 'ai', limit);
  const tools = (Array.isArray(body.tools) ? body.tools : []).slice(0, 12).filter(t => t && /^[a-z_]{1,40}$/.test(t.name || '')).map(t => ({ type: 'function', function: { name: t.name, description: String(t.description || '').slice(0, 2500), parameters: t.parameters || { type: 'object', properties: {} } } }));
  const sys = AI_SYSTEM + (body.voice ? AI_VOICE : '') + (tools.length ? AI_TOOLS : '') + '\n\n' + String(body.context || '').slice(0, 40000);
  const model = env[P.modelVar] || P.model;
  const payload = { model, temperature: 0.4, max_tokens: body.voice ? 300 : 1200, messages: [{ role: 'system', content: sys }].concat(msgs.map(m => ({ role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) }))) };
  if (tools.length) { payload.tools = tools; payload.tool_choice = 'auto'; }
  const r = await fetch(P.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env[P.key] }, body: JSON.stringify(payload) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(P.name + ' ' + r.status + (d.error && d.error.message ? ': ' + String(d.error.message).slice(0, 160) : '')); e.code = r.status === 429 ? 'AI_LIMIT' : 'AI'; throw e; }
  const m = (((d.choices || [])[0]) || {}).message || {};
  const out = String(m.content || '').trim();
  const calls = (m.tool_calls || []).map(c => { let a = {}; try { a = JSON.parse(c.function.arguments || '{}') } catch (e) {} return { name: c.function.name, args: a }; }).slice(0, 3);
  if (!out && !calls.length) { const e = new Error('Keine Antwort erhalten'); e.code = 'AI'; throw e; }
  return { answer: out, calls, model: P.name + ' · ' + (d.model || model), used, limit };
}
async function askGemini(env, body) {
  const pv = String(body.provider || '').toLowerCase();
  if (PROVIDERS[pv]) return askOther(env, body, pv);
  needKey(env);
  const msgs = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!msgs.length) { const e = new Error('keine Frage'); e.code = 'RANGE'; throw e; }
  const ctx = String(body.context || '').slice(0, 40000);
  const limit = parseInt(env.AI_DAILY_LIMIT, 10) || 150;
  const used = await aiCount(env, 'ai', limit);
  const contents = msgs.map(m => ({ role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '').slice(0, 4000) }] }));
  const decl = (Array.isArray(body.tools) ? body.tools : []).slice(0, 12).filter(t => t && /^[a-z_]{1,40}$/.test(t.name || '')).map(t => ({ name: t.name, description: String(t.description || '').slice(0, 2500), parameters: t.parameters }));
  const payload = { systemInstruction: { parts: [{ text: AI_SYSTEM + (body.voice ? AI_VOICE : '') + (decl.length ? AI_TOOLS : '') + '\n\n' + ctx }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: body.voice ? 300 : 1200 } };
  if (decl.length) { payload.tools = [{ functionDeclarations: decl }]; payload.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }; }
  const d = await geminiGenerate(env, payload);
  const out = textOf(d);
  const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const calls = parts.filter(p => p.functionCall && p.functionCall.name).map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} })).slice(0, 3);
  if (!out && !calls.length) { const e = new Error('Keine Antwort erhalten (evtl. blockiert)'); e.code = 'AI'; throw e; }
  return { answer: out, calls, model: d._model || null, used, limit };
}
// Sprache -> Text (Aufnahme als WAV, base64)
async function sttGemini(env, body) {
  needKey(env);
  const audio = String(body.audio || ''), mime = /^audio\/[a-z0-9.+-]+$/i.test(body.mime || '') ? body.mime : 'audio/wav';
  if (!audio || audio.length < 200) { const e = new Error('Aufnahme leer'); e.code = 'RANGE'; throw e; }
  if (audio.length > 12e6) { const e = new Error('Aufnahme zu lang'); e.code = 'RANGE'; throw e; }
  const limit = parseInt(env.AI_DAILY_LIMIT, 10) || 150;
  const used = await aiCount(env, 'ai', limit);
  const d = await geminiGenerate(env, { contents: [{ role: 'user', parts: [{ text: 'Transkribiere diese Sprachaufnahme wörtlich auf Deutsch. Gib nur den gesprochenen Text zurück, ohne Anführungszeichen und ohne Kommentar. Ist nichts Verständliches zu hören, gib ein leeres Ergebnis zurück.' }, { inline_data: { mime_type: mime, data: audio } }] }], generationConfig: { temperature: 0, maxOutputTokens: 400 } });
  return { text: textOf(d).trim(), used, limit };
}
// Text -> Sprache (Gemini-TTS). Probiert die Interactions-API (laut Doku) und danach generateContent.
async function ttsGemini(env, body) {
  needKey(env);
  const text = String(body.text || '').trim().slice(0, 1200);
  if (!text) { const e = new Error('kein Text'); e.code = 'RANGE'; throw e; }
  const voice = String(body.voice || env.GEMINI_VOICE || 'Charon').replace(/[^A-Za-z]/g, '').slice(0, 24) || 'Charon';
  const limit = parseInt(env.AI_TTS_DAILY_LIMIT, 10) || 150;
  await aiCount(env, 'tts', limit);
  const models = [...new Set([env.GEMINI_TTS_MODEL, 'gemini-3.8-flash-tts', 'gemini-3.8-flash-lite-tts'].filter(Boolean).map(mkModel))];
  const style = 'Ruhig, souverän, leicht trocken, deutsche Aussprache, mittleres Tempo';
  const errs = [];
  const findAudio = (d) => { // Base64-Audio irgendwo in der Antwort finden
    let found = null;
    const walk = (o) => { if (found || !o || typeof o !== 'object') return; if (typeof o.data === 'string' && o.data.length > 400 && (o.type === 'audio' || /audio/.test(o.mime_type || o.mimeType || ''))) { found = { audio: o.data, mime: o.mime_type || o.mimeType || 'audio/wav' }; return } if (o.inlineData && o.inlineData.data) { found = { audio: o.inlineData.data, mime: o.inlineData.mimeType || 'audio/l16;rate=24000' }; return } for (const k of Object.keys(o)) walk(o[k]) };
    walk(d); return found;
  };
  for (const model of models) {
    try {
      let r = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: JSON.stringify({ model, input: [{ type: 'user_input', content: [{ type: 'text', text, annotations: [{ type: 'speech_metadata', style }] }] }], response_format: { type: 'audio', mime_type: 'audio/wav' }, generation_config: { speech_config: [{ voice }] }, stream: false }) });
      let d = await r.json().catch(() => ({})); let a = r.ok && findAudio(d);
      if (a) return a;
      errs.push(model + ' interactions ' + r.status + (d.error && d.error.message ? ' ' + String(d.error.message).slice(0, 80) : ''));
      r = await fetch(GEMINI_API + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY },
        body: JSON.stringify({ contents: [{ parts: [{ text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } } }) });
      d = await r.json().catch(() => ({})); a = r.ok && findAudio(d);
      if (a) return a;
      errs.push(model + ' generateContent ' + r.status + (d.error && d.error.message ? ' ' + String(d.error.message).slice(0, 80) : ''));
      if (r.status === 429) break;
    } catch (e) { errs.push(model + ' ' + e.message) }
  }
  const e = new Error('Sprachausgabe nicht verfügbar (' + errs.join('; ').slice(0, 300) + ')'); e.code = 'AI'; throw e;
}

// ---------- Strava (Training-Reiter) ----------
// Secrets: STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET. Tokens liegen in KV unter "strava:tokens".
const STRAVA_AUTH = 'https://www.strava.com/oauth/authorize';
const STRAVA_TOKEN = 'https://www.strava.com/oauth/token';
const STRAVA_API = 'https://www.strava.com/api/v3';
async function stravaTokenReq(env, params) {
  const body = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET, ...params });
  const r = await fetch(STRAVA_TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('Strava-Token ' + r.status); e.status = r.status; throw e; }
  return d;
}
async function stravaSave(env, t, prev) {
  const rec = { access: t.access_token, refresh: t.refresh_token || (prev && prev.refresh) || null, expires_at: (t.expires_at ? t.expires_at * 1000 : Date.now() + (t.expires_in || 21600) * 1000), athlete: (t.athlete && { id: t.athlete.id, name: [t.athlete.firstname, t.athlete.lastname].filter(Boolean).join(' ') }) || (prev && prev.athlete) || null, saved_at: Date.now() };
  await env.WB.put('strava:tokens', JSON.stringify(rec));
  return rec;
}
async function stravaAccess(env) {
  if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) { const e = new Error('Strava ist im Worker noch nicht eingerichtet (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET fehlen)'); e.code = 'NO_STRAVA'; throw e; }
  let rec = JSON.parse((await env.WB.get('strava:tokens')) || 'null');
  if (!rec) { const e = new Error('Strava nicht verbunden'); e.code = 'NOT_CONNECTED'; throw e; }
  if (rec.expires_at - 120e3 > Date.now()) return rec.access;
  if (!rec.refresh) { const e = new Error('kein Refresh-Token'); e.code = 'RECONNECT'; throw e; }
  try { rec = await stravaSave(env, await stravaTokenReq(env, { grant_type: 'refresh_token', refresh_token: rec.refresh }), rec); return rec.access; }
  catch (e) { if (e.status === 400 || e.status === 401) e.code = 'RECONNECT'; throw e; }
}
async function stravaGet(env, access, path) {
  const r = await fetch(STRAVA_API + path, { headers: { Authorization: 'Bearer ' + access } });
  if (r.status === 429) { const e = new Error('Strava-Limit erreicht (100 Anfragen je 15 Minuten) – gleich nochmal versuchen'); e.code = 'RATE'; throw e; }
  if (r.status === 401) { const e = new Error('Strava-Zugriff abgelehnt'); e.code = 'RECONNECT'; throw e; }
  if (!r.ok) { const e = new Error('Strava ' + r.status + ' bei ' + path.split('?')[0]); e.status = r.status; throw e; }
  return r.json();
}
// Eine Seite Aktivitäten (200), vereinheitlicht; Schuhnamen werden einmalig nachgeladen und in KV gemerkt.
async function stravaActivities(env, b) {
  const access = await stravaAccess(env);
  const page = Math.max(1, Math.min(parseInt(b.page, 10) || 1, 50));
  const after = Math.max(0, parseInt(b.after, 10) || 0);
  const list = await stravaGet(env, access, '/athlete/activities?per_page=200&page=' + page + (after ? '&after=' + after : ''));
  const gearIds = [...new Set(list.map(a => a.gear_id).filter(Boolean))];
  const gear = {};
  for (const id of gearIds.slice(0, 20)) {
    let n = await env.WB.get('sgear:' + id);
    if (!n) { try { const g = await stravaGet(env, access, '/gear/' + encodeURIComponent(id)); n = [g.brand_name, g.model_name].filter(Boolean).join(' ') || g.name || id; await env.WB.put('sgear:' + id, n); } catch (e) { n = id; } }
    gear[id] = n;
  }
  const acts = list.map(a => ({ id: a.id, t: Date.parse(a.start_date), name: a.name || '', sport_type: a.sport_type || a.type || '', distance: a.distance, moving_time: a.moving_time, elapsed_time: a.elapsed_time, avg_hr: a.average_heartrate || null, max_hr: a.max_heartrate || null, elev: a.total_elevation_gain != null ? a.total_elevation_gain : null, cad: a.average_cadence || null, gear: a.gear_id ? gear[a.gear_id] : null }));
  await env.WB.put('strava:last_sync', JSON.stringify({ at: Date.now(), n: acts.length }));
  return { acts, more: list.length >= 200, page };
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

    // Rückkehr von Strava nach dem Login
    if (url.pathname === '/strava/callback') {
      let ret = env.BOARD_URL; try { ret = new URL('training.html', env.BOARD_URL).href } catch (e) {}
      const back = (q) => Response.redirect(ret + (ret.includes('?') ? '&' : '?') + q, 302);
      const state = url.searchParams.get('state'), code = url.searchParams.get('code');
      if (url.searchParams.get('error')) return back('strava=error');
      if (!state || !code || !(await env.WB.get('sstate:' + state))) return back('strava=badstate');
      await env.WB.delete('sstate:' + state);
      try { await stravaSave(env, await stravaTokenReq(env, { grant_type: 'authorization_code', code }), null); return back('strava=connected'); }
      catch (e) { return back('strava=tokenfail'); }
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
      if (url.pathname === '/strava/start' && request.method === 'POST') {
        if (!env.STRAVA_CLIENT_ID || !env.STRAVA_CLIENT_SECRET) return json(env, { error: 'Strava ist im Worker noch nicht eingerichtet (STRAVA_CLIENT_ID / STRAVA_CLIENT_SECRET fehlen)', code: 'NO_STRAVA' }, 409);
        const state = randomId();
        await env.WB.put('sstate:' + state, '1', { expirationTtl: 600 });
        const q = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, response_type: 'code', redirect_uri: url.origin + '/strava/callback', approval_prompt: 'auto', scope: 'read,activity:read_all', state });
        return json(env, { url: STRAVA_AUTH + '?' + q });
      }
      if (url.pathname === '/strava/status') {
        const rec = JSON.parse((await env.WB.get('strava:tokens')) || 'null');
        return json(env, { configured: !!(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET), connected: !!rec, athlete: rec && rec.athlete, last_sync: JSON.parse((await env.WB.get('strava:last_sync')) || 'null') });
      }
      if (url.pathname === '/strava/activities' && request.method === 'POST') return json(env, await stravaActivities(env, await request.json().catch(() => ({}))));
      if (url.pathname === '/strava/disconnect' && request.method === 'POST') { await env.WB.delete('strava:tokens'); return json(env, { ok: true }); }
      if (url.pathname === '/notion/pages') return json(env, { pages: await notionPages(env) });
      if (url.pathname === '/notion/questions') {
        const id = notionId(url.searchParams.get('id'));
        if (!id) return json(env, { error: 'ungültige ID' }, 400);
        // nur Seiten aus der freigegebenen Lernseite zulassen
        const ok = (await notionPages(env)).some(p => p.id === id);
        if (!ok) return json(env, { error: 'Seite gehört nicht zu den Lernzusammenfassungen' }, 403);
        return json(env, await notionQuestions(env, id));
      }
      if (url.pathname === '/ask' && request.method === 'POST') {
        const b = await request.json().catch(() => ({}));
        return json(env, await askGemini(env, b));
      }
      if (url.pathname === '/ai/providers') return json(env, { gemini: !!env.GEMINI_KEY, ...Object.fromEntries(Object.entries(PROVIDERS).map(([k, p]) => [k, !!env[p.key]])) });
      if (url.pathname === '/stt' && request.method === 'POST') return json(env, await sttGemini(env, await request.json().catch(() => ({}))));
      if (url.pathname === '/tts' && request.method === 'POST') return json(env, await ttsGemini(env, await request.json().catch(() => ({}))));
      if (url.pathname === '/disconnect' && request.method === 'POST') {
        await env.WB.delete('tokens');
        return json(env, { ok: true });
      }
      return json(env, { error: 'unbekannt' }, 404);
    } catch (e) {
      const code = e.code || 'ERROR';
      return json(env, { error: e.message, code }, code === 'NOT_CONNECTED' || code === 'RECONNECT' || code === 'NO_NOTION' || code === 'NO_AI' || code === 'NO_STRAVA' ? 409 : code === 'AI_LIMIT' || code === 'RATE' ? 429 : code === 'RANGE' ? 400 : 502);
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

