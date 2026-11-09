import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/pedestrian-signals';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');await page.keyboard.press('Escape');
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{roadDistance,intersectionCrossings}=await import('/src/render/course-world.ts'),s=window.__avtodrom.scene;
    s.world.group.updateMatrixWorld(true);
    const isOvalFrame=(group,minAspect)=>{
      const board=group.children.find(o=>o.isMesh&&o.material?.color?.getHex()===0xe4e4d9);
      if(!board)return false;
      board.geometry.computeBoundingBox();const b=board.geometry.boundingBox,size=b.getSize(new T.Vector3());
      const hit=(x,y)=>{
        const eye=board.localToWorld(new T.Vector3(x,y,b.max.z+1)),direction=new T.Vector3(0,0,-1).transformDirection(board.matrixWorld);
        return new T.Raycaster(eye,direction,0,2).intersectObject(board).length>0;
      };
      return size.y/size.x>minAspect&&hit((b.min.x+b.max.x)/2,b.max.y-size.x*.08)&&!hit(b.max.x-size.x*.08,b.max.y-size.x*.08);
    };
    const heads=s.world.pedestrianLights.map(light=>{
      const g=light.group,p=g.getWorldPosition(new T.Vector3()),crossing=intersectionCrossings.find(c=>c.id===g.userData.crossingId),right={x:-crossing.normal.z,z:crossing.normal.x};
      const eye=new T.Vector3(crossing.center.x-g.userData.side*right.x*(crossing.width/2+.5),1.65,crossing.center.z-g.userData.side*right.z*(crossing.width/2+.5));
      const face=g.getObjectByName('pedestrian-red-figure'),target=face.getWorldPosition(new T.Vector3()),direction=target.clone().sub(eye);
      const hit=new T.Raycaster(eye,direction.clone().normalize(),0,direction.length()+.1).intersectObject(s.world.group,true)[0];
      const normal=new T.Vector3(0,0,1).transformDirection(face.matrixWorld);
      const bounds=new T.Box3().setFromObject(g,true);
      const crossingSign=s.world.group.children.find(o=>o.userData.kind==='pedestrian'&&Math.hypot(o.position.x-p.x,o.position.z-p.z)<1);
      const signBounds=crossingSign?new T.Box3().setFromObject(crossingSign,true):null;
      const whiteFrame=g.children.some(o=>o.isMesh&&o.material?.color?.getHex()===0xe4e4d9);
      return {id:g.name,crossing:g.userData.crossingId,station:g.parent.name,shared:g.userData.sharedPost,whiteFrame,ovalFrame:isOvalFrame(g,2),point:p.toArray(),lowerEdge:bounds.min.y,upperEdge:bounds.max.y,overlapsSign:signBounds?bounds.intersectsBox(signBounds):null,clearance:roadDistance(p),diameter:g.userData.lensDiameter,facing:normal.dot(eye.clone().sub(target).normalize()),visible:hit?.object===face,firstHit:hit?.object.name};
    });
    const assemblies=s.world.signalAssemblies.map(a=>{
      const front=new T.Vector3(0,0,1).transformDirection(a.front.group.matrixWorld),rear=new T.Vector3(0,0,1).transformDirection(a.rear.group.matrixWorld);
      const side=a.pedestrians.filter(h=>h.group.userData.mountRole==='side');
      const vehicleBounds=new T.Box3().setFromObject(a.front.group,true);
      const sideBounds=side[0]?new T.Box3().setFromObject(side[0].group,true):null;
      const crossingSign=s.world.group.children.find(o=>o.userData.kind==='pedestrian'&&Math.hypot(o.position.x-a.group.position.x,o.position.z-a.group.position.z)<.01);
      const crossingSignBounds=crossingSign?new T.Box3().setFromObject(crossingSign,true):null;
      const priority=s.world.group.getObjectByName(a.group.name.replace('signal-assembly-','signal-')+'-priority');
      const signsClear=crossingSignBounds&&priority?!crossingSignBounds.intersectsBox(new T.Box3().setFromObject(priority,true)):false;
      const vehicleHeads=[a.front,a.rear],pedestrianBounds=a.pedestrians.map(h=>new T.Box3().setFromObject(h.group,true));
      const overlapsVehicle=pedestrianBounds.some(b=>vehicleHeads.some(h=>b.intersectsBox(new T.Box3().setFromObject(h.group,true))));
      // Vehicle oval panels extend below the compact pedestrian panels.
      const compactPedestrians=pedestrianBounds.every(b=>b.min.y>=vehicleBounds.min.y&&b.min.y-vehicleBounds.min.y<.15)&&a.pedestrians.every(h=>Math.hypot(h.group.position.x,h.group.position.z)<.55);
      const vehicleWhiteFrames=vehicleHeads.every(h=>h.group.children.some(o=>o.isMesh&&o.material?.color?.getHex()===0xe4e4d9));
      const ovalVehicleFrames=vehicleHeads.every(h=>isOvalFrame(h.group,3));
      const clearVehicleLenses=vehicleHeads.every(h=>['red','amber','green'].every(color=>{
        const lens=h.group.getObjectByName(`signal-${color}-lens`),target=lens.getWorldPosition(new T.Vector3());
        const normal=new T.Vector3(0,0,1).transformDirection(h.group.matrixWorld),eye=target.clone().addScaledVector(normal,8);eye.y=1.2;
        const direction=target.clone().sub(eye),hit=new T.Raycaster(eye,direction.clone().normalize(),0,direction.length()+.2).intersectObject(a.group,true)[0];
        for(let object=hit?.object;object;object=object.parent)if(object===h.group)return true;
        return false;
      }));
      return {id:a.group.name,pedestrians:a.pedestrians.length,sideHeads:side.length,vehicleWhiteFrames,ovalVehicleFrames,vehicleLowerEdge:vehicleBounds.min.y,sideLowerEdge:sideBounds?.min.y,sideAlignment:sideBounds?Math.abs(sideBounds.min.y-vehicleBounds.min.y):Infinity,compactPedestrians,signsClear,signBelow:crossingSignBounds?crossingSignBounds.max.y<vehicleBounds.min.y:false,overlapsVehicle,clearVehicleLenses,opposed:front.dot(rear),shared:a.front.group.parent===a.group&&a.rear.group.parent===a.group&&a.pedestrians.every(h=>h.group.parent===a.group),posts:a.group.children.filter(c=>c.name==='shared-signal-post').length};
    });
    const draw=s.render.bind(s);window.pedestrianReviewTime=0;window.pedestrianReviewPose={eye:[13,13,15],target:[0,1,-3],fov:58};
    s.render=(...args)=>{window.__avtodrom.vehicle.time=window.pedestrianReviewTime;draw(...args);s.car.visible=s.guide.visible=s.goal.visible=false;const p=window.pedestrianReviewPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
    return {heads,assemblies};
  });
  assert.equal(geometry.heads.length,8);assert(geometry.heads.every(h=>h.shared&&h.whiteFrame&&h.ovalFrame&&h.lowerEdge>=2&&h.lowerEdge<=2.5&&h.overlapsSign===false&&h.clearance>=.45&&h.diameter===.2&&h.facing>.85&&h.visible),JSON.stringify(geometry));
  assert.equal(geometry.assemblies.length,4);assert(geometry.assemblies.every(a=>a.shared&&a.vehicleWhiteFrames&&a.ovalVehicleFrames&&a.posts===1&&a.pedestrians===2&&a.sideHeads===1&&a.vehicleLowerEdge>=2&&a.vehicleLowerEdge<=3&&a.sideAlignment<.15&&a.compactPedestrians&&a.signBelow&&a.signsClear&&!a.overlapsVehicle&&a.clearVehicleLenses&&a.opposed<-.999),JSON.stringify(geometry.assemblies));
  for(const crossing of new Set(geometry.heads.map(h=>h.crossing)))assert.equal(geometry.heads.filter(h=>h.crossing===crossing).length,2);
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  const phases=[];
  for(const time of [0,20,56,65,68,70,78.1,78.6,82,84.5,85]){
    const state=await page.evaluate(async time=>{
      const {pedestrianSignalAspects}=await import('/src/data/traffic-signals.ts'),w=window.__avtodrom.scene.world;window.pedestrianReviewTime=time;w.update(time);
      return {time,expected:pedestrianSignalAspects(time),cars:[...w.trafficLights,...w.rearTrafficLights].map(h=>({axis:h.axis,face:h.group.userData.face,phase:h.group.userData.phase,permitted:h.group.userData.permitted,red:h.group.getObjectByName('signal-red-lens').material.emissiveIntensity>0,amber:h.group.getObjectByName('signal-amber-lens').material.emissiveIntensity>0,green:h.group.getObjectByName('signal-green-lens').material.emissiveIntensity>0})),pedestrians:w.pedestrianLights.map(h=>({phase:h.group.userData.phase,permitted:h.group.userData.permitted,red:h.group.getObjectByName('pedestrian-red-figure').material.color.getHex()===0xff2416,green:h.group.getObjectByName('pedestrian-green-figure').material.color.getHex()===0x13ff69}))};
    },time);
    for(const head of state.pedestrians){assert.equal(head.red,state.expected.red);assert.equal(head.green,state.expected.green);assert.equal(head.permitted,state.expected.permitted);}
    assert.equal(state.cars.length,8);
    for(let i=0;i<4;i++){const front=state.cars[i],rear=state.cars[i+4];for(const field of ['axis','phase','permitted','red','amber','green'])assert.equal(front[field],rear[field],`${time}: front/rear ${field}`);}
    if(state.expected.permitted)assert(state.cars.every(c=>c.red&&!c.amber&&!c.green&&!c.permitted));phases.push(state);
  }
  for(const [name,eye]of [['assembly-front',[-1.6,3.05,4.6]],['assembly-rear',[-1.6,3.05,-4.6]],['assembly-side',[-4.6,3.05,.8]]]){
    await page.evaluate(async eye=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__avtodrom.scene.world.signalAssemblies[0].group;window.pedestrianReviewTime=20;window.pedestrianReviewPose={eye:g.localToWorld(new T.Vector3(...eye)).toArray(),target:g.localToWorld(new T.Vector3(0,2.65,0)).toArray(),fov:44};},eye);
    await page.waitForTimeout(350);await page.screenshot({path:`${directory}/${name}.png`});
  }
  for(const [name,time]of [['red',20],['green',70],['green-blink-off',78.6]]){
    await page.evaluate(async time=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__avtodrom.scene.world.pedestrianLights.find(h=>h.group.userData.crossingId==='south').group,center=g.localToWorld(new T.Vector3(0,2.62,.17)),eye=g.localToWorld(new T.Vector3(.7,2.7,2.6));window.pedestrianReviewTime=time;window.pedestrianReviewPose={eye:eye.toArray(),target:center.toArray(),fov:32};},time);
    await page.waitForTimeout(350);await page.screenshot({path:`${directory}/${name}-closeup.png`});
  }
  await page.evaluate(()=>{window.pedestrianReviewTime=70;window.pedestrianReviewPose={eye:[13,13,15],target:[0,1,-3],fov:58};});await page.waitForTimeout(350);await page.screenshot({path:`${directory}/junction.png`});
  await page.setViewportSize({width:390,height:844});await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),g=window.__avtodrom.scene.world.pedestrianLights[0].group;window.pedestrianReviewPose={eye:g.localToWorld(new T.Vector3(.3,2.6,2.8)).toArray(),target:g.localToWorld(new T.Vector3(0,2.6,.17)).toArray(),fov:42};});await page.waitForTimeout(350);await page.screenshot({path:`${directory}/mobile.png`});
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({geometry,phases,errors},null,2));console.log(JSON.stringify({assemblies:geometry.assemblies.length,vehicleHeads:8,pedestrianHeads:geometry.heads.length,visible:geometry.heads.filter(h=>h.visible).length,phases:phases.length,errors}));
}finally{await browser.close();}
