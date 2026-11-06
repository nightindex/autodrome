import type { Vec2 } from '../types';
import type { PaintedArrow } from '../data/road-markings';
import { directionArrowDimensions as dimensions } from '../data/marking-standards';

/** The complete bent arrow, including its head, is centred across the lane. */
export function roadArrowOutline({point,normal,turn}:PaintedArrow):Vec2[]{
  const {length,headLength,shaft,headWidth,turnWidth,turnHeadDepth,turnHeadBack,turnHeadFront,turnHalfNeck,turnStem}=dimensions;
  const neck=turnWidth-turnHeadDepth,tip=length-turnHeadFront-turnHalfNeck;
  // Coordinates are (across, along). The bend has 45° sides and a lateral
  // arrowhead, rather than the old independently stretched turn icon.
  const outline=turn==='straight-right'?[
    [-shaft/2,0],[shaft/2,0],[shaft/2,1.9],
    [.75,1.9],[.75,1.4],[turnWidth,2.4],[.75,3.1],[.75,2.7],
    [shaft/2,2.7],[shaft/2,length-headLength],
    [headWidth/2,length-headLength],[0,length],[-headWidth/2,length-headLength],[-shaft/2,length-headLength],
  ]:turn?[
    [0,0],[shaft,0],[shaft,turnStem],[neck,tip-turnHalfNeck],
    [neck,tip-turnHalfNeck-turnHeadBack],[turnWidth,tip],
    [neck,length],[neck,tip+turnHalfNeck],[0,tip+turnHalfNeck-neck],
  ]:[
    [-shaft/2,0],[shaft/2,0],[shaft/2,length-headLength],
    [headWidth/2,length-headLength],[0,length],[-headWidth/2,length-headLength],[-shaft/2,length-headLength],
  ];
  const center=(Math.min(...outline.map(p=>p[0]))+Math.max(...outline.map(p=>p[0])))/2;
  return outline.map(([x,along])=>{
    const across=(x-center)*(turn==='left'?-1:1),forward=along-length/2;
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
