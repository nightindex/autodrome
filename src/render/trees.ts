import * as T from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Settings } from '../types';

const atlasPath='/assets/trees/foliage-atlas.png';
function randomSource(seed:number){return ()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};}
export function treePlacements(){
  const random=randomSource(71841);
  return Array.from({length:74},(_,i)=>({
    x:-72+(i%37)*4+(random()-.5)*.65,
    z:i<37?-51-Math.sin(i)*2:53+Math.cos(i)*2,
    scale:.88+random()*.24,yaw:random()*Math.PI*2,variant:i%3,
    tint:new T.Color().setHSL(.19+random()*.06,.06+random()*.09,.81+random()*.12),
  }));
}
/** Tapered, curved wood with rings following the branch's tangent. */
function branch(points:T.Vector3[],baseRadius:number,tipRadius:number,segments:number,radial=7){
  const curve=new T.CatmullRomCurve3(points),position:number[]=[],uv:number[]=[],indices:number[]=[];
  const helper=new T.Vector3(0,0,1);
  for(let i=0;i<=segments;i++){
    const t=i/segments,center=curve.getPoint(t),tangent=curve.getTangent(t).normalize();
    const side=new T.Vector3().crossVectors(tangent,helper).normalize(),up=new T.Vector3().crossVectors(side,tangent).normalize();
    const radius=baseRadius+(tipRadius-baseRadius)*Math.pow(t,.82);
    for(let j=0;j<=radial;j++){
      const a=j/radial*Math.PI*2,r=radius*(1+.07*Math.sin(j*2.7+i*.9));
      const p=center.clone().addScaledVector(side,Math.cos(a)*r).addScaledVector(up,Math.sin(a)*r);position.push(p.x,p.y,p.z);uv.push(j/radial,t*curve.getLength()/1.4);
      if(i<segments&&j<radial){const k=i*(radial+1)+j;indices.push(k,k+radial+1,k+1,k+1,k+radial+1,k+radial+2);}
    }
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(position,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
export function treePrototype(variant:number){
  const random=randomSource(4081+variant*117),wood:T.BufferGeometry[]=[],lean=(random()-.5)*.25;
  const centerY=variant===2?5.05:4.65,rx=variant===2?1.52:1.95,ry=variant===2?2.45:1.95,rz=variant===1?2.1:1.85;
  wood.push(branch([new T.Vector3(0,0,0),new T.Vector3(.03,1.7,.03),new T.Vector3(lean,3.2,.07),new T.Vector3(lean+.12,4.8,.03)],.19,.035,9,10));
  for(let i=0;i<7;i++){
    const angle=i*Math.PI*2/7+random()*.35,spread=.95+random()*.85,start=2.1+random()*.9;
    const end=new T.Vector3(Math.cos(angle)*spread,centerY+.15+random()*.9,Math.sin(angle)*spread);
    const middle=new T.Vector3(end.x*.5,start+.85,end.z*.5);
    wood.push(branch([new T.Vector3(lean*.4,start,.04),middle,end],.072+random()*.025,.014,4,6));
    if(i%2===0){const tip=end.clone().add(new T.Vector3(Math.sin(angle)*.42,.65,-Math.cos(angle)*.42));wood.push(branch([middle.clone(),end.clone().lerp(tip,.5),tip],.035,.008,3,5));}
  }
  for(let i=0;i<5;i++){const a=i*Math.PI*2/5;wood.push(branch([new T.Vector3(0,.24,0),new T.Vector3(Math.cos(a)*.23,.1,Math.sin(a)*.23),new T.Vector3(Math.cos(a)*.48,.025,Math.sin(a)*.48)],.095,.018,2,6));}
  const bark=mergeGeometries(wood)!;wood.forEach(g=>g.dispose());
  const cards:{positions:number[];normals:number[];uv:number[];colors:number[]}[]=[];
  for(let i=0;i<96;i++){
    const y=1-2*(i+.5)/96,angle=i*2.399963+variant*.7,r=Math.sqrt(1-y*y),shell=i%4===0?.42+random()*.28:.72+random()*.3;
    const radial=new T.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r);
    const lobe=1+.13*Math.sin(angle*3+variant)+.07*Math.cos(angle*5-y*4);
    const center=new T.Vector3(radial.x*rx*shell*lobe,centerY+radial.y*ry*shell,radial.z*rz*shell*lobe);
    center.add(new T.Vector3((random()-.5)*.45,(random()-.5)*.4,(random()-.5)*.45));
    // Upright sprays at the crown avoid flat horizontal layers of leaf cards.
    const normal=new T.Vector3(radial.x+(random()-.5)*.9,radial.y*.3+(random()-.5)*.7,radial.z+(random()-.5)*.9).normalize();
    const rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,0,1),normal).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),(random()-.5)*1.8));
    const width=1+random()*.6,height=width*(.92+random()*.25),tile=(i+variant)%4,card={positions:[] as number[],normals:[] as number[],uv:[] as number[],colors:[] as number[]};
    const shade=.8+random()*.2,color=new T.Color().setRGB(shade,shade,shade);
    for(let row=0;row<2;row++)for(let column=0;column<3;column++){
      const u=column/2,v=row,p=new T.Vector3((u-.5)*width,(v-.5)*height,column===1?width*.10:-width*.035).applyQuaternion(rotation).add(center);
      const n=new T.Vector3((u-.5)*.3,0,1).applyQuaternion(rotation).lerp(radial,.4).normalize();
      card.positions.push(p.x,p.y,p.z);card.normals.push(n.x,n.y,n.z);card.uv.push(((tile%2)+.03+u*.94)/2,(Math.floor(tile/2)+.03+v*.94)/2);card.colors.push(color.r,color.g,color.b);
    }
    cards.push(card);
  }
  const foliage=(quality:Settings['quality'])=>{
    const position:number[]=[],normal:number[]=[],uv:number[]=[],colors:number[]=[],indices:number[]=[];
    cards.forEach((card,i)=>{
      if(quality==='low'&&i%2!==0||quality==='medium'&&i%4===3)return;
      const base=position.length/3;position.push(...card.positions);normal.push(...card.normals);uv.push(...card.uv);colors.push(...card.colors);
      indices.push(base,base+1,base+3,base+1,base+4,base+3,base+1,base+2,base+4,base+2,base+5,base+4);
    });
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(position,3));g.setAttribute('normal',new T.Float32BufferAttribute(normal,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setAttribute('color',new T.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeBoundingSphere();return g;
  };
  return {bark,foliage:{low:foliage('low'),medium:foliage('medium'),high:foliage('high')}};
}
function barkTextures(){
  const width=128,height=512,random=randomSource(981),heights=new Float32Array(width*height),color=new Uint8Array(width*height*4),normals=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)heights[y*width+x]=.5+.18*Math.sin(x*.48+Math.sin(y*.014)*2)+.14*Math.sin(x*.19+Math.sin(y*.004)*3)+(random()-.5)*.13;
  const at=(x:number,y:number)=>heights[((y+height)%height)*width+(x+width)%width];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const h=at(x,y),i=(y*width+x)*4;color.set([70+h*58,61+h*48,46+h*42,255],i);
    const n=new T.Vector3((at(x-1,y)-at(x+1,y))*2,(at(x,y-1)-at(x,y+1))*2,1).normalize();normals.set([(n.x*.5+.5)*255,(n.y*.5+.5)*255,(n.z*.5+.5)*255,255],i);
  }
  const texture=(pixels:Uint8Array)=>{const t=new T.DataTexture(pixels,width,height);t.wrapS=t.wrapT=T.RepeatWrapping;t.minFilter=T.LinearMipmapLinearFilter;t.magFilter=T.LinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;return t;};
  const map=texture(color);map.colorSpace=T.SRGBColorSpace;return {map,normalMap:texture(normals)};
}
export class TreeStand{
  readonly ready:Promise<void>;
  group=new T.Group();
  private time={value:0};
  private leaves:{mesh:T.InstancedMesh;geometry:ReturnType<typeof treePrototype>['foliage']}[]=[];
  constructor(){
    let loaded:()=>void=()=>{};this.ready=new Promise<void>(resolve=>{loaded=resolve;});
    this.group.name='course-trees';this.group.userData={trees:74,variants:3,textureLoaded:false,quality:'medium'};
    const {map,normalMap}=barkTextures(),barkMaterial=new T.MeshStandardMaterial({map,normalMap,normalScale:new T.Vector2(.65,.65),roughness:.98});
    const atlas=new T.TextureLoader().load(atlasPath,()=>{this.group.userData.textureLoaded=true;loaded();},undefined,()=>{this.group.userData.textureError=atlasPath;loaded();});
    atlas.colorSpace=T.SRGBColorSpace;atlas.anisotropy=8;
    const leafMaterial=new T.MeshStandardMaterial({map:atlas,alphaTest:.5,alphaToCoverage:true,side:T.DoubleSide,vertexColors:true,roughness:.92,emissive:0xffffff,emissiveMap:atlas,emissiveIntensity:.065});
    leafMaterial.forceSinglePass=true;
    const depth=new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,map:atlas,alphaTest:.5,side:T.DoubleSide});
    for(const material of [leafMaterial,depth]){
      material.onBeforeCompile=shader=>{
        shader.uniforms.uTreeTime=this.time;
        shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform float uTreeTime;').replace('#include <begin_vertex>',`#include <begin_vertex>
          vec3 treeWorld=(instanceMatrix*vec4(position,1.0)).xyz;
          float sway=pow(clamp(position.y/7.0,0.0,1.0),2.0);
          transformed.x+=sin(uTreeTime*1.15+treeWorld.x*.24+treeWorld.z*.19+position.y*.9)*.035*sway;
          transformed.z+=cos(uTreeTime*.85+treeWorld.x*.17+treeWorld.z*.21)*.022*sway;`);
      };
      material.customProgramCacheKey=()=>`tree-sway-${material.type}-v1`;
    }
    const placements=treePlacements(),dummy=new T.Object3D();
    for(let variant=0;variant<3;variant++){
      const prototype=treePrototype(variant),trees=placements.filter(p=>p.variant===variant);
      const wood=new T.InstancedMesh(prototype.bark,barkMaterial,trees.length),foliage=new T.InstancedMesh(prototype.foliage.medium,leafMaterial,trees.length);
      wood.name=`tree-wood-${variant}`;foliage.name=`tree-foliage-${variant}`;
      trees.forEach((tree,i)=>{dummy.position.set(tree.x,0,tree.z);dummy.rotation.set(0,tree.yaw,0);dummy.scale.setScalar(tree.scale);dummy.updateMatrix();wood.setMatrixAt(i,dummy.matrix);foliage.setMatrixAt(i,dummy.matrix);foliage.setColorAt(i,tree.tint);});
      for(const mesh of [wood,foliage]){mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();this.group.add(mesh);}
      foliage.customDepthMaterial=depth;this.leaves.push({mesh:foliage,geometry:prototype.foliage});
    }
  }
  setQuality(quality:Settings['quality']){for(const leaf of this.leaves){leaf.mesh.geometry=leaf.geometry[quality];leaf.mesh.computeBoundingSphere();}this.group.userData.quality=quality;}
  update(time:number){this.time.value=time;}
}
