import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
await mkdir('test-results/road-markings',{recursive:true});
const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.click('#lang');await page.click('#exercises');await page.click('[data-exercise="1"]');
  await page.waitForTimeout(1000);
  assert.equal((await page.evaluate(()=>window.__avtodrom.snapshot())).score,0,'Preparing at the pedestrian practice spawn must not incur a penalty');
  const geometry=await page.evaluate(async()=>{
    const {roadDistance,pedestrianCrossingLayout}=await import('/src/render/course-world.ts'),{startLinePoint}=await import('/src/data/course.ts'),T=await import('/node_modules/three/build/three.module.js');
    const world=window.__avtodrom.scene.world,signs=[];
    world.group.traverse(n=>{if(n.name.startsWith('sign-')&&n.name.endsWith('-front')){const p=n.getWorldPosition(new T.Vector3());signs.push({name:n.name,x:p.x,y:p.y,z:p.z,assembly:n.parent.uuid,yaw:n.parent.rotation.y,clearance:roadDistance({x:p.x,z:p.z}),side:n.material.side});}});
    const lines=['paint-start-line','paint-pedestrian-stop-line'].map(name=>{
      const mesh=world.group.getObjectByName(name);mesh.geometry.computeBoundingBox();
      return {name,min:mesh.geometry.boundingBox.min.toArray(),max:mesh.geometry.boundingBox.max.toArray()};
    });
    return {crossing:pedestrianCrossingLayout(),signs,lines,startX:startLinePoint.x,labels:world.group.children.filter(n=>['paint-label-B','paint-label-CD'].includes(n.name)&&n.position.z>36).map(n=>({name:n.name,x:n.position.x}))};
  });
  assert.equal(geometry.signs.filter(s=>s.name==='sign-pedestrian-front').length,6);
  assert(geometry.signs.every(s=>s.clearance>.15),'Every sign face must be clear of driveable asphalt');
  assert(geometry.signs.every(s=>s.side===0),'Sign symbols must not be mirrored on their reverse');
  assert.equal(geometry.signs.filter(s=>s.name==='sign-start-front').length,1);
  const pedestrian=geometry.signs.find(s=>s.name==='sign-pedestrian-front'&&s.yaw<0&&s.z>35);
  const stop=geometry.signs.find(s=>s.name==='sign-stop-front'&&s.assembly===pedestrian.assembly);
  assert(stop&&stop.y<pedestrian.y,'The approach STOP board must share the pedestrian post, below its crossing board');
  assert(geometry.lines.every(line=>line.max[2]-line.min[2]>7),'Start and pedestrian stop lines must span both lanes');
  assert(geometry.labels.every(label=>label.x>geometry.startX),'B/CD labels must follow the START line');
  await page.screenshot({path:'test-results/road-markings/pedestrian-approach.png'});
  await page.keyboard.press('KeyC');await page.keyboard.press('KeyC');await page.waitForTimeout(900);
  await page.screenshot({path:'test-results/road-markings/pedestrian-overview.png'});
  await page.keyboard.press('Escape');await page.click('#modal #menu');
  await page.click('#exercises');await page.click('[data-exercise="2"]');await page.waitForTimeout(800);
  await page.screenshot({path:'test-results/road-markings/hill-sign.png'});
  assert.deepEqual(errors,[]);
  await writeFile('test-results/road-markings/report.json',JSON.stringify({date:new Date().toISOString(),...geometry,errors},null,2));
  console.log(JSON.stringify({signs:geometry.signs.length,crossing:geometry.crossing,errors},null,2));
}finally{await browser.close();}
