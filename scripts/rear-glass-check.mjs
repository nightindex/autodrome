import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { copyFile,mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const phase=process.argv[2]??'after',directory='test-results/rear-glass';
await mkdir(directory,{recursive:true});
const baseline=`${directory}/before.glb`;
if(phase==='before'&&!existsSync(baseline))await copyFile('public/assets/cobalt.glb',baseline);
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1000,height:900}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  if(phase==='before')await page.route('**/assets/cobalt.glb*',route=>route.fulfill({path:baseline,contentType:'model/gltf-binary'}));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');await page.waitForTimeout(500);await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    window.glassPose={eye:[0,2.2,-5],target:[0,.55,-1.5],fov:26,yaw:0};
    s.render=(...args)=>{
      render(...args);const p=window.glassPose;s.car.rotateY(p.yaw);s.car.updateMatrixWorld(true);
      s.guide.visible=s.goal.visible=false;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();
      s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));
      s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);
    };
  });
  const captures=[];
  for(const [name,pose]of [
    ...[0,90,180,270].map(yaw=>[`rear-${yaw}`,{eye:[0,2.2,-5],target:[0,.55,-1.5],fov:26,yaw:yaw*Math.PI/180}]),
    ['rear-low',{eye:[0,1,-5],target:[0,.55,-1.5],fov:26,yaw:0}],
    ['rear-high',{eye:[0,3.5,-5],target:[0,.35,-.8],fov:36,yaw:0}],
    ['rear-left',{eye:[2,1.7,-4],target:[0,.55,-1.5],fov:36,yaw:0}],
    ['rear-right',{eye:[-2,1.7,-4],target:[0,.55,-1.5],fov:36,yaw:0}],
    ['inside',{eye:[0,.62,-.7],target:[0,.6,-1.65],fov:90,yaw:0}],
  ]){
    await page.evaluate(p=>window.glassPose=p,pose);await page.waitForTimeout(200);
    const path=`${directory}/${phase}-${name}.png`;await page.screenshot({path});captures.push(path);
  }
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,panes=[];
    s.car.traverse(n=>{if(n.isMesh&&(Array.isArray(n.material)?n.material:[n.material]).some(m=>m.name==='COBALT_RearWindshield'))panes.push(n);});
    const witnesses=[];
    for(const x of [-.55,-.4,-.2,0,.2,.4,.55])for(const z of [-1.68,-1.55,-1.4,-1.25]){
      const direction=new T.Vector3(0,-1,0).transformDirection(s.car.matrixWorld),origin=s.car.localToWorld(new T.Vector3(x,2,z));
      const outside=new T.Raycaster(origin,direction).intersectObjects(panes,false),hit=outside[0];
      const inside=hit?new T.Raycaster(hit.point.clone().addScaledVector(direction,.2),direction.clone().negate()).intersectObjects(panes,false):[];
      witnesses.push({x,z,outside:outside.length,inside:inside.length});
    }
    return {panes:panes.map(n=>({name:n.name,material:n.material.name,opacity:n.material.opacity,side:n.material.side,depthWrite:n.material.depthWrite,receiveShadow:n.receiveShadow,castShadow:n.castShadow})),witnesses};
  });
  await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({phase,errors,captures,geometry},null,2));
  assert.deepEqual(errors,[]);
  if(phase==='after'){
    assert.equal(geometry.panes.length,1);
    const pane=geometry.panes[0];
    assert(Math.abs(pane.opacity-(1-(1-.38)**2))<1e-6&&pane.side===2&&!pane.depthWrite&&!pane.castShadow&&!pane.receiveShadow);
    assert(geometry.witnesses.every(w=>w.outside===1&&w.inside===1),'Every pane witness crosses exactly one visible glass surface in either direction');
  }
  console.log(JSON.stringify({phase,captures:captures.length,panes:geometry.panes,witnesses:geometry.witnesses.length,errors},null,2));
}finally{await browser.close();}
