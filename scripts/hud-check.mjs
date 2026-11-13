import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/compact-ui';await mkdir(directory,{recursive:true});
const base=process.env.SIMULATOR_URL??'http://127.0.0.1:5174/';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const report={engine:'Chromium; mobile viewports with touch emulation',layouts:[],checks:[],errors:[]};
const capture=process.env.HUD_CAPTURE!=='0';
const visible=(page,selector)=>page.locator(selector).isVisible();
const shot=async(page,name)=>{if(capture)await page.screenshot({path:`${directory}/${name}.png`});};
async function problems(page,home=false){return page.evaluate(home=>{
  const selectors=home?['.menu-header','.hero','#practice','#guided','#exam','#exercises','#settings','#lang','#credits']:['.exam-stats','.header-controls','#exercise-button','.exercise-card','.instrument-panel','#telemetry','#fps','#gear-caption','.rpm-readout','.rpm-labels','.instrument-panel .pedals','#start-help','#controls-button','#touch-wheel','.touch-switches','.touch-drive','#route-map','#driving-controls','#mirror-controls'];
  return selectors.flatMap(selector=>{const e=document.querySelector(selector);if(!e?.getClientRects().length)return [];const r=e.getBoundingClientRect();return r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5||e.scrollWidth>e.clientWidth+1?[{selector,x:r.x,y:r.y,w:r.width,h:r.height,overflow:e.scrollWidth>e.clientWidth+1}]:[];});
},home);}
try{
  for(const [name,width,height,touch]of [['desktop',1440,900,false],['compact',1024,600,false],['portrait',390,844,true],['small',320,568,true],['landscape',844,390,true],['small-landscape',667,375,true],['tablet',1024,768,true]]){
    const page=await browser.newPage({viewport:{width,height},hasTouch:touch,isMobile:touch});page.on('pageerror',e=>report.errors.push(e.message));
    await page.addInitScript(()=>{if(!localStorage.getItem('avtodrom.settings.v1'))localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'}));Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});Object.defineProperty(screen.orientation,'lock',{configurable:true,value:()=>Promise.reject(new Error('Orientation lock unavailable in this test'))});});
    await page.goto(base);await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});await page.waitForTimeout(650);
    if(touch&&height>width){
      assert(await visible(page,'#orientation-dialog'));assert.equal(await visible(page,'#practice'),false);await shot(page,`${name}-rotate`);
      report.layouts.push({name:`${name}-rotate`,problems:[]});
      if(name==='portrait'){await page.evaluate(()=>{localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'uz'}));});await page.reload();await page.locator('#orientation-dialog').waitFor();assert.equal(await page.locator('#orientation-title').textContent(),'Telefonni aylantiring');await shot(page,'portrait-uz-rotate');}
      await page.close();continue;
    }
    report.layouts.push({name:`${name}-home`,problems:await problems(page,true)});await shot(page,`${name}-home`);
    assert.equal(await page.locator('.home-mode-copy').count(),touch?0:3);
    assert.equal(await page.locator('#settings span').count(),touch?0:1);
    if(name==='desktop'){
      for(const [w,h]of [[1910,920],[1280,720]]){
        await page.setViewportSize({width:w,height:h});await page.waitForTimeout(120);
        report.layouts.push({name:`desktop-${w}-home`,problems:await problems(page,true)});await shot(page,`desktop-${w}-home`);
      }
      await page.locator('#lang').click();assert.equal(await page.locator('.home-mode-copy').count(),3);
      report.layouts.push({name:'desktop-uz-home',problems:await problems(page,true)});await shot(page,'desktop-uz-home');
      await page.locator('#settings').click();assert(await visible(page,'#modal'));await page.keyboard.press('Escape');
      await page.locator('#lang').click();await page.setViewportSize({width,height});
      for(const [selector,mode,guided]of [['#guided','practice',true],['#exam','exam',false]]){
        await page.locator(selector).click();
        await page.waitForFunction(({mode,guided})=>window.__avtodrom.snapshot().state==='driving'&&document.querySelector('#hud').dataset.guided===String(guided)&&window.__avtodrom.snapshot().mode===mode,{mode,guided});
        await page.locator('#pause-button').click();await page.locator('#modal #menu').click();
        if(mode==='exam'){assert.equal(await page.locator('#modal').getAttribute('data-type'),'result');await page.locator('#modal #menu').click();}
        await page.locator('#practice').waitFor();
      }
    }
    const carCenter=await page.evaluate(()=>{const s=window.__avtodrom.scene,v=s.car.position.clone().set(0,.6,0).applyMatrix4(s.car.matrixWorld).project(s.camera);const x=(v.x+1)*innerWidth/2,y=(1-v.y)*innerHeight/2,hit=document.elementFromPoint(x,y);return {x,y,uncovered:hit?.tagName==='CANVAS',onScreen:x>0&&x<innerWidth&&y>0&&y<innerHeight};});
    assert(carCenter.onScreen&&carCenter.uncovered,`${name}: home controls cover the car: ${JSON.stringify(carCenter)}`);
    await page.locator('#practice').click();await page.waitForTimeout(200);
    assert.equal(await visible(page,'#exercise-card'),false);assert.equal(await visible(page,'#driving-controls'),false);assert.equal(await visible(page,'#route-map'),false);
    assert.equal(await page.locator('.header-controls button').count(),touch?3:5);
    if(touch){assert(await visible(page,'#touch-wheel'));assert(await visible(page,'[data-touch-action="ignition"]'));assert(await visible(page,'[data-touch-action="belt"]'));assert.equal(await visible(page,'.instrument-panel .pedals'),false);assert.equal(await page.locator('#engine-rpm').count(),0);}
    else{
      for(const selector of ['#map-button','#mirrors-button','#fps','#gear-caption','#controls-button','[data-touch-action="ignition"]','[data-touch-action="belt"]','[data-touch-action="handbrake"]'])assert(await visible(page,selector));
      assert.equal(await page.locator('.instrument-panel [data-touch-action]').count(),3);
      assert(await visible(page,'#start-help>span'),'PC startup hint is visible before moving');
      const controls=await page.locator('#controls-button').boundingBox(),startup=await page.locator('#start-help').boundingBox();assert(startup.x<24&&startup.y+startup.height>height-24&&controls.x>=startup.x&&controls.y>height-70,'PC startup card and its controls button stay at the bottom left');
      await page.locator('[data-touch-action="belt"]').click();await page.locator('[data-touch-action="ignition"]').click();
      await page.waitForFunction(()=>{const t=window.__avtodrom.snapshot().telemetry;return t.engine&&t.belt;});
      await page.locator('[data-touch-action="handbrake"]').click();
      await page.waitForFunction(()=>!window.__avtodrom.snapshot().telemetry.handbrake&&document.querySelector('[data-touch-action="handbrake"]').getAttribute('aria-pressed')==='false');
      if(name==='desktop')await shot(page,'desktop-instruments-ready');
      await page.keyboard.press('Space');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.handbrake&&document.querySelector('[data-touch-action="handbrake"]').getAttribute('aria-pressed')==='true');
      assert(await visible(page,'.instrument-panel .pedals'));assert(await visible(page,'.rpm-labels'));assert(await visible(page,'#engine-rpm'));
      const idleRPM=await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.rpm);
      await page.keyboard.down('KeyW');
      await page.waitForFunction(idle=>{const t=window.__avtodrom.snapshot().telemetry;return t.throttle>.9&&t.rpm>idle+300&&Number(document.querySelector('#engine-rpm').textContent)===Math.round(t.rpm)&&parseFloat(document.querySelector('#throttle-bar').style.width)>90;},idleRPM);
      if(name==='desktop')await shot(page,'desktop-instruments-throttle');
      await page.keyboard.up('KeyW');await page.waitForFunction(()=>parseFloat(document.querySelector('#throttle-bar').style.width)<5);
      await page.locator('[data-touch-action="belt"]').click();await page.locator('[data-touch-action="ignition"]').click();
      await page.waitForFunction(()=>{const t=window.__avtodrom.snapshot().telemetry;return !t.engine&&!t.belt;});
      for(const [key,gear]of [['Digit1','1'],['Digit2','2'],['Digit3','3'],['Digit4','4'],['Digit5','5'],['KeyR','R'],['KeyN','N']]){
        await page.keyboard.press(key);await page.waitForFunction(gear=>document.querySelector('#gear').textContent===gear,gear);
      }
      await page.waitForFunction(()=>/^\d+ FPS$/.test(document.querySelector('#fps').textContent));
      assert.equal(await page.locator('.instrument-panel [data-touch-action]').count(),3);
    }
    report.layouts.push({name:`${name}-drive`,problems:await problems(page)});await shot(page,`${name}-drive`);
    if(name==='desktop'){
      for(const [width,height]of [[667,375],[390,600]]){
        await page.setViewportSize({width,height});await page.waitForTimeout(180);
        report.layouts.push({name:`desktop-${width}-drive`,problems:await problems(page)});await shot(page,`desktop-${width}-drive`);
        for(const selector of ['#map-button','#mirrors-button','[data-touch-action="ignition"]','[data-touch-action="belt"]'])assert(await visible(page,selector));
      }
      await page.setViewportSize({width,height});
    }
    await page.locator('#exercise-button').click();assert(await visible(page,'#exercise-card'));assert(await visible(page,'#choose-practice-exercise'));
    report.layouts.push({name:`${name}-trip`,problems:await problems(page)});if(['portrait','landscape'].includes(name))await shot(page,`${name}-trip`);
    await page.keyboard.press('Escape');assert.equal(await visible(page,'#exercise-card'),false);assert.equal(await page.locator(':focus').getAttribute('id'),'exercise-button');
    await page.locator('#controls-button').click();assert(await visible(page,'#map-button'));
    await page.locator('#map-button').click();assert(await visible(page,'#route-map'));assert.equal(await visible(page,'#driving-controls'),false);
    report.layouts.push({name:`${name}-map`,problems:await problems(page)});
    await page.keyboard.press('Escape');assert.equal(await visible(page,'#route-map'),false);assert.equal(await page.locator(':focus').getAttribute('id'),touch?'controls-button':'map-button');
    await page.locator('#controls-button').click();assert(await visible(page,'#driving-controls'));
    report.layouts.push({name:`${name}-controls`,problems:await problems(page)});if(['portrait','landscape','desktop'].includes(name))await shot(page,`${name}-controls`);
    const headlightsBefore=await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.headlights);
    await page.locator('#headlights-button').click();await page.waitForFunction(expected=>document.querySelector('#headlights-button').getAttribute('aria-pressed')===String(expected),!headlightsBefore,{timeout:10000});
    await page.locator('#mirrors-button').click();assert(await visible(page,'#mirror-controls'));assert.equal(await visible(page,'#driving-controls'),false);
    report.layouts.push({name:`${name}-mirrors`,problems:await problems(page)});await page.locator('#mirror-close').click();
    if(name==='desktop'){
      await page.keyboard.press('KeyM');assert(await visible(page,'#route-map'));await page.keyboard.press('Escape');
      await page.locator('#exercise-button').click();await page.locator('#choose-practice-exercise').click();assert(await visible(page,'#modal'));await page.locator('#modal #close').click();assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().state),'driving');
      await page.keyboard.press('Escape');if(await page.evaluate(()=>window.__avtodrom.snapshot().state==='driving'))await page.keyboard.press('Escape');await page.locator('#resume').click();assert.equal(await visible(page,'#exercise-card'),false);
      await page.evaluate(()=>window.__avtodrom.start('practice'));assert(await visible(page,'#start-help>span'));
      await page.locator('[data-touch-action="belt"]').click();await page.locator('[data-touch-action="ignition"]').click();
      await page.keyboard.press('Digit1');await page.keyboard.press('Space');await page.keyboard.down('KeyW');
      await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.speed>.6);await page.keyboard.up('KeyW');
      await page.locator('#start-help>span').waitFor({state:'hidden'});assert(await visible(page,'#controls-button'));const collapsed=await page.locator('#controls-button').boundingBox();assert(collapsed.x<24&&collapsed.y>height-70);await shot(page,'desktop-after-first-movement');
      await page.keyboard.down('KeyS');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.speed<.1);await page.keyboard.press('Space');await page.keyboard.up('KeyS');
      assert.equal(await visible(page,'#start-help>span'),false,'Stopping does not restore the startup hint');
      await page.locator('#controls-button').click();assert(await visible(page,'#driving-controls'));await page.keyboard.press('Escape');
      await page.locator('#pause-button').click();await page.locator('#resume').click();assert.equal(await visible(page,'#start-help>span'),false);
      await page.evaluate(()=>window.__avtodrom.start('practice'));assert(await visible(page,'#start-help>span'),'A new attempt restores the startup hint');
    }
    await page.evaluate(()=>window.__avtodrom.start('practice',2));await page.locator('#task-hint').waitFor({state:'visible',timeout:10000});assert.equal(await visible(page,'#exercise-card'),false);
    report.layouts.push({name:`${name}-selected`,problems:await problems(page)});if(['portrait','landscape'].includes(name))await shot(page,`${name}-selected`);
    await page.locator('#exercise-button').click();assert(await visible(page,'#retry-stage'));await page.locator('#retry-stage').click();assert.equal(await visible(page,'#exercise-card'),false);
    await page.evaluate(()=>window.__avtodrom.start('exam'));await page.locator('#controls-button').click();assert.equal(await visible(page,'#reset-button'),false);
    if(!touch){
      for(const [key,action]of [['KeyS','brake'],['ShiftLeft','clutch']]){
        await page.keyboard.down(key);await page.waitForFunction(action=>window.__avtodrom.snapshot().telemetry[action]>.9&&parseFloat(document.querySelector(`#${action}-bar`).style.width)>90,action);
        await page.keyboard.up(key);await page.waitForFunction(action=>parseFloat(document.querySelector(`#${action}-bar`).style.width)<5,action);
      }
    }
    if(name==='portrait'){
      await page.evaluate(()=>{const settings=JSON.parse(localStorage.getItem('avtodrom.settings.v1'));settings.language='uz';localStorage.setItem('avtodrom.settings.v1',JSON.stringify(settings));});await page.reload();await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});
      report.layouts.push({name:'portrait-uz-home',problems:await problems(page,true)});await shot(page,'portrait-uz-home');
    }
    await page.close();
  }
  report.checks.push('Landscape home actions fit without scrolling the page','Desktop home has mode descriptions and named settings; mobile retains compact launch buttons','Desktop home works at large and laptop sizes in Russian and Uzbek','Home guided and exam buttons start the correct modes','Home panel leaves the car visible','Desktop engine, handbrake and belt work in the instrument card and reflect keyboard actions','Desktop gear display follows N, R and gears 1–5; live FPS is visible','Desktop tachometer reports actual engine RPM and responds to throttle','Desktop gas, brake and clutch bars respond to keyboard presses and release','Desktop startup hint hides after actual movement, stays hidden after stopping and resume, and resets for a new attempt','Desktop controls button stays available after the startup hint hides','Desktop controls button stays at the bottom left and returns keyboard focus','Desktop actions fit narrow windows; mobile retains its layout','Exercise details, map and controls open on demand','Escape closes panels and returns keyboard focus','Lights, mirrors, exercise selection, retry and pause still work','Exam excludes practice reset','Portrait phones show localized rotation instructions');
  assert.deepEqual(report.errors,[]);assert(report.layouts.every(l=>l.problems.length===0),JSON.stringify(report.layouts.filter(l=>l.problems.length)));
  console.log(JSON.stringify({layouts:report.layouts.length,checks:report.checks,errors:report.errors},null,2));
}finally{await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await browser.close();}
