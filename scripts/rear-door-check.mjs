import {chromium} from 'playwright';
import {mkdir,copyFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const phase=process.argv[2]??'after',directory='test-results/rear-doors';
await mkdir(directory,{recursive:true});
if(phase==='before')await copyFile('public/assets/cobalt.glb',`${directory}/before.glb`);
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],captures=[];
page.on('pageerror',error=>errors.push(error.message));
try{
 if(phase==='before')await page.route('**/assets/cobalt.glb*',route=>route.fulfill({path:`${directory}/before.glb`,contentType:'model/gltf-binary'}));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});
 await page.evaluate(async()=>{
  window.__avtodrom.start('practice');window.__avtodrom.pause();
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s),panels=[];
  s.car.traverse(n=>{if(n.isMesh&&n.material.name==='Realistic_Car_Paint')panels.push({mesh:n,paint:n.material,normal:new T.MeshNormalMaterial()});});
  window.doorPose=null;
  s.render=(...args)=>{
   draw(...args);const p=window.doorPose;if(!p)return;
   s.guide.visible=s.goal.visible=false;s.renderer.shadowMap.enabled=p.mode==='game';
   for(const panel of panels)panel.mesh.material=p.mode==='normal'?panel.normal:panel.paint;
   s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();
   s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));s.camera.updateMatrixWorld();s.renderer.render(s.scene,s.camera);
  };
 });
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 for(const side of [1,-1])for(const [name,eye,target,fov]of [
  ['quarter',[side*3.6,1.6,3.8],[0,.1,0],43],
  ['door',[side*2.6,.75,.4],[side*.78,0,-.70],36],
 ])for(const mode of ['game','no-shadow','normal']){
  await page.evaluate(p=>window.doorPose=p,{eye,target,fov,mode});await page.waitForTimeout(300);
  const path=`${directory}/${phase}-${side===1?'left':'right'}-${name}-${mode}.png`;await page.screenshot({path});captures.push(path);
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({captures,errors},null,2));console.log(JSON.stringify({captures,errors}));
}finally{await browser.close();}
