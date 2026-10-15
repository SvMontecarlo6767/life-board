/* J.A.R.V.I.S – Sprach- und Textassistent für das ganze Life Board.
   Steuerung: Kern antippen = öffnen; Kern halten, sprechen, loslassen = Push-to-talk. Text: Eingabefeld unter dem Kern.
   Zustände: idle, listening, thinking, speaking, error (steuern Kern, Hintergrund und Untertitel).
   Daten: nutzt Assistant (assistant.js) für Überblick, Anfrage und den gespeicherten Chatverlauf (users/{uid}/chats). */
(function(){
'use strict';
if(window.Jarvis)return;
const root=document.documentElement;
const $=(t,a,c)=>{const e=document.createElement(t);if(a)Object.assign(e,a);(c||[]).forEach(x=>e.append(x));return e};
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const loadScript=src=>new Promise((res,rej)=>{if(document.querySelector('script[data-jv="'+src+'"]'))return res();const s=document.createElement('script');s.src=src;s.dataset.jv=src;s.onload=res;s.onerror=()=>rej(new Error('Laden fehlgeschlagen: '+src));document.head.append(s)});
const css=document.createElement('link');css.rel='stylesheet';css.href='jarvis.css?v=5';document.head.append(css);
const ST=()=>(window.LBUI&&LBUI.settings)||{speak:true};
const snd=n=>{try{window.LBUI&&LBUI.sound(n)}catch(e){}};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

let el={},orb=null,state='idle',open=false,rec=null,pressing=false,pressT=0,pressTimer=0,busy=false,speaking=null,lvlRaf=0,revealTimer=0,ready=false,perfNow=null;
let pending=null;   // Rückfrage (Bestätigung) – für Phase 4

function setState(s){
  state=s;if(el.root)el.root.dataset.state=s;
  if(orb)orb.setState(s);
  window.dispatchEvent(new CustomEvent('lb-jarvis',{detail:{state:s}}));
}
function hint(t){if(el.hint)el.hint.textContent=t||''}
function showYou(t){el.you.textContent=t?'Du: '+t:''}
function showSay(t,err){clearInterval(revealTimer);el.say.className=err?'err':'';el.say.textContent=t||''}
/* Wort für Wort einblenden; frac() liefert 0..1 (Fortschritt der Sprachausgabe) oder ms pro Wort für Textmodus */
function reveal(text,opt){
  clearInterval(revealTimer);const words=String(text).split(/\s+/).filter(Boolean);el.say.className='';
  if(!words.length){el.say.textContent='';return Promise.resolve()}
  return new Promise(res=>{
    let shown=0;const tick=()=>{
      const target=opt.frac?Math.min(words.length,Math.ceil(opt.frac()*words.length)):Math.min(words.length,shown+1);
      if(target!==shown){shown=target;el.say.textContent=words.slice(0,shown).join(' ');el.say.scrollTop=el.say.scrollHeight}
      if(shown>=words.length&&(!opt.frac||opt.finished&&opt.finished())){clearInterval(revealTimer);el.say.textContent=text;res()}
    };
    revealTimer=setInterval(tick,opt.frac?60:Math.max(18,opt.ms||40));tick();
  });
}
function err(msg){
  setState('error');showSay(msg,true);hint('');snd('err');
  setTimeout(()=>{if(state==='error')setState('idle')},1500);
}
/* ---------- Öffnen / Schließen ---------- */
function setOpen(v){
  open=v;el.root.dataset.open=v?'1':'0';
  if(v){snd('on');hint('Halten zum Sprechen')}else{stopSpeaking();cancelRec();hint('');hideHist();el.input.blur()}
  setTimeout(()=>orb&&orb.resize(),60);setTimeout(()=>orb&&orb.resize(),560);
}
/* ---------- Aufnahme (Push-to-talk) ---------- */
async function beginListen(){
  if(busy||state==='thinking')return;
  stopSpeaking();
  setOpen(true);pressing=true;showYou('');showSay('');
  try{
    const r=await LBVoice.startRecording();
    if(!pressing){r.cancel();setState('idle');return}   // schon wieder losgelassen (z. B. beim ersten Mikrofon-Dialog)
    rec=r;rec.onlimit=()=>endListen();setState('listening');hint('Ich höre zu … loslassen zum Senden');snd('on');
    const t0=performance.now();
    (function loop(){if(!rec)return;orb.setLevel(rec.level());lvlRaf=requestAnimationFrame(loop)})();
  }catch(e){pressing=false;err(e.message||'Mikrofon nicht verfügbar')}
}
function cancelRec(){if(rec){try{rec.cancel()}catch(e){}rec=null}cancelAnimationFrame(lvlRaf);orb&&orb.setLevel(0)}
async function endListen(){
  pressing=false;if(!rec)return;
  const r=rec;rec=null;cancelAnimationFrame(lvlRaf);orb.setLevel(0);
  const res=r.stop();
  if(res.ms<600||res.peak<.012){setState('idle');hint('Zu kurz oder zu leise – halten und sprechen');showSay('Ich habe nichts gehört.');return}
  busy=true;setState('thinking');hint('Ich verstehe …');snd('ok');
  try{
    const b64=LBVoice.bytesToB64(new Uint8Array(res.wav));
    const s=await Assistant.worker('/stt',{method:'POST',body:JSON.stringify({audio:b64,mime:'audio/wav'})});
    const text=(s.text||'').trim();
    if(!text){busy=false;setState('idle');hint('');showSay('Das habe ich nicht verstanden. Versuch es bitte nochmal.');return}
    await reveal('Du: '+text,{ms:35}).catch(()=>{});el.you.textContent='Du: '+text;showSay('');
    await handle(text,'voice');
  }catch(e){busy=false;err(netMsg(e))}
}
const netMsg=e=>(e&&/^unbekannt$/i.test((e.message||'').trim()))?'Der Cloudflare-Worker ist noch auf dem alten Stand (Sprachfunktion fehlt). Kopiere die neue worker.js in Cloudflare und klicke Deploy.':!navigator.onLine?'Du bist offline. Ohne Netz kann ich gerade nicht antworten.':(e&&/Failed to fetch|NetworkError|Load failed/i.test(e.message))?'Der Server ist nicht erreichbar. Prüfe dein Netz oder versuche es gleich nochmal.':(e&&e.message)||'Unbekannter Fehler';
/* ---------- Anfragen ---------- */
const RE_TEXT=/(nur|ab jetzt|künftig|von jetzt an)[^.]{0,30}(schriftlich|als text|per text|geschrieben)|(antworte|schreib\w*)[^.]{0,25}(nur|ab jetzt)[^.]{0,25}(schriftlich|text)|(sei|bleib)\s+(bitte\s+)?still|(hör|hoer)\w*\s+auf\s+zu\s+sprechen/i;
const RE_SPEAK=/(sprich|sprech)\w*\s+(wieder\s+)?(mit|zu)\s+mir|antworte\s+(wieder\s+)?(gesprochen|mündlich|mit\s+(deiner\s+)?stimme|laut)|(ab jetzt|wieder)\s+(mit\s+)?(stimme|sprechen)/i;
async function handle(text,via){
  busy=true;
  try{
    if(RE_SPEAK.test(text)){LBUI.setSetting('speak',true);const a='Gerne. Ab jetzt spreche ich wieder mit dir.';await Assistant.chat.add(text,a);await present(a,via==='voice',true);return}
    if(RE_TEXT.test(text)){LBUI.setSetting('speak',false);const a='Verstanden. Ab jetzt antworte ich nur noch schriftlich.';await Assistant.chat.add(text,a);await present(a,false,true);return}
    if(pending&&await answerPending(text))return;
    if(pending){pending=null;el.conf.classList.remove('on')}   // neue Frage: offene Rückfrage verfällt
    setState('thinking');hint('Ich denke nach …');
    const wantVoice=via==='voice'&&ST().speak;
    let tl=null;try{if(window.JarvisActions)tl=await JarvisActions.tools()}catch(e){}
    const r=await Assistant.ask(text,'',Assistant.chat.history(10),{voice:wantVoice,tools:tl});
    if(r.calls&&r.calls.length&&window.JarvisActions&&await JarvisActions.handle(r,text))return;
    if(!r.answer){const a='Das kann ich noch nicht. Frag mich nach deinen Daten oder sag mir, was ich eintragen soll.';await Assistant.chat.add(text,a);await present(a,false,true);return}
    const saved=await Assistant.chat.add(text,r.answer);
    if(saved===false)hint('Chat nur auf diesem Gerät gesichert');
    await present(r.answer,wantVoice,false);
    if(r.model&&open)hint('Modell: '+r.model.replace(/^models\//,''));
    if(r.used&&r.limit&&r.used>=r.limit-10)hint('Heute '+r.used+' von '+r.limit+' KI-Anfragen');
  }catch(e){err(netMsg(e))}
  finally{busy=false}
}
async function present(text,speak,short){
  if(speak){await speakText(text)}
  else{setState('idle');hint('');await reveal(text,{ms:text.length>300?18:32})}
  if(state!=='error')setState('idle');
  if(!speak)hint(open?'Halten zum Sprechen':'');
}
/* ---------- Sprachausgabe ---------- */
async function speakText(text){
  setState('thinking');hint('');
  let ctl=null,fallback=false;
  try{
    const res=await Promise.race([Assistant.worker('/tts',{method:'POST',body:JSON.stringify({text,voice:ST().voiceName||'Charon'})}),new Promise((_,rej)=>setTimeout(()=>rej(new Error('TTS zu langsam')),9000))]);
    ctl=await LBVoice.playAudio(res.audio,res.mime);
  }catch(e){
    fallback=true;try{ctl=await LBVoice.speakFallback(text)}catch(e2){ctl=null}
  }
  if(!ctl){setState('idle');await reveal(text,{ms:30});hint('Sprachausgabe nicht möglich – nur Text');return}
  speaking=ctl;setState('speaking');if(fallback)hint('Ersatzstimme (iPad)');
  const t0=performance.now();let ended=false;
  ctl.done.then(()=>{ended=true},()=>{ended=true});
  const dur=()=>Math.max(.5,ctl.duration||text.split(/\s+/).length*.4);
  const frac=()=>{const tm=ctl.time||(performance.now()-t0)/1000;return Math.min(1,tm/dur()*1.04)};
  let amploop=0;(function loop(){if(speaking!==ctl)return;orb.setAmp(ctl.amp());amploop=requestAnimationFrame(loop)})();
  await reveal(text,{frac,finished:()=>ended});
  await ctl.done.catch(()=>{});
  cancelAnimationFrame(amploop);orb.setAmp(0);if(speaking===ctl)speaking=null;
  setState('idle');hint(open?'Halten zum Sprechen':'');
}
function stopSpeaking(){if(speaking){try{speaking.stop()}catch(e){}speaking=null;orb&&orb.setAmp(0)}if(state==='speaking')setState('idle')}
/* ---------- Rückfragen (Bestätigung) – Grundgerüst für Aktionen ---------- */
function confirm(textLines,onYes){
  pending={onYes};el.conf.querySelector('.t').textContent=textLines;el.conf.classList.add('on');setOpen(true);snd('on');
}
async function answerPending(text){
  const yes=/^\s*(ja|jap|jo|klar|mach|bestätig|ok|okay|genau|los)\b/i.test(text),no=/^\s*(nein|abbrech|stopp|lass|nicht)\b/i.test(text);
  if(!yes&&!no)return false;
  const p=pending;pending=null;el.conf.classList.remove('on');
  if(yes){snd('ok');try{await p.onYes()}catch(e){err(netMsg(e))}}else{showSay('Abgebrochen.')}
  return true;
}
/* ---------- Verlauf ---------- */
let histTab='chat';
function hideHist(){el.hist.dataset.show='0'}
async function showHist(tab){
  histTab=tab||histTab;el.hist.dataset.show='1';el.hist.querySelectorAll('.tabs .jb').forEach(b=>b.setAttribute('aria-pressed',b.dataset.t===histTab));
  const body=el.hbody;body.innerHTML='';
  if(histTab==='chat'){
    const ms=Assistant.chat.msgs;
    if(!ms.length){body.append($('div',{className:'empty',textContent:'Noch keine Unterhaltung. Halte den Kern und sprich, oder tippe unten etwas ein.'}));return}
    ms.forEach(m=>{const d=$('div',{className:'m '+(m.role==='user'?'u':'a')});d.append(document.createTextNode(m.content));
      if(m.role!=='user'){const b=$('button',{className:'spk',textContent:'🔊',title:'Vorlesen',ariaLabel:'Vorlesen'});b.onclick=()=>{hideHist();setOpen(true);stopSpeaking();showYou('');speakText(m.content)};d.append(b)}body.append(d)});
    body.scrollTop=body.scrollHeight;
  }else{
    body.append($('div',{className:'empty',textContent:'Lade …'}));
    try{
      await Assistant.chat.ready();const cs=await Assistant.chat.list();body.innerHTML='';
      if(!cs.length){body.append($('div',{className:'empty',textContent:'Noch keine gespeicherten Chats. Jede Unterhaltung wird nach der ersten Antwort automatisch gespeichert.'}));return}
      cs.forEach(c=>{
        const row=$('div',{className:'c'});row.innerHTML='<div><b>'+esc(c.title)+'</b><small>'+new Date(c.updatedAt||0).toLocaleDateString('de-DE')+' · '+((c.messages||[]).length/2|0)+' Fragen'+(c.id===Assistant.chat.id?' · aktuell':'')+'</small></div>';
        const del=$('button',{textContent:'🗑',title:'Löschen',ariaLabel:'Chat löschen'});
        row.onclick=()=>{Assistant.chat.open(c);showYou('');showSay('Chat „'+c.title+'“ geöffnet. Du kannst weitermachen.');showHist('chat')};
        del.onclick=async ev=>{ev.stopPropagation();if(!window.confirm('Diesen Chat löschen?'))return;try{await Assistant.chat.remove(c.id);row.remove()}catch(e){err('Löschen fehlgeschlagen: '+e.message)}};
        row.append(del);body.append(row);
      });
    }catch(e){body.innerHTML='';body.append($('div',{className:'empty',textContent:'Chats konnten nicht geladen werden: '+e.message}))}
  }
}
/* ---------- Hub-Modus: Jarvis in der Mitte, alle Knöpfe schweben als Plattformen darum ---------- */
const isIndex=(()=>{const f=location.pathname.split('/').pop();return !f||f==='index.html'})();
const hubOn=()=>{const h=document.getElementById('hub');return isIndex&&!!h&&!h.hidden};
const IC={
  imp:'<path d="M12 3v11M7 10l5 5 5-5M4 20h16"/>',chk:'<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>',
  who:'<path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z"/>',save:'<path d="M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6"/>',
  out:'<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>'};
let hubEl=null,lines=null;
function buildHub(r,n){
  if(!isIndex)return;
  if(!document.querySelector('#lb-nav a.tab')){if((n||0)<12)setTimeout(()=>buildHub(r,(n||0)+1),250);return}
  hubEl=$('div',{id:'jv-hubp'});r.prepend(hubEl);
  lines=document.createElementNS('http://www.w3.org/2000/svg','svg');lines.id='jv-lines';hubEl.append(lines);
  const tabs=[...document.querySelectorAll('#lb-nav a.tab')];
  const svgOf=a=>a.querySelector('svg').outerHTML;
  const gear=document.querySelector('#lb-gear');
  const items=[];
  const T=id=>tabs.find(a=>a.dataset.tab===id);
  ['heute','recovery','lernen','puzzle'].forEach(id=>{const a=T(id);if(a)items.push({n:a.querySelector('span').textContent,svg:svgOf(a),rgb:a.style.getPropertyValue('--tc'),href:a.getAttribute('href')})});
  items.push({n:'Import',svg:'<svg viewBox="0 0 24 24">'+IC.imp+'</svg>',rgb:'150 175 205',href:'import.html?v=2'});
  items.push({n:'Habits',svg:'<svg viewBox="0 0 24 24">'+IC.chk+'</svg>',rgb:'120 140 160',off:'bald'});
  items.push({n:'Whoop',svg:'<svg viewBox="0 0 24 24">'+IC.who+'</svg>',rgb:'255 90 122',sheet:'wh'});
  items.push({n:'Sichern',svg:'<svg viewBox="0 0 24 24">'+IC.save+'</svg>',rgb:'255 214 100',sheet:'bk'});
  items.push({n:'Optionen',svg:gear?gear.querySelector('svg').outerHTML:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/></svg>',rgb:'58 215 255',fn:()=>gear&&gear.click()});
  items.push({n:'Abmelden',svg:'<svg viewBox="0 0 24 24">'+IC.out+'</svg>',rgb:'255 130 110',fn:()=>{const b=document.getElementById('logoutBtn');if(b)b.click()}});
  items.forEach((it,i)=>{
    const c=$(it.href?'a':'button',it.href?{href:it.href}:{type:'button'});c.className='hp'+(it.off?' off':'');c.style.setProperty('--tc',it.rgb);c.style.setProperty('--d',(i*0.55)+'s');
    c.innerHTML='<u class="hp-base"></u><span class="hp-in"><i class="hp-sh"></i><i class="hp-t1"></i><i class="hp-t2"></i><span class="hp-ic">'+it.svg+'</span><span class="hp-n">'+it.n+'</span></span>'+(it.off?'<em>'+it.off+'</em>':'');
    if(it.sheet)c.onclick=()=>openSheet(it.sheet);
    if(it.fn)c.onclick=it.fn;
    if(it.off)c.setAttribute('aria-disabled','true');
    hubEl.append(c);
  });
  const back=$('div',{id:'hub-back'});back.hidden=true;document.body.append(back);back.onclick=closeSheet;
  ['wh','bk'].forEach(id=>{const s=document.getElementById(id);if(!s)return;const x=$('button',{className:'sheetx',type:'button',textContent:'✕',ariaLabel:'Schließen'});x.onclick=closeSheet;s.prepend(x)});
  addEventListener('resize',layoutHub);addEventListener('orientationchange',()=>setTimeout(layoutHub,300));
  const h=document.getElementById('hub');
  if(h)new MutationObserver(applyHub).observe(h,{attributes:true,attributeFilter:['hidden']});
  applyHub();setTimeout(layoutHub,400);setTimeout(layoutHub,1500);
}
function openSheet(id){closeSheet();const s=document.getElementById(id);if(!s)return;s.classList.add('sheet-open');document.getElementById('hub-back').hidden=false;LBUI.sound&&LBUI.sound('on')}
function closeSheet(){document.querySelectorAll('.sheet-open').forEach(s=>s.classList.remove('sheet-open'));const b=document.getElementById('hub-back');if(b)b.hidden=true}
function applyHub(){const on=hubOn();root.toggleAttribute('data-hubmode',on);if(on)layoutHub()}
function layoutHub(){
  if(!hubEl||!hubOn())return;
  const W=innerWidth,H=innerHeight,dop=document.getElementById('dop'),top=document.querySelector('#hub .top');
  const tb=Math.max(dop?dop.getBoundingClientRect().bottom:0,top?top.getBoundingClientRect().bottom:0,70)+10;
  const items=[...hubEl.querySelectorAll('.hp')],n=items.length;
  const pw=W<700?92:126,ph=W<700?80:104;
  const availH=H-tb-14,cy=tb+availH/2;
  const ry=Math.max(110,availH/2-ph/2-6),rx=Math.min(W*0.44,W/2-pw/2-8,470);
  const osz=Math.max(150,Math.min(300,ry*1.05,rx*0.7));
  const st=document.documentElement.style;st.setProperty('--hcy',cy+'px');st.setProperty('--hos',osz+'px');
  items.forEach((c,i)=>{const a=(-90+18+i*(360/n))*Math.PI/180;
    c.style.width=pw+'px';c.style.height=ph+'px';
    c.style.left=(W/2+Math.cos(a)*rx-pw/2)+'px';c.style.top=(cy+Math.sin(a)*ry-ph/2)+'px'});
  if(lines){lines.setAttribute('viewBox','0 0 '+W+' '+H);lines.setAttribute('width',W);lines.setAttribute('height',H);
    lines.innerHTML=items.map((c,i)=>{const a=(-90+18+i*(360/n))*Math.PI/180,px=W/2+Math.cos(a)*rx,py=cy+Math.sin(a)*ry,dx=px-W/2,dy=py-cy,L=Math.hypot(dx,dy)||1,ux=dx/L,uy=dy/L,r0=osz*0.5,r1=Math.min(pw,ph)*0.55;
      return '<line x1="'+(W/2+ux*r0)+'" y1="'+(cy+uy*r0)+'" x2="'+(px-ux*r1)+'" y2="'+(py-uy*r1)+'" style="--tc:'+c.style.getPropertyValue('--tc')+';--d:'+(i*0.3)+'s"/>'}).join('')}
  setTimeout(()=>{if(orb)orb.resize()},60);
}
/* ---------- Aufbau ---------- */
function build(){
  root.setAttribute('data-jarvis','');
  const r=$('div',{id:'jv'});r.dataset.open='0';r.dataset.state='idle';r.innerHTML=
   '<div id="jv-dim"></div><aside id="jv-hist" data-show="0" aria-label="Verlauf"><header><span>Verlauf</span><button class="jb" id="jv-hnew">＋ Neuer Chat</button><button class="jb" id="jv-hx" aria-label="Schließen">✕</button></header><div class="tabs"><button class="jb" data-t="chat" aria-pressed="true">Dieser Chat</button><button class="jb" data-t="all" aria-pressed="false">Alle Chats</button></div><div id="jv-hbody"></div></aside>'+
   '<div id="jv-stage"><div id="jv-orb" role="button" aria-label="Jarvis – antippen zum Öffnen, halten zum Sprechen"><canvas></canvas><div id="jv-name">J.A.R.V.I.S</div><div id="jv-hit"></div></div>'+
   '<div id="jv-hint"></div><div id="jv-sub"><div id="jv-you"></div><div id="jv-say" aria-live="polite"></div></div>'+
   '<div id="jv-confirm"><div class="t"></div><div class="r"><button class="jb" id="jv-yes">Bestätigen</button><button class="jb" id="jv-no">Abbrechen</button></div></div>'+
   '<form id="jv-form" autocomplete="off"><input id="jv-in" type="text" enterkeyhint="send" placeholder="Schreib Jarvis …" aria-label="Nachricht an Jarvis"><button class="jb" type="submit" aria-label="Senden">➤</button></form>'+
   '<div id="jv-bar"><button class="jb" id="jv-mode" aria-pressed="true"></button><button class="jb" id="jv-whoop" aria-pressed="true">Whoop-Daten</button><button class="jb" id="jv-histb">Verlauf</button><button class="jb" id="jv-close">Schließen</button></div></div>';
  document.body.append(r);
  setTimeout(()=>buildHub(r),0);
  el={root:r,canvas:r.querySelector('canvas'),orb:r.querySelector('#jv-orb'),hit:r.querySelector('#jv-hit'),hint:r.querySelector('#jv-hint'),you:r.querySelector('#jv-you'),say:r.querySelector('#jv-say'),
      form:r.querySelector('#jv-form'),input:r.querySelector('#jv-in'),hist:r.querySelector('#jv-hist'),hbody:r.querySelector('#jv-hbody'),conf:r.querySelector('#jv-confirm'),mode:r.querySelector('#jv-mode'),whoop:r.querySelector('#jv-whoop')};
  try{new ResizeObserver(()=>{if(orb)orb.resize()}).observe(el.orb)}catch(e){}
  /* Push-to-talk auf dem Kern */
  const o=el.orb;
  o.addEventListener('contextmenu',e=>e.preventDefault());
  o.addEventListener('pointerdown',e=>{
    e.preventDefault();try{o.setPointerCapture(e.pointerId)}catch(x){}
    try{LBVoice.ctx()}catch(x){}   // Audio nur nach Nutzergeste entsperren
    pressT=performance.now();pressing=true;
    pressTimer=setTimeout(()=>{if(pressing)beginListen()},open?120:260);
  });
  const up=()=>{
    clearTimeout(pressTimer);const held=performance.now()-pressT;
    if(rec){endListen();return}
    if(pressing&&held<260){ // kurzes Antippen
      pressing=false;
      if(state==='speaking'){stopSpeaking();hint('Unterbrochen');return}
      if(!open)setOpen(true);else hint('Halten zum Sprechen, loslassen zum Senden');
      return;
    }
    pressing=false;
  };
  o.addEventListener('pointerup',up);o.addEventListener('pointercancel',()=>{clearTimeout(pressTimer);pressing=false;if(rec){cancelRec();setState('idle');hint('')}});
  r.querySelector('#jv-dim').addEventListener('pointerdown',()=>{if(!rec&&state!=='thinking')setOpen(false)});
  r.querySelector('#jv-close').onclick=()=>setOpen(false);
  r.querySelector('#jv-histb').onclick=()=>{el.hist.dataset.show==='1'?hideHist():showHist('chat')};
  r.querySelector('#jv-hx').onclick=hideHist;
  r.querySelector('#jv-hnew').onclick=()=>{Assistant.chat.fresh();showYou('');showSay('Neuer Chat gestartet.');showHist('chat')};
  r.querySelectorAll('#jv-hist .tabs .jb').forEach(b=>b.onclick=()=>showHist(b.dataset.t));
  r.querySelector('#jv-yes').onclick=()=>answerPending('ja');r.querySelector('#jv-no').onclick=()=>answerPending('nein');
  el.mode.onclick=()=>LBUI.setSetting('speak',!ST().speak);
  el.whoop.onclick=()=>{const v=!Assistant.useWhoop();Assistant.setWhoop(v);syncBar()};
  el.form.onsubmit=async ev=>{ev.preventDefault();const t=el.input.value.trim();if(!t||busy)return;el.input.value='';el.input.blur();stopSpeaking();showYou(t);showSay('');await handle(t,'text')};
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&open&&!rec)setOpen(false)});
  const syncBar=()=>{el.mode.setAttribute('aria-pressed',!!ST().speak);el.mode.textContent=ST().speak?'🔊 Sprechen':'Aa Nur Text';el.whoop.setAttribute('aria-pressed',!!Assistant.useWhoop())};
  syncBar();LBUI.onSettings(()=>{syncBar();rebuildOrbIfNeeded()});
}
async function makeOrb(){
  const perf=!!ST().perf;perfNow=perf;
  try{if(!window.THREE)await loadScript('vendor/three.min.js?v=150');await loadScript('jarvis-orb.js?v=1');
    if(orb){orb.destroy();orb=null}
    orb=JarvisOrb.create(el.canvas,{perf});orb.setState(state);
  }catch(e){hint('3D-Kern nicht verfügbar');el.canvas.style.display='none';el.orb.style.background='radial-gradient(circle,rgba(255,190,90,.55),rgba(255,120,30,.1) 60%,transparent 70%)';orb={setState(){},setLevel(){},setAmp(){},resize(){},pause(){},resume(){},destroy(){}}}
}
function rebuildOrbIfNeeded(){if(el.canvas&&perfNow!==!!ST().perf)makeOrb()}
async function init(){
  if(ready)return;ready=true;
  try{await Promise.all([window.Assistant?Promise.resolve():loadScript('assistant.js?v=3').catch(()=>{}),loadScript('voice.js?v=1'),loadScript('jarvis-actions.js?v=2')])}catch(e){}
  if(!window.Assistant||!window.LBVoice){ready=false;return}
  build();await makeOrb();
}
/* Nur aktiv, wenn der Nutzer angemeldet ist (sonst Anmeldeseite) */
function start(){
  if(typeof auth==='undefined'){return}
  auth.onAuthStateChanged(u=>{if(u&&!window.Jarvis_ui){window.Jarvis_ui=true;init()}else if(!u&&el.root){el.root.remove();el={};root.removeAttribute('data-jarvis');window.Jarvis_ui=false;ready=false}});
}
window.Jarvis={notice:(t,bad,speak)=>{setOpen(true);if(bad){snd('err');showSay(t,true)}else present(t,!!speak&&ST().speak,true)},setState,get state(){return state},open:()=>setOpen(true),close:()=>setOpen(false),say:(t,speak)=>present(t,!!speak&&ST().speak,false),ask:t=>handle(t,'text'),confirm,
  get isOpen(){return open},speakText};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
