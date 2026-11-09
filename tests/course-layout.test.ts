import { describe,expect,it } from 'vitest';
import { course,itinerary,mapPoint } from '../src/data/course';
import { roadDistance,roadSurface } from '../src/render/course-world';
import { mapProjection } from '../src/ui/map-projection';
import { mapRouteLeg } from '../src/ui/map-route';
import { localPoint } from '../src/simulation/math';
import { paintedArrows } from '../src/data/road-markings';
import {fitCrosswalk} from '../src/render/crosswalk';
import {garageIslands} from '../src/data/course-layout';

describe('complete layout from the supplied plan and video overview',()=>{
  it('separates the CD and B garage bays with the continuous reference grass divider',()=>{
    // The source plan and video 06:02 show two bays on opposite sides of
    // this narrow double-kerbed strip, rather than one open paved apron.
    for(const x of [315,330,345,365])expect(roadDistance(mapPoint(x,334)),`garage divider ${x}`).toBeGreaterThan(.25);
    for(const [x,y]of [[330,315],[330,360],[270,420]])expect(roadDistance(mapPoint(x,y))).toBeLessThan(-1);
    for(const [x,y,nx,nz,min,max]of [[160,275,1,0,4.1,4.3],[350,300,1,0,5.3,5.5],[320,362.5,1,0,4.2,4.4]]){
      const section=fitCrosswalk(roadSurface,mapPoint(x,y),{x:nx,z:nz},.1);
      expect(section.width,`garage bay ${x},${y}`).toBeGreaterThan(min);
      expect(section.width,`garage bay ${x},${y}`).toBeLessThan(max);
    }
  });
  it('traces garage kerbs without crossing the blind B stem',()=>{
    const cross=(a:number[],b:number[],c:number[])=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    for(const ring of garageIslands)for(let i=0;i<ring.length;i++)for(let j=i+2;j<ring.length;j++){
      const a=ring[i],b=ring[(i+1)%ring.length],c=ring[j],d=ring[(j+1)%ring.length];
      const crossed=cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8;
      expect(crossed,`crossed garage kerbs at ${a} / ${c}`).toBe(false);
    }
  });
  it('preserves the plan-width B snake through its second bend',()=>{
    // Independent sections across the supplied plan's yellow edges. At the
    // estimated 0.1 m/px scale they leave roughly 4.2 m between the paint.
    for(const [x,y,nx,nz]of [[860,390,33,35],[890,365,0,1],[930,380,-30,35]]){
      const length=Math.hypot(nx,nz),normal={x:nz/length,z:-nx/length};
      const section=fitCrosswalk(roadSurface,mapPoint(x,y),normal,.1);
      expect(section.width,`B snake section ${x},${y}`).toBeGreaterThan(4);
      expect(section.width,`B snake section ${x},${y}`).toBeLessThan(4.6);
    }
    expect(roadDistance(mapPoint(918,392))).toBeLessThan(-.15);
    expect(roadDistance(mapPoint(900,415))).toBeGreaterThan(.5);
  });
  it('preserves the garage recesses, all three snake islands, parking pockets and separate start/finish strip',()=>{
    const asphalt=[[80,300],[205,380],[175,275],[270,300],[330,300],[420,300],[500,300],[545,310],
      [655,350],[760,300],[820,405],[890,362],[960,425],[850,240],[1000,285],[1140,360],[1220,300],
      [120,600],[260,600],[390,600],[420,715],[620,660],[400,795],[400,950],[400,100]];
    const grass=[[140,220],[140,350],[240,350],[320,200],[365,415],[465,300],[550,240],[550,370],
      [705,300],[800,450],[1020,400],[1000,190],[900,240],[200,650],[400,650],[550,650],[400,850]];
    for(const [x,y]of asphalt)expect(roadDistance(mapPoint(x,y)),`road at plan ${x},${y}`).toBeLessThan(-.2);
    for(const [x,y]of grass)expect(roadDistance(mapPoint(x,y)),`island at plan ${x},${y}`).toBeGreaterThan(.2);
    // The garage is connected; start/finish also shares an edge with the
    // southeast island. Count physical grass components after clipping.
    expect(roadSurface.flatMap(p=>p.slice(1))).toHaveLength(8);
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
    for(const [x,y,nx,nz]of [[1061,98,-1,0],[558,138,1,0],[413.5,135,1,0],[45,408,0,1],[83.5,247,0,-1],[1232.5,220,0,-1],[1195.5,395,0,1]]){
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
