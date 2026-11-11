import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/free-practice';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'})));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');
  const result=await page.evaluate(async()=>{
    const a=window.__avtodrom,v=a.vehicle;
    const {course}=await import('/src/data/course.ts');
    const {intersectionApproaches}=await import('/src/data/intersection.ts');
    const {vehicleConfig,wheelCenter}=await import('/src/data/vehicle.ts');
    const {localPoint}=await import('/src/simulation/math.ts');
    const update=v.update,telemetry=v.telemetry;
    let t=v.telemetry();
    function cross(point,normal,along,time=56){
      const yaw=Math.atan2(normal.x,normal.z);
      const bumper={x:point.x+normal.x*along,z:point.z+normal.z*along};
      const position={x:bumper.x-normal.x*vehicleConfig.length/2,z:bumper.z-normal.z*vehicleConfig.length/2};
      t={...t,time,bumper,position,yaw,speed:2,signedSpeed:2,engine:true,stalled:false,belt:true,collision:false,indicator:'off',hazards:false,
        wheels:[0,1,2,3].map(i=>{const p=wheelCenter(i);return localPoint(position,yaw,p.x,p.z);})};
      a.step(1/60);
    }
    try{
      v.update=()=>{};v.telemetry=()=>t;
      // Visit railway first, followed by every junction approach, then repeat
      // the pedestrian crossing. None depends on the exam itinerary cursor.
      for(const id of ['railway','pedestrian']){
        const {point,normal}=course.exercises.find(e=>e.id===id).stop;
        for(const along of [-3,-.3,-.1])cross(point,normal,along);
      }
      for(const approach of intersectionApproaches){
        const normal=approach.normal,point={x:approach.stop.x-normal.z*2,z:approach.stop.z+normal.x*2};
        for(const along of [-3,-.3,-.1])cross(point,normal,along,normal.x?20:56);
      }
      const {point,normal}=course.exercises.find(e=>e.id==='pedestrian').stop;
      for(const along of [-3,-.3,-.1])cross(point,normal,along);
      const snapshot=a.snapshot();a.pause();return snapshot;
    }finally{v.update=update;v.telemetry=telemetry;}
  });
  assert.equal(result.state,'driving');assert.equal(result.freePractice,true);
  assert.deepEqual(result.events.map(e=>e.ruleId),[25,11,24,24,24,24,11]);
  assert.equal(result.score,490);
  await page.waitForFunction(()=>document.querySelector('#penalty-score').textContent==='490');
  await page.click('#resume');
  await page.locator('#practice-errors summary').click();
  await page.waitForFunction(()=>document.querySelector('#practice-error-count').textContent==='7');
  assert.equal(await page.locator('#practice-error-list li').count(),7);
  const history=await page.locator('#practice-error-list li').allTextContents();
  assert.equal(history.filter(text=>text.includes('запрещающий')).length,4);
  assert.equal(history.filter(text=>text.includes('стоп-линией')).length,2);
  assert.equal(await page.locator('#penalty-score small').count(),0);
  assert.equal(await page.locator('#practice-coach').isVisible(),false);
  await page.screenshot({path:`${directory}/all-road-errors.png`});
  assert.deepEqual(errors,[]);
  await writeFile(`${directory}/report.json`,JSON.stringify({score:result.score,events:result.events,history,errors},null,2));
  console.log('Free practice: seven road violations, repeated stops, all four red-light approaches, 490 points, history and pause/resume passed.');
}finally{await browser.close();}
