import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/mobile-controls';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const report={engine:'Chromium, emulated touch input via CDP',layouts:[],checks:[],errors:[]};
const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:3});
await context.addInitScript(()=>{if(!localStorage.getItem('avtodrom.settings.v1'))localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'}));Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});Object.defineProperty(screen.orientation,'lock',{configurable:true,value:()=>Promise.reject(new Error('Orientation lock unavailable in this test'))});});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
const ready=()=>page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});
const snapshot=()=>page.evaluate(()=>window.__avtodrom.snapshot());
const telemetry=()=>page.evaluate(()=>window.__avtodrom.snapshot().telemetry);
const shot=async name=>process.env.MOBILE_CAPTURE==='0'?undefined:page.screenshot({path:`${directory}/${name}.png`});
const tap=async selector=>{await page.locator(selector).tap();};
const center=async selector=>{const r=await page.locator(selector).boundingBox();assert(r,selector);return {x:r.x+r.width/2,y:r.y+r.height/2};};
const client=await context.newCDPSession(page);const fingers=new Map();
async function finger(type,id,position){
  if(type==='touchEnd'||type==='touchCancel')fingers.delete(id);else fingers.set(id,{id,...position,radiusX:3,radiusY:3,force:1});
  await client.send('Input.dispatchTouchEvent',{type,touchPoints:[...fingers.values()]});
}
async function bounds(){return page.evaluate(()=>{
  const selectors=['.drive-header','.exercise-card','.instrument-panel','#touch-wheel','.touch-switches','.touch-drive','.touch-vehicle','#route-map','#driving-controls','#mirror-controls'];
  const problems=[];
  for(const selector of selectors){const e=document.querySelector(selector),r=e.getBoundingClientRect();if(!e.getClientRects().length)continue;
    // The wheel image rotates beyond its square; this is intentional artwork overflow.
    const overflow=selector!=='#touch-wheel'&&e.scrollWidth>e.clientWidth+1;
    if(r.x<-.5||r.y<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5||overflow)problems.push({selector,x:r.x,y:r.y,w:r.width,h:r.height,overflow});
  }
  for(const e of document.querySelectorAll('#mobile-controls button,.header-controls button')){if(!e.getClientRects().length)continue;const r=e.getBoundingClientRect();if(r.width<43.5||r.height<43.5)problems.push({label:e.getAttribute('aria-label'),smallTarget:true,w:r.width,h:r.height});
    if(e.closest('#mobile-controls')&&!document.querySelector('#route-map:not([hidden]),#driving-controls:not([hidden]),#mirror-controls:not([hidden])')){const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!e.contains(hit))problems.push({label:e.getAttribute('aria-label'),coveredBy:hit?.id||hit?.className});}
  }
  return problems;
});}
try{
  await page.goto(process.env.SIMULATOR_URL??'http://127.0.0.1:5174/');await ready();await shot('landscape-menu');await tap('#practice');
  assert(await page.locator('#mobile-controls').isVisible());
  const graphics=await page.evaluate(()=>({pixelRatio:window.__avtodrom.scene.renderer.getPixelRatio(),shadows:window.__avtodrom.scene.renderer.shadowMap.enabled,width:document.querySelector('#viewport canvas').width}));
  assert.equal(graphics.pixelRatio,1);assert.equal(graphics.shadows,false);report.graphics=graphics;
  for(const [name,width,height]of [['landscape',844,390],['portrait',390,844],['small-portrait',320,568],['small-landscape',667,375],['short-landscape',568,320],['tablet',1024,768]]){
    await page.setViewportSize({width,height});await page.waitForTimeout(180);
    if(height>width){assert(await page.locator('#orientation-dialog').isVisible());assert.equal((await snapshot()).state,'paused');await shot(`${name}-rotate`);report.layouts.push({name:`${name}-rotate`,problems:[]});continue;}
    if((await snapshot()).state==='paused')await tap('#resume');
    const problems=await bounds();report.layouts.push({name,width,height,problems});await shot(`${name}-driving`);
    if(name==='landscape'||name==='portrait'){
      await tap('#controls-button');await tap('#map-button');report.layouts.push({name:`${name}-map`,problems:await bounds()});await shot(`${name}-map`);await tap('#map-close');
      await tap('#controls-button');report.layouts.push({name:`${name}-controls`,problems:await bounds()});await shot(`${name}-controls`);await tap('#controls-close');
    }
  }
  // Three-digit speed values and the longest unit must also fit the compact HUD.
  await page.setViewportSize({width:667,height:375});
  const compact=await page.evaluate(()=>{const speed=document.querySelector('#speed');const old=speed.textContent;speed.textContent='120';const panel=document.querySelector('.instrument-panel');const fits=panel.scrollWidth<=panel.clientWidth+1;speed.textContent=old;return fits;});
  assert(compact,'Three-digit speed must fit in the compact instrument panel');
  await page.setViewportSize({width:844,height:390});
  assert.equal(await page.locator('#driving-controls').isVisible(),false);
  assert.equal((await telemetry()).engine,false,'Opening and closing panels must not activate the engine underneath');
  assert(await page.locator('[data-touch-action="ignition"] span').isVisible());
  await tap('[data-touch-action="belt"]');await tap('[data-touch-action="ignition"]');
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.engine&&document.querySelector('.touch-startup').dataset.ready==='true');
  assert.equal(await page.locator('[data-touch-action="ignition"] span').isVisible(),false);
  assert.equal(await page.locator('[data-touch-action="belt"] span').isVisible(),false);
  assert.deepEqual(await bounds(),[],'Prepared controls must remain reachable beside P');
  await shot('landscape-prepared');
  // The fastened belt opens its explicit menu action instead of undoing preparation.
  await tap('[data-touch-action="belt"]');assert(await page.locator('#driving-controls').isVisible());assert((await telemetry()).belt);
  await shot('landscape-belt-menu');
  await tap('[data-vehicle-action="belt"]');await page.waitForFunction(()=>!window.__avtodrom.snapshot().telemetry.belt);
  await tap('#controls-close');await tap('[data-touch-action="belt"]');
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.belt);
  await tap('[data-touch-action="ignition"]');await page.waitForFunction(()=>!window.__avtodrom.snapshot().telemetry.engine);
  await page.locator('[data-touch-action="ignition"] span').waitFor({state:'visible'});
  await tap('[data-touch-action="ignition"]');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.engine);
  report.checks.push('Engine and belt prepare beside P, compact when ready, and engine restart stays accessible');
  report.checks.push('Fastened belt opens Controls without unfastening; the explicit menu action can unfasten it');
  await tap('[data-touch-shift="1"]');
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.gear===1);await tap('[data-touch-action="handbrake"]');
  assert((await telemetry()).engine);assert((await telemetry()).belt);assert.equal((await telemetry()).handbrake,false);
  const wheel=await page.locator('#touch-wheel').boundingBox();const cx=wheel.x+wheel.width/2,cy=wheel.y+wheel.height/2,r=wheel.width*.4;
  const origin=(await telemetry()).position;
  await finger('touchStart',1,{x:cx,y:cy-r});await finger('touchStart',2,await center('[data-touch-hold="throttle"]'));
  for(let angle=15;angle<=75;angle+=15){await finger('touchMove',1,{x:cx+r*Math.sin(angle*Math.PI/180),y:cy-r*Math.cos(angle*Math.PI/180)});}
  await page.waitForFunction(()=>{const t=window.__avtodrom.snapshot().telemetry;return t.throttle>.7&&t.steering<-.1&&t.speed>.5;},null,{timeout:10000});
  const turning=await telemetry();assert(Math.hypot(turning.position.x-origin.x,turning.position.z-origin.z)>.05);report.checks.push('Two real touch pointers steer and accelerate together');
  await page.locator('.touch-startup').waitFor({state:'hidden'});
  assert.equal(await page.locator('[data-touch-action="ignition"]').isVisible(),false);
  assert.equal(await page.locator('[data-touch-action="belt"]').isVisible(),false);
  assert(await page.locator('[data-touch-action="handbrake"]').isVisible());
  assert.deepEqual(await bounds(),[]);await shot('landscape-after-driving');
  await finger('touchEnd',1);await finger('touchEnd',2);
  await page.waitForFunction(()=>{const t=window.__avtodrom.snapshot().telemetry;return t.throttle<.01&&Math.abs(t.steering)<.01;});report.checks.push('Releasing both fingers releases the pedal and self-centres the wheel');
  await finger('touchStart',3,await center('[data-touch-hold="brake"]'));await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.brake>.8);
  fingers.clear();await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.brake<.01);report.checks.push('Cancelled touch releases the brake');
  // Stopping the car must not bring completed preparation controls back.
  await finger('touchStart',10,await center('[data-touch-hold="brake"]'));
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.speed<.1,null,{timeout:10000});await finger('touchEnd',10);
  await tap('[data-touch-shift="-1"]');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.gear===0);
  await tap('[data-touch-action="handbrake"]');assert.equal(await page.locator('.touch-startup').isVisible(),false);
  // Hidden controls remain available in Controls, and warnings return individually.
  await tap('#controls-button');await tap('[data-vehicle-action="ignition"]');
  await page.locator('[data-touch-action="ignition"] span').waitFor({state:'visible'});
  assert.equal((await telemetry()).engine,false);assert.equal(await page.locator('[data-touch-action="belt"]').isVisible(),false);
  assert.deepEqual(await bounds(),[]);await shot('landscape-engine-stopped-after-driving');
  await tap('#controls-close');await tap('[data-touch-action="ignition"]');
  await page.locator('.touch-startup').waitFor({state:'hidden'});assert((await telemetry()).engine);
  await tap('#controls-button');await tap('[data-vehicle-action="belt"]');
  await page.locator('[data-touch-action="belt"] span').waitFor({state:'visible'});
  assert.equal((await telemetry()).belt,false);assert.equal(await page.locator('[data-touch-action="ignition"]').isVisible(),false);
  await tap('#controls-close');assert.deepEqual(await bounds(),[]);await shot('landscape-belt-warning-after-driving');
  await tap('[data-touch-action="belt"]');await page.locator('.touch-startup').waitFor({state:'hidden'});assert((await telemetry()).belt);
  report.checks.push('Engine and belt icons disappear after moving, stay hidden when stopped, and return individually when needed');
  report.checks.push('Hidden engine and belt switches remain available in Controls');
  await finger('touchStart',4,await center('[data-touch-hold="throttle"]'));await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.throttle>.5);
  await finger('touchStart',7,await center('#pause-button'));await finger('touchEnd',7);await finger('touchEnd',4);assert.equal((await snapshot()).state,'paused');await tap('#resume');
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.throttle<.01);report.checks.push('Pausing with a held pedal leaves no stuck input after resuming');
  assert.equal(await page.locator('[data-touch-action="ignition"]').isVisible(),false);
  assert.equal(await page.locator('[data-touch-action="belt"]').isVisible(),false);
  report.checks.push('Hidden preparation icons stay hidden after pausing and resuming');
  await tap('#pause-button');await tap('#modal #menu');await tap('#exam');
  await tap('[data-touch-action="belt"]');await tap('[data-touch-action="ignition"]');
  await page.waitForFunction(()=>document.querySelector('.touch-startup').dataset.ready==='true');
  assert.equal(await page.locator('[data-touch-action="ignition"] span').isVisible(),false);
  assert.equal(await page.locator('[data-touch-action="belt"] span').isVisible(),false);
  // Let the unheld manual clutch engage before asking for first gear.
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.clutch<.1);await tap('[data-touch-shift="1"]');await page.waitForTimeout(150);assert.equal((await telemetry()).gear,0);
  await finger('touchStart',5,await center('[data-touch-hold="clutch"]'));await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.clutch>.8);
  // Second finger taps + while the first stays on the clutch.
  await finger('touchStart',6,await center('[data-touch-shift="1"]'));await finger('touchEnd',6);
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.gear===1);await finger('touchEnd',5);report.checks.push('Exam shifts require the manual touch clutch, including a two-finger shift');
  // Releasing the manual clutch against the handbrake stalls the engine.
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.stalled,null,{timeout:10000});
  await page.waitForFunction(()=>document.querySelector('[data-touch-action="ignition"]').dataset.stalled==='true');
  assert(await page.locator('[data-touch-action="ignition"] span').isVisible());
  assert.equal(await page.locator('[data-touch-action="ignition"] span').textContent(),'Запуск');
  assert.equal(await page.locator('[data-touch-action="belt"] span').isVisible(),false);
  assert.deepEqual(await bounds(),[],'Restart must remain reachable after a real stall');await shot('landscape-stalled');
  await finger('touchStart',8,await center('[data-touch-hold="clutch"]'));
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.clutch>.8);
  await finger('touchStart',9,await center('[data-touch-action="ignition"]'));await finger('touchEnd',9);
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.engine&&!window.__avtodrom.snapshot().telemetry.stalled);
  await page.waitForFunction(()=>document.querySelector('.touch-startup').dataset.ready==='true');
  assert.equal(await page.locator('[data-touch-action="ignition"] span').isVisible(),false);
  assert.equal(await page.locator('[data-touch-action="belt"] span').isVisible(),false);
  assert.deepEqual(await bounds(),[],'Controls must compact safely again after restarting');await shot('landscape-restarted');
  report.checks.push('Both labels hide after preparation; a real stall shows Запуск; successful restart hides the labels again');
  await finger('touchEnd',8);report.checks.push('A real manual stall exposes restart, which works with a second finger while holding the clutch');
  await shot('landscape-exam');
  await page.evaluate(()=>window.__avtodrom.start('practice',2));await shot('landscape-selected');report.layouts.push({name:'landscape-selected',problems:await bounds()});
  await page.setViewportSize({width:390,height:844});await page.locator('#orientation-dialog').waitFor({state:'visible'});await shot('portrait-selected-rotate');
  // Reload with Uzbek to verify every touch control is localized.
  await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('avtodrom.settings.v1'));s.language='uz';localStorage.setItem('avtodrom.settings.v1',JSON.stringify(s));});
  await page.reload();await ready();await shot('portrait-menu-rotate');await page.setViewportSize({width:844,height:390});await tap('#practice');assert.equal(await page.locator('#touch-wheel').getAttribute('aria-label'),'Rul');await shot('landscape-uz');
  report.checks.push('Russian and Uzbek controls render; portrait phones show the rotate prompt');
  const desktop=await browser.newPage({viewport:{width:1440,height:900}});desktop.on('pageerror',e=>report.errors.push(e.message));
  await desktop.goto(process.env.SIMULATOR_URL??'http://127.0.0.1:5174/');await desktop.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});await desktop.locator('#practice').click();
  assert.equal(await desktop.locator('#mobile-controls').isVisible(),false);await desktop.keyboard.down('KeyA');
  await desktop.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.steering>.3);await desktop.keyboard.up('KeyA');
  for(const selector of ['#map-button','#mirrors-button','#fullscreen-button','#fps','#gear-caption','#controls-button','[data-touch-action="ignition"]','[data-touch-action="belt"]','[data-touch-action="handbrake"]'])assert(await desktop.locator(selector).isVisible());
  await desktop.locator('[data-touch-action="belt"]').click();await desktop.locator('[data-touch-action="ignition"]').click();
  await desktop.keyboard.press('Digit1');await desktop.keyboard.press('Space');await desktop.keyboard.down('KeyW');
  await desktop.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.speed>.6);await desktop.keyboard.up('KeyW');
  assert.equal(await desktop.locator('.instrument-panel [data-touch-action]').count(),3);
  for(const action of ['ignition','belt','handbrake'])assert(await desktop.locator(`.instrument-panel [data-touch-action="${action}"]`).isVisible());
  report.checks.push('Desktop instrument actions stay visible after driving; mobile keeps its compact controls');
  if(process.env.MOBILE_CAPTURE!=='0')await desktop.screenshot({path:`${directory}/desktop-driving.png`});
  report.checks.push('Desktop keyboard steering works and touch controls stay hidden');
  assert.deepEqual(report.errors,[]);assert(report.layouts.every(l=>l.problems.length===0),JSON.stringify(report.layouts.filter(l=>l.problems.length)));
  console.log(JSON.stringify(report,null,2));
}finally{
  await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await browser.close();
}
