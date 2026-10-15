/* KI-Assistent für das ganze Life Board (Gemini über den Worker, Route /ask).
   Baut vor jeder Frage einen kompakten Überblick aus allen Bereichen und schickt ihn mit.
   Seiten können window.LB_PAGE_CONTEXT = () => 'Text' setzen, um den aktuellen Seiteninhalt mitzugeben. */
(function(){
const WORKER='https://life-board-whoop.momo-haskamp.workers.dev';
const SITE=`SEITENÜBERSICHT DES LIFE BOARDS
- Startseite (index.html): Hub mit Dopamin-Konto, Kacheln, Whoop-Verbindung, Datensicherung.
- Heute (heute.html): Tagesseite. Aktionen antippen (28 Knöpfe in Sport, Lernen, Alltag), Whoop-Werte zählen automatisch (Schlaf, Recovery, HRV, Strain, Workouts), Puzzle-Tracker-Wert (PUZ-01), Tagesabschluss. Punkte ergeben das Dopamin-Konto (Summe aller Tage), Rang pro Tag (S/A/B/C) und Level. Tageswechsel um 04:00 Uhr (Europa/Berlin). Regelwerk v2 (Punkte aus v1, Obergrenzen pro Aktion, nur die höchste Stufe einer Gruppe zählt).
- Recovery (recovery.html): Whoop-Dashboard mit Recovery, HRV, Ruhepuls, Schlaf, Strain, Workouts, Wochentage, Tabellen.
- Lernen (learn.html): Wiederholungsrunden mit 5 Fragen aus den Notion-Seiten (Abschnitt Active Recall / Mini-Wiederholung), Selbstbewertung richtig/fast/falsch, Stufen 1/7/30/90 Tage, bis zu 3 Runden pro Tag mit Punkten (WDH-01 575 Punkte, Mischrunde WDH-13), Active Recall bestanden (LRN-07).
- Puzzle-Tracker (puzzle.html): tägliche Puzzle-Spiele mit eigener Dopamin-Wertung, fließt als PUZ-01 in Heute ein.
Das Board schreibt nie nach Notion oder Whoop; es liest nur.`;
const $=(t,a,c)=>{const e=document.createElement(t);if(a)Object.assign(e,a);if(c)c.forEach(x=>e.append(x));return e};
let user=null,cache=null,msgs=[],busy=false;
const LK='lb_ai_hist',WK='lb_ai_whoop';
try{msgs=JSON.parse(localStorage.getItem(LK)||'[]').slice(-20)}catch(e){}
const useWhoop=()=>{try{return localStorage.getItem(WK)!=='0'}catch(e){return true}};
const dayKey=()=>{const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(Date.now()-4*3600e3));const g=t=>f.find(x=>x.type===t).value;return g('year')+'-'+g('month')+'-'+g('day')};
const addDays=(k,n)=>{const d=new Date(k+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
async function getUser(){
  if(user)return user;
  user=await new Promise(res=>{let done=false;const off=auth.onAuthStateChanged(u=>{if(done)return;done=true;res(u)});setTimeout(()=>{if(!done){done=true;res(auth.currentUser||null)}},6000)});
  return user;
}
async function worker(path,opts){
  const t=await user.getIdToken();
  const r=await fetch(WORKER+path,Object.assign({headers:{Authorization:'Bearer '+t,'Content-Type':'application/json'}},opts||{}));
  let d=null;try{d=await r.json()}catch(e){}
  if(!r.ok){const e=new Error(d&&d.code==='NO_AI'?'Der KI-Zugang ist im Worker noch nicht eingerichtet (Secret GEMINI_KEY fehlt).':(d&&d.error)||('Fehler '+r.status));e.code=d&&d.code;throw e}
  return d;
}
const r1=x=>x==null||isNaN(x)?'–':Math.round(x*10)/10;
function whoopLine(k,d){
  const rec=d.recovery&&d.recovery.score||{},sl=d.sleep||{},ss=sl.score||{},cy=d.cycle&&d.cycle.score||{};
  const h=sl.start&&sl.end?(new Date(sl.end)-new Date(sl.start))/3600e3:null;
  const w=(d.workouts||[]).map(x=>x.sport+' '+Math.round((new Date(x.end)-new Date(x.start))/60000)+'min').join(', ');
  return k+': Recovery '+r1(rec.recovery_score)+'%, HRV '+r1(rec.hrv_rmssd_milli)+', RHR '+r1(rec.resting_heart_rate)+', Schlaf '+r1(ss.sleep_performance_percentage)+'% ('+r1(h)+' h), Strain '+r1(cy.strain)+(w?', Workouts: '+w:'');
}
async function snapshot(force){
  if(cache&&!force&&Date.now()-cache.at<120000&&cache.w===useWhoop())return cache.text;
  await getUser();if(!user)throw new Error('Nicht angemeldet');
  const base='users/'+user.uid,today=dayKey(),L=[];
  L.push('HEUTE: '+today+' (Tageswechsel 04:00 Berlin)');
  const get=async(p)=>{try{return await fs.collection(base+'/'+p).get()}catch(e){return null}};
  try{const s=await fs.doc(base+'/state/current').get();if(s.exists){const v=s.data();L.push('DOPAMIN-KONTO: '+Math.round(v.account)+' Punkte, Level '+v.level+' ('+Math.round((v.levelProgress||0)*100)+'% bis zum nächsten), '+v.days+' Tage erfasst; heute bisher '+(v.todayNet==null?'–':Math.round(v.todayNet))+' (Rang '+(v.todayRank||'–')+')')}}catch(e){}
  const ds=await get('days');
  if(ds){const rows=ds.docs.filter(x=>/^\d{4}-\d\d-\d\d$/.test(x.id)).map(x=>({k:x.id,...x.data()})).sort((a,b)=>a.k<b.k?1:-1).slice(0,30);
    L.push('LETZTE TAGE (Netto-Punkte, Rang, Eingaben):');
    rows.forEach(d=>L.push('  '+d.k+': '+Math.round(d.net||0)+' Pkt, Rang '+(d.rank||'–')+(d.closed?' (abgeschlossen)':'')+(d.in&&Object.keys(d.in).length?', Eingaben '+Object.entries(d.in).filter(([,v])=>v).map(([a,v])=>a+(v>1?'='+v:'')).join(' '):'')+(d.focus?', Fokus: '+d.focus:'')))}
  const ls=await get('learn');
  if(ls){const rows=ls.docs.map(x=>({k:x.id,...x.data()})).sort((a,b)=>a.k<b.k?1:-1).slice(0,14);
    if(rows.length)L.push('LERNRUNDEN: '+rows.map(d=>d.k+' '+(d.rounds||[]).length+' Runde(n)').join('; '))}
  const qs=await get('questions');
  if(qs){const q=qs.docs.map(x=>x.data());const st={n:q.length,nw:0,due:0,s:[0,0,0,0,0]};q.forEach(x=>{if(!x.reps){st.nw++;return}st.s[x.stage||1]++;if(x.due<=today)st.due++});
    L.push('FRAGEN: '+st.n+' insgesamt, '+st.nw+' neu, '+st.due+' fällig; Stufe 1: '+st.s[1]+', Stufe 2: '+st.s[2]+', Stufe 3: '+st.s[3]+', Stufe 4 (gelernt): '+st.s[4]);
    const per={};q.forEach(x=>{(per[x.pageTitle]=per[x.pageTitle]||{n:0,due:0}).n++;if(x.reps&&x.due<=today)per[x.pageTitle].due++});
    L.push('THEMEN: '+Object.entries(per).map(([t,v])=>t+' ('+v.n+' Fragen, '+v.due+' fällig)').join('; '))}
  if(useWhoop()){
    try{const w=await worker('/data?from='+addDays(today,-13)+'&to='+today);const ks=Object.keys(w.days||{}).sort().reverse();
      if(ks.length){L.push('WHOOP (letzte 14 Tage):');ks.forEach(k=>L.push('  '+whoopLine(k,w.days[k])))}}catch(e){L.push('WHOOP: nicht verfügbar ('+e.message+')')}
  }else L.push('WHOOP: vom Nutzer für diese Frage ausgeschaltet');
  let text=SITE+'\n\nDATEN:\n'+L.join('\n');
  if(text.length>26000)text=text.slice(0,26000)+'\n…(gekürzt)';
  cache={at:Date.now(),text,w:useWhoop()};return text;
}
async function ask(prompt,extra,history){
  if(busy)throw new Error('Es läuft noch eine Anfrage');busy=true;
  try{
    const snap=await snapshot();
    let page='';try{page=window.LB_PAGE_CONTEXT?String(window.LB_PAGE_CONTEXT()||''):''}catch(e){}
    const ctx=snap+'\n\nAKTUELLE SEITE: '+location.pathname.split('/').pop()+(page?'\n'+page:'')+(extra?'\n'+extra:'');
    const m=(history||[]).concat([{role:'user',content:prompt}]);
    return await worker('/ask',{method:'POST',body:JSON.stringify({messages:m,context:ctx})});
  }finally{busy=false}
}
/* ---------- Oberfläche ---------- */
function ui(){
  const css=document.createElement('style');
  css.textContent=`#aiB{position:fixed;right:16px;bottom:16px;z-index:60;width:54px;height:54px;border-radius:99px;border:0;background:var(--ac,#2f6f4f);color:#fff;font:700 16px system-ui;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
#aiP{position:fixed;right:12px;bottom:78px;z-index:61;width:min(420px,calc(100vw - 24px));height:min(560px,calc(100vh - 100px));background:var(--card,#fff);color:var(--tx,#1d1d1b);border:1px solid var(--bd,#e2e0d8);border-radius:16px;display:flex;flex-direction:column;box-shadow:0 8px 30px rgba(0,0,0,.3);font:15px/1.4 system-ui}
#aiP[hidden]{display:none}
#aiP header{padding:10px 12px;border-bottom:1px solid var(--bd,#e2e0d8);display:flex;justify-content:space-between;align-items:center;gap:8px}
#aiP header label{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}#aiP header b{font-size:15px}#aiP .sm{font-size:12px;color:var(--mu,#6b6a64)}
#aiM{flex:1;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
#aiM div{padding:8px 10px;border-radius:12px;max-width:92%;white-space:pre-wrap;word-wrap:break-word}
#aiM .u{align-self:flex-end;background:var(--ac,#2f6f4f);color:#fff}#aiM .a{align-self:flex-start;background:var(--ac2,#e8f2ec)}#aiM .e{align-self:flex-start;background:var(--bad2,#f8e9e7);color:var(--bad,#b3413a)}
#aiP form{display:flex;gap:6px;padding:8px 10px;border-top:1px solid var(--bd,#e2e0d8)}
#aiP textarea{flex:1;font:inherit;min-height:44px;max-height:110px;resize:none;border:1px solid var(--bd,#e2e0d8);border-radius:10px;padding:8px;background:var(--bg,#f6f5f1);color:inherit}
#aiP button.s{min-height:44px;border-radius:10px;border:0;background:var(--ac,#2f6f4f);color:#fff;padding:0 14px;font:600 15px system-ui}
#aiP .x{background:none;border:0;font-size:20px;color:inherit;cursor:pointer;min-width:36px;min-height:36px}`;
  document.head.append(css);
  const b=$('button',{id:'aiB',textContent:'KI',title:'KI-Assistent'});
  const p=$('div',{id:'aiP',hidden:true});
  p.innerHTML='<header><div><b>KI-Assistent</b><div class="sm" id="aiS">kennt dein ganzes Board</div></div><div><label class="sm"><input type="checkbox" id="aiW"> Whoop</label> <button class="x" id="aiR" title="Neuer Chat">⟲</button><button class="x" id="aiX" title="Schließen">×</button></div></header><div id="aiM"></div><form id="aiF"><textarea id="aiT" placeholder="Frag mich etwas zu deinem Board …" rows="1"></textarea><button class="s" type="submit">Senden</button></form>';
  document.body.append(b,p);
  const M=p.querySelector('#aiM'),T=p.querySelector('#aiT'),W=p.querySelector('#aiW');
  W.checked=useWhoop();W.onchange=()=>{try{localStorage.setItem(WK,W.checked?'1':'0')}catch(e){}cache=null};
  const add=(c,t)=>{M.append($('div',{className:c,textContent:t}));M.scrollTop=M.scrollHeight};
  const draw=()=>{M.innerHTML='';if(!msgs.length)add('a','Hallo! Ich kenne deine letzten Tage (Punkte, Whoop, Lernen) und weiß, wie das Board funktioniert. Frag mich zum Beispiel: „Wie war meine Woche?“, „Warum war meine Recovery gestern niedrig?“ oder „Was sollte ich heute zuerst tun?“');msgs.forEach(m=>add(m.role==='user'?'u':'a',m.content))};
  const save=()=>{try{localStorage.setItem(LK,JSON.stringify(msgs.slice(-20)))}catch(e){}};
  b.onclick=()=>{p.hidden=!p.hidden;if(!p.hidden){draw();T.focus()}};
  p.querySelector('#aiX').onclick=()=>{p.hidden=true};
  p.querySelector('#aiR').onclick=()=>{msgs=[];save();draw()};
  p.querySelector('#aiF').onsubmit=async ev=>{
    ev.preventDefault();const q=T.value.trim();if(!q||busy)return;T.value='';
    add('u',q);const wait=$('div',{className:'a',textContent:'…'});M.append(wait);M.scrollTop=M.scrollHeight;
    try{
      const r=await ask(q,'',msgs.slice(-10));
      msgs.push({role:'user',content:q},{role:'assistant',content:r.answer});save();
      wait.textContent=r.answer;p.querySelector('#aiS').textContent='Heute '+r.used+' von '+r.limit+' Fragen genutzt';
    }catch(e){wait.className='e';wait.textContent=e.message}
    M.scrollTop=M.scrollHeight;
  };
  T.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();p.querySelector('#aiF').requestSubmit()}};
}
window.Assistant={ask,snapshot,open(){const b=document.getElementById('aiB');if(b&&document.getElementById('aiP').hidden)b.click()}};
function start(){
  if(typeof auth==='undefined'||typeof fs==='undefined')return;
  auth.onAuthStateChanged(u=>{user=u;if(u&&!document.getElementById('aiB'))ui();if(!u){const b=document.getElementById('aiB'),p=document.getElementById('aiP');b&&b.remove();p&&p.remove()}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
