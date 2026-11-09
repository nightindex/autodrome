import {beforeAll,describe,expect,it} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import {Vehicle} from '../src/simulation/vehicle';
import {vehicleConfig as config} from '../src/data/vehicle';
import {curbGeometry} from '../src/render/road-geometry';
import {addStaticObstacle} from '../src/simulation/static-collision';
import type {Input} from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});

function touchingCurb({height=.1,yaw=0,friction=.65,wall=false}={}){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
  const car=new Vehicle(world,new Set()),held=new Set<string>(),input={down:(action:string)=>held.has(action)}as Input;
  car.reset({x:0,z:3-config.wheelbase/2*Math.cos(yaw)-config.frontTrack/2*Math.sin(yaw)-config.wheelRadius-.003},yaw);
  let curb:RAPIER.Collider;
  if(wall)curb=world.createCollider(RAPIER.ColliderDesc.cuboid(20,.5,.12).setTranslation(0,.5,3.12));
  else{
    const geometry=curbGeometry({black:[[[[-20,3],[20,3],[20,3.24],[-20,3.24],[-20,3]]]],yellow:[]},{height:height-.02,bevel:.02});
    curb=addStaticObstacle(world,geometry,car.obstacles)!;geometry.dispose();
  }
  curb.setFriction(friction);car.obstacles.add(curb.handle);
  const step=(frames:number)=>{for(let i=0;i<frames;i++)car.update(1/60,input,true);};
  step(60);car.drivetrain.handbrake=false;
  // Seat the tyres against the real concrete, then let them come to rest.
  // No approach momentum is available when the tested throttle starts.
  for(let i=0;i<240;i++){
    car.body.setLinvel({x:Math.sin(yaw)*.3,y:0,z:Math.cos(yaw)*.3},true);step(1);
    if(car.collision)break;
  }
  car.body.setLinvel({x:0,y:0,z:0},true);car.drivetrain.handbrake=true;step(60);
  const initial={...car.body.translation()};
  car.action('ignition');car.action('gear1',true);car.drivetrain.handbrake=false;
  let peak=initial.y,cleared=false,clearSpeed=0;
  const drive=(frames=600)=>{
    for(let i=0;i<frames;i++){
      step(1);const p=car.body.translation(),q=car.body.rotation();peak=Math.max(peak,p.y);
      expect([p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite)).toBe(true);
      expect(1-2*(q.x*q.x+q.z*q.z)).toBeGreaterThan(.85);
      const tyres=Array.from({length:car.body.numColliders()},(_,j)=>car.body.collider(j)).filter(c=>c.handle!==car.collider.handle);
      if(tyres.every(t=>t.translation().z-config.wheelRadius>3.24&&Math.abs(t.translation().x)<19)){
        cleared=true;clearSpeed=car.telemetry().speed;break;
      }
    }
    return {cleared,peak,clearSpeed,position:car.body.translation()};
  };
  return {car,held,initial,step,drive,dispose(){car.dispose();world.free();}};
}

describe('powered rolling against a curb edge',()=>{
  it.each([0,Math.PI/6])('can climb a 10 cm curb from touching rest at yaw=%s',yaw=>{
    const run=touchingCurb({yaw});
    try{
      expect(run.car.telemetry().speed).toBeLessThan(.05);
      run.held.add('throttle');const result=run.drive();
      expect(result.cleared,JSON.stringify(result)).toBe(true);expect(result.peak).toBeGreaterThan(run.initial.y+.04);
      expect(result.peak).toBeLessThan(run.initial.y+.35);expect(result.clearSpeed).toBeLessThan(5);
    }finally{run.dispose();}
  });
  it.each(['brake','clutch'])('does not lift the car through a held %s pedal',pedal=>{
    const run=touchingCurb();
    try{
      run.held.add(pedal);run.step(60);run.held.add('throttle');const result=run.drive(240);
      expect(result.cleared).toBe(false);expect(result.peak).toBeLessThan(run.initial.y+.04);
      expect(new T.Vector3().copy(result.position).distanceTo(run.initial)).toBeLessThan(.1);
    }finally{run.dispose();}
  });
  it('cannot power up an edge after switching off the engine',()=>{
    const run=touchingCurb();
    try{
      // Let the flywheel stop before testing an unpowered throttle command.
      run.car.action('ignition');run.step(120);expect(run.car.drivetrain.rpm).toBe(0);
      const resting={...run.car.body.translation()};expect(run.car.telemetry().speed).toBeLessThan(.05);
      run.held.add('throttle');const result=run.drive(240);
      expect(result.cleared).toBe(false);expect(result.peak).toBeLessThan(resting.y+.01);
      expect(result.position.z).toBeLessThan(resting.z+.01);
    }finally{run.dispose();}
  });
  it('respects the concrete friction instead of guaranteeing a climb',()=>{
    const run=touchingCurb({friction:.02});
    try{
      run.held.add('throttle');const result=run.drive(360);
      expect(result.cleared).toBe(false);expect(result.peak).toBeLessThan(run.initial.y+.05);
    }finally{run.dispose();}
  });
  it('cannot climb a wall whose face reaches above the wheel axle',()=>{
    const run=touchingCurb({wall:true});
    try{
      run.held.add('throttle');const result=run.drive(360);
      expect(result.cleared).toBe(false);expect(result.peak).toBeLessThan(run.initial.y+.05);
      expect(result.position.z).toBeLessThan(run.initial.z+.1);
    }finally{run.dispose();}
  });
  it('can reverse away from a 32 cm obstacle that remains too high to climb',()=>{
    const run=touchingCurb({height:.32});
    try{
      run.held.add('throttle');expect(run.drive(300).cleared).toBe(false);
      run.held.clear();run.held.add('clutch');run.held.add('brake');run.step(60);
      run.car.action('reverse',true);expect(run.car.drivetrain.gear).toBe(-1);
      run.held.clear();run.held.add('throttle');const z=run.car.body.translation().z;run.step(120);
      expect(run.car.body.translation().z).toBeLessThan(z-1);expect(run.car.telemetry().signedSpeed).toBeLessThan(-.5);
    }finally{run.dispose();}
  });
});
