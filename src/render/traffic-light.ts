import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { signalAspects,type SignalAxis,type SignalColor } from '../data/traffic-signals';
import {signalCapsuleGeometry,signalVisorGeometry} from './signal-geometry';

const colors={red:0xff1608,amber:0xffb000,green:0x13ff69};
const charcoal=new T.MeshStandardMaterial({color:0x161a1c,roughness:.82,metalness:.08});
const edge=new T.MeshStandardMaterial({color:0xe4e4d9,roughness:.72});
const steel=new T.MeshStandardMaterial({color:0x8d979c,roughness:.4,metalness:.78});
const hoodMaterial=new T.MeshStandardMaterial({color:0x101416,roughness:.86,side:T.DoubleSide});

export class TrafficLight {
  group=new T.Group();
  private lamps={} as Record<SignalColor,{lens:T.MeshPhysicalMaterial;diodes:T.InstancedMesh}>;
  constructor(public axis:SignalAxis,options:{post?:boolean;backplate?:boolean}={}){
    // The reference has a shallow shell against the oval board; its visors
    // supply most of the depth. Seat the complete face on the thinner shell.
    const housingDepth=.075,housingBack=-.065,faceOffset=housingBack+housingDepth-.115;
    this.group.name=`traffic-light-${axis}`;this.group.userData={axis,phase:'red',lensDiameter:.224};
    const batches=new Map<T.Material,T.BufferGeometry[]>();
    const part=(geometry:T.BufferGeometry,material:T.Material,x=0,y=0,z=0)=>{
      const prepared=geometry.index?geometry.toNonIndexed():geometry;if(prepared!==geometry)geometry.dispose();
      prepared.translate(x,y,z);const list=batches.get(material)??[];list.push(prepared);batches.set(material,list);
    };
    if(options.post!==false){
      part(new T.CylinderGeometry(.036,.04,3.24,16),steel,0,1.62,-.09);
      part(new T.CylinderGeometry(.075,.09,.12,16),steel,0,.06,-.09);
      part(new T.CylinderGeometry(.041,.041,.025,16),charcoal,0,3.25,-.09);
    }
    if(options.backplate!==false){
      part(signalCapsuleGeometry(.43,1.46,.012),edge,0,2.68,-.06);
      part(signalCapsuleGeometry(.406,1.436,.004),charcoal,0,2.68,-.051);
      part(signalCapsuleGeometry(.406,1.436,.004),charcoal,0,2.68,-.069);
    }
    part(signalCapsuleGeometry(.32,1.075,housingDepth,.006),charcoal,0,2.68,housingBack+housingDepth/2);
    part(signalCapsuleGeometry(.23,.85,.012,.003),charcoal,0,2.68,-.071);
    for(const y of [2.27,3.09]){
      part(new T.BoxGeometry(.09,.055,.12),steel,0,y,-.16);
      for(const x of [-.1,.1]){const bolt=new T.CylinderGeometry(.008,.008,.012,6);bolt.rotateX(Math.PI/2);part(bolt,steel,x,y,-.16);}
    }
    (['red','amber','green']as const).forEach((color,i)=>{
      const y=3.01-i*.33;
      part(new T.TorusGeometry(.121,.01,8,40),charcoal,0,y,.13+faceOffset);
      part(signalVisorGeometry(.133,.125+faceOffset,.285+faceOffset),hoodMaterial,0,y);
      const lens=new T.MeshPhysicalMaterial({color:0x070b0c,emissive:colors[color],emissiveIntensity:0,roughness:.32,metalness:0,specularIntensity:.15,envMapIntensity:.1,toneMapped:false});
      const glass=new T.Mesh(new T.SphereGeometry(.112,32,16),lens);glass.scale.z=.28;glass.position.set(0,y,.14+faceOffset);glass.name=`signal-${color}-lens`;glass.userData.preserveMesh=true;this.group.add(glass);
      const points:T.Vector3[]=[];
      for(let x=-.09;x<=.091;x+=.018)for(let v=-.09;v<=.091;v+=.018)if(Math.hypot(x,v)<.098)points.push(new T.Vector3(x,y+v,.174+faceOffset));
      const diodes=new T.InstancedMesh(new T.SphereGeometry(.004,6,4),new T.MeshBasicMaterial({color:colors[color],toneMapped:false}),points.length);
      const matrix=new T.Matrix4();points.forEach((p,index)=>diodes.setMatrixAt(index,matrix.makeTranslation(p.x,p.y,p.z)));
      diodes.name=`signal-${color}-leds`;this.group.add(diodes);this.lamps[color]={lens,diodes};
    });
    for(const [material,geometries]of batches){
      const mesh=new T.Mesh(mergeGeometries(geometries)!,material);geometries.forEach(g=>g.dispose());mesh.name='traffic-light-hardware';mesh.userData.preserveMesh=true;mesh.castShadow=mesh.receiveShadow=true;this.group.add(mesh);
    }
    this.update(0);
  }
  update(time:number){
    const state=signalAspects(time,this.axis);this.group.userData.phase=state.phase;this.group.userData.permitted=state.permitted;
    for(const color of ['red','amber','green']as const){const on=state[color],lamp=this.lamps[color];lamp.lens.emissiveIntensity=on?.8:0;lamp.lens.color.setHex(on?0x030504:0x070b0c);lamp.diodes.visible=on;}
  }
}
