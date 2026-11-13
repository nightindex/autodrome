import {describe,expect,it} from 'vitest';
import * as T from 'three';
import type {Vehicle} from '../src/simulation/vehicle';
import {VehicleMotion} from '../src/render/vehicle-motion';

function fixture(){
  const position=new T.Vector3(),rotation=new T.Quaternion(),wheels=Array.from({length:4},()=>({steering:0,rotation:0,length:.28}));
  const vehicle={time:0,body:{translation:()=>position,rotation:()=>rotation},steering:{wheelAngle:0},
    controller:{wheelSteering:(i:number)=>wheels[i].steering,wheelSuspensionLength:(i:number)=>wheels[i].length},
    wheelRotation:(i:number)=>wheels[i].rotation} as unknown as Vehicle;
  return {vehicle,position,rotation,wheels,motion:new VehicleMotion()};
}

describe('fixed-step vehicle presentation',()=>{
  it('samples the same intermediate pose for chassis, handwheel, tyres and suspension without changing physics',()=>{
    const {vehicle,position,rotation,wheels,motion}=fixture();vehicle.time=1;motion.beforeStep(vehicle);
    vehicle.time+=1/60;position.set(2,4,6);rotation.setFromAxisAngle(new T.Vector3(0,1,0),.4);
    Object.assign(vehicle.steering,{wheelAngle:.4});
    wheels.forEach(w=>Object.assign(w,{steering:.2,rotation:4*Math.PI,length:.2}));
    const pose=motion.sample(vehicle,.5);
    expect(pose.position.toArray()).toEqual([1,2,3]);
    expect(new T.Euler().setFromQuaternion(pose.rotation).y).toBeCloseTo(.2,10);
    expect(pose.handwheel).toBeCloseTo(.2,10);
    expect(pose.wheels[0].steering).toBeCloseTo(.1,10);
    expect(pose.wheels[0].rotation).toBeCloseTo(2*Math.PI,10);
    expect(pose.wheels[0].suspensionLength).toBeCloseTo(.24,10);
    expect(position.toArray()).toEqual([2,4,6]);expect(vehicle.time).toBeCloseTo(1+1/60,10);
  });
  it('uses the shortest quaternion arc across the yaw wrap',()=>{
    const {vehicle,rotation,motion}=fixture();vehicle.time=1;
    rotation.setFromAxisAngle(new T.Vector3(0,1,0),179*Math.PI/180);motion.beforeStep(vehicle);
    vehicle.time+=1/60;rotation.setFromAxisAngle(new T.Vector3(0,1,0),-179*Math.PI/180);
    expect(motion.sample(vehicle,.5).rotation.angleTo(new T.Quaternion(0,1,0,0))).toBeLessThan(1e-7);
  });
  it('uses only the last physics pair when a rendered frame contains several steps',()=>{
    const {vehicle,position,motion}=fixture();
    for(let i=0;i<3;i++){motion.beforeStep(vehicle);vehicle.time+=1/60;position.x++;}
    expect(motion.sample(vehicle,.25).position.x).toBeCloseTo(2.25,10);
  });
  it('snaps on reset, pause/resume and externally advanced states; direct inspection uses the latest pose',()=>{
    const {vehicle,position,motion}=fixture();vehicle.time=1;motion.beforeStep(vehicle);
    vehicle.time+=1/60;position.x=2;
    expect(motion.sample(vehicle).position.x).toBe(2);
    expect(motion.sample(vehicle,-1).position.x).toBe(0);
    expect(motion.sample(vehicle,2).position.x).toBe(2);
    expect(motion.sample(vehicle,NaN).position.x).toBe(2);
    motion.reset();expect(motion.sample(vehicle,0).position.x).toBe(2);
    motion.beforeStep(vehicle);vehicle.time=0;position.x=100;
    expect(motion.sample(vehicle,.5).position.x).toBe(100);
    motion.beforeStep(vehicle);vehicle.time=.1;position.x=110;
    expect(motion.sample(vehicle,.5).position.x).toBe(110);
  });
  it.each([45,90,144,0])('removes fixed-step speed and yaw judder at %i FPS (0 = variable cadence)',fps=>{
    const {vehicle,position,rotation,motion}=fixture();
    let elapsed=0,accumulator=0,lastVisual=0,lastPhysical=0;
    const visualSpeeds:number[]=[],physicalSpeeds:number[]=[];
    for(let frame=0;frame<120;frame++){
      const dt=fps?1/fps:[1/40,1/90,1/55,1/120][frame%4];
      elapsed+=dt;accumulator+=dt;
      while(accumulator>=1/60){
        motion.beforeStep(vehicle);vehicle.time+=1/60;position.x=vehicle.time*8;
        rotation.setFromAxisAngle(new T.Vector3(0,1,0),vehicle.time*.3);accumulator-=1/60;
      }
      const pose=motion.sample(vehicle,accumulator*60);
      if(frame>3){
        expect(pose.position.x).toBeCloseTo((elapsed-1/60)*8,8);
        expect(new T.Euler().setFromQuaternion(pose.rotation).y).toBeCloseTo((elapsed-1/60)*.3,7);
        visualSpeeds.push((pose.position.x-lastVisual)/dt);physicalSpeeds.push((position.x-lastPhysical)/dt);
      }
      lastVisual=pose.position.x;lastPhysical=position.x;
    }
    expect(Math.max(...visualSpeeds)-Math.min(...visualSpeeds)).toBeLessThan(1e-8);
    expect(Math.max(...physicalSpeeds)-Math.min(...physicalSpeeds)).toBeGreaterThan(1);
  });
});
