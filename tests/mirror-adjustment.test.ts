import { describe,expect,it } from 'vitest';
import { mirrorLimits,moveMirrorAngle,readMirrorAdjustments,sideMirrorDirection } from '../src/render/mirror-adjustment';

describe('mirror actuator settings',()=>{
  it.each([undefined,null,{},'bad',{left:null,right:[]}])('centres absent or legacy positions: %j',raw=>{
    expect(readMirrorAdjustments(raw)).toEqual({left:{yaw:0,pitch:0},right:{yaw:0,pitch:0}});
  });
  it('keeps independently saved sides and rejects nonfinite or excessive travel',()=>{
    expect(readMirrorAdjustments({left:{yaw:99,pitch:-99},right:{yaw:NaN,pitch:Infinity}})).toEqual({left:{yaw:8,pitch:-6},right:{yaw:0,pitch:0}});
    expect(readMirrorAdjustments({left:{yaw:3,pitch:-2},right:{yaw:-1,pitch:4}})).toEqual({left:{yaw:3,pitch:-2},right:{yaw:-1,pitch:4}});
  });
  it('moves at the same motor speed at different frame rates without overshooting',()=>{
    const run=(fps:number)=>{let angle=0;for(let i=0;i<fps/4;i++)angle=moveMirrorAngle(angle,8,1/fps);return angle;};
    expect(run(60)).toBeCloseTo(6);expect(run(120)).toBeCloseTo(run(60));
    expect(moveMirrorAngle(7.9,8,.1)).toBe(8);expect(moveMirrorAngle(-5.9,-6,.1)).toBe(-6);
  });
});

describe('reflected mirror directions',()=>{
  const azimuth=(direction:ReturnType<typeof sideMirrorDirection>)=>Math.atan2(direction.x,-direction.z);
  const elevation=(direction:ReturnType<typeof sideMirrorDirection>)=>Math.asin(direction.y);
  it('starts with level rearward views looking outward on opposite sides',()=>{
    const left=sideMirrorDirection('left',{yaw:0,pitch:0}),right=sideMirrorDirection('right',{yaw:0,pitch:0});
    expect(left.x).toBeGreaterThan(0);expect(right.x).toBeLessThan(0);
    expect(left.x).toBeCloseTo(-right.x);expect(left.z).toBeCloseTo(right.z);
    expect(left.z).toBeLessThan(0);expect(left.y).toBe(0);expect(right.y).toBe(0);
  });
  for(const side of ['left','right'] as const){
    it.each([-mirrorLimits.pitch,0,mirrorLimits.pitch])(`${side}: horizontal arrows look in their labelled direction at pitch %d`,pitch=>{
      const left=sideMirrorDirection(side,{yaw:-1,pitch}),centre=sideMirrorDirection(side,{yaw:0,pitch}),right=sideMirrorDirection(side,{yaw:1,pitch});
      // +X is the driver's left. A right command must decrease azimuth on
      // either side; mirroring the displayed image must not invert the pad.
      expect(azimuth(left)).toBeGreaterThan(azimuth(centre));expect(azimuth(right)).toBeLessThan(azimuth(centre));
      expect(azimuth(centre)-azimuth(right)).toBeCloseTo(2*Math.PI/180);
      expect(elevation(left)).toBeCloseTo(elevation(centre));expect(elevation(right)).toBeCloseTo(elevation(centre));
    });
    it.each([-mirrorLimits.yaw,0,mirrorLimits.yaw])(`${side}: vertical arrows look in their labelled direction at yaw %d`,yaw=>{
      const down=sideMirrorDirection(side,{yaw,pitch:-1}),centre=sideMirrorDirection(side,{yaw,pitch:0}),up=sideMirrorDirection(side,{yaw,pitch:1});
      expect(elevation(down)).toBeLessThan(elevation(centre));expect(elevation(up)).toBeGreaterThan(elevation(centre));
      expect(elevation(up)-elevation(centre)).toBeCloseTo(2*Math.PI/180);
      expect(azimuth(down)).toBeCloseTo(azimuth(centre));expect(azimuth(up)).toBeCloseTo(azimuth(centre));
    });
    it(`${side}: keeps finite unit rearward rays at every travel corner`,()=>{
      for(const yaw of [-mirrorLimits.yaw,mirrorLimits.yaw])for(const pitch of [-mirrorLimits.pitch,mirrorLimits.pitch]){
        const direction=sideMirrorDirection(side,{yaw,pitch});
        expect(direction.toArray().every(Number.isFinite)).toBe(true);expect(direction.length()).toBeCloseTo(1);expect(direction.z).toBeLessThan(0);
      }
    });
  }
});
