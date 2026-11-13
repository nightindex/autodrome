import {steeringConfig,type SteeringConfig,type SteeringCurvePoint} from '../data/steering';
import {vehicleConfig} from '../data/vehicle';
import {clamp} from './math';

const radians=(degrees:number)=>degrees*Math.PI/180;
const smoothstep=(t:number)=>t*t*(3-2*t);

/** Clamped, smoothly interpolated speed curve; reverse uses the same envelope. */
export function steeringCurve(curve:readonly SteeringCurvePoint[],speedKmh:number){
  const speed=Math.abs(speedKmh);
  if(speed<=curve[0].speedKmh)return curve[0].value;
  for(let i=1;i<curve.length;i++){
    const a=curve[i-1],b=curve[i];
    if(speed<=b.speedKmh){
      const t=smoothstep((speed-a.speedKmh)/(b.speedKmh-a.speedKmh));
      return a.value+(b.value-a.value)*t;
    }
  }
  return curve.at(-1)!.value;
}

/** The virtual handwheel is the single steering state. Rack angle follows its
 * fixed mechanical ratio; neither animation nor the speed limiter adds a
 * second independently filtered angle. Positive angles steer left. */
export class Steering {
  private handwheel=0;
  private inputEnvelope:number;
  constructor(public readonly config:SteeringConfig=steeringConfig){this.inputEnvelope=radians(config.mechanics.maxHandwheelAngleDeg);}
  get wheelAngle(){return this.handwheel;}
  /** Re-grabbing touch input should hold this angle, including at speed or on poor grip. */
  get holdCommand(){return this.inputEnvelope>1e-9?clamp(this.handwheel/this.inputEnvelope,-1,1):0;}
  get normalized(){return this.handwheel/radians(this.config.mechanics.maxHandwheelAngleDeg);}
  /** Equivalent centre-wheel/rack angle in radians (before Ackermann). */
  get angle(){return this.handwheel/this.config.mechanics.steeringRatio;}
  set angle(value:number){
    const lock=radians(this.config.mechanics.maxHandwheelAngleDeg);
    this.handwheel=clamp(value*this.config.mechanics.steeringRatio,-lock,lock);
  }
  reset(){this.handwheel=0;this.inputEnvelope=radians(this.config.mechanics.maxHandwheelAngleDeg);}

  /** Current target envelope in handwheel radians. Existing angles approach a
   * shrinking envelope at a bounded rate, including when the practice aid changes. */
  limit(speed:number,grip?:number){
    const {mechanics,speedLimitCurve,gripAssist}=this.config;
    let limit=radians(Math.min(mechanics.maxHandwheelAngleDeg,steeringCurve(speedLimitCurve,speed*3.6)));
    if(grip!==undefined){
      const acceleration=Math.min(gripAssist.maxLateralAcceleration,Math.max(0,grip)*9.81*gripAssist.frictionSafetyFactor);
      const rackLimit=Math.atan(vehicleConfig.wheelbase*acceleration/Math.max(1,speed*speed));
      limit=Math.min(limit,rackLimit*mechanics.steeringRatio);
    }
    return limit;
  }

  update(dt:number,command:number,speed:number,grip?:number){
    if(!Number.isFinite(dt)||dt<=0||!Number.isFinite(command)||!Number.isFinite(speed))return this.angle;
    const {mechanics,keyboard,gamma,returnMultiplierCurve,maxIntegrationStepSeconds}=this.config;
    const input=clamp(command,-1,1),returning=Math.abs(input)<1e-6;
    this.inputEnvelope=this.limit(speed,grip);
    const target=returning?0:input*this.inputEnvelope;
    const turnRate=radians(keyboard.turnRateDegPerSecond);
    const countersteerRate=radians(keyboard.countersteerRateDegPerSecond);
    const returnRate=radians(keyboard.returnRateDegPerSecond)*steeringCurve(returnMultiplierCurve,speed*3.6);
    const centerZone=radians(mechanics.maxHandwheelAngleDeg)*gamma.centerZoneFraction;
    const countersteerZone=radians(mechanics.maxHandwheelAngleDeg)*keyboard.countersteerBlendZoneFraction;
    const centreRate=turnRate*(centerZone>0?gamma.minimumRateFactor:1);
    const count=Math.max(1,Math.ceil(dt/maxIntegrationStepSeconds)),stepTime=dt/count;
    for(let i=0;i<count;i++){
      const delta=target-this.handwheel;if(Math.abs(delta)<1e-12){this.handwheel=target;break;}
      // The inbound and outbound curves meet at the same nonzero centre rate
      // with flat tangents. A reversal has no velocity step or pause at zero,
      // and needs no extra lagging state separate from the real handwheel.
      const rateAt=(angle:number)=>{
        if(returning)return returnRate;
        if(input*angle<0){
          const fraction=countersteerZone>0?clamp(Math.abs(angle)/countersteerZone,0,1):1;
          return centreRate+(countersteerRate-centreRate)*smoothstep(fraction);
        }
        const outward=angle*delta>=0,fraction=centerZone>0?clamp(Math.abs(angle)/centerZone,0,1):1;
        const factor=outward?gamma.minimumRateFactor+(1-gamma.minimumRateFactor)*smoothstep(fraction)**gamma.exponent:1;
        return turnRate*factor;
      };
      // RK4 avoids a frame-rate-dependent delay while accelerating out of the
      // soft zone. Clamp the integrated displacement to land exactly on target.
      const direction=Math.sign(delta),a=rateAt(this.handwheel);
      const b=rateAt(this.handwheel+direction*a*stepTime/2),c=rateAt(this.handwheel+direction*b*stepTime/2);
      const d=rateAt(this.handwheel+direction*c*stepTime),step=(a+2*b+2*c+d)*stepTime/6;
      this.handwheel+=clamp(delta,-step,step);
    }
    return this.angle;
  }
}
