import type { Vec2 } from '../types';
import type { PaintedArrow } from '../data/road-markings';
import { directionArrowDimensions as dimensions,standardTurnArrowDimensions } from '../data/marking-standards';

/** The complete bent arrow, including its head, is centred across the lane. */
export function roadArrowOutline({point,normal,turn,scale=1,outline:tracedOutline,profile}:PaintedArrow):Vec2[]{
  if(tracedOutline)return tracedOutline.map(([across,along])=>({
    x:point.x+(-normal.z*across+normal.x*along)*scale,
    z:point.z+(normal.x*across+normal.z*along)*scale,
  }));
  const {length,headLength,shaft,headWidth,turnWidth,turnStem,combinedLength}=dimensions;
  // (across, along), traced from the straight, bent and combined symbols in
  // the plan. Left turns mirror only the sideways coordinate.
  const standard=standardTurnArrowDimensions,neckStart=standard.length-standard.a2-2*standard.b,tip=neckStart+standard.b;
  const outline=profile==='standard-turn'?[
    [0,0],[standard.shaft,0],[standard.shaft,standard.stem],
    [standard.headBase,neckStart],[standard.headBase,neckStart-standard.a1],
    [standard.headBase+standard.headDepth,tip],[standard.headBase,standard.length],
    [standard.headBase,tip+standard.b],[0,tip+standard.b-standard.headBase],
  ]:turn==='straight-right'?[
    [-shaft/2,0],[shaft/2,0],[shaft/2,1.3],[1.2,1.9],[1.2,1.4],
    [1.6,2.5],[1.2,3.6],[1.2,3],[shaft/2,2.4],[shaft/2,3.8],
    [.6,3.9],[0,combinedLength],[-.6,3.9],[-shaft/2,3.8],
  ]:turn?[
    [0,0],[shaft,0],[shaft,turnStem],[1.3,3.3],[1.3,2.7],
    [turnWidth,3.8],[1.3,length],[1.3,4.3],[0,3.5],
  ]:[
    [-shaft/2,0],[shaft/2,0],[shaft/2,length-headLength],
    [headWidth/2,length-headLength],[0,length],[-headWidth/2,length-headLength],[-shaft/2,length-headLength],
  ];
  const center=(Math.min(...outline.map(p=>p[0]))+Math.max(...outline.map(p=>p[0])))/2;
  return outline.map(([x,along])=>{
    const across=(x-center)*(turn==='left'?-1:1)*scale,forward=(along-(turn==='straight-right'?combinedLength:length)/2)*scale;
    return {x:point.x-normal.z*across+normal.x*forward,z:point.z+normal.x*across+normal.z*forward};
  });
}

/** Find the nearest painted border on each side at the arrow's station. */
export function centerArrowBetweenLines(arrow:PaintedArrow,paths:Vec2[][]):PaintedArrow {
  const {point,normal}=arrow,across={x:-normal.z,z:normal.x};
  const cross=(a:Vec2,b:Vec2)=>a.x*b.z-a.z*b.x;
  let left=-Infinity,right=Infinity;
  for(const path of paths)for(let i=1;i<path.length;i++){
    const a=path[i-1],edge={x:path[i].x-a.x,z:path[i].z-a.z},delta={x:a.x-point.x,z:a.z-point.z},denominator=cross(across,edge);
    if(Math.abs(denominator)<1e-8)continue;
    const t=cross(delta,edge)/denominator,u=cross(delta,across)/denominator;
    if(u<0||u>1)continue;
    if(t<0)left=Math.max(left,t);else right=Math.min(right,t);
  }
  if(!Number.isFinite(left)||!Number.isFinite(right))throw new Error('Arrow needs painted lane borders on both sides');
  const offset=(left+right)/2;
  return {...arrow,point:{x:point.x+across.x*offset,z:point.z+across.z*offset}};
}
