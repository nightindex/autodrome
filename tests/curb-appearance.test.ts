import {describe,expect,it} from 'vitest';
import * as T from 'three';
import {CurbAppearance,curbStripeUvs} from '../src/render/curb-appearance';
import {curbGeometry,boundaryPaintSurface,boundarySections} from '../src/render/road-geometry';
const loops=[[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}]];
describe('curb appearance',()=>{
  it('keeps the sampled colour field continuous across refined top, bevel and wall edges on curves',()=>{
    const loop=Array.from({length:12},(_,i)=>({x:20*Math.cos(i*Math.PI/6),z:10*Math.sin(i*Math.PI/6)}));
    const geometry=curbGeometry({black:[],yellow:boundaryPaintSurface(boundarySections([loop],-.025,-.265))},{height:.18,bevel:.02});
    const originalCount=geometry.index!.count;curbStripeUvs(geometry,[loop]);const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),normal=geometry.getAttribute('normal'),index=geometry.index!;
    const key=(x:number,y:number,z:number)=>[x,y,z].map(v=>Math.round(v*1e4)).join(','),points=new Map<string,number[]>();
    for(let i=0;i<p.count;i++){if(normal.getY(i)<-.99)continue;const k=key(p.getX(i),p.getY(i),p.getZ(i)),list=points.get(k)??[];list.push(i);points.set(k,list);}
    let error=0;
    for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){
      const a=index.getX(i+j),b=index.getX(i+(j+1)%3),x=(p.getX(a)+p.getX(b))/2,y=(p.getY(a)+p.getY(b))/2,z=(p.getZ(a)+p.getZ(b))/2;
      if(normal.getY(a)<-.99&&normal.getY(b)<-.99||Math.abs(uv.getX(a)-uv.getX(b))>1)continue;
      if(Math.hypot(p.getX(a)-p.getX(b),p.getY(a)-p.getY(b),p.getZ(a)-p.getZ(b))<.001)continue;
      for(const k of points.get(key(x,y,z))??[]){
        if(Math.hypot(p.getX(k)-x,p.getY(k)-y,p.getZ(k)-z)>1e-5)continue;
        const delta=uv.getX(k)-(uv.getX(a)+uv.getX(b))/2;error=Math.max(error,Math.abs(delta-Math.round(delta)));
      }
    }
    expect(index.count).toBeGreaterThan(originalCount);expect(error).toBeLessThan(.0001);geometry.dispose();
  });
  it('closes a non-integral perimeter with the same colour on both copies of the seam',()=>{
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([-.02,0,.04,-.02,.2,-.02,.04,.2,-.02],3));geometry.setIndex([0,1,2]);geometry.computeVertexNormals();
    curbStripeUvs(geometry,loops);const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),copies=[];
    for(let i=0;i<p.count;i++)if(Math.abs(p.getX(i)+.02)<1e-6&&Math.abs(p.getZ(i)+.02)<1e-6)copies.push(uv.getX(i));
    expect(copies.length).toBeGreaterThan(1);const delta=Math.max(...copies)-Math.min(...copies);
    expect(delta).toBeGreaterThan(1);expect(delta).toBeCloseTo(Math.round(delta),5);geometry.dispose();
  });
  it('keeps paint stations aligned across a bevel and samples long caps without moving their surface',()=>{
    const geometry=curbGeometry({black:[],yellow:[[[[0,-.265],[10,-.265],[10,-.025],[0,-.025],[0,-.265]]]]},{height:.18,bevel:.02});
    geometry.computeBoundingBox();const bounds=geometry.boundingBox!.clone();curbStripeUvs(geometry,loops);geometry.computeBoundingBox();
    expect(geometry.boundingBox!.min.distanceTo(bounds.min)).toBeLessThan(1e-6);expect(geometry.boundingBox!.max.distanceTo(bounds.max)).toBeLessThan(1e-6);
    const p=geometry.getAttribute('position'),uv=geometry.getAttribute('uv'),reference=geometry.getAttribute('curbReference'),groups=new Map<string,number[]>();
    for(let i=0;i<p.count;i++){const key=[reference.getX(i),reference.getY(i)].map(v=>Math.round(v*1e5)).join(','),group=groups.get(key)??[];group.push(i);groups.set(key,group);}
    let bevels=0;
    for(const group of groups.values())for(const i of group.slice(1)){
      const j=group[0],delta=uv.getX(i)-uv.getX(j);expect(delta-Math.round(delta)).toBeCloseTo(0,4);
      if(Math.hypot(p.getX(i)-p.getX(j),p.getZ(i)-p.getZ(j))>.01)bevels++;
    }
    expect(bevels).toBeGreaterThan(4);
    const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.updateMatrixWorld();
    for(const x of [.4,3.7,8.3])for(const z of [-.23,-.145,-.05])expect(new T.Raycaster(new T.Vector3(x,1,z),new T.Vector3(0,-1,0)).intersectObject(mesh)[0]?.point.y).toBeCloseTo(.2,5);
    geometry.dispose();(mesh.material as T.Material).dispose();
  });
  it('keeps stripes continuous at the perimeter UV seam without moving the solid',()=>{
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute([-.02,0,.04,-.02,.2,-.02,.04,.2,-.02],3));geometry.setIndex([0,1,2]);geometry.computeVertexNormals();
    const vertices=(g:T.BufferGeometry)=>Array.from(g.index!.array,i=>new T.Vector3().fromBufferAttribute(g.getAttribute('position'),i).toArray());
    const before=vertices(geometry);curbStripeUvs(geometry,loops);expect(vertices(geometry)).toEqual(before);
    const uv=geometry.getAttribute('uv'),u=Array.from(geometry.index!.array,i=>uv.getX(i));
    expect(Math.max(...u)-Math.min(...u)).toBeLessThan(.1);geometry.dispose();
  });
  it('restores the white finish and changes appearance without replacing geometry or shared concrete materials',()=>{
    const geometry=new T.BoxGeometry(3,.18,.24).translate(5,.09,-.145),original=new T.MeshStandardMaterial({color:0xe4e2d6,vertexColors:true}),mesh=new T.Mesh(geometry,original);
    const appearance=new CurbAppearance([mesh],loops),position=geometry.getAttribute('position'),indices=Array.from(geometry.index!.array);
    appearance.setStyle('yellow-black');expect(mesh.material.map).toBeInstanceOf(T.DataTexture);expect(mesh.material.vertexColors).toBe(false);expect(original.map).toBeNull();
    appearance.setStyle('white');expect(mesh.material.map).toBeNull();expect(mesh.material.vertexColors).toBe(true);expect(mesh.material.color.getHex()).toBe(0xe4e2d6);
    appearance.setStyle('yellow-black');expect(mesh.geometry).toBe(geometry);expect(geometry.getAttribute('position')).toBe(position);expect(Array.from(geometry.index!.array)).toEqual(indices);
    mesh.material.map?.dispose();mesh.material.dispose();original.dispose();geometry.dispose();
  });
});
