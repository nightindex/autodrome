import {chromium} from 'playwright';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory='test-results/exterior-defects';await mkdir(directory,{recursive:true});
if(phase==='before'&&!existsSync(`${directory}/before.glb`))await copyFile('public/assets/cobalt.glb',`${directory}/before.glb`);
const executablePath=process.env.CHROME_PATH;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 if(phase==='before')await page.route('**/assets/cobalt.glb*',route=>route.fulfill({path:`${directory}/before.glb`,contentType:'model/gltf-binary'}));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 await page.evaluate(()=>{window.__avtodrom.start('practice');window.__avtodrom.pause();});
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);window.exteriorT=T;
  window.exteriorPose={eye:[3.6,1.4,3.8],target:[.15,.25,.3],fov:38,mode:'game'};window.exteriorMeshes=[];
  s.car.traverse(n=>{if(n.isMesh)window.exteriorMeshes.push({mesh:n,original:n.material,basic:(Array.isArray(n.material)?n.material:[n.material]).map(m=>new T.MeshBasicMaterial({name:m.name,color:m.color,transparent:m.transparent,opacity:m.opacity,side:m.side})),normal:new T.MeshNormalMaterial()});});
  s.render=(...args)=>{draw(...args);const p=window.exteriorPose;s.guide.visible=s.goal.visible=false;
   s.renderer.shadowMap.enabled=p.mode==='game';
   for(const entry of window.exteriorMeshes)entry.mesh.material=p.mode==='normal'?entry.normal:p.mode==='basic'?(Array.isArray(entry.original)?entry.basic:entry.basic[0]):entry.original;
   s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));s.camera.updateMatrixWorld();s.renderer.render(s.scene,s.camera);
  };
  window.exteriorProbe=pixels=>pixels.map(([x,y])=>{
   const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/innerWidth*2-1,1-y/innerHeight*2),s.camera);
   return {pixel:[x,y],hits:ray.intersectObject(s.car,true).slice(0,8).map(h=>({node:h.object.name,material:(Array.isArray(h.object.material)?h.object.material[h.face.materialIndex]:h.object.material).name,point:s.car.worldToLocal(h.point.clone()).toArray(),distance:h.distance,face:h.faceIndex}))};
  });
 });
 const captures=[],probes=[];
 const poses=[['front-left',[3.6,1.4,3.8],[.15,.25,.3],38],['front-right',[-3.6,1.4,3.8],[-.15,.25,.3],38],['left-windows',[2.7,1.1,.3],[.55,.45,-.15],40],['right-windows',[-2.7,1.1,.3],[-.55,.45,-.15],40],['fender',[2.6,.95,2.9],[.62,.25,1.0],32]];
 const probeOnly=process.argv.includes('--probes');
 for(const [name,eye,target,fov]of poses)for(const mode of (probeOnly?['basic']:phase==='before'?['game','no-shadow','basic']:['game','no-shadow'])){
  if(probeOnly&&!['fender','left-windows'].includes(name))continue;
  await page.evaluate(p=>window.exteriorPose=p,{eye,target,fov,mode});await page.waitForTimeout(350);const path=`${directory}/${phase}-${name}-${mode}.png`;if(!probeOnly){await page.screenshot({path});captures.push(path);}
  const pixels=name==='fender'?[[740,492],[780,485],[820,480],[860,476],[700,535],[900,550]]:name==='left-windows'?[[810,420],[810,480],[800,540],[840,530],[740,450],[700,580],[800,580],[900,575]]:[];
  if(pixels.length)probes.push({name,mode,probes:await page.evaluate(p=>window.exteriorProbe(p),pixels)});
 }
 if(phase==='after')for(const view of probes.filter(view=>view.name==='fender'))for(const probe of view.probes.slice(0,4))assert.equal(probe.hits[0]?.material,'Realistic_Car_Paint',`No interior cowl protrudes through the front wing: ${view.mode},${probe.pixel}`);
 assert.deepEqual(errors,[]);await writeFile(`${directory}/${phase}${probeOnly?'-probes':''}-report.json`,JSON.stringify({captures,probes,errors},null,2));console.log(JSON.stringify({captures,errors}));
}finally{await browser.close();}
