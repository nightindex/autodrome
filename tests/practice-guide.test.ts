import {describe,expect,it} from 'vitest';
import {PracticeGuide} from '../src/simulation/practice-guide';
import {ExamEngine} from '../src/simulation/exam';
import {course,itinerary,mapPoint} from '../src/data/course';
import {exerciseRouteLeg,GuidePath} from '../src/data/exercise-route';
import {vehicleConfig,wheelCenter} from '../src/data/vehicle';
import {localPoint,lineDistance} from '../src/simulation/math';
import {stopLineApproachEdge} from '../src/data/marking-standards';
import {parkingFit} from '../src/simulation/parking';
import {roadDistance} from '../src/render/course-world';
import type {Exercise,VehicleTelemetry} from '../src/types';

function sample(e:Exercise,patch:Partial<VehicleTelemetry>={}):VehicleTelemetry{
  const t={time:0,position:e.spawn,yaw:e.yaw,speed:0,signedSpeed:0,rpm:900,gear:1,throttle:0,brake:0,clutch:0,steering:0,engine:true,stalled:false,belt:true,handbrake:false,indicator:'off',hazards:false,ignition:true,positionLights:false,headlights:false,fogLights:false,collision:false,...patch} as VehicleTelemetry;
  t.bumper=patch.bumper??localPoint(t.position,t.yaw,0,vehicleConfig.length/2);
  t.wheels=patch.wheels??[0,1,2,3].map(i=>{const p=wheelCenter(i);return localPoint(t.position,t.yaw,p.x,p.z);});return t;
}
function engine(e:Exercise){const engine=new ExamEngine('practice');engine.setExercise(e.id);return engine;}

describe('practice guidance for every exercise',()=>{
  const phases=['start-signal','stop-approach','stop-approach','turn-signal','signal-approach','follow-route','parking-approach','stop-approach','second-gear','emergency-approach','parking-approach','finish-signal'];
  for(const [index,e]of course.exercises.entries())it(`guides ${e.id} from its actual selected spawn in both languages`,()=>{
    const guide=new PracticeGuide(e,0,true),t=sample(e),scoring=engine(e);
    for(const language of ['ru','uz']as const){const hint=guide.view(t,scoring,language);expect(hint.phase).toBe(phases[index]);expect(hint.action.length).toBeGreaterThan(8);expect(Math.hypot(hint.route[0].x-e.spawn.x,hint.route[0].z-e.spawn.z)).toBeLessThan(2.01);}
    const leg=guide.path.points;expect(leg[0]).toEqual(e.spawn);expect(leg.at(-1)).toEqual(e.point);
    for(let i=1;i<leg.length;i++)for(let j=0;j<=10;j++){const a=leg[i-1],b=leg[i];expect(roadDistance({x:a.x+(b.x-a.x)*j/10,z:a.z+(b.z-a.z)*j/10}),e.id).toBeLessThan(.21);}
  });
  it('asks for one preparation action at a time',()=>{
    const e=course.exercises[0],g=new PracticeGuide(e,0,true),s=engine(e);
    expect(g.view(sample(e,{belt:false,engine:false,gear:0,handbrake:true}),s,'ru').phase).toBe('belt');
    expect(g.view(sample(e,{engine:false}),s,'ru').phase).toBe('engine');
    expect(g.view(sample(e,{gear:0}),s,'ru').phase).toBe('gear');
    expect(g.view(sample(e,{handbrake:true}),s,'ru').phase).toBe('handbrake');
    expect(g.view(sample(e,{indicator:'left'}),s,'ru').phase).toBe('start-move');
  });
  it('places the stop target before the paint, counts down the actual hold and rejects a missed practice stop',()=>{
    const e=course.exercises[1],g=new PracticeGuide(e,0,true),s=engine(e),normal=e.stop!.normal,edge=stopLineApproachEdge(e.stop!.point,normal);
    const hint=g.view(sample(e),s,'ru'),bumper=localPoint(hint.target,e.yaw,0,vehicleConfig.length/2);
    expect(lineDistance(bumper,edge,normal)).toBeCloseTo(.5);
    expect(hint.route.every(p=>lineDistance(p,edge,normal)>2)).toBe(true);
    const t=sample(e,{position:hint.target});s.update(t,{stopDistance:.5},1);
    expect(g.view(t,s,'ru')).toMatchObject({phase:'stop-hold',detail:expect.stringContaining('2.0 с')});
    s.update(t,{stopDistance:.5},2);expect(g.view(t,s,'ru').phase).toBe('stop-exit');
    const missed=sample(e,{bumper:{x:edge.x+1,z:edge.z}});expect(g.view(missed,engine(e),'ru').phase).toBe('missed-stop');expect(g.canComplete(true,missed,engine(e))).toBe(false);
    expect(g.view(sample(e,{bumper:{x:edge.x-.5,z:edge.z+8}}),s,'ru').phase).toBe('stop-lane');
  });
  for(const index of [4,7])it(`uses the correct signal approach for junction visit ${index}`,()=>{
    const e=itinerary[index],g=new PracticeGuide(e,index),s=engine(e),green=e.stop!.normal.x?56:20,red=e.stop!.normal.x?20:56;
    expect(g.view(sample(e,{time:red}),s,'ru').stop).toBe(true);
    expect(g.view(sample(e,{time:green}),s,'ru')).toMatchObject({stop:false,phase:'stop-exit'});
    const point=e.stop!.point,normal=e.stop!.normal;
    expect(g.view(sample(e,{time:red,bumper:{x:point.x+normal.x,z:point.z+normal.z}}),s,'ru').phase).toBe('junction-exit');
  });
  for(const e of course.exercises.filter(e=>e.parking))it(`checks reverse, both wheels, alignment and a fresh continuous hold for ${e.id}`,()=>{
    const g=new PracticeGuide(e,0,true),s=engine(e),t=sample(e,{position:e.point,yaw:e.parking!.yaw});
    expect(parkingFit(t,e.parking!).correct).toBe(true);
    g.update(t,s,{parkingCorrect:true},3);expect(g.canComplete(true,t,s)).toBe(false);
    s.update({...t,signedSpeed:-1},{},.1);
    for(const p of g.path.points)g.path.ahead(p);
    expect(g.view({...t,wheels:t.wheels.map(w=>({x:w.x+.5,z:w.z+.5}))},s,'ru').phase).toBe('parking-line');
    g.update(t,s,{parkingCorrect:true},1);expect(g.canComplete(true,t,s)).toBe(false);
    g.update({...t,speed:.5},s,{parkingCorrect:true},.1);expect(g.parkingHold).toBe(0);
    g.update(t,s,{parkingCorrect:true},2);expect(g.canComplete(true,t,s)).toBe(true);expect(g.view(t,s,'ru').phase).toBe('parking-hold');
  });
  it('requires second-gear travel and the actual exit speed',()=>{
    const e=course.exercises[8],g=new PracticeGuide(e,0,true),s=engine(e),t=sample(e,{gear:2,speed:6,signedSpeed:6});
    expect(g.canComplete(true,t,s)).toBe(false);s.update(t,{},.1);expect(g.canComplete(true,t,s)).toBe(true);
    expect(g.canComplete(true,{...t,speed:3},s)).toBe(false);expect(g.canComplete(true,{...t,speed:12},s)).toBe(false);
  });
  it('guides the emergency signal, stop, hazards, waiting, cancellation and restart in order',()=>{
    const e=course.exercises[9],g=new PracticeGuide(e,0,true),s=engine(e),moving=sample(e,{speed:2,signedSpeed:2}),stopped=sample(e);
    s.update(moving,{emergencySignal:true},.1);expect(g.view(moving,s,'ru').phase).toBe('emergency-stop');
    s.update(stopped,{},.1);expect(g.view(stopped,s,'ru').phase).toBe('hazards-on');
    s.update({...stopped,hazards:true},{},1);g.update({...stopped,hazards:true},s,{},1);expect(g.view({...stopped,hazards:true},s,'ru').phase).toBe('emergency-hold');
    s.update({...stopped,hazards:true},{},2);g.update({...stopped,hazards:true},s,{},2);expect(g.view({...stopped,hazards:true},s,'ru').phase).toBe('hazards-off');
    expect(g.view(stopped,s,'ru').phase).toBe('emergency-resume');
  });
});

describe('ordered practice arrows',()=>{
  it('starts selected snake on its forward segment rather than behind the spawn',()=>{
    const e=course.exercises[5],leg=exerciseRouteLeg(e,0,true);expect(leg[0]).toEqual(e.spawn);expect(leg[1].z).toBeGreaterThan(e.spawn.z);
  });
  it('keeps both junction visits and every complete-route leg separate',()=>{
    for(const [i,e]of itinerary.entries()){const leg=exerciseRouteLeg(e,i);expect(leg.at(-1)).toEqual(e.point);expect(leg[0]).toEqual(i?itinerary[i-1].point:course.route[0]);}
    expect(exerciseRouteLeg(itinerary[4],4)).not.toEqual(exerciseRouteLeg(itinerary[7],7));
  });
  it('does not show return arrows until the parking approach is driven',()=>{
    const e=course.exercises[6],path=new GuidePath(exerciseRouteLeg(e,0,true),true),turn=mapPoint(205,225);
    const approach=path.ahead(e.spawn,100);expect(approach.at(-1)).toEqual(turn);expect(path.reversing).toBe(false);
    path.ahead(turn);expect(path.reversing).toBe(true);expect(path.ahead(mapPoint(205,240))[1]).toEqual(mapPoint(205,275));
  });
  it('does not jump to a nearby later leg when the next waypoint is still ahead',()=>{
    const path=new GuidePath([{x:0,z:0},{x:0,z:20},{x:2,z:20},{x:2,z:0}]);path.ahead({x:2,z:1});expect(path.segment).toBe(1);
    const route=path.ahead({x:0,z:0},10);expect(route.at(-1)).toEqual({x:0,z:10});
  });
});
