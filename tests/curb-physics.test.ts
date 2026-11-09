import { beforeAll,describe,expect,it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import { vehicleConfig as config } from '../src/data/vehicle';
import { curbGeometry } from '../src/render/road-geometry';
import { addStaticObstacle } from '../src/simulation/static-collision';
import { Vehicle } from '../src/simulation/vehicle';
import type { Input } from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});

const nearFace=6,farFace=6.24;
type ImpactOptions={kmh:number;height?:number;reverse?:boolean;yaw?:number;oneWheel?:boolean;wall?:boolean};

function impact({kmh,height=.2,reverse=false,yaw=0,oneWheel=false,wall=false}:ImpactOptions){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(1000,.2,1000).setTranslation(0,-.2,0));
  const car=new Vehicle(world,new Set()),input={down:()=>false}as unknown as Input;
  // Aim an oblique approach at the middle of the same eight-metre curb.
  const heading=yaw+(reverse?Math.PI:0);
  car.reset({x:-nearFace*Math.tan(yaw),z:0},heading);
  try{
    for(let i=0;i<60;i++)car.update(1/60,input,true);
    const initialHeight=car.body.translation().y,initialComHeight=car.body.worldCom().y;
    const initialSuspension=car.controller.wheelSuspensionLength(0)!;
    if(wall){
      const obstacle=world.createCollider(RAPIER.ColliderDesc.cuboid(4,.5,.12).setTranslation(0,.5,(nearFace+farFace)/2));
      car.obstacles.add(obstacle.handle);
    }else{
      const left=oneWheel?-.95:-4,right=oneWheel?-.5:4;
      // curbGeometry places its upper face 2 cm above the supplied height.
      const geometry=curbGeometry({black:[[[[left,nearFace],[right,nearFace],[right,farFace],[left,farFace],[left,nearFace]]]],yellow:[]},{height:height-.02,bevel:.02});
      addStaticObstacle(world,geometry,car.obstacles);geometry.dispose();
    }
    car.action('handbrake');
    const signedSpeed=kmh/3.6*(reverse?-1:1);
    car.body.setLinvel({x:Math.sin(heading)*signedSpeed,y:0,z:Math.cos(heading)*signedSpeed},true);
    const initialEnergy=.5*car.body.mass()*signedSpeed*signedSpeed;
    let collided=false,chassisContact=false,crossedBothAxles=false,finite=true,firstImpactKmh:number|null=null;
    let peakHeight=initialHeight,furthest=0,peakMechanicalEnergy=initialEnergy;
    let minSuspension=initialSuspension,maxSuspension=initialSuspension;
    for(let step=0;step<600;step++){
      car.update(1/60,input,true);
      const p=car.body.translation(),q=car.body.rotation(),v=car.body.linvel(),w=car.body.angvel();
      finite&&=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,v.x,v.y,v.z,w.x,w.y,w.z].every(Number.isFinite);
      peakHeight=Math.max(peakHeight,p.y);furthest=Math.max(furthest,p.z);
      for(let i=0;i<4;i++){
        const length=car.controller.wheelSuspensionLength(i)!;
        minSuspension=Math.min(minSuspension,length);maxSuspension=Math.max(maxSuspension,length);
      }
      if(car.collision){collided=true;firstImpactKmh??=Math.hypot(v.x,v.z)*3.6;}
      for(const handle of car.obstacles)world.contactPair(car.collider,world.getCollider(handle),manifold=>{
        for(let i=0;i<manifold.numContacts();i++)if(manifold.contactDist(i)<=0||manifold.contactImpulse(i)>0)chassisContact=true;
      });
      const rotation=new T.Quaternion(q.x,q.y,q.z,q.w);
      const wheels=Array.from({length:car.body.numColliders()},(_,i)=>car.body.collider(i))
        .filter(collider=>collider.handle!==car.collider.handle).map(collider=>collider.translation());
      // Require all tyres to clear the far face while still inside the curb's
      // span, so passing around an end cannot masquerade as climbing over it.
      crossedBothAxles ||= wheels.length===4&&wheels.every(wheel=>wheel.z>farFace+config.wheelRadius&&Math.abs(wheel.x)<4-config.wheelRadius);
      const frame=car.body.principalInertiaLocalFrame(),inertia=car.body.principalInertia();
      const angularVelocity=new T.Vector3(w.x,w.y,w.z).applyQuaternion(rotation.multiply(new T.Quaternion(frame.x,frame.y,frame.z,frame.w)).invert());
      const angularEnergy=.5*(inertia.x*angularVelocity.x**2+inertia.y*angularVelocity.y**2+inertia.z*angularVelocity.z**2);
      const energy=.5*car.body.mass()*(v.x*v.x+v.y*v.y+v.z*v.z)+angularEnergy+car.body.mass()*9.81*(car.body.worldCom().y-initialComHeight);
      peakMechanicalEnergy=Math.max(peakMechanicalEnergy,energy);
    }
    const finalTyres=Array.from({length:4},(_,i)=>car.body.collider(i+1).translation());
    return {collided,chassisContact,crossedBothAxles,finite,firstImpactKmh,initialHeight,peakHeight,furthest,initialEnergy,peakMechanicalEnergy,initialSuspension,minSuspension,maxSuspension,finalTyres,finalSpeed:car.telemetry().speed};
  }finally{car.dispose();world.free();}
}

describe('physical curb crossing',()=>{
  it.each([false,true])('can carry both axles over a 20 cm curb at 50 km/h (reverse=%s)',reverse=>{
    const result=impact({kmh:50,reverse});
    expect(result.collided).toBe(true);expect(result.finite).toBe(true);
    expect(result.crossedBothAxles).toBe(true);
    expect(result.firstImpactKmh).not.toBeNull();expect(result.firstImpactKmh!).toBeLessThan(40);
    expect(result.peakHeight).toBeGreaterThan(result.initialHeight+.2);
    expect(result.peakHeight).toBeLessThan(result.initialHeight+3);
    expect(result.minSuspension).toBeLessThan(result.initialSuspension-.02);
    expect(result.maxSuspension).toBeGreaterThan(result.initialSuspension+.02);
    expect(result.finalSpeed).toBeLessThan(50/3.6*.8);
    // Include rotation and gravitational potential, allowing the small amount
    // of energy stored in the already compressed suspension at the start.
    expect(result.peakMechanicalEnergy).toBeLessThan(result.initialEnergy*1.02+600);
  });

  it('blocks an 8 km/h approach without lifting the front axle over the curb',()=>{
    const result=impact({kmh:8});
    expect(result.collided).toBe(true);expect(result.crossedBothAxles).toBe(false);
    expect(result.furthest).toBeLessThan(nearFace-config.wheelbase/2);
    expect(result.finalSpeed).toBeLessThan(.5);
  });

  it('can ground its 160 mm belly on a 200 mm curb after a passive 25 km/h impact',()=>{
    const result=impact({kmh:25});
    expect(result.collided).toBe(true);expect(result.finite).toBe(true);
    expect(result.peakHeight).toBeGreaterThan(result.initialHeight+.1);
    expect(result.peakHeight).toBeLessThan(result.initialHeight+1);
    // The corrected floor is lower than the curb. Momentum can carry the
    // front axle across while the real chassis contact arrests the rear axle.
    expect(result.finalTyres.slice(0,2).every(w=>w.z>farFace+config.wheelRadius)).toBe(true);
    expect(result.finalTyres.slice(2).some(w=>w.z<farFace)).toBe(true);
    expect(result.chassisContact).toBe(true);expect(result.crossedBothAxles).toBe(false);
    expect(result.finalSpeed).toBeLessThan(.5);
    expect(result.peakMechanicalEnergy).toBeLessThan(result.initialEnergy*1.02+600);
  });

  it.each([{height:.32,wall:false},{height:1,wall:true}])('still blocks a 50 km/h impact against $height m of concrete',options=>{
    const result=impact({kmh:50,...options});
    expect(result.collided).toBe(true);expect(result.finite).toBe(true);
    expect(result.crossedBothAxles).toBe(false);
    expect(result.furthest).toBeLessThan(nearFace-config.wheelbase/2);
    expect(result.finalSpeed).toBeLessThan(.5);
  });

  it.each([{yaw:Math.PI/6,oneWheel:false},{yaw:Math.PI/4,oneWheel:false},{yaw:0,oneWheel:true}])('retains a finite physical impact for yaw=$yaw, oneWheel=$oneWheel',options=>{
    const result=impact({kmh:50,...options});
    expect(result.collided).toBe(true);expect(result.finite).toBe(true);
    expect(result.peakHeight).toBeLessThan(result.initialHeight+4);
    // An asymmetric hit may turn or overturn the car; no upright correction
    // or guaranteed crossing should be imposed on that physical outcome.
  });
});
