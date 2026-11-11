import {beforeAll,describe,expect,it} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {Vehicle} from '../src/simulation/vehicle';
import {hillHeight} from '../src/data/course';
import {hillColliderData} from '../src/render/hill-structure';
import {curbGeometry} from '../src/render/road-geometry';
import {addStaticObstacle} from '../src/simulation/static-collision';
import type {Input} from '../src/simulation/input';
beforeAll(async()=>{await RAPIER.init();});
const idle={down:()=>false} as unknown as Input;
function fixture(){
 const world=new RAPIER.World({x:0,y:-9.81,z:0});world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
 const car=new Vehicle(world,new Set());car.reset({x:10,z:0},0);world.step();
 return {world,car,dispose:()=>{car.dispose();world.free();}};
}
function overturn(car:Vehicle,x=0,z=0,yaw=.7){
 car.body.setTranslation({x,y:hillHeight(x,z)+.5,z},true);
 car.body.setRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI)),true);
 car.body.setLinvel({x:0,y:0,z:0},true);car.body.setAngvel({x:0,y:1,z:0},true);
}
function groundedFixture(gear=1){
 const world=new RAPIER.World({x:0,y:-9.81,z:0});world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
 const car=new Vehicle(world,new Set()),held=new Set<string>(),input={down:(action:string)=>held.has(action)}as unknown as Input;
 const geometry=curbGeometry({black:[[[[-30,3],[30,3],[30,3.24],[-30,3.24],[-30,3]]]],yellow:[]},{height:.18,bevel:.02});
 const curb=addStaticObstacle(world,geometry,car.obstacles)!;geometry.dispose();car.surfaceAt=p=>p.z>3.24?'grass':'asphalt';
 car.reset({x:0,z:3.12},0);
 const step=(frames:number)=>{for(let i=0;i<frames;i++)car.update(1/60,input,true);};step(120);
 car.action('ignition');car.action(gear<0?'reverse':'gear1',true);car.drivetrain.handbrake=false;
 return {world,car,curb,held,step,dispose(){car.dispose();world.free();}};
}
describe('overturned vehicle recovery',()=>{
 it('rights the car without resetting time, heading, belt or lights, then allows driving again',()=>{
  const {car,dispose}=fixture();try{
   car.time=25;car.action('belt');car.action('ignition');car.action('headlights');car.action('indicatorLeft');overturn(car);
   expect(car.canRecover).toBe(true);expect(car.recover()).toBe(true);
   expect(car.telemetry()).toMatchObject({time:25,gear:0,engine:true,belt:true,handbrake:true,headlights:true,indicator:'left'});expect(car.telemetry().yaw).toBeCloseTo(.7,5);
   expect(car.body.linvel()).toEqual({x:0,y:0,z:0});expect(car.body.angvel()).toEqual({x:0,y:0,z:0});expect(car.canRecover).toBe(false);
   for(let i=0;i<120;i++)car.update(1/60,idle,true);
   expect([0,1,2,3].every(i=>car.controller.wheelIsInContact(i))).toBe(true);
   car.action('gear1',true);car.action('handbrake');const start=car.telemetry().position;
   const throttle={down:(key:string)=>key==='throttle'} as unknown as Input;for(let i=0;i<180;i++)car.update(1/60,throttle,true);
   const end=car.telemetry().position;expect(Math.hypot(end.x-start.x,end.z-start.z)).toBeGreaterThan(2);
  }finally{dispose();}
 });
 it('rejects an upright or still moving car',()=>{
  const {car,dispose}=fixture();try{
   expect(car.recover()).toBe(false);overturn(car);car.body.setLinvel({x:4,y:0,z:0},true);
   expect(car.canRecover).toBe(false);expect(car.recover()).toBe(false);
  }finally{dispose();}
 });
 it('lands on the ramp surface rather than underneath the deck',()=>{
  const {world,car,dispose}=fixture();try{
   const hill=hillColliderData();world.createCollider(RAPIER.ColliderDesc.trimesh(hill.positions,hill.indices));world.step();overturn(car,8,42,Math.PI/2);
   expect(car.recover()).toBe(true);expect(car.body.translation().y).toBeGreaterThan(hillHeight(8,42)+.67);
   for(let i=0;i<180;i++)car.update(1/60,idle,true);
   expect(car.canRecover).toBe(false);expect(car.body.translation().y).toBeGreaterThan(hillHeight(car.body.translation().x,42)+.3);
   expect([0,1,2,3].every(i=>car.controller.wheelIsInContact(i))).toBe(true);
  }finally{dispose();}
 });
 it('moves clear of nearby obstacles and leaves the car unchanged if no placement is free',()=>{
  const {world,car,dispose}=fixture();try{
   const wall=world.createCollider(RAPIER.ColliderDesc.cuboid(.2,1,.2).setTranslation(0,1,0));car.obstacles.add(wall.handle);world.step();overturn(car);
   expect(car.recover()).toBe(true);expect(Math.hypot(car.body.translation().x,car.body.translation().z)).toBeGreaterThan(1);
   const block=world.createCollider(RAPIER.ColliderDesc.cuboid(20,3,20).setTranslation(0,3,0));car.obstacles.add(block.handle);world.step();overturn(car);
   const before=car.body.translation(),rotation=car.body.rotation();expect(car.recover()).toBe(false);expect(car.body.translation()).toEqual(before);expect(car.body.rotation()).toEqual(rotation);
  }finally{dispose();}
 });
 it('keeps the full cabin clear of overhead obstacles when righting the car',()=>{
  const {world,car,dispose}=fixture();try{
   // This beam is above the old recovery probe but intersects the corrected
   // full-height cabin at the initial upright spawn, before it settles.
   const beam=world.createCollider(RAPIER.ColliderDesc.cuboid(.2,.1,.2).setTranslation(0,1.5,0));
   car.obstacles.add(beam.handle);world.step();overturn(car);
   expect(car.recover()).toBe(true);
   expect(Math.hypot(car.body.translation().x,car.body.translation().z)).toBeGreaterThan(1);
   world.propagateModifiedBodyPositionsToColliders();
   expect(beam.intersectsShape(car.collider.shape,car.collider.translation(),car.collider.rotation())).toBe(false);
   const ceiling=world.createCollider(RAPIER.ColliderDesc.cuboid(20,.1,20).setTranslation(0,1.5,0));
   car.obstacles.add(ceiling.handle);world.step();overturn(car);
   const before=car.body.translation(),rotation=car.body.rotation();
   expect(car.recover()).toBe(false);expect(car.body.translation()).toEqual(before);expect(car.body.rotation()).toEqual(rotation);
  }finally{dispose();}
 });
});

describe('grounded vehicle recovery',()=>{
 it.each([1,-1])('detects sustained failed gear %i launches on a real curb and recovers to asphalt',gear=>{
  const run=groundedFixture(gear);try{
   const {car,held,step,world,curb}=run,start={...car.body.translation()};
   expect(car.recoveryReason).toBe(null);held.add('throttle');step(120);expect(car.canRecover).toBe(false);
   step(180);expect(car.recoveryReason).toBe('stuck');expect(car.drivetrain.gear).toBe(gear);
   expect(car.telemetry().speed).toBeLessThan(.1);expect(Math.hypot(car.body.translation().x-start.x,car.body.translation().z-start.z)).toBeLessThan(.5);
   let grounded=false;world.contactPair(car.collider,curb,manifold=>{
    for(let i=0;i<manifold.numContacts();i++)if(Math.abs(manifold.normal().y)>.9&&manifold.contactDist(i)<=0)grounded=true;
   });expect(grounded).toBe(true);
   held.clear();step(60);expect(car.recoveryReason).toBe('stuck');
   const time=car.time;car.action('belt');car.action('headlights');
   expect(car.recover()).toBe(true);expect(car.recoveryReason).toBe(null);
   expect(car.telemetry()).toMatchObject({time,engine:true,gear:0,handbrake:true,belt:true,headlights:true});
   expect(car.telemetry().wheels.every(w=>car.surfaceAt(w)==='asphalt')).toBe(true);
   step(120);expect(car.canRecover).toBe(false);expect([0,1,2,3].every(i=>car.controller.wheelIsInContact(i))).toBe(true);
   const position=car.telemetry().position;car.action('reverse',true);car.drivetrain.handbrake=false;held.add('throttle');step(180);
   expect(car.telemetry().signedSpeed).toBeLessThan(-.5);expect(Math.hypot(car.body.translation().x-position.x,car.body.translation().z-position.z)).toBeGreaterThan(2);
  }finally{run.dispose();}
 });
 it.each(['parked','brake','clutch','engine-off','neutral'])('does not offer stuck recovery with %s controls',mode=>{
  const run=groundedFixture();try{
   run.held.add('throttle');
   if(mode==='parked')run.car.drivetrain.handbrake=true;
   if(mode==='brake'||mode==='clutch')run.held.add(mode);
   if(mode==='engine-off')run.car.action('ignition');
   if(mode==='neutral')run.car.action('neutral');
   run.step(420);expect(run.car.canRecover).toBe(false);expect(run.car.recover()).toBe(false);
  }finally{run.dispose();}
 });
 it('restarts the attempt timer when the driver releases the throttle',()=>{
  const run=groundedFixture();try{
   run.held.add('throttle');run.step(150);expect(run.car.canRecover).toBe(false);
   run.held.clear();run.step(30);run.held.add('throttle');run.step(150);expect(run.car.canRecover).toBe(false);
   run.step(120);expect(run.car.recoveryReason).toBe('stuck');
  }finally{run.dispose();}
 });
 it('clears the stuck state after real travel or reset and rejects recovery while moving',()=>{
  const run=groundedFixture();try{
   const {car,held,step}=run;held.add('throttle');step(300);expect(car.recoveryReason).toBe('stuck');
   car.body.setLinvel({x:0,y:0,z:1},true);expect(car.canRecover).toBe(false);
   held.clear();const p=car.body.translation();car.body.setTranslation({x:p.x,y:p.y,z:p.z-3},true);car.body.setLinvel({x:0,y:0,z:0},true);step(120);
   expect(car.recoveryReason).toBe(null);
   car.reset({x:0,z:3.12},0);step(120);car.action('ignition');car.action('gear1',true);car.drivetrain.handbrake=false;held.add('throttle');step(300);
   expect(car.recoveryReason).toBe('stuck');car.reset({x:0,z:0},0);expect(car.recoveryReason).toBe(null);
  }finally{run.dispose();}
 });
 it('keeps healthy road launches and unsupported airborne power out of recovery',()=>{
  const {car,dispose}=fixture();try{
   car.action('ignition');car.action('gear1',true);car.drivetrain.handbrake=false;
   const throttle={down:(key:string)=>key==='throttle'} as unknown as Input;
   for(let i=0;i<420;i++){car.update(1/60,throttle,true);expect(car.recoveryReason).toBe(null);}
   for(let i=0;i<300;i++){
    const p=car.body.translation();car.body.setTranslation({x:p.x,y:20,z:p.z},true);car.body.setLinvel({x:0,y:0,z:0},true);car.body.setAngvel({x:0,y:0,z:0},true);
    car.update(1/60,throttle,true);expect(car.recoveryReason).toBe(null);
   }
  }finally{dispose();}
 });
 it('leaves a stuck car unchanged when no complete asphalt footprint is available',()=>{
  const run=groundedFixture();try{
   const {car,held,step}=run;held.add('throttle');step(300);held.clear();step(30);expect(car.recoveryReason).toBe('stuck');
   car.surfaceAt=()=> 'grass';const before={position:car.body.translation(),rotation:car.body.rotation(),velocity:car.body.linvel(),telemetry:car.telemetry()};
   expect(car.recover()).toBe(false);expect(car.body.translation()).toEqual(before.position);expect(car.body.rotation()).toEqual(before.rotation);
   expect(car.body.linvel()).toEqual(before.velocity);expect(car.telemetry()).toEqual(before.telemetry);expect(car.recoveryReason).toBe('stuck');
  }finally{run.dispose();}
 });
 it('still rights an overturned car when only grass is available',()=>{
  const {car,dispose}=fixture();try{
   car.surfaceAt=()=> 'grass';overturn(car);expect(car.recoveryReason).toBe('overturned');
   expect(car.recover()).toBe(true);expect(car.recoveryReason).toBe(null);
   for(let i=0;i<120;i++)car.update(1/60,idle,true);
   expect([0,1,2,3].every(i=>car.controller.wheelIsInContact(i))).toBe(true);
  }finally{dispose();}
 });
 it('searches beyond four metres for a full asphalt footprint and leaves a blocked recovery unchanged',()=>{
  const run=groundedFixture();try{
   const {car,held,step,world}=run;held.add('throttle');step(300);held.clear();step(30);expect(car.recoveryReason).toBe('stuck');
   const origin=car.body.translation();car.surfaceAt=p=>p.z<origin.z-4.5?'asphalt':'grass';
   expect(car.recover()).toBe(true);expect(car.telemetry().wheels.every(w=>car.surfaceAt(w)==='asphalt')).toBe(true);
   expect(Math.hypot(car.body.translation().x-origin.x,car.body.translation().z-origin.z)).toBeGreaterThan(4);
   car.reset({x:0,z:3.12},0);car.surfaceAt=p=>p.z>3.24?'grass':'asphalt';step(120);car.action('ignition');car.action('gear1',true);car.drivetrain.handbrake=false;held.add('throttle');step(300);held.clear();step(30);
   const wall=world.createCollider(RAPIER.ColliderDesc.cuboid(20,3,20).setTranslation(0,3,3));car.obstacles.add(wall.handle);world.step();
   car.body.setLinvel({x:0,y:0,z:0},true);car.body.setAngvel({x:0,y:0,z:0},true);
   const before=car.body.translation(),rotation=car.body.rotation(),telemetry=car.telemetry();expect(car.recover()).toBe(false);
   expect(car.body.translation()).toEqual(before);expect(car.body.rotation()).toEqual(rotation);expect(car.telemetry()).toEqual(telemetry);
  }finally{run.dispose();}
 });
});
