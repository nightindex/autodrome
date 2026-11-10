import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {boundarySections} from '../src/render/road-geometry';
import {curbRibbonGeometries} from '../src/render/curb-ribbon';

const loop=[{x:-3,z:-3},{x:3,z:-3},{x:3,z:3},{x:-3,z:3}];
const sections=()=>boundarySections([loop],-.025,-.265,.7);
const meshes=(geometries:Record<string,T.BufferGeometry>)=>Object.values(geometries).map(g=>new T.Mesh(g,new T.MeshBasicMaterial()));
const dispose=(objects:T.Mesh[])=>objects.forEach(m=>{m.geometry.dispose();(m.material as T.Material).dispose();});

describe('continuous curb ribbon',()=>{
  it('keeps one paint station across every shared top, bevel and wall vertex, including the closed-loop seam',()=>{
    const geometries=curbRibbonGeometries(sections()),samples=new Map<string,number>();let checked=0;
    for(const g of Object.values(geometries)){
      const p=g.getAttribute('position'),uv=g.getAttribute('uv');expect(g.userData.curbStripeUvs).toBe(true);
      for(const i of new Set(g.index!.array)){
        const key=[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e5)).join(','),u=uv.getX(i),previous=samples.get(key);
        if(previous!==undefined){const delta=u-previous;expect(Math.abs(delta-Math.round(delta))).toBeLessThan(.00001);checked++;}else samples.set(key,u);
      }
      g.dispose();
    }
    expect(checked).toBeGreaterThan(100);
  });
  it('closes exposed ramp cuts while leaving the cutout clear',()=>{
    const objects=meshes(curbRibbonGeometries(sections(),{minX:-1,maxX:1,minZ:-4,maxZ:-2}));
    try{
      for(const direction of [-1,1]){
        const hit=new T.Raycaster(new T.Vector3(0,.12,-3.145),new T.Vector3(direction,0,0),0,2).intersectObjects(objects)[0];
        expect(hit).toBeDefined();expect(hit.point.x).toBeCloseTo(direction,5);expect(hit.face!.normal.x).toBeCloseTo(-direction,5);
      }
      expect(new T.Raycaster(new T.Vector3(0,1,-3.145),new T.Vector3(0,-1,0)).intersectObjects(objects)).toHaveLength(0);
      const top=new T.Raycaster(new T.Vector3(2,1,-3.145),new T.Vector3(0,-1,0)).intersectObjects(objects)[0];
      expect(top.point.y).toBeCloseTo(.2,5);expect(top.face!.normal.y).toBeCloseTo(1,5);
    }finally{dispose(objects);}
  });
  it('retains outward-facing road and grass walls',()=>{
    const objects=meshes(curbRibbonGeometries(sections()));
    try{
      for(const [z,direction,normal]of [[-2,-1,1],[-4,1,-1]]){
        const hit=new T.Raycaster(new T.Vector3(0,.12,z),new T.Vector3(0,0,direction)).intersectObjects(objects)[0];
        expect(hit).toBeDefined();expect(hit.face!.normal.z).toBeCloseTo(normal,5);
      }
    }finally{dispose(objects);}
  });
  it('does not shear straight paint boundaries towards a mitered corner',()=>{
    const objects=meshes(curbRibbonGeometries(sections()));
    try{
      const coordinates=[-3.035,-3.08,-3.16,-3.25].map(z=>new T.Raycaster(new T.Vector3(2,1,z),new T.Vector3(0,-1,0)).intersectObjects(objects)[0].uv!.x);
      expect(Math.max(...coordinates)-Math.min(...coordinates)).toBeLessThan(.00001);
    }finally{dispose(objects);}
  });
});
