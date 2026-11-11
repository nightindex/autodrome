import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory=`test-results/cabin-seams/${phase}`;await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 await page.evaluate(()=>{window.__avtodrom.start('practice');window.__avtodrom.pause();});
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);
  window.seamPose={target:[.65,.72,.45],fov:65,side:1};
  s.render=(...args)=>{draw(...args);s.guide.visible=s.goal.visible=false;const p=window.seamPose;
   const eye=s.cockpitEye.clone();eye.x*=p.side;s.camera.position.copy(s.car.localToWorld(eye));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));
   s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.updateMatrixWorld();s.renderer.render(s.scene,s.camera);};
  window.seamProbes=()=>{
   const r=new T.Raycaster(),results=[];
   const pixels=[[50,553],[100,540],[130,532],[650,360],[720,370]];
   for(let y=100;y<750;y+=50)for(let x=100;x<1350;x+=50)pixels.push([x,y]);
   for(const [x,y]of pixels){
    r.setFromCamera(new T.Vector2(x/720-1,1-y/480),s.camera);
    const h=r.intersectObject(s.car,true).find(h=>h.object.material.opacity>.9);
    if(h)results.push({pixel:[x,y],node:h.object.name,material:h.object.material.name,point:s.car.worldToLocal(h.point.clone()).toArray()});
   }return results;
  };
 });
 const probes={};
 for(const side of [1,-1])for(const [name,target,fov]of [
  ['roof',[side*.65,.72,.45],65],['door',[side*.73,.32,.30],60],
 ]){
  await page.evaluate(p=>window.seamPose=p,{target,fov,side});await page.waitForTimeout(350);
  const key=`${side===1?'left':'right'}-${name}`;await page.screenshot({path:`${directory}/${key}.png`});probes[key]=await page.evaluate(()=>window.seamProbes());
 }
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({probes,errors},null,2));console.log(JSON.stringify({directory,errors}));
}finally{await browser.close();}
