import { describe, expect, it } from 'vitest';
import { ExamEngine, type Observations } from '../src/simulation/exam';
import { rules } from '../src/data/rules';
import type { ExerciseId, VehicleTelemetry } from '../src/types';

export const telemetry=(patch:Partial<VehicleTelemetry>={}):VehicleTelemetry=>({time:0,position:{x:0,z:0},yaw:0,speed:1,signedSpeed:1,rpm:1500,gear:1,throttle:.2,brake:0,clutch:0,steering:0,engine:true,stalled:false,belt:true,handbrake:false,indicator:'off',hazards:false,ignition:false,positionLights:false,headlights:false,fogLights:false,bumper:{x:0,z:2.2395},wheels:[],collision:false,...patch});
const make=(exercise:ExerciseId='start')=>{const e=new ExamEngine('practice');e.setExercise(exercise);return e;};
const tick=(e:ExamEngine,t:Partial<VehicleTelemetry>={},o:Observations={},dt=1/60)=>e.update(telemetry(t),o,dt);
const has=(e:ExamEngine,id:number)=>e.events.some(x=>x.ruleId===id);

describe('educational free-driving scores',()=>{
  const free=()=>new ExamEngine('practice',60,true);
  it('allows preparation, a chosen route and unlimited time',()=>{
    const e=free();tick(e,{speed:0,signedSpeed:0},{},1000);
    tick(e,{}, {skippedExercise:true,abandoned:true,finished:true});
    expect(e.score).toBe(0);expect(e.status).toBe('running');expect(e.time).toBeGreaterThan(1000);
  });
  it('scores each unbelted episode once, including after correction',()=>{
    const e=free();for(let i=0;i<20;i++)tick(e,{belt:false});
    tick(e,{speed:0,signedSpeed:0,belt:false});tick(e,{belt:false});
    expect(e.events.map(x=>x.ruleId)).toEqual([1]);
    tick(e,{belt:true});tick(e,{belt:false});expect(e.score).toBe(10);
  });
  it('scores a continuous speeding interval every five seconds and clears it on slowing',()=>{
    const e=free();tick(e,{speed:6},{},10);expect(e.score).toBe(10);
    tick(e,{speed:6},{},4);tick(e,{speed:5});tick(e,{speed:6},{},4);expect(e.score).toBe(10);
  });
  it('continues above 100 and counts separate collisions and stalls',()=>{
    const e=free();tick(e,{collision:true,stalled:true,engine:false});
    tick(e,{collision:true,stalled:true,engine:false});expect(e.score).toBe(120);
    tick(e,{collision:false,stalled:false,engine:true});tick(e,{collision:true,stalled:true,engine:false});
    expect(e.score).toBe(240);expect(e.status).toBe('running');
    expect(e.events.map(x=>x.ruleId)).toEqual([22,30,22,30]);
  });
  it('records a new 40 km/h violation after slowing rather than per frame',()=>{
    const e=free();tick(e,{speed:12});tick(e,{speed:12});expect(e.score).toBe(100);
    tick(e,{speed:10});tick(e,{speed:12});expect(e.score).toBe(200);expect(e.status).toBe('running');
  });
  it('keeps normal exam failure behavior',()=>{
    const e=new ExamEngine('exam',60,true);tick(e,{collision:true});expect(e.status).toBe('failed');
  });
});
type Scenario={id:number;exercise?:ExerciseId;bad:(e:ExamEngine)=>void;good:(e:ExamEngine)=>void};
const cases:Scenario[]=[
  {id:1,bad:e=>tick(e,{belt:false}),good:e=>tick(e,{belt:true})},
  {id:2,bad:e=>tick(e,{}, {startCrossed:true}),good:e=>tick(e,{indicator:'left'},{startCrossed:true})},
  {id:3,bad:e=>{tick(e,{indicator:'left'},{startCrossed:true});tick(e,{indicator:'left'},{distanceFromStart:10});},good:e=>{tick(e,{indicator:'left'},{startCrossed:true});tick(e,{}, {distanceFromStart:10});}},
  {id:4,exercise:'pedestrian',bad:e=>{tick(e,{}, {stopDistance:2});tick(e,{speed:0},{stopDistance:1.01});},good:e=>tick(e,{speed:0},{stopDistance:1})},
  {id:5,bad:e=>tick(e,{}, {turnRequired:'left',turnCrossed:true}),good:e=>tick(e,{indicator:'left'},{turnRequired:'left',turnCrossed:true})},
  {id:6,bad:e=>tick(e,{}, {signViolation:true}),good:e=>tick(e,{}, {signViolation:false})},
  {id:7,exercise:'finish',bad:e=>tick(e,{}, {finishCrossed:true}),good:e=>tick(e,{indicator:'right'},{finishCrossed:true})},
  {id:8,bad:e=>tick(e,{speed:6}, {},5),good:e=>tick(e,{speed:20/3.6},{},5)},
  {id:9,exercise:'intersection',bad:e=>tick(e,{}, {greenLight:true},30.01),good:e=>tick(e,{}, {greenLight:true},30)},
  {id:10,bad:e=>tick(e,{speed:0},{},30),good:e=>tick(e,{speed:0},{},29.99)},
  {id:11,exercise:'pedestrian',bad:e=>tick(e,{}, {stopCrossed:true}),good:e=>{tick(e,{speed:0},{stopDistance:.5},3);tick(e,{}, {stopCrossed:true});}},
  {id:12,exercise:'pedestrian',bad:e=>{tick(e,{speed:0},{stopDistance:.5},2.99);tick(e,{}, {stopDistance:.5});},good:e=>{tick(e,{speed:0},{stopDistance:.5},3);tick(e,{}, {stopDistance:.5});}},
  {id:13,exercise:'hill',bad:e=>{tick(e,{speed:0},{stopDistance:.5},.1);tick(e,{speed:0},{stopDistance:.5},30);},good:e=>{tick(e,{speed:0},{stopDistance:.5},.1);tick(e,{speed:0},{stopDistance:.5},29.99);}},
  {id:14,exercise:'hill',bad:e=>tick(e,{}, {hillRollback:.301}),good:e=>tick(e,{}, {hillRollback:.3})},
  {id:15,exercise:'snake',bad:e=>tick(e,{}, {controlLine:true}),good:e=>tick(e,{}, {controlLine:false})},
  {id:16,exercise:'rightAngle',bad:e=>tick(e,{}, {},120.01),good:e=>tick(e,{}, {},120)},
  {id:17,exercise:'garage',bad:e=>tick(e,{speed:0},{parkingFinished:true,parkingCorrect:false}),good:e=>{tick(e,{signedSpeed:-1});tick(e,{speed:0},{parkingFinished:true,parkingCorrect:true});}},
  {id:18,exercise:'acceleration',bad:e=>tick(e,{}, {exerciseFinished:true}),good:e=>tick(e,{gear:2},{exerciseFinished:true})},
  {id:19,exercise:'emergency',bad:e=>{tick(e,{}, {emergencySignal:true});tick(e,{}, {},2.01);},good:e=>{tick(e,{}, {emergencySignal:true});tick(e,{speed:0},{},2);}},
  {id:20,exercise:'emergency',bad:e=>{tick(e,{}, {emergencySignal:true});tick(e,{speed:0});tick(e,{speed:0},{},3.01);},good:e=>{tick(e,{}, {emergencySignal:true});tick(e,{speed:0});tick(e,{speed:0,hazards:true},{},3);}},
  {id:21,exercise:'emergency',bad:e=>{tick(e,{}, {emergencySignal:true});tick(e,{speed:0,hazards:true});tick(e,{hazards:true});},good:e=>{tick(e,{}, {emergencySignal:true});tick(e,{speed:0,hazards:true});tick(e,{hazards:false});}},
  {id:22,bad:e=>tick(e,{stalled:true,engine:false}),good:e=>tick(e,{stalled:false})},
  {id:23,bad:e=>tick(e,{speed:0},{},40),good:e=>tick(e,{speed:0},{},39.99)},
  {id:24,exercise:'intersection',bad:e=>tick(e,{}, {stopCrossed:true,redLight:true}),good:e=>tick(e,{}, {stopCrossed:true,redLight:false})},
  {id:25,exercise:'railway',bad:e=>tick(e,{}, {stopCrossed:true}),good:e=>{tick(e,{speed:0},{stopDistance:.5},3);tick(e,{}, {stopCrossed:true});}},
  {id:26,bad:e=>tick(e,{}, {abandoned:true}),good:e=>tick(e,{}, {abandoned:false})},
  {id:27,bad:e=>tick(e,{}, {skippedExercise:true}),good:e=>tick(e,{}, {skippedExercise:false})},
  {id:28,bad:e=>tick(e,{}, {offRoute:true}),good:e=>tick(e,{}, {offRoute:false})},
  {id:29,bad:e=>tick(e,{signedSpeed:-1}),good:e=>tick(e,{signedSpeed:1})},
  {id:30,bad:e=>tick(e,{collision:true}),good:e=>tick(e,{collision:false})},
  {id:31,bad:e=>tick(e,{speed:40.01/3.6}),good:e=>tick(e,{speed:40/3.6})},
  {id:32,bad:e=>{e.mode='exam';tick(e,{}, {},900.01);},good:e=>{e.mode='exam';tick(e,{}, {},900);}},
];
describe('all 32 reference penalties',()=>{
  for(const test of cases){it(`rule ${test.id}: violation produces the reference points`,()=>{const e=make(test.exercise);test.bad(e);expect(has(e,test.id)).toBe(true);expect(e.events.find(x=>x.ruleId===test.id)?.points).toBe(rules[test.id-1].points);});
    it(`rule ${test.id}: compliant behavior does not trigger`,()=>{const e=make(test.exercise);test.good(e);expect(has(e,test.id)).toBe(false);});}
});
describe('free practice uses every applicable reference penalty',()=>{
  // These five rules require an assigned exam start, itinerary or deadline.
  const examOnly=new Set([10,23,26,27,32]);
  for(const scenario of cases.filter(c=>!examOnly.has(c.id))){
    it(`records rule ${scenario.id} without ending the trip`,()=>{
      const e=new ExamEngine('practice',900,true);e.setExercise(scenario.exercise??'start');
      scenario.bad(e);
      expect(e.events.find(event=>event.ruleId===scenario.id)?.points).toBe(rules[scenario.id-1].points);
      expect(e.status).toBe('running');
    });
    it(`does not record rule ${scenario.id} for compliant driving`,()=>{
      const e=new ExamEngine('practice',900,true);e.setExercise(scenario.exercise??'start');
      scenario.good(e);expect(has(e,scenario.id)).toBe(false);
    });
  }
  it('counts distinct red-light crossings, line touches, off-road and reverse episodes',()=>{
    const e=new ExamEngine('practice',900,true);e.setExercise('snake');
    for(let episode=0;episode<2;episode++){
      for(let frame=0;frame<10;frame++)tick(e,{signedSpeed:-1},{controlLine:true,offRoute:true,stopCrossed:frame===0,redLight:true});
      tick(e);
    }
    for(const id of [15,24,28,29])expect(e.events.filter(event=>event.ruleId===id)).toHaveLength(2);
  });
  it('counts repeated start and finish signal mistakes',()=>{
    const e=new ExamEngine('practice',900,true);
    for(let lap=0;lap<2;lap++){
      tick(e,{}, {startCrossed:true});tick(e);tick(e,{}, {finishCrossed:true});tick(e);
    }
    expect(e.events.map(event=>event.ruleId)).toEqual([2,7,2,7]);
  });
});
describe('scoring invariants',()=>{
  it('does not penalise preparing a parked car at an exercise spawn',()=>{const e=make('pedestrian');for(let i=0;i<300;i++)tick(e,{speed:0,engine:false,gear:0,handbrake:true},{stopDistance:3});tick(e,{}, {stopDistance:3});expect(has(e,4)).toBe(false);expect(has(e,12)).toBe(false);});
  it('still penalises an early stop after moving away from the exercise spawn',()=>{const e=make('intersection');tick(e,{speed:0,engine:false},{stopDistance:3});tick(e,{}, {stopDistance:2});tick(e,{speed:0},{stopDistance:1.2});expect(has(e,4)).toBe(true);});
  it('deduplicates continuous discrete violations',()=>{const e=make();for(let i=0;i<20;i++)tick(e,{belt:false});expect(e.events.filter(x=>x.ruleId===1)).toHaveLength(1);});
  it('counts one speeding penalty per complete five-second interval',()=>{const e=make();for(let i=0;i<600;i++)tick(e,{speed:6});expect(e.events.filter(x=>x.ruleId===8)).toHaveLength(2);});
  it('resets overspeed accumulation when speed becomes compliant',()=>{const e=make();tick(e,{speed:6},{},4);tick(e,{speed:5});tick(e,{speed:6},{},4);expect(has(e,8)).toBe(false);});
  it('exempts the acceleration exercise from the 20 km/h penalty',()=>{const e=make('acceleration');tick(e,{speed:8},{},20);expect(has(e,8)).toBe(false);});
  it('scores separate engine stalls, not persistent stalled frames',()=>{const e=make();tick(e,{engine:false,stalled:true});tick(e,{engine:false,stalled:true});tick(e,{engine:true});tick(e,{engine:false,stalled:true});expect(e.events.filter(x=>x.ruleId===22)).toHaveLength(2);});
  it('allows another stop penalty on a later intersection visit',()=>{const e=make('intersection');tick(e,{}, {stopCrossed:true,redLight:true});e.setExercise('intersection');tick(e,{}, {stopCrossed:true,redLight:true});expect(e.events.filter(x=>x.ruleId===24)).toHaveLength(2);});
  it('does not double-charge a short stop as no stop',()=>{const e=make('pedestrian');tick(e,{speed:0},{stopDistance:.5},1);tick(e,{}, {stopDistance:.3});tick(e,{}, {stopCrossed:true});expect(has(e,12)).toBe(true);expect(has(e,11)).toBe(false);});
  it('fails an exam at exactly 100 and freezes score',()=>{const e=new ExamEngine('exam');tick(e,{}, {abandoned:true});expect(e.status).toBe('failed');tick(e,{belt:false});expect(e.score).toBe(100);});
  it('passes a completed run below 100',()=>{const e=new ExamEngine('exam');tick(e,{indicator:'right'},{finished:true});expect(e.status).toBe('passed');expect(e.score).toBe(0);});
  it('permits reverse in garage and parallel parking',()=>{for(const id of ['garage','parallel']as const){const e=make(id);tick(e,{signedSpeed:-1});expect(has(e,29)).toBe(false);}});
  it('does not treat a later left turn as failing to cancel the start indicator',()=>{const e=make();tick(e,{indicator:'left'},{startCrossed:true});tick(e,{}, {distanceFromStart:10});e.setExercise('rightAngle');tick(e,{indicator:'left'},{distanceFromStart:40});expect(has(e,3)).toBe(false);});
  it('scores a stop first observed just after the emergency deadline',()=>{const e=make('emergency');tick(e,{}, {emergencySignal:true});tick(e,{speed:0},{},2.01);expect(has(e,19)).toBe(true);});
  it('scores hazards first activated just after their deadline',()=>{const e=make('emergency');tick(e,{}, {emergencySignal:true});tick(e,{speed:0});tick(e,{speed:0,hazards:true},{},3.01);expect(has(e,20)).toBe(true);});
  it('detects early restart even with slowly rising speed',()=>{const e=make('pedestrian');tick(e,{speed:0},{stopDistance:.5},1);tick(e,{speed:.13},{stopDistance:.49});expect(has(e,12)).toBe(true);});
  for(const [mode,free]of [['practice',false],['practice',true],['exam',false]]as const){
    it(`retains a completed hill stop through a brief rollback and re-stop (${mode}, free=${free})`,()=>{
      const e=new ExamEngine(mode,900,free);e.setExercise('hill');
      for(let frame=0;frame<180;frame++)tick(e,{speed:0,signedSpeed:0},{stopDistance:.5});
      expect(e.stoppedCorrectly).toBe(true);
      tick(e,{speed:.16,signedSpeed:-.16},{stopDistance:.52,hillRollback:.02});
      tick(e,{speed:0,signedSpeed:0},{stopDistance:.53,hillRollback:.03});
      tick(e,{speed:.18,signedSpeed:-.18},{stopDistance:.55,hillRollback:.05});
      expect(has(e,12)).toBe(false);expect(e.stoppedCorrectly).toBe(true);expect(e.stopSeconds).toBeGreaterThanOrEqual(3-1e-8);
    });
  }
  it('still scores a premature rollback before the hill hold is complete',()=>{
    const e=make('hill');tick(e,{speed:0,signedSpeed:0},{stopDistance:.5},2.9);
    tick(e,{speed:.16,signedSpeed:-.16},{stopDistance:.52,hillRollback:.02});
    expect(has(e,12)).toBe(true);expect(e.stoppedCorrectly).toBe(false);
  });
  it('scores excessive hill rollback after a completed hold without inventing an early restart',()=>{
    const e=make('hill');tick(e,{speed:0,signedSpeed:0},{stopDistance:.5},3);
    tick(e,{speed:.16,signedSpeed:-.16},{stopDistance:.52,hillRollback:.02});
    tick(e,{speed:0,signedSpeed:0},{stopDistance:.53,hillRollback:.03});
    tick(e,{speed:.4,signedSpeed:-.4},{stopDistance:.81,hillRollback:.31});
    expect(e.events.map(event=>event.ruleId)).toEqual([14]);
  });
  it('requires a fresh three-second hold on a new hill visit',()=>{
    const e=make('hill');tick(e,{speed:0,signedSpeed:0},{stopDistance:.5},3);
    e.setExercise('hill');tick(e,{speed:0,signedSpeed:0},{stopDistance:.5},1);
    tick(e,{speed:.16,signedSpeed:-.16},{stopDistance:.52,hillRollback:.02});
    expect(has(e,12)).toBe(true);expect(e.stoppedCorrectly).toBe(false);
  });
  it('checks finish signaling when crossing, not after stopping',()=>{const e=make('finish');tick(e,{indicator:'right'},{finishCrossed:true});tick(e,{indicator:'off'},{finished:true});expect(has(e,7)).toBe(false);});
});
