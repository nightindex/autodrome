import { describe,expect,it } from 'vitest';
import { Steering } from '../src/simulation/steering';
import { vehicleDynamics } from '../src/data/vehicle';

function hold(speed:number,seconds:number,command=1,grip?:number,hz=60){
  const rack=new Steering();
  for(let i=0;i<seconds*hz;i++)rack.update(1/hz,command,speed,grip);
  return rack;
}

describe('keyboard steering and optional assistance',()=>{
  it.each([0,5,60/3.6,100/3.6,-60/3.6])('retains full mechanical travel at %f m/s',(speed)=>{
    expect(hold(speed,4).angle).toBeCloseTo(vehicleDynamics.maxSteeringAngle,8);
    expect(hold(speed,4,-1).angle).toBeCloseTo(-vehicleDynamics.maxSteeringAngle,8);
  });
  it('slows short inputs at speed without removing eventual full lock',()=>{
    const low=hold(2,.2),fast=hold(60/3.6,.2);
    expect(fast.angle).toBeGreaterThan(.05);
    expect(fast.angle).toBeLessThan(low.angle*.6);
    expect(hold(60/3.6,2).normalized).toBeCloseTo(1);
  });
  it('returns smoothly to centre and reverses without jumping across zero',()=>{
    const rack=hold(60/3.6,2),before=rack.angle;
    rack.update(1/60,0,60/3.6);
    expect(rack.angle).toBeLessThan(before);expect(rack.angle).toBeGreaterThan(before-.03);
    for(let i=0;i<120;i++)rack.update(1/60,0,60/3.6);
    expect(rack.angle).toBe(0);
    rack.update(1/60,-1,60/3.6);expect(rack.angle).toBeLessThan(0);expect(rack.angle).toBeGreaterThan(-.03);
    for(let i=0;i<120;i++)rack.update(1/60,-1,60/3.6);
    expect(rack.normalized).toBeCloseTo(-1);
  });
  it('only caps travel when requested and reduces its envelope on grass',()=>{
    const road=hold(60/3.6,4,1,vehicleDynamics.asphaltGrip);
    const grass=hold(60/3.6,4,1,vehicleDynamics.grassGrip);
    expect(road.angle).toBeLessThan(.1);expect(grass.angle).toBeLessThan(road.angle*.7);
    expect(hold(2,2,1,vehicleDynamics.grassGrip).normalized).toBeCloseTo(1);
  });
  it('changes aid state and speed without instantly changing the wheel angle',()=>{
    const rack=hold(0,1);
    const angle=rack.angle;rack.update(1/60,1,60/3.6,vehicleDynamics.asphaltGrip);
    expect(rack.angle).toBeLessThan(angle);expect(rack.angle).toBeGreaterThan(angle-.02);
    for(let i=0;i<120;i++)rack.update(1/60,1,60/3.6,vehicleDynamics.asphaltGrip);
    const limited=rack.angle;rack.update(1/60,1,60/3.6);
    expect(rack.angle).toBeGreaterThan(limited);expect(rack.angle).toBeLessThan(limited+.02);
  });
  it('treats forward and reverse inputs symmetrically',()=>{
    expect(hold(20,.2).angle).toBeCloseTo(hold(-20,.2).angle,8);
  });
  it('gives the same rack movement at different update rates and resets cleanly',()=>{
    expect(hold(20,.5,1,undefined,30).angle).toBeCloseTo(hold(20,.5,1,undefined,120).angle,8);
    const rack=hold(20,.5);rack.reset();expect(rack.angle).toBe(0);expect(rack.normalized).toBe(0);
  });
});
