// Erzeugt Testdaten (Firestore-Mock-Format) für den Training-Reiter. Aufruf: node gen_training_seed.mjs <ausgabe.json> [heute=2026-10-15]
import fs from 'fs';
const out = process.argv[2], today = process.argv[3] || '2026-10-15';
const end = Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 1, +today.slice(8, 10) - 1, 5, 30, 0); // gestern 07:30 Berlin
const acts = []; let id = 1000;
for (let d = 420; d >= 0; d--) {
  const t = end - d * 864e5, wd = (new Date(t).getUTCDay() + 6) % 7, prog = (420 - d) / 420;
  const add = (name, km, pace, hr, elev, raw = 'Run', gear = 'Nike Pegasus 40') => acts.push({ i: String(id++), t: t + (wd * 17 % 60) * 60000, r: raw, n: name, k: km == null ? null : Math.round(km * 100) / 100, s: Math.round((km || 0) * pace) || 3000, h: hr, m: hr ? hr + 18 : null, e: elev, c: 84, g: gear, q: Math.round((km || 6) * 62), p: null });
  if (wd === 1) add('Lockerer Lauf', 8 + prog * 2, 345 - prog * 18, 152, 40);
  if (wd === 3) add('Schwelle 3x2km', 10, 282 - prog * 12, 163, 50);
  if (wd === 5) add('Lockerer Lauf', 7, 350 - prog * 15, 141, 30);
  if (wd === 6) add('Langer Lauf', 16 + prog * 5, 338 - prog * 14, 149, 120, 'Run', d < 60 ? 'Asics Novablast 4' : 'Nike Pegasus 40');
  if (d % 10 === 5) acts.push({ i: String(id++), t, r: 'Weight Training', n: 'Kraft', k: null, s: 3000, h: null, m: null, e: null, c: null, g: null, q: 220, p: null });
  if (wd === 2 && d % 3 === 0) add('Rennrad', 30, 120, 128, 200, 'Ride', 'Canyon');
}
acts.push({ i: String(id++), t: end - 30 * 864e5, r: 'Run', n: 'Stadtlauf Halbmarathon Rennen', k: 21.1, s: 5460, h: 171, m: 189, e: 90, c: 90, g: 'Nike Pegasus 40', q: 1400, p: null });
const by = {}; acts.forEach(a => { const y = new Date(a.t).getUTCFullYear(); (by[y] = by[y] || []).push(a) });
const seed = {}; for (const y in by) seed['users/u1/training/acts_' + y] = { list: by[y] };
seed['users/u1/training/settings'] = { view: 'lauf', name: 'Max', rest: 48, planText: 'Mo frei\nDi 8 km locker\nMi Kraft\nDo 10 km Schwelle\nFr 6 km locker\nSa 7 km locker\nSo lang 22 km', race: { name: 'Stadtlauf Teststadt', place: 'Teststadt', date: '2026-11-22', km: 21.0975, target: 5400, elev: 120, elevSrc: 'von dir angegeben', lat: 50.1, lon: 8.6 }, source: 'Strava' };
fs.writeFileSync(out, JSON.stringify(seed));
console.log(acts.length + ' Einheiten');
