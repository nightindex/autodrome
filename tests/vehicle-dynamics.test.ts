import { beforeAll,describe,expect,it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Vehicle } from '../src/simulation/vehicle';
import { Drivetrain,rpmAtSpeed } from '../src/simulation/drivetrain';
import { vehicleConfig,vehicleDynamics,vehicleSteering } from '../src/data/vehicle';
import { addStaticObstacle } from '../src/simulation/static-collision';
import { curbGeometry } from '../src/render/road-geometry';
import { ExamEngine } from '../src/simulation/exam';
import type { Input } from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});
function track(){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(10000,.2,10000).setTranslation(0,-.2,0));
  const car=new Vehicle(world,new Set());car.reset({x:0,z:0},0);
  const held=new Set<string>(),input={down:(action:string)=>held.has(action)}as Input;
  const step=(count:number,assist=true)=>{for(let i=0;i<count;i++)car.update(1/60,input,assist);};
  step(60);
  return {world,car,held,input,step,dispose(){car.dispose();world.free();}};
}
function moving(car:Vehicle,speed:number,gear=0){
  car.drivetrain.clutch=1;car.action('ignition');car.action(gear<0?'reverse':gear===0?'neutral':`gear${gear}`);
  car.action('handbrake');car.body.setLinvel({x:0,y:0,z:speed},true);
  car.drivetrain.rpm=gear===0?850:Math.max(850,rpmAtSpeed(speed,gear));
}

describe('gear-dependent road dynamics',()=>{
  it.each([
    [1,0,43,50],[2,10,82,94],[3,15,116,137],[4,21,140,190],[5,26,130,185],[-1,0,45,53],
  ])('sustains gear %i within its road speed and RPM envelope',(gear,initial,min,max)=>{
    const run=track();
    try{
      moving(run.car,gear<0?-initial:initial,gear);run.held.add('throttle');run.step(2400);
      const t=run.car.telemetry();
      expect(t.speed*3.6).toBeGreaterThan(min);expect(t.speed*3.6).toBeLessThan(max);
      expect(t.rpm).toBeLessThan(vehicleConfig.redlineRpm*1.05);expect(t.engine).toBe(true);
      expect(Math.abs(t.rpm-rpmAtSpeed(t.signedSpeed,gear))).toBeLessThan(200);
      expect(t.signedSpeed*gear).toBeGreaterThan(0);
    }finally{run.dispose();}
  });
  it('gives first gear stronger acceleration than third at manoeuvring speed',()=>{
    const accelerate=(gear:number)=>{const run=track();try{moving(run.car,3,gear);run.held.add('throttle');run.step(180);return run.car.telemetry().speed;}finally{run.dispose();}};
    expect(accelerate(1)).toBeGreaterThan(accelerate(3)*1.5);
  });
  it('coasts further with the clutch open than with engine braking',()=>{
    const coast=(clutch:boolean)=>{const run=track();try{moving(run.car,10,2);run.car.drivetrain.clutch=0;if(clutch)run.held.add('clutch');run.step(180);return run.car.telemetry().speed;}finally{run.dispose();}};
    expect(coast(true)).toBeGreaterThan(coast(false)+.5);
  });
  it('loses more speed and grip on grass',()=>{
    const coast=(grass:boolean)=>{const run=track();try{moving(run.car,8);if(grass)run.car.surfaceAt=()=> 'grass';run.step(240);return {speed:run.car.telemetry().speed,grip:run.car.controller.wheelFrictionSlip(0)!};}finally{run.dispose();}};
    const road=coast(false),grass=coast(true);
    expect(grass.speed).toBeLessThan(road.speed-1);expect(grass.grip).toBeLessThan(road.grip);
  });
  it('brakes from 50 km/h without reversing or stalling with the clutch down',()=>{
    const run=track();
    try{
      moving(run.car,50/3.6,2);run.held.add('brake');run.held.add('clutch');const start=run.car.body.translation().z;
      run.step(240,false);const t=run.car.telemetry(),distance=t.position.z-start;
      expect(t.speed).toBeLessThan(.1);expect(t.signedSpeed).toBeGreaterThan(-.1);expect(t.engine).toBe(true);
      expect(distance).toBeGreaterThan(10);expect(distance).toBeLessThan(18);
    }finally{run.dispose();}
  });
  it('uses a tighter inside wheel and slows short steering inputs at speed',()=>{
    const steer=(speed:number)=>{const run=track();try{moving(run.car,speed);run.held.add('left');run.step(12);return [run.car.controller.wheelSteering(0)!,run.car.controller.wheelSteering(1)!];}finally{run.dispose();}};
    const low=steer(2),high=steer(20);
    expect(low[1]).toBeGreaterThan(low[0]);expect(high[1]).toBeGreaterThan(high[0]);expect(high[1]).toBeLessThan(low[1]*.6);
  });
  it('keeps full travel independent of clutch assistance and reports the actual rack',()=>{
    const run=track();
    try{
      moving(run.car,60/3.6);run.held.add('left');
      for(let i=0;i<180;i++){
        run.car.body.setRotation({x:0,y:0,z:0,w:1},true);
        run.car.body.setLinvel({x:0,y:0,z:60/3.6},true);
        run.car.update(1/60,run.input,false);
      }
      expect(run.car.telemetry().steering).toBeCloseTo(1);
      // Recover the virtual rack angle from both Ackermann wheel angles.
      const cot=(index:number)=>1/Math.tan(run.car.controller.wheelSteering(index)!);
      expect(Math.atan(2/(cot(0)+cot(1)))).toBeCloseTo(vehicleDynamics.maxSteeringAngle);
      expect(run.car.controller.wheelSteering(2)).toBe(0);expect(run.car.controller.wheelSteering(3)).toBe(0);
    }finally{run.dispose();}
  });
  it.each([-1,1])('matches the Cobalt turning circle at full lock in direction %i',(direction)=>{
    const run=track();
    try{
      run.held.add(direction>0?'left':'right');run.step(60,false);
      const inner=run.car.controller.wheelSteering(direction>0?1:0)!;
      const outer=run.car.controller.wheelSteering(direction>0?0:1)!;
      expect(Math.abs(inner)*180/Math.PI).toBeCloseTo(39.7344,3);
      expect(Math.abs(outer)*180/Math.PI).toBeCloseTo(29.3673,3);
      expect(Math.sign(inner)).toBe(direction);expect(Math.sign(outer)).toBe(direction);
      const outerRadius=vehicleConfig.wheelbase/Math.sin(Math.abs(outer));
      expect(2*outerRadius+vehicleConfig.tyreWidth).toBeCloseTo(vehicleSteering.turningDiameter,5);
      const handwheel=run.car.telemetry().steering*vehicleSteering.maxSteeringWheelAngle;
      expect(handwheel*180/Math.PI).toBeCloseTo(direction*516.6,6);
      expect(run.car.controller.wheelSteering(2)).toBe(0);expect(run.car.controller.wheelSteering(3)).toBe(0);
    }finally{run.dispose();}
  });
  it('applies steering assistance separately from the clutch and samples both front tyres',()=>{
    const run=track();
    try{
      moving(run.car,60/3.6);run.held.add('left');run.car.surfaceAt=p=>p.x>0?'grass':'asphalt';
      for(let i=0;i<120;i++){
        run.car.body.setRotation({x:0,y:0,z:0,w:1},true);
        run.car.body.setTranslation({x:0,y:.67,z:0},true);
        run.car.body.setLinvel({x:0,y:0,z:60/3.6},true);
        run.car.update(1/60,run.input,false,true);
      }
      expect(run.car.telemetry().steering).toBeLessThan(.1);
      expect(run.car.telemetry().steering).toBeGreaterThan(.02);
      run.car.reset({x:0,z:0},0);expect(run.car.telemetry().steering).toBe(0);
      expect(run.car.controller.wheelSteering(0)).toBe(0);expect(run.car.controller.wheelSteering(1)).toBe(0);
    }finally{run.dispose();}
  });
  it('uses horizontal speed while sliding sideways instead of applying parking-rate steering',()=>{
    const run=track();
    try{
      moving(run.car,0);run.car.body.setLinvel({x:20,y:0,z:0},true);run.held.add('left');run.step(1);
      expect(run.car.steering.angle).toBeGreaterThan(0);
      expect(run.car.steering.angle).toBeLessThan(.01);
    }finally{run.dispose();}
  });
  it('keeps the body upright during a sudden turn at 60 km/h',()=>{
    const run=track();
    try{
      moving(run.car,60/3.6);run.held.add('left');
      for(let i=0;i<180;i++){run.step(1);const q=run.car.body.rotation();expect(1-2*(q.x*q.x+q.z*q.z)).toBeGreaterThan(.75);}
      expect(run.car.body.translation().y).toBeGreaterThan(.3);
    }finally{run.dispose();}
  });
});

describe('safe shift completion',()=>{
  const controls={throttle:0,brake:0,clutch:0,steering:0};
  it('rechecks an assisted downshift if the car accelerates before engagement',()=>{
    const d=new Drivetrain();d.ignite();d.clutch=0;expect(d.shift(1,true)).toBe(true);
    for(let i=0;i<30;i++)d.update(1/60,20,controls,true);
    expect(d.gear).toBe(0);
  });
  it('cancels a queued shift when the current gear is selected again',()=>{
    const d=new Drivetrain();d.ignite();d.clutch=0;d.shift(1,true);d.shift(0,true);
    for(let i=0;i<30;i++)d.update(1/60,0,controls,true);
    expect(d.gear).toBe(0);
  });
  it('cancels clutch assistance when manual mode is enabled',()=>{
    const d=new Drivetrain();d.ignite();d.clutch=0;d.shift(1,true);
    for(let i=0;i<30;i++)d.update(1/60,0,controls,false);
    expect(d.gear).toBe(0);expect(d.clutch).toBe(0);
  });
});

describe('solid tyre and curb contact',()=>{
  it.each([8,25,50])('responds to a 20 cm bevelled curb at %i km/h without tunnelling',(kmh)=>{
    const run=track();
    try{
      const geometry=curbGeometry({black:[[[[-4,6],[4,6],[4,6.24],[-4,6.24],[-4,6]]]],yellow:[]},{height:.18,bevel:.02});
      const collider=addStaticObstacle(run.world,geometry,run.car.obstacles)!;geometry.dispose();
      const hit=collider.castRay(new RAPIER.Ray({x:0,y:2,z:6.12},{x:0,y:-1,z:0}),3,true);
      expect(hit).toBeCloseTo(1.8,3);
      run.car.action('handbrake');run.car.body.setLinvel({x:0,y:0,z:kmh/3.6},true);
      let collided=false,peakHeight=0,furthest=0;const exam=new ExamEngine('practice');
      for(let i=0;i<240;i++){
        run.step(1);const t=run.car.telemetry();collided ||= t.collision;peakHeight=Math.max(peakHeight,run.car.body.translation().y);furthest=Math.max(furthest,t.position.z);
        exam.update(t,{},1/60);
      }
      expect(collided).toBe(true);expect(peakHeight).toBeLessThan(3.2);
      // Slow impacts remain blocked; sufficient momentum carries both axles
      // across, with front/rear contacts belonging to one scoring event.
      if(kmh===8)expect(furthest).toBeLessThan(5.5);
      if(kmh>=25)expect(furthest).toBeGreaterThan(7.85);
      expect(run.car.telemetry().speed*3.6).toBeLessThan(kmh*.95);
      expect(exam.events.filter(e=>e.ruleId===30)).toHaveLength(1);
      run.car.reset({x:0,z:0},0);expect(run.car.telemetry().collision).toBe(false);
    }finally{run.dispose();}
  });
  it('does not mistake the pavement or its own tyres for obstacles',()=>{
    const run=track();try{run.step(180);expect(run.car.collision).toBe(false);expect([0,1,2,3].every(i=>run.car.controller.wheelIsInContact(i))).toBe(true);expect(run.car.body.mass()).toBeCloseTo(vehicleConfig.mass,3);}finally{run.dispose();}
  });
});
