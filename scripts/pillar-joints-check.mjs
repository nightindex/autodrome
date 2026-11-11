import {chromium} from 'playwright';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory='test-results/pillar-joints';await mkdir(directory,{recursive:true});
if(phase==='before'&&!existsSync(`${directory}/before.glb`))await copyFile('public/assets/cobalt.glb',`${directory}/before.glb`);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],captures=[],probes=[];page.on('pageerror',e=>errors.push(e.message));
try{
 if(phase==='before')await page.route('**/assets/cobalt.glb*',route=>route.fulfill({path:`${directory}/before.glb`,contentType:'model/gltf-binary'}));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 await page.evaluate(()=>{window.__avtodrom.start('practice');window.__avtodrom.pause();window.__avtodrom.scene.cameraMode='cockpit';});
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 const eye=await page.evaluate(()=>window.__avtodrom.scene.cockpitEye.toArray());
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);window.jointPose=null;
  s.render=(...args)=>{draw(...args);const p=window.jointPose;if(!p)return;
   s.camera.clearViewOffset();s.camera.near=.025;s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));s.camera.updateMatrixWorld();s.renderer.render(s.scene,s.camera);
  };
  window.jointProbe=pixels=>pixels.map(([x,y])=>{const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),s.camera);return{pixel:[x,y],hits:ray.intersectObject(s.car,true).filter(h=>h.object.material.opacity>.9).slice(0,4).map(h=>({node:h.object.name,material:h.object.material.name,point:s.car.worldToLocal(h.point.clone()).toArray(),distance:h.distance,face:h.faceIndex}))};});
 });
 for(const side of [1,-1])for(const [name,target,fov]of [['lower',[side*.68,.43,.83],32],['upper',[side*.58,.78,.34],24]]){
  await page.evaluate(p=>window.jointPose=p,{eye:[side*Math.abs(eye[0]),eye[1],eye[2]],target,fov});await page.waitForTimeout(350);
  const key=`${side===1?'left':'right'}-${name}`,path=`${directory}/${phase}-${key}.png`;await page.screenshot({path});captures.push(path);
  const pixels=[];for(let y=160;y<=800;y+=80)for(let x=240;x<=1200;x+=80)pixels.push([x,y]);probes.push({key,probes:await page.evaluate(p=>window.jointProbe(p),pixels)});
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({captures,probes,errors},null,2));console.log(JSON.stringify({captures,errors}));
}finally{await browser.close();}
