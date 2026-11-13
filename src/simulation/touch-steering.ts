import {steeringConfig} from '../data/steering';

/** A relative circular drag in handwheel degrees, without thumb-angle amplification. */
export class TouchSteering {
  static readonly lock=steeringConfig.mechanics.maxHandwheelAngleDeg;
  angle=0;
  private previous=0;
  begin(x:number,y:number){this.previous=Math.atan2(y,x)*180/Math.PI;}
  move(x:number,y:number){
    if(Math.hypot(x,y)<.2)return this.command;
    const next=Math.atan2(y,x)*180/Math.PI;
    const delta=((next-this.previous+540)%360)-180;
    this.previous=next;
    this.angle=Math.max(-TouchSteering.lock,Math.min(TouchSteering.lock,this.angle+delta));
    return this.command;
  }
  get command(){return -this.angle/TouchSteering.lock;}
  reset(){this.angle=0;}
}
