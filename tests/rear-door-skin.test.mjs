import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import * as T from 'three';

const material=new T.MeshBasicMaterial({side:T.DoubleSide}),prepared=[],source=[];
beforeAll(async()=>{
  const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),asset=await io.read('public/assets/cobalt.glb'),original=await io.read('chevrolet_cobalt_ltz_2014.glb');
  const r=asset.getRoot().getExtras().cobaltRefinement;
  const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
  for(const [doc,meshes]of [[asset,prepared],[original,source]])for(const node of doc.getRoot().listNodes()){
    if(!/^door_[lr]r.*primary/.test(node.getName()))continue;
    for(const primitive of node.getMesh()?.listPrimitives()??[]){
      if(primitive.getMaterial()?.getName()!=='Realistic_Car_Paint')continue;
      const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));
      if(primitive.getAttribute('NORMAL'))g.setAttribute('normal',new T.Float32BufferAttribute(primitive.getAttribute('NORMAL').getArray(),3));
      if(primitive.getIndices())g.setIndex(Array.from(primitive.getIndices().getArray()));
      g.applyMatrix4(normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())));
      const mesh=new T.Mesh(g,material);mesh.updateMatrixWorld();meshes.push(mesh);
    }
  }
});
afterAll(()=>{[...prepared,...source].forEach(mesh=>mesh.geometry.dispose());material.dispose();});
const hit=(meshes,side,y,z)=>new T.Raycaster(new T.Vector3(side*2,y,z),new T.Vector3(-side,0,0)).intersectObjects(meshes)[0];

describe('rear door shoulders',()=>{
  it('has a smooth highlight across the former triangular dent on both sides',()=>{
    for(const side of [-1,1])for(const y of [.22,.25,.28]){
      let previous;
      for(let z=-.84;z<=-.40;z+=.025){
        const point=hit(prepared,side,y,z);expect(point).toBeDefined();
        const n=point.normal.clone().normalize();
        expect(n.x*side).toBeGreaterThan(.85);
        expect(Math.abs(n.z),`no shoulder kink at ${side},${y},${z}`).toBeLessThan(.06);
        if(previous)expect(n.angleTo(previous),`continuous highlight at ${side},${y},${z}`).toBeLessThan(.05);
        previous=n;
      }
    }
  });
  it('preserves the handles, lower stamping, front seam and window return',()=>{
    for(const side of [-1,1])for(const [y,z]of [[.25,-1.05],[.22,-1.04],[-.10,-.65],[.15,-.155],[.35,-.55]]){
      const expected=hit(source,side,y,z),actual=hit(prepared,side,y,z);
      expect(expected).toBeDefined();expect(actual).toBeDefined();
      expect(actual.point.distanceTo(expected.point),`retained door detail ${side},${y},${z}`).toBeLessThan(.001);
    }
  });
  it('keeps each broad shoulder closed after fitting and simplification',()=>{
    for(const mesh of prepared){
      const p=mesh.geometry.getAttribute('position'),ix=mesh.geometry.index.array,edges=new Map();
      const points=Array.from({length:p.count},(_,i)=>new T.Vector3().fromBufferAttribute(p,i));
      const keys=points.map(p=>p.toArray().map(x=>Math.round(x*1e6)).join(','));
      for(let i=0;i<ix.length;i+=3)for(let j=0;j<3;j++){
        const a=ix[i+j],b=ix[i+(j+1)%3],key=[keys[a],keys[b]].sort().join('|');
        const edge=edges.get(key)??{a,b,count:0};edge.count++;edges.set(key,edge);
      }
      for(const {a,b,count}of edges.values()){
        const center=points[a].clone().add(points[b]).multiplyScalar(.5);
        if(Math.abs(center.x)<.76||center.y<.115||center.y>.325||center.z<-.92||center.z>-.24)continue;
        expect(count,`closed shoulder at ${center.toArray()}`).toBe(2);
      }
    }
  });
});
