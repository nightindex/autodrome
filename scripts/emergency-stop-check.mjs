import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/emergency-stop';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',quality:'low'})));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 await page.evaluate(()=>window.__avtodrom.start('practice',9));
 assert.equal(await page.evaluate(()=>window.__avtodrom.engine().emergencySignalled),false);
 for(const key of ['KeyB','KeyI','Digit1','Space'])await page.keyboard.press(key);
 await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__avtodrom.engine().emergencySignalled,null,{timeout:15000});await page.keyboard.up('KeyW');await page.keyboard.down('KeyS');
 await page.waitForFunction(()=>window.__avtodrom.engine().emergencyStopped,null,{timeout:5000});await page.keyboard.press('KeyH');
 const geometry=await page.evaluate(async()=>{
  const a=window.__avtodrom,{emergencyStopStation:s}=await import('/src/data/course.ts'),{emergencyStopMarking:line}=await import('/src/render/course-world.ts'),{Minimap}=await import('/src/ui/minimap.ts');
  const mesh=a.scene.world.group.getObjectByName(line.name),p=mesh.geometry.attributes.position;
  const mini=new Minimap(document.createElement('canvas')),mid=mini.projection.project({x:(line.points[0].x+line.points[1].x)/2,z:(line.points[0].z+line.points[1].z)/2});
  const z=Array.from({length:p.count},(_,i)=>p.getZ(i)),t=a.vehicle.telemetry();
  return {extent:Math.max(...z)-Math.min(...z),width:line.width,contours:line.contours.length,color:mesh.material.color.getHexString(),oldStripe:!!a.scene.world.group.getObjectByName('paint-emergency-stop-line'),points:line.points,station:s,bumper:t.bumper,stoppedBeforeLine:t.bumper.z<line.points[0].z,
   mapPixels:[...mini.base.getContext('2d').getImageData(Math.floor(mid.x)-1,Math.floor(mid.y)-1,3,3).data],events:a.engine().events};
 });
 assert.equal(geometry.width,.10);assert.equal(geometry.color,'efcc59');assert.equal(geometry.oldStripe,false);assert.equal(geometry.contours,2);assert(geometry.extent>1.45&&geometry.extent<1.7);assert(geometry.stoppedBeforeLine);assert(Array.from({length:9},(_,i)=>geometry.mapPixels.slice(i*4,i*4+3)).some(([r,g,b])=>r>g&&g>b+20&&r>140),JSON.stringify(geometry.mapPixels));
 await page.waitForFunction(()=>window.__avtodrom.engine().emergencyCompleted,null,{timeout:6500});
 assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.hazards),true);
 await page.screenshot({path:`${directory}/desktop.png`});await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${directory}/mobile.png`});
 await page.keyboard.press('KeyH');await page.keyboard.up('KeyS');await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__avtodrom.snapshot().state==='result',null,{timeout:10000});await page.keyboard.up('KeyW');
 const events=await page.evaluate(()=>window.__avtodrom.engine().events);assert(!events.some(e=>[4,11,12,19,20,21].includes(e.ruleId)),JSON.stringify(events));
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({geometry,completed:true,events,errors},null,2));console.log(JSON.stringify({triangleStroke:geometry.width,stoppedBeforeLine:geometry.stoppedBeforeLine,completed:true,events,errors}));
}finally{await browser.close();}
