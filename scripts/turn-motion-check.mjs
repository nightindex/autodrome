import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/turn-motion';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],checks=[],results=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,condition)=>{assert(condition,name);checks.push(name);};
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
    const {vehicleConfig}=await import('/src/data/vehicle.ts');
    // Isolate presentation from curb impacts: use the existing flat ground
    // outside the fenced course with a visible asphalt test pad.
    const pad=new T.Mesh(new T.PlaneGeometry(60,60),new T.MeshStandardMaterial({color:0x606b70,roughness:1}));
    pad.rotation.x=-Math.PI/2;pad.position.set(-120,.001,0);pad.receiveShadow=true;s.scene.add(pad);
    window.__avtodrom.vehicle.surfaceAt=()=> 'asphalt';
    const capture=s.capturePhysicsPose.bind(s),render=s.render.bind(s);
    const review=window.turnMotion={previous:null,active:false,rows:[]};
    s.capturePhysicsPose=v=>{
      review.previous={position:new T.Vector3().copy(v.body.translation()),rotation:new T.Quaternion().copy(v.body.rotation()),handwheel:v.steering.wheelAngle,
        wheels:[0,1,2,3].map(i=>({rotation:v.wheelRotation(i),steering:v.controller.wheelSteering(i),length:v.controller.wheelSuspensionLength(i)}))};
      capture(v);
    };
    s.render=(...args)=>{
      render(...args);
      const [v,,,,,alpha]=args,a=review.previous;if(!review.active||!a||alpha===undefined||alpha>=1)return;
      const b=v.body.translation(),q=v.body.rotation(),expectedRotation=a.rotation.clone().slerp(new T.Quaternion().copy(q),alpha);
      const expectedPosition=a.position.clone().lerp(new T.Vector3().copy(b),alpha).add(new T.Vector3(0,s.bodyLift,0).applyQuaternion(expectedRotation));
      const handwheel=T.MathUtils.lerp(a.handwheel,v.steering.wheelAngle,alpha);
      const expectedSteering=s.steeringBase.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-handwheel));
      const wheelError=Math.max(...s.wheels.flatMap(w=>[
        Math.abs(w.pivot.rotation.y-(w.front?T.MathUtils.lerp(a.wheels[w.index].steering,v.controller.wheelSteering(w.index),alpha):0)),
        Math.abs(w.spin.rotation.x-(T.MathUtils.lerp(a.wheels[w.index].rotation,v.wheelRotation(w.index),alpha)-w.rotationOffset)*vehicleConfig.wheelRadius/w.radius),
        Math.abs(w.pivot.position.y-(.02-T.MathUtils.lerp(a.wheels[w.index].length,v.controller.wheelSuspensionLength(w.index),alpha)+w.radius-vehicleConfig.wheelRadius-s.bodyLift)),
      ]));
      const chaseTarget=s.car.position.clone().addScaledVector(new T.Vector3(0,0,1).applyQuaternion(s.car.quaternion),2).add(new T.Vector3(0,.65,0));
      review.rows.push({alpha,bodyError:s.car.position.distanceTo(expectedPosition),rotationError:s.car.quaternion.angleTo(expectedRotation),
        handwheelError:s.steering.quaternion.angleTo(expectedSteering),wheelError,
        cameraError:s.cameraMode==='cockpit'?s.camera.position.distanceTo(s.car.localToWorld(s.cockpitEye.clone())):
          s.camera.getWorldDirection(new T.Vector3()).angleTo(chaseTarget.sub(s.camera.position).normalize()),
        collision:v.collision,visualOffset:s.car.quaternion.angleTo(new T.Quaternion().copy(q)),heading:Math.atan2(2*(q.w*q.y+q.x*q.z),1-2*(q.y*q.y+q.z*q.z))});
    };
  });
  for(const camera of ['cockpit','chase']){
    await page.evaluate(camera=>{const a=window.__avtodrom;a.start('practice');a.vehicle.reset({x:-120,z:0},0);a.scene.resetMotion();a.scene.cameraMode=camera;window.turnMotion.active=false;window.turnMotion.rows=[];},camera);
    for(const key of ['KeyB','KeyI','Digit1','Space'])await page.keyboard.press(key);
    await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.signedSpeed>1);
    await page.keyboard.down('KeyA');await page.evaluate(()=>window.turnMotion.active=true);
    await page.waitForFunction(()=>window.turnMotion.rows.length>=60);
    await page.keyboard.up('KeyA');await page.keyboard.up('KeyW');
    const rows=await page.evaluate(()=>{window.turnMotion.active=false;return window.turnMotion.rows.slice(0,60);});
    check(`${camera}: actual turns use an interpolated pose`,rows.some(r=>r.visualOffset>1e-5)&&rows.every(r=>r.alpha>=0&&r.alpha<1));
    check(`${camera}: body, wheels and handwheel share the same physics interval`,rows.every(r=>r.bodyError<1e-6&&r.rotationError<1e-6&&r.handwheelError<1e-6&&r.wheelError<1e-6));
    if(camera==='cockpit')check('Driver eye stays attached to the interpolated cabin',rows.every(r=>r.cameraError<1e-6));
    else check('Chase camera tracks the interpolated car',rows.every(r=>r.cameraError<1e-6));
    const headingTravel=rows.slice(1).reduce((sum,row,i)=>sum+Math.abs(Math.atan2(Math.sin(row.heading-rows[i].heading),Math.cos(row.heading-rows[i].heading))),0);
    check(`${camera}: heading changes during the capture`,headingTravel>.03);
    check(`${camera}: turn stays clear of collision impacts`,rows.every(r=>!r.collision));
    await page.screenshot({path:`${directory}/${camera}-turn.png`});results.push({camera,rows});
  }
  await page.evaluate(()=>window.__avtodrom.pause());await page.waitForTimeout(100);
  check('Pausing clears the old physics interval',await page.evaluate(()=>!Number.isFinite(window.__avtodrom.scene.motion.previousTime)));
  check('Restart immediately returns to the spawn',await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),a=window.__avtodrom;
    a.start('practice');a.scene.render(a.vehicle,0,a.vehicle.time,false,0,0);
    const expected=new T.Vector3().copy(a.vehicle.body.translation()).add(new T.Vector3(0,a.scene.bodyLift,0).applyQuaternion(a.vehicle.body.rotation()));
    return a.scene.car.position.distanceTo(expected)<1e-6;
  }));
  check('No browser errors',errors.length===0);
  await writeFile(`${directory}/report.json`,JSON.stringify({checks,results,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
