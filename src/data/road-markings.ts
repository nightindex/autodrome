import { mapPoint } from './course';
import type { Vec2 } from '../types';

// Positions traced against the supplied plan; headings point towards the driver’s destination.
export interface SurfaceLabel {text:string;point:Vec2;normal:Vec2;width:number;length:number}
const label=(text:string,x:number,y:number,nx:number,nz:number,width=text==='B'?.75:1.2,length=1.3):SurfaceLabel=>({text,point:mapPoint(x,y),normal:{x:nx,z:nz},width,length});
export const categoryLabels:SurfaceLabel[]=[
  label('B',342,950,1,0),label('CD',342,915,1,0),
  label('B',270,795,-1,0),label('CD',270,755,-1,0),
  label('B',545,795,-1,0),label('CD',545,755,-1,0),
  label('B',1235,812,0,-1),label('CD',1195,835,0,-1),
  label('B',770,195,0,1),label('CD',825,195,0,1),
  label('B',205,440,0,1),label('CD',420,440,0,1),
  label('B',110,561,1,0),label('B',260,561,1,0),label('B',410,561,1,0),
  label('BCD',110,526,1,0,1.6),label('B',269,174,0,1),
];
export interface PaintedArrow {point:Vec2;normal:Vec2;turn?:'left'|'right'|'straight-right'}
const arrow=(x:number,y:number,nx:number,nz:number,turn?:'left'|'right'):PaintedArrow=>({point:mapPoint(x,y),normal:{x:nx,z:nz},turn});
export const departureTurnArrows:PaintedArrow[]=[
  arrow(1050,950,1,0,'left'),arrow(1050,915,1,0,'left'),
  arrow(1235,775,0,-1,'left'),arrow(1195,805,0,-1,'left'),
];
export const paintedArrows:PaintedArrow[]=[
  arrow(375,950,1,0),arrow(375,915,1,0),...departureTurnArrows,
  arrow(1235,425,0,-1),arrow(1195,425,0,1,'right'),
  arrow(1070,100,-1,0),arrow(570,140,1,0,'right'),arrow(400,140,1,0,'right'),arrow(190,100,-1,0,'left'),
  arrow(45,385,0,1),arrow(80,225,0,-1),arrow(130,475,-1,0,'right'),
  arrow(280,490,-1,0),arrow(500,490,-1,0),arrow(755,490,-1,0),
  arrow(515,526,1,0,'right'),arrow(1080,526,1,0,'left'),
  // 04:58: the outbound arrow is near the perimeter turn; the opposing
  // approach arrow remains beside its stop line, near the zebra.
  arrow(655,610,0,-1),arrow(615,610,0,1,'right'),arrow(615,395,0,1),arrow(658.5,245,0,-1,'right'),
  arrow(955,430,0,1,'right'),arrow(805,745,-1,0,'right'),arrow(805,850,-1,0,'right'),
  // 05:02: the feeder permits straight ahead or right into the two snake
  // entrances. Each entrance has its own right-turn arrow and vehicle plate.
  {point:mapPoint(690,140),normal:{x:1,z:0},turn:'straight-right'},
  arrow(770,195,1,0,'right'),arrow(825,195,1,0,'right'),
  arrow(310,755,-1,0),arrow(310,795,-1,0),
  arrow(590,755,-1,0),arrow(590,795,-1,0),
];
// Yellow paint begins/ends at the transverse control marks, following the real
// pavement boundary rather than drawing a second, approximate road outline.
const traced=(points:number[][])=>points.map(([x,y])=>mapPoint(x,y));
export const yellowBoundaryRoads=[
  // These are colour-selection envelopes, not physical road widths. Include
  // the rounded kerb returns so the clipped edge has no isolated white wedges.
  {width:5.3,points:traced([[985,615],[917.5,615],[917.5,745],[850,745]])},
  {width:5.8,points:traced([[1095,690],[995,690],[995,850],[865,850]])},
  {width:5.5,points:traced([[760,345],[785,390],[820,405],[855,395],[890,362],[920,370],[955,400],[960,425],[950,445]])},
  {width:8,points:traced([[845,230],[850,265],[880,300],[930,310],[980,290],[1030,265],[1085,280],[1120,310],[1130,340]])},
  {width:4.8,points:traced([[205,195],[205,440]])},
  {width:4.8,points:traced([[125,275],[230,275]])},
  {width:6.2,points:traced([[420,183],[420,400]])},
  {width:6.2,points:traced([[310,302.5],[420,302.5]])},
  {width:5.5,points:traced([[270,362.5],[347,362.5]])},
  {width:5.4,points:traced([[500,183],[500,390]])},
  {width:4.6,points:traced([[500,311],[578,311]])},
  ...[[70,165],[215,312],[350,458]].map(([left,right])=>({width:3.4,points:traced([[left,600],[right,600]])})),
  {width:4.3,points:traced([[350,715],[510,715]])},
];
export const yellowControlLines:Vec2[][]=[
  [[415,898],[415,972]],
  [[985,592],[985,638]],[[850,722.5],[850,767.5]],
  [[1095,665],[1095,720]],[[865,822.5],[865,878]],
  [[734.1,345],[782.9,345]],[[933,430],[977,430]],
  [[1102,340],[1160,340]],[[819,230],[878,230]],
  [[245,295],[295,295]],[[183,343],[230,343]],
  [[475,243],[525,243]],[[392,400],[455,400]],
  [[66,585],[507,585]],[[350,735],[510,735]],
  [[600,79],[600,114]],[[1018,79],[1018,114]],
].map(traced);

// Both borders start at the lane-divider tip, then meet opposite sides of the
// rounded island nose. The arc follows the existing edge-paint centreline.
export const departureHatching={
  left:traced([[1215,755],[1215,710],[1194,667.1],[1140,667.1]]),
  right:traced([[1215,755],[1220,715],[1210,637.9],[1140,637.9]]),
  nose:{center:mapPoint(1140,652.5),radius:1.46},
};
// Right side of the B channel: leave the roadside edge at the category sign,
// then follow the left bend until it meets the upper island's edge paint.
export const departureRightGuide=traced([[1251.9,780],[1251.9,740],[1251.9,692],[1230,640],[1190,603],[1140,592.1],[1110,592.1]]);
