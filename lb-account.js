/* Life Board – Konto-Werkzeuge im Zahnrad-Menü (alle Seiten, alle Designs): Whoop-Verbindung, Sicherung
   (herunterladen, kopieren, wiederherstellen) und „Als App aufs iPad“. Früher im Hub; Funktion unverändert übernommen,
   gleiche Element-IDs (#wh…, #bk…, #appTip). Braucht fb.js (auth, fs). Wird von theme.js nach dem Zahnrad geladen. */
(function(){
'use strict';
if(window.LBAccount)return;
const $=id=>document.getElementById(id);
const CSS=`
#lb-set .lb-acc{border-top:1px solid var(--bd);margin-top:4px;padding-top:4px}
#lb-set .lb-acc details{border-bottom:1px solid var(--bd)}
#lb-set .lb-acc summary{list-style:none;cursor:pointer;min-height:50px;display:flex;align-items:center;gap:10px;font:700 15px var(--font-ui,system-ui);color:var(--tx);-webkit-tap-highlight-color:transparent}
#lb-set .lb-acc summary::-webkit-details-marker{display:none}
#lb-set .lb-acc summary::after{content:"";margin-left:auto;width:9px;height:9px;border-right:2px solid var(--mu);border-bottom:2px solid var(--mu);transform:rotate(45deg) translate(-3px,-3px);transition:transform .2s}
#lb-set .lb-acc details[open]>summary::after{transform:rotate(225deg) translate(-2px,-2px)}
#lb-set .lb-acc summary svg{width:20px;height:20px;flex:none;stroke:rgb(var(--acc));fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
#lb-set .lb-acc summary em{font-style:normal;font:600 11px var(--font-ui,system-ui);letter-spacing:.1em;text-transform:uppercase;color:var(--bad,#ff7a6e);border:1px solid currentColor;border-radius:99px;padding:1px 8px}
#lb-set .lb-acc .pane{padding:0 0 12px;font-size:14px}
#lb-set #wh,#lb-set #bk{background:none!important;border:0!important;box-shadow:none!important;padding:0!important;margin:0!important;-webkit-backdrop-filter:none!important;backdrop-filter:none!important}
#lb-set #wh::before,#lb-set #bk::before{display:none!important}
#lb-set .lb-acc .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
#lb-set .lb-acc .row button,#lb-set .lb-acc .row .btn{flex:1 1 140px;min-height:44px;padding:8px 12px;font-size:14px}
#lb-set .lb-acc .note{color:var(--mu);font-size:13px;display:block}
#bkMsg,#whMsg{font-size:13px;color:var(--mu);margin-top:8px}#whMsg{white-space:pre-line}
#bkMsg.warn,#bkPrev.warn,#whMsg.warn{color:var(--bad)}#bkPrev.good,#whMsg.good{color:var(--ac)}
#bkRestore summary{font:600 14px system-ui!important;min-height:44px!important}
#lb-set{max-height:calc(100vh - var(--navh,56px) - 24px);overflow:auto;overscroll-behavior:contain}
#lb-gear{position:relative}#lb-gear.due::after{content:"";position:absolute;top:8px;right:8px;width:9px;height:9px;border-radius:50%;background:var(--bad,#ff7a6e);box-shadow:0 0 8px var(--bad,#ff7a6e)}
`;
const I={wh:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',bk:'<path d="M12 3v12M7 10l5 5 5-5M4 17v3h16v-3"/>',app:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>'};
const HTML=`<div class="lb-acc">
<details id="lb-acc-wh"><summary><svg viewBox="0 0 24 24">${I.wh}</svg>Whoop-Verbindung</summary><div class="pane"><div id="wh">
  <span id="whState" class="note">Status wird geladen …</span>
  <div class="row">
    <button class="primary" id="whConnect">Mit Whoop verbinden</button>
    <button id="whCheck">Verbindung prüfen</button>
    <button id="whSync">Letzte 60 Tage holen</button>
    <button id="whHist">Mehr Verlauf laden (1 Jahr)</button>
  </div>
  <div id="whMsg"></div>
</div></div></details>
<details id="lb-acc-bk"><summary><svg viewBox="0 0 24 24">${I.bk}</svg>Alles sichern<em id="bkDue" hidden>fällig</em></summary><div class="pane"><div id="bk">
  <span class="note">Lädt alle deine Daten als Datei herunter, unabhängig von Firebase. Am besten einmal pro Woche und die Datei zusätzlich in iCloud oder Google Drive ablegen.</span>
  <div class="row"><button class="primary" id="bkDl">Sicherung herunterladen</button><button id="bkCopy">In Zwischenablage kopieren</button></div>
  <div id="bkMsg"></div>
  <details id="bkRestore" style="margin-top:8px"><summary style="cursor:pointer;min-height:44px;display:flex;align-items:center">Sicherung wiederherstellen</summary>
    <span class="note" style="margin:6px 0">Wählt eine Sicherungsdatei aus. Du siehst erst, was drinsteht, und bestätigst dann. Gleiche Einträge werden überschrieben, alles andere bleibt unberührt. Es wird nichts gelöscht. Whoop-Rohdaten liegen im Worker und sind nicht Teil der Datei (sie lassen sich neu abrufen).</span>
    <div class="row"><label class="btn" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 16px;border:1px solid var(--bd);border-radius:12px;cursor:pointer">Datei auswählen<input type="file" id="bkFile" accept=".json,application/json" hidden></label></div>
    <div id="bkPrev" style="margin-top:10px;font-size:14px"></div>
    <div class="row"><button class="primary" id="bkGo" hidden>Jetzt wiederherstellen</button></div>
  </details>
</div></div></details>
<details id="lb-acc-app" hidden><summary><svg viewBox="0 0 24 24">${I.app}</svg>Als App aufs iPad</summary><div class="pane"><div id="appTip">
  <span class="note">Safari → Teilen-Symbol → <b>Zum Home-Bildschirm</b>. Dann startet das Life Board wie eine App, ohne Adressleiste, und öffnet auch bei schwachem Netz.</span>
  <div class="row"><button id="appTipOk">Verstanden</button></div>
</div></div></details>
</div>`;
function build(){
  const panel=$('lb-set');if(!panel||$('bk'))return;
  const st=document.createElement('style');st.id='lb-acc-css';st.textContent=CSS;document.head.append(st);
  panel.insertAdjacentHTML('beforeend',HTML);
  wire();
}

function wire(){
// ---- App-Tipp (nur wenn nicht als App geöffnet) ----
try{
  const standalone=navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
  let seen=false;try{seen=localStorage.getItem('lb-app-tip')==='1'}catch(e){}
  if(!standalone&&!seen&&/iPad|iPhone|Macintosh/.test(navigator.userAgent)&&'ontouchend' in document)$('lb-acc-app').hidden=false;
  $('appTipOk').onclick=()=>{$('lb-acc-app').hidden=true;try{localStorage.setItem('lb-app-tip','1')}catch(e){}};
}catch(e){}

// ---- Sicherung ----
// Neue Module hier eintragen, dann sind sie automatisch in der Sicherung.
const MODULES=['puzzle','days','journal','goals','state','settings','whoop','habits','learn','questions','learnpages','chats','training','sleepcards','sleepcfg','calendar','plan'];
const iso=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
function bkStatus(){
  let last=null;try{last=localStorage.getItem('lb-last-backup')}catch(e){}
  const m=$('bkMsg');
  if(!last){m.textContent='Noch keine Sicherung gemacht.';m.className='warn';due(true);return}
  const days=Math.floor((Date.now()-new Date(last+'T12:00:00'))/864e5);
  m.textContent='Letzte Sicherung: '+last+(days>=7?' (vor '+days+' Tagen, Zeit für eine neue)':'');
  m.className=days>=7?'warn':'';due(days>=7);
}
// Hinweis am Zahnrad, wenn eine Sicherung fällig ist (früher sichtbar im Hub)
function due(on){const g=$('lb-gear');if(g)g.classList.toggle('due',!!on);const b=$('bkDue');if(b)b.hidden=!on}
async function collect(){
  const u=auth.currentUser;if(!u)throw new Error('nicht angemeldet');
  const out={v:2,app:'life-board',exported:new Date().toISOString(),collections:{}};
  for(const name of MODULES){
    const snap=await fs.collection('users/'+u.uid+'/'+name).get({source:'server'});
    if(snap.empty)continue;
    out.collections[name]={};snap.docs.forEach(d=>out.collections[name][d.id]=d.data());
  }
  return out;
}
function summary(o){return Object.entries(o.collections).map(([k,v])=>k+': '+Object.keys(v).length+' Dokumente').join(', ')||'keine Daten'}
$('bkDl').onclick=async()=>{
  const m=$('bkMsg');m.className='';m.textContent='Lese Daten …';
  try{
    const o=await collect(),txt=JSON.stringify(o,null,1);
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([txt],{type:'application/json'}));
    a.download='life-board-sicherung-'+iso(new Date())+'.json';
    document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1500);
    try{localStorage.setItem('lb-last-backup',iso(new Date()))}catch(e){}
    bkStatus();m.textContent+=' · Heruntergeladen ('+summary(o)+')';
  }catch(e){m.className='warn';m.textContent='Sicherung fehlgeschlagen: '+(e.code||e.message)}
};
$('bkCopy').onclick=async()=>{
  const m=$('bkMsg');m.className='';m.textContent='Lese Daten …';
  try{
    const o=await collect();await navigator.clipboard.writeText(JSON.stringify(o));
    try{localStorage.setItem('lb-last-backup',iso(new Date()))}catch(e){}
    bkStatus();m.textContent+=' · Kopiert ('+summary(o)+')';
  }catch(e){m.className='warn';m.textContent='Kopieren fehlgeschlagen: '+(e.code||e.message)}
};
bkStatus();

// ---- Wiederherstellen ----
let bkData=null;
const BK_ID=/^[A-Za-z0-9_\-.:]{1,200}$/;
function bkValidate(o){
  if(!o||typeof o!=='object'||o.app!=='life-board'||!o.collections||typeof o.collections!=='object')return 'Das ist keine Life-Board-Sicherung.';
  for(const [k,v] of Object.entries(o.collections)){
    if(!MODULES.includes(k))return 'Unbekannter Bereich in der Datei: '+k;
    if(!v||typeof v!=='object'||Array.isArray(v))return 'Bereich '+k+' ist kaputt.';
    for(const [id,d] of Object.entries(v)){if(!BK_ID.test(id))return 'Ungültige Dokument-Kennung in '+k+'.';if(!d||typeof d!=='object'||Array.isArray(d))return 'Dokument '+k+'/'+id+' ist kaputt.'}
  }
  return '';
}
$('bkFile').onchange=async ev=>{
  const f=ev.target.files&&ev.target.files[0];ev.target.value='';if(!f)return;const p=$('bkPrev');$('bkGo').hidden=true;bkData=null;
  try{
    const o=JSON.parse(await f.text()),err=bkValidate(o);
    if(err){p.className='warn';p.textContent=err;return}
    bkData=o;p.className='';p.textContent='Datei vom '+String(o.exported||'?').slice(0,10)+': '+summary(o)+'.';$('bkGo').hidden=false;
  }catch(e){p.className='warn';p.textContent='Datei konnte nicht gelesen werden: '+e.message}
};
$('bkGo').onclick=async()=>{
  const p=$('bkPrev'),u=auth.currentUser;if(!bkData||!u)return;
  if(!confirm('Wiederherstellen? '+summary(bkData)+'. Gleiche Einträge in deinem Konto werden überschrieben.'))return;
  $('bkGo').disabled=true;
  try{
    let n=0,batch=fs.batch(),c=0;
    for(const [col,docs] of Object.entries(bkData.collections))for(const [id,d] of Object.entries(docs)){
      batch.set(fs.doc('users/'+u.uid+'/'+col+'/'+id),d);c++;n++;
      if(c>=400){await batch.commit();batch=fs.batch();c=0;p.textContent='Schreibe … '+n}
    }
    if(c)await batch.commit();
    p.className='good';p.textContent='✓ '+n+' Dokumente wiederhergestellt. Lade die Seiten neu, damit alles sichtbar wird.';bkData=null;$('bkGo').hidden=true;
  }catch(e){p.className='warn';p.textContent='Wiederherstellen fehlgeschlagen: '+(e.code||e.message)}
  finally{$('bkGo').disabled=false}
};

// ---- Whoop ----
const WORKER='https://life-board-whoop.momo-haskamp.workers.dev';
async function wfetch(path,opts={}){
  const u=auth.currentUser;if(!u)throw new Error('nicht angemeldet');
  const tok=await u.getIdToken();
  const r=await fetch(WORKER+path,{...opts,headers:{...(opts.headers||{}),Authorization:'Bearer '+tok,'Content-Type':'application/json'}});
  let d=null;try{d=await r.json()}catch(e){}
  if(!r.ok){const e=new Error((d&&d.error)||('Fehler '+r.status));e.code=d&&d.code;e.status=r.status;throw e}
  return d;
}
function wmsg(t,c){const m=$('whMsg');m.textContent=t;m.className=c||''}
const fmtT=ts=>new Date(ts).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'});
async function whStatus(){
  try{
    const s=await wfetch('/status');
    const st=$('whState');
    if(!s.connected){st.textContent='Noch nicht verbunden.';$('whConnect').textContent='Mit Whoop verbinden'}
    else{
      st.textContent=(s.needs_reconnect?'⚠️ Verbindung abgelaufen, bitte neu verbinden. ':'✓ Verbunden. ')+(s.last_sync?'Letzter Abruf: '+fmtT(s.last_sync.at)+' ('+s.last_sync.counts.cycles+' Tage, '+s.last_sync.counts.sleeps+' Schlaf-Einträge).':'Noch keine Daten geholt.');
      $('whConnect').textContent=s.needs_reconnect?'Neu verbinden':'Neu verbinden';
    }
  }catch(e){$('whState').textContent='Worker nicht erreichbar: '+e.message;}
}
$('whConnect').onclick=async()=>{
  wmsg('Leite zu Whoop weiter …');
  try{const d=await wfetch('/start',{method:'POST'});location.href=d.url}
  catch(e){wmsg('Verbinden fehlgeschlagen: '+e.message,'warn')}
};
$('whCheck').onclick=async()=>{
  wmsg('Prüfe …');
  try{const d=await wfetch('/check');wmsg('✓ Verbindung zu Whoop funktioniert'+(d.first_name?' (Konto von '+d.first_name+')':'')+'.','good')}
  catch(e){wmsg('Prüfung fehlgeschlagen: '+e.message+(e.code?' ['+e.code+']':''),'warn')}
};
$('whSync').onclick=async()=>{
  wmsg('Hole die letzten 60 Tage …');
  try{const d=await wfetch('/sync',{method:'POST',body:JSON.stringify({days:60})});
    wmsg('✓ Fertig: '+d.counts.cycles+' Tage, '+d.counts.recoveries+' Erholungswerte, '+d.counts.sleeps+' Schlaf-Einträge, '+d.counts.workouts+' Workouts.','good');whStatus()}
  catch(e){wmsg('Abruf fehlgeschlagen: '+e.message+(e.code?' ['+e.code+']':''),'warn')}
};
$('whHist').onclick=async()=>{
  const dstr=n=>new Date(Date.now()-n*864e5).toISOString().slice(0,10);
  let lines=[];
  try{
    for(let i=0;i<6;i++){
      const to=dstr(60*i),from=dstr(60*i+59);
      wmsg(lines.join('\n')+(lines.length?'\n':'')+'Hole '+from+' bis '+to+' …');
      const d=await wfetch('/sync',{method:'POST',body:JSON.stringify({from,to})});
      lines.push(from+' bis '+to+': '+d.counts.cycles+' Tage');
    }
    wmsg(lines.join('\n')+'\n✓ Fertig.','good');whStatus();
  }catch(e){wmsg(lines.join('\n')+'\nAbbruch: '+e.message+(e.code?' ['+e.code+']':''),'warn')}
};
// Status erst beim Aufklappen abfragen (kein zusätzlicher Abruf auf jeder Seite)
let whAsked=false;const whOnce=()=>{if(whAsked)return;whAsked=true;auth.onAuthStateChanged(u=>{if(u)whStatus()})};
$('lb-acc-wh').addEventListener('toggle',()=>{if($('lb-acc-wh').open)whOnce()});
// Rückmeldung nach der Whoop-Anmeldung (Worker leitet auf index.html?whoop=… zurück): Zahnrad mit Whoop-Bereich öffnen
(function(){
  const q=new URLSearchParams(location.search).get('whoop');
  if(!q)return;
  const t={connected:['✓ Whoop ist verbunden. Als Nächstes „Letzte 60 Tage holen“ tippen.','good'],error:['Whoop-Anmeldung abgebrochen.','warn'],badstate:['Anmeldung ungültig oder abgelaufen. Bitte neu starten.','warn'],tokenfail:['Whoop hat den Login nicht bestätigt (Client-ID, Secret oder Redirect-URL prüfen).','warn']}[q];
  if(t)setTimeout(()=>{const p=$('lb-set');if(p)p.hidden=false;$('lb-acc-wh').open=true;whOnce();wmsg(t[0],t[1])},50);
  history.replaceState(null,'',location.pathname);
})();
}
window.LBAccount={build};
if(document.getElementById('lb-set'))build();
else if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(build,0));
else setTimeout(build,0);
})();
