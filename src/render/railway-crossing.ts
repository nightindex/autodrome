import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {railwayCrossing,railwayDeckProfiles,railwayRailCenters,railwayRailHeadProfile,railwayRailBodyProfile,railwaySleeperCenters,type RailwaySection} from '../data/railway';

/** Extrude the same transverse section that supports the physical tyres. */
export function railwaySectionGeometry(profile:RailwaySection,length:number){
  const shape=new T.Shape(profile.map(([z,y])=>new T.Vector2(-z,y)));
  const geometry=new T.ExtrudeGeometry(shape,{depth:length,steps:1,bevelEnabled:false,curveSegments:1});
  geometry.rotateY(Math.PI/2);geometry.translate(-length/2,0,0);
  return geometry;
}

function concreteGrain(){
  const size=64,pixels=new Uint8Array(size*size*4);let seed=431;
  for(let i=0;i<pixels.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const grey=220+(seed>>>27);pixels.set([grey,grey,grey,255],i);}
  const texture=new T.DataTexture(pixels,size,size,T.RGBAFormat);texture.wrapS=texture.wrapT=T.RepeatWrapping;
  texture.repeat.set(12,12);texture.magFilter=T.LinearFilter;texture.minFilter=T.LinearMipmapLinearFilter;texture.generateMipmaps=true;
  texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;texture.needsUpdate=true;return texture;
}

export function createRailwayCrossing(){
  const c=railwayCrossing,group=new T.Group();group.name='railway-crossing';group.position.set(c.center.x,0,c.center.z);
  group.userData={gauge:c.gauge,railTop:c.railTop,deckTop:c.deckTop,sleepers:railwaySleeperCenters.length,totalSleepers:railwaySleeperCenters.length,trackLength:c.length,deckPanels:6,referenceVideo:'uz_video.mp4',referenceFrames:[428,450,451,452]};
  const rust=new T.MeshStandardMaterial({color:0x604632,metalness:.65,roughness:.76});
  const polished=new T.MeshStandardMaterial({color:0xb3b7b3,metalness:.85,roughness:.34});
  const dark=new T.MeshStandardMaterial({color:0x242927,roughness:.98});
  const grain=concreteGrain();
  const board=new T.MeshStandardMaterial({color:0xffffff,vertexColors:true,map:grain,bumpMap:grain,bumpScale:.002,roughness:.97});
  const infill=new T.MeshStandardMaterial({color:0x41443e,map:grain,bumpMap:grain,bumpScale:.0025,roughness:1});
  const timber=new T.MeshStandardMaterial({color:0x544638,roughness:.95});
  const fastener=new T.MeshStandardMaterial({color:0x41433f,metalness:.65,roughness:.65});
  const add=(name:string,geometry:T.BufferGeometry,material:T.Material|T.Material[])=>{
    const mesh=new T.Mesh(geometry,material);mesh.name=name;mesh.userData.preserveMesh=true;mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);return mesh;
  };
  const box=(name:string,w:number,h:number,d:number,x:number,y:number,z:number,material:T.Material)=>{
    const mesh=add(name,new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);return mesh;
  };
  const railBottom=c.railTop-.172;
  // Full sleepers, baseplates, bolts and spring clips support the I-section
  // below the embedded road deck. They are not raised obstacles for cars.
  for(const [index,x]of railwaySleeperCenters.entries()){
    box(`railway-sleeper-${index}`,c.sleeperWidth,.14,2.6,x,railBottom-.084,0,timber);
    for(const z of railwayRailCenters){
      box('railway-baseplate',.24,.014,.22,x,railBottom-.007,z,fastener);
      for(const side of [-1,1]){
        const bolt=add('railway-bolt',new T.CylinderGeometry(.009,.009,.016,6),fastener);bolt.position.set(x+.075,railBottom+.026,z+side*.095);
        const clip=new T.CatmullRomCurve3([
          new T.Vector3(x-.06,railBottom+.018,z+side*.06),new T.Vector3(x-.065,railBottom+.038,z+side*.077),
          new T.Vector3(x-.055,railBottom+.028,z+side*.104),new T.Vector3(x-.045,railBottom+.012,z+side*.096),
        ]);
        add('railway-spring-clip',new T.TubeGeometry(clip,8,.005,6,false),fastener);
      }
    }
  }
  for(const [index,z]of railwayRailCenters.entries()){
    const head=railwaySectionGeometry(railwayRailHeadProfile,c.length);
    // Only the running crown and chamfers are polished. The vertical sides
    // and embedded web retain the darker oxidised steel seen in the video.
    head.clearGroups();const normals=head.getAttribute('normal'),positions=head.getAttribute('position');
    for(let i=0;i<positions.count;i+=3){
      const top=normals.getY(i)>.2&&Math.max(positions.getY(i),positions.getY(i+1),positions.getY(i+2))>c.railTop-.014;
      const materialIndex=top?1:0,last=head.groups.at(-1);
      if(last?.materialIndex===materialIndex)last.count+=3;else head.addGroup(i,3,materialIndex);
    }
    add(`railway-rail-head-${index}`,head,[rust,polished]).position.set(0,0,z);
    add(`railway-rail-web-${index}`,railwaySectionGeometry(railwayRailBodyProfile,c.length),rust).position.set(0,0,z);
    const innerFace=z-Math.sign(z)*c.headWidth/2;
    const groove=add(`railway-flangeway-${index}`,new T.BoxGeometry(c.length,.002,c.grooveWidth),dark);
    groove.position.set(0,.021,innerFace-Math.sign(z)*c.grooveWidth/2);
  }
  for(const [index,{profile}]of railwayDeckProfiles.entries()){
    // Six precast panels form a continuous crossing deck. Narrow construction
    // joints replace the old alternating pale boards and dark zebra-like gaps.
    const from=Math.min(...profile.map(p=>p[0])),to=Math.max(...profile.map(p=>p[0])),bevel=.003;
    const boardProfile:RailwaySection=[[from,-.07],[to,-.07],[to,c.deckTop-bevel],[to-bevel,c.deckTop],[from+bevel,c.deckTop],[from,c.deckTop-bevel]];
    const base=profile.map(([z,y])=>[z,y>0?y-.006:y]as const);
    add(`railway-infill-${index}`,railwaySectionGeometry(base,c.length),infill);
    const panels=6,pitch=c.length/panels;
    for(let i=0;i<panels;i++){
      const x=-c.length/2+(i+.5)*pitch;
      const geometry=railwaySectionGeometry(boardProfile,pitch-.008),position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');
      const color=new T.Color(0x87877b).multiplyScalar(1-(i%3)*.008),colors=[];
      for(let j=0;j<position.count;j++){const shade=normal.getY(j)>.5?1:.76;colors.push(color.r*shade,color.g*shade,color.b*shade);}
      geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
      add(`railway-board-${index}-${i}`,geometry,board).position.x=x;
    }
  }
  // Batch repetitive boards and buried fasteners; only the two railheads
  // retain separate crown/side materials for their running highlights.
  for(const [name,material]of [['deck-boards',board],['infill',infill],['sleepers',timber],['fasteners',fastener]]as const){
    const pieces=group.children.filter((node):node is T.Mesh=>node instanceof T.Mesh&&node.material===material);
    const geometries=pieces.map(mesh=>{mesh.updateMatrix();return mesh.geometry.clone().applyMatrix4(mesh.matrix);});
    const merged=mergeGeometries(geometries)!;geometries.forEach(g=>g.dispose());
    pieces.forEach(mesh=>{mesh.removeFromParent();mesh.geometry.dispose();});
    add(`railway-${name}`,merged,material);
  }
  return group;
}
