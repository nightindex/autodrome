import {describe,expect,it} from 'vitest';
import * as T from 'three';
import {createCarShadowBatches,detailShadowLayer} from '../src/render/car-shadow-batches';

const caster=()=>{const mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());mesh.castShadow=true;return mesh;};
const beforeShadow=(mesh:T.Mesh)=>(mesh.onBeforeShadow as ()=>void)();

describe('car shadow batching without reducing detail',()=>{
  it('keeps every triangle and leaves the named source meshes available in normal views',()=>{
    const car=new T.Group(),a=caster(),b=caster();a.name='body';b.name='trim';a.position.x=2;b.position.x=-2;car.add(a,b);
    const batches=createCarShadowBatches(car,[]);
    expect(batches).toHaveLength(1);expect(batches[0].geometry.index!.count).toBe(72);
    expect(batches[0].layers.mask).toBe(1<<detailShadowLayer);
    expect(a.layers.mask).toBe(1);expect(b.layers.mask).toBe(1);
    expect(a.castShadow&&b.castShadow).toBe(true);expect(car.getObjectByName('body')).toBe(a);
    car.updateMatrixWorld(true);
    const actual=new T.Box3().setFromObject(batches[0]),expected=new T.Box3().setFromObject(a).union(new T.Box3().setFromObject(b));
    expect(actual.min.toArray()).toEqual(expected.min.toArray());expect(actual.max.toArray()).toEqual(expected.max.toArray());
  });
  it('follows independently animated wheel pivots after the chassis moves and rotates',()=>{
    const car=new T.Group(),pivot=new T.Group(),wheel=caster(),body=caster();pivot.position.x=1;wheel.position.y=.3;pivot.add(wheel);car.add(body,pivot);
    const batches=createCarShadowBatches(car,[pivot]),batch=batches.find(b=>b.parent===pivot)!;
    expect(batches).toHaveLength(2);
    car.position.set(10,2,3);car.rotation.y=.7;pivot.rotation.x=1.3;pivot.position.y=-.2;car.updateMatrixWorld(true);
    const positions=batch.geometry.getAttribute('position'),source=wheel.geometry.getAttribute('position'),index=wheel.geometry.index!;
    for(let i=0;i<positions.count;i++){
      const actual=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(batch.matrixWorld);
      const expected=new T.Vector3().fromBufferAttribute(source,index.getX(i)).applyMatrix4(wheel.matrixWorld);
      expect(actual.distanceTo(expected)).toBeLessThan(1e-6);
    }
  });
  it('updates the batch when a named source, parent, material or shadow is disabled',()=>{
    const car=new T.Group(),parent=new T.Group(),a=caster(),b=caster();parent.add(a);car.add(parent,b);
    const [batch]=createCarShadowBatches(car,[]);
    parent.visible=false;beforeShadow(batch);expect(batch.geometry.drawRange.count).toBe(36);
    b.castShadow=false;beforeShadow(batch);expect(batch.geometry.drawRange.count).toBe(0);
    parent.visible=b.castShadow=true;a.material.visible=false;beforeShadow(batch);expect(batch.geometry.drawRange.count).toBe(36);
    a.material.visible=true;beforeShadow(batch);expect(batch.geometry.drawRange.count).toBe(72);
  });
  it('retains custom and cutout depth shaders on their original casters',()=>{
    const car=new T.Group(),a=caster(),b=caster();a.material.alphaTest=.5;b.customDepthMaterial=new T.MeshDepthMaterial();car.add(a,b);
    expect(createCarShadowBatches(car,[])).toHaveLength(0);
    expect(a.layers.isEnabled(detailShadowLayer)).toBe(true);expect(b.layers.isEnabled(detailShadowLayer)).toBe(true);
    expect(b.customDepthMaterial).toBeInstanceOf(T.MeshDepthMaterial);
  });
  it('preserves front/back shadow sides and mirrored winding',()=>{
    const car=new T.Group(),a=caster(),b=caster();a.material.shadowSide=T.FrontSide;b.material.shadowSide=T.BackSide;b.scale.x=-1;car.add(a,b);
    const batches=createCarShadowBatches(car,[]);expect(batches).toHaveLength(2);
    expect(batches.map(b=>b.material.shadowSide).sort()).toEqual([T.FrontSide,T.BackSide]);
    const batch=batches.find(mesh=>mesh.material.shadowSide===T.BackSide)!,p=batch.geometry.getAttribute('position');
    const source=b.geometry.getAttribute('position'),index=b.geometry.index!;
    for(const [i,corner]of [0,2,1].entries()){
      const expected=new T.Vector3().fromBufferAttribute(source,index.getX(corner)).applyMatrix4(b.matrix);
      expect(new T.Vector3().fromBufferAttribute(p,i).distanceTo(expected)).toBeLessThan(1e-6);
    }
  });
  it('keeps wireframe, clipping and per-object shadow callbacks on the original path',()=>{
    const car=new T.Group(),wire=caster(),clipped=caster(),custom=caster();
    wire.material.wireframe=true;clipped.material.clipShadows=true;clipped.material.clippingPlanes=[new T.Plane(new T.Vector3(1,0,0))];
    custom.onBeforeShadow=()=>{};car.add(wire,clipped,custom);
    expect(createCarShadowBatches(car,[])).toHaveLength(0);
    for(const mesh of [wire,clipped,custom])expect(mesh.layers.isEnabled(detailShadowLayer)).toBe(true);
  });
});
