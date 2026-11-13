import {describe,expect,it} from 'vitest';
import {Steering,steeringCurve} from '../src/simulation/steering';
import {steeringConfig,type SteeringConfig} from '../src/data/steering';
import {vehicleDynamics} from '../src/data/vehicle';

const degrees=(radians:number)=>radians*180/Math.PI;
function advance(rack:Steering,seconds:number,command:number,kmh=0,hz=120,grip?:number){
  const count=Math.round(seconds*hz);
  for(let i=0;i<count;i++)rack.update(1/hz,command,kmh/3.6,grip);
  return rack;
}
const hold=(kmh:number,seconds=2,command=1,hz=120,grip?:number)=>advance(new Steering(),seconds,command,kmh,hz,grip);
const linearConfig=():SteeringConfig=>({...steeringConfig,gamma:{...steeringConfig.gamma,minimumRateFactor:1}});

describe('configured keyboard handwheel',()=>{
  it.each([0,60,100])('holds the current angle on touch re-grab at %i km/h, including grip assistance',kmh=>{
    for(const grip of [undefined,.45])for(const direction of [-1,1]){
      const rack=hold(kmh,.12,.7*direction,120,grip),before=rack.wheelAngle;
      const command=rack.holdCommand;
      expect(Math.abs(command)).toBeLessThanOrEqual(1);
      advance(rack,.4,command,kmh,120,grip);
      expect(rack.wheelAngle).toBeCloseTo(before,10);
      rack.reset();expect(rack.holdCommand).toBe(0);
    }
  });
  it.each([0,10,20,-20])('retains both mechanical locks at %i km/h',kmh=>{
    for(const direction of [-1,1]){
      const rack=hold(kmh,2,direction);
      expect(degrees(rack.wheelAngle)).toBeCloseTo(direction*516.6,9);
      expect(rack.angle).toBeCloseTo(direction*vehicleDynamics.maxSteeringAngle,10);
      expect(rack.normalized).toBeCloseTo(direction,10);
      expect(rack.wheelAngle/rack.angle).toBeCloseTo(15.8,10);
    }
  });
  it('moves at 900 degrees/second outside the soft centre and reaches lock within 0.59 seconds',()=>{
    const rack=new Steering(linearConfig());advance(rack,.5,1);
    expect(degrees(rack.wheelAngle)).toBeCloseTo(450,8);
    advance(rack,.08,1);expect(degrees(rack.wheelAngle)).toBeCloseTo(516.6,8);
    const soft=hold(0,.59);expect(degrees(soft.wheelAngle)).toBeCloseTo(516.6,8);
  });
  it('softens short outward taps only within the first fifteen percent without changing the steering ratio',()=>{
    const linear=advance(new Steering(linearConfig()),.1,1),soft=hold(0,.1);
    expect(soft.wheelAngle).toBeGreaterThan(linear.wheelAngle*.85);expect(soft.wheelAngle).toBeLessThan(linear.wheelAngle*.98);
    expect(soft.wheelAngle/soft.angle).toBeCloseTo(15.8,10);
    const outside=hold(0,.3),before=outside.wheelAngle;
    expect(before).toBeGreaterThan(516.6*.15*Math.PI/180);
    advance(outside,.1,1);expect(degrees(outside.wheelAngle-before)).toBeCloseTo(90,8);
  });
  it('returns at 960 degrees/second from rest, exactly reaches zero within 0.54 seconds, and returns faster at speed',()=>{
    const low=hold(0),before=low.wheelAngle;advance(low,.1,0);
    expect(degrees(before-low.wheelAngle)).toBeCloseTo(96,8);
    advance(low,.44,0);expect(low.wheelAngle).toBe(0);
    const high=hold(0);advance(high,.1,0,100);
    expect(high.wheelAngle).toBeLessThan(before-96*Math.PI/180);
    advance(high,.7,0,100);expect(high.wheelAngle).toBe(0);
  });
  it.each([100,140,-100])('settles to exactly 75 handwheel degrees at %i km/h',kmh=>{
    for(const direction of [-1,1])expect(degrees(hold(kmh,2,direction).wheelAngle)).toBeCloseTo(direction*75,9);
  });
  it('reduces the available angle smoothly and monotonically from 20 to 100 km/h',()=>{
    const rack=new Steering(),curve=steeringConfig.speedLimitCurve;
    expect(steeringCurve(curve,20)).toBe(516.6);expect(steeringCurve(curve,100)).toBe(75);
    expect(steeringCurve(curve,60)).toBeCloseTo((516.6+75)/2);
    let previous=Infinity;
    for(let speed=0;speed<=120;speed+=2){const limit=rack.limit(speed/3.6);expect(limit).toBeLessThanOrEqual(previous);previous=limit;}
    expect(Math.abs(steeringCurve(curve,20.001)-516.6)).toBeLessThan(.000001);
    expect(Math.abs(steeringCurve(curve,99.999)-75)).toBeLessThan(.000001);
  });
  it('approaches a changing speed or grip envelope without an instantaneous wheel jump',()=>{
    const rack=hold(0),before=rack.wheelAngle;rack.update(1/60,1,100/3.6);
    expect(rack.wheelAngle).toBeLessThan(before);expect(before-rack.wheelAngle).toBeLessThanOrEqual(900/60*Math.PI/180+1e-10);
    advance(rack,2,1,100);expect(degrees(rack.wheelAngle)).toBeCloseTo(75,8);
    const speedLimited=rack.wheelAngle;rack.update(1/60,1,100/3.6,.45);
    expect(rack.wheelAngle).toBeLessThan(speedLimited);expect(speedLimited-rack.wheelAngle).toBeLessThanOrEqual(900/60*Math.PI/180+1e-10);
    advance(rack,2,1,100,120,.45);const assisted=rack.wheelAngle;
    rack.update(1/60,1,100/3.6);expect(rack.wheelAngle).toBeGreaterThan(assisted);
  });
  it('retains the optional surface-aware practice aid on top of speed sensitivity',()=>{
    const road=hold(60,3,1,120,vehicleDynamics.asphaltGrip),grass=hold(60,3,1,120,vehicleDynamics.grassGrip);
    expect(road.angle).toBeLessThan(.1);expect(grass.angle).toBeLessThan(road.angle*.7);
    expect(hold(5,2,1,120,vehicleDynamics.grassGrip).normalized).toBeCloseTo(1,8);
  });
  it.each([-1,1])('unwinds faster under opposite input, then resumes normal outward travel, direction=%i',direction=>{
    const rack=hold(0,2,direction),before=rack.wheelAngle;advance(rack,.1,-direction);
    expect(degrees(before-rack.wheelAngle)*direction).toBeCloseTo(144,8);
    advance(rack,.28,-direction);expect(Math.abs(degrees(rack.wheelAngle))).toBeLessThan(5);
    advance(rack,.61,-direction);expect(degrees(rack.wheelAngle)).toBeCloseTo(-direction*516.6,8);
  });
  it.each([-1,1])('keeps angular velocity continuous through centre and the blend boundary, direction=%i',direction=>{
    const sampleRate=(angleDeg:number)=>{
      const rack=new Steering();rack.angle=angleDeg*Math.PI/180/15.8;
      const before=rack.wheelAngle,dt=1e-7;rack.update(dt,direction,0);
      return degrees(rack.wheelAngle-before)/dt*direction;
    };
    const centre=sampleRate(0);
    expect(centre).toBeCloseTo(765,3);
    for(const angle of [-.001,.001])expect(Math.abs(sampleRate(angle)-centre)).toBeLessThan(.01);
    const boundary=-direction*516.6*steeringConfig.keyboard.countersteerBlendZoneFraction;
    expect(Math.abs(sampleRate(boundary-.001)-sampleRate(boundary+.001))).toBeLessThan(.01);
  });
  it.each([30,60,120,144])('keeps the faster lock-to-lock reversal consistent at %i Hz',hz=>{
    const rack=hold(0,2,1,hz),reference=hold(0,2,1,240);
    advance(rack,.5,-1,0,hz);advance(reference,.5,-1,0,240);
    expect(Math.abs(rack.wheelAngle-reference.wheelAngle)).toBeLessThan(.00001);
    advance(rack,.49,-1,0,hz);expect(degrees(rack.wheelAngle)).toBeCloseTo(-516.6,8);
  });
  it.each([30,60,120,144])('is independent of render rate at %i Hz and resets cleanly',hz=>{
    const rack=hold(50,.5,1,hz),reference=hold(50,.5,1,240);
    expect(Math.abs(rack.wheelAngle-reference.wheelAngle)).toBeLessThan(.001);
    rack.reset();expect(rack.angle).toBe(0);expect(rack.normalized).toBe(0);expect(rack.wheelAngle).toBe(0);
  });
  it('ignores invalid/nonadvancing frames, clamps commands, and treats opposed keys as release',()=>{
    const rack=hold(0,.1),before=rack.angle;
    for(const dt of [0,-1,NaN,Infinity])rack.update(dt,1,0);
    expect(rack.angle).toBe(before);
    advance(rack,1,0);expect(rack.angle).toBe(0);
    advance(rack,2,3);expect(rack.normalized).toBeCloseTo(1,10);
  });
});
