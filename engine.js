/* Life Board – Rechenkern (Regelwerk v1). Reine Funktionen, keine Abhängigkeit von Firebase oder DOM.
   Wird von heute.html im Browser und von tools/test-engine.mjs in Node benutzt. */
(function(root){
function pad(n){return String(n).padStart(2,'0')}
/* Tageswechsel: "Tag" = Europe/Berlin, Wechsel um changeHour (4 Uhr). Rechnet mit lokaler Berliner Wandzeit. */
function dayKey(now,tz,hour){
  tz=tz||'Europe/Berlin';hour=hour==null?4:hour;
  const p={};new Intl.DateTimeFormat('en-GB',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'})
    .formatToParts(now||new Date()).forEach(x=>{p[x.type]=x.value});
  let d=new Date(Date.UTC(+p.year,+p.month-1,+p.day));
  if(+p.hour<hour)d=new Date(d.getTime()-864e5);
  return d.getUTCFullYear()+'-'+pad(d.getUTCMonth()+1)+'-'+pad(d.getUTCDate());
}
function addDays(key,n){const [y,m,d]=key.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d+n));return t.getUTCFullYear()+'-'+pad(t.getUTCMonth()+1)+'-'+pad(t.getUTCDate())}
function weekKey(key){const [y,m,d]=key.split('-').map(Number);const dow=(new Date(Date.UTC(y,m-1,d)).getUTCDay()+6)%7;return addDays(key,-dow)}
function monthKey(key){return key.slice(0,7)}
function periodKey(per,key){return per==='week'?weekKey(key):per==='month'?monthKey(key):key}
function byId(rules){if(!rules._by){Object.defineProperty(rules,'_by',{value:Object.fromEntries(rules.actions.map(a=>[a.id,a])),enumerable:false})}return rules._by}

function rankOf(rules,net){for(const r of rules.ranks){if(r.min==null||net>=r.min)return r.id}return 'C'}

/* counts: {ID: n}; opt.puz: Puzzle-Tageswert oder null; opt.blocked: {ID:true} (in diesem Zeitraum an anderem Tag schon gezählt) */
function computeDay(rules,counts,opt){
  opt=opt||{};const by=byId(rules);const lines=[];
  const sportCats=new Set(rules.sport.categories);
  const sel=[];
  for(const id of Object.keys(counts||{})){
    const n=counts[id]|0;const a=by[id];if(!a||n<1)continue;
    if(a.kind==='puzzle'||a.kind==='rule')continue;
    const cnt=Math.min(n,a.max||1);
    sel.push({a,cnt});
  }
  // Stufen-Gruppen: nur die höchste zutreffende zählt
  const best={};
  for(const s of sel){if(!s.a.group)continue;const g=s.a.group;if(!best[g]||s.a.points>best[g].a.points)best[g]=s}
  // PR-Limit pro Tag
  const prMax=(by['SPP-17']&&by['SPP-17'].rule&&by['SPP-17'].rule.prMaxPerDay)||rules.inflation.prMaxPerDay;
  const prs=sel.filter(s=>s.a.cat==='SPP').sort((x,y)=>y.a.points*y.cnt-x.a.points*x.cnt);
  const prOk=new Set(prs.slice(0,prMax).map(s=>s.a.id));
  let sportSum=0,sum=0;const mods=[];
  for(const s of sel){
    const a=s.a;let pts=(a.points||0)*s.cnt,note=null;
    if(a.group&&best[a.group]!==s){pts=0;note='Stufe: nur die höchste zählt'}
    else if(a.cat==='SPP'&&!prOk.has(a.id)){pts=0;note='PR-Limit: höchstens '+prMax+' pro Tag'}
    else if(opt.blocked&&opt.blocked[a.id]){pts=0;note='in diesem Zeitraum schon gezählt'}
    if(a.kind==='modifier'&&!note)mods.push(a);
    lines.push({id:a.id,count:s.cnt,pts,note});
    if(pts>0&&sportCats.has(a.cat))sportSum+=pts;
    sum+=pts;
  }
  // Sport-Multiplikatoren (STR-07/08/09/10, STR-11 hebt auf)
  let factor=1,modDelta=0,modInfo=null;
  if(mods.length){
    const over=mods.find(m=>m.mod.type==='override');
    if(over)factor=over.mod.factor;
    else{
      mods.filter(m=>m.mod.type==='mult').forEach(m=>{factor*=m.mod.factor});
      const cap=mods.find(m=>m.mod.type==='cap');
      if(cap)factor=Math.min(factor,cap.mod.factor);
    }
    modDelta=Math.round(sportSum*(factor-1));
    modInfo={factor,sportSum,delta:modDelta,ids:mods.map(m=>m.id)};
  }
  const puz=opt.puz==null?0:opt.puz;
  const net=Math.round(sum+modDelta+puz);
  return{lines,sportSum,sum,factor,modDelta,modInfo,puz,net,rank:rankOf(rules,net)};
}

/* Level aus Konto. Phase 1: kein Level-Verlust-Mechanismus (Schonfrist/Checkpoints kommen in Phase 5). */
function levelInfo(rules,account){
  const cum=rules.level.cumulative,costs=rules.level.costs,max=rules.level.maxLevel;
  let lv=1;for(let n=2;n<=max;n++){if(account>=cum[n-1])lv=n;else break}
  if(lv>=max)return{level:lv,max:true,into:account-cum[max-1],need:0,frac:1,toNext:0};
  const base=cum[lv-1],need=costs[lv];
  const into=Math.max(0,account-base);
  return{level:lv,max:false,into,need,frac:Math.max(0,Math.min(1,into/need)),toNext:Math.max(0,base+need-account)};
}
function rankProgress(rules,net){
  const rs=rules.ranks.filter(r=>r.min!=null).sort((a,b)=>a.min-b.min);
  const cur=rankOf(rules,net);
  const nxt=rs.filter(r=>r.min>net).sort((a,b)=>a.min-b.min)[0];
  return{rank:cur,next:nxt?nxt.id:null,toNext:nxt?nxt.min-net:0};
}
const nf=new Intl.NumberFormat('de-DE');
function fmt(n,sign){const s=nf.format(Math.round(n)).replace('-','−');return sign&&n>0?'+'+s:s}
const api={dayKey,addDays,weekKey,monthKey,periodKey,computeDay,rankOf,levelInfo,rankProgress,fmt};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LBEngine=api;
})(typeof window!=='undefined'?window:globalThis);
