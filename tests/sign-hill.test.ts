import { describe,expect,it,beforeAll } from 'vitest';
import * as T from 'three';
import polygonClipping from 'polygon-clipping';
import RAPIER from '@dimforge/rapier3d-compat';
import { signShape,signSpecifications,type SignKind } from '../src/render/road-signs';
import { hillBounds,hillHeight,hillProfile } from '../src/data/course';
import { hillColliderData,hillEdgeSections,createHillStructure,hillKerbProfile,hillKerbTop } from '../src/render/hill-structure';
import {addStaticObstacle} from '../src/simulation/static-collision';
import { boundaryLoops,curbSurface } from '../src/render/course-world';
import { Vehicle } from '../src/simulation/vehicle';
import type { Input } from '../src/simulation/input';

describe('physical sign silhouettes',()=>{
  it('uses cut-out round, octagonal and triangular boards with upright, correctly sized outlines',()=>{
    for(const kind of Object.keys(signSpecifications) as SignKind[]){
      const g=new T.ShapeGeometry(signShape(kind),32);g.computeBoundingBox();const size=g.boundingBox!.getSize(new T.Vector3()),spec=signSpecifications[kind];
      expect(size.x).toBeCloseTo(spec.width,3);expect(size.y).toBeCloseTo(spec.height,3);
      const p=g.getAttribute('position'),corners=Array.from({length:p.count},(_,i)=>Math.abs(p.getX(i))>spec.width*.49&&Math.abs(p.getY(i))>spec.height*.49);
      if(spec.outline==='circle'||spec.outline==='octagon')expect(corners.every(c=>!c)).toBe(true);
    }
    expect(signShape('ascent').getPoints().some(p=>p.y>0&&Math.abs(p.x)<.01)).toBe(true);
    expect(signShape('yield').getPoints().some(p=>p.y<0&&Math.abs(p.x)<.01)).toBe(true);
  });
});
describe('higher reference-style ramp',()=>{
  it('raises both wheel kerbs 60 cm above the road and blends into the ordinary curb at each foot',()=>{
    const root=createHillStructure(boundaryLoops),edge=root.getObjectByName('hill-concrete-edges') as T.Mesh;edge.updateMatrixWorld();
    try{
      for(const x of [2.01,3.5,8,13,17,22,28,31.5,32.99])for(const z of [36.375,44.625]){
        const hit=new T.Raycaster(new T.Vector3(x,5,z),new T.Vector3(0,-1,0)).intersectObject(edge)[0];
        expect(hit,`top at ${x},${z}`).toBeDefined();expect(hit.point.y-hillHeight(x,z)).toBeCloseTo(hillKerbTop(x),3);
      }
      expect(hillKerbTop(17)-.02).toBeCloseTo(.6);expect(hillKerbTop(2)).toBeCloseTo(.2);expect(hillKerbTop(33)).toBeCloseTo(.2);
      expect(hillKerbProfile.width).toBe(.4);
    }finally{root.traverse(node=>{if(node instanceof T.Mesh)node.geometry.dispose();});}
  });
  it('uses a continuous 1.8 m profile and identical elevations in every physical collider vertex',()=>{
    expect(hillHeight(17,42)).toBeCloseTo(1.8);expect(hillHeight(2,42)).toBe(0);expect(hillHeight(33,42)).toBe(0);
    const {positions}=hillColliderData();for(let i=0;i<positions.length;i+=3)expect(positions[i+1]).toBeCloseTo(hillHeight(positions[i],positions[i+2]),5);
    expect(hillHeight(8,42)/6).toBeCloseTo(1.8/11);
  });
  it('removes striped curbs from the ramp and follows both sides with concrete edging',()=>{
    const ramp=[[[[hillProfile.start,hillBounds.minZ],[hillProfile.end,hillBounds.minZ],[hillProfile.end,hillBounds.maxZ],[hillProfile.start,hillBounds.maxZ],[hillProfile.start,hillBounds.minZ]]]] as polygonClipping.MultiPolygon;
    expect(polygonClipping.intersection(curbSurface.black,ramp)).toEqual([]);expect(polygonClipping.intersection(curbSurface.yellow,ramp)).toEqual([]);
    const edges=hillEdgeSections(boundaryLoops);expect(edges.length).toBeGreaterThan(20);expect(edges.some(s=>s.a.z<40)).toBe(true);expect(edges.some(s=>s.a.z>42)).toBe(true);
    for(const s of edges)for(const p of [s.a,s.b]){expect(p.x).toBeGreaterThanOrEqual(hillProfile.start-1e-6);expect(p.x).toBeLessThanOrEqual(hillProfile.end+1e-6);}
  });
});
describe('raised ramp physics',()=>{
  beforeAll(async()=>{await RAPIER.init();});
  it('has physical side walls above the old low kerb on both sides of the crest',()=>{
    const root=createHillStructure(boundaryLoops),edge=root.getObjectByName('hill-concrete-edges') as T.Mesh,world=new RAPIER.World({x:0,y:-9.81,z:0});
    try{
      addStaticObstacle(world,edge.geometry,new Set());world.step();
      for(const side of [-1,1]){
        const hit=world.castRay(new RAPIER.Ray({x:17,y:hillHeight(17,40.5)+.45,z:40.5},{x:0,y:0,z:side}),5,true);
        expect(hit,`wall side ${side}`).not.toBeNull();
        expect(hit!.timeOfImpact).toBeCloseTo(3.925,3);
      }
    }finally{world.free();root.traverse(node=>{if(node instanceof T.Mesh)node.geometry.dispose();});}
  });
  it('holds the car on four wheels on the steeper ascent and allows a powered hill start',()=>{
    const world=new RAPIER.World({x:0,y:-9.81,z:0}),ramp=hillColliderData();world.createCollider(RAPIER.ColliderDesc.trimesh(ramp.positions,ramp.indices).setFriction(.9));
    const car=new Vehicle(world,new Set());car.reset({x:8,z:42},Math.PI/2);const held=new Set<string>(),input={down:(action:string)=>held.has(action)}as Input;
    try{
      for(let i=0;i<180;i++)car.update(1/60,input,true);
      expect([0,1,2,3].every(i=>car.controller.wheelIsInContact(i))).toBe(true);const x=car.body.translation().x;expect(Math.abs(x-8)).toBeLessThan(.2);
      car.action('ignition');car.action('gear1',true);held.add('throttle');for(let i=0;i<60;i++)car.update(1/60,input,true);car.action('handbrake');
      let peakHeight=car.body.translation().y;
      for(let i=0;i<240;i++){car.update(1/60,input,true);peakHeight=Math.max(peakHeight,car.body.translation().y);}
      expect(car.body.translation().x).toBeGreaterThan(x+2);expect(car.drivetrain.engine).toBe(true);expect(peakHeight).toBeGreaterThan(1.8);
      expect(car.body.translation().y).toBeGreaterThan(hillHeight(car.body.translation().x,42)+.3);
    }finally{car.dispose();world.free();}
  });
});
