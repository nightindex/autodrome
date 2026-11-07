import { describe,expect,it } from 'vitest';
import { departureTurnArrows } from '../src/data/road-markings';
import { departureArrowBorders,roadDistance,coursePaintedArrows } from '../src/render/course-world';
import { centerArrowBetweenLines,roadArrowOutline } from '../src/render/road-arrows';

describe('lane-centred turn arrows',()=>{
  it('centres the whole painted footprint, including the arrowhead, in every direction',()=>{
    for(const normal of [{x:1,z:0},{x:0,z:-1},{x:-1,z:0},{x:0,z:1}])for(const turn of ['left','right'] as const){
      const point={x:7,z:12},outline=roadArrowOutline({point,normal,turn});
      const across=outline.map(p=>(p.x-point.x)*-normal.z+(p.z-point.z)*normal.x);
      expect(Math.min(...across)+Math.max(...across)).toBeCloseTo(0,10);
    }
  });
  it('uses identical dimensioned 1.18 arrows on both lanes after the hill',()=>{
    const arrows=coursePaintedArrows.filter(a=>a.profile==='standard-turn');expect(arrows).toHaveLength(2);
    const profiles=arrows.map(arrow=>{
      const outline=roadArrowOutline(arrow),local=outline.map(p=>({along:p.x-arrow.point.x,across:-(p.z-arrow.point.z)}));
      expect(Math.max(...local.map(p=>p.along))-Math.min(...local.map(p=>p.along))).toBeCloseTo(5);
      expect(Math.max(...local.map(p=>p.across))-Math.min(...local.map(p=>p.across))).toBeCloseTo(1.05);
      expect(Math.abs(local[1].across-local[0].across)).toBeCloseTo(.15);
      expect(local[2].along-local[1].along).toBeCloseTo(2.6);
      // Both edges of the bend must be parallel at 45 degrees.
      for(const [a,b]of [[local[2],local[3]],[local[8],local[7]]])expect(Math.abs(b.along-a.along)).toBeCloseTo(Math.abs(b.across-a.across));
      for(const p of outline)expect(roadDistance(p)).toBeLessThan(-.2);
      return local;
    });
    for(let i=0;i<profiles[0].length;i++){
      expect(profiles[0][i].along).toBeCloseTo(profiles[1][i].along);
      expect(profiles[0][i].across).toBeCloseTo(profiles[1][i].across);
    }
  });
  it('centres the later fork arrows between their painted lane borders',()=>{
    // Independent plan-coordinate witnesses: the ramp divider is y=935,
    // the fork divider is x=1215, and 15 cm edge paint is centred 2.35 px inside the kerbs.
    const expected=[{x:1063.5,y:953.325},{x:1063.5,y:916.675},{x:1233.325,y:750},{x:1196.675,y:801.5}];
    for(const [i,arrow]of departureTurnArrows.entries()){
      if(arrow.outline)continue;
      const placed=centerArrowBetweenLines(arrow,departureArrowBorders);
      expect(Math.abs(placed.point.x*10+640-expected[i].x)).toBeLessThan(.5);
      expect(Math.abs(placed.point.z*10+530-expected[i].y)).toBeLessThan(.5);
      for(const p of roadArrowOutline(placed))expect(roadDistance(p)).toBeLessThan(-.2);
    }
  });
});
