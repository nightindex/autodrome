import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {pedestrianSignalAspects} from '../data/traffic-signals';
import {signalCapsuleGeometry,signalVisorGeometry} from './signal-geometry';

const charcoal=new T.MeshStandardMaterial({color:0x161a1c,roughness:.82,metalness:.08});
const border=new T.MeshStandardMaterial({color:0xe4e4d9,roughness:.72});
const steel=new T.MeshStandardMaterial({color:0x8d979c,roughness:.4,metalness:.78});
const hoodMaterial=new T.MeshStandardMaterial({color:0x101416,roughness:.86,side:T.DoubleSide});
const colors={red:0xff2416,green:0x13ff69};
const pictograms=new Map<'red'|'green',T.CanvasTexture>();

function pedestrianPictogram(color:'red'|'green'){
  if(pictograms.has(color))return pictograms.get(color)!;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
  const ctx=canvas.getContext('2d')!;ctx.fillStyle=ctx.strokeStyle='#fff';ctx.lineWidth=17;ctx.lineCap=ctx.lineJoin='round';
  const limb=(points:number[][])=>{ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();};
  if(color==='red'){
    ctx.beginPath();ctx.arc(128,55,14,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.roundRect(113,78,30,72,9);ctx.fill();
    limb([[109,89],[96,143]]);limb([[147,89],[160,143]]);limb([[120,141],[118,204]]);limb([[136,141],[138,204]]);
  }else{
    ctx.beginPath();ctx.arc(143,54,14,0,Math.PI*2);ctx.fill();
    limb([[132,86],[117,135]]);limb([[129,89],[106,112],[80,117]]);limb([[134,88],[155,110],[179,113]]);
    limb([[117,134],[143,162],[157,204]]);limb([[117,138],[97,170],[75,194]]);
  }
  // Dense LED rows remain legible as a human silhouette at driving distance.
  ctx.globalCompositeOperation='source-atop';ctx.fillStyle='rgba(0,0,0,.3)';
  for(let i=0;i<256;i+=8){ctx.fillRect(i,0,1,256);ctx.fillRect(0,i,256,1);}
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;pictograms.set(color,texture);return texture;
}
export class PedestrianTrafficLight {
  group=new T.Group();
  private lamps={} as Record<'red'|'green',{lens:T.MeshPhysicalMaterial;figure:T.MeshBasicMaterial}>;
  constructor(options:{post?:boolean;backplate?:boolean}={}){
    // Seat the shallow shell directly against the contrast panel. Keep the
    // lens, pictogram and full-length visor together on its new front plane.
    const housingDepth=.065,housingBack=-.075,faceOffset=housingBack+housingDepth-.12;
    this.group.name='pedestrian-traffic-light';this.group.userData={type:'pedestrian-signal',lensDiameter:.2,phase:'red',permitted:false};
    const batches=new Map<T.Material,T.BufferGeometry[]>();
    const part=(geometry:T.BufferGeometry,material:T.Material,x=0,y=0,z=0)=>{
      const prepared=geometry.index?geometry.toNonIndexed():geometry;if(prepared!==geometry)geometry.dispose();prepared.translate(x,y,z);
      const entries=batches.get(material)??[];entries.push(prepared);batches.set(material,entries);
    };
    if(options.post!==false){
      part(new T.CylinderGeometry(.035,.04,3.08,16),steel,0,1.54);
      part(new T.CylinderGeometry(.075,.1,.12,16),steel,0,.06);
    }
    if(options.backplate!==false){
      part(signalCapsuleGeometry(.35,.86,.012),border,0,2.62,-.08);
      part(signalCapsuleGeometry(.33,.84,.004),charcoal,0,2.62,-.071);
      part(signalCapsuleGeometry(.33,.84,.004),charcoal,0,2.62,-.089);
    }
    part(signalCapsuleGeometry(.29,.64,housingDepth,.005),charcoal,0,2.62,housingBack+housingDepth/2);
    part(signalCapsuleGeometry(.21,.48,.012,.003),charcoal,0,2.62,housingBack-.006);
    for(const y of [2.39,2.85]){
      part(new T.BoxGeometry(.1,.04,.09),steel,0,y,-.07);
      for(const x of [-.08,.08]){const bolt=new T.CylinderGeometry(.008,.008,.012,6);bolt.rotateX(Math.PI/2);part(bolt,steel,x,y,-.137);}
    }
    (['red','green'] as const).forEach((color,i)=>{
      const y=2.76-i*.28;
      part(new T.TorusGeometry(.109,.009,8,40),charcoal,0,y,.135+faceOffset);part(signalVisorGeometry(.119,.13+faceOffset,.265+faceOffset,.85),hoodMaterial,0,y);
      const lens=new T.MeshPhysicalMaterial({color:0x080c0d,roughness:.32,metalness:0,specularIntensity:.15,envMapIntensity:.08});
      const glass=new T.Mesh(new T.SphereGeometry(.1,32,16),lens);glass.scale.z=.25;glass.position.set(0,y,.145+faceOffset);glass.name=`pedestrian-${color}-lens`;glass.userData.preserveMesh=true;this.group.add(glass);
      const figure=new T.MeshBasicMaterial({map:pedestrianPictogram(color),color:0x16201b,transparent:true,alphaTest:.2,depthWrite:false,toneMapped:false});
      const symbol=new T.Mesh(new T.PlaneGeometry(.19,.19),figure);symbol.position.set(0,y,.173+faceOffset);symbol.name=`pedestrian-${color}-figure`;symbol.userData.preserveMesh=true;this.group.add(symbol);
      this.lamps[color]={lens,figure};
    });
    for(const [material,geometries]of batches){
      const mesh=new T.Mesh(mergeGeometries(geometries)!,material);geometries.forEach(g=>g.dispose());mesh.name='pedestrian-signal-hardware';mesh.userData.preserveMesh=true;mesh.castShadow=mesh.receiveShadow=true;this.group.add(mesh);
    }
    this.update(0);
  }
  update(time:number){
    const state=pedestrianSignalAspects(time);Object.assign(this.group.userData,{phase:state.phase,permitted:state.permitted});
    for(const color of ['red','green'] as const){
      const on=state[color],lamp=this.lamps[color];lamp.figure.color.setHex(on?colors[color]:0x16201b);lamp.lens.color.setHex(on?0x0d1411:0x080c0d);
    }
  }
}
