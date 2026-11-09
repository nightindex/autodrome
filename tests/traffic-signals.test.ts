import { describe,expect,it } from 'vitest';
import { pedestrianSignalAspects,signalCycleSeconds,signalAspects,signalAxis,signalState,type SignalAxis } from '../src/data/traffic-signals';
import { course,itinerary } from '../src/data/course';
import { CourseTracker } from '../src/simulation/tracker';
import { ExamEngine } from '../src/simulation/exam';
import { exerciseFeedback } from '../src/ui/exercise-feedback';
import type { VehicleTelemetry } from '../src/types';

describe('intersection signal controller',()=>{
  it('never grants green to crossing roads, including at a cycle boundary',()=>{
    for(let time=-.1;time<128;time+=.1)expect(signalAspects(time).permitted&&signalAspects(time,'east-west').permitted,`conflicting green at ${time}`).toBe(false);
    expect(signalState(20)).toBe('green');expect(signalState(20,'east-west')).toBe('red');
    expect(signalState(56)).toBe('red');expect(signalState(56,'east-west')).toBe('green');
  });
  it('provides amber, clearance and red/amber preparation before changing the right of way',()=>{
    expect(signalState(49)).toBe('amber');
    expect(signalAspects(51.5).red&&signalAspects(51.5,'east-west').red).toBe(true);
    const preparing=signalAspects(52.5,'east-west');expect(preparing.red&&preparing.amber).toBe(true);expect(preparing.permitted).toBe(false);
    expect(signalAspects(16.5).red&&signalAspects(16.5,'east-west').red).toBe(true);
  });
  it('keeps blinking green permissive when its LEDs are briefly dark',()=>{
    expect(signalAspects(45.1).green).toBe(true);expect(signalAspects(45.6).green).toBe(false);
    expect(signalState(45.6)).toBe('green');expect(signalAspects(45.6).permitted).toBe(true);
  });
  it('reserves the pedestrian interval for pedestrians even when vehicles turn',()=>{
    let walkingSamples=0;
    for(let time=-signalCycleSeconds;time<signalCycleSeconds*2;time+=.1){
      const pedestrian=pedestrianSignalAspects(time);
      if(!pedestrian.permitted)continue;
      walkingSamples++;
      for(const axis of ['north-south','east-west'] as const){
        const vehicle=signalAspects(time,axis);expect(vehicle.red).toBe(true);expect(vehicle.amber||vehicle.permitted||vehicle.green).toBe(false);
      }
    }
    expect(walkingSamples).toBeGreaterThan(300);
  });
  it('leaves clearance on both sides of the pedestrian phase and prepares vehicles afterwards',()=>{
    for(const time of [67.5,68.9,81,83.9]){
      expect(pedestrianSignalAspects(time).red).toBe(true);
      for(const axis of ['north-south','east-west'] as const)expect(signalAspects(time,axis).permitted).toBe(false);
    }
    expect(pedestrianSignalAspects(69).green).toBe(true);expect(signalAspects(84.5,'east-west').phase).toBe('red-amber');
    expect(signalAspects(85,'east-west').permitted).toBe(true);expect(pedestrianSignalAspects(85).red).toBe(true);
  });
  it('blinks only the walking figure before returning to red and repeats across the cycle',()=>{
    expect(pedestrianSignalAspects(78.1)).toMatchObject({red:false,green:true,permitted:true,phase:'green-blink'});
    expect(pedestrianSignalAspects(78.6)).toMatchObject({red:false,green:false,permitted:true,phase:'green-blink'});
    expect(pedestrianSignalAspects(81)).toMatchObject({red:true,green:false,permitted:false});
    expect(pedestrianSignalAspects(70-signalCycleSeconds)).toEqual(pedestrianSignalAspects(70+signalCycleSeconds));
  });
  for(const exercise of itinerary.filter(e=>e.stop?.light))for(const permitted of [false,true]){
    const axis=signalAxis(exercise.stop!.normal),greenTime:Record<SignalAxis,number>={'north-south':20,'east-west':56};
    it(`uses the same ${permitted?'green':'red'} for ${axis} scoring and feedback`,()=>{
      const tracker=new CourseTracker(true,[exercise]),engine=new ExamEngine('practice');engine.setExercise('intersection');
      const time=greenTime[permitted?axis:axis==='north-south'?'east-west':'north-south'],{point,normal}=exercise.stop!;
      const sample=(along:number):VehicleTelemetry=>({time,position:{...point},bumper:{x:point.x+normal.x*along,z:point.z+normal.z*along},wheels:[],yaw:Math.atan2(normal.x,normal.z),speed:2,signedSpeed:2,belt:true,engine:true,stalled:false,gear:1,handbrake:false,indicator:'off',hazards:false,ignition:false,positionLights:false,headlights:false,fogLights:false,rpm:1500,throttle:.2,brake:0,clutch:0,steering:0,collision:false});
      // Cross the approaching paint edge at -0.20 m, not its centre.
      for(const along of [-.3,-.1]){const telemetry=sample(along),evaluation=tracker.update(telemetry,.1);engine.update(telemetry,evaluation.observations,.1);}
      expect(engine.events.some(e=>e.ruleId===24)).toBe(!permitted);
      expect(exerciseFeedback(sample(-.3),exercise,engine,'ru')?.state).toBe(permitted?'ready':'hold');
    });
  }
  it('keeps the default practice approach on its own incoming lane',()=>{expect(course.exercises[4].spawn.x).toBeGreaterThan(-.5);});
});
