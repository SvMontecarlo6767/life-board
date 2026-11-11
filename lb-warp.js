/* Life Board – Warp-Flug zwischen den Reitern (nur Cockpit bei voller Leistung; nur Darstellung, keine Daten).
   Abflug: Karussell-Karte (voll, ca. 0,6 s) oder untere/obere Reiterleiste (kurz, ca. 0,35 s):
     Schockwelle am Tippunkt, Karte schießt auf dich zu, Hyperraum-Streifen (2D-Ebene über allem, klickt nie),
     Weltraum-Welt zieht die Sterne zu Streifen (LBSpace.warp), Lichtblitz in der Zielfarbe, dann Navigation.
   Ankunft (Zielseite, sessionStorage lb_warp, höchstens 4 s alt): Blitz, Streifen laufen aus, Inhalte fliegen gestaffelt ein.
   Die Ankunftsebene fängt keine Klicks ab – die Seite ist sofort bedienbar. Dschungel, Performance-Modus und
   „Bewegung reduzieren“: kein Warp (theme.js nutzt dann das bisherige kurze Ausblenden). */
(function(){
'use strict';
if(window.LBWarp)return;
const root=document.documentElement;
const reduced=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
const can=()=>root.getAttribute('data-theme')!=='jungle'&&!(window.LBUI&&LBUI.settings.perf)&&!reduced();
const cssRgb=n=>{const v=getComputedStyle(root).getPropertyValue(n).trim().split(/\s+/).map(Number);return v.length===3&&v.every(x=>isFinite(x))?v:[58,215,255]};
const ease=k=>k*k*k,out=k=>1-Math.pow(1-k,3);
/* ---------- Hyperraum-Ebene (Canvas 2D über allem, pointer-events:none) ---------- */
function layer(){
  const c=document.createElement('canvas');c.className='lb-warp';c.setAttribute('aria-hidden','true');
  c.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:2147483000;pointer-events:none;display:block';
  const pr=Math.min(window.devicePixelRatio||1,2);c.width=Math.round(innerWidth*pr);c.height=Math.round(innerHeight*pr);
  document.documentElement.append(c);const x=c.getContext('2d');x.scale(pr,pr);return{c,x};
}
function stars(n,cx,cy){
  const W=innerWidth,H=innerHeight,R=Math.hypot(Math.max(cx,W-cx),Math.max(cy,H-cy));
  return Array.from({length:n},()=>({a:Math.random()*Math.PI*2,r:Math.random()*R*.9+6,s:.4+Math.random()*1.4,w:Math.random()<.15?2.4:1.1,c:Math.random()<.35}));
}
/* mode 'out': beschleunigen, Schleier zu, Blitz am Ende. mode 'in': Blitz zuerst, Streifen bremsen ab, Schleier auf. */
function tunnel(o){
  const L=layer(),{x}=L,W=innerWidth,H=innerHeight,cx=o.cx,cy=o.cy,rgb=o.rgb,S=stars(o.n||(W*H>500000?260:180),cx,cy),t0=performance.now();
  const col=`rgb(${rgb.join(',')})`,mix=`rgb(${rgb.map(c=>Math.round(c*.45+255*.55)).join(',')})`;
  let raf=0,done=false;
  function frame(now){
    const k=Math.min(1,(now-t0)/o.dur);x.clearRect(0,0,W,H);
    const veil=o.mode==='out'?Math.min(.88,ease(k)*1.25):Math.max(0,1-out(Math.min(1,k*2.2)))*.92;
    if(veil>0){x.fillStyle=`rgba(2,5,12,${veil.toFixed(3)})`;x.fillRect(0,0,W,H)}
    const sp=o.mode==='out'?.02+ease(k)*1.6:1.7*Math.pow(1-k,2.2)+.01,len=o.mode==='out'?8+ease(k)*260:240*Math.pow(1-k,1.8)+4;
    const al=o.mode==='out'?Math.min(1,k*3):Math.max(0,1-k*1.05);
    x.globalCompositeOperation='lighter';x.lineCap='round';
    for(const p of S){
      p.r+=p.s*sp*(p.r*.09+8);if(p.r>Math.hypot(W,H))p.r=8+Math.random()*40;
      const r0=Math.max(0,p.r-len*p.s*(.4+p.r/900)),ca=Math.cos(p.a),sa=Math.sin(p.a);
      x.strokeStyle=p.c?col:mix;x.globalAlpha=al*(.35+.65*Math.min(1,p.r/220));x.lineWidth=p.w;
      x.beginPath();x.moveTo(cx+ca*r0,cy+sa*r0);x.lineTo(cx+ca*p.r,cy+sa*p.r);x.stroke();
    }
    // Lichtkern im Fluchtpunkt
    const g=x.createRadialGradient(cx,cy,0,cx,cy,Math.max(W,H)*.55);
    const core=o.mode==='out'?ease(k)*.9:Math.max(0,.9-k*2);
    g.addColorStop(0,`rgba(255,255,255,${(core*.9).toFixed(3)})`);g.addColorStop(.12,`rgba(${rgb.join(',')},${(core*.55).toFixed(3)})`);g.addColorStop(1,'rgba(0,0,0,0)');
    x.globalAlpha=1;x.fillStyle=g;x.fillRect(0,0,W,H);
    x.globalCompositeOperation='source-over';
    // Blitz: am Ende des Abflugs, am Anfang der Ankunft
    const fl=o.mode==='out'?Math.max(0,(k-.72)/.28):Math.max(0,1-k*3.2);
    if(fl>0){x.fillStyle=`rgba(${rgb.map(c=>Math.round(c*.35+255*.65)).join(',')},${(Math.pow(fl,1.6)*.95).toFixed(3)})`;x.fillRect(0,0,W,H)}
    if(k<1)raf=requestAnimationFrame(frame);else{done=true;if(o.mode==='in')L.c.remove();if(o.end)o.end()}
  }
  raf=requestAnimationFrame(frame);
  return{stop(){cancelAnimationFrame(raf);L.c.remove()},el:L.c};
}
/* ---------- Ton ---------- */
function whoosh(short){try{if(window.LBUI)LBUI.sound(short?'warpS':'warp')}catch(e){}}
/* ---------- Abflug ---------- */
let leaving=false;
function shock(px,py,rgb){
  const d=document.createElement('div');d.setAttribute('aria-hidden','true');
  d.style.cssText=`position:fixed;left:${px-30}px;top:${py-30}px;width:60px;height:60px;border-radius:50%;z-index:2147482999;pointer-events:none;border:2px solid rgb(${rgb.join(' ')});box-shadow:0 0 24px rgb(${rgb.join(' ')}),inset 0 0 18px rgb(${rgb.join(' ')} / .6)`;
  document.documentElement.append(d);
  d.animate([{transform:'scale(.2)',opacity:1},{transform:'scale(9)',opacity:0}],{duration:520,easing:'cubic-bezier(.1,.7,.3,1)',fill:'forwards'}).onfinish=()=>d.remove();
}
function leave(href,kind,a,ev){
  if(leaving)return;leaving=true;
  const full=kind==='card',dur=full?620:340;
  const card=full&&a.closest('.h3c'),rgb=(card&&getComputedStyle(card).getPropertyValue('--c').trim().split(/\s+/).map(Number))||(a.style.getPropertyValue('--tc')||'').trim().split(/\s+/).map(Number);
  const R=rgb&&rgb.length===3&&rgb.every(isFinite)?rgb:cssRgb('--acc');
  let cx=innerWidth/2,cy=innerHeight*.45;
  if(card){const b=card.getBoundingClientRect();cx=b.left+b.width/2;cy=b.top+b.height*.4}
  const px=ev&&ev.clientX||cx,py=ev&&ev.clientY||cy;
  whoosh(!full);shock(px,py,R);
  try{if(window.LBSpace&&LBSpace.current)LBSpace.current.warp(dur/1000+.4,R)}catch(e){}
  const anims=[];
  if(card){
    const tr=card.style.transform||'';
    anims.push(card.animate([{transform:tr,opacity:1,filter:'brightness(1)'},{transform:tr+' translateZ(260px) scale(1.18)',opacity:1,filter:'brightness(1.6)',offset:.45},{transform:tr+' translateZ(900px) scale(2.2)',opacity:0,filter:'brightness(3)'}],{duration:dur,easing:'cubic-bezier(.55,0,.75,.2)',fill:'forwards'}));
    document.querySelectorAll('#hub3d .h3c').forEach(el=>{if(el===card)return;const t=el.style.transform||'',dir=el.getBoundingClientRect().left<cx?-1:1;
      anims.push(el.animate([{transform:t,opacity:+el.style.opacity||1},{transform:t+` translate3d(${dir*240}px,0,-400px)`,opacity:0}],{duration:dur*.6,easing:'ease-in',fill:'forwards'}))});
    document.querySelectorAll('#hub .top,#hub3d .h3-dots,#hub3d .h3-arrow').forEach(el=>anims.push(el.animate([{opacity:1,transform:'none'},{opacity:0,transform:'translateY(-20px) scale(.96)'}],{duration:dur*.5,easing:'ease-in',fill:'forwards'})));
  }else{
    const m=document.querySelector('main,body>.wrap')||document.body;
    anims.push(m.animate([{opacity:1,transform:'none',filter:'blur(0)'},{opacity:0,transform:'scale(.9)',filter:'blur(6px)'}],{duration:dur,easing:'cubic-bezier(.5,0,.8,.3)',fill:'forwards'}));
  }
  let gone=false;const go=()=>{if(gone)return;gone=true;
    try{sessionStorage.setItem('lb_warp',JSON.stringify({t:Date.now(),rgb:R,kind}))}catch(e){}
    location.href=href;};
  const tn=tunnel({mode:'out',dur,cx,cy,rgb:R,end:go});
  setTimeout(go,dur+20);   // nie länger warten als die Warp-Dauer, auch wenn Bilder stocken
  // Sicherung: findet keine Navigation statt (z. B. abgebrochen), alles zurücksetzen
  const reset=()=>{leaving=false;try{tn.stop()}catch(e){}anims.forEach(a=>{try{a.cancel()}catch(e){}})};
  setTimeout(()=>{if(document.visibilityState==='visible'&&leaving&&location.href.indexOf(href)<0)reset()},2600);
  addEventListener('pageshow',e=>{if(e.persisted)reset()},{once:true});
}
/* ---------- Ankunft ---------- */
function arrive(){
  let w=null;try{w=JSON.parse(sessionStorage.getItem('lb_warp')||'null');sessionStorage.removeItem('lb_warp')}catch(e){}
  const on=root.classList.contains('lb-arrive');root.classList.remove('lb-arrive');
  if(!w||Date.now()-w.t>4000||!can()){return}
  root.classList.add('lb-arrived');
  try{sessionStorage.setItem('lb_warp_in',String(Date.now()))}catch(e){}
  const rgb=Array.isArray(w.rgb)&&w.rgb.length===3?w.rgb:cssRgb('--acc'),full=w.kind==='card';
  tunnel({mode:'in',dur:full?820:560,cx:innerWidth/2,cy:innerHeight*.42,rgb});
  // Inhalte gestaffelt aus der Tiefe
  const vis=e=>{if(/^(SCRIPT|STYLE|LINK)$/.test(e.tagName)||e.hidden)return false;const r=e.getBoundingClientRect();return r.height>0&&r.top<innerHeight&&r.bottom>0};
  let box=document.querySelector('main,body>.wrap')||document.body,els=[...box.children].filter(vis);
  while(els.length===1&&els[0].children.length&&els[0].id!=='hub3d'){box=els[0];els=[...box.children].filter(vis)}
  els=els.slice(0,12);
  els.forEach((e,i)=>e.animate([{opacity:0,transform:'perspective(900px) translate3d(0,46px,-260px) rotateX(14deg) scale(.9)',filter:'blur(8px)'},{opacity:1,transform:'none',filter:'blur(0)'}],
    {duration:full?620:480,delay:(full?140:80)+i*60,easing:'cubic-bezier(.16,.9,.24,1)',fill:'backwards'}));
  return on;
}
window.LBWarp={can,leave,arrive,tunnel};
arrive();
})();
