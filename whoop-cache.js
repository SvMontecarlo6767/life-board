/* Life Board – Whoop-Zwischenspeicher (IndexedDB, pro Nutzer). Statt bei jedem Öffnen ein ganzes Jahr vom Worker zu laden,
   holt LBWhoop.load nur die letzten Tage neu (Whoop bewertet frische Tage manchmal nach) und nimmt den Rest aus dem Gerät.
   Einmal alle 12 Stunden wird im Hintergrund der ganze Zeitraum aufgefrischt. Ohne Netz: der gespeicherte Stand.
   LBWhoop.load({uid, from, to, fetch:(from,to)=>Promise<{days}>, full?:true}) -> Promise<{datum: Tag}> */
(function(root){
const DB='lb-whoop',ST='c',RECENT=7,FULL_EVERY=12*3600e3,KEEP=400;
function addDays(k,n){const [y,m,d]=k.split('-').map(Number);const t=new Date(Date.UTC(y,m-1,d+n));return t.toISOString().slice(0,10)}
let dbp=null;
function idb(){if(!dbp)dbp=new Promise((res,rej)=>{if(!root.indexedDB)return rej(new Error('kein IndexedDB'));const r=indexedDB.open(DB,1);r.onupgradeneeded=()=>r.result.createObjectStore(ST);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)});return dbp}
async function get(k){try{const db=await idb();return await new Promise(res=>{const q=db.transaction(ST).objectStore(ST).get(k);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null)})}catch(e){return null}}
async function put(k,v){try{const db=await idb();await new Promise(res=>{const t=db.transaction(ST,'readwrite');t.objectStore(ST).put(v,k);t.oncomplete=res;t.onerror=res;t.onabort=res})}catch(e){}}
function pick(days,from,to){const o={};for(const k in days)if(k>=from&&k<=to)o[k]=days[k];return o}
function prune(days,to){const min=addDays(to,-KEEP);for(const k in days)if(k<min)delete days[k];return days}
async function load(o){
  const key='w_'+o.uid,c=await get(key);
  const full=async()=>{const d=await o.fetch(o.from,o.to);const days=prune(Object.assign({},c&&c.days,d.days||{}),o.to);
    // Tage im neu geladenen Bereich, die der Worker nicht mehr liefert, entfernen
    for(const k in days)if(k>=o.from&&k<=o.to&&!(d.days||{})[k])delete days[k];
    await put(key,{days,from:c&&c.from<o.from?c.from:o.from,to:o.to,fullAt:Date.now()});return days};
  if(o.full||!c||!c.days||!c.to||c.from>addDays(o.from,7))   // Bereich deutlich größer als gespeichert: einmal alles laden
   return pick(await full(),o.from,o.to);
  const r0=addDays(c.to,-RECENT),f=o.from>r0?o.from:r0;
  let fresh;
  try{fresh=(await o.fetch(f,o.to)).days||{}}catch(e){if(Object.keys(c.days).length)return pick(c.days,o.from,o.to);throw e}   // offline: gespeicherter Stand
  const days=Object.assign({},c.days);for(const k in days)if(k>=f&&k<=o.to)delete days[k];Object.assign(days,fresh);prune(days,o.to);
  await put(key,{days,from:c.from,to:o.to>c.to?o.to:c.to,fullAt:c.fullAt||0});
  if(Date.now()-(c.fullAt||0)>FULL_EVERY)setTimeout(()=>{full().catch(()=>{})},4000);   // ab und zu alles auffrischen, ohne zu warten
  return pick(days,o.from,o.to);
}
async function clear(uid){await put('w_'+uid,null)}
const api={load,clear};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LBWhoop=api;
})(typeof window!=='undefined'?window:globalThis);
