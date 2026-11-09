import { describe,expect,it } from 'vitest';
import { course,itinerary } from '../src/data/course';
import { CourseTracker } from '../src/simulation/tracker';
import { ExamEngine } from '../src/simulation/exam';
import { distance,lineDistance,localPoint } from '../src/simulation/math';
import { vehicleConfig as car,wheelCenter } from '../src/data/vehicle';
import type { Vec2,VehicleTelemetry } from '../src/types';
function sample(p:Vec2,yaw:number,speed=2.5,reverse=false):VehicleTelemetry{
  return {time:20,position:p,yaw,speed,signedSpeed:reverse?-speed:speed,rpm:1500,gear:reverse?-1:2,throttle:.2,brake:0,clutch:0,steering:0,engine:true,stalled:false,belt:true,handbrake:false,indicator:'off',hazards:false,ignition:false,positionLights:false,headlights:false,fogLights:false,bumper:localPoint(p,yaw,0,car.length/2),wheels:[0,1,2,3].map(index=>{const {x,z}=wheelCenter(index);return localPoint(p,yaw,x,z);}),collision:false};
}
describe('complete reference route sensor replay',()=>{
  it('completes every exercise, including a second intersection visit',()=>{
    const tracker=new CourseTracker(false),engine=new ExamEngine('exam');engine.setExercise('start');let visits=1;const stops=new Set<number>();let emergencyStopped=false;const controlHits:unknown[]=[];
    function feed(t:VehicleTelemetry,dt=.04){
      const e=tracker.current;t.indicator=e.id==='start'?'left':e.indicator??'off';
      if(e.stop?.light)t.time=e.stop.normal.x?56:20;
      if(e.id==='acceleration')t.speed=7;
      const result=tracker.update(t,dt);engine.update(t,result.observations,dt);
      if(result.observations.controlLine&&controlHits.length<5)controlHits.push({exercise:e.id,position:t.position,yaw:t.yaw,wheels:t.wheels});
      const done=e.id==='emergency'?engine.emergencyCompleted&&!t.hazards&&t.speed>.25:result.atGoal;
      if(done&&tracker.next()){engine.setExercise(tracker.current.id);visits++;}
      return result;
    }
    for(let leg=1;leg<course.route.length;leg++){
      const a=course.route[leg-1],b=course.route[leg],len=distance(a,b),steps=Math.ceil(len/.1);
      const garageReverse=tracker.current.id==='garage'&&b.z===course.exercises[6].point.z&&b.x===course.exercises[6].point.x;
      const parallelReverse=tracker.current.id==='parallel'&&b.x===course.exercises[10].point.x&&b.z===course.exercises[10].point.z;
      const reverse=garageReverse||parallelReverse;
      const yaw=Math.atan2(b.x-a.x,b.z-a.z)+(reverse?Math.PI:0);
      for(let j=1;j<=steps;j++){
        const p={x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps};let t=sample(p,yaw,2.5,reverse);
        const e=tracker.current;
        if(e.stop&&!e.stop.light&&!stops.has(tracker.index)){
          const d=lineDistance(t.bumper,e.stop.point,e.stop.normal);
          if(d>=0&&d<.5){stops.add(tracker.index);for(let k=0;k<80;k++)feed(sample(p,yaw,0),.04);}
        }
        const result=feed(t);
        if(result.emergency&&!emergencyStopped){emergencyStopped=true;for(let k=0;k<90;k++){t=sample(p,yaw,0);t.hazards=true;feed(t,.04);}feed(sample(p,yaw));}
      }
      if(reverse){for(let k=0;k<55;k++)feed(sample(b,yaw,0,true),.04);}
      if(leg===course.route.length-1)feed(sample(b,yaw,0));
    }
    expect(visits,JSON.stringify({index:tracker.index,events:engine.events,controlHits})).toBe(itinerary.length);
    expect(engine.events,JSON.stringify({events:engine.events,controlHits})).toEqual([]);
    expect(engine.status).toBe('passed');
  });
});
