import {describe,expect,it} from 'vitest';
import {course} from '../src/data/course';
import {exerciseRouteLeg} from '../src/data/exercise-route';
import {vehicleConfig,wheelCenter} from '../src/data/vehicle';
import {CourseTracker} from '../src/simulation/tracker';
import {ExamEngine} from '../src/simulation/exam';
import {PracticeGuide} from '../src/simulation/practice-guide';
import {localPoint,lineDistance} from '../src/simulation/math';
import {stopLineApproachEdge} from '../src/data/marking-standards';
import type {Exercise,Vec2,VehicleTelemetry} from '../src/types';

function sample(e:Exercise,p=e.spawn,yaw=e.yaw,speed=2.5,reverse=false):VehicleTelemetry{
  return {time:e.stop?.normal.x?56:20,position:p,yaw,speed,signedSpeed:reverse?-speed:speed,rpm:1500,gear:reverse?-1:e.id==='acceleration'?2:1,throttle:.2,brake:0,clutch:0,steering:0,engine:true,stalled:false,belt:true,handbrake:false,indicator:e.id==='start'?'left':e.indicator??'off',hazards:false,ignition:true,positionLights:false,headlights:false,fogLights:false,bumper:localPoint(p,yaw,0,vehicleConfig.length/2),wheels:[0,1,2,3].map(i=>{const w=wheelCenter(i);return localPoint(p,yaw,w.x,w.z);}),collision:false};
}
describe('selected exercises require their own completion conditions',()=>{
  for(const e of course.exercises){
    it(`${e.id}: reaching the destination alone does not pass`,()=>{
      const guide=new PracticeGuide(e,0,true),engine=new ExamEngine('practice');engine.setExercise(e.id);
      const t=sample(e,e.point,e.parking?.yaw??e.yaw,0);
      expect(guide.canComplete(true,t,engine)).toBe(false);
    });
    it(`${e.id}: accepts a correctly performed attempt`,()=>{
      const tracker=new CourseTracker(true,[e]),engine=new ExamEngine('practice'),guide=new PracticeGuide(e,0,true);engine.setExercise(e.id);
      let completed=false,stopped=false,emergency=false;
      function feed(t:VehicleTelemetry,dt=.04){
        const result=tracker.update(t,dt);engine.update(t,{...result.observations,finished:false},dt);guide.update(t,engine,result.observations,dt);
        completed ||=guide.canComplete(result.atGoal,t,engine);return result;
      }
      const leg=exerciseRouteLeg(e,0,true);feed(sample(e));
      for(let i=1;i<leg.length&&!completed;i++){
        const a=leg[i-1],b=leg[i],length=Math.hypot(b.x-a.x,b.z-a.z),steps=Math.ceil(length/.1);
        const reverse=!!e.parking&&guide.path.reversing,yaw=Math.atan2(b.x-a.x,b.z-a.z)+(reverse?Math.PI:0);
        for(let j=1;j<=steps&&!completed;j++){
          const p:Vec2={x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps},t=sample(e,p,yaw,e.id==='acceleration'?6:2.5,reverse);
          if(e.stop&&!e.stop.light&&!stopped){
            const edge=stopLineApproachEdge(e.stop.point,e.stop.normal),d=lineDistance(t.bumper,edge,e.stop.normal);
            if(d>=0&&d<.5){stopped=true;for(let k=0;k<80;k++)feed({...sample(e,p,yaw,0),handbrake:e.id==='hill'});}
          }
          const result=feed(t);
          if(result.emergency&&!emergency){emergency=true;for(let k=0;k<80;k++)feed({...sample(e,p,yaw,0),hazards:true});feed(t);}
        }
        if(e.parking&&i===leg.length-1)for(let k=0;k<55;k++)feed(sample(e,b,e.parking.yaw,0,true));
      }
      if(e.id==='finish')feed(sample(e,e.point,e.yaw,0));
      expect(completed,JSON.stringify({exercise:e.id,events:engine.events,segment:guide.path.segment,points:guide.path.points.length})).toBe(true);
      expect(engine.events,JSON.stringify(engine.events)).toEqual([]);
    });
  }
  it('rejects a red-light crossing and ignores previous-attempt failures after retry',()=>{
    const e=course.exercises[4],engine=new ExamEngine('practice');engine.setExercise(e.id);
    engine.update(sample(e),{stopCrossed:true,redLight:true},.1);
    const guide=new PracticeGuide(e,0,true);guide.update(sample(e),engine,{stopCrossed:true,greenLight:true},.1);
    expect(guide.canComplete(true,sample(e),engine)).toBe(false);expect(guide.view(sample(e),engine,'ru').phase).toBe('retry-required');
    engine.setExercise(e.id);const retry=new PracticeGuide(e,0,true,engine.events.length);retry.update(sample(e),engine,{stopCrossed:true,greenLight:true},.1);
    expect(retry.canComplete(true,sample(e),engine)).toBe(true);
  });
});
