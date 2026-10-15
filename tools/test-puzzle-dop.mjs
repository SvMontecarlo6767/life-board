// Vergleicht puzzle-dop.js mit den Original-Funktionen aus puzzle.html (werden per Regex herausgeschnitten und ausgeführt).
import fs from 'fs'; import vm from 'vm'; import {createRequire} from 'module';
const require=createRequire(import.meta.url);
const html=fs.readFileSync(new URL('../puzzle.html',import.meta.url),'utf8');
const Gsrc=html.match(/const G=\[[\s\S]*?\n\];/)[0];
const a=html.indexOf('function dopRawEntries'), b=html.indexOf('/* ---- Dopamin-Ränge');
const code=Gsrc+'\nconst num=v=>{const n=parseFloat(String(v).replace(",","."));return isNaN(n)?null:n};\nlet D={};\n'+html.slice(a,b)+'\n;this.out={computeDopamineCtx,setD:x=>{D=x}};';
const ctx={}; vm.createContext(ctx); vm.runInContext(code,ctx);
const back=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const D={}; for(const [d,v] of Object.entries(back.days)) D[d]=v.g||v;
ctx.out.setD(D);
const orig=ctx.out.computeDopamineCtx().daySeries;
const mine=require('../puzzle-dop.js').puzzleDayValues(D);
let bad=0;
for(const r of orig){ if(mine[r.date]!==r.delta){bad++;console.log('ABWEICHUNG',r.date,r.delta,mine[r.date])} }
const n=Object.keys(mine).length;
if(n!==orig.length){bad++;console.log('Anzahl Tage verschieden',n,orig.length)}
console.log(bad?'FEHLER':'OK',orig.length,'Tage identisch; Summe',orig.reduce((s,r)=>s+r.delta,0),'; letzter Tag',orig[orig.length-1].date,orig[orig.length-1].delta);
process.exit(bad?1:0);
