import { beforeAll,describe,expect,it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Vehicle } from '../src/simulation/vehicle';
import { hillColliderData } from '../src/render/hill-structure';
import { hillProfile } from '../src/data/course';
import { vehicleConfig } from '../src/data/vehicle';
import type { Input } from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});

function hillStop(gear:1|-1,assist=true){
  const world=new RAPIER.World({x:0,y:-9.81,z:0}),ramp=hillColliderData();
  world.createCollider(RAPIER.ColliderDesc.trimesh(ramp.positions,ramp.indices).setFriction(.9));
  const car=new Vehicle(world,new Set());car.reset({x:8,z:42},gear*Math.PI/2);
  const held=new Set<string>(),input={down:(action:string)=>held.has(action)}as Input;
  const step=(frames:number)=>{for(let i=0;i<frames;i++)car.update(1/60,input,assist);};
  step(180);car.drivetrain.clutch=1;car.action('ignition');car.action(gear===1?'gear1':'reverse');car.action('handbrake');
  // Both orientations travel uphill along +X; reversing changes the signed
  // chassis speed without changing the road gradient or the braking sequence.
  car.body.setLinvel({x:1.5,y:1.5*1.8/11,z:0},true);car.drivetrain.clutch=.5;car.drivetrain.rpm=1000;
  held.add('brake');if(!assist)held.add('clutch');step(180);
  return {car,held,step,dispose(){car.dispose();world.free();}};
}

function expectMovingUphill(car:Vehicle,startX:number,gear:1|-1){
  const t=car.telemetry();
  expect(t.position.x).toBeGreaterThan(startX+1);
  // Keep every wheel on the original incline so the result cannot come from
  // cresting the hill and accelerating downhill.
  expect(t.position.x).toBeLessThan(hillProfile.crestStart-vehicleConfig.wheelbase/2);
  expect(t.signedSpeed*gear).toBeGreaterThan(.5);
  expect(t.engine).toBe(true);expect(t.stalled).toBe(false);expect(t.handbrake).toBe(false);
  expect(Number.isFinite(t.rpm)).toBe(true);expect(t.rpm).toBeGreaterThan(450);
  expect([0,1,2,3].every(i=>car.controller.wheelIsInContact(i))).toBe(true);
}

describe('restarting on the actual hill ascent',()=>{
  it.each([
    {gear:1 as const,gap:0},{gear:1 as const,gap:12},
    {gear:-1 as const,gap:0},{gear:-1 as const,gap:12},
  ])('recovers after service braking in gear $gear with a $gap-frame pedal gap',({gear,gap})=>{
    const run=hillStop(gear);
    try{
      const stopped=run.car.telemetry();expect(stopped.speed).toBeLessThan(.01);
      expect(stopped.engine).toBe(true);expect(stopped.handbrake).toBe(false);expect(stopped.gear).toBe(gear);
      run.held.delete('brake');run.step(gap);run.held.add('throttle');run.step(144);
      expectMovingUphill(run.car,stopped.position.x,gear);
    }finally{run.dispose();}
  });

  it('allows a manual restart after holding the clutch during service braking',()=>{
    const run=hillStop(1,false);
    try{
      const stopped=run.car.telemetry();expect(stopped.speed).toBeLessThan(.01);
      expect(stopped.engine).toBe(true);expect(stopped.clutch).toBe(1);
      run.held.delete('brake');run.held.delete('clutch');run.held.add('throttle');run.step(120);
      expectMovingUphill(run.car,stopped.position.x,1);
    }finally{run.dispose();}
  });

  it('retains an assisted start when throttle is raised before releasing the handbrake',()=>{
    const run=hillStop(1);
    try{
      run.car.action('handbrake');run.held.delete('brake');run.held.add('throttle');run.step(60);
      const startX=run.car.body.translation().x;run.car.action('handbrake');run.step(60);
      expectMovingUphill(run.car,startX,1);
    }finally{run.dispose();}
  });
});
