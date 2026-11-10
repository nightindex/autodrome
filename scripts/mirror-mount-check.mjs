import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/mirror-mount',phase=process.argv[2]??'after';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1000,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',quality:'medium',volume:0})));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 await page.click('#practice');await page.evaluate(()=>{const a=window.__avtodrom;a.scene.cameraMode='cockpit';a.pause();});
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 const info=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);window.mountView={side:0,exterior:false};
  s.render=(...args)=>{
   const {side,exterior,front}=window.mountView,mirror=s.sideMirrorPositions[side],sign=side===0?1:-1;
   args[4]=Math.atan2(mirror.x-.31,mirror.z-.2)/.85;draw(...args);
   s.camera.clearViewOffset();s.camera.near=.025;s.camera.fov=front?32:exterior?36:side===0?30:18;s.camera.updateProjectionMatrix();
   s.camera.position.copy(s.car.localToWorld(front?new T.Vector3(sign*1.25,mirror.y+.10,mirror.z+.45):exterior?new T.Vector3(sign*1.55,mirror.y+.15,mirror.z-.65):new T.Vector3(.31,.48,.2)));
   s.camera.up.set(0,1,0).applyQuaternion(s.car.quaternion);s.camera.lookAt(s.car.localToWorld(mirror.clone().add(new T.Vector3(-sign*.07,-.02,.025))));
   s.renderer.render(s.scene,s.camera);
  };
  const authored=s.car.getObjectByName('COBALT_AuthoredDetails');s.car.updateMatrixWorld(true);
  const opaque=[];s.car.traverse(m=>{if(m.isMesh&&(Array.isArray(m.material)?m.material:[m.material]).every(mat=>!mat.transparent))opaque.push(m);});
  const without=opaque.filter(m=>!/^COBALT_SideMirror(Mount|Shell|Cap|Cavity)_/.test(m.name)),eye=s.car.localToWorld(new T.Vector3(.31,.48,.2));
  // Sightlines through the original openings, captured from the driver seat.
  const probes=[];
  for(const [side,point]of [['Left',[.779338,.364135,.747130]],['Right',[-.801070,.324428,.734561]]]){
    const target=authored.localToWorld(new T.Vector3(...point)),ray=new T.Raycaster(eye,target.clone().sub(eye).normalize(),0,target.distanceTo(eye)+.08);
    const before=ray.intersectObjects(without)[0],after=ray.intersectObjects(opaque)[0];
    probes.push({side,before:before?.object.name??null,after:after?.object.name??null});
  }
  return {mirrors:s.sideMirrorPositions.map(p=>p.toArray()),probes};
 });
 info.silhouettes=[];
 for(const [side,name]of [[0,'left'],[1,'right']])for(const view of ['driver','exterior','front']){
  await page.evaluate(view=>window.mountView=view,{side,exterior:view!=='driver',front:view==='front'});await page.waitForTimeout(200);await page.screenshot({path:`${directory}/${phase}-${name}-${view}.png`});
  if(view==='front')info.silhouettes.push(await page.evaluate(side=>{
   const s=window.__avtodrom.scene,label=side===0?'Left':'Right',bottom=prefix=>{
    const mesh=s.car.getObjectByName(`COBALT_SideMirror${prefix}_${label}`),p=mesh.geometry.getAttribute('position');let y=-Infinity;
    for(let i=0;i<p.count;i++){const point=mesh.localToWorld(s.camera.position.clone().fromBufferAttribute(p,i)).project(s.camera);y=Math.max(y,(1-point.y)*350);}return y;
   };return {side:label,mountBottom:bottom('Mount'),shellBottom:bottom('Shell')};
  },side));
 }
 await writeFile(`${directory}/${phase}.json`,JSON.stringify({info,errors},null,2));assert.deepEqual(errors,[]);
 if(phase!=='before')for(const probe of info.probes){
  assert.equal(probe.before,null,`${probe.side}: the regression ray must reproduce the original opening`);
  assert.match(probe.after??'',new RegExp(`^COBALT_SideMirror(Mount|Shell|Cavity)_${probe.side}$`),`${probe.side}: casing and neck must close the opening`);
 }
 for(const outline of info.silhouettes)assert(outline.mountBottom<=outline.shellBottom+6,`${outline.side}: the neck must not form a rectangular tab beneath the casing: ${JSON.stringify(outline)}`);
 console.log(JSON.stringify({info,errors}));
}finally{await browser.close();}
