import { mapPoint } from './course';
import { markingDimensions } from './marking-standards';
import type { Vec2 } from '../types';
import {parkingMouths} from './parking-control-lines';

// Positions traced against the supplied plan; headings point towards the driver’s destination.
export interface SurfaceLabel {text:string;point:Vec2;normal:Vec2;width:number;length:number}
const label=(text:string,x:number,y:number,nx:number,nz:number,width=text==='B'?.75:1.2,length=1.3):SurfaceLabel=>({text,point:mapPoint(x,y),normal:{x:nx,z:nz},width,length});
// Midpoints between the START divider (935) and the edge-paint centres
// (898.35 / 971.65). Each category and its direction arrow share one axis.
const startLanePlanY={B:953.325,CD:916.675};
export const categoryLabels:SurfaceLabel[]=[
  label('B',243,startLanePlanY.B,1,0),label('CD',243,startLanePlanY.CD,1,0),
  label('B',270,795,-1,0),label('CD',270,755,-1,0),
  label('B',545,795,-1,0),label('CD',545,755,-1,0),
  label('B',1235,812,0,-1),label('CD',1195,835,0,-1),
  label('B',770,195,0,1),label('CD',825,195,0,1),
  label('B',205,440,0,1),label('CD',420,440,0,1),
  label('B',110,561,1,0),label('B',260,561,1,0),label('B',410,561,1,0),
  label('BCD',110,526,1,0,1.6),label('B',269,174,0,1),
];
export interface PaintedArrow {point:Vec2;normal:Vec2;turn?:'left'|'right'|'straight-right';scale?:number;profile?:'standard-turn';outline?:[number,number][]}
const arrow=(x:number,y:number,nx:number,nz:number,turn?:PaintedArrow['turn']):PaintedArrow=>({point:mapPoint(x,y),normal:{x:nx,z:nz},turn});
// Stations are centres of the complete symbols, not the tips or the stems.
export const departureTurnArrows:PaintedArrow[]=[
  {...arrow(1063.5,953,1,0,'left'),profile:'standard-turn'},
  {...arrow(1063.5,915.5,1,0,'left'),profile:'standard-turn'},
  arrow(1232.5,750,0,-1,'left'),arrow(1194,801.5,0,-1,'left'),
];
export const paintedArrows:PaintedArrow[]=[
  // START and FINISH, including the separate B and C/D lanes.
  arrow(275,startLanePlanY.B,1,0),arrow(275,startLanePlanY.CD,1,0),
  arrow(230,758,-1,0),arrow(230,795,-1,0),...departureTurnArrows,
  // Outer circulation and its opposing direction.
  arrow(198,98,-1,0,'left'),arrow(1061,98,-1,0),
  arrow(45,408,0,1,'left'),arrow(83.5,247,0,-1,'right'),
  arrow(1232.5,220,0,-1,'left'),arrow(1195.5,395,0,1,'right'),
  // The three combined arrows on the upper inner lane are all visible on the plan.
  arrow(191.5,135,1,0,'straight-right'),arrow(413.5,135,1,0,'straight-right'),
  arrow(558,138,1,0,'right'),arrow(718.5,151,1,0,'straight-right'),arrow(809,153.5,1,0,'right'),
  // Garage exits and both directions of the long cross street.
  arrow(142,484,-1,0,'right'),arrow(286,486,-1,0,'straight-right'),
  arrow(508.5,488.5,-1,0,'straight-right'),arrow(767.5,488,-1,0),
  arrow(166.5,525,1,0),arrow(509,525,1,0,'right'),arrow(1093.5,523.5,1,0,'left'),
  // Junction approach arrows are resolved against their actual stop bars in CourseWorld.
  arrow(660,630,0,-1),arrow(621,643,0,1,'right'),
  arrow(619,395,0,1,'left'),arrow(659.5,248,0,-1,'right'),
  // Snake exits and B/CD right-angle exercise exits.
  arrow(959,453,0,1,'right'),arrow(1133.5,375,0,1,'right'),
  arrow(783,745,-1,0,'right'),arrow(783,850,-1,0,'right'),
  // Small guide into the parking approach, as drawn beside its rounded mouth.
  {...arrow(475,562,.94,-.341174),scale:.55},
];
// Yellow paint begins/ends at the transverse control marks, following the real
// pavement boundary rather than drawing a second, approximate road outline.
const traced=(points:number[][])=>points.map(([x,y])=>mapPoint(x,y));
export const yellowBoundaryRoads=[
  // Continue yellow around the connecting lips as well as each recessed bay.
  {width:.8,points:traced([[66,585],[507,585],[507,550]])},
  {width:.8,points:traced([[350,735],[350,695],[510,695],[510,735]])},
  // These are colour-selection envelopes, not physical road widths. Include
  // the rounded kerb returns so the clipped edge has no isolated white wedges.
  {width:5.3,points:traced([[985,615],[917.5,615],[917.5,745],[850,745]])},
  {width:5.8,points:traced([[1095,690],[995,690],[995,850],[865,850]])},
  {width:6.5,points:traced([[760,345],[785,390],[820,405],[855,395],[890,362],[920,370],[955,400],[960,425],[950,445]])},
  {width:8,points:traced([[845,230],[850,265],[880,300],[930,310],[980,290],[1030,265],[1085,280],[1120,310],[1130,340]])},
  {width:4.8,points:traced([[205,195],[205,343]])},
  {width:4.8,points:traced([[125,275],[230,275]])},
  {width:6.7,points:traced([[423.5,183],[423.5,400]])},
  {width:6.2,points:traced([[310,302.5],[420,302.5]])},
  {width:5.4,points:traced([[270,295],[270,441]])},
  {width:5.5,points:traced([[270,362.5],[351,362.5]])},
  {width:5.4,points:traced([[500,243],[500,390]])},
  {width:4.6,points:traced([[500,311],[578,311]])},
  ...[[70,165],[215,312],[350,458]].map(([left,right])=>({width:3.4,points:traced([[left,600],[right,600]])})),
  {width:4.3,points:traced([[350,715],[510,715]])},
];
export const parkingMouthLines=parkingMouths.map(m=>({...m,points:traced(m.points)}));
export const yellowControlLines:Vec2[][]=[
  [[333,898],[333,972]],
  [[985,592],[985,638]],[[850,722.5],[850,767.5]],
  [[1095,665],[1095,720]],[[865,822.5],[865,878]],
  [[734.1,345],[782.9,345]],[[933,430],[977,430]],
  [[1102,340],[1160,340]],[[819,230],[878,230]],
  [[245,295],[295,295]],[[183,343],[230,343]],
  [[475,243],[525,243]],[[392,400],[455,400]],
  [[600,79],[600,114]],[[1018,79],[1018,114]],
].map(traced).concat(parkingMouthLines.map(m=>m.points));

/** Identical dash stations in the scene and mini-map; leave both bay corners clear. */
export function yellowControlPaintPaths(points:Vec2[]):Vec2[][]{
  const [a,b]=points,length=Math.hypot(b.x-a.x,b.z-a.z),dash=.32,pitch=.65;
  if(length<1e-8)return [];
  const parking=parkingMouthLines.some(m=>m.points===points);
  const count=Math.max(1,Math.floor((length-.4+.33)/pitch));
  const inset=parking?(length-((count-1)*pitch+dash))/2:0,result:Vec2[][]=[];
  const at=(d:number)=>({x:a.x+(b.x-a.x)*d/length,z:a.z+(b.z-a.z)*d/length});
  for(let d=inset;d<length-inset-1e-8;d+=pitch)result.push([at(d),at(Math.min(length-inset,d+dash))]);
  return result;
}

// Both borders start at the lane-divider tip, then meet opposite sides of the
// rounded island nose. The arc follows the existing edge-paint centreline.
export const departureHatching={
  // At 03:45 the V strokes, outline and adjoining roadside paint appear equally
  // wide. Match the existing edge paint; this is a video reconstruction.
  lineWidth:markingDimensions.edge,
  left:traced([[1215,755],[1215,710],[1194,667.1],[1140,667.1]]),
  right:traced([[1215,755],[1220,715],[1210,637.9],[1140,637.9]]),
  nose:{center:mapPoint(1140,652.5),radius:1.46},
};
// Right side of the B channel: leave the roadside edge at the category sign,
// then follow the left bend until it meets the upper island's edge paint.
export const departureRightGuide=traced([[1251.65,780],[1251.65,740],[1251.65,692],[1230,640],[1190,603],[1135,592.35],[1110,592.35]]);
