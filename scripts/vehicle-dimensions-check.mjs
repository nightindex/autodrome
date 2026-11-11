import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/vehicle-dimensions';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));let report;
const check=(name,value)=>{checks.push({name,passed:!!value});assert(value,name);};
try{
  await page.goto(process.env.AVTODROM_URL??'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  report=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{vehicleConfig:c,wheelCenter}=await import('/src/data/vehicle.ts');
    const source=await fetch('/src/simulation/vehicle.ts').then(r=>r.text()),R=(await import(source.match(/import RAPIER from ["']([^"']+)["']/)[1])).default;
    const a=window.__avtodrom,s=a.scene,v=a.vehicle;a.start('practice');a.pause();v.reset({x:-20,z:40.5},0);
    v.world.propagateModifiedBodyPositionsToColliders();
    s.render(v,1/60,v.time,false,0);s.car.updateMatrixWorld(true);
    const resetWheels=s.wheels.map(w=>({index:w.index,
      hubError:w.pivot.getWorldPosition(new T.Vector3()).distanceTo(new T.Vector3().copy(v.body.collider(w.index+1).translation())),
      steering:w.pivot.rotation.y,roll:w.spin.rotation.x}));
    for(let i=0;i<180;i++)v.update(1/60,{down:()=>false},true);
    s.cameraMode='cockpit';s.guide.visible=s.goal.visible=false;s.render(v,1/60,v.time,false,0);s.car.updateMatrixWorld(true);
    const inverse=s.car.matrixWorld.clone().invert(),paint=new T.Box3(),shell=new T.Box3(),point=new T.Vector3();
    const vertices=(node,matrix,visit,paintOnly=false)=>{
      const p=node.geometry.attributes.position,index=node.geometry.index,materials=Array.isArray(node.material)?node.material:[node.material];
      const groups=node.geometry.groups.length?node.geometry.groups:[{start:0,count:index?.count??p.count,materialIndex:0}];
      for(const group of groups){if(paintOnly&&materials[group.materialIndex??0]?.name!=='Realistic_Car_Paint')continue;
        for(let j=group.start;j<group.start+group.count;j++)visit(point.fromBufferAttribute(p,index?index.getX(j):j).applyMatrix4(matrix));}
    };
    s.car.traverse(node=>{if(!node.isMesh)return;const matrix=inverse.clone().multiply(node.matrixWorld);
      vertices(node,matrix,p=>{paint.expandByPoint(p);if(!/^COBALT_SideMirror/.test(node.name))shell.expandByPoint(p);},true);
    });
    const frame=box=>({min:box.min.toArray(),max:box.max.toArray(),size:box.getSize(new T.Vector3()).toArray()});
    const cushions=['COBALT_SeatBase_-1','COBALT_SeatBase_1','COBALT_RearSeatBase'].map(name=>{
      const mesh=s.car.getObjectByName(name);if(!mesh)throw new Error(`Missing cushion: ${name}`);
      const box=new T.Box3();vertices(mesh,inverse.clone().multiply(mesh.matrixWorld),p=>box.expandByPoint(p));
      return {name,depth:box.max.z-box.min.z,target:name==='COBALT_RearSeatBase'?.490:.520,bounds:frame(box)};
    });
    // Inspect the actual outer paint at each wheel opening rather than using
    // the overall body width (which says little about local fender clearance).
    const paintMeshes=[];s.car.traverse(n=>{if(n.isMesh&&(Array.isArray(n.material)?n.material:[n.material]).some(m=>m.name==='Realistic_Car_Paint'))paintMeshes.push(n);});
    const telemetry=v.telemetry(),wheels=s.wheels.map(w=>{
      const bounds=new T.Box3(),rimBounds=new T.Box3(),tyreBounds=new T.Box3();w.pivot.traverse(n=>{
        if(!n.isMesh)return;const box=new T.Box3();vertices(n,inverse.clone().multiply(n.matrixWorld),p=>box.expandByPoint(p));bounds.union(box);
        const materials=Array.isArray(n.material)?n.material:[n.material],size=box.getSize(new T.Vector3());
        if(materials.some(m=>m.name==='COBALT_SatinTrim'))rimBounds.union(box);
        if(materials.some(m=>m.name==='bump_front_ok.014')&&Math.max(size.y,size.z)>.6)tyreBounds.union(box);
      });
      const hub=w.pivot.getWorldPosition(new T.Vector3()),connection=v.controller.wheelChassisConnectionPointCs(w.index),length=v.controller.wheelSuspensionLength(w.index);
      const physics=new T.Vector3(connection.x,connection.y-length,connection.z).applyQuaternion(new T.Quaternion().copy(v.body.rotation())).add(v.body.translation());
      const expected=wheelCenter(w.index),mark=telemetry.wheels[w.index],ground=v.controller.wheelIsInContact(w.index);
      const side=Math.sign(expected.x),localHub=hub.clone().applyMatrix4(inverse),outward=new T.Vector3(side,0,0).transformDirection(s.car.matrixWorld);
      const sideRay=(radius,angle,objects)=>{
        const origin=s.car.localToWorld(new T.Vector3(side*1.3,localHub.y+radius*Math.sin(angle),localHub.z+radius*Math.cos(angle)));
        return new T.Raycaster(origin,outward.clone().negate(),0,.7).intersectObjects(objects,true).find(hit=>{
          const m=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;
          return objects===paintMeshes?m.name==='Realistic_Car_Paint':true;
        });
      };
      const arch=[];
      for(const degrees of [45,60,75,90,105,120,135]){
        const angle=degrees*Math.PI/180;let hit;
        for(let radius=c.wheelRadius;radius<=.55;radius+=.001){hit=sideRay(radius,angle,paintMeshes);if(hit){arch.push({degrees,radius,gap:radius-c.wheelRadius,x:hit.point.clone().applyMatrix4(inverse).x});break;}}
      }
      // The first visible surface must really be the rim, not rubber in front
      // of a larger hidden metal barrel that merely passes a bounds check.
      const visibleRim=[];
      for(let degrees=0;degrees<360;degrees+=10){let radius=0;const angle=degrees*Math.PI/180;
        for(let r=.17;r<=.215;r+=.001){const hit=sideRay(r,angle,[w.pivot]);if(hit){const m=Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material;if(m.name==='COBALT_SatinTrim')radius=r;}}
        visibleRim.push(radius);
      }
      const rimSurfaces=[.189,.192,.195,.2,.203,.205].map(radius=>{
        const origin=s.car.localToWorld(new T.Vector3(side*1.3,localHub.y,localHub.z+radius));
        return {radius,hits:new T.Raycaster(origin,outward.clone().negate(),0,.7).intersectObject(w.pivot,true).map(hit=>({x:hit.point.clone().applyMatrix4(inverse).x,name:hit.object.name,material:(Array.isArray(hit.object.material)?hit.object.material[hit.face?.materialIndex??0]:hit.object.material).name}))};
      });
      const node=w.spin.children[0].children[0],toNode=node.matrixWorld.clone().invert(),local=new T.Box3();
      node.traverse(n=>{if(n.isMesh)vertices(n,toNode.clone().multiply(n.matrixWorld),p=>local.expandByPoint(p));});
      const center=local.getCenter(new T.Vector3()),callipers=w.pivot.children.filter(n=>n.isMesh),fixed=callipers.map(n=>n.getWorldPosition(new T.Vector3()));
      let hubDrift=0,calliperDrift=0,groundDrift=0;
      for(const steer of w.front?[0,.4,-.4]:[0])for(const roll of [0,Math.PI/2,Math.PI,2*Math.PI]){
        w.pivot.rotation.y=steer;w.spin.rotation.x=roll;s.car.updateMatrixWorld(true);
        hubDrift=Math.max(hubDrift,node.localToWorld(center.clone()).distanceTo(hub));
        const before=callipers.map(n=>n.getWorldPosition(new T.Vector3()));w.spin.rotation.x+=.17;s.car.updateMatrixWorld(true);
        callipers.forEach((n,i)=>calliperDrift=Math.max(calliperDrift,n.getWorldPosition(new T.Vector3()).distanceTo(before[i])));
        const b=new T.Box3();w.pivot.traverse(n=>{if(n.isMesh)vertices(n,n.matrixWorld,p=>b.expandByPoint(p));});groundDrift=Math.max(groundDrift,Math.abs(b.min.y));
      }
      w.pivot.rotation.y=0;w.spin.rotation.x=0;s.car.updateMatrixWorld(true);
      return {index:w.index,expected,hub:hub.toArray(),physics:physics.toArray(),contact:ground,bounds:frame(bounds),radius:w.radius,
        rimBounds:frame(rimBounds),tyreBounds:frame(tyreBounds),
        fit:{arch,visibleRimRadius:{min:Math.min(...visibleRim),max:Math.max(...visibleRim)},rimSurfaces,bodyInset:(c.width-(w.index<2?c.frontTrack:c.rearTrack)-c.tyreWidth)/2},
        hubError:hub.distanceTo(physics),telemetryError:Math.hypot(hub.x-mark.x,hub.z-mark.z),hubDrift,calliperDrift,groundDrift,callipers:fixed.length};
    }).sort((a,b)=>a.index-b.index);
    const axleCenter=indices=>indices.reduce((out,i)=>out.add(new T.Vector3(...wheels[i].hub)),new T.Vector3()).divideScalar(indices.length);
    const distance=(a,b)=>new T.Vector3(...wheels[a].hub).distanceTo(new T.Vector3(...wheels[b].hub));
    const floorRay=new R.Ray({x:v.body.translation().x,y:-.5,z:v.body.translation().z},{x:0,y:1,z:0}),floorHit=v.collider.castRay(floorRay,3,true);
    const undertray=new T.Box3().setFromObject(s.car.getObjectByName('COBALT_Undertray'),true);
    const eye=s.car.localToWorld(s.cockpitEye),forward=s.camera.getWorldDirection(new T.Vector3());
    const rays=new T.Raycaster(eye,forward).intersectObject(s.car,true),first=rays[0];
    const firstMaterial=first?(Array.isArray(first.object.material)?first.object.material[first.face?.materialIndex??0]:first.object.material).name:null;
    const roofPoint=s.car.localToWorld(new T.Vector3(0,shell.max.y,0));
    return {config:c,body:{length:paint.getSize(new T.Vector3()).z,width:shell.getSize(new T.Vector3()).x,roofHeight:roofPoint.y,paint:frame(paint),shell:frame(shell)},
      axles:{frontTrack:distance(0,1),rearTrack:distance(2,3),wheelbase:axleCenter([0,1]).distanceTo(axleCenter([2,3]))},wheels,resetWheels,cushions,
      clearance:{physical:floorHit<0?null:floorHit-.5,visible:undertray.min.y},
      cockpit:{eye:eye.toArray(),localEye:s.cockpitEye.toArray(),cameraError:s.camera.position.distanceTo(eye),firstMaterial,firstDistance:first?.distance??null,roofAboveEye:roofPoint.y-eye.y}};
  });
  const close=(value,target,tolerance=.002)=>Number.isFinite(value)&&Math.abs(value-target)<tolerance;
  check('Drawn body length 4479 mm',close(report.body.length,4.479));check('Body width excludes mirrors and equals 1735 mm',close(report.body.width,1.735));
  check('Roof height excludes antenna and equals 1514 mm',close(report.body.roofHeight,1.514));
  for(const [key,value]of Object.entries({frontTrack:1.504,rearTrack:1.509,wheelbase:2.620}))check(`${key} matches supplied diagram`,close(report.axles[key],value));
  check('Visible and physical floor clearance 160 mm',close(report.clearance.physical,.160,.005)&&close(report.clearance.visible,.160,.005));
  for(const seat of report.cushions)check(`${seat.name}: ${seat.target*1000} mm cushion depth from the supplied diagram`,close(seat.depth,seat.target,.001));
  check('Reset immediately matches all physical hubs without stale steering or spin',report.resetWheels.every(w=>w.hubError<.001&&w.steering===0&&w.roll===0));
  for(const w of report.wheels){
    check(`Wheel ${w.index}: 634.5 mm diameter and 195 mm width`,close(w.bounds.size[1],.6345,.001)&&close(w.bounds.size[0],.195,.001));
    // R15 is the 381 mm bead seat. The visible outer flange is modelled
    // 12.7 mm taller on each radius; it must not retain the source's oversized rim.
    check(`Wheel ${w.index}: R15 rim and correct rubber width`,close(Math.max(w.rimBounds.size[1],w.rimBounds.size[2]),.4064,.002)&&close(w.tyreBounds.size[0],.195,.001));
    // The simplified circular lip consists of chords; allow their ~2 mm
    // sagitta and the 1 mm ray sampling step, rather than testing a perfect disk.
    check(`Wheel ${w.index}: rubber leaves the outer rim flange visible from every sampled angle`,w.fit.visibleRimRadius.min>.1995&&w.fit.visibleRimRadius.max<.204);
    check(`Wheel ${w.index}: paint clears the upper tyre and covers its outer sidewall`,w.fit.arch.length===7&&w.fit.arch.every(p=>p.gap>.015&&p.gap<.065&&Math.abs(p.x)>Math.abs(w.expected.x)+.195/2));
    check(`Wheel ${w.index}: visual and physical hubs match`,w.hubError<.001&&w.telemetryError<.001&&w.contact);
    check(`Wheel ${w.index}: steering and spin preserve hub, calliper and ground contact`,w.hubDrift<1e-6&&w.calliperDrift<1e-6&&w.groundDrift<.003&&w.callipers>0);
  }
  check('Production cockpit camera uses mapped eye inside the cabin',report.cockpit.cameraError<1e-6&&report.cockpit.roofAboveEye>.2&&/Windshield/.test(report.cockpit.firstMaterial??''));
  await page.evaluate(()=>{const a=window.__avtodrom;a.scene.render(a.vehicle,1/60,a.vehicle.time,false,0);});
  await page.screenshot({path:`${directory}/cockpit.png`});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
    const stage=new T.Scene();stage.background=new T.Color(0xe8edeb);stage.environment=s.scene.environment;stage.environmentIntensity=.35;
    const car=s.car.clone(true);car.position.set(0,s.car.position.y,0);car.quaternion.identity();stage.add(car,new T.HemisphereLight(0xe2f1ff,0x7d857b,1));
    const sun=new T.DirectionalLight(0xfff3de,2.3);sun.position.set(-4,8,5);stage.add(sun);
    const ground=new T.Mesh(new T.PlaneGeometry(200,200),new T.MeshStandardMaterial({color:0xdce3df,roughness:1}));ground.rotation.x=-Math.PI/2;stage.add(ground);
    const label=document.createElement('div');label.id='dimension-caption';label.style.cssText='position:fixed;left:40px;bottom:30px;color:#243b34;font:18px Segoe UI;background:#f6f8f1e8;padding:15px 20px;border-radius:4px';document.body.append(label);
    const production=s.render.bind(s);window.dimensionPose={eye:[8,.8,0],span:5.6,label:'Cobalt · 4479 × 1735 × 1514 мм · база 2620 мм'};
    s.render=(...args)=>{production(...args);const p=window.dimensionPose,aspect=innerWidth/innerHeight;
      const camera=p.perspective?new T.PerspectiveCamera(40,aspect,.05,100):new T.OrthographicCamera(-p.span/2,p.span/2,p.span/aspect/2,-p.span/aspect/2,.05,100);
      camera.position.set(...p.eye);camera.lookAt(...(p.target??[0,.78,0]));camera.updateMatrixWorld();label.textContent=p.label;s.renderer.render(stage,camera);
    };
  });
  for(const [name,eye,span,label,perspective]of [
    ['side',[8,.8,0],5.6,'Длина 4479 мм · высота крыши 1514 мм · база 2620 мм',false],
    ['front',[0,.8,8],3.4,'Кузов 1735 мм · передняя колея 1504 мм',false],
    ['rear',[0,.8,-8],3.4,'Кузов 1735 мм · задняя колея 1509 мм',false],
    ['three-quarter',[5,2.8,6],5.6,'195/65 R15 · диаметр 634,5 мм · клиренс 160 мм',true],
  ]){
    await page.evaluate(p=>{window.dimensionPose=p;const a=window.__avtodrom;a.scene.render(a.vehicle,1/60,a.vehicle.time,false,0);},{eye,span,label,perspective});
    await page.screenshot({path:`${directory}/${name}.png`});
  }
  for(const [name,z]of [['front-wheel',1.31],['rear-wheel',-1.31]]){
    await page.evaluate(p=>{window.dimensionPose=p;const a=window.__avtodrom;a.scene.render(a.vehicle,1/60,a.vehicle.time,false,0);},
      {eye:[8,.31725,z],target:[0,.31725,z],span:1.8,label:'195/65 R15 · шина Ø634,5 мм · посадочный диаметр диска 381 мм · ширина шины 195 мм'});
    await page.screenshot({path:`${directory}/${name}.png`});
  }
  check('No browser errors',errors.length===0);console.log(JSON.stringify({body:report.body,axles:report.axles,clearance:report.clearance,checks},null,2));
}finally{await writeFile(`${directory}/report.json`,JSON.stringify({report,checks,errors},null,2));await browser.close();}
