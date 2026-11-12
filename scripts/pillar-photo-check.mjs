import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory=process.env.PILLAR_CAPTURE_DIRECTORY||'test-results/pillar-photo';
await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path=>path&&existsSync(path));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],captures=[],framePockets=[],frameOpenings=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');
  const live=await page.evaluate(()=>{const s=window.__avtodrom.scene,eye=s.cockpitEye.toArray();return {eye,target:[eye[0],eye[1]-.025,eye[2]+1],fov:s.cockpitView.fov};});
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    s.cameraMode='cockpit';window.pillarPose={eye:[.31,.48,.2],target:[.63,.39,.92],fov:40};
    s.render=(...args)=>{
      const p=window.pillarPose;args[4]=Math.atan2(p.target[0]-p.eye[0],p.target[2]-p.eye[2])/.85;render(...args);
      s.camera.clearViewOffset();s.camera.near=.025;s.camera.fov=p.fov;s.camera.updateProjectionMatrix();
      s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));
      s.renderer.render(s.scene,s.camera);
    };
  });
  const poses=[
    ['left-windscreen-joint',{eye:[.31,.48,.2],target:[.63,.39,.92],fov:40}],
    ['right-windscreen-joint',{eye:[-.31,.48,.2],target:[-.63,.39,.92],fov:40}],
    ['game-driver',live],
    ['driver-left-joint',{...live,target:[.68,.34,1.02],fov:45}],
    ['driver-right-joint',{...live,target:[-.68,.34,1.02],fov:45}],
    ['right-frame-close',{...live,target:[-.68,.34,1.02],fov:20}],
    ['left-frame-close',{...live,eye:[-live.eye[0],live.eye[1],live.eye[2]],target:[.68,.34,1.02],fov:20}],
    ['wide-front-pillars',{eye:[0,.55,-.05],target:[0,.43,1.1],fov:70}],
  ];
  for(const [name,pose]of poses){
    await page.evaluate(pose=>window.pillarPose=pose,pose);await page.waitForTimeout(400);
    const path=`${directory}/after-${name}.png`;await page.screenshot({path});captures.push(path);
    if(name.endsWith('frame-close')){
      const side=name.startsWith('right')?-1:1;
      const result=await page.evaluate(async side=>{
        const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
        const probe=([x,y])=>{
          if(side>0)x=1440-x;
          const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/720-1,1-y/480),s.camera);
          const hits=ray.intersectObject(s.car,true),opaque=hits.find(h=>!h.object.material.transparent&&h.object.material.opacity>.9);
          return {pixel:[x,y],glassLayers:hits.filter(h=>h.object.material.name==='COBALT_Windshield').length,node:opaque?.object.name,material:opaque?.object.material.name};
        };
        return {opening:[[946,195],[958,205],[982,195],[994,215],[922,205]].map(probe),cowl:[[600,410],[700,400]].map(probe)};
      },side);
      assert(result.opening.every(p=>p.glassLayers===2&&!p.node),`Continuous glazed opening without donor frame tabs: ${JSON.stringify({side,result})}`);
      assert(result.cowl.every(p=>p.node==='COBALT_MouldedDashboardCowl'),`Dashboard closes against the lower pane: ${JSON.stringify({side,result})}`);
      frameOpenings.push({side,...result});
    }
    if(name==='left-windscreen-joint'||name==='right-windscreen-joint'){
      const side=name.startsWith('left')?1:-1,pixels=[[734,511],[741,513],[748,516]].map(([x,y])=>[side>0?x:1440-x,y]);
      const samples=await page.evaluate(async pixels=>{
        const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
        return pixels.map(([x,y])=>{
          const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(x/720-1,1-y/480),s.camera);
          const hit=ray.intersectObject(s.car,true).find(h=>!h.object.material.transparent&&h.object.material.opacity>.9);
          return {pixel:[x,y],node:hit?.object.name,material:hit?.object.material.name};
        });
      },pixels);
      framePockets.push({side,samples});
      assert(samples.every(s=>['COBALT_Rubber','COBALT_Dashboard'].includes(s.material)),`No pale frame tooth below the windscreen seal: ${JSON.stringify(samples)}`);
    }
  }
  await page.setViewportSize({width:768,height:960});
  await page.evaluate(()=>window.pillarPose={eye:[.31,.48,.2],target:[.63,.39,.92],fov:55});
  await page.waitForTimeout(400);
  const compactPath=`${directory}/after-compact-left-joint.png`;await page.screenshot({path:compactPath});captures.push(compactPath);
  assert.equal(errors.length,0,JSON.stringify(errors));
  await writeFile(`${directory}/photo-report.json`,JSON.stringify({captures,framePockets,frameOpenings,errors},null,2));
  console.log(JSON.stringify({captures,framePockets,frameOpenings,errors},null,2));
}finally{await browser.close();}
