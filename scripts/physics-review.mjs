import { createServer } from 'vite';
import RAPIER from '@dimforge/rapier3d-compat';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const server=await createServer({server:{middlewareMode:true},appType:'custom'});
try{
  await RAPIER.init();
  const {Vehicle}=await server.ssrLoadModule('/src/simulation/vehicle.ts');
  const {vehicleConfig}=await server.ssrLoadModule('/src/data/vehicle.ts');
  const {speedAtRpm,rpmAtSpeed}=await server.ssrLoadModule('/src/simulation/drivetrain.ts');
  const {hillColliderData}=await server.ssrLoadModule('/src/render/hill-structure.ts');
  const {curbGeometry}=await server.ssrLoadModule('/src/render/road-geometry.ts');
  const {addStaticObstacle}=await server.ssrLoadModule('/src/simulation/static-collision.ts');
  const create=()=>{
    const world=new RAPIER.World({x:0,y:-9.81,z:0});
    world.createCollider(RAPIER.ColliderDesc.cuboid(10000,.2,10000).setTranslation(0,-.2,0));
    const car=new Vehicle(world,new Set());car.reset({x:0,z:0},0);
    const held=new Set(),input={down:action=>held.has(action)};
    for(let i=0;i<60;i++)car.update(1/60,input,true);
    return {world,car,held,input,dispose(){car.dispose();world.free();}};
  };
  const gears=[];
  for(const gear of [1,2,3,4,5,-1]){
    const run=create();const {car,held,input}=run;
    try{
      car.drivetrain.clutch=1;car.action('ignition');car.action(gear===-1?'reverse':`gear${gear}`);car.action('handbrake');
      const initialSpeed=gear>1?speedAtRpm(2500,gear):0;
      car.body.setLinvel({x:0,y:0,z:initialSpeed},true);car.drivetrain.rpm=gear>1?2500:850;
      held.add('throttle');let speedAtFive=0,speedAtTen=0;
      for(let i=0;i<60*120;i++){
        car.update(1/60,input,true);
        if(i===299)speedAtFive=car.telemetry().speed*3.6;if(i===599)speedAtTen=car.telemetry().speed*3.6;
      }
      const t=car.telemetry();gears.push({gear,at2500Rpm:Math.abs(speedAtRpm(2500,gear))*3.6,redlineSpeed:Math.abs(speedAtRpm(6200,gear))*3.6,initialKmh:Math.abs(initialSpeed)*3.6,speedAtFive,speedAtTen,after120Seconds:t.speed*3.6,rpm:t.rpm});
    }finally{run.dispose();}
  }
  const acceleration=create();let zeroToHundred=null;const accelerationShifts=[];
  try{
    const {car,held,input}=acceleration;car.drivetrain.clutch=1;car.action('ignition');car.action('gear1');car.action('handbrake');held.add('throttle');
    let nextShift=0;
    for(let i=0;i<60*30;i++){
      if(car.drivetrain.rpm>5400&&car.drivetrain.gear<5&&i>nextShift){accelerationShifts.push({time:i/60,from:car.drivetrain.gear,kmh:car.telemetry().speed*3.6});car.action(`gear${car.drivetrain.gear+1}`,true);nextShift=i+60;}
      car.update(1/60,input,true);
      if(car.telemetry().speed*3.6>=100){zeroToHundred=(i+1)/60;break;}
    }
  }finally{acceleration.dispose();}
  const braking=[];
  for(const [kmh,gear,throttle,surface] of [
    [20,0,false,'asphalt'],[50,0,false,'asphalt'],[100,0,false,'asphalt'],
    [50,2,false,'asphalt'],[50,2,true,'asphalt'],[50,0,false,'grass'],[-20,-1,true,'asphalt'],
  ]){
    const run=create();const {car,held,input}=run;
    try{
      car.drivetrain.clutch=1;car.action('ignition');car.action(gear<0?'reverse':`gear${gear}`);
      assert.equal(car.drivetrain.gear,gear,'The braking measurement actually uses the requested gear');
      car.drivetrain.clutch=0;car.drivetrain.rpm=Math.max(850,rpmAtSpeed(kmh/3.6,gear));
      if(throttle){car.drivetrain.throttle=1;held.add('throttle');}
      if(surface==='grass')car.surfaceAt=()=> 'grass';
      car.action('handbrake');car.body.setLinvel({x:0,y:0,z:kmh/3.6},true);held.add('brake');if(gear===0)held.add('clutch');const start=car.body.translation().z;
      let seconds=0;for(let i=0;i<600;i++){car.update(1/60,input,false);seconds=(i+1)/60;if(car.telemetry().speed<.1)break;}
      braking.push({fromKmh:kmh,gear,throttle,surface,metres:Math.abs(car.body.translation().z-start),seconds,finalKmh:car.telemetry().speed*3.6});
    }finally{run.dispose();}
  }
  const curb=[];
  for(const kmh of [8,25,50]){
    const run=create();const {car,held,input,world}=run;
    try{
      const geometry=curbGeometry({black:[[[[-4,6],[4,6],[4,6.24],[-4,6.24],[-4,6]]]],yellow:[]},{height:.18,bevel:.02});
      addStaticObstacle(world,geometry,car.obstacles);geometry.dispose();
      car.action('handbrake');car.body.setLinvel({x:0,y:0,z:kmh/3.6},true);let collision=false,maxHeight=0,firstImpact=null,crossedCurb=false;
      for(let i=0;i<240;i++){
        car.update(1/60,input,true);const t=car.telemetry();collision ||= t.collision;maxHeight=Math.max(maxHeight,car.body.translation().y);
        if(t.collision&&firstImpact===null)firstImpact={time:i/60,z:t.position.z,kmh:t.speed*3.6};
        const tyres=Array.from({length:car.body.numColliders()},(_,i)=>car.body.collider(i)).filter(c=>c.handle!==car.collider.handle);
        crossedCurb ||= tyres.length===4&&tyres.every(c=>{const p=c.translation();return p.z>6.24+vehicleConfig.wheelRadius&&Math.abs(p.x)<4-vehicleConfig.wheelRadius;});
      }
      const t=car.telemetry();curb.push({initialKmh:kmh,collision,firstImpact,maxHeight,crossedCurb,finalPosition:t.position,finalKmh:t.speed*3.6});
    }finally{run.dispose();}
  }
  const hill=[];const world=new RAPIER.World({x:0,y:-9.81,z:0}),ramp=hillColliderData();
  world.createCollider(RAPIER.ColliderDesc.trimesh(ramp.positions,ramp.indices).setFriction(.9));
  const car=new Vehicle(world,new Set());car.reset({x:8,z:42},Math.PI/2);const held=new Set(),input={down:action=>held.has(action)};
  try{
    for(let i=0;i<180;i++)car.update(1/60,input,true);
    hill.push({phase:'held',...car.telemetry(),height:car.body.translation().y});
    car.action('ignition');car.action('gear1',true);held.add('throttle');
    for(let i=0;i<300;i++){if(i===60)car.action('handbrake');car.update(1/60,input,true);if(i%60===59)hill.push({phase:`second-${(i+1)/60}`,...car.telemetry(),height:car.body.translation().y});}
  }finally{car.dispose();world.free();}
  const report={date:new Date().toISOString(),note:'Synthetic flat-track measurements and physical curb/ramp checks; estimates, not manufacturer validation.',gears,zeroToHundred,accelerationShifts,braking,curb,hill};
  assert(zeroToHundred!==null&&zeroToHundred>10&&zeroToHundred<20,'Plausible manual 0-100 km/h acceleration');
  for(const g of gears){assert(g.rpm<6500,'Rev limiter');assert(g.after120Seconds<g.redlineSpeed*1.04,'Mechanical gear speed limit');}
  assert(gears[4].after120Seconds>150&&gears[4].after120Seconds<195,'Power-limited fifth gear');
  assert(braking[1].metres>10&&braking[1].metres<20,'50 km/h braking distance');
  assert(braking[2].metres>35&&braking[2].metres<60,'100 km/h braking distance');
  assert(braking[3].metres<20&&braking[4].metres<25,'Service brakes work with engine torque on the driven axle');
  assert(braking[5].metres>braking[1].metres*1.2,'Grass has a longer stopping distance than dry asphalt');
  assert(braking.every(b=>b.finalKmh<.4),'All braking scenarios stop, including reverse with throttle');
  for(const hit of curb){
    assert(hit.collision,'Curb collision recorded');assert(hit.maxHeight<3.2,'Curb impact stays finite without an unbounded launch');
    assert(hit.finalKmh<hit.initialKmh*.95,'Curb dissipates speed');
    if(hit.initialKmh===8)assert(hit.finalPosition.z<5.5&&!hit.crossedCurb,'A slow approach remains blocked');
    if(hit.initialKmh===25)assert(hit.crossedCurb&&hit.maxHeight>.7,'Finite tyre support lets both axles carry across at 25 km/h');
    if(hit.initialKmh===50)assert(hit.crossedCurb,'Momentum can carry all four tyres across the curb');
  }
  assert(Math.abs(hill[0].position.x-8)<.15,'Handbrake holds the ascent');
  assert(hill.some(t=>t.position.x>11&&t.height>1.8&&t.engine),'Powered hill start');
  await mkdir('test-results/physics',{recursive:true});await writeFile('test-results/physics/report.json',JSON.stringify(report,null,2));
  console.log(JSON.stringify({gears,zeroToHundred,braking,curb,checks:'All physical review assertions passed',report:'test-results/physics/report.json'},null,2));
}finally{await server.close();}
