/* Life Board – Dopamin-Konto: ein Tag aus Eingaben + Whoop-Automatik + Puzzle + Lernen, und das Konto über alle Tage.
   Wird von heute.html und vom Hub (index.html) benutzt, damit beide dieselbe Zahl zeigen.
   c liefert die aktuellen Daten (Getter oder einfache Felder): E, WA, CURV, RULES, DAYS, PUZ, LEARN, JOURNAL (Zähler aus dem Check-in, optional), SETTINGS, WH, WHSTATE, today. */
(function(root){
function create(c){
  const E=c.E,WA=c.WA;
  const versionOf=k=>(c.DAYS[k]&&c.DAYS[k].rulesVersion)||c.CURV;
  function puzFor(k){
    const d=c.DAYS[k];
    if(d&&d.closed&&d.puz!==undefined)return d.puz;
    return c.PUZ[k]===undefined?null:c.PUZ[k];
  }
  function learnFor(k){
    const d=c.DAYS[k];
    if(d&&d.closed&&d.learn!==undefined)return d.learn||{};
    return c.LEARN[k]||{};
  }
  function journalFor(k){
    const d=c.DAYS[k];
    if(d&&d.closed&&d.jr!==undefined)return d.jr||{};
    return(c.JOURNAL||{})[k]||{};
  }
  function blockedFor(k,rules){
    const b={};
    for(const a of rules.actions){
      if(!a.period)continue;
      const pk=E.periodKey(a.period,k);
      for(const d of Object.keys(c.DAYS)){
        if(d===k)continue;
        const dc=c.DAYS[d].a||{};
        if(E.periodKey(a.period,d)===pk&&(dc[a.id]|0)>0){b[a.id]=d;break}
      }
    }
    return b;
  }
  function sportInput(rules,inp){return rules.ui.buttons.some(b=>b.group==='sport'&&(inp[b.id]|0)>0)}
  /* Alles zu einem Tag: Eingaben + Whoop-Automatik -> Aktionen -> Punkte */
  function calc(k){
    const DAYS=c.DAYS,WH=c.WH,WHSTATE=c.WHSTATE;
    const d=DAYS[k]||{};const v=versionOf(k);const rules=c.RULES[v]||c.RULES[c.CURV];
    if(v<2){ // altes Regelwerk: nur Anzeige
      const res=E.computeDay(rules,d.a||{},{puz:puzFor(k),blocked:{}});
      return{rules,res,counts:d.a||{},auto:{},why:{},whoopHas:{},legacy:true,blocked:{},row:null,have:{}};
    }
    const inp=d.in||{};
    const whoopHas={};
    if(WH&&Object.keys(WH).length){const wm=WA.workoutMinutes(WH,k);rules.ui.buttons.forEach(b=>{if(b.whoop&&wm[b.whoop]>=b.tiers[0].min)whoopHas[b.whoop]=wm[b.whoop]})}
    const manual=E.deriveCounts(rules,inp,Object.fromEntries(rules.ui.buttons.filter(b=>b.whoop&&whoopHas[b.whoop]).map(b=>[b.id,true])));
    let auto,why={},row=null,have={};
    const frozen=d.closed&&d.auto;
    if(frozen){auto=d.auto;why=d.autoWhy||{}}
    else if(WHSTATE==='ok'){
      const prev=DAYS[E.addDays(k,-1)];
      const a=WA.autoDay(WH,k,{final:k<c.today,target:(c.SETTINGS||{}).bedtimeTarget||null,prevAlcohol:!!(prev&&prev.in&&(prev.in.alkohol|0)>0),manualSport:sportInput(rules,inp)});
      auto=a.counts;why=a.why;row=a.row;have=a.have;
    }else{auto=d.auto||{};why=d.autoWhy||{}}   // Whoop gerade nicht da: zuletzt gespeicherten Whoop-Stand benutzen, nie 0
    let counts=E.mergeCounts(manual,auto);counts=E.mergeCounts(counts,d.x||{});counts=E.mergeCounts(counts,learnFor(k));counts=E.mergeCounts(counts,journalFor(k));
    const blocked=blockedFor(k,rules);
    const res=E.computeDay(rules,counts,{puz:puzFor(k),blocked});
    return{rules,res,counts,auto,why,whoopHas,legacy:false,blocked,row,have,inp};
  }
  /* Konto: abgeschlossene Tage mit ihrem gespeicherten Wert, alle anderen live aus Whoop + Eingaben.
     Tage ohne gespeicherten Eintrag (Board nicht geöffnet) zählen auch, sonst fehlen z. B. Schlafpunkte. */
  function netOf(k){
    const d=c.DAYS[k];
    if(!d)return calc(k).res.net;
    if(d.closed||versionOf(k)<2||c.WHSTATE!=='ok')return d.net||0;
    return calc(k).res.net;
  }
  /* Alle Tage, die ins Konto zählen: vom ersten gespeicherten Tag bis heute, lückenlos */
  function accountDays(){
    const ks=Object.keys(c.DAYS).sort();if(!ks.length)return[];
    const set=new Set(ks);
    for(let k=ks[0];k<=c.today;k=E.addDays(k,1))set.add(k);
    return[...set].sort();
  }
  /* Tage bis heute, die noch keinen Eintrag haben, aber Punkte bringen (zum Nachtragen) */
  function missingDays(){
    if(c.WHSTATE!=='ok')return[];
    return accountDays().filter(k=>!c.DAYS[k]&&(calc(k).res.net!==0||Object.keys(calc(k).auto||{}).length>0));
  }
  /* Kontostand vor Tag k: Summe aller früheren Tage (beim Blättern in die Vergangenheit zählen spätere Tage nicht mit) */
  function priorAccount(k){let s=0;for(const d of accountDays()){if(d<k)s+=netOf(d)}return s}
  function total(){return accountDays().reduce((s,d)=>s+netOf(d),0)}
  return{versionOf,puzFor,learnFor,journalFor,blockedFor,sportInput,calc,netOf,accountDays,missingDays,priorAccount,total};
}
const api={create};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LBAccount=api;
})(typeof window!=='undefined'?window:globalThis);
