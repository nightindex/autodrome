import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { hillBounds,hillHeight,hillProfile } from '../data/course';
import type { Vec2 } from '../types';
import { boundarySections,type BoundarySection } from './road-geometry';

// Visual estimate from uz_video.mp4 02:55–03:15; measured above the 2 cm
// asphalt render datum. Blend into the ordinary 18 cm kerb at each ramp foot.
export const hillKerbProfile={height:.6,footHeight:.18,transition:1.5,width:.4,base:-.22,asphalt:.02} as const;
export function hillKerbTop(x:number){
  const t=T.MathUtils.clamp(Math.min(x-hillProfile.start,hillProfile.end-x)/hillKerbProfile.transition,0,1),blend=t*t*(3-2*t);
  return hillKerbProfile.asphalt+hillKerbProfile.footHeight+(hillKerbProfile.height-hillKerbProfile.footHeight)*blend;
}

/** Shared collider data uses exactly the same profile as the pavement and edge structures. */
export function hillColliderData(){
  const positions:number[]=[],indices:number[]=[];
  for(let x=hillProfile.start;x<=hillProfile.end;x+=.5){
    positions.push(x,hillHeight(x,40.5),hillBounds.minZ,x,hillHeight(x,40.5),hillBounds.maxZ);
    const i=positions.length/3-2;if(i>=2)indices.push(i-2,i-1,i,i-1,i+1,i);
  }
  return {positions:new Float32Array(positions),indices:new Uint32Array(indices)};
}
export function hillEdgeSections(loops:Vec2[][]):BoundarySection[]{
  const lerp=(a:Vec2,b:Vec2,t:number)=>({x:a.x+(b.x-a.x)*t,z:a.z+(b.z-a.z)*t});
  const transitions=Array.from({length:16},(_,i)=>i*hillKerbProfile.transition/15).flatMap(d=>[hillProfile.start+d,hillProfile.end-d]);
  return boundarySections(loops,-.025,-.025-hillKerbProfile.width,.5).flatMap(s=>{
    const z=(s.a.z+s.b.z)/2,dx=s.b.x-s.a.x,dz=s.b.z-s.a.z;
    if(z<hillBounds.minZ||z>hillBounds.maxZ||Math.abs(dx)<Math.abs(dz)*2)return [];
    const u=(hillProfile.start-s.a.x)/dx,v=(hillProfile.end-s.a.x)/dx,t0=Math.max(0,Math.min(u,v)),t1=Math.min(1,Math.max(u,v));
    if(t1-t0<1e-7)return [];
    const cuts=[...new Set([t0,t1,...[...transitions,hillProfile.crestStart,hillProfile.crestEnd].map(x=>(x-s.a.x)/dx).filter(t=>t>t0&&t<t1)])].sort((a,b)=>a-b);
    return cuts.slice(1).map((end,i)=>{
      const a=lerp(s.a,s.b,cuts[i]),b=lerp(s.a,s.b,end),outerA=lerp(s.outerA,s.outerB,cuts[i]),outerB=lerp(s.outerA,s.outerB,end);
      // Both sides must cross each grade/height break at the same x station.
      outerA.x=a.x;outerB.x=b.x;
      return {...s,a,b,outerA,outerB};
    });
  });
}
export function createHillStructure(loops:Vec2[][]){
  const group=new T.Group();group.name='hill-structure';group.userData={...hillProfile,kerbHeight:hillKerbProfile.height,edgeFinish:'unpainted-concrete'};
  const concrete=new T.MeshStandardMaterial({color:0xbab5a3,roughness:.96}),deckMaterial=new T.MeshStandardMaterial({color:0x8e918d,roughness:.92});
  const positions:number[]=[],indices:number[]=[];
  const quad=(a:number[],b:number[],c:number[],d:number[])=>{const i=positions.length/3;positions.push(...a,...b,...c,...d);indices.push(i,i+1,i+2,i,i+2,i+3);};
  for(const s of hillEdgeSections(loops)){
    const at=(p:Vec2,h:number)=>[p.x,hillHeight(p.x,p.z)+h,p.z];
    const top=(p:Vec2)=>at(p,hillKerbTop(p.x)),bottom=(p:Vec2)=>at(p,hillKerbProfile.base);
    // Rendered walls and physical contact share this continuous raised profile.
    quad(top(s.a),top(s.b),top(s.outerB),top(s.outerA));
    quad(bottom(s.a),bottom(s.b),top(s.b),top(s.a));
    quad(bottom(s.outerB),bottom(s.outerA),top(s.outerA),top(s.outerB));
    if(Math.abs(s.a.x-hillProfile.start)<1e-6||Math.abs(s.a.x-hillProfile.end)<1e-6)quad(bottom(s.a),top(s.a),top(s.outerA),bottom(s.outerA));
    if(Math.abs(s.b.x-hillProfile.start)<1e-6||Math.abs(s.b.x-hillProfile.end)<1e-6)quad(bottom(s.b),bottom(s.outerB),top(s.outerB),top(s.b));
  }
  const edge=new T.BufferGeometry();edge.setAttribute('position',new T.Float32BufferAttribute(positions,3));edge.setIndex(indices);edge.computeVertexNormals();
  const add=(geometry:T.BufferGeometry,material:T.Material,name:string)=>{const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.preserveMesh=true;group.add(mesh);return mesh;};
  add(edge,concrete,'hill-concrete-edges');
  const slabs:T.BufferGeometry[]=[];
  for(const [a,b]of [[hillProfile.start,hillProfile.crestStart],[hillProfile.crestStart,hillProfile.crestEnd],[hillProfile.crestEnd,hillProfile.end]]){
    const shape=new T.Shape();shape.moveTo(a,hillHeight(a,40.5)-.025);shape.lineTo(b,hillHeight(b,40.5)-.025);shape.lineTo(b,hillHeight(b,40.5)-.26);shape.lineTo(a,hillHeight(a,40.5)-.26);shape.closePath();
    const slab=new T.ExtrudeGeometry(shape,{depth:hillProfile.deckMaxZ-hillProfile.deckMinZ,bevelEnabled:false,steps:1});slab.translate(0,0,hillProfile.deckMinZ);slabs.push(slab);
  }
  add(mergeGeometries(slabs)! ,deckMaterial,'hill-deck');
  const supports:T.BufferGeometry[]=[];
  const box=(w:number,h:number,d:number,x:number,y:number,z:number)=>{const g=new T.BoxGeometry(w,h,d);g.translate(x,y,z);supports.push(g);};
  for(const x of [7,11,15.5,20,24.5,28.5]){
    const top=hillHeight(x,40.5)-.26;if(top<.15)continue;
    for(const z of [37.7,43.3]){box(.48,top,.48,x,top/2,z);box(.8,.12,.8,x,.06,z);}
    box(.5,.2,7.4,x,top-.1,40.5);
  }
  add(mergeGeometries(supports)!,concrete,'hill-piers');
  return group;
}
