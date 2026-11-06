import * as T from 'three';

/** Fit an overlay to its actual support mesh in the same coordinate frame.
 * This keeps cloth and thin labels clear of padding without floating blocks.
 */
export function conformSurface(overlay,support,{axis='y',clearance=.0015}={}){
  support.computeBoundingBox();
  const direction=new T.Vector3();direction[axis]=-1;
  const material=new T.MeshBasicMaterial({side:T.DoubleSide}),mesh=new T.Mesh(support,material);
  const ray=new T.Raycaster(new T.Vector3(),direction),position=overlay.getAttribute('position');
  mesh.updateMatrixWorld();
  try{
    for(let i=0;i<position.count;i++){
      ray.ray.origin.fromBufferAttribute(position,i);ray.ray.origin[axis]=support.boundingBox.max[axis]+1;
      const hit=ray.intersectObject(mesh,false)[0];
      if(!hit)throw new Error(`Overlay vertex ${i} misses its ${axis}-axis support`);
      const point=hit.point.clone();point[axis]+=clearance;position.setXYZ(i,point.x,point.y,point.z);
    }
    overlay.computeVertexNormals();return overlay;
  }finally{material.dispose();}
}
