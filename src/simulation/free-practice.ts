import {course,startLinePoint} from '../data/course';
import {exerciseRouteLeg} from '../data/exercise-route';
import {intersectionApproaches} from '../data/intersection';
import {roadDistance} from '../render/course-world';
import type {Exercise,VehicleTelemetry} from '../types';
import {CourseTracker} from './tracker';
import {lineDistance,segmentDistance} from './math';
import type {Observations} from './exam';

// Observe the station the driver actually visits, in any order. The four
// junction approaches share the same signal controller as the visible lights.
const stations:Exercise[]=[...course.exercises.filter(e=>e.id!=='intersection'),
  ...intersectionApproaches.map(a=>{
    const normal=a.normal;
    const point={x:a.stop.x-normal.z*2,z:a.stop.z+normal.x*2};
    return {...course.exercises[4],stop:{point,normal,light:true},
      spawn:{x:point.x-normal.x*10,z:point.z-normal.z*10},
      point:{x:point.x+normal.x*12,z:point.z+normal.z*12},
      yaw:Math.atan2(normal.x,normal.z),indicator:undefined};
  })];
const paths=stations.map(e=>e.id==='intersection'?[e.spawn,e.point]:exerciseRouteLeg(e,0,true));

export class FreePracticeTracker {
  private active=-1;
  private tracker:CourseTracker|null=null;
  private offRoadTime=0;
  private previous:VehicleTelemetry|null=null;
  private stopPassed=false;
  private goalReached=false;

  // Recovery/teleport must not manufacture a line crossing or a missed stop.
  resetCrossings(){this.previous=null;if(this.tracker)this.tracker.previous=null;}

  update(t:VehicleTelemetry,dt:number):{exercise:Exercise['id'];newVisit:boolean;observations:Observations;emergency:boolean}{
    this.offRoadTime=roadDistance(t.position)>1.5?this.offRoadTime+dt:0;
    let best=-1,bestDistance=5;
    for(let i=0;i<stations.length;i++){
      const e=stations[i];
      if(e.id==='intersection'){
        const s=e.stop!,along=lineDistance(t.bumper,s.point,s.normal);
        const facing=Math.sin(t.yaw)*s.normal.x+Math.cos(t.yaw)*s.normal.z;
        if(facing<.5||along < -10||along>15)continue;
      }
      const path=paths[i];
      const d=Math.min(...path.slice(1).map((b,j)=>segmentDistance(t.position,path[j],b)));
      // Prefer the current station at shared boundaries to avoid resetting its timer.
      const ranked=d-(i===this.active?0.6:0);
      if(ranked<bestDistance){bestDistance=ranked;best=i;}
    }
    let newVisit=best!==this.active;
    const station=stations[best];
    if(best===this.active&&station?.stop&&this.stopPassed&&this.previous){
      const {point,normal}=station.stop;
      if(lineDistance(t.bumper,point,normal)>1&&lineDistance(this.previous.bumper,point,normal)<=1)newVisit=true;
    }
    if(newVisit){
      this.active=best;this.stopPassed=false;this.goalReached=false;
      this.tracker=station?new CourseTracker(true,[station]):null;
      // Preserve the driven segment when entering a station at its line.
      if(this.tracker)this.tracker.previous=this.previous;
    }
    const evaluation=this.tracker?.update(t,dt);
    const observations:Observations={...evaluation?.observations,offRoute:this.offRoadTime>1,
      skippedExercise:false,finished:false};
    this.stopPassed ||=!!observations.stopCrossed;
    // Completion is a moment, not a violation charged on every parked frame.
    const atGoal=!!evaluation?.atGoal;
    observations.exerciseFinished=atGoal&&!this.goalReached;
    observations.parkingFinished=!!observations.parkingFinished&&!this.goalReached;
    this.goalReached=atGoal;
    if(station?.id==='intersection'&&station.stop){
      // Green waiting time only applies to the incoming lane, before its line.
      observations.greenLight=observations.greenLight&&lineDistance(t.bumper,station.stop.point,station.stop.normal)>=0;
    }
    observations.distanceFromStart=t.position.x-startLinePoint.x;
    this.previous=t;
    return {exercise:station?.id??'start',newVisit,observations,emergency:!!evaluation?.emergency};
  }
}
