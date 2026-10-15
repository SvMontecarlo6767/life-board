/* Jarvis-Kern (Three.js): goldene Hologramm-Kugel aus Partikeln, Datenfragmenten und ineinander verschachtelten Ringen mit pulsierendem Kern.
   Zustände: idle, listening, thinking, speaking, error. Eingaben: setLevel (Mikrofonpegel), setAmp (Pegel der Sprachausgabe).
   Alles in einem Canvas, DPR max. 2, Pause bei verstecktem Tab, im Performance-Modus deutlich weniger Objekte und 30 fps. */
(function(root){
'use strict';
function create(canvas,opt){
  const T=root.THREE;if(!T)throw new Error('THREE fehlt');
  opt=opt||{};let perf=!!opt.perf;
  const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'low-power'});
  const DPR=Math.min(root.devicePixelRatio||1,2);renderer.setPixelRatio(DPR);renderer.setClearColor(0x000000,0);
  const scene=new T.Scene(),cam=new T.PerspectiveCamera(38,1,.1,50);cam.position.set(0,0,4.4);
  const G1=new T.Color(1,.70,.22),G2=new T.Color(1,.42,.10),HI=new T.Color(1,.92,.62),ERR1=new T.Color(1,.26,.16),ERR2=new T.Color(1,.5,.12);
  const col1=G1.clone(),col2=G2.clone();
  const root3=new T.Group();root3.rotation.x=.28;scene.add(root3);
  const rnd=(a,b)=>a+Math.random()*(b-a);
  /* ---- Partikel-Schale ---- */
  const NS=perf?520:1250,sp=new Float32Array(NS*3),sSize=new Float32Array(NS),sPh=new Float32Array(NS),sMix=new Float32Array(NS);
  const GA=Math.PI*(3-Math.sqrt(5));
  for(let i=0;i<NS;i++){const y=1-(i/(NS-1))*2,r=Math.sqrt(1-y*y),th=GA*i,rad=1+(Math.random()<.78?rnd(-.05,.05):rnd(.05,.2));
    sp[i*3]=Math.cos(th)*r*rad;sp[i*3+1]=y*rad;sp[i*3+2]=Math.sin(th)*r*rad;sSize[i]=rnd(.8,3.2)*(Math.random()<.06?2.2:1);sPh[i]=rnd(0,6.28);sMix[i]=Math.random()}
  const sg=new T.BufferGeometry();sg.setAttribute('position',new T.BufferAttribute(sp,3));sg.setAttribute('aSize',new T.BufferAttribute(sSize,1));sg.setAttribute('aPh',new T.BufferAttribute(sPh,1));sg.setAttribute('aMix',new T.BufferAttribute(sMix,1));
  const U={uTime:{value:0},uPulse:{value:0},uC1:{value:col1},uC2:{value:col2},uScale:{value:100},uFlick:{value:1}};
  const sm=new T.ShaderMaterial({uniforms:U,transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    vertexShader:'attribute float aSize;attribute float aPh;attribute float aMix;uniform float uTime,uPulse,uScale;varying float vMix;varying float vTw;void main(){vMix=aMix;vTw=.55+.45*sin(uTime*2.2+aPh*3.0);vec3 p=position*(1.0+uPulse*.09*sin(aPh*2.0+uTime*9.0));vec4 mv=modelViewMatrix*vec4(p,1.0);gl_PointSize=aSize*uScale*(.8+.5*vTw)/-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader:'uniform vec3 uC1,uC2;uniform float uFlick;varying float vMix;varying float vTw;void main(){float d=length(gl_PointCoord-.5);if(d>.5)discard;float a=smoothstep(.5,.0,d);vec3 c=mix(uC1,uC2,vMix);gl_FragColor=vec4(c*(.7+.6*vTw),a*a*.95*uFlick);}'});
  const shell=new T.Points(sg,sm);root3.add(shell);
  /* ---- Datenfragmente: kleine Rechtecke tangential auf der Schale ---- */
  const NF=perf?26:70,fl=[];
  for(let i=0;i<NF;i++){const u=Math.random()*2-1,th=Math.random()*6.28,r=Math.sqrt(1-u*u),n=new T.Vector3(Math.cos(th)*r,u,Math.sin(th)*r),t1=new T.Vector3().crossVectors(n,new T.Vector3(0,1,.0001)).normalize(),t2=new T.Vector3().crossVectors(n,t1).normalize(),c=n.clone().multiplyScalar(rnd(.98,1.12)),w=rnd(.03,.16),h=rnd(.02,.08);
    const p=[c.clone().addScaledVector(t1,-w).addScaledVector(t2,-h),c.clone().addScaledVector(t1,w).addScaledVector(t2,-h),c.clone().addScaledVector(t1,w).addScaledVector(t2,h),c.clone().addScaledVector(t1,-w).addScaledVector(t2,h)];
    for(let k=0;k<4;k++){const a=p[k],b=p[(k+1)%4];fl.push(a.x,a.y,a.z,b.x,b.y,b.z)}}
  const fg=new T.BufferGeometry();fg.setAttribute('position',new T.Float32BufferAttribute(fl,3));
  const fm=new T.LineBasicMaterial({color:HI.clone(),transparent:true,opacity:.35,blending:T.AdditiveBlending,depthWrite:false});
  const frags=new T.LineSegments(fg,fm);root3.add(frags);
  /* ---- Ringe ---- */
  const RN=perf?4:8,rings=[];
  for(let i=0;i<RN;i++){
    const rad=.38+i*(.9/RN)+rnd(0,.06),seg=140,pts=[];
    for(let k=0;k<seg;k++){const a=k/seg*6.2832;pts.push(Math.cos(a)*rad,0,Math.sin(a)*rad)}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));
    const m=new T.LineBasicMaterial({color:(i%3?col1:HI).clone(),transparent:true,opacity:i%3?.5:.8,blending:T.AdditiveBlending,depthWrite:false});
    const line=new T.LineLoop(g,m),grp=new T.Group();grp.add(line);
    if(!perf&&i%2===0){const dn=190,dp=new Float32Array(dn*3);for(let k=0;k<dn;k++){const a=Math.random()*6.2832;dp[k*3]=Math.cos(a)*rad;dp[k*3+1]=rnd(-.012,.012);dp[k*3+2]=Math.sin(a)*rad}
      const dg=new T.BufferGeometry();dg.setAttribute('position',new T.BufferAttribute(dp,3));grp.add(new T.Points(dg,new T.PointsMaterial({color:HI.clone(),size:.02,transparent:true,opacity:.9,blending:T.AdditiveBlending,depthWrite:false,sizeAttenuation:true})))}
    grp.rotation.set(rnd(0,3.14),rnd(0,3.14),rnd(0,3.14));root3.add(grp);
    rings.push({grp,line,m,rad,axis:new T.Vector3(rnd(-1,1),rnd(-1,1),rnd(-1,1)).normalize(),sp:rnd(.12,.45)*(i%2?1:-1),base:i%3?.5:.8});
  }
  /* ---- wandernde Lichtpunkte (Denken) ---- */
  const NT=perf?8:20,tPos=new Float32Array(NT*3),tg=new T.BufferGeometry();tg.setAttribute('position',new T.BufferAttribute(tPos,3));
  const tm=new T.PointsMaterial({color:HI.clone(),size:.075,transparent:true,opacity:0,blending:T.AdditiveBlending,depthWrite:false,sizeAttenuation:true,map:glowTex()});
  const trav=new T.Points(tg,tm);root3.add(trav);
  const tinfo=Array.from({length:NT},()=>({ring:Math.floor(Math.random()*RN),a:rnd(0,6.28),v:rnd(.8,2.2)*(Math.random()<.5?1:-1)}));
  /* ---- Kern ---- */
  function glowTex(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d'),g=x.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,'rgba(255,245,210,1)');g.addColorStop(.25,'rgba(255,190,80,.7)');g.addColorStop(.6,'rgba(255,120,30,.22)');g.addColorStop(1,'rgba(255,100,20,0)');x.fillStyle=g;x.fillRect(0,0,128,128);return new T.CanvasTexture(c)}
  const glow=new T.Sprite(new T.SpriteMaterial({map:glowTex(),transparent:true,blending:T.AdditiveBlending,depthWrite:false}));glow.scale.set(1,1,1);root3.add(glow);
  const core=new T.Mesh(new T.IcosahedronGeometry(.16,1),new T.MeshBasicMaterial({color:HI.clone(),wireframe:true,transparent:true,opacity:.85,blending:T.AdditiveBlending}));root3.add(core);
  const swirl=[];for(let s=0;s<2;s++){const pts=[];for(let k=0;k<90;k++){const a=k/90*6.2832*2.2,r=.05+k/90*.28;pts.push(Math.cos(a)*r,Math.sin(a)*r*.6,Math.sin(a*.5)*.08)}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pts,3));const l=new T.Line(g,new T.LineBasicMaterial({color:G1.clone(),transparent:true,opacity:.8,blending:T.AdditiveBlending}));l.rotation.set(rnd(0,3),rnd(0,3),rnd(0,3));root3.add(l);swirl.push(l)}
  /* ---- Zustand ---- */
  const P={idle:{rot:.14,ring:.7,glow:.5,think:0},listening:{rot:.24,ring:1.1,glow:.7,think:0},thinking:{rot:1.1,ring:1.9,glow:.85,think:1},speaking:{rot:.36,ring:1.0,glow:.8,think:0},error:{rot:.1,ring:.4,glow:.9,think:0}};
  let state='idle',cur={rot:.14,ring:.7,glow:.5,think:0},level=0,amp=0,lvlS=0,ampS=0,errT=0,errMix=0,t=0,last=performance.now(),raf=0,visible=!document.hidden,running=true,fcount=0;
  function resize(){const w=canvas.clientWidth||canvas.width,h=canvas.clientHeight||canvas.height;if(!w||!h)return;renderer.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();U.uScale.value=h*DPR*.0105}
  const ro=typeof ResizeObserver!=='undefined'?new ResizeObserver(resize):null;ro&&ro.observe(canvas);resize();
  function frame(now){
    raf=0;if(!running||!visible)return;
    let dt=Math.min(.05,(now-last)/1000);
    if(perf&&dt<1/30-.002){raf=requestAnimationFrame(frame);return}   // Performance-Modus: 30 fps
    last=now;t+=dt;fcount++;
    const goal=P[state]||P.idle,k=Math.min(1,dt*4);
    cur.rot+=(goal.rot-cur.rot)*k;cur.ring+=(goal.ring-cur.ring)*k;cur.glow+=(goal.glow-cur.glow)*k;cur.think+=(goal.think-cur.think)*k;
    lvlS+=(level-lvlS)*Math.min(1,dt*14);ampS+=(amp-ampS)*Math.min(1,dt*18);
    errMix+=((state==='error'?1:0)-errMix)*Math.min(1,dt*6);if(state==='error')errT+=dt;
    col1.copy(G1).lerp(ERR1,errMix);col2.copy(G2).lerp(ERR2,errMix);
    U.uFlick.value=state==='error'?(Math.sin(errT*38)>-.3?1:.35):1;
    U.uTime.value=t;
    const breathe=1+.025*Math.sin(t*1.3);
    const sc=breathe+(state==='listening'?lvlS*.16:0)+(state==='speaking'?ampS*.07:0);
    U.uPulse.value=state==='speaking'?ampS:(state==='listening'?lvlS*.6:0);
    root3.scale.setScalar(sc);
    shell.rotation.y+=dt*cur.rot;shell.rotation.x+=dt*cur.rot*.18;frags.rotation.y-=dt*cur.rot*.7;frags.rotation.z+=dt*cur.rot*.2;
    const ringScale=1+(state==='listening'?lvlS*.28:0)+(state==='speaking'?ampS*.12:0);
    for(const r of rings){r.grp.rotateOnAxis(r.axis,dt*r.sp*cur.ring);r.grp.scale.setScalar(ringScale);r.m.color.copy(col1);r.m.opacity=(r.base+(state==='thinking'?.15:0))*(U.uFlick.value)}
    fm.opacity=.35*(U.uFlick.value);
    tm.opacity=cur.think*.95;
    if(cur.think>.02){for(let i=0;i<NT;i++){const q=tinfo[i],r=rings[q.ring%rings.length];q.a+=dt*q.v*cur.ring;const p=new T.Vector3(Math.cos(q.a)*r.rad,0,Math.sin(q.a)*r.rad).applyQuaternion(r.grp.quaternion).multiplyScalar(ringScale);tPos[i*3]=p.x;tPos[i*3+1]=p.y;tPos[i*3+2]=p.z}tg.attributes.position.needsUpdate=true}
    const gp=cur.glow*(1+.18*Math.sin(t*2.4))+(state==='speaking'?ampS*.5:0)+(state==='listening'?lvlS*.4:0)+(state==='thinking'?.15*Math.sin(t*11):0);
    glow.scale.setScalar(.55+gp*.5);glow.material.opacity=Math.min(1,.55+gp*.4)*U.uFlick.value;glow.material.color.copy(errMix>.1?ERR2:new T.Color(1,1,1));
    core.rotation.x+=dt*.9;core.rotation.y+=dt*1.3;core.scale.setScalar(1+gp*.25);
    swirl.forEach((l,i)=>{l.rotation.z+=dt*(.6+i*.4)*cur.ring;l.rotation.y+=dt*.3;l.material.color.copy(col1)});
    renderer.render(scene,cam);
    raf=requestAnimationFrame(frame);
  }
  function kick(){if(!raf&&running&&visible){last=performance.now();raf=requestAnimationFrame(frame)}}
  const vis=()=>{visible=!document.hidden;if(visible)kick();else if(raf){cancelAnimationFrame(raf);raf=0}};
  document.addEventListener('visibilitychange',vis);kick();
  return{
    setState(s){if(P[s]){state=s;if(s==='error')errT=0}},get state(){return state},
    setLevel(v){level=v},setAmp(v){amp=v},resize,
    pause(){running=false;if(raf){cancelAnimationFrame(raf);raf=0}},resume(){running=true;kick()},
    destroy(){running=false;if(raf)cancelAnimationFrame(raf);document.removeEventListener('visibilitychange',vis);ro&&ro.disconnect();renderer.dispose()}
  };
}
root.JarvisOrb={create};
})(typeof window!=='undefined'?window:globalThis);
