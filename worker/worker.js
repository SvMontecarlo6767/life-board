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
  const all = await Promise.all([...months].map(mk => env.WB.get('m:' + mk)));   // Monate gleichzeitig lesen statt nacheinander
  all.forEach(raw => { const cur = JSON.parse(raw || '{}'); Object.keys(cur).forEach(d => { if (d >= from && d <= to) out[d] = cur[d]; }); });
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
const AI_TIMEOUT = 15000;   // ms pro Modell, danach das nächste
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
    try {
      const r = await fetch(GEMINI_API + model + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_KEY }, body: JSON.stringify(payload), signal: AbortSignal.timeout(AI_TIMEOUT) });
      return { r, d: await r.json().catch(() => ({})) };
    } catch (e) { return { r: { ok: false, status: 504 }, d: { error: { message: 'Zeitüberschreitung oder keine Verbindung' } } }; }
  };
  const tried = []; let r, d;
  const cached = await env.WB.get('ai_model');
  // Qualität zuerst: großes Flash-Modell, bei Kontingent-/Verfügbarkeitsproblemen das nächstkleinere
  const first = [env.GEMINI_MODEL, 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', cached].filter(Boolean).map(mkModel);
  for (const model of [...new Set(first)]) {
    tried.push(model); ({ r, d } = await call(model));
    if (r.ok) { await env.WB.put('ai_model', model); d = Object.assign({}, d, { _model: model }); break; }
    if (r.status === 400 || r.status === 401) break;   // Anfrage selbst fehlerhaft: andere Modelle helfen nicht
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
  if (!r.ok) { const e = new Error(r.status === 429 ? 'Gemini-Kontingent gerade aufgebraucht (versucht: ' + tried.join(', ') + ')' : 'Gemini ' + r.status + (d && d.error && d.error.message ? ': ' + String(d.error.message).slice(0, 200) : '') + ' (versucht: ' + tried.join(', ') + ')'); e.code = r.status === 429 ? 'AI_LIMIT' : 'AI'; throw e; }
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
  const tools = (Array.isArray(body.tools) ? body.tools : []).slice(0, 12).filter(t => t && /^[a-z_]{1,40}$/.test(t.name || '')).map(t => ({ type: 'function', function: { name: t.name, description: String(t.description || '').slice(0, 2500), parameters: t.parameters || { type: 'object', properties: {} } } }));
  const sys = AI_SYSTEM + (body.voice ? AI_VOICE : '') + (tools.length ? AI_TOOLS : '') + '\n\n' + String(body.context || '').slice(0, 40000);
  const model = env[P.modelVar] || P.model;
  const payload = { model, temperature: 0.4, max_tokens: body.voice ? 300 : 1200, messages: [{ role: 'system', content: sys }].concat(msgs.map(m => ({ role: m.role === 'model' || m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 4000) }))) };
  if (tools.length) { payload.tools = tools; payload.tool_choice = 'auto'; }
  let r;
  try { r = await fetch(P.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env[P.key] }, body: JSON.stringify(payload), signal: AbortSignal.timeout(AI_TIMEOUT) }); }
  catch (e) { const x = new Error(P.name + ': Zeitüberschreitung oder keine Verbindung'); x.code = 'AI'; throw x; }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(P.name + ' ' + r.status + (d.error && d.error.message ? ': ' + String(d.error.message).slice(0, 160) : '')); e.code = r.status === 429 ? 'AI_LIMIT' : 'AI'; throw e; }
  const m = (((d.choices || [])[0]) || {}).message || {};
  const out = String(m.content || '').trim();
  const calls = (m.tool_calls || []).map(c => { let a = {}; try { a = JSON.parse(c.function.arguments || '{}') } catch (e) {} return { name: c.function.name, args: a }; }).slice(0, 3);
  if (!out && !calls.length) { const e = new Error('Keine Antwort erhalten'); e.code = 'AI'; throw e; }
  return { answer: out, calls, model: P.name + ' · ' + (d.model || model) };
}
/* Jarvis soll immer antworten: gewählter Anbieter zuerst, dann Gemini (beste Qualität), dann alle anderen mit Schlüssel.
   Ein Fehler (Überlastung 503, Kontingent 429, falscher Schlüssel, Zeitüberschreitung) führt automatisch zum nächsten. */
const AI_ORDER = ['gemini', 'groq', 'mistral', 'openrouter'];
async function askAI(env, body) {
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  if (!msgs.length) { const e = new Error('keine Frage'); e.code = 'RANGE'; throw e; }
  const has = (p) => p === 'gemini' ? !!env.GEMINI_KEY : !!(PROVIDERS[p] && env[PROVIDERS[p].key]);
  const pv = String(body.provider || 'gemini').toLowerCase();
  const order = [...new Set([pv, ...AI_ORDER])].filter(p => AI_ORDER.includes(p) && has(p));
  if (!order.length) { const e = new Error(PROVIDERS[pv] ? PROVIDERS[pv].key + ' fehlt im Worker – als Secret in Cloudflare eintragen' : 'GEMINI_KEY fehlt'); e.code = 'NO_AI'; throw e; }
  const limit = parseInt(env.AI_DAILY_LIMIT, 10) || 150;
  const used = await aiCount(env, 'ai', limit);
  const errs = []; let limited = true;
  for (const p of order) {
    try {
      const out = p === 'gemini' ? await askGemini(env, body) : await askOther(env, body, p);
      return Object.assign(out, { used, limit, provider: p }, p !== pv ? { fallback: errs.join(' · ') || (pv + ' nicht eingerichtet') } : {});
    } catch (e) {
      if (e.code === 'RANGE') throw e;
      if (e.code !== 'AI_LIMIT') limited = false;
      errs.push(e.message);
    }
  }
  const e = new Error('Keine KI erreichbar: ' + errs.join(' · ')); e.code = limited ? 'AI_LIMIT' : 'AI'; throw e;
}
async function askGemini(env, body) {
  needKey(env);
  const msgs = Array.isArray(body.messages) ? body.messages.slice(-12) : [];
  if (!msgs.length) { const e = new Error('keine Frage'); e.code = 'RANGE'; throw e; }
  const ctx = String(body.context || '').slice(0, 40000);
  const contents = msgs.map(m => ({ role: m.role === 'model' || m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '').slice(0, 4000) }] }));
  const decl = (Array.isArray(body.tools) ? body.tools : []).slice(0, 12).filter(t => t && /^[a-z_]{1,40}$/.test(t.name || '')).map(t => ({ name: t.name, description: String(t.description || '').slice(0, 2500), parameters: t.parameters }));
  const payload = { systemInstruction: { parts: [{ text: AI_SYSTEM + (body.voice ? AI_VOICE : '') + (decl.length ? AI_TOOLS : '') + '\n\n' + ctx }] }, contents, generationConfig: { temperature: 0.4, maxOutputTokens: body.voice ? 300 : 1200 } };
  if (decl.length) { payload.tools = [{ functionDeclarations: decl }]; payload.toolConfig = { functionCallingConfig: { mode: 'AUTO' } }; }
  const d = await geminiGenerate(env, payload);
  const out = textOf(d);
  const parts = (((d.candidates || [])[0] || {}).content || {}).parts || [];
  const calls = parts.filter(p => p.functionCall && p.functionCall.name).map(p => ({ name: p.functionCall.name, args: p.functionCall.args || {} })).slice(0, 3);
  if (!out && !calls.length) { const e = new Error('Keine Antwort erhalten (evtl. blockiert)'); e.code = 'AI'; throw e; }
  return { answer: out, calls, model: d._model || null };
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

// ---------- Tagesüberblick (Nachrichten aus RSS/Atom, ohne KI) ----------
// Nur das Wichtige (kein Sport): Top-Meldungen in der Reihenfolge der Redaktion, dazu Technik & Wissen.
// Pro Bereich mehrere Quellen; fällt eine aus, reichen die anderen. Kurztexte stammen von den Redaktionen.
const NEWS_SECTIONS = [
  { id: 'welt', title: 'Deutschland & Welt', max: 8, feeds: [['tagesschau', 'https://www.tagesschau.de/index~rss2.xml'], ['tagesschau Inland', 'https://www.tagesschau.de/inland/index~rss2.xml'], ['tagesschau Ausland', 'https://www.tagesschau.de/ausland/index~rss2.xml']] },
  { id: 'tech', title: 'Technik & Wissen', max: 4, feeds: [['heise', 'https://www.heise.de/rss/heise-top-atom.xml'], ['heise', 'https://www.heise.de/newsticker/heise-top-atom.xml'], ['tagesschau Wissen', 'https://www.tagesschau.de/wissen/index~rss2.xml']] }
];
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', shy: '' };
const unent = t => String(t || '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : (ENT[e.toLowerCase()] ?? m));
const untag = t => unent(String(t || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
function tagOf(x, names) { for (const n of names) { const m = new RegExp('<' + n + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + n + '>', 'i').exec(x); if (m) return m[1] } return '' }
/* RSS 2.0 und Atom -> [{t, s, url, time}] */
function parseFeed(xml) {
  const out = [], blocks = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  for (const b of blocks) {
    const t = untag(tagOf(b, ['title'])); if (!t) continue;
    let url = untag(tagOf(b, ['link'])); if (!/^https?:/.test(url)) { const m = /<link[^>]*?href="([^"]+)"[^>]*?(?:rel="alternate"[^>]*)?\/?>/i.exec(b); url = m ? unent(m[1]) : '' }
    let txt = untag(tagOf(b, ['description', 'summary', 'content:encoded', 'content']));
    if (txt.length > 260) { const cut = txt.slice(0, 260), dot = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? ')); txt = dot > 80 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, '') + ' …' }
    const d = Date.parse(untag(tagOf(b, ['pubDate', 'published', 'updated', 'dc:date'])));
    out.push({ t, s: txt === t ? '' : txt, url: /^https:\/\//.test(url) ? url : '', time: isNaN(d) ? null : d });
  }
  return out;
}
async function newsBuild(env, nowMs) {
  const sources = [], sections = [];
  await Promise.all(NEWS_SECTIONS.map(async sec => {
    const got = await Promise.all(sec.feeds.map(async ([name, url]) => {
      try { const r = await fetch(url, { headers: { 'User-Agent': 'LifeBoard/1.0 (privat)', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error(String(r.status)); const items = parseFeed(await r.text()); sources.push({ name, sec: sec.id, ok: items.length > 0 }); return items.map(x => Object.assign(x, { src: name.split(' ')[0] })) }
      catch (e) { sources.push({ name, sec: sec.id, ok: false }); return [] }
    }));
    const seen = new Set(), all = [];
    got.forEach((list, fi) => list.forEach((x, i) => { const k = x.t.toLowerCase().replace(/[^a-zäöüß0-9]+/g, ' ').trim().slice(0, 60); if (seen.has(k)) return; seen.add(k); all.push(Object.assign(x, { rank: fi * 0.5 + i })) }));
    const fresh = all.filter(x => !x.time || nowMs - x.time < 36 * 3600e3);
    fresh.forEach(x => { if (sec.prefer && sec.prefer.test(x.t + ' ' + x.s)) x.rank -= 6 });   // Bundesliga, CL, Nationalteam zuerst
    sections.push({ id: sec.id, title: sec.title, items: fresh.sort((a, b) => a.rank - b.rank).slice(0, sec.max).map(({ rank, ...x }) => x) });
  }));
  sections.sort((a, b) => NEWS_SECTIONS.findIndex(s => s.id === a.id) - NEWS_SECTIONS.findIndex(s => s.id === b.id));
  const words = sections.reduce((n, s) => n + s.items.reduce((m, x) => m + (x.t + ' ' + x.s).split(/\s+/).length, 0), 0);
  const n = sections.reduce((k, s) => k + s.items.length, 0);
  const res = { at: nowMs, day: berlinNow(nowMs).day, n, minutes: Math.max(1, Math.round(words / 200)), sections, sources };
  if (n) await env.WB.put('news:latest', JSON.stringify(res));
  return res;
}
async function newsGet(env, nowMs, force) {
  const old = JSON.parse((await env.WB.get('news:latest')) || 'null');
  if (!force && old && nowMs - old.at < 3 * 3600e3) return old;
  const fresh = await newsBuild(env, nowMs);
  return fresh.n ? fresh : (old ? Object.assign(old, { stale: true, sources: fresh.sources }) : fresh);
}

// ---------- Benachrichtigungen (Web Push mit VAPID, RFC 8291/8292) ----------
// Schlüssel erzeugt der Worker beim ersten Mal selbst und legt sie in KV ab (kein Secret nötig).
// Zeitplan: die Seite schickt Tagesziele mit Glocke; der Cron (alle 5 Minuten) verschickt fällige Erinnerungen,
// nie in der Ruhezeit (Standard Mo–Fr 8:00–15:30), höchstens PUSH_MAX pro Tag.
const PUSH_KEY = 'push:cfg', PUSH_MAX = 4, PUSH_LATE = 120;
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; a.forEach(x => { o.set(x, i); i += x.length }); return o };
async function vapidKeys(env) {
  let k = JSON.parse((await env.WB.get('push:vapid')) || 'null');
  if (!k) { const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']); k = { priv: await crypto.subtle.exportKey('jwk', kp.privateKey), pub: b64u(await crypto.subtle.exportKey('raw', kp.publicKey)) }; await env.WB.put('push:vapid', JSON.stringify(k)); }
  return k;
}
async function vapidAuth(env, endpoint) {
  const k = await vapidKeys(env), jh = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const jc = b64u(enc.encode(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: 'mailto:' + (env.OWNER_EMAIL || 'life-board@example.com') })));
  const key = await crypto.subtle.importKey('jwk', k.priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(jh + '.' + jc));
  return 'vapid t=' + jh + '.' + jc + '.' + b64u(sig) + ', k=' + k.pub;
}
async function hkdf(salt, ikm, info, len) { const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8)) }
async function encryptPush(sub, text) {
  const ua = b64uToBytes(sub.keys.p256dh), auth = b64uToBytes(sub.keys.auth);
  const as = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', as.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const ikm = await hkdf(auth, shared, cat(enc.encode('WebPush: info\0'), ua, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), nonce = await hkdf(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12);
  const key = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, cat(enc.encode(text), new Uint8Array([2]))));
  return cat(salt, new Uint8Array([0, 0, 16, 0]), new Uint8Array([65]), asPub, ct);
}
async function sendPush(env, sub, msg) {
  const r = await fetch(sub.endpoint, { method: 'POST', headers: { 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '7200', Urgency: 'high', Authorization: await vapidAuth(env, sub.endpoint) }, body: await encryptPush(sub, JSON.stringify(msg)) });
  return r.status;
}
const PUSH_DEF = { subs: [], quiet: { days: [1, 2, 3, 4, 5], from: '08:00', to: '15:30' }, morning: { on: true, wd: '06:45', we: '09:30' }, news: { on: true, wd: '06:45', we: '09:30' }, lead: 0, items: [], done: {}, sent: {} };
async function pushCfg(env) { return Object.assign({}, PUSH_DEF, JSON.parse((await env.WB.get(PUSH_KEY)) || '{}')) }
const hmOk = v => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '');
function berlinNow(ms) {
  const p = {}; new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value });
  const day = p.year + '-' + p.month + '-' + p.day;
  return { day, hm: p.hour + ':' + p.minute, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), wall: wallMin(day, p.hour + ':' + p.minute) };
}
function wallMin(day, hm) { const [y, m, d] = day.split('-').map(Number), [h, mi] = hm.split(':').map(Number); return Date.UTC(y, m - 1, d, h, mi) / 60000 }
const inQuiet = (q, dow, hm) => !!q && (q.days || []).includes(dow) && hm >= q.from && hm < q.to;
/* Welche Nachrichten sind jetzt fällig? Reine Funktion (auch für Tests). */
function pushDue(cfg, nowMs) {
  const n = berlinNow(nowMs), out = [], sentToday = (cfg.sent[n.day] || []).length;
  if (inQuiet(cfg.quiet, n.dow, n.hm)) return out;
  const quietEndToday = cfg.quiet && (cfg.quiet.days || []).includes(n.dow) ? wallMin(n.day, cfg.quiet.to) : null;
  for (const it of cfg.items || []) {
    if (!hmOk(it.at) || !it.day) continue;
    const calDay = it.at < '04:00' ? new Date(Date.parse(it.day + 'T12:00:00Z') + 864e5).toISOString().slice(0, 10) : it.day;   // Board-Tag wechselt um 4 Uhr
    const due = wallMin(calDay, it.at) - (cfg.lead || 0), late = n.wall - due, key = 'g:' + it.id;
    if (late < 0 || (cfg.sent[calDay] || []).includes(key)) continue;
    const deferred = quietEndToday != null && calDay === n.day && due < quietEndToday && n.wall >= quietEndToday && n.wall - quietEndToday <= 30;   // in der Schulzeit fällig: direkt danach
    if (late <= PUSH_LATE || deferred) out.push({ day: calDay, key, msg: { title: '🎯 ' + it.title, body: deferred ? 'Geplant für ' + it.at + ' Uhr' : (cfg.lead ? 'In ' + cfg.lead + ' Minuten · ' : '') + it.at + ' Uhr', url: 'checkin.html?v=1', tag: key } });
  }
  const m = cfg.morning || {}, mt = n.dow === 0 || n.dow === 6 ? m.we : m.wd;
  if (m.on && hmOk(mt) && !cfg.done[n.day] && !(cfg.sent[n.day] || []).includes('morning') && n.wall >= wallMin(n.day, mt) && n.wall - wallMin(n.day, mt) <= 180)
    out.push({ day: n.day, key: 'morning', msg: { title: '☀️ Morgen-Check', body: 'Wie fühlst du dich? Kurz eintragen, bevor du auf Whoop schaust.', url: 'checkin.html?v=1', tag: 'morning' } });
  const nw = cfg.news || {}, nt = n.dow === 0 || n.dow === 6 ? nw.we : nw.wd;
  if (nw.on && hmOk(nt) && !(cfg.sent[n.day] || []).includes('news') && n.wall >= wallMin(n.day, nt) && n.wall - wallMin(n.day, nt) <= 180) {
    const mi = out.findIndex(o => o.key === 'morning');
    const nd = { day: n.day, key: 'news', news: true, msg: { title: '📰 Dein Tagesüberblick', body: 'Das Wichtigste aus Deutschland & Welt, Technik und Wissen.', url: 'news.html?v=1', tag: 'news' } };
    if (mi >= 0) { out[mi] = Object.assign(nd, { also: 'morning', msg: { title: '☀️ Guten Morgen', body: 'Kurz einchecken – danach wartet dein Tagesüberblick.', url: 'checkin.html?v=1&news=1', tag: 'morning' } }) }   // eine Nachricht statt zwei
    else out.push(nd);
  }
  return out.slice(0, Math.max(0, (cfg.max || PUSH_MAX) - sentToday));
}
async function pushRun(env, nowMs) {
  const cfg = await pushCfg(env); if (!cfg.subs.length) return 0;
  const due = pushDue(cfg, nowMs); let sent = 0;
  for (const d of due) {
    if (d.news) { try { const nz = await newsGet(env, nowMs, true); if (nz.n) d.msg.body = d.also ? 'Kurz einchecken – danach dein Überblick: ' + nz.n + ' Meldungen, ' + nz.minutes + ' Min.' : nz.n + ' Meldungen · ca. ' + nz.minutes + ' Min Lesezeit' } catch (e) {} }
    for (const sub of cfg.subs.slice()) {
      try { const st = await sendPush(env, sub, d.msg); if (st === 404 || st === 410) cfg.subs = cfg.subs.filter(x => x.endpoint !== sub.endpoint); else if (st < 300) sent++ } catch (e) {}
    }
    (cfg.sent[d.day] = cfg.sent[d.day] || []).push(d.key); if (d.also) cfg.sent[d.day].push(d.also);
  }
  const keep = new Date(nowMs - 3 * 864e5).toISOString().slice(0, 10), before = JSON.stringify(cfg.sent) + JSON.stringify(cfg.done) + cfg.items.length;
  ['sent', 'done'].forEach(k => Object.keys(cfg[k]).forEach(day => { if (day < keep) delete cfg[k][day] }));
  cfg.items = cfg.items.filter(it => it.day >= keep);
  if (due.length || before !== JSON.stringify(cfg.sent) + JSON.stringify(cfg.done) + cfg.items.length) await env.WB.put(PUSH_KEY, JSON.stringify(cfg));   // KV nur bei Änderung schreiben
  return sent;
}
async function pushApi(env, path, b) {
  const cfg = await pushCfg(env);
  if (path === '/push/key') return { key: (await vapidKeys(env)).pub };
  if (path === '/push/status') return { subs: cfg.subs.length, quiet: cfg.quiet, morning: cfg.morning, news: cfg.news, lead: cfg.lead, items: cfg.items.length };
  if (path === '/push/subscribe') {
    const s = b.sub; if (!s || !/^https:\/\//.test(s.endpoint || '') || !s.keys || !s.keys.p256dh || !s.keys.auth) { const e = new Error('ungültiges Abo'); e.code = 'RANGE'; throw e; }
    cfg.subs = cfg.subs.filter(x => x.endpoint !== s.endpoint).concat({ endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } }).slice(-5);
  } else if (path === '/push/unsubscribe') cfg.subs = cfg.subs.filter(x => x.endpoint !== b.endpoint);
  else if (path === '/push/config') {
    if (b.quiet && hmOk(b.quiet.from) && hmOk(b.quiet.to)) cfg.quiet = { days: (b.quiet.days || []).filter(d => d >= 0 && d <= 6), from: b.quiet.from, to: b.quiet.to };
    if (b.morning) cfg.morning = { on: !!b.morning.on, wd: hmOk(b.morning.wd) ? b.morning.wd : cfg.morning.wd, we: hmOk(b.morning.we) ? b.morning.we : cfg.morning.we };
    if (b.news) cfg.news = { on: !!b.news.on, wd: hmOk(b.news.wd) ? b.news.wd : cfg.news.wd, we: hmOk(b.news.we) ? b.news.we : cfg.news.we };
    if (b.lead != null) cfg.lead = Math.max(0, Math.min(120, parseInt(b.lead, 10) || 0));
  } else if (path === '/push/schedule') {
    const days = new Set((b.days || []).filter(validDate));
    cfg.items = cfg.items.filter(it => !days.has(it.day)).concat((b.items || []).filter(it => it && days.has(it.day) && hmOk(it.at) && it.title).slice(0, 20).map(it => ({ id: String(it.id || it.at + it.title).slice(0, 80), day: it.day, at: it.at, title: String(it.title).slice(0, 120) })));
  } else if (path === '/push/done') { if (validDate(b.day)) cfg.done[b.day] = true }
  else if (path === '/push/test') {
    let ok = 0; for (const sub of cfg.subs.slice()) { try { const st = await sendPush(env, sub, { title: '✅ Life Board', body: 'So sehen deine Erinnerungen aus.', url: 'checkin.html?v=1', tag: 'test' }); if (st < 300) ok++; else if (st === 404 || st === 410) cfg.subs = cfg.subs.filter(x => x.endpoint !== sub.endpoint) } catch (e) {} }
    await env.WB.put(PUSH_KEY, JSON.stringify(cfg));
    return { sent: ok, subs: cfg.subs.length };
  } else { const e = new Error('unbekannt'); e.code = 'RANGE'; throw e; }
  await env.WB.put(PUSH_KEY, JSON.stringify(cfg));
  return { ok: true, subs: cfg.subs.length };
}

globalThis.__lbPush = { pushDue, encryptPush, berlinNow, parseFeed };   // nur für Tests
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
        return json(env, await askAI(env, b));
      }
      if (url.pathname === '/news') return json(env, await newsGet(env, Date.now(), url.searchParams.get('refresh') === '1'));
      if (url.pathname.startsWith('/push/')) return json(env, await pushApi(env, url.pathname, request.method === 'POST' ? await request.json().catch(() => ({})) : {}));
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
  // Cron am besten alle 5 Minuten (für pünktliche Erinnerungen); Whoop wird trotzdem nur alle 30 Minuten abgeholt.
  async scheduled(event, env, ctx) {
    const t = event.scheduledTime || Date.now();
    ctx.waitUntil((async () => {
      try { await pushRun(env, t); } catch (e) {}
      if (new Date(t).getUTCMinutes() % 30 >= 5) return;
      try { await syncRange(env, daysAgo(3), today()); }
      catch (e) { await env.WB.put('last_error', JSON.stringify({ at: Date.now(), msg: e.message })); }
    })());
  }
};

