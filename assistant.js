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
let user=null,cache=null,msgs=[],busy=false,cid=null,chatCache=null;
const LK='lb_ai_hist',WK='lb_ai_whoop';
try{msgs=JSON.parse(localStorage.getItem(LK)||'[]').slice(-40);cid=localStorage.getItem('lb_ai_cid')||null}catch(e){}
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
const GAMES={fermi:['Fermi','Score, niedriger besser','low'],spm:['Spotle Movies','Versuche','low'],spm2:['Spotle Music','Versuche (nicht mehr aktiv)','low'],ner:['Nerdle','Versuche 1-6','low'],glo:['Globle','Tipps','low'],tra:['Travle','+X über Perfekt, 0 perfekt','low'],ran:['Ranke','Score, höher besser','high'],tim:['TimeGuessr','Punkte max 50000','high'],stl:['Statle','Versuche','low'],col:['Color Game','Punkte max 50','high'],hol:['Higher or Lower','Streak','high'],satl:['Satle','Versuche 1-6','low'],tmd:['Timdle','Punkte','high'],hf:['Historic Firsts','Versuche 1=Gold','low'],vlt:['Vault','Versuche 1-3','low'],zoo:['Zoodle','Versuche, Hinweis=Strafe','low']};
const avg=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
function loadScript(src){return new Promise(res=>{if(window.PuzzleDop)return res();const s=document.createElement('script');s.src=src;s.onload=()=>res();s.onerror=()=>res();document.head.append(s)})}
/* Puzzle-Tracker: Tageswert (Dopamin) je Tag + Ergebnisse je Spiel mit Trend */
function puzzleSection(D){
  const days=Object.keys(D).sort(),L=[];
  if(!days.length)return{lines:['PUZZLE-TRACKER: noch keine Daten'],dayVal:{}};
  const PD=window.PuzzleDop,dayVal=PD?PD.puzzleDayValues(D):{};
  L.push('PUZZLE-TRACKER: '+days.length+' Tage mit Einträgen ('+days[0]+' bis '+days[days.length-1]+'). Tageswert = Dopamin-Wert aller Spiele des Tages (PUZ-01).');
  const dv=Object.keys(dayVal).sort();
  if(dv.length){const last=dv.slice(-7).map(k=>dayVal[k]),prev=dv.slice(-14,-7).map(k=>dayVal[k]);L.push('  Tageswert Ø letzte 7 Tage: '+r1(avg(last))+(prev.length?', davor 7 Tage: '+r1(avg(prev)):'')+', Ø gesamt: '+r1(avg(dv.map(k=>dayVal[k]))))}
  L.push('  Je Spiel (Ø der Ergebnisse: letzte 7 Einträge | davor 7 | alle; gespielt; gescheitert; bestes):');
  Object.keys(GAMES).forEach(id=>{
    const rows=days.map(d=>({d,e:(D[d]||{})[id]})).filter(x=>x.e&&(x.e.s!=null&&x.e.s!==''||x.e.w===0));
    if(!rows.length)return;
    const [name,desc,dir]=GAMES[id],ok=rows.filter(x=>x.e.w!==0&&!isNaN(parseFloat(String(x.e.s).replace(',','.')))),vals=ok.map(x=>parseFloat(String(x.e.s).replace(',','.')));
    const fails=rows.length-ok.length,best=vals.length?(dir==='low'?Math.min.apply(null,vals):Math.max.apply(null,vals)):null;
    L.push('  - '+name+' ('+desc+'): '+r1(avg(vals.slice(-7)))+' | '+r1(avg(vals.slice(-14,-7)))+' | '+r1(avg(vals))+'; '+rows.length+'x gespielt; '+fails+'x nicht geschafft; bestes '+r1(best)+'; letzte Werte: '+vals.slice(-6).join(', '));
  });
  return{lines:L,dayVal};
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
  let puz={lines:[],dayVal:{}};
  try{await loadScript('puzzle-dop.js?v=1');const ps=await get('puzzle');
    if(ps){const D={};ps.docs.forEach(x=>{if(/^\d{4}-\d\d-\d\d$/.test(x.id)){const v=x.data()||{};if(v.g)D[x.id]=v.g}});puz=puzzleSection(D)}}catch(e){puz={lines:['PUZZLE-TRACKER: nicht lesbar ('+e.message+')'],dayVal:{}}}
  puz.lines.forEach(l=>L.push(l));
  const netBy={};if(ds)ds.docs.forEach(x=>{if(/^\d{4}-\d\d-\d\d$/.test(x.id))netBy[x.id]=x.data()});
  const ls=await get('learn');
  if(ls){const rows=ls.docs.map(x=>({k:x.id,...x.data()})).sort((a,b)=>a.k<b.k?1:-1).slice(0,14);
    if(rows.length)L.push('LERNRUNDEN: '+rows.map(d=>d.k+' '+(d.rounds||[]).length+' Runde(n)').join('; '))}
  const qs=await get('questions');
  if(qs){const q=qs.docs.map(x=>x.data());const st={n:q.length,nw:0,due:0,s:[0,0,0,0,0]};q.forEach(x=>{if(!x.reps){st.nw++;return}st.s[x.stage||1]++;if(x.due<=today)st.due++});
    L.push('FRAGEN: '+st.n+' insgesamt, '+st.nw+' neu, '+st.due+' fällig; Stufe 1: '+st.s[1]+', Stufe 2: '+st.s[2]+', Stufe 3: '+st.s[3]+', Stufe 4 (gelernt): '+st.s[4]);
    const per={};q.forEach(x=>{(per[x.pageTitle]=per[x.pageTitle]||{n:0,due:0}).n++;if(x.reps&&x.due<=today)per[x.pageTitle].due++});
    L.push('THEMEN: '+Object.entries(per).map(([t,v])=>t+' ('+v.n+' Fragen, '+v.due+' fällig)').join('; '))}
  if(useWhoop()){
    try{const w=await worker('/data?from='+addDays(today,-44)+'&to='+today);const ks=Object.keys(w.days||{}).sort().reverse();
      if(ks.length){L.push('WHOOP (letzte 14 Tage):');ks.slice(0,14).forEach(k=>L.push('  '+whoopLine(k,w.days[k])));
        L.push('VERGLEICHSTABELLE (je Tag, für Zusammenhänge; Datum | Puzzle-Tageswert | Netto-Punkte | Recovery% | HRV | Schlaf% | Schlafstunden | Strain):');
        ks.forEach(k=>{const d=w.days[k],rc=d.recovery&&d.recovery.score||{},sl=d.sleep||{},h=sl.start&&sl.end?(new Date(sl.end)-new Date(sl.start))/3600e3:null,n=netBy[k];
          L.push('  '+k+' | '+(puz.dayVal[k]==null?'–':Math.round(puz.dayVal[k]))+' | '+(n&&n.net!=null?Math.round(n.net):'–')+' | '+r1(rc.recovery_score)+' | '+r1(rc.hrv_rmssd_milli)+' | '+r1(sl.score&&sl.score.sleep_performance_percentage)+' | '+r1(h)+' | '+r1(d.cycle&&d.cycle.score&&d.cycle.score.strain))})}}catch(e){L.push('WHOOP: nicht verfügbar ('+e.message+')')}
  }else L.push('WHOOP: vom Nutzer für diese Frage ausgeschaltet');
  let text=SITE+'\n\nDATEN:\n'+L.join('\n');
  if(text.length>29000)text=text.slice(0,29000)+'\n…(gekürzt)';
  cache={at:Date.now(),text,w:useWhoop()};return text;
}
const newId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,6);
/* Gespeicherte Chats: users/{uid}/chats/{id} = {title, messages, createdAt, updatedAt} */
async function saveChat(){
  if(!user||!msgs.length)return;
  if(!cid){cid=newId();try{localStorage.setItem('lb_ai_cid',cid)}catch(e){}}
  const first=msgs.find(m=>m.role==='user');
  const doc={title:(first?first.content:'Chat').slice(0,60),messages:msgs.slice(-40),updatedAt:Date.now()};
  try{await fs.doc('users/'+user.uid+'/chats/'+cid).set(doc,{merge:true});return true}catch(e){return false}
}
async function listChats(){
  const s=await fs.collection('users/'+user.uid+'/chats').get();
  return s.docs.map(x=>({id:x.id,...x.data()})).sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,60);
}
async function ask(prompt,extra,history,opts){
  if(busy)throw new Error('Es läuft noch eine Anfrage');busy=true;
  try{
    const snap=await snapshot();
    let page='';try{page=window.LB_PAGE_CONTEXT?String(window.LB_PAGE_CONTEXT()||''):''}catch(e){}
    const ctx='AKTUELLE SEITE: '+location.pathname.split('/').pop()+(page?'\n'+String(page).slice(0,4000):'')+(extra?'\n'+String(extra).slice(0,6000):'')+'\n\n'+snap;
    const m=(history||[]).concat([{role:'user',content:prompt}]);
    return await worker('/ask',{method:'POST',body:JSON.stringify({messages:m,context:ctx,voice:!!(opts&&opts.voice)})});
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
  p.innerHTML='<header><div><b>KI-Assistent</b><div class="sm" id="aiS">kennt dein ganzes Board</div></div><div><label class="sm"><input type="checkbox" id="aiW"> Whoop</label> <button class="x" id="aiH" title="Gespeicherte Chats">🕘</button><button class="x" id="aiR" title="Neuer Chat">＋</button><button class="x" id="aiX" title="Schließen">×</button></div></header><div id="aiM"></div><form id="aiF"><textarea id="aiT" placeholder="Frag mich etwas zu deinem Board …" rows="1"></textarea><button class="s" type="submit">Senden</button></form>';
  document.body.append(b,p);
  const M=p.querySelector('#aiM'),T=p.querySelector('#aiT'),W=p.querySelector('#aiW');
  W.checked=useWhoop();W.onchange=()=>{try{localStorage.setItem(WK,W.checked?'1':'0')}catch(e){}cache=null};
  const add=(c,t)=>{M.append($('div',{className:c,textContent:t}));M.scrollTop=M.scrollHeight};
  const draw=()=>{M.innerHTML='';M.dataset.mode='chat';if(!msgs.length)add('a','Hallo! Ich kenne deine letzten Tage (Punkte, Whoop, Lernen) und weiß, wie das Board funktioniert. Frag mich zum Beispiel: „Wie war meine Woche?“, „Warum war meine Recovery gestern niedrig?“ oder „Was sollte ich heute zuerst tun?“');msgs.forEach(m=>add(m.role==='user'?'u':'a',m.content))};
  const save=()=>{try{localStorage.setItem(LK,JSON.stringify(msgs.slice(-40)))}catch(e){}};
  b.onclick=()=>{p.hidden=!p.hidden;if(!p.hidden){draw();T.focus()}};
  p.querySelector('#aiX').onclick=()=>{p.hidden=true};
  p.querySelector('#aiR').onclick=()=>{msgs=[];cid=null;try{localStorage.removeItem('lb_ai_cid')}catch(e){}save();draw();T.focus()};
  p.querySelector('#aiH').onclick=async()=>{
    M.innerHTML='';M.dataset.mode='list';add('a','Lade gespeicherte Chats …');
    try{
      const chats=await listChats();M.innerHTML='';
      if(!chats.length){add('a','Noch keine gespeicherten Chats. Jeder Chat wird nach der ersten Antwort automatisch gespeichert.');return}
      chats.forEach(c=>{
        const row=$('div',{className:'a'});row.style.cssText='cursor:pointer;display:flex;justify-content:space-between;gap:8px;align-self:stretch;max-width:100%';
        const t=$('span',{textContent:c.title+' · '+new Date(c.updatedAt||0).toLocaleDateString('de-DE')+' · '+((c.messages||[]).length/2|0)+' Fragen'});
        const del=$('button',{className:'x',textContent:'🗑',title:'Löschen'});
        row.onclick=()=>{msgs=(c.messages||[]).slice();cid=c.id;try{localStorage.setItem('lb_ai_cid',cid)}catch(e){}save();draw()};
        del.onclick=async ev=>{ev.stopPropagation();if(!confirm('Diesen Chat löschen?'))return;try{await fs.doc('users/'+user.uid+'/chats/'+c.id).delete();row.remove();if(c.id===cid){msgs=[];cid=null;save()}}catch(e){alert('Löschen fehlgeschlagen: '+e.message)}};
        row.append(t,del);M.append(row);
      });
    }catch(e){M.innerHTML='';add('e','Chats konnten nicht geladen werden: '+e.message)}
  };
  p.querySelector('#aiF').onsubmit=async ev=>{
    ev.preventDefault();const q=T.value.trim();if(!q||busy)return;T.value='';
    add('u',q);const wait=$('div',{className:'a',textContent:'…'});M.append(wait);M.scrollTop=M.scrollHeight;
    try{
      const r=await ask(q,'',msgs.slice(-10));
      msgs.push({role:'user',content:q},{role:'assistant',content:r.answer});save();
      const sv=await saveChat();if(!sv)p.querySelector('#aiS').textContent='Chat nur auf diesem Gerät gespeichert (Server nicht erreichbar)';
      wait.textContent=r.answer;if(!p.querySelector('#aiS').textContent.startsWith('Chat nur'))p.querySelector('#aiS').textContent='Heute '+r.used+' von '+r.limit+' Fragen genutzt · Chat gespeichert';
    }catch(e){wait.className='e';wait.textContent=e.message}
    M.scrollTop=M.scrollHeight;
  };
  T.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing){e.preventDefault();p.querySelector('#aiF').requestSubmit()}};
}
/* Chat-Speicher für die Jarvis-Oberfläche (gleiche Dokumente users/{uid}/chats wie bisher) */
const chat={
  get msgs(){return msgs},get id(){return cid},
  async ready(){await getUser();return user},
  add(q,a){msgs.push({role:'user',content:q},{role:'assistant',content:a});try{localStorage.setItem(LK,JSON.stringify(msgs.slice(-40)))}catch(e){}return saveChat()},
  fresh(){msgs=[];cid=null;try{localStorage.removeItem('lb_ai_cid');localStorage.setItem(LK,'[]')}catch(e){}},
  open(c){msgs=(c.messages||[]).slice();cid=c.id;try{localStorage.setItem('lb_ai_cid',cid);localStorage.setItem(LK,JSON.stringify(msgs.slice(-40)))}catch(e){}},
  list:()=>listChats(),
  async remove(id){await fs.doc('users/'+user.uid+'/chats/'+id).delete();if(id===cid)chat.fresh()},
  history(n){return msgs.slice(-(n||10))}
};
window.Assistant={ask,snapshot,chat,worker:(p,o)=>getUser().then(()=>worker(p,o)),useWhoop:()=>useWhoop(),setWhoop(v){try{localStorage.setItem(WK,v?'1':'0')}catch(e){}cache=null},open(){const b=document.getElementById('aiB');if(b&&document.getElementById('aiP').hidden)b.click()}};
const classic=()=>{try{return localStorage.getItem('lb_classic_ai')==='1'}catch(e){return false}};   // altes Chatfenster nur noch auf ausdrücklichen Wunsch
function start(){
  if(typeof auth==='undefined'||typeof fs==='undefined')return;
  auth.onAuthStateChanged(u=>{user=u;if(u&&!document.getElementById('aiB')&&classic())ui();if(!u){const b=document.getElementById('aiB'),p=document.getElementById('aiP');b&&b.remove();p&&p.remove()}});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
