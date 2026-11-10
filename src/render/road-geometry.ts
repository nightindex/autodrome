import * as T from 'three';
import polygonClipping, { type MultiPolygon, type Pair, type Ring } from 'polygon-clipping';
import type { Vec2 } from '../types';
import { hillBounds, hillHeight, hillProfile } from '../data/course';
import { markingDimensions } from '../data/marking-standards';

export interface RoadRibbon { points:Vec2[];width:number }
export const roadPaint={edgeWidth:markingDimensions.edge,edgeInset:.16,centerWidth:markingDimensions.divider,dashLength:markingDimensions.dash,dashGap:markingDimensions.dashGap,curbWidth:.24,curbHeight:.24,curbStripe:.7,curbBase:-.025};
const area=(ring:Ring)=>ring.slice(1).reduce((sum,p,i)=>sum+ring[i][0]*p[1]-p[0]*ring[i][1],0)/2;
/** Mitered offsets preserve road width at corners, instead of pinching the road. */
export function offsetPath(points:Vec2[],offset:number,closed=false):Vec2[]{
  const normal=(a:Vec2,b:Vec2)=>{const dx=b.x-a.x,dz=b.z-a.z,l=Math.hypot(dx,dz)||1;return {x:-dz/l,z:dx/l};};
  return points.map((p,i)=>{
    const previous=points[(i-1+points.length)%points.length],next=points[(i+1)%points.length];
    if(!closed&&i===0){const n=normal(p,next);return {x:p.x+n.x*offset,z:p.z+n.z*offset};}
    if(!closed&&i===points.length-1){const n=normal(previous,p);return {x:p.x+n.x*offset,z:p.z+n.z*offset};}
    const a=normal(previous,p),b=normal(p,next),divisor=Math.max(.15,1+a.x*b.x+a.z*b.z);
    return {x:p.x+(a.x+b.x)*offset/divisor,z:p.z+(a.z+b.z)*offset/divisor};
  });
}
export function unifiedRoads(roads:RoadRibbon[]):MultiPolygon{
  const polygons=roads.map(r=>{
    const points=r.points.filter((p,i)=>i===0||Math.hypot(p.x-r.points[i-1].x,p.z-r.points[i-1].z)>1e-6);
    const ring:Ring=[...offsetPath(points,r.width/2),...offsetPath(points,-r.width/2).reverse()].map(p=>[p.x,p.z]);ring.push([...ring[0]] as Pair);return [ring];
  });
  return polygonClipping.union(polygons[0],...polygons.slice(1)).map(p=>p.filter((r,i)=>i===0||Math.abs(area(r))>.25));
}
/** Add only the inner-corner pavement needed for a smooth, continuous kerb turn. */
export function roundJunction(surface:MultiPolygon,center:Vec2,widthX:number,widthZ:number,radius=2.4):MultiPolygon{
  const corners:MultiPolygon=[];
  for(const sx of [-1,1])for(const sz of [-1,1]){
    const x=center.x+sx*widthX/2,z=center.z+sz*widthZ/2,cx=x+sx*radius,cz=z+sz*radius;
    const ring:Ring=[[x,z],[cx,z]];
    for(let i=1;i<=24;i++){const a=i/24*Math.PI/2;ring.push([cx-sx*radius*Math.sin(a),cz-sz*radius*Math.cos(a)]);}
    ring.push([x,z]);corners.push([ring]);
  }
  return polygonClipping.union(surface,...corners);
}
export function roadBoundaryLoops(surface:MultiPolygon):Vec2[][]{
  return surface.flatMap(p=>p.map(r=>r.slice(0,-1).map(([x,z])=>({x,z}))));
}
/** The asphalt is a union, so intersections contain no coplanar overlapping faces. */
export function asphaltGeometry(surface:MultiPolygon,height=.02):T.BufferGeometry{
  const rectangle=(x0:number,z0:number,x1:number,z1:number):MultiPolygon=>[[[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]]]];
  const {start,crestStart,crestEnd,end}=hillProfile,ramp=rectangle(start,hillBounds.minZ,end,hillBounds.maxZ);
  const regions=[polygonClipping.difference(surface,ramp),...[[start,crestStart],[crestStart,crestEnd],[crestEnd,end]].map(([a,b])=>polygonClipping.intersection(surface,rectangle(a,hillBounds.minZ,b,hillBounds.maxZ)))];
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];
  for(const region of regions)for(const polygon of region){
    const contours=polygon.map(r=>r.slice(0,-1).map(([x,z])=>new T.Vector2(x,z)));
    const base=positions.length/3,triangles=T.ShapeUtils.triangulateShape(contours[0],contours.slice(1));
    for(const p of contours.flat()){positions.push(p.x,hillHeight(p.x,p.y)+height,p.y);uv.push(p.x/3,p.y/3);}
    for(const [a,b,c]of triangles)indices.push(base+c,base+b,base+a);
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
export interface BoundarySection {a:Vec2;b:Vec2;outerA:Vec2;outerB:Vec2;stripe:number;loop:number;index:number;length:number}
/** Split a continuous ring at paint changes; adjacent sections meet at the same cross section. */
export function boundarySections(loops:Vec2[][],innerOffset:number,outerOffset:number,stripeLength=Infinity):BoundarySection[]{
  const sections:BoundarySection[]=[];
  loops.forEach((points,loop)=>{
    const inside=offsetPath(points,innerOffset,true),outside=offsetPath(points,outerOffset,true);let travelled=0,index=0;
    for(let i=0;i<points.length;i++){
      const next=(i+1)%points.length,length=Math.hypot(points[next].x-points[i].x,points[next].z-points[i].z);if(length<1e-6)continue;
      const interpolate=(a:Vec2,b:Vec2,t:number)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});let start=0;
      while(start<length-1e-7){
        const stripe=Number.isFinite(stripeLength)?Math.floor((travelled+start+1e-7)/stripeLength):0;
        const end=Math.min(length,Number.isFinite(stripeLength)?(stripe+1)*stripeLength-travelled:length);
        if(end-start<1e-7)break;
        sections.push({a:interpolate(inside[i],inside[next],start/length),b:interpolate(inside[i],inside[next],end/length),outerA:interpolate(outside[i],outside[next],start/length),outerB:interpolate(outside[i],outside[next],end/length),stripe,loop,index:index++,length:end-start});start=end;
      }
      travelled+=length;
    }
  });
  return sections;
}
export function boundaryPaintSurface(sections:BoundarySection[]):MultiPolygon{
  return sections.map(s=>[[s.a,s.outerA,s.outerB,s.b,s.a].map(p=>[p.x,p.z] as Pair)]);
}
export function boundaryGeometry(sections:BoundarySection[]):T.BufferGeometry{
  // Split paint at the foot and crest of each slope, exactly like the asphalt.
  // Interpolating only the boundary endpoints lets long edge lines sink into the ramp.
  return asphaltGeometry(boundaryPaintSurface(sections),.048);
}

export function paintPolygonGeometry(points:Vec2[],surface:MultiPolygon,height:number):T.BufferGeometry{
  const ring:Ring=[...points,points[0]].map(p=>[p.x,p.z]);
  return asphaltGeometry(polygonClipping.intersection(surface,[ring]),height);
}
export interface PaintPath {points:Vec2[];width:number}
const cleanPaintPath=(points:Vec2[])=>{
  const unique=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.z-points[i-1].z)>1e-7);
  const closed=unique.length>2&&Math.hypot(unique[0].x-unique.at(-1)!.x,unique[0].z-unique.at(-1)!.z)<1e-6;
  if(closed)unique.pop();return {points:unique,closed};
};
/** A closed stroke has a cyclic join at its first vertex, rather than two
 * unrelated butt caps. Union its bands to retain the unpainted middle. */
export function paintStripSurface(points:Vec2[],width:number):MultiPolygon{
  const path=cleanPaintPath(points);if(path.points.length<2||width<=0)return [];
  if(path.closed)return polygonClipping.union(boundaryPaintSurface(boundarySections([path.points],width/2,-width/2)));
  const ring:Ring=[...offsetPath(path.points,width/2),...offsetPath(path.points,-width/2).reverse()].map(p=>[p.x,p.z]);ring.push([...ring[0]]);
  return [[ring]];
}
export function paintStripGeometry(points:Vec2[],width:number,surface:MultiPolygon,height:number):T.BufferGeometry{
  return asphaltGeometry(polygonClipping.intersection(surface,paintStripSurface(points,width)),height);
}

/** Fill only the missing outside mitres where independent solid lines share
 * an endpoint, including joins between different widths (divider/stop line).
 * Free ends and intentionally dashed lines retain their existing caps. */
export function paintJoinSurface(paths:PaintPath[]):MultiPolygon{
  const ends=new Map<string,{point:Vec2;direction:Vec2;width:number;path:number}[]>();
  paths.forEach((path,index)=>{
    const {points,closed}=cleanPaintPath(path.points);if(closed||points.length<2)return;
    for(const [i,j]of [[0,1],[points.length-1,points.length-2]]){
      const p=points[i],q=points[j],length=Math.hypot(q.x-p.x,q.z-p.z),key=`${p.x.toFixed(6)},${p.z.toFixed(6)}`;
      const group=ends.get(key)??[];group.push({point:p,direction:{x:(q.x-p.x)/length,z:(q.z-p.z)/length},width:path.width,path:index});ends.set(key,group);
    }
  });
  const cross=(a:Vec2,b:Vec2)=>a.x*b.z-a.z*b.x,patches:MultiPolygon=[];
  for(const group of ends.values()){
    const corners:MultiPolygon=[];
    for(let i=0;i<group.length;i++)for(const b of group.slice(i+1)){
      const a=group[i],divisor=cross(a.direction,b.direction);if(Math.abs(divisor)<1e-5)continue;
      const p={x:(a.point.x+b.point.x)/2,z:(a.point.z+b.point.z)/2};
      for(const sign of [-1,1]){
        const q={x:p.x-a.direction.z*a.width/2*sign,z:p.z+a.direction.x*a.width/2*sign};
        const r={x:p.x+b.direction.z*b.width/2*sign,z:p.z-b.direction.x*b.width/2*sign};
        const t=cross({x:r.x-q.x,z:r.z-q.z},b.direction)/divisor;
        const m={x:q.x+a.direction.x*t,z:q.z+a.direction.z*t};
        // Bevel extremely acute apices instead of sending a long white spike
        // beyond the intended contour. Ordinary right-angle joins stay square.
        const outline=Math.hypot(m.x-p.x,m.z-p.z)<=Math.max(a.width,b.width)*2?[p,q,m,r,p]:[p,q,r,p];
        corners.push([outline.map(v=>[v.x,v.z] as Pair)]);
      }
    }
    if(!corners.length)continue;
    const incident=[...new Set(group.map(end=>end.path))].map(index=>paintStripSurface(paths[index].points,paths[index].width));
    const existing=polygonClipping.union(incident[0],...incident.slice(1));
    patches.push(...polygonClipping.difference(polygonClipping.union(corners),existing));
  }
  return patches.length?polygonClipping.union(patches):[];
}

export function curbSurfaces(sections:BoundarySection[],asphalt:MultiPolygon):{black:MultiPolygon;yellow:MultiPolygon}{
  const bands:MultiPolygon[]=[[],[]];
  for(const s of sections){const ring:Ring=[s.a,s.b,s.outerB,s.outerA,s.a].map(p=>[p.x,p.z]);if(Math.abs(area(ring))>1e-9)bands[s.stripe%2].push([ring]);}
  const ramp:MultiPolygon=[[[[hillProfile.start,hillBounds.minZ],[hillProfile.end,hillBounds.minZ],[hillProfile.end,hillBounds.maxZ],[hillProfile.start,hillBounds.maxZ],[hillProfile.start,hillBounds.minZ]]]];
  // A tenth of a millimetre of clearance avoids coincident clipping edges at
  // acute joins; curbs remain outside the pavement rather than sharing slivers.
  const expand=(surface:MultiPolygon,amount:number):MultiPolygon=>surface.map(p=>p.map(r=>{
    const points=offsetPath(r.slice(0,-1).map(([x,z])=>({x,z})),-amount,true).map(p=>[p.x,p.z] as Pair);points.push([...points[0]] as Pair);return points;
  }));
  const clearance=expand(asphalt,.0001);
  const black=polygonClipping.difference(polygonClipping.union(bands[0]),clearance,ramp);
  const yellow=polygonClipping.difference(polygonClipping.union(bands[1]),clearance,expand(black,.00001),ramp);
  return {black,yellow};
}
/** Closed curb solids with outward walls, including holes and exposed stripe ends. */
export function curbGeometry(surfaces:{black:MultiPolygon;yellow:MultiPolygon},options:{height?:number;bevel?:number;color?:number;sideColor?:number;seams?:{axis:'x'|'z';value:number}[]}={}):T.BufferGeometry{
  const positions:number[]=[],colors:number[]=[],indices:number[]=[],references:number[]=[];
  const top=.02+(options.height??roadPaint.curbHeight),bevel=options.bevel??0;
  const add=(x:number,z:number,height:number,color:T.Color,reference=new T.Vector2(x,z))=>{positions.push(x,hillHeight(x,z)+height,z);colors.push(color.r,color.g,color.b);references.push(reference.x,reference.y);};
  for(const [surface,hex]of [[surfaces.black,0x242923],[surfaces.yellow,0xf0ce45]] as const){
    const color=new T.Color(options.color??hex),sideColor=new T.Color(options.sideColor??options.color??hex);
    for(const polygon of surface){
      const contours=polygon.map(r=>r.slice(0,-1).map(([x,z])=>new T.Vector2(x,z))),base=positions.length/3;
      const topContours=bevel?polygon.map(r=>offsetPath(r.slice(0,-1).map(([x,z])=>({x,z})),bevel,true).map((p,i)=>{
        // A rendering-region cut is not an exposed concrete end. Carry the
        // bevel profile through that plane instead of cutting a V into it.
        for(const seam of options.seams??[])if(Math.abs(r[i][seam.axis==='x'?0:1]-seam.value)<1e-6)p[seam.axis]=seam.value;
        return new T.Vector2(p.x,p.z);
      })):contours;
      const triangles=T.ShapeUtils.triangulateShape(topContours[0],topContours.slice(1));
      topContours.forEach((ring,j)=>ring.forEach((p,i)=>add(p.x,p.y,top,color,contours[j][i])));
      for(const [a,b,c]of triangles)indices.push(base+c,base+b,base+a);
      const bottom=positions.length/3;
      for(const p of contours.flat())add(p.x,p.y,roadPaint.curbBase,color);
      for(const [a,b,c]of T.ShapeUtils.triangulateShape(contours[0],contours.slice(1)))indices.push(bottom+a,bottom+b,bottom+c);
      polygon.forEach((ring,ringIndex)=>{
        // Clipping returns CCW outer rings / CW holes in XZ. Their solid lies
        // left of each edge; the visible wall must face right, away from it.
        const rightFacing=(area(ring)>0)===(ringIndex===0);
        for(let i=1;i<ring.length;i++){
          const [a,b]=[ring[i-1],ring[i]],k=positions.length/3;
          add(a[0],a[1],roadPaint.curbBase,sideColor);add(b[0],b[1],roadPaint.curbBase,sideColor);add(b[0],b[1],top-bevel,sideColor);add(a[0],a[1],top-bevel,sideColor);
          if(rightFacing)indices.push(k,k+2,k+1,k,k+3,k+2);else indices.push(k,k+1,k+2,k,k+2,k+3);
          if(bevel){
            const ta=topContours[ringIndex][i-1],tb=topContours[ringIndex][i%(ring.length-1)],j=positions.length/3;
            add(a[0],a[1],top-bevel,color);add(b[0],b[1],top-bevel,color);add(tb.x,tb.y,top,color,new T.Vector2(...b));add(ta.x,ta.y,top,color,new T.Vector2(...a));
            if(rightFacing)indices.push(j,j+2,j+1,j,j+3,j+2);else indices.push(j,j+1,j+2,j,j+2,j+3);
          }
        }
      });
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setAttribute('curbReference',new T.Float32BufferAttribute(references,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
