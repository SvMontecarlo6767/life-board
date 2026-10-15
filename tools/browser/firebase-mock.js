// Test-Ersatz für das Firebase-Compat-SDK (nur Browsertests; kein Teil der Seite).
(function(){
  let saved=null;try{saved=localStorage.getItem('__mockstore')}catch(e){}
  const store = saved?JSON.parse(saved):(window.__seed || {});   // Pfad -> Daten (übersteht Reloads wie der echte Server)
  window.__store = store;
  const docSnap = (id,d)=>({id,exists:d!==undefined,data:()=>d===undefined?undefined:JSON.parse(JSON.stringify(d))});
  const fsApi = {
    enablePersistence: async()=>{}, settings:()=>{},
    collection:(p)=>({get:async()=>{if(localStorage.getItem('__failreads')==='1'){const e=new Error('denied');e.code='permission-denied';throw e}const pre=p+'/';const docs=Object.keys(store).filter(k=>k.startsWith(pre)&&!k.slice(pre.length).includes('/')).map(k=>docSnap(k.slice(pre.length),store[k]));return{docs}}}),
    batch:()=>{const ops=[];return{set:(r,d)=>{ops.push([r,d])},commit:async()=>{for(const o of ops)await o[0].set(o[1])}}},
    doc:(p)=>({
      path:p,
      delete:async()=>{delete store[p];try{localStorage.setItem('__mockstore',JSON.stringify(store))}catch(e){}},
      get:async()=>{if(localStorage.getItem('__failreads')==='1'){const e=new Error('denied');e.code='permission-denied';throw e}return docSnap(p.split('/').pop(),store[p])},
      set:async(d,o)=>{ if(window.__failWrites){const e=new Error('denied');e.code='permission-denied';throw e}
        store[p]=o&&o.merge?Object.assign({},store[p]||{},JSON.parse(JSON.stringify(d))):JSON.parse(JSON.stringify(d)); window.__writes=(window.__writes||0)+1; try{localStorage.setItem('__mockstore',JSON.stringify(store))}catch(e){} }
    })
  };
  window.firebase = {
    initializeApp(){},
    auth:()=>({currentUser:{uid:'u1',email:'test@example.com',getIdToken:async()=>'test-token'},onAuthStateChanged:(cb)=>{setTimeout(()=>cb({uid:'u1',email:'test@example.com',getIdToken:async()=>'test-token'}),0);return()=>{}}}),
    firestore:()=>fsApi
  };
})();
