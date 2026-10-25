/* Life Board – Benachrichtigungen auf dem Gerät anmelden und Erinnerungen an den Worker melden.
   iPhone/iPad: Push geht nur, wenn das Board vom Home-Bildschirm aus geöffnet ist (iOS 16.4 oder neuer).
   LBPush.state(), enable(api), disable(api), syncGoals(api, JD, today, addDays), done(api, day), config(api, cfg), test(api)
   api = (pfad, body) => Promise<json> (mit Anmeldung, siehe Seiten) */
(function(root){
const urlB64=s=>{const p=s.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(s.length/4)*4,'=');return Uint8Array.from(atob(p),c=>c.charCodeAt(0))};
const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const standalone=()=>navigator.standalone===true||matchMedia('(display-mode: standalone)').matches;
const supported=()=>'serviceWorker' in navigator&&'PushManager' in root&&'Notification' in root;
async function reg(){if(!('serviceWorker' in navigator))return null;return(await navigator.serviceWorker.getRegistration())||navigator.serviceWorker.register('sw.js')}
async function state(){
  if(!supported())return{ok:false,why:ios&&!standalone()?'homescreen':'unsupported'};
  if(ios&&!standalone())return{ok:false,why:'homescreen'};
  if(Notification.permission==='denied')return{ok:false,why:'denied'};
  const r=await reg(),sub=r&&await r.pushManager.getSubscription();
  return{ok:true,on:!!sub&&Notification.permission==='granted',sub};
}
async function enable(api){
  const st=await state();if(!st.ok)throw new Error(st.why);
  if(await Notification.requestPermission()!=='granted')throw new Error('denied');
  const r=await reg();await navigator.serviceWorker.ready;
  const {key}=await api('/push/key');
  let sub=await r.pushManager.getSubscription();
  if(sub&&sub.options&&sub.options.applicationServerKey){const a=new Uint8Array(sub.options.applicationServerKey),b=urlB64(key);if(a.length!==b.length||a.some((x,i)=>x!==b[i])){await sub.unsubscribe();sub=null}}
  if(!sub)sub=await r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64(key)});
  await api('/push/subscribe',{sub:sub.toJSON()});
  return true;
}
async function disable(api){const r=await reg(),sub=r&&await r.pushManager.getSubscription();if(sub){try{await api('/push/unsubscribe',{endpoint:sub.endpoint})}catch(e){}await sub.unsubscribe()}}
/* Tagesziele mit Glocke für heute und morgen an den Worker schicken */
async function syncGoals(api,JD,today,addDays){
  const days=[today,addDays(today,1)],items=[];
  days.forEach(d=>((JD[d]||{}).g||[]).forEach((g,i)=>{if(g.r&&g.at&&!g.done)items.push({id:d+'-'+i+'-'+g.at,day:d,at:g.at,title:g.t})}));
  try{await api('/push/schedule',{days,items})}catch(e){}
}
async function done(api,day){try{await api('/push/done',{day})}catch(e){}}
async function config(api,cfg){return api('/push/config',cfg)}
async function test(api){return api('/push/test',{})}
async function status(api){return api('/push/status')}
const api={state,enable,disable,syncGoals,done,config,test,status,ios,standalone};
root.LBPush=api;
})(window);
