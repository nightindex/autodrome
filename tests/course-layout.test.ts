import { describe,expect,it } from 'vitest';
import { course,itinerary,mapPoint } from '../src/data/course';
import { roadDistance,roadSurface } from '../src/render/course-world';
import { mapProjection } from '../src/ui/map-projection';
import { mapRouteLeg } from '../src/ui/map-route';
import { localPoint } from '../src/simulation/math';
import { paintedArrows } from '../src/data/road-markings';

describe('complete layout from the supplied plan and video overview',()=>{
  it('preserves the garage recesses, all three snake islands, parking pockets and separate start/finish strip',()=>{
    const asphalt=[[80,300],[205,380],[175,275],[270,300],[330,300],[420,300],[500,300],[545,310],
      [655,350],[760,300],[820,405],[890,362],[960,425],[850,240],[1000,285],[1140,360],[1220,300],
      [120,600],[260,600],[390,600],[420,715],[620,660],[400,795],[400,950],[400,100]];
    const grass=[[140,220],[140,350],[240,350],[320,200],[365,415],[465,300],[550,240],[550,370],
      [705,300],[800,450],[1020,400],[1000,190],[900,240],[200,650],[400,650],[550,650],[400,850]];
    for(const [x,y]of asphalt)expect(roadDistance(mapPoint(x,y)),`road at plan ${x},${y}`).toBeLessThan(-.2);
    for(const [x,y]of grass)expect(roadDistance(mapPoint(x,y)),`island at plan ${x},${y}`).toBeGreaterThan(.2);
    expect(roadSurface.flatMap(p=>p.slice(1))).toHaveLength(10);
  });
  it('keeps the video orientation and B driving direction consistent with the minimap',()=>{
    const p=mapProjection(roadSurface,720,552),start=course.exercises[0],hill=course.exercises[2],finish=course.exercises.at(-1)!;
    expect(p.project(start.point).x).toBeLessThan(p.project(hill.point).x);
    expect(p.project(start.point).y).toBeGreaterThan(p.project(finish.point).y);
    expect(start.yaw).toBe(Math.PI/2);expect(finish.yaw).toBe(-Math.PI/2);
    expect(finish.point).toEqual(mapPoint(145,795));
    expect(p.project(course.exercises[6].point).x).toBeLessThan(p.project(course.exercises[5].point).x);
    for(const e of course.exercises.filter(e=>e.parking))for(const side of [-1,1])for(const end of [-1,1]){
      expect(roadDistance(localPoint(e.point,e.parking!.yaw,side*1.735/2,end*4.479/2)),`${e.id} vehicle corner`).toBeLessThan(-.2);
    }
  });
  it('follows the plan arrows in the paired perimeter lanes',()=>{
    for(const [x,y,nx,nz]of [[1061,98,-1,0],[558,138,1,0],[413.5,135,1,0],[45,408,0,1],[83.5,247,0,-1],[1232.5,220,0,-1],[1195.5,225,0,1]]){
      const p=mapPoint(x,y),arrow=paintedArrows.find(a=>Math.hypot(a.point.x-p.x,a.point.z-p.z)<.01);
      expect(arrow?.normal,`arrow at plan ${x},${y}`).toEqual({x:nx,z:nz});
    }
    expect(course.exercises.find(e=>e.id==='railway')!.spawn).toEqual(mapPoint(1235,410));
  });
  it('highlights the correct ordered leg through both junction visits and selected exercises',()=>{
    for(const [index,e]of itinerary.entries()){
      const leg=mapRouteLeg(e,index);expect(leg.at(-1)).toEqual(e.point);
      expect(leg[0]).toEqual(index===0?course.route[0]:itinerary[index-1].point);
    }
    const first=mapRouteLeg(itinerary[4],4),second=mapRouteLeg(itinerary[7],7);
    expect(first).not.toEqual(second);expect(first.at(-1)).not.toEqual(second.at(-1));
    const garage=course.exercises[6],leg=mapRouteLeg(garage,0,true);
    expect(leg[0]).toEqual(garage.spawn);expect(leg.at(-1)).toEqual(garage.point);
  });
});
