import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/video-review';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1366,height:768}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const screenshot=name=>page.screenshot({path:`${directory}/${name}.png`});
const menu=async()=>{await page.keyboard.press('Escape');await page.locator('#modal #menu').click();};
const start=async index=>{await page.click('#exercises');await page.click(`[data-exercise="${index}"]`);await page.waitForTimeout(900);};
const carClear=()=>page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js');
  const scene=window.__avtodrom.scene,box=new T.Box3().setFromObject(scene.car),points=[];
  for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new T.Vector3(x,y,z).project(scene.camera));
  const car={left:(Math.min(...points.map(p=>p.x))+1)*innerWidth/2,right:(Math.max(...points.map(p=>p.x))+1)*innerWidth/2,top:(1-Math.max(...points.map(p=>p.y)))*innerHeight/2,bottom:(1-Math.min(...points.map(p=>p.y)))*innerHeight/2};
  const panel=document.querySelector('.instrument-panel').getBoundingClientRect();
  return {car,panel:{left:panel.left,right:panel.right,top:panel.top,bottom:panel.bottom},clear:car.right<=panel.left||car.left>=panel.right||car.bottom<=panel.top||car.top>=panel.bottom};
});
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.click('#lang');await start(0);checks.push({name:'1366 chase car clear of instruments',...await carClear()});await screenshot('start');await menu();
  await start(1);assert((await page.locator('#exercise-feedback').innerText()).includes('До стоп-линии'));await screenshot('pedestrian');await menu();
  await start(2);await screenshot('hill');await menu();
  await start(3);assert((await page.locator('#exercise-feedback').innerText()).includes('01:'));await screenshot('right-angle');await menu();
  await start(7);await screenshot('railway');
  const world=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),world=window.__avtodrom.scene.world;
    const curbs=world.group.getObjectByName('course-curbs'),colors=new Set();
    const attribute=curbs.geometry.getAttribute('color');for(let i=0;i<attribute.count;i++){const color=new T.Color().fromBufferAttribute(attribute,i);colors.add(color.getHexString());}
    const rail=world.group.getObjectByName('sign-railway-front');
    return {curbColors:[...colors],curbHeight:curbs.userData.height,railHeight:rail.userData.assemblyHeight,railTextureHeight:rail.material.map.image.height};
  });
  assert.equal(world.curbColors.length,2);assert(world.curbHeight>.2);assert(world.railHeight>1);assert.equal(world.railTextureHeight,512);
  await page.setViewportSize({width:1024,height:600});await page.waitForTimeout(500);checks.push({name:'1024 chase car clear of instruments',...await carClear()});await screenshot('compact-driving');
  await menu();await page.setViewportSize({width:375,height:667});await screenshot('narrow-menu');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  assert(checks.every(c=>c.clear),'Instruments must not obscure the chase car at desktop sizes');assert.deepEqual(errors,[]);
  const report={date:new Date().toISOString(),world,checks,errors};await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
