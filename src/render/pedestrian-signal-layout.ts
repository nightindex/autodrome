import type {Vec2} from '../types';
import type {Crosswalk} from './crosswalk';

export interface SignalStation {id:string;point:Vec2;yaw:number}
export function pedestrianSignalLayout(crossing:Crosswalk&{id:string},stations:SignalStation[]){
  const {center,normal}=crossing,right={x:-normal.z,z:normal.x};
  return ([-1,1] as const).map(side=>{
    const station=stations.filter(s=>side*((s.point.x-center.x)*right.x+(s.point.z-center.z)*right.z)>0)
      .sort((a,b)=>Math.hypot(a.point.x-center.x,a.point.z-center.z)-Math.hypot(b.point.x-center.x,b.point.z-center.z))[0];
    if(!station)throw new Error(`No signal station for crossing: ${crossing.id}/${side}`);
    return {id:`pedestrian-signal-${crossing.id}-${side<0?'left':'right'}`,crossingId:crossing.id,side,stationId:station.id,point:station.point,yaw:Math.atan2(-side*right.x,-side*right.z)};
  });
}
