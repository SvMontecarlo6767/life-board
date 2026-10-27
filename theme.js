/* Life Board – HUD-Schicht: Reiter-Navigation, Akzentfarben, Einstellungen, Sounds, Übergänge, 3D-Hintergrund.
   Neue Reiter: einfach in TABS eintragen (oder LBUI.registerTab({...}) aufrufen) – Navigation, Akzentwechsel und Übergänge kommen automatisch. */
(function(){
'use strict';
const root=document.documentElement;
/* ---------- Reiter-Konfiguration ---------- */
const ICON={
  hub:'<path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10"/>',
  checkin:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  muster:'<path d="M4 19l5-6 4 3 7-9"/><circle cx="4" cy="19" r="1.5"/><circle cx="9" cy="13" r="1.5"/><circle cx="13" cy="16" r="1.5"/><circle cx="20" cy="7" r="1.5"/>',
  recovery:'<path d="M3 12h4l2-6 4 12 2-6h6"/>',
  lernen:'<path d="M4 5h7a3 3 0 013 3v12a2 2 0 00-2-2H4zM20 5h-7a3 3 0 00-3 3v12a2 2 0 012-2h8z"/>',
  training:'<circle cx="15" cy="5" r="2"/><path d="M13 21l-1-6 3-3-2-4-4 2-2 4M12 9l5 3 3-1M9 21l3-6"/>',
  kalender:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 14h2M12 14h2M16 14h2M8 18h2M12 18h2"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 00-.1-1.2l2-1.5-2-3.4-2.3.9a7 7 0 00-2-1.2L14.2 3h-4l-.4 2.6a7 7 0 00-2 1.2l-2.3-.9-2 3.4 2 1.5A7 7 0 005 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-.9c.6.5 1.3.9 2 1.2l.4 2.6h4l.4-2.6c.7-.3 1.4-.7 2-1.2l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z"/>'
};
const TABS=[
  {id:'hub',name:'Hub',file:'index.html',href:'index.html',rgb:[58,215,255],rgb2:[120,150,255]},
  {id:'checkin',name:'Check-in',file:'checkin.html',href:'checkin.html?v=2',rgb:[255,190,90],rgb2:[255,120,160]},
  {id:'kalender',name:'Kalender',file:'calendar.html',href:'calendar.html?v=3',rgb:[255,200,70],rgb2:[255,120,90]},
  {id:'recovery',name:'Recovery',file:'recovery.html',href:'recovery.html?v=6',rgb:[52,235,170],rgb2:[58,215,255]},
  {id:'lernen',name:'Lernen',file:'learn.html',href:'learn.html?v=3',rgb:[150,125,255],rgb2:[70,140,255]},
  {id:'training',name:'Training',file:'training.html',href:'training.html?v=4',rgb:[255,84,96],rgb2:[255,154,92]},
  {id:'muster',name:'Muster',file:'muster.html',href:'muster.html?v=2',rgb:[120,230,255],rgb2:[180,120,255]}
];
const fileOf=()=>{const f=location.pathname.split('/').pop();return f||'index.html'};
const curTab=()=>TABS.find(t=>t.file===fileOf())||TABS[0];
/* ---------- Designs: ändern NUR Farben, Hintergrund und Stimmung (Variablen in theme.css, Akzent je Reiter hier) ----------
   Neues Design: hier eintragen + in theme.css einen Block html[data-hud][data-theme="id"]{...} ergänzen. Funktionen bleiben unberührt. */
const THEMES={
  cockpit:{id:'cockpit',name:'Cockpit',sw:['#3ad7ff','#7896ff'],meta:'#04080f'},
  jungle:{id:'jungle',name:'Dschungel',sw:['#6fe39a','#d8e86a'],meta:'#050d08',
    tabs:{hub:[[110,225,140],[205,235,105]],checkin:[[255,196,92],[255,140,80]],kalender:[[240,205,90],[225,140,70]],
      recovery:[[60,222,165],[130,232,120]],lernen:[[200,140,235],[140,110,235]],training:[[255,112,80],[255,172,70]],muster:[[120,228,210],[190,232,120]]}}
};
const themeOf=()=>THEMES[S.theme]||THEMES.cockpit;
const trgb=t=>{const x=themeOf().tabs&&themeOf().tabs[t.id];return x?x[0]:t.rgb};
const trgb2=t=>{const x=themeOf().tabs&&themeOf().tabs[t.id];return x?x[1]:t.rgb2};
/* ---------- Einstellungen (localStorage + Firestore best effort) ---------- */
const DEF={perf:false,sounds:true,tilt:false,fps:false,theme:'cockpit'};
let S=Object.assign({},DEF);
try{S=Object.assign({},DEF,JSON.parse(localStorage.getItem('lb_ui')||'{}'))}catch(e){}
const listeners=[];
function applyTheme(){
  const th=themeOf();
  if(th.id==='cockpit')root.removeAttribute('data-theme');else root.setAttribute('data-theme',th.id);
  const m=document.querySelector('meta[name="theme-color"]');if(m)m.content=th.meta;
  if(th.id==='jungle'&&!document.getElementById('lb-fonts2')){const l=document.createElement('link');l.id='lb-fonts2';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Fraunces:wght@500;700&display=swap';document.head.append(l)}
}
function applySettings(){
  if(S.perf)root.setAttribute('data-perf','');else root.removeAttribute('data-perf');
  applyTheme();
  listeners.forEach(f=>{try{f(S)}catch(e){}});
}
function setSetting(k,v){
  S[k]=v;try{localStorage.setItem('lb_ui',JSON.stringify(S))}catch(e){}
  applySettings();
  pushSettings();
}
let UID=null;
function pushSettings(){try{const u=UID||(typeof auth!=='undefined'&&auth.currentUser&&auth.currentUser.uid);if(u)fs.doc('users/'+u+'/settings/main').set({ui:S},{merge:true}).catch(()=>{})}catch(e){}}
applySettings();
/* ---------- Akzentfarbe: sanft vom letzten Reiter zum aktuellen ---------- */
function setAcc(rgb,rgb2){root.style.setProperty('--acc',rgb.map(Math.round).join(' '));if(rgb2)root.style.setProperty('--acc2',rgb2.map(Math.round).join(' '))}
function accentIn(tab){
  let prev=null;try{prev=JSON.parse(sessionStorage.getItem('lb_acc')||'null')}catch(e){}
  const R=trgb(tab),R2=trgb2(tab);
  try{sessionStorage.setItem('lb_acc',JSON.stringify(R))}catch(e){}
  root.style.setProperty('--tc',R.join(' '));root.setAttribute('data-tab',tab.id);
  if(!prev||S.perf||matchMedia('(prefers-reduced-motion: reduce)').matches||prev.join()===R.join()){setAcc(R,R2);return}
  const t0=performance.now(),D=700;
  (function step(now){const k=Math.min(1,(now-t0)/D),e=k<.5?2*k*k:1-Math.pow(-2*k+2,2)/2;setAcc(R.map((c,i)=>prev[i]+(c-prev[i])*e),R2);if(k<1)requestAnimationFrame(step)})(t0);
}
/* ---------- Sounds (WebAudio, nur nach Nutzergeste) ---------- */
let AC=null;
function audio(){
  if(!AC){try{AC=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return null}}
  if(AC.state==='suspended')AC.resume().catch(()=>{});
  return AC;
}
const SND={tap:[[880,.04,.05]],on:[[440,.08,.07],[660,.08,.07],[990,.12,.08]],ok:[[660,.07,.07],[880,.12,.07]],off:[[660,.06,.05],[440,.1,.05]],level:[[523,.1,.08],[659,.1,.08],[784,.1,.08],[1047,.28,.09]],err:[[220,.12,.07],[165,.18,.07]]};
function sound(name){
  if(!S.sounds)return;const a=audio();if(!a)return;
  let t=a.currentTime+.005;
  (SND[name]||SND.tap).forEach(([f,d,v])=>{const o=a.createOscillator(),g=a.createGain();o.type='sine';o.frequency.value=f;
    g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(a.destination);o.start(t);o.stop(t+d+.02);t+=d*.85});
}
document.addEventListener('pointerdown',e=>{
  if(e.target.closest&&e.target.closest('button,.chip,.tile,a.tab,a.btn'))sound('tap');
},{passive:true,capture:true});
/* Level-Up-Ton, wenn die Seite die Level-Overlay einblendet */
new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1&&(n.classList.contains('lvlup')||n.querySelector&&n.querySelector('.lvlup'))){sound('level');return}}).observe(document.documentElement,{childList:true,subtree:true});
/* ---------- Navigation + Einstellungs-Panel ---------- */
function buildNav(){
  if(document.getElementById('lb-nav'))return;
  const cur=curTab();
  const nav=document.createElement('nav');nav.id='lb-nav';nav.setAttribute('aria-label','Reiter');
  nav.innerHTML='<span class="brand">LIFE BOARD</span><div class="tabs">'+TABS.map(t=>'<a class="tab'+(t.id===cur.id?' act':'')+'" href="'+t.href+'" style="--tc:'+trgb(t).join(' ')+'" data-tab="'+t.id+'"><svg viewBox="0 0 24 24">'+(ICON[t.id]||ICON.hub)+'</svg><span>'+t.name+'</span></a>').join('')+'</div><button class="gear" id="lb-gear" aria-label="Einstellungen"><svg viewBox="0 0 24 24">'+ICON.gear+'</svg></button>';
  document.body.prepend(nav);
  const panel=document.createElement('div');panel.id='lb-set';panel.hidden=true;
  const row=(k,t,sub)=>'<div class="r"><div>'+t+(sub?'<small>'+sub+'</small>':'')+'</div><button class="lb-sw" role="switch" data-k="'+k+'" aria-checked="'+!!S[k]+'" aria-label="'+t+'"></button></div>';
  panel.innerHTML='<h4>Einstellungen</h4>'+'<div class="th"><div class="thl">Design<small>Ändert nur Farben und Stimmung, an den Funktionen ändert sich nichts</small></div><div class="thg">'+Object.values(THEMES).map(t=>'<button class="lb-th" data-th="'+t.id+'" aria-pressed="'+(t.id===themeOf().id)+'"><i style="background:linear-gradient(135deg,'+t.sw[0]+','+t.sw[1]+')"></i>'+t.name+'</button>').join('')+'</div></div>'+row('perf','Performance-Modus','Schwächt 3D-Hintergrund, Unschärfe und Animationen ab')+row('sounds','UI-Sounds','Dezente Töne bei Tipp, Bestätigung, Level-Up')+row('tilt','Geräteneigung','Tiefe im Hintergrund durch Kippen (fragt nach Erlaubnis)')+row('fps','FPS-Anzeige','Kleine Zahl unten links, zum Prüfen der Flüssigkeit auf dem iPad');
  document.body.append(panel);
  nav.querySelector('#lb-gear').onclick=()=>{panel.hidden=!panel.hidden;sound(panel.hidden?'off':'on')};
  document.addEventListener('pointerdown',e=>{if(!panel.hidden&&!panel.contains(e.target)&&!nav.querySelector('#lb-gear').contains(e.target))panel.hidden=true},true);
  panel.querySelectorAll('.lb-sw').forEach(b=>b.onclick=async()=>{
    const k=b.dataset.k,v=b.getAttribute('aria-checked')!=='true';
    if(k==='tilt'&&v){
      try{if(typeof DeviceOrientationEvent!=='undefined'&&DeviceOrientationEvent.requestPermission){const r=await DeviceOrientationEvent.requestPermission();if(r!=='granted'){sound('err');return}}}catch(e){sound('err');return}
    }
    b.setAttribute('aria-checked',v);setSetting(k,v);sound(v?'on':'off');
  });
  panel.querySelectorAll('.lb-th').forEach(b=>b.onclick=()=>{setTheme(b.dataset.th);sound('ok')});
  const h=nav.getBoundingClientRect().height;if(h)root.style.setProperty('--navh',Math.ceil(h)+'px');
}
/* ---------- Design wechseln: weich überblenden (View Transitions, sonst kurzes Farbüberblenden) ---------- */
function refreshThemeUI(){
  const nav=document.getElementById('lb-nav');
  if(nav)nav.querySelectorAll('a.tab').forEach(a=>{const t=TABS.find(x=>x.id===a.dataset.tab);if(t)a.style.setProperty('--tc',trgb(t).join(' '))});
  document.querySelectorAll('#lb-set .lb-th').forEach(b=>b.setAttribute('aria-pressed',b.dataset.th===themeOf().id));
  const tab=curTab(),R=trgb(tab);
  root.style.setProperty('--tc',R.join(' '));setAcc(R,trgb2(tab));
  try{sessionStorage.setItem('lb_acc',JSON.stringify(R))}catch(e){}
  window.dispatchEvent(new Event('lb-theme'));
}
function setTheme(id){
  if(!THEMES[id]||id===themeOf().id)return;
  const run=()=>{setSetting('theme',id);refreshThemeUI()};
  const calm=S.perf||matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!calm&&document.startViewTransition){try{document.startViewTransition(run);return}catch(e){}}
  if(!calm){root.classList.add('lb-themeswap');setTimeout(()=>root.classList.remove('lb-themeswap'),900)}
  run();
}
/* ---------- Seitenübergänge ---------- */
function transitions(){
  document.addEventListener('click',e=>{
    const a=e.target.closest&&e.target.closest('a[href]');if(!a||e.defaultPrevented||e.metaKey||e.ctrlKey||a.target==='_blank'||a.hasAttribute('download'))return;
    const u=new URL(a.href,location.href);if(u.origin!==location.origin||(u.pathname===location.pathname&&u.search===location.search&&u.hash))return;
    if(S.perf||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    e.preventDefault();root.classList.add('lb-leave');setTimeout(()=>{location.href=a.href},190);
    setTimeout(()=>root.classList.remove('lb-leave'),1500);   // Sicherung, falls die Navigation nicht stattfindet
  });
  window.addEventListener('pageshow',e=>{root.classList.remove('lb-leave')});
}
/* ---------- Einblenden beim Scrollen ---------- */
function reveal(){
  if(S.perf||matchMedia('(prefers-reduced-motion: reduce)').matches||!('IntersectionObserver' in window))return;
  const els=[...document.querySelectorAll('.card,.tile,.grp')].filter(e=>!e.closest('#lb-set')&&!e.closest('.ov'));
  const io=new IntersectionObserver(es=>es.forEach(en=>{if(en.isIntersecting){en.target.classList.add('in');io.unobserve(en.target)}}),{threshold:.04,rootMargin:'0px 0px -4% 0px'});
  els.forEach((e,i)=>{if(e.classList.contains('rv'))return;e.classList.add('rv');e.style.setProperty('--d',Math.min(i,8)*0.04+'s');io.observe(e)});
  setTimeout(()=>els.forEach(e=>e.classList.add('in')),2500);   // Sicherung: nichts bleibt unsichtbar
}

/* ---------- FPS-Anzeige (nur wenn eingeschaltet) + Pause, wenn die Seite verborgen ist ---------- */
let fpsEl=null,fpsRaf=0;
function fpsLoop(){
  if(!S.fps){if(fpsEl){fpsEl.remove();fpsEl=null}fpsRaf=0;return}
  if(!fpsEl){fpsEl=document.createElement('div');fpsEl.id='lb-fps';document.body.append(fpsEl)}
  let n=0,t0=performance.now(),worst=0,last=t0;
  (function f(now){
    if(!S.fps){fpsLoop();return}
    n++;worst=Math.max(worst,now-last);last=now;
    if(now-t0>=1000){fpsEl.textContent=Math.round(n*1000/(now-t0))+' fps · max '+Math.round(worst)+' ms';n=0;worst=0;t0=now}
    fpsRaf=requestAnimationFrame(f);
  })(t0);
}
document.addEventListener('visibilitychange',()=>root.classList.toggle('lb-hidden',document.hidden));
/* ---------- Hochzählen ---------- */
function countUp(el,to,opt){
  opt=opt||{};const from=opt.from!=null?opt.from:0,dur=S.perf?0:(opt.dur||800),fmt=opt.fmt||(n=>String(Math.round(n)));
  if(!dur||matchMedia('(prefers-reduced-motion: reduce)').matches){el.textContent=fmt(to);return}
  const t0=performance.now();(function step(now){const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,3);el.textContent=fmt(from+(to-from)*e);if(k<1)requestAnimationFrame(step)})(t0);
}
/* ---------- Fonts + 3D-Hintergrund laden ---------- */
function fonts(){
  if(document.getElementById('lb-fonts'))return;
  const l=document.createElement('link');l.id='lb-fonts';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Rajdhani:wght@500;600;700&display=swap';
  document.head.append(l);
}
function loadScript(src){return new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.append(s)})}
let bgStarted=false;
async function bg(){
  if(bgStarted||S.perf)return;bgStarted=true;
  try{await loadScript('vendor/three.min.js?v=150');await loadScript('bg3d.js?v=3')}catch(e){bgStarted=false}
}
/* ---------- Start ---------- */
const API={TABS,THEMES,setTheme,get settings(){return S},setSetting,onSettings:f=>listeners.push(f),sound,countUp,
  registerTab(t){const i=TABS.findIndex(x=>x.id===t.id);if(i>=0)TABS[i]=t;else TABS.push(t);const n=document.getElementById('lb-nav');if(n){n.remove();buildNav()}},
  setAccent:setAcc,curTab};
window.LBUI=API;
function start(){
  if(!root.hasAttribute('data-hud'))root.setAttribute('data-hud','');
  fonts();buildNav();accentIn(curTab());transitions();
  requestAnimationFrame(()=>root.classList.add('lb-ready'));
  setTimeout(reveal,60);
  // 3D-Hintergrund erst laden, wenn die Seite steht (three.js ist 600 KB und soll Daten und Diagramme nicht bremsen)
  {const later=()=>(window.requestIdleCallback||setTimeout)(()=>bg(),{timeout:2500});if(document.readyState==='complete')later();else addEventListener('load',later,{once:true})}
  listeners.push(s=>{if(!s.perf)bg();if(s.fps&&!fpsRaf)fpsLoop();});
  if(S.fps)fpsLoop();
  // gespeicherte Einstellungen vom Server holen, wenn lokal noch nichts gespeichert wurde
  try{if(typeof auth!=='undefined')auth.onAuthStateChanged(async u=>{if(!u)return;UID=u.uid;if(localStorage.getItem('lb_ui')){pushSettings();return}try{const d=await fs.doc('users/'+u.uid+'/settings/main').get();const ui=d.exists&&d.data().ui;if(ui){S=Object.assign({},DEF,ui);localStorage.setItem('lb_ui',JSON.stringify(S));applySettings();refreshThemeUI();document.querySelectorAll('#lb-set .lb-sw').forEach(b=>b.setAttribute('aria-checked',!!S[b.dataset.k]))}}catch(e){}})}catch(e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
/* App-Modus: Service Worker (Offline-Start). Nicht im Test-Browser. */
try{if('serviceWorker' in navigator&&!navigator.webdriver&&(location.protocol==='https:'||location.hostname==='localhost'))addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}))}catch(e){}
/* Graph-Vollbild: alle übrigen Diagramme automatisch vergrößerbar machen (Phase 7) */
try{addEventListener('load',()=>{if(window.GraphFull&&!/\/(index\.html)?$/.test(location.pathname))GraphFull.auto({exclude:'#hudHero,#jv'})})}catch(e){}
