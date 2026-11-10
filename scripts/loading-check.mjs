import {chromium} from 'playwright';
import {mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';

const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
await mkdir('test-results/loading',{recursive:true});
let mainRequest,carRequest,holdMain=true,holdCar=true,failCar=false;
let mainArrived,carArrived;
const mainPending=new Promise(resolve=>{mainArrived=resolve;}),carPending=new Promise(resolve=>{carArrived=resolve;});
await page.route('**/src/main.ts*',route=>{if(holdMain){mainRequest=route;mainArrived();return;}return route.continue();});
await page.route('**/assets/cobalt.glb*',route=>{
  if(failCar){failCar=false;return route.abort('failed');}
  if(holdCar){carRequest=route;carArrived();return;}
  return route.continue();
});
try{
  await page.addInitScript(()=>{if(!localStorage.getItem('avtodrom.settings.v1'))localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'}));});
  await page.goto('http://127.0.0.1:5173/',{waitUntil:'commit'});
  await page.locator('#boot-loader').waitFor({state:'visible'});
  assert(await page.locator('#app').evaluate(element=>element.inert));
  await page.waitForFunction(()=>document.readyState!=='loading');
  await mainPending;holdMain=false;await mainRequest.continue();
  await page.waitForFunction(()=>document.querySelector('#boot-loader')?.dataset.stage==='car',null,{timeout:60000});
  assert.equal(await page.locator('#boot-title').textContent(),'Подготовка симулятора');
  assert.equal(await page.locator('#boot-progress').getAttribute('value'),null);
  assert.equal(await page.locator('#boot-percent').textContent(),'');
  assert(await page.locator('#practice').isDisabled());
  for(const [width,height] of [[1280,800],[375,667],[844,390]]){
    await page.setViewportSize({width,height});
    const fits=await page.locator('.boot-content').evaluate(element=>{const r=element.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight&&element.scrollWidth<=element.clientWidth;});
    assert(fits,`${width}x${height}: loader fits`);
  }
  await page.screenshot({path:'test-results/loading/loading.png'});
  await carPending;holdCar=false;await carRequest.continue();
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  assert.equal(await page.locator('#boot-loader').isVisible(),false);
  assert.equal(await page.locator('#app').evaluate(element=>element.inert),false);
  await page.click('#practice');assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'driving');

  await page.evaluate(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'uz'})));
  failCar=true;await page.reload();
  await page.waitForFunction(()=>document.querySelector('#boot-loader')?.dataset.stage==='error',null,{timeout:60000});
  assert(await page.locator('#boot-retry').isVisible());
  assert.equal(await page.locator('#boot-retry').textContent(),'Qayta yuklash');
  assert(await page.locator('#app').evaluate(element=>element.inert));
  assert.equal(await page.locator('#boot-progress').isVisible(),false);
  await page.screenshot({path:'test-results/loading/error.png'});
  await page.click('#boot-retry');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  assert.equal(await page.locator('#boot-loader').isVisible(),false);
  assert.equal(await page.locator('#app').getAttribute('aria-busy'),'false');
  assert.deepEqual(errors,[]);
  console.log('Loader before JavaScript, delayed assets, responsive layouts, both languages, failure/retry and ready state passed.');
}finally{await browser.close();}
