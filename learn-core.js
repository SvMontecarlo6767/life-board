/* Lern-Logik ohne Oberfläche (Leitner-light, Runden). Getestet mit tools/test-learn.mjs. */
(function(root){
const OK_DAYS={1:1,2:7,3:30,4:90}, FAST_DAYS={1:1,2:3,3:10,4:30};
const DOWN={1:1,2:1,3:2,4:2};
const PASS=0.8, ROUND=5;
function addDays(k,n){const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)}
function hash(s){let h=5381;for(let i=0;i<s.length;i++)h=((h<<5)+h+s.charCodeAt(i))|0;return (h>>>0).toString(36)}
function qid(pageId,text){return pageId+'_'+hash(String(text).trim().toLowerCase())}
/* q: {stage 1-4, due, reps}; rating: 'ok' | 'fast' | 'bad' */
function schedule(q,rating,today){
  const s=q.stage||1;let ns,days;
  if(rating==='ok'){ns=Math.min(4,s+1);days=OK_DAYS[s]}
  else if(rating==='fast'){ns=s;days=FAST_DAYS[s]}
  else{ns=DOWN[s];days=1}
  return{stage:ns,due:addDays(today,days),last:today,reps:(q.reps|0)+1,lastRating:rating,streak:rating==='ok'?(q.streak|0)+1:0};
}
const isNew=q=>!q.reps;
const isDue=(q,today)=>!!q.reps&&q.due<=today;
/* Warteschlange: überfällige zuerst (älteste Fälligkeit), dann neue Fragen; noch nicht fällige nie */
function queue(qs,today,topic){
  const list=qs.filter(q=>!topic||q.pageId===topic);
  const due=list.filter(q=>isDue(q,today)).sort((a,b)=>a.due<b.due?-1:a.due>b.due?1:a.id<b.id?-1:1);
  const nw=list.filter(isNew).sort((a,b)=>a.pageTitle<b.pageTitle?-1:a.pageTitle>b.pageTitle?1:(a.idx|0)-(b.idx|0));
  return{due,nw,all:due.concat(nw)};
}
/* Mischrunde: reihum aus verschiedenen Themen, so viele verschiedene wie möglich */
function mixPick(qs,today,n){
  const {all}=queue(qs,today);const byPage=new Map();
  all.forEach(q=>{if(!byPage.has(q.pageId))byPage.set(q.pageId,[]);byPage.get(q.pageId).push(q)});
  const lists=[...byPage.values()],out=[];
  for(let i=0;out.length<n&&lists.some(l=>l.length>i);i++)for(const l of lists){if(l[i]&&out.length<n)out.push(l[i])}
  return out;
}
const score=r=>r.reduce((s,x)=>s+(x==='ok'?1:x==='fast'?.5:0),0);
function stats(qs,today){
  const st={total:qs.length,nw:0,due:0,overdue:0,stage:{1:0,2:0,3:0,4:0},learned:0};
  for(const q of qs){
    if(isNew(q)){st.nw++;continue}
    st.stage[q.stage||1]++;
    if(q.due<=today){st.due++;if(q.due<today)st.overdue++}
    if((q.stage|0)>=4&&q.lastRating==='ok')st.learned++;
  }
  return st;
}
const api={schedule,queue,mixPick,stats,qid,hash,addDays,isNew,isDue,score,ROUND,PASS};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LearnCore=api;
})(typeof window!=='undefined'?window:globalThis);
