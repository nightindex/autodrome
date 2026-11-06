import { beforeAll,describe,expect,it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Vehicle } from '../src/simulation/vehicle';

beforeAll(async()=>{await RAPIER.init();});
function fixture(){const world=new RAPIER.World({x:0,y:-9.81,z:0}),car=new Vehicle(world,new Set());return {car,dispose:()=>{car.dispose();world.free();}};}
describe('vehicle front lighting switches',()=>{
  it('toggles headlights independently of the engine and indicators',()=>{
    const {car,dispose}=fixture();try{
      car.action('indicatorLeft');car.action('headlights');
      expect(car.telemetry()).toMatchObject({headlights:true,fogLights:false,engine:false,indicator:'left'});
      car.action('headlights');expect(car.telemetry().headlights).toBe(false);
    }finally{dispose();}
  });
  it('requires ignition and position lamps without forcing dipped beams on',()=>{
    const {car,dispose}=fixture();try{
      car.action('fogLights');expect(car.telemetry()).toMatchObject({positionLights:false,headlights:false,fogLights:false});
      car.action('positionLights');car.action('fogLights');expect(car.telemetry()).toMatchObject({ignition:false,positionLights:true,fogLights:false});
      car.action('ignition');car.action('fogLights');expect(car.telemetry()).toMatchObject({ignition:true,positionLights:true,headlights:false,fogLights:true});
      car.action('headlights');car.action('headlights');expect(car.telemetry()).toMatchObject({positionLights:true,headlights:false,fogLights:true});
      car.action('fogLights');expect(car.telemetry()).toMatchObject({positionLights:true,headlights:false,fogLights:false});
      car.action('positionLights');car.action('fogLights');expect(car.telemetry()).toMatchObject({positionLights:false,fogLights:false});
    }finally{dispose();}
  });
  it('keeps fog lamps through a stall but clears them when ignition or all exterior lights are switched off',()=>{
    const {car,dispose}=fixture();try{
      car.action('ignition');car.action('headlights');car.action('fogLights');
      car.drivetrain.engine=false;car.drivetrain.stalled=true;
      expect(car.telemetry()).toMatchObject({ignition:true,engine:false,fogLights:true});
      car.action('ignition');car.action('ignition');
      expect(car.telemetry()).toMatchObject({ignition:false,positionLights:true,headlights:true,fogLights:false});
      car.action('ignition');car.action('fogLights');car.action('positionLights');
      expect(car.telemetry()).toMatchObject({positionLights:false,headlights:false,fogLights:false});
    }finally{dispose();}
  });
  it('resets the light switches and leaves hazard selection independent',()=>{
    const {car,dispose}=fixture();try{
      car.action('ignition');car.action('positionLights');car.action('fogLights');car.action('hazards');expect(car.telemetry().hazards).toBe(true);
      car.action('headlights');expect(car.telemetry().hazards).toBe(true);
      car.reset({x:0,z:0},0);expect(car.telemetry()).toMatchObject({ignition:false,positionLights:false,headlights:false,fogLights:false,hazards:false});
    }finally{dispose();}
  });
});
