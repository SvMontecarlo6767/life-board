/* Life Board – Weltraum-Welt (Hintergrund „Weltraum“ im Cockpit-Design). Nur Darstellung, keine Daten, keine Logik.
   Ein WebGL-Renderer (three.js r134 aus vendor/), Pixelratio höchstens 2, pausiert bei verborgener Seite.
   Inhalt: Sterne mit Tiefe (fliegen langsam auf dich zu), Nebel (Shader), Spiralgalaxie hinter der Bildmitte (dreht innen schneller,
   im Hub mit dem Karussell), Sternschnuppen, schwebender Sternenstaub nah vor der Kamera, langsame Kamerafahrt.
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
/* Galaxie: Punkte in einer flachen Scheibe (Spiralarme + heller Kern), dreht differenziell (innen schneller) */
const GAL_V=`attribute float aSize;attribute vec3 aCol;attribute float aR;
uniform float uTime;uniform float uPR;uniform float uSpin;uniform float uGlow;uniform vec3 uArm;uniform vec3 uCore;
varying vec3 vCol;varying float vA;
void main(){
  float a=uSpin+uTime*(.012+.05*(1.-aR));float c=cos(a),s=sin(a);
  vec3 p=vec3(position.x*c-position.z*s,position.y,position.x*s+position.z*c);
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_PointSize=clamp(aSize*uPR*(640./-mv.z),1.,11.*uPR);
  float k=smoothstep(0.,.5,aR);
  vCol=mix(uCore*1.2,aCol*uArm*1.15,k);
  vA=(1.-aR*.35)*(1.+uGlow*.35*sin(uTime*3.3+aR*24.)*(1.-k));
  gl_Position=projectionMatrix*mv;
}`;
const GAL_F=`precision mediump float;varying vec3 vCol;varying float vA;
void main(){vec2 c=gl_PointCoord-.5;float d=length(c);float a=smoothstep(.5,0.,d);a*=a;if(a<.01)discard;gl_FragColor=vec4(vCol*a*vA,1.);}`;
/* Sternenstaub nah an der Kamera (unscharf, „Bokeh“) */
const DUST_V=`attribute float aSize;uniform float uTime;uniform float uPR;uniform vec3 uCol;varying float vA;varying vec3 vC;
void main(){vec3 p=position;p.y+=sin(uTime*.12+position.x*.05)*6.;p.x+=cos(uTime*.09+position.y*.04)*5.;vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_PointSize=aSize*uPR*(48./-mv.z);vA=.07;vC=uCol*1.4;gl_Position=projectionMatrix*mv;}`;
const DUST_F=`precision mediump float;varying float vA;varying vec3 vC;
void main(){vec2 c=gl_PointCoord-.5;float d=length(c);float a=smoothstep(.5,.42,d)*.6+smoothstep(.45,0.,d)*.4;if(a<.01)discard;gl_FragColor=vec4(vC*a*vA,1.);}`;
let GLOW=null;
function glowTex(T){if(GLOW)return GLOW;const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.15,'rgba(255,255,255,.55)');g.addColorStop(.4,'rgba(255,255,255,.14)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
  GLOW=new T.CanvasTexture(c);return GLOW}
function streakTex(T){const c=document.createElement('canvas');c.width=128;c.height=8;const x=c.getContext('2d'),g=x.createLinearGradient(0,0,128,0);
  g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.85,'rgba(255,255,255,.8)');g.addColorStop(1,'rgba(255,255,255,1)');x.fillStyle=g;x.fillRect(0,2,128,4);return new T.CanvasTexture(c)}
/* Leuchtende Spiralscheibe als Textur (einmal gemalt): viele weiche Lichtflecken entlang der Arme + heller Kern */
function diskTex(T,arms){
  const N=512,c=document.createElement('canvas');c.width=c.height=N;const x=c.getContext('2d');x.globalCompositeOperation='lighter';
  for(let i=0;i<4200;i++){const r=Math.pow(Math.random(),1.15),th=(i%arms)/arms*Math.PI*2+r*5.2+gauss()*(.16+.1*r),R=r*N*.47;
    const px=N/2+Math.cos(th)*R,py=N/2+Math.sin(th)*R,sz=4+(1-r)*16+Math.random()*8,a=.05*(1-r*.55);
    const g=x.createRadialGradient(px,py,0,px,py,sz);g.addColorStop(0,'rgba(255,255,255,'+a+')');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(px-sz,py-sz,sz*2,sz*2)}
  const g=x.createRadialGradient(N/2,N/2,0,N/2,N/2,N*.2);g.addColorStop(0,'rgba(255,255,255,.95)');g.addColorStop(.3,'rgba(255,255,255,.35)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,N,N);
  return new T.CanvasTexture(c);
}
const gauss=()=>{let u=0,v=0;while(!u)u=Math.random();while(!v)v=Math.random();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v)};

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
  /* Galaxie flach unter den Inhalten (Spiralarme, heller Kern) */
  const NG=small?18000:30000,ARMS=3,gp=new Float32Array(NG*3),gc=new Float32Array(NG*3),gs=new Float32Array(NG),gr=new Float32Array(NG);
  for(let i=0;i<NG;i++){
    let x,y,z,r;const bulge=Math.random()<.14;
    if(bulge){r=Math.pow(Math.random(),2.4)*.2;const th=Math.random()*Math.PI*2;x=Math.cos(th)*r;z=Math.sin(th)*r;y=gauss()*.04*(1-r/.2)}
    else{   // klare Spiralarme: Zufallsabweichung wächst nach außen, Punkte ballen sich am Arm
      r=.05+Math.pow(Math.random(),1.25)*.95;const th=(i%ARMS)/ARMS*Math.PI*2+r*5.2,sp=.32*r;
      const rx=Math.pow(Math.random(),3)*(Math.random()<.5?-1:1)*sp,rz=Math.pow(Math.random(),3)*(Math.random()<.5?-1:1)*sp;
      x=Math.cos(th)*r+rx;z=Math.sin(th)*r+rz;y=gauss()*.012}
    gp[i*3]=x;gp[i*3+1]=y;gp[i*3+2]=z;gr[i]=Math.min(1,Math.hypot(x,z));
    const q=Math.random(),cc=q<.035?[1,.42,.72]:q<.09?[1,.86,.6]:[.78+Math.random()*.22,.86+Math.random()*.14,1];
    gc.set(cc,i*3);gs[i]=bulge?1.4+Math.random()*1.8:.9+Math.random()*1.6+(q<.035?1.6:0);
  }
  const gg=new T.BufferGeometry();gg.setAttribute('position',new T.BufferAttribute(gp,3));gg.setAttribute('aCol',new T.BufferAttribute(gc,3));gg.setAttribute('aSize',new T.BufferAttribute(gs,1));gg.setAttribute('aR',new T.BufferAttribute(gr,1));
  const galU={uTime:{value:0},uPR:{value:pr},uSpin:{value:0},uGlow:{value:0},uArm:{value:new T.Color()},uCore:{value:new T.Color()}};
  const galaxy=new T.Points(gg,new T.ShaderMaterial({uniforms:galU,vertexShader:GAL_V,fragmentShader:GAL_F,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));galaxy.frustumCulled=false;
  const spr=(sz,op)=>{const m=new T.Sprite(new T.SpriteMaterial({map:glowTex(T),transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:op}));m.scale.set(sz,sz*.55,1);return m};
  const core1=spr(.9,.95),core2=spr(2.4,.32),core3=spr(.34,1);core3.scale.set(.34,.22,1);
  const disk=new T.Mesh(new T.PlaneGeometry(2.1,2.1),new T.MeshBasicMaterial({map:diskTex(T,ARMS),transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:.85,side:T.DoubleSide}));
  disk.rotation.x=-Math.PI/2;const diskG=new T.Group();diskG.add(disk);
  const gal=new T.Group();gal.add(diskG,galaxy,core2,core1,core3);gal.rotation.set(1.18,0,-.14);scene.add(gal);   // schräg von oben: Arme ragen über und unter den Karten heraus
  /* Sternschnuppen */
  const sTex=streakTex(T),shoot=[0,1].map(()=>{const m=new T.Mesh(new T.PlaneGeometry(1,1),new T.MeshBasicMaterial({map:sTex,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0}));m.visible=false;scene.add(m);return{m,t:0,life:0,v:new T.Vector3()}});
  let nextShoot=2+Math.random()*3;
  /* Sternenstaub nah vor der Kamera */
  const ND=small?26:40,dp=new Float32Array(ND*3),ds=new Float32Array(ND);
  for(let i=0;i<ND;i++){const z=-(40+Math.random()*150);dp[i*3]=(Math.random()*2-1)*-z*.8;dp[i*3+1]=(Math.random()*2-1)*-z*.9;dp[i*3+2]=z;ds[i]=18+Math.random()*44}
  const dg=new T.BufferGeometry();dg.setAttribute('position',new T.BufferAttribute(dp,3));dg.setAttribute('aSize',new T.BufferAttribute(ds,1));
  const dustU={uTime:{value:0},uPR:{value:pr},uCol:{value:new T.Color(.6,.8,1)}};
  const dust=new T.Points(dg,new T.ShaderMaterial({uniforms:dustU,vertexShader:DUST_V,fragmentShader:DUST_F,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));dust.frustumCulled=false;scene.add(dust);
  /* ---------- Farben / Stimmung (weich überblenden) ---------- */
  const cur={acc:cssRgb('--acc'),acc2:cssRgb('--acc2'),tint:null,zone:cachedZone()};
  const tgt={},now={};
  function target(){
    const z=cur.zone,zc=ZONE[z]||null,m=MOOD[z]||MOOD.n,a=cur.tint||cur.acc,a2=cur.tint?cur.acc2.map((c,i)=>(c+cur.tint[i])/2):cur.acc2;
    const zt=zc||a2,mix=(x,y,k)=>x.map((c,i)=>c+(y[i]-c)*k);
    tgt.A=mix(a,zt,zc?.32:0).map(c=>c/255*.68);
    tgt.B=mix(a2,zt,zc?.55:.15).map(c=>c/255*.58);
    tgt.Z=zt.map(c=>c/255*(z==='r'?.9:.5));
    tgt.Arm=mix(mix([96,128,255],a,.38),zt,zc?.35:0).map(c=>c/255*1.05);   // Arme: blau-violett, getönt von Reiter und Zone
    tgt.Core=mix([255,226,186],zt,z==='r'?.65:zc?.22:0).map(c=>c/255);
    tgt.Dust=mix(a,zt,.3).map(c=>c/255);
    Object.assign(tgt,m);
  }
  target();for(const k in tgt)now[k]=Array.isArray(tgt[k])?tgt[k].slice():tgt[k];
  function step(dt){
    const k=1-Math.exp(-dt*1.6);
    for(const n in tgt){if(Array.isArray(tgt[n]))now[n]=now[n].map((v,i)=>lerp(v,tgt[n][i],k));else now[n]=lerp(now[n],tgt[n],k)}
    nebU.uA.value.setRGB(...now.A);nebU.uB.value.setRGB(...now.B);nebU.uZ.value.setRGB(...now.Z);
    nebU.uDense.value=now.dense;nebU.uTurb.value=now.turb;nebU.uGlow.value=now.glow;starU.uTw.value=now.tw;
    galU.uArm.value.setRGB(...now.Arm);galU.uCore.value.setRGB(...now.Core);galU.uGlow.value=now.glow;
    core1.material.color.setRGB(...now.Core);disk.material.color.setRGB(...now.Arm.map(v=>v*.9));core2.material.color.setRGB(...now.Arm);core3.material.color.setRGB(1,.97,.9);dustU.uCol.value.setRGB(...now.Dust);
  }
  /* ---------- Größe; Galaxie hinter der Bildmitte ---------- */
  let W=0,H=0,hhG=1,hwG=1,dG=520;
  function resize(){
    let w=el.clientWidth||innerWidth,h=el.clientHeight||innerHeight;const sm=Math.max(screen.width||w,screen.height||h,800);w=Math.min(w,sm);h=Math.min(h,sm);   // nie größer als der Bildschirm (z. B. bei Ganzseiten-Aufnahmen)
    if(w===W&&h===H)return;W=w;H=h;
    R.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();
    const d=520,hh=d*Math.tan(cam.fov*Math.PI/360),hw=hh*cam.aspect,r=Math.max(hw*1.8,hh*(w<h?1.12:1.3));
    gal.position.set(0,-hh*.06,-d);gal.scale.setScalar(r);hhG=hh;hwG=hw;dG=d;   // Kern etwa hinter der Bildschirmmitte (dort stehen im Hub die Karten)
    const b=R.getDrawingBufferSize(new T.Vector2());nebU.uRes.value.copy(b);
  }
  /* ---------- Kamera: langsame Fahrt, leichte Parallaxe beim Scrollen, optional Geräteneigung ---------- */
  let tiltX=0,tiltY=0;const onTilt=e=>{if(!(window.LBUI&&LBUI.settings.tilt))return;tiltX=Math.max(-1,Math.min(1,(e.gamma||0)/35));tiltY=Math.max(-1,Math.min(1,((e.beta||45)-45)/35))};
  addEventListener('deviceorientation',onTilt,{passive:true});
  /* ---------- Schleife ---------- */
  const pre=[];let okSet=false;
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
    galU.uTime.value=t;galU.uSpin.value=spin*.6;diskG.rotation.y=-(spin*.6+t*.035);dustU.uTime.value=t;
    const pulse=1+.05*Math.sin(t*1.3)+now.glow*.12*Math.sin(t*5.7)*Math.sin(t*2.3);core1.scale.set(.9*pulse,.5*pulse,1);core2.material.opacity=.3+.08*Math.sin(t*.7)+now.glow*.1;
    // Sternschnuppen: alle paar Sekunden eine, quer über den oberen Himmel
    nextShoot-=dt;if(nextShoot<=0&&warp<.05){nextShoot=3+Math.random()*6;const s=shoot.find(x=>!x.m.visible);if(s){
      const dir=Math.random()<.5?-1:1,ang=dir*(.35+Math.random()*.35),sp=hhG*(1.1+Math.random()*.8);
      s.m.position.set((Math.random()*1.4-.7)*hwG,hhG*(.25+Math.random()*.6),-dG);s.v.set(-Math.cos(ang)*dir*sp,-Math.abs(Math.sin(ang))*sp,0);
      s.m.rotation.z=Math.atan2(s.v.y,s.v.x);s.m.scale.set(hhG*(.22+Math.random()*.18),hhG*.006,1);s.t=0;s.life=.7+Math.random()*.5;s.m.visible=true}}
    shoot.forEach(s=>{if(!s.m.visible)return;s.t+=dt;const k=s.t/s.life;if(k>=1){s.m.visible=false;return}s.m.position.addScaledVector(s.v,dt);s.m.material.opacity=Math.sin(k*Math.PI)*.9});
    for(const f of pre){try{f(dt,t,R)}catch(e){}}   // 3D-Objekte (lb-obj3d.js) mit demselben Renderer
    R.render(scene,cam);
    if(!okSet){okSet=true;try{localStorage.setItem('lb_space_ok','1')}catch(e){}}
    // einmalig: läuft es zäh, Auflösung senken (nie den Hintergrund wechseln)
    if(!tuned){if(!fpsT0)fpsT0=ms+1200;else if(ms>fpsT0){frames++;if(ms-fpsT0>2500){tuned=true;const fps=frames*1000/(ms-fpsT0);if(fps<38&&pr>1){pr=1;R.setPixelRatio(pr);starU.uPR.value=galU.uPR.value=dustU.uPR.value=pr;W=0}}}}
    raf=requestAnimationFrame(frame);
  }
  const run=()=>{if(!raf&&alive&&!document.hidden){last=0;raf=requestAnimationFrame(frame)}};
  const vis=()=>{if(document.hidden){cancelAnimationFrame(raf);raf=0}else run()};
  document.addEventListener('visibilitychange',vis);
  const onTint=e=>{cur.tint=e&&e.detail||null;target()};
  window.addEventListener('lb-tint',onTint);
  const onSpin=e=>{spinT=+e.detail||0;run()};window.addEventListener('lb-spin',onSpin);if(window.__lbTint)cur.tint=window.__lbTint;target();
  const onLost=e=>{try{e.preventDefault()}catch(x){}alive=false;window.dispatchEvent(new Event('lb-space-gone'));cancelAnimationFrame(raf);raf=0;if(opts.onFail)opts.onFail()};
  cv.addEventListener('webglcontextlost',onLost,false);
  readZone(z=>{if(z!==cur.zone){cur.zone=z;target()}});
  // Ankunft nach einem Warp: Sterne laufen aus (Zeitstempel von lb-warp.js)
  try{const w=+sessionStorage.getItem('lb_warp_in')||0;if(Date.now()-w<3000){warp=1;warpT=.1;decay=2.4}}catch(e){}
  resize();run();
  const api={
    el,renderer:R,THREE:T,scene,camera:cam,
    recolor(){cur.acc=cssRgb('--acc');cur.acc2=cssRgb('--acc2');target()},
    setZone(z){cur.zone=ZONE[z]?z:'n';target()},
    get zone(){return cur.zone},
    pre(f){pre.push(f);run()},
    warp(sec,rgb,soft){warpT=Math.max(warpT,sec||.6);ramp=soft?2.2:10;decay=soft?2.4:6;if(rgb)strU.uTint.value.setRGB(rgb[0]/255,rgb[1]/255,rgb[2]/255);run()},
    destroy(){alive=false;cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',vis);window.removeEventListener('lb-tint',onTint);window.removeEventListener('lb-spin',onSpin);removeEventListener('deviceorientation',onTilt);
      try{lg.dispose();streaks.material.dispose();sg.dispose();gg.dispose();dg.dispose();neb.geometry.dispose();[neb,stars,galaxy,dust,core1,core2,core3,disk].forEach(m=>m.material.dispose());disk.geometry.dispose();shoot.forEach(s=>{s.m.geometry.dispose();s.m.material.dispose()});R.dispose()}catch(e){}if(window.LBSpace&&LBSpace.current===api)LBSpace.current=null;window.dispatchEvent(new Event('lb-space-gone'))}
  };
  window.LBSpace.current=api;
  setTimeout(()=>window.dispatchEvent(new Event('lb-space-ready')),0);
  return api;
}
window.LBSpace={create,current:null,zoneOf,ZONE};
})();
