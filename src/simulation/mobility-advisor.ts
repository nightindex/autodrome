import type {VehicleTelemetry} from '../types';

export type MobilityIssue='engine'|'stalled'|'neutral'|'handbrake'|'brake'|'clutch'|'stuck'|'overturned';
export type RecoveryReason='stuck'|'overturned'|null;
type Controls={throttle:boolean;brake:boolean;clutch:boolean};

const demandDelay=.7,releaseGrace=4,movingSpeed=.4;

/** Explains a failed launch using simulation time; never changes the vehicle. */
export class MobilityAdvisor {
  private demandTime=0;
  private releaseTime=0;
  private issue:MobilityIssue|null=null;

  reset(){this.demandTime=0;this.releaseTime=0;this.issue=null;}

  update(t:VehicleTelemetry,controls:Controls,dt:number,recoveryReason:RecoveryReason):MobilityIssue|null{
    if(recoveryReason==='overturned'){this.reset();return 'overturned';}
    if(t.speed>=movingSpeed){this.reset();return null;}
    const elapsed=Number.isFinite(dt)?Math.max(0,dt):0;
    const cause=this.cause(t,controls);
    this.demandTime=controls.throttle?this.demandTime+elapsed:0;
    if(controls.throttle&&this.demandTime>=demandDelay&&cause){
      this.issue=cause;this.releaseTime=releaseGrace;
      return cause;
    }
    if(!controls.throttle)this.releaseTime=Math.max(0,this.releaseTime-elapsed);
    // Releasing the gas briefly leaves the relevant instruction visible. A
    // corrected cause clears it instead of introducing an unattempted launch.
    if(this.issue===cause&&this.releaseTime>0)return this.issue;
    this.issue=null;
    return recoveryReason==='stuck'?'stuck':null;
  }

  private cause(t:VehicleTelemetry,controls:Controls):MobilityIssue|null{
    if(!t.engine)return t.stalled?'stalled':'engine';
    if(t.gear===0)return 'neutral';
    if(t.handbrake)return 'handbrake';
    if(controls.brake||t.brake>.1)return 'brake';
    if(controls.clutch||t.clutch>.85)return 'clutch';
    return null;
  }
}
