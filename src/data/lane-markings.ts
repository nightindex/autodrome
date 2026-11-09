import { mapPoint } from './course';
import { planArc,type PlanPoint } from './after-hill';
import type { Vec2 } from '../types';
import { intersectionApproaches } from './intersection';
import { markingDimensions } from './marking-standards';
import {railwayPaintPaths,railwayDividerPaths} from './railway';
import {parkingControlLines,parkingControlWidth} from './parking-control-lines';

const path=(points:PlanPoint[]):Vec2[]=>points.map(([x,y])=>mapPoint(x,y));
const cubic=(a:PlanPoint,b:PlanPoint,c:PlanPoint,d:PlanPoint):PlanPoint[]=>Array.from({length:32},(_,i)=>{
  const t=(i+1)/32,u=1-t;return [u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]];
});
export interface LaneLine {id:string;points:Vec2[];width:number;dash?:{length:number;gap:number}}
const line=(id:string,points:PlanPoint[],width:number=markingDimensions.divider):LaneLine=>({id,points:path(points),width});
const stop=(id:string):PlanPoint=>{const p=intersectionApproaches.find(a=>a.id===id)!.stop;return [640+p.x*10,530+p.z*10];};

// Solid white separation traced from the plan and uz_video.mp4. The centre of
// the signal junction remains open; each approach ends before its crossing.
export const laneLines:LaneLine[]=[
  line('west-perimeter',[[600,116],[170,116],...planArc(170,221,105,-90,-180).slice(1),[65,400],...planArc(170,400,105,180,90).slice(1),stop('west')]),
  line('north-perimeter',[[600,116],[670,116]]),
  line('east-perimeter',[[670,116],[1100,116],...cubic([1100,116],[1170,116],[1215,160],[1215,240]),[1215,430],...cubic([1215,430],[1215,472],[1164,505],[1100,505]),stop('east')]),
  // The return lane's transverse end joins the divider beyond the railway.
  line('railway-return-limit',[[1177.35,240],[1215,240]],markingDimensions.stop),
  // 05:01-05:05: a straight separator enters the two smooth splitter arcs.
  line('north-junction',[[640,156],stop('north')]),
  line('south-junction',[stop('south'),[640,770]]),
  // 04:18: the B/CD divider ends straight beside the category labels,
  // leaving the turning area open.
  line('finish-divider',[[145,775],[535,775]]),
  {...line('parking-channel',[[87,543],[475,543]]),dash:{length:1.6,gap:1.5}},
  line('finish-line',[[145,736],[145,814]],.23),
  ...parkingControlLines.map(({id,points})=>line(id,points,parkingControlWidth)),
];

export interface PaintedGore {id:string;outline:Vec2[];spacing:number;fringe?:boolean;paintPaths?:Vec2[][]}
// These are painted fringes around the lane split, not freestanding triangular
// islands. Both contours end on the actual grass-edge paint.
// The finish junction is an open comb beside the corner of the island. Its
// two curves are traced independently; no closing diagonal is painted.
const finishBranch:PlanPoint[]=[[640,770],...cubic([640,770],[640,793.55],[622.1,812.65],[600,812.65])];
const finishRadius=60.65;
const finishThrough:PlanPoint[]=[[640,770],[640,815],...planArc(700.65,815,finishRadius,180,90,24).slice(1)];
const finishTeeth:PlanPoint[][]=[
  ...[12,17,22,27,30].map(i=>{
    const [x,y]=finishBranch[i],reach=Math.min(6.5,(640-x)*.45);
    return [[x,y],[x+reach,y+reach*.2]] as PlanPoint[];
  }),
  ...[796,807,818,829,840,849].map(y=>{
    const x=y<=815?640:700.65-Math.sqrt(finishRadius**2-(y-815)**2);
    return [[x,y],[x-4.5,y+6.5]] as PlanPoint[];
  }),
];
export const finishSplitPaths=[finishBranch,finishThrough,...finishTeeth].map(path);
// North splitter at 05:01-05:05. Author the two arcs and separate short teeth
// directly; clipped automatic hatching produced a solid, jagged tip here.
const northLeft=planArc(600,156,40,-90,0,32),northRight=planArc(680,156,40,-90,-180,32);
const northTeeth:PlanPoint[][]=[
  ...[-60,-48,-36,-24,-12].map(degrees=>{
    const angle=degrees*Math.PI/180,x=600+40*Math.cos(angle),y=156+40*Math.sin(angle);
    return [[x,y],[x,y-Math.min(6.5,y-116-.8)]] as PlanPoint[];
  }),
  ...[-110,-122,-134,-146,-158].map(degrees=>{
    const angle=degrees*Math.PI/180,x=680+40*Math.cos(angle),y=156+40*Math.sin(angle);
    const opposite=600+Math.sqrt(40**2-(y-156)**2),reach=Math.min(6.5,(x-opposite)*.4);
    return [[x,y],[x-reach,y]] as PlanPoint[];
  }),
];
export const northSplitPaths=[northLeft,northRight,...northTeeth].map(path);
export const laneGores:PaintedGore[]=[
  {id:'north-split',spacing:.84,fringe:true,paintPaths:northSplitPaths,
    outline:path([...northLeft,...northRight.slice().reverse()])},
  {id:'finish-split',spacing:.65,fringe:true,paintPaths:finishSplitPaths,
    outline:path([...finishBranch,[600,815],[660,878],[700.65,875.65],...finishThrough.slice().reverse()])},
];

/** Shared painted segments keep intentional gaps identical in 3D and on the map. */
function continuousLanePaths(line:LaneLine):Vec2[][]{
  if(!line.dash)return [line.points];
  const {length:dash,gap}=line.dash,pitch=dash+gap,result:Vec2[][]=[];let travelled=0;
  for(let i=1;i<line.points.length;i++){
    const a=line.points[i-1],b=line.points[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(length<1e-8)continue;
    const at=(station:number)=>({x:a.x+(b.x-a.x)*station/length,z:a.z+(b.z-a.z)*station/length});
    for(let start=Math.floor(travelled/pitch)*pitch;start<travelled+length;start+=pitch){
      const lo=Math.max(0,start-travelled),hi=Math.min(length,start+dash-travelled);
      if(hi>lo+1e-8)result.push([at(lo),at(hi)]);
    }
    travelled+=length;
  }
  return result;
}
export function lanePaintPaths(line:LaneLine):Vec2[][]{return continuousLanePaths(line).flatMap(line.id==='east-perimeter'?railwayDividerPaths:railwayPaintPaths);}
