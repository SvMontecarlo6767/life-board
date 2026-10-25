/* Graph-Vollbild (Phase 7). Ein zentrales Modul für alle Reiter. Nur lesen, verändert keine Daten.
   Eine Zeile pro Graph:  GraphFull.attach('#c-hrv',{id:'hrv',title:'HRV',unit:'ms',dir:1,series:()=>[{date,value}]})
   - series-Modus: eigenes Diagramm im Vollbild (Tippen, Wischen, Zeitraum, Zoom, Datumssuche, Statistiken).
   - clone-Modus (cfg.clone:true oder GraphFull.auto): vergrößerte Kopie eines vorhandenen Diagramms ohne Zeitachsen-Bedienung.
   Statistiken kommen ausschließlich aus graph-stats.js (deterministisch, Originaldaten).
   Erweiterungen:
   - cfg.layers:[{id,name,color,series}] weitere Kurven zum Ein-/Ausschalten und Vergleichen (cfg.mainName, cfg.color, cfg.layersOn)
   - cfg.stack:{keys:[{id,name,color}],get:date=>({id:wert})} gestapelte Säulen (Wert = Summe), Verteilung als Kachel
   - cfg.facts:ctx=>[{l,v,s,cls,wide}] zusätzliche Kacheln (ctx: from,to,points,stats), cfg.note: Erklärtext; beides auch im clone-Modus */
(function(root){
'use strict';
const GS=root.GraphStats,doc=document;
const NS='http://www.w3.org/2000/svg';
const REG=new Map();            // id -> {cfg, host:()=>el, btn}
let AUTO_N=0,OPEN=null;
const WDL=['So','Mo','Di','Mi','Do','Fr','Sa'];
const MON=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const perf=()=>{try{return !!(root.LBUI&&root.LBUI.settings&&root.LBUI.settings.perf)}catch(e){return false}};
const still=()=>perf()||matchMedia('(prefers-reduced-motion: reduce)').matches||navigator.webdriver===true&&!root.__gfAnimate;
const fmtNum=(v,d)=>v==null||!isFinite(v)?'–':v.toLocaleString('de-DE',{minimumFractionDigits:0,maximumFractionDigits:d==null?0:d});
const dd=k=>k.slice(8,10)+'.'+k.slice(5,7)+'.';
const longDate=k=>{const n=GS.dayNum(k);const w=WDL[(new Date(n*864e5).getUTCDay())];return w+', '+dd(k)+k.slice(0,4)};
const nice=(min,max,n)=>{if(!(max>min)){max=min+1}const raw=(max-min)/n,mag=Math.pow(10,Math.floor(Math.log10(raw))),f=raw/mag,step=(f<1.5?1:f<3?2:f<7?5:10)*mag,lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step,t=[];for(let v=lo;v<=hi+step/2;v+=step)t.push(+v.toFixed(10));return t};
const svgEl=(tag,attrs,p)=>{const e=doc.createElementNS(NS,tag);for(const k in attrs||{})e.setAttribute(k,attrs[k]);if(p)p.appendChild(e);return e};
const h=(tag,cls,html)=>{const e=doc.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e};

/* Katalog für Jarvis: Name -> Reiter (damit "zeig mir meinen Schlaf" auch von einer anderen Seite aus klappt) */
const CATALOG=[
 {id:'rec',title:'Recovery',page:'recovery.html',alias:['recovery','erholung']},
 {id:'hrv',title:'HRV',page:'recovery.html',alias:['hrv','herzratenvariabilitaet']},
 {id:'rhr',title:'Ruhepuls',page:'recovery.html',alias:['ruhepuls','puls']},
 {id:'sleep',title:'Schlafdauer',page:'recovery.html',alias:['schlaf','schlafdauer']},
 {id:'perf',title:'Schlaf-Performance',page:'recovery.html',alias:['schlaf performance','schlafqualitaet']},
 {id:'strain',title:'Strain',page:'recovery.html',alias:['strain','belastung']},
 {id:'resp',title:'Atemfrequenz',page:'recovery.html',alias:['atemfrequenz','atmung']},
 {id:'spo2',title:'Blutsauerstoff',page:'recovery.html',alias:['blutsauerstoff','sauerstoff','spo2']},
 {id:'skin',title:'Hauttemperatur',page:'recovery.html',alias:['hauttemperatur','temperatur']},
 {id:'kcal',title:'Kalorien',page:'recovery.html',alias:['kalorien','kcal']},
 {id:'steps',title:'Schritte',page:'recovery.html',alias:['schritte']},
 {id:'t-form',title:'Form (Training)',page:'training.html',alias:['form','trainingsform']},
 {id:'t-weeks',title:'Trainingsstunden pro Woche',page:'training.html',alias:['trainingsstunden','wochenumfang','training woche']},
 {id:'t-load',title:'Trainingslast pro Tag',page:'training.html',alias:['trainingslast','skyline','load']}
];

/* ---------------- Stil ---------------- */
const CSS=`
.gf-btn{position:absolute;z-index:6;width:48px;height:48px;border-radius:14px;border:1px solid rgb(var(--acc,120 200 255)/.4);background:rgba(8,16,28,.62);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);color:var(--ac,#7cd4ff);display:grid;place-items:center;padding:0;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;box-shadow:0 0 14px rgb(var(--acc,120 200 255)/.18)}
.gf-btn svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.gf-btn:active{transform:scale(.94);box-shadow:0 0 22px rgb(var(--acc,120 200 255)/.45)}
.gf-btn[hidden]{display:none}
#gf{position:fixed;inset:0;z-index:79;color:#e9f4ff;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;touch-action:manipulation}
#gf .gf-back{position:absolute;inset:0;background:radial-gradient(120% 90% at 50% 0%,rgb(var(--acc,120 200 255)/.14),rgba(2,6,12,.9) 70%);-webkit-backdrop-filter:blur(14px) saturate(1.2);backdrop-filter:blur(14px) saturate(1.2)}
#gf .gf-sheet{position:absolute;inset:0;display:flex;flex-direction:column;padding:max(8px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));overflow:hidden}
#gf .gf-grab{flex:none;height:26px;display:grid;place-items:center;touch-action:none;cursor:grab}
#gf .gf-grab i{width:54px;height:5px;border-radius:9px;background:rgb(var(--acc,120 200 255)/.5)}
#gf .gf-head{flex:none;display:flex;align-items:center;gap:10px;padding:0 2px 8px;touch-action:none}
#gf .gf-head>div:first-child{flex:1;min-width:0}
#gf h2{margin:0;font-size:clamp(18px,3.4vw,26px);letter-spacing:.04em;text-transform:uppercase;color:var(--ac,#7cd4ff);text-shadow:0 0 16px rgb(var(--acc,120 200 255)/.5);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#gf .gf-sub{font-size:12.5px;opacity:.72;margin-top:2px}
#gf .gf-tools{display:flex;gap:8px;align-items:center}
#gf button{font:inherit;color:inherit}
#gf .gf-tb{min-width:48px;min-height:48px;border-radius:14px;border:1px solid rgb(var(--acc,120 200 255)/.38);background:rgba(10,22,38,.7);color:#e9f4ff;display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:0 14px;font-size:14px;cursor:pointer;touch-action:manipulation}
#gf .gf-tb svg{width:22px;height:22px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#gf .gf-tb.x{font-size:22px;padding:0;width:52px;height:52px;border-color:rgb(var(--acc,120 200 255)/.7)}
#gf .gf-tb:active{background:rgb(var(--acc,120 200 255)/.28)}
#gf .gf-body{flex:1;min-height:0;display:flex;flex-direction:column;gap:12px;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
#gf .gf-main{display:flex;flex-direction:column;gap:10px;min-height:0;flex-shrink:0}
#gf .gf-stats{flex-shrink:0}
#gf .gf-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
#gf .gf-r{min-height:44px;padding:0 14px;border-radius:12px;border:1px solid rgb(var(--acc,120 200 255)/.28);background:rgba(10,22,38,.55);cursor:pointer;font-size:14px;touch-action:manipulation}
#gf .gf-r[aria-pressed=true]{background:rgb(var(--acc,120 200 255)/.24);border-color:var(--ac,#7cd4ff);color:#fff;box-shadow:0 0 14px rgb(var(--acc,120 200 255)/.3)}
#gf .gf-bar .sp{flex:1}
#gf .gf-frame{position:relative;border:1px solid rgb(var(--acc,120 200 255)/.42);border-radius:20px;background:linear-gradient(160deg,rgba(14,30,50,.66),rgba(6,12,22,.74));box-shadow:0 0 34px rgb(var(--acc,120 200 255)/.14),inset 0 0 40px rgb(var(--acc,120 200 255)/.05);overflow:hidden}
#gf .gf-frame::before,#gf .gf-frame::after{content:"";position:absolute;width:26px;height:26px;border:2px solid var(--ac,#7cd4ff);opacity:.85;pointer-events:none;transition:width .45s,height .45s}
#gf .gf-frame::before{left:-1px;top:-1px;border-right:0;border-bottom:0;border-top-left-radius:20px}
#gf .gf-frame::after{right:-1px;bottom:-1px;border-left:0;border-top:0;border-bottom-right-radius:20px}
#gf.gf-in .gf-frame::before,#gf.gf-in .gf-frame::after{width:0;height:0}
#gf .gf-stage{position:relative;height:clamp(260px,46vh,560px);touch-action:none;user-select:none;-webkit-user-select:none;transform-origin:0 0}
#gf .gf-stage svg{display:block;width:100%;height:100%}
#gf .gf-stage.clone{height:auto;min-height:240px;max-height:calc(100vh - 150px);overflow:auto;padding:14px;touch-action:pan-x pan-y pinch-zoom}
#gf .gf-stage.clone svg{height:auto;max-height:calc(100vh - 190px)}
#gf text{fill:rgba(220,236,255,.7);font:11px system-ui,sans-serif}
#gf .gf-ln{fill:none;stroke:var(--ac,#7cd4ff);stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round;filter:drop-shadow(0 0 5px rgb(var(--acc,120 200 255)/.6))}
#gf .gf-draw{stroke-dasharray:1;stroke-dashoffset:1;animation:gfDraw .7s cubic-bezier(.22,1,.36,1) forwards}
@keyframes gfDraw{to{stroke-dashoffset:0}}
#gf .gf-bars rect{fill:var(--ac,#7cd4ff);fill-opacity:.82;transform-box:fill-box;transform-origin:50% 100%}
#gf .gf-grow rect{animation:gfGrow .55s cubic-bezier(.22,1,.36,1) both}
@keyframes gfGrow{from{transform:scaleY(0)}}
#gf .gf-glow{fill:var(--ac,#7cd4ff);filter:drop-shadow(0 0 9px var(--ac,#7cd4ff))}
#gf .gf-mark{stroke:rgba(230,245,255,.75);stroke-width:1.2;stroke-dasharray:4 3}
#gf .gf-tip{position:absolute;z-index:3;pointer-events:none;min-width:130px;max-width:260px;padding:9px 12px;border-radius:12px;background:rgba(6,14,26,.92);border:1px solid var(--ac,#7cd4ff);box-shadow:0 0 22px rgb(var(--acc,120 200 255)/.35);font-size:13px;line-height:1.35}
#gf .gf-tip b{display:block;font-size:20px;color:var(--ac,#7cd4ff)}
#gf .gf-tip .d{opacity:.75;font-size:12px}
#gf .gf-tip .x{opacity:.85;font-size:12px;margin-top:3px}
#gf .gf-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;align-content:start}
#gf .gf-t{padding:11px 13px;border-radius:14px;border:1px solid rgb(var(--acc,120 200 255)/.28);background:rgba(10,22,38,.58);min-height:78px}
#gf .gf-t .l{font-size:11.5px;letter-spacing:.07em;text-transform:uppercase;opacity:.7}
#gf .gf-t .v{font-size:25px;font-weight:700;margin-top:3px;color:#fff;text-shadow:0 0 14px rgb(var(--acc,120 200 255)/.4)}
#gf .gf-t .v small{font-size:13px;font-weight:600;opacity:.75;margin-left:3px}
#gf .gf-t .s{font-size:12px;opacity:.78;margin-top:2px}
#gf .gf-t.good .v{color:#7dffb4}#gf .gf-t.bad .v{color:#ff8d8d}
#gf .gf-t.wide{grid-column:1/-1}
#gf .gf-t.note .v{font-size:14px;font-weight:400;line-height:1.45;text-shadow:none;color:#dcecff}
#gf .gf-t .v.txt{font-size:15px;font-weight:600}
#gf .gf-r i.sw{display:inline-block;width:12px;height:12px;border-radius:4px;margin-right:6px;vertical-align:-1px}
#gf .gf-r[aria-pressed=false] i.sw{opacity:.35}
#gf .gf-lg{display:flex;gap:12px;flex-wrap:wrap;font-size:13px;opacity:.9}
#gf .gf-lg i{display:inline-block;width:12px;height:12px;border-radius:3px;margin-right:5px;vertical-align:-1px}
#gf .gf-dist{display:flex;height:14px;border-radius:7px;overflow:hidden;margin-top:8px}
#gf .gf-dist i{display:block;height:100%}
#gf .gf-rows{font-size:13.5px;margin-top:6px}
#gf .gf-rows div{display:flex;justify-content:space-between;gap:10px;padding:3px 0;border-top:1px solid rgba(190,225,255,.1)}
#gf .gf-rows div:first-child{border-top:0}
#gf:not(.gf-in) .gf-in-t{opacity:0;transform:translateY(12px)}
#gf.gf-in .gf-in-t{animation:gfUp .45s cubic-bezier(.22,1,.36,1) backwards;animation-delay:var(--d,0ms)}
@keyframes gfUp{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
#gf .gf-dow{display:flex;align-items:flex-end;gap:6px;height:64px;margin-top:6px}
#gf .gf-dow div{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;height:100%;font-size:11px;opacity:.95}
#gf .gf-dow i{display:block;width:100%;border-radius:4px 4px 0 0;background:var(--ac,#7cd4ff);opacity:.75;min-height:2px}
#gf .gf-dow div.b i{opacity:1;box-shadow:0 0 10px var(--ac,#7cd4ff)}
#gf .gf-empty{position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:20px;opacity:.8}
#gf .gf-cal{position:absolute;inset:0;z-index:8;background:rgba(2,6,12,.78);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:grid;place-items:center;padding:16px}
#gf .gf-calp{width:min(420px,100%);border-radius:20px;border:1px solid var(--ac,#7cd4ff);background:rgba(8,18,32,.96);padding:14px;box-shadow:0 0 34px rgb(var(--acc,120 200 255)/.3)}
#gf .gf-calh{display:flex;align-items:center;gap:8px;margin-bottom:8px}#gf .gf-calh b{flex:1;text-align:center;font-size:16px}
#gf .gf-calg{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
#gf .gf-calg span{text-align:center;font-size:11px;opacity:.6;padding:2px}
#gf .gf-calg button{min-height:44px;border-radius:10px;border:1px solid rgb(var(--acc,120 200 255)/.3);background:rgb(var(--acc,120 200 255)/.1);cursor:pointer;font-size:14px}
#gf .gf-calg button:disabled{opacity:.25;border-color:transparent;background:transparent;cursor:default}
#gf .gf-calg button.sel{background:rgb(var(--acc,120 200 255)/.4);border-color:var(--ac,#7cd4ff)}
#gf .gf-toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);padding:8px 14px;border-radius:12px;background:rgba(6,14,26,.94);border:1px solid var(--ac,#7cd4ff);font-size:13px;z-index:9;pointer-events:none}
@media (orientation:landscape) and (min-width:700px){
 #gf .gf-body{flex-direction:row;overflow:hidden}
 #gf .gf-main{flex:1;min-width:0}
 #gf .gf-stage{height:clamp(200px,calc(100vh - 230px),700px)}
 #gf .gf-stats{width:min(36vw,360px);flex:none;overflow:auto;overscroll-behavior:contain;grid-template-columns:repeat(2,1fr);padding-right:2px}
}
@media (max-width:600px){#gf .gf-tb .t{display:none}}
html.gf-open #jv:not([data-open="1"]) #jv-stage{left:auto;right:calc(12px + env(safe-area-inset-right));transform:none;width:auto;bottom:calc(10px + env(safe-area-inset-bottom))}
html.gf-open #jv:not([data-open="1"]) #jv-orb{width:58px;height:58px}
html[data-perf] #gf .gf-in-t{animation:none!important;opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){#gf .gf-in-t{animation:none!important;opacity:1;transform:none}#gf .gf-draw,#gf .gf-grow rect{animation:none!important;stroke-dashoffset:0}}
html[data-perf] #gf .gf-back,html[data-perf] #gf .gf-btn{-webkit-backdrop-filter:none;backdrop-filter:none}
`;
let styled=false;
function ensureStyle(){if(styled)return;styled=true;const s=doc.createElement('style');s.id='gf-style';s.textContent=CSS;doc.head.appendChild(s)}

/* ---------------- Knopf am Panel ---------------- */
const ICON='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3H3v6M15 3h6v6M9 21H3v-6M15 21h6v-6"/><path d="M3 3l6 6M21 3l-6 6M3 21l6-6M21 21l-6-6"/></svg>';
function resolveHost(h){return typeof h==='function'?h():typeof h==='string'?doc.querySelector(h):h}
function panelOf(host){return host&&(host.closest('.card,.gcard,.panel,section.cat,.hv-hero')||host.parentElement)}
function place(entry){
  const host=resolveHost(entry.host);const btn=entry.btn;
  if(!host||!doc.contains(host)){btn.hidden=true;return}
  const panel=btn.parentElement;if(!panel)return;
  const hr=host.getBoundingClientRect(),pr=panel.getBoundingClientRect();
  if(hr.width<40||hr.height<20){btn.hidden=true;return}
  btn.hidden=false;
  const shared=panel.querySelectorAll(':scope > .gf-btn').length>1;
  if(shared){btn.style.top=Math.max(2,hr.top-pr.top+4)+'px';btn.style.left=(hr.right-pr.left-48)+'px'}
  else{btn.style.top='6px';btn.style.left=(pr.width-50)+'px'}
}
function placeAll(){REG.forEach(place)}
let ro=null;
function attach(host,cfg){
  ensureStyle();cfg=Object.assign({kind:'line',dir:0,digits:0,unit:''},cfg||{});
  if(!cfg.id)cfg.id='g'+(++AUTO_N);
  const el0=resolveHost(host);if(!el0)return null;
  const panel=panelOf(el0);if(!panel)return null;
  let e=REG.get(cfg.id);
  if(e&&e.btn&&e.btn.parentElement===panel){e.cfg=cfg;e.host=host;place(e);return e}
  if(e&&e.btn)e.btn.remove();
  if(getComputedStyle(panel).position==='static')panel.style.position='relative';
  const btn=h('button','gf-btn',ICON);btn.type='button';btn.setAttribute('aria-label','Vollbild: '+(cfg.title||'Graph'));btn.title='Vollbild';
  btn.addEventListener('click',ev=>{ev.stopPropagation();open(cfg.id)});
  panel.appendChild(btn);e={cfg,host,btn};REG.set(cfg.id,e);
  if(!ro&&root.ResizeObserver)ro=new ResizeObserver(()=>{clearTimeout(ro._t);ro._t=setTimeout(placeAll,60)});
  if(ro){ro.observe(panel);ro.observe(el0)}
  place(e);return e;
}
addEventListener('resize',()=>{clearTimeout(placeAll._t);placeAll._t=setTimeout(placeAll,120)});
addEventListener('orientationchange',()=>setTimeout(placeAll,300));

/* Automatische Erkennung aller übrigen Diagramme (clone-Modus). opts.root, opts.exclude (Selektor) */
function auto(opts){
  opts=opts||{};ensureStyle();
  const rootEl=opts.root||doc.body;
  const scan=()=>{
    rootEl.querySelectorAll('svg').forEach(svg=>{
      if(svg.closest('#gf,#jv,#lb-nav,button,a,.gf-btn,[data-nogf],.nogf')||svg.classList.contains('nogf'))return;
      if(opts.exclude&&svg.closest(opts.exclude))return;
      const r=svg.getBoundingClientRect();if(r.width<220||r.height<70)return;
      const hostEl=svg.parentElement;if(!hostEl||hostEl.dataset.gf)return;
      for(const e of REG.values()){const h0=resolveHost(e.host);if(h0&&(h0===hostEl||h0.contains(svg)||svg.contains(h0)))return}
      const panel=panelOf(hostEl);if(!panel)return;
      hostEl.dataset.gf='1';
      const head=(panel.querySelector('h2,h3,h4')||{}).textContent||'';
      attach(hostEl,{id:'auto'+(++AUTO_N),title:head.trim()||'Graph',clone:true,cloneEl:()=>hostEl.querySelector('svg')});
    });
  };
  let t=null;const sched=()=>{clearTimeout(t);t=setTimeout(()=>{scan();placeAll()},300)};
  new MutationObserver(sched).observe(rootEl,{childList:true,subtree:true});
  sched();return{scan};
}

/* ---------------- Vollbild ---------------- */
function open(id,o){
  o=o||{};
  const e=typeof id==='string'?REG.get(id):id;if(!e)return false;
  if(OPEN)close(true);
  ensureStyle();
  const cfg=e.cfg,host=resolveHost(e.host);
  const S={e,cfg,host,series:[],rangeId:null,x0:0,x1:1,full:[0,1],marker:null,tip:null,from:null,to:null,pointers:new Map(),closed:false,prevCtx:root.LB_PAGE_CONTEXT};
  S.clone=!!cfg.clone;
  const el=h('div'),sheet=el;el.id='gf';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');el.setAttribute('aria-label',(cfg.title||'Graph')+' Vollbild');
  el.innerHTML='<div class="gf-back"></div><div class="gf-sheet"><div class="gf-grab" id="gfGrab"><i></i></div>'+
   '<div class="gf-head" id="gfHead"><div><h2>'+esc(cfg.title||'Graph')+'</h2><div class="gf-sub" id="gfSub"></div></div><div class="gf-tools">'+
   (S.clone?'':'<button class="gf-tb" id="gfCal" type="button" aria-label="Datum suchen"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg><span class="t">Datum</span></button>')+
   '<button class="gf-tb x" id="gfX" type="button" aria-label="Schließen">✕</button></div></div>'+
   '<div class="gf-body" id="gfBody"><section class="gf-main"><div class="gf-bar" id="gfRanges"></div><div class="gf-bar" id="gfLayers"></div><div class="gf-bar" id="gfChips"></div><div class="gf-frame" id="gfFrame"><div class="gf-stage'+(S.clone?' clone':'')+'" id="gfStage"></div></div></section><aside class="gf-stats" id="gfStats"></aside></div></div>';
  doc.body.appendChild(el);S.el=el;OPEN=S;doc.documentElement.classList.add('gf-open');
  S.$=q=>el.querySelector(q);
  S.stage=S.$('#gfStage');S.frame=S.$('#gfFrame');
  // Kontext für Jarvis: nur gelesene, vom Board berechnete Werte
  root.LB_PAGE_CONTEXT=()=>{let p='';try{p=S.prevCtx?String(S.prevCtx()||''):''}catch(x){}return p+'\n'+graphContext(S)};
  if(S.clone){buildClone(S)}else{buildSeries(S,o)}
  // Schließen
  S.$('#gfX').onclick=()=>close();
  S.keyH=ev=>{if(ev.key==='Escape')close()};doc.addEventListener('keydown',S.keyH);
  bindSwipeClose(S);
  S.ro=root.ResizeObserver?new ResizeObserver(()=>{if(S.closed||!S.ready)return;clearTimeout(S.rt);S.rt=setTimeout(()=>{if(!S.clone)drawChart(S,false)},60)}):null;
  if(S.ro)S.ro.observe(S.stage);
  animateIn(S);
  return true;
}
function rangeLabel(S){const r=GS.RANGES.find(x=>x.id===S.rangeId);return (r?r.label:'')+' ('+dd(S.from)+(S.from.slice(0,4))+' bis '+dd(S.to)+S.to.slice(0,4)+')'}
function graphContext(S){
  if(S.clone)return 'GRAPH-VOLLBILD: '+(S.cfg.title||'Graph')+' (vergrößerte Ansicht ohne Statistik).';
  const st=S.stats;let t='GRAPH-VOLLBILD (vom Board berechnet, nicht neu rechnen): '+GS.describe(S.cfg.title||'Graph',S.cfg.unit,S.cfg.digits,st,(GS.RANGES.find(x=>x.id===S.rangeId)||{}).label||'');
  if(S.marker){const p=S.series.find(q=>q.date===S.marker.date);t+=' Markierter Tag: '+S.marker.date+(p?' Wert '+fmtNum(p.value,S.cfg.digits)+(S.cfg.unit?' '+S.cfg.unit.trim():''):' keine Daten')+'.'}
  return t;
}
function animateIn(S){
  const el=S.el,fast=still();
  if(fast){el.classList.add('gf-in');el.animate&&el.animate([{opacity:0},{opacity:1}],{duration:perf()?120:1,easing:'ease-out'});return}
  const back=el.querySelector('.gf-back'),sheet=el.querySelector('.gf-sheet');
  back.animate([{opacity:0},{opacity:1}],{duration:380,easing:'ease-out'});
  const src=S.host&&S.host.getBoundingClientRect(),dst=S.frame.getBoundingClientRect();
  sheet.animate([{opacity:0},{opacity:1}],{duration:200,easing:'ease-out',fill:'backwards'});
  if(src&&src.width>10&&dst.width>10){
    const dx=src.left-dst.left,dy=src.top-dst.top,sx=src.width/dst.width,sy=src.height/dst.height;
    S.frame.animate([{transformOrigin:'0 0',transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`,opacity:.55},{transformOrigin:'0 0',transform:'none',opacity:1}],{duration:420,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'});
  }
  requestAnimationFrame(()=>el.classList.add('gf-in'));
  S.el.querySelectorAll('.gf-in-t').forEach((t,i)=>t.style.setProperty('--d',(180+i*55)+'ms'));
}
function close(instant){
  const S=OPEN;if(!S||S.closed)return;S.closed=true;OPEN=null;
  doc.removeEventListener('keydown',S.keyH);if(S.ro)S.ro.disconnect();
  root.LB_PAGE_CONTEXT=S.prevCtx;if(!S.prevCtx)delete root.LB_PAGE_CONTEXT;
  const done=()=>{S.el.remove()};doc.documentElement.classList.remove('gf-open');
  if(instant||still()){
    if(!instant&&perf()&&S.el.animate){S.el.animate([{opacity:1},{opacity:0}],{duration:120}).onfinish=done}else done();return}
  const host=S.host&&doc.contains(S.host)?S.host:null,src=host&&host.getBoundingClientRect(),dst=S.frame.getBoundingClientRect();
  const back=S.el.querySelector('.gf-back'),sheet=S.el.querySelector('.gf-sheet');
  S.el.classList.remove('gf-in');
  back.animate([{opacity:1},{opacity:0}],{duration:340,easing:'ease-in',fill:'forwards'});
  sheet.animate([{opacity:1},{opacity:0}],{duration:200,delay:220,fill:'forwards'});
  if(src&&src.width>10&&dst.width>10&&src.bottom>0&&src.top<innerHeight){
    const dx=src.left-dst.left,dy=src.top-dst.top,sx=src.width/dst.width,sy=src.height/dst.height;
    const a=S.frame.animate([{transformOrigin:'0 0',transform:'none'},{transformOrigin:'0 0',transform:`translate(${dx}px,${dy}px) scale(${sx},${sy})`}],{duration:380,easing:'cubic-bezier(.5,0,.75,0)',fill:'forwards'});
    a.onfinish=done;
  }else{S.frame.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(40px)'}],{duration:260,fill:'forwards'}).onfinish=done}
  setTimeout(done,700);
}
/* Wischen nach unten am oberen Rand / Griff schließt (nie auf der Graphfläche) */
function bindSwipeClose(S){
  const zones=[S.$('#gfGrab'),S.$('#gfHead')];let id=null,y0=0,dy=0,t0=0;
  zones.forEach(z=>{
    z.addEventListener('pointerdown',ev=>{if(ev.target.closest('button'))return;id=ev.pointerId;y0=ev.clientY;dy=0;t0=performance.now();try{z.setPointerCapture&&z.setPointerCapture(id)}catch(x){}});
    z.addEventListener('pointermove',ev=>{if(ev.pointerId!==id)return;dy=Math.max(0,ev.clientY-y0);S.$('.gf-sheet').style.transform='translateY('+dy+'px)';S.$('.gf-back').style.opacity=String(Math.max(.2,1-dy/500))});
    const end=ev=>{if(ev.pointerId!==id)return;id=null;const v=dy/Math.max(1,performance.now()-t0);
      if(dy>90||v>.6&&dy>30){S.$('.gf-sheet').style.transform='';close()}else{const sh=S.$('.gf-sheet');sh.style.transition='transform .2s';sh.style.transform='';S.$('.gf-back').style.opacity='';setTimeout(()=>{sh.style.transition=''},220)}};
    z.addEventListener('pointerup',end);z.addEventListener('pointercancel',end);
  });
}

/* ---------------- clone-Modus ---------------- */
function buildClone(S){
  const src=S.cfg.cloneEl?S.cfg.cloneEl():null;
  S.$('#gfRanges').remove();S.$('#gfChips').remove();S.$('#gfLayers').remove();
  if(S.cfg.facts||S.cfg.note)renderFacts(S,S.$('#gfStats'),null);else S.$('#gfStats').remove();
  S.$('#gfSub').textContent=S.cfg.sub||'Vergrößerte Ansicht';
  if(!src){S.stage.innerHTML='<div class="gf-empty">Dieser Graph hat gerade keine Darstellung.</div>';S.ready=true;return}
  const c=src.cloneNode(true);c.removeAttribute('width');c.removeAttribute('height');c.style.width='100%';c.style.height='auto';c.removeAttribute('id');
  c.querySelectorAll('[id]').forEach(n=>{});
  S.stage.appendChild(c);S.ready=true;
}

/* ---------------- series-Modus ---------------- */
function buildSeries(S,o){
  const cfg=S.cfg;
  S.series=GS.clean(typeof cfg.series==='function'?cfg.series():cfg.series);
  S.byDate=new Map(S.series.map(p=>[p.date,p]));
  if(cfg.layers&&cfg.layers.length)buildLayers(S);else S.$('#gfLayers').remove();
  if(cfg.stack){const lg=S.$('#gfLayers')||h('div','gf-bar');lg.id='gfLayers';lg.innerHTML='<div class="gf-lg">'+cfg.stack.keys.map(k=>'<span><i style="background:'+k.color+'"></i>'+esc(k.name)+'</span>').join('')+'</div>';if(!lg.isConnected)S.$('#gfChips').before(lg)}
  const ranges=GS.availableRanges(S.series);S.ranges=ranges;
  if(!S.series.length){S.$('#gfSub').textContent='Keine Daten';S.$('#gfRanges').remove();S.$('#gfChips').remove();S.$('#gfStats').remove();S.stage.innerHTML='<div class="gf-empty">Für diesen Graphen gibt es noch keine Daten.</div>';S.ready=true;return}
  const wanted=o.range&&ranges.find(r=>r.id===String(o.range))?String(o.range):(cfg.range&&ranges.find(r=>r.id===String(cfg.range))?String(cfg.range):(ranges.find(r=>r.id==='30')||ranges[ranges.length-1]).id);
  const rb=S.$('#gfRanges');
  ranges.forEach(r=>{const b=h('button','gf-r',esc(r.label));b.type='button';b.dataset.r=r.id;b.setAttribute('aria-pressed','false');rb.appendChild(b)});
  rb.addEventListener('click',ev=>{const b=ev.target.closest('.gf-r');if(b)setRange(S,b.dataset.r,true)});
  const ch=S.$('#gfChips');
  ch.innerHTML='<button class="gf-r" data-a="today" type="button">Heute</button><button class="gf-r" data-a="best" type="button">Bestwert</button><button class="gf-r" data-a="worst" type="button">Tiefstwert</button><span class="sp"></span><button class="gf-r" data-a="reset" type="button">Zurücksetzen</button>';
  ch.addEventListener('click',ev=>{const b=ev.target.closest('[data-a]');if(!b)return;const a=b.dataset.a;
    if(a==='reset'){S.marker=null;S.tip=null;zoomTo(S,S.full[0],S.full[1],true);return}
    if(a==='today'){const t=GS.todayBerlin();if(S.byDate.has(t))pick(S,t);else{toast(S,'Heute keine Daten');const last=S.series[S.series.length-1];if(last)pick(S,last.date)}return}
    const st=S.stats;if(!st||st.empty)return;pick(S,a==='best'?st.best.date:st.worst.date)});
  const cal=S.$('#gfCal');if(cal)cal.onclick=()=>openCal(S);
  bindStage(S);
  setRange(S,wanted,false,true);
  S.ready=true;
  if(o.date)setTimeout(()=>pick(S,o.date,true),50);
}
/* Mehrere Kurven: Chips schalten Ebenen ein/aus, die erste aktive bestimmt Statistik und Achsen-Bestwerte */
function buildLayers(S){
  const cfg=S.cfg,main={id:'main',name:cfg.mainName||cfg.title,color:cfg.color||'var(--ac,#7cd4ff)',data:S.series};
  S.layers=[main].concat(cfg.layers.map(l=>({id:l.id,name:l.name,color:l.color,data:GS.clean(typeof l.series==='function'?l.series():l.series)})));
  S.layers.forEach(l=>{l.by=new Map(l.data.map(p=>[p.date,p]))});
  S.on=new Set(cfg.layersOn||['main']);
  const bar=S.$('#gfLayers');
  const paint=()=>{bar.innerHTML=S.layers.map(l=>'<button class="gf-r" type="button" data-l="'+l.id+'" aria-pressed="'+S.on.has(l.id)+'"><i class="sw" style="background:'+l.color+'"></i>'+esc(l.name)+'</button>').join('')+'<span class="sp"></span><button class="gf-r" type="button" data-l="*">Alle</button>'};
  paint();
  bar.addEventListener('click',ev=>{const b=ev.target.closest('[data-l]');if(!b)return;const id=b.dataset.l;
    if(id==='*'){S.layers.forEach(l=>S.on.add(l.id))}else if(S.on.has(id)){if(S.on.size>1)S.on.delete(id)}else S.on.add(id);
    paint();applyLayers(S);if(S.rangeId)setRange(S,S.rangeId,false)});
  applyLayers(S);
}
function applyLayers(S){
  const act=S.layers.filter(l=>S.on.has(l.id));S.primary=act[0];S.extraLayers=act.slice(1);
  S.series=S.primary.data;S.byDate=S.primary.by;S.$('#gfSub').dataset.layer=S.primary.name;
}
function setRange(S,id,animate,first){
  const b=GS.bounds(S.series,id);if(!b)return;
  S.rangeId=id;S.from=b.from;S.to=b.to;
  S.full=[GS.dayNum(b.from)-.5,GS.dayNum(b.to)+.5];S.x0=S.full[0];S.x1=S.full[1];
  S.$('#gfRanges').querySelectorAll('.gf-r').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.r===String(id))));
  S.$('#gfSub').textContent=rangeLabel(S);
  if(S.marker&&(S.marker.date<b.from||S.marker.date>b.to)){S.marker=null}
  S.tip=null;
  drawChart(S,!!animate||!!first&&!still());
  renderStats(S,!first||!still());
}
function zoomTo(S,x0,x1,animate){
  x0=Math.max(S.full[0],x0);x1=Math.min(S.full[1],x1);
  if(x1-x0<.5){return}
  if(!animate||still()){S.x0=x0;S.x1=x1;drawChart(S,false);return}
  const a0=S.x0,a1=S.x1,t0=performance.now(),D=280;
  const step=t=>{if(S.closed)return;const k=Math.min(1,(t-t0)/D),e=1-Math.pow(1-k,3);S.x0=a0+(x0-a0)*e;S.x1=a1+(x1-a1)*e;drawChart(S,false);if(k<1)requestAnimationFrame(step)};
  requestAnimationFrame(step);
}
function pick(S,date,instant){
  const n=GS.dayNum(date);
  // Datum außerhalb des Zeitraums: kleinsten passenden Zeitraum wählen
  if(date<S.from||date>S.to){
    const cand=S.ranges.find(r=>{const b=GS.bounds(S.series,r.id);return b&&date>=b.from&&date<=b.to});
    if(cand)setRange(S,cand.id,false)
  }
  const span=S.x1-S.x0;
  if(n<S.x0+span*.05||n>S.x1-span*.05){const c=Math.max(S.full[0]+span/2,Math.min(S.full[1]-span/2,n));zoomTo(S,c-span/2,c+span/2,!instant)}
  S.marker={date,t:performance.now()};
  setTimeout(()=>{if(S.closed)return;S.tip={date};drawChart(S,false)},instant||still()?0:300);
  drawChart(S,false);
}
function toast(S,t){const e=h('div','gf-toast',esc(t));S.frame.appendChild(e);setTimeout(()=>e.remove(),1800)}

/* Diagramm zeichnen (SVG, Zeitachse in Tageszahlen, Lücken bleiben Lücken) */
function drawChart(S,animate){
  const cfg=S.cfg,stage=S.stage;if(!stage.isConnected)return;
  const W=Math.max(260,stage.clientWidth),H=Math.max(200,stage.clientHeight);
  const m={l:46,r:16,t:16,b:30},iw=W-m.l-m.r,ih=H-m.t-m.b;
  S.geo={W,H,m,iw,ih};
  stage.querySelectorAll('svg').forEach(s=>s.remove());
  const svg=svgEl('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':(cfg.title||'Graph')+' im Vollbild'});
  const span=S.x1-S.x0,X=d=>m.l+(d-S.x0)/span*iw;
  // sichtbare Punkte (+ ein Nachbar je Seite für durchgehende Linien)
  const all=S.series;let a=0,b=all.length-1;
  const nums=all.map(p=>GS.dayNum(p.date));
  const vis=[];for(let i=0;i<all.length;i++){if(nums[i]>=S.x0-.5&&nums[i]<=S.x1+.5)vis.push(i)}
  const idx=vis.length?[Math.max(0,vis[0]-1)].concat(vis).concat([Math.min(all.length-1,vis[vis.length-1]+1)]).filter((v,i,ar)=>ar.indexOf(v)===i):[];
  const inView=idx.filter(i=>nums[i]>=S.x0-.5&&nums[i]<=S.x1+.5);
  let lo=Infinity,hi=-Infinity;inView.forEach(i=>{const v=all[i].value;if(v<lo)lo=v;if(v>hi)hi=v});
  (S.extraLayers||[]).forEach(l=>l.data.forEach(p=>{const n=GS.dayNum(p.date);if(n>=S.x0-.5&&n<=S.x1+.5){if(p.value<lo)lo=p.value;if(p.value>hi)hi=p.value}}));
  if(cfg.fixed){lo=cfg.fixed[0];hi=cfg.fixed[1]}
  if(!isFinite(lo)){lo=0;hi=1}
  if(cfg.kind==='bar')lo=Math.min(0,lo);
  else if(!cfg.fixed){const pad=(hi-lo)*.1||Math.abs(hi)*.1||1;lo-=pad;hi+=pad;if(lo<0&&(all.every(p=>p.value>=0))&&(S.extraLayers||[]).every(l=>l.data.every(p=>p.value>=0)))lo=0}
  const ticks=nice(lo,hi,4),y0=ticks[0],y1=ticks[ticks.length-1];
  const Y=v=>m.t+ih-(v-y0)/(y1-y0)*ih;
  S.Y=Y;S.X=X;S.y0=y0;
  const defs=svgEl('defs',{},svg);
  const pat=svgEl('pattern',{id:'gfHatch',width:6,height:6,patternUnits:'userSpaceOnUse',patternTransform:'rotate(45)'},defs);svgEl('line',{x1:0,y1:0,x2:0,y2:6,stroke:'rgba(255,255,255,.14)','stroke-width':2},pat);
  const gr=svgEl('linearGradient',{id:'gfArea',x1:0,y1:0,x2:0,y2:1},defs);
  svgEl('stop',{offset:0,'stop-color':'var(--ac,#7cd4ff)','stop-opacity':.35},gr);svgEl('stop',{offset:1,'stop-color':'var(--ac,#7cd4ff)','stop-opacity':0},gr);
  const tstep=ticks.length>1?ticks[1]-ticks[0]:1,td=Math.max(cfg.digits||0,tstep<1?Math.ceil(-Math.log10(tstep)-1e-9):0);   // Achse nie 2, 2, 2 bei kleinen Schritten
  ticks.forEach(t=>{svgEl('line',{x1:m.l,x2:W-m.r,y1:Y(t),y2:Y(t),stroke:t===y0?'rgba(190,225,255,.45)':'rgba(190,225,255,.12)','stroke-width':1},svg);
    const tx=svgEl('text',{x:m.l-7,y:Y(t)+4,'text-anchor':'end'},svg);tx.textContent=fmtNum(t,td)});
  // Zeitachsen-Beschriftung
  const nl=Math.max(2,Math.min(6,Math.floor(iw/90)));
  for(let k=0;k<nl;k++){const d=S.x0+.5+(span-1)*k/(nl-1);const key=GS.fromNum(Math.round(d));
    const tx=svgEl('text',{x:X(Math.round(d)),y:H-8,'text-anchor':k===0?'start':k===nl-1?'end':'middle'},svg);
    tx.textContent=span<=14?WDL[new Date(Math.round(d)*864e5).getUTCDay()]+' '+dd(key):span>400?key.slice(5,7)+'/'+key.slice(2,4):dd(key)}
  // Lücken markieren (nur bei überschaubarem Zeitraum)
  const gapMax=cfg.gap||1;
  if(span<=160){for(let k=1;k<idx.length;k++){const i=idx[k-1],j=idx[k];const g=nums[j]-nums[i];if(g>1&&g>gapMax){const xa=Math.max(m.l,X(nums[i]+.5)),xb=Math.min(W-m.r,X(nums[j]-.5));if(xb>xa)svgEl('rect',{x:xa,y:m.t,width:xb-xa,height:ih,fill:'url(#gfHatch)'},svg)}}}
  // Darstellung: höchstens ~1 Punkt pro Pixel
  let pts=inView.map(i=>all[i]);
  if(pts.length>iw*1.1)pts=GS.downsample(pts,Math.floor(iw));
  const base=Y(Math.max(y0,Math.min(0,y1)));
  if(cfg.kind==='bar'){
    const bw=Math.max(1,Math.min(cfg.gap>1?60:32,iw/span*.78*(cfg.gap||1)));   // Wochenwerte: Säule so breit wie die Woche
    const g=svgEl('g',{class:'gf-bars'+(animate&&!still()?' gf-grow':'')},svg);
    const pc=S.primary&&S.layers?S.primary.color:null;
    pts.forEach((p,k)=>{
      if(cfg.stack){const parts=cfg.stack.get(p.date)||{};let acc=0;cfg.stack.keys.forEach(key=>{const v=+parts[key.id]||0;if(v<=0)return;const ya=Y(acc),yb=Y(acc+v);const r=svgEl('rect',{x:X(GS.dayNum(p.date))-bw/2,y:yb,width:bw,height:Math.max(1,ya-yb),style:'fill:'+key.color},g);acc+=v;if(animate&&!still())r.style.animationDelay=Math.min(400,k*8)+'ms'});return}
      const yy=Y(p.value),r=svgEl('rect',{x:X(GS.dayNum(p.date))-bw/2,y:Math.min(yy,base),width:bw,height:Math.max(1,Math.abs(base-yy)),rx:Math.min(3,bw/2)},g);if(pc)r.style.fill=pc;if(animate&&!still())r.style.animationDelay=Math.min(400,k*8)+'ms'})
  }else{
    let d='',area=[],prev=null,seg=[];
    const segs=[];pts.forEach(p=>{const n=GS.dayNum(p.date);if(prev!=null&&n-prev>gapMax){segs.push(seg);seg=[]}seg.push(p);prev=n});if(seg.length)segs.push(seg);
    segs.forEach(sg=>{if(sg.length>1){let dd0='';sg.forEach((p,i)=>{dd0+=(i?'L':'M')+X(GS.dayNum(p.date)).toFixed(1)+','+Y(p.value).toFixed(1)});
      if(!S.layers)svgEl('path',{d:dd0+'L'+X(GS.dayNum(sg[sg.length-1].date)).toFixed(1)+','+base+'L'+X(GS.dayNum(sg[0].date)).toFixed(1)+','+base+'Z',fill:'url(#gfArea)',stroke:'none'},svg);
      const ln=svgEl('path',{d:dd0,class:'gf-ln'+(animate&&!still()?' gf-draw':''),pathLength:1},svg);if(S.layers)ln.setAttribute('style','stroke:'+S.primary.color+';filter:none')}});
    const dots=pts.length<=120||segs.some(sg=>sg.length===1);
    pts.forEach(p=>{const alone=segs.find(sg=>sg.length===1&&sg[0]===p);if(dots||alone)svgEl('circle',{cx:X(GS.dayNum(p.date)),cy:Y(p.value),r:alone?3.6:2.6,fill:S.layers?S.primary.color:'var(--ac,#7cd4ff)','fill-opacity':alone?1:.85},svg)})
  }
  // weitere Ebenen als Linien in ihrer Farbe
  (S.extraLayers||[]).forEach(l=>{let d='',prev=null;l.data.forEach(p=>{const n=GS.dayNum(p.date);if(n<S.x0-1.5||n>S.x1+1.5)return;d+=(prev!=null&&n-prev<=gapMax?'L':'M')+X(n).toFixed(1)+','+Y(p.value).toFixed(1);prev=n});
    if(d)svgEl('path',{d,fill:'none',stroke:l.color,'stroke-width':2.2,'stroke-linejoin':'round','stroke-linecap':'round'},svg)});
  // Markierung (bleibt stehen) + Info-Fenster
  S.tipEl&&S.tipEl.remove();S.tipEl=null;
  if(S.marker){
    const n=GS.dayNum(S.marker.date),px=X(n),p=S.byDate.get(S.marker.date);
    if(px>=m.l-1&&px<=W-m.r+1){
      svgEl('line',{x1:px,x2:px,y1:m.t,y2:m.t+ih,class:'gf-mark'},svg);
      if(p){const cy=Y(p.value);svgEl('circle',{cx:px,cy,r:11,fill:'var(--ac,#7cd4ff)','fill-opacity':.22},svg);svgEl('circle',{cx:px,cy,r:6,class:'gf-glow'},svg)}
      if(S.tip||S.marker.live)showTip(S,svg,px,p?Y(p.value):m.t+ih/2,S.marker.date,p)
    }
  }
  stage.appendChild(svg);S.svg=svg;
  if(S.tipPending){stage.appendChild(S.tipPending);S.tipEl=S.tipPending;S.tipPending=null}
}
function showTip(S,svg,px,py,date,p){
  const cfg=S.cfg,t=h('div','gf-tip');
  t.innerHTML='<div class="d">'+esc(longDate(date))+'</div>'+(p?'<b>'+fmtNum(p.value,cfg.digits)+(cfg.unit?'<small style="font-size:13px;opacity:.8"> '+esc(cfg.unit.trim())+'</small>':'')+'</b>':'<b style="font-size:16px">keine Daten</b>')+
    (p&&cfg.extra?cfg.extra(date,p).map(x=>'<div class="x">'+esc(x)+'</div>').join(''):'')+
    (S.layers?S.layers.filter(l=>S.on.has(l.id)).map(l=>{const q=l.by.get(date);return '<div class="x"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:'+l.color+';margin-right:5px"></i>'+esc(l.name)+': '+(q?fmtNum(q.value,cfg.digits):'–')+'</div>'}).join(''):'')+
    (cfg.stack&&p?(()=>{const parts=cfg.stack.get(date)||{};return cfg.stack.keys.filter(k=>+parts[k.id]>0).map(k=>'<div class="x"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:'+k.color+';margin-right:5px"></i>'+esc(k.name)+': '+fmtNum(+parts[k.id],cfg.digits)+'</div>').join('')})():'');
  S.tipPending=t;S.stage.appendChild(t);
  const w=t.offsetWidth,hh=t.offsetHeight,W=S.geo.W;
  let left=px+14;if(left+w>W-6)left=px-w-14;left=Math.max(6,left);
  let top=py-hh-12;if(top<4)top=py+16;top=Math.min(top,S.geo.H-hh-4);
  t.style.left=left+'px';t.style.top=top+'px';S.tipEl=t;S.tipPending=null;
}
/* Eingabe: Tippen, Wischen (Markierung), Zwei-Finger-Zoom, Verschieben */
function bindStage(S){
  const st=S.stage;const P=S.pointers;let pinch=null,pan=null,downAt=null;
  const dayAt=x=>{const rc=st.getBoundingClientRect(),px=(x-rc.left)*(S.geo.W/rc.width);return S.x0+(px-S.geo.m.l)/S.geo.iw*(S.x1-S.x0)};
  const nearest=day=>{let best=null,bd=1e9;S.series.forEach(p=>{const d=Math.abs(GS.dayNum(p.date)-day);if(d<bd){bd=d;best=p}});return{p:best,d:bd}};
  const zoomed=()=>(S.x1-S.x0)<(S.full[1]-S.full[0])-.01;
  st.addEventListener('pointerdown',ev=>{
    try{st.setPointerCapture&&st.setPointerCapture(ev.pointerId)}catch(x){}
    P.set(ev.pointerId,{x:ev.clientX,y:ev.clientY,lx:ev.clientX});
    if(P.size===1){downAt={t:performance.now(),x:ev.clientX,y:ev.clientY,moved:false}}
    if(P.size===2){const [a,b]=[...P.values()];pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,x0:S.x0,x1:S.x1,mid:dayAt((a.x+b.x)/2),midPx:(a.x+b.x)/2};if(downAt)downAt.moved=true}
  });
  st.addEventListener('pointermove',ev=>{
    const p=P.get(ev.pointerId);if(!p)return;p.x=ev.clientX;p.y=ev.clientY;
    if(P.size>=2&&pinch){
      const [a,b]=[...P.values()],d=Math.hypot(a.x-b.x,a.y-b.y)||1,full=S.full[1]-S.full[0];
      let span=(pinch.x1-pinch.x0)*pinch.d/d;span=Math.max(Math.min(3,full),Math.min(full,span));
      const rc=st.getBoundingClientRect(),frac=((a.x+b.x)/2-rc.left)/rc.width,fx=(S.geo.m.l+0)/S.geo.W;
      const f=Math.max(0,Math.min(1,(frac*S.geo.W-S.geo.m.l)/S.geo.iw));
      let x0=pinch.mid-f*span,x1=x0+span;
      if(x0<S.full[0]){x1+=S.full[0]-x0;x0=S.full[0]}if(x1>S.full[1]){x0-=x1-S.full[1];x1=S.full[1]}
      S.x0=Math.max(S.full[0],x0);S.x1=Math.min(S.full[1],x1);drawChart(S,false);return}
    if(P.size===1&&downAt){
      if(!downAt.moved&&Math.hypot(ev.clientX-downAt.x,ev.clientY-downAt.y)>8)downAt.moved=true;
      if(!downAt.moved)return;
      if(zoomed()){const rc=st.getBoundingClientRect(),dx=(ev.clientX-p.lx)*(S.geo.W/rc.width),span=S.x1-S.x0,dn=-dx/S.geo.iw*span;
        let x0=S.x0+dn,x1=S.x1+dn;if(x0<S.full[0]){x1+=S.full[0]-x0;x0=S.full[0]}if(x1>S.full[1]){x0-=x1-S.full[1];x1=S.full[1]}
        S.x0=x0;S.x1=x1;p.lx=ev.clientX;drawChart(S,false)}
      else{ // Markierungslinie folgt dem Finger, zeigt live Wert und Datum
        const {p:np}=nearest(dayAt(ev.clientX));if(np){S.marker={date:np.date,live:true};S.tip=true;drawChart(S,false)}}
    }
  });
  const up=ev=>{
    const p=P.get(ev.pointerId);if(!p)return;P.delete(ev.pointerId);
    if(P.size<2)pinch=null;
    if(downAt&&P.size===0){
      const tap=!downAt.moved&&performance.now()-downAt.t<500;
      if(tap&&ev.type==='pointerup'){doTap(ev.clientX)}
      else if(downAt.moved&&S.marker&&S.marker.live){S.marker.live=false;S.tip=true;drawChart(S,false)}   // Markierung bleibt stehen
      downAt=null;
    }
  };
  st.addEventListener('pointerup',up);st.addEventListener('pointercancel',up);
  st.addEventListener('wheel',ev=>{if(!ev.ctrlKey&&!ev.metaKey)return;ev.preventDefault();const full=S.full[1]-S.full[0],c=dayAt(ev.clientX),span=Math.max(Math.min(3,full),Math.min(full,(S.x1-S.x0)*(ev.deltaY>0?1.15:.87))),f=(c-S.x0)/(S.x1-S.x0);let x0=c-f*span,x1=x0+span;if(x0<S.full[0]){x1+=S.full[0]-x0;x0=S.full[0]}if(x1>S.full[1]){x0-=x1-S.full[1];x1=S.full[1]}S.x0=Math.max(S.full[0],x0);S.x1=x1;drawChart(S,false)},{passive:false});
  function doTap(x){
    const day=dayAt(x),{p:np,d}=nearest(day),rc=st.getBoundingClientRect(),pxPerDay=S.geo.iw/(S.x1-S.x0)*(rc.width/S.geo.W);
    const r=Math.round(day),has=k=>S.byDate.has(GS.fromNum(k));
    const inGap=!(S.cfg.gap>1)&&!has(r)&&(!has(r-1)||!has(r+1))&&day>=S.full[0]&&day<=S.full[1]&&r>GS.dayNum(S.series[0].date)&&r<GS.dayNum(S.series[S.series.length-1].date);
    const hit=!inGap&&np&&d*pxPerDay<=Math.max(22,pxPerDay*.6)?np:null;
    if(hit){
      if(S.marker&&S.marker.date===hit.date&&S.tip){S.marker=null;S.tip=null}else{S.marker={date:hit.date};S.tip=true}
    }else if(S.tip){S.marker=null;S.tip=null}                            // Tippen daneben schließt das Fenster
    else{                                                                  // Lücke: "keine Daten"
      const dk=GS.fromNum(Math.round(day));if(day>=S.full[0]&&day<=S.full[1]){S.marker={date:dk};S.tip=true}
    }
    drawChart(S,false);
  }
}
/* Statistik-Kacheln */
function renderStats(S,animate){
  const cfg=S.cfg,box=S.$('#gfStats');if(!box)return;
  const st=GS.compute(S.series,S.from,S.to,{dir:cfg.dir,sum:cfg.sum,goodMin:cfg.good&&cfg.good.min,goodMax:cfg.good&&cfg.good.max});
  S.stats=st;box.innerHTML='';
  const u=cfg.unit?'<small>'+esc(cfg.unit.trim())+'</small>':'';
  const tiles=[];
  const T=(cls,l,v,s,num)=>{const t=h('div','gf-t gf-in-t '+(cls||''),'<div class="l">'+esc(l)+'</div><div class="v">'+v+'</div>'+(s?'<div class="s">'+s+'</div>':''));box.appendChild(t);tiles.push(t);return t};
  const count=(t,val,d,suffix)=>{const v=t.querySelector('.v');if(!animate||still()||!isFinite(val))return;const t0=performance.now(),D=700;const step=now=>{if(S.closed||!v.isConnected)return;const k=Math.min(1,(now-t0)/D),e=1-Math.pow(1-k,3);v.firstChild.textContent=fmtNum(val*e,d);if(k<1)requestAnimationFrame(step);else v.firstChild.textContent=fmtNum(val,d)};requestAnimationFrame(step)};
  if(st.empty){const t=T('wide','Zeitraum','–','In diesem Zeitraum gibt es keine Daten.');return}
  const dg=cfg.digits,neu=st.neutralExtremes;
  const node=(val,d)=>'<span>'+fmtNum(val,d)+'</span>'+u;
  if(S.layers&&S.layers.length>1){T('wide','Statistik für',esc(S.primary.name),S.extraLayers.length?'Die erste eingeschaltete Kurve bestimmt die Kacheln. Vergleich: '+S.extraLayers.map(l=>{const v=l.data.filter(p=>p.date>=S.from&&p.date<=S.to).map(p=>p.value);return esc(l.name)+' Ø '+(v.length?fmtNum(v.reduce((a,b)=>a+b,0)/v.length,dg):'–')}).join(' · '):'Tippe oben weitere Kurven an, um sie zu vergleichen.').querySelector('.v').classList.add('txt')}
  let t=T('','Durchschnitt',node(st.mean,dg));count(t,st.mean,dg);
  t=T('','Median',node(st.median,dg));count(t,st.median,dg);
  t=T('good',neu?'Höchstwert':'Bestwert',node(st.best.value,dg),esc(longDate(st.best.date)));count(t,st.best.value,dg);
  t=T('bad',neu?'Tiefstwert':'Tiefstwert',node(st.worst.value,dg),esc(longDate(st.worst.date)));count(t,st.worst.value,dg);
  if(neu){tiles[2].classList.remove('good');tiles[3].classList.remove('bad')}
  if(st.trend){const tr=st.trend,arrow=tr.dir>0?'▲':tr.dir<0?'▼':'●';
    const cls=tr.good===true?'good':tr.good===false?'bad':'';
    T(cls,'Trend',arrow+' '+(tr.diff>0?'+':'')+fmtNum(tr.diff,Math.max(dg,tr.diff!==0&&Math.abs(tr.diff)<1?1:dg))+u,(tr.pct!=null?(tr.pct>0?'+':'')+fmtNum(tr.pct,0)+' % ':'')+'gegen den Zeitraum davor (Ø '+fmtNum(st.prev.mean,dg)+')')}
  else T('','Trend','–','Kein vorheriger Zeitraum mit Daten.');
  T('','Datenpunkte','<span>'+st.n+'</span><small>von '+st.days+' Tagen</small>',Math.round(st.coverage*100)+' % der Tage haben einen Wert');
  if(cfg.sum&&st.sum!=null){t=T('','Summe',node(st.sum,dg));count(t,st.sum,dg)}
  if(cfg.good&&st.goodDays!=null)T('',cfg.good.label||'Gute Tage','<span>'+st.goodDays+'</span><small>von '+st.n+'</small>','Längste Serie '+st.streakBest+(st.streakBest===1?' Tag':' Tage')+(st.streakNow?' · aktuell '+st.streakNow:''));
  // Wochentage
  const dow=st.dow||[],vals=dow.map(d=>d.mean).filter(v=>v!=null);
  if(vals.length>=2){const mx=Math.max.apply(null,vals),mn=Math.min.apply(null,vals.concat([0]));
    const bars=dow.map(d=>{const hgt=d.mean==null?0:Math.max(4,(d.mean-Math.min(0,mn))/((mx-Math.min(0,mn))||1)*100);return '<div class="'+(st.dowBest&&d.i===st.dowBest.i?'b':'')+'"><i style="height:'+hgt+'%" title="'+esc(d.name+': '+(d.mean==null?'keine Daten':fmtNum(d.mean,dg)))+'"></i><span>'+d.short+'</span></div>'}).join('');
    T('wide','Wochentage (Durchschnitt)','<div class="gf-dow">'+bars+'</div>',st.dowBest?'Bester Wochentag: '+st.dowBest.name+' ('+fmtNum(st.dowBest.mean,dg)+'), schlechtester: '+st.dowWorst.name+' ('+fmtNum(st.dowWorst.mean,dg)+')':'Für beste und schlechteste Wochentage braucht es mindestens 14 Werte.')
    tiles[tiles.length-1].querySelector('.v').style.fontSize='14px'}
  if(cfg.stack){const parts={},tot={v:0};S.series.forEach(p=>{if(p.date<S.from||p.date>S.to)return;const q=cfg.stack.get(p.date)||{};cfg.stack.keys.forEach(k=>{const v=+q[k.id]||0;parts[k.id]=(parts[k.id]||0)+v;tot.v+=v})});
    if(tot.v>0){const ks=cfg.stack.keys.filter(k=>parts[k.id]>0).sort((a,b)=>parts[b.id]-parts[a.id]);
      T('wide','Verteilung im Zeitraum','<div class="gf-dist">'+ks.map(k=>'<i style="width:'+(parts[k.id]/tot.v*100)+'%;background:'+k.color+'"></i>').join('')+'</div>','<div class="gf-rows">'+ks.map(k=>'<div><span><i style="display:inline-block;width:10px;height:10px;border-radius:2px;background:'+k.color+';margin-right:6px"></i>'+esc(k.name)+'</span><b>'+fmtNum(parts[k.id],dg)+(cfg.unit?' '+esc(cfg.unit.trim()):'')+' · '+fmtNum(parts[k.id]/tot.v*100,0)+' %</b></div>').join('')+'</div>')}}
  renderFacts(S,box,{from:S.from,to:S.to,stats:st,points:S.series.filter(p=>p.date>=S.from&&p.date<=S.to)},T);
  if(S.el.classList.contains('gf-in')||S.el.dataset.in==='1')tiles.forEach((t,i)=>{t.style.setProperty('--d',(i*45)+'ms');t.style.animation='gfUp .4s cubic-bezier(.22,1,.36,1) backwards';t.style.animationDelay=(i*45)+'ms'});
}
/* Zusätzliche Fakten-Kacheln und Erklärtext (series- und clone-Modus) */
function renderFacts(S,box,ctx,T){
  const cfg=S.cfg;if(!box)return;
  T=T||((cls,l,v,s)=>{const t=h('div','gf-t gf-in-t '+(cls||''),'<div class="l">'+esc(l)+'</div><div class="v">'+v+'</div>'+(s?'<div class="s">'+s+'</div>':''));box.appendChild(t);return t});
  let list=[];try{list=cfg.facts?cfg.facts(ctx||{})||[]:[]}catch(e){list=[{l:'Fakten',v:'–',s:esc(e.message),wide:true}]}
  list.forEach(f=>{const t=T((f.cls||'')+(f.wide?' wide':''),f.l,f.v==null?'–':String(f.v),f.s||'');if(f.small)t.querySelector('.v').classList.add('txt')});
  if(cfg.note){const t=T('wide note','So wird das berechnet',esc(cfg.note).replace(/\n/g,'<br>'),'')}
}
/* Datumswähler: nur Tage mit Daten wählbar */
function openCal(S){
  if(S.$('.gf-cal'))return;
  const have=new Set(S.series.map(p=>p.date));
  const last=S.series[S.series.length-1].date,first=S.series[0].date;
  let ym=(S.marker?S.marker.date:last).slice(0,7);
  const wrap=h('div','gf-cal');S.frame.parentElement.appendChild(wrap);wrap.style.position='fixed';
  const draw=()=>{
    const [y,mo]=ym.split('-').map(Number);const firstDow=(new Date(Date.UTC(y,mo-1,1)).getUTCDay()+6)%7,dim=new Date(Date.UTC(y,mo,0)).getUTCDate();
    let g='<span>Mo</span><span>Di</span><span>Mi</span><span>Do</span><span>Fr</span><span>Sa</span><span>So</span>'+'<span></span>'.repeat(firstDow);
    for(let d=1;d<=dim;d++){const k=y+'-'+String(mo).padStart(2,'0')+'-'+String(d).padStart(2,'0');g+='<button type="button" data-d="'+k+'"'+(have.has(k)?'':' disabled')+(S.marker&&S.marker.date===k?' class="sel"':'')+'>'+d+'</button>'}
    wrap.innerHTML='<div class="gf-calp"><div class="gf-calh"><button class="gf-tb" data-m="-1" type="button" aria-label="Vormonat" '+(ym<=first.slice(0,7)?'disabled':'')+'>‹</button><b>'+MON[mo-1]+' '+y+'</b><button class="gf-tb" data-m="1" type="button" aria-label="Folgemonat" '+(ym>=last.slice(0,7)?'disabled':'')+'>›</button><button class="gf-tb" data-c="1" type="button" aria-label="Schließen">✕</button></div><div class="gf-calg">'+g+'</div></div>';
  };
  draw();
  wrap.addEventListener('click',ev=>{
    const b=ev.target.closest('button');
    if(!b){if(ev.target===wrap)wrap.remove();return}
    if(b.dataset.c||false){wrap.remove();return}
    if(b.dataset.m){const [y,mo]=ym.split('-').map(Number),n=new Date(Date.UTC(y,mo-1+ +b.dataset.m,1));ym=n.getUTCFullYear()+'-'+String(n.getUTCMonth()+1).padStart(2,'0');draw();return}
    if(b.dataset.d&&!b.disabled){wrap.remove();pick(S,b.dataset.d)}
  });
}

/* ---------------- Öffentliche Schnittstelle (auch für Jarvis: reine Anzeige-Aktionen) ---------------- */
function findByName(name){
  const n=norm(name);if(!n)return null;
  let best=null,bs=0;
  REG.forEach(e=>{const t=norm(e.cfg.title);const al=(e.cfg.alias||[]).map(norm).concat([norm(e.cfg.id)]);let s=0;
    if(t===n||al.includes(n))s=100;else if(t.includes(n)||n.includes(t))s=60;else s=n.split(' ').filter(w=>w.length>2&&(t.includes(w)||al.some(a=>a.includes(w)))).length*10;
    if(s>bs){bs=s;best=e}});
  return bs>0?best:null;
}
function catalogFind(name){
  const n=norm(name);let best=null,bs=0;
  CATALOG.forEach(c=>{const al=c.alias.map(norm).concat([norm(c.title)]);let s=0;
    if(al.includes(n))s=100;else s=al.some(a=>a&&(n.includes(a)||a.includes(n)))?60:n.split(' ').filter(w=>w.length>2&&al.some(a=>a.includes(w))).length*10;
    if(s>bs){bs=s;best=c}});
  return bs>0?best:null;
}
const PEND='lb_gf_pending';
function openByName(name,o){
  const e=findByName(name);
  if(e){open(e.cfg.id,o);return{ok:true,title:e.cfg.title}}
  const c=catalogFind(name);
  if(c){
    const here=(location.pathname.split('/').pop()||'index.html');
    if(here!==c.page){try{sessionStorage.setItem(PEND,JSON.stringify({id:c.id,o:o||{},t:Date.now()}))}catch(x){};location.href=c.page;return{ok:true,title:c.title,navigating:true}}
    return{ok:false,err:'Dieser Graph ist noch nicht geladen.'};
  }
  return{ok:false,err:'Einen Graphen „'+name+'“ kenne ich nicht.'};
}
function runPending(){
  let p=null;try{p=JSON.parse(sessionStorage.getItem(PEND)||'null')}catch(x){}
  if(!p||Date.now()-p.t>30000){try{sessionStorage.removeItem(PEND)}catch(x){}return}
  let n=0;const iv=setInterval(()=>{n++;const e=REG.get(p.id);
    if(e&&e.cfg.series&&(typeof e.cfg.series!=='function'||GS.clean(e.cfg.series()).length)){clearInterval(iv);try{sessionStorage.removeItem(PEND)}catch(x){}open(p.id,p.o);return}
    if(n>60){clearInterval(iv);try{sessionStorage.removeItem(PEND)}catch(x){}}},500);
}
const api={attach,auto,open,close:()=>close(),openByName,list:()=>[...REG.values()].map(e=>({id:e.cfg.id,title:e.cfg.title,clone:!!e.cfg.clone})),CATALOG,refresh:placeAll,
  setRange(id){const S=OPEN;if(!S||S.clone)return{ok:false,err:'Es ist kein Graph offen.'};if(!S.ranges.find(r=>r.id===String(id)))return{ok:false,err:'Diesen Zeitraum gibt es für die Daten nicht.'};setRange(S,String(id),true);return{ok:true}},
  gotoDate(date){const S=OPEN;if(!S||S.clone)return{ok:false,err:'Es ist kein Graph offen.'};if(!/^\d{4}-\d\d-\d\d$/.test(date))return{ok:false,err:'Das Datum verstehe ich nicht.'};
    if(!S.byDate.has(date)){toast(S,'Am '+dd(date)+' keine Daten');S.marker={date};S.tip=true;pick(S,date);return{ok:true,none:true}}
    pick(S,date);return{ok:true}},
  get isOpen(){return !!OPEN},get current(){return OPEN?{id:OPEN.cfg.id,title:OPEN.cfg.title,range:OPEN.rangeId,marker:OPEN.marker&&OPEN.marker.date}:null},state:()=>OPEN};
root.GraphFull=api;
if(doc.readyState==='loading')doc.addEventListener('DOMContentLoaded',()=>setTimeout(runPending,400));else setTimeout(runPending,400);
})(typeof window!=='undefined'?window:globalThis);
