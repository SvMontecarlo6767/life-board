/* Life Board – animierte Hintergründe je Design (nur Darstellung, keine Daten, keine Logik).
   Cockpit: Vanta NET (3D-Netz), Klassik (bisheriger 3D-Hintergrund, bg3d.js) oder Leicht (tsParticles-Netz).
   Dschungel: Glühwürmchen oder fallende Blätter (tsParticles) oder Klassik.
   „Automatisch“: Handy → Leicht bzw. Glühwürmchen; iPad/Computer → Vanta, fällt nach kurzer Messung auf Leicht zurück, wenn es ruckelt.
   Jede Ebene liegt hinter allem (z-index -1, pointer-events none). Performance-Modus oder „Bewegung reduzieren“ → keine Animation,
   nur der ruhige CSS-Verlauf aus theme.css. Lädt eine Bibliothek nicht, bleibt ebenfalls der Verlauf. Versteckter Tab → Pause.
   Bibliotheken liegen lokal in vendor/ und werden erst geladen, wenn sie gebraucht werden. */
(function(){
'use strict';
if(window.LBBG)return;
const root=document.documentElement;
const ST=()=>(window.LBUI&&LBUI.settings)||{};
const reduced=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
const phone=()=>{try{return matchMedia('(pointer: coarse)').matches&&Math.min(screen.width,screen.height)<600}catch(e){return false}};
const theme=()=>root.getAttribute('data-theme')==='jungle'?'jungle':'cockpit';
const SRC={t134:'vendor/three.r134.min.js?v=134',vanta:'vendor/vanta.net.min.js?v=0524',tsp:'vendor/tsparticles.slim.bundle.min.js?v=350',t150:'vendor/three.min.js?v=150',classic:'bg3d.js?v=4'};
const loaded={};
function load(src){
  if(!loaded[src])loaded[src]=new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.async=true;s.onload=res;s.onerror=()=>{delete loaded[src];rej(new Error('nicht geladen: '+src))};document.head.append(s)});
  return loaded[src];
}
const rgb=n=>{const v=getComputedStyle(root).getPropertyValue(n).trim().split(/\s+/).map(Number);return v.length===3&&v.every(x=>isFinite(x))?v:[58,215,255]};
const hex=a=>'#'+a.map(x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,'0')).join('');
const hexNum=a=>parseInt(hex(a).slice(1),16);

/* ---------- welcher Hintergrund? ---------- */
const CHOICES={
  cockpit:[['auto','Automatisch'],['vanta','3D-Netz'],['classic','Klassik 3D'],['light','Leicht']],
  jungle:[['auto','Automatisch'],['fireflies','Glühwürmchen'],['leaves','Blätter'],['classic','Klassik 3D']]
};
function slow(){try{return localStorage.getItem('lb_bgslow')==='1'}catch(e){return false}}
function wanted(){
  const s=ST();if(s.perf||reduced())return 'none';
  if(theme()==='jungle'){const m=s.bgj||'auto';return m==='auto'?'fireflies':m}
  const m=s.bgc||'auto';if(m!=='auto')return m;
  return phone()||slow()?'light':'vanta';
}

/* ---------- Ebenen ---------- */
let css=false,nid=0;
function layer(){
  if(!css){css=true;const s=document.createElement('style');s.id='lb-bg-css';
    s.textContent='.lb-bgl{position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;opacity:0;transition:opacity .9s ease}.lb-bgl.on{opacity:1}.lb-bgl canvas{pointer-events:none!important}'+
      'html[data-perf] .lb-bgl{display:none}@media (prefers-reduced-motion:reduce){.lb-bgl{transition:none}}';
    document.head.append(s)}
  const el=document.createElement('div');el.className='lb-bgl';el.id='lb-bgl'+(++nid);el.setAttribute('aria-hidden','true');
  document.body.prepend(el);return el;
}
const FX={};
/* Vanta NET (braucht three.js r134; wird getrennt vom three.js des Klassik-Hintergrunds gehalten) */
FX.vanta=async()=>{
  const prev=window.THREE;
  if(!window.__LB_T134){await load(SRC.t134);window.__LB_T134=window.THREE}
  window.THREE=window.__LB_T134;
  try{await load(SRC.vanta)}finally{window.THREE=prev||window.__LB_T134}
  const el=layer();let fx;
  try{
    fx=window.VANTA.NET({el,THREE:window.__LB_T134,mouseControls:false,touchControls:false,gyroControls:false,minHeight:200,minWidth:200,scale:1,scaleMobile:1,
      color:hexNum(rgb('--acc')),backgroundColor:0x04080f,backgroundAlpha:0,points:9,maxDistance:20,spacing:17,showDots:true});
    if(fx.renderer){fx.renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));fx.resize&&fx.resize()}
  }catch(e){el.remove();throw e}
  return{el,recolor(){try{fx.setOptions({color:hexNum(rgb('--acc'))})}catch(e){}},destroy(){try{fx.destroy()}catch(e){}el.remove()}};
};
/* tsParticles: gemeinsame Hülle */
let slim=null;
async function particles(opts){
  await load(SRC.tsp);
  if(!slim)slim=window.loadSlim(window.tsParticles);   // Formen/Bewegungen einmal anmelden (ohne das zeichnet tsParticles 3 nichts)
  await slim;
  const el=layer();
  try{
    const c=await window.tsParticles.load({id:el.id,options:Object.assign({fullScreen:{enable:false},fpsLimit:40,detectRetina:true,background:{color:'transparent'},
      pauseOnBlur:false,pauseOnOutsideViewport:true,interactivity:{events:{onHover:{enable:false},onClick:{enable:false},resize:{enable:true}}}},opts)});
    const vis=()=>{try{document.hidden?c.pause():c.play()}catch(e){}};
    document.addEventListener('visibilitychange',vis);
    return{el,recolor(){},destroy(){document.removeEventListener('visibilitychange',vis);try{c.destroy()}catch(e){}el.remove()}};
  }catch(e){el.remove();throw e}
}
FX.light=()=>{const a=hex(rgb('--acc')),b=hex(rgb('--acc2')),few=phone();
  return particles({particles:{number:{value:few?30:46},color:{value:[a,a,b]},links:{enable:true,distance:few?130:150,color:a,opacity:.32,width:1},
    move:{enable:true,speed:.4,outModes:{default:'out'}},size:{value:{min:1.2,max:3}},opacity:{value:{min:.45,max:.95}}}})};
FX.fireflies=()=>{const few=phone();
  return particles({particles:{number:{value:few?26:44},color:{value:['#d8ff7a','#f3ff9e','#b6f36a','#fff1a6']},shape:{type:'circle'},
    size:{value:{min:1.8,max:4.2}},opacity:{value:{min:.15,max:1},animation:{enable:true,speed:.55,sync:false,startValue:'random'}},
    shadow:{enable:true,color:'#d8ff7a',blur:16},move:{enable:true,speed:{min:.15,max:.55},direction:'top',random:true,straight:false,outModes:{default:'out'}}}})};
const leaf=c=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path d="M16 2C6 9 4 21 16 30C28 21 26 9 16 2Z" fill="'+c+'"/><path d="M16 5V29" stroke="rgba(0,0,0,.28)" stroke-width="1.4" fill="none"/></svg>');
FX.leaves=()=>{const few=phone();
  return particles({particles:{number:{value:few?12:20},shape:{type:'image',options:{image:['#5fae4e','#7cc35a','#9ad06a','#c9b85a','#4f9a5c'].map(c=>({src:leaf(c),width:32,height:32}))}},
    size:{value:{min:9,max:16}},opacity:{value:{min:.5,max:.85}},rotate:{value:{min:0,max:360},direction:'random',animation:{enable:true,speed:5}},
    move:{enable:true,speed:{min:.5,max:1.1},direction:'bottom',straight:false,drift:{min:-.5,max:.5},outModes:{default:'out'}}}})};
/* Klassik: der bisherige 3D-Hintergrund (bg3d.js, eigenes three.js) */
FX.classic=async()=>{
  let cv=document.getElementById('lb-bg');
  if(!cv){await load(SRC.t150);await load(SRC.classic);cv=document.getElementById('lb-bg');if(!cv)throw new Error('kein WebGL')}
  else window.dispatchEvent(new Event('lb-bg-start'));
  layer();cv.classList.add('lb-bgl');
  return{el:cv,recolor(){},destroy(){if(!cv.classList.contains('on'))window.dispatchEvent(new Event('lb-bg-stop'))},keep:true};   // Canvas bleibt für später, nur angehalten
};

/* ---------- umschalten (weich überblenden) ---------- */
let cur={mode:null},seq=0;
function retire(o){if(!o||!o.fx)return;o.fx.el.classList.remove('on');const fx=o.fx;setTimeout(()=>{try{fx.destroy()}catch(e){}},950)}
async function apply(){
  try{
    const m=wanted();
    if(cur.mode===m){if(cur.fx)cur.fx.recolor();return}
    const my=++seq,old=cur;cur={mode:m};
    if(m==='none'){retire(old);return}
    let fx=null,used=m;
    try{fx=await FX[m]()}catch(e){fx=null}
    if(!fx&&m==='vanta'){try{fx=await FX.light();used='light'}catch(e){fx=null}}   // Vanta geht nicht → leichte Variante
    if(my!==seq){if(fx&&!fx.keep)fx.destroy();return}
    if(!fx){retire(old);return}                                                   // nichts lädt → ruhiger CSS-Verlauf
    cur={mode:m,fx,used};
    requestAnimationFrame(()=>requestAnimationFrame(()=>fx.el.classList.add('on')));
    if(old.fx&&old.fx.el!==fx.el)retire(old);
    if(used==='vanta'&&(ST().bgc||'auto')==='auto')probe(my);
  }catch(e){}
}
/* Auto-Modus: läuft Vanta flüssig? Sonst dauerhaft die leichte Variante */
function probe(my){
  let n=0,t0=0;const T0=performance.now()+1500;
  (function f(now){if(my!==seq||document.hidden)return;
    if(now<T0){requestAnimationFrame(f);return}if(!t0)t0=now;n++;
    if(now-t0<3000){requestAnimationFrame(f);return}
    const fps=n*1000/(now-t0);if(fps<40){try{localStorage.setItem('lb_bgslow','1')}catch(e){}apply()}})(performance.now());
}
window.addEventListener('lb-theme',()=>{setTimeout(apply,60)});
try{matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',apply)}catch(e){}
if(window.LBUI)LBUI.onSettings(()=>apply());
window.LBBG={apply,CHOICES,get mode(){return cur.used||cur.mode},resetProbe(){try{localStorage.removeItem('lb_bgslow')}catch(e){}apply()}};
apply();
})();
