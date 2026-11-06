import * as T from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import polygonClipping from 'polygon-clipping';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { course, hillBounds, hillHeight, hillProfile, mapPoint,startLinePoint } from '../data/course';
import { distance, segmentDistance } from '../simulation/math';
import type { Vec2,Settings } from '../types';
import { asphaltGeometry, boundaryPaintSurface, boundarySections, curbGeometry, curbSurfaces, offsetPath, paintPolygonGeometry, paintStripGeometry, paintJoinSurface, roadBoundaryLoops, roadPaint, unifiedRoads,type PaintPath } from './road-geometry';
import { categoryLabels, departureTurnArrows, paintedArrows, yellowBoundaryRoads, yellowControlLines,type PaintedArrow } from '../data/road-markings';
import { laneLines,laneGores } from '../data/lane-markings';
import { centerArrowBetweenLines,roadArrowOutline } from './road-arrows';
import { createRoadSign,type SignKind } from './road-signs';
import { createHillStructure,hillColliderData } from './hill-structure';
import { TreeStand } from './trees';
import { TrafficLight } from './traffic-light';
import { signalAxis } from '../data/traffic-signals';
import { intersectionApproaches } from '../data/intersection';
import { fitCrosswalk,crosswalkStripes } from './crosswalk';
import { courseEnvelope,courseGrassIslands } from '../data/course-layout';
import { departureMarkingPaths } from './departure-markings';
import { addStaticObstacle } from '../simulation/static-collision';
import { markingDimensions } from '../data/marking-standards';
import {courseSigns,courseSignPoint} from '../data/course-signs';
export { signalState } from '../data/traffic-signals';

export interface RoadSamples { points: Vec2[]; width: number }
export function sampledRoads():RoadSamples[]{
  return course.roads.map(r=>{
    if(!r.smooth)return {points:r.points,width:r.width*(course.laneWidth/3.5)};
    const curve=new T.CatmullRomCurve3(r.points.map(p=>new T.Vector3(p.x,0,p.z)),false,'centripetal');
    return {points:curve.getPoints(Math.ceil(curve.getLength()*2)).map(p=>({x:p.x,z:p.z})),width:r.width*(course.laneWidth/3.5)};
  });
}
export const roads=sampledRoads();
const planPolygon=(points:[number,number][]):polygonClipping.Polygon=>[[...points,points[0]].map(([x,y])=>{const p=mapPoint(x,y);return [p.x,p.z];})];
const planPavement=polygonClipping.difference([planPolygon(courseEnvelope)],...courseGrassIslands.map(points=>[planPolygon(points)]));
// Snap the boolean result to micrometres before deriving offset paint and kerbs.
// Shared joins otherwise retain nearly identical vertices from the sampled roads.
const tracedPavement=planPavement.map(polygon=>polygon.map(ring=>ring.map(([x,z])=>[
  Math.round(x*1e6)/1e6,Math.round(z*1e6)/1e6,
] as [number,number])));
// The traced islands already contain the junction's rounded corners. Adding a
// second, nominal corner cuts little notches into them and leaves kerb stubs.
export const roadSurface=tracedPavement;
export const intersectionCrossings=intersectionApproaches.map(a=>({id:a.id,...fitCrosswalk(roadSurface,a.crossing,a.normal)}));
export const boundaryLoops=roadBoundaryLoops(roadSurface);
export const curbSections=boundarySections(boundaryLoops,-.025,-.025-roadPaint.curbWidth,roadPaint.curbStripe);
export const curbSurface=curbSurfaces(curbSections,roadSurface);
const edgeSurface=boundaryPaintSurface(boundarySections(boundaryLoops,roadPaint.edgeInset,roadPaint.edgeInset+roadPaint.edgeWidth));
const yellowZones=unifiedRoads(yellowBoundaryRoads);
const yellowEdgeBand=boundaryPaintSurface(boundarySections(boundaryLoops,roadPaint.edgeInset,roadPaint.edgeInset+markingDimensions.yellowBoundary));
export const yellowEdgeSurface=polygonClipping.intersection(yellowEdgeBand,yellowZones,roadSurface);
export const whiteEdgeSurface=polygonClipping.difference(polygonClipping.intersection(edgeSurface,roadSurface),yellowZones);
export const departurePaint=departureMarkingPaths();
export const departureDivider=[{x:33,z:40.5},...roads[0].points.filter(p=>p.x>=33&&p.z>=departurePaint.right[0].z).reverse(),departurePaint.right[0]];
export const departureArrowBorders=[...boundaryLoops.map(loop=>{const line=offsetPath(loop,roadPaint.edgeInset+roadPaint.edgeWidth/2,true);return [...line,line[0]];}),departureDivider,departurePaint.left,departurePaint.right,departurePaint.rightGuide];
export function roadDistance(p:Vec2){
  let min=Infinity,inside=false;
  for(const loop of boundaryLoops)for(let i=0;i<loop.length;i++){
    const a=loop[i],b=loop[(i+1)%loop.length];min=Math.min(min,segmentDistance(p,a,b));
    if((a.z>p.z)!==(b.z>p.z)&&p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x)inside=!inside;
  }
  return inside?-min:min;
}
/** Project onto a road running in the requested direction, rather than a crossing road. */
export function roadFrame(point:Vec2,normal:Vec2){
  let best=Infinity,center={...point},width=course.laneWidth;
  for(const road of roads)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);
    if(length<1e-6||Math.abs((dx*normal.x+dz*normal.z)/length)<.95)continue;
    const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.z-a.z)*dz)/(length*length)));
    const p={x:a.x+t*dx,z:a.z+t*dz},d=distance(point,p);
    if(d<best){best=d;center=p;width=road.width;}
  }
  return {center,width};
}
export function roadsidePosition(point:Vec2,normal:Vec2){
  const frame=roadFrame(point,normal),right={x:-normal.z,z:normal.x};
  const edge=frame.width/2+.65,candidates:{x:number;z:number;cost:number}[]=[];
  // Find a nearby verge, moving upstream at junctions instead of crossing other lanes.
  for(let back=0;back<=6;back+=.5)for(let extra=0;extra<=6;extra+=.25){
    candidates.push({x:frame.center.x+right.x*(edge+extra)-normal.x*back,z:frame.center.z+right.z*(edge+extra)-normal.z*back,cost:back*back+extra*extra});
  }
  candidates.sort((a,b)=>a.cost-b.cost);
  const position=candidates.find(p=>roadDistance(p)>=.3);
  if(!position)throw new Error(`No roadside space for sign at ${point.x}, ${point.z}`);
  return {x:position.x,z:position.z};
}
export function pedestrianCrossingLayout(){
  const stop=course.exercises.find(e=>e.id==='pedestrian')!.stop!;
  const offset=markingDimensions.crossingLength/2+1+markingDimensions.stop/2;
  const ahead={x:stop.point.x+stop.normal.x*offset,z:stop.point.z+stop.normal.z*offset};
  return fitCrosswalk(roadSurface,ahead,stop.normal);
}
/** Shared world/map stop stripes. Point denotes the centre of the paint. */
function stopStripe(name:string,point:Vec2,normal:Vec2,span:'road'|'lane'|'approach'){
  const right={x:-normal.z,z:normal.x},frame=roadFrame(point,normal);
  let center=span==='lane'?point:frame.center,low=-(frame.width-2*roadPaint.edgeInset)/2,high=-low;
  if(span==='lane'){low=-course.laneWidth/2;high=-low;}
  if(span==='approach'){
    const mouth=fitCrosswalk(roadSurface,point,normal,.3);center=point;low=0;
    high=(mouth.center.x-point.x)*right.x+(mouth.center.z-point.z)*right.z+mouth.width/2;
  }
  return {name,point,normal,width:markingDimensions.stop,points:[low,high].map(offset=>({x:center.x+right.x*offset,z:center.z+right.z*offset}))};
}
export const roadStopLines=[
  ...course.exercises.filter(e=>e.stop&&!e.stop.light).map(e=>stopStripe(`paint-${e.id}-stop-line`,e.stop!.point,e.stop!.normal,e.id==='railway'?'lane':'road')),
  ...intersectionApproaches.map(a=>stopStripe(`intersection-stop-${a.id}`,a.stop,a.normal,'approach')),
];
const approachArrows=intersectionApproaches.map(a=>{
  const [left,right]=roadStopLines.find(line=>line.name===`intersection-stop-${a.id}`)!.points;
  // Centre on the painted incoming lane, including the traced north divider,
  // rather than the approximate centre of the road's navigation path.
  return {point:{x:(left.x+right.x)/2-a.normal.x*4,z:(left.z+right.z)/2-a.normal.z*4},normal:a.normal,turn:a.turn};
});
// Replace only arrows in the incoming stop lanes. A broad exclusion rectangle
// also erased the opposite lane's turn arrow at the T-junction in the video.
export const coursePaintedArrows:PaintedArrow[]=[...paintedArrows.filter(arrow=>!intersectionApproaches.some(a=>{
  const dx=arrow.point.x-a.stop.x,dz=arrow.point.z-a.stop.z,along=dx*a.normal.x+dz*a.normal.z,lateral=dx*-a.normal.z+dz*a.normal.x;
  return arrow.normal.x*a.normal.x+arrow.normal.z*a.normal.z>.99&&along<=0&&along>=-8&&lateral>0&&lateral<4;
})).map(arrow=>departureTurnArrows.includes(arrow)?centerArrowBetweenLines(arrow,departureArrowBorders):arrow),...approachArrows];
function noiseTexture(base:[number,number,number],size=128){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;
  const ctx=canvas.getContext('2d')!,data=ctx.createImageData(size,size);
  let seed=8128;for(let i=0;i<data.data.length;i+=4){seed=(seed*1664525+1013904223)>>>0;const n=(seed/4294967296-.5)*18;
    data.data[i]=base[0]+n;data.data[i+1]=base[1]+n;data.data[i+2]=base[2]+n;data.data[i+3]=255;}
  ctx.putImageData(data,0,0);const tex=new T.CanvasTexture(canvas);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=8;return tex;
}
export class CourseWorld {
  group=new T.Group(); trafficLights:TrafficLight[]=[];
  obstacles=new Set<number>();
  private trees:TreeStand|undefined;
  private white=new T.MeshStandardMaterial({color:0xecece1,roughness:.9});
  private continuousWhite:PaintPath[]=[];
  private yellow=new T.MeshStandardMaterial({color:0xefcc59,roughness:.9});
  private pole=new T.MeshStandardMaterial({color:0x65726a,metalness:.55,roughness:.55});
  constructor(public physics:RAPIER.World){this.build();this.batchStaticGeometry();}
  private batchStaticGeometry(){
    this.group.updateMatrixWorld(true);const batches=new Map<T.Material,T.Mesh[]>();
    this.group.traverse(n=>{if(n instanceof T.Mesh && !(n instanceof T.InstancedMesh)&&!Array.isArray(n.material)&&!n.userData.preserveMesh&&!/^sign-.*-(front|back)$/.test(n.name)){const batch=batches.get(n.material)??[];batch.push(n);batches.set(n.material,batch);}});
    for(const [material,meshes]of batches){if(meshes.length<2)continue;
      const indexed=meshes.every(m=>m.geometry.index);
      const geometries=meshes.map(m=>{let g=m.geometry.clone().applyMatrix4(m.matrixWorld);if(!indexed&&g.index){const expanded=g.toNonIndexed();g.dispose();g=expanded;}return g;});
      const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());if(!merged)continue;
      const mesh=new T.Mesh(merged,material);mesh.castShadow=meshes.some(m=>m.castShadow);mesh.receiveShadow=true;
      for(const source of meshes){source.removeFromParent();source.geometry.dispose();}this.group.add(mesh);
    }
  }
  private box(w:number,h:number,d:number,x:number,y:number,z:number,material:T.Material,solid=false){
    const m=new T.Mesh(new T.BoxGeometry(w,h,d),material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;this.group.add(m);
    if(solid){const c=this.physics.createCollider(RAPIER.ColliderDesc.cuboid(w/2,h/2,d/2).setTranslation(x,y,z));this.obstacles.add(c.handle);}
    return m;
  }
  private strip(points:Vec2[],width:number,material:T.Material,height=.02){
    if(material===this.white)this.continuousWhite.push({points,width});
    const geo=paintStripGeometry(points,width,roadSurface,height);
    const mesh=new T.Mesh(geo,material);mesh.receiveShadow=true;this.group.add(mesh);return mesh;
  }
  private text(text:string,x:number,z:number,yaw:number,size=2.2,color='#f3f1d9',width=size*2.5,length=size*.65){
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d')!;
    ctx.font='bold 76px Arial';canvas.width=Math.ceil(ctx.measureText(text).width)+16;
    ctx.fillStyle=color;ctx.font='bold 76px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,canvas.width/2,64);
    const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
    tex.anisotropy=8;
    const mesh=new T.Mesh(new T.PlaneGeometry(width,length),new T.MeshBasicMaterial({map:tex,transparent:true,alphaTest:.08,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1}));mesh.name=`paint-label-${text}`;
    mesh.rotation.set(-Math.PI/2,0,yaw);mesh.position.set(x,hillHeight(x,z)+.055,z);this.group.add(mesh);
  }
  private sign(kind:SignKind,x:number,z:number,yaw:number,mirror=false,lowerSign?:SignKind|SignKind[],center?:number,bottom?:number){
    const base=hillHeight(x,z),assembly=createRoadSign(kind,mirror,lowerSign,{center,bottom,postBase:-base});assembly.position.set(x,base,z);assembly.rotation.y=yaw;this.group.add(assembly);
    const halfHeight=1.3+base/2;
    const collider=this.physics.createCollider(RAPIER.ColliderDesc.cylinder(halfHeight,.034).setTranslation(x,halfHeight,z));this.obstacles.add(collider.handle);
    return assembly;
  }
  private build(){
    const grassTex=noiseTexture([103,123,70]);grassTex.repeat.set(100,100);
    const ground=new T.Mesh(new T.PlaneGeometry(500,500),new T.MeshStandardMaterial({map:grassTex,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;this.group.add(ground);
    this.physics.createCollider(RAPIER.ColliderDesc.cuboid(250,.2,250).setTranslation(0,-.2,0).setFriction(.85));
    const asphalt=new T.MeshStandardMaterial({map:noiseTexture([103,107,103]),roughness:.96});
    const pavement=new T.Mesh(asphaltGeometry(roadSurface),asphalt);pavement.name='course-asphalt';pavement.receiveShadow=true;this.group.add(pavement);
    // A continuous physical ramp shared by both bottom lanes.
    const ramp=hillColliderData();this.physics.createCollider(RAPIER.ColliderDesc.trimesh(ramp.positions,ramp.indices).setFriction(.9));
    const hillStructure=createHillStructure(boundaryLoops);this.group.add(hillStructure);
    hillStructure.traverse(node=>{if(node instanceof T.Mesh)addStaticObstacle(this.physics,node.geometry,this.obstacles);});
    const curbMat=new T.MeshStandardMaterial({color:0xffffff,roughness:.9});
    const junctionZone:polygonClipping.MultiPolygon=[[[[-16,-18],[16,-18],[16,13],[-16,13],[-16,-18]]]];
    const departureZone=polygonClipping.difference([[[[-1.5,.5],[63,.5],[63,46],[-1.5,46],[-1.5,.5]]]],junctionZone);
    const whiteZone=polygonClipping.union(junctionZone,departureZone);
    const curbSeams: {axis:'x'|'z';value:number}[]=[...[-16,16,-1.5,63].map(value=>({axis:'x' as const,value})),...[-18,13,.5,46].map(value=>({axis:'z' as const,value}))];
    const continuousCurbs=polygonClipping.union(boundaryPaintSurface(curbSections));
    const junctionCurbs=polygonClipping.difference(polygonClipping.intersection(continuousCurbs,junctionZone),roadSurface);
    const ordinaryCurbs={black:polygonClipping.difference(curbSurface.black,whiteZone),yellow:polygonClipping.difference(curbSurface.yellow,whiteZone)};
    const curbs=new T.Mesh(curbGeometry(ordinaryCurbs,{height:.18,bevel:.02,color:0xe4e2d6,sideColor:0xa9ada5,seams:curbSeams}),new T.MeshStandardMaterial({vertexColors:true,roughness:.95}));curbs.name='course-curbs';curbs.userData={height:.18,stripeLength:roadPaint.curbStripe,sections:curbSections.length};curbs.receiveShadow=true;curbs.castShadow=true;this.group.add(curbs);
    // Match the departure kerb's 20 cm top: changing mesh regions must not
    // create a step across the continuous concrete edge beside the driver.
    const junctionGeometry=curbGeometry({black:[],yellow:junctionCurbs},{height:.18,bevel:.02,color:0xe4e2d6,sideColor:0xa9ada5,seams:curbSeams});
    const whiteCurbs=new T.Mesh(junctionGeometry,new T.MeshStandardMaterial({vertexColors:true,roughness:.94}));whiteCurbs.name='intersection-curbs';whiteCurbs.userData={preserveMesh:true,height:.18,bevel:.02};whiteCurbs.castShadow=whiteCurbs.receiveShadow=true;this.group.add(whiteCurbs);
    const {start:rampStart,end:rampEnd}=hillProfile,{minZ,maxZ}=hillBounds;
    const rampZone:polygonClipping.MultiPolygon=[[[[rampStart,minZ],[rampEnd,minZ],[rampEnd,maxZ],[rampStart,maxZ],[rampStart,minZ]]]];
    const departureCurbs=polygonClipping.difference(polygonClipping.intersection(continuousCurbs,departureZone),roadSurface,rampZone);
    const departureConcrete=new T.Mesh(curbGeometry({black:[],yellow:departureCurbs},{height:.18,bevel:.02,color:0xe4e2d6,sideColor:0xa9ada5,seams:curbSeams}),new T.MeshStandardMaterial({vertexColors:true,roughness:.94}));
    departureConcrete.name='departure-curbs';departureConcrete.userData={preserveMesh:true,height:.18,bevel:.02};departureConcrete.castShadow=departureConcrete.receiveShadow=true;this.group.add(departureConcrete);
    for(const mesh of [curbs,whiteCurbs,departureConcrete])addStaticObstacle(this.physics,mesh.geometry,this.obstacles);
    for(const [name,surface,material]of [['course-edge-lines',whiteEdgeSurface,this.white],['course-yellow-edge-lines',yellowEdgeSurface,this.yellow]] as const){
      const paint=new T.Mesh(asphaltGeometry(surface,.048),material);paint.name=name;paint.userData.preserveMesh=true;paint.receiveShadow=true;this.group.add(paint);
    }
    const startNormal={x:1,z:0},startFrame=roadFrame(startLinePoint,startNormal);
    // The start, crossing and ramp share a solid lane divider in the video.
    this.strip([startFrame.center,{x:33,z:startFrame.center.z}],roadPaint.centerWidth,this.white,.05);
    const divider=this.strip(departureDivider,roadPaint.centerWidth,this.white,.05);
    divider.name='paint-departure-divider';divider.userData.preserveMesh=true;
    for(const line of laneLines){const mesh=this.strip(line.points,line.width,this.white,.052);mesh.name=`paint-lane-${line.id}`;mesh.userData.preserveMesh=true;}
    for(const gore of laneGores){
      const ring=[...gore.outline,gore.outline[0]].map(p=>[p.x,p.z] as polygonClipping.Pair),surface=polygonClipping.intersection(roadSurface,[[ring]]);
      const geometries=[paintStripGeometry([...gore.outline,gore.outline[0]],markingDimensions.islandBorder,roadSurface,.054)];
      const xs=gore.outline.map(p=>p.x),zs=gore.outline.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs),height=maxZ-minZ;
      if(gore.fringe){
        // 05:02: short inward teeth follow both curved borders, leaving the
        // centre open instead of filling this splitter with diagonal bars.
        for(const side of [gore.outline.slice(0,33),gore.outline.slice(33).reverse()]){
          let station=.65;
          for(let i=1;i<side.length;i++){
            const a=side[i-1],b=side[i],length=distance(a,b),dx=(b.x-a.x)/length,dz=(b.z-a.z)/length;
            for(;station<length;station+=gore.spacing){
              const p={x:a.x+dx*station,z:a.z+dz*station},center={x:(minX+maxX)/2,z:(minZ+maxZ)/2};
              const sign=(center.x-p.x)*-dz+(center.z-p.z)*dx>=0?1:-1;
              geometries.push(paintStripGeometry([p,{x:p.x+(dx-dz*sign)*.65,z:p.z+(dz+dx*sign)*.65}],markingDimensions.edge,surface,.054));
            }station-=length;
          }
        }
      }else for(let x=minX-height;x<maxX;x+=gore.spacing)geometries.push(paintStripGeometry([{x,z:maxZ},{x:x+height,z:minZ}],markingDimensions.islandStripe,surface,.054));
      const mesh=new T.Mesh(mergeGeometries(geometries)!,this.white);geometries.forEach(g=>g.dispose());mesh.name=`paint-gore-${gore.id}`;mesh.userData.preserveMesh=true;mesh.receiveShadow=true;this.group.add(mesh);
    }
    const transverse=(point:Vec2,normal:Vec2,width:number)=>{
      const frame=roadFrame(point,normal),half=(frame.width-2*roadPaint.edgeInset)/2;
      return this.strip([{x:frame.center.x+normal.z*half,z:frame.center.z-normal.x*half},{x:frame.center.x-normal.z*half,z:frame.center.z+normal.x*half}],width,this.white,.055);
    };
    const startLine=transverse(startLinePoint,startNormal,.23);startLine.name='paint-start-line';startLine.userData.preserveMesh=true;
    // All direction symbols share one draw call. Retain vertex ranges for
    // measuring complete silhouettes without splitting them into 33 meshes.
    const arrowGeometries=coursePaintedArrows.map(arrow=>paintPolygonGeometry(roadArrowOutline(arrow),roadSurface,.065));
    const arrowBatch=new T.Mesh(mergeGeometries(arrowGeometries)!,this.white);let arrowStart=0;
    arrowBatch.name='paint-direction-arrows';arrowBatch.receiveShadow=true;
    arrowBatch.userData={preserveMesh:true,arrows:coursePaintedArrows.map((arrow,i)=>{
      const count=arrowGeometries[i].getAttribute('position').count,record={...arrow,start:arrowStart,count};arrowStart+=count;return record;
    })};
    arrowGeometries.forEach(geometry=>geometry.dispose());this.group.add(arrowBatch);
    for(const label of categoryLabels)this.text(label.text,label.point.x,label.point.z,Math.atan2(-label.normal.x,-label.normal.z),1,'#eeede1',label.width,label.length);
    const goreRing=[...departurePaint.outline,departurePaint.outline[0]].map(p=>[p.x,p.z] as polygonClipping.Pair);
    const goreSurface=polygonClipping.intersection(roadSurface,[[goreRing]]);
    const forkGeometries=[departurePaint.left,departurePaint.right,departurePaint.nose].map(points=>paintStripGeometry(points,markingDimensions.islandBorder,roadSurface,.054));
    this.continuousWhite.push(...[departurePaint.left,departurePaint.right,departurePaint.nose].map(points=>({points,width:markingDimensions.islandBorder})));
    // Clip the chevron mitres to the gore: their acute apices must never produce
    // spikes or little triangles outside the narrowing outline.
    forkGeometries.push(...departurePaint.chevrons.map(points=>paintStripGeometry(points,markingDimensions.islandStripe,goreSurface,.054)));
    const fork=new T.Mesh(mergeGeometries(forkGeometries)!,this.white);forkGeometries.forEach(g=>g.dispose());
    fork.name='paint-departure-hatching';fork.userData.preserveMesh=true;fork.receiveShadow=true;this.group.add(fork);
    const outerGuide=this.strip(departurePaint.rightGuide,markingDimensions.islandBorder,this.white,.054);outerGuide.name='paint-departure-right-guide';outerGuide.userData.preserveMesh=true;
    // Dashed yellow exercise entry/control lines visible in the reference video.
    const controlGeometries:T.BufferGeometry[]=[];
    for(const [start,end]of yellowControlLines){
      const length=distance(start,end);
      for(let d=0;d<length;d+=.65){const t=d/length,u=Math.min(length,d+.32)/length;controlGeometries.push(paintStripGeometry([{x:start.x+(end.x-start.x)*t,z:start.z+(end.z-start.z)*t},{x:start.x+(end.x-start.x)*u,z:start.z+(end.z-start.z)*u}],.1,roadSurface,.054));}
    }
    const controls=new T.Mesh(mergeGeometries(controlGeometries)!,this.yellow);controlGeometries.forEach(g=>g.dispose());
    controls.name='paint-yellow-control-lines';controls.userData.preserveMesh=true;controls.receiveShadow=true;this.group.add(controls);
    const crossing=pedestrianCrossingLayout();
    for(const layout of [{id:'start-road',...crossing},...intersectionCrossings]){
      const stripes=crosswalkStripes(layout);
      for(const yellow of [false,true]){
        const geometries=stripes.filter(s=>s.yellow===yellow).map(s=>paintPolygonGeometry(s.points,roadSurface,.051));
        const mesh=new T.Mesh(mergeGeometries(geometries)!,yellow?this.yellow:this.white);geometries.forEach(g=>g.dispose());
        mesh.name=`intersection-crossing-${layout.id}-${yellow?'yellow':'white'}`;mesh.userData.preserveMesh=true;mesh.receiveShadow=true;this.group.add(mesh);
      }
    }
    for(const approach of intersectionApproaches){
      const n=approach.normal,p=approach.stop,right={x:-n.z,z:n.x};
      const verge=roadsidePosition({x:p.x+n.x,z:p.z+n.z},n),signalPosition={x:verge.x+right.x*.85,z:verge.z+right.z*.85},yaw=Math.atan2(-n.x,-n.z);
      const head=new TrafficLight(signalAxis(n));head.group.position.set(signalPosition.x,0,signalPosition.z);head.group.rotation.y=yaw;head.group.userData.approach=approach.id;this.trafficLights.push(head);this.group.add(head.group);
      const collider=this.physics.createCollider(RAPIER.ColliderDesc.cylinder(1.62,.04).setTranslation(signalPosition.x,1.62,signalPosition.z));this.obstacles.add(collider.handle);
      const priority=createRoadSign(n.z?'priority':'yield',false,undefined,{bottom:1.05,post:false});priority.name=`signal-${approach.id}-priority`;priority.position.set(signalPosition.x,0,signalPosition.z);priority.rotation.y=yaw;priority.userData.referenceFrames=n.z?[287,412]:[570,645];this.group.add(priority);
      const stopPost=roadsidePosition({x:p.x+n.x*.35,z:p.z+n.z*.35},n);this.sign('stopPlate',stopPost.x-right.x*.15,stopPost.z-right.z*.15,yaw,false,undefined,undefined,1.35).name=`signal-${approach.id}-stop-board`;
      const pedestrian=createRoadSign('pedestrian',n.x>0||n.z>0,undefined,{center:2.5,post:false});pedestrian.position.set(signalPosition.x-right.x*.75,0,signalPosition.z-right.z*.75);pedestrian.rotation.y=yaw;this.group.add(pedestrian);
      const bracket=new T.Mesh(new T.CylinderGeometry(.017,.017,.75,10),this.pole);bracket.rotation.z=Math.PI/2;bracket.position.set(-.375,2.5,-.09);head.group.add(bracket);
      const direction=roadsidePosition({x:p.x-n.x*1.6,z:p.z-n.z*1.6},n);this.sign(approach.turn??'straight',direction.x+right.x*1.5,direction.z+right.z*1.5,yaw,false,undefined,undefined,1.5).name=`signal-${approach.id}-direction`;
    }
    for(const marking of roadStopLines){const line=this.strip(marking.points,marking.width,this.white,.055);line.name=marking.name;line.userData={preserveMesh:true,normal:marking.normal,width:marking.width};}
    this.text('START',startLinePoint.x-1.4,42,-Math.PI/2,2,'#eeede1',2.8,1.2);this.text('START',startLinePoint.x-1.4,38.5,-Math.PI/2,2,'#eeede1',2.8,1.2);
    this.text('FINISH',-48.2,26.5,Math.PI/2,2,'#eeede1',2.6,1.2);this.text('FINISH',-48.2,22.5,Math.PI/2,2,'#eeede1',2.6,1.2);
    for(const placement of courseSigns){
      const p=courseSignPoint(placement);
      const assembly=this.sign(placement.kind,p.x,p.z,placement.yaw,placement.mirror??false,placement.lower,undefined,placement.bottom);
      assembly.name=placement.id;assembly.userData={...assembly.userData,placementId:placement.id,referenceVideo:'uz_video.mp4',referenceFrames:placement.frames,planPoint:[placement.x,placement.y]};
    }
    for(const z of [-24,-23.3]){this.box(7,.07,.1,58,.045,z,this.pole);for(let x=54.5;x<61.5;x+=.5)this.box(.23,.04,1.9,x,.045,-23.65,curbMat);}
    this.trees=new TreeStand();this.group.add(this.trees.group);
    const facade=new T.MeshStandardMaterial({map:this.buildingTexture(),roughness:.85});
    for(let i=0;i<14;i++){const x=-96+i*15,h=8+(i%4)*3;this.box(12,h,10,x,h/2,-68-(i%3)*6,facade);}
    const steel=new T.MeshStandardMaterial({color:0x99aaa2,metalness:.4,roughness:.7,transparent:true,opacity:.8});
    for(let x=-66;x<=66;x+=4){for(const z of [-48,49]){this.box(.07,2.2,.07,x,1.1,z,this.pole);this.box(4,.025,.025,x+2,2,z,steel);this.box(4,.025,.025,x+2,.5,z,steel);}}
    for(const x of [-66,66]){this.box(.1,1.2,97,x,.6,.5,steel,true);for(let z=-48;z<=49;z+=4)this.box(.07,2.2,.07,x,1.1,z,this.pole);}
    for(const z of [-48,49]){const c=this.physics.createCollider(RAPIER.ColliderDesc.cuboid(66,.5,.1).setTranslation(0,.5,z));this.obstacles.add(c.handle);}
    const joins=polygonClipping.intersection(paintJoinSurface(this.continuousWhite),roadSurface);
    const paintJoins=new T.Mesh(asphaltGeometry(joins,.055),this.white);paintJoins.name='paint-line-joins';paintJoins.userData.preserveMesh=true;paintJoins.receiveShadow=true;this.group.add(paintJoins);
    // A restrained entry pavilion.
    const pale=new T.MeshStandardMaterial({color:0xd8dbcc,roughness:.8});
    this.box(9,3.8,5,-47,1.9,54,pale,true);this.box(9.8,.2,5.8,-47,3.9,54,this.pole);
  }
  private buildingTexture(){const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d')!;ctx.fillStyle='#b7c1b9';ctx.fillRect(0,0,256,256);for(let x=12;x<256;x+=34)for(let y=12;y<256;y+=38){ctx.fillStyle='#567372';ctx.fillRect(x,y,20,25);ctx.fillStyle='#849d96';ctx.fillRect(x+2,y+2,7,20);}const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;return t;}
  setTreeQuality(quality:Settings['quality']){this.trees?.setQuality(quality);}
  update(time:number){this.trees?.update(time);this.trafficLights.forEach(light=>light.update(time));}
}
