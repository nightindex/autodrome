import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {courseCurbSections} from '../src/render/curb-clearance';
import {curbRibbonGeometries} from '../src/render/curb-ribbon';
import {boundaryLoops} from '../src/render/course-world';
import {mapPoint} from '../src/data/course';

describe('kerb clearance on narrow grass lips',()=>{
  it('preserves the parking asphalt boundary but leaves a grass gap between both kerbs',()=>{
    const sections=courseCurbSections(boundaryLoops);
    const meshes=Object.values(curbRibbonGeometries(sections)).map(g=>new T.Mesh(g,new T.MeshBasicMaterial()));
    try{
      let top=0,gap=0;
      for(const y of [585.37,586.73,588.41,590.23,600.23,610.23,614.79])for(let x=66.3;x<69.8;x+=.21){
        const p=mapPoint(x,y),hits=new T.Raycaster(new T.Vector3(p.x,2,p.z),new T.Vector3(0,-1,0)).intersectObjects(meshes);
        expect(hits.length,`no overlap at ${x},${y}`).toBeLessThanOrEqual(1);
        if(hits.length)top++;else gap++;
      }
      expect(top).toBeGreaterThan(10);expect(gap).toBeGreaterThan(0);
      for(const section of sections){
        if(Math.abs(section.sourceA!.x-mapPoint(66,0).x)<1e-7&&section.sourceA!.z>5.6&&section.sourceA!.z<8){
          expect(section.a.x-section.sourceA!.x).toBeCloseTo(.025);
          expect(section.outerA.x-section.sourceA!.x).toBeLessThan(.2);
        }
      }
    }finally{meshes.forEach(m=>{m.geometry.dispose();(m.material as T.Material).dispose();});}
  });
  it('retains nominal widths and shared cross-sections on an unconstrained island',()=>{
    const sections=courseCurbSections([[{x:0,z:0},{x:0,z:6},{x:6,z:6},{x:6,z:0}]]);
    for(let i=0;i<sections.length;i++){
      const s=sections[i],next=sections[(i+1)%sections.length];
      expect(s.b.x).toBeCloseTo(next.a.x,10);expect(s.b.z).toBeCloseTo(next.a.z,10);
      expect(s.outerB.x).toBeCloseTo(next.outerA.x,10);expect(s.outerB.z).toBeCloseTo(next.outerA.z,10);
      if(Math.abs(s.a.z-s.b.z)<1e-8)expect(Math.abs(s.outerA.z-s.a.z)).toBeCloseTo(.24);
      else expect(Math.abs(s.outerA.x-s.a.x)).toBeCloseTo(.24);
    }
  });
});
