import * as T from 'three';
import type {VehiclePlateKind} from './vehicle-sign-artwork';

export type SignKind=keyof typeof signSpecifications;
export const signSpecifications={
  start:{width:1.2,height:.36,outline:'rectangle',designation:'START'},
  finish:{width:1.2,height:.36,outline:'rectangle',designation:'FINISH'},
  stop:{width:.7,height:.7,outline:'octagon',designation:'2.5'},
  speed20:{width:.7,height:.7,outline:'circle',designation:'3.24'},
  speed40:{width:.7,height:.7,outline:'circle',designation:'3.24'},
  minimum20:{width:.7,height:.7,outline:'circle',designation:'4.7'},
  yield:{width:.9,height:.7794,outline:'inverted-triangle',designation:'2.4'},
  parking:{width:.7,height:.7,outline:'square',designation:'5.15'},
  railway:{width:.7,height:.7,outline:'octagon',designation:'2.5 / 1.3.1'},
  railWarning:{width:.9,height:.7794,outline:'triangle',designation:'1.2'},
  railBars3:{width:.3,height:.6,outline:'rectangle',designation:'1.4.1'},
  railBars2:{width:.3,height:.6,outline:'rectangle',designation:'1.4.2'},
  railBars1:{width:.3,height:.6,outline:'rectangle',designation:'1.4.3'},
  pedestrian:{width:.7,height:.7,outline:'square',designation:'5.16.2'},
  ascent:{width:.9,height:.7794,outline:'triangle',designation:'1.14',gradePercent:12},
  descent:{width:.9,height:.7794,outline:'triangle',designation:'1.13',gradePercent:12},
  right:{width:.7,height:.7,outline:'circle',designation:'4.1.2'},
  left:{width:.7,height:.7,outline:'circle',designation:'4.1.3'},
  straight:{width:.7,height:.7,outline:'circle',designation:'4.1.1'},
  priority:{width:.7*Math.SQRT2,height:.7*Math.SQRT2,outline:'diamond',designation:'2.1'},
  stopPlate:{width:.7,height:.35,outline:'rectangle',designation:'5.33'},
  carPlate:{width:.7,height:.35,outline:'rectangle',designation:'7.4.3'},
  truckPlate:{width:.7,height:.35,outline:'rectangle',designation:'7.4.1'},
  busPlate:{width:.7,height:.35,outline:'rectangle',designation:'7.4.4'},
  parkingEndPlate:{width:.7,height:.35,outline:'rectangle',designation:'7.6.4'},
  winding:{width:.9,height:.7794,outline:'triangle',designation:'1.12.2',firstTurn:'left'},
  chevronLeft:{width:1.8,height:.34,outline:'rectangle',designation:'1.31.2'},
} as const;
// Rounded, equilateral metal blank. Normalize its bounds so artwork and plate
// share the same UV rectangle without stretching the warning triangle.
function roundedWarningShape(width:number,height:number){
  const vertices=[new T.Vector2(0,height/2),new T.Vector2(-width/2,-height/2),new T.Vector2(width/2,-height/2)],cut=width*.045,outline=new T.Shape();
  vertices.forEach((corner,i)=>{
    const before=corner.clone().add(vertices[(i+2)%3].clone().sub(corner).normalize().multiplyScalar(cut));
    const after=corner.clone().add(vertices[(i+1)%3].clone().sub(corner).normalize().multiplyScalar(cut));
    i?outline.lineTo(before.x,before.y):outline.moveTo(before.x,before.y);
    outline.quadraticCurveTo(corner.x,corner.y,after.x,after.y);
  });outline.closePath();
  const points=outline.getPoints(16),bounds=new T.Box2().setFromPoints(points),size=bounds.getSize(new T.Vector2()),center=bounds.getCenter(new T.Vector2());
  return new T.Shape(points.map(p=>new T.Vector2((p.x-center.x)*width/size.x,(p.y-center.y)*height/size.y)));
}
export function signShape(kind:SignKind):T.Shape{
  const spec=signSpecifications[kind],shape=new T.Shape(),w=spec.width,h=spec.height;
  const imageOutline=artworkOutlines.get(referenceSign[kind]??'');
  if(imageOutline)return new T.Shape(imageOutline.map(p=>new T.Vector2(p.x*w,p.y*h)));
  if(kind==='ascent'||kind==='descent'||kind==='winding'||kind==='railWarning')return roundedWarningShape(w,h);
  if(kind==='yield')return new T.Shape(roundedWarningShape(w,h).getPoints(16).map(p=>p.multiplyScalar(-1)));
  if(spec.outline==='diamond'){
    const vertices=[new T.Vector2(0,h/2),new T.Vector2(-w/2,0),new T.Vector2(0,-h/2),new T.Vector2(w/2,0)],cut=w*.04;
    vertices.forEach((corner,i)=>{const before=corner.clone().lerp(vertices[(i+3)%4],cut/corner.distanceTo(vertices[(i+3)%4])),after=corner.clone().lerp(vertices[(i+1)%4],cut/corner.distanceTo(vertices[(i+1)%4]));i?shape.lineTo(before.x,before.y):shape.moveTo(before.x,before.y);shape.quadraticCurveTo(corner.x,corner.y,after.x,after.y);});shape.closePath();
    const points=shape.getPoints(16),size=new T.Box2().setFromPoints(points).getSize(new T.Vector2());return new T.Shape(points.map(p=>new T.Vector2(p.x*w/size.x,p.y*h/size.y)));
  }
  if(spec.outline==='circle'){shape.absarc(0,0,w/2,0,Math.PI*2,false);return shape;}
  if(spec.outline==='square'||spec.outline==='rectangle'){
    const r=isRectangularPlate(kind)?.035:kind==='pedestrian'?.045:.025,x=-w/2,y=-h/2;shape.moveTo(x+r,y);shape.lineTo(x+w-r,y);shape.quadraticCurveTo(x+w,y,x+w,y+r);shape.lineTo(x+w,y+h-r);shape.quadraticCurveTo(x+w,y+h,x+w-r,y+h);shape.lineTo(x+r,y+h);shape.quadraticCurveTo(x,y+h,x,y+h-r);shape.lineTo(x,y+r);shape.quadraticCurveTo(x,y,x+r,y);return shape;
  }
  if(spec.outline==='octagon'){
    const radius=w/(2*Math.cos(Math.PI/8));for(let i=0;i<8;i++){const a=Math.PI/8+i*Math.PI/4;i?shape.lineTo(Math.cos(a)*radius,Math.sin(a)*radius):shape.moveTo(Math.cos(a)*radius,Math.sin(a)*radius);}shape.closePath();return shape;
  }
  const direction=spec.outline==='triangle'?1:-1;shape.moveTo(0,h/2*direction);shape.lineTo(-w/2,-h/2*direction);shape.lineTo(w/2,-h/2*direction);shape.closePath();return shape;
}
const textures=new Map<string,T.CanvasTexture>();
// Reference artwork supplied with the driving-theory catalogue. Each image is
// loaded before the world is built, so every static sign has its final face.
const referenceSignIds=['1.2','1.4.1','1.4.2','1.4.3','1.12.1','1.12.2','1.13','1.14','1.31.1','1.31.2','2.1','2.4','2.5','3.24','4.1.1','4.1.2','4.1.3','4.7','5.15','5.16.1','5.33','7.4.1','7.4.3','7.4.4','7.6.4'] as const;
const referenceArtwork=new Map<string,HTMLImageElement>();
const artworkOutlines=new Map<string,T.Vector2[]>();
const triangularArtwork=new Set(['1.2','1.12.1','1.12.2','1.13','1.14','2.4']);
/** Use the image's opaque silhouette for the metal blank and the film together.
 * A convex hull removes raster stair-steps without exposing the white padding
 * beyond the rounded corners of the reference artwork. */
function artworkOutline(image:HTMLImageElement):T.Vector2[]{
  const canvas=document.createElement('canvas'),w=canvas.width=image.naturalWidth,h=canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,w,h).data,points:T.Vector2[]=[];
  for(let y=0;y<h;y++){
    let first=0,last=w-1;
    while(first<w&&pixels[(y*w+first)*4+3]<128)first++;
    if(first===w)continue;
    while(last>=first&&pixels[(y*w+last)*4+3]<128)last--;
    points.push(new T.Vector2(first,y),new T.Vector2(last+1,y),new T.Vector2(first,y+1),new T.Vector2(last+1,y+1));
  }
  points.sort((a,b)=>a.x-b.x||a.y-b.y);
  const cross=(a:T.Vector2,b:T.Vector2,c:T.Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const half=(vertices:T.Vector2[])=>{
    const hull:T.Vector2[]=[];
    for(const p of vertices){while(hull.length>1&&cross(hull[hull.length-2],hull[hull.length-1],p)<=0)hull.pop();hull.push(p);}
    return hull.slice(0,-1);
  };
  return [...half(points),...half(points.slice().reverse())].map(p=>new T.Vector2(p.x/w-.5,.5-p.y/h));
}

export async function loadDirectionSignArtwork(){
  await Promise.all(referenceSignIds.map(async id=>{
    const image=new Image();image.src=`/assets/road-signs/reference/${id}.png`;
    await image.decode();referenceArtwork.set(id,image);
    if(triangularArtwork.has(id))artworkOutlines.set(id,artworkOutline(image));
  }));
}
const referenceSign:Partial<Record<SignKind,string>>={
  stop:'2.5',railway:'2.5',speed20:'3.24',speed40:'3.24',minimum20:'4.7',yield:'2.4',parking:'5.15',
  railWarning:'1.2',railBars3:'1.4.1',railBars2:'1.4.2',railBars1:'1.4.3',pedestrian:'5.16.1',
  ascent:'1.14',descent:'1.13',right:'4.1.2',left:'4.1.3',straight:'4.1.1',priority:'2.1',
  stopPlate:'5.33',carPlate:'7.4.3',truckPlate:'7.4.1',busPlate:'7.4.4',parkingEndPlate:'7.6.4',
  winding:'1.12.2',chevronLeft:'1.31.2',
};
const isVehiclePlate=(kind:SignKind):kind is VehiclePlateKind=>kind==='carPlate'||kind==='truckPlate'||kind==='busPlate';
const isRectangularPlate=(kind:SignKind)=>isVehiclePlate(kind)||kind==='stopPlate'||kind==='parkingEndPlate';
const signVariation=(kind:SignKind,mirror:boolean)=>kind==='winding'&&mirror?{designation:'1.12.1',firstTurn:'right'}:kind==='pedestrian'&&mirror?{designation:'5.16.1'}:kind==='chevronLeft'&&mirror?{designation:'1.31.1'}:{};
const supplementary=(kind:SignKind)=>isRectangularPlate(kind)||kind.startsWith('railBars');
const boardGap=(kind:SignKind)=>supplementary(kind)?.06:.12;
/** Heights are measured from the road to the LOWEST main sign's lower edge.
 * Supplementary plates may extend below it; full signs in a stack may not. */
export function signBoardLayout(kind:SignKind,lower:SignKind[]=[],options:{center?:number;bottom?:number}={}){
  let drop=0,mainDrop=0,previous=kind;
  for(const next of lower){drop+=signSpecifications[previous].height/2+boardGap(next)+signSpecifications[next].height/2;if(!supplementary(next))mainDrop=drop+(signSpecifications[next].height-signSpecifications[kind].height)/2;previous=next;}
  const center=options.center??(options.bottom??2)+signSpecifications[kind].height/2+mainDrop;
  const boards=[{kind,center}];let bottom=center-signSpecifications[kind].height/2;
  for(const next of lower){boards.push({kind:next,center:bottom-boardGap(next)-signSpecifications[next].height/2});bottom-=boardGap(next)+signSpecifications[next].height;}
  return boards;
}
export function signTexture(kind:SignKind,mirror=false){
  const key=`${kind}:${mirror}`;if(textures.has(key))return textures.get(key)!;
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=isRectangularPlate(kind)?256:512;const ctx=canvas.getContext('2d')!;ctx.scale(2,2);
  const id=kind==='winding'&&mirror?'1.12.1':kind==='chevronLeft'&&mirror?'1.31.1':referenceSign[kind];
  if(id){
    const image=referenceArtwork.get(id);
    if(!image)throw new Error(`Road sign artwork is not loaded: ${id}`);
    const width=256,height=isRectangularPlate(kind)?128:256;
    ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);
    // The catalogue supplies 5.16.1; the other crossing sign faces right.
    ctx.save();if(kind==='pedestrian'&&!mirror){ctx.translate(width,0);ctx.scale(-1,1);}
    ctx.drawImage(image,0,0,width,height);ctx.restore();
    if(kind==='speed20'||kind==='speed40'||kind==='minimum20'){
      // Keep the catalogue's border while replacing its example value of 50.
      ctx.fillStyle=kind==='minimum20'?'#0d69e1':'#fff';ctx.beginPath();ctx.arc(128,128,91,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=kind==='minimum20'?'#fff':'#111';ctx.font='700 116px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(kind==='speed40'?'40':'20',128,134,150);
    }
    const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;textures.set(key,texture);return texture;
  }
  // START and FINISH are course-specific boards rather than catalogue signs.
  ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#111';ctx.lineWidth=5;ctx.strokeRect(3,9,250,238);
  ctx.fillStyle='#111';ctx.font='500 190px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(kind==='start'?'START':'FINISH',128,137,228);
  const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;textures.set(key,texture);return texture;
}
const steel=new T.MeshStandardMaterial({color:0xa6adb0,metalness:.75,roughness:.5});
const hardware=new T.MeshStandardMaterial({color:0x798286,metalness:.8,roughness:.43});
const concrete=new T.MeshStandardMaterial({color:0xb2b3a6,roughness:.96});
let reflectiveGrain:T.CanvasTexture|undefined;
function signFilmGrain(){
  if(reflectiveGrain)return reflectiveGrain;
  const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d')!,data=ctx.createImageData(128,128);
  let seed=1421;for(let i=0;i<data.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const value=175+(seed>>>27);data.data[i]=data.data[i+1]=data.data[i+2]=value;data.data[i+3]=255;}
  ctx.putImageData(data,0,0);reflectiveGrain=new T.CanvasTexture(canvas);reflectiveGrain.wrapS=reflectiveGrain.wrapT=T.RepeatWrapping;reflectiveGrain.repeat.set(6,6);return reflectiveGrain;
}
export function createRoadSign(kind:SignKind,mirror=false,lowerSign?:SignKind|SignKind[],options:{center?:number;bottom?:number;post?:boolean;postBase?:number}={}):T.Group{
  const root=new T.Group(),spec=signSpecifications[kind],lower=lowerSign?(Array.isArray(lowerSign)?lowerSign:[lowerSign]):[],boards=signBoardLayout(kind,lower,options);
  const center=boards[0].center,crossCenter=center+spec.height/2+.6,postHeight=kind==='railway'?crossCenter+.3:center+.18,postBase=options.postBase??0;
  const mainBoards=boards.filter(b=>!supplementary(b.kind));
  root.name=`assembly-sign-${kind}`;root.userData={kind,...spec,...signVariation(kind,mirror),thickness:kind==='winding'?.001:.0022,mirrored:mirror,lowerMainEdge:Math.min(...(mainBoards.length?mainBoards:boards).map(b=>b.center-signSpecifications[b.kind].height/2)),heightDatum:'road-surface-to-lowest-main-board'};
  if(kind==='railway')root.userData.crossbuckCenter=crossCenter;
  const part=(geometry:T.BufferGeometry,material:T.Material,position:number[],rotation=[0,0,0],name='')=>{const m=new T.Mesh(geometry,material);m.name=name;m.position.fromArray(position);m.rotation.fromArray([...rotation,'XYZ'] as [number,number,number,T.EulerOrder]);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
  if(options.post!==false){
    // The board datum follows the road; a raised roadside post still reaches the ground.
    part(new T.CylinderGeometry(.03,.034,postHeight-postBase,12),steel,[0,(postHeight+postBase)/2,0]);
    part(new T.CylinderGeometry(.035,.035,.025,12),hardware,[0,postHeight+.008,0]);
    part(new T.CylinderGeometry(.095,.12,.12,12),concrete,[0,postBase+.04,0]);
  }
  const board=(kind:SignKind,center:number,mirror:boolean)=>{
  const spec=signSpecifications[kind],shape=signShape(kind),thinPlate=true,plateThickness=kind==='winding'?.001:.0022,faceZ=.055+plateThickness+.001;
  const body=new T.ExtrudeGeometry(shape,{depth:thinPlate?plateThickness:.022,bevelEnabled:true,bevelThickness:thinPlate?.0004:.001,bevelSize:thinPlate?.0004:.001,bevelSegments:2,steps:1,curveSegments:32});
  part(body,steel,[0,center,thinPlate ? .055 : .035],[0,0,0],`sign-${kind}-back`);
  if(thinPlate){
    const rim=signShape(kind),inner=signShape(kind).getPoints().map(p=>p.multiplyScalar(.98));rim.holes.push(new T.Path(inner));
    part(new T.ExtrudeGeometry(rim,{depth:.012,bevelEnabled:false,steps:1}),steel,[0,center,.044],[0,0,0],`sign-${kind}-folded-rim`);
  }
  const faceGeometry=new T.ShapeGeometry(shape,32),p=faceGeometry.getAttribute('position'),uv=faceGeometry.getAttribute('uv');
  for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/spec.width+.5,p.getY(i)/spec.height+.5);
  const film=thinPlate?new T.MeshPhysicalMaterial({map:signTexture(kind,mirror),roughness:.78,roughnessMap:signFilmGrain(),metalness:0,envMapIntensity:.08,ior:1.4,specularIntensity:.1,clearcoat:.01,clearcoatRoughness:.6,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}):new T.MeshStandardMaterial({map:signTexture(kind,mirror),roughness:.58,metalness:.03,emissive:0xffffff,emissiveIntensity:.025,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2});
  const face=part(faceGeometry,film,[0,center,faceZ],[0,0,0],`sign-${kind}-front`);face.userData={...root.userData,kind,...spec,...signVariation(kind,mirror),plateThickness,finish:'reflective-film',lowerEdge:center-spec.height/2,centerHeight:center,assemblyHeight:kind==='railway'?crossCenter+.3-(center-spec.height/2):spec.height};
  for(const y of [center-spec.height*.25,center+spec.height*.25]){
    const localY=(y-center)*(spec.outline==='inverted-triangle'?-1:1),mountWidth=spec.outline.includes('triangle')?Math.min(.31,spec.width*(.5-localY/spec.height)-.04):.31;
    part(new T.BoxGeometry(mountWidth,.035,.032),hardware,[0,y,thinPlate ? .038 : .018]);
    part(new T.TorusGeometry(.035,.006,6,12),hardware,[0,y,0],[Math.PI/2,0,0]);
    for(const x of [-mountWidth*.35,mountWidth*.35])part(new T.CylinderGeometry(.009,.009,.012,6),steel,[x,y,-.005],[Math.PI/2,0,0]);
  }
  for(const y of [center-spec.height*.35,center+spec.height*.35])part(new T.CylinderGeometry(.004,.004,.006,6),hardware,[0,y,faceZ+.002],[Math.PI/2,0,0]);
  };
  for(const [i,b]of boards.entries())board(b.kind,b.center,i===0&&mirror);
  if(kind==='railway'){
    const red=new T.MeshStandardMaterial({color:0xce221b,roughness:.6}),white=new T.MeshStandardMaterial({color:0xf4f3e9,roughness:.6});
    for(const angle of [-.43,.43]){part(new T.BoxGeometry(1.2,.13,.026),red,[0,crossCenter,.04],[0,0,angle],'railway-crossbuck');part(new T.BoxGeometry(1.16,.075,.012),white,[0,crossCenter,.06],[0,0,angle]);}
  }
  return root;
}
