import * as T from 'three';
import type { VehicleTelemetry } from '../types';

type Kind='headlight'|'fog'|'indicator'|'position';
interface Lamp { kind:Kind;side:'left'|'right';materials:Set<T.MeshStandardMaterial>;glow:T.Sprite;beam?:T.SpotLight;bulb?:T.Mesh }

/** Native optical sections, forward-only glows and shadow-free road beams. */
export class FrontLights {
  private lamps:Lamp[]=[];
  private lensColors=new Map<T.MeshStandardMaterial,T.Color>();
  constructor(model:T.Object3D,halo:T.Texture){
    const car=model.parent??model,sections=new Map<string,{kind:Kind;side:'left'|'right';bounds:T.Box3;materials:Set<T.MeshStandardMaterial>}>();
    model.updateWorldMatrix(true,true);const toCar=car.matrixWorld.clone().invert();
    model.traverse(node=>{
      if(!(node instanceof T.Mesh))return;
      const materials=Array.isArray(node.material)?node.material:[node.material];
      materials.forEach((material,index)=>{
        const match=/^COBALT_(HEADLIGHT|FOG|FRONT_INDICATOR)_(LEFT|RIGHT)$/.exec(material.name);
        if(!match||!(material instanceof T.MeshStandardMaterial))return;
        const kind:Kind=match[1]==='HEADLIGHT'?'headlight':match[1]==='FOG'?'fog':'indicator',side=match[2]==='LEFT'?'left':'right';
        const section=sections.get(material.name)??{kind,side,bounds:new T.Box3(),materials:new Set<T.MeshStandardMaterial>()};
        material.toneMapped=false;material.emissiveMap=null;material.emissiveIntensity=0;material.needsUpdate=true;section.materials.add(material);
        if(kind==='indicator')this.lensColors.set(material,material.color.clone());
        const geometry=node.geometry as T.BufferGeometry,p=geometry.getAttribute('position'),indices=geometry.index,matrix=toCar.clone().multiply(node.matrixWorld);
        const groups=materials.length>1?geometry.groups.filter(group=>group.materialIndex===index):[{start:0,count:indices?.count??p.count}];
        for(const group of groups)for(let i=group.start;i<group.start+group.count;i++)section.bounds.expandByPoint(new T.Vector3().fromBufferAttribute(p,indices?indices.getX(i):i).applyMatrix4(matrix));
        sections.set(material.name,section);
      });
    });
    const opticalSections=[...sections.values()].flatMap(section=>section.kind==='headlight'?[section,{...section,kind:'position' as const,materials:new Set<T.MeshStandardMaterial>()}]:[section]);
    for(const section of opticalSections){
      const {kind,side,bounds,materials}=section,position=bounds.getCenter(new T.Vector3());position.z=bounds.max.z+.025;
      if(kind==='position'){position.x+=Math.sign(position.x)*.06;position.y-=.03;}
      const glowMaterial=new T.SpriteMaterial({map:halo,color:kind==='indicator'?0xff9408:0xfff2d6,opacity:0,transparent:true,depthWrite:false,depthTest:true,blending:T.AdditiveBlending,toneMapped:false});
      const glow=new T.Sprite(glowMaterial);glow.name=`front-${kind}-${side}-glow`;glow.position.copy(position);glow.visible=false;glow.raycast=()=>{};
      glow.scale.set(kind==='headlight'?.30:kind==='fog'?.18:kind==='position'?.09:.32,kind==='headlight'?.23:kind==='fog'?.16:kind==='position'?.075:.10,1);
      const eye=new T.Vector3();
      glow.onBeforeRender=(_renderer,_scene,camera)=>{car.worldToLocal(camera.getWorldPosition(eye));eye.sub(glow.position);glowMaterial.opacity=(kind==='indicator'?.95:kind==='position'?.35:.6)*T.MathUtils.smoothstep(eye.z/Math.max(.001,eye.length()),.12,.65);};
      car.add(glow);const lamp:Lamp={kind,side,materials,glow};
      if(kind==='position'){
        const bulb=new T.Mesh(new T.SphereGeometry(.016,8,6),new T.MeshBasicMaterial({color:0xfff3d7,toneMapped:false}));
        bulb.name=`front-position-${side}-bulb`;bulb.position.copy(position);bulb.visible=false;car.add(bulb);lamp.bulb=bulb;
      }
      if(kind==='headlight'||kind==='fog'){
        const beam=new T.SpotLight(kind==='headlight'?0xfff4dd:0xffedc5,kind==='headlight'?240:24,kind==='headlight'?45:16,kind==='headlight'?.34:.68,.65,2);
        beam.name=`front-${kind}-${side}-beam`;beam.position.copy(position);beam.position.z=Math.max(position.z,kind==='headlight'?2.11:2.05);
        const target=new T.Object3D();target.name=`${beam.name}-target`;target.position.set(position.x,-.62,kind==='headlight'?24:10);beam.target=target;beam.visible=false;beam.castShadow=false;car.add(beam,target);lamp.beam=beam;
      }
      this.lamps.push(lamp);
    }
  }
  update(t:VehicleTelemetry,left:boolean,right:boolean){
    for(const lamp of this.lamps){
      const on=lamp.kind==='position'?t.positionLights:lamp.kind==='headlight'?t.headlights:lamp.kind==='fog'?t.ignition&&t.positionLights&&t.fogLights:lamp.side==='left'?left:right;
      const color=lamp.kind==='indicator'?0xff3b00:0xfff1cf;
      lamp.materials.forEach(material=>{
        material.emissive.set(color);material.emissiveIntensity=on?(lamp.kind==='indicator'?7:3.5):0;
        const unlit=this.lensColors.get(material);if(unlit){if(on)material.color.set(0xff9b16);else material.color.copy(unlit);}
      });
      lamp.glow.visible=on;if(lamp.beam)lamp.beam.visible=on;if(lamp.bulb)lamp.bulb.visible=on;
    }
  }
}
