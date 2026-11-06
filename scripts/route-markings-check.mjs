import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/route-markings';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.click('#practice');await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    window.markingPose={eye:[38,12,47],target:[55,0,29]};
    s.render=(...args)=>{render(...args);s.guide.visible=s.goal.visible=false;const p=window.markingPose;s.camera.clearViewOffset();s.camera.fov=56;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
  });
  for(const [name,pose]of [
    ['ramp-exit',{eye:[30,7,43],target:[52,0,36]}],
    ['b-cd-fork',{eye:[42,17,43],target:[56,0,24]}],
    ['right-angle',{eye:[52,22,36],target:[32,0,22]}],
    ['yellow-corners',{eye:[49,12,31],target:[36,0,20]}],
    ['snake',{eye:[27,24,-5],target:[20,0,-20]}],
  ]){
    await page.evaluate(p=>window.markingPose=p,pose);await page.waitForTimeout(350);await page.screenshot({path:`${directory}/${name}.png`});
  }
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{mapPoint}=await import('/src/data/course.ts'),{yellowControlLines}=await import('/src/data/road-markings.ts');
    const group=window.__avtodrom.scene.world.group,yellow=group.getObjectByName('course-yellow-edge-lines'),controls=group.getObjectByName('paint-yellow-control-lines');
    const hit=(mesh,p)=>!!new T.Raycaster(new T.Vector3(p.x,5,p.z),new T.Vector3(0,-1,0)).intersectObject(mesh)[0];
    const edgeSamples=[[897.1,690],[937.9,690],[900,824.6],[1017.9,800]].map(([x,y])=>({x,y,painted:hit(yellow,mapPoint(x,y))}));
    const entrySamples=yellowControlLines.slice(1,5).map(([a,b])=>{
      const length=Math.hypot(b.x-a.x,b.z-a.z),points=[];
      for(let d=.16;d<length;d+=.65)points.push({x:a.x+(b.x-a.x)*d/length,z:a.z+(b.z-a.z)*d/length});
      return {total:points.length,painted:points.filter(p=>hit(controls,p)).length};
    });
    return {edgeSamples,entrySamples,yellowTriangles:yellow.geometry.index.count/3,controlTriangles:controls.geometry.index.count/3,solidDeparture:!!group.getObjectByName('paint-departure-divider')};
  });
  assert(geometry.edgeSamples.every(s=>s.painted),'Yellow borders must be visible along both legs of the right-angle course');
  assert(geometry.entrySamples.every(s=>s.painted===s.total),'Yellow entry dashes must span the entire road');
  assert(geometry.solidDeparture);assert.deepEqual(errors,[]);
  await writeFile(`${directory}/report.json`,JSON.stringify({geometry,errors},null,2));console.log(JSON.stringify({geometry,errors}));
}finally{await browser.close();}
