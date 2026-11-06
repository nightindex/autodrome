import { beforeAll,describe,expect,it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Vehicle } from '../src/simulation/vehicle';
import { ExamEngine } from '../src/simulation/exam';
import type { Input } from '../src/simulation/input';
import { curbGeometry } from '../src/render/road-geometry';
import { addStaticObstacle } from '../src/simulation/static-collision';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

beforeAll(async()=>{await RAPIER.init();});

function wallTrack(wallZ=2.1){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
  const wall=world.createCollider(RAPIER.ColliderDesc.cuboid(3,1,.2).setTranslation(0,1,wallZ));
  const car=new Vehicle(world,new Set([wall.handle])),input={down:()=>false}as unknown as Input;
  car.reset({x:0,z:0},0);
  const step=(count=1,exam?:ExamEngine)=>{
    for(let i=0;i<count;i++){car.update(1/60,input,true);exam?.update(car.telemetry(),{},1/60);}
  };
  return {world,wall,car,step,dispose(){car.dispose();world.free();}};
}

describe('obstacle collision state across vehicle resets',()=>{
  it('recovers sustained contact after repeatedly resetting into the same wall',()=>{
    const run=wallTrack();
    try{
      run.step(120);expect(run.car.collision).toBe(true);
      for(let attempt=0;attempt<3;attempt++){
        run.car.reset({x:0,z:0},0);expect(run.car.collision).toBe(false);
        run.step();expect(run.car.collision).toBe(true);
        run.step(119);expect(run.car.collision).toBe(true);
        // The solver has actually pushed the overlapping chassis away.
        expect(run.car.body.translation().z).toBeLessThan(-.1);
      }
    }finally{run.dispose();}
  });

  it('clears previous contact and hold when resetting away from an obstacle',()=>{
    const run=wallTrack();
    try{
      run.step();expect(run.car.collision).toBe(true);
      run.car.reset({x:0,z:-20},0);
      for(let i=0;i<120;i++){run.step();expect(run.car.collision).toBe(false);}
    }finally{run.dispose();}
  });

  it('counts sustained recovered wall contact as one exam collision episode',()=>{
    const run=wallTrack();
    try{
      run.step(120);run.car.reset({x:0,z:0},0);
      const exam=new ExamEngine('practice');run.step(360,exam);
      expect(run.car.collision).toBe(true);
      expect(exam.events.filter(event=>event.ruleId===30)).toHaveLength(1);
    }finally{run.dispose();}
  });

  it('keeps a short impact visible for the existing collision hold duration',()=>{
    const run=wallTrack();
    try{
      run.step();expect(run.car.collision).toBe(true);
      run.car.body.setTranslation({x:0,y:.67,z:-20},true);
      run.car.body.setLinvel({x:0,y:0,z:0},true);
      run.step(10);expect(run.car.collision).toBe(true);
      run.step(20);expect(run.car.collision).toBe(false);
    }finally{run.dispose();}
  });

  it('ignores a nearby speculative wall manifold without touching the wall',()=>{
    const run=wallTrack(2.255);
    try{
      run.car.body.lockRotations(true,true);run.step();
      let candidates=0,contacts=0;
      run.world.contactPairsWith(run.car.collider,other=>{
        if(other.handle!==run.wall.handle)return;
        candidates++;
        run.world.contactPair(run.car.collider,other,manifold=>{
          contacts+=manifold.numContacts();
          for(let i=0;i<manifold.numContacts();i++)expect(manifold.contactDist(i)).toBeGreaterThan(0);
        });
      });
      expect(candidates).toBe(1);expect(contacts).toBeGreaterThan(0);
      expect(run.car.collision).toBe(false);
      run.step(60);expect(run.car.collision).toBe(false);
      // The predictive pair already exists, so a later real impact must not
      // depend on Rapier emitting a second collision-start event.
      run.car.action('handbrake');run.car.body.setLinvel({x:0,y:0,z:2},true);
      run.step();expect(run.car.collision).toBe(true);
    }finally{run.dispose();}
  });

  it('rearms after clearing a local curb even when later curbs share its collider',()=>{
    const world=new RAPIER.World({x:0,y:-9.81,z:0});
    world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
    const sections=[6,16].map(z=>curbGeometry({black:[[[[-4,z],[4,z],[4,z+.24],[-4,z+.24],[-4,z]]]],yellow:[]},{height:.18,bevel:.02}));
    const geometry=mergeGeometries(sections)!;
    const obstacles=new Set<number>();addStaticObstacle(world,geometry,obstacles);
    geometry.dispose();sections.forEach(section=>section.dispose());
    const car=new Vehicle(world,obstacles),input={down:()=>false}as unknown as Input,exam=new ExamEngine('practice');
    const step=(count:number)=>{for(let i=0;i<count;i++){car.update(1/60,input,true);exam.update(car.telemetry(),{},1/60);}};
    try{
      car.reset({x:0,z:0},0);step(60);car.action('handbrake');car.body.setLinvel({x:0,y:0,z:50/3.6},true);step(240);
      expect(exam.events.filter(event=>event.ruleId===30)).toHaveLength(1);
      // Place the stopped car in the gap without resetting its collision or
      // scoring state. The shared mesh's bounds span both distant curbs.
      car.body.setTranslation({x:0,y:.67,z:11},true);car.body.setRotation({x:0,y:0,z:0,w:1},true);
      car.body.setLinvel({x:0,y:0,z:0},true);car.body.setAngvel({x:0,y:0,z:0},true);step(60);
      expect(car.collision).toBe(false);
      car.body.setLinvel({x:0,y:0,z:50/3.6},true);step(240);
      expect(exam.events.filter(event=>event.ruleId===30)).toHaveLength(2);
      car.reset({x:0,z:11},0);step(60);expect(car.collision).toBe(false);
    }finally{car.dispose();world.free();}
  });
});
