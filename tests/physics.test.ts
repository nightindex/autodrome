import { beforeAll,describe,expect,it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Vehicle } from '../src/simulation/vehicle';
import { Drivetrain,rpmAtSpeed } from '../src/simulation/drivetrain';
import { vehicleConfig } from '../src/data/vehicle';
import type { Input } from '../src/simulation/input';
import { crossedLine } from '../src/simulation/math';
const controls={throttle:0,brake:0,clutch:0,steering:0};
beforeAll(async()=>{await RAPIER.init();});
describe('manual drivetrain',()=>{
  it('requires clutch to shift while running',()=>{const d=new Drivetrain();d.ignite();d.clutch=0;d.shift(1);expect(d.gear).toBe(0);d.clutch=1;d.shift(1);expect(d.gear).toBe(1);});
  it.each([1,-1])('retains a fast manual clutch chord until gear %i can engage',gear=>{
    const d=new Drivetrain();d.ignite();d.clutch=0;
    expect(d.shift(gear,false,true)).toBe(true);expect(d.gear).toBe(0);
    for(let i=0;i<6;i++)d.update(1/60,0,{...controls,clutch:1},false);
    expect(d.gear).toBe(0);
    for(let i=0;i<12;i++)d.update(1/60,0,{...controls,clutch:1},false);
    expect(d.gear).toBe(gear);expect(d.engine).toBe(true);
  });
  it('cancels a manual gear request when the clutch is released before opening',()=>{
    const d=new Drivetrain();d.ignite();d.clutch=0;d.shift(-1,false,true);
    d.update(1/60,0,controls,false);
    for(let i=0;i<30;i++)d.update(1/60,0,{...controls,clutch:1},false);
    expect(d.gear).toBe(0);
  });
  it('rechecks reverse safety while a manually held clutch opens',()=>{
    const d=new Drivetrain();d.ignite();d.clutch=0;d.shift(-1,false,true);
    d.update(1/60,1,{...controls,clutch:1},false);
    for(let i=0;i<30;i++)d.update(1/60,0,{...controls,clutch:1},false);
    expect(d.gear).toBe(0);
  });
  it('neutral and reset clear a pending manual shift',()=>{
    const d=new Drivetrain();d.ignite();d.clutch=0;d.shift(-1,false,true);d.shift(0);
    for(let i=0;i<30;i++)d.update(1/60,0,{...controls,clutch:1},false);
    expect(d.gear).toBe(0);
    d.clutch=0;d.shift(-1,false,true);d.reset();d.ignite();
    for(let i=0;i<30;i++)d.update(1/60,0,{...controls,clutch:1},false);
    expect(d.gear).toBe(0);
  });
  it('stalls after dumping the clutch at rest',()=>{const d=new Drivetrain();d.ignite();d.shift(1);for(let i=0;i<240;i++)d.update(1/60,0,controls,false);expect(d.stalled).toBe(true);expect(d.engine).toBe(false);});
  it('can restart after a stall with clutch depressed',()=>{const d=new Drivetrain();d.gear=1;d.clutch=0;d.ignite();expect(d.engine).toBe(false);d.clutch=1;d.ignite();expect(d.engine).toBe(true);});
  it('produces negative wheel force in reverse',()=>{const d=new Drivetrain();d.ignite();d.shift(-1);let force=0;for(let i=0;i<90;i++)force=d.update(1/60,-1,{...controls,throttle:1},true).force;expect(force).toBeLessThan(0);});
  it('prevents stalling with practice clutch assistance',()=>{const d=new Drivetrain();d.ignite();d.shift(1);for(let i=0;i<240;i++)d.update(1/60,0,controls,true);expect(d.engine).toBe(true);});
  it('depresses the clutch before engaging an assisted shift',()=>{
    const d=new Drivetrain();d.ignite();d.clutch=0;
    expect(d.shift(1,true)).toBe(true);expect(d.gear).toBe(0);expect(d.clutch).toBe(0);
    for(let i=0;i<10;i++)d.update(1/60,0,controls,true);
    expect(d.gear).toBe(0);expect(d.clutch).toBeGreaterThan(.9);
    for(let i=0;i<80;i++)d.update(1/60,0,controls,true);
    expect(d.gear).toBe(1);expect(d.engine).toBe(true);
  });
  it('rejects direction changes while moving even with assistance and the engine off',()=>{
    const d=new Drivetrain();d.update(1/60,2,{...controls,clutch:1},true);
    expect(d.shift(-1,true)).toBe(false);expect(d.gear).toBe(0);
    d.update(1/60,-2,{...controls,clutch:1},true);
    expect(d.shift(1,true)).toBe(false);expect(d.gear).toBe(0);
  });
  it('rejects a downshift that would over-rev while allowing a safe gear at the same speed',()=>{
    const d=new Drivetrain();d.ignite();d.update(1/60,20,{...controls,clutch:1},false);
    expect(d.shift(1)).toBe(false);expect(d.gear).toBe(0);
    expect(d.shift(2)).toBe(true);expect(d.gear).toBe(2);
  });
  it('limits sustained full throttle with the clutch disengaged',()=>{
    const d=new Drivetrain();d.ignite();let maximumRpm=0;
    for(let i=0;i<600;i++){d.update(1/60,0,{...controls,throttle:1,clutch:1},false);maximumRpm=Math.max(maximumRpm,d.rpm);}
    expect(maximumRpm).toBeGreaterThan(vehicleConfig.redlineRpm-180);
    expect(maximumRpm).toBeLessThan(vehicleConfig.redlineRpm*1.03);expect(d.engine).toBe(true);
  });
  it('opposes forward motion through engine braking when the throttle is released',()=>{
    const d=new Drivetrain();d.ignite();d.shift(1);d.clutch=0;
    expect(d.update(1/60,5,controls,false).force).toBeLessThan(0);
  });
  it.each([1,-1])('produces no force at rest in gear %i with the engine stopped',(gear)=>{
    const d=new Drivetrain();d.shift(gear);d.clutch=0;
    const drive=d.update(1/60,0,controls,false);
    expect(d.rpm).toBe(0);expect(Math.abs(drive.force)).toBe(0);
  });
  it.each([1,-1])('retains passive engine braking in gear %i after switching the engine off',(gear)=>{
    const speed=gear>0?5:-5,d=new Drivetrain();d.shift(gear);d.clutch=0;d.rpm=rpmAtSpeed(speed,gear);
    const drive=d.update(1/60,speed,controls,false);
    expect(d.engine).toBe(false);expect(drive.force*speed).toBeLessThan(0);
    expect(d.rpm).toBeGreaterThan(0);
  });
  it('dissipates the last engine rotation without reversing the clutch torque',()=>{
    const d=new Drivetrain();d.shift(1);d.clutch=0;d.rpm=1;
    expect(d.update(1/60,0,controls,false).force).toBeGreaterThanOrEqual(0);
    expect(d.rpm).toBe(0);
  });
});
function setup(){const world=new RAPIER.World({x:0,y:-9.81,z:0});world.createCollider(RAPIER.ColliderDesc.cuboid(200,.2,200).setTranslation(0,-.2,0));const car=new Vehicle(world,new Set());car.reset({x:0,z:0},0);const held=new Set<string>();const input={down:(a:string)=>held.has(a)}as Input;return {world,car,held,input};}
describe('Rapier vehicle integration',()=>{
  it.each([1,-1])('does not creep on level pavement with a stopped engine in gear %i',(gear)=>{
    const {world,car,input}=setup();
    try{
      for(let i=0;i<120;i++)car.update(1/60,input,false);
      car.action(gear<0?'reverse':'gear1');car.drivetrain.clutch=0;car.action('handbrake');
      const start=car.body.translation().z;
      for(let i=0;i<3600;i++)car.update(1/60,input,false);
      expect(car.drivetrain.engine).toBe(false);expect(car.drivetrain.rpm).toBe(0);
      expect(Math.abs(car.body.translation().z-start)).toBeLessThan(.01);
      expect(car.telemetry().speed).toBeLessThan(.001);
    }finally{car.dispose();world.free();}
  });
  it('engages first gear from rest through practice shift assistance',()=>{
    const {world,car,held,input}=setup();
    try{
      for(let i=0;i<60;i++)car.update(1/60,input,true);
      car.action('ignition');car.action('gear1',true);car.action('handbrake');held.add('throttle');
      expect(car.drivetrain.gear).toBe(0);
      for(let i=0;i<180;i++)car.update(1/60,input,true);
      expect(car.drivetrain.gear).toBe(1);expect(car.telemetry().signedSpeed).toBeGreaterThan(1);expect(car.drivetrain.engine).toBe(true);
    }finally{car.dispose();world.free();}
  });
  it('settles on four suspension rays and accelerates in the forward direction',()=>{const {world,car,held,input}=setup();for(let i=0;i<60;i++)car.update(1/60,input,true);expect(car.body.translation().y).toBeGreaterThan(.35);expect(car.body.translation().y).toBeLessThan(.8);expect([0,1,2,3].every(i=>car.controller.wheelIsInContact(i))).toBe(true);car.action('ignition');car.drivetrain.clutch=1;car.action('gear1');car.action('handbrake');held.add('throttle');for(let i=0;i<120;i++)car.update(1/60,input,true);expect(car.telemetry().signedSpeed).toBeGreaterThan(1);expect(car.body.translation().z).toBeGreaterThan(1);car.dispose();world.free();});
  it('brakes to a stop and reverses',()=>{const {world,car,held,input}=setup();car.action('ignition');car.action('gear1');car.action('handbrake');held.add('throttle');for(let i=0;i<120;i++)car.update(1/60,input,true);const before=car.telemetry().speed;held.clear();held.add('brake');for(let i=0;i<180;i++)car.update(1/60,input,true);expect(car.telemetry().speed).toBeLessThan(.1);expect(before).toBeGreaterThan(1);held.clear();car.drivetrain.clutch=1;car.action('reverse');held.add('throttle');for(let i=0;i<120;i++)car.update(1/60,input,true);expect(car.telemetry().signedSpeed).toBeLessThan(-1);car.dispose();world.free();});
  it('steers without flipping during a low-speed turn',()=>{const {world,car,held,input}=setup();car.action('ignition');car.action('gear1');car.action('handbrake');held.add('throttle');held.add('left');for(let i=0;i<100;i++)car.update(1/60,input,true);expect(Math.abs(car.telemetry().yaw)).toBeGreaterThan(.1);expect(car.body.translation().y).toBeGreaterThan(.3);car.dispose();world.free();});
  it('keeps fixed-step results independent of rendering frequency',()=>{const run=(fps:number)=>{const {world,car,held,input}=setup();car.action('ignition');car.action('gear1');car.action('handbrake');held.add('throttle');let accumulator=0;for(let f=0;f<fps*4;f++){accumulator+=1/fps;while(accumulator>=1/60-1e-9){car.update(1/60,input,true);accumulator-=1/60;}}const z=car.body.translation().z;car.dispose();world.free();return z;};expect(run(30)).toBeCloseTo(run(144),4);});
  it('holds on a 10% ramp with the handbrake, then rolls downhill when released',()=>{
    const world=new RAPIER.World({x:0,y:-9.81,z:0});world.createCollider(RAPIER.ColliderDesc.trimesh(new Float32Array([-10,0,-4,-10,0,4,10,2,-4,10,2,4]),new Uint32Array([0,1,2,1,3,2])));
    const car=new Vehicle(world,new Set());car.reset({x:0,z:0},Math.PI/2);car.body.setTranslation({x:0,y:1.67,z:0},true);const input={down:()=>false}as unknown as Input;
    for(let i=0;i<180;i++)car.update(1/60,input,false);const heldX=car.body.translation().x;expect(Math.abs(heldX)).toBeLessThan(.15);
    car.action('handbrake');car.body.wakeUp();for(let i=0;i<180;i++)car.update(1/60,input,false);expect(car.body.translation().x).toBeLessThan(heldX-.3);car.dispose();world.free();
  });
});
describe('geometric sensors',()=>{
  it('detects a swept bumper crossing between frames',()=>expect(crossedLine({x:0,z:-2},{x:0,z:3},{x:0,z:0},{x:0,z:1},2)).toBe(true));
  it('ignores crossings outside the stop-line span',()=>expect(crossedLine({x:3,z:-2},{x:3,z:3},{x:0,z:0},{x:0,z:1},2)).toBe(false));
  it('ignores a reverse crossing',()=>expect(crossedLine({x:0,z:3},{x:0,z:-2},{x:0,z:0},{x:0,z:1},2)).toBe(false));
});
