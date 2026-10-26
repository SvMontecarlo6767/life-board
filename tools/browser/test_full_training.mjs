// Teil von test_full.mjs: Training-Vollbilder (wird von dort mit page/openFull/closeFull aufgerufen)
import {execFileSync} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
export default async function({page,openFull,closeFull,ck,shots}){
  let f=0;const c=(n,x,y)=>{if(!x)f++;ck(n,x,y)};
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lbt-')),file=path.join(dir,'seed.json');
  execFileSync('node',[path.join(path.dirname(fileURLToPath(import.meta.url)),'gen_training_seed.mjs'),file,'2026-10-25']);
  const seed=JSON.parse(fs.readFileSync(file,'utf8'));seed['users/u1/training/settings'].view='allround';
  const pg=await page('training.html',+(process.env.W||820),+(process.env.H||1180),seed);
  await pg.waitForSelector('#c-form svg',{timeout:20000}).catch(()=>{});await pg.waitForTimeout(1500);
  if(!(await pg.$('#c-form svg'))){c('Training geladen',false,await pg.textContent('body').then(t=>t.slice(0,300)));return f}
  await openFull(pg,'#c-form');
  c('Form: drei Kurven an',(await pg.$$eval('#gfLayers [aria-pressed=true]',x=>x.length))===3);
  c('Form: Fakten + Erklärung',/Tage pro Formbereich/.test(await pg.textContent('#gfStats'))&&/Schwellenpuls/.test(await pg.textContent('#gfStats')));
  await pg.click('#gfLayers [data-l=main]');await pg.click('#gfLayers [data-l=fat]');
  c('Form: nur Fitness wählbar',/StatistikfürFitness/.test((await pg.textContent('#gfStats')).replace(/\s+/g,'')));
  if(shots)await pg.screenshot({path:shots+'/full-form.png'});await closeFull(pg);
  await openFull(pg,'#m-weeks');c('Wochen: Sportarten gestapelt',/Verteilung im Zeitraum/.test(await pg.textContent('#gfStats'))&&(await pg.$$eval('#gfLayers .gf-lg span',x=>x.length))>=2);
  if(shots)await pg.screenshot({path:shots+'/full-weeks.png'});await closeFull(pg);
  await openFull(pg,'#c-gauge');c('Belastung: Verlauf + Erklärung',(await pg.$$eval('#gfStage path',x=>x.length))>0&&/ACWR/.test(await pg.textContent('#gfStats')));
  if(shots)await pg.screenshot({path:shots+'/full-acwr.png'});await closeFull(pg);
  await openFull(pg,'#c-cal');c('Tag für Tag: Zahlen',/Längste Serie/.test(await pg.textContent('#gfStats'))&&/Monate/.test(await pg.textContent('#gfStats')));
  if(shots)await pg.screenshot({path:shots+'/full-cal.png'});await closeFull(pg);
  await openFull(pg,'#sky');c('Trainingslast: Berechnung erklärt',/Stunden × \(Intensität\)²/.test(await pg.textContent('#gfStats')));await closeFull(pg);
  c('Training ohne Seitenfehler',!pg.errs.length,pg.errs.join(' | '));
  return f;
}
