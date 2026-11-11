/* Life Board – Bewegungs-Effekte im Inhalt (nur Cockpit bei voller Leistung; nur Darstellung, keine Daten, keine Logik).
   1) Zahlen zählen hoch, sobald sie ins Bild kommen (beim Öffnen und beim Runterscrollen) – nur große, alleinstehende Zahlen
      (Schrift ≥ 18 px, z. B. „72 %“, „9,0“, „1.234“). Am Ende steht wieder exakt der Originaltext. Zeichnet die Seite den Wert
      währenddessen neu, bricht das Hochzählen sofort ab (der neue Wert gewinnt).
   2) Graphen zeichnen sich, sobald sie ins Bild kommen: Chart.js-Diagramme laufen von links nach rechts ein (Kurve kommt herein),
      SVG-Linien zeichnen sich entlang des Pfads, Balken wachsen gestaffelt.
   3) Graph-Vollbild (graph-full.js): die Kurve baut sich langsamer und deutlicher auf, Balken wachsen gestaffelt.
   Dschungel, Performance-Modus, „Bewegung reduzieren“: nichts davon. Im Testbrowser aus (außer window.__lbFxTest). */
(function(){
'use strict';
if(window.LBFx)return;
const root=document.documentElement;
const reduced=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
const on=()=>root.getAttribute('data-theme')!=='jungle'&&!(window.LBUI&&LBUI.settings.perf)&&!reduced()&&(!navigator.webdriver||window.__lbFxTest);
const SKIP='#lb-nav,#lb-set,#gf,button,input,select,textarea,option,.lb-o3,.lb-warp,script,style';
const done=new WeakSet();
/* ---------- 1) Zahlen ---------- */
const NUM=/^(\s*[^\d\s-]{0,3}\s?)(-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?)(\s?[^\d]{0,7})$/;
function parse(txt){
  const m=NUM.exec(txt);if(!m)return null;if(/\d/.test(m[1]+m[3]))return null;
  const raw=m[2],grp=/\.\d{3}/.test(raw),dec=(raw.split(',')[1]||'').length,v=parseFloat(raw.replace(/\./g,'').replace(',','.'));
  if(!isFinite(v)||Math.abs(v)<2&&dec===0)return null;   // 0 und 1 lohnen nicht
  return{pre:m[1],post:m[3],v,dec,grp};
}
function fmt(p,x){return p.pre+x.toLocaleString('de-DE',{minimumFractionDigits:p.dec,maximumFractionDigits:p.dec,useGrouping:p.grp})+p.post}
function countNode(n){
  if(done.has(n))return;done.add(n);
  const orig=n.nodeValue,p=parse(orig);if(!p)return;
  const dur=Math.min(1400,700+Math.log10(Math.abs(p.v)+1)*220),t0=performance.now();let last=fmt(p,0);n.nodeValue=last;
  (function step(now){
    if(!n.isConnected||n.nodeValue!==last)return;                // neu gezeichnet: Seite gewinnt
    const k=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-k,4);
    last=k<1?fmt(p,p.v*e):orig;n.nodeValue=last;if(k<1)requestAnimationFrame(step);
  })(t0);
}
function numbersIn(el){
  const out=[],w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,{acceptNode(t){
    if(done.has(t)||!t.nodeValue||t.nodeValue.length>14||!/\d/.test(t.nodeValue))return NodeFilter.FILTER_REJECT;
    const pe=t.parentElement;if(!pe||pe.closest(SKIP))return NodeFilter.FILTER_REJECT;
    if(pe.children.length>2)return NodeFilter.FILTER_REJECT;
    const fs=parseFloat(getComputedStyle(pe).fontSize)||0;if(fs<18)return NodeFilter.FILTER_REJECT;
    return parse(t.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT}});
  while(w.nextNode())out.push(w.currentNode);return out;
}
/* ---------- 2) Graphen ---------- */
function drawChart(host){   // Chart.js: Kurve von links nach rechts hereinlaufen lassen, Chart selbst animiert die Höhe
  const ch=host._chart;
  try{if(ch){ch.reset();ch.update()}}catch(e){}
  const cv=host.querySelector('canvas')||host;
  cv.animate([{clipPath:'inset(0 100% 0 0)',filter:'drop-shadow(0 0 0 transparent)'},{clipPath:'inset(0 0 0 0)',filter:'drop-shadow(0 0 10px rgb(var(--acc) / .6))',offset:.85},{clipPath:'inset(0 0 0 0)',filter:'drop-shadow(0 0 0 transparent)'}],{duration:1500,easing:'cubic-bezier(.3,.1,.2,1)'});
}
function drawSvg(svg){
  const r=svg.getBoundingClientRect();if(r.width<120||r.height<40)return;
  let i=0;
  svg.querySelectorAll('path,polyline').forEach(p=>{
    const cs=getComputedStyle(p);if(cs.stroke==='none'||(cs.fill!=='none'&&cs.fill!=='transparent'&&!/rgba\(.*,\s*0\)/.test(cs.fill))||cs.strokeDasharray!=='none'||p.closest('defs'))return;
    let L=0;try{L=p.getTotalLength()}catch(e){}if(L<60)return;
    p.animate([{strokeDasharray:L+' '+L,strokeDashoffset:L},{strokeDasharray:L+' '+L,strokeDashoffset:0}],{duration:Math.min(1800,900+L*.6),delay:i++*90,easing:'cubic-bezier(.35,0,.2,1)'});
  });
  const bars=[...svg.querySelectorAll('rect')].filter(b=>{const bb=b.getBoundingClientRect();return bb.height>6&&bb.width<r.width*.2&&!b.closest('defs')});
  if(bars.length>=4)bars.forEach((b,j)=>b.animate([{transform:'scaleY(0)',transformBox:'fill-box',transformOrigin:'50% 100%'},{transform:'scaleY(1)',transformBox:'fill-box',transformOrigin:'50% 100%'}],{duration:650,delay:Math.min(j*28,700),easing:'cubic-bezier(.2,.8,.2,1)',fill:'backwards'}));
}
/* ---------- Beobachten ---------- */
let io=null,mo=null;const T0=performance.now();
function seen(el){
  if(!on())return;
  if(el._lbfx)return;el._lbfx=1;
  if(el.classList&&el.classList.contains('lbc'))drawChart(el);
  else if(el.tagName==='svg'||el.tagName==='SVG')drawSvg(el);
  numbersIn(el).forEach(countNode);
}
function scan(){
  if(!on()||!io)return;
  const box=document.querySelector('main,body>.wrap')||document.body;
  box.querySelectorAll('.lbc').forEach(e=>{if(!e._lbfxw){e._lbfxw=1;io.observe(e)}});
  box.querySelectorAll('svg').forEach(s=>{if(s._lbfxw||s.closest(SKIP)||s.closest('.lbc,.h3-obj,.h3c')||s.style.display==='none')return;const r=s.getBoundingClientRect();if(r.width<120||r.height<40)return;s._lbfxw=1;io.observe(s)});
  // Zahlen: je Block beobachten (Karten, Abschnitte), damit beim Scrollen jeder Block für sich hochzählt
  // nach den ersten Sekunden nur noch, was neu ins Bild scrollt (kein erneutes Hochzählen, wenn die Seite beim Antippen neu zeichnet)
  const late=performance.now()-T0>5000;
  box.querySelectorAll('.card,section,.tile,.hero,.h3c,.grp,#hudHero,.kv,.nums3').forEach(e=>{if(e._lbfxn!=null)return;
    if(late){const r=e.getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0){e._lbfxn=2;return}}
    e._lbfxn=1;io.observe(e)});
}
function start(){
  if(!on()||!('IntersectionObserver' in window))return;
  io=new IntersectionObserver(es=>es.forEach(en=>{if(!en.isIntersecting)return;const el=en.target;
    if(el._lbfxn&&!el.classList.contains('lbc')&&el.tagName.toLowerCase()!=='svg'){numbersIn(el).forEach(countNode);
      // später neu gezeichnete Zahlen im selben Block bekommen beim nächsten Eintritt ihre Chance
      io.unobserve(el);if(performance.now()-T0<5000)el._lbfxn=null;return}
    io.unobserve(el);seen(el)}),{threshold:.18,rootMargin:'0px 0px -6% 0px'});
  scan();
  let pend=0;mo=new MutationObserver(()=>{if(pend)return;pend=setTimeout(()=>{pend=0;scan()},120)});
  mo.observe(document.body,{childList:true,subtree:true});
  graphFull();
}
/* ---------- 3) Graph-Vollbild ---------- */
function graphFull(){
  const css=document.createElement('style');css.id='lb-fx-css';
  css.textContent='html[data-hud]:not([data-theme="jungle"]):not([data-perf]) #gf .gf-draw{animation-duration:1.8s!important;animation-timing-function:cubic-bezier(.35,0,.2,1)!important}'+
    'html[data-hud]:not([data-theme="jungle"]):not([data-perf]) #gf .gf-grow rect{animation-duration:.8s!important}';
  document.head.append(css);
  // Beim Öffnen zeichnet das Vollbild die Kurve oft gleich ein zweites Mal (Größe stellt sich ein) – dann ohne Animation.
  // Deshalb hier: jede neu gezeichnete Kurve der ersten 2 s läuft an der Stelle weiter, an der der Aufbau gerade ist.
  let gEl=null,t0=0;const D=1900;
  new MutationObserver(()=>{
    const gf=document.getElementById('gf');if(!gf||!on())return;
    if(gf!==gEl||!gf.isConnected){gEl=gf;t0=performance.now()}
    const g=gf.querySelector('.gf-grow');if(g&&!g._lbfx){g._lbfx=1;g.querySelectorAll('rect').forEach((r,i)=>r.style.animationDelay=Math.min(i*22,900)+'ms')}
    const el=performance.now()-t0;if(el>D)return;
    gf.querySelectorAll('.gf-ln').forEach(p=>{if(p._lbfx||p.classList.contains('gf-draw'))return;p._lbfx=1;const k=el/D;
      p.animate([{strokeDasharray:'1 1',strokeDashoffset:1-k},{strokeDasharray:'1 1',strokeDashoffset:0}],{duration:Math.max(120,D-el),easing:'cubic-bezier(.3,.2,.2,1)'})});
  }).observe(document.body,{childList:true,subtree:true});
}
window.LBFx={start,scan,parse,countNode};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(start,30));else setTimeout(start,30);
})();
