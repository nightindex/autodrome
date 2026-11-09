import type { Exercise,Vec2 } from '../types';

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
