import * as T from 'three';

export const detailShadowLayer=3;

/** Keep the car's original meshes for views/picking, but submit opaque depth
 * geometry together. Each animated pivot keeps an independent batch, so wheel
 * spin, suspension, steering and cabin controls retain their exact motion. */
export function createCarShadowBatches(car:T.Object3D,animated:readonly T.Object3D[]){
  car.updateWorldMatrix(true,true);
  const anchors=new Set([car,...animated]),groups=new Map<T.Object3D,Map<T.Side,T.Mesh[]>>();
  car.traverse(node=>{
    if(!(node instanceof T.Mesh)||!node.castShadow)return;
    const material=node.material;
    if(node instanceof T.InstancedMesh||node instanceof T.SkinnedMesh||Array.isArray(material)||
      material instanceof T.ShaderMaterial||material.alphaTest>0||material.alphaToCoverage||material.wireframe||
      (material.clipShadows&&material.clippingPlanes?.length)||node.customDepthMaterial||
      node.onBeforeShadow!==T.Object3D.prototype.onBeforeShadow||node.onAfterShadow!==T.Object3D.prototype.onAfterShadow||
      (material instanceof T.MeshStandardMaterial&&material.displacementMap)||Object.keys(node.geometry.morphAttributes).length){
      node.layers.enable(detailShadowLayer);return;
    }
    let anchor:T.Object3D=node;while(!anchors.has(anchor))anchor=anchor.parent!;
    const side=material.shadowSide??(material.side===T.FrontSide?T.BackSide:material.side===T.BackSide?T.FrontSide:T.DoubleSide);
    const sides=groups.get(anchor)??new Map<T.Side,T.Mesh[]>(),sources=sides.get(side)??[];
    sources.push(node);sides.set(side,sources);groups.set(anchor,sides);
  });
  const batches:T.Mesh<T.BufferGeometry,T.MeshBasicMaterial>[]=[];
  const point=new T.Vector3(),matrix=new T.Matrix4();
  for(const [anchor,sides]of groups){
    const inverse=anchor.matrixWorld.clone().invert();
    for(const [side,sources]of sides){
      const positions:number[]=[],records:{source:T.Mesh;start:number;count:number;visible:boolean}[]=[];
      for(const source of sources){
        matrix.multiplyMatrices(inverse,source.matrixWorld);
        const p=source.geometry.getAttribute('position'),index=source.geometry.index,range=source.geometry.drawRange;
        const end=Math.min(index?.count??p.count,range.start+range.count),start=positions.length/3;
        const corners=matrix.determinant()<0?[0,2,1]:[0,1,2];
        for(let i=range.start;i+2<end;i+=3)for(const corner of corners){
          point.fromBufferAttribute(p,index?index.getX(i+corner):i+corner).applyMatrix4(matrix);positions.push(point.x,point.y,point.z);
        }
        records.push({source,start,count:positions.length/3-start,visible:true});
      }
      const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
      const indices=new Uint32Array(positions.length/3);for(let i=0;i<indices.length;i++)indices[i]=i;
      geometry.setIndex(new T.BufferAttribute(indices,1));geometry.computeBoundingSphere();
      const material=new T.MeshBasicMaterial();material.shadowSide=side;
      const batch=new T.Mesh(geometry,material);batch.name='car-shadow-batch';batch.castShadow=true;batch.layers.set(detailShadowLayer);
      batch.onBeforeShadow=()=>{
        let changed=false;
        for(const record of records){
          const materials=Array.isArray(record.source.material)?record.source.material:[record.source.material];
          let visible=record.source.castShadow&&materials.some(m=>m.visible);
          for(let node:T.Object3D|null=record.source;node&&node!==car;node=node.parent)if(!node.visible){visible=false;break;}
          if(visible!==record.visible){record.visible=visible;changed=true;}
        }
        if(!changed)return;
        let cursor=0;
        for(const record of records)if(record.visible)for(let i=record.start;i<record.start+record.count;i++)indices[cursor++]=i;
        geometry.setDrawRange(0,cursor);geometry.index!.needsUpdate=true;
      };
      anchor.add(batch);batches.push(batch);
    }
  }
  return batches;
}
