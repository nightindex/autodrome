import {describe,expect,it} from 'vitest';
import {Vector3} from 'three';
import {readCockpitView,cockpitEyePosition,cockpitVerticalFov} from '../src/render/cockpit-view';
describe('cockpit seating settings',()=>{
 it('keeps horizontal perspective stable between windowed, fullscreen and ultrawide desktop sizes',()=>{
  for(const nominal of [50,64,80]){
   const horizontal=(aspect:number)=>2*Math.atan(Math.tan(cockpitVerticalFov(nominal,aspect)*Math.PI/360)*aspect);
   for(const aspect of [1920/1000,2560/1080,3440/1440])expect(horizontal(aspect)).toBeCloseTo(horizontal(16/9),10);
   for(const aspect of [390/844,4/3,16/9])expect(cockpitVerticalFov(nominal,aspect)).toBeCloseTo(nominal);
   expect(cockpitVerticalFov(nominal,NaN)).toBeCloseTo(nominal);
  }
 });
 it.each([null,undefined,{},'bad',{height:'8',back:NaN,fov:Infinity}])('migrates absent or invalid settings to the balanced position: %j',value=>{
  expect(readCockpitView(value)).toEqual({height:8,back:18,fov:64});
 });
 it('keeps the original view available and clamps travel and field of view',()=>{
  expect(readCockpitView({height:0,back:0,fov:70})).toEqual({height:0,back:0,fov:70});
  expect(readCockpitView({height:100,back:-100,fov:150})).toEqual({height:12,back:-4,fov:80});
  expect(readCockpitView({height:-100,back:100,fov:0})).toEqual({height:-4,back:25,fov:50});
 });
 it('applies exact centimetres after model fitting and never drifts on repeated renders',()=>{
  const base=new Vector3(.3178,.5409,.1755),view=readCockpitView(null);
  for(let i=0;i<100;i++){
   const eye=cockpitEyePosition(base,view);expect(eye.x).toBe(base.x);expect(eye.y-base.y).toBeCloseTo(.08);expect(eye.z-base.z).toBeCloseTo(-.18);
  }
  expect(base.toArray()).toEqual([.3178,.5409,.1755]);
 });
});
