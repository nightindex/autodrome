import {describe,expect,it} from 'vitest';
import polygonClipping,{type MultiPolygon} from 'polygon-clipping';
import * as T from 'three';
import {paintJoinSurface,paintStripSurface,paintStripGeometry} from '../src/render/road-geometry';
import type {Vec2} from '../src/types';
const area=(surface:MultiPolygon)=>surface.reduce((sum,polygon)=>sum+polygon.reduce((total,ring,i)=>total+(i?-1:1)*Math.abs(ring.slice(1).reduce((a,p,j)=>a+ring[j][0]*p[1]-p[0]*ring[j][1],0)/2),0),0);
const rectangle:MultiPolygon=[[[[-5,-5],[5,-5],[5,5],[-5,5],[-5,-5]]]];
describe('painted line corner joins',()=>{
  it('closes every corner of a rectangular stroke without filling its middle',()=>{
    const points=[{x:0,z:0},{x:4,z:0},{x:4,z:3},{x:0,z:3},{x:0,z:0}];
    const surface=paintStripSurface(points,.2);expect(surface).toHaveLength(1);expect(surface[0]).toHaveLength(2);expect(area(surface)).toBeCloseTo(2.8,8);
    const geometry=paintStripGeometry(points,.2,rectangle,.052),material=new T.MeshBasicMaterial(),mesh=new T.Mesh(geometry,material);mesh.updateMatrixWorld();
    const painted=(x:number,z:number)=>new T.Raycaster(new T.Vector3(x,2,z),new T.Vector3(0,-1,0)).intersectObject(mesh).length>0;
    for(const [x,z]of [[-.08,-.08],[4.08,-.08],[4.08,3.08],[-.08,3.08]])expect(painted(x,z),`closed outer corner ${x},${z}`).toBe(true);
    expect(painted(2,1.5)).toBe(false);geometry.dispose();material.dispose();
  });
  it('keeps a closed contour identical when its starting vertex or winding changes',()=>{
    const corners=[{x:0,z:0},{x:4,z:0},{x:4,z:3},{x:0,z:3}];
    const reference=paintStripSurface([...corners,corners[0]],.2);
    for(let i=0;i<corners.length;i++)for(const reverse of [false,true]){
      const points=[...corners.slice(i),...corners.slice(0,i)];if(reverse)points.reverse();points.push(points[0]);
      expect(area(polygonClipping.xor(reference,paintStripSurface(points,.2)))).toBeLessThan(1e-9);
    }
  });
  it('fills the missing square corner between different-width lines in every direction',()=>{
    for(let turn=0;turn<4;turn++){
      const angle=turn*Math.PI/2,rotate=(x:number,z:number):Vec2=>({x:Math.round((x*Math.cos(angle)-z*Math.sin(angle))*1e6)/1e6,z:Math.round((x*Math.sin(angle)+z*Math.cos(angle))*1e6)/1e6});
      const paths=[{points:[rotate(-2,0),rotate(0,0)],width:.1},{points:[rotate(0,0),rotate(0,2)],width:.25}];
      const existing=polygonClipping.union(...paths.map(p=>paintStripSurface(p.points,p.width)) as [MultiPolygon,...MultiPolygon[]]);
      const joins=paintJoinSurface(paths);expect(area(joins)).toBeCloseTo(.00625,8);
      expect(area(polygonClipping.intersection(existing,joins))).toBeLessThan(1e-10);
      const corners=[rotate(0,0),rotate(.125,0),rotate(.125,-.05),rotate(0,-.05),rotate(0,0)];
      const missing=polygonClipping.difference([[corners.map(p=>[p.x,p.z])]],existing,joins);expect(area(missing)).toBeLessThan(1e-10);
    }
  });
  it('preserves separate end caps and intentional dash gaps',()=>{
    for(const gap of [.005,.33,3]){
      const paths=[{points:[{x:-2,z:0},{x:0,z:0}],width:.1},{points:[{x:gap,z:0},{x:2+gap,z:0}],width:.1}];
      expect(paintJoinSurface(paths)).toEqual([]);
    }
  });
  it('ignores duplicate consecutive vertices without creating degenerate paint',()=>{
    const a={x:0,z:0},b={x:1,z:0};expect(paintStripSurface([a,a,b,b],.1)).toEqual(paintStripSurface([a,b],.1));
    expect(paintStripSurface([a,a],.1)).toEqual([]);
  });
});
