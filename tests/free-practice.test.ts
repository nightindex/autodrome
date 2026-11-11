import {describe,expect,it} from 'vitest';
import {course,startLinePoint,finishLinePoint,mapPoint} from '../src/data/course';
import {intersectionApproaches} from '../src/data/intersection';
import {stopLineApproachEdge} from '../src/data/marking-standards';
import {vehicleConfig,wheelCenter} from '../src/data/vehicle';
import {ExamEngine} from '../src/simulation/exam';
import {FreePracticeTracker} from '../src/simulation/free-practice';
import {localPoint} from '../src/simulation/math';
import type {VehicleTelemetry,Vec2} from '../src/types';

function sample(position:Vec2,yaw:number,patch:Partial<VehicleTelemetry>={}):VehicleTelemetry{
  return {time:20,position,yaw,speed:2,signedSpeed:2,rpm:1500,gear:1,throttle:.2,brake:0,clutch:0,steering:0,
    engine:true,stalled:false,belt:true,handbrake:false,indicator:'off',hazards:false,ignition:true,
    positionLights:false,headlights:false,fogLights:false,collision:false,
    bumper:localPoint(position,yaw,0,vehicleConfig.length/2),
    wheels:[0,1,2,3].map(i=>{const p=wheelCenter(i);return localPoint(position,yaw,p.x,p.z);}),...patch};
}
function trip(){
  const tracker=new FreePracticeTracker(),engine=new ExamEngine('practice',60,true);
  return {tracker,engine,tick(t:VehicleTelemetry,dt=.1){
    const evaluation=tracker.update(t,dt);
    if(evaluation.newVisit)engine.setExercise(evaluation.exercise);
    engine.update(t,evaluation.observations,dt);return evaluation;
  }};
}
function approach(point:Vec2,normal:Vec2,along:number,patch:Partial<VehicleTelemetry>={}){
  const yaw=Math.atan2(normal.x,normal.z),bumper={x:point.x+normal.x*along,z:point.z+normal.z*along};
  return sample({x:bumper.x-normal.x*vehicleConfig.length/2,z:bumper.z-normal.z*vehicleConfig.length/2},yaw,{bumper,...patch});
}
describe('free practice observes the actual roads without an assigned itinerary',()=>{
  for(const a of intersectionApproaches)for(const red of [true,false])it(`checks the ${a.id} junction approach on ${red?'red':'green'}`,()=>{
    const run=trip(),time=a.normal.x?(red?20:56):(red?56:20);
    const point={x:a.stop.x-a.normal.z*2,z:a.stop.z+a.normal.x*2};
    run.tick(approach(point,a.normal,-.3,{time}));run.tick(approach(point,a.normal,-.1,{time}));
    expect(run.engine.exercise).toBe('intersection');
    expect(run.engine.events.some(e=>e.ruleId===24)).toBe(red);
    expect(run.engine.status).toBe('running');
  });
  for(const id of ['pedestrian','hill','railway']as const)it(`counts a missed ${id} stop independently of route order`,()=>{
    const run=trip(),{point,normal}=course.exercises.find(e=>e.id===id)!.stop!;
    run.tick(approach(point,normal,-.3));run.tick(approach(point,normal,-.1));
    expect(run.engine.events.some(e=>e.ruleId===(id==='railway'?25:11))).toBe(true);
  });
  it('allows a correct stop and records another missed stop on a return visit',()=>{
    const run=trip(),{point,normal}=course.exercises[1].stop!,edge=stopLineApproachEdge(point,normal);
    run.tick(approach(edge,normal,-2));run.tick(approach(edge,normal,-.5,{speed:0,signedSpeed:0}),3);
    run.tick(approach(edge,normal,.1));expect(run.engine.score).toBe(0);
    run.tick(approach(edge,normal,-3));run.tick(approach(edge,normal,-.5));run.tick(approach(edge,normal,.1));
    expect(run.engine.events.filter(e=>e.ruleId===11)).toHaveLength(1);
  });
  it('records start and finish signalling without auto-finishing the trip',()=>{
    const run=trip();
    for(const along of [-.3,.1])run.tick(approach({...startLinePoint,z:42},{x:1,z:0},along));
    for(const along of [-.3,.1])run.tick(approach({...finishLinePoint,z:26.5},{x:-1,z:0},along));
    expect(run.engine.events.map(e=>e.ruleId)).toEqual([2,7]);expect(run.engine.status).toBe('running');
  });
  it('checks stalls and collisions once even while a road violation is detected',()=>{
    const run=trip(),t=sample({x:200,z:200},0,{stalled:true,engine:false,collision:true});
    run.tick(t,1.1);run.tick(t,.1);
    expect(run.engine.events.map(e=>e.ruleId)).toEqual([22,28,30]);
    expect(run.engine.score).toBe(220);expect(run.engine.status).toBe('running');
  });
  it('permits reversing inside a parking exercise but scores it on the through road',()=>{
    const run=trip(),e=course.exercises.find(e=>e.id==='garage')!;
    run.tick(sample(e.point,e.yaw,{signedSpeed:-1}));expect(run.engine.exercise).toBe('garage');expect(run.engine.score).toBe(0);
    run.tick(sample(mapPoint(400,950),Math.PI/2,{signedSpeed:-1}));
    expect(run.engine.events.some(e=>e.ruleId===29)).toBe(true);
  });
  it('does not invent a crossing after recovery',()=>{
    const run=trip(),{point,normal}=course.exercises[1].stop!;
    run.tick(approach(point,normal,-.3));run.tracker.resetCrossings();run.tick(approach(point,normal,.1));
    expect(run.engine.events.some(e=>e.ruleId===11)).toBe(false);
  });
  it('records early stops and leaving before the three-second hold',()=>{
    const run=trip(),{point,normal}=course.exercises[1].stop!;
    run.tick(approach(point,normal,-3));
    run.tick(approach(point,normal,-2,{speed:0,signedSpeed:0}),1);
    run.tick(approach(point,normal,-1.8));
    expect(run.engine.events.map(e=>e.ruleId)).toEqual([4,12]);
  });
  it('records hill waiting and rollback at the actual ramp',()=>{
    const run=trip(),{point,normal}=course.exercises[2].stop!;
    run.tick(approach(point,normal,-.7,{speed:0,signedSpeed:0}),.1);
    run.tick(approach(point,normal,-.7,{speed:0,signedSpeed:0}),30.1);
    run.tick(approach(point,normal,-1.1,{signedSpeed:-1}));
    expect(run.engine.events.map(e=>e.ruleId)).toEqual([13,14]);
  });
  for(const id of ['rightAngle','snake']as const)it(`checks control lines and the time spent inside ${id}`,()=>{
    const run=trip(),e=course.exercises.find(e=>e.id===id)!;
    run.tick(sample(e.spawn,e.yaw,{wheels:[{x:200,z:200}]}),121);
    expect(run.engine.exercise).toBe(id);
    expect(run.engine.events.map(e=>e.ruleId)).toEqual([15,16]);
  });
  it('checks the turn signal at the right-angle exit',()=>{
    const run=trip(),e=course.exercises.find(e=>e.id==='rightAngle')!;
    run.tick(sample(e.point,e.yaw));
    expect(run.engine.events.some(e=>e.ruleId===5)).toBe(true);
  });
  for(const id of ['garage','parallel']as const)it(`checks a ${id} parking attempt once while the car remains parked`,()=>{
    const run=trip(),e=course.exercises.find(e=>e.id===id)!;
    const t=sample(e.point,e.parking!.yaw,{speed:0,signedSpeed:0});
    run.tick(t,2.1);run.tick(t,3);
    expect(run.engine.exercise).toBe(id);
    expect(run.engine.events.filter(e=>e.ruleId===17)).toHaveLength(1);
  });
  it('checks exit speed and second gear on the acceleration section',()=>{
    const run=trip(),e=course.exercises.find(e=>e.id==='acceleration')!;
    run.tick(sample(e.spawn,e.yaw,{speed:3}));run.tick(sample(e.point,e.yaw,{speed:3}));
    expect(run.engine.events.map(e=>e.ruleId)).toEqual([6,18]);
  });
  it('signals and scores all emergency-stop deadlines and moving with hazards',()=>{
    const run=trip(),e=course.exercises.find(e=>e.id==='emergency')!;
    const t=sample(e.point,e.yaw);
    expect(run.tick(t).emergency).toBe(true);run.tick(t,2.1);
    run.tick({...t,speed:0,signedSpeed:0});run.tick({...t,speed:0,signedSpeed:0},3.1);
    run.tick({...t,hazards:true});
    expect(run.engine.events.map(e=>e.ruleId)).toEqual([19,20,21]);
  });
  it('keeps checking cancellation after leaving the start station',()=>{
    const run=trip(),point={...startLinePoint,z:42},normal={x:1,z:0};
    for(const along of [-.3,.1,13])run.tick(approach(point,normal,along,{indicator:'left'}));
    expect(run.engine.events.map(e=>e.ruleId)).toEqual([3]);
  });
  it('keeps emergency deadlines active after driving away from the signal',()=>{
    const run=trip(),e=course.exercises.find(e=>e.id==='emergency')!;
    run.tick(sample(e.point,e.yaw));
    const away=sample(course.exercises[0].spawn,Math.PI/2);
    run.tick(away,2.1);
    run.tick({...away,speed:0,signedSpeed:0});run.tick({...away,speed:0,signedSpeed:0},3.1);
    run.tick({...away,hazards:true});
    expect(run.engine.events.map(e=>e.ruleId)).toEqual([19,20,21]);
    run.tick(away);run.tick({...away,hazards:true});
    expect(run.engine.events.filter(e=>e.ruleId===21)).toHaveLength(1);
  });
});
