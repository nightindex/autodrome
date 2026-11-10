import type { Exercise,Vec2,VehicleTelemetry } from '../types';
import {angleDifference} from './math';
import {vehicleConfig} from '../data/vehicle';

export function parkingFit(t:VehicleTelemetry,park:NonNullable<Exercise['parking']>){
  const sin=Math.sin(park.yaw),cos=Math.cos(park.yaw),dx=t.position.x-park.center.x,dz=t.position.z-park.center.z;
  const lateral=dx*cos-dz*sin,longitudinal=dx*sin+dz*cos;
  const contained=Math.abs(lateral)<(park.width-vehicleConfig.width)/2&&Math.abs(longitudinal)<(park.length-vehicleConfig.length)/2;
  const aligned=Math.abs(angleDifference(t.yaw,park.yaw))<.15;
  const onLine=wheelsOnParkingLine(t.wheels,park.controlLine)&&(park.controlLine!==undefined||Math.abs(longitudinal)<.32);
  const wheels=park.controlLine?.wheels??[],matched=wheels.filter(index=>wheelsOnParkingLine(t.wheels,park.controlLine?{...park.controlLine,wheels:[index]}:undefined)).length;
  return {contained,aligned,onLine,matched,total:wheels.length,correct:contained&&aligned&&onLine};
}

/** Wheel telemetry is the ground contact centre; both selected wheels must
 * lie within the actual painted rectangle, including its finite end caps. */
export function wheelsOnParkingLine(wheels:Vec2[],line:NonNullable<Exercise['parking']>['controlLine']):boolean {
  if(!line)return true;
  const [a,b]=line.points,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
  if(length<1e-6||line.width<=0||line.wheels.length===0)return false;
  return line.wheels.every(index=>{
    const wheel=wheels[index];if(!wheel)return false;
    const x=wheel.x-a.x,z=wheel.z-a.z;
    const along=(x*dx+z*dz)/length,across=(x*dz-z*dx)/length;
    return along>=-1e-6&&along<=length+1e-6&&Math.abs(across)<=line.width/2+1e-6;
  });
}
