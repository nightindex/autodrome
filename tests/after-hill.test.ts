import { describe,expect,it } from 'vitest';
import { afterHillBRoute } from '../src/data/after-hill';
import { course,mapPoint } from '../src/data/course';
import { vehicleConfig as car } from '../src/data/vehicle';
import { roadDistance } from '../src/render/course-world';
import { distance,localPoint } from '../src/simulation/math';
import { CourseTracker } from '../src/simulation/tracker';
import type { Vec2,VehicleTelemetry } from '../src/types';
import { departureMarkingPaths } from '../src/render/departure-markings';
import { departureHatching } from '../src/data/road-markings';

describe('post-ramp corridors traced from the supplied plan and video',()=>{
  it('leaves at least 3.4 metres between the painted edges of the B turn',()=>{
    const paths=departureMarkingPaths(),cross=(a:Vec2,b:Vec2)=>a.x*b.z-a.z*b.x;
    for(const p of paths.rightGuide)expect(roadDistance(p),'outer guide must remain clear of the kerb').toBeLessThanOrEqual(-.15);
    const intersect=(origin:Vec2,normal:Vec2,path:Vec2[])=>{
      let nearest=Infinity;
      for(let i=1;i<path.length;i++){
        const a=path[i-1],edge={x:path[i].x-a.x,z:path[i].z-a.z},delta={x:a.x-origin.x,z:a.z-origin.z},d=cross(normal,edge);
        if(Math.abs(d)<1e-8)continue;
        const t=cross(delta,edge)/d,u=cross(delta,normal)/d;
        if(u>=0&&u<=1&&Math.abs(t)<Math.abs(nearest))nearest=t;
      }
      return nearest;
    };
    const widths:number[]=[];
    for(let degrees=0;degrees<=70;degrees+=2){
      const angle=-degrees*Math.PI/180,normal={x:Math.cos(angle),z:Math.sin(angle)},point={x:47+normal.x*12.5,z:21+normal.z*12.5};
      const inside=intersect(point,normal,paths.right),outside=intersect(point,normal,paths.rightGuide);
      expect(Number.isFinite(inside)&&Number.isFinite(outside),`both borders at ${degrees} degrees`).toBe(true);
      widths.push(outside-inside-departureHatching.lineWidth); // subtract the two half-widths of the paint
    }
    expect(Math.min(...widths),JSON.stringify(widths)).toBeGreaterThanOrEqual(3.4);
    for(const [x,y]of afterHillBRoute.filter(([x,y])=>x>=1150&&y<=740&&y>=600)){
      const point=mapPoint(x,y),length=Math.hypot(point.x-47,point.z-21),normal={x:(point.x-47)/length,z:(point.z-21)/length};
      const inside=intersect(point,normal,paths.right),outside=intersect(point,normal,paths.rightGuide);
      expect(inside,`body clearance inside at ${x},${y}`).toBeLessThan(-car.width/2-.25);
      expect(outside,`body clearance outside at ${x},${y}`).toBeGreaterThan(car.width/2+.25);
    }
  });
  it('keeps both separate exercise corridors open and their separating islands intact',()=>{
    // Independent witnesses read from the reference image, in its pixel coordinates.
    for(const [x,y]of [[1235,800],[1080,615],[917.5,690],[850,745],[1080,690],[995,775],[900,850],[655,620]])
      expect(roadDistance(mapPoint(x,y)),`pavement at ${x},${y}`).toBeLessThan(-1.5);
    for(const [x,y]of [[850,650],[950,710],[800,795],[1100,800],[900,885]])
      expect(roadDistance(mapPoint(x,y)),`island at ${x},${y}`).toBeGreaterThan(.4);
    expect(roadDistance(mapPoint(1257,800))).toBeGreaterThan(0);
  });
  it('keeps the full vehicle footprint on asphalt throughout the B departure',()=>{
    const points=afterHillBRoute.map(([x,y])=>mapPoint(x,y));
    let clearance=Infinity;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=distance(a,b),yaw=Math.atan2(b.x-a.x,b.z-a.z);
      for(let d=0;d<=length;d+=.2){
        const p={x:a.x+(b.x-a.x)*d/length,z:a.z+(b.z-a.z)*d/length};
        for(const side of [-1,1])for(const front of [-1,0,1]){
          const edge=localPoint(p,yaw,side*car.width/2,front*car.length/2);
          clearance=Math.min(clearance,-roadDistance(edge));
        }
      }
    }
    expect(clearance,'body clearance along the prescribed route').toBeGreaterThan(.15);
  });
  it('keeps the road width and centre aligned after the ramp until the left bend',()=>{
    for(const x of [32,33,34,37.9,38,38.1,40,44,48]){
      // Both verges remain at the ramp deck limits, 36.6 and 44.4 metres.
      for(const z of [36.6,44.4])expect(roadDistance({x,z})).toBeCloseTo(0,5);
      expect(roadDistance({x,z:40.5})).toBeCloseTo(-3.9,5);
      expect(roadDistance({x,z:36.5})).toBeGreaterThan(0);
    }
  });
  it('accepts the actual bent B corridor during single-exercise practice',()=>{
    const exercise=course.exercises.find(e=>e.id==='rightAngle')!,tracker=new CourseTracker(true,[exercise]);
    const points=[mapPoint(1235,805),mapPoint(1080,615),mapPoint(917.5,690),mapPoint(850,745)];
    const telemetry=(position:Vec2):VehicleTelemetry=>({time:20,position,yaw:Math.PI,speed:2,signedSpeed:2,rpm:1500,gear:1,throttle:.2,brake:0,clutch:0,steering:0,engine:true,stalled:false,belt:true,handbrake:false,indicator:'off',hazards:false,ignition:false,positionLights:false,headlights:false,fogLights:false,bumper:position,wheels:[position],collision:false});
    for(const p of points)for(let tick=0;tick<100;tick++)expect(tracker.update(telemetry(p),.1).observations.offRoute).toBe(false);
    // The lower CD leg is asphalt, but it is not the active B exercise.
    for(let tick=0;tick<100;tick++)tracker.update(telemetry(mapPoint(1080,850)),.1);
    expect(tracker.update(telemetry(mapPoint(1080,850)),.1).observations.offRoute).toBe(true);
  });
});
