import {beforeAll,describe,expect,it} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import {Quaternion,Vector3} from 'three';
import {Vehicle} from '../src/simulation/vehicle';
import {hillColliderData} from '../src/render/hill-structure';
import type {Input} from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});

function park(grade:number,yaw:number,brake:'handbrake'|'service',grass=false,dt=1/60){
  const world=new RAPIER.World({x:0,y:-9.81,z:0}),angle=Math.atan(grade);
  const slope=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle);
  world.createCollider(RAPIER.ColliderDesc.cuboid(1000,.2,1000)
    .setTranslation(0,-.2/Math.cos(angle),0).setRotation(slope));
  const car=new Vehicle(world,new Set());car.reset({x:0,z:0},yaw);
  car.body.setRotation(slope.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),yaw)),true);
  car.drivetrain.handbrake=brake==='handbrake';
  if(grass)car.surfaceAt=()=> 'grass';
  const input={down:(key:string)=>brake==='service'&&key==='brake'}as Input;
  const step=(seconds:number)=>{for(let i=0;i<Math.round(seconds/dt);i++)car.update(dt,input,true);};
  return {car,step,dispose(){car.dispose();world.free();}};
}

function actualHill(){
  const world=new RAPIER.World({x:0,y:-9.81,z:0}),hill=hillColliderData();
  world.createCollider(RAPIER.ColliderDesc.trimesh(hill.positions,hill.indices).setFriction(.9));
  const car=new Vehicle(world,new Set());car.reset({x:8,z:42},Math.PI/2);
  const input={down:()=>false}as unknown as Input;
  const step=(frames:number)=>{for(let i=0;i<frames;i++)car.update(1/60,input,true);};
  step(300);
  return {car,step,dispose(){car.dispose();world.free();}};
}

describe('static brake holding on slopes',()=>{
  it.each([.1,.164,.3].flatMap(grade=>[0,Math.PI/4,Math.PI/2].flatMap(yaw=>
    (['handbrake','service']as const).map(brake=>({grade,yaw,brake}))))
  )('holds its position on grade=$grade at yaw=$yaw with $brake',({grade,yaw,brake})=>{
    const run=park(grade,yaw,brake);
    try{
      run.step(3);const start={...run.car.body.translation()};run.step(20);
      const end=run.car.body.translation();
      // A parked car must neither slide downhill nor creep uphill while the
      // suspension and solver keep balancing gravity over repeated steps.
      expect(Math.hypot(end.x-start.x,end.z-start.z)).toBeLessThan(.015);
      expect(Math.abs(end.y-start.y)).toBeLessThan(.015);
    }finally{run.dispose();}
  });

  it.each([1/30,1/120])('holds without a timestep-dependent drift at dt=%s',dt=>{
    const run=park(.164,Math.PI/2,'handbrake',false,dt);
    try{
      run.step(3);const start=run.car.body.translation().x;run.step(20);
      expect(Math.abs(run.car.body.translation().x-start)).toBeLessThan(.015);
    }finally{run.dispose();}
  });

  it('still slides when the rear tyres cannot supply enough grip on grass',()=>{
    const run=park(.3,Math.PI/2,'handbrake',true);
    try{
      run.step(3);const start=run.car.body.translation().x;run.step(5);
      expect(run.car.body.translation().x).toBeLessThan(start-1);
    }finally{run.dispose();}
  });

  it.each([{grade:.164,brake:'handbrake' as const},{grade:.3,brake:'service' as const}])(
    'holds on grass when the $brake has sufficient grip at grade=$grade',({grade,brake})=>{
      const run=park(grade,Math.PI/2,brake,true);
      try{
        run.step(3);const start=run.car.body.translation().x;run.step(20);
        expect(Math.abs(run.car.body.translation().x-start)).toBeLessThan(.015);
      }finally{run.dispose();}
    },
  );

  it('removes the holding force when the handbrake is released and preserves other forces',()=>{
    const run=park(.164,Math.PI/2,'handbrake');
    try{
      run.step(3);run.car.body.addForce({x:17,y:2,z:5},true);run.step(1/60);
      const force=run.car.body.userForce();
      expect(force.x).toBeCloseTo(17,3);expect(force.y).toBeCloseTo(2,3);expect(force.z).toBeCloseTo(5,3);
      run.car.body.resetForces(true);const start=run.car.body.translation().x;
      run.car.action('handbrake');run.step(2);
      expect(run.car.body.translation().x).toBeLessThan(start-.5);
      expect(run.car.body.userForce()).toEqual({x:0,y:0,z:0});
    }finally{run.dispose();}
  });

  it('holds the actual ascent for ten seconds and reports zero ground speed',()=>{
    const run=actualHill();
    try{
      const start={...run.car.body.translation()};run.step(600);const end=run.car.body.translation();
      expect(Math.hypot(end.x-start.x,end.z-start.z)).toBeLessThan(.01);
      expect(run.car.telemetry().speed).toBeLessThan(.001);
    }finally{run.dispose();}
  });

  it('reports the travelled surface speed while moving along the incline',()=>{
    const run=actualHill();
    try{
      const velocity=new Vector3(1,1.8/11,0).normalize().multiplyScalar(5);
      run.car.body.setLinvel(velocity,true);const t=run.car.telemetry();
      expect(t.speed).toBeCloseTo(5,4);expect(t.signedSpeed).toBeCloseTo(5,4);
    }finally{run.dispose();}
  });

  it('retains lateral slipping in the ground speed',()=>{
    const run=actualHill();
    try{
      run.car.body.setLinvel({x:0,y:0,z:3},true);const t=run.car.telemetry();
      expect(t.speed).toBeCloseTo(3,4);expect(Math.abs(t.signedSpeed)).toBeLessThan(.001);
    }finally{run.dispose();}
  });

  it('keeps horizontal speed while airborne without any supporting road plane',()=>{
    const run=actualHill();
    try{
      run.car.body.setTranslation({x:8,y:20,z:42},true);run.step(1);
      expect([0,1,2,3].every(i=>!run.car.controller.wheelIsInContact(i))).toBe(true);
      run.car.body.setLinvel({x:3,y:4,z:4},true);
      expect(run.car.telemetry().speed).toBeCloseTo(5,4);
    }finally{run.dispose();}
  });
});
