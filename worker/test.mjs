// Lokaler Test des Workers mit Attrappen für KV und Netzwerk (kein echter Whoop-Zugriff!)
import worker from './worker.js';
import { generateKeyPairSync, createSign } from 'node:crypto';
import assert from 'node:assert/strict';

const kv = () => { const m = new Map(); return { m, get: async k => m.has(k) ? m.get(k) : null, put: async (k, v) => { m.set(k, v) }, delete: async k => { m.delete(k) } } };
const env = { WB: kv(), WHOOP_CLIENT_ID: 'cid', WHOOP_CLIENT_SECRET: 'sec', OWNER_EMAIL: 'Me@Example.com', FIREBASE_PROJECT_ID: 'proj', ALLOWED_ORIGIN: 'https://x.github.io', BOARD_URL: 'https://x.github.io/life-board/index.html' };

// --- Firebase-Token mit eigenem Schlüssel erzeugen ---
const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };
const b64u = b => Buffer.from(b).toString('base64url');
function token(over = {}) {
  const now = Math.floor(Date.now() / 1000);
  const h = b64u(JSON.stringify({ alg: 'RS256', kid: 'k1', typ: 'JWT' }));
  const p = b64u(JSON.stringify({ aud: 'proj', iss: 'https://securetoken.google.com/proj', sub: 'u1', iat: now - 5, exp: now + 3000, email: 'me@example.com', email_verified: true, ...over }));
  const s = createSign('RSA-SHA256').update(h + '.' + p).sign(privateKey).toString('base64url');
  return h + '.' + p + '.' + s;
}

// --- Netzwerk-Attrappe ---
let calls = [], refreshCount = 0;
const cycles = [{ id: 11, start: '2026-10-13T05:10:00.000Z', end: '2026-10-14T05:00:00.000Z', timezone_offset: '+02:00', score_state: 'SCORED', score: { strain: 12.3 } }, { id: 12, start: '2026-10-14T05:00:00.000Z', timezone_offset: '+02:00', score_state: 'PENDING_SCORE' }];
const recoveries = [{ cycle_id: 11, sleep_id: 's1', score_state: 'SCORED', score: { recovery_score: 71, hrv_rmssd_milli: 64.2, resting_heart_rate: 51 } }];
const sleeps = [{ id: 's1', start: '2026-10-12T21:00:00.000Z', end: '2026-10-13T05:10:00.000Z', timezone_offset: '+02:00', nap: false, score_state: 'SCORED', score: { sleep_performance_percentage: 88 } }, { id: 's2', start: '2026-10-13T11:00:00.000Z', end: '2026-10-13T11:30:00.000Z', timezone_offset: '+02:00', nap: true, score_state: 'SCORED', score: {} }];
const workouts = [{ id: 'w1', sport_name: 'running', start: '2026-10-13T16:00:00.000Z', end: '2026-10-13T17:00:00.000Z', timezone_offset: '+02:00', score_state: 'SCORED', score: { strain: 9 } }];
globalThis.fetch = async (url, opts = {}) => {
  url = String(url); calls.push(url);
  const ok = d => new Response(JSON.stringify(d), { status: 200 });
  if (url.includes('securetoken')) return ok({ keys: [jwk] });
  if (url.endsWith('/oauth2/token')) {
    const body = new URLSearchParams(opts.body);
    if (body.get('grant_type') === 'refresh_token') { refreshCount++; if (body.get('refresh_token') !== 'R' + refreshCount) return new Response('{"error":"invalid_grant"}', { status: 400 }); return ok({ access_token: 'A' + (refreshCount + 1), refresh_token: 'R' + (refreshCount + 1), expires_in: 3600 }); }
    return ok({ access_token: 'A1', refresh_token: 'R1', expires_in: 3600 });
  }
  if (!String(opts.headers?.Authorization || '').startsWith('Bearer A')) return new Response('no', { status: 401 });
  if (url.includes('/v2/cycle')) return ok({ records: cycles });
  if (url.includes('/v2/recovery')) return ok({ records: recoveries });
  if (url.includes('/v2/activity/sleep')) return ok({ records: sleeps });
  if (url.includes('/v2/activity/workout')) return ok({ records: workouts });
  if (url.includes('/user/profile/basic')) return ok({ first_name: 'Test' });
  return new Response('?', { status: 404 });
};

const req = (path, { method = 'GET', tok = token(), body } = {}) => new Request('https://w.example' + path, { method, headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
const call = async (...a) => { const r = await worker.fetch(req(...a), env); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers } };

// 1) Zugriffsschutz
assert.equal((await call('/status', { tok: 'abc' })).status, 401, 'Müll-Token abgelehnt');
assert.equal((await call('/status', { tok: token({ email: 'other@x.com' }) })).status, 401, 'fremde E-Mail abgelehnt');
assert.equal((await call('/status', { tok: token({ email_verified: false }) })).status, 401, 'unbestätigte E-Mail abgelehnt');
assert.equal((await call('/status', { tok: token({ aud: 'andere' }) })).status, 401, 'falsches Projekt abgelehnt');
assert.equal((await call('/status', { tok: token({ exp: 1 }) })).status, 401, 'abgelaufen abgelehnt');
const bad = token().split('.'); bad[1] = b64u(JSON.stringify({ aud: 'proj', iss: 'https://securetoken.google.com/proj', sub: 'u1', iat: 1, exp: 9e9, email: 'me@example.com', email_verified: true })); 
assert.equal((await call('/status', { tok: bad.join('.') })).status, 401, 'manipulierte Signatur abgelehnt');
const st0 = await call('/status'); assert.equal(st0.status, 200); assert.equal(st0.body.connected, false);
assert.equal(st0.headers.get('access-control-allow-origin'), 'https://x.github.io');
console.log('✓ Zugriffsschutz');

// 2) Verbinden
const start = await call('/start', { method: 'POST' });
const authUrl = new URL(start.body.url); const state = authUrl.searchParams.get('state');
assert.equal(authUrl.origin + authUrl.pathname, 'https://api.prod.whoop.com/oauth/oauth2/auth');
assert.equal(authUrl.searchParams.get('redirect_uri'), 'https://w.example/callback');
assert.ok(authUrl.searchParams.get('scope').includes('offline'));
let cb = await worker.fetch(new Request('https://w.example/callback?code=c&state=falsch'), env);
assert.ok(cb.headers.get('location').endsWith('whoop=badstate'));
cb = await worker.fetch(new Request('https://w.example/callback?code=c&state=' + state), env);
assert.ok(cb.headers.get('location').endsWith('whoop=connected'));
cb = await worker.fetch(new Request('https://w.example/callback?code=c&state=' + state), env);
assert.ok(cb.headers.get('location').endsWith('whoop=badstate'), 'state nur einmal gültig');
assert.equal((await call('/status')).body.connected, true);
console.log('✓ Verbinden');

// 3) Sync + Zuordnung
const sync = await call('/sync', { method: 'POST', body: { from: '2026-10-10', to: '2026-10-14' } });
assert.equal(sync.status, 200, JSON.stringify(sync.body));
const data = (await call('/data?from=2026-10-10&to=2026-10-14')).body.days;
assert.deepEqual(Object.keys(data).sort(), ['2026-10-13', '2026-10-14']);
assert.equal(data['2026-10-13'].recovery.score.recovery_score, 71);
assert.equal(data['2026-10-13'].sleep.id, 's1');
assert.equal(data['2026-10-13'].naps.length, 1);
assert.equal(data['2026-10-13'].workouts[0].sport, 'running');
assert.equal(data['2026-10-14'].cycle.state, 'PENDING_SCORE');
console.log('✓ Sync und Tageszuordnung');

// 4) Token-Erneuerung mit Rotation
const rec = JSON.parse(env.WB.m.get('tokens')); rec.expires_at = Date.now() - 1000; env.WB.m.set('tokens', JSON.stringify(rec));
assert.equal((await call('/check')).status, 200);
let t = JSON.parse(env.WB.m.get('tokens')); assert.equal(t.refresh, 'R2'); assert.equal(refreshCount, 1);
t.expires_at = Date.now() - 1; env.WB.m.set('tokens', JSON.stringify(t));
assert.equal((await call('/check')).status, 200);
assert.equal(JSON.parse(env.WB.m.get('tokens')).refresh, 'R3', 'immer das neueste Refresh-Token behalten');
// kaputtes Refresh-Token → Wiederverbinden nötig
t = JSON.parse(env.WB.m.get('tokens')); t.refresh = 'kaputt'; t.expires_at = 0; env.WB.m.set('tokens', JSON.stringify(t));
const dead = await call('/sync', { method: 'POST', body: { days: 3 } });
assert.equal(dead.status, 409); assert.equal(dead.body.code, 'RECONNECT');
assert.equal((await call('/status')).body.needs_reconnect, true);
console.log('✓ Token-Erneuerung und Wiederverbinden');

// 5) Zeitraum-Schutz
assert.equal((await call('/sync', { method: 'POST', body: { from: '2020-01-01', to: '2026-10-14' } })).status, 400);
console.log('✓ Zeitraum-Schutz');

// 6) Regression: Einschlafen vor/nach Mitternacht darf keine Lücken erzeugen
{
  const env2 = { ...env, WB: kv() };
  env2.WB.m.set('tokens', JSON.stringify({ access: 'A9', refresh: 'R9', expires_at: Date.now() + 3e6 }));
  const C = [], R = [], S = [];
  for (let n = 0; n < 7; n++) {
    const wake = Date.parse('2026-10-0' + (n + 1) + 'T05:00:00Z');           // 07:00 Ortszeit (+02:00)
    const onset = n % 2 === 0 ? wake - 8.5 * 3600e3 : wake - 6.5 * 3600e3;    // 22:30 oder 00:30 Ortszeit
    C.push({ id: 100 + n, start: new Date(onset).toISOString(), timezone_offset: '+02:00', score_state: 'SCORED', score: { strain: 10 + n } });
    S.push({ id: 'x' + n, start: new Date(onset).toISOString(), end: new Date(wake).toISOString(), timezone_offset: '+02:00', nap: false, score_state: 'SCORED', score: { sleep_performance_percentage: 80 + n } });
    R.push({ cycle_id: 100 + n, sleep_id: 'x' + n, score_state: 'SCORED', score: { recovery_score: 50 + n } });
  }
  cycles.splice(0, cycles.length, ...C); recoveries.splice(0, recoveries.length, ...R); sleeps.splice(0, sleeps.length, ...S); workouts.splice(0, workouts.length);
  // Veralteter Eintrag aus einer früheren Zuordnung muss beim Neuabruf verschwinden
  env2.WB.m.set('m:2026-10', JSON.stringify({ '2026-10-04': { workouts: [], recovery: { score: { recovery_score: 1 } } }, '2026-09-30': { workouts: [], recovery: { score: { recovery_score: 2 } } } }));
  const call2 = async (path, o = {}) => { const r = await worker.fetch(req(path, o), env2); return { status: r.status, body: await r.json() } };
  const sy = await call2('/sync', { method: 'POST', body: { from: '2026-10-01', to: '2026-10-07' } });
  assert.equal(sy.status, 200, JSON.stringify(sy.body));
  const dd = (await call2('/data?from=2026-09-29&to=2026-10-08')).body.days;
  for (let n = 0; n < 7; n++) {
    const d = dd['2026-10-0' + (n + 1)];
    assert.ok(d, 'Tag fehlt: ' + (n + 1));
    assert.equal(d.recovery.score.recovery_score, 50 + n, 'Recovery am falschen Tag: ' + (n + 1));
    assert.equal(d.sleep.id, 'x' + n);
    assert.equal(d.cycle.score.strain, 10 + n, 'Strain am falschen Tag: ' + (n + 1));
  }
  assert.equal(dd['2026-10-04'].recovery.score.recovery_score, 53, 'veralteter Eintrag wurde ersetzt');
  assert.equal(dd['2026-09-30'].recovery.score.recovery_score, 2, 'Tage außerhalb des Zeitraums bleiben unberührt');
  console.log('✓ Keine Lücken bei wechselnder Schlafenszeit, veraltete Einträge werden ersetzt');
}
console.log('Alle Tests bestanden');
