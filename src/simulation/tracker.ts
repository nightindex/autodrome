import type { Exercise, VehicleTelemetry, Vec2 } from '../types';
import type { Observations } from './exam';
import { course, itinerary, mapPoint,startLinePoint,finishLinePoint } from '../data/course';
import { roadDistance } from '../render/course-world';
import { signalAxis,signalState } from '../data/traffic-signals';
import { crossedLine, distance, lineDistance, segmentDistance } from './math';
import { stopLineApproachEdge } from '../data/marking-standards';
import { parkingFit } from './parking';
export class CourseTracker {
  index=0;previous:VehicleTelemetry|null=null;offRoadTime=0;routeTime=0;goalTime=0;visitTime=0;
  emergencyTriggered=false;hillPeak=-Infinity;private startPosition=startLinePoint;
  private finishCrossed=false;
  private parkingApproached=false;
  constructor(public single:boolean,public exercises:Exercise[]=itinerary){}
  get current(){return this.exercises[this.index];}
  reset(index=0){this.index=index;this.previous=null;this.offRoadTime=0;this.routeTime=0;this.goalTime=0;this.visitTime=0;this.emergencyTriggered=false;this.hillPeak=-Infinity;this.finishCrossed=false;this.parkingApproached=false;}
  next(){if(this.single||this.index>=this.exercises.length-1)return false;this.reset(this.index+1);return true;}
  update(t:VehicleTelemetry,dt:number):{observations:Observations;atGoal:boolean;emergency:boolean}{
    const e=this.current,o:Observations={};this.visitTime+=dt;
    const dist=distance(t.position,e.point);const prev=this.previous??t;
    if(e.id==='start')o.startCrossed=crossedLine(prev.bumper,t.bumper,this.startPosition,{x:1,z:0},3);
    o.distanceFromStart=t.position.x-this.startPosition.x;
    if(e.stop){
      const s=e.stop;const lateral=Math.abs((t.bumper.x-s.point.x)*s.normal.z-(t.bumper.z-s.point.z)*s.normal.x);
      // Measure from the approaching edge of the visible 40 cm stripe.
      const edge=stopLineApproachEdge(s.point,s.normal);
      if(lateral<4){o.stopDistance=lineDistance(t.bumper,edge,s.normal);o.stopCrossed=crossedLine(prev.bumper,t.bumper,edge,s.normal,4);}
      const signal=signalState(t.time,signalAxis(s.normal));
      o.redLight=!!s.light&&signal!=='green';o.greenLight=!!s.light&&signal==='green';
    }
    if(e.id==='hill'){
      if(t.position.x>7){this.hillPeak=Math.max(this.hillPeak,t.position.x);o.hillRollback=this.hillPeak-t.position.x;}
    }
    if(e.id==='rightAngle'||e.id==='snake')o.controlLine=t.wheels.some(w=>roadDistance(w)>-.05);
    if(roadDistance(t.position)>1.5)this.offRoadTime+=dt;else this.offRoadTime=0;
    // The active leg constrains route direction as well as driveable asphalt.
    const routeDistance=this.distanceToActiveLeg(t.position);
    if(this.visitTime>4&&routeDistance>12)this.routeTime+=dt;else this.routeTime=0;
    o.offRoute=this.offRoadTime>1||this.routeTime>2;
    let atGoal=dist<e.radius;
    let emergency=false;
    if(e.id==='emergency'){
      if(dist<10 && !this.emergencyTriggered){this.emergencyTriggered=true;emergency=true;}
      o.emergencySignal=emergency;
      atGoal=this.emergencyTriggered && t.speed<.12;
    }
    if(e.parking){
      if(dist<12)this.parkingApproached=true;
      o.parkingCorrect=parkingFit(t,e.parking).correct;
      atGoal=dist<2.3&&t.speed<.12;
      if(atGoal)this.goalTime+=dt;else this.goalTime=0;
      atGoal=this.goalTime>2;o.parkingFinished=atGoal;
    }
    if(e.id==='finish'){o.finishCrossed=crossedLine(prev.bumper,t.bumper,{x:finishLinePoint.x,z:e.point.z},{x:-1,z:0},3.5);this.finishCrossed ||=o.finishCrossed;atGoal=this.finishCrossed&&dist<4&&t.speed<.12;}
    if(e.indicator && e.id!=='finish'&&dist<8){o.turnRequired=e.indicator;o.turnCrossed=atGoal;}
    if(e.id==='acceleration'&&atGoal)o.signViolation=t.speed*3.6<20;
    o.exerciseFinished=atGoal;
    if(e.id==='finish')o.finished=atGoal;
    if(!this.single&&e.id!=='finish'&&crossedLine(prev.bumper,t.bumper,course.exercises.find(e=>e.id==='finish')!.point,{x:-1,z:0},3.5))o.skippedExercise=true;
    // Passing a destination by a large margin without satisfying parking is a missed exercise.
    if(e.parking && this.parkingApproached && this.visitTime>30 && dist>22)o.skippedExercise=true;
    this.previous=t;return {observations:o,atGoal,emergency};
  }
  private distanceToActiveLeg(p:Vec2){
    const e=this.current;
    if(this.single){
      if(e.id==='rightAngle'){
        const points=course.roads[4].points;return Math.min(...points.slice(1).map((b,i)=>segmentDistance(p,points[i],b)));
      }
      return Math.min(distance(p,e.spawn),distance(p,e.point),segmentDistance(p,e.spawn,e.point));
    }
    // Reference points are ordered. Repeated crossings use their occurrence in the itinerary.
    let start=0,end=course.route.length-1;
    const match=(point:Vec2,from:number)=>{
      let best=Infinity,idx=from;for(let i=from;i<course.route.length;i++){const d=distance(point,course.route[i]);if(d<best){best=d;idx=i;}if(d<.1)break;}return idx;
    };
    for(let i=0;i<=this.index;i++){end=match(this.exercises[i].point,start);if(i<this.index)start=end;}
    let d=Infinity;for(let i=Math.max(1,start);i<=Math.min(course.route.length-1,end+2);i++)d=Math.min(d,segmentDistance(p,course.route[i-1],course.route[i]));
    return d;
  }
}
