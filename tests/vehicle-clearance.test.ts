import { beforeAll,describe,expect,it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { vehicleConfig } from '../src/data/vehicle';
import { Vehicle } from '../src/simulation/vehicle';
import type { Input } from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});
const idle={down:()=>false} as unknown as Input;

function fixture(){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(20,.2,20).setTranslation(0,-.2,0));
  const car=new Vehicle(world,new Set());car.reset({x:0,z:0},0);
  const step=(frames=180)=>{for(let i=0;i<frames;i++)car.update(1/60,idle,true);};
  step();
  const floor=()=>{
    const p=car.body.translation(),origin={x:p.x,y:.01,z:p.z};
    const hit=car.collider.castRay(new RAPIER.Ray(origin,{x:0,y:1,z:0}),1,true);
    expect(hit).toBeGreaterThan(0);
    return origin.y+hit;
  };
  return {world,car,step,floor,dispose(){car.dispose();world.free();}};
}

describe('Cobalt physical ground clearance',()=>{
  it('has a 160 mm loaded central floor with the same body mass and four supported tyres',()=>{
    const run=fixture();
    try{
      expect(run.floor()).toBeCloseTo(vehicleConfig.groundClearance,2);
      expect(Math.abs(run.floor()-.160)).toBeLessThan(.005);
      const p=run.car.body.translation();
      const roofHit=run.car.collider.castRay(new RAPIER.Ray({x:p.x,y:3,z:p.z},{x:0,y:-1,z:0}),3,true);
      expect(roofHit).toBeGreaterThan(0);
      expect(Math.abs(3-roofHit-vehicleConfig.height)).toBeLessThan(.005);
      expect(run.car.body.mass()).toBeCloseTo(vehicleConfig.mass,3);
      expect(run.car.body.numColliders()).toBe(5);
      expect([0,1,2,3].every(index=>run.car.controller.wheelIsInContact(index))).toBe(true);
      expect(run.car.collision).toBe(false);
    }finally{run.dispose();}
  });

  it.each([{height:.155,touches:false},{height:.180,touches:true}])('physically $touches contacts a $height m obstacle between the wheel paths',({height,touches})=>{
    const run=fixture();
    try{
      const initialFloor=run.floor();
      const obstacle=run.world.createCollider(RAPIER.ColliderDesc.cuboid(.2,height/2,.25).setTranslation(0,height/2,0));
      run.car.obstacles.add(obstacle.handle);
      let collision=false,chassisTouch=false;
      for(let i=0;i<120;i++){
        run.step(1);collision||=run.car.collision;
        run.world.contactPair(run.car.collider,obstacle,manifold=>{
          for(let contact=0;contact<manifold.numContacts();contact++)if(manifold.contactDist(contact)<=0||manifold.contactImpulse(contact)>0)chassisTouch=true;
        });
      }
      expect(chassisTouch).toBe(touches);expect(collision).toBe(touches);
      if(touches)expect(run.floor()).toBeGreaterThan(initialFloor+.01);
      else expect(run.floor()).toBeCloseTo(initialFloor,3);
    }finally{run.dispose();}
  });
});
