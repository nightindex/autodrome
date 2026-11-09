import { Vector3 } from 'three';

export interface MirrorAngles { yaw:number; pitch:number }
export interface MirrorAdjustments { left:MirrorAngles; right:MirrorAngles }
export type MirrorSide=keyof MirrorAdjustments;
export const mirrorLimits={yaw:8,pitch:6};
// Neutral view leaves a narrow body reference at the inner edge. The near
// plane clears the mirror's own housing while retaining the adjacent doors.
export const sideMirrorView={outward:.7,near:.2,fov:62,aspect:256/144} as const;

/** Arrow coordinates: positive yaw looks car-right (-X), positive pitch looks up. */
export function sideMirrorDirection(side:MirrorSide,angles:MirrorAngles):Vector3 {
  // A glass adjustment deflects the reflected view by twice its travel. Keep
  // azimuth and elevation independent so either pad axis preserves the other.
  const radians=Math.PI/180,azimuth=(side==='left'?1:-1)*Math.atan(sideMirrorView.outward)-angles.yaw*2*radians;
  const elevation=angles.pitch*2*radians,horizontal=Math.cos(elevation);
  return new Vector3(Math.sin(azimuth)*horizontal,Math.sin(elevation),-Math.cos(azimuth)*horizontal).normalize();
}

export function readMirrorAdjustments(value:unknown):MirrorAdjustments {
  const raw=value&&typeof value==='object'?value as Record<string,unknown>:{};
  const side=(value:unknown):MirrorAngles=>{
    const angles=value&&typeof value==='object'?value as Record<string,unknown>:{};
    const angle=(key:keyof MirrorAngles)=>typeof angles[key]==='number'&&Number.isFinite(angles[key])?Math.max(-mirrorLimits[key],Math.min(mirrorLimits[key],angles[key] as number)):0;
    return {yaw:angle('yaw'),pitch:angle('pitch')};
  };
  return {left:side(raw.left),right:side(raw.right)};
}

/** Motor speed in degrees per second, independent of the rendering frequency. */
export function moveMirrorAngle(current:number,target:number,dt:number){
  const travel=24*Math.max(0,Math.min(.1,dt));
  return current+Math.max(-travel,Math.min(travel,target-current));
}
