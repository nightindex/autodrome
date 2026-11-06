import type { Vec2 } from '../types';
export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
export const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);
export const dot = (a: Vec2, b: Vec2) => a.x * b.x + a.z * b.z;
export function segmentDistance(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x-a.x, dz=b.z-a.z;
  const t=clamp(((p.x-a.x)*dx+(p.z-a.z)*dz)/(dx*dx+dz*dz || 1),0,1);
  return distance(p,{x:a.x+t*dx,z:a.z+t*dz});
}
export function lineDistance(p: Vec2, origin: Vec2, normal: Vec2) {
  return (origin.x-p.x)*normal.x+(origin.z-p.z)*normal.z;
}
export function crossedLine(previous: Vec2, current: Vec2, origin: Vec2, normal: Vec2, halfWidth: number) {
  const before=lineDistance(previous,origin,normal),after=lineDistance(current,origin,normal);
  if (before < 0 || after >= 0 || before === after) return false;
  const t=before/(before-after);
  const at={x:previous.x+(current.x-previous.x)*t,z:previous.z+(current.z-previous.z)*t};
  return Math.abs((at.x-origin.x)*normal.z-(at.z-origin.z)*normal.x)<=halfWidth;
}
export const angleDifference=(a:number,b:number)=>Math.atan2(Math.sin(a-b),Math.cos(a-b));
export function localPoint(p:Vec2,yaw:number,right:number,forward:number):Vec2 {
  return {x:p.x+Math.cos(yaw)*right+Math.sin(yaw)*forward,z:p.z-Math.sin(yaw)*right+Math.cos(yaw)*forward};
}
