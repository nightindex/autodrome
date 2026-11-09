import {describe,expect,it} from 'vitest';
import * as T from 'three';
import {railwayCrossing,railwayRailBodyProfile,railwayRailHeadProfile} from '../src/data/railway';
import {railwaySectionGeometry,createRailwayCrossing} from '../src/render/railway-crossing';

describe('railway steel section and embedded support structure',()=>{
  it('has a broad foot, a narrow web and a rounded running crown instead of a box section',()=>{
    const c=railwayCrossing,body=new T.Mesh(railwaySectionGeometry(railwayRailBodyProfile,1),new T.MeshBasicMaterial()),head=new T.Mesh(railwaySectionGeometry(railwayRailHeadProfile,1),new T.MeshBasicMaterial());
    body.updateMatrixWorld();head.updateMatrixWorld();
    const width=(y:number)=>{
      const a=new T.Raycaster(new T.Vector3(0,y,-1),new T.Vector3(0,0,1)).intersectObject(body)[0];
      const b=new T.Raycaster(new T.Vector3(0,y,1),new T.Vector3(0,0,-1)).intersectObject(body)[0];
      return b.point.z-a.point.z;
    };
    expect(width(c.railTop-.165)).toBeGreaterThan(.14);
    expect(width(c.railTop-.09)).toBeLessThan(.02);
    const crown=(z:number)=>new T.Raycaster(new T.Vector3(0,1,z),new T.Vector3(0,-1,0)).intersectObject(head)[0];
    expect(crown(0).point.y).toBeCloseTo(c.railTop,6);
    expect(crown(.03).point.y).toBeLessThan(crown(0).point.y-.002);
    expect(crown(.03).face!.normal.y).toBeGreaterThan(.3);expect(crown(.03).face!.normal.y).toBeLessThan(.95);
    body.geometry.dispose();head.geometry.dispose();
  });
  it('includes actual sleepers and rail fasteners beneath separate deck boards and infill',()=>{
    const crossing=createRailwayCrossing();
    for(const name of ['railway-sleepers','railway-fasteners','railway-deck-boards','railway-infill']){
      const mesh=crossing.getObjectByName(name)as T.Mesh;expect(mesh).toBeDefined();
      expect(mesh.geometry.getAttribute('position').count).toBeGreaterThan(50);
    }
    expect(crossing.userData.sleepers).toBe(12);
    crossing.traverse(node=>{if(node instanceof T.Mesh)node.geometry.dispose();});
  });
});
