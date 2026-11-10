import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory='test-results/practice-guide';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'})));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 const freeChecks=[];
 if(phase==='after'){
  await page.click('#practice');await page.waitForTimeout(200);
  assert(await page.locator('#free-practice').isVisible());assert.equal(await page.locator('#practice-coach').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.__avtodrom.scene.goal.visible||window.__avtodrom.scene.guide.visible),false);
  assert.equal(await page.evaluate(()=>window.__avtodrom.scene.goal.children.some(n=>n.geometry?.type==='RingGeometry')),false);
  await page.evaluate(async()=>{const a=window.__avtodrom,{course}=await import('/src/data/course.ts');for(const e of course.exercises){a.vehicle.reset(e.point,e.yaw);a.step(1/60);}});
  const free=await page.evaluate(()=>window.__avtodrom.snapshot());assert(free.freePractice&&free.state==='driving'&&free.index===0&&free.score===0&&free.events.length===0);
  freeChecks.push('free driving has no assigned route, rings or auto-completion');
  // Exercise the live step, toast, counter and persistent history together.
  await page.evaluate(()=>{
   const a=window.__avtodrom,v=a.vehicle,update=v.update,telemetry=v.telemetry;
   const t={...v.telemetry(),speed:1,signedSpeed:1,belt:false,collision:true,stalled:false};
   try{v.update=()=>{};v.telemetry=()=>t;a.step(1/60);}finally{v.update=update;v.telemetry=telemetry;}
  });
  await page.waitForFunction(()=>document.querySelector('#penalty-score').textContent==='105');
  assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'driving');
  assert((await page.locator('#toast').innerText()).includes('ремень'));assert((await page.locator('#toast').innerText()).includes('Столкнулся'));
  await page.locator('#practice-errors summary').focus();await page.keyboard.press('Space');
  assert(await page.locator('#practice-errors').evaluate(e=>e.open));assert.equal(await page.locator('#practice-error-list li').count(),2);
  assert.equal(await page.locator('#penalty-score small').count(),0);
  await page.screenshot({path:`${directory}/free-scored-errors.png`});
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'paused');
  await page.click('#resume');await page.locator('#practice-errors summary').click();
  await page.waitForFunction(()=>document.querySelector('#practice-error-list').children.length===2);
  freeChecks.push('educational points above 100, simultaneous error explanations, keyboard history and pause persistence');
  await page.click('#choose-practice-exercise');assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'paused');
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'driving');
  await page.click('#choose-practice-exercise');await page.click('#close');assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'driving');
  await page.click('#choose-practice-exercise');await page.click('[data-exercise="5"]');await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().freePractice),false);assert(await page.locator('#practice-coach').isVisible());
  await page.click('#leave-exercise');await page.waitForTimeout(200);assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().freePractice),true);
  freeChecks.push('choose, close, cancel and return from selected exercise');
  await page.screenshot({path:`${directory}/free-driving.png`});
 }
 const visits=[];
 for(let i=0;i<12;i++){
  await page.evaluate(({index,phase})=>{const a=window.__avtodrom;a.start('practice',index);if(phase==='after'){a.vehicle.belt=true;a.vehicle.drivetrain.engine=true;a.vehicle.drivetrain.gear=1;a.vehicle.drivetrain.handbrake=false;}},{index:i,phase});await page.waitForFunction(()=>document.querySelector('#exercise-name')?.textContent);await page.waitForTimeout(250);
  visits.push(await page.evaluate(()=>{const a=window.__avtodrom,s=a.scene;return {exercise:a.snapshot().exercise,guideVisible:s.guide.visible,arrows:s.guide.children[0].count,target:s.goal.position.toArray(),text:document.querySelector('.exercise-card').innerText,coach:document.querySelector('#practice-coach')?.dataset.phase};}));
  if(phase==='after'){
   assert(visits.at(-1).coach,`Stage ${i} has a live action`);assert(visits.at(-1).arrows<16,`Stage ${i} shows only nearby arrows`);
   assert(visits.at(-1).guideVisible);
  }
  if(phase==='after'||[0,4,6,10].includes(i))await page.screenshot({path:`${directory}/${phase}-${i}.png`});
 }
 const checks=[...freeChecks],layouts=[];
 if(phase==='after'){
  // A missed stop stays in practice and can restart just this stage.
  await page.evaluate(async()=>{
   const a=window.__avtodrom,{course}=await import('/src/data/course.ts');a.start('practice',1);
   a.vehicle.reset(course.exercises[1].point,course.exercises[1].yaw);a.vehicle.belt=true;a.vehicle.drivetrain.engine=true;a.vehicle.drivetrain.gear=1;a.vehicle.drivetrain.handbrake=false;a.step(1/60);
  });
  await page.waitForFunction(()=>document.querySelector('#practice-coach').dataset.phase==='missed-stop');
  assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'driving');
  await page.click('#retry-stage');await page.waitForFunction(()=>document.querySelector('#practice-coach').dataset.phase==='belt');
  assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().exercise),'pedestrian');checks.push('missed stop and stage retry');
  const crossFinish=async indicator=>page.evaluate(async indicator=>{
   const a=window.__avtodrom,{course}=await import('/src/data/course.ts'),e=course.exercises[11];
   for(const x of [e.point.x+3.5,e.point.x-.25]){
    a.vehicle.reset({x,z:e.point.z},e.yaw);a.vehicle.belt=true;a.vehicle.indicator=indicator;
    a.vehicle.drivetrain.engine=true;a.vehicle.drivetrain.gear=1;a.vehicle.drivetrain.handbrake=false;a.step(1/60);
   }
  },indicator);
  await page.evaluate(()=>window.__avtodrom.start('practice',11));await crossFinish('off');await page.waitForFunction(()=>document.querySelector('#practice-coach').dataset.phase==='retry-required');
  assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'driving');assert.equal(await page.locator('#practice-coach').getAttribute('data-phase'),'retry-required');
  await page.click('#retry-stage');assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().score),0);
  await crossFinish('right');assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'result');
  checks.push('selected finish rejects a missing signal, retry clears the attempt, correct crossing passes');
  await page.evaluate(()=>window.__avtodrom.start('practice',1));await page.waitForTimeout(150);
  // Opening instructions with the keyboard must not release the handbrake.
  await page.locator('#exercise-method summary').focus();await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.handbrake),true);
  assert.equal(await page.locator('#exercise-method').getAttribute('open'),'');checks.push('keyboard instruction disclosure');
  await page.locator('#exercise-method summary').press('Space');await page.evaluate(()=>document.activeElement.blur());
  // Actual scoring hold and the matching physical marker / painted stop edge.
  await page.evaluate(async()=>{
   const a=window.__avtodrom,{course}=await import('/src/data/course.ts'),{vehicleConfig}=await import('/src/data/vehicle.ts'),{stopLineApproachEdge}=await import('/src/data/marking-standards.ts');
   const e=course.exercises[1],s=e.stop,edge=stopLineApproachEdge(s.point,s.normal),offset=vehicleConfig.length/2+.5;
   a.vehicle.reset({x:edge.x-s.normal.x*offset,z:edge.z-s.normal.z*offset},e.yaw);a.vehicle.belt=true;a.vehicle.drivetrain.engine=true;a.vehicle.drivetrain.gear=1;a.vehicle.drivetrain.handbrake=false;
   a.engine().update(a.vehicle.telemetry(),{stopDistance:.5},1);
  });
  await page.waitForFunction(()=>document.querySelector('#practice-coach').dataset.phase==='stop-hold');
  const hold=await page.locator('#coach-detail').innerText();assert(/Стойте ещё/.test(hold));await page.screenshot({path:`${directory}/stop-hold.png`});checks.push('live stop countdown');
  // Cover both UI languages and compact screens, including expanded text.
  for(const [name,width,height,language]of [['desktop',1440,900,'ru'],['small',375,667,'ru'],['landscape',844,390,'ru'],['uzbek',1024,768,'uz']]){
   await page.setViewportSize({width,height});
   if(language==='uz'){
    await page.evaluate(()=>{const a=window.__avtodrom;a.pause();});await page.click('#modal #settings');await page.selectOption('#language','uz');await page.click('#close');await page.click('#resume');
   }
   await page.evaluate(()=>{const a=window.__avtodrom;a.start('practice');const t=a.vehicle.telemetry();a.engine().update({...t,speed:1,belt:false,collision:true},{},1/60);});
   await page.waitForTimeout(200);await page.locator('#practice-errors summary').click();
   await page.waitForFunction(()=>{const card=document.querySelector('.exercise-card').getBoundingClientRect(),error=document.querySelector('#practice-error-list li')?.getBoundingClientRect();return error&&error.top>=card.top&&error.bottom<=card.bottom;});
   const freeFit=await page.evaluate(()=>{const card=document.querySelector('.exercise-card'),r=card.getBoundingClientRect(),stats=document.querySelector('.exam-stats').getBoundingClientRect(),hint=document.querySelector('.startup-hint').getBoundingClientRect(),error=document.querySelector('#practice-error-list li').getBoundingClientRect();return {inside:r.x>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:card.scrollWidth>card.clientWidth+1,header:stats.x>=0&&stats.right<=innerWidth+1,score:document.querySelector('#penalty-score').textContent,historyVisible:error.top>=r.top&&error.bottom<=r.bottom,separate:r.right<=hint.left||r.bottom<=hint.top||r.left>=hint.right||r.top>=hint.bottom};});
   assert(freeFit.inside&&!freeFit.overflow&&freeFit.header&&freeFit.score==='105'&&freeFit.historyVisible&&freeFit.separate,JSON.stringify({name,freeFit}));
   await page.screenshot({path:`${directory}/${name}-free-errors.png`});layouts.push({name:`${name}-free`,...freeFit});
   await page.evaluate(()=>window.__avtodrom.start('practice',10));await page.waitForTimeout(250);
   await page.locator('#exercise-method summary').click();
   const fit=await page.evaluate(()=>{
    const card=document.querySelector('.exercise-card'),r=card.getBoundingClientRect(),panel=document.querySelector('.instrument-panel').getBoundingClientRect();
    return {inside:r.x>=0&&r.y>=0&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1,overflow:card.scrollWidth>card.clientWidth+1,separate:r.right<=panel.left||r.bottom<=panel.top||r.left>=panel.right||r.top>=panel.bottom};
   });
   assert(fit.inside&&!fit.overflow&&fit.separate,JSON.stringify({name,fit}));layouts.push({name,...fit});await page.screenshot({path:`${directory}/${name}-expanded.png`});
  }
  await page.evaluate(()=>window.__avtodrom.start('exam'));await page.waitForTimeout(150);
  assert.equal(await page.locator('#practice-coach').isVisible(),false);assert.equal(await page.locator('#retry-stage').isVisible(),false);
  assert.equal(await page.evaluate(()=>window.__avtodrom.scene.guide.visible||window.__avtodrom.scene.goal.visible),false);checks.push('exam excludes training aids');
 }
 await writeFile(`${directory}/${phase}.json`,JSON.stringify({visits,checks,layouts,errors},null,2));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({visits:visits.map(v=>({exercise:v.exercise,arrows:v.arrows,coach:v.coach})),checks,layouts,errors},null,2));
}finally{await browser.close();}
