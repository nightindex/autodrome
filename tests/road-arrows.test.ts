import { describe,expect,it } from 'vitest';
import { departureTurnArrows } from '../src/data/road-markings';
import { departureArrowBorders,roadDistance } from '../src/render/course-world';
import { centerArrowBetweenLines,roadArrowOutline } from '../src/render/road-arrows';

describe('lane-centred turn arrows',()=>{
  it('centres the whole painted footprint, including the arrowhead, in every direction',()=>{
    for(const normal of [{x:1,z:0},{x:0,z:-1},{x:-1,z:0},{x:0,z:1}])for(const turn of ['left','right'] as const){
      const point={x:7,z:12},outline=roadArrowOutline({point,normal,turn});
      const across=outline.map(p=>(p.x-point.x)*-normal.z+(p.z-point.z)*normal.x);
      expect(Math.min(...across)+Math.max(...across)).toBeCloseTo(0,10);
    }
  });
  it('places both pairs of departure arrows halfway between the actual painted lines',()=>{
    // Independent plan-coordinate witnesses: the ramp divider is y=935,
    // the fork divider is x=1215, and 15 cm edge paint is centred 2.35 px inside the kerbs.
    const expected=[{x:1050,y:953.325},{x:1050,y:916.675},{x:1233.325,y:775},{x:1196.675,y:805}];
    for(const [i,arrow]of departureTurnArrows.entries()){
      const placed=centerArrowBetweenLines(arrow,departureArrowBorders);
      expect(Math.abs(placed.point.x*10+640-expected[i].x)).toBeLessThan(.1);
      expect(Math.abs(placed.point.z*10+530-expected[i].y)).toBeLessThan(.1);
      for(const p of roadArrowOutline(placed))expect(roadDistance(p)).toBeLessThan(-.2);
    }
  });
});
