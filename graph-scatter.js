/* Graph-Vollbild: Streudiagramm (eigener Modus für graph-full.js). Nur lesen, verändert keine Daten.
   GraphFull.attach('#c-scatter',{id:'scatter',mode:'scatter',title,
     points:()=>[{date:'YYYY-MM-DD',x,y}],         // gesamter Verlauf, date = Tag des y-Werts (bestimmt den Zeitraum)
     x:{label,unit,digits,fixed:[min,max]}, y:{label,unit,digits,fixed:[min,max]},
     zones:[{min,max,name,color}],                  // Färbung nach y (z. B. Recovery-Zonen)
     buckets:[[von,bis,'Name']],                    // Ø y je x-Bereich
     info:(date,p)=>['Zeile',…], facts:ctx=>[…], note:'…', range:'90'})
   Zeitraum-Wahl, Trendlinie, Zonen, Ø je Bereich, Vergleich mit dem Zeitraum davor, Antippen/Wischen zeigt den Tag. */
(function(root){
'use strict';
if(!root.GraphFull||!root.GraphFull.registerMode)return;
const GS=root.GraphStats,doc=document;
const CSS=`
#gf .gfs-ax{fill:rgba(220,236,255,.62);font:12px system-ui,sans-serif}
#gf .gfs-lab{fill:rgba(220,236,255,.8);font:600 12px system-ui,sans-serif;letter-spacing:.04em}
#gf .gfs-dot{stroke:rgba(4,10,20,.85);stroke-width:1.2;transform-box:fill-box;transform-origin:50% 50%}
#gf .gfs-pop .gfs-dot{animation:gfsPop .5s cubic-bezier(.22,1.4,.36,1) both}
@keyframes gfsPop{from{transform:scale(0);opacity:0}}
#gf .gfs-prev{fill:none;stroke:rgba(220,236,255,.45);stroke-width:1.3}
#gf .gfs-trend{fill:none;stroke:var(--ac,#7cd4ff);stroke-width:2.6;stroke-linecap:round;filter:drop-shadow(0 0 6px rgb(var(--acc,120 200 255)/.55))}
#gf .gfs-trend.p{stroke:rgba(220,236,255,.5);stroke-width:1.6;stroke-dasharray:6 5;filter:none}
#gf .gfs-bk{stroke:#fff;stroke-width:3;stroke-linecap:round;opacity:.9}
#gf .gfs-bkt{fill:#fff;font:700 12px system-ui,sans-serif;paint-order:stroke;stroke:rgba(4,10,20,.85);stroke-width:3px}
#gf .gfs-sel{fill:none;stroke:#fff;stroke-width:2.2}
#gf .gfs-tag{fill:var(--ac,#7cd4ff);font:700 11px system-ui,sans-serif;paint-order:stroke;stroke:rgba(4,10,20,.9);stroke-width:3px}
#gf .gfs-opts{display:flex;gap:8px;flex-wrap:wrap}
#gf.gfs .gf-main{min-height:0}
@media (orientation:landscape) and (min-width:700px){#gf.gfs .gf-frame{flex:1;min-height:0;display:flex;flex-direction:column}#gf.gfs .gf-stage{flex:1;height:auto;min-height:220px}}
#gf .gfs-lg{display:flex;gap:14px;flex-wrap:wrap;font-size:12.5px;opacity:.85;padding:0 4px}
#gf .gfs-lg i{display:inline-block;width:11px;height:11px;border-radius:50%;margin-right:5px;vertical-align:-1px}
#gf .gfs-bars{display:flex;flex-direction:column;gap:7px;margin-top:8px;font-size:13px}
#gf .gfs-bars>div{display:grid;grid-template-columns:72px 1fr auto;gap:8px;align-items:center}
#gf .gfs-bars u{display:block;height:10px;border-radius:5px;background:rgba(190,225,255,.1);overflow:hidden;text-decoration:none}
#gf .gfs-bars u i{display:block;height:100%;border-radius:5px}
#gf .gfs-bars b{font-variant-numeric:tabular-nums;white-space:nowrap}
#gf .gfs-bars small{opacity:.6;font-weight:400}
@media (prefers-reduced-motion:reduce){#gf .gfs-pop .gfs-dot{animation:none!important}}
html[data-perf] #gf .gfs-pop .gfs-dot{animation:none!important}
html[data-perf] #gf .gfs-trend{filter:none}
`;
let styled=false;
function style(){if(styled)return;styled=true;const s=doc.createElement('style');s.id='gfs-style';s.textContent=CSS;doc.head.appendChild(s)}

/* Reine Rechenfunktionen (auch für Tests) */
function fit(pts){
  const n=pts.length;if(n<2)return{n,r:null,slope:null,icpt:null,mx:n?pts[0].x:null,my:n?pts[0].y:null};
  let mx=0,my=0;pts.forEach(p=>{mx+=p.x;my+=p.y});mx/=n;my/=n;
  let sxy=0,sxx=0,syy=0;pts.forEach(p=>{sxy+=(p.x-mx)*(p.y-my);sxx+=(p.x-mx)**2;syy+=(p.y-my)**2});
  const slope=sxx?sxy/sxx:null;
  return{n,mx,my,r:sxx&&syy?sxy/Math.sqrt(sxx*syy):null,slope,icpt:slope==null?null:my-slope*mx};
}
const strength=r=>r==null?'–':Math.abs(r)<.2?'kaum':Math.abs(r)<.4?'schwach':Math.abs(r)<.6?'mittel':'stark';
function buckets(pts,defs){return(defs||[]).map(([a,b,l])=>{const q=pts.filter(p=>p.x>=a&&p.x<b);return{a,b,l,n:q.length,m:q.length?q.reduce((s,p)=>s+p.y,0)/q.length:null}})}
function window_(all,from,to){return all.filter(p=>p.date>=from&&p.date<=to)}

function build(S,o,K){
  style();S.el.classList.add('gfs');
  const cfg=S.cfg,X0=cfg.x||{},Y0=cfg.y||{},{h,esc,svgEl,fmtNum,nice,longDate,still}=K;
  const cal=S.$('#gfCal');if(cal)cal.remove();
  const all=(typeof cfg.points==='function'?cfg.points():cfg.points||[]).filter(p=>p&&typeof p.date==='string'&&isFinite(p.x)&&isFinite(p.y)).sort((a,b)=>a.date<b.date?-1:1);
  S.series=all.map(p=>({date:p.date,value:p.y}));S.byDate=new Map(all.map(p=>[p.date,p]));S.points=all;
  const ranges=GS.availableRanges(S.series).filter(r=>r.days==null||r.days>=30);
  S.ranges=ranges;
  if(all.length<3||!ranges.length){S.$('#gfSub').textContent='Zu wenig Daten';['#gfRanges','#gfChips','#gfLayers'].forEach(q=>{const e=S.$(q);if(e)e.remove()});
    S.stage.innerHTML='<div class="gf-empty">Für dieses Diagramm gibt es noch zu wenig Tage mit beiden Werten.</div>';
    const box=S.$('#gfStats');if(cfg.note)K.renderFacts(S,box,{points:[]});else box.remove();S.ready=true;return}
  const opt={trend:true,zones:!!(cfg.zones&&cfg.zones.length),bk:false,prev:false};
  S.sel=null;
  // Zeitraum
  const rb=S.$('#gfRanges');
  ranges.forEach(r=>{const b=h('button','gf-r',esc(r.label));b.type='button';b.dataset.r=r.id;b.setAttribute('aria-pressed','false');rb.appendChild(b)});
  rb.addEventListener('click',ev=>{const b=ev.target.closest('[data-r]');if(b)setRange(b.dataset.r,true)});
  // Ebenen
  const lb=S.$('#gfLayers');
  const L=[['trend','Trendlinie'],cfg.zones&&cfg.zones.length?['zones','Zonen']:null,cfg.buckets?['bk','Ø je Bereich']:null,['prev','Zeitraum davor']].filter(Boolean);
  const paintL=()=>{lb.innerHTML=L.map(([k,n])=>'<button class="gf-r" type="button" data-o="'+k+'" aria-pressed="'+opt[k]+'">'+esc(n)+'</button>').join('')};
  paintL();
  lb.addEventListener('click',ev=>{const b=ev.target.closest('[data-o]');if(!b)return;opt[b.dataset.o]=!opt[b.dataset.o];paintL();draw(false);renderStats(false)});
  const ch=S.$('#gfChips');if(ch)ch.remove();
  rb.appendChild(Object.assign(h('span','sp'),{}));lb.remove();rb.appendChild(lb);lb.className='gfs-opts';
  // Legende
  if(cfg.zones&&cfg.zones.length){const lg=h('div','gfs-lg',cfg.zones.map(z=>'<span><i style="background:'+z.color+'"></i>'+esc(z.name)+'</span>').join('')+'<span style="opacity:.75">blasser = länger her</span>');S.frame.after(lg)}

  function setRange(id,animate){
    const b=GS.bounds(S.series,id);if(!b)return;
    S.rangeId=id;S.from=b.from;S.to=b.to;S.days=b.days;
    S.win=window_(all,b.from,b.to);
    const pf=GS.addDays(b.from,-b.days),pt=GS.addDays(b.from,-1);S.prevWin=window_(all,pf,pt);S.prevFrom=pf;S.prevTo=pt;
    rb.querySelectorAll('[data-r]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.r===String(id))));
    const r=GS.RANGES.find(x=>x.id===id);
    S.$('#gfSub').textContent=(r?r.label:'')+' ('+K.dd(b.from)+b.from.slice(0,4)+' bis '+K.dd(b.to)+b.to.slice(0,4)+') · '+S.win.length+' Tage mit beiden Werten';
    if(S.sel&&!S.byDate.has(S.sel)||S.sel&&(S.sel<b.from||S.sel>b.to))S.sel=null;
    draw(!!animate);renderStats(true);
  }
  S.setRangeX=id=>{if(!ranges.find(r=>r.id===String(id)))return false;setRange(String(id),true);return true};
  S.gotoX=date=>{if(!S.byDate.has(date))return false;if(date<S.from||date>S.to){const c=ranges.find(r=>{const b=GS.bounds(S.series,r.id);return b&&date>=b.from&&date<=b.to});if(c)setRange(c.id,false)}S.sel=date;draw(false);return true};

  function axis(v0,v1,fixed){let lo=fixed?fixed[0]:v0,hi=fixed?Math.max(fixed[1],v1):v1;if(!fixed){const p=(hi-lo)*.08||1;lo-=p;hi+=p;if(v0>=0&&lo<0)lo=0;return nice(lo,hi,5)}
    const t=nice(lo,hi,5).filter(v=>v>=lo&&v<=hi);if(t[0]!==lo)t.unshift(lo);if(t[t.length-1]!==hi){if(hi-t[t.length-1]<(t[1]-t[0])*.4)t.pop();t.push(hi)}return t}   // feste Achse endet genau am Maximum (Strain 21)
  function draw(animate){
    const st=S.stage;if(!st.isConnected)return;
    const W=Math.max(260,st.clientWidth),H=Math.max(200,st.clientHeight),narrow=W<480;
    const m={l:narrow?40:52,r:narrow?12:20,t:16,b:narrow?40:46},iw=W-m.l-m.r,ih=H-m.t-m.b;
    st.querySelectorAll('svg,.gf-tip').forEach(e=>e.remove());
    const w=S.win,shown=opt.prev?w.concat(S.prevWin):w;
    const xs=shown.map(p=>p.x),ys=shown.map(p=>p.y);
    const xt=axis(Math.min(...xs),Math.max(...xs),X0.fixed),yt=axis(Math.min(...ys),Math.max(...ys),Y0.fixed);
    const xa=xt[0],xb=xt[xt.length-1],ya=yt[0],yb=yt[yt.length-1];
    const X=v=>m.l+(v-xa)/(xb-xa)*iw,Y=v=>m.t+ih-(v-ya)/(yb-ya)*ih;
    S.geo={W,H,m,iw,ih,X,Y};
    const svg=svgEl('svg',{viewBox:`0 0 ${W} ${H}`,role:'img','aria-label':(cfg.title||'Streudiagramm')+' im Vollbild'});
    // Zonen als zarte Bänder + Farbleiste an der Achse
    if(opt.zones)cfg.zones.forEach(z=>{const y1=Y(Math.min(yb,z.max)),y0=Y(Math.max(ya,z.min));if(y0<=y1)return;
      svgEl('rect',{x:m.l,y:y1,width:iw,height:y0-y1,style:'fill:'+z.color,'fill-opacity':.06},svg);
      svgEl('rect',{x:m.l-4,y:y1,width:3,height:y0-y1,rx:1.5,style:'fill:'+z.color,'fill-opacity':.9},svg)});
    yt.forEach(t=>{svgEl('line',{x1:m.l,x2:W-m.r,y1:Y(t),y2:Y(t),stroke:t===ya?'rgba(190,225,255,.4)':'rgba(190,225,255,.09)'},svg);
      const tx=svgEl('text',{x:m.l-9,y:Y(t)+4,'text-anchor':'end',class:'gfs-ax'},svg);tx.textContent=fmtNum(t,0)});
    xt.forEach(t=>{svgEl('line',{x1:X(t),x2:X(t),y1:m.t,y2:m.t+ih,stroke:'rgba(190,225,255,.06)'},svg);
      const tx=svgEl('text',{x:X(t),y:m.t+ih+18,'text-anchor':'middle',class:'gfs-ax'},svg);tx.textContent=fmtNum(t,0)});
    const xl=svgEl('text',{x:m.l+iw/2,y:H-6,'text-anchor':'middle',class:'gfs-lab'},svg);xl.textContent=(X0.label||'x')+(X0.unit?' ('+X0.unit+')':'');
    if(!narrow){const yl=svgEl('text',{x:-(m.t+ih/2),y:12,'text-anchor':'middle',class:'gfs-lab',transform:'rotate(-90)'},svg);yl.textContent=(Y0.label||'y')+(Y0.unit?' ('+Y0.unit+')':'');}
    // Ø je Bereich
    if(opt.bk&&cfg.buckets)buckets(w,cfg.buckets).forEach(b=>{if(b.m==null)return;const x1=X(Math.max(xa,b.a))+6,x2=X(Math.min(xb,b.b))-6;if(x2<=x1)return;
      svgEl('line',{x1,x2,y1:Y(b.m),y2:Y(b.m),class:'gfs-bk'},svg);const t=svgEl('text',{x:(x1+x2)/2,y:Y(b.m)-7,'text-anchor':'middle',class:'gfs-bkt'},svg);t.textContent='Ø '+fmtNum(b.m,Y0.digits||0)});
    // Zeitraum davor (Ringe)
    if(opt.prev)S.prevWin.forEach(p=>svgEl('circle',{cx:X(p.x),cy:Y(p.y),r:narrow?3.4:4,class:'gfs-prev'},svg));
    // Punkte: Farbe = Zone, Deckkraft = Alter
    const n=w.length,rad=n>200?(narrow?3:3.6):n>80?(narrow?3.8:4.6):(narrow?4.8:6);
    const g=svgEl('g',{class:animate&&!still()?'gfs-pop':''},svg);
    const zc=v=>{const z=(cfg.zones||[]).find(z=>v>=z.min&&v<=z.max);return z?z.color:'var(--ac,#7cd4ff)'};
    w.forEach((p,i)=>{const c=svgEl('circle',{cx:X(p.x),cy:Y(p.y),r:rad,class:'gfs-dot',style:'fill:'+zc(p.y),'fill-opacity':(.42+.53*(n>1?i/(n-1):1)).toFixed(2)},g);
      if(animate&&!still())c.style.animationDelay=Math.min(600,i*(600/Math.max(1,n)))+'ms'});
    // Trendlinien (sauber auf den Achsenbereich begrenzt)
    const tline=(f,cls)=>{if(f.slope==null)return;let x1=Math.min(...shown.map(p=>p.x)),x2=Math.max(...shown.map(p=>p.x));
      const yy=x=>f.icpt+f.slope*x;const clip=x=>{const v=yy(x);return v<ya?(ya-f.icpt)/f.slope:v>yb?(yb-f.icpt)/f.slope:x};x1=clip(x1);x2=clip(x2);
      svgEl('line',{x1:X(x1),y1:Y(yy(x1)),x2:X(x2),y2:Y(yy(x2)),class:'gfs-trend'+(cls?' '+cls:'')},svg)};
    if(opt.prev&&opt.trend&&S.prevWin.length>=5)tline(fit(S.prevWin),'p');
    if(opt.trend&&n>=5)tline(fit(w));
    // neuester Tag beschriftet
    if(n){const p=w[n-1];svgEl('circle',{cx:X(p.x),cy:Y(p.y),r:rad+4,class:'gfs-sel',style:'stroke:var(--ac,#7cd4ff);stroke-width:1.6'},svg);
      const t=svgEl('text',{x:X(p.x)+rad+7,y:Y(p.y)+4,class:'gfs-tag'},svg);t.textContent='neuester';if(X(p.x)>W-90){t.setAttribute('x',X(p.x)-rad-7);t.setAttribute('text-anchor','end')}}
    // Auswahl
    const sp=S.sel&&S.byDate.get(S.sel);
    if(sp){svgEl('line',{x1:X(sp.x),x2:X(sp.x),y1:m.t,y2:m.t+ih,class:'gf-mark'},svg);svgEl('line',{x1:m.l,x2:W-m.r,y1:Y(sp.y),y2:Y(sp.y),class:'gf-mark'},svg);
      svgEl('circle',{cx:X(sp.x),cy:Y(sp.y),r:rad+7,fill:'var(--ac,#7cd4ff)','fill-opacity':.22},svg);svgEl('circle',{cx:X(sp.x),cy:Y(sp.y),r:rad+2,class:'gfs-sel',style:'fill:'+zc(sp.y)},svg)}
    st.appendChild(svg);S.svg=svg;
    if(sp)tip(sp);
  }
  function tip(p){
    const t=h('div','gf-tip'),{X,Y,W,H}=S.geo;
    const info=cfg.info?cfg.info(p.date,p)||[]:[];
    t.innerHTML='<div class="d">'+esc(longDate(p.date))+'</div><b>'+fmtNum(p.y,Y0.digits||0)+'<small style="font-size:13px;opacity:.8"> '+esc(Y0.unit||'')+' '+esc(Y0.short||'')+'</small></b>'+
      '<div class="x">'+esc(X0.label||'x')+': <b style="display:inline;font-size:13px;color:#fff">'+fmtNum(p.x,X0.digits==null?1:X0.digits)+'</b></div>'+info.map(x=>'<div class="x">'+esc(x)+'</div>').join('');
    S.stage.appendChild(t);
    const w=t.offsetWidth,hh=t.offsetHeight,px=X(p.x),py=Y(p.y);
    let left=px+16;if(left+w>W-6)left=px-w-16;left=Math.max(6,left);
    let top=py-hh-14;if(top<4)top=py+18;top=Math.max(4,Math.min(top,H-hh-4));
    t.style.left=left+'px';t.style.top=top+'px';
  }
  // Antippen / Wischen: nächster Punkt
  (function bind(){
    const st=S.stage;let down=null;
    const near=(cx,cy)=>{const rc=st.getBoundingClientRect(),k=S.geo.W/(rc.width||S.geo.W),px=(cx-rc.left)*k,py=(cy-rc.top)*k;let best=null,bd=1e9;
      S.win.forEach(p=>{const d=(S.geo.X(p.x)-px)**2+(S.geo.Y(p.y)-py)**2;if(d<bd){bd=d;best=p}});return bd<=44*44?best:null};
    st.addEventListener('pointerdown',ev=>{try{st.setPointerCapture&&st.setPointerCapture(ev.pointerId)}catch(x){}down={x:ev.clientX,y:ev.clientY,moved:false,id:ev.pointerId}});
    st.addEventListener('pointermove',ev=>{if(!down||ev.pointerId!==down.id)return;if(!down.moved&&Math.hypot(ev.clientX-down.x,ev.clientY-down.y)>8)down.moved=true;if(!down.moved)return;
      const p=near(ev.clientX,ev.clientY);if(p&&p.date!==S.sel){S.sel=p.date;draw(false)}});
    const up=ev=>{if(!down||ev.pointerId!==down.id)return;const d=down;down=null;if(d.moved||ev.type!=='pointerup')return;
      const p=near(ev.clientX,ev.clientY);S.sel=p&&p.date!==S.sel?p.date:null;draw(false)};
    st.addEventListener('pointerup',up);st.addEventListener('pointercancel',up);
  })();
  function renderStats(animate){
    const box=S.$('#gfStats');if(!box)return;box.innerHTML='';
    const T=(cls,l,v,s)=>{const t=h('div','gf-t gf-in-t '+(cls||''),'<div class="l">'+esc(l)+'</div><div class="v">'+v+'</div>'+(s?'<div class="s">'+s+'</div>':''));box.appendChild(t);return t};
    const w=S.win,f=fit(w),pf=fit(S.prevWin),dy=Y0.digits||0,yu=Y0.unit?' '+esc(Y0.unit):'';
    if(w.length<5){T('wide','Zeitraum',String(w.length)+' Tage','Für eine Auswertung braucht es mindestens 5 Tage mit beiden Werten. Wähle oben einen längeren Zeitraum.')}
    else{
      T('','Zusammenhang',esc(strength(f.r)),'r = '+fmtNum(f.r,2)+' über '+f.n+' Tage'+(pf.r!=null&&S.prevWin.length>=5?' · davor '+fmtNum(pf.r,2):'')).querySelector('.v').classList.add('txt');
      T(f.slope<0?'bad':f.slope>0?'good':'','Pro +1 '+(X0.short||'x'),(f.slope>=0?'+':'−')+fmtNum(Math.abs(f.slope),1)+yu,esc((Y0.label||'')+' laut Trendlinie'));
      T('','Ø '+(Y0.short||'y'),fmtNum(f.my,dy)+yu,S.prevWin.length?'davor '+fmtNum(fit(S.prevWin).my,dy)+yu:'kein Zeitraum davor');
      T('','Ø '+(X0.short||'x'),fmtNum(f.mx,1),S.prevWin.length?'davor '+fmtNum(pf.mx,1):'kein Zeitraum davor');
      if(cfg.buckets){const bk=buckets(w,cfg.buckets),mx=Math.max(...bk.map(b=>b.m||0),1),zc=v=>{const z=(cfg.zones||[]).find(z=>v>=z.min&&v<=z.max);return z?z.color:'var(--ac,#7cd4ff)'};
        T('wide',(Y0.short||'y')+' nach '+(X0.short||'x')+' …','<div class="gfs-bars">'+bk.map(b=>'<div><span>'+esc(b.l)+'</span><u><i style="width:'+(b.m==null?0:b.m/(Y0.fixed?Y0.fixed[1]:mx)*100)+'%;background:'+(b.m==null?'transparent':zc(b.m))+'"></i></u><b>'+(b.m!=null?fmtNum(b.m,dy)+yu:'–')+' <small>('+b.n+' Tage)</small></b></div>').join('')+'</div>','').querySelector('.v').style.fontSize='14px'}
      T('','Datenpunkte',w.length+'<small>von '+S.days+' Tagen</small>','Tage mit beiden Werten');
    }
    K.renderFacts(S,box,{from:S.from,to:S.to,points:w,prev:S.prevWin,fit:f},T);
    if(animate&&!still())[...box.children].forEach((t,i)=>{t.style.animation='gfUp .4s cubic-bezier(.22,1,.36,1) backwards';t.style.animationDelay=(i*45)+'ms'});
  }
  S.redraw=()=>draw(false);
  S.context=()=>{const f=fit(S.win),r=GS.RANGES.find(x=>x.id===S.rangeId);
    let t='GRAPH-VOLLBILD (vom Board berechnet, nicht neu rechnen): Streudiagramm '+(cfg.title||'')+', Zeitraum '+(r?r.label:'')+' ('+S.from+' bis '+S.to+'), '+f.n+' Tage. Korrelation r='+(f.r==null?'–':f.r.toFixed(2))+' ('+strength(f.r)+'), Steigung '+(f.slope==null?'–':f.slope.toFixed(2))+' '+(Y0.unit||'')+' pro +1 '+(X0.short||'x')+', Ø '+(Y0.short||'y')+' '+fmtNum(f.my,Y0.digits||0)+'.';
    if(cfg.buckets)t+=' Je Bereich: '+buckets(S.win,cfg.buckets).map(b=>b.l+' Ø '+(b.m==null?'–':fmtNum(b.m,0))+' ('+b.n+' Tage)').join(', ')+'.';
    const sp=S.sel&&S.byDate.get(S.sel);if(sp)t+=' Markierter Tag: '+sp.date+', '+(X0.short||'x')+' '+fmtNum(sp.x,1)+', '+(Y0.short||'y')+' '+fmtNum(sp.y,0)+'.';
    return t};
  const want=o.range&&ranges.find(r=>r.id===String(o.range))?String(o.range):cfg.range&&ranges.find(r=>r.id===String(cfg.range))?String(cfg.range):(ranges.find(r=>r.id==='90')||ranges[ranges.length-1]).id;
  setRange(want,!still());
  S.ready=true;
  if(o.date)S.gotoX(o.date);
}
root.GraphFull.registerMode('scatter',build);
root.GraphScatter={fit,strength,buckets};
})(typeof window!=='undefined'?window:globalThis);
