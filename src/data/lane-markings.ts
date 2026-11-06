import { mapPoint } from './course';
import { planArc,type PlanPoint } from './after-hill';
import type { Vec2 } from '../types';
import { intersectionApproaches } from './intersection';
import { islandHatchPitch,markingDimensions } from './marking-standards';

const path=(points:PlanPoint[]):Vec2[]=>points.map(([x,y])=>mapPoint(x,y));
const cubic=(a:PlanPoint,b:PlanPoint,c:PlanPoint,d:PlanPoint):PlanPoint[]=>Array.from({length:32},(_,i)=>{
  const t=(i+1)/32,u=1-t;return [u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]];
});
export interface LaneLine {id:string;points:Vec2[];width:number}
const line=(id:string,points:PlanPoint[],width:number=markingDimensions.divider):LaneLine=>({id,points:path(points),width});
const stop=(id:string):PlanPoint=>{const p=intersectionApproaches.find(a=>a.id===id)!.stop;return [640+p.x*10,530+p.z*10];};

// Solid white separation traced from the plan and uz_video.mp4. The centre of
// the signal junction remains open; each approach ends before its crossing.
export const laneLines:LaneLine[]=[
  line('west-perimeter',[[600,116],[170,116],...planArc(170,221,105,-90,-180).slice(1),[65,400],...planArc(170,400,105,180,90).slice(1),stop('west')]),
  line('north-perimeter',[[600,116],[670,116]]),
  line('east-perimeter',[[670,116],[1100,116],...cubic([1100,116],[1170,116],[1215,160],[1215,240]),[1215,430],...cubic([1215,430],[1215,472],[1164,505],[1100,505]),stop('east')]),
  // 04:58: the 600–678 corridor has its divider at 639. Blend back into
  // the existing splitter nose instead of displacing the painted gore.
  line('north-junction',[[635,160],...cubic([635,160],[635,180],[639,190],[639,210]),stop('north')]),
  line('south-junction',[stop('south'),[635,790]]),
  line('finish-divider',[[175,775],[550,775],...cubic([550,775],[610,775],[635,750],[635,700])]),
  line('parking-channel',[[130,490],[130,515],...cubic([130,515],[130,535],[150,543],[175,543]),[507,543]]),
  line('finish-line',[[175,736],[175,814]],.23),
  // Bay ends are 1.1 outlines, not the road stop-line marking 1.12.
  line('garage-left-stop',[[138,252.1],[138,295.9]]),
  line('garage-middle-stop',[[325,272.1],[325,332.9]]),
  line('garage-middle-lower-stop',[[335,337.1],[335,387.9]]),
  line('garage-right-stop',[[565,290.1],[565,331.9]]),
  line('parking-left-stop',[[72.1,610],[162.9,610]]),
  line('parking-middle-stop',[[217.1,610],[309.9,610]]),
  line('parking-right-stop',[[352.1,610],[455.9,610]]),
  line('parking-cd-stop',[[352.1,705],[507.9,705]]),
];

export interface PaintedGore {id:string;outline:Vec2[];spacing:number;fringe?:boolean}
// These are painted fringes around the lane split, not freestanding triangular
// islands. Both contours end on the actual grass-edge paint.
export const laneGores:PaintedGore[]=[
  {id:'north-split',spacing:.65,fringe:true,outline:path([[635,160],...cubic([635,160],[635,134],[623,116],[600,116]),[670,116],...cubic([670,116],[645,116],[635,135],[635,160])])},
  {id:'finish-split',spacing:islandHatchPitch,outline:path([[635,790],...cubic([635,790],[635,807],[619,812.9],[600,812.9]),[631.5,823.3],[661.2,875.9],...cubic([661.2,875.9],[635,865],[635,820],[635,790])])},
];
