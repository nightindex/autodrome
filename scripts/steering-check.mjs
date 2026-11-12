import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/steering';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,value)=>{assert(value,name);checks.push(name);};
const loaded=()=>page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
try{
  // Existing users must receive full control without inheriting a hidden aid.
  await page.addInitScript(()=>{
    if(!localStorage.getItem('avtodrom.settings.v1'))localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',assist:true}));
  });
  await page.goto('http://127.0.0.1:5173/');await loaded();
  await page.click('#settings');
  check('Legacy settings leave steering assistance off',!await page.isChecked('#steering-assist'));
  check('The checkbox has an accessible explanation',await page.locator('#steering-assist').getAttribute('aria-describedby')==='steering-assist-help');
  await page.check('#steering-assist');await page.uncheck('#assist');
  check('Steering and clutch preferences are independent',await page.evaluate(()=>{const s=JSON.parse(localStorage.getItem('avtodrom.settings.v1'));return s.steeringAssist&&!s.assist;}));
  await page.screenshot({path:`${directory}/settings-desktop.png`});
  await page.setViewportSize({width:1024,height:600});
  check('Settings fit a short desktop window',await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.querySelector('#modal').getBoundingClientRect().height<=innerHeight));
  await page.screenshot({path:`${directory}/settings-short.png`});
  await page.setViewportSize({width:1440,height:960});
  await page.reload();await loaded();await page.click('#settings');
  check('Steering preference survives reload',await page.isChecked('#steering-assist')&&!await page.isChecked('#assist'));
  await page.selectOption('#language','uz');
  check('Uzbek steering help is localized',await page.locator('#steering-assist-help').innerText().then(text=>text.includes('Tezlikda')));
  await page.selectOption('#language','ru');await page.click('#close');

  const modes=await page.evaluate(()=>{
    const a=window.__avtodrom,rows=[];
    for(const mode of ['practice','exam']){
      a.start(mode);a.pause();
      const v=a.vehicle,update=v.update.bind(v);let observed;
      v.update=(...args)=>{observed={clutch:args[2],steering:args[3]};return update(...args);};
      a.step(1/60);v.update=update;
      rows.push({mode,...observed,badge:!document.querySelector('#steering-assist-badge').hidden});
    }
    return rows;
  });
  check('Practice applies only the selected assistance',modes[0].steering&&!modes[0].clutch&&modes[0].badge);
  check('Exam bypasses both aids and hides their indicators',!modes[1].steering&&!modes[1].clutch&&!modes[1].badge);

  const physics=await page.evaluate(async()=>{
    // Reuse the game's initialized WASM module, including Vite's cache key.
    const source=await fetch('/src/simulation/vehicle.ts').then(r=>r.text());
    const rapierUrl=source.match(/import RAPIER from ["']([^"']+)["']/)[1];
    const R=(await import(rapierUrl)).default;
    const T=await import('/node_modules/three/build/three.module.js');
    const {Vehicle}=await import('/src/simulation/vehicle.ts');
    const {vehicleConfig,vehicleDynamics,vehicleSteering}=await import('/src/data/vehicle.ts');
    const create=()=>{
      const world=new R.World({x:0,y:-9.81,z:0});world.createCollider(R.ColliderDesc.cuboid(10000,.2,10000).setTranslation(0,-.2,0));
      const car=new Vehicle(world,new Set());car.reset({x:0,z:0},0);
      const held=new Set(),input={down:action=>held.has(action)};
      for(let i=0;i<60;i++)car.update(1/60,input,false);
      car.drivetrain.handbrake=false;
      return {car,held,input,dispose(){car.dispose();world.free();}};
    };
    const bench=[];
    // Hold a known body speed/heading to measure rack travel independently of
    // the car losing speed or rotating. Natural road runs follow separately.
    for(const kmh of [5,40,60,100,-60])for(const assistance of [false,true]){
      const run=create(),v=run.car;run.held.add('left');let tap;
      try{
        for(let i=0;i<240;i++){
          v.body.setRotation({x:0,y:0,z:0,w:1},true);v.body.setLinvel({x:0,y:0,z:kmh/3.6},true);
          v.update(1/60,run.input,false,assistance);
          if(i===11)tap=v.steering.angle;
        }
        bench.push({kmh,assistance,tap,angle:v.steering.angle,normalized:v.telemetry().steering,wheels:[0,1,2,3].map(i=>v.controller.wheelSteering(i))});
      }finally{run.dispose();}
    }
    const road=[];
    for(const kmh of [10,60,100])for(const assistance of [false,true]){
      const run=create(),v=run.car;
      try{
        v.body.setLinvel({x:0,y:0,z:kmh/3.6},true);run.held.add('left');
        let minUp=1,peakBodySlip=0,peakTyreSlip=0,peakYawRate=0,peakHeight=0;
        for(let i=0;i<360;i++){
          // Hold, countersteer, then release through a complete recovery.
          if(i===90){run.held.delete('left');run.held.add('right');}
          if(i===180)run.held.clear();
          v.update(1/60,run.input,false,assistance);
          const q=v.body.rotation(),vel=v.body.linvel(),right=new T.Vector3(1,0,0).applyQuaternion(new T.Quaternion(q.x,q.y,q.z,q.w));
          minUp=Math.min(minUp,1-2*(q.x*q.x+q.z*q.z));
          peakBodySlip=Math.max(peakBodySlip,Math.abs(right.x*vel.x+right.y*vel.y+right.z*vel.z));
          for(const wheel of [0,1])if(v.controller.wheelIsInContact(wheel)){
            const angle=v.controller.wheelSteering(wheel),side=new T.Vector3(Math.cos(angle),0,-Math.sin(angle)).applyQuaternion(new T.Quaternion(q.x,q.y,q.z,q.w));
            const wheelVelocity=v.body.velocityAtPoint(v.controller.wheelContactPoint(wheel));
            peakTyreSlip=Math.max(peakTyreSlip,Math.abs(side.x*wheelVelocity.x+side.y*wheelVelocity.y+side.z*wheelVelocity.z));
          }
          peakYawRate=Math.max(peakYawRate,Math.abs(v.body.angvel().y));peakHeight=Math.max(peakHeight,v.body.translation().y);
        }
        const p=v.body.translation();road.push({kmh,assistance,minUp,peakBodySlip,peakTyreSlip,peakYawRate,peakHeight,finalSpeed:v.telemetry().speed,finalSteering:v.telemetry().steering,finite:[p.x,p.y,p.z].every(Number.isFinite)});
      }finally{run.dispose();}
    }
    const circles=[];
    // An actual slow powered circle checks tyre forces as well as the geometric
    // steering limits. Fit the centre from rear-axle points after full lock.
    for(const direction of [-1,1]){
      const run=create(),v=run.car;
      try{
        run.held.add(direction>0?'left':'right');
        for(let i=0;i<60;i++)v.update(1/60,run.input,false);
        v.drivetrain.clutch=1;v.action('ignition');v.action('gear1');
        const samples=[];let yaw=0,lastYaw=v.telemetry().yaw;
        for(let i=0;i<3600;i++){
          if(v.telemetry().speed<1.2)run.held.add('throttle');else run.held.delete('throttle');
          v.update(1/60,run.input,true);
          const t=v.telemetry(),delta=Math.atan2(Math.sin(t.yaw-lastYaw),Math.cos(t.yaw-lastYaw));
          yaw+=delta;lastYaw=t.yaw;
          if(Math.abs(yaw)>.6&&i%10===0)samples.push({x:t.position.x-Math.sin(t.yaw)*vehicleConfig.wheelbase/2,z:t.position.z-Math.cos(t.yaw)*vehicleConfig.wheelbase/2});
          if(Math.abs(yaw)>Math.PI*2+.6)break;
        }
        const a=samples[0],b=samples[Math.floor(samples.length/3)],c=samples[Math.floor(samples.length*2/3)];
        const aa=a.x*a.x+a.z*a.z,bb=b.x*b.x+b.z*b.z,cc=c.x*c.x+c.z*c.z;
        const d=2*(a.x*(b.z-c.z)+b.x*(c.z-a.z)+c.x*(a.z-b.z));
        const centre={x:(aa*(b.z-c.z)+bb*(c.z-a.z)+cc*(a.z-b.z))/d,z:(aa*(c.x-b.x)+bb*(a.x-c.x)+cc*(b.x-a.x))/d};
        const radii=samples.map(p=>Math.hypot(p.x-centre.x,p.z-centre.z)),radius=radii.reduce((sum,r)=>sum+r,0)/radii.length;
        circles.push({direction,yaw,rearAxleRadius:radius,diameter:2*Math.hypot(radius+vehicleConfig.frontTrack/2,vehicleConfig.wheelbase)+vehicleConfig.tyreWidth,radialSpread:Math.max(...radii)-Math.min(...radii),samples:samples.length});
      }finally{run.dispose();}
    }
    return {bench,road,circles,maxAngle:vehicleDynamics.maxSteeringAngle,reference:vehicleSteering};
  });
  await writeFile(`${directory}/physics.json`,JSON.stringify(physics,null,2));
  for(const row of physics.bench){
    if(!row.assistance)check(`Full lock remains available at ${row.kmh} km/h`,Math.abs(row.angle-physics.maxAngle)<1e-6);
    else if(Math.abs(row.kmh)>=40)check(`Optional aid reduces lock at ${row.kmh} km/h`,row.angle<.15);
    check(`Ackermann geometry and rear axle: ${row.kmh}, aid ${row.assistance}`,row.wheels[1]>row.wheels[0]&&row.wheels[2]===0&&row.wheels[3]===0);
  }
  check('Short inputs are gentler at speed',physics.bench.find(r=>r.kmh===60&&!r.assistance).tap<physics.bench.find(r=>r.kmh===5&&!r.assistance).tap*.6);
  for(const row of physics.road)check(`Stable turn, countersteer and release at ${row.kmh} km/h, aid ${row.assistance}`,row.finite&&row.minUp>.75&&row.peakHeight<1.2&&Math.abs(row.finalSteering)<1e-6);
  check('Unassisted excessive high-speed steering produces front tyre slip',physics.road.find(r=>r.kmh===100&&!r.assistance).peakTyreSlip>.5);
  for(const row of physics.circles)check(`Slow powered circle matches the Cobalt diameter: direction ${row.direction}`,Math.abs(row.yaw)>Math.PI*2&&Math.abs(row.diameter-physics.reference.turningDiameter)<.4&&row.radialSpread<.25);

  await page.evaluate(()=>{window.__avtodrom.start('practice');window.__avtodrom.pause();});
  const visual=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),a=window.__avtodrom,s=a.scene,v=a.vehicle;
    v.reset({x:-25,z:40.5},Math.PI/2);const idle={down:()=>false},left={down:action=>action==='left'};
    for(let i=0;i<60;i++)v.update(1/60,idle,false);
    v.drivetrain.handbrake=false;
    for(let i=0;i<120;i++){
      v.body.setRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2),true);
      v.body.setTranslation({x:-25,y:.67,z:40.5},true);v.body.setLinvel({x:60/3.6,y:0,z:0},true);
      v.update(1/60,left,false,true);
    }
    const t=v.telemetry();s.render(v,1/60,0,false,0);
    const {vehicleSteering}=await import('/src/data/vehicle.ts');
    const expected=s.steeringBase.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-t.steering*vehicleSteering.maxSteeringWheelAngle));
    const result={rack:v.steering.angle,normalized:t.steering,cabinError:s.steering.quaternion.angleTo(expected),wheels:s.wheels.map(w=>({index:w.index,visual:w.pivot.rotation.y,physics:v.controller.wheelSteering(w.index)}))};
    s.cameraMode='cockpit';return result;
  });
  check('Cabin wheel follows the assisted rack, not the raw key',visual.cabinError<1e-7&&visual.normalized<.2);
  check('All rendered road wheels match physical steering',visual.wheels.every(w=>Math.abs(w.visual-w.physics)<1e-7));
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.waitForTimeout(250);await page.screenshot({path:`${directory}/assisted-cockpit.png`});
  const sweep=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),a=window.__avtodrom,s=a.scene,v=a.vehicle;
    v.reset({x:-25,z:40.5},Math.PI/2);
    const idle={down:()=>false};for(let i=0;i<60;i++)v.update(1/60,idle,false);s.render(v,1/60,0,false,0);
    const initial=s.steering.quaternion.clone();let previous=initial.clone(),rotation=0,maxStep=0,maxWheelError=0;
    const captures=[];
    // Accumulate signed frame rotations: quaternion endpoints alone cannot
    // distinguish 2.87 turns from a short rotation to the same orientation.
    for(const direction of [1,-1,0]){
      for(let i=0;i<120;i++){
        v.update(1/60,{down:action=>direction===1?action==='left':direction===-1?action==='right':false},false);
        s.render(v,1/60,0,false,0);
        const current=s.steering.quaternion.clone(),delta=previous.clone().invert().multiply(current);
        let angle=2*Math.atan2(delta.z,delta.w);angle=Math.atan2(Math.sin(angle),Math.cos(angle));
        rotation+=angle;maxStep=Math.max(maxStep,Math.abs(angle));previous=current;
        for(const w of s.wheels)maxWheelError=Math.max(maxWheelError,Math.abs(w.pivot.rotation.y-v.controller.wheelSteering(w.index)));
      }
      captures.push({direction,degrees:rotation*180/Math.PI,rack:v.telemetry().steering,wheels:[0,1,2,3].map(i=>v.controller.wheelSteering(i)*180/Math.PI)});
    }
    return {captures,maxStep,maxWheelError,returnedError:s.steering.quaternion.angleTo(initial)};
  });
  check('Cabin wheel reaches 516.6 degrees in both directions',Math.abs(sweep.captures[0].degrees+516.6)<1e-5&&Math.abs(sweep.captures[1].degrees-516.6)<1e-5);
  check('Full steering sweep stays smooth and returns to centre',sweep.maxStep<.5&&sweep.maxWheelError<1e-7&&sweep.returnedError<1e-7&&Math.abs(sweep.captures[2].degrees)<1e-5);
  check('No runtime errors',errors.length===0);
  const report={checks,errors,modes,physics,visual,sweep};await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify({checks,errors,road:physics.road,circles:physics.circles,visual,sweep},null,2));
}finally{await browser.close();}
