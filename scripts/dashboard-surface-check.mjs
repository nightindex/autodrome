import {chromium} from 'playwright';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const phase=process.argv[2]??'after',directory='test-results/dashboard-surface';await mkdir(directory,{recursive:true});
if(phase==='before'&&!existsSync(`${directory}/before.glb`))await copyFile('public/assets/cobalt.glb',`${directory}/before.glb`);
const executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 if(phase==='before')await page.route('**/assets/cobalt.glb*',route=>route.fulfill({path:`${directory}/before.glb`,contentType:'model/gltf-binary'}));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 await page.evaluate(()=>{window.__avtodrom.start('practice');window.__avtodrom.pause();window.__avtodrom.scene.cameraMode='cockpit';});
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 const eye=await page.evaluate(()=>window.__avtodrom.scene.cockpitEye.toArray());
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);
  window.dashPose=null;s.render=(...args)=>{draw(...args);const p=window.dashPose;if(!p)return;
   s.camera.clearViewOffset();s.camera.near=.025;s.camera.fov=p.fov;s.camera.updateProjectionMatrix();
   s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));
   s.renderer.render(s.scene,s.camera);
  };
 });
 const captures=[];
 for(const [name,pose]of [['driver',null],['tray',{eye,target:[.08,.39,.95],fov:34}],['passenger',{eye:[-.31,.56,.18],target:[.02,.37,.95],fov:38}],['top',{eye:[0,.88,.82],target:[0,.38,1.01],fov:42}]]){
  await page.evaluate(p=>window.dashPose=p,pose);await page.waitForTimeout(450);const path=`${directory}/${phase}-${name}.png`;await page.screenshot({path});captures.push(path);
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({captures,errors},null,2));console.log(JSON.stringify({captures,errors}));
}finally{await browser.close();}
