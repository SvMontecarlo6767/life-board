import { createRequire } from 'node:module'; import assert from 'node:assert/strict';
const V = createRequire(import.meta.url)('../voice.js');
// Resampling 48 kHz -> 16 kHz: Länge und Mittelwerte
const sine = Float32Array.from({ length: 48000 }, (_, i) => Math.sin(2 * Math.PI * 440 * i / 48000) * .5);
const r = V.resample(sine, 48000, 16000); assert.equal(r.length, 16000); assert.ok(Math.max(...r) > .4 && Math.max(...r) <= .5);
// WAV-Kopf
const w = new DataView(V.wavFromFloat(r, 16000)); const tag = o => String.fromCharCode(w.getUint8(o), w.getUint8(o+1), w.getUint8(o+2), w.getUint8(o+3));
assert.equal(tag(0), 'RIFF'); assert.equal(tag(8), 'WAVE'); assert.equal(w.getUint32(24, true), 16000); assert.equal(w.getUint16(34, true), 16); assert.equal(w.getUint32(40, true), 32000); assert.equal(w.byteLength, 44 + 32000);
// Int16 -> WAV
const i = new Int16Array([0, 16384, -16384, 32767]); const wi = new DataView(V.wavFromInt16(i, 24000)); assert.ok(Math.abs(wi.getInt16(46, true) - 16384) <= 1); assert.equal(wi.getUint32(24, true), 24000);
// Base64-Rundweg
const bytes = new Uint8Array(70000).map((_, k) => k % 251); assert.deepEqual([...V.b64ToBytes(V.bytesToB64(bytes))].slice(0, 5), [0, 1, 2, 3, 4]); assert.equal(V.b64ToBytes(V.bytesToB64(bytes)).length, 70000);
// Hüllkurve: laut/leise
const sig = new Float32Array(16000); for (let k = 0; k < 8000; k++) sig[k] = Math.sin(k / 5) * .8; for (let k = 8000; k < 16000; k++) sig[k] = Math.sin(k / 5) * .05;
const e = V.envelope(sig, 16000); assert.ok(e.data[5] > .9 && e.data[40] < .15 && e.data.length === 50, 'Hüllkurve folgt der Lautstärke');
console.log('Sprach-Hilfen OK');
