import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {preview} from 'vite';

// Exercise dist through public UI and keyboard/touch events. Production must
// not depend on the mutable test controls exposed by the development server.
const directory='test-results/production';
await mkdir(directory,{recursive:true});
const html=await readFile('dist/index.html','utf8');
assert(!html.includes('/src/main.ts')&&!html.includes('/@vite/client'),'Build the production bundle first');
const report={status:'running',engine:'Chromium; desktop and emulated mobile',checks:[],errors:[],consoleErrors:[],httpErrors:[],externalRequests:[],scenarios:[]};
const check=(name,condition)=>{assert(condition,name);report.checks.push(name);};
const server=await preview({preview:{host:'127.0.0.1',port:0,strictPort:true},logLevel:'error'});
const origin=`http://127.0.0.1:${server.httpServer.address().port}`;
const executablePath=[process.env.CHROME_PATH,chromium.executablePath(),'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p=>p&&existsSync(p));
let browser;
try{
  browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
  const init=()=>{
    localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',quality:'low',volume:0}));
    Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});
    Object.defineProperty(screen.orientation,'lock',{configurable:true,value:()=>Promise.reject(new Error('Unavailable in viewport tests'))});
  };
  const ready=page=>page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded&&!document.querySelector('#app').inert,null,{timeout:120000});
  const snapshot=page=>page.evaluate(()=>window.__avtodrom.snapshot());
  const visible=(page,selector)=>page.locator(selector).isVisible();
  async function openPage(name,touch=false){
    const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:1440,height:900},hasTouch:touch,isMobile:touch});
    page.setDefaultTimeout(20000);page.on('pageerror',e=>report.errors.push(`${name}: ${e.message}`));
    page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(`${name}: ${message.text()}`);});
    page.on('response',response=>{if(response.status()>=400)report.httpErrors.push({scenario:name,status:response.status(),url:response.url()});});
    page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==origin)report.externalRequests.push(request.url());});
    await page.addInitScript(init);await page.goto(origin);await ready(page);
    check(`${name}: production exposes read-only diagnostics only`,await page.evaluate(()=>Object.keys(window.__avtodrom).join(',')==='snapshot'));
    report.scenarios.push({name,resources:await page.evaluate(()=>performance.getEntriesByType('resource').reduce((r,e)=>({requests:r.requests+1,encodedBytes:r.encodedBytes+e.encodedBodySize}),{requests:0,encodedBytes:0}))});
    return page;
  }
  // Catch hosts serving an HTML fallback or a Git LFS pointer as an asset.
  const model=await fetch(`${origin}/assets/cobalt.glb`),modelBytes=new Uint8Array(await model.arrayBuffer());
  check('Model is a real binary glTF asset',model.ok&&new TextDecoder().decode(modelBytes.slice(0,4))==='glTF');
  const manifestResponse=await fetch(`${origin}/manifest.webmanifest`),manifest=await manifestResponse.json();
  check('Manifest requests fullscreen landscape',manifestResponse.ok&&manifest.display==='fullscreen'&&manifest.orientation==='landscape');
  const script=html.match(/<script[^>]+src="([^"]+)"/);
  assert(script,'Built JavaScript entry is present');
  const entry=await fetch(new URL(script[1],origin));
  check('Built entry has a JavaScript MIME type',entry.ok&&/javascript/.test(entry.headers.get('content-type')??''));

  console.log('Checking production desktop...');
  const desktop=await openPage('desktop');
  await desktop.locator('#lang').click();check('Language switches to UZ',await desktop.locator('#lang').textContent()==='UZ');
  await desktop.locator('#lang').click();check('Language switches to RU',await desktop.locator('#lang').textContent()==='RU');
  await desktop.locator('#settings').click();check('Settings opens',await visible(desktop,'#modal'));await desktop.keyboard.press('Escape');
  await desktop.locator('#exercises').click();check('Exercise picker opens',await desktop.locator('.exercise-grid button').count()>0);await desktop.keyboard.press('Escape');
  await desktop.locator('#practice').click();check('Free practice starts',(await snapshot(desktop)).freePractice);
  check('Desktop instruments and startup hint appear',await visible(desktop,'#engine-rpm')&&await visible(desktop,'.instrument-panel .pedals')&&await visible(desktop,'#start-help>span'));
  await desktop.locator('[data-touch-action="belt"]').click();await desktop.locator('[data-touch-action="ignition"]').click();
  await desktop.keyboard.press('Digit1');await desktop.locator('[data-touch-action="handbrake"]').click();
  await desktop.keyboard.down('KeyW');await desktop.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.speed>.6);await desktop.keyboard.up('KeyW');
  await desktop.locator('#start-help>span').waitFor({state:'hidden'});
  check('Desktop keyboard drives and hides the startup hint',(await snapshot(desktop)).telemetry.gear===1&&await visible(desktop,'#controls-button'));
  await desktop.keyboard.down('KeyS');await desktop.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.speed<.1);await desktop.keyboard.up('KeyS');
  await desktop.locator('[data-touch-action="handbrake"]').click();
  await desktop.locator('#controls-button').click();await desktop.locator('#headlights-button').click();
  await desktop.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.headlights);
  check('Desktop control-panel actions work',await visible(desktop,'#driving-controls'));await desktop.keyboard.press('Escape');
  await desktop.locator('#pause-button').click();check('Pause stops driving',(await snapshot(desktop)).state==='paused');
  await desktop.locator('#resume').click();check('Resume keeps the startup hint collapsed',!(await visible(desktop,'#start-help>span')));
  await desktop.locator('#camera-button').click();check('Cockpit camera is available',(await snapshot(desktop)).camera==='cockpit');
  await desktop.screenshot({path:`${directory}/desktop.png`});
  await desktop.locator('#pause-button').click();await desktop.locator('#modal #menu').click();
  await desktop.locator('#guided').click();check('Guided practice starts',!(await snapshot(desktop)).freePractice&&(await snapshot(desktop)).mode==='practice');
  await desktop.locator('#pause-button').click();await desktop.locator('#modal #menu').click();
  await desktop.locator('#exam').click();check('Exam starts without practice assistance',(await snapshot(desktop)).mode==='exam'&&!(await visible(desktop,'#assist-badge')));
  await desktop.close();

  console.log('Checking production mobile...');
  const phone=await openPage('mobile',true);await phone.locator('#practice').tap();
  check('Mobile keeps its compact instruments',await visible(phone,'#touch-wheel')&&await phone.locator('#engine-rpm').count()===0&&!(await visible(phone,'#start-help')));
  await phone.locator('[data-touch-action="belt"]').tap();await phone.locator('[data-touch-action="ignition"]').tap();
  await phone.locator('[data-touch-shift="1"]').tap();await phone.locator('[data-touch-action="handbrake"]').tap();
  const client=await phone.context().newCDPSession(phone),fingers=new Map();
  async function finger(type,id,point){
    if(type==='touchEnd')fingers.delete(id);else fingers.set(id,{id,...point,radiusX:3,radiusY:3,force:1});
    await client.send('Input.dispatchTouchEvent',{type,touchPoints:[...fingers.values()]});
  }
  const wheel=await phone.locator('#touch-wheel').boundingBox(),pedal=await phone.locator('[data-touch-hold="throttle"]').boundingBox();
  const cx=wheel.x+wheel.width/2,cy=wheel.y+wheel.height/2,r=wheel.width*.4;
  await finger('touchStart',1,{x:cx,y:cy-r});await finger('touchMove',1,{x:cx+r/Math.SQRT2,y:cy-r/Math.SQRT2});
  await finger('touchStart',2,{x:pedal.x+pedal.width/2,y:pedal.y+pedal.height/2});
  await phone.waitForFunction(()=>{const t=window.__avtodrom.snapshot().telemetry;return t.speed>.6&&t.throttle>.7&&Math.abs(t.steering)>.02;});
  await finger('touchEnd',2);await finger('touchEnd',1);
  await phone.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.throttle<.05);
  check('Production supports simultaneous touch steering and throttle',!(await visible(phone,'[data-touch-action="ignition"]'))&&!(await visible(phone,'[data-touch-action="belt"]')));
  await phone.setViewportSize({width:390,height:844});await phone.locator('#orientation-dialog').waitFor();
  check('Portrait pauses production driving',(await snapshot(phone)).state==='paused');
  const clock=await phone.locator('#clock').textContent();await phone.waitForTimeout(350);check('Portrait freezes exam/practice clock',await phone.locator('#clock').textContent()===clock);
  await phone.setViewportSize({width:844,height:390});await phone.locator('#resume').tap();
  check('Landscape resumes cleanly',(await snapshot(phone)).state==='driving');
  await phone.screenshot({path:`${directory}/mobile.png`});await phone.close();

  console.log('Checking production loading-error recovery...');
  const retry=await browser.newPage();retry.setDefaultTimeout(20000);await retry.addInitScript(init);
  await retry.route('**/assets/cobalt.glb*',route=>route.abort());await retry.goto(origin);
  await retry.locator('#boot-error').waitFor({state:'visible',timeout:120000});
  check('Missing model displays a retry action',await retry.locator('#boot-retry').isEnabled());
  await retry.unroute('**/assets/cobalt.glb*');await retry.locator('#boot-retry').click();await ready(retry);
  check('Retry recovers a failed production load',(await snapshot(retry)).state==='menu');await retry.close();
  check('No unexpected browser errors',report.errors.length===0);
  check('No unexpected console errors',report.consoleErrors.length===0);
  check('No missing production resources',report.httpErrors.length===0);
  check('Startup needs no third-party services',report.externalRequests.length===0);
  report.status='passed';
  console.log(JSON.stringify(report,null,2));
}catch(error){
  report.status='failed';report.failure=error instanceof Error?error.message:String(error);throw error;
}finally{
  await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
  await browser?.close();await server.close();
}
