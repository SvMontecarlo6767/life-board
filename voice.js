/* Sprach-Baustein für Jarvis: Aufnahme (Push-to-talk) als WAV und Wiedergabe mit Pegel-Hüllkurve.
   Warum so gebaut (iPad/Safari):
   - Aufnahme über Web Audio (Mikrofon -> PCM -> 16-kHz-WAV) statt SpeechRecognition: Die Safari-Spracherkennung braucht Siri/Diktat, bricht
     schnell ab und liefert keinen Pegel. WAV funktioniert überall, liefert den Pegel für den Kern, und die Erkennung macht Gemini.
   - Wiedergabe über ein <audio>-Element statt Web Audio: Es klingt auch bei aktivem Stumm-Schalter des iPads. Die Wellenform für den Kern
     wird vorab aus den Audiodaten berechnet und mit der Abspielzeit synchronisiert.
   - Fällt Gemini-TTS aus, spricht die iPad-Sprachausgabe (speechSynthesis), damit Jarvis nie stumm bleibt. */
(function(root){
'use strict';
let AC=null;
function ctx(){
  if(!AC){try{AC=new (root.AudioContext||root.webkitAudioContext)()}catch(e){return null}}
  if(AC.state==='suspended')AC.resume().catch(()=>{});
  return AC;
}
/* ---------- WAV-Hilfen (rein, testbar) ---------- */
function resample(f32,from,to){
  if(from===to)return f32;
  const ratio=from/to,n=Math.floor(f32.length/ratio),out=new Float32Array(n);
  for(let i=0;i<n;i++){const a=Math.floor(i*ratio),b=Math.min(f32.length,Math.floor((i+1)*ratio));let s=0;for(let j=a;j<b;j++)s+=f32[j];out[i]=b>a?s/(b-a):f32[a]||0}
  return out;
}
function wavFromFloat(f32,rate){
  const n=f32.length,buf=new ArrayBuffer(44+n*2),v=new DataView(buf);
  const w=(o,s)=>{for(let i=0;i<s.length;i++)v.setUint8(o+i,s.charCodeAt(i))};
  w(0,'RIFF');v.setUint32(4,36+n*2,true);w(8,'WAVE');w(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);w(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++){const x=Math.max(-1,Math.min(1,f32[i]));v.setInt16(44+i*2,x<0?x*0x8000:x*0x7fff,true)}
  return buf;
}
function wavFromInt16(i16,rate){const f=new Float32Array(i16.length);for(let i=0;i<i16.length;i++)f[i]=i16[i]/32768;return wavFromFloat(f,rate)}
const b64ToBytes=b=>{const s=atob(b),u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u};
function bytesToB64(u8){let s='';const C=0x8000;for(let i=0;i<u8.length;i+=C)s+=String.fromCharCode.apply(null,u8.subarray(i,i+C));return btoa(s)}
/* Hüllkurve: RMS je 20-ms-Fenster, auf 0..1 normiert */
function envelope(f32,rate,win){
  win=win||.02;const step=Math.max(1,Math.floor(rate*win)),n=Math.ceil(f32.length/step),e=new Float32Array(n);let mx=1e-6;
  for(let i=0;i<n;i++){let s=0,c=0;for(let j=i*step;j<Math.min(f32.length,(i+1)*step);j++){s+=f32[j]*f32[j];c++}e[i]=Math.sqrt(s/Math.max(1,c));if(e[i]>mx)mx=e[i]}
  for(let i=0;i<n;i++)e[i]=Math.min(1,e[i]/mx);
  return{data:e,step:win};
}
/* ---------- Aufnahme ---------- */
const REC_MAX_S=60;
async function startRecording(){
  if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia){const e=new Error('Dieser Browser erlaubt keine Mikrofonaufnahme.');e.code='NOMIC';throw e}
  const a=ctx();if(!a){const e=new Error('Audio wird nicht unterstützt.');e.code='NOMIC';throw e}
  let stream;
  try{stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,channelCount:1}})}
  catch(err){const e=new Error(err&&(err.name==='NotAllowedError'||err.name==='SecurityError')?'Mikrofon verweigert. In Safari: aA-Symbol → Website-Einstellungen → Mikrofon erlauben.':err&&err.name==='NotFoundError'?'Kein Mikrofon gefunden.':'Mikrofon nicht verfügbar ('+(err&&err.name)+').');e.code='MICDENIED';throw e}
  const src=a.createMediaStreamSource(stream),an=a.createAnalyser();an.fftSize=512;src.connect(an);
  const proc=a.createScriptProcessor(4096,1,1),chunks=[];let len=0,stopped=false;
  const mute=a.createGain();mute.gain.value=0;
  proc.onaudioprocess=ev=>{if(stopped)return;const d=ev.inputBuffer.getChannelData(0);chunks.push(new Float32Array(d));len+=d.length;if(len/a.sampleRate>REC_MAX_S)ctl.onlimit&&ctl.onlimit()};
  src.connect(proc);proc.connect(mute);mute.connect(a.destination);
  const buf=new Uint8Array(an.fftSize),t0=performance.now();
  function cleanup(){stopped=true;try{proc.disconnect();src.disconnect();mute.disconnect()}catch(e){}stream.getTracks().forEach(t=>t.stop())}
  const ctl={
    level(){an.getByteTimeDomainData(buf);let s=0;for(let i=0;i<buf.length;i++){const x=(buf[i]-128)/128;s+=x*x}return Math.min(1,Math.sqrt(s/buf.length)*4)},
    ms:()=>performance.now()-t0,
    stop(){cleanup();const all=new Float32Array(len);let o=0;chunks.forEach(c=>{all.set(c,o);o+=c.length});
      const rate=16000,pcm=resample(all,a.sampleRate,rate);return{ms:Math.round(len/a.sampleRate*1000),wav:wavFromFloat(pcm,rate),peak:pcm.reduce((m,x)=>Math.max(m,Math.abs(x)),0)}},
    cancel:cleanup,onlimit:null
  };
  return ctl;
}
/* ---------- Wiedergabe ---------- */
async function playAudio(b64,mime){
  mime=String(mime||'audio/wav');let bytes=b64ToBytes(b64),rate=24000,f32=null,blob;
  if(/l16|pcm/i.test(mime)&&!(bytes[0]===0x52&&bytes[1]===0x49)){   // rohes PCM (16 Bit, little endian)
    const m=/rate=(\d+)/i.exec(mime);if(m)rate=+m[1];
    const i16=new Int16Array(bytes.buffer,bytes.byteOffset,Math.floor(bytes.byteLength/2));
    blob=new Blob([wavFromInt16(i16,rate)],{type:'audio/wav'});f32=new Float32Array(i16.length);for(let i=0;i<i16.length;i++)f32[i]=i16[i]/32768;
  }else{
    blob=new Blob([bytes],{type:/wav/i.test(mime)||bytes[0]===0x52?'audio/wav':mime});
    try{const a=ctx();if(a){const ab=await a.decodeAudioData(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));f32=ab.getChannelData(0);rate=ab.sampleRate}}catch(e){}
  }
  const env=f32?envelope(f32,rate):null,url=URL.createObjectURL(blob),el=new Audio();el.src=url;el.preload='auto';el.setAttribute('playsinline','');
  let resolve,reject;const done=new Promise((res,rej)=>{resolve=res;reject=rej});
  el.onended=()=>{URL.revokeObjectURL(url);resolve('ended')};
  el.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Wiedergabe fehlgeschlagen'))};
  const ctl={el,done,
    get duration(){return isFinite(el.duration)?el.duration:(f32?f32.length/rate:0)},
    get time(){return el.currentTime},
    amp(){if(!env)return .5+.3*Math.sin(el.currentTime*14);const i=Math.floor(el.currentTime/env.step);return env.data[Math.min(i,env.data.length-1)]||0},
    stop(){try{el.pause()}catch(e){}URL.revokeObjectURL(url);resolve('stopped')}};
  await el.play();   // kann bei fehlender Nutzergeste scheitern -> Aufrufer fängt den Fehler und nimmt die Ersatzstimme
  return ctl;
}
/* iPad-Sprachausgabe als Ersatz */
function pickVoice(){
  const vs=(speechSynthesis.getVoices()||[]).filter(v=>/^de/i.test(v.lang));
  const male=['Markus','Martin','Daniel','Stefan','Reed','Eddy'];
  return vs.find(v=>male.some(n=>v.name.includes(n)))||vs.find(v=>/de-DE/i.test(v.lang))||vs[0]||null;
}
function speakFallback(text){
  return new Promise((resolve,reject)=>{
    if(!('speechSynthesis' in root)){reject(new Error('Keine Sprachausgabe verfügbar'));return}
    const u=new SpeechSynthesisUtterance(text);u.lang='de-DE';const v=pickVoice();if(v)u.voice=v;u.rate=.98;u.pitch=.85;
    let amp=0;u.onboundary=()=>{amp=1};u.onend=()=>resolve('ended');u.onerror=e=>(e&&e.error==='canceled')?resolve('stopped'):reject(new Error('Sprachausgabe-Fehler'));
    const ctl={amp(){amp*=.9;return Math.max(.15,amp)},stop(){try{speechSynthesis.cancel()}catch(e){}},done:null,duration:text.split(/\s+/).length*.38,get time(){return 0}};
    ctl.done=new Promise(r=>{u.onend=()=>r('ended');u.onerror=()=>r('stopped')});
    speechSynthesis.cancel();speechSynthesis.speak(u);resolve(ctl);
  });
}
const api={ctx,resample,wavFromFloat,wavFromInt16,envelope,b64ToBytes,bytesToB64,startRecording,playAudio,speakFallback,REC_MAX_S};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LBVoice=api;
})(typeof window!=='undefined'?window:globalThis);
