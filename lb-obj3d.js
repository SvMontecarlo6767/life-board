/* Life Board – 3D-Objekte je Reiter (nur Cockpit bei voller Leistung; nur Darstellung, Daten nur gelesen über LBData).
   Nur auf den Karussell-Karten im Hub (lb-hub3d.js) – in den Reitern selbst keine Objekte (Wunsch: dort Zahlen und Graphen animieren, lb-fx.js).
     Recovery  = Energiekern: leuchtende Kugel mit Ringen, pulsiert im Ruhepuls-Takt, Farbe = Zone (grün ruhig, rot flackernd)
     Training  = Wochen-Ring: 7 Segmente Mo–So, erledigt leuchtet in Sportart-Farbe (wie plan.js), heute pulsiert
     Check-in  = morgens Sonne, abends Mond; Glanz je Stimmung, erledigt = voll leuchtend
     Kalender = 3D-Zeitband mit den nächsten Terminen · Muster = Netz aus leuchtenden Knoten
   Ein Renderer pro Seite: gezeichnet wird mit dem Renderer der Weltraum-Welt (LBSpace.current), jedes Objekt in einen Bereich
   des Bildpuffers und von dort in sein eigenes 2D-Canvas kopiert (Ersatzweg: Render-Target + Auslesen, falls ein Browser
   beim Kopieren leer liefert). Ohne Weltraum-Welt (anderer Hintergrund, Performance, Dschungel, kein WebGL): keine Objekte,
   die Karten behalten ihr Emblem. Beim Wischen drehen die Objekte mit. */
(function(){
'use strict';
if(window.LBObj)return;
const root=document.documentElement;
const reduced=()=>{try{return matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}};
const active=()=>root.getAttribute('data-theme')!=='jungle'&&!(window.LBUI&&LBUI.settings.perf)&&!reduced();
let T=null;const items=new Set();let hooked=null;
/* ---------- Hilfen ---------- */
const col=(rgb,k)=>new T.Color(rgb[0]/255*(k||1),rgb[1]/255*(k||1),rgb[2]/255*(k||1));
let glowTex=null;
function glowTexture(){if(glowTex)return glowTex;const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);
  g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.18,'rgba(255,255,255,.55)');g.addColorStop(.45,'rgba(255,255,255,.14)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(0,0,128,128);
  glowTex=new T.CanvasTexture(c);return glowTex}
function glow(rgb,size,op){const s=new T.Sprite(new T.SpriteMaterial({map:glowTexture(),color:col(rgb),transparent:true,blending:T.AdditiveBlending,depthWrite:false,opacity:op==null?1:op}));s.scale.setScalar(size);return s}
const NOISE3=`float h3(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float n3(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fb(vec3 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*n3(p);p=p*2.03+3.1;a*=.5;}return v;}`;
const SV=`varying vec3 vN;varying vec3 vP;varying vec3 vV;void main(){vP=position;vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
/* Kugel-Shader: mode 0 Plasma (Kern), 1 Sonne, 2 Mond, 3 Globus */
const SF=`precision highp float;uniform float uT;uniform vec3 uA;uniform vec3 uB;uniform float uI;uniform float uF;uniform int uMode;varying vec3 vN;varying vec3 vP;varying vec3 vV;${NOISE3}
void main(){
  vec3 n=normalize(vN);float fr=pow(1.-max(dot(n,normalize(vV)),0.),2.2),l=max(dot(n,normalize(vec3(-.5,.6,.7))),0.);vec3 c;
  if(uMode==0){float p=fb(vP*3.+vec3(0.,uT*.6,uT*.3));float q=fb(vP*6.-uT*.4);c=mix(uA*.28,uA*1.1,p)+mix(uA,uB,.5)*pow(q,4.)*.7;c*=uI*(1.+uF*(n3(vec3(uT*14.,0.,0.))-.5)*.9);c+=uA*fr*1.25;}
  else if(uMode==1){float p=fb(vP*5.+uT*.25);c=mix(vec3(1.,.42,.08),vec3(1.,.93,.6),p)*(.7+.6*uI);c+=vec3(1.,.7,.3)*fr*1.2*uI;}
  else if(uMode==2){float cr=fb(vP*4.);float cr2=smoothstep(.55,.6,fb(vP*9.+1.7));c=mix(vec3(.42,.46,.55),vec3(.85,.88,.95),cr)-cr2*.18;c*=(.25+.85*l)*(.6+.5*uI);c+=uA*fr*.7*uI;}
  else{float land=smoothstep(.5,.54,fb(vP*2.2+vec3(0.,0.,uT*.0)));vec3 sea=uA*.35,ground=mix(uB*.9,vec3(.9,.95,1.),.25);c=mix(sea,ground,land)*(.35+.8*l);c+=uA*fr*1.2;float city=step(.82,n3(vP*40.))*land*(1.-l)*.8;c+=vec3(1.,.85,.5)*city;}
  gl_FragColor=vec4(c,1.);
}`;
function sphere(r,mode,a,b,seg){const m=new T.ShaderMaterial({uniforms:{uT:{value:0},uA:{value:col(a)},uB:{value:col(b||a)},uI:{value:1},uF:{value:0},uMode:{value:mode}},vertexShader:SV,fragmentShader:SF});return new T.Mesh(new T.SphereGeometry(r,seg||48,Math.round((seg||48)*.7)),m)}
function add(rgb,op){return new T.MeshBasicMaterial({color:col(rgb),transparent:true,opacity:op==null?1:op,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide})}
function ringLine(r,rgb,op,seg){const g=new T.BufferGeometry(),p=[];seg=seg||128;for(let i=0;i<=seg;i++){const a=i/seg*Math.PI*2;p.push(Math.cos(a)*r,0,Math.sin(a)*r)}g.setAttribute('position',new T.Float32BufferAttribute(p,3));return new T.Line(g,new T.LineBasicMaterial({color:col(rgb),transparent:true,opacity:op,blending:T.AdditiveBlending,depthWrite:false}))}
/* Funken (gemeinsam für Effekte) */
function sparks(group,rgb,n){
  const g=new T.BufferGeometry(),P=new Float32Array(n*3),V=[];for(let i=0;i<n;i++)V.push(new T.Vector3().randomDirection?new T.Vector3().randomDirection():new T.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).normalize());
  g.setAttribute('position',new T.BufferAttribute(P,3));
  const m=new T.PointsMaterial({color:col(rgb),size:.07,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,map:glowTexture()});
  const pts=new T.Points(g,m);group.add(pts);let k=1;
  return{fire(){k=0},update(dt){if(k>=1){m.opacity=0;return}k=Math.min(1,k+dt*1.1);const r=.3+2.2*(1-Math.pow(1-k,3));for(let i=0;i<n;i++){P[i*3]=V[i].x*r*(.6+.4*((i*7)%5)/5);P[i*3+1]=V[i].y*r;P[i*3+2]=V[i].z*r}g.attributes.position.needsUpdate=true;m.opacity=1-k;m.size=.09*(1-k*.5)}};
}
function shock(group,rgb){const t=new T.Mesh(new T.TorusGeometry(1,.02,8,96),add(rgb,0));group.add(t);let k=1;return{fire(){k=0},update(dt){if(k>=1){t.visible=false;return}t.visible=true;k=Math.min(1,k+dt*1.4);t.scale.setScalar(.6+2.4*k);t.material.opacity=(1-k)*.9}}}
/* ---------- Objekte ---------- */
const BUILD={};
BUILD.core=d=>{   // Recovery
  const g=new T.Group(),rgb=d&&d.rgb||[58,215,255],core=sphere(.55,0,rgb,[255,255,255],56),halo=glow(rgb,3.2,.85),rings=[];
  g.add(halo,core);
  [[.95,.016,[1.2,0,.3]],[1.18,.01,[.4,.9,0]],[1.4,.008,[-.9,.2,.6]]].forEach(([r,tb,rot],i)=>{const t=new T.Mesh(new T.TorusGeometry(r,tb*.7,8,160),add(i?rgb.map(c=>Math.round(c*.6+255*.4)):rgb,i?.32:.85));t.rotation.set(...rot);rings.push(t);g.add(t)});
  const orb=new T.Group();for(let i=0;i<3;i++){const s=glow(rgb,.22,1);s.userData.a=i*2.1;orb.add(s)}g.add(orb);
  const sp=sparks(g,rgb,70),sh=shock(g,rgb);
  let rhr=d&&d.rhr||60,zone=d&&d.zone||'n',boost=0;
  return{g,
    set(d){if(!d)return;const c=col(d.rgb);core.material.uniforms.uA.value.copy(c);halo.material.color.copy(c);rings.forEach((r,i)=>r.material.color.copy(i?col(d.rgb.map(x=>Math.round(x*.6+255*.4))):c));orb.children.forEach(s=>s.material.color.copy(c));sp&&0;rhr=d.rhr||60;zone=d.zone},
    update(dt,t){
      const P=60/Math.max(35,Math.min(120,rhr)),ph=(t%P)/P,beat=Math.exp(-Math.pow((ph-.08)/.05,2))+.55*Math.exp(-Math.pow((ph-.3)/.06,2));
      const fl=zone==='r'?1:zone==='y'?.35:0,s=1+.09*beat+boost*.3;core.scale.setScalar(s);halo.scale.setScalar(3.2*(1+.12*beat+boost));halo.material.opacity=.7+.3*beat;
      const u=core.material.uniforms;u.uT.value=t;u.uF.value=fl;u.uI.value=1+.35*beat+boost;
      rings.forEach((r,i)=>{r.rotation.y+=dt*(.5+i*.35)*(i%2?-1:1)*(1+fl*.8);r.rotation.z+=dt*.12*(i+1)});
      orb.children.forEach((s,i)=>{const a=s.userData.a+t*(1.2+i*.3);s.position.set(Math.cos(a)*1.18,Math.sin(a*1.3)*.35,Math.sin(a)*1.18)});
      boost=Math.max(0,boost-dt*1.6);sp.update(dt);sh.update(dt);
    },
    fx(){boost=1;sp.fire();sh.fire()}};
};
BUILD.ring=d=>{   // Training: Wochen-Ring
  const g=new T.Group(),inner=new T.Group();g.add(inner);inner.rotation.x=-1.05;
  const seg=Math.PI*2/7,gap=.07,segs=[];
  for(let i=0;i<7;i++){const m=new T.Mesh(new T.TorusGeometry(1,.15,14,40,seg-gap),new T.MeshBasicMaterial({color:0x223548,transparent:true,opacity:.9}));
    m.rotation.z=Math.PI/2-(i+1)*seg+gap/2;inner.add(m);const gl=glow([255,255,255],.7,0);inner.add(gl);const a=Math.PI/2-(i+.5)*seg;gl.position.set(Math.cos(a),Math.sin(a),0);segs.push({m,gl,a})}
  const prog=new T.Mesh(new T.TorusGeometry(.72,.03,8,120,.001),add([255,84,96],.95));prog.rotation.z=Math.PI/2;inner.add(prog);
  const core=glow([255,84,96],1.4,.45);g.add(core);
  const sp=sparks(g,[255,170,120],60);let days=[],wave=-1,frac=0,fracT=0;
  function set(d){
    days=(d&&d.days)||[];fracT=d&&d.plan?Math.min(1,d.done/d.plan):0;
    segs.forEach((s,i)=>{const x=days[i]||{st:'rest'},c=x.rgb||[143,166,189];
      const on=x.st==='done'||x.st==='part';s.on=on;s.c=c;s.st=x.st;s.now=!!x.now;
      s.m.material.color.copy(on?col(c,x.st==='part'?.6:1.1):x.st==='miss'?col([255,106,92],.35):x.st==='plan'?col([120,160,200],.45):col([60,80,100],.35));
      s.gl.material.color.copy(col(on?c:[255,255,255]));s.gl.material.opacity=on?.9:0});
  }
  set(d);
  return{g,set,
    update(dt,t){
      frac+=(fracT-frac)*Math.min(1,dt*2);const arc=Math.max(.001,frac*Math.PI*2);if(Math.abs((prog.userData.arc||0)-arc)>.002){prog.geometry.dispose();prog.geometry=new T.TorusGeometry(.72,.03,8,120,arc);prog.userData.arc=arc;prog.rotation.z=Math.PI/2-arc}
      segs.forEach((s,i)=>{let k=s.on?1:0;if(s.now){const p=.5+.5*Math.sin(t*4);k=Math.max(k,.35+.65*p);s.gl.material.color.copy(col(s.on?s.c:[255,255,255]));s.gl.material.opacity=.4+.6*p}
        if(wave>=0){const w=Math.max(0,1-Math.abs(wave-i)*.9);s.m.scale.setScalar(1+.12*w);if(w>0){s.gl.material.opacity=Math.max(s.gl.material.opacity,w)}}else s.m.scale.setScalar(1)});
      if(wave>=0){wave+=dt*9;if(wave>8)wave=-1}
      core.material.opacity=.35+.15*Math.sin(t*2);inner.rotation.z+=dt*.15;sp.update(dt);
    },
    fx(){wave=0;sp.fire()}};
};
BUILD.sun=d=>{   // Check-in: Sonne (morgens) / Mond (abends)
  const g=new T.Group(),eve=d&&d.eve!=null?!!d.eve:(window.LBData?LBData.berlinHour()>=17:new Date().getHours()>=17),b=sphere(.62,eve?2:1,eve?[150,190,255]:[255,190,90],null,56),halo=glow(eve?[150,190,255]:[255,170,70],eve?2.4:3.4,.8);
  g.add(halo,b);const rays=new T.Group();
  if(!eve){for(let i=0;i<14;i++){const r=new T.Mesh(new T.PlaneGeometry(.06,.5),add([255,200,110],.55));const a=i/14*Math.PI*2;r.position.set(Math.cos(a)*1.05,Math.sin(a)*1.05,0);r.rotation.z=a-Math.PI/2;rays.add(r)}}
  else{for(let i=0;i<10;i++){const s=glow([220,235,255],.16,.9);s.position.set((Math.random()*2-1)*1.8,(Math.random()*2-1)*1.2,-.5-Math.random());s.userData.p=Math.random()*6;rays.add(s)}}
  g.add(rays);const sp=sparks(g,eve?[200,220,255]:[255,200,100],60),sh=shock(g,eve?[180,210,255]:[255,180,80]);
  let shine=.5,boost=0;
  function set(d){if(!d)return;const m=d.mood?d.mood/5:.5;shine=d.done?1:.35+.45*m}
  set(d);
  return{g,set,update(dt,t){
    const u=b.material.uniforms;u.uT.value=t;u.uI.value=shine+boost;halo.material.opacity=(.35+.6*shine)*(1+boost*.6);halo.scale.setScalar((eve?2.4:3.4)*(.85+.25*shine+boost*.3)*(1+.03*Math.sin(t*1.7)));
    if(!eve){rays.rotation.z+=dt*.18;rays.children.forEach((r,i)=>{r.scale.y=.7+.5*shine+.25*Math.sin(t*2+i)+boost;r.material.opacity=.25+.45*shine})}
    else rays.children.forEach(s=>{s.material.opacity=.4+.6*Math.abs(Math.sin(t*1.3+s.userData.p))});
    b.rotation.y+=dt*.08;boost=Math.max(0,boost-dt*1.4);sp.update(dt);sh.update(dt)},
    fx(){boost=.8;sp.fire();sh.fire()}};
};
BUILD.band=d=>{   // Kalender: Zeitband
  const g=new T.Group(),inner=new T.Group();g.add(inner);inner.rotation.x=.35;
  const R=1.6,A0=-1.1,A1=1.1,N=64,pos=[],uv=[],idx=[];
  for(let i=0;i<=N;i++){const a=A0+(A1-A0)*i/N;for(const y of[-.16,.16]){pos.push(Math.sin(a)*R,y,Math.cos(a)*R-R);uv.push(i/N,y>0?1:0)}if(i<N){const k=i*2;idx.push(k,k+1,k+2,k+1,k+3,k+2)}}
  const bg=new T.BufferGeometry();bg.setAttribute('position',new T.Float32BufferAttribute(pos,3));bg.setAttribute('uv',new T.Float32BufferAttribute(uv,2));bg.setIndex(idx);
  const bm=new T.ShaderMaterial({uniforms:{uT:{value:0},uC:{value:col([255,200,70])}},transparent:true,depthWrite:false,blending:T.AdditiveBlending,side:T.DoubleSide,
    vertexShader:'varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:'precision mediump float;uniform float uT;uniform vec3 uC;varying vec2 vU;void main(){float e=smoothstep(.0,.15,vU.y)*smoothstep(1.,.85,vU.y);float tick=step(.94,fract(vU.x*14.-uT*.15));float edge=smoothstep(.12,0.,abs(vU.y-.5)-.38);float fade=smoothstep(0.,.15,vU.x)*smoothstep(1.,.85,vU.x);gl_FragColor=vec4(uC*(.18*e+.55*tick*e+.6*edge)*fade,1.);}'});
  inner.add(new T.Mesh(bg,bm));
  const now=new T.Mesh(new T.PlaneGeometry(.025,.9),add([255,255,255],.85));const a0=A0+(A1-A0)*.12;now.position.set(Math.sin(a0)*R,0,Math.cos(a0)*R-R);now.rotation.y=a0;inner.add(now);const ng=glow([255,230,160],.6,.8);ng.position.copy(now.position);inner.add(ng);
  let blocks=[];const sp=sparks(g,[255,210,120],50);let bounce=1;
  function set(d){blocks.forEach(b=>{inner.remove(b.m);inner.remove(b.gl)});blocks=[];
    (d||[]).slice(0,6).forEach((o,i)=>{const f=.12+.85*Math.min(1,((o.inDays||0)+(o.time?(+o.time.slice(0,2))/24:.5))/7);const a=A0+(A1-A0)*f;
      const m=new T.Mesh(new T.BoxGeometry(.2,.2,.2),new T.MeshBasicMaterial({color:col(i?[255,200,70]:[255,240,190]),transparent:true,opacity:.95}));m.position.set(Math.sin(a)*R,.0,Math.cos(a)*R-R);m.rotation.y=a;
      const gl=glow([255,200,70],i?.6:.9,.9);gl.position.copy(m.position);inner.add(m,gl);blocks.push({m,gl,y:0,i})})}
  set(d);
  return{g,set,update(dt,t){bm.uniforms.uT.value=t;blocks.forEach(b=>{b.m.rotation.x+=dt*.6;b.m.rotation.z+=dt*.4;const j=bounce<1?Math.sin(Math.max(0,bounce*Math.PI*2-b.i*.5))*.35*(1-bounce):0;b.m.position.y=.05*Math.sin(t*1.6+b.i)+Math.max(0,j);b.gl.position.y=b.m.position.y});
    bounce=Math.min(1,bounce+dt*.9);sp.update(dt)},fx(){bounce=0;sp.fire()}};
};
BUILD.net=()=>{   // Muster: Netz
  const g=new T.Group(),N=16,P=[],nodes=[];
  for(let i=0;i<N;i++){const v=new T.Vector3(Math.random()*2-1,Math.random()*2-1,Math.random()*2-1).normalize().multiplyScalar(.55+Math.random()*.6);P.push(v)}
  const E=[];P.forEach((a,i)=>{P.map((b,j)=>[j,a.distanceTo(b)]).filter(x=>x[0]!==i).sort((x,y)=>x[1]-y[1]).slice(0,2).forEach(([j])=>{if(!E.some(e=>e[0]===j&&e[1]===i))E.push([i,j])})});
  const lp=[];E.forEach(([i,j])=>lp.push(P[i].x,P[i].y,P[i].z,P[j].x,P[j].y,P[j].z));
  const lg=new T.BufferGeometry();lg.setAttribute('position',new T.Float32BufferAttribute(lp,3));const lm=new T.LineBasicMaterial({color:col([140,220,255]),transparent:true,opacity:.45,blending:T.AdditiveBlending,depthWrite:false});g.add(new T.LineSegments(lg,lm));
  P.forEach((p,i)=>{const s=glow(i%3?[120,230,255]:[190,140,255],i%5?.32:.5,.95);s.position.copy(p);g.add(s);nodes.push(s);const c=new T.Mesh(new T.SphereGeometry(.035,10,8),new T.MeshBasicMaterial({color:0xffffff}));c.position.copy(p);g.add(c)});
  const pulses=Array.from({length:10},(_,i)=>{const s=glow([255,255,255],.2,1);g.add(s);return{s,e:E[i%E.length],k:Math.random()}});
  let burst=0;
  return{g,set(){},update(dt,t){g.rotation.y+=dt*.2;g.rotation.x=Math.sin(t*.3)*.2;
    nodes.forEach((n,i)=>{n.material.opacity=.55+.45*Math.sin(t*2+i)+burst});
    pulses.forEach(p=>{p.k+=dt*(.6+burst*2);if(p.k>1){p.k=0;p.e=E[(Math.random()*E.length)|0]}const a=P[p.e[0]],b=P[p.e[1]];p.s.position.lerpVectors(a,b,p.k);p.s.scale.setScalar(.2+burst*.3)});
    lm.opacity=.4+burst*.5;burst=Math.max(0,burst-dt*.8)},
    fx(){burst=1}};
};
/* ---------- Einbinden: Canvas 2D je Objekt, Zeichnen im Takt der Weltraum-Welt ---------- */
function mount(el,type,data,opt){
  if(!active()||!T||!BUILD[type])return null;
  opt=opt||{};
  const cv=document.createElement('canvas');cv.className='lb-o3';cv.setAttribute('aria-hidden','true');cv.style.cssText='display:block;width:100%;height:100%;mix-blend-mode:screen';
  el.innerHTML='';el.append(cv);
  const scene=new T.Scene(),cam=new T.PerspectiveCamera(opt.fov||38,1,.1,50);cam.position.set(0,0,opt.dist||4.6);
  const o=BUILD[type](data);scene.add(o.g);
  const it={front:!!opt.big,el,cv,ctx:cv.getContext('2d'),scene,cam,o,type,vis:true,rx:0,ry:0,vx:0,vy:.0,spin:0,big:!!opt.big,blank:0};
  if(opt.big)interact(it);
  items.add(it);
  it.w=cv.clientWidth;it.h=cv.clientHeight;
  if('ResizeObserver' in window){it.ro=new ResizeObserver(es=>{const r=es[0].contentRect;it.w=r.width;it.h=r.height});it.ro.observe(cv)}else addEventListener('resize',()=>{it.w=cv.clientWidth;it.h=cv.clientHeight});
  if('IntersectionObserver' in window){it.io=new IntersectionObserver(es=>es.forEach(e=>{it.inView=e.isIntersecting}));it.io.observe(cv)}else it.inView=true;
  return{set(d){o.set(d)},setFront(v){it.front=!!v},fx(){o.fx();try{LBUI.sound('ok')}catch(e){}},remove(){items.delete(it);try{it.io&&it.io.disconnect();it.ro&&it.ro.disconnect()}catch(e){}cv.remove()},setVisible(v){it.vis=v},spin(v){it.spin=v},it};
}
function interact(it){
  const c=it.cv;c.style.touchAction='pan-y';c.style.cursor='grab';let P=null;
  c.addEventListener('pointerdown',e=>{P={x:e.clientX,y:e.clientY,t:performance.now(),moved:false,h:false}});
  c.addEventListener('pointermove',e=>{if(!P)return;const dx=e.clientX-P.x,dy=e.clientY-P.y;
    if(!P.h&&Math.abs(dx)>6&&Math.abs(dx)>Math.abs(dy)){P.h=true;try{c.setPointerCapture(e.pointerId)}catch(x){}}
    if(P.h){it.vy=dx*.0009/.016;it.vx=dy*.0006/.016;it.ry+=dx*.012;it.rx=Math.max(-.9,Math.min(.9,it.rx+dy*.008));P.x=e.clientX;P.y=e.clientY;P.moved=true}
    else if(Math.abs(dy)>10)P=null});
  const up=()=>{if(P&&!P.moved&&performance.now()-P.t<400){it.o.fx();try{LBUI.sound('ok')}catch(e){}}P=null};
  c.addEventListener('pointerup',up);c.addEventListener('pointercancel',()=>{P=null});
}
let rt=null,buf=null,TMP=null,FRAME=0;
function draw(dt,t,R){
  if(!items.size)return;
  if(!TMP)TMP={a:new T.Vector2(),b:new T.Vector2(),c:new T.Color()};   // einmal anlegen, nicht in jedem Bild (keine Mini-Hänger)
  const size=R.getDrawingBufferSize(TMP.a),pr=R.getPixelRatio(),full=R.getSize(TMP.b),cc=R.getClearColor(TMP.c),ca=R.getClearAlpha();FRAME++;
  R.setClearColor(0x000000,1);   // schwarz + mix-blend-mode:screen am Canvas = durchsichtig auf der Karte
  for(const it of items){
    if(!it.vis||it.inView===false||!it.cv.isConnected)continue;
    if(!it.front&&(FRAME&1)){it.skipDt=(it.skipDt||0)+dt;continue}   // seitliche Karten: jedes zweite Bild (die vordere immer)
    const idt=dt+(it.skipDt||0);it.skipDt=0;
    const w=it.w,h=it.h;if(w<4||h<4)continue;   // Größe aus dem ResizeObserver (kein Layout-Lesen pro Bild)
    const pw=Math.min(Math.round(w*pr),size.x),ph=Math.min(Math.round(h*pr),size.y);
    if(it.cv.width!==pw||it.cv.height!==ph){it.cv.width=pw;it.cv.height=ph}
    it.cam.aspect=w/h;it.cam.updateProjectionMatrix();
    // Drehen mit dem Finger / Schwung, sonst langsam von selbst
    it.vy*=Math.exp(-idt*2.2);it.vx*=Math.exp(-idt*2.2);it.ry+=(it.vy+it.spin+.18)*idt;it.rx+=it.vx*idt;it.rx*=Math.exp(-idt*.8);it.spin*=Math.exp(-idt*3);
    it.o.g.rotation.y=it.ry;it.o.g.rotation.x=it.rx;
    it.o.update(idt,t);
    if(!it.rt){
      R.setScissorTest(true);R.setViewport(0,0,pw/pr,ph/pr);R.setScissor(0,0,pw/pr,ph/pr);R.clear();R.render(it.scene,it.cam);
      it.ctx.clearRect(0,0,pw,ph);it.ctx.drawImage(R.domElement,0,size.y-ph,pw,ph,0,0,pw,ph);
      if(it.blank<6){it.blank++;try{const d=it.ctx.getImageData(0,0,pw,ph).data;let sum=0;for(let i=0;i<d.length;i+=4*97)sum+=d[i]+d[i+1]+d[i+2];if(sum>0)it.blank=99;else if(it.blank>=5)it.rt=true}catch(e){it.blank=99}}   // leer kopiert? -> Ersatzweg
    }else{   // Ersatzweg: Render-Target und Auslesen (seltener, kostet mehr)
      if((it.skip=(it.skip||0)+1)%2)continue;
      if(!rt||rt.width!==pw||rt.height!==ph){if(rt)rt.dispose();rt=new T.WebGLRenderTarget(pw,ph);buf=new Uint8Array(pw*ph*4)}
      R.setRenderTarget(rt);R.clear();R.render(it.scene,it.cam);R.readRenderTargetPixels(rt,0,0,pw,ph,buf);R.setRenderTarget(null);
      const img=it.ctx.createImageData(pw,ph);for(let y=0;y<ph;y++)img.data.set(buf.subarray((ph-1-y)*pw*4,(ph-y)*pw*4),y*pw*4);it.ctx.putImageData(img,0,0);
    }
  }
  R.setScissorTest(false);R.setViewport(0,0,full.x,full.y);R.setClearColor(cc,ca);
}
/* ---------- Start, sobald die Weltraum-Welt läuft ---------- */
const waiters=[];
function ready(cb){if(T&&hooked)cb();else waiters.push(cb)}
function hook(){
  const sp=window.LBSpace&&LBSpace.current;if(!sp||hooked===sp)return;
  T=sp.THREE;hooked=sp;sp.pre(draw);
  while(waiters.length){try{waiters.shift()()}catch(e){}}
  window.dispatchEvent(new Event('lb-obj-ready'));
}
window.addEventListener('lb-space-ready',hook);hook();
window.addEventListener('lb-space-gone',()=>{hooked=null;for(const it of [...items]){items.delete(it);try{it.io&&it.io.disconnect()}catch(e){}it.cv.remove()}window.dispatchEvent(new Event('lb-obj-gone'))});
window.LBObj={mount,ready,get on(){return !!(T&&hooked)},TYPES:Object.keys(BUILD),get count(){return items.size}};
})();
