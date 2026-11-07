import * as T from 'three';
import { departureHatching,departureRightGuide } from '../data/road-markings';
import type { Vec2 } from '../types';
import { islandHatchPitch } from '../data/marking-standards';
import { afterHillGrass } from '../data/after-hill';
import { mapPoint } from '../data/course';
import { offsetPath,roadPaint } from './road-geometry';

const curve=(points:Vec2[])=>new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p.x,0,p.z)),false,'centripetal');
export function departureMarkingPaths(){
  // Use the very same polygon offset as the roadside paint. A separately
  // approximated semicircle produces a second, wider outline at the island tip.
  const {center:noseCenter}=departureHatching.nose;
  const island=afterHillGrass[1].map(([x,y])=>mapPoint(x,y)).map(p=>({x:Math.round(p.x*1e6)/1e6,z:Math.round(p.z*1e6)/1e6})).reverse();
  const nose=offsetPath(island,roadPaint.edgeInset+roadPaint.edgeWidth/2,true).filter(p=>p.x>=noseCenter.x&&Math.abs(p.z-noseCenter.z)<2);
  const joinNose=(points:Vec2[],end:Vec2)=>points.map((p,i)=>i===3?end:i===2?{...p,z:end.z}:p);
  const leftPoints=joinNose(departureHatching.left,nose[0]),rightPoints=joinNose(departureHatching.right,nose.at(-1)!);
  const cubic=(points:Vec2[])=>new T.CubicBezierCurve3(...points.map(p=>new T.Vector3(p.x,0,p.z)) as [T.Vector3,T.Vector3,T.Vector3,T.Vector3]);
  const left=cubic(leftPoints),right=cubic(rightPoints);
  const center=cubic(leftPoints.map((p,i)=>({x:(p.x+rightPoints[i].x)/2,z:(p.z+rightPoints[i].z)/2}))),length=center.getLength();
  const section=(s:number)=>{
    const t=center.getUtoTmapping(T.MathUtils.clamp(s/length,0,1),0),a=left.getPoint(t),b=right.getPoint(t);
    return {left:{x:a.x,z:a.z},right:{x:b.x,z:b.z},center:{x:(a.x+b.x)/2,z:(a.z+b.z)/2}};
  };
  const sections=Array.from({length:97},(_,i)=>section(length*i/96));
  const chevrons:Vec2[][]=[];
  // Apices face the approaching car. Equal distance stations avoid crossed arms
  // when the two borders have different curve lengths.
  for(let s=2.1;s<length-1.8;s+=islandHatchPitch){
    const a=section(s),before=section(s-.05),after=section(s+.05),width=Math.hypot(a.right.x-a.left.x,a.right.z-a.left.z);
    const tangent=new T.Vector2(after.center.x-before.center.x,after.center.z-before.center.z).normalize(),right=new T.Vector2(-tangent.y,tangent.x);
    const tip={x:a.center.x-tangent.x*width/2,z:a.center.z-tangent.y*width/2},reach=width+1;
    chevrons.push([-1,0,1].map(side=>side===0?tip:{x:tip.x+tangent.x*reach+right.x*reach*side,z:tip.z+tangent.y*reach+right.y*reach*side}));
  }
  const leftBorder=sections.map(s=>s.left),rightBorder=sections.map(s=>s.right);
  return {left:leftBorder,right:rightBorder,nose,outline:[...leftBorder,...nose.slice(1),...rightBorder.slice(1,-1).reverse()],chevrons,
    // Keep the spline's outward overshoot on the existing roadside edge until
    // the bend peels away, rather than clipping a loop against the kerb.
    rightGuide:curve(departureRightGuide).getSpacedPoints(96).map(p=>({x:Math.min(p.x,departureRightGuide[0].x),z:Math.max(p.z,departureRightGuide.at(-1)!.z)}))};
}
