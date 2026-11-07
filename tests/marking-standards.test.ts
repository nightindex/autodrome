import {describe,expect,it} from 'vitest';
import polygonClipping,{type MultiPolygon} from 'polygon-clipping';
import {roadArrowOutline} from '../src/render/road-arrows';
import {coursePaintedArrows,roadStopLines,roadSurface,pedestrianCrossingLayout,intersectionCrossings} from '../src/render/course-world';
import {crosswalkStripes} from '../src/render/crosswalk';
import {CourseTracker} from '../src/simulation/tracker';
import {course} from '../src/data/course';
import {ExamEngine} from '../src/simulation/exam';
import {exerciseFeedback} from '../src/ui/exercise-feedback';
import type {VehicleTelemetry,Vec2} from '../src/types';

const area=(surface:MultiPolygon)=>surface.reduce((sum,p)=>sum+p.reduce((total,r,i)=>total+(i?-1:1)*Math.abs(r.slice(1).reduce((a,b,j)=>a+r[j][0]*b[1]-b[0]*r[j][1],0)/2),0),0);
const ring=(outline:Vec2[]):MultiPolygon=>[[[...outline,outline[0]].map(p=>[p.x,p.z])]];
const span=(values:number[])=>Math.max(...values)-Math.min(...values);

describe('plan arrow silhouettes and shared stop markings',()=>{
  it('keeps plan arrow proportions and 20 cm stems in every direction',()=>{
    for(const normal of [{x:1,z:0},{x:0,z:1},{x:-1,z:0},{x:0,z:-1}])for(const turn of [undefined,'left','right','straight-right'] as const){
      const point={x:13,z:-8},outline=roadArrowOutline({point,normal,turn});
      const local=outline.map(p=>({across:(p.x-point.x)*-normal.z+(p.z-point.z)*normal.x,along:(p.x-point.x)*normal.x+(p.z-point.z)*normal.z}));
      expect(span(local.map(p=>p.along))).toBeCloseTo(turn==='straight-right'?6:5,9);
      expect(span(local.map(p=>p.across))).toBeCloseTo(turn==='straight-right'?2.2:turn?1.8:1.2,9);
      const tail=local.filter(p=>Math.abs(p.along+(turn==='straight-right'?3:2.5))<1e-8);
      expect(tail).toHaveLength(2);expect(span(tail.map(p=>p.across))).toBeCloseTo(.2,9);
      if(!turn){const headBase=local.filter(p=>Math.abs(p.across)>.59);expect(headBase.every(p=>Math.abs(p.along-.7)<1e-8)).toBe(true);}
    }
  });
  it('does not crop any full-size direction arrow against the pavement',()=>{
    for(const [i,arrow]of coursePaintedArrows.entries()){
      const missing=polygonClipping.difference(ring(roadArrowOutline(arrow)),roadSurface);
      expect(area(missing),`arrow ${i}: ${JSON.stringify(arrow)}`).toBeLessThan(1e-7);
    }
  });
  it('uses 40 cm for every road stop stripe, independent of its orientation',()=>{
    expect(roadStopLines).toHaveLength(7);
    for(const line of roadStopLines){
      expect(line.width,line.name).toBe(.4);
      const [a,b]=line.points;
      expect((b.x-a.x)*line.normal.x+(b.z-a.z)*line.normal.z,line.name).toBeCloseTo(0,8);
    }
  });
  it('fits plan crossings with 40 cm stripes, 10 cm gaps and the surveyed stop stations',()=>{
    for(const crossing of [pedestrianCrossingLayout(),...intersectionCrossings]){
      expect(crossing.length).toBe(2.6);
      const stripes=crosswalkStripes(crossing),r={x:-crossing.normal.z,z:crossing.normal.x};
      for(const stripe of stripes){expect(span(stripe.points.map(p=>p.x*r.x+p.z*r.z))).toBeCloseTo(.4,8);}
      for(let i=1;i<stripes.length;i++){
        const end=Math.max(...stripes[i-1].points.map(p=>p.x*r.x+p.z*r.z)),start=Math.min(...stripes[i].points.map(p=>p.x*r.x+p.z*r.z));
        expect(start-end).toBeCloseTo(.1,8);
      }
      const line=roadStopLines.find(l=>l.name===('id' in crossing?`intersection-stop-${crossing.id}`:'paint-pedestrian-stop-line'))!;
      const gap=(crossing.center.x-line.point.x)*line.normal.x+(crossing.center.z-line.point.z)*line.normal.z-crossing.length/2-line.width/2;
      expect(gap).toBeGreaterThan(1);expect(gap).toBeLessThan(2.2);
    }
  });
  it('measures stopping distance and the crossing event from the approaching painted edge',()=>{
    for(const exercise of course.exercises.filter(e=>e.stop)){
      const tracker=new CourseTracker(true,[exercise]),{point,normal}=exercise.stop!;
      const telemetry=(ahead:number)=>({time:1,position:exercise.spawn,yaw:exercise.yaw,speed:0,signedSpeed:0,bumper:{x:point.x+normal.x*ahead,z:point.z+normal.z*ahead},wheels:[]} as unknown as VehicleTelemetry);
      const before=tracker.update(telemetry(-.3),.1).observations;
      expect(before.stopDistance,exercise.id).toBeCloseTo(.1,8);expect(before.stopCrossed).toBe(false);
      expect(exerciseFeedback(telemetry(-.3),exercise,new ExamEngine('practice'),'ru')?.text,exercise.id).toContain('0.1 м');
      expect(tracker.update(telemetry(-.19),.1).observations.stopCrossed,exercise.id).toBe(true);
    }
  });
});
