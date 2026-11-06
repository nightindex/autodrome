import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { copyFile,mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const phase=process.argv[2]??'after',directory='test-results/rear-trim';
await mkdir(directory,{recursive:true});
const baseline=`${directory}/before.glb`;
if(phase==='before'&&!existsSync(baseline))await copyFile('public/assets/cobalt.glb',baseline);
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  if(phase==='before')await page.route('**/assets/cobalt.glb*',route=>route.fulfill({path:baseline,contentType:'model/gltf-binary'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');await page.waitForTimeout(500);await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    window.rearTrimPose={eye:[0,2.6,-5],target:[0,.35,-.8],fov:36};
    s.render=(...args)=>{render(...args);const p=window.rearTrimPose;s.guide.visible=s.goal.visible=false;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
    window.rearTrimProbe=pixels=>pixels.map(([x,y])=>{
      const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),s.camera);
      const hits=ray.intersectObject(s.car,true).filter(hit=>{for(let n=hit.object;n;n=n.parent)if(!n.visible)return false;return true;}).slice(0,5).map(hit=>{
        const m=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
        const normal=hit.normal?.clone().transformDirection(hit.object.matrixWorld).transformDirection(s.car.matrixWorld.clone().invert());
        return {mesh:hit.object.name,material:m.name,transparent:m.transparent,roughness:m.roughness,metalness:m.metalness,specularIntensity:m.specularIntensity,clearcoat:m.clearcoat,receiveShadow:hit.object.receiveShadow,point:s.car.worldToLocal(hit.point.clone()).toArray(),normal:normal?.toArray(),faceIndex:hit.faceIndex};
      });return {pixel:[x,y],hits};
    });
  });
  const captures=[],witnesses=[];
  for(const [name,pose,pixels]of [
    ['rear-high',{eye:[0,2.6,-5],target:[0,.35,-.8],fov:36},[[311,550],[326,546],[340,540],[308,530],[689,548],[320,415],[350,405],[652,407],[680,422]]],
    ['rear-low',{eye:[0,1,-5],target:[0,.07,-.6],fov:42},[[350,390],[650,390],[345,325],[655,325]]],
    ['parcel-shelf',{eye:[0,.62,-.7],target:[0,.29,-1.65],fov:90},[[240,550],[760,550],[180,350],[820,350]]],
  ]){
    await page.evaluate(pose=>window.rearTrimPose=pose,pose);await page.waitForTimeout(200);
    const path=`${directory}/${phase}-${name}.png`;await page.screenshot({path});captures.push(path);
    witnesses.push({name,probes:await page.evaluate(pixels=>window.rearTrimProbe(pixels),pixels)});
  }
  const report={phase,errors,captures,witnesses};await writeFile(`${directory}/${phase}-report.json`,JSON.stringify(report,null,2));
  if(phase==='after'){
    const rear=witnesses.find(w=>w.name==='rear-high').probes.slice(0,5).map(p=>p.hits.find(h=>!h.transparent));
    assert(rear.every(h=>h?.material==='COBALT_RearSeatBolster'&&h.specularIntensity<=.15&&!h.receiveShadow));
    const shelf=witnesses.find(w=>w.name==='rear-low').probes.slice(0,2).map(p=>p.hits.find(h=>!h.transparent));
    assert(shelf.every(h=>h?.material==='COBALT_ParcelShelf'&&h.specularIntensity<=.15&&!h.receiveShadow));
  }
  assert.deepEqual(errors,[]);console.log(JSON.stringify({phase,errors,witnesses:witnesses.map(w=>({name:w.name,probes:w.probes.map(p=>({pixel:p.pixel,opaque:p.hits.find(h=>!h.transparent)}))}))},null,2));
}finally{await browser.close();}
