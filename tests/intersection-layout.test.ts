import { describe,expect,it } from 'vitest';
import polygonClipping,{type Polygon} from 'polygon-clipping';
import { intersectionApproaches } from '../src/data/intersection';
import { course,itinerary } from '../src/data/course';
import { laneLines } from '../src/data/lane-markings';
import { intersectionCrossings,roadDistance } from '../src/render/course-world';
import { crosswalkStripes } from '../src/render/crosswalk';
import { localPoint } from '../src/simulation/math';

const rectangle=(c:typeof intersectionCrossings[number]):Polygon=>{
  const r={x:-c.normal.z,z:c.normal.x};
  const points=[[-1,-1],[1,-1],[1,1],[-1,1],[-1,-1]].map(([along,across])=>[
    c.center.x+c.normal.x*along*c.length/2+r.x*across*c.width/2,
    c.center.z+c.normal.z*along*c.length/2+r.z*across*c.width/2,
  ] as [number,number]);return [points];
};
describe('signal junction mouths from the video',()=>{
  it('spans the real road with four separate zebras, without intersecting stripes at the corners',()=>{
    expect(intersectionCrossings).toHaveLength(4);
    for(const [i,crossing]of intersectionCrossings.entries()){
      expect(crossing.width).toBeGreaterThan(7);
      for(const other of intersectionCrossings.slice(i+1))expect(polygonClipping.intersection(rectangle(crossing),rectangle(other)),`${crossing.id}/${other.id}`).toEqual([]);
      for(const stripe of crosswalkStripes(crossing))for(const point of stripe.points)expect(roadDistance(point),`${crossing.id} stripe on road`).toBeLessThan(-.17);
      // The schematic uses a lane-wide zebra inside the flared mouth.
      expect(crossing.width).toBeCloseTo(7.2);

    }
  });
  it('keeps a waiting gap before the zebra and joins every divider to its stop bar',()=>{
    const lineIds=['south-junction','north-junction','west-perimeter','east-perimeter'];
    for(const [i,a]of intersectionApproaches.entries()){
      const crossing=intersectionCrossings.find(c=>c.id===a.id)!;
      const gap=(crossing.center.x-a.stop.x)*a.normal.x+(crossing.center.z-a.stop.z)*a.normal.z-crossing.length/2;
      expect(gap).toBeGreaterThan(1);expect(gap).toBeLessThan(2.5);
      const line=laneLines.find(l=>l.id===lineIds[i])!;
      expect(Math.min(...[line.points[0],line.points.at(-1)!].map(p=>Math.hypot(p.x-a.stop.x,p.z-a.stop.z)))).toBeLessThan(1e-8);
    }
  });
  it('uses the painted stop stations for scoring and starts practice behind them',()=>{
    for(const e of itinerary.filter(e=>e.stop?.light)){
      const stop=e.stop!,a=intersectionApproaches.find(a=>a.normal.x===stop.normal.x&&a.normal.z===stop.normal.z)!;
      expect((stop.point.x-a.stop.x)*a.normal.x+(stop.point.z-a.stop.z)*a.normal.z).toBeCloseTo(0);
      const bumper=localPoint(e.spawn,e.yaw,0,4.479/2);
      expect((a.stop.x-bumper.x)*a.normal.x+(a.stop.z-bumper.z)*a.normal.z).toBeGreaterThan(.2);
    }
    expect(course.exercises[4].point.z).toBeLessThan(intersectionCrossings.find(c=>c.id==='north')!.center.z-1.15);
  });
});
