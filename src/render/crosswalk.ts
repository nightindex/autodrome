import type { MultiPolygon } from 'polygon-clipping';
import type { Vec2 } from '../types';
import { offsetPath,roadPaint } from './road-geometry';
import { markingDimensions } from '../data/marking-standards';

export interface Crosswalk {center:Vec2;normal:Vec2;width:number;length:number}
export const crossingPaint={pitch:markingDimensions.crossingStripe+markingDimensions.crossingGap,stripeWidth:markingDimensions.crossingStripe,edgeClearance:roadPaint.edgeInset+roadPaint.edgeWidth+.02};

/** Fit the whole rectangle inside the roadside paint, including rounded mouths
 * and both ends of the crossing. Use the same offsets as the side lines. */
export function fitCrosswalk(surface:MultiPolygon,center:Vec2,normal:Vec2,length:number=markingDimensions.crossingLength):Crosswalk {
  const right={x:-normal.z,z:normal.x};let left=-Infinity,rightEdge=Infinity;
  const inside=surface.map(polygon=>polygon.map(ring=>{
    const points=offsetPath(ring.slice(0,-1).map(([x,z])=>({x,z})),crossingPaint.edgeClearance,true);
    return [...points,points[0]].map(p=>[p.x,p.z]);
  }));
  // Each boundary is piecewise linear: extrema occur at the crossing ends or
  // boundary vertices. Fixed sampling can miss a narrow bend between stations.
  const stations=new Set([-length/2,length/2]);
  for(const polygon of inside)for(const ring of polygon)for(const [x,z]of ring){
    const along=(x-center.x)*normal.x+(z-center.z)*normal.z;
    if(Math.abs(along)<length/2)stations.add(along);
  }
  for(const along of stations){
    const hits:number[]=[];
    for(const polygon of inside)for(const ring of polygon)for(let i=1;i<ring.length;i++){
      const a=ring[i-1],b=ring[i],ax=a[0]-center.x,az=a[1]-center.z,bx=b[0]-center.x,bz=b[1]-center.z;
      const u=ax*normal.x+az*normal.z,v=bx*normal.x+bz*normal.z;
      if((u>along)===(v>along))continue;
      const t=(along-u)/(v-u);hits.push((ax+(bx-ax)*t)*right.x+(az+(bz-az)*t)*right.z);
    }
    hits.sort((a,b)=>a-b);
    const index=hits.findIndex((hit,i)=>i%2===0&&hit<=0&&hits[i+1]>=0);
    if(index<0)throw new Error('Crosswalk centre is outside the road');
    left=Math.max(left,hits[index]);rightEdge=Math.min(rightEdge,hits[index+1]);
  }
  const offset=(left+rightEdge)/2,width=rightEdge-left;
  if(width<1)throw new Error('No space between kerbs for crosswalk');
  return {center:{x:center.x+right.x*offset,z:center.z+right.z*offset},normal,width,length};
}

/** Identical stripes in the world and mini-map. */
export function crosswalkStripes(crossing:Crosswalk):{points:Vec2[];yellow:boolean}[]{
  const {center,normal,length,width}=crossing,right={x:-normal.z,z:normal.x};
  const {pitch,stripeWidth}=crossingPaint,count=Math.floor((width-stripeWidth)/pitch)+1;
  return Array.from({length:count},(_,i)=>{
    const offset=(i-(count-1)/2)*pitch;
    return {yellow:i%2===0,points:[[-length/2,offset-stripeWidth/2],[length/2,offset-stripeWidth/2],[length/2,offset+stripeWidth/2],[-length/2,offset+stripeWidth/2]].map(([along,across])=>({x:center.x+normal.x*along+right.x*across,z:center.z+normal.z*along+right.z*across}))};
  });
}
