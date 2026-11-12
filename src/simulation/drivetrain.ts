import { vehicleConfig as c,vehicleDynamics as dynamics } from '../data/vehicle';
import { clamp } from './math';

const rpmToRadians=2*Math.PI/60;
const {clutchCapacity,engineInertia}=dynamics;
// Estimated full-load curve for the naturally aspirated 1.5, not a dyno trace.
const torqueCurve=[[0,.45],[850,.66],[1500,.82],[2500,.94],[4000,1],[5000,.97],[5800,.92],[6200,.84]];
export function engineTorque(rpm:number){
  for(let i=1;i<torqueCurve.length;i++)if(rpm<=torqueCurve[i][0]){
    const [a,b]=[torqueCurve[i-1],torqueCurve[i]],t=clamp((rpm-a[0])/(b[0]-a[0]),0,1);
    return c.maxTorque*(a[1]+(b[1]-a[1])*t);
  }
  return c.maxTorque*torqueCurve.at(-1)![1];
}
export function gearRatio(gear:number){return (gear<0?-c.reverseRatio:(c.gearRatios[gear]??0))*c.finalDrive;}
export function rpmAtSpeed(speed:number,gear:number){return speed/c.wheelRadius*gearRatio(gear)/rpmToRadians;}
/** Mechanical speed at a given RPM; road load can impose a lower top speed. */
export function speedAtRpm(rpm:number,gear:number){const ratio=gearRatio(gear);return ratio===0?0:rpm*rpmToRadians*c.wheelRadius/ratio;}

export class Drivetrain {
  rpm=0;engine=false;stalled=false;gear=0;throttle=0;brake=0;clutch=1;handbrake=true;
  private stallTime=0;private speed=0;private pendingGear:number|null=null;private manualGear:number|null=null;private shiftTime=0;private limiter=false;
  reset(){this.rpm=0;this.engine=false;this.stalled=false;this.gear=0;this.throttle=0;this.brake=0;this.clutch=1;this.handbrake=true;this.stallTime=0;this.speed=0;this.pendingGear=null;this.manualGear=null;this.shiftTime=0;this.limiter=false;}
  ignite(){if(this.engine){this.engine=false;return;}if(this.gear===0||this.clutch>.8){this.engine=true;this.stalled=false;this.rpm=c.idleRpm;this.stallTime=0;}}
  shift(gear:number,assist=false,clutchHeld=false){
    if(!Number.isInteger(gear)||gear< -1||gear>5)return false;
    this.manualGear=null;
    if(gear===this.gear){this.pendingGear=null;return true;}
    // The reverse interlock and over-rev protection also apply with the engine off.
    if(!this.safeGear(gear))return false;
    if(this.clutch>.65||!this.engine||gear===0){this.gear=gear;this.pendingGear=null;return true;}
    // A keyboard chord reaches us before the physical pedal has finished
    // moving. Keep the requested gear only while the driver holds the clutch.
    if(!assist){if(clutchHeld){this.manualGear=gear;return true;}return false;}
    this.pendingGear=gear;this.shiftTime=0;return true;
  }
  private safeGear(gear:number){return !((gear<0&&this.speed>.5)||(gear>0&&this.speed<-.5)||Math.abs(rpmAtSpeed(this.speed,gear))>c.redlineRpm*1.05);}
  update(dt:number,signedSpeed:number,controls:{throttle:number;brake:number;clutch:number},assist:boolean,freeAxleInertia?:number){
    this.speed=signedSpeed;
    if(!assist)this.pendingGear=null;
    if(this.manualGear!==null){
      if(assist||controls.clutch<=.65||!this.safeGear(this.manualGear))this.manualGear=null;
      else if(this.clutch>.65){this.gear=this.manualGear;this.manualGear=null;}
    }
    this.throttle=approach(this.throttle,clamp(controls.throttle,0,1),dt*2.8);
    this.brake=approach(this.brake,clamp(controls.brake,0,1),dt*5);
    if(this.rpm>=c.redlineRpm)this.limiter=true;
    if(this.rpm<c.redlineRpm-180)this.limiter=false;
    // Lift the throttle during an assisted shift, then restore pedal demand.
    const fuel=this.engine&&!this.limiter&&this.pendingGear===null?this.throttle:0;
    // Closed-throttle pumping losses provide noticeable engine braking.
    const drag=this.engine?8+this.rpm*.005*(1-fuel*.85):14;
    const idle=this.engine?clamp((c.idleRpm-this.rpm)*.18+11,0,55):0;
    const motorTorque=fuel*engineTorque(this.rpm)+idle-drag;
    let clutchTarget=clamp(controls.clutch,0,1);
    if(assist&&this.engine&&this.gear!==0){
      const shaftRpm=rpmAtSpeed(signedSpeed,this.gear),launchRpm=this.throttle<.02?c.idleRpm+150:1250+this.throttle*850;
      if(shaftRpm<launchRpm){
        const capacity=this.throttle<.02?0:clamp(motorTorque+(this.rpm-launchRpm)*.12,0,clutchCapacity);
        clutchTarget=Math.max(clutchTarget,1-capacity/clutchCapacity);
      }
    }
    if(this.pendingGear!==null){
      clutchTarget=1;this.shiftTime+=dt;
      // Speed can change while the clutch opens (e.g. rolling down a ramp).
      if(!this.safeGear(this.pendingGear))this.pendingGear=null;
      else if(this.shiftTime>=.18&&this.clutch>.9){this.gear=this.pendingGear;this.pendingGear=null;}
    }
    this.clutch=approach(this.clutch,clutchTarget,dt*(clutchTarget>this.clutch?6:assist?2.2:1.6));
    const ratio=gearRatio(this.gear),omega=this.rpm*rpmToRadians;
    const shaftOmega=signedSpeed/c.wheelRadius*ratio;
    const capacity=ratio===0?0:clutchCapacity*(1-this.clutch);
    // Friction can stop the engine, but cannot reverse it and drive the wheels.
    // Apply that limit before coupling, then use the same momentum for RPM.
    const freeOmega=Math.max(0,omega+motorTorque*dt/engineInertia);
    // Implicit viscous coupling conserves the engine's response to load without
    // oscillating across the shaft speed on successive fixed steps.
    // With both driven wheels airborne, include their reflected inertia in
    // the same coupling step. Chassis speed no longer represents shaft RPM.
    const axleResponse=freeAxleInertia===undefined?0:dt*ratio*ratio*dynamics.drivelineEfficiency/freeAxleInertia;
    const transmitted=clamp((freeOmega-shaftOmega)/(dt/engineInertia+axleResponse+1/18),-capacity,capacity);
    this.rpm=Math.max(0,(freeOmega-transmitted*dt/engineInertia)/rpmToRadians);
    if(this.engine&&this.rpm<450&&this.clutch<.35&&!assist)this.stallTime+=dt;else this.stallTime=0;
    if(this.stallTime>.25){this.engine=false;this.stalled=true;}
    return {
      force:transmitted*ratio*dynamics.drivelineEfficiency/c.wheelRadius,
      // Forces in N, converted to the wheel controller's impulses by Vehicle.
      braking:this.brake*dynamics.serviceBrakeForce,
      parkingBrake:this.handbrake?dynamics.parkingBrakeForce:0,
    };
  }
}
function approach(value:number,target:number,amount:number){return value+clamp(target-value,-amount,amount);}
