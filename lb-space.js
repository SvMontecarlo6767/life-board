/* Life Board – Weltraum-Welt (Hintergrund „Weltraum“ im Cockpit-Design). Nur Darstellung, keine Daten, keine Logik.
   Ein WebGL-Renderer (three.js r134 aus vendor/), Pixelratio höchstens 2, pausiert bei verborgener Seite.
   Inhalt: Sterne mit Tiefe (fliegen langsam auf dich zu), Nebel (Shader), Planet am Horizont mit Atmosphäre, langsame Kamerafahrt.
   Stimmung je Recovery-Zone (nur gelesen: LBWhoop.peek bzw. zuletzt bekannte Zone):
     grün = ruhig und klar, gelb = wärmer, rot = unruhig, rötlich glühend. Ohne Daten: neutral in der Reiterfarbe.
   Akzentfarbe des Reiters (--acc/--acc2 aus theme.js) fließt in Nebel, Sterne und Planet ein; der Hub kann die Tönung
   über das Ereignis 'lb-tint' (detail: [r,g,b]) vorübergehend setzen (Karussell: Farbe der vordersten Karte).
   Fällt WebGL aus (Kontextverlust), meldet create() das über opts.onFail – lb-bg.js schaltet dann auf einen ruhigen Ersatz. */
(function(){
'use strict';
if(window.LBSpace)return;
const root=document.documentElement;
const ZONE={g:[70,240,170],y:[255,176,64],r:[255,58,48]};
const MOOD={   // Nebeldichte, Unruhe, Funkeln, Glühen, Reisetempo
  g:{dense:.75,turb:0,tw:.18,glow:0,speed:5},
  y:{dense:.8,turb:.45,tw:.35,glow:.25,speed:7},
  r:{dense:1,turb:1,tw:.75,glow:1,speed:9},
  n:{dense:.85,turb:.2,tw:.28,glow:0,speed:6}
};
const cssRgb=n=>{const v=getComputedStyle(root).getPropertyValue(n).trim().split(/\s+/).map(Number);return v.length===3&&v.every(x=>isFinite(x))?v:[58,215,255]};
const phone=()=>{try{return matchMedia('(pointer: coarse)').matches&&Math.min(screen.width,screen.height)<600}catch(e){return false}};
const lerp=(a,b,k)=>a+(b-a)*k;
/* ---------- Recovery-Zone (nur lesen) ---------- */
function zoneOf(v){return v==null?'n':v>=67?'g':v>=34?'y':'r'}
function cachedZone(){try{const o=JSON.parse(localStorage.getItem('lb_zone')||'null');if(o&&o.z&&Date.now()-o.at<36*3600e3)return o.z}catch(e){}return 'n'}
function lastRecovery(days){
  const keys=Object.keys(days||{}).filter(k=>/^\d{4}-\d\d-\d\d$/.test(k)).sort().reverse();
  const lim=new Date(Date.now()-2.5*864e5).toISOString().slice(0,10);
  for(const k of keys){if(k<lim)break;const s=days[k]&&days[k].recovery&&days[k].recovery.score&&days[k].recovery.score.recovery_score;if(typeof s==='number'&&isFinite(s))return s}
  return null;
}
function readZone(cb){
  const go=()=>{try{if(!window.LBWhoop||typeof auth==='undefined')return;auth.onAuthStateChanged(async u=>{if(!u)return;try{const d=await LBWhoop.peek(u.uid);if(!d)return;const z=zoneOf(lastRecovery(d));try{localStorage.setItem('lb_zone',JSON.stringify({z,at:Date.now()}))}catch(e){}cb(z)}catch(e){}})}catch(e){}};
  if(window.LBWhoop)go();
  else if(typeof auth!=='undefined'){const s=document.createElement('script');s.src='whoop-cache.js';s.async=true;s.onload=go;document.head.append(s)}
}
/* ---------- Shader ---------- */
const NOISE=`
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1.,0.)),u.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n2(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}`;
const NEB_V='varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
const NEB_F=`precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec3 uA;uniform vec3 uB;uniform vec3 uZ;uniform vec2 uOff;uniform float uDense;uniform float uTurb;uniform float uGlow;uniform float uWarp;
varying vec2 vUv;${NOISE}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;vec2 p=(gl_FragCoord.xy/uRes.y)*1.35+uOff;
  float t=uTime*(.012+.05*uTurb);
  vec2 q=vec2(fbm(p+vec2(t,0.)),fbm(p+vec2(5.2,1.3)-t));
  float n=fbm(p+1.8*q+vec2(t*.7,-t*.4));
  float cloud=smoothstep(.3,.9,n)*uDense;
  vec3 col=mix(uA,uB,clamp(q.x*1.3-.1,0.,1.));
  col=mix(col,uZ,smoothstep(.55,.95,n)*.55);
  col*=cloud*(.55+.45*smoothstep(.2,.75,q.y));
  float fl=1.+uGlow*.22*sin(uTime*2.7+n*7.)*sin(uTime*1.3+q.x*5.);
  float vig=smoothstep(1.25,.25,length((uv-vec2(.5,.62))*vec2(1.,1.15)));
  vec3 bg=mix(vec3(.006,.012,.03),vec3(.012,.02,.05),uv.y);
  bg+=uZ*.05*uGlow*(1.-uv.y);
  gl_FragColor=vec4(bg+col*vig*fl*(1.-.6*uWarp),1.);
}`;
const STAR_V=`attribute float aSize;attribute vec3 aCol;attribute float aPh;
uniform float uTime;uniform float uPR;uniform float uTw;uniform float uTravel;uniform float uDepth;uniform float uWarp;
varying vec3 vCol;varying float vA;
void main(){
  vec3 p=position;float d=mod(-p.z-20.-uTravel,uDepth);p.z=-(20.+d);p.xy*=d*.45+160.;
  vec4 mv=modelViewMatrix*vec4(p,1.);
  float tw=1.-uTw*.55*(.5+.5*sin(uTime*(1.2+aPh*1.7)+aPh*31.));
  float fade=smoothstep(uDepth,uDepth*.8,d)*smoothstep(0.,60.,d);
  gl_PointSize=clamp(aSize*uPR*(300./-mv.z)*(1.+uWarp*2.),1.,14.*uPR);
  vCol=aCol;vA=tw*fade;
  gl_Position=projectionMatrix*mv;
}`;
const STAR_F=`precision mediump float;varying vec3 vCol;varying float vA;
void main(){vec2 c=gl_PointCoord-.5;float d=length(c);float a=smoothstep(.5,0.,d)*.5+smoothstep(.16,0.,d);if(a<.01)discard;gl_FragColor=vec4(vCol*a*vA,1.);}`;
const STREAK_V=`attribute float aEnd;attribute vec3 aCol;
uniform float uTravel;uniform float uDepth;uniform float uWarp;uniform float uLen;uniform vec3 uTint;
varying vec3 vCol;varying float vA;
void main(){
  vec3 p=position;float d=mod(-p.z-20.-uTravel,uDepth);float dd=min(d+aEnd*uLen*uWarp,uDepth);
  p.xy*=d*.45+160.;p.z=-(20.+dd);
  float fade=smoothstep(uDepth,uDepth*.75,d)*smoothstep(0.,50.,d);
  vCol=mix(mix(aCol,vec3(.8,.9,1.),.35),uTint,.45);vA=uWarp*fade*(1.-aEnd*.9);
  gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
}`;
const STREAK_F=`precision mediump float;varying vec3 vCol;varying float vA;void main(){gl_FragColor=vec4(vCol*vA*1.6,1.);}`;
const PL_V=`varying vec3 vN;varying vec3 vO;varying vec3 vV;
void main(){vO=normalize(position);vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
const PL_F=`precision highp float;
uniform vec3 uSun;uniform vec3 uC1;uniform vec3 uC2;uniform vec3 uAtm;uniform vec3 uLit;uniform float uTime;uniform float uGlow;
varying vec3 vN;varying vec3 vO;varying vec3 vV;
float h31(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
  return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fb3(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n3(p);p=p*2.07+vec3(3.1,1.7,5.3);a*=.5;}return v;}
void main(){
  vec3 o=vO;
  float w=fb3(o*3.2+vec3(0.,0.,uTime*.01));
  float b=fb3(vec3(o.x*2.,o.y*9.+w*2.4,o.z*2.));
  vec3 base=mix(uC1,uC2,smoothstep(.32,.72,b));
  base*=.8+.2*sin(o.y*30.+w*7.);
  float l=dot(normalize(vN),normalize(uSun));float day=smoothstep(-.15,.4,l);
  vec3 col=base*(.05+.85*day);
  float city=smoothstep(.66,.72,fb3(o*14.))*(1.-day)*.45;col+=uLit*city;
  float fr=pow(1.-max(dot(normalize(vN),normalize(vV)),0.),3.);
  col+=uAtm*fr*(.25+.45*day+uGlow*.3);
  gl_FragColor=vec4(col,1.);
}`;
const AT_V=`varying vec3 vN;void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const AT_F=`precision mediump float;uniform vec3 uAtm;uniform float uPow;uniform float uTime;uniform float uGlow;varying vec3 vN;
void main(){float i=pow(max(.68-dot(vN,vec3(0.,0.,1.)),0.),3.6)*uPow;i*=1.+uGlow*.25*sin(uTime*2.1);gl_FragColor=vec4(uAtm*i,1.);}`;

/* ---------- Welt bauen ---------- */
function create(el,opts){
  opts=opts||{};
  const T=window.__LB_T134||window.THREE;if(!T)throw new Error('three.js fehlt');
  const cv=document.createElement('canvas');
  const gl=cv.getContext('webgl',{alpha:false,antialias:false,powerPreference:'high-performance'})||cv.getContext('experimental-webgl');
  if(!gl)throw new Error('kein WebGL');
  // nur per Software emuliertes WebGL (kein Grafikchip) wäre zäh: wie „kein WebGL“ behandeln (Tests erzwingen es mit window.__lbForceSpace)
  try{const ex=gl.getExtension('WEBGL_debug_renderer_info'),rn=ex?String(gl.getParameter(ex.UNMASKED_RENDERER_WEBGL)):'';if(/swiftshader|llvmpipe|software/i.test(rn)&&!window.__lbForceSpace)throw new Error('nur Software-WebGL')}catch(e){if(/Software/.test(e.message))throw e}
  const R=new T.WebGLRenderer({canvas:cv,context:gl,antialias:false,alpha:false});
  const small=phone();let pr=Math.min(window.devicePixelRatio||1,2);
  R.setPixelRatio(pr);R.setClearColor(0x02050c,1);
  el.append(cv);cv.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:block';
  const scene=new T.Scene(),cam=new T.PerspectiveCamera(60,1,.1,3000);
  /* Nebel: bildschirmfüllendes Rechteck */
  const nebU={uRes:{value:new T.Vector2(1,1)},uTime:{value:0},uA:{value:new T.Color()},uB:{value:new T.Color()},uZ:{value:new T.Color()},uOff:{value:new T.Vector2()},uDense:{value:.7},uTurb:{value:0},uGlow:{value:0},uWarp:{value:0}};
  const neb=new T.Mesh(new T.PlaneGeometry(2,2),new T.ShaderMaterial({uniforms:nebU,vertexShader:NEB_V,fragmentShader:NEB_F,depthWrite:false,depthTest:false}));
  neb.frustumCulled=false;neb.renderOrder=-10;scene.add(neb);
  /* Sterne: drei Schichten Tiefe in einer Wolke, fliegen langsam heran */
  const N=small?1700:2600,DEPTH=1500,pos=new Float32Array(N*3),col=new Float32Array(N*3),siz=new Float32Array(N),ph=new Float32Array(N);
  const PAL=[[1,1,1],[.78,.88,1],[1,.93,.8],[.7,.8,1]];
  for(let i=0;i<N;i++){
    pos[i*3]=(Math.random()*2-1)*1.5;pos[i*3+1]=(Math.random()*2-1)*1.15;pos[i*3+2]=-(20+Math.random()*DEPTH);
    const c=PAL[(Math.random()*PAL.length)|0],b=.55+Math.random()*.45;col[i*3]=c[0]*b;col[i*3+1]=c[1]*b;col[i*3+2]=c[2]*b;
    siz[i]=Math.random()<.04?3.4+Math.random()*2.4:.9+Math.random()*1.8;ph[i]=Math.random();
  }
  const sg=new T.BufferGeometry();sg.setAttribute('position',new T.BufferAttribute(pos,3));sg.setAttribute('aCol',new T.BufferAttribute(col,3));sg.setAttribute('aSize',new T.BufferAttribute(siz,1));sg.setAttribute('aPh',new T.BufferAttribute(ph,1));
  const starU={uTime:{value:0},uPR:{value:pr},uTw:{value:.2},uTravel:{value:0},uDepth:{value:DEPTH},uWarp:{value:0}};
  const stars=new T.Points(sg,new T.ShaderMaterial({uniforms:starU,vertexShader:STAR_V,fragmentShader:STAR_F,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  stars.frustumCulled=false;scene.add(stars);
  /* Warp: dieselben Sterne als Lichtstreifen (nur sichtbar, solange gewarpt wird) */
  const lp=new Float32Array(N*6),lc=new Float32Array(N*6),le=new Float32Array(N*2);
  for(let i=0;i<N;i++)for(let j=0;j<2;j++){const v=i*2+j;lp.set(pos.subarray(i*3,i*3+3),v*3);lc.set(col.subarray(i*3,i*3+3),v*3);le[v]=j}
  const lg=new T.BufferGeometry();lg.setAttribute('position',new T.BufferAttribute(lp,3));lg.setAttribute('aCol',new T.BufferAttribute(lc,3));lg.setAttribute('aEnd',new T.BufferAttribute(le,1));
  const strU={uTravel:starU.uTravel,uDepth:starU.uDepth,uWarp:{value:0},uLen:{value:420},uTint:{value:new T.Color(.6,.8,1)}};
  const streaks=new T.LineSegments(lg,new T.ShaderMaterial({uniforms:strU,vertexShader:STREAK_V,fragmentShader:STREAK_F,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  streaks.frustumCulled=false;streaks.visible=false;scene.add(streaks);
  /* Planet am Horizont mit Atmosphäre */
  const plU={uSun:{value:new T.Vector3(-.6,.75,.35)},uC1:{value:new T.Color()},uC2:{value:new T.Color()},uAtm:{value:new T.Color()},uLit:{value:new T.Color()},uTime:{value:0},uGlow:{value:0}};
  const planet=new T.Mesh(new T.SphereGeometry(1,small?72:96,small?48:64),new T.ShaderMaterial({uniforms:plU,vertexShader:PL_V,fragmentShader:PL_F}));
  const atU={uAtm:{value:new T.Color()},uPow:{value:.55},uTime:{value:0},uGlow:{value:0}};
  const atm=new T.Mesh(new T.SphereGeometry(1.07,64,40),new T.ShaderMaterial({uniforms:atU,vertexShader:AT_V,fragmentShader:AT_F,side:T.BackSide,blending:T.AdditiveBlending,transparent:true,depthWrite:false}));
  const pg=new T.Group();pg.add(planet,atm);planet.rotation.x=.9;scene.add(pg);
  /* ---------- Farben / Stimmung (weich überblenden) ---------- */
  const cur={acc:cssRgb('--acc'),acc2:cssRgb('--acc2'),tint:null,zone:cachedZone()};
  const tgt={},now={};
  function target(){
    const z=cur.zone,zc=ZONE[z]||null,m=MOOD[z]||MOOD.n,a=cur.tint||cur.acc,a2=cur.tint?cur.acc2.map((c,i)=>(c+cur.tint[i])/2):cur.acc2;
    const zt=zc||a2,mix=(x,y,k)=>x.map((c,i)=>c+(y[i]-c)*k);
    tgt.A=mix(a,zt,zc?.32:0).map(c=>c/255*.68);
    tgt.B=mix(a2,zt,zc?.55:.15).map(c=>c/255*.58);
    tgt.Z=zt.map(c=>c/255*(z==='r'?.9:.5));
    tgt.C1=mix([14,26,48],a,.18).map(c=>c/255);
    tgt.C2=mix([40,70,110],a2,.35).map(c=>c/255*.9);
    tgt.Atm=mix(a,zt,zc?.6:.2).map(c=>c/255*(z==='r'?.95:.7));
    tgt.Lit=mix([255,210,140],a,.4).map(c=>c/255);
    Object.assign(tgt,m);
  }
  target();for(const k in tgt)now[k]=Array.isArray(tgt[k])?tgt[k].slice():tgt[k];
  function step(dt){
    const k=1-Math.exp(-dt*1.6);
    for(const n in tgt){if(Array.isArray(tgt[n]))now[n]=now[n].map((v,i)=>lerp(v,tgt[n][i],k));else now[n]=lerp(now[n],tgt[n],k)}
    nebU.uA.value.setRGB(...now.A);nebU.uB.value.setRGB(...now.B);nebU.uZ.value.setRGB(...now.Z);
    nebU.uDense.value=now.dense;nebU.uTurb.value=now.turb;nebU.uGlow.value=now.glow;starU.uTw.value=now.tw;
    plU.uC1.value.setRGB(...now.C1);plU.uC2.value.setRGB(...now.C2);plU.uAtm.value.setRGB(...now.Atm);plU.uLit.value.setRGB(...now.Lit);plU.uGlow.value=now.glow;
    atU.uAtm.value.setRGB(...now.Atm);atU.uGlow.value=now.glow;
  }
  /* ---------- Größe, Planet so platzieren, dass sein Bogen unten den Horizont bildet ---------- */
  let W=0,H=0;
  function resize(){
    let w=el.clientWidth||innerWidth,h=el.clientHeight||innerHeight;const sm=Math.max(screen.width||w,screen.height||h,800);w=Math.min(w,sm);h=Math.min(h,sm);   // nie größer als der Bildschirm (z. B. bei Ganzseiten-Aufnahmen)
    if(w===W&&h===H)return;W=w;H=h;
    R.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();
    const d=420,hh=d*Math.tan(cam.fov*Math.PI/360),hw=hh*cam.aspect,r=Math.max(hw*1.7,hh*1.05);
    pg.position.set(-hw*.18,-hh*(w<h?.62:.7)-r,-d);pg.scale.setScalar(r);
    const b=R.getDrawingBufferSize(new T.Vector2());nebU.uRes.value.copy(b);
  }
  /* ---------- Kamera: langsame Fahrt, leichte Parallaxe beim Scrollen, optional Geräteneigung ---------- */
  let tiltX=0,tiltY=0;const onTilt=e=>{if(!(window.LBUI&&LBUI.settings.tilt))return;tiltX=Math.max(-1,Math.min(1,(e.gamma||0)/35));tiltY=Math.max(-1,Math.min(1,((e.beta||45)-45)/35))};
  addEventListener('deviceorientation',onTilt,{passive:true});
  /* ---------- Schleife ---------- */
  let raf=0,last=0,t=0,travel=0,alive=true,warp=0,warpT=0,frames=0,fpsT0=0,tuned=false,spin=window.__lbSpin||0,spinT=spin,ramp=10,decay=6;
  function frame(ms){
    raf=0;if(!alive||document.hidden)return;
    const dt=last?Math.min(.05,(ms-last)/1000):.016;last=ms;t+=dt;
    resize();step(dt);
    if(warpT>0){warpT=Math.max(0,warpT-dt);warp=lerp(warp,warpT>0?1:0,1-Math.exp(-dt*ramp))}else warp=lerp(warp,0,1-Math.exp(-dt*decay));
    spin=lerp(spin,spinT,1-Math.exp(-dt*5));stars.rotation.z=streaks.rotation.z=spin*.22;
    travel+=dt*(now.speed+warp*warp*1400);
    strU.uWarp.value=warp;streaks.visible=warp>.01;
    const fov=60+warp*30;if(Math.abs(cam.fov-fov)>.01){cam.fov=fov;cam.updateProjectionMatrix()}
    const sy=Math.min(scrollY||0,1600),jit=now.glow>.5?Math.sin(t*9.3)*Math.sin(t*5.1)*.0025*now.glow:0;
    const yaw=Math.sin(t*.045)*.09*(1-warp)+tiltX*.06+jit,pitch=Math.sin(t*.031)*.035-sy*.00005-tiltY*.04+warp*.22;
    cam.rotation.set(pitch,yaw,Math.sin(t*.023)*.012,'YXZ');
    nebU.uOff.value.set(yaw*1.6+t*.004+spin*.5,pitch*1.6);nebU.uTime.value=t;nebU.uWarp.value=warp;
    starU.uTime.value=t;starU.uTravel.value=travel;starU.uWarp.value=warp;
    plU.uTime.value=t;atU.uTime.value=t;planet.rotation.z=t*.006+spin*.35;
    R.render(scene,cam);
    // einmalig: läuft es zäh, Auflösung senken (nie den Hintergrund wechseln)
    if(!tuned){if(!fpsT0)fpsT0=ms+1200;else if(ms>fpsT0){frames++;if(ms-fpsT0>2500){tuned=true;const fps=frames*1000/(ms-fpsT0);if(fps<38&&pr>1){pr=1;R.setPixelRatio(pr);starU.uPR.value=pr;W=0}}}}
    raf=requestAnimationFrame(frame);
  }
  const run=()=>{if(!raf&&alive&&!document.hidden){last=0;raf=requestAnimationFrame(frame)}};
  const vis=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0}else run()};
  document.addEventListener('visibilitychange',vis);
  const onTint=e=>{cur.tint=e&&e.detail||null;target()};
  window.addEventListener('lb-tint',onTint);
  const onSpin=e=>{spinT=+e.detail||0;run()};window.addEventListener('lb-spin',onSpin);if(window.__lbTint)cur.tint=window.__lbTint;target();
  const onLost=e=>{try{e.preventDefault()}catch(x){}alive=false;cancelAnimationFrame(raf);raf=0;if(opts.onFail)opts.onFail()};
  cv.addEventListener('webglcontextlost',onLost,false);
  readZone(z=>{if(z!==cur.zone){cur.zone=z;target()}});
  // Ankunft nach einem Warp: Sterne laufen aus (Zeitstempel von lb-warp.js)
  try{const w=+sessionStorage.getItem('lb_warp_in')||0;if(Date.now()-w<3000){warp=1;warpT=.1;decay=2.4}}catch(e){}
  resize();run();
  const api={
    el,renderer:R,THREE:T,
    recolor(){cur.acc=cssRgb('--acc');cur.acc2=cssRgb('--acc2');target()},
    setZone(z){cur.zone=ZONE[z]?z:'n';target()},
    get zone(){return cur.zone},
    warp(sec,rgb,soft){warpT=Math.max(warpT,sec||.6);ramp=soft?2.2:10;decay=soft?2.4:6;if(rgb)strU.uTint.value.setRGB(rgb[0]/255,rgb[1]/255,rgb[2]/255);run()},
    destroy(){alive=false;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',vis);window.removeEventListener('lb-tint',onTint);window.removeEventListener('lb-spin',onSpin);removeEventListener('deviceorientation',onTilt);
      try{lg.dispose();streaks.material.dispose();sg.dispose();planet.geometry.dispose();atm.geometry.dispose();neb.geometry.dispose();[neb,stars,planet,atm].forEach(m=>m.material.dispose());R.dispose()}catch(e){}if(window.LBSpace&&LBSpace.current===api)LBSpace.current=null}
  };
  window.LBSpace.current=api;
  return api;
}
window.LBSpace={create,current:null,zoneOf,ZONE};
})();
