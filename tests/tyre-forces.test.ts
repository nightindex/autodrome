import { describe,expect,it } from 'vitest';
import { tyreForces } from '../src/simulation/tyre-forces';

const dt=1/60;

describe('powered and passive tyre forces',()=>{
  it.each([1,-1])('keeps powered traction in direction %i at rest and in matching motion',(direction)=>{
    for(const speed of [-.049,0,.049,direction*.051,direction*2]){
      expect(tyreForces(direction*2000,100,3000,speed,dt,true)).toEqual({engine:direction*1900,brake:0});
    }
    expect(tyreForces(direction*2000,100,500,direction,dt,true)).toEqual({engine:direction*500,brake:0});
  });

  it.each([1,-1])('adds braking to powered torque while rolling against direction %i',(direction)=>{
    let previousForce=0;
    for(const resistance of [0,100,1000,1999,2000,2001,3000]){
      const force=tyreForces(direction*2000,resistance,10000,-direction*2,dt,true);
      const stoppingForce=direction*force.engine+force.brake/dt;
      expect(stoppingForce).toBeCloseTo(2000+resistance);
      expect(stoppingForce).toBeGreaterThanOrEqual(previousForce);
      previousForce=stoppingForce;
      if(resistance<2000){expect(force.engine*direction).toBeGreaterThan(0);expect(force.brake).toBe(0);}
      else expect(force.engine).toBe(0);
    }
    expect(tyreForces(direction*2000,100,500,-direction,dt,true)).toEqual({engine:direction*500,brake:0});
    expect(tyreForces(direction*2000,100,3000,-direction*.049,dt,true)).toEqual({engine:direction*1900,brake:0});
  });

  it.each([1,-1])('lets sufficient braking stop powered motion in direction %i without propelling through zero',(direction)=>{
    for(const resistance of [2000,3000])for(const speed of [-direction,0,direction]){
      const force=tyreForces(direction*2000,resistance,10000,speed,dt,true);
      expect(force.engine).toBe(0);
      expect(force.brake).toBeGreaterThanOrEqual(0);
    }
    expect(tyreForces(direction*2000,3000,10000,direction,dt,true).brake).toBeCloseTo(1000*dt);
    expect(tyreForces(direction*2000,3000,10000,-direction,dt,true).brake).toBeCloseTo(5000*dt);
  });

  it.each([1,-1])('uses brake impulses for passive engine braking against direction %i',(direction)=>{
    const force=tyreForces(-direction*2000,100,3000,direction,dt);
    expect(force.engine).toBe(0);
    expect(force.brake).toBeCloseTo(2100*dt);
  });

  it('creates no traction or braking beyond the available grip',()=>{
    for(const direction of [1,-1]){
      for(const force of [tyreForces(direction*2000,100,0,-direction,dt,true),tyreForces(-direction*2000,100,0,direction,dt)]){
        expect(Math.abs(force.engine)).toBe(0);expect(force.brake).toBe(0);
      }
    }
  });

  it('keeps neutral resistance passive at rest and in either rolling direction',()=>{
    for(const speed of [-1,0,1])for(const resistance of [0,100]){
      expect(tyreForces(0,resistance,3000,speed,dt,true)).toEqual({engine:0,brake:resistance*dt});
    }
  });
});
