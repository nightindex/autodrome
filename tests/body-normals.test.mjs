import { describe,expect,it } from 'vitest';
import * as T from 'three';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { smoothBodyGeometry } from '../scripts/cobalt-body.mjs';

const geometry=triangles=>new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(triangles.flat(2),3));
const normalAt=(g,i)=>new T.Vector3().fromBufferAttribute(g.getAttribute('normal'),i);
let preparedAsset;
const loadPreparedAsset=()=>preparedAsset??=new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/assets/cobalt.glb');
function preparedRoof(doc){
  const refinement=doc.getRoot().getExtras().cobaltRefinement;
  const node=doc.getRoot().listNodes().find(n=>n.getName()==='chassis_primary_0_Realistic Car Paint_0');
  const primitive=node.getMesh().listPrimitives().find(p=>p.getMaterial()?.getName()==='Realistic_Car_Paint');
  const matrix=new T.Matrix4().compose(
    new T.Vector3(0,refinement.sourceOffset,0),
    new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),
    new T.Vector3().setScalar(refinement.sourceScale),
  ).multiply(new T.Matrix4().fromArray(node.getWorldMatrix()));
  return {primitive,matrix};
}
describe('paint smoothing without false dents',()=>{
  it('keeps normals on nearby but disconnected sheet metal independent',()=>{
    const g=geometry([[[0,0,0],[1,0,0],[0,1,0]],[[.002,.002,.002],[.502,.002,.002],[.002,.502,.29]]]);
    const smooth=smoothBodyGeometry(g);
    expect(normalAt(smooth,0).distanceTo(new T.Vector3(0,0,1))).toBeLessThan(1e-7);
    expect(normalAt(smooth,3).y).toBeLessThan(-.4);
    expect(g.hasAttribute('normal')).toBe(false);
  });
  it('does not change highlights when one side of a smooth fan is subdivided',()=>{
    const o=[0,0,0],a=[1,0,0],b=[0,1,0],c=[-Math.cos(.5),0,Math.sin(.5)];
    const coarse=smoothBodyGeometry(geometry([[o,a,b],[o,b,c]]));
    const split=new T.Vector3(...b).add(new T.Vector3(...c)).normalize().toArray();
    const fine=smoothBodyGeometry(geometry([[o,a,b],[o,b,split],[o,split,c]]));
    expect(normalAt(coarse,0).distanceTo(normalAt(fine,0))).toBeLessThan(1e-6);
    expect(normalAt(fine,0).length()).toBeCloseTo(1,6);
  });
  it('uses one normal across a connected fan even when its total bend exceeds the crease angle',()=>{
    const o=[0,0,0],a=[1,0,0],b=[0,1,0],c=[-.6,0,.8],d=[0,-.6,-.8];
    // Every shared edge bends by less than 60 degrees. The first and last
    // faces differ by more than 60 degrees, so a reference-face filter gives
    // the three copies of the apex different normals and creates a highlight seam.
    const smooth=smoothBodyGeometry(geometry([[o,a,b],[o,b,c],[o,c,d]]));
    expect(normalAt(smooth,0).distanceTo(normalAt(smooth,3))).toBeLessThan(1e-7);
    expect(normalAt(smooth,3).distanceTo(normalAt(smooth,6))).toBeLessThan(1e-7);
    expect(normalAt(smooth,2).distanceTo(normalAt(smooth,4))).toBeLessThan(1e-7);
    expect(normalAt(smooth,5).distanceTo(normalAt(smooth,7))).toBeLessThan(1e-7);
  });
  it('keeps sheets that meet at only one vertex in independent smoothing fans',()=>{
    const o=[0,0,0];
    const smooth=smoothBodyGeometry(geometry([[o,[1,0,0],[0,1,0]],[o,[-1,0,0],[0,-Math.cos(.4),Math.sin(.4)]]]));
    expect(normalAt(smooth,0).distanceTo(new T.Vector3(0,0,1))).toBeLessThan(1e-7);
    expect(normalAt(smooth,3).distanceTo(new T.Vector3(0,Math.sin(.4),Math.cos(.4)))).toBeLessThan(1e-7);
  });
  it('smooths a shared geometric edge across duplicate UV vertices and preserves the UV seam',()=>{
    const o=[0,0,0],b=[0,1,0],g=geometry([[o,[1,0,0],b],[o,b,[-Math.cos(.4),0,Math.sin(.4)]]]);
    const uv=new Float32Array([0,0,1,0,0,1,1,1,0,0,1,0]);
    g.setAttribute('uv',new T.BufferAttribute(uv,2));
    const smooth=smoothBodyGeometry(g);
    expect(normalAt(smooth,0).distanceTo(normalAt(smooth,3))).toBeLessThan(1e-7);
    expect(normalAt(smooth,2).distanceTo(normalAt(smooth,4))).toBeLessThan(1e-7);
    expect(Array.from(smooth.getAttribute('uv').array)).toEqual(Array.from(uv));
  });
  it('keeps the opposite faces of a thin sheet separate',()=>{
    const o=[0,0,0],a=[1,0,0],b=[0,1,0];
    const smooth=smoothBodyGeometry(geometry([[o,a,b],[o,b,a]]));
    expect(normalAt(smooth,0).distanceTo(new T.Vector3(0,0,1))).toBeLessThan(1e-7);
    expect(normalAt(smooth,3).distanceTo(new T.Vector3(0,0,-1))).toBeLessThan(1e-7);
  });
  it('preserves a sharp return lip instead of rounding it into the outer panel',()=>{
    const smooth=smoothBodyGeometry(geometry([[[0,0,0],[1,0,0],[0,1,0]],[[0,0,0],[0,1,0],[0,0,1]]]));
    expect(normalAt(smooth,0).distanceTo(new T.Vector3(0,0,1))).toBeLessThan(1e-7);
    expect(normalAt(smooth,3).distanceTo(new T.Vector3(1,0,0))).toBeLessThan(1e-7);
  });
  it('keeps the front roof highlight smooth instead of spreading the glass lip across broad triangles',async()=>{
    const {primitive,matrix}=preparedRoof(await loadPreparedAsset());
    const g=new T.BufferGeometry()
      .setAttribute('position',new T.Float32BufferAttribute(primitive.getAttribute('POSITION').getArray(),3))
      .setAttribute('normal',new T.Float32BufferAttribute(primitive.getAttribute('NORMAL').getArray(),3));
    if(primitive.getIndices())g.setIndex(Array.from(primitive.getIndices().getArray()));
    g.applyMatrix4(matrix);
    const material=new T.MeshBasicMaterial({side:T.DoubleSide}),mesh=new T.Mesh(g,material);
    mesh.updateMatrixWorld();
    const ray=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0));
    try{
      for(const x of [-.3,-.2,-.1,0,.1,.2,.3]){
        ray.ray.origin.set(x,2,.4);
        const hit=ray.intersectObject(mesh)[0];
        expect(hit,`Painted roof witness at x=${x}`).toBeDefined();
        const normal=hit.normal.clone().normalize();
        // The wide roof is still nearly horizontal here. Its narrow rounded
        // return starts about 3 cm farther forward and must retain support rows.
        expect(normal.y,`Roof slope at x=${x}`).toBeGreaterThan(.97);
        expect(Math.abs(normal.z-.217),`Roof highlight at x=${x}`).toBeLessThan(.02);
      }
    }finally{g.dispose();material.dispose();}
  });
});
