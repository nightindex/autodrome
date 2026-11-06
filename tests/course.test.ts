import { describe,expect,it } from 'vitest';
import { course,itinerary,hillHeight } from '../src/data/course';
import { intersectionCrossings,roadDistance,roadFrame,roadsidePosition,pedestrianCrossingLayout,whiteEdgeSurface,yellowEdgeSurface } from '../src/render/course-world';
import polygonClipping from 'polygon-clipping';
import { crosswalkStripes } from '../src/render/crosswalk';
import { roadPaint } from '../src/render/road-geometry';
import { distance } from '../src/simulation/math';
describe('course connectivity',()=>{
  it('places all practice spawns on driveable road',()=>{for(const e of course.exercises)expect(roadDistance(e.spawn),e.id).toBeLessThan(.1);});
  it('keeps reference route centerlines on driveable surfaces',()=>{
    const gaps:{leg:number,x:number,z:number,d:number}[]=[];
    for(let i=1;i<course.route.length;i++){const a=course.route[i-1],b=course.route[i],steps=Math.ceil(distance(a,b));for(let j=0;j<=steps;j++){const p={x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps},d=roadDistance(p);if(d>.2)gaps.push({leg:i,...p,d});}}
    expect(gaps).toEqual([]);
  });
  it('represents repeated intersection visits separately',()=>{expect(itinerary.filter(e=>e.id==='intersection')).toHaveLength(2);expect(itinerary.filter(e=>e.id==='intersection')[0].stop?.normal).not.toEqual(itinerary.filter(e=>e.id==='intersection')[1].stop?.normal);});
});

describe('road markings and sign placement',()=>{
  it('keeps the long cross street straight through the intersection',()=>{
    for(const x of [-40,-20,0,20,40])expect(roadFrame({x,z:-2.5},{x:1,z:0}).center.z).toBeCloseTo(-2.5,5);
  });
  it('raises the full width of both ramp lanes without a dropped outer edge',()=>{
    for(const x of [4,12,20,30]){
      const frame=roadFrame({x,z:42},{x:1,z:0}),height=hillHeight(x,frame.center.z);
      expect(height).toBeGreaterThan(0);
      for(const side of [-1,1])expect(hillHeight(x,frame.center.z+side*(frame.width/2+.3))).toBeCloseTo(height);
    }
  });
  it('keeps every zebra stripe inside the side lines at all five crossings',()=>{
    for(const crossing of [pedestrianCrossingLayout(),...intersectionCrossings])for(const stripe of crosswalkStripes(crossing)){
      const ring=[...stripe.points,stripe.points[0]].map(p=>[p.x,p.z] as [number,number]);
      expect(polygonClipping.intersection([[ring]],whiteEdgeSurface)).toEqual([]);
      expect(polygonClipping.intersection([[ring]],yellowEdgeSurface)).toEqual([]);
      for(let i=0;i<stripe.points.length;i++){
        const a=stripe.points[i],b=stripe.points[(i+1)%stripe.points.length];
        for(let t=0;t<=1;t+=.1){
          const point={x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t};
          expect(roadDistance(point)).toBeLessThanOrEqual(-roadPaint.edgeInset-roadPaint.edgeWidth-.019);
        }
      }
    }
  });
  it('centres the pedestrian crossing across the road and keeps its stripes on asphalt',()=>{
    const layout=pedestrianCrossingLayout();
    expect(Math.abs(layout.center.z-40.5)).toBeLessThan(.2);
    for(const across of [-layout.width/2+.2,0,layout.width/2-.2])for(const along of [-layout.length/2,layout.length/2]){
      const p={x:layout.center.x+layout.normal.x*along-layout.normal.z*across,z:layout.center.z+layout.normal.z*along+layout.normal.x*across};
      expect(roadDistance(p)).toBeLessThan(-.1);
    }
    const stop=course.exercises.find(e=>e.id==='pedestrian')!.stop!;
    expect((layout.center.x-stop.point.x)*stop.normal.x+(layout.center.z-stop.point.z)*stop.normal.z-layout.length/2).toBeGreaterThan(.3);
  });
  it('places stop signs outside all driveable roads on the approaching driver’s right',()=>{
    for(const exercise of course.exercises){if(!exercise.stop)continue;
      const {point,normal}=exercise.stop,sign=roadsidePosition(point,normal);
      expect(roadDistance(sign),exercise.id).toBeGreaterThanOrEqual(.3);
      expect((sign.x-point.x)*-normal.z+(sign.z-point.z)*normal.x,exercise.id).toBeGreaterThan(0);
    }
  });
  it('keeps parking signs off the garage and parallel-parking lanes',()=>{
    for(const exercise of course.exercises){if(!exercise.parking)continue;
      const normal={x:Math.sin(exercise.parking.yaw),z:Math.cos(exercise.parking.yaw)};
      expect(roadDistance(roadsidePosition(exercise.parking.center,normal)),exercise.id).toBeGreaterThanOrEqual(.3);
    }
  });
});
