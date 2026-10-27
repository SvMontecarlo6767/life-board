/* Life Board – Diagramm-Schicht mit Chart.js (nur Darstellung, keine Daten, keine Logik).
   Das bisherige SVG wird immer zuerst gezeichnet und bleibt (versteckt) im DOM: Lädt Chart.js nicht oder geht etwas schief,
   ist sofort wieder das alte Diagramm zu sehen. Werte werden 1:1 übernommen – nichts gerundet, nichts aufgefüllt.
   LBChart.upgrade(svg,{labels:[datum], sets:[{data:[zahl|null],label,color}], kind:'line'|'bar', fixed:[min,max], dual:true,
     height, fmtDate:k=>text, fmtTick:k=>text, fmtVal:(v,setIndex)=>text, extra:i=>[text], endLabel:true})
   Chart.js (vendor/chart.umd.min.js) wird erst beim ersten Diagramm im Leerlauf nachgeladen. */
(function(root){
'use strict';
const SRC='vendor/chart.umd.min.js?v=444';
let st='idle';                         // idle | loading | ready | failed
const waiting=new Set(),live=new Set();
const S=()=>(root.LBUI&&LBUI.settings)||{};
const calm=()=>!!S().perf||matchMedia('(prefers-reduced-motion: reduce)').matches||(navigator.webdriver===true&&!root.__lbcAnimate);
function load(){
  if(st!=='idle')return;st='loading';
  const go=()=>{try{const s=document.createElement('script');s.src=SRC;s.async=true;
    s.onload=()=>{st=root.Chart?'ready':'failed';flush()};
    s.onerror=()=>{st='failed';waiting.clear()};
    document.head.append(s)}catch(e){st='failed'}};
  (root.requestIdleCallback||(f=>setTimeout(f,1)))(go,{timeout:1200});
}
function flush(){const w=[...waiting];waiting.clear();if(st==='ready')w.forEach(svg=>{if(svg.isConnected&&svg._lbc)draw(svg,svg._lbc)})}
function upgrade(svg,spec){
  try{if(!svg||!spec)return;svg._lbc=spec;if(st==='failed')return;if(st==='ready'){draw(svg,spec);return}waiting.add(svg);load()}catch(e){}
}
/* Farben: "var(--x)", "--x" oder fester Wert → echte Farbe; alpha() für Verläufe */
function color(c,el){
  c=String(c||'--series-1').trim();const m=/^var\((--[^,)]+)/.exec(c),name=m?m[1]:c.startsWith('--')?c:null;
  if(name)c=getComputedStyle(el||document.documentElement).getPropertyValue(name).trim()||'#4cc9ff';
  return c;
}
let probe=null;
function alpha(c,a){
  if(!probe)probe=document.createElement('canvas').getContext('2d');
  probe.fillStyle='#000';probe.fillStyle=c;const v=probe.fillStyle;
  if(/^#[0-9a-f]{6}$/i.test(v))return 'rgba('+parseInt(v.slice(1,3),16)+','+parseInt(v.slice(3,5),16)+','+parseInt(v.slice(5,7),16)+','+a+')';
  const m=/rgba?\(([^)]+)\)/.exec(v);if(m){const p=m[1].split(',').map(x=>x.trim());return 'rgba('+p[0]+','+p[1]+','+p[2]+','+a+')'}
  return v;
}
const lastIdx=a=>{for(let i=a.length-1;i>=0;i--)if(a[i]!=null)return i;return -1};
/* Endwert an der Linie (wie im SVG das einzige Direktlabel) + sanftes Leuchten */
const endLabel={id:'lbEnd',afterDatasetsDraw(ch,args,o){
  if(!o||!o.on)return;const ds=ch.data.datasets[0],meta=ch.getDatasetMeta(0),i=lastIdx(ds.data);if(i<0||!meta.data[i])return;
  const p=meta.data[i],c=ch.ctx,txt=o.fmt(ds.data[i]);
  c.save();c.font='600 12px system-ui,-apple-system,sans-serif';c.fillStyle=o.ink;c.textAlign='right';c.textBaseline='bottom';
  const x=Math.min(p.x,ch.chartArea.right-2),y=Math.max(p.y-9,ch.chartArea.top+12);c.fillText(txt,x,y);c.restore();
}};
const glow={id:'lbGlow',beforeDatasetDraw(ch,args,o){if(!o||!o.on)return;const c=ch.ctx;c.save();c.shadowColor=args.meta.dataset&&args.meta.dataset.options?args.meta.dataset.options.borderColor:'transparent';c.shadowBlur=8},
  afterDatasetDraw(ch,args,o){if(!o||!o.on)return;ch.ctx.restore()}};
function draw(svg,spec){
  const host=svg.parentNode;if(!host)return;
  let w=host._lbw||svg._lbw;
  try{
    if(w){if(w._chart){try{w._chart.destroy()}catch(e){}}w.remove();live.delete(svg)}
    const css=getComputedStyle(svg),ink=color('--ink',svg)||'#e6f1fb',mu=color('--muted',svg)||'#8fa6bd',grid=color('--grid',svg)||'rgba(150,200,255,.12)';
    w=document.createElement('div');w.className='lbc';w.style.cssText='position:relative;width:100%;height:'+(spec.height||190)+'px;margin-top:'+(css.marginTop||'0')+';touch-action:pan-y';
    const cv=document.createElement('canvas');cv.setAttribute('role','img');cv.setAttribute('aria-label',svg.getAttribute('aria-label')||'Diagramm');w.append(cv);
    svg.after(w);
    const L=spec.labels.slice(),kind=spec.kind==='bar'?'bar':'line',dual=!!spec.dual,n=L.length;
    const fv=spec.fmtVal||((v)=>v.toLocaleString('de-DE',{maximumFractionDigits:spec.digits||0})+(spec.unit||''));
    const sets=spec.sets.map((s,j)=>{
      const col=color(s.color||'--series-1',svg),data=s.data.map(v=>v==null?null:v),li=lastIdx(data);
      if(kind==='bar')return{label:s.label||'',data,yAxisID:dual&&j?'y2':'y',borderRadius:4,maxBarThickness:24,categoryPercentage:.9,barPercentage:.88,
        backgroundColor:c=>{const a=c.chart.chartArea;if(!a)return alpha(col,.85);const g=c.chart.ctx.createLinearGradient(0,a.top,0,a.bottom);g.addColorStop(0,alpha(col,.98));g.addColorStop(1,alpha(col,.45));return g},
        hoverBackgroundColor:col,_col:col};
      return{label:s.label||'',data,yAxisID:dual&&j?'y2':'y',borderColor:col,borderWidth:2.2,tension:.35,cubicInterpolationMode:'monotone',spanGaps:false,
        fill:dual?false:'start',backgroundColor:c=>{const a=c.chart.chartArea;if(!a)return 'transparent';const g=c.chart.ctx.createLinearGradient(0,a.top,0,a.bottom);g.addColorStop(0,alpha(col,.30));g.addColorStop(1,alpha(col,0));return g},
        pointRadius:c=>c.dataIndex===li?4.5:(n<=31&&data[c.dataIndex]!=null?(dual?2.5:2):0),pointHoverRadius:6,pointHitRadius:12,
        pointBackgroundColor:col,pointBorderColor:'rgba(4,8,15,.9)',pointBorderWidth:c=>c.dataIndex===li?2:0,_col:col};
    });
    const tk=spec.fmtTick||(k=>String(k).slice(8,10)+'.'+String(k).slice(5,7)+'.');
    const yTick=v=>Number(v).toLocaleString('de-DE',{maximumFractionDigits:spec.tickDigits!=null?spec.tickDigits:(spec.digits||0)});
    const y={grid:{color:grid},border:{display:false},ticks:{color:mu,font:{size:11},maxTicksLimit:5,callback:yTick,display:!dual}};
    if(spec.fixed){y.min=spec.fixed[0];y.max=spec.fixed[1]}else if(kind==='bar')y.beginAtZero=true;else y.grace='8%';
    const scales={x:{grid:{display:false},border:{color:color('--axis',svg)||grid},ticks:{color:mu,font:{size:11},maxRotation:0,autoSkip:true,maxTicksLimit:5,callback:(v,i)=>tk(L[i])}},y};
    if(dual)scales.y2={position:'right',grid:{display:false},border:{display:false},ticks:{display:false},grace:'8%'};
    const still=calm(),c0=sets[0]._col;
    const ch=new root.Chart(cv.getContext('2d'),{type:kind,data:{labels:L,datasets:sets},plugins:[endLabel,glow],
      options:{responsive:true,maintainAspectRatio:false,devicePixelRatio:Math.min(root.devicePixelRatio||1,2),
        animation:still?false:{duration:900,easing:'easeOutQuart'},
        events:touchOnly()?['click','touchstart','touchmove']:['mousemove','mouseout','click','touchstart','touchmove'],
        layout:{padding:{top:14,right:4}},interaction:{mode:'index',intersect:false,axis:'x'},
        scales,
        plugins:{legend:{display:false},
          lbEnd:{on:kind==='line'&&!dual&&spec.endLabel!==false,ink,fmt:v=>fv(v,0)},lbGlow:{on:kind==='line'&&!S().perf},
          tooltip:{backgroundColor:'rgba(6,14,26,.94)',borderColor:alpha(c0,.9),borderWidth:1,padding:10,cornerRadius:12,caretSize:6,
            titleColor:mu,titleFont:{size:12,weight:'500'},bodyColor:ink,bodyFont:{size:15,weight:'700'},footerColor:mu,footerFont:{size:12,weight:'400'},
            displayColors:dual,boxWidth:9,boxHeight:9,usePointStyle:false,filter:it=>it.raw!=null,
            callbacks:{title:it=>it.length?(spec.fmtDate?spec.fmtDate(L[it[0].dataIndex]):L[it[0].dataIndex]):'',
              label:it=>(dual?(it.dataset.label+': '):'')+fv(it.raw,it.datasetIndex),
              labelColor:it=>({borderColor:it.dataset._col,backgroundColor:it.dataset._col}),
              footer:it=>it.length&&spec.extra?(spec.extra(it[0].dataIndex)||[]):[]}}}}});
    w._chart=ch;svg._lbw=w;host._lbw=w;svg.style.display='none';svg.dataset.lbc='1';live.add(svg);
  }catch(e){
    try{if(w){if(w._chart)w._chart.destroy();w.remove()}}catch(x){}
    svg._lbw=null;host._lbw=null;svg.style.display='';live.delete(svg);
  }
}
/* Touch (Handy/iPad): Info-Fenster bleibt nach dem Antippen stehen und verschwindet beim Tippen woanders */
function touchOnly(){try{return matchMedia('(hover: none)').matches}catch(e){return false}}
document.addEventListener('pointerdown',ev=>{try{live.forEach(svg=>{const w=svg._lbw,ch=w&&w._chart;if(!ch||w.contains(ev.target)||!ch.getActiveElements().length)return;
  ch.setActiveElements([]);ch.tooltip.setActiveElements([],{x:0,y:0});ch.update('none')})}catch(e){}},{passive:true,capture:true});
/* Design gewechselt: Farben neu einlesen */
addEventListener('lb-theme',()=>{try{[...live].forEach(svg=>{if(svg.isConnected&&svg._lbc)draw(svg,svg._lbc);else live.delete(svg)})}catch(e){}});
root.LBChart={upgrade,get state(){return st}};
})(window);
