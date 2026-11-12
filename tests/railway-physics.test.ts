import { beforeAll,describe,expect,it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { railwayCrossing,railwayRailCenters } from '../src/data/railway';
import { vehicleConfig } from '../src/data/vehicle';
import { addRailwayColliders } from '../src/simulation/railway-collision';
import { Vehicle } from '../src/simulation/vehicle';
import type { Input } from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});
const idleInput={down:()=>false}as unknown as Input;

function cross(kmh:number,withRails=true,reverse=false,yaw=0,direction=1){
  const world=new RAPIER.World({x:0,y:-9.81,z:0}),surfaces=new Set<number>();
  world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
  const railHandles=withRails?addRailwayColliders(world,surfaces).slice(0,2).map(collider=>collider.handle):[];
  const car=new Vehicle(world,new Set(),surfaces),c=railwayCrossing;
  car.reset({x:c.center.x-direction*6.5*Math.tan(yaw),z:c.center.z-direction*6.5},yaw+(direction<0?Math.PI:0)+(reverse?Math.PI:0));
  try{
    for(let step=0;step<90;step++)car.update(1/60,idleInput,true);
    car.action('handbrake');
    const initialHeight=car.body.translation().y,speed=kmh/3.6;
    car.body.setLinvel({x:Math.sin(yaw)*speed*direction,y:0,z:Math.cos(yaw)*speed*direction},true);
    let collided=false,finite=true,crossed=false,maxVerticalSpeed=0,maxPitchSpeed=0,maxSuspensionSpeed=0,minUpright=1,peakHeight=initialHeight;
    const previousLengths=Array.from({length:4},(_,i)=>car.controller.wheelSuspensionLength(i)!);
    const railContacts=[new Set<number>(),new Set<number>()];
    for(let step=0;step<600;step++){
      car.update(1/60,idleInput,true);
      const p=car.body.translation(),q=car.body.rotation(),v=car.body.linvel(),w=car.body.angvel();
      finite&&=[p.x,p.y,p.z,q.x,q.y,q.z,q.w,v.x,v.y,v.z,w.x,w.y,w.z].every(Number.isFinite);
      collided||=car.collision;peakHeight=Math.max(peakHeight,p.y);
      maxVerticalSpeed=Math.max(maxVerticalSpeed,Math.abs(v.y));maxPitchSpeed=Math.max(maxPitchSpeed,Math.abs(w.x));
      minUpright=Math.min(minUpright,1-2*(q.x*q.x+q.z*q.z));
      for(let i=0;i<4;i++){
        const length=car.controller.wheelSuspensionLength(i)!;
        maxSuspensionSpeed=Math.max(maxSuspensionSpeed,Math.abs(length-previousLengths[i])*60);previousLengths[i]=length;
      }
      for(let wheel=0;wheel<4;wheel++)if(car.controller.wheelIsInContact(wheel)){
        const rail=railHandles.indexOf(car.controller.wheelGroundObject(wheel)?.handle??-1);
        if(rail!==-1)railContacts[wheel<2?0:1].add(rail);
      }
      if(car.telemetry().wheels.every(wheel=>direction*(wheel.z-c.center.z)>c.deckHalfSpan+vehicleConfig.wheelRadius)){
        crossed=true;break;
      }
    }
    return {finite,collided,crossed,initialHeight,peakHeight,maxVerticalSpeed,maxPitchSpeed,maxSuspensionSpeed,minUpright,railContacts:railContacts.map(set=>set.size),finalSpeed:car.telemetry().speed};
  }finally{car.dispose();world.free();}
}

describe('traversable railway crossing',()=>{
  it('keeps the crossing deck between two railheads, with ordinary asphalt outside',()=>{
    const world=new RAPIER.World({x:0,y:-9.81,z:0}),surfaces=new Set<number>(),c=railwayCrossing;
    try{
      const colliders=addRailwayColliders(world,surfaces);world.step();
      const height=(offset:number)=>{
        const hit=world.castRay(new RAPIER.Ray({x:c.center.x,y:1,z:c.center.z+offset},{x:0,y:-1,z:0}),2,true);
        return hit?1-hit.timeOfImpact:undefined;
      };
      expect(colliders).toHaveLength(3);expect(surfaces.size).toBe(3);
      for(const rail of railwayRailCenters)expect(height(rail)).toBeCloseTo(c.railTop,4);
      expect(height(0)).toBeCloseTo(c.deckTop,4);
      expect(height(-c.gauge/2+c.grooveWidth/2)).toBeUndefined();
      expect(height(c.gauge/2-c.grooveWidth/2)).toBeUndefined();
      for(const offset of [-1.2,-.95,.95,1.2])expect(height(offset),'No slab outside the reference rails').toBeUndefined();
      // The source plan's crossing occupies about 17 pixels at 0.1 m/px.
      expect(c.deckHalfSpan*2).toBeGreaterThan(1.6);expect(c.deckHalfSpan*2).toBeLessThan(1.8);
    }finally{world.free();}
  });

  it('leaves no hidden track colliders on either verge',()=>{
    const world=new RAPIER.World({x:0,y:-9.81,z:0}),c=railwayCrossing;
    try{
      addRailwayColliders(world,new Set());world.step();
      expect(world.colliders.len()).toBe(3);
      for(const side of [-1,1])for(const offset of [-.796,0,.796,1.1,1.5]){
        const ray=new RAPIER.Ray({x:c.center.x+side*(c.length/2+.1),y:1,z:c.center.z+offset},{x:0,y:-1,z:0});
        expect(world.castRay(ray,2,true)).toBeNull();
      }
    }finally{world.free();}
  });

  it.each([8,25])('both axles traverse both rails at %s km/h without a collision penalty',kmh=>{
    const result=cross(kmh),flat=cross(kmh,false);
    expect(result.finite).toBe(true);expect(result.crossed).toBe(true);expect(result.collided).toBe(false);
    expect(result.railContacts).toEqual([2,2]);
    expect(result.peakHeight).toBeGreaterThan(flat.peakHeight+.008);
    expect(result.maxVerticalSpeed).toBeGreaterThan(flat.maxVerticalSpeed+.02);
    expect(result.minUpright).toBeGreaterThan(.95);
    expect(result.peakHeight-result.initialHeight).toBeLessThan(.18);
    expect(result.finalSpeed).toBeGreaterThan(kmh/3.6*.4);
  });

  it.each([{reverse:true,yaw:0},{reverse:false,yaw:Math.PI/9}])('also supports a reverse or oblique crossing: %o',options=>{
    const result=cross(15,true,options.reverse,options.yaw);
    expect(result.finite).toBe(true);expect(result.crossed).toBe(true);expect(result.collided).toBe(false);
    expect(result.railContacts).toEqual([2,2]);expect(result.minUpright).toBeGreaterThan(.95);
  });

  it('moves the suspension faster at speed using the same passive surfaces',()=>{
    for(const direction of [-1,1]){
      const slow=cross(8,true,false,0,direction),fast=cross(25,true,false,0,direction);
      // Two close rail impulses pass through a damped chassis; its peak rise
      // need not grow monotonically. Compare actual suspension travel speed.
      expect(slow.railContacts).toEqual([2,2]);expect(fast.railContacts).toEqual([2,2]);
      expect(slow.maxSuspensionSpeed).toBeLessThan(2);
      expect(fast.maxSuspensionSpeed).toBeGreaterThan(slow.maxSuspensionSpeed*1.3);
      expect(slow.finalSpeed).toBeLessThan(8/3.6);expect(fast.finalSpeed).toBeLessThan(25/3.6);
    }
  });
});
