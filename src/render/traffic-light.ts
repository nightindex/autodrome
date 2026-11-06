import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { signalAspects,type SignalAxis,type SignalColor } from '../data/traffic-signals';

const colors={red:0xff1608,amber:0xffb000,green:0x13ff69};
const charcoal=new T.MeshStandardMaterial({color:0x161a1c,roughness:.82,metalness:.08});
const edge=new T.MeshStandardMaterial({color:0xe4e4d9,roughness:.72});
const steel=new T.MeshStandardMaterial({color:0x8d979c,roughness:.4,metalness:.78});
const hoodMaterial=new T.MeshStandardMaterial({color:0x101416,roughness:.86,side:T.DoubleSide});

function visor(){
  const positions:number[]=[],indices:number[]=[];
  for(let i=0;i<=36;i++){
    const a=(-35+i*250/36)*Math.PI/180;
    for(const z of [.125,.305])positions.push(Math.cos(a)*.133,Math.sin(a)*.133,z);
    if(i){const n=i*2;indices.push(n-2,n-1,n,n-1,n+1,n);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

export class TrafficLight {
  group=new T.Group();
  private lamps={} as Record<SignalColor,{lens:T.MeshPhysicalMaterial;diodes:T.InstancedMesh}>;
  constructor(public axis:SignalAxis){
    this.group.name=`traffic-light-${axis}`;this.group.userData={axis,phase:'red',lensDiameter:.224};
    const batches=new Map<T.Material,T.BufferGeometry[]>();
    const part=(geometry:T.BufferGeometry,material:T.Material,x=0,y=0,z=0)=>{
      const prepared=geometry.index?geometry.toNonIndexed():geometry;if(prepared!==geometry)geometry.dispose();
      prepared.translate(x,y,z);const list=batches.get(material)??[];list.push(prepared);batches.set(material,list);
    };
    part(new T.CylinderGeometry(.036,.04,3.24,16),steel,0,1.62,-.09);
    part(new T.CylinderGeometry(.075,.09,.12,16),steel,0,.06,-.09);
    part(new T.CylinderGeometry(.041,.041,.025,16),charcoal,0,3.25,-.09);
    part(new RoundedBoxGeometry(.49,1.24,.055,3,.065),edge,0,2.68,-.06);
    part(new RoundedBoxGeometry(.465,1.215,.065,3,.06),charcoal,0,2.68,-.025);
    part(new RoundedBoxGeometry(.345,1.075,.245,3,.045),charcoal,0,2.68,0);
    part(new RoundedBoxGeometry(.25,.84,.032,2,.025),charcoal,0,2.68,-.139);
    for(const y of [2.27,3.09]){
      part(new T.BoxGeometry(.09,.055,.12),steel,0,y,-.16);
      for(const x of [-.1,.1]){const bolt=new T.CylinderGeometry(.008,.008,.012,6);bolt.rotateX(Math.PI/2);part(bolt,steel,x,y,-.16);}
    }
    (['red','amber','green']as const).forEach((color,i)=>{
      const y=3.01-i*.33;
      part(new T.TorusGeometry(.121,.01,8,40),charcoal,0,y,.13);
      part(visor(),hoodMaterial,0,y);
      const lens=new T.MeshPhysicalMaterial({color:0x070b0c,emissive:colors[color],emissiveIntensity:0,roughness:.32,metalness:0,specularIntensity:.15,envMapIntensity:.1,toneMapped:false});
      const glass=new T.Mesh(new T.SphereGeometry(.112,32,16),lens);glass.scale.z=.28;glass.position.set(0,y,.14);glass.name=`signal-${color}-lens`;glass.userData.preserveMesh=true;this.group.add(glass);
      const points:T.Vector3[]=[];
      for(let x=-.09;x<=.091;x+=.018)for(let v=-.09;v<=.091;v+=.018)if(Math.hypot(x,v)<.098)points.push(new T.Vector3(x,y+v,.174));
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
