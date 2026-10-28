/* Life Board – Mini-Verlauf (Sparkline) in der Recovery-Kachel des Hubs. Nur Darstellung.
   Liest ausschließlich den Whoop-Zwischenspeicher auf dem Gerät (LBWhoop.peek) – keine Netz- und keine Firestore-Abfrage.
   Gibt es noch keinen Speicher (Recovery nie geöffnet), bleibt die Kachel wie sie ist. */
(function(){
'use strict';
const NS='http://www.w3.org/2000/svg',DAYS=14;
const still=()=>{try{return !!(window.LBUI&&LBUI.settings.perf)||matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return true}};
const num=v=>typeof v==='number'&&isFinite(v)?v:null;
function addDays(k,n){const [y,m,d]=k.split('-').map(Number);return new Date(Date.UTC(y,m-1,d+n)).toISOString().slice(0,10)}
function zone(v){return v>=67?'var(--ok,#4ee3a0)':v>=34?'var(--mid,#ffc15a)':'var(--low,#ff6a5c)'}
function draw(tile,days){
  const keys=Object.keys(days).filter(k=>/^\d{4}-\d\d-\d\d$/.test(k)).sort();if(!keys.length)return;
  const end=keys[keys.length-1],L=[];for(let i=DAYS-1;i>=0;i--){const k=addDays(end,-i),d=days[k];L.push(num(d&&d.recovery&&d.recovery.score&&d.recovery.score.recovery_score))}
  const have=L.filter(v=>v!=null);if(have.length<3)return;
  const lo=Math.max(0,Math.min(...have)-6),hi=Math.min(100,Math.max(...have)+6)||1;   // eigener Bereich der 14 Tage, damit der Verlauf sichtbar ist
  const W=120,H=30,P=3,X=i=>P+i*(W-2*P)/(DAYS-1),Y=v=>H-P-(v-lo)/(hi-lo||1)*(H-2*P);
  let d='',pen=false;L.forEach((v,i)=>{if(v==null){pen=false;return}d+=(pen?'L':'M')+X(i).toFixed(1)+','+Y(v).toFixed(1);pen=true});
  let li=L.length-1;while(L[li]==null)li--;
  const last=L[li],avg=Math.round(have.reduce((a,b)=>a+b,0)/have.length),col=zone(last);
  const box=document.createElement('div');box.className='lb-spark';
  box.innerHTML='<svg viewBox="0 0 '+W+' '+H+'" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="lbspg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".28"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>'+
    '<path class="a"/><path class="l" pathLength="1" d="'+d+'"/></svg>'+
    '<div class="lb-spk"><i style="background:'+col+'"></i>'+last+' %<em>Ø '+avg+' % · '+DAYS+' Tage</em></div>';
  // Fläche unter jeder zusammenhängenden Teilstrecke (Lücken bleiben leer)
  const segs=[];let cur=[];L.forEach((v,i)=>{if(v==null){if(cur.length)segs.push(cur);cur=[];return}cur.push([X(i),Y(v)])});if(cur.length)segs.push(cur);
  box.querySelector('path.a').setAttribute('d',segs.filter(s=>s.length>1).map(s=>'M'+s[0][0].toFixed(1)+','+(H-P)+s.map(p=>'L'+p[0].toFixed(1)+','+p[1].toFixed(1)).join('')+'L'+s[s.length-1][0].toFixed(1)+','+(H-P)+'Z').join(''));
  box.style.color=col;if(still())box.classList.add('still');
  box.setAttribute('aria-label','Recovery der letzten '+DAYS+' Tage, zuletzt '+last+' Prozent');box.setAttribute('role','img');
  tile.append(box);
}
const CSS='.lb-spark{margin-top:10px}.lb-spark svg{display:block;width:100%;height:34px;overflow:visible}'+
  '.lb-spark path.a{fill:url(#lbspg)}.lb-spark path.l{fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;vector-effect:non-scaling-stroke;stroke-dasharray:1;stroke-dashoffset:1;animation:lbSpk 1s .2s cubic-bezier(.22,1,.36,1) forwards;filter:drop-shadow(0 0 4px currentColor)}'+
  '.lb-spark.still path.l{animation:none;stroke-dashoffset:0}html[data-perf] .lb-spark path.l{animation:none;stroke-dashoffset:0;filter:none}'+
  '@keyframes lbSpk{to{stroke-dashoffset:0}}@media (prefers-reduced-motion:reduce){.lb-spark path.l{animation:none;stroke-dashoffset:0}}'+
  '.lb-spk{display:flex;align-items:baseline;gap:6px;font-size:13px;font-weight:700;color:var(--tx,inherit);margin-top:4px}.lb-spk i{width:8px;height:8px;border-radius:50%;display:inline-block;align-self:center}'+
  '.lb-spk em{font-style:normal;font-weight:400;color:var(--mu);font-size:12px;margin-left:auto}';
function start(){
  try{
    if(!window.LBWhoop||!LBWhoop.peek||typeof auth==='undefined')return;
    auth.onAuthStateChanged(async u=>{try{
      if(!u)return;const tile=document.querySelector('#hub a.tile[href^="recovery.html"]');if(!tile||tile.querySelector('.lb-spark'))return;
      const days=await LBWhoop.peek(u.uid);if(!days)return;
      if(!document.getElementById('lb-spark-css')){const s=document.createElement('style');s.id='lb-spark-css';s.textContent=CSS;document.head.append(s)}
      draw(tile,days);
    }catch(e){}});
  }catch(e){}
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
