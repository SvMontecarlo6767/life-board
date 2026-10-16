/* Jarvis-Aktionen (Phase 4): Funktionsaufrufe der KI -> Bestätigung -> Ausführung mit den normalen Funktionen der Seiten.
   Die Seiten melden ihre Handler an: window.JarvisHandlers.set_habit / set_puzzle = async (args) => ({say}|{ask}|{err}|{wait}).
   Liegt die Aktion auf einer anderen Seite, wird sie nach Bestätigung vorgemerkt, die Seite geöffnet und dort ausgeführt. */
(function(root){
'use strict';
const PEND='lb_jv_pending',TABS={hub:'index.html',heute:'heute.html?v=6',kalender:'calendar.html?v=1',recovery:'recovery.html?v=5',lernen:'learn.html?v=2',puzzle:'puzzle.html?v=3',training:'training.html?v=3'};
const PAGE={set_habit:'heute.html',set_puzzle:'puzzle.html',set_meal:'heute.html'};
const NAMES={hub:'Hub',heute:'Heute',kalender:'Kalender',recovery:'Recovery',lernen:'Lernen',puzzle:'Puzzle-Tracker',training:'Training'};
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
   {name:'set_puzzle',description:'Trägt ein Puzzle-Ergebnis im Puzzle-Tracker ein. Spiele: '+GAMES.map(g=>g[1]).join(', ')+'. Krillion: Score 0–700, höher ist besser. Bei Spielen mit Versuchen ist score die Anzahl der Versuche.',parameters:{type:'object',properties:{game:{type:'string',description:'Name des Spiels'},score:{type:'number',description:'Score bzw. Versuche'},solved:{type:'boolean',description:'false, wenn nicht geschafft'},date:{type:'string',description:'heute oder gestern (Standard heute)'}},required:['game']}},
   {name:'show_graph',description:'Öffnet einen Graphen im Vollbild (reine Anzeige). Graphen: Recovery, HRV, Ruhepuls, Schlafdauer, Schlaf-Performance, Strain, Atemfrequenz, Blutsauerstoff, Hauttemperatur, Kalorien, Schritte, Form, Trainingsstunden, Trainingslast. Optional Zeitraum und Datum.',parameters:{type:'object',properties:{graph:{type:'string',description:'Name des Graphen'},range:{type:'string',enum:['7','30','90','365','all'],description:'Zeitraum in Tagen (90 = 3 Monate, 365 = 1 Jahr) oder all'},date:{type:'string',description:'Datum YYYY-MM-DD, zu dem gesprungen wird'}},required:['graph']}},
   {name:'graph_range',description:'Wechselt im geöffneten Graph-Vollbild den Zeitraum (reine Anzeige).',parameters:{type:'object',properties:{range:{type:'string',enum:['7','30','90','365','all']}},required:['range']}},
   {name:'graph_date',description:'Springt im geöffneten Graph-Vollbild zu einem Datum und markiert es (reine Anzeige).',parameters:{type:'object',properties:{date:{type:'string',description:'YYYY-MM-DD'}},required:['date']}},
   {name:'set_meal',description:'Trägt im Reiter Heute die Uhrzeit der letzten großen Mahlzeit ein (für die Schlaf-Hebel-Analyse).',parameters:{type:'object',properties:{time:{type:'string',description:'Uhrzeit als HH:MM, 24 Stunden, z. B. 21:15'}},required:['time']}},
   {name:'set_sleep_safety',description:'Speichert die Antwort auf die Schlaf-Sicherheitsfrage (Schnarchen, Atemaussetzer, massive Tagesmüdigkeit). Nur die Antwort des Nutzers übernehmen, nie raten.',parameters:{type:'object',properties:{answer:{type:'string',enum:['ja','nein']}},required:['answer']}},
   {name:'calendar_add',description:'Trägt einen Termin in den Kalender ein (mit Bestätigung). Datum und Uhrzeit so übernehmen, wie der Nutzer sie sagt (z. B. morgen, Dienstag, 24.12., 15 Uhr). Nichts erfinden: fehlt der Tag, wird nachgefragt.',parameters:{type:'object',properties:{title:{type:'string',description:'Name des Termins'},date:{type:'string',description:'Tag: heute, morgen, übermorgen, Wochentag, 5.11. oder YYYY-MM-DD'},time:{type:'string',description:'Beginn, z. B. 15:00 oder 15 Uhr. Weglassen bei ganztägig.'},end:{type:'string',description:'Ende, nur wenn genannt'},date_end:{type:'string',description:'Letzter Tag bei mehrtägigen Terminen'},category:{type:'string',enum:['termin','frist','training','lernen','puzzle','privat']},reminder_minutes:{type:'number',description:'Minuten vor Beginn (0, 10, 30, 60, 1440). Nur wenn der Nutzer eine Erinnerung will.'},repeat:{type:'string',enum:['none','daily','weekly','monthly','yearly']},note:{type:'string'}},required:['title','date']}},
   {name:'calendar_agenda',description:'Liest vor, was im Kalender steht (reine Anzeige, ohne Bestätigung). Für Fragen wie „was steht heute/morgen/diese Woche an?“.',parameters:{type:'object',properties:{range:{type:'string',enum:['heute','morgen','woche','naechste_woche','monat'],description:'Zeitraum'},date:{type:'string',description:'Stattdessen ein bestimmter Tag (Wochentag, 5.11. oder YYYY-MM-DD)'}}}},
   {name:'calendar_open',description:'Öffnet den Kalender in einer Ansicht und springt zu einem Tag (reine Anzeige).',parameters:{type:'object',properties:{view:{type:'string',enum:['month','week','day','year']},date:{type:'string',description:'heute, morgen, Wochentag, 5.11. oder YYYY-MM-DD'}}}},
   {name:'calendar_note',description:'Ergänzt die Tagesnotiz (Tagebuch) im Kalender um einen Text (mit Bestätigung).',parameters:{type:'object',properties:{text:{type:'string'},date:{type:'string',description:'Standard heute'}},required:['text']}},
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
/* ---------- Kalender ---------- */
function loadScript(src){return new Promise((res,rej)=>{if(document.querySelector('script[data-ca="'+src+'"]'))return res();const s=document.createElement('script');s.src=src;s.dataset.ca=src;s.onload=res;s.onerror=()=>rej(new Error(src+' nicht geladen'));document.head.append(s)})}
async function ensureCal(){if(!root.CalCore)await loadScript('calendar-core.js?v=2');if(!root.CalStore)await loadScript('calendar-store.js?v=1')}
const CATW={termin:'termin',frist:'frist',deadline:'frist',training:'training',sport:'training',lernen:'lernen',puzzle:'puzzle',privat:'privat'},REPW={none:'none',einmalig:'none',daily:'daily',taeglich:'daily',weekly:'weekly',woechentlich:'weekly',monthly:'monthly',monatlich:'monthly',yearly:'yearly',jaehrlich:'yearly'};
function calendarPrepare(a,today){
  const C=root.CalCore;a=a||{};
  const title=String(a.title||'').trim();if(!title)return{ask:'Wie soll der Termin heißen?'};
  if(!a.date)return{ask:'Für welchen Tag soll „'+title+'“ eingetragen werden?'};
  const date=C.resolveDate(a.date,today);if(!date)return{ask:'Den Tag „'+a.date+'“ habe ich nicht verstanden. Welches Datum?'};
  const o={title,date,cat:CATW[norm(a.category)]||'termin'};
  if(a.time){const t=C.resolveTime(a.time);if(!t)return{ask:'Die Uhrzeit „'+a.time+'“ habe ich nicht verstanden. Wann genau?'};o.time=t}
  if(a.end){const t=C.resolveTime(a.end);if(!t)return{ask:'Das Ende „'+a.end+'“ habe ich nicht verstanden. Wann genau?'};o.end=t}
  if(a.date_end){const d=C.resolveDate(a.date_end,today);if(!d)return{ask:'Den letzten Tag „'+a.date_end+'“ habe ich nicht verstanden.'};o.endDate=d}
  if(a.reminder_minutes!=null&&a.reminder_minutes!==''){const m=Number(a.reminder_minutes);if(!isFinite(m)||m<0)return{err:'Diese Erinnerung ist nicht sinnvoll.'};o.rem=Math.round(m)}
  const rp=REPW[norm(a.repeat)];if(rp&&rp!=='none')o.rep=rp;
  if(a.note)o.note=String(a.note);
  const n=C.normalize(o);if(n.err)return{err:n.err};
  return{event:n.e};
}
function calendarSummary(e){
  const C=root.CalCore,r=e.rem==null?'':e.rem===0?', Erinnerung zum Beginn':e.rem>=1440?', Erinnerung '+Math.round(e.rem/1440)+' Tag vorher':e.rem>=60?', Erinnerung '+Math.round(e.rem/60)+' Std vorher':', Erinnerung '+e.rem+' Min vorher';
  const rp={daily:'täglich',weekly:'wöchentlich',monthly:'monatlich',yearly:'jährlich'}[e.rep];
  return '„'+e.title+'“ am '+C.dateLong(e.date)+(e.endDate?' bis '+C.dateLong(e.endDate):'')+(e.time?' um '+e.time+(e.end?' bis '+e.end:'')+' Uhr':' (ganztägig)')+r+(rp?', '+rp:'');
}
function calClash(e){
  const C=root.CalCore;if(!e.time)return'';
  const s=C.hm2m(e.time),en=e.end?C.hm2m(e.end):s+60;
  const o=C.occurrences(root.CalStore.state.events.filter(x=>x.id!==e.id),e.date,e.date).find(x=>x.time&&C.hm2m(x.time)<en&&(x.end?C.hm2m(x.end):C.hm2m(x.time)+60)>s);
  return o?' – Achtung: um '+o.time+' steht schon „'+o.title+'“':'';
}
function agendaRange(a,C,today){
  const w=norm(a.range||''),ws=C.weekStart(today);
  if(a.date){const d=C.resolveDate(a.date,today);return d?{from:d,to:d}:null}
  if(w==='morgen'){const d=C.addDays(today,1);return{from:d,to:d}}
  if(w==='woche')return{from:today,to:C.addDays(ws,6)};
  if(w==='naechste woche'||w==='naechste_woche')return{from:C.addDays(ws,7),to:C.addDays(ws,13)};
  if(w==='monat'){const y=C.ymd(today);return{from:today,to:C.mk(y.y,y.m,C.daysInMonth(y.y,y.m))}}
  return{from:today,to:today};
}
async function startCalReminders(){
  if(file()==='calendar.html')return;                                  // die Kalenderseite zeigt ihre eigenen Hinweise
  for(let i=0;i<120&&!(root.Jarvis&&root.Jarvis.notice);i++)await new Promise(r=>setTimeout(r,500));
  if(!root.Jarvis||!root.Jarvis.notice)return;
  try{await ensureCal();await root.CalStore.loadAll();root.CalStore.startReminders((o,txt)=>root.Jarvis.notice(txt,false,false))}catch(e){}
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
    savePending(call);N('Ich öffne '+(call.name==='set_puzzle'?'den Puzzle-Tracker':'Heute')+' und trage es dort ein.');
    setTimeout(()=>{location.href=pageOf(call.name)+(call.name==='set_puzzle'?'?v=3':'?v=5')},900);return;
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
  if(call.name==='show_graph'){
    const a=call.args||{},GF=root.GraphFull;if(!GF){say('Die Graph-Ansicht ist auf dieser Seite nicht geladen.',true);return true}
    const iso=/^\d{4}-\d\d-\d\d$/.test(a.date||'')?a.date:null;
    const r=GF.openByName(a.graph,{range:a.range||null,date:iso});
    const m=r.ok?(r.navigating?'Ich öffne '+r.title+'.':'Hier ist '+r.title+'.'):r.err;await log(m);say(m,!r.ok);return true;
  }
  if(call.name==='graph_range'){
    const GF=root.GraphFull,r=GF?GF.setRange((call.args||{}).range):{ok:false,err:'Kein Graph offen.'};const m=r.ok?'Zeitraum gewechselt.':r.err;await log(m);say(m,!r.ok);return true;
  }
  if(call.name==='graph_date'){
    const GF=root.GraphFull,r=GF?GF.gotoDate((call.args||{}).date):{ok:false,err:'Kein Graph offen.'};const m=r.ok?(r.none?'An dem Tag gibt es keine Daten.':'Markiert.'):r.err;await log(m);say(m,!r.ok);return true;
  }
  if(call.name==='set_meal'){
    const t=String((call.args||{}).time||'').trim().replace(/\s*uhr$/i,'').replace('.',':'),m=/^(\d{1,2})(?::(\d\d))?$/.exec(t);
    if(!m||+m[1]>23||+(m[2]||0)>59){const q='Um wie viel Uhr war die letzte große Mahlzeit (HH:MM)?';await log(q);say(q);return true}
    const hm=String(+m[1]).padStart(2,'0')+':'+(m[2]||'00'),q='Letzte große Mahlzeit um '+hm+' eintragen (heute)?';await log(q);
    J.confirm(q,()=>go({name:'set_meal',args:{time:hm}}));return true;
  }
  if(call.name==='set_sleep_safety'){
    const a=(call.args||{}).answer;if(a!=='ja'&&a!=='nein'){const q='Antwort auf die Sicherheitsfrage: ja oder nein?';await log(q);say(q);return true}
    const q='Sicherheitsfrage zu Schlaf mit „'+a+'“ speichern?';await log(q);
    J.confirm(q,async()=>{try{const u=root.auth&&root.auth.currentUser;if(!u)throw new Error('nicht angemeldet');await root.fs.doc('users/'+u.uid+'/sleepcfg/main').set({safety:a,safetyAt:Date.now()},{merge:true});say('Gespeichert: '+a+'. Die Schlaf-Karte im Recovery-Reiter rechnet beim nächsten Öffnen damit.')}catch(e){say('Das hat nicht geklappt: '+(e.message||e),true)}});return true;
  }
  if(call.name==='calendar_add'){
    try{await ensureCal()}catch(e){say('Der Kalender konnte nicht geladen werden.',true);return true}
    const C=root.CalCore,today=C.todayBerlin(),r=calendarPrepare(call.args,today);
    if(r.err||r.ask){await log(r.err||r.ask);say(r.err||r.ask,!!r.err);return true}
    let extra='';try{if(!root.CalStore.state.loaded)await root.CalStore.loadAll();extra=calClash(r.event)+(r.event.date<today?' – der Tag liegt in der Vergangenheit':'')}catch(e){}
    const q='Eintragen: '+calendarSummary(r.event)+extra+'?';await log(q);
    J.confirm(q,async()=>{
      if(file()==='calendar.html'){const x=await execHere(call);if(x.wait){say('Der Kalender lädt noch. Sag es gleich noch einmal.',true);return}say(x.say||x.err||x.ask||'Erledigt.',!!(x.err||x.ask));return}
      try{await root.CalStore.upsert(r.event);say('Eingetragen: '+calendarSummary(r.event)+'.')}catch(e){say('Das hat nicht geklappt: '+(e.message||e),true)}});
    return true;
  }
  if(call.name==='calendar_agenda'){
    try{await ensureCal();if(!root.CalStore.state.loaded)await root.CalStore.loadAll()}catch(e){say('Der Kalender konnte nicht geladen werden.',true);return true}
    const C=root.CalCore,today=C.todayBerlin(),R=agendaRange(call.args||{},C,today);
    if(!R){const m='Den Tag habe ich nicht verstanden.';await log(m);say(m,true);return true}
    const occ=C.occurrences(root.CalStore.state.events,R.from,R.to);let m=C.agendaText(occ,R.from,R.to,today);
    const nt=R.from===R.to&&root.CalStore.state.notes[R.from];if(nt&&nt.t)m+='\nNotiz: '+nt.t;
    await log(m);say(m);return true;
  }
  if(call.name==='calendar_open'){
    const C=root.CalCore||(await ensureCal(),root.CalCore),a=call.args||{},today=C.todayBerlin(),d=a.date?C.resolveDate(a.date,today):today;
    if(!d){say('Den Tag habe ich nicht verstanden.',true);return true}
    const view=['month','week','day','year'].includes(a.view)?a.view:'month';
    if(file()==='calendar.html'&&root.CalendarPage){root.CalendarPage.open(view,d);const m='Hier ist der Kalender: '+C.dateLong(d)+'.';await log(m);say(m);return true}
    const m='Ich öffne den Kalender.';await log(m);say(m);setTimeout(()=>{location.href='calendar.html?v=1&view='+view+'&d='+d},900);return true;
  }
  if(call.name==='calendar_note'){
    try{await ensureCal()}catch(e){say('Der Kalender konnte nicht geladen werden.',true);return true}
    const C=root.CalCore,a=call.args||{},today=C.todayBerlin(),d=C.resolveDate(a.date||'heute',today),txt=String(a.text||'').trim();
    if(!txt){const q='Was soll in die Notiz?';await log(q);say(q);return true}
    if(!d){const q='Für welchen Tag soll die Notiz sein?';await log(q);say(q);return true}
    const q='Zur Notiz vom '+C.dateLong(d)+' hinzufügen: „'+txt+'“?';await log(q);
    J.confirm(q,async()=>{
      if(file()==='calendar.html'){const x=await execHere({name:'calendar_note',args:{date:d,text:txt}});say(x.say||x.err||x.ask||'Erledigt.',!!(x.err||x.ask));return}
      try{if(!root.CalStore.state.loaded)await root.CalStore.loadAll();const cur=root.CalStore.state.notes[d]||{};await root.CalStore.setNote(d,{t:(cur.t?cur.t+'\n':'')+txt,m:cur.m||0});say('Notiz für '+C.dateShort(d)+' ergänzt.')}catch(e){say('Das hat nicht geklappt: '+(e.message||e),true)}});
    return true;
  }
  return false;
}
root.JarvisActions={tools,handle,runPending,resolveHabit,resolveGame,norm,GAMES,calendarPrepare,calendarSummary,agendaRange};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(startCalReminders,800));else setTimeout(startCalReminders,800);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(runPending,300));else setTimeout(runPending,300);
})(typeof window!=='undefined'?window:globalThis);
