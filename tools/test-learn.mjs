import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const L = require('../learn-core.js'), E = require('../engine.js'), rules = require('../rules/v2.json');
const T = '2026-10-15';
// Abstände
let q = { stage: 1, reps: 0 };
assert.deepEqual([L.schedule(q,'ok',T).stage, L.schedule(q,'ok',T).due], [2,'2026-10-16']);
q = { stage: 2, reps: 1 }; assert.equal(L.schedule(q,'ok',T).due,'2026-10-22'); assert.equal(L.schedule(q,'ok',T).stage,3);
assert.equal(L.schedule(q,'fast',T).due,'2026-10-18'); assert.equal(L.schedule(q,'fast',T).stage,2);
assert.equal(L.schedule(q,'bad',T).stage,1);
q = { stage: 3 }; assert.equal(L.schedule(q,'ok',T).due,'2026-11-14'); assert.equal(L.schedule(q,'bad',T).stage,2); assert.equal(L.schedule(q,'fast',T).due,'2026-10-25');
q = { stage: 4 }; assert.equal(L.schedule(q,'ok',T).due,'2027-01-13'); assert.equal(L.schedule(q,'ok',T).stage,4); assert.equal(L.schedule(q,'fast',T).due,'2026-11-14'); assert.equal(L.schedule(q,'bad',T).stage,2);
// Queue
const mk = (id,p,o={}) => ({ id, pageId: p, pageTitle: p, idx: +id.slice(1), ...o });
const qs = [mk('a1','A',{reps:1,due:'2026-10-10',stage:2}), mk('a2','A'), mk('b3','B',{reps:1,due:'2026-10-14',stage:1}), mk('b4','B',{reps:1,due:'2026-10-20',stage:2}), mk('c5','C'), mk('c6','C'), mk('d7','D')];
const Q = L.queue(qs,T);
assert.deepEqual(Q.due.map(x=>x.id),['a1','b3']); assert.deepEqual(Q.nw.map(x=>x.id),['a2','c5','c6','d7']);
assert.deepEqual(L.queue(qs,T,'C').all.map(x=>x.id),['c5','c6']);
const mix = L.mixPick(qs,T,5); assert.ok(new Set(mix.map(x=>x.pageId)).size>=3);
const st = L.stats(qs,T); assert.equal(st.due,2); assert.equal(st.overdue,2); assert.equal(st.nw,4);
assert.equal(L.qid('p','Hallo?'), L.qid('p',' hallo? '));
// Zähler
const R = (type,ratings,topics=1) => ({ type, n: ratings.length, ratings, topics });
assert.deepEqual(L.dayCounts([R('std',['ok','ok','ok','ok','bad'])]), { 'WDH-01':1, 'LRN-07':1 });
assert.deepEqual(L.dayCounts([R('std',['ok','bad','bad','fast','ok'])]), { 'WDH-01':1 });
assert.deepEqual(L.dayCounts([R('mix',['ok','ok','ok','ok','ok'],3)]), { 'WDH-13':1, 'LRN-07':1 });
assert.deepEqual(L.dayCounts([R('mix',['ok','ok'],3)]), {}, 'unvollständig zählt nicht');
const four = [1,2,3,4].map(()=>R('std',['bad','bad','bad','bad','bad']));
assert.equal(L.dayCounts(four)['WDH-01'], 3, 'max. 3 Runden mit Punkten');
// Engine: Punkte
const one = E.computeDay(rules, { 'WDH-01':1 }), three = E.computeDay(rules, L.dayCounts(four));
assert.equal(three.net, 3*one.net, 'drei Runden = dreifacher Wert');
const many = E.computeDay(rules, { 'WDH-01':9 }); assert.equal(many.net, three.net, 'Obergrenze 3 greift in der Engine');
console.log('Lern-Logik OK; 1 Runde =', one.net, 'Punkte');
