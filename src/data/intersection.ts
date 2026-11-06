import type { Vec2 } from '../types';
import { markingDimensions } from './marking-standards';

export const intersectionCenter:Vec2={x:-.5,z:-2.5};
// Four separate mouths of the junction, checked against the plan and the
// south/west approach views in uz_video.mp4. Stops sit behind each zebra.
interface IntersectionApproach {id:string;stop:Vec2;crossing:Vec2;normal:Vec2;turn?:'left'|'right'}
const mouths:Omit<IntersectionApproach,'stop'>[]=[
  {id:'south',crossing:{x:-.5,z:4.5},normal:{x:0,z:-1}},
  {id:'north',crossing:{x:-.1,z:-9.5},normal:{x:0,z:1},turn:'left'},
  {id:'west',crossing:{x:-7.5,z:-2.5},normal:{x:1,z:0},turn:'right'},
  {id:'east',crossing:{x:7.2,z:-2.5},normal:{x:-1,z:0},turn:'left'},
];
export const intersectionApproaches:IntersectionApproach[]=mouths.map(approach=>({...approach,stop:{
  // Keep one clear metre between the 40 cm stop stripe and the 4 m zebra.
  x:approach.crossing.x-approach.normal.x*(markingDimensions.crossingLength/2+1+markingDimensions.stop/2),
  z:approach.crossing.z-approach.normal.z*(markingDimensions.crossingLength/2+1+markingDimensions.stop/2),
}}));
