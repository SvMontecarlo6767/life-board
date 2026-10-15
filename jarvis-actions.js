/* Jarvis-Aktionen (Phase 4): Funktionsaufrufe der KI -> Bestätigung -> Ausführung mit den normalen Funktionen der Seiten.
   Die Seiten melden ihre Handler an: window.JarvisHandlers.set_habit / set_puzzle = async (args) => ({say}|{ask}|{err}|{wait}).
   Liegt die Aktion auf einer anderen Seite, wird sie nach Bestätigung vorgemerkt, die Seite geöffnet und dort ausgeführt. */
(function(root){
'use strict';
const PEND='lb_jv_pending',TABS={hub:'index.html',heute:'heute.html?v=5',recovery:'recovery.html?v=4',lernen:'learn.html?v=2',puzzle:'puzzle.html?v=3',training:'training.html?v=2'};
const PAGE={set_habit:'heute.html',set_puzzle:'puzzle.html'};
const NAMES={hub:'Hub',heute:'Heute',recovery:'Recovery',lernen:'Lernen',puzzle:'Puzzle-Tracker',training:'Training'};
const SET={sprachausgabe:['speak','Sprachausgabe'],performance:['perf','Performance-Modus'],sounds:['sounds','UI-Sounds']};
const norm=s=>String(s==null?'':s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const file=()=>{const f=location.pathname.split('/').pop();return f||'index.html'};
const pageOf=n=>PAGE[n];
let RULES=null;
async function rules(){
  if(RULES)return RULES;
  try{const r=await fetch('rules/v2.json?v=1');RULES=await r.json()}catch(e){RULES=null}
  return RULES;
}
const GAMES=[['fermi','Fermi'],['spm','Spotle Movies'],['ner','Nerdle'],['glo','Globle'],['tra','Travle'],['ran','Ranke'],['tim','TimeGuessr'],['stl','Statle'],['col','Color Game'],['hol','Higher or Lower'],['satl','Satle'],['tmd','Timdle'],['hf','Historic Firsts'],['vlt','Vault'],['zoo','Zoodle'],['krl','Krillion']];
/* ---------- Werkzeug-Beschreibungen für die KI ---------- */
async function tools(){
  const R=await rules();
  const list=R?R.ui.buttons.map(b=>b.label+' ['+(b.kind==='toggle'?'an/aus':b.kind==='count'?'Anzahl':b.kind==='amount'?'Minuten '+b.presets.join('/'):'Option: '+b.options.map(o=>o.label).join(' | '))+']').join('; '):'';
  return [
   {name:'navigate',description:'Wechselt zu einem Reiter der Seite (Hub, Heute, Recovery, Lernen, Puzzle, Training).',parameters:{type:'object',properties:{tab:{type:'string',enum:Object.keys(TABS),description:'Ziel-Reiter'}},required:['tab']}},
   {name:'set_setting',description:'Ändert eine Einstellung: Sprachausgabe von Jarvis, Performance-Modus oder UI-Sounds.',parameters:{type:'object',properties:{name:{type:'string',enum:Object.keys(SET)},value:{type:'boolean',description:'true = an, false = aus'}},required:['name','value']}},
   {name:'set_habit',description:'Trägt eine Aktion im Reiter Heute ein (Sport, Lernen, Alltag-Gewohnheit). Knöpfe: '+list,parameters:{type:'object',properties:{button:{type:'string',description:'Name des Knopfes wie in der Liste'},value:{type:'string',description:'an/aus, Minuten, Anzahl oder Option je nach Knopf. Weglassen, wenn der Nutzer nichts gesagt hat.'},date:{type:'string',description:'heute oder gestern (Standard heute)'}},required:['button']}},
   {name:'set_puzzle',description:'Trägt ein Puzzle-Ergebnis im Puzzle-Tracker ein. Spiele: '+GAMES.map(g=>g[1]).join(', ')+'. Krillion: Score 0–700, höher ist besser. Bei Spielen mit Versuchen ist score die Anzahl der Versuche.',parameters:{type:'object',properties:{game:{type:'string',description:'Name des Spiels'},score:{type:'number',description:'Score bzw. Versuche'},solved:{type:'boolean',description:'false, wenn nicht geschafft'},date:{type:'string',description:'heute oder gestern (Standard heute)'}},required:['game']}}
  ];
}
/* ---------- Auflösen der Knöpfe (gleiche Logik für Vorschau und Ausführung) ---------- */
function matchButton(R,q){
  const n=norm(q);if(!n)return{err:'Welchen Knopf meinst du?'};
  const toks=n.split(' ').filter(t=>t.length>1);
  const sc=R.ui.buttons.map(b=>{const l=norm(b.label),id=norm(b.id);let s=0;
    if(l===n||id===n)s=100;else if(l.includes(n)||n.includes(id)&&id.length>3)s=60+n.length;else s=toks.filter(t=>l.includes(t)||(t.length>4&&l.split(' ').some(w=>w.startsWith(t.slice(0,5))))).length*10;
    return{b,s}}).filter(x=>x.s>0).sort((a,b)=>b.s-a.s);
  if(!sc.length)return{err:'Einen Knopf „'+q+'“ gibt es in Heute nicht.'};
  if(sc.length>1&&sc[0].s===sc[1].s&&sc[0].s<60)return{ask:'Meinst du „'+sc[0].b.label+'“ oder „'+sc[1].b.label+'“?'};
  return{b:sc[0].b};
}
function resolveHabit(R,args){
  if(!R)return{err:'Die Regeln konnten nicht geladen werden.'};
  const m=matchButton(R,args.button);if(!m.b)return m;
  const b=m.b,raw=args.value==null?'':String(args.value),v=norm(raw);
  const YES=/^(an|ja|true|1|erledigt|gemacht|aktiv|komplett|bestanden|ok)$/,NO=/^(aus|nein|false|0|nicht|weg|zurueck|rueckgaengig)$/;
  const num=(raw.match(/\d+([.,]\d+)?/)||[])[0];
  let nv,txt;
  if(b.kind==='toggle'){
    if(v===''||YES.test(v)){nv=1;txt=b.label}else if(NO.test(v)){nv=0;txt=b.label+' zurücknehmen'}else return{ask:'„'+b.label+'“ ist ein An/Aus-Knopf. Soll ich ihn einschalten oder ausschalten?'};
  }else if(b.kind==='count'){
    if(NO.test(v)){nv=0;txt=b.label+' auf 0'}else{nv=num?Math.round(parseFloat(num.replace(',','.'))):1;if(nv<1||nv>20)return{err:'Diese Anzahl ist nicht sinnvoll.'};txt=b.label+': '+nv}
  }else if(b.kind==='amount'){
    if(NO.test(v)){nv=0;txt=b.label+' zurücknehmen'}
    else if(!num)return{ask:'Wie lange – '+b.presets.join(', ')+' '+b.unit+'?'};
    else{const n=Math.round(parseFloat(num.replace(',','.')));
      if(!b.presets.includes(n)){return{ask:'Für „'+b.label+'“ gibt es nur '+b.presets.join(', ')+' '+b.unit+'. Welche Stufe soll es sein?'}}
      nv=n;txt=b.label+' '+n+' '+b.unit}
  }else if(b.kind==='choice'){
    if(NO.test(v)){nv=0;txt=b.label+' zurücknehmen'}
    else{let i=-1;if(v){i=b.options.findIndex(o=>norm(o.label)===v);if(i<0)i=b.options.findIndex(o=>norm(o.label).includes(v)||v.includes(norm(o.label)));if(i<0&&num&&+num>=1&&+num<=b.options.length&&!/fragen|min/.test(v))i=+num-1;if(i<0&&num){i=b.options.findIndex(o=>norm(o.label).includes(num))}}
      if(i<0)return{ask:'Welche Option bei „'+b.label+'“: '+b.options.map(o=>o.label).join(', ')+'?'};
      nv=i+1;txt=b.label+': '+b.options[i].label}
  }else return{err:'Diesen Knopf kann ich nicht setzen.'};
  return{b,nv,txt,date:/gestern/i.test(args.date||'')?'gestern':'heute'};
}
function resolveGame(args){
  const n=norm(args.game);if(!n)return{ask:'Welches Spiel meinst du?'};
  let g=GAMES.find(x=>norm(x[1])===n||x[0]===n)||GAMES.find(x=>norm(x[1]).includes(n)||(n.length>3&&n.includes(norm(x[1]))));
  if(!g)return{err:'Ein Spiel „'+args.game+'“ kenne ich im Tracker nicht.'};
  return{id:g[0],name:g[1]};
}
/* ---------- Ausführen ---------- */
const N=(t,bad)=>{const J=root.Jarvis;if(J&&J.notice)J.notice(t,!!bad,!bad)};
const H=()=>(root.JarvisHandlers=root.JarvisHandlers||{});
function savePending(call){try{sessionStorage.setItem(PEND,JSON.stringify({call,t:Date.now()}))}catch(e){}}
async function execHere(call){
  const h=H()[call.name];if(!h)return{wait:true};
  return await h(call.args||{});
}
async function runPending(){
  let p=null;try{p=JSON.parse(sessionStorage.getItem(PEND)||'null')}catch(e){}
  if(!p||Date.now()-p.t>90000){try{sessionStorage.removeItem(PEND)}catch(e){};return}
  if(file()!==pageOf(p.call.name))return;
  for(let i=0;i<80&&!(root.Jarvis&&root.Jarvis.notice);i++)await new Promise(res=>setTimeout(res,250));   // Jarvis erst nach der Anmeldung da
  if(!root.Jarvis||!root.Jarvis.notice)return;
  try{sessionStorage.removeItem(PEND)}catch(e){}
  for(let i=0;i<60;i++){
    const r=await execHere(p.call);
    if(!r.wait){N(r.say||r.ask||r.err||'Erledigt.',!!(r.err||r.ask));return}
    await new Promise(res=>setTimeout(res,500));
  }
  N('Die Seite war nicht rechtzeitig bereit. Sag es bitte noch einmal.',true);
}
async function go(call){
  if(pageOf(call.name)&&file()!==pageOf(call.name)){
    savePending(call);N('Ich öffne '+(call.name==='set_habit'?'Heute':'den Puzzle-Tracker')+' und trage es dort ein.');
    setTimeout(()=>{location.href=pageOf(call.name)+(call.name==='set_habit'?'?v=5':'?v=3')},900);return;
  }
  const r=await execHere(call);
  if(r.wait){N('Die Seite lädt noch. Versuch es gleich noch einmal.',true);return}
  N(r.say||r.ask||r.err||'Erledigt.',!!(r.err||r.ask));
}
/* Verarbeitet die Funktionsaufrufe der KI. Gibt true zurück, wenn etwas behandelt wurde. */
async function handle(res,userText){
  const calls=(res&&res.calls)||[];if(!calls.length)return false;
  const J=root.Jarvis,call=calls[0];
  const say=(t,warn)=>N(t,warn);
  const log=async a=>{try{await root.Assistant.chat.add(userText,a)}catch(e){}};
  if(call.name==='navigate'){
    const t=call.args&&call.args.tab,url=TABS[t];
    if(!url){say('Diesen Reiter kenne ich nicht.',true);return true}
    const here=file()===url.split('?')[0];
    if(here){const a='Du bist schon im Reiter '+NAMES[t]+'.';await log(a);say(a);return true}
    const a='Ich öffne '+NAMES[t]+'.';await log(a);say(a);setTimeout(()=>{location.href=url},900);return true;
  }
  if(call.name==='set_setting'){
    const a=call.args||{},s=SET[a.name];if(!s||typeof a.value!=='boolean'){say('Welche Einstellung soll ich ändern?',true);return true}
    const q=s[1]+' '+(a.value?'einschalten':'ausschalten')+'?';await log(q);
    J.confirm(q,async()=>{root.LBUI.setSetting(s[0],a.value);say(s[1]+' ist jetzt '+(a.value?'an':'aus')+'.')});return true;
  }
  if(call.name==='set_habit'){
    const R=await rules(),x=resolveHabit(R,call.args||{});
    if(x.err||x.ask){await log(x.err||x.ask);say(x.err||x.ask,!!x.err);return true}
    const q='Eintragen: '+x.txt+(x.date==='gestern'?' (gestern)':' (heute)')+'?';await log(q);
    J.confirm(q,()=>go({name:'set_habit',args:call.args||{}}));return true;
  }
  if(call.name==='set_puzzle'){
    const a=call.args||{},g=resolveGame(a);
    if(g.err||g.ask){await log(g.err||g.ask);say(g.err||g.ask,!!g.err);return true}
    if(a.solved!==false&&a.score==null&&g.id!=='hol'){const q='Welchen Score hast du bei '+g.name+'?';await log(q);say(q);return true}
    const q='Eintragen: '+g.name+(a.solved===false?' nicht geschafft':' '+a.score)+(/gestern/i.test(a.date||'')?' (gestern)':' (heute)')+'?';await log(q);
    J.confirm(q,()=>go({name:'set_puzzle',args:a}));return true;
  }
  return false;
}
root.JarvisActions={tools,handle,runPending,resolveHabit,resolveGame,norm,GAMES};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(runPending,300));else setTimeout(runPending,300);
})(typeof window!=='undefined'?window:globalThis);
