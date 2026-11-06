import * as T from 'three';
export const sunOffset=new T.Vector3(-25,38,-23);
export const shadowSpan=48;
const basis=new T.Matrix4().lookAt(sunOffset,new T.Vector3(),new T.Vector3(0,1,0));
const right=new T.Vector3().setFromMatrixColumn(basis,0),up=new T.Vector3().setFromMatrixColumn(basis,1);
const depth=new T.Vector3().setFromMatrixColumn(basis,2);
/** Keep the sun's orthographic projection fixed to world-space shadow texels. */
export function stableShadowTarget(position:T.Vector3,resolution:number,span=shadowSpan){
  const texel=span/resolution,target=new T.Vector3();
  for(const axis of [right,up,depth])target.addScaledVector(axis,Math.round(position.dot(axis)/texel)*texel);
  return target;
}
