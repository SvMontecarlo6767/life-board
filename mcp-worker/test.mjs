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
const journalMap = {}, trainMap = {};
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
    return Response.json(docs.map(d => {
      const [col, id] = d.split('/').slice(-2), f = (col === 'journal' ? journalMap : col === 'training' ? trainMap : {})[id];
      return f ? { found: { name: d, fields: f } } : { missing: d };
    }));
  }
  if (url.includes('/journal?')) return Response.json({ documents: Object.entries(journalMap).map(([id, fields]) => ({ name: `projects/proj/databases/(default)/documents/users/uid1/journal/${id}`, fields })) });
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
assert.deepEqual(r.result.tools.map(t => t.name), ['get_today', 'get_week', 'get_range', 'get_gym', 'get_correlations', 'get_learning']);
r = await (await call(rpc(3, 'nix'), auth)).json(); assert.equal(r.error.code, -32601);
r = await (await call(rpc(4, 'tools/call', { name: 'gibtsnicht' }), auth)).json(); assert.equal(r.error.code, -32602);

// --- Tools ---
const tool = async (name, args) => JSON.parse((await (await call(rpc(9, 'tools/call', { name, arguments: args }), auth)).json()).result.content[0].text);
var todayKey = (await tool('get_learning')).tag;
journalMap[todayKey] = { m: M({ mood: I(4), energy: I(3), feel: S('ruhig') }), alc: B(false), g: A([M({ t: S('x'), done: B(true) }), M({ t: S('y'), done: B(false) })]) };
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

// ===== Jahresabfrage, Gym, Zusammenhänge =====
// 300 Tage künstliche Daten: Alkohol senkt die Recovery am NÄCHSTEN Tag um ca. 25 Punkte, mehr Strain senkt sie leicht
const DAYS = 300, start = new Date(todayKey + 'T00:00:00Z').getTime() - (DAYS - 1) * 864e5;
const key = i => new Date(start + i * 864e5).toISOString().slice(0, 10);
function addD(k, n) { return new Date(Date.parse(k) + n * 864e5).toISOString().slice(0, 10); }
const months = {}; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
let prevAlc = 0, prevStrain = 10;
const gymList = {};
for (let i = 0; i < DAYS; i++) {
  const k = key(i), alc = rnd() < 0.25 ? 1 : 0, strain = 6 + rnd() * 12;
  const rec = Math.max(5, Math.min(99, 80 - 25 * prevAlc - 1.0 * (prevStrain - 12) + (rnd() - 0.5) * 10));
  (months[k.slice(0, 7)] ||= {})[k] = {
    cycle: { score: { strain }, steps: 5000 + Math.round(rnd() * 5000) },
    recovery: { score: { recovery_score: rec, hrv_rmssd_milli: 40 + rec / 3, resting_heart_rate: 60 - rec / 10 } },
    sleep: { start: k + 'T21:30:00Z', end: addD(k, 1) + 'T05:30:00Z', tz: '+02:00', score: { sleep_performance_percentage: 80, stage_summary: { total_in_bed_time_milli: 29e6, total_awake_time_milli: 1e6 } } },
    workouts: i % 3 === 0 ? [{ sport: 'Run', start: k + 'T15:00:00Z', end: k + 'T15:30:00Z', score: { strain: 8, average_heart_rate: 150, max_heart_rate: 175 } }] : []
  };
  journalMap[k] = { m: M({ mood: I(3 + (rnd() < 0.5 ? 1 : 0)), energy: I(3) }), alc: B(!!alc) };
  if (i % 4 === 0) (gymList[k.slice(0, 4)] ||= []).push({ mapValue: { fields: { d: S(k), m: I(60), x: I(7), p: S('Push'), e: A([M({ n: S('Bankdrücken'), s: A([M({ w: I(60), r: I(8) }), M({ w: I(70), r: I(5) })]) }), M({ n: S('Kniebeuge'), s: A([M({ w: I(100), r: I(5) })]) })]) } } });
  prevAlc = alc; prevStrain = strain;
}
Object.entries(months).forEach(([m, v]) => kvData.set('m:' + m, JSON.stringify(v)));
Object.entries(gymList).forEach(([y, list]) => { trainMap['gym_' + y] = { list: { arrayValue: { values: list } } }; });

const raw = async (name, args) => (await (await call(rpc(9, 'tools/call', { name, arguments: args }), auth)).json()).result.content[0].text;
const csv = await raw('get_range', { days: 300 });
const lines = csv.split('\n'), header = lines.findIndex(l => l.startsWith('date,'));
assert.equal(lines.length - header - 1, 300, '300 Zeilen');
const cols = lines[header].split(',');
const lastRow = lines[lines.length - 1].split(',');
assert.equal(lastRow[0], todayKey);
assert.ok(lastRow[cols.indexOf('rec')] !== '', 'Recovery vorhanden');
assert.equal(lastRow[cols.indexOf('bed')], '23.5', 'Einschlafen 21:30 UTC +02:00 = 23:30');
assert.ok(csv.includes('Der Tag wechselt um 4 Uhr'), 'Legende');
const small = await raw('get_range', { days: 10, columns: ['rec', 'alc'] });
assert.equal(small.split('\n').find(l => l.startsWith('date,')), 'date,rec,alc');
assert.equal((await raw('get_range', { days: 9999 })).split('\n').filter(l => /^\d{4}-/.test(l)).length, 400, 'Obergrenze 400');
assert.equal((await raw('get_range', { from: key(10), to: key(14) })).split('\n').filter(l => /^\d{4}-/.test(l)).length, 5, 'from/to');

const C = JSON.parse(await raw('get_correlations', { days: 300 }));
const top = C.staerkste_zusammenhaenge;
assert.ok(top.length > 0 && top.length <= 20);
const alcRec = top.find(x => x.x === 'alc' && x.y === 'rec' && x.vortag);
assert.ok(alcRec && alcRec.r < -0.4, 'Alkohol gestern senkt Recovery: ' + JSON.stringify(alcRec));
assert.ok(alcRec.mittel_bei_ja < alcRec.mittel_bei_nein - 15);
const P = JSON.parse(await raw('get_correlations', { days: 300, x: 'alc', y: 'rec', lag: 1 })).ergebnis;
assert.ok(P.r < -0.4 && P.vortag === true && P.n > 250);
const P0 = JSON.parse(await raw('get_correlations', { days: 300, x: 'alc', y: 'rec', lag: 0 })).ergebnis;
assert.ok(Math.abs(P0.r) < 0.3, 'gleicher Tag zeigt kaum Zusammenhang');
const SC = JSON.parse(await raw('get_correlations', { days: 300, x: 'strain', y: 'rec', lag: 1 })).ergebnis;
assert.ok(SC.r < -0.1 && SC.mittel_y_bei_hohem_x < SC.mittel_y_bei_niedrigem_x);

const G = JSON.parse(await raw('get_gym', { days: 300 }));
assert.equal(G.einheiten, 75); assert.equal(G.uebungen['Bankdrücken'].bester_e1rm_kg, 81.7); assert.equal(G.uebungen['Bankdrücken'].bester_satz, '70x5');
assert.equal(G.letzte_einheiten.length, 30); assert.equal(G.letzte_einheiten[0].uebungen[0].saetze, '60x8, 70x5');
const G2 = JSON.parse(await raw('get_gym', { days: 300, exercise: 'knie' }));
assert.deepEqual(Object.keys(G2.uebungen), ['Kniebeuge']); assert.equal(G2.uebungen.Kniebeuge.bester_satz, '100x5');
assert.ok(lines.slice(header + 1).some(l => l.split(',')[cols.indexOf('gym_sets')] === '3'), 'Gym-Sätze in Tagestabelle');
console.log('Alle Tests bestanden');
