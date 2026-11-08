import {describe,expect,it} from 'vitest';
import * as T from 'three';
import {CurbAppearance,curbStripeUvs} from '../src/render/curb-appearance';
const loops=[[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}]];
describe('curb appearance',()=>{
  it('keeps stripes continuous at the perimeter UV seam without moving the solid',()=>{
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([-.02,0,.04,-.02,.2,-.02,.04,.2,-.02],3));geometry.setIndex([0,1,2]);geometry.computeVertexNormals();
    const vertices=(g:T.BufferGeometry)=>Array.from(g.index!.array,i=>new T.Vector3().fromBufferAttribute(g.getAttribute('position'),i).toArray());
    const before=vertices(geometry);curbStripeUvs(geometry,loops);expect(vertices(geometry)).toEqual(before);
    const uv=geometry.getAttribute('uv'),u=Array.from(geometry.index!.array,i=>uv.getX(i));
    expect(Math.max(...u)-Math.min(...u)).toBeLessThan(.1);geometry.dispose();
  });
  it('restores the white finish and changes appearance without replacing geometry or shared concrete materials',()=>{
    const geometry=new T.BoxGeometry(3,.18,.24).translate(5,.09,-.145),original=new T.MeshStandardMaterial({color:0xe4e2d6,vertexColors:true}),mesh=new T.Mesh(geometry,original);
    const appearance=new CurbAppearance([mesh],loops),position=geometry.getAttribute('position'),indices=Array.from(geometry.index!.array);
    appearance.setStyle('yellow-black');expect(mesh.material.map).toBeInstanceOf(T.DataTexture);expect(mesh.material.vertexColors).toBe(false);expect(original.map).toBeNull();
    appearance.setStyle('white');expect(mesh.material.map).toBeNull();expect(mesh.material.vertexColors).toBe(true);expect(mesh.material.color.getHex()).toBe(0xe4e2d6);
    appearance.setStyle('yellow-black');expect(mesh.geometry).toBe(geometry);expect(geometry.getAttribute('position')).toBe(position);expect(Array.from(geometry.index!.array)).toEqual(indices);
    mesh.material.map?.dispose();mesh.material.dispose();original.dispose();geometry.dispose();
  });
});
