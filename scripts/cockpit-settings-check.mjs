import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/cockpit-settings';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],layouts=[];page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
async function controls(){await page.click('#controls-button');await page.locator('.cockpit-options>summary').click();await page.waitForFunction(()=>window.__avtodrom.scene.cameraMode==='cockpit');}
async function set(prefix,key,value){await page.locator(`#${prefix}-${key}`).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);}
async function view(expected){
 await page.waitForFunction(expected=>{
  const a=window.__avtodrom,s=a.scene,eye=s.car.worldToLocal(s.camera.position.clone());
  const fov=2*Math.atan(Math.tan(expected.fov*Math.PI/360)*(16/9)/Math.max(16/9,s.camera.aspect))*180/Math.PI;
  return s.cameraMode==='cockpit'&&Math.abs(s.camera.aspect-innerWidth/innerHeight)<1e-6&&Math.abs(eye.y-s.cabinEye.y-expected.height/100)<1e-4&&Math.abs(eye.z-s.cabinEye.z+expected.back/100)<1e-4&&Math.abs(s.camera.fov-fov)<1e-6;
 },expected);
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('avtodrom.settings.v1')).cockpit);assert.deepEqual(saved,expected);
}
try{
 await page.addInitScript(()=>{if(!localStorage.getItem('avtodrom.settings.v1'))localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',quality:'low',cockpit:{height:8,back:12,fov:64}}));});
 await page.goto('http://127.0.0.1:5173/');await ready();await page.click('#practice');await controls();
 // Legacy settings adopt the new balanced view without requiring a first edit.
 await page.waitForFunction(()=>window.__avtodrom.scene.camera.fov===64);
 for(const [key,value]of Object.entries({height:8,back:18,fov:64}))assert.equal(await page.locator(`#hud-seat-${key}`).inputValue(),String(value));
 await page.locator('#hud-seat-height').focus();await page.keyboard.press('Home');await set('hud-seat','back',-4);await set('hud-seat','fov',80);await view({height:-4,back:-4,fov:80});
 await page.keyboard.press('End');await set('hud-seat','back',25);await set('hud-seat','fov',50);await view({height:12,back:25,fov:50});
 for(const [key,value]of Object.entries({height:4,back:10,fov:60}))await set('hud-seat',key,value);await view({height:4,back:10,fov:60});
 await page.screenshot({path:`${directory}/desktop-controls.png`});await page.click('#controls-close');await page.screenshot({path:`${directory}/custom-view.png`});
 await page.click('#pause-button');await page.click('#modal #settings');assert.equal(await page.locator('#settings-seat-height').inputValue(),'4');
 await set('settings-seat','height',10);await view({height:10,back:10,fov:60});await page.locator('#modal #close').click();await page.click('#resume');await view({height:10,back:10,fov:60});
 await page.reload();await ready();await page.click('#practice');await controls();await view({height:10,back:10,fov:60});
 await page.locator('#driving-controls .cockpit-reset').click();await view({height:8,back:18,fov:64});
 for(const size of [{width:390,height:844},{width:320,height:667}]){
  await page.setViewportSize(size);await page.locator('#hud-seat-fov').scrollIntoViewIfNeeded();
  const layout=await page.locator('#driving-controls .cockpit-controls').evaluate(root=>({overflow:root.scrollWidth>root.clientWidth+1,sliders:[...root.querySelectorAll('input')].map(n=>({width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}))}));
  assert(!layout.overflow&&layout.sliders.every(s=>s.width>80&&s.height>=44));layouts.push({viewport:size,...layout});await page.screenshot({path:`${directory}/controls-${size.width}.png`});
 }
 await page.click('#controls-close');await page.screenshot({path:`${directory}/balanced-mobile.png`});
 const desktopFrames=[];
 for(const size of [{width:1920,height:1000},{width:1920,height:1080},{width:2560,height:1080},{width:1920,height:1000}]){
  await page.setViewportSize(size);await view({height:8,back:18,fov:64});
  desktopFrames.push(await page.evaluate(()=>{const s=window.__avtodrom.scene,c=s.camera;
   return {width:innerWidth,height:innerHeight,horizontal:2*Math.atan(Math.tan(c.fov*Math.PI/360)*c.aspect),eye:s.car.worldToLocal(c.position.clone()).toArray()};}));
 }
 for(const frame of desktopFrames){assert(Math.abs(frame.horizontal-desktopFrames[0].horizontal)<1e-6,JSON.stringify(desktopFrames));assert(frame.eye.every((v,i)=>Math.abs(v-desktopFrames[0].eye[i])<1e-5));}
 await page.evaluate(()=>{const button=document.createElement('button');button.id='test-fullscreen';button.style.cssText='position:fixed;top:120px;left:20px;z-index:9999';button.textContent='Fullscreen';button.onclick=()=>document.documentElement.requestFullscreen();document.body.append(button);});
 await page.click('#test-fullscreen');await page.waitForFunction(()=>!!document.fullscreenElement);await view({height:8,back:18,fov:64});
 await page.screenshot({path:`${directory}/fullscreen.png`});
 await page.evaluate(()=>document.exitFullscreen());await page.waitForFunction(()=>!document.fullscreenElement);await view({height:8,back:18,fov:64});
 await page.evaluate(()=>document.querySelector('#test-fullscreen').remove());await page.setViewportSize({width:1920,height:1080});
 await page.evaluate(()=>window.__avtodrom.start('exam'));await controls();await set('hud-seat','fov',62);await view({height:8,back:18,fov:62});
 assert.equal(await page.locator('#hud-seat-fov').getAttribute('aria-valuetext'),'62°');assert.deepEqual(errors,[]);
 await writeFile(`${directory}/report.json`,JSON.stringify({defaultView:{height:8,back:18,fov:64},fullscreen:true,desktopFrames,livePreview:true,keyboardSlider:true,persistence:true,settingsDialog:true,reset:true,examCamera:true,layouts,errors},null,2));console.log(JSON.stringify({fullscreen:true,desktopFrames,livePreview:true,persistence:true,reset:true,layouts,errors}));
}catch(error){await page.screenshot({path:`${directory}/failure.png`}).catch(()=>{});throw error;}finally{await browser.close();}
