/* Puzzle-Dopamin: 1:1-Kopie der Rechenlogik aus puzzle.html (dopRawEntries … computeDopamineCtx).
   puzzle.html bleibt unverändert; tools/test-puzzle-dop.mjs prüft, dass beide Versionen identische Zahlen liefern.
   Eingabe: D = { 'yyyy-mm-dd': { spielId: {s,w,hint,...} } }  (das Feld "g" jedes Puzzle-Tag-Dokuments). */
(function(root){
const G=[
 {id:'fermi',dir:'low',win:1},{id:'spm',dir:'low',win:1,max:10},{id:'spm2',dir:'low',win:1,active:false},
 {id:'ner',dir:'low',win:1,max:6},{id:'glo',dir:'low',win:1},{id:'tra',dir:'low',win:1},{id:'ran',dir:'high',win:1},
 {id:'tim',dir:'high',win:0},{id:'stl',dir:'low',win:1},{id:'col',dir:'high',win:0,max:50},{id:'hol',dir:'high',win:0},
 {id:'satl',dir:'low',win:1,max:6},{id:'tmd',dir:'high',win:0},{id:'hf',dir:'low',win:1,max:3},{id:'vlt',dir:'low',win:1,max:3},
 {id:'zoo',dir:'low',win:1,max:10,hint:true}
];
const num=v=>{const n=parseFloat(String(v).replace(',','.'));return isNaN(n)?null:n};
function dopRawEntries(D,g){const r=[];Object.keys(D).sort().forEach(d=>{const e=D[d][g.id];if(!e)return;
 if((e.s==null||e.s==='')&&e.w==null)return;
 const n=e.w===0?null:num(e.s);
 r.push({d,n,w:g.win?(e.w===0?0:1):null,hint:!!(g.hint&&e.hint)})});return r}
function dopTableValue(g,n){
 switch(g.id){
  case 'fermi':return n<=1.5?35:n<2?30:n<3?20:n<5?10:n<8?0:-20;
  case 'spm':case 'spm2':return n<=3?35:n<=5?25:n<=7?15:5;
  case 'ner':return n===1?100:n===2?50:n===3?25:n===4?12:n===5?-10:-20;
  case 'glo':return n<=3?35:n<=5?25:n<=8?15:n<=10?5:n<=14?-10:-20;
  case 'tra':return n===0?20:n===1?5:n===2?-10:n===3?-20:-25;
  case 'ran':return n===4?35:n===3?15:-5;
  case 'tim':{const k=n/1000;return k>45?100:k>42?50:k>40?40:k>38?30:k>36?20:k>33?10:k>30?-5:k>25?-15:-30;}
  case 'stl':return n===1?70:n===2?40:n===3?25:n===4?20:n===5?10:-5;
  case 'col':return n>47?60:n>45?40:n>43?25:n>40?10:n>37?-5:-15;
  case 'hol':return n>=25?100:n>23?50:n>21?25:n>19?15:n>17?5:-10;
  case 'satl':return n===1?70:n===2?40:n===3?25:n===4?15:n===5?10:-10;
  case 'tmd':return n>=36?100:n>34?50:n>32?25:n>30?15:n>28?5:n>25?-5:-15;
  case 'hf':case 'vlt':return n===1?50:n===2?20:-10;
  case 'zoo':return n<=2?70:n<=4?40:n<=6?25:n<=8?10:-10;
  default:return 0;
 }
}
function dopamineGameSeries(D,g){
 const es=dopRawEntries(D,g);
 const series=[];let bestSoFar=null;const seenCounts={};
 let sumTotal=0,hsCount=0,failCount=0;
 es.forEach((e,i)=>{
  const parts=[{label:'Basis',v:1}];let total,isHS=false,bonus=0;
  if(e.w===0){
   parts.push({label:'Nicht geschafft',v:-30});total=1-30;failCount++;
  } else {
   const tbl=dopTableValue(g,e.n);
   parts.push({label:'Ergebnis',v:tbl});total=1+tbl;
   if(i>=3){
    const better=bestSoFar==null||(g.dir==='low'?e.n<=bestSoFar:e.n>=bestSoFar);
    if(better){
     isHS=true;const rep=seenCounts[e.n]||0;bonus=rep>5?20:50;
     parts.push({label:'Highscore',v:bonus});total+=bonus;hsCount++;
    }
   }
   if(g.hint&&e.hint){parts.push({label:'Hinweis',v:-15});total-=15}
  }
  sumTotal+=total;
  series.push({date:e.d,total,cum:sumTotal,parts,isHS,w:e.w});
  if(e.w!==0&&e.n!=null){
   bestSoFar=bestSoFar==null?e.n:(g.dir==='low'?Math.min(bestSoFar,e.n):Math.max(bestSoFar,e.n));
   seenCounts[e.n]=(seenCounts[e.n]||0)+1;
  }
 });
 return{series,sumTotal,hsCount,failCount,played:es.length};
}
/* Rückgabe: { 'yyyy-mm-dd': Tageswert (Summe über alle Spiele) } – derselbe Wert wie "delta" in computeDopamineCtx().daySeries */
function puzzleDayValues(D){
 const dayMap={};
 G.forEach(g=>{dopamineGameSeries(D,g).series.forEach(pt=>{dayMap[pt.date]=(dayMap[pt.date]||0)+pt.total})});
 return dayMap;
}
const api={puzzleDayValues,dopamineGameSeries,G};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.PuzzleDop=api;
})(typeof window!=='undefined'?window:globalThis);
