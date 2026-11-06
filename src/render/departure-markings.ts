import * as T from 'three';
import { departureHatching,departureRightGuide } from '../data/road-markings';
import type { Vec2 } from '../types';
import { islandHatchPitch } from '../data/marking-standards';

const curve=(points:Vec2[])=>new T.CatmullRomCurve3(points.map(p=>new T.Vector3(p.x,0,p.z)),false,'centripetal');
export function departureMarkingPaths(){
  const cubic=(points:Vec2[])=>new T.CubicBezierCurve3(...points.map(p=>new T.Vector3(p.x,0,p.z)) as [T.Vector3,T.Vector3,T.Vector3,T.Vector3]);
  const left=cubic(departureHatching.left),right=cubic(departureHatching.right);
  const center=cubic(departureHatching.left.map((p,i)=>({x:(p.x+departureHatching.right[i].x)/2,z:(p.z+departureHatching.right[i].z)/2}))),length=center.getLength();
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
  const {center:noseCenter,radius}=departureHatching.nose;
  const nose=Array.from({length:33},(_,i)=>{const a=Math.PI/2-i/32*Math.PI;return {x:noseCenter.x+Math.cos(a)*radius,z:noseCenter.z+Math.sin(a)*radius};});
  return {left:leftBorder,right:rightBorder,nose,outline:[...leftBorder,...nose.slice(1),...rightBorder.slice(1,-1).reverse()],chevrons,
    // Keep the spline's outward overshoot on the existing roadside edge until
    // the bend peels away, rather than clipping a loop against the kerb.
    rightGuide:curve(departureRightGuide).getSpacedPoints(96).map(p=>({x:Math.min(p.x,departureRightGuide[0].x),z:p.z}))};
}
