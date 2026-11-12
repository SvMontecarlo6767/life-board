/* Life Board – Hub als 3D-Karussell (nur Cockpit-Design, nur bei voller Leistung).
   Dschungel, Performance-Modus und „Bewegung reduzieren“ zeigen die bisherige Kachelliste (#tiles) – unverändert.
   Karten in fester Reihenfolge: Check-in (immer vorne), Training, Recovery, Muster, Kalender.
   Wischen dreht, die vorderste Karte ist groß, Antippen öffnet (seitliche Karte antippen = nach vorne drehen).
   Ziele der Karten = dieselben Links wie die Kacheln (werden aus #tiles gelesen).
   Live-Werte NUR LESEND über bestehende Module: Check-in = Text der bestehenden ckTxt-Logik (gespiegelt),
   Recovery = LBWhoop.peek (Gerätespeicher), Training = plan-core.js + plan/ und training/gym_JJJJ (gelesen),
   Kalender = calendar-core.js + calendar/ (gelesen) Muster = Teaser.
   Keine Schreibzugriffe. Die vorderste Karte tönt die Weltraum-Welt (Ereignis 'lb-tint'). */
(function(){
'use strict';
if(window.LBHub3D)return;
const root=document.documentElement,$=id=>document.getElementById(id);
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const ST=()=>(window.LBUI&&LBUI.settings)||{};
const reduced=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
const active=()=>root.getAttribute('data-theme')!=='jungle'&&!ST().perf&&!reduced();
const tabRgb=id=>{const t=window.LBUI&&LBUI.TABS.find(x=>x.id===id);return t?t.rgb:null};
/* ---------- Karten ---------- */
const CARDS=[   // wichtigste zuerst: Check-in, Training, Recovery
  {id:'checkin',k:'Check-in',href:'checkin.html',rgb:()=>tabRgb('checkin')||[255,190,90]},
  {id:'training',k:'Training',href:'training.html',rgb:()=>tabRgb('training')||[255,84,96]},
  {id:'recovery',k:'Recovery',href:'recovery.html',rgb:()=>tabRgb('recovery')||[52,235,170]},
  {id:'muster',k:'Muster',href:'muster.html',rgb:()=>tabRgb('muster')||[120,230,255]},
  {id:'kalender',k:'Kalender',href:'calendar.html',rgb:()=>tabRgb('kalender')||[255,200,70]}
];
const N=CARDS.length,STEP=2*Math.PI/N,ANG=.62;   // ANG: Winkel zwischen zwei Karten (Darstellung), STEP: eine Umdrehung = alle Karten (Weltraum dreht mit)
/* Embleme (Platz für die 3D-Objekte aus Phase 3) */
const EMB={
  sun:'<svg viewBox="0 0 120 120"><defs><radialGradient id="h3sun" cx=".4" cy=".38"><stop offset="0" stop-color="#fff8e0"/><stop offset=".45" stop-color="rgb(var(--c))"/><stop offset="1" stop-color="rgb(var(--c) / .1)"/></radialGradient></defs><g class="spin">'+Array.from({length:12},(_,i)=>'<path d="M60 8v14" transform="rotate('+i*30+' 60 60)"/>').join('')+'</g><circle cx="60" cy="60" r="27" fill="url(#h3sun)" class="glow"/></svg>',
  moon:'<svg viewBox="0 0 120 120"><defs><radialGradient id="h3moon" cx=".35" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset=".6" stop-color="rgb(var(--c))"/><stop offset="1" stop-color="rgb(var(--c) / .2)"/></radialGradient></defs><path d="M78 26a36 36 0 1 0 18 52A30 30 0 0 1 78 26z" fill="url(#h3moon)" class="glow"/><g class="tw"><circle cx="28" cy="30" r="1.8"/><circle cx="96" cy="20" r="1.4"/><circle cx="20" cy="84" r="1.2"/></g></svg>',
  net:'<svg viewBox="0 0 120 120"><g class="drift"><path d="M24 80L46 46 70 62 96 30M46 46L60 92 70 62M24 80L60 92 96 74 70 62M96 30L96 74"/>'+[[24,80],[46,46],[70,62],[96,30],[60,92],[96,74]].map(([x,y],i)=>'<circle cx="'+x+'" cy="'+y+'" r="'+(i===2?6:4.5)+'" class="node" style="--d:'+i*.3+'s"/>').join('')+'</g></svg>',
  band:'<svg viewBox="0 0 120 120"><path d="M14 74c22-22 70-22 92-6" class="lane"/><path d="M14 88c22-22 70-22 92-6" class="lane l2"/>'+[[30,62],[58,54],[86,58]].map(([x,y],i)=>'<rect x="'+(x-9)+'" y="'+(y-9)+'" width="18" height="18" rx="5" class="ev" style="--d:'+i*.4+'s"/>').join('')+'</svg>',
  ring:'',   // Wochen-Ring wird mit echten Daten gezeichnet
  core:'<svg viewBox="0 0 120 120"><defs><radialGradient id="h3core" cx=".4" cy=".36"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="var(--z,rgb(var(--c)))"/><stop offset="1" stop-color="var(--z,rgb(var(--c)))" stop-opacity=".05"/></radialGradient></defs><ellipse cx="60" cy="60" rx="48" ry="14" class="orbit" transform="rotate(-18 60 60)"/><ellipse cx="60" cy="60" rx="44" ry="12" class="orbit o2" transform="rotate(28 60 60)"/><circle cx="60" cy="60" r="24" fill="url(#h3core)" class="beat"/></svg>',
};
function ringSvg(days){   // 7 Segmente Mo–So; erledigt leuchtet in Sportart-Farbe, heute pulsiert
  const cx=60,cy=60,r=40,seg=2*Math.PI/7,gap=.09;
  return '<svg viewBox="0 0 120 120">'+days.map((d,i)=>{
    const a0=-Math.PI/2+i*seg+gap/2,a1=a0+seg-gap,p=a=>(cx+r*Math.cos(a)).toFixed(1)+' '+(cy+r*Math.sin(a)).toFixed(1);
    const c=d.col||'var(--mu)',on=d.st==='done'||d.st==='part';
    return '<path d="M'+p(a0)+'A'+r+' '+r+' 0 0 1 '+p(a1)+'" class="seg '+d.st+(d.now?' now':'')+'" style="stroke:'+(on?c:'')+';--sc:'+c+'"/>';
  }).join('')+'</svg>';
}
/* ---------- Aufbau ---------- */
const CSS=`
#hub3d{position:relative;margin:4px calc(-1*clamp(14px,4vw,32px)) 0;overflow:hidden;overflow:clip;touch-action:pan-y;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
#hub3d[hidden]{display:none}
#hub3d{display:flex;flex-direction:column;min-height:var(--h3full,auto)}
#hub3d .h3-stage{margin:auto 0;flex:none}   /* Karten in der Mitte, Hintergrund darüber und darunter */
html[data-hub3d] #tiles{display:none}
.h3-stage{position:relative;height:var(--h3h,430px);perspective:1100px;perspective-origin:50% 42%}
.h3c{position:absolute;left:50%;top:10px;width:var(--h3w,320px);height:calc(var(--h3h,430px) - 30px);margin-left:calc(var(--h3w,320px) / -2);
  display:flex;flex-direction:column;gap:6px;padding:18px 18px 16px;border-radius:24px;color:var(--tx);text-decoration:none;-webkit-tap-highlight-color:transparent;
  background:linear-gradient(160deg,rgb(var(--c) / .20),rgba(8,16,30,.86) 42%,rgba(5,10,20,.92));border:1px solid rgb(var(--c) / .38);
  box-shadow:0 18px 50px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.08),inset 0 0 40px rgb(var(--c) / .06);
  backface-visibility:hidden;-webkit-backface-visibility:hidden;-webkit-user-drag:none;will-change:transform,opacity;transform-origin:50% 50%;overflow:hidden}
.h3c::before{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;
  background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.10) 48%,transparent 60%) var(--sx,120%) 0/250% 100% no-repeat}
.h3c::after{content:"";position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:rgba(2,5,12,var(--dim,0))}
.h3c.front{border-color:rgb(var(--c) / .85);box-shadow:0 22px 60px rgba(0,0,0,.6),0 0 38px rgb(var(--c) / .32),inset 0 1px 0 rgba(255,255,255,.12),inset 0 0 50px rgb(var(--c) / .10)}
.h3-head{display:flex;align-items:center;justify-content:space-between;gap:8px}
.h3-k{font:700 13px var(--font-hud,system-ui);letter-spacing:.2em;text-transform:uppercase;color:rgb(var(--c));text-shadow:0 0 12px rgb(var(--c) / .6)}
.h3-tag{font:700 11px var(--font-ui,system-ui);letter-spacing:.12em;text-transform:uppercase;padding:3px 10px;border-radius:99px;border:1px solid rgb(var(--c) / .6);color:rgb(var(--c));background:rgb(var(--c) / .12);white-space:nowrap}
.h3-tag.ok{color:#04140d;background:rgb(var(--c));border-color:rgb(var(--c))}
.h3-obj{flex:1 1 auto;min-height:96px;display:grid;place-items:center;position:relative}
.h3-obj svg{width:min(150px,62%);height:auto;max-height:100%;overflow:visible;fill:none;stroke:rgb(var(--c));stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round;filter:drop-shadow(0 0 10px rgb(var(--c) / .55))}
.h3-obj .glow{stroke:none;filter:drop-shadow(0 0 16px rgb(var(--c) / .8))}
.h3-obj circle.node{fill:rgb(var(--c));stroke:none;animation:h3Node 2.6s var(--d,0s) ease-in-out infinite}
.h3-obj .ev{fill:rgb(var(--c) / .3);animation:h3Node 3s var(--d,0s) ease-in-out infinite}
.h3-obj .lane{stroke-dasharray:4 7;animation:h3Lane 4s linear infinite}.h3-obj .l2{opacity:.45;animation-duration:6s}
.h3-obj .tw circle{fill:#fff;stroke:none;animation:h3Node 2.2s ease-in-out infinite}
.h3-obj .spin{transform-origin:60px 60px;animation:h3Spin 40s linear infinite}
.h3-obj .spinY{transform-origin:60px 60px;animation:h3SpinY 7s ease-in-out infinite}
.h3-obj .drift{transform-origin:60px 60px;animation:h3Drift 9s ease-in-out infinite}
.h3-obj .orbit{stroke-width:1.6;stroke:var(--z,rgb(var(--c)));opacity:.75;stroke-dasharray:6 5;animation:h3Lane 6s linear infinite}.h3-obj .o2{animation-direction:reverse;opacity:.5}
.h3-obj .beat{stroke:none;transform-origin:60px 60px;animation:h3Beat var(--per,1.1s) ease-in-out infinite;filter:drop-shadow(0 0 18px var(--z,rgb(var(--c))))}
.h3-obj .seg{stroke-width:9;stroke:rgba(150,200,255,.16);filter:none}
.h3-obj .seg.done,.h3-obj .seg.part{filter:drop-shadow(0 0 7px var(--sc))}.h3-obj .seg.part{opacity:.6}
.h3-obj .seg.plan{stroke:rgba(150,200,255,.32)}.h3-obj .seg.miss{stroke:rgba(255,106,92,.35)}
.h3-obj .seg.now{animation:h3Now 1.6s ease-in-out infinite}
.h3-v{font:700 clamp(30px,9vw,42px)/1 var(--font-hud,system-ui);font-variant-numeric:tabular-nums;letter-spacing:.02em;color:#fff;text-shadow:0 0 18px rgb(var(--c) / .55);display:flex;align-items:baseline;gap:8px;min-height:40px}
.h3-v small{font:700 15px var(--font-ui,system-ui);letter-spacing:.08em;color:rgb(var(--c))}
.h3-l{font:700 16px var(--font-ui,system-ui);letter-spacing:.04em;color:var(--tx);line-height:1.25}
.h3-s{font-size:14px;line-height:1.35;color:var(--mu);display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;min-height:1.35em}
.h3-s b{color:rgb(var(--c))!important;font-weight:700}
.h3-go{align-self:flex-start;margin-top:4px;font:700 12px var(--font-ui,system-ui);letter-spacing:.18em;text-transform:uppercase;color:rgb(var(--c));opacity:0;transition:opacity .3s}
.h3c.front .h3-go{opacity:1}
.h3c.off{filter:saturate(.4)}.h3c.off .h3-v{font-size:22px;color:var(--mu);text-shadow:none}
.h3-dots{display:flex;justify-content:center;align-items:center;gap:0;margin:2px auto 0;padding:0 8px}
.h3-dots button{width:40px;min-width:40px;height:40px;min-height:40px!important;padding:0!important;border:0!important;background:none!important;box-shadow:none!important;display:grid;place-items:center}
.h3-dots button i{width:8px;height:8px;border-radius:99px;background:rgb(var(--c) / .4);transition:width .3s,background .3s,box-shadow .3s}
.h3-dots button[aria-current=true] i{width:22px;background:rgb(var(--c));box-shadow:0 0 10px rgb(var(--c))}
.h3-arrow{position:absolute;top:calc(var(--h3h,430px) / 2 - 22px);z-index:300;width:44px;height:44px;min-height:44px;padding:0!important;border-radius:50%!important;display:grid;place-items:center;background:rgba(6,14,26,.55)!important}
.h3-arrow svg{width:20px;height:20px;stroke:var(--tx);fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.h3-arrow.p{left:6px}.h3-arrow.n{right:6px}
@media(max-width:600px){.h3-arrow{display:none}}
/* ---- Bühne: Hologramm-Boden, Orbit-Ring, Projektor-Lichtkegel, Spiegelung, Schweben ---- */
@property --ang{syntax:'<angle>';inherits:false;initial-value:0deg}
.h3-stage{height:calc(var(--h3h,430px) + 56px);animation:h3Bob 6s ease-in-out infinite}
.h3-floor{position:absolute;left:50%;top:calc(var(--h3h,430px) - 40px);width:calc(var(--h3w,320px) * 2.3);height:calc(var(--h3w,320px) * 2.3);margin-left:calc(var(--h3w,320px) * -1.15);
  transform:translateY(-50%) rotateX(80deg);pointer-events:none;z-index:1;border-radius:50%;
  background:radial-gradient(circle,rgb(var(--c) / .32) 0,rgb(var(--c) / .10) 30%,transparent 62%),repeating-radial-gradient(circle,transparent 0 22px,rgb(var(--c) / .16) 23px 24px),conic-gradient(from 0deg,transparent 0 10%,rgb(var(--c) / .12) 10% 11%,transparent 11% 35%,rgb(var(--c) / .12) 35% 36%,transparent 36% 60%,rgb(var(--c) / .12) 60% 61%,transparent 61% 85%,rgb(var(--c) / .12) 85% 86%,transparent 86%);
  -webkit-mask:radial-gradient(circle,#000 40%,transparent 70%);mask:radial-gradient(circle,#000 40%,transparent 70%);transition:background .6s}
.h3-floor::before,.h3-floor::after{content:"";position:absolute;inset:14%;border-radius:50%;border:2px solid rgb(var(--c) / .75);box-shadow:0 0 22px rgb(var(--c) / .9),inset 0 0 22px rgb(var(--c) / .6)}
.h3-floor::after{inset:4%;border:1px dashed rgb(var(--c) / .5);box-shadow:none;animation:h3Spin 30s linear infinite}
.h3-beam{position:absolute;left:50%;top:40px;width:calc(var(--h3w,320px) * 1.05);height:calc(var(--h3h,430px) - 60px);margin-left:calc(var(--h3w,320px) * -.525);pointer-events:none;z-index:2;
  background:linear-gradient(to top,rgb(var(--c) / .26),rgb(var(--c) / .06) 55%,transparent);clip-path:polygon(32% 100%,68% 100%,100% 0,0 0);filter:blur(6px);animation:h3Beam 3.2s ease-in-out infinite;transition:background .6s}
.h3-rim{position:absolute;inset:0;border-radius:inherit;padding:2px;pointer-events:none;opacity:0;transition:opacity .4s;
  background:conic-gradient(from var(--ang),transparent 0 55%,rgb(var(--c)) 72%,#fff 78%,rgb(var(--c)) 84%,transparent 100%);
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude}
.h3c.front .h3-rim{opacity:1;animation:h3Ang 3.6s linear infinite}
.h3-scan{position:absolute;inset:0;border-radius:inherit;pointer-events:none;opacity:0;transition:opacity .4s;
  background:repeating-linear-gradient(to bottom,rgba(255,255,255,.035) 0 1px,transparent 1px 4px),linear-gradient(to bottom,transparent 0,rgb(var(--c) / .16) 48%,transparent 52%) 0 -120%/100% 60% no-repeat}
.h3c.front .h3-scan{opacity:1;animation:h3Scan 4.5s linear infinite}
.h3c.front .h3-obj svg{animation:h3Float 5s ease-in-out infinite}
/* ---- Kopf: Begrüßung, Datum, Uhr ---- */
.h3-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;padding:0 clamp(14px,4vw,32px);margin:2px 0 4px}
.h3-hero small{display:block;font:700 11px var(--font-ui,system-ui);letter-spacing:.24em;text-transform:uppercase;color:rgb(var(--c));opacity:.9;transition:color .6s}
.h3-hero b{display:block;font:700 clamp(22px,6.4vw,34px)/1.1 var(--font-hud,system-ui);letter-spacing:.05em;text-transform:uppercase;color:#fff;
  background:linear-gradient(100deg,#fff 30%,rgb(var(--c)) 50%,#fff 70%) 0 0/250% 100%;-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;animation:h3Shine 5s ease-in-out infinite;filter:drop-shadow(0 0 14px rgb(var(--c) / .45))}
.h3-clock{text-align:right;flex:none}
.h3-clock b{font-size:clamp(26px,7.4vw,40px);letter-spacing:.06em;font-variant-numeric:tabular-nums}
html[data-hub3d=on] #hub .top h1{font-size:13px;letter-spacing:.32em;opacity:.75;text-shadow:none;margin:0}
html[data-hub3d=on] #hub .top .sub{font-size:12px;margin:2px 0 6px}
.h3-obj.has3d{margin:2px -4px;border-radius:18px;overflow:hidden;background:#000;box-shadow:0 0 18px rgb(var(--c) / .14)}
.h3-obj.has3d::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;background:repeating-linear-gradient(to bottom,rgba(255,255,255,.035) 0 1px,transparent 1px 3px);box-shadow:inset 0 0 0 1px rgb(var(--c) / .35),inset 0 0 30px rgb(var(--c) / .18)}
@keyframes h3Bob{50%{transform:translateY(-7px)}}
@keyframes h3Beam{50%{opacity:.55}}
@keyframes h3Ang{to{--ang:360deg}}
@keyframes h3Scan{to{background-position:0 0,0 260%}}
@keyframes h3Float{50%{transform:translateY(-6px) scale(1.04)}}
@keyframes h3Shine{0%,100%{background-position:100% 0}50%{background-position:0 0}}
@keyframes h3Spin{to{transform:rotate(360deg)}}
@keyframes h3SpinY{50%{transform:scaleX(.35)}}
@keyframes h3Drift{50%{transform:rotate(6deg) scale(1.04)}}
@keyframes h3Node{50%{opacity:.45}}
@keyframes h3Lane{to{stroke-dashoffset:-44}}
@keyframes h3Beat{0%,100%{transform:scale(1)}12%{transform:scale(1.14)}24%{transform:scale(.97)}36%{transform:scale(1.07)}60%{transform:scale(1)}}
@keyframes h3Now{50%{opacity:.35}}
`;
let built=false,box=null,cards=[],pos=0,vel=0,target=0,raf=0,front=-1,W=320,R=360,dots=[];
function size(){
  const vw=Math.min(innerWidth,document.documentElement.clientWidth||innerWidth),vh=innerHeight;
  const wide=vw>=700;
  W=Math.round(wide?Math.min(vw*.42,380):Math.min(vw*.7,300));
  const H=Math.round(Math.max(330,Math.min(vh*(wide?.44:.48),wide?500:400)));
  R=Math.round(W*1.2);
  box.style.setProperty('--h3w',W+'px');box.style.setProperty('--h3h',H+'px');
  // Platz zwischen Kopf und unterer Leiste ganz nutzen, damit die Bühne mittig steht
  const top=box.getBoundingClientRect().top+(scrollY||0),nav=document.getElementById('lb-nav'),nb=nav&&getComputedStyle(nav).bottom==='0px'?nav.getBoundingClientRect().height:0;
  box.style.setProperty('--h3full',Math.max(0,Math.round(vh-top-nb-8))+'px');
}
function build(){
  if(built)return;built=true;
  const st=document.createElement('style');st.id='lb-hub3d-css';st.textContent=CSS;document.head.append(st);
  box=document.createElement('div');box.id='hub3d';box.setAttribute('role','region');box.setAttribute('aria-roledescription','Karussell');box.setAttribute('aria-label','Reiter');
  const tiles=$('tiles'),hrefOf=f=>{const a=tiles&&[...tiles.querySelectorAll('a[href]')].find(x=>x.getAttribute('href').split('?')[0]===f);return a?a.getAttribute('href'):f};
  const arrow=(c,l,d)=>'<button type="button" class="h3-arrow '+c+'" aria-label="'+l+'"><svg viewBox="0 0 24 24"><path d="'+d+'"/></svg></button>';
  box.innerHTML='<div class="h3-hero" aria-hidden="false"><div><small id="h3date"></small><b id="h3greet"></b></div><div class="h3-clock"><small>Berlin</small><b id="h3time"></b></div></div>'+
  '<div class="h3-stage"><div class="h3-floor" aria-hidden="true"></div><div class="h3-beam" aria-hidden="true"></div>'+CARDS.map((c,i)=>{
    const col=c.rgb().join(' '),tag=c.off?'div':'a',href=c.off?'':' href="'+esc(hrefOf(c.href))+'"';
    return '<'+tag+' class="h3c'+(c.off?' off':'')+'" data-i="'+i+'" data-id="'+c.id+'"'+href+' draggable="false"'+(c.off?' aria-disabled="true"':'')+' style="--c:'+col+'">'+
      '<span class="h3-rim"></span><span class="h3-scan"></span><div class="h3-head"><span class="h3-k">'+esc(c.k)+'</span><span class="h3-tag" hidden></span></div>'+
      '<div class="h3-obj" aria-hidden="true"></div><div class="h3-v"></div><div class="h3-l"></div><div class="h3-s"></div><span class="h3-go">'+(c.off?'':'Öffnen ›')+'</span></'+tag+'>';
  }).join('')+'</div>'+arrow('p','Vorherige Karte','M15 5l-7 7 7 7')+arrow('n','Nächste Karte','M9 5l7 7-7 7')+
  '<div class="h3-dots" role="tablist" aria-label="Karten">'+CARDS.map((c,i)=>'<button type="button" role="tab" aria-label="'+esc(c.k)+'" data-i="'+i+'" style="--c:'+c.rgb().join(' ')+'"><i></i></button>').join('')+'</div>';
  const hub=$('hub'),top=hub&&hub.querySelector('.top');
  if(top)top.after(box);else if(hub)hub.prepend(box);
  cards=[...box.querySelectorAll('.h3c')];dots=[...box.querySelectorAll('.h3-dots button')];
  size();initial();wire();fill();layout();hero();
  addEventListener('resize',()=>{size();layout()});
}
/* ---------- Anordnung auf dem Zylinder ---------- */
const wrap=r=>{r=((r%N)+N)%N;return r>N/2?r-N:r};
function layout(){
  const fi=((Math.round(pos)%N)+N)%N;
  cards.forEach((el,i)=>{
    const rel=wrap(i-pos),a=rel*ANG,c=Math.cos(a),sn=Math.sin(a),ar=Math.abs(rel);
    const x=R*sn,z=R*(c-1)-ar*30,sc=1-.07*Math.min(ar,2);
    el.style.transform='translate3d('+x.toFixed(1)+'px,0,'+z.toFixed(1)+'px) rotateY('+(a*180/Math.PI).toFixed(2)+'deg) scale('+sc.toFixed(3)+')';
    const vis=ar<1.85;
    el.style.opacity=vis?(ar<1?1-ar*.3:Math.max(0,.7-(ar-1)*.85)).toFixed(3):'0';   // nur Deckkraft ändern: läuft auf der Grafikkarte, kein Neuzeichnen
    el.style.visibility=vis?'visible':'hidden';
    el.style.zIndex=String(200+Math.round(c*100));
    el.style.pointerEvents=ar<1.15?'auto':'none';
    el.classList.toggle('front',i===fi&&ar<.5);
    const ob=objs[CARDS[i].id];if(ob){ob.setVisible(ar<1.25);ob.spin(vel*2.2)}
    el.setAttribute('tabindex',i===fi?'0':'-1');
  });
  if(fi!==front){const was=front;front=fi;onFront();if(was>=0&&spinning&&window.LBUI)LBUI.sound('tap')}
  window.__lbSpin=pos*STEP;window.dispatchEvent(new CustomEvent('lb-spin',{detail:pos*STEP}));   // Weltraum dreht mit
}
let spinning=false;
/* Kopf: Begrüßung mit Vorname, Datum mit Kalenderwoche, Uhr (Berlin) */
function hero(){
  const g=$('h3greet'),d=$('h3date'),t=$('h3time');if(!g)return;
  const tick=()=>{
    const now=new Date(),f=o=>new Intl.DateTimeFormat('de-DE',Object.assign({timeZone:'Europe/Berlin'},o)).format(now);
    const h=+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(now);
    let name='';try{name=((auth.currentUser&&auth.currentUser.displayName)||'').split(' ')[0]}catch(e){}
    g.textContent=(h<5?'Gute Nacht':h<11?'Guten Morgen':h<17?'Guten Tag':h<22?'Guten Abend':'Gute Nacht')+(name?', '+name:'');
    const k=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin'}).format(now),[y,m,dd]=k.split('-').map(Number),day=Date.UTC(y,m-1,dd),wd=(new Date(day).getUTCDay()+6)%7;
    const thu=new Date(day+(3-wd)*864e5),j4=Date.UTC(thu.getUTCFullYear(),0,4),mon1=j4-((new Date(j4).getUTCDay()+6)%7)*864e5,kw=Math.floor((day-wd*864e5-mon1)/6048e5)+1;   // ISO-Kalenderwoche
    d.textContent=f({weekday:'short'}).replace('.','')+' · '+f({day:'numeric',month:'long'})+' · KW '+kw;
    t.textContent=f({hour:'2-digit',minute:'2-digit'});
  };
  tick();setInterval(tick,15000);
  try{auth.onAuthStateChanged(()=>tick())}catch(e){}
}
function onFront(){
  dots.forEach((d,i)=>d.setAttribute('aria-current',i===front));
  const c=CARDS[front];box.style.setProperty('--c',c.rgb().join(' '));
  const rgb=c.rgb();window.__lbTint=rgb;window.dispatchEvent(new CustomEvent('lb-tint',{detail:rgb}));
}
/* ---------- Bewegung: Feder zum Ziel ---------- */
function anim(){
  if(raf)return;let last=performance.now();
  const f=now=>{
    const dt=Math.min(.05,(now-last)/1000);last=now;
    const k=150,d=2*Math.sqrt(k);vel+=((target-pos)*k-vel*d)*dt;pos+=vel*dt;   // kritisch gedämpft: landet ohne Nachwippen
    if(Math.abs(target-pos)<.0015&&Math.abs(vel)<.02){pos=target;vel=0;raf=0;layout();spinning=false;return}
    layout();raf=requestAnimationFrame(f);
  };
  raf=requestAnimationFrame(f);
}
function goTo(i,sound){
  spinning=true;const cur=Math.round(target),rel=wrap(i-cur);target=cur+rel;anim();
  if(sound&&window.LBUI)LBUI.sound('tap');
}
function initial(){pos=-.85;target=0;vel=0;layout();setTimeout(anim,120)}   // kurzes Hereindrehen, Check-in landet vorne
/* ---------- Wischen, Tippen, Tastatur ---------- */
function wire(){
  const stage=box.querySelector('.h3-stage');let P=null,dragAt=0;
  stage.addEventListener('dragstart',e=>e.preventDefault());   // Links nicht ziehen (sonst bricht das Wischen ab)
  stage.addEventListener('pointerdown',e=>{
    if(e.button>0)return;
    P={id:e.pointerId,x:e.clientX,y:e.clientY,p0:target,drag:false,hist:[[performance.now(),e.clientX]]};
  });
  stage.addEventListener('pointermove',e=>{
    if(!P||e.pointerId!==P.id)return;const dx=e.clientX-P.x,dy=e.clientY-P.y;
    if(!P.drag){
      if(Math.abs(dx)>7&&Math.abs(dx)>Math.abs(dy)*1.1){P.drag=true;spinning=true;P.p0=pos;P.x=e.clientX;cancelAnimationFrame(raf);raf=0;vel=0;try{stage.setPointerCapture(P.id)}catch(x){}}
      else if(Math.abs(dy)>12){P=null;return}
      else return;
    }
    const ddx=e.clientX-P.x;pos=P.p0-ddx/(W*.8);target=pos;layout();
    const now=performance.now();P.hist.push([now,e.clientX]);while(P.hist.length>2&&now-P.hist[0][0]>100)P.hist.shift();
  });
  const up=e=>{
    if(!P||e.pointerId!==P.id)return;
    if(P.drag){
      const h=P.hist,a=h[0],b=h[h.length-1],dt=Math.max(16,b[0]-a[0]),fresh=performance.now()-b[0]<90;
      const v=fresh?Math.max(-8,Math.min(8,-(b[1]-a[1])/dt*1000/(W*.8))):0;   // Karten pro Sekunde (Finger, der stillsteht = 0)
      const r0=Math.round(P.p0);let tg=Math.round(pos+Math.max(-1.6,Math.min(1.6,v*.2)));const mv=pos-P.p0;
      if(tg===r0&&Math.abs(mv)>.15)tg=r0+Math.sign(mv);   // schon ein kurzer Wisch blättert weiter
      tg=Math.max(r0-2,Math.min(r0+2,tg));
      target=tg;vel=v;anim();dragAt=performance.now();
      if(Math.round(target)!==Math.round(P.p0)&&window.LBUI)LBUI.sound('tap');
    }
    P=null;
  };
  stage.addEventListener('pointerup',up);stage.addEventListener('pointercancel',e=>{if(P&&P.drag){target=Math.round(pos);anim()}P=null});
  // Antippen: vorderste Karte öffnet (normaler Link), seitliche Karte dreht nach vorne
  stage.addEventListener('click',e=>{
    const el=e.target.closest('.h3c');if(!el)return;
    if(performance.now()-dragAt<350){e.preventDefault();e.stopPropagation();return}
    const i=+el.dataset.i;
    if(i!==front){e.preventDefault();goTo(i,false);return}   // seitliche Karte: nach vorne drehen
    if(raf){cancelAnimationFrame(raf);raf=0;pos=target=Math.round(target);vel=0;layout()}   // vorderste Karte öffnet immer, auch wenn noch nachläuft
    if(CARDS[i].off){e.preventDefault();return}
  });
  box.querySelector('.h3-arrow.p').onclick=()=>goTo(front-1);
  box.querySelector('.h3-arrow.n').onclick=()=>goTo(front+1);
  dots.forEach(d=>d.onclick=()=>goTo(+d.dataset.i));
  box.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){goTo(front-1);e.preventDefault()}else if(e.key==='ArrowRight'){goTo(front+1);e.preventDefault()}});
  cards.forEach(el=>el.addEventListener('focus',()=>{const i=+el.dataset.i;if(i!==front)goTo(i)}));
}
/* ---------- Inhalte ---------- */
function card(id){return cards[CARDS.findIndex(c=>c.id===id)]}
function put(id,o){
  const el=card(id);if(!el)return;
  if(o.obj!=null)el.querySelector('.h3-obj').innerHTML=o.obj;
  if(o.v!=null)el.querySelector('.h3-v').innerHTML=o.v;
  if(o.l!=null)el.querySelector('.h3-l').innerHTML=o.l;
  if(o.s!=null)el.querySelector('.h3-s').innerHTML=o.s;
  if(o.tag!==undefined){const t=el.querySelector('.h3-tag');t.hidden=!o.tag;t.textContent=o.tag||'';t.classList.toggle('ok',!!o.ok)}
  if(o.css)for(const k in o.css)el.style.setProperty(k,o.css[k]);
}
const berlinHour=()=>+new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Berlin',hour:'2-digit',hourCycle:'h23'}).format(new Date());
function fillEmblems(){const eve=berlinHour()>=17,E={checkin:eve?EMB.moon:EMB.sun,muster:EMB.net,kalender:EMB.band,recovery:EMB.core,training:ringSvg((objData.training&&objData.training.days||Array.from({length:7},(_,i)=>({st:'rest',letter:'MDMDFSS'[i]}))).map(d=>Object.assign({},d,{col:d.rgb?'rgb('+d.rgb.join(' ')+')':null})))};for(const k in E)put(k,{obj:E[k]})}
function fill(){
  const eve=berlinHour()>=17;
  put('checkin',{obj:eve?EMB.moon:EMB.sun,v:'…',l:eve?'Abend':'Morgen',s:''});
  put('muster',{obj:EMB.net,v:'',l:'Was dir guttut, was dich bremst',s:'Zusammenhänge aus Check-in und Whoop · Verläufe vergleichen · Rückblick'});
  put('kalender',{obj:EMB.band,v:'',l:'Nächster Termin',s:'wird geladen …'});
  put('training',{obj:ringSvg(Array.from({length:7},(_,i)=>({st:'rest',letter:'MDMDFSS'[i]}))),v:'',l:'Trainingsplan',s:'wird geladen …'});
  put('recovery',{obj:EMB.core,v:'',l:'Erholung, HRV, Schlaf und Strain',s:'Noch keine Whoop-Daten auf diesem Gerät – Recovery einmal öffnen.'});
  mirrorCheckin();
  try{auth.onAuthStateChanged(u=>{if(!u)return;recovery();training();calendar();checkinObj()})}catch(e){}
  objects();
}
/* Check-in: Text der bestehenden ckTxt-Logik übernehmen (index.html), Status daraus ablesen */
function mirrorCheckin(){
  const src=$('ckTxt');if(!src)return;
  const sync=()=>{
    const h=src.innerHTML,t=src.textContent||'',eve=berlinHour()>=17;
    let v='…',tag=null,ok=false;
    if(/Morgen-Check offen/.test(t)){v='Offen';tag='Morgen offen'}
    else if(/Abend offen/.test(t)){v='Abend';tag='Abend offen'}
    else if(/Stimmung \d\/5/.test(t)){v='Erledigt';tag=/Abend ✓/.test(t)?'Morgen + Abend ✓':'Morgen ✓';ok=true}
    put('checkin',{v:esc(v),tag,ok,s:h,l:eve?'Abend-Check':'Morgen-Check'});
  };
  sync();new MutationObserver(sync).observe(src,{childList:true,subtree:true,characterData:true});
}
/* Live-Werte über LBData (lb-data.js, nur lesen) – dieselben Werte nutzen auch die 3D-Objekte */
function data(){return window.LBData?Promise.resolve(window.LBData):new Promise((res,rej)=>{const s=document.createElement('script');s.src='lb-data.js?v=1';s.onload=()=>res(window.LBData);s.onerror=rej;document.head.append(s)})}
const OBJ={checkin:'sun',training:'ring',recovery:'core',muster:'net',kalender:'band'};
const objs={},objData={};
function feed(id,d){objData[id]=d;if(objs[id]&&d)objs[id].set(d)}
async function recovery(){
  try{
    const r=await (await data()).recovery();if(!r)return;
    const z=[r.label,{g:'var(--ok,#4ee3a0)',y:'var(--mid,#ffc15a)',r:'var(--low,#ff6a5c)'}[r.zone]],when=r.today?'heute':'vom '+r.date.slice(8,10)+'.'+r.date.slice(5,7)+'.';
    put('recovery',{v:r.v+'<small>%</small>',l:'Zone <span style="color:'+z[1]+'">'+z[0]+'</span>',tag:'Recovery '+when,
      s:[r.hrv!=null?'HRV '+r.hrv+' ms':'',r.rhr!=null?'Ruhepuls '+r.rhr:''].filter(Boolean).join(' · '),
      css:{'--z':z[1],'--per':r.rhr?(60/Math.max(35,Math.min(120,r.rhr))).toFixed(2)+'s':'1.1s'}});
    try{localStorage.setItem('lb_zone',JSON.stringify({z:r.zone,at:Date.now()}))}catch(e){}
    feed('recovery',r);
  }catch(e){}
}
/* Training: heutige Einheit + Wochenfortschritt (gleiche Rechnung wie plan.js weekStats, nur lesen) */
async function training(){
  try{
    const w=await (await data()).week();if(!w)return;
    if(w.seeded){put('training',{v:'',l:'Startplan noch nicht übernommen',s:'Im Training prüfen und übernehmen.'});return}
    const out=w.days.map(d=>Object.assign({},d,{col:d.rgb?'rgb('+d.rgb.join(' ')+')':null}));
    let l='Heute Pause',tag=null,ok=false;
    if(w.today.length){l='Heute: '+w.today.map(x=>(x.done?'✓ ':'')+esc(x.name)).join(' · ');const all=w.today.every(x=>x.done);tag=all?'Heute erledigt':'Heute offen';ok=all}
    put('training',Object.assign(objs.training?{}:{obj:ringSvg(out)},{v:w.done+'<small>von '+w.plan+'</small>',l,s:'Einheiten diese Woche (Mo–So)',tag,ok}));
    feed('training',w);
  }catch(e){put('training',{s:'Plan gerade nicht lesbar.'})}
}
/* Kalender: nächster Termin ab jetzt (14 Tage) */
async function calendar(){
  try{
    const n=await (await data()).next();if(!n)return;
    if(!n.length){put('kalender',{v:'',l:'Keine Termine in den nächsten 14 Tagen',s:'Antippen zum Planen.'});feed('kalender',[]);return}
    const o=n[0],rest=n.slice(1,3).map(x=>(x.inDays===0?'heute ':x.inDays===1?'morgen ':x.day.split(' ')[0]+' ')+(x.time?x.time+' ':'')+esc(x.title));
    put('kalender',{v:o.time?esc(o.time):'<small>ganztägig</small>',l:esc(o.day+' · '+o.title),tag:o.rel||null,s:rest.length?'Danach: '+rest.join(' · '):''});
    feed('kalender',n);
  }catch(e){put('kalender',{s:'Kalender gerade nicht lesbar.'})}
}
async function checkinObj(){try{const c=await (await data()).checkin();feed('checkin',c)}catch(e){}}
/* 3D-Objekte auf den Karten (lb-obj3d.js), sobald die Weltraum-Welt läuft; sonst bleiben die Embleme */
function objects(){
  if(!window.LBObj||!LBObj.on||!active())return;
  cards.forEach((el,i)=>{const id=CARDS[i].id,t=OBJ[id];if(!t||objs[id])return;
    const box=el.querySelector('.h3-obj'),o=LBObj.mount(box,t,objData[id]||null,{dist:t==='ring'?3.9:4.4});if(o){box.classList.add('has3d');objs[id]=o;if(objData[id])o.set(objData[id])}});
  layout();
}
window.addEventListener('lb-obj-ready',()=>objects());
window.addEventListener('lb-obj-gone',()=>{for(const k in objs)delete objs[k];cards.forEach(c=>c.querySelector('.h3-obj').classList.remove('has3d'));fillEmblems()});
/* ---------- ein- und ausschalten (Design, Performance-Modus, Bewegung reduzieren) ---------- */
function apply(){
  const on=active();
  if(on){root.setAttribute('data-hub3d','on');build();box.hidden=false;size();layout()}
  else{root.removeAttribute('data-hub3d');if(box)box.hidden=true}
}
function start(){
  apply();
  if(window.LBUI)LBUI.onSettings(()=>apply());
  window.addEventListener('lb-theme',apply);
  try{matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change',apply)}catch(e){}
}
window.LBHub3D={apply,goTo:i=>goTo(i),get front(){return front},get busy(){return !!raf},CARDS};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
