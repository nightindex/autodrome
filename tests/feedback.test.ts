import { describe,expect,it } from 'vitest';
import { exerciseFeedback } from '../src/ui/exercise-feedback';
import { course } from '../src/data/course';
import { ExamEngine } from '../src/simulation/exam';
import type { VehicleTelemetry } from '../src/types';

const stop=course.exercises.find(e=>e.id==='pedestrian')!.stop!;
const telemetry={time:0,bumper:{x:stop.point.x-stop.normal.x*.5,z:stop.point.z-stop.normal.z*.5},speed:0,belt:true,engine:true,stalled:false,gear:1,handbrake:false,indicator:'off',signedSpeed:0} as VehicleTelemetry;
describe('exercise feedback',()=>{
  it('measures from the front bumper to the approaching edge of the 40 cm stripe',()=>{const e=course.exercises[1],engine=new ExamEngine('practice');expect(exerciseFeedback(telemetry,e,engine,'ru')?.text).toContain('0.3 м');});
  it('shows the actual remaining hold time then confirms the accepted stop',()=>{
    const e=course.exercises[1],engine=new ExamEngine('practice');engine.setExercise('pedestrian');engine.update(telemetry,{stopDistance:.5},1);
    expect(exerciseFeedback(telemetry,e,engine,'ru')?.text).toContain('2.0 с');
    engine.update(telemetry,{stopDistance:.5},2);expect(exerciseFeedback(telemetry,e,engine,'uz')?.state).toBe('ready');
    engine.setExercise('pedestrian');expect(exerciseFeedback(telemetry,e,engine,'ru')?.text).toContain('3.0 с');
  });
  it('warns when the line has been crossed without completing the stop',()=>{expect(exerciseFeedback({...telemetry,bumper:{x:stop.point.x+stop.normal.x*.5,z:stop.point.z+stop.normal.z*.5}},course.exercises[1],new ExamEngine('practice'),'ru')?.state).toBe('warning');});
  it('uses the exercise timer separately from the overall exam timer',()=>{const engine=new ExamEngine('exam');engine.time=400;engine.exerciseTime=15;expect(exerciseFeedback(telemetry,course.exercises[3],engine,'ru')?.text).toContain('01:45');});
  it('shows the current traffic light rather than a stop countdown at intersections',()=>{const e=course.exercises[4],engine=new ExamEngine('practice');expect(exerciseFeedback(telemetry,e,engine,'ru')?.state).toBe('hold');expect(exerciseFeedback({...telemetry,time:20},e,engine,'ru')?.text).toContain('Зелёный');});
});
