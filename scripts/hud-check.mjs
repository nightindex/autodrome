import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/hud';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(e.message));
const visible=id=>page.locator(id).isVisible();
const ready=()=>page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
const shot=async name=>{await page.waitForTimeout(200);await page.screenshot({path:`${directory}/${name}.png`});};
async function fits(){return page.evaluate(()=>{
 const ids=['.drive-header','.exercise-card','.instrument-panel','#map-button','#controls-button','#route-map','#driving-controls','#mirror-controls'];
 return ids.map(id=>{const e=document.querySelector(id),r=e.getBoundingClientRect();return {id,visible:!!e.getClientRects().length,x:r.x,y:r.y,w:r.width,h:r.height,overflow:e.scrollWidth>e.clientWidth+1};}).filter(e=>e.visible&&(e.x<0||e.y<0||e.x+e.w>innerWidth+1||e.y+e.h>innerHeight+1||e.overflow));
 });}
try{
 await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'})));
 await page.goto('http://127.0.0.1:5173/');await ready();await page.click('#practice');await page.waitForTimeout(200);
 assert.equal(await visible('#route-map'),false);assert.equal(await visible('#driving-controls'),false);await shot('desktop-default');
 await page.locator('#quick-controls-button').focus();await page.keyboard.press('Enter');
 assert(await visible('#driving-controls'));assert.equal(await page.locator('#quick-controls-button').getAttribute('aria-expanded'),'true');
 const shortcutRows=page.locator('#driving-controls .drive-shortcuts>div');
 const expectedShortcuts=await page.evaluate(async()=>Object.keys((await import('/src/simulation/input.ts')).defaultBindings).length-3);
 assert.equal(await shortcutRows.count(),expectedShortcuts);assert((await shortcutRows.allTextContents()).some(row=>row.includes('Аварийка')));
 await page.keyboard.press('Escape');assert.equal(await visible('#driving-controls'),false);assert.equal(await page.locator(':focus').getAttribute('id'),'quick-controls-button');
 await page.click('#map-button');assert(await visible('#route-map'));assert.equal(await page.locator('#map-button').getAttribute('aria-expanded'),'true');await page.waitForTimeout(150);await shot('desktop-map');
 await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.handbrake),false);assert(await visible('#route-map'));await page.keyboard.press('Space');
 await page.keyboard.press('Escape');assert.equal(await visible('#route-map'),false);assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'driving');assert.equal(await page.locator(':focus').getAttribute('id'),'map-button');
 await page.keyboard.press('KeyM');assert(await visible('#route-map'));await page.keyboard.press('KeyM');assert.equal(await visible('#route-map'),false);
 await page.click('#controls-button');assert(await visible('#driving-controls'));await page.click('#headlights-button');await page.waitForTimeout(150);assert.equal(await page.locator('#headlights-button').getAttribute('aria-pressed'),'true');await shot('desktop-controls');
 await page.click('#map-button');assert(await visible('#route-map'));assert.equal(await visible('#driving-controls'),false);assert.deepEqual(await fits(),[]);
 await page.locator('#map-close').focus();await page.keyboard.press('Enter');assert.equal(await page.locator(':focus').getAttribute('id'),'map-button');
 await page.click('#map-button');await page.click('#pause-button');assert(await visible('#modal'));await page.click('#resume');assert(await visible('#route-map'));await page.keyboard.press('KeyM');
 await page.click('#mirrors-button');assert(await visible('#mirror-controls'));await page.click('#map-button');assert.equal(await visible('#mirror-controls'),false);assert(await visible('#route-map'));await page.click('#map-close');
 const layouts=[];
 for(const [name,width,height]of [['compact',1024,600],['zoomed',910,870],['mobile',390,844],['small',375,667],['landscape',844,390]]){
  await page.setViewportSize({width,height});await page.waitForTimeout(100);await shot(`${name}-default`);layouts.push({name,state:'default',problems:await fits()});
  await page.click('#map-button');await page.waitForTimeout(100);await shot(`${name}-map`);layouts.push({name,state:'map',problems:await fits()});await page.click('#map-close');
  await page.click('#controls-button');await shot(`${name}-controls`);layouts.push({name,state:'controls',problems:await fits()});
  assert.equal(await visible('.exercise-card'),false);assert.equal(await visible('#start-help'),false);
  const controlsSeparate=await page.evaluate(()=>{
   const a=document.querySelector('#driving-controls').getBoundingClientRect(),b=document.querySelector('.instrument-panel').getBoundingClientRect();
   return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;
  });
  assert(controlsSeparate,`${name}: controls must not cover the instruments`);
  await page.locator('#reset-button').scrollIntoViewIfNeeded();assert(await visible('#reset-button'));
  await page.click('#controls-close');assert(await visible('.exercise-card'));assert(await visible('.instrument-panel'));
  await page.click('#mirrors-button');assert(await visible('#mirror-controls'));await shot(`${name}-mirrors`);layouts.push({name,state:'mirrors',problems:await fits()});
  const separated=await page.evaluate(()=>{
   const a=document.querySelector('#mirror-controls').getBoundingClientRect(),b=document.querySelector('.instrument-panel').getBoundingClientRect();
   return a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top;
  });
  assert(separated,`${name}: mirror adjustment must not cover the instruments`);assert.equal(await visible('.exercise-card'),false);assert.equal(await visible('#start-help'),false);
  await page.click('#mirror-close');assert(await visible('.exercise-card'));assert(await visible('.instrument-panel'));
 }
 assert(layouts.every(l=>l.problems.length===0),JSON.stringify(layouts.filter(l=>l.problems.length)));
 await page.setViewportSize({width:1440,height:900});await page.keyboard.press('Escape');await page.click('#modal #menu');await page.click('#lang');await page.click('#practice');assert.equal(await visible('#route-map'),false);assert.equal(await page.locator('#map-button').getAttribute('aria-label'),'Xarita');await shot('uz-default');
 await page.keyboard.press('Escape');await page.click('#modal #menu');await page.click('#exam');assert.equal(await visible('#route-map'),false);await page.click('#controls-button');assert.equal(await visible('#reset-button'),false);
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({layouts,errors},null,2));console.log(JSON.stringify({layouts:layouts.length,hiddenByDefault:true,keyboardToggle:true,escapeCloses:true,errors}));
}finally{await browser.close();}
