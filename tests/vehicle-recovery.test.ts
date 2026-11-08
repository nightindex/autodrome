import {beforeAll,describe,expect,it} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {Vehicle} from '../src/simulation/vehicle';
import {hillHeight} from '../src/data/course';
import {hillColliderData} from '../src/render/hill-structure';
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
});
