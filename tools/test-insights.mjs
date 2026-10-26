// Tests für journal-core.js und insights-core.js: node tools/test-insights.mjs
import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
globalThis.LBJournal=require('../journal-core.js');globalThis.WhoopRow=require('../whoop-row.js');
const J=globalThis.LBJournal,I=require('../insights-core.js');
// clean + counts
const c=J.clean({m:{mood:9,energy:3,feel:'x'.repeat(99)},e:{good:['a','',' b ']},notes:[{text:'hi',mood:2},{}],t:{kaffee:2,'BAD KEY':1,neg:-1}});
assert.equal(c.m.mood,null);assert.equal(c.m.feel.length,40);assert.deepEqual(c.e.good,['a','','b']);assert.equal(c.notes.length,1);assert.deepEqual(c.t,{kaffee:2});
assert.deepEqual([J.clean({alc:false,meal:'21:15',sick:1}).alc,J.clean({alc:false,meal:'21:15'}).meal,J.clean({sick:1}).sick,J.clean({alc:'ja',meal:'25:00'}).alc,J.clean({meal:'25:00'}).meal],[false,'21:15',true,undefined,undefined],'Alkohol, Mahlzeit, krank');
// Check-in-Alkohol geht vor dem alten Heute-Eintrag
const d2=I.build({journal:{'2026-01-02':{alc:false,meal:'21:00'}},days:{'2026-01-02':{in:{alkohol:1}}},whoop:{},rules:{ui:{buttons:[{id:'alkohol',label:'Alkohol',group:'alltag'}]}}});
assert.deepEqual([d2.byDay['2026-01-02'].alk,d2.byDay['2026-01-02'].lateMeal],[0,1]);
assert.equal(J.trackerId('Zeit am Handy!'),'zeit_am_handy');assert.equal(J.trackerId('Süßes'),'suesses');
// Zusammenhänge: Alkohol am Vortag senkt Recovery, Kaffee ohne Wirkung
const rules={ui:{buttons:[{id:'alkohol',label:'Alkohol',group:'alltag'},{id:'kraft',label:'Kraft',group:'sport'}]}};
const days={},whoop={},journal={};let k='2026-08-01';
for(let i=0;i<60;i++){const alk=i%4===0;days[k]={in:alk?{alkohol:1}:{},net:100};
  const prevAlk=i>0&&(i-1)%4===0;whoop[k]={recovery:{score:{recovery_score:prevAlk?40+(i%3):70+(i%5),hrv_rmssd_milli:60,resting_heart_rate:55}},workouts:[]};
  journal[k]={m:{mood:3+(i%2),energy:3},t:{kaffee:i%3}};k=I.addDays(k,1)}
const data=I.build({journal,days,whoop,rules,trackers:[{id:'kaffee',name:'Kaffee',kind:'count'}]});
assert.ok(data.factors.alk&&data.factors.sport&&data.factors.t_kaffee&&!data.factors.in_alkohol,'Alkohol aus Heute wird zum gemeinsamen Faktor');assert.ok(!data.factors.in_kraft,'Sport-Knöpfe gehen in „Sport“ auf');
const F=I.findings(data);
const alk=F.find(r=>r.factor==='alk'&&r.outcome==='rec');
assert.ok(alk,'Alkohol → Recovery gefunden');assert.equal(alk.lag,1);assert.equal(alk.good,false);assert.ok(alk.withMean<45&&alk.withoutMean>65);
assert.ok(I.sentence(alk).startsWith('Nach Tagen mit „Alkohol“ ist am nächsten Tag deine Whoop-Recovery im Schnitt'),I.sentence(alk));
assert.ok(!F.some(r=>r.factor==='t_kaffee'&&r.outcome==='rec'),'kein Scheinzusammenhang bei Kaffee');
assert.equal(I.findings(I.build({journal:{},days:{'2026-01-01':{in:{alkohol:1}}},whoop:{},rules})).length,0,'zu wenig Daten: keine Aussage');
// Rückblick
const rv=I.review(data,journal,'2026-09-01','2026-09-07');
assert.equal(rv.days,7);assert.equal(rv.checkins,7);assert.equal(rv.streak,7);assert.ok(rv.stats.rec.cur&&rv.stats.rec.prev);
console.log('alles ok');
