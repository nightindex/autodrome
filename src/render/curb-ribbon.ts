import * as T from 'three';
import type {BoundarySection} from './road-geometry';
import {roadPaint} from './road-geometry';
import {hillHeight} from '../data/course';

type Vertex={x:number;y:number;z:number;u:number};
export type CurbCutout={minX:number;maxX:number;minZ:number;maxZ:number};
const names=['course-curbs','intersection-curbs','departure-curbs'] as const;
const pointKey=(p:Vertex)=>[p.x,p.y,p.z].map(v=>Math.round(v*1e5)).join(',');
const lerp=(a:Vertex,b:Vertex,t:number):Vertex=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t,u:a.u+(b.u-a.u)*t});

/** A continuous swept cross-section. Every surface shares the same perimeter
 * station; colour boundaries cannot jump between independently projected caps,
 * bevels and walls. Region names partition faces without adding internal ends. */
export function curbRibbonGeometries(sections:BoundarySection[],cutout?:CurbCutout|readonly CurbCutout[]){
  const cutouts:readonly CurbCutout[]=cutout?(Array.isArray(cutout)?cutout:[cutout as CurbCutout]):[];
  const buffers=names.map(()=>({position:[] as number[],color:[] as number[],uv:[] as number[],index:[] as number[]}));
  const topColor=new T.Color(0xe4e2d6),sideColor=new T.Color(0xa9ada5),lengths=new Map<number,number>(),travel=new Map<number,number>();
  for(const s of sections)lengths.set(s.loop,(lengths.get(s.loop)??0)+s.length);
  const region=(x:number,z:number)=>x>=-16&&x<=16&&z>=-18&&z<=13?1:x>=-1.5&&x<=63&&z>=.5&&z<=46?2:0;
  const emit=(polygon:Vertex[],color:T.Color,normal?:T.Vector3)=>{
    if(polygon.length<3)return;
    const center=polygon.reduce((p,v)=>({x:p.x+v.x/polygon.length,z:p.z+v.z/polygon.length}),{x:0,z:0}),buffer=buffers[region(center.x,center.z)],base=buffer.position.length/3;
    for(const p of polygon){buffer.position.push(p.x,hillHeight(p.x,p.z)+p.y,p.z);buffer.uv.push(p.u,.5);buffer.color.push(color.r,color.g,color.b);}
    for(let i=1;i+1<polygon.length;i++){
      const a=new T.Vector3(polygon[i].x-polygon[0].x,polygon[i].y-polygon[0].y,polygon[i].z-polygon[0].z),b=new T.Vector3(polygon[i+1].x-polygon[0].x,polygon[i+1].y-polygon[0].y,polygon[i+1].z-polygon[0].z),cross=a.cross(b);
      if(cross.lengthSq()<1e-18)continue;
      if(normal&&cross.dot(normal)<0)buffer.index.push(base,base+i+1,base+i);else buffer.index.push(base,base+i,base+i+1);
    }
  };
  const planes=cutouts.flatMap(cutout=>[
    {axis:'x' as const,value:cutout.minX,normal:new T.Vector3(1,0,0)},
    {axis:'x' as const,value:cutout.maxX,normal:new T.Vector3(-1,0,0)},
    {axis:'z' as const,value:cutout.minZ,normal:new T.Vector3(0,0,1)},
    {axis:'z' as const,value:cutout.maxZ,normal:new T.Vector3(0,0,-1)},
  ]).filter((plane,index,list)=>list.findIndex(p=>p.axis===plane.axis&&p.value===plane.value&&p.normal.equals(plane.normal))===index);
  const capEdges=planes.map(()=>new Map<string,[Vertex,Vertex]>());
  const inside=(p:{x:number;z:number},margin=0)=>cutouts.some(cutout=>p.x>=cutout.minX-margin&&p.x<=cutout.maxX+margin&&p.z>=cutout.minZ-margin&&p.z<=cutout.maxZ+margin);
  const split=(polygon:Vertex[],axis:'x'|'z',value:number)=>{
    if(polygon.every(p=>p[axis]<=value+1e-9)||polygon.every(p=>p[axis]>=value-1e-9))return [polygon];
    const halves:[Vertex[],Vertex[]]=[[],[]];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],d=a[axis]-value,e=b[axis]-value;
      if(d<=1e-9)halves[0].push(a);if(d>=-1e-9)halves[1].push(a);
      if(d*e<0){const p=lerp(a,b,-d/(e-d));p[axis]=value;halves[0].push(p);halves[1].push(p);}
    }return halves.filter(p=>p.length>=3);
  };
  const face=(polygon:Vertex[],color:T.Color)=>{
    let pieces=[polygon];
    if(cutouts.some(cutout=>!(polygon.every(p=>p.x<cutout.minX)||polygon.every(p=>p.x>cutout.maxX)||polygon.every(p=>p.z<cutout.minZ)||polygon.every(p=>p.z>cutout.maxZ)))){
      for(const plane of planes)pieces=pieces.flatMap(p=>split(p,plane.axis,plane.value));
    }
    for(const piece of pieces){
      const center=piece.reduce((p,v)=>({x:p.x+v.x/piece.length,z:p.z+v.z/piece.length}),{x:0,z:0});if(inside(center))continue;
      emit(piece,color);
      for(let k=0;k<planes.length;k++){const plane=planes[k];
        for(let i=0;i<piece.length;i++){const a=piece[i],b=piece[(i+1)%piece.length];
          if(Math.abs(a[plane.axis]-plane.value)>1e-7||Math.abs(b[plane.axis]-plane.value)>1e-7||!inside(lerp(a,b,.5),1e-7))continue;
          const ka=pointKey(a),kb=pointKey(b);if(ka===kb)continue;
          const key=ka<kb?ka+':'+kb:kb+':'+ka,edges=capEdges[k];if(edges.has(key))edges.delete(key);else edges.set(key,[a,b]);
        }
      }
    }
  };
  const source=(inner:{x:number;z:number},outer:{x:number;z:number})=>({x:inner.x-(outer.x-inner.x)*.025/.24,z:inner.z-(outer.z-inner.z)*.025/.24});
  const tangent=(a:{x:number;z:number},b:{x:number;z:number})=>{const dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz)||1;return {x:dx/length,z:dz/length};};
  const bases=sections.map(s=>({a:s.sourceA??source(s.a,s.outerA),b:s.sourceB??source(s.b,s.outerB)}));
  const groups=new Map<number,number[]>();sections.forEach((s,i)=>{const list=groups.get(s.loop)??[];list.push(i);groups.set(s.loop,list);});
  const neighbours=new Map<number,{before:number;after:number}>();for(const list of groups.values())list.forEach((v,i)=>neighbours.set(v,{before:list[(i-1+list.length)%list.length],after:list[(i+1)%list.length]}));
  for(let index=0;index<sections.length;index++){
    const s=sections[index],base=bases[index],adjacent=neighbours.get(index)!,along=tangent(base.a,base.b);
    const average=(a:{x:number;z:number},b:{x:number;z:number})=>{const length=Math.hypot(a.x+b.x,a.z+b.z)||1;return {x:(a.x+b.x)/length,z:(a.z+b.z)/length};};
    const atA=average(tangent(bases[adjacent.before].a,base.a),along),atB=average(along,tangent(base.b,bases[adjacent.after].b));
    const length=lengths.get(s.loop)!,period=length/Math.max(1,Math.round(length/(roadPaint.curbStripe*2))),start=travel.get(s.loop)??0;travel.set(s.loop,start+s.length);
    const section=(inner:{x:number;z:number},outer:{x:number;z:number},station:number,origin:{x:number;z:number},direction:{x:number;z:number})=>{
      const width=Math.hypot(outer.x-inner.x,outer.z-inner.z),t=.02/width;
      // Remove tangential miter displacement. Otherwise a long straight span
      // shears its paint across the curb width towards the next corner.
      const p=(x:number,z:number,y:number):Vertex=>({x,y,z,u:(station+(x-origin.x)*direction.x+(z-origin.z)*direction.z)/period});
      return [p(inner.x,inner.z,roadPaint.curbBase),p(inner.x,inner.z,.18),p(inner.x+(outer.x-inner.x)*t,inner.z+(outer.z-inner.z)*t,.2),p(outer.x+(inner.x-outer.x)*t,outer.z+(inner.z-outer.z)*t,.2),p(outer.x,outer.z,.18),p(outer.x,outer.z,roadPaint.curbBase)];
    };
    const a=section(s.a,s.outerA,start,base.a,atA),b=section(s.b,s.outerB,start+s.length,base.b,atB);
    for(let i=0;i<a.length;i++){const j=(i+1)%a.length;face([a[i],b[i],b[j],a[j]],i>=1&&i<=3?topColor:sideColor);}
  }
  // The ramp replaces sections of concrete. Close each exposed cut using the
  // cross-section edges collected from its retained walls and bevels.
  for(let k=0;k<planes.length;k++){
    const edges=capEdges[k];
    while(edges.size){const [key,[first,last]]=edges.entries().next().value!;edges.delete(key);const ring=[first,last];let current=pointKey(last);
      while(current!==pointKey(first)){
        const next=[...edges].find(([,pair])=>pair.some(p=>pointKey(p)===current));if(!next)break;
        edges.delete(next[0]);const pair=next[1],p=pointKey(pair[0])===current?pair[1]:pair[0];ring.push(p);current=pointKey(p);
      }
      if(current!==pointKey(first))continue;ring.pop();emit(ring,sideColor,planes[k].normal);
    }
  }
  return Object.fromEntries(names.map((name,i)=>{
    const b=buffers[i],geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(b.position,3));geometry.setAttribute('color',new T.Float32BufferAttribute(b.color,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(b.uv,2));geometry.setIndex(b.index);geometry.computeVertexNormals();geometry.userData.curbStripeUvs=true;return [name,geometry];
  })) as Record<typeof names[number],T.BufferGeometry>;
}
