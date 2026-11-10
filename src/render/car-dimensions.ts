import * as T from 'three';
import {vehicleConfig,wheelCenter} from '../data/vehicle';
import type {CarWheel} from './car-wheels';

/** Fit the imported shell to the supplied Cobalt diagram. Keep the cabin and
 * its fittings in one affine frame; extend only the overhangs beyond the axles. */
export function fitCarDimensions(car:T.Object3D,model:T.Object3D,wheels:CarWheel[]){
  if(wheels.length!==4)throw new Error('Cobalt dimension fitting requires four wheels');
  car.updateWorldMatrix(true,true);
  const bounds=new T.Box3(),point=new T.Vector3(),toCar=car.matrixWorld.clone().invert();
  model.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    const materials=Array.isArray(node.material)?node.material:[node.material];
    // Source front-door paint and authored mirror caps extend past the body.
    // The shell and rear doors establish width without counting either case.
    if(!materials.some(m=>m.name==='Realistic_Car_Paint')||/^door_[lr]f|^COBALT_SideMirror/.test(node.name))return;
    const p=node.geometry.getAttribute('position'),index=node.geometry.index,matrix=toCar.clone().multiply(node.matrixWorld);
    for(let i=0;i<(index?.count??p.count);i++)bounds.expandByPoint(point.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(matrix));
  });
  if(bounds.isEmpty())throw new Error('Cobalt exterior paint bounds are missing');
  const mean=(front:boolean,axis:'y'|'z')=>wheels.filter(w=>w.front===front).reduce((sum,w)=>sum+w.base[axis],0)/2;
  const front=mean(true,'z'),rear=mean(false,'z'),hubY=(mean(true,'y')+mean(false,'y'))/2;
  const sx=vehicleConfig.width/(bounds.max.x-bounds.min.x),sy=(vehicleConfig.height-vehicleConfig.wheelRadius)/(bounds.max.y-hubY),sz=vehicleConfig.wheelbase/(front-rear);
  const affine=new T.Matrix4().makeScale(sx,sy,sz);
  affine.setPosition(-(bounds.min.x+bounds.max.x)/2*sx,hubY*(1-sy),-(front+rear)/2*sz);
  const rearEnd=point.set(0,0,bounds.min.z).applyMatrix4(affine).z,frontEnd=point.set(0,0,bounds.max.z).applyMatrix4(affine).z;
  const axle=vehicleConfig.wheelbase/2,halfLength=vehicleConfig.length/2;
  // A quadratic extension has zero extra slope at the axle, preserving smooth
  // fender shading while keeping the two bumpers at the specified overall length.
  const overhang=(z:number)=>{
    if(z>axle){const span=frontEnd-axle,t=(z-axle)/span,delta=halfLength-frontEnd;return {z:z+delta*t*t,slope:1+2*delta*t/span};}
    if(z<-axle){const span=-axle-rearEnd,t=(-axle-z)/span,delta=-halfLength-rearEnd;return {z:z+delta*t*t,slope:1-2*delta*t/span};}
    return {z,slope:1};
  };
  model.applyMatrix4(affine);car.updateWorldMatrix(true,true);
  model.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    const matrix=toCar.clone().multiply(node.matrixWorld),inverse=matrix.clone().invert();
    const old=node.geometry,p=old.getAttribute('position');let affected=false;
    for(let i=0;i<p.count&&!affected;i++)affected=Math.abs(point.fromBufferAttribute(p,i).applyMatrix4(matrix).z)>axle;
    if(!affected)return;
    const geometry=old.clone(),positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),tangents=geometry.getAttribute('tangent');
    const normalToCar=new T.Matrix3().getNormalMatrix(matrix),normalToLocal=normalToCar.clone().invert();
    const direction=new T.Vector3();
    for(let i=0;i<positions.count;i++){
      point.fromBufferAttribute(positions,i).applyMatrix4(matrix);const mapped=overhang(point.z);point.z=mapped.z;point.applyMatrix4(inverse);positions.setXYZ(i,point.x,point.y,point.z);
      if(normals){direction.fromBufferAttribute(normals,i).applyMatrix3(normalToCar);direction.z/=mapped.slope;direction.applyMatrix3(normalToLocal).normalize();normals.setXYZ(i,direction.x,direction.y,direction.z);}
      if(tangents){direction.fromBufferAttribute(tangents,i).transformDirection(matrix);direction.z*=mapped.slope;direction.transformDirection(inverse);tangents.setXYZ(i,direction.x,direction.y,direction.z);}
    }
    geometry.computeBoundingBox();geometry.computeBoundingSphere();node.geometry=geometry;
  });
  for(const wheel of wheels){
    const desired=wheelCenter(wheel.index),box=new T.Box3();
    const inverse=wheel.pivot.matrixWorld.clone().invert();
    wheel.pivot.traverse(node=>{
      if(!(node instanceof T.Mesh))return;
      const matrix=inverse.clone().multiply(node.matrixWorld),p=node.geometry.getAttribute('position'),indices=node.geometry.index;
      for(let i=0;i<(indices?.count??p.count);i++)box.expandByPoint(point.fromBufferAttribute(p,indices?indices.getX(i):i).applyMatrix4(matrix));
    });
    wheel.pivot.scale.set(vehicleConfig.tyreWidth/(box.max.x-box.min.x),vehicleConfig.wheelRadius/wheel.radius,vehicleConfig.wheelRadius/wheel.radius);
    wheel.radius=vehicleConfig.wheelRadius;wheel.base.set(desired.x,hubY,desired.z);wheel.pivot.position.copy(wheel.base);
  }
  // A real shallow undertray makes the lowest central surface agree with the
  // physical belly, instead of treating the empty space below the cabin as solid.
  const undertray=new T.Mesh(new T.BoxGeometry(1.04,.018,1.64),new T.MeshStandardMaterial({color:0x202323,roughness:1}));
  undertray.name='COBALT_Undertray';undertray.position.y=vehicleConfig.groundClearance-(vehicleConfig.wheelRadius-hubY)+.009;undertray.castShadow=undertray.receiveShadow=true;car.add(undertray);
  const mapPoint=(p:T.Vector3)=>{p.applyMatrix4(affine);p.z=overhang(p.z).z;return p;};
  return {mapPoint,scale:{x:sx,y:sy,z:sz},sourceWheelbase:front-rear,sourceWidth:bounds.max.x-bounds.min.x,sourceRoofHeight:bounds.max.y-hubY+vehicleConfig.wheelRadius};
}
