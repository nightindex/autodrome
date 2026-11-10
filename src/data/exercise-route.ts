import {course,itinerary} from './course';
import type {Exercise,Vec2} from '../types';

/** Ordered occurrences distinguish the two visits to the signal junction. */
export function exerciseRouteLeg(exercise:Exercise,index=0,single=false):Vec2[]{
  const visit=single?itinerary.findIndex(e=>e.id===exercise.id):index;
  let start=0,end=0;
  for(let i=0;i<=visit;i++){
    const goal=itinerary[i].point;let best=Infinity;
    for(let j=start;j<course.route.length;j++){
      const d=Math.hypot(course.route[j].x-goal.x,course.route[j].z-goal.z);
      if(d<best){best=d;end=j;}if(d<.01)break;
    }
    if(i<visit)start=end;
  }
  const leg=course.route.slice(start,end+1);
  if(!single)return leg;
  // The snake spawn lies midway along a segment, not at a route vertex.
  let best=Infinity,segment=0,projection=exercise.spawn;
  for(let i=1;i<leg.length;i++){
    const q=projectOnSegment(exercise.spawn,leg[i-1],leg[i]),d=Math.hypot(q.x-exercise.spawn.x,q.z-exercise.spawn.z);
    if(d<best){best=d;segment=i;projection=q;}
  }
  return [exercise.spawn,...(best>.01?[projection]:[]),...leg.slice(segment)].filter((p,i,a)=>i===0||Math.hypot(p.x-a[i-1].x,p.z-a[i-1].z)>.001);
}
export function projectOnSegment(p:Vec2,a:Vec2,b:Vec2):Vec2{
  const dx=b.x-a.x,dz=b.z-a.z,length=dx*dx+dz*dz;
  const t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.z-a.z)*dz)/length)):0;
  return {x:a.x+dx*t,z:a.z+dz*t};
}

/** Advance in driven order: nearby return lanes cannot steal the cursor. */
export class GuidePath {
  segment=1;
  private reverseFrom=Infinity;
  constructor(readonly points:Vec2[],parking=false){
    if(parking)for(let i=2;i<points.length;i++){
      const a=points[i-2],b=points[i-1],c=points[i],ux=b.x-a.x,uz=b.z-a.z,vx=c.x-b.x,vz=c.z-b.z;
      if(ux*vx+uz*vz<-.5*Math.hypot(ux,uz)*Math.hypot(vx,vz)){this.reverseFrom=i;break;}
    }
  }
  get reversing(){return this.segment>=this.reverseFrom;}
  ahead(position:Vec2,limit=30,stop?:Vec2):Vec2[]{
    const points=this.points;if(points.length<2)return points;
    while(this.segment<points.length-1){
      const b=points[this.segment];
      if(Math.hypot(position.x-b.x,position.z-b.z)>2)break;
      this.segment++;
    }
    const route=[projectOnSegment(position,points[this.segment-1],points[this.segment]),...points.slice(this.segment)];
    // Approach and return arrows overlap at parking bays. Show only the
    // current direction until the car reaches the change-of-direction point.
    const change=this.reversing?-1:this.reverseFrom;
    if(Number.isFinite(change)&&change>0)route.splice(change-this.segment+1);
    if(stop){
      let best=Infinity,station=0,stopStation=0;
      for(let i=1;i<route.length;i++){
        const a=route[i-1],b=route[i],q=projectOnSegment(stop,a,b),d=Math.hypot(q.x-stop.x,q.z-stop.z);
        if(d<best){best=d;stopStation=station+Math.hypot(q.x-a.x,q.z-a.z);}station+=Math.hypot(b.x-a.x,b.z-a.z);
      }
      limit=Math.min(limit,stopStation);
    }
    const out=[route[0]];
    for(let i=1;i<route.length&&limit>.001;i++){
      const a=route[i-1],b=route[i],length=Math.hypot(b.x-a.x,b.z-a.z);
      if(length<=limit){out.push(b);limit-=length;}
      else{out.push({x:a.x+(b.x-a.x)*limit/length,z:a.z+(b.z-a.z)*limit/length});break;}
    }
    return out;
  }
}
