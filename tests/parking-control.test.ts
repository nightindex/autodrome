import {describe,expect,it} from 'vitest';
import * as T from 'three';
import {course,mapPoint} from '../src/data/course';
import {laneLines} from '../src/data/lane-markings';
import {vehicleConfig as car,wheelCenter} from '../src/data/vehicle';
import {paintStripGeometry} from '../src/render/road-geometry';
import {roadDistance,roadSurface} from '../src/render/course-world';
import {CourseTracker} from '../src/simulation/tracker';
import {ExamEngine} from '../src/simulation/exam';
import {localPoint} from '../src/simulation/math';
import {wheelsOnParkingLine} from '../src/simulation/parking';
import type {Exercise,Vec2,VehicleTelemetry} from '../src/types';

const exercises=course.exercises.filter(e=>e.parking);
function sample(e:Exercise,position:Vec2=e.point,yaw=e.parking!.yaw,speed=0):VehicleTelemetry {
  return {time:10,position,yaw,speed,signedSpeed:speed,rpm:1000,gear:-1,throttle:0,brake:1,clutch:1,steering:0,engine:true,stalled:false,belt:true,handbrake:false,indicator:'off',hazards:false,ignition:true,positionLights:false,headlights:false,fogLights:false,collision:false,
    bumper:localPoint(position,yaw,0,car.length/2),
    wheels:[0,1,2,3].map(index=>{const {x,z}=wheelCenter(index);return localPoint(position,yaw,x,z);}),
  };
}
describe('parking wheel-contact stripes from the plan and video',()=>{
  it('renders all eight control stripes 30 cm thick with their full length on asphalt',()=>{
    const stripes=laneLines.filter(line=>/^(garage|parking)-.*-stop$/.test(line.id));
    expect(stripes).toHaveLength(8);
    const material=new T.MeshBasicMaterial();
    try{for(const stripe of stripes){
      const [a,b]=stripe.points,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),normal={x:dz/length,z:-dx/length};
      const geometry=paintStripGeometry(stripe.points,stripe.width,roadSurface,.052),mesh=new T.Mesh(geometry,material);mesh.updateMatrixWorld();
      const point=(station:number,offset:number)=>({x:a.x+dx*station+normal.x*offset,z:a.z+dz*station+normal.z*offset});
      const hit=(p:Vec2)=>new T.Raycaster(new T.Vector3(p.x,1,p.z),new T.Vector3(0,-1,0)).intersectObject(mesh).length>0;
      try{
        expect(stripe.width,stripe.id).toBe(.3);
        for(const station of [.01,.25,.5,.75,.99])for(const offset of [-.149,0,.149]){
          expect(hit(point(station,offset)),stripe.id).toBe(true);
          expect(roadDistance(point(station,offset)),stripe.id).toBeLessThan(0);
        }
        for(const offset of [-.151,.151])expect(hit(point(.5,offset)),stripe.id).toBe(false);
      }finally{geometry.dispose();}
    }}finally{material.dispose();}
  });
  it('uses the rendered stripe coordinates and thickness for scoring',()=>{
    for(const e of exercises){
      const control=e.parking!.controlLine!,stripe=laneLines.find(l=>l.id===(e.id==='garage'?'garage-left-stop':'parking-right-stop'))!;
      expect(control.points).toEqual(stripe.points);expect(control.width).toBe(stripe.width);
      // +X is the driver's left in this car asset; negative-X wheels face
      // the parallel bay's kerb when the car points east on the plan.
      expect(control.wheels).toEqual(e.id==='garage'?[2,3]:[0,2]);
      const t=sample(e);expect(wheelsOnParkingLine(t.wheels,control),e.id).toBe(true);
      expect(new CourseTracker(true,[e]).update(t,.1).observations.parkingCorrect,e.id).toBe(true);
      for(const side of [-1,1])for(const end of [-1,1])expect(roadDistance(localPoint(e.point,t.yaw,side*car.width/2,end*car.length/2))).toBeLessThan(-.2);
    }
  });
  it('rejects a car stopped before or beyond the visible stripe',()=>{
    for(const e of exercises)for(const offset of [-.25,.25]){
      const p={...e.point};if(e.id==='garage')p.x+=offset;else p.z+=offset;
      expect(new CourseTracker(true,[e]).update(sample(e,p),.1).observations.parkingCorrect,`${e.id} ${offset}`).toBe(false);
    }
    const garage=exercises.find(e=>e.id==='garage')!;
    expect(new CourseTracker(true,[garage]).update(sample(garage,mapPoint(175,275)),.1).observations.parkingCorrect).toBe(false);
  });
  it('requires both rear wheels in the garage and both right wheels in parallel parking',()=>{
    for(const e of exercises){
      const line=e.parking!.controlLine!;
      for(const selected of line.wheels){
        const wheels=sample(e).wheels;
        if(e.id==='garage')wheels[selected].x+=.2;else wheels[selected].z+=.2;
        expect(wheelsOnParkingLine(wheels,line),`${e.id} wheel ${selected}`).toBe(false);
      }
      const wheels=sample(e).wheels,unselected=[0,1,2,3].filter(i=>!line.wheels.includes(i));
      unselected.forEach(index=>wheels[index]={x:1000,z:1000});
      expect(wheelsOnParkingLine(wheels,line),e.id).toBe(true);
      expect(wheelsOnParkingLine([],line),e.id).toBe(false);
    }
  });
  it('rejects wheels on the infinite extension past the painted end',()=>{
    const line=exercises[0].parking!.controlLine!,[a,b]=line.points,dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    const past={x:b.x+dx/length*.05,z:b.z+dz/length*.05};
    expect(wheelsOnParkingLine([past,past,past,past],line)).toBe(false);
  });
  it('accepts a reversed, stopped car on the paint without rule 17 and penalises a nearby miss',()=>{
    for(const e of exercises)for(const correct of [true,false]){
      const tracker=new CourseTracker(true,[e]),engine=new ExamEngine('exam');engine.setExercise(e.id);
      const position={...e.point};if(!correct){if(e.id==='garage')position.x+=.4;else position.z-=.4;}
      const t=sample(e,position),moving={...t,speed:.3,signedSpeed:-.3};
      let result=tracker.update(moving,.1);engine.update(moving,result.observations,.1);expect(result.atGoal).toBe(false);
      for(let i=0;i<21;i++){result=tracker.update(t,.1);engine.update(t,result.observations,.1);}
      expect(result.atGoal).toBe(true);
      expect(result.observations.parkingCorrect).toBe(correct);
      expect(engine.events.some(event=>event.ruleId===17),e.id).toBe(!correct);
    }
  });
});
