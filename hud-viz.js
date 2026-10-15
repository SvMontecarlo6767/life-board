/* Life Board – HUD-Grafiken (nur Darstellung): animierte Ringe, Herz-Orb, Sparkline-Streifen.
   HudViz.rings(el,{items:[{label,value,max,unit,color,digits}],center:{value,label,color}})
   HudViz.pulse(el,{bpm,color,label})   – pulsiert im echten Ruhepuls-Takt
   HudViz.strip(el,{values,color,max,label}) – kleine Säulenreihe */
(function(){
'use strict';
const NS='http://www.w3.org/2000/svg';
const S=()=>(window.LBUI&&LBUI.settings)||{};
const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||S().perf;
const mk=(n,a,p)=>{const e=document.createElementNS(NS,n);for(const k in a||{})e.setAttribute(k,a[k]);if(p)p.append(e);return e};
const fmt=(v,d)=>v==null||isNaN(v)?'–':Number(v).toLocaleString('de-DE',{minimumFractionDigits:d||0,maximumFractionDigits:d||0});

function rings(host,o){
  host.replaceChildren();host.classList.add('hv-rings');
  const items=o.items||[],n=items.length,size=300,cx=150,cy=150,w=15,gap=6,r0=138;
  const svg=mk('svg',{viewBox:'0 0 '+size+' '+size,class:'hv-svg',role:'img','aria-label':o.aria||'Ringe'},host);
  const defs=mk('defs',{},svg);
  const gl=mk('filter',{id:'hvglow',x:'-30%',y:'-30%',width:'160%',height:'160%'},defs);mk('feGaussianBlur',{stdDeviation:'3.2',result:'b'},gl);
  const mg=mk('feMerge',{},gl);mk('feMergeNode',{in:'b'},mg);mk('feMergeNode',{in:'SourceGraphic'},mg);
  // äußerer Skalenring (dreht sich langsam)
  const sc=mk('g',{class:'hv-scale'},svg);
  for(let i=0;i<72;i++){const a=i/72*Math.PI*2,l=i%6===0?9:4,r1=148;mk('line',{x1:cx+Math.cos(a)*(r1-l),y1:cy+Math.sin(a)*(r1-l),x2:cx+Math.cos(a)*r1,y2:cy+Math.sin(a)*r1,stroke:'currentColor','stroke-width':i%6===0?1.4:.8,opacity:i%6===0?.55:.28},sc)}
  const arcs=[];
  items.forEach((it,i)=>{
    const r=r0-14-i*(w+gap),len=2*Math.PI*r,v=it.value==null?0:Math.max(0,Math.min(1,it.value/(it.max||100)));
    mk('circle',{cx,cy,r,fill:'none',stroke:'rgba(150,200,255,.12)','stroke-width':w},svg);
    const a=mk('circle',{cx,cy,r,fill:'none',stroke:it.color,'stroke-width':w,'stroke-linecap':'round','stroke-dasharray':len,'stroke-dashoffset':len,transform:'rotate(-90 '+cx+' '+cy+')',filter:'url(#hvglow)',class:'hv-arc'},svg);
    arcs.push([a,len,v]);
  });
  const ctr=o.center||{};
  const t1=mk('text',{x:cx,y:cy+8,'text-anchor':'middle',class:'hv-cv',fill:ctr.color||'#fff'},svg);t1.textContent=ctr.value!=null?ctr.value:'';
  const t2=mk('text',{x:cx,y:cy+30,'text-anchor':'middle',class:'hv-cl'},svg);t2.textContent=ctr.label||'';
  const go=()=>arcs.forEach(([a,len,v],i)=>{
    if(reduced()){a.style.transition='none';a.setAttribute('stroke-dashoffset',len*(1-v));return}
    a.style.transition='stroke-dashoffset 1.3s cubic-bezier(.2,.8,.2,1) '+(i*0.18)+'s';requestAnimationFrame(()=>a.setAttribute('stroke-dashoffset',len*(1-v)))});
  requestAnimationFrame(()=>requestAnimationFrame(go));
  // Legende
  const leg=document.createElement('div');leg.className='hv-leg';
  items.forEach(it=>{const d=document.createElement('div');d.className='hv-li';d.style.setProperty('--c',it.color);
    d.innerHTML='<i></i><span>'+it.label+'</span><b>'+fmt(it.value,it.digits)+(it.unit?'<small>'+it.unit+'</small>':'')+'</b>';leg.append(d)});
  host.append(leg);
}

function pulse(host,o){
  host.replaceChildren();host.classList.add('hv-pulse');
  const bpm=o.bpm&&o.bpm>25&&o.bpm<200?o.bpm:null,per=bpm?60/bpm:1.2,c=o.color||'#ff5a7a';
  host.style.setProperty('--per',per+'s');host.style.setProperty('--c',c);
  if(reduced())host.classList.add('still');else host.classList.remove('still');
  const orb=document.createElement('div');orb.className='hv-orb';
  orb.innerHTML='<i class="r r1"></i><i class="r r2"></i><i class="r r3"></i><div class="core"><b>'+(bpm?Math.round(bpm):'–')+'</b><small>bpm</small></div>';
  const lab=document.createElement('div');lab.className='hv-pl';lab.textContent=o.label||'Ruhepuls';
  host.append(orb,lab);
}

function strip(host,o){
  host.replaceChildren();host.classList.add('hv-strip');
  const vals=o.values||[],max=o.max||Math.max.apply(null,vals.filter(v=>v!=null).concat([1]));
  const cols=o.colors||[];
  vals.forEach((v,i)=>{const b=document.createElement('i');const h=v==null?4:Math.max(6,Math.round(v/max*100));
    b.style.setProperty('--h',h+'%');b.style.setProperty('--c',cols[i]||o.color||'#4cc9ff');b.style.setProperty('--d',(i*0.05)+'s');host.append(b)});
}

window.HudViz={rings,pulse,strip};
})();
