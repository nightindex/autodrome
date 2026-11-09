import {beforeAll,describe,expect,it} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import {Vehicle} from '../src/simulation/vehicle';
import {vehicleConfig as config} from '../src/data/vehicle';
import {curbGeometry} from '../src/render/road-geometry';
import {addStaticObstacle} from '../src/simulation/static-collision';
import type {Input} from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});

function vergeCurb({side=1,height=.2}={}){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
  const car=new Vehicle(world,new Set()),held=new Set<string>();
  const near=0,far=.24,span=30;
  const geometry=curbGeometry({black:[[[[near,-span],[far,-span],[far,span],[near,span],[near,-span]]]],yellow:[]},{height:height-.02,bevel:.02});
  addStaticObstacle(world,geometry,car.obstacles);geometry.dispose();
  car.surfaceAt=point=>(side===1?point.x<near:point.x>far)?'grass':'asphalt';
  // The tyres start clear of concrete, alongside a long curb. An end cannot
  // be driven around while satisfying the full-footprint clearance check.
  car.reset({x:side===1?-1:1.24,z:0},0);
  const input={down:(action:string)=>held.has(action)}as Input;
  const step=(frames:number)=>{for(let i=0;i<frames;i++)car.update(1/60,input,true);};
  step(120);
  const initial={...car.body.translation()};
  const drive=(frames=600)=>{
    held.add('throttle');held.add(side===1?'left':'right');
    let cleared=false,peak=car.body.translation().y,minimumUp=1,finite=true;
    for(let i=0;i<frames;i++){
      step(1);const p=car.body.translation(),q=car.body.rotation();
      finite&&=[p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite);
      peak=Math.max(peak,p.y);minimumUp=Math.min(minimumUp,1-2*(q.x*q.x+q.z*q.z));
      const tyres=Array.from({length:car.body.numColliders()},(_,j)=>car.body.collider(j))
        .filter(collider=>collider.handle!==car.collider.handle);
      cleared=tyres.every(tyre=>{
        const p=tyre.translation();
        return(side===1?p.x-config.wheelRadius>far:p.x+config.wheelRadius<near)&&Math.abs(p.z)<span-1;
      });
      if(cleared)break;
    }
    const position=car.body.translation(),distance=Math.hypot(position.x-initial.x,position.z-initial.z);
    return {cleared,peak,minimumUp,finite,position,distance,speed:car.telemetry().speed};
  };
  return {car,held,initial,step,drive,dispose(){car.dispose();world.free();}};
}

describe('steering onto a curb from the grass verge',()=>{
  it.each([1,-1])('can roll across a 20 cm curb from a parallel stop, direction=%s',side=>{
    const run=vergeCurb({side});
    try{
      expect(run.car.telemetry().speed).toBeLessThan(.05);
      run.car.action('ignition');run.car.action('gear1',true);run.car.drivetrain.handbrake=false;
      const result=run.drive();
      expect(result.cleared,JSON.stringify(result)).toBe(true);expect(result.finite).toBe(true);
      expect(result.peak).toBeGreaterThan(run.initial.y+.06);
      expect(result.peak).toBeLessThan(run.initial.y+.7);expect(result.minimumUp).toBeGreaterThan(.8);
    }finally{run.dispose();}
  });
  it.each(['brake','clutch','engine-off','neutral'])('does not climb or lift with %s preventing axle power',state=>{
    const run=vergeCurb();
    try{
      run.car.action('ignition');run.car.action('gear1',true);run.car.drivetrain.handbrake=false;
      if(state==='engine-off')run.car.action('ignition');
      else if(state==='neutral')run.car.action('neutral');
      else{run.held.add(state);run.step(60);}
      const result=run.drive(300);
      expect(result.cleared,JSON.stringify(result)).toBe(false);expect(result.finite).toBe(true);
      expect(result.distance).toBeLessThan(.1);expect(result.peak).toBeLessThan(run.initial.y+.03);
    }finally{run.dispose();}
  });
  it('still blocks a wall above the wheel axles',()=>{
    const run=vergeCurb({height:.6});
    try{
      run.car.action('ignition');run.car.action('gear1',true);run.car.drivetrain.handbrake=false;
      const result=run.drive();
      expect(result.cleared,JSON.stringify(result)).toBe(false);expect(result.finite).toBe(true);
      expect(result.position.x).toBeLessThan(.24);expect(result.peak).toBeLessThan(run.initial.y+.35);
      expect(result.minimumUp).toBeGreaterThan(.8);
    }finally{run.dispose();}
  });
});
