import * as T from 'three';
import type {Vehicle} from '../simulation/vehicle';
import {vehicleDynamics} from '../data/vehicle';
import type {WheelRenderPose} from './car-wheels';

const pose=()=>({position:new T.Vector3(),rotation:new T.Quaternion(),handwheel:0,
  wheels:Array.from({length:4},():WheelRenderPose=>({steering:0,rotation:0,suspensionLength:0}))});
type Pose=ReturnType<typeof pose>;

function readPose(target:Pose,vehicle:Vehicle){
  target.position.copy(vehicle.body.translation());target.rotation.copy(vehicle.body.rotation());
  target.handwheel=vehicle.steering.wheelAngle;
  for(let i=0;i<4;i++){
    const wheel=target.wheels[i];wheel.steering=vehicle.controller.wheelSteering(i)??0;
    // Keep accumulated spin unwrapped: it may cross several full revolutions.
    wheel.rotation=vehicle.wheelRotation(i);
    wheel.suspensionLength=vehicle.time===0?vehicleDynamics.suspensionRestLength:
      vehicle.controller.wheelSuspensionLength(i)??vehicleDynamics.suspensionRestLength;
  }
}

/** Presentation between the two latest fixed physics states. No extrapolation
 * or changes to colliders, tyre forces, telemetry or examination rules. */
export class VehicleMotion {
  private previous=pose();private current=pose();private visual=pose();
  get handwheelAngle(){return this.visual.handwheel;}
  private previousTime=NaN;
  beforeStep(vehicle:Vehicle){readPose(this.previous,vehicle);this.previousTime=vehicle.time;}
  reset(){this.previousTime=NaN;}
  sample(vehicle:Vehicle,alpha=1){
    readPose(this.current,vehicle);
    const span=vehicle.time-this.previousTime;
    // Direct inspection, resets and externally advanced test scenes use the
    // actual state. Pausing/resuming explicitly clears the previous snapshot.
    const blend=span>0&&span<=1/60+1e-7&&Number.isFinite(alpha)?T.MathUtils.clamp(alpha,0,1):1;
    const a=this.previous,b=this.current,out=this.visual;
    out.position.lerpVectors(a.position,b.position,blend);
    out.rotation.slerpQuaternions(a.rotation,b.rotation,blend);
    out.handwheel=T.MathUtils.lerp(a.handwheel,b.handwheel,blend);
    for(let i=0;i<4;i++){
      out.wheels[i].steering=T.MathUtils.lerp(a.wheels[i].steering,b.wheels[i].steering,blend);
      out.wheels[i].rotation=T.MathUtils.lerp(a.wheels[i].rotation,b.wheels[i].rotation,blend);
      out.wheels[i].suspensionLength=T.MathUtils.lerp(a.wheels[i].suspensionLength,b.wheels[i].suspensionLength,blend);
    }
    return out;
  }
}
