import { createServer } from 'vite';
import RAPIER from '@dimforge/rapier3d-compat';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

// Compare the previous and current lock using real keyboard steering and tyre
// forces. Only this isolated SSR module is changed; project files stay intact.
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
const directory='test-results/steering-physics';
const report={date:new Date().toISOString(),checks:[],manoeuvres:[],handbrake:[]};
const check=(name,passed)=>report.checks.push({name,passed:!!passed});
let dynamics,currentLock;
try{
  await RAPIER.init();
  const {Vehicle}=await server.ssrLoadModule('/src/simulation/vehicle.ts');
  ({vehicleDynamics:dynamics}=await server.ssrLoadModule('/src/data/vehicle.ts'));
  currentLock=dynamics.maxSteeringAngle;
  report.limits={previous:.56,current:currentLock};
  const create=(surface)=>{
    const world=new RAPIER.World({x:0,y:-9.81,z:0});
    world.createCollider(RAPIER.ColliderDesc.cuboid(10000,.2,10000).setTranslation(0,-.2,0));
    const car=new Vehicle(world,new Set()),held=new Set(),input={down:action=>held.has(action)};
    car.reset({x:0,z:0},0);car.surfaceAt=()=>surface;
    for(let i=0;i<60;i++)car.update(1/60,input,false);
    car.drivetrain.handbrake=false;
    return {car,held,input,dispose(){car.dispose();world.free();}};
  };
  const metrics=(car)=>({finite:true,minUp:1,peakHeight:car.body.translation().y,peakSideSpeed:0,peakYawRate:0,peakSuspensionRate:0,collision:false});
  const sample=(car,m,previousSuspension)=>{
    const q=car.body.rotation(),v=car.body.linvel(),p=car.body.translation(),a=car.body.angvel();
    const suspension=[0,1,2,3].map(i=>car.controller.wheelSuspensionLength(i));
    const loads=[0,1,2,3].map(i=>car.controller.wheelSuspensionForce(i));
    m.finite&&=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,v.x,v.y,v.z,a.x,a.y,a.z,...suspension,...loads].every(Number.isFinite);
    m.minUp=Math.min(m.minUp,1-2*(q.x*q.x+q.z*q.z));m.peakHeight=Math.max(m.peakHeight,p.y);
    const sideX=1-2*(q.y*q.y+q.z*q.z),sideY=2*(q.x*q.y+q.z*q.w),sideZ=2*(q.x*q.z-q.y*q.w);
    m.peakSideSpeed=Math.max(m.peakSideSpeed,Math.abs(sideX*v.x+sideY*v.y+sideZ*v.z));
    m.peakYawRate=Math.max(m.peakYawRate,Math.abs(a.y));m.collision ||= car.telemetry().collision;
    if(previousSuspension)for(let i=0;i<4;i++)m.peakSuspensionRate=Math.max(m.peakSuspensionRate,Math.abs(suspension[i]-previousSuspension[i])*60);
    return suspension;
  };
  for(const [version,lock] of [['previous',.56],['current',currentLock]]){
    dynamics.maxSteeringAngle=lock;
    for(const kmh of [5,30,50,60,100,-5,-20])for(const surface of ['asphalt','grass'])for(const assistance of [false,true])for(const direction of [-1,1]){
      const run=create(surface),{car,held,input}=run;
      try{
        car.body.setLinvel({x:0,y:0,z:kmh/3.6},true);
        const m=metrics(car);let suspension,releaseAngle,brakeSeconds=0;
        // Grass at 100 km/h needs substantially more than two seconds to stop.
        // Keep a ten-second braking window after the six-second steering run.
        for(let i=0;i<960;i++){
          held.clear();
          if(i<120)held.add(direction>0?'left':'right');
          else if(i<240)held.add(direction>0?'right':'left');
          else if(i>=360)held.add('brake');
          car.update(1/60,input,false,assistance);suspension=sample(car,m,suspension);
          if(i===359)releaseAngle=car.steering.angle;
          if(i>=360){brakeSeconds=(i-359)/60;if(car.telemetry().speed<.1)break;}
        }
        const t=car.telemetry();
        const row={version,kmh,surface,assistance,direction,...m,releaseAngle,brakeSeconds,finalKmh:t.speed*3.6,position:t.position,yaw:t.yaw};
        report.manoeuvres.push(row);
        check(`${version} ${kmh} ${surface} aid=${assistance} direction=${direction}: finite, upright, centred and stopped`,m.finite&&m.minUp>.85&&m.peakHeight<.7&&!m.collision&&Math.abs(releaseAngle)<1e-7&&t.speed<.15);
      }finally{run.dispose();}
    }
    // Exercise the real rack rather than fixing its angle in a tyre fixture.
    for(const kmh of [20,50,80])for(const direction of [-1,1])for(const handbrake of [false,true]){
      const run=create('asphalt'),{car,held,input}=run;
      try{
        car.body.setLinvel({x:0,y:0,z:kmh/3.6},true);held.add(direction>0?'left':'right');
        for(let i=0;i<36;i++)car.update(1/60,input,false);
        if(handbrake)car.action('handbrake');
        const m=metrics(car);let suspension;
        for(let i=0;i<60;i++){car.update(1/60,input,false);suspension=sample(car,m,suspension);}
        report.handbrake.push({version,kmh,direction,handbrake,...m,finalKmh:car.telemetry().speed*3.6,finalSteering:car.steering.normalized});
        check(`${version} ${kmh} direction=${direction} handbrake=${handbrake}: finite and upright`,m.finite&&m.minUp>.85&&m.peakHeight<.7&&!m.collision);
      }finally{run.dispose();}
    }
  }
  for(const row of report.manoeuvres.filter(r=>r.direction===1)){
    const other=report.manoeuvres.find(r=>r.version===row.version&&r.kmh===row.kmh&&r.surface===row.surface&&r.assistance===row.assistance&&r.direction===-1);
    check(`${row.version} ${row.kmh} ${row.surface} aid=${row.assistance}: mirrored left/right response`,Math.hypot(row.position.x+other.position.x,row.position.z-other.position.z)<.05&&Math.abs(row.yaw+other.yaw)<.01);
  }
  for(const row of report.handbrake.filter(r=>r.handbrake)){
    const coast=report.handbrake.find(r=>r.version===row.version&&r.kmh===row.kmh&&r.direction===row.direction&&!r.handbrake);
    // At low speed the parking brake can simply slow the car, reducing yaw.
    // A moving handbrake turn at 50/80 km/h must increase rotation and slip.
    if(row.kmh>=50)check(`${row.version} ${row.kmh} direction=${row.direction}: handbrake increases rotation and sideslip`,row.peakYawRate>coast.peakYawRate&&row.peakSideSpeed>coast.peakSideSpeed);
    else check(`${row.version} ${row.kmh} direction=${row.direction}: handbrake slows the car`,row.finalKmh<coast.finalKmh);
  }
  const failed=report.checks.filter(c=>!c.passed);
  console.log(JSON.stringify({manoeuvres:report.manoeuvres.length,handbrakeRuns:report.handbrake.length,checks:report.checks.length,failed,handbrake:report.handbrake},null,2));
  assert.equal(failed.length,0,failed.map(c=>c.name).join('\n'));
}catch(error){report.failure=String(error);throw error;}
finally{
  if(dynamics&&currentLock!==undefined)dynamics.maxSteeringAngle=currentLock;
  await mkdir(directory,{recursive:true});await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await server.close();
}
