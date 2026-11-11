import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';

// Compare the actual fitted player camera with explicit, temporary proposals.
// This inspection does not change the production camera or the car asset.
const directory='test-results/cockpit-view';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],captures=[],views=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.goto(process.env.AVTODROM_URL??'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.evaluate(()=>{
    const a=window.__avtodrom;a.start('practice');a.pause();a.vehicle.reset({x:-44,z:42},Math.PI/2);
    for(let i=0;i<180;i++)a.vehicle.update(1/60,{down:()=>false},true);
    a.scene.cameraMode='cockpit';a.scene.guide.visible=a.scene.goal.visible=false;
  });
  for(const viewport of [{width:1920,height:1080},{width:390,height:844}]){
    await page.setViewportSize(viewport);
    const result=await page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js'),a=window.__avtodrom,s=a.scene,v=a.vehicle;
      s.resize();s.render(v,1/60,v.time,false,0);s.car.updateWorldMatrix(true,true);
      const inverse=s.car.matrixWorld.clone().invert(),meshes=[],point=new T.Vector3();
      s.car.traverse(n=>{if(n.isMesh)meshes.push(n);});
      const bounds=name=>{
        const node=s.car.getObjectByName(name);if(!node)throw new Error(`Missing ${name}`);
        const box=new T.Box3();node.traverse(n=>{if(!n.isMesh)return;const p=n.geometry.attributes.position,index=n.geometry.index,matrix=inverse.clone().multiply(n.matrixWorld);
          for(let i=0;i<(index?.count??p.count);i++)box.expandByPoint(point.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(matrix));});
        return {name,min:box.min.toArray(),max:box.max.toArray(),center:box.getCenter(new T.Vector3()).toArray()};
      };
      const geometry={seat:bounds('COBALT_SeatBase_1'),headrest:bounds('COBALT_Headrest_1'),steering:bounds('COBALT_STEERING_ASSEMBLY'),dashboard:bounds('COBALT_MouldedDashboard'),bonnet:bounds('bonnet_dummy')};
      const hitOpaque=(origin,direction,max=20)=>new T.Raycaster(origin,direction,0,max).intersectObjects(meshes,false).find(hit=>{
        const m=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;
        return m.visible&&(!m.transparent||m.opacity>.98);
      });
      const hood=s.car.getObjectByName('bonnet_ok_primary_0_Realistic_Car_Paint_0'),targets=[];
      const up=new T.Vector3(0,1,0).applyQuaternion(s.car.quaternion);
      for(const x of [-.6,-.3,0,.3,.6])for(const z of [1.3,1.5,1.7,1.9,2.05]){
        const origin=s.car.localToWorld(new T.Vector3(x,2,z));
        const hit=new T.Raycaster(origin,up.clone().negate(),0,3).intersectObject(hood)[0];if(hit)targets.push(hit.point);
      }
      const describe=camera=>{
        camera.updateMatrixWorld();const worldEye=camera.position.clone(),eye=s.car.worldToLocal(worldEye.clone()),roof=hitOpaque(worldEye,up,2);
        const hoodRays=targets.map(target=>{
          const direction=target.clone().sub(worldEye),distance=direction.length(),hit=hitOpaque(worldEye,direction.normalize(),distance+.005);
          const projected=target.clone().project(camera);
          return {target:s.car.worldToLocal(target.clone()).toArray(),first:hit?.object.name??null,point:hit?s.car.worldToLocal(hit.point.clone()).toArray():null,
            seesBonnet:hit?.object===hood,inViewport:Math.abs(projected.x)<=1&&Math.abs(projected.y)<=1&&Math.abs(projected.z)<=1};
        });
        return {eye:eye.toArray(),heightAboveRoad:worldEye.y,verticalFov:camera.fov,horizontalFov:2*Math.atan(Math.tan(camera.fov*Math.PI/360)*camera.aspect)*180/Math.PI,
          aboveSeatCushion:eye.y-geometry.seat.max[1],aheadOfHeadrest:eye.z-geometry.headrest.max[2],steeringCenterDistance:eye.distanceTo(new T.Vector3(...geometry.steering.center)),
          roof:roof?{name:roof.object.name,clearanceAboveEye:roof.distance,point:s.car.worldToLocal(roof.point.clone()).toArray()}:null,
          hoodRays,bonnetFirstRays:hoodRays.filter(r=>r.seesBonnet).length,inViewportBonnetRays:hoodRays.filter(r=>r.seesBonnet&&r.inViewport).length};
      };
      // Capture this baseline directly from the player camera, without changing
      // its position, target, FOV or clipping plane for a reference photograph.
      const current=describe(s.camera),currentPng=s.renderer.domElement.toDataURL('image/png');
      const proposals=[{name:'seat-back',rise:.06,back:.08,fov:70},{name:'balanced',rise:.08,back:.08,fov:64},{name:'road-focused',rise:.10,back:.08,fov:60}].map(pose=>{
        const camera=s.camera.clone(),eye=s.cabinEye.clone().add(new T.Vector3(0,pose.rise,-pose.back));
        camera.position.copy(s.car.localToWorld(eye));camera.up.copy(up);
        camera.lookAt(camera.position.clone().add(new T.Vector3(0,-.025,1).applyQuaternion(s.car.quaternion)));
        camera.fov=pose.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();
        s.renderer.render(s.scene,camera);
        return {...pose,...describe(camera),png:s.renderer.domElement.toDataURL('image/png')};
      });
      return {viewport:{width:innerWidth,height:innerHeight},geometry,baseEye:s.cabinEye.toArray(),fittedEye:s.cockpitEye.toArray(),current:{...current,png:currentPng},proposals};
    });
    assert(result.current.eye.every((x,i)=>Math.abs(x-result.fittedEye[i])<1e-5),'Baseline uses the actual fitted player eye');
    assert(Math.abs(result.current.eye[0]-result.geometry.seat.center[0])<.08,'Eye is aligned with the driver seat');
    assert(Math.abs(result.current.eye[0]-result.geometry.steering.center[0])<.08,'Eye is aligned with the steering wheel');
    for(const pose of [result.current,...result.proposals]){
      assert(pose.eye.every(Number.isFinite)&&pose.roof?.clearanceAboveEye>0,'Camera remains below the model roof');
      const name=pose.name??'current',path=`${directory}/${viewport.width}-${name}.png`;
      await writeFile(path,Buffer.from(pose.png.split(',')[1],'base64'));delete pose.png;captures.push(path);
    }
    views.push(result);
  }
  assert.equal(errors.length,0,errors.join('\n'));
  const report={date:new Date().toISOString(),notes:['Eye heights are model measurements, not a validated human eyellipse.','A ray seeing the bonnet does not prove its target point itself is visible.','Proposals use independent temporary cameras; production defaults remain unchanged.'],errors,captures,views};
  await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({errors,captures,views:views.map(v=>({viewport:v.viewport,current:{eye:v.current.eye,height:v.current.heightAboveRoad,roofClearance:v.current.roof?.clearanceAboveEye,bonnetRays:v.current.bonnetFirstRays},proposals:v.proposals.map(p=>({name:p.name,height:p.heightAboveRoad,roofClearance:p.roof?.clearanceAboveEye,bonnetRays:p.bonnetFirstRays}))}))},null,2));
}finally{await browser.close();}
