/* Schlaf-Hebel-Karte im Recovery-Reiter (Phase 6). Rechnet NICHT selbst: alles kommt aus sleep-lever.js.
   Lädt Angaben aus dem Check-in (users/{uid}/journal: Alkohol, letzte Mahlzeit, krank; ältere aus users/{uid}/days), Trainingsbewertungen (training/acts_*), Einstellungen (sleepcfg/main) und
   die letzte Karte (sleepcards). Speichert die Karte als neue Collection users/{uid}/sleepcards/{Datum}. */
(function(root){
'use strict';
const esc=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const SL=root.SleepLever;
const SC={last:null,card:null,cfg:{},inputs:null};
let host,base,raw,today;

async function load(){
  const u=await requireUser();base='users/'+u.uid;
  const [dsnap,tsnap,cfg,cards,jsnap]=await Promise.all([
    fs.collection(base+'/days').get().catch(()=>({docs:[]})),
    fs.collection(base+'/training').get().catch(()=>({docs:[]})),
    fs.doc(base+'/sleepcfg/main').get().catch(()=>({exists:false})),
    fs.collection(base+'/sleepcards').get().catch(()=>({docs:[]})),
    fs.collection(base+'/journal').get().catch(()=>({docs:[]}))
  ]);
  const entries={};
  dsnap.docs.forEach(d=>{const x=d.data()||{},inp=x.in||{};
    let alc=null;if(inp.alkohol!=null)alc=(inp.alkohol|0)>0;else if(x.closed)alc=false;
    entries[d.id]={alcohol:alc,meal:x.meal||null,sick:!!x.sick}});
  jsnap.docs.forEach(d=>{const x=d.data()||{},o=entries[d.id]||(entries[d.id]={alcohol:null,meal:null,sick:false});   // Check-in geht vor
    if(x.alc===true||x.alc===false)o.alcohol=x.alc;if(x.meal)o.meal=x.meal;if(x.sick)o.sick=true});
  const rated={};
  tsnap.docs.forEach(d=>{if(/^acts_\d{4}$/.test(d.id))((d.data()||{}).list||[]).forEach(o=>{if(o&&/^w/.test(o.i||'')&&o.x)rated[String(o.i).slice(1)]=+o.x})});
  const cs=cards.docs.map(d=>Object.assign({_id:d.id},d.data())).filter(c=>c.stand).sort((a,b)=>a.stand<b.stand?-1:1);
  return{entries,rated,cfg:cfg.exists?cfg.data():{},cards:cs};
}
function compute(){
  const i=SC.inputs;
  const prev=i.cards.filter(c=>c.stand<today).pop()||null;
  SC.last=SL.analyze({days:raw,entries:i.entries,rated:i.rated,safety:i.cfg.safety||null,corrections:i.cfg.corrections||{},today,prevCard:prev});
  SC.card=SL.buildCard(SC.last,{today,entries:i.entries});
  return SC.last;
}
async function saveCard(){
  const i=SC.inputs;if(!SC.card||!SC.last||SC.last.status==='insufficient')return;
  const cur=i.cards.find(c=>c._id===today),sig=x=>JSON.stringify(Object.assign({},x,{createdAt:0,_id:0}));
  if(cur&&sig(cur)===sig(SC.card))return;
  try{await fs.doc(base+'/sleepcards/'+today).set(JSON.parse(JSON.stringify(SC.card)));
    const k=i.cards.findIndex(c=>c._id===today);const nc=Object.assign({_id:today},SC.card);if(k>=0)i.cards[k]=nc;else i.cards.push(nc)}catch(e){}
}
function cardText(c){
  const L=[];L.push('SCHLAF-KARTE · Stand '+c.stand);
  if(c.zeitraum)L.push('Zeitraum: '+c.zeitraum.von+' bis '+c.zeitraum.bis+' ('+c.zeitraum.naechte+' auswertbare Nächte)');
  L.push('Gerät: '+c.geraet);
  if(c.basis)L.push('Basis: Median Wirkungswert '+SL.r1(c.basis.wirkungswertMedian)+', Median Schlafdauer '+(c.basis.schlafdauerMedianMin!=null?SL.dur(c.basis.schlafdauerMedianMin):'unbekannt'));
  L.push('Hebel: '+c.hebel);L.push('Handlung: '+(c.handlung||'noch keine'));
  L.push('Geprüft ohne Befund: '+(c.geprueftOhneBefund.length?c.geprueftOhneBefund.join(' | '):'–'));
  L.push('Angaben: Alkohol '+c.angaben.alkohol+', spätes Essen '+c.angaben.spaetesEssen);
  L.push('Schnarchen/Tagesmüdigkeit: '+c.schnarchenTagesmuedigkeit);
  L.push('Offen: '+(c.offen.length?c.offen.join(' | '):'–'));
  return L.join('\n');
}
function render(){
  const r=SC.last,M=r.measure;
  let h='<h2>😴 Schlaf-Hebel</h2><div class="sub">Was beeinflusst deinen Schlaf und deine Erholung am stärksten – belegt mit deinen eigenen Zahlen. Rechnet fest nach Regeln, nicht per KI.</div>';
  if(r.safety.top)h+='<div class="slSafe"><b>Zuerst abklären:</b> '+esc(r.safety.top)+'</div>';
  if(r.safety.extra)h+='<div class="slSafe">'+esc(r.safety.extra)+'</div>';
  if(r.safety.ask)h+='<div class="slAsk"><b>Sicherheitsfrage</b> (wird nie angenommen, Schweigen ist kein „nein“): '+esc(r.safety.question)+'<div class="slBtns"><button data-sf="ja">Ja</button><button data-sf="nein">Nein</button><span class="hint">Aktuell: '+esc(r.safety.answer)+'</span></div></div>';
  if(r.status==='insufficient'){
    h+='<div class="slLine">'+esc(r.part1)+'</div><div class="slBeleg">'+esc(r.part2)+'</div>';
    if(r.zettel){h+='<div class="slBlock"><b>'+esc(r.zettel.title)+'</b> – nur was noch manuell fehlt:<ul>'+r.zettel.items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><div class="hint">'+esc(r.zettel.note)+'</div></div>'}
  }else{
    h+='<div class="slLine">'+esc(r.part1)+'</div><div class="slBeleg">'+esc(r.part2)+'</div>';
    if(r.coNote)h+='<div class="hint">'+esc(r.coNote)+'</div>';
    h+='<div class="slLesart"><b>Lesart:</b> '+r.lesart.map(esc).join(' ')+'</div>';
    if(r.action)h+='<div class="slAct"><b>Handlung:</b> '+esc(r.action)+'</div>';
    else if(r.zettel){h+='<div class="slBlock"><b>'+esc(r.zettel.title)+'</b><ul>'+r.zettel.items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul><div class="hint">'+esc(r.zettel.note)+'</div></div>'}
    if(r.keep)h+='<div class="slBlock">'+esc(r.keep.text)+'</div>';
    h+='<div class="slBlock"><b>Geprüft und kein Hebel</b><ul>'+r.suspects.filter(s=>s.id!==r.lever).map(s=>'<li><b>'+s.id+'. '+esc(s.name)+':</b> '+esc(s.reason||'')+(s.note?' <span class="hint">'+esc(s.note)+'</span>':'')+'</li>').join('')+'</ul></div>';
  }
  h+='<div class="slBlock"><b>Angenommen:</b> '+(r.assumed.length?r.assumed.map(esc).join(' '):'Nichts außer der Lesart oben.')+' Bitte nur Falsches korrigieren:'+
    '<div class="slBtns"><label>Bettzeit liegt <input type="number" id="slOff" min="0" max="180" step="5" value="'+((SC.inputs.cfg.corrections||{}).bedOffset||0)+'"> Min vor dem Whoop-Schlafbeginn</label>'+
    '<label>Hart ab <input type="number" id="slHard" min="30" max="300" step="5" value="'+((SC.inputs.cfg.corrections||{}).hardMin||90)+'"> Min Dauer</label><button id="slApply">Neu rechnen</button></div></div>';
  h+='<div class="hint">'+esc(r.honesty)+'</div>';
  const c=SC.card;
  h+='<div class="slBlock"><b>Schlaf-Karte</b> <button id="slCopy">Kopieren</button><span class="hint" id="slCopyMsg"></span><pre class="slPre" id="slPre">'+esc(cardText(c))+'</pre></div>';
  h+='<div class="hint">'+esc(r.disclaimer)+' Keine Diagnose, keine Empfehlung für Melatonin, Schlafmittel oder Supplemente.</div>';
  const hist=SC.inputs.cards.filter(x=>x._id!==today).slice(-6).reverse();
  if(hist.length)h+='<details class="slBlock"><summary>Verlauf der Karten ('+hist.length+')</summary><ul>'+hist.map(x=>'<li>'+esc(x.stand)+': '+esc(x.hebel||'noch keiner')+'</li>').join('')+'</ul></details>';
  host.innerHTML=h;
}
async function saveCfg(patch){
  SC.inputs.cfg=Object.assign({},SC.inputs.cfg,patch);
  try{await fs.doc(base+'/sleepcfg/main').set(JSON.parse(JSON.stringify(SC.inputs.cfg)),{merge:true})}catch(e){}
  compute();render();saveCard();
}
async function init(o){
  host=document.getElementById('sleepLever');if(!host||!SL)return;
  raw=o.raw;today=o.today;
  host.innerHTML='<h2>😴 Schlaf-Hebel</h2><div class="sub">Lädt …</div>';
  try{SC.inputs=await load();compute();render();saveCard()}catch(e){host.innerHTML='<h2>😴 Schlaf-Hebel</h2><div class="sub">Konnte nicht berechnet werden: '+esc(e.message||e)+'</div>';return}
  host.addEventListener('click',async e=>{
    const sf=e.target.closest('[data-sf]');if(sf){await saveCfg({safety:sf.dataset.sf,safetyAt:Date.now()});return}
    if(e.target.id==='slApply'){const off=Math.max(0,Math.min(180,+document.getElementById('slOff').value||0)),hm=Math.max(30,Math.min(300,+document.getElementById('slHard').value||90));await saveCfg({corrections:{bedOffset:off,hardMin:hm}});return}
    if(e.target.id==='slCopy'){const t=cardText(SC.card);try{await navigator.clipboard.writeText(t);document.getElementById('slCopyMsg').textContent=' kopiert ✓'}catch(x){const p=document.getElementById('slPre');const rg=document.createRange();rg.selectNodeContents(p);const s=getSelection();s.removeAllRanges();s.addRange(rg);document.getElementById('slCopyMsg').textContent=' markiert, bitte kopieren'}}
  });
}
root.SleepCard={init,state:SC,cardText,setMeal:null,
  /* für Jarvis: liest nur aus Karte/Ergebnis */
  read(topic){const r=SC.last,c=SC.card;if(!r)return null;
    if(topic==='missing')return r.status==='insufficient'?'Es fehlen noch '+r.missing+' auswertbare Nächte, nötig sind 14.':'Für die Prüfung reichen die Nächte ('+r.usable+'). '+(r.suspects.filter(s=>s.state==='unchecked').map(s=>'Verdächtiger '+s.id+' ungeprüft: '+s.reason).join(' ')||'Alle Verdächtigen sind geprüft.');
    if(topic==='explain')return [r.part1,r.part2,r.action||'',r.honesty].filter(Boolean).join(' ');
    return r.lever!=null?r.part1+' '+(r.action||''):r.part1}};
})(typeof self!=='undefined'?self:this);
