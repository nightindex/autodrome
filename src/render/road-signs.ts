import * as T from 'three';
import {drawVehiclePlate,type VehiclePlateKind} from './vehicle-sign-artwork';
import {drawPedestrianSign,drawPrioritySign,drawStopLineSign} from './junction-sign-artwork';

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
  if(kind==='ascent'||kind==='winding'||kind==='railWarning')return roundedWarningShape(w,h);
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
  const red='#d91916',blue='#075caa',black='#181816',white='#fffef8';
  const polygon=(points:number[][],fill:string)=>{ctx.fillStyle=fill;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill();};
  const octagon=(inset:number,fill:string)=>{const r=(128-inset)/Math.cos(Math.PI/8);polygon(Array.from({length:8},(_,i)=>[128+Math.cos(Math.PI/8+i*Math.PI/4)*r,128+Math.sin(Math.PI/8+i*Math.PI/4)*r]),fill);};
  const circle=(radius:number,fill:string)=>{ctx.fillStyle=fill;ctx.beginPath();ctx.arc(128,128,radius,0,Math.PI*2);ctx.fill();};
  if(isVehiclePlate(kind)){
    drawVehiclePlate(ctx,kind,256,128);
  }else if(kind==='parkingEndPlate'){
    ctx.fillStyle=white;ctx.fillRect(0,0,256,128);ctx.strokeStyle=black;ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(3,3,250,122,9);ctx.stroke();
    polygon([[89,34],[100,19],[156,19],[167,34],[173,48],[173,88],[83,88],[83,48]],black);
    polygon([[102,26],[154,26],[162,47],[94,47]],white);ctx.fillStyle=white;ctx.fillRect(94,59,18,8);ctx.fillRect(144,59,18,8);ctx.fillStyle=black;ctx.fillRect(86,87,13,12);ctx.fillRect(157,87,13,12);
  }else if(kind.startsWith('railBars')){
    ctx.fillStyle=white;ctx.fillRect(0,0,256,256);ctx.strokeStyle=black;ctx.lineWidth=2;ctx.strokeRect(2,2,252,252);
    const count=kind==='railBars3'?3:kind==='railBars2'?2:1;
    for(let i=0;i<count;i++){const y=128+(i-(count-1)/2)*56;polygon([[6,y+42],[250,y-34],[250,y-13],[6,y+63]],red);}
  }else if(kind==='right'||kind==='left'||kind==='straight'){
    circle(128,white);circle(120,blue);
    if(kind==='straight')polygon([[116,256],[140,256],[140,95],[165,95],[128,28],[92,95],[116,95]],white);
    else{
      // The manufactured sign's stem meets the lower rim. Its inner bend is
      // rounded, while the outer elbow and arrowhead keep their broad shape.
      ctx.save();if(kind==='right'){ctx.translate(256,0);ctx.scale(-1,1);}
      ctx.fillStyle=white;const arrow=new Path2D('M91 95 L34 128 L91 161 V141 H108 Q132 141 132 160 V256 H157 V134 Q157 116 140 116 H91Z');ctx.fill(arrow);ctx.restore();
    }
  }else if(kind==='chevronLeft'){
    ctx.save();if(mirror){ctx.translate(256,0);ctx.scale(-1,1);}
    ctx.fillStyle=white;ctx.fillRect(0,0,256,256);
    ctx.strokeStyle='#b2b7b6';ctx.lineWidth=3;ctx.strokeRect(2,2,252,252);
    for(let x=-20;x<256;x+=64)polygon([[x+28,14],[x+68,14],[x+40,128],[x+68,242],[x+28,242],[x,128]],red);
    ctx.restore();
  }else if(kind==='priority'){
    drawPrioritySign(ctx,256,256);
  }else if(kind==='stopPlate'){
    drawStopLineSign(ctx,256,128);
  }else if(kind==='start'||kind==='finish'){
    ctx.fillStyle=white;ctx.fillRect(0,0,256,256);ctx.strokeStyle=black;ctx.lineWidth=5;ctx.strokeRect(3,9,250,238);
    ctx.fillStyle=black;ctx.font='500 190px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(kind==='start'?'START':'FINISH',128,137,228);
  }else if(kind==='stop'||kind==='railway'){
    octagon(0,white);octagon(8,red);ctx.fillStyle=white;ctx.font='700 104px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('STOP',128,132,226);
  }else if(kind==='speed20'||kind==='speed40'||kind==='minimum20'){
    const minimum=kind==='minimum20';circle(128,white);circle(124,minimum?blue:red);if(!minimum)circle(103,white);
    ctx.fillStyle=minimum?white:black;ctx.font='600 116px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(kind==='speed40'?'40':'20',128,135,139);
  }else if(kind==='ascent'||kind==='winding'||kind==='railWarning'){
    const triangle=(left:number,top:number,right:number,bottom:number,fill:string)=>{
      const points=roundedWarningShape(1,1).getPoints(),w=right-left,h=bottom-top;
      ctx.fillStyle=fill;ctx.beginPath();points.forEach((p,i)=>{const x=left+(p.x+.5)*w,y=top+(.5-p.y)*h;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fill();
    };
    triangle(0,0,256,256,'#fffefa');triangle(3,4,253,252,'#e51b22');triangle(28,35,228,232,'#fffefa');
    if(kind==='ascent'){
      polygon([[37,228],[182,155],[220,228]],'#101211');
      ctx.save();ctx.translate(136,174);ctx.rotate(-.47);ctx.fillStyle='#101211';ctx.font='700 54px Arial';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillText(`${signSpecifications.ascent.gradePercent}%`,0,0);ctx.restore();
    }else if(kind==='railWarning'){
      ctx.fillStyle=black;ctx.fillRect(84,175,87,26);ctx.fillRect(136,155,23,34);ctx.fillRect(92,156,10,26);ctx.fillRect(80,200,102,6);
      polygon([[78,203],[67,215],[179,215],[175,203]],black);
      for(const [x,y,r]of [[99,210,9],[126,210,9],[153,210,9],[94,145,8],[105,131,10],[121,116,12]]){ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
      ctx.fillStyle=white;ctx.fillRect(141,160,11,12);for(const x of [99,126,153]){ctx.beginPath();ctx.arc(x,210,4,0,Math.PI*2);ctx.fill();}
    }else{
      // 1.12.2: the lower stem enters a LEFT bend, then returns right.
      // Smooth S-shaped artwork, checked against Uzavtoyo'lbelgi's catalogue.
      ctx.save();ctx.scale(256/100,256/88);
      if(mirror){ctx.translate(100,0);ctx.scale(-1,1);}
      ctx.strokeStyle=black;ctx.lineWidth=8;ctx.lineJoin='round';ctx.lineCap='butt';
      ctx.beginPath();ctx.moveTo(64,79);ctx.lineTo(64,60);
      ctx.bezierCurveTo(64,52,60,51,54,54);ctx.lineTo(47,58);
      ctx.bezierCurveTo(41,61.5,40,58.5,40,53);ctx.lineTo(40,37);ctx.stroke();ctx.restore();
    }
  }else if(kind==='yield'){
    polygon([[0,0],[256,0],[128,256]],white);polygon([[6,4],[250,4],[128,246]],red);polygon([[32,20],[224,20],[128,212]],white);
  }else if(kind==='pedestrian'){
    drawPedestrianSign(ctx,mirror,256,256);
  }else{
    ctx.fillStyle=white;ctx.fillRect(0,0,256,256);ctx.fillStyle=blue;ctx.beginPath();ctx.roundRect(6,6,244,244,12);ctx.fill();
    ctx.fillStyle=white;ctx.font='500 190px Arial';ctx.textAlign='center';ctx.fillText('P',128,198);
  }
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
export function createRoadSign(kind:SignKind,mirror=false,lowerSign?:SignKind|SignKind[],options:{center?:number;bottom?:number;post?:boolean}={}):T.Group{
  const root=new T.Group(),spec=signSpecifications[kind],lower=lowerSign?(Array.isArray(lowerSign)?lowerSign:[lowerSign]):[],boards=signBoardLayout(kind,lower,options);
  const center=boards[0].center,crossCenter=center+spec.height/2+.6,postHeight=kind==='railway'?crossCenter+.3:center+.18;
  const mainBoards=boards.filter(b=>!supplementary(b.kind));
  root.name=`assembly-sign-${kind}`;root.userData={kind,...spec,...signVariation(kind,mirror),thickness:kind==='winding'?.001:.0022,mirrored:mirror,lowerMainEdge:Math.min(...(mainBoards.length?mainBoards:boards).map(b=>b.center-signSpecifications[b.kind].height/2)),heightDatum:'road-surface-to-lowest-main-board'};
  if(kind==='railway')root.userData.crossbuckCenter=crossCenter;
  const part=(geometry:T.BufferGeometry,material:T.Material,position:number[],rotation=[0,0,0],name='')=>{const m=new T.Mesh(geometry,material);m.name=name;m.position.fromArray(position);m.rotation.fromArray([...rotation,'XYZ'] as [number,number,number,T.EulerOrder]);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
  if(options.post!==false){
    part(new T.CylinderGeometry(.03,.034,postHeight,12),steel,[0,postHeight/2,0]);
    part(new T.CylinderGeometry(.035,.035,.025,12),hardware,[0,postHeight+.008,0]);
    part(new T.CylinderGeometry(.095,.12,.12,12),concrete,[0,.04,0]);
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
