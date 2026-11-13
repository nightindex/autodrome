import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/mobile-display';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const base=process.env.SIMULATOR_URL??'http://127.0.0.1:5174/';
const report={engine:'Chromium with emulated touch; native fullscreen and rejected orientation-lock fallback',checks:[],layouts:[],errors:[]};
const ready=page=>page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});
const snapshot=page=>page.evaluate(()=>window.__avtodrom.snapshot());
async function promptFits(page){return page.evaluate(()=>{
  return ['#orientation-dialog','.rotate-content','#orientation-title','#orientation-detail','#orientation-hint'].flatMap(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect();return r.x<0||r.y<0||r.right>innerWidth+.5||r.bottom>innerHeight+.5||e.scrollWidth>e.clientWidth+1?[{selector,x:r.x,y:r.y,w:r.width,h:r.height}]:[];});
});}
try{
  const phone=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});phone.on('pageerror',e=>report.errors.push(e.message));
  await phone.addInitScript(()=>{localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'}));Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});Object.defineProperty(screen.orientation,'lock',{configurable:true,value:()=>Promise.reject(new Error('Orientation unsupported'))});});
  await phone.goto(base);await phone.locator('#orientation-dialog').waitFor();assert.equal(await phone.locator('#orientation-title').textContent(),'Поверните телефон');
  assert.equal(await phone.locator('#practice').isVisible(),false);assert.equal(await phone.locator('#orientation-fullscreen').isVisible(),false);await ready(phone);
  await phone.evaluate(()=>window.__avtodrom.start('practice'));assert.equal((await snapshot(phone)).state,'menu');
  await phone.keyboard.press('Escape');assert(await phone.locator('#orientation-dialog').isVisible());
  for(const [name,width,height]of [['phone',390,844],['small-phone',320,568],['tablet',768,1024]]){
    await phone.setViewportSize({width,height});const problems=await promptFits(phone);report.layouts.push({name,problems});assert.deepEqual(problems,[]);await phone.screenshot({path:`${directory}/${name}-rotate.png`});
  }
  report.checks.push('Portrait blocks starting and shows a full-page localized rotate prompt, including during loading');
  await phone.setViewportSize({width:844,height:390});assert.equal(await phone.locator('#orientation-dialog').isVisible(),false);await phone.locator('#practice').tap();
  const pedal=await phone.locator('[data-touch-hold="throttle"]').boundingBox();const client=await phone.context().newCDPSession(phone);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:pedal.x+pedal.width/2,y:pedal.y+pedal.height/2}]});
  await phone.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.throttle>.3);
  await phone.setViewportSize({width:390,height:844});await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  await phone.waitForFunction(()=>window.__avtodrom.snapshot().state==='paused');assert(await phone.locator('#orientation-dialog').isVisible());
  const frozen=await snapshot(phone);await phone.waitForTimeout(300);assert.equal((await snapshot(phone)).telemetry.time,frozen.telemetry.time);
  await phone.evaluate(()=>window.__avtodrom.resume());assert.equal((await snapshot(phone)).state,'paused');
  const top=await phone.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest('#orientation-dialog')?.id);assert.equal(top,'orientation-dialog');
  report.checks.push('Rotating during a held pedal pauses physics and keeps the rotate prompt above the pause dialog');
  await phone.setViewportSize({width:844,height:390});await phone.locator('#resume').tap();await phone.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.throttle<.01);
  assert.equal((await snapshot(phone)).state,'driving');report.checks.push('Returning to landscape resumes explicitly with the pedal released');
  await phone.evaluate(()=>window.__avtodrom.start('exam'));await phone.setViewportSize({width:390,height:844});await phone.waitForFunction(()=>window.__avtodrom.snapshot().state==='paused');
  const exam=await phone.evaluate(()=>window.__avtodrom.engine().time);await phone.waitForTimeout(300);assert.equal(await phone.evaluate(()=>window.__avtodrom.engine().time),exam);report.checks.push('Portrait also freezes exam time');
  await phone.close();

  const fullscreen=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});fullscreen.on('pageerror',e=>report.errors.push(e.message));
  await fullscreen.addInitScript(()=>{window.__lockRequests=[];Object.defineProperty(screen.orientation,'lock',{configurable:true,value:async mode=>{window.__lockRequests.push(mode);throw new DOMException('Unsupported orientation lock','NotSupportedError');}});});
  await fullscreen.goto(base);await ready(fullscreen);assert.equal(await fullscreen.evaluate(()=>!!document.fullscreenElement),false);
  await fullscreen.locator('#practice').tap();await fullscreen.waitForFunction(()=>document.fullscreenElement===document.documentElement);
  await fullscreen.waitForFunction(()=>window.__lockRequests.includes('landscape'));assert.equal((await snapshot(fullscreen)).state,'driving');
  const fills=await fullscreen.evaluate(()=>{const r=document.querySelector('#viewport canvas').getBoundingClientRect();return r.x===0&&r.y===0&&Math.abs(r.width-innerWidth)<1&&Math.abs(r.height-innerHeight)<1;});assert(fills);
  report.checks.push('First tap enters native document fullscreen, fills the viewport and requests landscape');await fullscreen.screenshot({path:`${directory}/landscape-fullscreen.png`});
  await fullscreen.evaluate(()=>document.exitFullscreen());
  if((await snapshot(fullscreen)).state==='driving')await fullscreen.locator('#pause-button').tap();await fullscreen.locator('#resume').tap();await fullscreen.waitForFunction(()=>document.fullscreenElement===document.documentElement);report.checks.push('Resume requests fullscreen again after the browser exits it');
  await fullscreen.setViewportSize({width:390,height:844});await fullscreen.locator('#orientation-dialog').waitFor();assert(await fullscreen.locator('#orientation-fullscreen').isVisible());
  await fullscreen.locator('#orientation-fullscreen').tap();assert(await fullscreen.locator('#orientation-dialog').isVisible());await fullscreen.screenshot({path:`${directory}/phone-fullscreen-rotate.png`});
  report.checks.push('The rotate prompt remains usable in native fullscreen when orientation locking is rejected');
  assert.deepEqual(report.errors,[]);console.log(JSON.stringify(report,null,2));
}finally{await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await browser.close();}
