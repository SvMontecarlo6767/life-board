// Lokaler Test des MCP-Workers mit Attrappen für Google, Firestore und KV (kein echter Zugriff)
import worker from './worker.js';
import { generateKeyPairSync } from 'node:crypto';
import assert from 'node:assert/strict';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const TOKEN = 'test-token-test-token-test-token-1234';
const kvData = new Map();
const env = {
  MCP_TOKEN: TOKEN, OWNER_UID: 'uid1', FIREBASE_PROJECT_ID: 'proj',
  SA_JSON: JSON.stringify({ client_email: 'sa@proj.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) }),
  WB: { get: async k => kvData.has(k) ? kvData.get(k) : null }
};

// "heute" = Board-Tag laut Worker; wir lesen ihn über get_today und bauen die Testdaten danach
const S = v => ({ stringValue: v }), I = v => ({ integerValue: String(v) }), B = v => ({ booleanValue: v });
const M = o => ({ mapValue: { fields: o } }), A = a => ({ arrayValue: { values: a } });
let puts = 0;
function mkQuestions() {
  const f = (id, o) => ({ name: `projects/proj/databases/(default)/documents/users/uid1/questions/${id}`, fields: o });
  const t = new Date().toISOString().slice(0, 10), past = '2000-01-01', fut = '2999-01-01';
  return [
    f('a', { pageTitle: S('Verres'), pageId: S('p1') }),                                   // neu
    f('b', { pageTitle: S('Verres'), pageId: S('p1'), reps: I(2), stage: I(2), due: S(past) }), // überfällig
    f('c', { pageTitle: S('Stilmittel'), pageId: S('p2'), reps: I(5), stage: I(4), due: S(fut) })
  ];
}
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  if (url.startsWith('https://oauth2.googleapis.com/token')) { puts++; return Response.json({ access_token: 'gtok', expires_in: 3600 }); }
  assert.equal(init.headers.Authorization, 'Bearer gtok');
  assert.ok(init.method !== 'PATCH' && init.method !== 'DELETE' && init.method !== 'PUT', 'nur lesen!');
  if (url.endsWith(':batchGet')) {
    const docs = JSON.parse(init.body).documents;
    return Response.json(docs.map(d => d.endsWith('/' + todayKey)
      ? { found: { name: d, fields: { m: M({ mood: I(4), energy: I(3), feel: S('ruhig') }), alc: B(false), g: A([M({ t: S('x'), done: B(true) }), M({ t: S('y'), done: B(false) })]) } } }
      : { missing: d }));
  }
  if (url.includes('/questions?')) return Response.json({ documents: mkQuestions() });
  throw new Error('unerwartet: ' + url);
};

const call = (body, headers = {}, path = '/mcp') => worker.fetch(new Request('https://x.workers.dev' + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }), env);
const auth = { Authorization: 'Bearer ' + TOKEN };
const rpc = (id, method, params) => ({ jsonrpc: '2.0', id, method, params });

// --- Zugriffsschutz ---
assert.equal((await call(rpc(1, 'ping'))).status, 401, 'ohne Token');
assert.equal((await call(rpc(1, 'ping'), { Authorization: 'Bearer falsch' })).status, 401, 'falsches Token');
assert.equal((await call(rpc(1, 'ping'), {}, '/mcp/falsch')).status, 401, 'falsches Pfad-Token');
assert.equal((await call(rpc(1, 'ping'), {}, '/mcp/' + TOKEN)).status, 200, 'Token im Pfad');
assert.equal((await worker.fetch(new Request('https://x.workers.dev/mcp', { method: 'GET', headers: auth }), env)).status, 405);
assert.equal((await worker.fetch(new Request('https://x.workers.dev/mcp', { method: 'POST', headers: { Authorization: 'Bearer kurz' }, body: '{}' }), { ...env, MCP_TOKEN: 'kurz' })).status, 401, 'zu kurzes Server-Token');

// --- Protokoll ---
let r = await (await call(rpc(1, 'initialize', { protocolVersion: '2025-06-18' }), auth)).json();
assert.equal(r.result.serverInfo.name, 'life-board'); assert.equal(r.result.protocolVersion, '2025-06-18');
assert.equal((await call({ jsonrpc: '2.0', method: 'notifications/initialized' }, auth)).status, 202);
r = await (await call(rpc(2, 'tools/list'), auth)).json();
assert.deepEqual(r.result.tools.map(t => t.name), ['get_today', 'get_week', 'get_learning']);
r = await (await call(rpc(3, 'nix'), auth)).json(); assert.equal(r.error.code, -32601);
r = await (await call(rpc(4, 'tools/call', { name: 'gibtsnicht' }), auth)).json(); assert.equal(r.error.code, -32602);

// --- Tools ---
const tool = async (name, args) => JSON.parse((await (await call(rpc(9, 'tools/call', { name, arguments: args }), auth)).json()).result.content[0].text);
var todayKey = (await tool('get_learning')).tag;
const month = todayKey.slice(0, 7);
kvData.set('m:' + month, JSON.stringify({ [todayKey]: {
  cycle: { score: { strain: 12.34 }, steps: 8000 },
  recovery: { score: { recovery_score: 78, hrv_rmssd_milli: 61.2, resting_heart_rate: 52 } },
  sleep: { start: '2026-10-27T22:00:00Z', end: '2026-10-28T06:30:00Z', score: { sleep_performance_percentage: 91, stage_summary: { total_in_bed_time_milli: 30600000, total_awake_time_milli: 1800000 } } },
  workouts: [{ sport: 'Running', start: '2026-10-28T14:00:00Z', end: '2026-10-28T14:45:00Z', score: { strain: 9.1, average_heart_rate: 150, max_heart_rate: 178 } }]
} }));

const L = await tool('get_learning');
assert.equal(L.fragen_gesamt, 3); assert.equal(L.neu, 1); assert.equal(L.ueberfaellig, 1); assert.equal(L.faellig_heute, 1);
assert.equal(L.stufen[2], 1); assert.equal(L.stufen[4], 1); assert.equal(L.themen.Verres.faellig, 1);

const T = await tool('get_today');
assert.equal(T.whoop.recovery.score, 78); assert.equal(T.whoop.schlaf.stunden, 8); assert.equal(T.whoop.strain, 12.3);
assert.equal(T.whoop.workouts[0].minuten, 45); assert.equal(T.checkin.stimmung.stimmung_1_5, 4);
assert.deepEqual(T.checkin.tagesziele, { erledigt: 1, gesamt: 2 }); assert.equal(T.lernen.ueberfaellig, 1);

const W = await tool('get_week', { days: 3 });
assert.equal(W.tage.length, 3); assert.equal(W.tage[2].tag, todayKey); assert.equal(W.durchschnitt.recovery, 78); assert.equal(W.durchschnitt.workouts_gesamt, 1);
assert.equal((await tool('get_week', { days: 999 })).tage.length, 30, 'Obergrenze 30');
assert.equal((await tool('get_week')).tage.length, 7);

// leerer Tag ohne Whoop/Check-in bricht nichts
kvData.clear(); const E = await tool('get_today'); assert.equal(E.whoop, null);
assert.equal(puts, 1, 'Google-Token wird zwischengespeichert');
console.log('Alle Tests bestanden');
