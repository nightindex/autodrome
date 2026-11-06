import * as T from 'three';
import type { VehicleTelemetry } from '../types';
import { ColumnControls } from './column-controls';
import { FrontLights } from './front-lights';

const digitSegments=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
/** Seven-segment numerals used by the original analogue/digital Cobalt cluster. */
function drawSpeed(ctx:CanvasRenderingContext2D,value:string,color:string){
  const w=48,h=92,t=7,gap=9,start=132-(value.length*(w+gap)-gap)/2;
  const segment=(points:number[][],x:number,y:number,lit:boolean)=>{
    ctx.fillStyle=lit?color:'#203c67';ctx.beginPath();points.forEach(([dx,dy],i)=>i?ctx.lineTo(x+dx,y+dy):ctx.moveTo(x+dx,y+dy));ctx.closePath();ctx.fill();
  };
  const horizontal=(y:number)=>[[t,y],[w-t,y],[w-t/2,y+t/2],[w-t,y+t],[t,y+t],[t/2,y+t/2]];
  const vertical=(x:number,y:number)=>[[x,y+t],[x+t/2,y+t/2],[x+t,y+t],[x+t,y+h/2-t],[x+t/2,y+h/2-t/2],[x,y+h/2-t]];
  const shapes=[horizontal(0),vertical(w-t,0),vertical(w-t,h/2),horizontal(h-t),vertical(0,h/2),vertical(0,0),horizontal(h/2-t/2)];
  [...value].forEach((digit,i)=>{
    shapes.forEach((points,j)=>segment(points,start+i*(w+gap),27,digitSegments[Number(digit)].includes('abcdefg'[j])));
  });
}

/** Model-authored lamp sections and instrument faces share the simulation's telemetry. */
export class CobaltVisuals{
  private materials=new Map<string,Set<T.MeshStandardMaterial>>();
  private lensColors=new Map<T.MeshStandardMaterial,T.Color>();
  private needle:T.Object3D|undefined;
  private lcd:T.CanvasTexture|undefined;
  private canvas=document.createElement('canvas');
  private lastDisplay='';
  private rearGlows:{sprite:T.Sprite;signal:'brake'|'high-stop'|'reverse'|'left'|'right'}[]=[];
  private columnControls:ColumnControls;
  private frontLights:FrontLights;
  constructor(model:T.Object3D){
    this.columnControls=new ColumnControls(model);
    this.canvas.width=320;this.canvas.height=192;
    const car=model.parent??model,lenses=new Map<string,{bounds:T.Box3;signal:'brake'|'high-stop'|'reverse'|'left'|'right'}>();
    model.updateWorldMatrix(true,true);
    const toCar=car.matrixWorld.clone().invert();
    model.traverse(node=>{
      if(node.name==='COBALT_TACH_NEEDLE')this.needle=node;
      if(!(node instanceof T.Mesh))return;
      const nodeMaterials=Array.isArray(node.material)?node.material:[node.material];
      for(const [materialIndex,material]of nodeMaterials.entries()){
        if(!(material instanceof T.MeshStandardMaterial))continue;
        const list=this.materials.get(material.name)??new Set();list.add(material);this.materials.set(material.name,list);
        // Preserve saturated red/amber light instead of ACES shifting bright red
        // towards orange. This affects only the authored signalling surfaces.
        if(/^COBALT_(BRAKE|HIGH_STOP|TAIL|REVERSE|INDICATOR)/.test(material.name)){material.toneMapped=false;material.needsUpdate=true;}
        if(material.name.startsWith('COBALT_INDICATOR'))this.lensColors.set(material,material.color.clone());
        if(node.name==='COBALT_HighStopLens'||node.name.includes('lanterna_glass')&&/^COBALT_(BRAKE|REVERSE|INDICATOR)/.test(material.name)){
          const positions=node.geometry.getAttribute('position'),indices=node.geometry.index,matrix=toCar.clone().multiply(node.matrixWorld);
          const groups=nodeMaterials.length>1?node.geometry.groups.filter((g:{materialIndex?:number})=>g.materialIndex===materialIndex):[{start:0,count:indices?.count??positions.count}];
          for(const group of groups)for(let i=group.start;i<group.start+group.count;i++){
            const p=new T.Vector3().fromBufferAttribute(positions,indices?indices.getX(i):i).applyMatrix4(matrix);
            const highStop=material.name==='COBALT_HIGH_STOP';
            if(!highStop&&(p.z>-1.8||Math.abs(p.x)<.45))continue;
            const signal=highStop?'high-stop':material.name==='COBALT_BRAKE'?'brake':material.name==='COBALT_REVERSE'?'reverse':material.name.endsWith('LEFT')?'left':'right',key=highStop?signal:`${signal}:${Math.sign(p.x)}`;
            const lens=lenses.get(key)??{bounds:new T.Box3(),signal};lens.bounds.expandByPoint(p);lenses.set(key,lens);
          }
        }
        if(material.name==='COBALT_DIGITAL_SPEED'){
          this.lcd??=new T.CanvasTexture(this.canvas);this.lcd.colorSpace=T.SRGBColorSpace;this.lcd.flipY=false;
          material.map=this.lcd;material.emissiveMap=this.lcd;material.emissive.set(0xffffff);material.needsUpdate=true;
        }
        if(['COBALT_TachometerFace','COBALT_FactoryRadio','COBALT_ClimateLabels'].includes(material.name)){
          material.emissiveMap=material.map;material.emissive.set(0xffffff);material.emissiveIntensity=0;material.needsUpdate=true;
        }
      }
    });
    const haloCanvas=document.createElement('canvas');haloCanvas.width=haloCanvas.height=128;
    const haloContext=haloCanvas.getContext('2d')!,gradient=haloContext.createRadialGradient(64,64,0,64,64,64);
    gradient.addColorStop(0,'rgba(255,255,255,.95)');gradient.addColorStop(.18,'rgba(255,255,255,.7)');gradient.addColorStop(.5,'rgba(255,255,255,.18)');gradient.addColorStop(1,'rgba(255,255,255,0)');
    haloContext.fillStyle=gradient;haloContext.fillRect(0,0,128,128);
    const halo=new T.CanvasTexture(haloCanvas);halo.colorSpace=T.SRGBColorSpace;
    this.frontLights=new FrontLights(model,halo);
    for(const {bounds,signal}of lenses.values()){
      const stop=signal==='brake'||signal==='high-stop';
      const material=new T.SpriteMaterial({map:halo,color:stop?0xff1005:signal==='reverse'?0xf4faff:0xff9308,transparent:true,opacity:0,blending:T.AdditiveBlending,depthTest:true,depthWrite:false,toneMapped:false});
      const sprite=new T.Sprite(material),p=bounds.getCenter(new T.Vector3());p.z=bounds.min.z-.025;
      sprite.raycast=()=>{}; // optical effect, never a physical or picking surface
      sprite.name=`rear-${signal}-glow`;sprite.position.copy(p);sprite.scale.set(signal==='high-stop'?.28:signal==='brake'?.48:.38,signal==='high-stop'?.065:signal==='brake'?.24:.17,1);sprite.visible=false;
      // Evaluate every camera pass, including mirrors. Halos only face rearward
      // observers and remain depth-tested against the car and scenery.
      const eye=new T.Vector3();
      sprite.onBeforeRender=(_renderer,_scene,camera)=>{
        car.worldToLocal(camera.getWorldPosition(eye));eye.sub(sprite.position);
        const rear=-eye.z/Math.max(.001,eye.length());material.opacity=(signal==='brake'?.6:.95)*T.MathUtils.smoothstep(rear,.1,.65);
      };
      car.add(sprite);this.rearGlows.push({sprite,signal});
    }
  }
  private lamp(name:string,color:number,intensity:number){
    this.materials.get(name)?.forEach(m=>{
      m.emissive.set(color);m.emissiveIntensity=intensity;
      const lens=this.lensColors.get(m);if(lens){if(intensity>0)m.color.set(0xff9b16);else m.color.copy(lens);}
    });
  }
  update(t:VehicleTelemetry,dt=1/60){
    this.columnControls.update(t.indicator,dt);
    const braking=t.brake>.05;
    this.lamp('COBALT_BRAKE',0xff0802,braking?6:t.engine?.045:.005);
    this.lamp('COBALT_HIGH_STOP',0xff0802,braking?6:0);
    this.lamp('COBALT_TAIL',0xe00612,t.positionLights ? .24 : .012);
    this.lamp('COBALT_REVERSE',0xf4faff,t.engine&&t.gear<0?5:0);
    const blink=Math.sin(t.time*9)>0;
    const left=blink&&(t.hazards||t.indicator==='left'),right=blink&&(t.hazards||t.indicator==='right');
    this.frontLights.update(t,left,right);
    this.lamp('COBALT_INDICATOR_LEFT',0xff3b00,left?7:0);
    this.lamp('COBALT_INDICATOR_RIGHT',0xff3b00,right?7:0);
    for(const {sprite,signal}of this.rearGlows)sprite.visible=signal==='brake'||signal==='high-stop'?braking:signal==='reverse'?t.engine&&t.gear<0:signal==='left'?left:right;
    this.materials.get('COBALT_DIGITAL_SPEED')?.forEach(m=>m.emissiveIntensity=t.engine?.6:.035);
    this.materials.get('COBALT_ControlBacklight')?.forEach(m=>{m.emissive.set(0x66bfff);m.emissiveIntensity=t.engine?.55:0;});
    for(const [name,intensity]of [['COBALT_TachometerFace',.3],['COBALT_FactoryRadio',.25],['COBALT_ClimateLabels',.12]]as const){
      this.materials.get(name)?.forEach(m=>m.emissiveIntensity=t.engine?intensity:0);
    }
    if(this.needle)this.needle.rotation.z=-2.269+Math.min(8000,t.rpm)/8000*4.538;
    const display=`${Math.round(t.speed*3.6)}:${t.gear}:${t.engine}`;
    if(display===this.lastDisplay||!this.lcd)return;this.lastDisplay=display;
    const ctx=this.canvas.getContext('2d')!;ctx.fillStyle=t.engine?'#123f9a':'#101c31';ctx.fillRect(0,0,320,192);
    const ink=t.engine?'#a9dcff':'#53667e';drawSpeed(ctx,t.engine?String(Math.round(t.speed*3.6)):'0',ink);
    ctx.fillStyle=ink;ctx.textAlign='right';ctx.font='21px Arial';ctx.fillText('km/h',194,151);ctx.font='16px Arial';ctx.fillText('0012 km',310,47);
    ctx.strokeStyle=ink;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(221,21);ctx.lineTo(221,129);ctx.lineTo(313,129);ctx.moveTo(229,61);ctx.lineTo(313,61);ctx.stroke();
    // The photographed cluster groups the speed beside the narrow temperature
    // gauge, with the small trip readout on the right and fuel along the base.
    for(let i=0;i<6;i++)ctx.fillRect(17,44+i*14,7+i*.5,10);
    ctx.textAlign='left';
    ctx.font='20px Arial';ctx.fillText('E',20,180);ctx.fillText('F',238,180);for(let i=0;i<7;i++)ctx.fillRect(49+i*24,165,16,12);
    this.lcd.needsUpdate=true;
  }
}
