import { describe,expect,it } from 'vitest';
import { mapProjection,carMapMarker } from '../src/ui/map-projection';
import type { MultiPolygon } from 'polygon-clipping';

const surface:MultiPolygon=[[[[-60,-45],[60,-45],[60,45],[-60,45],[-60,-45]]]];
describe('minimap alignment',()=>{
  it('uses the same scale horizontally and vertically at wide and narrow sizes',()=>{
    for(const [width,height]of [[720,552],[520,400],[135,104]]){
      const p=mapProjection(surface,width,height,12),o=p.project({x:0,z:0}),east=p.project({x:10,z:0}),south=p.project({x:0,z:10});
      expect(east.x-o.x).toBeCloseTo(south.y-o.y,8);expect(o.x).toBeCloseTo(width/2);expect(o.y).toBeCloseTo(height/2);
      for(const ring of surface.flat())for(const [x,z]of ring){const v=p.project({x,z});expect(v.x).toBeGreaterThanOrEqual(12-1e-8);expect(v.y).toBeGreaterThanOrEqual(12-1e-8);expect(v.x).toBeLessThanOrEqual(width-12+1e-8);expect(v.y).toBeLessThanOrEqual(height-12+1e-8);}
    }
  });
  it('maps car and exercise world coordinates back without a positional offset',()=>{
    const p=mapProjection(surface,720,552);for(const point of [{x:-38,z:42},{x:58,z:-21.5},{x:-9.5,z:-22.7},{x:-.5,z:-8.5}]){
      const reconstructed=p.unproject(p.project(point));expect(reconstructed.x).toBeCloseTo(point.x,8);expect(reconstructed.z).toBeCloseTo(point.z,8);
    }
  });
  it('points the car towards each driving direction on the fixed plan',()=>{
    const position={x:100,y:100};
    for(const [yaw,dx,dy]of [[0,0,15],[Math.PI/2,15,0],[Math.PI,0,-15],[-Math.PI/2,-15,0]]){
      const tip=carMapMarker(position,yaw)[0];expect(tip.x-position.x).toBeCloseTo(dx);expect(tip.y-position.y).toBeCloseTo(dy);
    }
  });
});
