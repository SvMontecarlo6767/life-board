/* Life Board – Check-in (Tagebuch): Datenform, Punkte und Hilfen. Reine Funktionen, keine Abhängigkeit von Firebase oder DOM.
   Wird von checkin.html, heute.html, dem Hub und muster.html benutzt; Tests: node tools/test-journal.mjs.
   Firestore users/{uid}/journal/{Tag}: {m:{mood,energy,sleep,feel,at}, e:{good:[3],stress,line,at}, notes:[{at,mood,text}], t:{trackerId:Wert}, updatedAt} */
(function(root){
/* Gefühlswörter: ein Wort zu wählen hilft mehr als nur eine Zahl (Affect Labeling) */
const FEELINGS={
  pos:['ruhig','zufrieden','dankbar','motiviert','fokussiert','energiegeladen','fröhlich','stolz','entspannt','zuversichtlich'],
  neg:['müde','gestresst','angespannt','gereizt','traurig','unruhig','überfordert','lustlos','einsam','ängstlich']
};
const SCALE={
  mood:['sehr schlecht','schlecht','okay','gut','sehr gut'],
  energy:['leer','schlapp','mittel','wach','voller Energie'],
  sleep:['wie gerädert','kaum erholt','geht so','erholt','top ausgeschlafen'],
  stress:['entspannt','leicht','mittel','hoch','sehr hoch']
};
const EMO=['😞','🙁','😐','🙂','😄'];
const n15=v=>{v=+v;return v>=1&&v<=5?Math.round(v):null};
/* Eingaben säubern, bevor sie gespeichert werden */
function clean(doc){
  doc=doc||{};const o={};
  if(doc.m){const m={mood:n15(doc.m.mood),energy:n15(doc.m.energy),sleep:n15(doc.m.sleep),feel:String(doc.m.feel||'').slice(0,40),at:+doc.m.at||null};if(m.mood||m.energy)o.m=m}
  if(doc.e){const g=(doc.e.good||[]).slice(0,3).map(x=>String(x||'').trim().slice(0,300));while(g.length<3)g.push('');
    o.e={good:g,stress:n15(doc.e.stress),line:String(doc.e.line||'').trim().slice(0,500),at:+doc.e.at||null}}
  o.notes=(doc.notes||[]).filter(x=>x&&(x.text||x.mood)).slice(-30).map(x=>({at:+x.at||0,mood:n15(x.mood),text:String(x.text||'').trim().slice(0,1000)}));
  const t={};for(const k of Object.keys(doc.t||{})){const v=doc.t[k];if(/^[a-z0-9_]{1,24}$/.test(k)&&typeof v==='number'&&isFinite(v)&&v>=0&&v<=1e4)t[k]=v}
  o.t=t;
  return o;
}
const goodCount=d=>d&&d.e?d.e.good.filter(x=>x&&x.trim()).length:0;
/* Punkte-Zähler fürs Dopamin-Konto (Aktionen MEN-01 … MEN-04 im Regelwerk v2) */
function counts(d){
  const c={};if(!d)return c;
  if(d.m&&d.m.mood&&d.m.energy)c['MEN-01']=1;
  if(goodCount(d)>=3)c['MEN-02']=1;
  const n=(d.notes||[]).length;if(n)c['MEN-03']=Math.min(n,3);
  if(Object.keys(d.t||{}).length)c['MEN-04']=1;
  return c;
}
/* Tageswerte für Muster und Rückblick: eine Zahl pro Kennzahl oder null */
function dayValues(d){
  if(!d)return{};
  const ms=(d.notes||[]).map(x=>x.mood).filter(Boolean);
  const all=[d.m&&d.m.mood].concat(ms).filter(Boolean);
  const v={
    mood:d.m&&d.m.mood||null,energy:d.m&&d.m.energy||null,sleepFelt:d.m&&d.m.sleep||null,
    moodAvg:all.length?all.reduce((a,b)=>a+b,0)/all.length:null,
    stress:d.e&&d.e.stress||null,good:d.e?goodCount(d):null
  };
  for(const k of Object.keys(d.t||{}))v['t_'+k]=d.t[k];
  return v;
}
/* Eigene Tracker: Vorschläge zum Anlegen (Definition liegt in settings/main.trackers) */
const TRACKER_PRESETS=[
  {id:'kaffee',name:'Kaffee',unit:'Tassen',kind:'count',max:10},
  {id:'wasser',name:'Wasser',unit:'Gläser',kind:'count',max:15},
  {id:'handy',name:'Handyzeit',unit:'Std',kind:'num',max:16},
  {id:'draussen',name:'Draußen',unit:'Min',kind:'num',max:600},
  {id:'freunde',name:'Zeit mit Freunden',unit:'',kind:'bool'},
  {id:'meditation',name:'Meditation',unit:'',kind:'bool'}
];
function trackerId(name){return String(name||'').toLowerCase().replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,24)||'tracker'}
const api={FEELINGS,SCALE,EMO,clean,counts,dayValues,goodCount,TRACKER_PRESETS,trackerId};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LBJournal=api;
})(typeof window!=='undefined'?window:globalThis);
