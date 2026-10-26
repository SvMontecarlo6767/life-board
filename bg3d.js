/* 3D-Hintergrund (Three.js): Partikelfeld mit Tiefe, driftendes Neuronen-Netz, Perspektiv-Grid.
   Reagiert auf Scrollen und Geräteneigung (optional).
   Sparsam gebaut: ein Canvas, DPR max. 1.5, Pause bei verstecktem Tab. Im Performance-Modus wird er gar nicht erst geladen. */
(function(){
if(!window.THREE||document.getElementById('lb-bg'))return;
const T=THREE,root=document.documentElement;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
let renderer;
try{
  const cv=document.createElement('canvas');cv.id='lb-bg';document.body.prepend(cv);
  renderer=new T.WebGLRenderer({canvas:cv,antialias:false,alpha:true,powerPreference:'low-power'});
}catch(e){const c=document.getElementById('lb-bg');c&&c.remove();return}
const DPR=Math.min(window.devicePixelRatio||1,1.5);
renderer.setPixelRatio(DPR);renderer.setClearColor(0x000000,0);
const scene=new T.Scene(),cam=new T.PerspectiveCamera(60,1,.1,200);cam.position.set(0,2,18);
scene.fog=new T.FogExp2(0x04080f,.028);
let acc=new T.Color(),acc2=new T.Color();
function readAcc(){const g=n=>{const v=getComputedStyle(root).getPropertyValue(n).trim().split(/\s+/).map(Number);return v.length===3?v:[58,215,255]};const a=g('--acc'),b=g('--acc2');acc.setRGB(a[0]/255,a[1]/255,a[2]/255);acc2.setRGB(b[0]/255,b[1]/255,b[2]/255)}
readAcc();
/* weiche Punkt-Textur */
const tc=document.createElement('canvas');tc.width=tc.height=64;const tx=tc.getContext('2d');const gr=tx.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'rgba(255,255,255,1)');gr.addColorStop(.35,'rgba(255,255,255,.55)');gr.addColorStop(1,'rgba(255,255,255,0)');tx.fillStyle=gr;tx.fillRect(0,0,64,64);
const sprite=new T.CanvasTexture(tc);
/* Partikel */
const N=520,pos=new Float32Array(N*3),vel=new Float32Array(N*3),col=new Float32Array(N*3);
for(let i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*46;pos[i*3+1]=(Math.random()-.5)*26+2;pos[i*3+2]=(Math.random()-.5)*46-6;
  vel[i*3]=(Math.random()-.5)*.012;vel[i*3+1]=(Math.random()-.5)*.008;vel[i*3+2]=(Math.random()-.5)*.012}
const pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(pos,3));pg.setAttribute('color',new T.BufferAttribute(col,3));
const pm=new T.PointsMaterial({size:.34,map:sprite,vertexColors:true,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.9,sizeAttenuation:true});
const pts=new T.Points(pg,pm);scene.add(pts);
function recolor(){for(let i=0;i<N;i++){const c=i%5===0?acc2:acc,k=.35+.65*((i*37)%100)/100;col[i*3]=c.r*k;col[i*3+1]=c.g*k;col[i*3+2]=c.b*k}pg.attributes.color.needsUpdate=true}
recolor();
/* Neuronen-Netz: Linien zwischen nahen Knoten (Teilmenge der Partikel), nur alle paar Frames neu berechnet */
const NODES=46,MAXL=NODES*5,lpos=new Float32Array(MAXL*6),lg=new T.BufferGeometry();
lg.setAttribute('position',new T.BufferAttribute(lpos,3));lg.setDrawRange(0,0);
const lm=new T.LineBasicMaterial({color:acc.clone(),transparent:true,opacity:.22,blending:T.AdditiveBlending,depthWrite:false});
scene.add(new T.LineSegments(lg,lm));
function rebuildLines(){
  let n=0;const th=7.5;
  for(let i=0;i<NODES&&n<MAXL;i++){let c=0;for(let j=i+1;j<NODES&&c<4&&n<MAXL;j++){
    const dx=pos[i*3]-pos[j*3],dy=pos[i*3+1]-pos[j*3+1],dz=pos[i*3+2]-pos[j*3+2];
    if(dx*dx+dy*dy+dz*dz<th*th){lpos.set([pos[i*3],pos[i*3+1],pos[i*3+2],pos[j*3],pos[j*3+1],pos[j*3+2]],n*6);n++;c++}}}
  lg.setDrawRange(0,n*2);lg.attributes.position.needsUpdate=true;
}
/* Grid-Boden in Perspektive */
const gridG=new T.BufferGeometry(),gl=[],GS=60,GD=2.5;
for(let i=-GS/2;i<=GS/2;i++){gl.push(i*GD,0,-GS*GD/2,i*GD,0,GS*GD/2);gl.push(-GS*GD/2,0,i*GD,GS*GD/2,0,i*GD)}
gridG.setAttribute('position',new T.Float32BufferAttribute(gl,3));
const gm=new T.LineBasicMaterial({color:acc.clone(),transparent:true,opacity:.16,depthWrite:false});
const grid=new T.LineSegments(gridG,gm);grid.position.y=-9;scene.add(grid);
/* Design: Dschungel = Glühwürmchen (steigen sacht auf, schwanken), weiches Grün im Nebel, kein Tech-Gitter */
let jungle=false,baseL=.22;
function applyMode(){
  const j=root.getAttribute('data-theme')==='jungle';if(j===jungle&&frame>0)return;jungle=j;
  scene.fog.color.set(j?0x050d08:0x04080f);grid.visible=!j;pm.size=j?.46:.34;baseL=j?.13:.22;lm.opacity=baseL;
}
/* Zustand / Eingaben */
let speed=1,targetSpeed=1,pulse=0,scrollY=0,tiltX=0,tiltY=0,visible=!document.hidden,raf=0,frame=0,last=performance.now();
window.addEventListener('scroll',()=>{scrollY=window.scrollY||0},{passive:true});
window.addEventListener('deviceorientation',e=>{if(!(window.LBUI&&LBUI.settings.tilt))return;tiltX=Math.max(-1,Math.min(1,(e.gamma||0)/30));tiltY=Math.max(-1,Math.min(1,((e.beta||45)-45)/30))});
function resize(){const w=window.innerWidth,h=window.innerHeight;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix()}
resize();window.addEventListener('resize',resize);
function tick(now){
  raf=0;if(!visible)return;
  const dt=Math.min(.05,(now-last)/1000);last=now;frame++;
  speed+=(targetSpeed-speed)*Math.min(1,dt*3);pulse=Math.max(0,pulse-dt*1.6);
  if(frame%30===0){readAcc();recolor();lm.color.copy(acc);gm.color.copy(acc);applyMode()}
  const k=dt*60*speed;
  for(let i=0;i<N;i++){const o=i*3;pos[o]+=vel[o]*k;pos[o+1]+=vel[o+1]*k;pos[o+2]+=vel[o+2]*k;
    if(jungle){pos[o]+=Math.sin(now*.0006+i)*.004*k;pos[o+1]+=.005*k}
    if(pos[o]>23)pos[o]=-23;else if(pos[o]<-23)pos[o]=23;if(pos[o+1]>15)pos[o+1]=-11;else if(pos[o+1]<-11)pos[o+1]=15;if(pos[o+2]>17)pos[o+2]=-29;else if(pos[o+2]<-29)pos[o+2]=17}
  pg.attributes.position.needsUpdate=true;
  if(frame%4===0)rebuildLines();
  pts.rotation.y+=dt*.02*speed;
  cam.position.x+=((tiltX*3)-cam.position.x)*.05;cam.position.y+=((2-scrollY*.004+tiltY*2)-cam.position.y)*.06;
  cam.rotation.x=-.06-Math.min(scrollY*.00008,.1);cam.rotation.y=-cam.position.x*.01;
  grid.position.z=(now*.0012*speed)%GD;
  pm.opacity=(jungle?.8+.15*Math.sin(now*.0021):.9)+pulse*.1;lm.opacity=baseL+pulse*.4;
  renderer.render(scene,cam);
  if(!reduced)raf=requestAnimationFrame(tick);
}
function kick(){if(!raf&&visible)raf=requestAnimationFrame(tick)}
document.addEventListener('visibilitychange',()=>{visible=!document.hidden;if(visible){last=performance.now();kick()}else if(raf){cancelAnimationFrame(raf);raf=0}});
window.addEventListener('lb-bg-stop',()=>{visible=false;if(raf){cancelAnimationFrame(raf);raf=0}});
if(window.LBUI)LBUI.onSettings(s=>{const c=document.getElementById('lb-bg');if(!c)return;if(s.perf){visible=false;if(raf){cancelAnimationFrame(raf);raf=0}}else if(!visible&&!document.hidden){visible=true;last=performance.now();kick()}});
window.addEventListener('lb-theme',()=>{readAcc();recolor();lm.color.copy(acc);gm.color.copy(acc);applyMode();if(reduced||!raf)renderer.render(scene,cam)});
applyMode();rebuildLines();kick();
})();
