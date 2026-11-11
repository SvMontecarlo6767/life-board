/* Life Board – Warp-Flug zwischen den Reitern (nur Cockpit bei voller Leistung; nur Darstellung, keine Daten).
   Karussell-Karte (ca. 2 s gesamt, ein durchgehender Flug):
     Abflug ~1,15 s: Zielerfassung (Rahmen zieht sich um die Karte), dann fliegst du ruhig beschleunigend auf die Karte zu
     und durch sie hindurch; Sterne werden zu Streifen (2D-Ebene über allem, klickt nie, plus Weltraum-Welt), das Bild
     taucht weich in die Kartenfarbe – kein weißer Blitz.
     Ankunft ~0,9 s (Zielseite): der Flug bremst sanft aus, Schleier löst sich, Inhalte tauchen gestaffelt aus der Tiefe auf.
   Reiterleiste: derselbe Flug, kürzer (Abflug ~0,5 s, Ankunft ~0,6 s).
   Merker: sessionStorage lb_warp (höchstens 4 s alt, wird sofort verbraucht). Die Ankunftsebene fängt keine Klicks ab.
   Dschungel, Performance-Modus und „Bewegung reduzieren“: kein Warp (theme.js nutzt das bisherige kurze Ausblenden). */
(function(){
'use strict';
if(window.LBWarp)return;
const root=document.documentElement;
const reduced=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
const can=()=>root.getAttribute('data-theme')!=='jungle'&&!(window.LBUI&&LBUI.settings.perf)&&!reduced();
const cssRgb=n=>{const v=getComputedStyle(root).getPropertyValue(n).trim().split(/\s+/).map(Number);return v.length===3&&v.every(x=>isFinite(x))?v:[58,215,255]};
const sm=(a,b,x)=>{const k=Math.max(0,Math.min(1,(x-a)/(b-a)));return k*k*(3-2*k)};
const DUR={card:[1150,900],nav:[500,620]};
/* ---------- Flug-Ebene (Canvas 2D über allem, pointer-events:none) ---------- */
function layer(){
  const c=document.createElement('canvas');c.className='lb-warp';c.setAttribute('aria-hidden','true');
  c.style.cssText='position:fixed;inset:0;width:100%;height:100%;z-index:2147483000;pointer-events:none;display:block';
  const pr=Math.min(window.devicePixelRatio||1,2);c.width=Math.round(innerWidth*pr);c.height=Math.round(innerHeight*pr);
  root.append(c);const x=c.getContext('2d');x.scale(pr,pr);return{c,x};
}
/* Sterne in 3D (x,y,z) – echte Perspektive: sie kommen aus dem Fluchtpunkt auf dich zu */
function field(n){return Array.from({length:n},()=>({x:(Math.random()*2-1)*1.4,y:(Math.random()*2-1)*1.4,z:Math.random()*.95+.05,w:Math.random()<.18?2.2:1.1,c:Math.random()<.4}))}
/* v(k): Fluggeschwindigkeit 0..1, veil(k): Schleier 0..1 in Kartenfarbe, glow(k): weiches Leuchten im Fluchtpunkt */
function flight(o){
  const L=layer(),{x}=L,W=innerWidth,H=innerHeight,F=Math.max(W,H)*.7,S=field(o.n||(W*H>500000?340:240)),t0=performance.now();
  const rgb=o.rgb,col=`rgb(${rgb.join(',')})`,pale=`rgb(${rgb.map(c=>Math.round(c*.4+255*.6)).join(',')})`,deep=rgb.map(c=>Math.round(c*.16+4));
  let raf=0,last=t0;
  function frame(now){
    const k=Math.min(1,(now-t0)/o.dur),dt=Math.min(.05,(now-last)/1000);last=now;
    const v=o.v(k),veil=o.veil(k),glow=o.glow(k),cx=o.cx(k),cy=o.cy(k);
    x.clearRect(0,0,W,H);
    if(veil>0){x.fillStyle=`rgba(${deep.join(',')},${(veil*.94).toFixed(3)})`;x.fillRect(0,0,W,H)}
    x.globalCompositeOperation='lighter';x.lineCap='round';
    const speed=v*v*3.2+.04,tail=v*v*.9;
    for(const p of S){
      const z0=p.z;p.z-=dt*speed;if(p.z<=.02){p.z+=1;p.x=(Math.random()*2-1)*1.4;p.y=(Math.random()*2-1)*1.4;continue}
      const z1=Math.min(1,p.z+tail*p.z),sx=cx+p.x*F*.18/p.z,sy=cy+p.y*F*.18/p.z,ex=cx+p.x*F*.18/z1,ey=cy+p.y*F*.18/z1;
      if(sx<-50||sx>W+50||sy<-50||sy>H+50)continue;
      const a=Math.min(1,(1-p.z)*1.6)*o.alpha(k);if(a<=0)continue;
      x.globalAlpha=a;x.strokeStyle=p.c?col:pale;x.lineWidth=p.w*(1.4-p.z);
      x.beginPath();x.moveTo(ex,ey);x.lineTo(sx,sy);x.stroke();
    }
    if(glow>0){const g=x.createRadialGradient(cx,cy,0,cx,cy,F*.9);
      g.addColorStop(0,`rgba(${rgb.map(c=>Math.round(c*.5+128)).join(',')},${(glow*.55).toFixed(3)})`);g.addColorStop(.25,`rgba(${rgb.join(',')},${(glow*.22).toFixed(3)})`);g.addColorStop(1,'rgba(0,0,0,0)');
      x.globalAlpha=1;x.fillStyle=g;x.fillRect(0,0,W,H)}
    x.globalCompositeOperation='source-over';x.globalAlpha=1;
    if(k<1)raf=requestAnimationFrame(frame);else{if(o.remove)L.c.remove();if(o.end)o.end()}
  }
  raf=requestAnimationFrame(frame);
  if(o.remove)setTimeout(()=>{cancelAnimationFrame(raf);L.c.remove()},o.dur+700);   // Sicherung: Ebene verschwindet auch, wenn Bilder stocken
  return{stop(){cancelAnimationFrame(raf);L.c.remove()},el:L.c};
}
function whoosh(short){try{if(window.LBUI)LBUI.sound(short?'warpS':'warp')}catch(e){}}
/* ---------- Abflug ---------- */
let leaving=false;
function reticle(b,rgb){   // Zielerfassung: vier Ecken ziehen sich um die Karte zusammen
  const d=document.createElement('div');d.className='lb-warp-lock';d.setAttribute('aria-hidden','true');
  const c=`rgb(${rgb.join(' ')})`,L='22px',T='3px';
  d.style.cssText=`position:fixed;left:${b.left-8}px;top:${b.top-8}px;width:${b.width+16}px;height:${b.height+16}px;z-index:2147482999;pointer-events:none;filter:drop-shadow(0 0 8px ${c});--c:${c};`+
    `background:linear-gradient(${c},${c}) 0 0/${L} ${T},linear-gradient(${c},${c}) 0 0/${T} ${L},linear-gradient(${c},${c}) 100% 0/${L} ${T},linear-gradient(${c},${c}) 100% 0/${T} ${L},linear-gradient(${c},${c}) 0 100%/${L} ${T},linear-gradient(${c},${c}) 0 100%/${T} ${L},linear-gradient(${c},${c}) 100% 100%/${L} ${T},linear-gradient(${c},${c}) 100% 100%/${T} ${L};background-repeat:no-repeat`;
  root.append(d);
  d.animate([{transform:'scale(1.35)',opacity:0},{transform:'scale(1)',opacity:1,offset:.3},{transform:'scale(1)',opacity:1,offset:.55},{transform:'scale(1.6)',opacity:0}],{duration:900,easing:'cubic-bezier(.2,.8,.3,1)',fill:'forwards'});
  return d;
}
function leave(href,kind,a,ev){
  if(leaving)return;leaving=true;
  const full=kind==='card',dur=DUR[full?'card':'nav'][0];
  const card=full&&a.closest('.h3c'),rgb=(card&&getComputedStyle(card).getPropertyValue('--c').trim().split(/\s+/).map(Number))||(a.style.getPropertyValue('--tc')||'').trim().split(/\s+/).map(Number);
  const R=rgb&&rgb.length===3&&rgb.every(isFinite)?rgb:cssRgb('--acc');
  let cx=innerWidth/2,cy=innerHeight*.45,b=null;
  if(card){b=card.getBoundingClientRect();cx=b.left+b.width/2;cy=b.top+b.height*.42}
  whoosh(!full);
  try{if(window.LBSpace&&LBSpace.current)LBSpace.current.warp(dur/1000+.6,R,true)}catch(e){}
  const anims=[],extra=[];
  if(card){
    extra.push(reticle(b,R));
    const tr=card.style.transform||'';
    anims.push(card.animate([
      {transform:tr,opacity:1,filter:'brightness(1)'},
      {transform:tr+' translateZ(30px) scale(1.03)',opacity:1,filter:'brightness(1.25)',offset:.22},
      {transform:tr+' translateZ(420px) scale(1.25)',opacity:1,filter:'brightness(1.45)',offset:.72},
      {transform:tr+' translateZ(980px) scale(1.9)',opacity:0,filter:'brightness(1.9)'}],{duration:dur,easing:'cubic-bezier(.5,0,.6,1)',fill:'forwards'}));
    document.querySelectorAll('#hub3d .h3c').forEach(el=>{if(el===card)return;const t=el.style.transform||'',dir=el.getBoundingClientRect().left<cx?-1:1;
      anims.push(el.animate([{transform:t,opacity:+el.style.opacity||1},{transform:t+` translate3d(${dir*320}px,40px,-300px) rotateY(${dir*30}deg)`,opacity:0}],{duration:dur*.7,delay:dur*.12,easing:'cubic-bezier(.5,0,.8,.5)',fill:'forwards'}))});
    document.querySelectorAll('#hub .top,#hub3d .h3-hero,#hub3d .h3-dots,#hub3d .h3-arrow,#hub3d .h3-floor,#hub3d .h3-beam').forEach(el=>anims.push(el.animate([{opacity:1},{opacity:0}],{duration:dur*.55,delay:dur*.15,easing:'ease-in',fill:'forwards'})));
  }else{
    const m=document.querySelector('main,body>.wrap')||document.body;
    anims.push(m.animate([{opacity:1,transform:'none',filter:'blur(0)'},{opacity:0,transform:'scale(1.12)',filter:'blur(4px)'}],{duration:dur,easing:'cubic-bezier(.5,0,.75,.6)',fill:'forwards'}));
  }
  // Flug: Fluchtpunkt startet in der Karte und gleitet zur Bildmitte; Tempo steigt weich, Schleier färbt sich zur Kartenfarbe
  const mx=innerWidth/2,my=innerHeight*.45;
  const tn=flight({dur,rgb:R,cx:k=>cx+(mx-cx)*sm(.2,1,k),cy:k=>cy+(my-cy)*sm(.2,1,k),
    v:k=>full?sm(.12,1,k):sm(0,1,k)*.85,alpha:k=>sm(0,.25,k),veil:k=>sm(full?.45:.2,1,k)*.9,glow:k=>sm(full?.3:.1,1,k)*.8});
  let gone=false;const go=()=>{if(gone)return;gone=true;
    try{sessionStorage.setItem('lb_warp',JSON.stringify({t:Date.now(),rgb:R,kind}))}catch(e){}
    location.href=href;};
  setTimeout(go,dur);   // fester Zeitpunkt, auch wenn Bilder stocken
  const reset=()=>{leaving=false;gone=false;try{tn.stop()}catch(e){}extra.forEach(e=>e.remove());anims.forEach(a=>{try{a.cancel()}catch(e){}})};
  setTimeout(()=>{if(document.visibilityState==='visible'&&leaving)reset()},dur+2500);   // Navigation fand nicht statt
  addEventListener('pageshow',e=>{if(e.persisted)reset()},{once:true});
}
/* ---------- Ankunft ---------- */
function arrive(){
  let w=null;try{w=JSON.parse(sessionStorage.getItem('lb_warp')||'null');sessionStorage.removeItem('lb_warp')}catch(e){}
  root.classList.remove('lb-arrive');
  if(!w||Date.now()-w.t>4000||!can())return;
  root.classList.add('lb-arrived');
  try{sessionStorage.setItem('lb_warp_in',String(Date.now()))}catch(e){}
  const rgb=Array.isArray(w.rgb)&&w.rgb.length===3?w.rgb:cssRgb('--acc'),full=w.kind==='card',dur=DUR[full?'card':'nav'][1];
  const cx=innerWidth/2,cy=innerHeight*.45;
  flight({dur,rgb,remove:true,cx:()=>cx,cy:()=>cy,v:k=>(full?1:.85)*(1-sm(0,1,k)),alpha:k=>1-sm(.55,1,k),veil:k=>.9*(1-sm(0,.7,k)),glow:k=>.8*(1-sm(0,.6,k))});
  // Inhalte tauchen gestaffelt aus der Tiefe auf (wie aus dem Flug heraus)
  const vis=e=>{if(/^(SCRIPT|STYLE|LINK)$/.test(e.tagName)||e.hidden)return false;const r=e.getBoundingClientRect();return r.height>0&&r.top<innerHeight&&r.bottom>0};
  let box=document.querySelector('main,body>.wrap')||document.body,els=[...box.children].filter(vis);
  while(els.length===1&&els[0].children.length&&els[0].id!=='hub3d'){box=els[0];els=[...box.children].filter(vis)}
  els=els.slice(0,12);
  els.forEach((e,i)=>e.animate([{opacity:0,transform:'perspective(900px) translate3d(0,30px,-520px) scale(.86)',filter:'blur(10px)'},{opacity:1,transform:'none',filter:'blur(0)'}],
    {duration:full?760:540,delay:(full?220:120)+i*70,easing:'cubic-bezier(.12,.85,.25,1)',fill:'backwards'}));
}
window.LBWarp={can,leave,arrive,DUR};
arrive();
})();
