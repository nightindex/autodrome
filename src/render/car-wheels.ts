import * as T from 'three';
import type { Vehicle } from '../simulation/vehicle';
import { vehicleConfig,vehicleDynamics } from '../data/vehicle';

export interface CarWheel {
  pivot:T.Group;spin:T.Group;front:boolean;base:T.Vector3;index:number;radius:number;
}

/** Keep the imported spindle, the spin axis and the steering pivot concentric. */
export function rigCarWheel(car:T.Object3D,node:T.Object3D):CarWheel {
  car.updateWorldMatrix(true,true);
  const toNode=node.matrixWorld.clone().invert(),bounds=new T.Box3(),point=new T.Vector3();
  node.traverse(child=>{
    if(!(child instanceof T.Mesh))return;
    const matrix=toNode.clone().multiply(child.matrixWorld),positions=child.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++)bounds.expandByPoint(point.fromBufferAttribute(positions,i).applyMatrix4(matrix));
  });
  const toCar=car.matrixWorld.clone().invert().multiply(node.matrixWorld);
  const center=bounds.getCenter(new T.Vector3()).applyMatrix4(toCar);
  const axle=new T.Vector3(1,0,0).transformDirection(toCar);
  const correction=new T.Quaternion().setFromUnitVectors(axle,new T.Vector3(Math.sign(axle.x)||1,0,0));
  const pivot=new T.Group(),spin=new T.Group(),alignment=new T.Group();
  pivot.name=`wheel-pivot-${node.name}`;spin.name=`wheel-spin-${node.name}`;
  alignment.name=`wheel-alignment-${node.name}`;
  pivot.position.copy(center);car.add(pivot);pivot.add(spin);spin.add(alignment);
  car.updateWorldMatrix(true,true);alignment.attach(node);alignment.quaternion.copy(correction);
  car.updateWorldMatrix(true,true);
  // The source's brake calliper is part of each wheel group. It steers and
  // follows suspension, but must not revolve with the tyre and brake disc.
  const callipers:T.Mesh[]=[];
  node.traverse(child=>{
    if(child instanceof T.Mesh&&(Array.isArray(child.material)?child.material:[child.material]).some(m=>m.name==='roda.043'))callipers.push(child);
  });
  for(const calliper of callipers)pivot.attach(calliper);
  const size=bounds.getSize(new T.Vector3()),scale=new T.Vector3().setFromMatrixScale(toCar);
  const radius=(size.y*scale.y+size.z*scale.z)/4,front=center.z>0;
  return {pivot,spin,front,base:center.clone(),index:(front?0:2)+(center.x<0?0:1),radius};
}

/** Match the authored wheel arches to the suspension's loaded ride height. */
export function carBodyLift(wheels:CarWheel[]){
  if(!wheels.length)return 0;
  const authoredHub=wheels.reduce((sum,w)=>sum+w.base.y,0)/wheels.length;
  const loadedLength=vehicleDynamics.suspensionRestLength-9.81/(4*vehicleDynamics.suspensionStiffness);
  return .02-loadedLength-authoredHub;
}

export function updateCarWheel(w:CarWheel,controller:Vehicle['controller'],initial:boolean,menu:boolean,bodyLift=0){
  w.pivot.rotation.y=!menu&&w.front?controller.wheelSteering(w.index)??0:0;
  // Rapier's positive wheel angle rolls towards local +Z. The imported tyres
  // are slightly larger, so preserve their travelled distance rather than rpm.
  w.spin.rotation.x=menu?0:(controller.wheelRotation(w.index)??0)*vehicleConfig.wheelRadius/w.radius;
  w.pivot.position.y=initial||menu?w.base.y:.02-(controller.wheelSuspensionLength(w.index)??.28)+w.radius-vehicleConfig.wheelRadius-bodyLift;
}
