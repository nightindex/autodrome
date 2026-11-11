import {describe,expect,it} from 'vitest';
import polygonClipping,{type MultiPolygon} from 'polygon-clipping';
import {course,mapPoint,emergencyStopStation as station} from '../src/data/course';
import {emergencyStopMarking as stripe,roadStopLines,roadSurface,coursePaintedArrows} from '../src/render/course-world';
import {roadArrowOutline} from '../src/render/road-arrows';
import {CourseTracker} from '../src/simulation/tracker';
import {ExamEngine} from '../src/simulation/exam';
import {vehicleConfig} from '../src/data/vehicle';
import type {Vec2,VehicleTelemetry} from '../src/types';
const exercise=course.exercises.find(e=>e.id==='emergency')!;
const area=(surface:MultiPolygon)=>surface.reduce((sum,p)=>sum+p.reduce((total,r,i)=>total+(i?-1:1)*Math.abs(r.slice(1).reduce((a,b,j)=>a+r[j][0]*b[1]-b[0]*r[j][1],0)/2),0),0);
const ring=(points:Vec2[]):MultiPolygon=>[[[...points,points[0]].map(p=>[p.x,p.z])]];
const footprint=ring(stripe.points.slice(0,3));
function sample(bumper:Vec2,yaw=0,patch:Partial<VehicleTelemetry>={}):VehicleTelemetry{
 return {time:20,position:{x:bumper.x-Math.sin(yaw)*vehicleConfig.length/2,z:bumper.z-Math.cos(yaw)*vehicleConfig.length/2},bumper,yaw,
  speed:2,signedSpeed:2,rpm:1500,gear:1,throttle:.2,brake:0,clutch:0,steering:0,engine:true,stalled:false,belt:true,handbrake:false,
  indicator:'off',hazards:false,ignition:true,positionLights:false,headlights:false,fogLights:false,collision:false,wheels:[],...patch};
}
describe('exercise 10 stopping reference',()=>{
 it('shares the reconstructed station between the exercise, route and yellow triangle',()=>{
  expect(stripe.point).toEqual(mapPoint(45,310));expect(stripe.point).toEqual(exercise.point);
  expect(course.route).toContainEqual(stripe.point);expect(station.signal).toEqual(mapPoint(45,265));
  expect(stripe.width).toBe(.10);expect(roadStopLines.some(l=>l.name==='paint-emergency-stop-line')).toBe(false);
  expect(stripe.points).toHaveLength(4);expect(stripe.points[0]).toEqual(stripe.points[3]);expect(stripe.color).toBe('#efcc59');
 });
 it('matches the two separate closed outlines visible at 08:12-08:15',()=>{
  expect(stripe.contours).toHaveLength(2);
  for(const contour of stripe.contours)expect(contour.points[0]).toEqual(contour.points[3]);
  expect(Math.max(...stripe.points.map(p=>p.x))-Math.min(...stripe.points.map(p=>p.x))).toBeCloseTo(1.65);
  expect(Math.max(...stripe.points.map(p=>p.z))-Math.min(...stripe.points.map(p=>p.z))).toBeCloseTo(1.45);
  const inner=ring(stripe.innerPoints.slice(0,3));
  expect(area(polygonClipping.difference(inner,footprint))).toBeLessThan(1e-8);
  const ownArrow=coursePaintedArrows.find(a=>Math.abs(a.point.x-stripe.point.x)<1&&a.point.z>stripe.point.z)!;
  expect(ownArrow.turn).toBe('left');expect(ownArrow.point.z-stripe.point.z).toBeCloseTo(9.8);
 });
 it('fits a hollow triangle entirely in the incoming lane on asphalt',()=>{
  expect(stripe.points[2].z).toBeGreaterThan(stripe.points[0].z);expect(stripe.points[0].x).toBeLessThan(exercise.point.x);
  expect(stripe.points.every(p=>p.x<=station.divider.x)).toBe(true);
  expect(area(polygonClipping.difference(footprint,roadSurface))).toBeLessThan(1e-8);
 });
 it('does not paint over any directional arrow',()=>{
  for(const arrow of coursePaintedArrows)expect(area(polygonClipping.intersection(footprint,ring(roadArrowOutline(arrow))))).toBeLessThan(1e-8);
 });
 it('waits at the selected spawn and signals once when the bumper reaches the exercise marker',()=>{
  const tracker=new CourseTracker(true,[exercise]);
  expect(tracker.update(sample({x:exercise.spawn.x,z:exercise.spawn.z+vehicleConfig.length/2}),.1).emergency).toBe(false);
  expect(tracker.update(sample({x:station.signal.x,z:station.signal.z-.01}),.1).emergency).toBe(false);
  expect(tracker.update(sample({x:station.signal.x,z:station.signal.z+.01}),.1).emergency).toBe(true);
  expect(tracker.update(sample({x:station.signal.x,z:station.signal.z+.1}),.1).emergency).toBe(false);
 });
 it.each(['return-lane','wrong-direction'])('does not signal for %s traffic',kind=>{
  const tracker=new CourseTracker(true,[exercise]),yaw=kind==='wrong-direction'?Math.PI:0;
  const p={x:kind==='return-lane'?station.divider.x+2:station.signal.x,z:station.signal.z+.1};
  expect(tracker.update(sample(p,yaw),.1).emergency).toBe(false);
 });
 it('preserves timed stopping and hazards without introducing a mandatory STOP-sign penalty',()=>{
  const tracker=new CourseTracker(true,[exercise]),engine=new ExamEngine('practice');engine.setExercise('emergency');
  let t=sample({x:station.signal.x,z:station.signal.z+.01});
  let evaluation=tracker.update(t,.1);engine.update(t,evaluation.observations,.1);expect(engine.emergencySignalled).toBe(true);
  t=sample({x:stripe.point.x,z:stripe.point.z-.4},0,{speed:0,signedSpeed:0});
  evaluation=tracker.update(t,.8);expect(evaluation.observations.stopDistance).toBeUndefined();engine.update(t,evaluation.observations,.8);
  t={...t,hazards:true};engine.update(t,{},.1);engine.update(t,{},3);
  expect(engine.emergencyCompleted).toBe(true);expect(engine.events).toEqual([]);
 });
});
