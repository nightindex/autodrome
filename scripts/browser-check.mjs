import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import assert from 'node:assert/strict';
await mkdir('test-results',{recursive:true});
const candidates=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].filter(Boolean);
const executablePath=candidates.find(existsSync);
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1920,height:1080}});
const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const snap=()=>page.evaluate(()=>window.__avtodrom.snapshot());
const check=(name,condition)=>{assert(condition,name);checks.push(name);};
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.waitForTimeout(1200);await page.screenshot({path:'test-results/menu.png'});check('Cobalt and four wheels load',(await snap()).wheels===4);
  await page.click('#lang');check('Russian interface switches',await page.locator('#practice').innerText().then(t=>t.includes('практику')));
  await page.click('#settings');await page.selectOption('#quality','low');await page.selectOption('#quality','medium');
  await page.click('[data-bind="throttle"]');await page.keyboard.press('ArrowUp');
  check('Throttle remapping persists',await page.evaluate(()=>JSON.parse(localStorage.getItem('avtodrom.settings.v1')).bindings.throttle==='ArrowUp'));
  await page.click('#restore');await page.click('#close');
  await page.click('#practice');await page.waitForTimeout(400);
  await page.keyboard.press('KeyB');await page.keyboard.press('KeyI');await page.keyboard.down('ShiftLeft');await page.waitForTimeout(250);await page.keyboard.press('Digit1');await page.keyboard.press('Space');await page.keyboard.press('KeyQ');
  await page.keyboard.down('KeyW');await page.keyboard.up('ShiftLeft');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');
  check('Keyboard clutch/start/gear/forward driving',(await snap()).telemetry.signedSpeed>1);
  await page.keyboard.press('KeyQ');await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyS');await page.waitForTimeout(2200);await page.keyboard.up('KeyS');await page.keyboard.up('ShiftLeft');
  check('Keyboard braking stops the car',(await snap()).telemetry.speed<.15);
  await page.screenshot({path:'test-results/practice.png'});
  const performanceSamples=[];
  for(let i=0;i<5;i++){await page.waitForTimeout(1000);performanceSamples.push(await snap());}
  await page.keyboard.press('KeyC');await page.waitForTimeout(800);await page.screenshot({path:'test-results/cockpit.png'});check('Cockpit camera works',(await snap()).camera==='cockpit');
  for(let i=0;i<5;i++){await page.waitForTimeout(1000);performanceSamples.push(await snap());}
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));const pauseTime=(await snap()).telemetry.time;await page.waitForTimeout(500);
  check('Focus loss pauses the simulation',(await snap()).state==='paused'&&(await snap()).telemetry.time===pauseTime);
  await page.locator('#modal #settings').click();await page.selectOption('#language','uz');await page.keyboard.press('Escape');
  check('Escape from paused settings returns to pause',await page.locator('#modal').getAttribute('data-type')==='pause');
  await page.click('#resume');await page.waitForTimeout(200);check('Explicit resume advances time',(await snap()).telemetry.time>pauseTime);
  await page.click('#pause-button');await page.locator('#modal #menu').click();
  await page.click('#exercises');await page.click('[data-exercise="6"]');check('Individual garage practice is selectable',(await snap()).exercise==='garage');
  await page.keyboard.press('KeyI');await page.keyboard.down('ShiftLeft');await page.waitForTimeout(250);await page.keyboard.press('KeyR');await page.keyboard.press('Space');await page.keyboard.down('KeyW');await page.keyboard.up('ShiftLeft');await page.waitForTimeout(1200);await page.keyboard.up('KeyW');check('Reverse works in parking practice',(await snap()).telemetry.signedSpeed<-.3);
  await page.click('#pause-button');await page.locator('#modal #menu').click();await page.click('#exam');
  check('Exam hides practice reset',await page.locator('#reset-button').isHidden());
  await page.click('#pause-button');await page.locator('#modal #menu').click();
  check('Leaving an exam produces a failure report',(await snap()).state==='result'&&(await snap()).events.some(e=>e.ruleId===26));
  await page.screenshot({path:'test-results/result.png'});await page.locator('#modal #menu').click();
  await page.reload();await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  check('Settings and result survive reload',await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('avtodrom.settings.v1'));return s.language==='uz'&&s.quality==='medium'&&s.results.length===1;}));
  await page.setViewportSize({width:600,height:820});await page.screenshot({path:'test-results/narrow.png'});check('Narrow viewport has no horizontal overflow',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const gpu=await page.evaluate(()=>{const gl=document.querySelector('#viewport canvas').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  const failure=await browser.newPage();await failure.route('**/assets/cobalt.glb*',route=>route.abort());await failure.goto('http://127.0.0.1:5173/');await failure.waitForSelector('#modal[data-type="error"]',{timeout:60000});check('Missing model displays retry action',await failure.locator('#retry').isVisible());await failure.close();
  const unavailable=await browser.newPage();await unavailable.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(kind,...args){if(String(kind).startsWith('webgl'))return null;return original.call(this,kind,...args);};});await unavailable.goto('http://127.0.0.1:5173/');await unavailable.waitForSelector('#modal[data-type="error"]',{timeout:60000});check('WebGL failure is explained',await unavailable.locator('#modal').innerText().then(t=>t.includes('WebGL')));await unavailable.close();
  check('No runtime or resource errors on normal path',errors.length===0);
  const fps={};for(const camera of ['chase','cockpit']){const values=performanceSamples.filter(s=>s.camera===camera).map(s=>s.fps);fps[camera]={min:Math.min(...values),max:Math.max(...values),mean:+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(1)};}
  const report={date:new Date().toISOString(),resolution:'1920x1080',quality:'medium',gpu,checks,errors,fps,renderSamples:performanceSamples.map(s=>({camera:s.camera,fps:s.fps,drawCalls:s.drawCalls,triangles:s.triangles}))};
  await writeFile('test-results/browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
