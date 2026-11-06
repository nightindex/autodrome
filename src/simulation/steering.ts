import { vehicleConfig,vehicleDynamics } from '../data/vehicle';
import { clamp } from './math';

/** Keyboard input moves the rack over time. Speed changes its rate, not its
 * mechanical travel. The optional practice aid supplies a separate grip cap. */
export class Steering {
  angle=0;
  get normalized(){return this.angle/vehicleDynamics.maxSteeringAngle;}
  reset(){this.angle=0;}
  update(dt:number,command:number,speed:number,grip?:number){
    const {maxSteeringAngle,steeringLateralAcceleration}=vehicleDynamics;
    const t=clamp((Math.abs(speed)-5)/20,0,1),blend=t*t*(3-2*t);
    const returning=Math.abs(command)<1e-6;
    const rate=maxSteeringAngle*(returning?3.2-2.3*blend:1.9-1.55*blend);
    const lateralAcceleration=grip===undefined?Infinity:Math.min(steeringLateralAcceleration,Math.max(0,grip)*9.81*.85);
    const limit=grip===undefined?maxSteeringAngle:Math.min(maxSteeringAngle,Math.atan(vehicleConfig.wheelbase*lateralAcceleration/Math.max(1,speed*speed)));
    // Move towards a changing aid limit at the same bounded rate: switching
    // assistance or crossing a verge must never snap the wheels to a new angle.
    const target=clamp(command,-1,1)*limit,step=rate*Math.max(0,dt);
    this.angle+=clamp(target-this.angle,-step,step);
    return this.angle;
  }
}
