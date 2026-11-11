import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

const phase=process.argv[2]??'after',directory=process.env.MIRROR_CAPTURE_DIRECTORY||'test-results/mirror-reference';
await mkdir(directory,{recursive:true});
if(phase==='before'&&!existsSync(`${directory}/before.glb`))await copyFile('public/assets/cobalt.glb',`${directory}/before.glb`);
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path=>path&&existsSync(path));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[],captures=[];
let loadedModelUrl='';
page.on('request',request=>{if(new URL(request.url()).pathname==='/assets/cobalt.glb')loadedModelUrl=request.url();});
const check=(name,passed,detail)=>{checks.push({name,passed,...(detail?{detail}:{})});assert(passed,`${name}: ${JSON.stringify(detail)}`);};
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  if(phase==='before')await page.route('**/assets/cobalt.glb*',route=>route.fulfill({path:`${directory}/before.glb`,contentType:'model/gltf-binary'}));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');
  await page.evaluate(()=>{window.__avtodrom.scene.cameraMode='cockpit';});
  await page.waitForTimeout(700);
  await page.screenshot({path:`${directory}/${phase}-normal-cockpit.png`});
  captures.push(`${directory}/${phase}-normal-cockpit.png`);
  if(phase==='after'){
    const framing=await page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
      const bounds=new T.Box3().setFromObject(s.car.getObjectByName('COBALT_CabinMirrorHousing')),points=[];
      for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new T.Vector3(x,y,z).project(s.camera));
      return {left:Math.min(...points.map(p=>p.x)),right:Math.max(...points.map(p=>p.x)),top:Math.max(...points.map(p=>p.y)),bottom:Math.min(...points.map(p=>p.y))};
    });
    check('The complete cabin mirror fits inside the normal driver view',framing.left> -1&&framing.right<1&&framing.top<.84&&framing.bottom> -1,framing);
    check('The cabin mirror sits in the upper part of the windscreen like the cabin photograph',framing.top>.5&&(framing.top+framing.bottom)/2>.35,framing);
    const expectedVersion=createHash('sha256').update(await readFile('public/assets/cobalt.glb')).digest('hex').slice(0,16);
    check('Model URL changes with the asset contents instead of reusing stale mirror geometry',new URL(loadedModelUrl).searchParams.get('v')===expectedVersion,{loadedModelUrl});
    const physical=await page.evaluate(()=>{
      const s=window.__avtodrom.scene;
      return {sides:[0,1].map(i=>({live:s.sideMirrors[i]?.material.map===s.sideTargets[i].texture,vertices:s.sideMirrors[i]?.geometry.getAttribute('position').count})),overlay:!!s.mirrorScene};
    });
    check('Both existing side mirror inserts display live feeds',physical.sides.every(p=>p.live&&p.vertices>30),physical);
    check('No separate mirror overlay scene remains',!physical.overlay,physical);
    await page.evaluate(()=>{
      const s=window.__avtodrom.scene,renderer=s.renderer,render=renderer.render;
      renderer.render=function(scene,camera){
        if(this.getRenderTarget()===s.mirrorTarget){
          window.rearCameraPass={carVisible:s.car.visible,position:s.car.worldToLocal(camera.position.clone()).toArray(),fov:camera.fov};
          renderer.render=render;
        }
        return render.call(this,scene,camera);
      };
    });
    await page.waitForFunction(()=>window.rearCameraPass);
    const rearPass=await page.evaluate(()=>window.rearCameraPass);
    check('Centre mirror uses a wide rear exterior camera with no cabin obstruction',!rearPass.carVisible&&rearPass.position[2]<-2.24&&rearPass.fov>=40,rearPass);
  }
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    s.cameraMode='cockpit';
    window.mirrorPose={eye:[.31,.48,.2],target:[.31,.455,1.2],fov:70};
    s.render=(...args)=>{
      const p=window.mirrorPose;
      // Keep the game's visibility culling aligned with each inspection view.
      args[4]=Math.atan2(p.target[0]-p.eye[0],p.target[2]-p.eye[2])/.85;
      render(...args);
      s.camera.clearViewOffset();s.camera.near=.025;s.camera.fov=p.fov;s.camera.updateProjectionMatrix();
      s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.up.set(0,1,0).applyQuaternion(s.car.quaternion);
      s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));
      s.renderer.setRenderTarget(null);s.renderer.setScissorTest(false);s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);
    };
  });
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  const capture=async(name,pose,viewport={width:1440,height:960})=>{
    await page.setViewportSize(viewport);await page.evaluate(p=>window.mirrorPose=p,pose);await page.waitForTimeout(500);
    const path=`${directory}/${phase}-${name}.png`;await page.screenshot({path});captures.push(path);
  };
  await capture('driver',{eye:[.31,.48,.2],target:[.31,.455,1.2],fov:70});
  const mirrorCenter=await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;return s.car.worldToLocal(new T.Box3().setFromObject(s.car.getObjectByName('COBALT_CabinMirrorGlass')).getCenter(new T.Vector3())).toArray();});
  const mirrorFront={eye:[mirrorCenter[0]+.02,mirrorCenter[1]-.02,mirrorCenter[2]-.34],target:mirrorCenter,fov:34};
  await capture('mirror-front',mirrorFront,{width:1200,height:700});
  await capture('mirror-oblique',{eye:[mirrorCenter[0]+.22,mirrorCenter[1]+.04,mirrorCenter[2]-.28],target:mirrorCenter,fov:44},{width:1200,height:700});
  await capture('driver-wide',{eye:[.31,.48,.2],target:[.31,.455,1.2],fov:70},{width:1920,height:1080});
  await capture('photo-front',{eye:[0,.68,-.30],target:[0,.28,1.0],fov:70});
  for(const [side,name]of [[1,'left'],[-1,'right']])await capture(`side-${name}`,{eye:[side*.55,.46,.23],target:[side*.87,.39,.66],fov:38},{width:1200,height:700});
  for(const [side,name]of [[1,'left'],[-1,'right']])await capture(`driver-side-${name}`,{eye:[.31,.48,.2],target:[side*.87,.39,.66],fov:38},{width:1200,height:800});
  for(const [side,name]of [[1,'left'],[-1,'right']])for(const [yaw,pitch]of [[8,-6],[-8,6]]){
    await page.evaluate(({name,yaw,pitch})=>window.__avtodrom.scene.setMirrorAdjustments({left:{yaw:0,pitch:0},right:{yaw:0,pitch:0},[name]:{yaw,pitch}}),{name,yaw,pitch});
    await page.waitForFunction(({side,yaw,pitch})=>{const pivot=window.__avtodrom.scene.sideMirrorPivots[side===1?0:1];return Math.abs(pivot.rotation.y-yaw*Math.PI/180)<1e-6&&Math.abs(pivot.rotation.x-pitch*Math.PI/180)<1e-6;},{side,yaw,pitch});
    await capture(`driver-side-${name}-${yaw}-${pitch}`,{eye:[.31,.48,.2],target:[side*.87,.39,.66],fov:38},{width:1200,height:800});
  }
  await page.evaluate(()=>window.__avtodrom.scene.setMirrorAdjustments({left:{yaw:0,pitch:0},right:{yaw:0,pitch:0}}));
  await page.waitForFunction(()=>window.__avtodrom.scene.sideMirrorPivots.every(pivot=>Math.abs(pivot.rotation.x)<1e-6&&Math.abs(pivot.rotation.y)<1e-6));
  if(phase==='after'){
    for(const [side,name]of [[1,'left'],[-1,'right']]){
      await page.evaluate(async side=>{
        const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
        const marker=new T.Mesh(new T.BoxGeometry(.45,.45,.03),new T.MeshBasicMaterial({color:0xff00ff}));
        marker.position.copy(s.car.localToWorld(new T.Vector3(side*1.59,.39,-2.34)));marker.quaternion.copy(s.car.quaternion);s.scene.add(marker);window.sideWitness=marker;
      },side);
      await capture(`side-${name}-witness`,{eye:[side*.55,.46,.23],target:[side*.87,.39,.66],fov:38},{width:1200,height:700});
      const pixels=await sharp(`${directory}/${phase}-side-${name}-witness.png`).removeAlpha().raw().toBuffer({resolveWithObject:true});let count=0;
      for(let i=0;i<pixels.data.length;i+=pixels.info.channels){const [r,g,b]=pixels.data.subarray(i,i+3);if(r>50&&b>50&&r>g*2&&b>g*2)count++;}
      check(`Rear witness appears on the physical ${name} mirror`,count>100,{magentaPixels:count});
      await page.evaluate(()=>{window.__avtodrom.scene.scene.remove(window.sideWitness);window.sideWitness.geometry.dispose();window.sideWitness.material.dispose();});
    }
    const state=await page.evaluate(()=>{
      const s=window.__avtodrom.scene,glass=s.car.getObjectByName('COBALT_CabinMirrorGlass');
      return {glass:!!glass,live:glass?.material?.map===s.mirrorTarget.texture,unlit:glass?.material?.isMeshBasicMaterial,
        arm:!!s.car.getObjectByName('COBALT_CabinMirrorArm'),tab:!!s.car.getObjectByName('COBALT_CabinMirrorDayNight'),
        autoShadow:s.renderer.shadowMap.autoUpdate,target:s.renderer.getRenderTarget()===null,carVisible:s.car.visible};
    });
    check('Photo-fitted mirror, mount and lower tab load',state.glass&&state.arm&&state.tab,state);
    check('The physical glass displays the rear render target without an environment highlight',state.live&&state.unlit,state);
    check('Mirror passes restore renderer, shadows and car visibility',state.autoShadow&&state.target&&state.carVisible,state);
    check('No duplicate centre mirror label remains',await page.locator('#mirror-label').count()===0);
    const fit=await page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,panes=[],parts=[];
      s.car.traverse(object=>{if(!object.isMesh)return;const materials=Array.isArray(object.material)?object.material:[object.material];if(materials.some(m=>m.name==='COBALT_Windshield'))panes.push(object);if(/^COBALT_CabinMirror/.test(object.name))parts.push(object);});
      const forward=new T.Vector3(0,0,1).transformDirection(s.car.matrixWorld);let closest=Infinity,count=0;
      for(const mesh of parts){const p=mesh.geometry.getAttribute('position');for(let i=0;i<p.count;i++){
        const point=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld),local=s.car.worldToLocal(point.clone());
        const origin=s.car.localToWorld(new T.Vector3(local.x,local.y,.2)),hit=new T.Raycaster(origin,forward).intersectObjects(panes)[0];
        if(hit){closest=Math.min(closest,hit.point.clone().sub(point).dot(forward));count++;}
      }}return {count,closest};
    });
    check('Mirror housing and mounting arm stay inside the windscreen',fit.count>100&&fit.closest>=-.001,fit);
    await page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
      window.mirrorMarkers=[];
      for(const [x,color]of [[.30,0x00ff00],[-.30,0xff00ff]]){
        const mesh=new T.Mesh(new T.BoxGeometry(.16,.16,.02),new T.MeshBasicMaterial({color}));
        mesh.position.copy(s.car.localToWorld(new T.Vector3(x,.52,-3.0)));mesh.quaternion.copy(s.car.quaternion);s.scene.add(mesh);window.mirrorMarkers.push(mesh);
      }
    });
    await page.waitForTimeout(800);
    const pixels=await page.evaluate(()=>{
      const s=window.__avtodrom.scene,target=s.mirrorTarget,data=new Uint8Array(target.width*target.height*4);
      s.renderer.readRenderTargetPixels(target,0,0,target.width,target.height,data);
      const green=[],magenta=[];
      for(let y=0;y<target.height;y++)for(let x=0;x<target.width;x++){
        const i=(y*target.width+x)*4,r=data[i],g=data[i+1],b=data[i+2];
        if(g>35&&g>r*2&&g>b*2)green.push(x);
        if(r>35&&b>35&&r>g*2&&b>g*2)magenta.push(x);
      }
      return {green:green.length,magenta:magenta.length,greenX:green.reduce((a,b)=>a+b,0)/green.length,magentaX:magenta.reduce((a,b)=>a+b,0)/magenta.length};
    });
    check('Both rear markers appear in the rear recorder camera texture',pixels.green>5&&pixels.magenta>5,pixels);
    await capture('reflection-witness',mirrorFront,{width:1200,height:700});
    const rect=await page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,box=new T.Box3().setFromObject(s.car.getObjectByName('COBALT_CabinMirrorGlass')),points=[];
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new T.Vector3(x,y,z).project(s.camera));
      return {left:Math.max(0,Math.floor(Math.min(...points.map(p=>(p.x+1)*innerWidth/2)))),right:Math.min(innerWidth,Math.ceil(Math.max(...points.map(p=>(p.x+1)*innerWidth/2)))),top:Math.max(0,Math.floor(Math.min(...points.map(p=>(1-p.y)*innerHeight/2)))),bottom:Math.min(innerHeight,Math.ceil(Math.max(...points.map(p=>(1-p.y)*innerHeight/2))))};
    });
    const screenshot=await sharp(`${directory}/${phase}-reflection-witness.png`).removeAlpha().raw().toBuffer({resolveWithObject:true});let magentaPixels=0;
    for(let y=rect.top;y<rect.bottom;y++)for(let x=rect.left;x<rect.right;x++){
      const i=(y*screenshot.info.width+x)*screenshot.info.channels,r=screenshot.data[i],g=screenshot.data[i+1],b=screenshot.data[i+2];
      if(r>35&&b>35&&r>g*1.8&&b>g*1.8)magentaPixels++;
    }
    check('The rear witness is visible on the physical glass in the final rendered image',magentaPixels>5,{magentaPixels,rect});
    await page.evaluate(()=>{const s=window.__avtodrom.scene;for(const mesh of window.mirrorMarkers){s.scene.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();}});
  }
  check('No browser errors',errors.length===0,errors);
  const report={phase,date:new Date().toISOString(),checks,errors,captures};await writeFile(`${directory}/${phase}-report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
