import * as T from 'three';
import type {Settings,Vec2} from '../types';
import {roadPaint} from './road-geometry';

/** Stations follow the curb perimeter, including curves and both sides.
 * Retessellation samples that field on long caps without changing their shape. */
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
  const project=(x:number,z:number)=>{
    let nearest=Infinity,result={station:0,loop:0};
    for(const s of grid.get(key(x,z))??segments){if(s.length<1e-7)continue;
      const t=T.MathUtils.clamp(((x-s.a.x)*s.dx+(z-s.a.z)*s.dz)/(s.length*s.length),0,1),distance=(x-s.a.x-s.dx*t)**2+(z-s.a.z-s.dz*t)**2;
      if(distance<nearest){nearest=distance;result={station:s.station+t*s.length,loop:s.loop};}
    }return result;
  };
  const position=geometry.getAttribute('position'),reference=geometry.getAttribute('curbReference');
  const attributes=Object.entries(geometry.attributes).filter(([name])=>name!=='uv').map(([name,attribute])=>({name,size:attribute.itemSize,values:Array.from(attribute.array),normalized:attribute.normalized}));
  const positions=attributes.find(a=>a.name==='position')!,references=attributes.find(a=>a.name==='curbReference'),normals=attributes.find(a=>a.name==='normal');
  const stations=Array.from({length:position.count},(_,i)=>project(reference?reference.getX(i):position.getX(i),reference?reference.getY(i):position.getZ(i)));
  const original=geometry.index?Array.from(geometry.index.array):Array.from({length:position.count},(_,i)=>i),index:number[]=[],midpoints=new Map<string,number>(),splitEdges=new Set<string>();
  const pointKeys:string[]=[];
  const coordinateKey=(x:number,y:number,z:number)=>`${Math.round(x*1e5)},${Math.round(y*1e5)},${Math.round(z*1e5)}`;
  const pointKey=(i:number)=>pointKeys[i]??(pointKeys[i]=coordinateKey(positions.values[i*3],positions.values[i*3+1],positions.values[i*3+2]));
  const edgeKey=(a:number,b:number)=>{const x=pointKey(a),y=pointKey(b);return x<y?`${x}:${y}`:`${y}:${x}`;};
  const distance=(a:number,b:number)=>[0,1,2].reduce((sum,k)=>sum+(positions.values[a*3+k]-positions.values[b*3+k])**2,0);
  const midpoint=(a:number,b:number)=>{
    const key=a<b?`${a}:${b}`:`${b}:${a}`;let i=midpoints.get(key);if(i!==undefined)return i;
    i=stations.length;midpoints.set(key,i);
    for(const attribute of attributes){const values=Array.from({length:attribute.size},(_,k)=>(attribute.values[a*attribute.size+k]+attribute.values[b*attribute.size+k])/2);
      if(attribute.name==='normal'){const length=Math.hypot(...values)||1;values.forEach((v,k)=>values[k]=v/length);}attribute.values.push(...values);
    }
    stations.push(project(references?references.values[i*2]:positions.values[i*3],references?references.values[i*2+1]:positions.values[i*3+2]));return i;
  };
  const interpolationError=(vertices:number[])=>{
    const base=stations[vertices[0]],length=lengths[base.loop];let x=0,z=0,expected=0;
    for(const i of vertices){const s=stations[i];if(s.loop!==base.loop)return Infinity;
      x+=references?references.values[i*2]:positions.values[i*3];z+=references?references.values[i*2+1]:positions.values[i*3+2];
      expected+=s.station+Math.round((base.station-s.station)/length)*length;
    }
    const actual=project(x/vertices.length,z/vertices.length);if(actual.loop!==base.loop)return Infinity;
    const delta=actual.station-expected/vertices.length;return Math.abs(delta-Math.round(delta/length)*length);
  };
  const split=(a:number,b:number,c:number)=>{
    const lengths=[distance(a,b),distance(b,c),distance(c,a)],longest=Math.max(...lengths);
    // Huge top-cap triangles otherwise interpolate corner stations over tens
    // of metres. Split only where that interpolation misses the real station
    // field; long straight walls and hidden bases need no extra triangles.
    const bottom=normals&&[a,b,c].every(i=>normals.values[i*3+1]<-.99);
    if(bottom||longest<=.35**2||Math.max(interpolationError([a,b]),interpolationError([b,c]),interpolationError([c,a]),interpolationError([a,b,c]))<=.002){index.push(a,b,c);return;}
    const edge=lengths.indexOf(longest),v=[a,b,c],x=v[edge],y=v[(edge+1)%3],z=v[(edge+2)%3],m=midpoint(x,y);
    splitEdges.add(edgeKey(x,y));
    split(x,m,z);split(m,y,z);
  };
  for(let i=0;i<original.length;i+=3)split(original[i],original[i+1],original[i+2]);
  // Adaptive refinement must agree on both sides of an edge, including the
  // duplicated vertices at a hard top/bevel/wall normal. Otherwise one side
  // samples the station field at a midpoint while its neighbour interpolates
  // past it, leaving a small colour crack that shimmers as the camera moves.
  const refined=index.splice(0);
  const conform=(a:number,b:number,c:number)=>{
    const vertices=[a,b,c];
    for(let edge=0;edge<3;edge++){
      const x=vertices[edge],y=vertices[(edge+1)%3],z=vertices[(edge+2)%3];
      if(distance(x,y)<1e-8)continue;
      if(!splitEdges.has(edgeKey(x,y)))continue;
      const m=midpoint(x,y);conform(x,m,z);conform(m,y,z);return;
    }
    index.push(a,b,c);
  };
  for(let i=0;i<refined.length;i+=3)conform(refined[i],refined[i+1],refined[i+2]);
  // Close every loop on a whole repeat so its duplicated seam vertices agree
  // in colour, even when the perimeter is not a multiple of 1.4 metres.
  const periods=lengths.map(length=>length/Math.max(1,Math.round(length/(roadPaint.curbStripe*2))));
  const uv=stations.flatMap(s=>[s.station/periods[s.loop],.5]),duplicates=new Map<number,number>();
  for(let i=0;i<index.length;i+=3){const triangle=index.slice(i,i+3),sample=triangle.map(j=>stations[j]),length=lengths[sample[0].loop];
    if(!sample.every(s=>s.loop===sample[0].loop)||Math.max(...sample.map(s=>s.station))-Math.min(...sample.map(s=>s.station))<=length/2)continue;
    for(let corner=0;corner<3;corner++){const original=triangle[corner];if(stations[original].station>=length/2)continue;
      let duplicate=duplicates.get(original);
      if(duplicate===undefined){duplicate=uv.length/2;duplicates.set(original,duplicate);
        for(const a of attributes)a.values.push(...a.values.slice(original*a.size,(original+1)*a.size));
        uv.push((stations[original].station+length)/periods[stations[original].loop],.5);
      }index[i+corner]=duplicate;
    }
  }
  for(const a of attributes)geometry.setAttribute(a.name,new T.Float32BufferAttribute(a.values,a.size,a.normalized));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(index);
}

const black=new T.Color(0x242923).toArray().map(v=>v.toFixed(8)).join(','),yellow=new T.Color(0xf0ce45).toArray().map(v=>v.toFixed(8)).join(',');
/** Integrate the periodic paint over a pixel footprint. Unlike a hard texture
 * sample this remains stable when stripes become subpixel at a grazing angle. */
function filteredStripes(material:T.MeshStandardMaterial){
  material.onBeforeCompile=shader=>{
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_pars_fragment>',`#include <map_pars_fragment>
      float curbYellowIntegral(float u){return floor(u)*0.5+max(fract(u)-0.5,0.0);}`);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      float curbWidth=max(fwidth(vMapUv.x),0.00001);
      float curbPhase=fract(vMapUv.x);
      float curbYellow=clamp((curbYellowIntegral(curbPhase+curbWidth*0.5)-curbYellowIntegral(curbPhase-curbWidth*0.5))/curbWidth,0.0,1.0);
      diffuseColor.rgb*=mix(vec3(${black}),vec3(${yellow}),curbYellow);
      #endif`);
  };
  material.customProgramCacheKey=()=>'curb-filtered-stripes-v1';
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
    for(const mesh of meshes){if(!mesh.geometry.userData.curbStripeUvs)curbStripeUvs(mesh.geometry,loops);mesh.userData.preserveMesh=true;
      // Keep other objects that share the original material unchanged.
      const material=mesh.material.clone();mesh.material=material;
      filteredStripes(material);
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
