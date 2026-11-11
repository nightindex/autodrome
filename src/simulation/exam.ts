import type { ExamEvent, ExerciseId, Mode, VehicleTelemetry } from '../types';
import { ruleById } from '../data/rules';

/** Observations are geometric facts; scoring is independent of rendering and Rapier. */
export interface Observations {
  startCrossed?: boolean; distanceFromStart?: number;
  stopDistance?: number; stopCrossed?: boolean; redLight?: boolean; greenLight?: boolean;
  turnRequired?: 'left' | 'right'; turnCrossed?: boolean;
  controlLine?: boolean; parkingFinished?: boolean; parkingCorrect?: boolean;
  exerciseFinished?: boolean; emergencySignal?: boolean; hillRollback?: number;
  signViolation?: boolean; offRoute?: boolean; skippedExercise?: boolean;
  finishCrossed?: boolean; finished?: boolean; abandoned?: boolean;
}
export class ExamEngine {
  events: ExamEvent[]=[]; score=0; time=0; exercise:ExerciseId='start';
  exerciseTime=0; status:'running'|'passed'|'failed'='running';
  private seen=new Set<string>(); private visit=0;
  private started=false; private crossedStart=false; private speedSeconds=0;
  private startCancelChecked=false;
  private finishIndicatorChecked=false;
  private stoppedAt:number|null=null; private stoppedFor=0; private stopSatisfied=false;
  private lineStopOccurred=false;
  private wasStopped=false; private stopApproached=false; private wasStalled=false;
  private stallCount=0; private stallEpisode=false; private wasCollision=false; private collisionCount=0;
  private greenSeconds=0; private secondGear=false;
  private emergencyAt:number|null=null; private emergencyStop:number|null=null; private emergencyHazards=false;
  private emergencyHazardsAt:number|null=null;
  private hadParkingReverse=false;
  private beltEpisodes=0;private wasUnbelted=false;private speed40Episodes=0;private wasOver40=false;
  private activePenalties=new Set<number>();private previousPenalties=new Set<number>();private penaltyEpisode=0;
  constructor(public mode:Mode, public limitSeconds=900, public readonly freeDriving=false) {}
  setExercise(id:ExerciseId) {
    this.exercise=id;this.exerciseTime=0;this.visit++;
    this.stoppedAt=null;this.stoppedFor=0;this.stopSatisfied=false;this.wasStopped=false;
    this.stopApproached=false;this.lineStopOccurred=false;this.greenSeconds=0;this.secondGear=false;
    if(!(this.mode==='practice'&&this.freeDriving))this.resetEmergency();
    this.hadParkingReverse=false;
  }
  private resetEmergency(){this.emergencyAt=null;this.emergencyStop=null;this.emergencyHazards=false;this.emergencyHazardsAt=null;}
  private add(id:number,key?:string) {
    if(key===undefined){
      if(this.mode==='practice'&&this.freeDriving){
        this.activePenalties.add(id);
        if(this.previousPenalties.has(id))return;
        key=`${this.visit}:${id}:episode:${++this.penaltyEpisode}`;
      }else key=`${this.visit}:${id}`;
    }
    if(this.seen.has(key))return;
    this.seen.add(key);const rule=ruleById(id);
    this.events.push({ruleId:id,time:this.time,points:rule.points,exercise:this.exercise,key});this.score+=rule.points;
  }
  get stoppedCorrectly(){return this.stopSatisfied;}
  get stopSeconds(){return this.stoppedFor;}
  get emergencyCompleted(){return this.emergencyStop!==null && this.emergencyHazards && this.time-this.emergencyStop>=3;}
  get parkingReversed(){return this.hadParkingReverse;}
  get emergencySignalled(){return this.emergencyAt!==null;}
  get emergencyStopped(){return this.emergencyStop!==null;}
  get emergencyHoldRemaining(){return this.emergencyStop===null?3:Math.max(0,3-(this.time-this.emergencyStop));}
  get secondGearUsed(){return this.secondGear;}
  update(t:VehicleTelemetry,o:Observations,dt:number) {
    if(this.status!=='running')return;
    this.time+=dt;this.exerciseTime+=dt;
    const stopped=t.speed<0.12, moving=t.speed>0.25;
    const free=this.mode==='practice'&&this.freeDriving;
    this.activePenalties.clear();
    // A free trip has no required itinerary, abandonment or exam deadline.
    if(free)o={...o,skippedExercise:false,abandoned:false,finished:false};
    if(!free&&!this.started){if(this.time>=30&&(!moving||this.time>30))this.add(10,'start-30');if(this.time>=40&&(!moving||this.time>40))this.add(23,'start-40');}
    if(t.belt)this.wasUnbelted=false;
    if(moving && !t.belt){if(!free||!this.wasUnbelted)this.add(1,free?`belt:${++this.beltEpisodes}`:'belt');this.wasUnbelted=true;}
    if(moving)this.started=true;
    if(o.startCrossed){this.crossedStart=true;if(free)this.startCancelChecked=false;if(t.indicator!=='left')this.add(2,free?undefined:'start-indicator');}
    if(this.crossedStart && !this.startCancelChecked && (o.distanceFromStart??0)>=10){this.startCancelChecked=true;if(t.indicator==='left')this.add(3,free?undefined:'start-cancel');}
    if(o.turnCrossed && o.turnRequired && t.indicator!==o.turnRequired)this.add(5);
    if(o.signViolation)this.add(6);
    if((o.finishCrossed||o.finished)&&(free||!this.finishIndicatorChecked)){this.finishIndicatorChecked=true;if(t.indicator!=='right')this.add(7,free?undefined:'finish-indicator');}
    if(t.speed*3.6>20 && this.exercise!=='acceleration'){
      this.speedSeconds+=dt;
      while(this.speedSeconds>=5-1e-8){this.speedSeconds-=5;this.add(8,`speed:${this.events.filter(e=>e.ruleId===8).length}`);}
    }else this.speedSeconds=0;

    if(o.stopDistance!==undefined){
      const d=o.stopDistance;
      // An exercise can spawn parked near its line; preparation is not a failed approach.
      if(d>=0 && d<6 && (this.started||d<=1))this.stopApproached=true;
      if(stopped && this.stopApproached && d>=0 && d<6){
        if(!this.wasStopped){this.stoppedAt=this.time;this.stoppedFor=0;if(d>1)this.add(4);}
        this.stoppedFor+=dt;
        if(d<=1)this.lineStopOccurred=true;
        if(d<=1 && this.stoppedFor>=3-1e-8)this.stopSatisfied=true;
      }
      if(!stopped && this.stoppedAt!==null){
        if(this.stoppedFor<3-1e-8)this.add(12);
        this.stoppedAt=null;
      }
      if(this.exercise==='hill' && this.stoppedAt!==null && this.time-this.stoppedAt>=30)this.add(13);
      this.wasStopped=stopped;
    }
    if(o.stopCrossed){
      if(o.redLight)this.add(24);
      else if(!this.lineStopOccurred && this.exercise!=='intersection'){this.add(this.exercise==='railway'?25:11);}
    }
    if(this.exercise==='intersection'){
      if(o.greenLight)this.greenSeconds+=dt;else this.greenSeconds=0;
      if(this.greenSeconds>30)this.add(9);
    }
    if(this.exercise==='hill' && (o.hillRollback??0)>0.3+1e-8)this.add(14);
    if(this.exercise==='snake'||this.exercise==='rightAngle'){
      if(o.controlLine)this.add(15);
      if(this.exerciseTime>120)this.add(16);
    }
    if(this.exercise==='garage'||this.exercise==='parallel'){
      if(t.signedSpeed<-.15)this.hadParkingReverse=true;
      if(o.parkingFinished && (!o.parkingCorrect || !this.hadParkingReverse))this.add(17);
    }
    if(this.exercise==='acceleration'){
      if(t.gear===2 && moving)this.secondGear=true;
      if(o.exerciseFinished && !this.secondGear)this.add(18);
    }
    if(o.emergencySignal && (free||this.emergencyAt===null)){
      this.resetEmergency();this.emergencyAt=this.time;
      if(free)for(const id of [19,20,21])this.previousPenalties.delete(id);
    }
    if((this.exercise==='emergency'||free) && this.emergencyAt!==null){
      if(stopped && this.emergencyStop===null)this.emergencyStop=this.time;
      if((this.emergencyStop??this.time)-this.emergencyAt>2+1e-8)this.add(19);
      if(this.emergencyStop!==null){
        if(t.hazards){this.emergencyHazards=true;if(this.emergencyHazardsAt===null)this.emergencyHazardsAt=this.time;}
        if((this.emergencyHazardsAt??this.time)-this.emergencyStop>3+1e-8)this.add(20);
        if(moving && t.hazards)this.add(21);
        if(free&&moving&&this.emergencyHazards)this.resetEmergency();
      }
    }
    if(t.stalled && !this.wasStalled){this.stallCount++;this.add(22,`stall:${this.stallCount}`);this.stallEpisode=true;}
    if(t.engine)this.stallEpisode=false;
    this.wasStalled=t.stalled||this.stallEpisode;
    if(o.abandoned)this.add(26,'abandon');
    if(o.skippedExercise)this.add(27);
    if(o.offRoute)this.add(28);
    if(t.signedSpeed<-.2 && !['garage','parallel','hill'].includes(this.exercise))this.add(29);
    if(t.collision && !this.wasCollision){this.collisionCount++;this.add(30,`collision:${this.collisionCount}`);}
    this.wasCollision=t.collision;
    const over40=t.speed*3.6>40;
    if(over40&&(!free||!this.wasOver40))this.add(31,free?`speed-40:${++this.speed40Episodes}`:'speed-40');
    this.wasOver40=over40;
    if(this.mode==='exam' && this.time>this.limitSeconds)this.add(32,'time-limit');
    if(this.mode==='exam' && this.score>=100)this.status='failed';
    else if(o.finished)this.status=this.score<100?'passed':this.mode==='exam'?'failed':'passed';
    const previous=this.previousPenalties;this.previousPenalties=this.activePenalties;this.activePenalties=previous;
  }
}
