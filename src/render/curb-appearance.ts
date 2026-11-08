import * as T from 'three';
import type {Settings,Vec2} from '../types';
import {roadPaint} from './road-geometry';

/** Texture stations follow the curb perimeter, including curves and both sides.
 * Only duplicate UV seam vertices: the visible solids and collision shapes stay put. */
export function curbStripeUvs(geometry:T.BufferGeometry,loops:Vec2[][]){
  const segments=loops.flatMap((loop,id)=>{let station=0;return loop.map((a,i)=>{
    const b=loop[(i+1)%loop.length],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz),s={a,dx,dz,length,station,loop:id};station+=length;return s;
  });});
  const lengths=loops.map(loop=>loop.reduce((sum,p,i)=>sum+Math.hypot(p.x-loop[(i+1)%loop.length].x,p.z-loop[(i+1)%loop.length].z),0));
  const grid=new Map<string,typeof segments>(),cell=2,key=(x:number,z:number)=>`${Math.floor(x/cell)},${Math.floor(z/cell)}`;
  for(const s of segments){if(s.length<1e-7)continue;
    for(let x=Math.floor((Math.min(s.a.x,s.a.x+s.dx)-.6)/cell);x<=Math.floor((Math.max(s.a.x,s.a.x+s.dx)+.6)/cell);x++)
      for(let z=Math.floor((Math.min(s.a.z,s.a.z+s.dz)-.6)/cell);z<=Math.floor((Math.max(s.a.z,s.a.z+s.dz)+.6)/cell);z++){
        const k=`${x},${z}`,entries=grid.get(k)??[];entries.push(s);grid.set(k,entries);
      }
  }
  const position=geometry.getAttribute('position'),stations=Array.from({length:position.count},(_,i)=>{
    const x=position.getX(i),z=position.getZ(i);let nearest=Infinity,result={station:0,loop:0};
    for(const s of grid.get(key(x,z))??segments){if(s.length<1e-7)continue;
      const t=T.MathUtils.clamp(((x-s.a.x)*s.dx+(z-s.a.z)*s.dz)/(s.length*s.length),0,1),distance=(x-s.a.x-s.dx*t)**2+(z-s.a.z-s.dz*t)**2;
      if(distance<nearest){nearest=distance;result={station:s.station+t*s.length,loop:s.loop};}
    }return result;
  });
  const period=roadPaint.curbStripe*2,uv=stations.flatMap(s=>[s.station/period,.5]);
  const attributes=Object.entries(geometry.attributes).filter(([name])=>name!=='uv').map(([name,attribute])=>({name,size:attribute.itemSize,values:Array.from(attribute.array),normalized:attribute.normalized}));
  const index=geometry.index?Array.from(geometry.index.array):Array.from({length:position.count},(_,i)=>i),duplicates=new Map<number,number>();
  for(let i=0;i<index.length;i+=3){const triangle=index.slice(i,i+3),sample=triangle.map(j=>stations[j]),length=lengths[sample[0].loop];
    if(!sample.every(s=>s.loop===sample[0].loop)||Math.max(...sample.map(s=>s.station))-Math.min(...sample.map(s=>s.station))<=length/2)continue;
    for(let corner=0;corner<3;corner++){const original=triangle[corner];if(stations[original].station>=length/2)continue;
      let duplicate=duplicates.get(original);
      if(duplicate===undefined){duplicate=uv.length/2;duplicates.set(original,duplicate);
        for(const a of attributes)a.values.push(...a.values.slice(original*a.size,(original+1)*a.size));
        uv.push((stations[original].station+length)/period,.5);
      }index[i+corner]=duplicate;
    }
  }
  for(const a of attributes)geometry.setAttribute(a.name,new T.Float32BufferAttribute(a.values,a.size,a.normalized));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(index);
}

export class CurbAppearance {
  private style:Settings['curbStyle']|undefined;
  private texture:T.DataTexture;
  private entries:{material:T.MeshStandardMaterial;color:T.Color;vertexColors:boolean}[]=[];
  constructor(meshes:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>[],loops:Vec2[][]){
    const pixels=new Uint8Array(256*4);
    for(let x=0;x<256;x++)pixels.set(x<128?[36,41,35,255]:[240,206,69,255],x*4);
    this.texture=new T.DataTexture(pixels,256,1,T.RGBAFormat);this.texture.colorSpace=T.SRGBColorSpace;
    this.texture.wrapS=T.RepeatWrapping;this.texture.magFilter=T.LinearFilter;this.texture.minFilter=T.LinearMipmapLinearFilter;this.texture.generateMipmaps=true;this.texture.anisotropy=8;this.texture.needsUpdate=true;
    for(const mesh of meshes){curbStripeUvs(mesh.geometry,loops);mesh.userData.preserveMesh=true;
      // Keep other objects that share the original material unchanged.
      const material=mesh.material.clone();mesh.material=material;
      this.entries.push({material,color:material.color.clone(),vertexColors:material.vertexColors});
    }
  }
  setStyle(style:Settings['curbStyle']){
    if(this.style===style)return;this.style=style;
    for(const entry of this.entries){const striped=style==='yellow-black';entry.material.map=striped?this.texture:null;
      entry.material.color.copy(striped?new T.Color(0xffffff):entry.color);entry.material.vertexColors=striped?false:entry.vertexColors;entry.material.needsUpdate=true;
    }
  }
}
