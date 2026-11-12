import {beforeAll,describe,it,expect} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {Vehicle} from '../src/simulation/vehicle';
import {vehicleConfig} from '../src/data/vehicle';
import type {Input} from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});
function fixture(){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
  const car=new Vehicle(world,new Set()),held=new Set<string>(),input={down:(action:string)=>held.has(action)}as Input;
  car.reset({x:0,z:0},0);car.body.setTranslation({x:0,y:1.3,z:0},true);car.body.setRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI),true);
  const step=(frames:number,assist=true)=>{for(let i=0;i<frames;i++)car.update(1/60,input,assist);};
  step(120);
  return {car,world,held,step,dispose(){car.dispose();world.free();}};
}
function drive(run:ReturnType<typeof fixture>,gear:number){
  run.car.action('ignition');run.car.drivetrain.clutch=1;
  run.car.action(gear<0?'reverse':gear===0?'neutral':'gear1');run.car.drivetrain.handbrake=false;run.held.add('throttle');
}

describe('unloaded wheel rotation',()=>{
  for(const assist of [true,false])for(const gear of [1,-1])it(`spins only the driven wheels on the roof in gear ${gear}, assist=${assist}`,()=>{
    const run=fixture();try{
      const {car}=run;expect([0,1,2,3].every(i=>!car.controller.wheelIsInContact(i))).toBe(true);
      const position=car.body.translation();drive(run,gear);run.step(180,assist);
      expect(car.wheelRotation(0)*gear).toBeGreaterThan(5);expect(car.wheelRotation(1)*gear).toBeGreaterThan(5);
      expect(Math.abs(car.wheelRotation(2))).toBeLessThan(.001);expect(Math.abs(car.wheelRotation(3))).toBeLessThan(.001);
      const t=car.telemetry();expect(t.engine).toBe(true);expect(t.stalled).toBe(false);
      expect(t.rpm).toBeGreaterThan(2000);expect(t.rpm).toBeLessThan(vehicleConfig.redlineRpm*1.05);
      expect(Math.hypot(t.position.x-position.x,t.position.z-position.z)).toBeLessThan(.02);
    }finally{run.dispose();}
  });
  for(const disconnected of ['neutral','clutch']as const)it(`does not drive airborne wheels with ${disconnected}`,()=>{
    const run=fixture();try{
      drive(run,disconnected==='neutral'?0:1);if(disconnected==='clutch')run.held.add('clutch');run.step(180,false);
      expect(run.car.drivetrain.rpm).toBeGreaterThan(3000);
      for(let i=0;i<4;i++)expect(Math.abs(run.car.wheelRotation(i))).toBeLessThan(.001);
    }finally{run.dispose();}
  });
  it('stops the driven wheels with the service brake and clears spin on reset',()=>{
    const run=fixture();try{
      drive(run,1);run.step(120);run.held.delete('throttle');run.held.add('brake');run.step(120);
      const angles=[run.car.wheelRotation(0),run.car.wheelRotation(1)];run.step(30);
      for(let i=0;i<2;i++)expect(Math.abs(run.car.wheelRotation(i)-angles[i])).toBeLessThan(.01);
      run.car.reset({x:0,z:0},0);for(let i=0;i<4;i++)expect(run.car.wheelRotation(i)).toBe(0);
    }finally{run.dispose();}
  });
  it('preserves rolling inertia in the air and applies the handbrake to the rear axle',()=>{
    const run=fixture();try{
      const {car,world}=run;car.reset({x:0,z:0},0);car.drivetrain.handbrake=false;run.step(120);
      car.body.setLinvel({x:0,y:0,z:4},true);run.step(10);
      const before=[0,1,2,3].map(i=>car.wheelRotation(i));
      expect(before.every(angle=>angle>0)).toBe(true);
      world.gravity={x:0,y:0,z:0};car.body.setTranslation({x:0,y:4,z:0},true);car.body.setLinvel({x:0,y:0,z:0},true);
      car.drivetrain.handbrake=true;run.step(1);
      const rear=car.wheelRotation(2);run.step(30);
      expect(Math.abs(car.wheelRotation(0)-before[0])).toBeGreaterThan(1);
      expect(Math.abs(car.wheelRotation(2)-rear)).toBeLessThan(.01);
    }finally{run.dispose();}
  });
});
