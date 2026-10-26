// Tests für day.js: node tools/test-day.mjs
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const D=createRequire(import.meta.url)('../day.js');
assert.equal(D.dayKey(new Date('2026-10-26T02:30:00Z')),'2026-10-25','3:30 Berlin (Winterzeit) zählt noch zum Vortag');
assert.equal(D.dayKey(new Date('2026-10-26T03:30:00Z')),'2026-10-26','ab 4 Uhr neuer Tag');
assert.equal(D.dayKey(new Date('2026-07-01T01:59:00Z')),'2026-06-30','Sommerzeit: 3:59 Berlin noch Vortag');
assert.deepEqual([D.addDays('2026-12-31',1),D.addDays('2026-03-01',-1),D.addDays('2028-02-28',1)],['2027-01-01','2026-02-28','2028-02-29']);
assert.deepEqual([D.weekKey('2026-10-26'),D.weekKey('2026-11-01'),D.weekKey('2026-10-25')],['2026-10-26','2026-10-26','2026-10-19'],'Woche beginnt Montag');
console.log('alles ok');
