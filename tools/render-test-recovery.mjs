import { JSDOM } from 'jsdom';
import fs from 'node:fs';
import assert from 'node:assert/strict';
let html = fs.readFileSync('/home/claude/life-board/recovery.html', 'utf8').replace(/<script src="[^"]*"><\/script>/g, '');
// Testdaten: 365 Tage, mit Lücken und einem unbewerteten heutigen Zyklus
const iso = t => new Date(t).toISOString().slice(0, 10);
const days = {};
for (let i = 364; i >= 0; i--) {
  const d = iso(Date.now() - i * 864e5);
  if (i % 17 === 5) continue; // Lücke
  const base = 55 + 25 * Math.sin(i / 6);
  days[d] = {
    cycle: { id: i, state: i === 0 ? 'PENDING_SCORE' : 'SCORED', steps: 6000 + (i % 7) * 900, score: i === 0 ? null : { strain: 8 + 6 * Math.abs(Math.sin(i / 4)), kilojoule: 9000 + i * 5, average_heart_rate: 70 } },
    recovery: i === 0 ? { state: 'PENDING_SCORE', score: null } : { state: 'SCORED', score: { recovery_score: Math.round(base), hrv_rmssd_milli: 60 + base / 4, resting_heart_rate: 58 - base / 12, spo2_percentage: 96 + (i % 3) / 2, skin_temp_celsius: 33 + (i % 5) / 10 } },
    sleep: { state: 'SCORED', score: { sleep_performance_percentage: 70 + (i % 25), sleep_efficiency_percentage: 88 + (i % 8), sleep_consistency_percentage: 70 + (i % 20), respiratory_rate: 15 + (i % 4) / 4, sleep_needed: { baseline_milli: 8 * 3.6e6, need_from_sleep_debt_milli: 0.3 * 3.6e6, need_from_recent_strain_milli: 0.4 * 3.6e6, need_from_recent_nap_milli: 0 }, stage_summary: { total_light_sleep_time_milli: 3.5 * 3.6e6, total_slow_wave_sleep_time_milli: 1.4 * 3.6e6, total_rem_sleep_time_milli: 1.8 * 3.6e6, total_awake_time_milli: 0.5 * 3.6e6 } } },
    workouts: i % 3 === 0 ? [{ id: 'w', sport: 'running', start: iso(Date.now() - i * 864e5) + 'T08:00:00Z', end: iso(Date.now() - i * 864e5) + 'T08:45:00Z', score: { strain: 12.3, average_heart_rate: 150, max_heart_rate: 180, kilojoule: 1500, distance_meter: 7200, zone_durations: { zone_zero_milli: 6e4, zone_one_milli: 6e5, zone_two_milli: 12e5, zone_three_milli: 6e5, zone_four_milli: 3e5, zone_five_milli: 1e5 } } }] : []
  };
}
// Ein Tag mit leeren/fehlenden Feldern (z. B. nicht bewertet)
days[iso(Date.now() - 2 * 864e5)] = { cycle: { state: 'UNSCORABLE', score: null }, workouts: [] };
const errors = [];
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.github.io/life-board/recovery.html',
  beforeParse(w) {
    w.requireUser = async () => ({ getIdToken: async () => 't' });
    w.fetch = async (u) => ({ ok: true, status: 200, json: async () => ({ days }) });
    w.addEventListener('error', e => errors.push(e.message));
  }
});
const w = dom.window, doc = w.document;
await new Promise(r => setTimeout(r, 300));
assert.deepEqual(errors, [], 'Laufzeitfehler: ' + errors.join('|'));
assert.equal(doc.getElementById('content').hidden, false, 'Inhalt sichtbar');
assert.equal(doc.querySelectorAll('svg.ch').length, 15, 'fünfzehn Diagramme');
console.log('Hero:', doc.getElementById('heroCard').textContent);
console.log('Kacheln:', [...doc.querySelectorAll('.tile')].map(t => t.textContent.replace(/\s+/g, ' ')).join(' | '));
// Zeitraum wechseln
for (const d of ['7', '90', '365']) {
  doc.querySelector(`button[data-d="${d}"]`).click();
  assert.deepEqual(errors, [], 'Fehler bei ' + d + ' Tagen: ' + errors.join('|'));
  assert.ok(doc.querySelectorAll('svg.ch').length >= 14, 'Diagramme bei ' + d);
}
// Tooltip
const hit = doc.querySelector('#c-rec svg rect');
hit.dispatchEvent(new w.MouseEvent('pointermove', { clientX: 200, clientY: 300, bubbles: true }));
const tipEl = doc.getElementById('tip');
assert.equal(tipEl.style.display, 'block'); console.log('Tooltip:', tipEl.textContent);
const barHit = doc.querySelector('#c-sleep svg rect');
barHit.dispatchEvent(new w.MouseEvent('pointermove', { clientX: 100, clientY: 300, bubbles: true }));
console.log('Tooltip Schlaf:', tipEl.textContent);
barHit.dispatchEvent(new w.MouseEvent('pointerleave', { bubbles: true }));
assert.equal(tipEl.style.display, 'none');
// neue Diagramme: Tooltips
const tipE=doc.getElementById('tip');
for (const id of ['c-stages','c-need','c-eff','c-scatter']) {
  const h = doc.querySelector('#' + id + ' svg rect:last-of-type') || doc.querySelector('#' + id + ' svg rect');
  h.dispatchEvent(new w.MouseEvent('pointermove', { clientX: 150, clientY: 120, bubbles: true }));
  console.log('Tooltip ' + id + ':', tipE.style.display, tipE.textContent.replace(/\s+/g, ' ').slice(0, 110));
}
assert.ok(doc.querySelectorAll('#c-workouts tbody tr').length > 5, 'Workout-Zeilen');
assert.ok(doc.querySelectorAll('#c-workouts .zbar').length > 5, 'Zonenbalken');
assert.equal(doc.querySelectorAll('#c-dow tbody tr').length, 5, 'Wochentage-Zeilen');
console.log('Wochentage:', doc.querySelector('#c-dow').textContent.replace(/\s+/g, ' ').slice(0, 140));
console.log('Kacheln 2:', [...doc.querySelectorAll('#tiles2 .tile')].map(t => t.textContent.replace(/\s+/g, ' ')).join(' | '));
console.log('Streu:', doc.getElementById('s-scatter').textContent);
assert.deepEqual(errors, [], 'Fehler: ' + errors.join('|'));
// Tabelle + Datenprüfung
doc.getElementById('tblBtn').click(); assert.ok(doc.querySelectorAll('#tbl tbody tr').length > 100, 'Tabellenzeilen');
doc.getElementById('dbgBtn').click(); console.log('Prüfung:', doc.querySelector('#dbg .hint').textContent);
assert.deepEqual(errors, []);
// Leerer Datensatz und Fehlerfall
for (const [label, fetchImpl, expect] of [
  ['leer', async () => ({ ok: true, json: async () => ({ days: {} }) }), 'Noch keine Whoop-Daten'],
  ['Fehler', async () => ({ ok: false, status: 409, json: async () => ({ error: 'nicht verbunden' }) }), 'nicht verbunden']
]) {
  const d2 = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, beforeParse(x) { x.requireUser = async () => ({ getIdToken: async () => 't' }); x.fetch = fetchImpl } });
  await new Promise(r => setTimeout(r, 200));
  assert.ok(d2.window.document.getElementById('msg').textContent.includes(expect), label + ': ' + d2.window.document.getElementById('msg').textContent);
}
console.log('Render-Test bestanden');
