import {vehicleConfig as config,vehicleDynamics as dynamics} from '../data/vehicle';

interface WheelController {
  wheelRotation(index:number):number|null;
  wheelIsInContact(index:number):boolean;
}
interface AxleForces {force:number;braking:number;parkingBrake:number}

/** Keep each wheel's phase while it leaves and rejoins the road. Airborne
 * wheels have rotational inertia; engine torque acts on the front axle only. */
export class WheelSpin {
  private angles=[0,0,0,0];
  private speeds=[0,0,0,0];
  private roadAngles=[0,0,0,0];
  rotation(index:number){return this.angles[index]??0;}
  get drivenSpeed(){return (this.speeds[0]+this.speeds[1])*.5*config.wheelRadius;}
  reset(controller:WheelController){
    this.angles.fill(0);this.speeds.fill(0);
    this.roadAngles=this.roadAngles.map((_,i)=>controller.wheelRotation(i)??0);
  }
  update(controller:WheelController,drive:AxleForces,dt:number){
    for(let i=0;i<4;i++){
      const road=controller.wheelRotation(i)??this.roadAngles[i],delta=road-this.roadAngles[i];
      this.roadAngles[i]=road;
      if(controller.wheelIsInContact(i)){
        this.angles[i]+=delta;this.speeds[i]=delta/dt;continue;
      }
      const before=this.speeds[i];
      let speed=before+(i<2?drive.force*config.wheelRadius/2:0)*dt/dynamics.wheelInertia;
      const brake=drive.braking*(i<2?dynamics.frontBrakeShare:1-dynamics.frontBrakeShare)/2+(i>=2?drive.parkingBrake/2:0);
      const resistance=(brake*config.wheelRadius+dynamics.wheelBearingTorque+dynamics.wheelRotationalDrag*Math.abs(speed))*dt/dynamics.wheelInertia;
      speed=Math.sign(speed)*Math.max(0,Math.abs(speed)-resistance);
      this.angles[i]+=(before+speed)*dt/2;this.speeds[i]=speed;
    }
  }
}
