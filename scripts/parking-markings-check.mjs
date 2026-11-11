import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/parking-markings';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 await page.evaluate(()=>{window.__avtodrom.start('practice',10);window.__avtodrom.pause();});
 const report=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
  const {parkingMouthLines,yellowControlPaintPaths}=await import('/src/data/road-markings.ts');
  const {Minimap}=await import('/src/ui/minimap.ts'),mini=new Minimap(document.createElement('canvas'));
  const controls=s.world.group.getObjectByName('paint-yellow-control-lines');controls.updateWorldMatrix(true,false);
  const ctx=mini.freeBase.getContext('2d');
  return parkingMouthLines.map(m=>{
   const paths=yellowControlPaintPaths(m.points),middle=paths[Math.floor(paths.length/2)],p={x:(middle[0].x+middle[1].x)/2,z:middle[0].z};
   const map=mini.projection.project(p),pixels=[...ctx.getImageData(Math.floor(map.x)-1,Math.floor(map.y)-1,3,3).data];
   return {id:m.id,category:m.category,segments:paths.length,
    rendered:!!new T.Raycaster(new T.Vector3(p.x,1,p.z),new T.Vector3(0,-1,0)).intersectObject(controls)[0],
    mapYellow:Array.from({length:9},(_,i)=>pixels.slice(i*4,i*4+3)).some(([r,g,b])=>r>g&&g>b+20&&r>135)};
  });
 });
 assert.equal(report.length,4);assert(report.every(m=>m.rendered&&m.mapYellow),JSON.stringify(report));
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);s.setCurbStyle('white');
  window.parkingPose={eye:[-38,30,-3],target:[-32,0,13],fov:55};
  s.render=(...args)=>{draw(...args);s.car.visible=s.guide.visible=s.goal.visible=false;const p=window.parkingPose;
   s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.render(s.scene,s.camera);};
 });
 for(const [name,pose]of [
  ['overview',{eye:[-38,30,-3],target:[-32,0,13],fov:55}],
  ['b-pockets',{eye:[-33,15,-8],target:[-33,0,7],fov:65}],
  ['b-close',{eye:[-30,7,-1],target:[-23,0,7.5],fov:50}],
  ['cd-pocket',{eye:[-19,12,34],target:[-21,0,18],fov:54}],
 ]){await page.evaluate(p=>window.parkingPose=p,pose);await page.waitForTimeout(300);await page.screenshot({path:`${directory}/${name}.png`});}
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({reference:'uz_video.mp4 09:00-09:20; C/D also visible in the 00:35 overview',mouths:report,errors},null,2));console.log(JSON.stringify({mouths:report,errors}));
}finally{await browser.close();}
