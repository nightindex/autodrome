import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory='test-results/paint-joins';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');await page.keyboard.press('Escape');
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 const corners=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{intersectionApproaches}=await import('/src/data/intersection.ts'),s=window.__avtodrom.scene;
  s.world.group.updateMatrixWorld(true);const paint=[];s.world.group.traverse(n=>{if(n.isMesh&&n.name.startsWith('paint-')||n.name.startsWith('intersection-stop-'))paint.push(n);});
  return intersectionApproaches.map(a=>{
   const right={x:-a.normal.z,z:a.normal.x},samples=[];
   for(const along of [.2,.5,.8])for(const across of [.2,.5,.8]){
    const p={x:a.stop.x+a.normal.x*.125*along-right.x*.05*across,z:a.stop.z+a.normal.z*.125*along-right.z*.05*across};
    const ray=new T.Raycaster(new T.Vector3(p.x,5,p.z),new T.Vector3(0,-1,0));samples.push({...p,painted:ray.intersectObjects(paint,false).length>0});
   }
   return {...a,samples};
  });
 });
 await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);s.guide.visible=s.goal.visible=false;window.paintCorner=null;s.render=(...args)=>{draw(...args);const a=window.paintCorner;if(!a)return;const r={x:-a.normal.z,z:a.normal.x};s.camera.clearViewOffset();s.camera.fov=38;s.camera.updateProjectionMatrix();s.camera.position.set(a.stop.x+a.normal.x*.8+r.x*.8,1.15,a.stop.z+a.normal.z*.8+r.z*.8);s.camera.lookAt(new T.Vector3(a.stop.x,.05,a.stop.z));s.renderer.render(s.scene,s.camera);};});
 for(const quality of ['medium','low']){
  await page.evaluate(q=>window.__avtodrom.scene.setQuality(q),quality);
  for(const corner of corners){await page.evaluate(a=>window.paintCorner=a,corner);await page.waitForTimeout(160);await page.screenshot({path:`${directory}/${phase}-${quality}-${corner.id}.png`});}
 }
 const missing=corners.flatMap(c=>c.samples.filter(p=>!p.painted).map(p=>({id:c.id,...p})));
 await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({corners,missing,errors},null,2));
 if(phase==='after')assert.equal(missing.length,0,JSON.stringify(missing));assert.deepEqual(errors,[]);console.log(JSON.stringify({phase,corners:corners.length,samples:corners.reduce((n,c)=>n+c.samples.length,0),missing:missing.length,errors}));
}finally{await browser.close();}
