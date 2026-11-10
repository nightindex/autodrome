import * as T from 'three';

/** Retain the supplied tread while fitting its low-profile donor rim to R15.
 * The visible flange adds an illustrative 12.7 mm beyond the bead-seat radius. */
export function fitCarTyreProfile(pivot:T.Group,rimDiameter:number,tyreWidth:number):void{
  pivot.updateWorldMatrix(true,true);
  // Remove the pivot's scale from the frame, so radii and widths below are metres.
  const frame=pivot.matrixWorld.clone().multiply(new T.Matrix4().makeScale(1/pivot.scale.x,1/pivot.scale.y,1/pivot.scale.z));
  const toFrame=frame.invert(),point=new T.Vector3(),direction=new T.Vector3();
  const parts:{mesh:T.Mesh;matrix:T.Matrix4;inverse:T.Matrix4;radius:number;bounds:T.Box3;rubber:boolean;rim:boolean}[]=[];
  pivot.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    const matrix=toFrame.clone().multiply(node.matrixWorld),bounds=new T.Box3(),p=node.geometry.getAttribute('position'),index=node.geometry.index;
    let radius=0;
    for(let i=0;i<(index?.count??p.count);i++){
      point.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(matrix);bounds.expandByPoint(point);radius=Math.max(radius,Math.hypot(point.y,point.z));
    }
    const materials=Array.isArray(node.material)?node.material:[node.material];
    parts.push({mesh:node,matrix,inverse:matrix.clone().invert(),radius,bounds,rubber:materials.some(m=>m.name==='bump_front_ok.014'),rim:materials.some(m=>m.name==='COBALT_SatinTrim')});
  });
  const outer=Math.max(...parts.map(p=>p.radius)),sourceRim=Math.max(...parts.filter(p=>p.rim).map(p=>p.radius));
  const targetRim=rimDiameter/2+.0127;
  if(!(sourceRim>0&&targetRim>0&&targetRim<outer&&sourceRim<outer&&tyreWidth>0))throw new Error('Invalid Cobalt tyre/rim profile');
  const rubber=new T.Box3(),metal=new T.Box3();
  for(const part of parts){
    // The donor also uses its rubber material on a small central wheel part.
    part.rubber=part.rubber&&part.radius>outer*.9;(part.rubber?rubber:metal).union(part.bounds);
  }
  if(rubber.isEmpty()||metal.isEmpty())throw new Error('Missing Cobalt tyre or rim surface');
  const center=(rubber.min.x+rubber.max.x)/2,rubberScale=tyreWidth/(rubber.max.x-rubber.min.x),metalScale=.9*tyreWidth/(metal.max.x-metal.min.x);
  let rubberInner=Infinity;
  for(const part of parts.filter(p=>p.rubber)){
    const positions=part.mesh.geometry.getAttribute('position'),index=part.mesh.geometry.index;
    for(let i=0;i<(index?.count??positions.count);i++){
      point.fromBufferAttribute(positions,index?index.getX(i):i).applyMatrix4(part.matrix);
      rubberInner=Math.min(rubberInner,Math.hypot(point.y,point.z));
    }
  }
  if(!(rubberInner>0&&rubberInner<outer))throw new Error('Invalid Cobalt tyre opening');
  // Fit the rubber opening independently: the donor's bead extended in front
  // of the metal flange, hiding about 12 mm of its radius after resizing.
  // Retain a 1 mm overlap at the lip so there is no open seam to the barrel.
  const profile=(r:number,inner:number,targetInner:number)=>{
    const radialScale=targetInner/inner,span=outer-inner;
    if(r<=inner)return {radius:r*radialScale,slope:radialScale};
    if(r>=outer)return {radius:r,slope:1};
    // Cubic Hermite joins the uniformly scaled rim to the unchanged tread,
    // matching radial derivatives at both ends to retain smooth sidewalls.
    const t=(r-inner)/span,t2=t*t,t3=t2*t;
    return {
      radius:(2*t3-3*t2+1)*targetInner+(t3-2*t2+t)*span*radialScale+(-2*t3+3*t2)*outer+(t3-t2)*span,
      slope:(6*t2-6*t)*targetInner/span+(3*t2-4*t+1)*radialScale+(-6*t2+6*t)*outer/span+3*t2-2*t,
    };
  };
  for(const part of parts){
    const inner=part.rubber?rubberInner:sourceRim,targetInner=part.rubber?targetRim-.001:targetRim;
    const geometry=part.mesh.geometry.clone(),positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),tangents=geometry.getAttribute('tangent');
    const normalToFrame=new T.Matrix3().getNormalMatrix(part.matrix),normalToLocal=normalToFrame.clone().invert(),sx=part.rubber?rubberScale:metalScale;
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(part.matrix);
      const r=Math.hypot(point.y,point.z),mapped=profile(r,inner,targetInner),a=r>1e-9?mapped.radius/r:targetInner/inner;
      const y=r>1e-9?point.y/r:1,z=r>1e-9?point.z/r:0;
      if(normals){
        direction.fromBufferAttribute(normals,i).applyMatrix3(normalToFrame);
        const radial=(direction.y*y+direction.z*z)/mapped.slope,angular=(-direction.y*z+direction.z*y)/a;
        direction.set(direction.x/sx,radial*y-angular*z,radial*z+angular*y).applyMatrix3(normalToLocal).normalize();normals.setXYZ(i,direction.x,direction.y,direction.z);
      }
      if(tangents){
        direction.fromBufferAttribute(tangents,i).transformDirection(part.matrix);
        const radial=(direction.y*y+direction.z*z)*mapped.slope,angular=(-direction.y*z+direction.z*y)*a;
        direction.set(direction.x*sx,radial*y-angular*z,radial*z+angular*y).transformDirection(part.inverse);tangents.setXYZ(i,direction.x,direction.y,direction.z);
      }
      point.set((point.x-center)*sx,point.y*a,point.z*a).applyMatrix4(part.inverse);positions.setXYZ(i,point.x,point.y,point.z);
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere();part.mesh.geometry=geometry;
  }
}
