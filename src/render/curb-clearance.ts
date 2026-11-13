import type {Vec2} from '../types';
import {boundarySections,roadPaint} from './road-geometry';

const roadSetback=.025,grassGap=.04;
const cross=(a:Vec2,b:Vec2)=>a.x*b.z-a.z*b.x;

/** Keep opposing kerbs inside their own half of a narrow grass lip.
 * Asphalt faces and the source plan stay fixed; only the grass-facing edge
 * narrows. Test rays from both incident edges, just away from their shared
 * corner, so a square return cannot hide a thin stem from the clearance test.
 */
export function curbOuterLimit(points:Vec2[],index:number){
  const p=points[index];let limit=roadSetback+roadPaint.curbWidth;
  for(const neighbour of [(index-1+points.length)%points.length,(index+1)%points.length]){
    const q=points[neighbour],length=Math.hypot(q.x-p.x,q.z-p.z);if(length<1e-7)continue;
    const sign=neighbour===(index+1)%points.length?1:-1;
    const tangent={x:(q.x-p.x)/length*sign,z:(q.z-p.z)/length*sign};
    const direction={x:tangent.z,z:-tangent.x}; // negative offset: grass side
    const inset=Math.min(.001,length/4),origin={x:p.x+(q.x-p.x)/length*inset,z:p.z+(q.z-p.z)/length*inset};
    for(let j=0;j<points.length;j++){
      const next=(j+1)%points.length;if(j===index||next===index)continue;
      const a=points[j],b=points[next],edge={x:b.x-a.x,z:b.z-a.z},edgeLength=Math.hypot(edge.x,edge.z);
      if(edgeLength<1e-7)continue;
      // Only a facing boundary competes for the same strip of grass. Nearby
      // tessellation edges on a curve must not force the kerb to zero width.
      if((edge.z*direction.x-edge.x*direction.z)/edgeLength>-.5)continue;
      const delta={x:a.x-origin.x,z:a.z-origin.z},denominator=cross(direction,edge);
      if(Math.abs(denominator)<1e-8)continue;
      const distance=cross(delta,edge)/denominator,u=cross(delta,direction)/denominator;
      if(distance>roadSetback*2&&u>=-1e-7&&u<=1+1e-7)limit=Math.min(limit,(distance-grassGap)/2);
    }
  }
  return Math.max(roadSetback+.045,limit);
}

export function courseCurbSections(loops:Vec2[][]){
  return boundarySections(loops,-roadSetback,-roadSetback-roadPaint.curbWidth,roadPaint.curbStripe,curbOuterLimit);
}
