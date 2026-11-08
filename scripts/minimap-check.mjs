import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/minimap';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.click('#lang');await page.click('#practice');assert(await page.locator('.minimap').isHidden());await page.click('#map-button');await page.waitForTimeout(500);
  await page.locator('.minimap').screenshot({path:`${directory}/desktop-map.png`});await page.screenshot({path:`${directory}/desktop-driving.png`});
  assert((await page.locator('.minimap').innerText()).includes('Цель'));
  const geometry=await page.evaluate(async()=>{
    const {Minimap}=await import('/src/ui/minimap.ts'),{roadSurface,roadDistance}=await import('/src/render/course-world.ts'),{course}=await import('/src/data/course.ts');
    const canvas=document.createElement('canvas'),map=new Minimap(canvas);map.draw(window.__avtodrom.snapshot().telemetry,course.exercises[0]);
    const ctx=canvas.getContext('2d'),samples=[];
    // Read the cached background so moving markers and the route cannot mask road/grass classification.
    const background=map.base.getContext('2d');let wrong=0,checked=0;
    for(let x=-60;x<=60;x+=2)for(let z=-42;z<=42;z+=2){const d=roadDistance({x,z});if(Math.abs(d)<.8)continue;
      const p=map.projection.project({x,z}),pixel=[...background.getImageData(Math.round(p.x),Math.round(p.y),1,1).data];
      const grass=pixel[0]===183&&pixel[1]===198&&pixel[2]===165;
      if(d>0&&!grass)wrong++;if(d<0&&grass)wrong++;checked++;
    }
    for(const [index,exercise]of course.exercises.entries())samples.push({index,world:exercise.point,map:map.projection.project(exercise.point)});
    const origin=map.projection.project({x:0,z:0}),east=map.projection.project({x:10,z:0}),south=map.projection.project({x:0,z:10});
    return {width:canvas.width,height:canvas.height,scale:map.projection.scale,scaleX:east.x-origin.x,scaleZ:south.y-origin.y,checked,wrong,goals:samples};
  });
  assert.equal(geometry.wrong,0);assert(Math.abs(geometry.scaleX-geometry.scaleZ)<1e-8);
  await page.keyboard.press('KeyB');await page.keyboard.press('KeyI');await page.keyboard.down('ShiftLeft');await page.waitForTimeout(250);await page.keyboard.press('Digit1');await page.keyboard.press('Space');
  const before=await page.locator('.minimap canvas').evaluate(c=>c.toDataURL());await page.keyboard.down('KeyW');await page.keyboard.up('ShiftLeft');await page.waitForTimeout(1100);await page.keyboard.up('KeyW');
  const after=await page.locator('.minimap canvas').evaluate(c=>c.toDataURL());assert.notEqual(before,after);assert((await page.evaluate(()=>window.__avtodrom.snapshot())).telemetry.speed>1);
  await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyS');await page.waitForTimeout(1500);await page.keyboard.up('KeyS');await page.keyboard.up('ShiftLeft');
  await page.click('#pause-button');await page.click('#modal #menu');
  await page.click('#exercises');await page.click('[data-exercise="6"]');await page.click('#map-button');await page.waitForTimeout(300);await page.locator('.minimap').screenshot({path:`${directory}/garage-map.png`});
  await page.setViewportSize({width:1024,height:600});await page.waitForTimeout(250);await page.locator('.minimap').screenshot({path:`${directory}/compact-map.png`});await page.screenshot({path:`${directory}/compact-driving.png`});
  await page.setViewportSize({width:375,height:667});await page.waitForTimeout(250);await page.locator('.minimap').screenshot({path:`${directory}/narrow-map.png`});
  const layout=await page.locator('.minimap').evaluate(e=>({width:e.clientWidth,scrollWidth:e.scrollWidth,legend:e.querySelector('footer').innerText}));assert(layout.scrollWidth<=layout.width);
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({date:new Date().toISOString(),geometry,layout,markerMoved:before!==after,errors},null,2));console.log(JSON.stringify({samples:geometry.checked,mismatches:geometry.wrong,markerMoved:before!==after,layout,errors}));
}finally{await browser.close();}
