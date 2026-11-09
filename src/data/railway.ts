import type {Vec2} from '../types';

/** Metres, relative to the existing physical road plane at y=0.
 * The crossing's location follows the course plan; its construction dimensions
 * are modelling estimates rather than measurements of the examination centre.
 */
const gauge=1.52,headWidth=.072;
export const railwayCrossing={
  center:{x:57.5,z:-25.25},length:7.8,
  gauge,headWidth,railTop:.045,deckTop:.03,
  grooveWidth:.05,deckHalfSpan:gauge/2+headWidth,sleeperPitch:.65,sleeperWidth:.27,
};

/** A transverse section: [offset along world Z, height]. */
export type RailwaySectionPoint=readonly [number,number];
export type RailwaySection=readonly RailwaySectionPoint[];

const c=railwayCrossing,railOffset=(c.gauge+c.headWidth)/2;
export const railwayDeckBounds={minX:c.center.x-c.length/2,maxX:c.center.x+c.length/2,minZ:c.center.z-c.deckHalfSpan,maxZ:c.center.z+c.deckHalfSpan};
/** Gauge is measured between the inner faces of the two railheads. */
export const railwayRailCenters=[-railOffset,railOffset] as const;
export const railwaySleeperCenters=Array.from({length:Math.round(c.length/c.sleeperPitch)},(_,i)=>-c.length/2+(i+.5)*c.sleeperPitch);
export const railwayMarkings={dividerX:57.5,approachStopZ:-21.5,returnStopZ:-29};

/** Rounded running crown and shoulder above the narrow web. The broad foot
 * and head are distinct parts of an I-section, rather than rectangular bars. */
export const railwayRailHeadProfile:RailwaySection=[
  [-.028,c.railTop-.05],[.028,c.railTop-.05],
  [.033,c.railTop-.044],[.036,c.railTop-.032],[.036,c.railTop-.014],
  [.0345,c.railTop-.008],[.032,c.railTop-.004],[.027,c.railTop-.0014],
  ...Array.from({length:9},(_,i)=>{const z=.024-i*.006;return [z,c.railTop-z*z/.6]as const;}),
  [-.027,c.railTop-.0014],[-.032,c.railTop-.004],[-.0345,c.railTop-.008],
  [-.036,c.railTop-.014],[-.036,c.railTop-.032],[-.033,c.railTop-.044],
];
const bottom=c.railTop-.172,footTop=bottom+.015,webTop=c.railTop-.05;
export const railwayRailBodyProfile:RailwaySection=[
  [-.075,bottom],[.075,bottom],[.075,footTop],[.058,footTop+.006],[.016,footTop+.018],
  [.009,footTop+.032],[.00825,webTop-.012],[.014,webTop],[-.014,webTop],
  [-.00825,webTop-.012],[-.009,footTop+.032],[-.016,footTop+.018],[-.058,footTop+.006],[-.075,footTop],
];

const inner=c.gauge/2-c.grooveWidth;
const panel=(from:number,to:number):RailwaySection=>[
  [from,-.07],[to,-.07],[to,c.deckTop],[from,c.deckTop],
];
/** The supplied close-up and plan show infill only BETWEEN the two rails.
 * Asphalt reaches the outer rail faces without a broad slab or raised apron.
 * The finite tyre climbs the shallow crowns and bridges the inner flangeways.
 */
export const railwayDeckProfiles:readonly {kind:'panel';profile:RailwaySection}[]=[
  {kind:'panel',profile:panel(-inner,inner)},
];

/** Road paint stops at the embedded deck, rather than floating over the steel
 * and flangeways. Return shared paths for both the scene and the mini-map. */
function outsidePaintPaths(points:Vec2[],bounds:typeof railwayDeckBounds):Vec2[][]{
  const result:Vec2[][]=[];
  const append=(a:Vec2,b:Vec2)=>{
    if(Math.hypot(b.x-a.x,b.z-a.z)<1e-8)return;
    const previous=result.at(-1);
    if(previous&&Math.hypot(previous.at(-1)!.x-a.x,previous.at(-1)!.z-a.z)<1e-8)previous.push(b);
    else result.push([a,b]);
  };
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];let enter=0,exit=1;
    for(const [axis,low,high]of [['x',bounds.minX,bounds.maxX],['z',bounds.minZ,bounds.maxZ]]as const){
      const delta=b[axis]-a[axis];
      if(Math.abs(delta)<1e-10){if(a[axis]<low||a[axis]>high){enter=1;exit=0;break;}}
      else{const t0=(low-a[axis])/delta,t1=(high-a[axis])/delta;enter=Math.max(enter,Math.min(t0,t1));exit=Math.min(exit,Math.max(t0,t1));}
    }
    if(enter>=exit){append(a,b);continue;}
    const at=(t:number)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
    if(enter>1e-8)append(a,at(enter));if(exit<1-1e-8)append(at(exit),b);
  }
  return result;
}
export function railwayPaintPaths(points:Vec2[]):Vec2[][]{return outsidePaintPaths(points,railwayDeckBounds);}
// Both L-shaped stopping lines terminate the divider. Video 07:08/07:32
// leaves the full area between their transverse bars open across the rails.
export function railwayDividerPaths(points:Vec2[]):Vec2[][]{
  return outsidePaintPaths(points,{...railwayDeckBounds,minZ:railwayMarkings.returnStopZ,maxZ:railwayMarkings.approachStopZ});
}
