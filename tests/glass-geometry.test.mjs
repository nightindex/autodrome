import { describe,expect,it } from 'vitest';
import { Document } from '@gltf-transform/core';
import * as T from 'three';
import { extractRearGlassExterior } from '../scripts/cobalt-glass.mjs';

const outward=new T.Vector3(0,.88,-.48).normalize();
const pointKey=p=>p.toArray().map(v=>v.toFixed(6)).join(',');

function closedPane({indexed=true}={}){
  const doc=new Document(),buffer=doc.createBuffer(),geometry=new T.BoxGeometry(2,1,.004,4,2,1);
  const p=geometry.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setZ(i,p.getZ(i)+.12*p.getX(i)**2);
  const outerIndices=Array.from(geometry.index.array).slice(geometry.groups[4].start,geometry.groups[4].start+geometry.groups[4].count);
  const boundary=new Set(outerIndices.map(i=>new T.Vector3().fromBufferAttribute(p,i)).filter(p=>Math.abs(p.x)===1||Math.abs(p.y)===.5).map(pointKey));
  const colors=Uint8Array.from({length:p.count*4},(_,i)=>(i*37)%256);
  geometry.setAttribute('color',new T.BufferAttribute(colors,4,true));
  geometry.setAttribute('tangent',new T.Float32BufferAttribute(Array.from({length:p.count},()=>[1,0,0,1]).flat(),4));
  const source=indexed?geometry:geometry.toNonIndexed(),primitive=doc.createPrimitive();
  for(const [name,semantic,type]of [['position','POSITION','VEC3'],['normal','NORMAL','VEC3'],['uv','TEXCOORD_0','VEC2'],['color','COLOR_0','VEC4'],['tangent','TANGENT','VEC4']]){
    const a=source.getAttribute(name);
    primitive.setAttribute(semantic,doc.createAccessor().setType(type).setArray(a.array).setNormalized(a.normalized).setBuffer(buffer));
  }
  const custom=Float32Array.from({length:source.getAttribute('position').count},(_,i)=>i+.125);
  primitive.setAttribute('_GLASS_SAMPLE',doc.createAccessor().setType('SCALAR').setArray(custom).setBuffer(buffer));
  if(source.index)primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(source.index.array)).setBuffer(buffer));
  const material=doc.createMaterial('rear tint').setDoubleSided(true).setAlphaMode('BLEND').setBaseColorFactor([.2,.3,.4,.38]);
  primitive.setMaterial(material);
  // The source model uses a half-turn and scale. Selection must therefore use
  // normalized car coordinates rather than the primitive's local axes.
  const normalize=new T.Matrix4().makeRotationY(Math.PI).scale(new T.Vector3(1.7,1.7,1.7));
  normalize.setPosition(1,2,3);
  const sourceRotation=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),-Math.PI).multiply(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),outward));
  const node=doc.createNode('curved rear pane').setRotation(sourceRotation.toArray()).setMesh(doc.createMesh().addPrimitive(primitive));
  doc.createScene().addChild(node);
  const matrix=normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix()));
  const worldPoint=(_node,accessor,i)=>new T.Vector3().fromArray(accessor.getArray(),i*3).applyMatrix4(matrix);
  const snapshot=Array.from({length:source.getAttribute('position').count},(_,i)=>({
    point:pointKey(new T.Vector3().fromBufferAttribute(source.getAttribute('position'),i)),
    uv:Array.from(source.getAttribute('uv').array.slice(i*2,i*2+2)),
    color:Array.from(source.getAttribute('color').array.slice(i*4,i*4+4)),sample:custom[i],
  }));
  geometry.dispose();if(source!==geometry)source.dispose();
  return {doc,buffer,node,primitive,worldPoint,matrix,boundary,snapshot,material};
}

function meshFor(primitive,matrix){
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));
  if(primitive.getAttribute('NORMAL'))geometry.setAttribute('normal',new T.Float32BufferAttribute(primitive.getAttribute('NORMAL').getArray(),3));
  if(primitive.getIndices())geometry.setIndex(Array.from(primitive.getIndices().getArray()));
  geometry.applyMatrix4(matrix);
  const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld();return mesh;
}

describe('single rear glass sheet',()=>{
  it.each([true,false])('has one visible layer from either side of an indexed=%s closed pane',indexed=>{
    const fixture=closedPane({indexed}),{primitive,matrix}=fixture;
    const target=new T.Vector3(.217,.133,.002+.12*.217**2).applyMatrix4(matrix);
    const before=meshFor(primitive,matrix);
    for(const side of [-1,1]){
      const eye=target.clone().addScaledVector(outward,side*2);
      expect(new T.Raycaster(eye,target.clone().sub(eye).normalize()).intersectObject(before)).toHaveLength(2);
    }
    const result=extractRearGlassExterior(fixture),after=meshFor(primitive,matrix);
    expect(result.exteriorTriangles).toBe(16);expect(result.sourceTriangles).toBeGreaterThan(result.exteriorTriangles*2);
    for(const side of [-1,1]){
      const eye=target.clone().addScaledVector(outward,side*2);
      expect(new T.Raycaster(eye,target.clone().sub(eye).normalize()).intersectObject(after)).toHaveLength(1);
    }
    before.geometry.dispose();before.material.dispose();after.geometry.dispose();after.material.dispose();
  });

  it('retains the curved boundary, attribute samples and tint while smoothing the sheet alone',()=>{
    const fixture=closedPane(),{primitive,snapshot,boundary}=fixture;
    extractRearGlassExterior(fixture);
    expect(primitive.getMaterial()).toBe(fixture.material);expect(primitive.getAttribute('TANGENT')).toBeNull();
    expect(primitive.getAttribute('COLOR_0').getNormalized()).toBe(true);
    expect(primitive.getAttribute('COLOR_0').getArray()).toBeInstanceOf(Uint8Array);
    const positions=primitive.getAttribute('POSITION'),normals=primitive.getAttribute('NORMAL'),byPosition=new Map(),actualBoundary=new Set();
    for(let i=0;i<positions.getCount();i++){
      const point=new T.Vector3().fromArray(positions.getArray(),i*3),key=pointKey(point),normal=new T.Vector3().fromArray(normals.getArray(),i*3);
      if(Math.abs(point.x)===1||Math.abs(point.y)===.5)actualBoundary.add(key);
      expect(normal.length()).toBeCloseTo(1,6);expect(normal.z).toBeGreaterThan(.97);
      if(byPosition.has(key))expect(normal.distanceTo(byPosition.get(key))).toBeLessThan(1e-6);
      else byPosition.set(key,normal);
      const sample={point:key,uv:Array.from(primitive.getAttribute('TEXCOORD_0').getArray().slice(i*2,i*2+2)),color:Array.from(primitive.getAttribute('COLOR_0').getArray().slice(i*4,i*4+4)),sample:primitive.getAttribute('_GLASS_SAMPLE').getArray()[i]};
      expect(snapshot).toContainEqual(sample);
    }
    expect(actualBoundary).toEqual(boundary);
    expect(byPosition.get(pointKey(new T.Vector3(0,0,.002))).distanceTo(new T.Vector3(0,0,1))).toBeLessThan(1e-6);
  });

  it('rejects an empty exterior selection without changing the primitive',()=>{
    const fixture=closedPane(),before=fixture.primitive.getAttribute('POSITION'),indices=fixture.primitive.getIndices();
    const collapse=()=>new T.Vector3();
    expect(()=>extractRearGlassExterior({...fixture,worldPoint:collapse})).toThrow('Rear glass exterior sheet is empty');
    expect(fixture.primitive.getAttribute('POSITION')).toBe(before);expect(fixture.primitive.getIndices()).toBe(indices);
  });
});
