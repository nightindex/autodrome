import {mapPoint} from './course';
import type {SignKind} from '../render/road-signs';

/** Survey of visible assemblies in video/uz_video.mp4. Coordinates use the
 * existing traced plan, not perspective pixels. Times identify the evidence. */
export interface CourseSignPlacement {
  id:string;kind:SignKind;x:number;y:number;yaw:number;frames:number[];
  lower?:SignKind[];mirror?:boolean;bottom?:number;
}
const east=-Math.PI/2,west=Math.PI/2,north=0,south=Math.PI;
export const courseSigns:CourseSignPlacement[]=[
  {id:'start-board',kind:'start',x:232,y:980.5,yaw:east,bottom:1.25,frames:[130]},
  // 02:20: 20 km/h at the first yellow control marks; STOP at the stop stripe.
  {id:'start-speed20',kind:'speed20',x:333,y:980.5,yaw:east,frames:[130,140,155]},
  {id:'start-crossing-near',kind:'pedestrian',x:462,y:980.5,yaw:east,lower:['stop'],bottom:1.5,frames:[130,140,160]},
  {id:'start-crossing-far',kind:'pedestrian',x:462,y:889.5,yaw:east,mirror:true,frames:[130,140,160]},
  {id:'hill-ascent',kind:'ascent',x:660,y:980.5,yaw:east,frames:[175,190]},
  // STOP is at the stop stripe; the descent warning is at the far end of the crest.
  {id:'hill-stop',kind:'stop',x:770,y:973,yaw:east,frames:[175,190,203]},
  {id:'hill-descent',kind:'descent',x:860,y:973,yaw:east,frames:[190,203]},
  // 03:32–03:35: the sign stands just beyond the turn arrows.
  {id:'after-hill-left-turn',kind:'left',x:1080,y:983,yaw:east,frames:[215,218]},
  {id:'after-hill-chevron',kind:'chevronLeft',x:1262,y:920,yaw:east,bottom:1.05,frames:[215]},
  {id:'departure-b-left',kind:'left',x:1264,y:780,yaw:north,lower:['carPlate'],frames:[218,228]},
  {id:'departure-cd-left',kind:'left',x:1257.5,y:835,yaw:north,lower:['truckPlate','busPlate'],frames:[218,228]},
  // The B warning stands just before the yellow entry marks, beside the kerb.
  {id:'bend-b-warning',kind:'winding',x:995,y:586.5,yaw:west,frames:[228]},
  // 03:45: beside the C/D kerb, just before the island's rounded nose.
  {id:'bend-cd-warning',kind:'winding',x:1135,y:661.5,yaw:Math.PI/3,frames:[225,235,242]},
  // 04:05: both right turns are signed near the bend, beyond the yellow marks.
  {id:'bend-b-yield-right',kind:'yield',x:765,y:716.5,yaw:west,lower:['right'],bottom:1.5,frames:[245,253,255]},
  {id:'bend-cd-right',kind:'right',x:765,y:813.5,yaw:west,frames:[245,253]},
  {id:'north-exit-right-turn',kind:'right',x:688,y:205,yaw:north,frames:[298]},
  {id:'snake-b-right',kind:'right',x:691,y:188,yaw:east,lower:['carPlate'],frames:[302,306]},
  {id:'snake-cd-right',kind:'right',x:812,y:245,yaw:east,lower:['truckPlate','busPlate'],frames:[302,306]},
  {id:'snake-b-warning',kind:'winding',x:728.5,y:342,yaw:south,frames:[302]},
  {id:'snake-cd-warning',kind:'winding',x:813,y:255,yaw:south,frames:[302,306]},
  {id:'snake-right-chevron',kind:'chevronLeft',x:710,y:240,yaw:south,mirror:true,bottom:1.05,frames:[302]},
  {id:'snake-b-exit',kind:'yield',x:929.4,y:430.7,yaw:south,lower:['right'],bottom:1.5,frames:[315,320]},
  {id:'snake-cd-exit',kind:'yield',x:1080,y:390,yaw:south,lower:['right'],bottom:1.5,frames:[315,320]},
  {id:'garage-b-right',kind:'right',x:595,y:390,yaw:west,lower:['carPlate'],frames:[335,395]},
  {id:'garage-cd-right',kind:'right',x:385,y:405,yaw:west,lower:['truckPlate','busPlate'],frames:[335,395]},
  {id:'garage-end-right',kind:'right',x:170,y:420,yaw:west,frames:[380,395]},
  {id:'garage-right-chevron',kind:'chevronLeft',x:270,y:450,yaw:west,mirror:true,bottom:1.05,frames:[395]},
  {id:'garage-return-yield-right',kind:'yield',x:514.5,y:460,yaw:south,lower:['right'],bottom:1.5,frames:[395,560]},
  {id:'east-end-left',kind:'left',x:1260,y:465,yaw:east,lower:['railBars3'],frames:[420]},
  {id:'railway-warning',kind:'railWarning',x:1264,y:385,yaw:north,lower:['railBars1'],frames:[435,655]},
  {id:'railway-distance-two',kind:'railBars2',x:1264,y:425,yaw:north,bottom:1.35,frames:[420,435]},
  {id:'railway-stop',kind:'railway',x:1263.3,y:315,yaw:north,bottom:1.5,frames:[435,450,655]},
  {id:'railway-exit-left',kind:'left',x:1263.3,y:225,yaw:north,frames:[450,451]},
  {id:'acceleration-40-20',kind:'speed40',x:1018,y:70.5,yaw:west,lower:['minimum20'],bottom:1.5,frames:[460]},
  {id:'northwest-speed20',kind:'speed20',x:600,y:70.5,yaw:west,frames:[470,480]},
  {id:'northwest-left',kind:'left',x:195,y:70.5,yaw:west,frames:[470,480]},
  {id:'northwest-left-chevron',kind:'chevronLeft',x:16.5,y:116,yaw:west,bottom:1.05,frames:[470,480]},
  {id:'west-end-left',kind:'left',x:16.5,y:405,yaw:south,frames:[495,515]},
  {id:'parking-bay',kind:'parking',x:350,y:621.5,yaw:east,lower:['parkingEndPlate','carPlate'],bottom:1.5,frames:[560]},
  {id:'finish-board',kind:'finish',x:145,y:728.5,yaw:west,bottom:1.25,frames:[680]},
];
export const courseSignPoint=(sign:CourseSignPlacement)=>mapPoint(sign.x,sign.y);
