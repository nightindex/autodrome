import type { Exercise,VehicleTelemetry } from '../types';
import { course,hillBounds,hillProfile,startLinePoint } from '../data/course';
import { coursePaintedArrows,roadSurface,pedestrianCrossingLayout,whiteEdgeSurface,yellowEdgeSurface,intersectionCrossings,roadStopLines } from '../render/course-world';
import { carMapMarker,mapProjection } from './map-projection';
import { mapRouteLeg } from './map-route';
import { roadArrowOutline } from '../render/road-arrows';
import { crosswalkStripes } from '../render/crosswalk';
import { laneLines,laneGores,lanePaintPaths } from '../data/lane-markings';
import {railwayCrossing,railwayRailCenters,railwaySleeperCenters} from '../data/railway';

const colors={paper:'#f4f5ec',grass:'#b7c6a5',road:'#5d6868',edge:'#f5f4e7',route:'#f4ca70',car:'#075a47',goal:'#e4b346'};
let cachedBase:HTMLCanvasElement|undefined;

/** The cached background uses the same compound road polygon as the 3D asphalt. */
export class Minimap {
  readonly projection;
  private ctx:CanvasRenderingContext2D;
  private base:HTMLCanvasElement;
  private asphalt=new Path2D();
  constructor(private canvas:HTMLCanvasElement){
    canvas.width=720;canvas.height=552;this.ctx=canvas.getContext('2d')!;
    this.projection=mapProjection(roadSurface,canvas.width,canvas.height);
    for(const polygon of roadSurface)for(const ring of polygon){ring.forEach(([x,z],i)=>{const point=this.projection.project({x,z});i?this.asphalt.lineTo(point.x,point.y):this.asphalt.moveTo(point.x,point.y);});this.asphalt.closePath();}
    if(!cachedBase){cachedBase=document.createElement('canvas');cachedBase.width=canvas.width;cachedBase.height=canvas.height;this.drawBase(cachedBase.getContext('2d')!);}
    this.base=cachedBase;
  }
  private drawBase(ctx:CanvasRenderingContext2D){
    const {width,height}=this.canvas,p=this.projection,project=p.project;
    ctx.fillStyle=colors.paper;ctx.fillRect(0,0,width,height);
    ctx.fillStyle=colors.grass;ctx.fillRect(p.left-8,p.top-8,(p.maxX-p.minX)*p.scale+16,(p.maxZ-p.minZ)*p.scale+16);
    const asphalt=this.asphalt;
    ctx.fillStyle=colors.road;ctx.fill(asphalt,'evenodd');
    ctx.save();ctx.clip(asphalt,'evenodd');
    const yellow=new Path2D();
    const white=new Path2D();
    for(const polygon of whiteEdgeSurface)for(const ring of polygon){ring.forEach(([x,z],i)=>{const a=project({x,z});i?white.lineTo(a.x,a.y):white.moveTo(a.x,a.y);});white.closePath();}
    ctx.fillStyle=colors.edge;ctx.fill(white,'evenodd');
    for(const polygon of yellowEdgeSurface)for(const ring of polygon){ring.forEach(([x,z],i)=>{const a=project({x,z});i?yellow.lineTo(a.x,a.y):yellow.moveTo(a.x,a.y);});yellow.closePath();}
    ctx.fillStyle='#e4c465';ctx.fill(yellow,'evenodd');
    ctx.strokeStyle=colors.edge;
    for(const line of laneLines)for(const points of lanePaintPaths(line)){ctx.beginPath();points.forEach((point,i)=>{const a=project(point);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});ctx.lineWidth=Math.max(.75,line.width*p.scale);ctx.stroke();}
    for(const gore of laneGores)for(const points of gore.paintPaths??[[...gore.outline,gore.outline[0]]]){ctx.beginPath();points.forEach((point,i)=>{const a=project(point);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});ctx.lineWidth=.75;ctx.stroke();}
    const hillStart=project({x:hillProfile.start,z:hillBounds.minZ}),hillEnd=project({x:hillProfile.end,z:hillBounds.maxZ});
    ctx.fillStyle='#718076';ctx.fillRect(hillStart.x,hillStart.y,hillEnd.x-hillStart.x,hillEnd.y-hillStart.y);
    // Parking, the pedestrian crossing and railway give recognisable landmarks.
    ctx.strokeStyle=colors.edge;ctx.lineWidth=1.6;
    for(const exercise of course.exercises){if(!exercise.parking)continue;
      const bay=exercise.parking,center=project(bay.center);ctx.save();ctx.translate(center.x,center.y);ctx.rotate(-bay.yaw);
      ctx.strokeRect(-bay.width*p.scale/2,-bay.length*p.scale/2,bay.width*p.scale,bay.length*p.scale);ctx.restore();
    }
    const crossing=pedestrianCrossingLayout();
    for(const line of roadStopLines){ctx.beginPath();line.points.forEach((point,i)=>{const a=project(point);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});ctx.lineWidth=line.width*p.scale;ctx.stroke();}
    const crossings=[crossing,...intersectionCrossings];
    for(const layout of crossings)for(const stripe of crosswalkStripes(layout)){
      ctx.beginPath();stripe.points.forEach((point,i)=>{const a=project(point);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});ctx.closePath();ctx.fillStyle=stripe.yellow?'#e4c465':colors.edge;ctx.fill();
    }
    ctx.fillStyle=colors.edge;
    for(const arrow of coursePaintedArrows){const outline=roadArrowOutline(arrow);
      ctx.beginPath();outline.forEach((point,i)=>{const a=project(point);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});ctx.closePath();ctx.fill();
    }
    ctx.strokeStyle='#aaa89b';ctx.lineWidth=Math.max(.8,railwayCrossing.sleeperWidth*p.scale);
    for(const x of railwaySleeperCenters){
      const a=project({x:railwayCrossing.center.x+x,z:railwayCrossing.center.z-railwayCrossing.gauge/2});
      const b=project({x:railwayCrossing.center.x+x,z:railwayCrossing.center.z+railwayCrossing.gauge/2});
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    ctx.strokeStyle='#55574e';ctx.lineWidth=Math.max(.8,railwayCrossing.headWidth*p.scale);
    for(const offset of railwayRailCenters){
      const {center,length}=railwayCrossing,z=center.z+offset;
      const a=project({x:center.x-length/2,z}),b=project({x:center.x+length/2,z});
      ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
    }
    // A fine route stays subordinate to the driver and current destination.
    ctx.beginPath();course.route.forEach((point,i)=>{const a=project(point);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});
    ctx.strokeStyle=colors.route;ctx.globalAlpha=.25;ctx.lineWidth=2;ctx.lineJoin='round';ctx.lineCap='round';ctx.setLineDash([6,7]);ctx.stroke();ctx.restore();
    for(const [id,text]of [['start','START →'],['finish','← FINISH']] as const){
      const point=project(id==='start'?startLinePoint:course.exercises.find(e=>e.id===id)!.point);ctx.fillStyle=colors.car;ctx.font='bold 19px "Segoe UI",sans-serif';ctx.textAlign='center';ctx.fillText(text,point.x,point.y+(id==='start'?27:-18));
      ctx.strokeStyle=colors.edge;ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(point.x,point.y-10);ctx.lineTo(point.x,point.y+10);ctx.stroke();
    }
    const bar=10*p.scale,x=p.left,y=height-11;ctx.strokeStyle='#5b705c';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(x,y-5);ctx.lineTo(x,y);ctx.lineTo(x+bar,y);ctx.lineTo(x+bar,y-5);ctx.stroke();
    ctx.fillStyle='#48604d';ctx.font='20px "Segoe UI",sans-serif';ctx.textAlign='left';ctx.fillText('10 m',x+bar+9,y+2);
  }
  draw(t:VehicleTelemetry,exercise:Exercise,index=0,single=false){
    const ctx=this.ctx;ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.drawImage(this.base,0,0);
    const leg=mapRouteLeg(exercise,index,single),project=this.projection.project;
    ctx.save();ctx.clip(this.asphalt,'evenodd');ctx.beginPath();
    leg.forEach((point,i)=>{const a=project(point);i?ctx.lineTo(a.x,a.y):ctx.moveTo(a.x,a.y);});
    ctx.strokeStyle=colors.route;ctx.lineWidth=5;ctx.lineJoin='round';ctx.lineCap='round';ctx.stroke();
    // Forward chevrons communicate travel direction; the car's pointer retains
    // its actual heading, including when reversing into a bay.
    let station=4;
    for(let i=1;i<leg.length;i++){
      const a=leg[i-1],b=leg[i],length=Math.hypot(b.x-a.x,b.z-a.z);if(length<1e-6)continue;
      for(;station<length;station+=8){const center=project({x:a.x+(b.x-a.x)*station/length,z:a.z+(b.z-a.z)*station/length}),dx=(b.x-a.x)/length,dy=(b.z-a.z)/length;
        ctx.beginPath();ctx.moveTo(center.x-dx*5-dy*5,center.y-dy*5+dx*5);ctx.lineTo(center.x+dx*3,center.y+dy*3);ctx.lineTo(center.x-dx*5+dy*5,center.y-dy*5-dx*5);ctx.lineWidth=3;ctx.stroke();
      }station-=length;
    }ctx.restore();
    const target=this.projection.project(exercise.point),car=this.projection.project(t.position);
    ctx.beginPath();ctx.arc(target.x,target.y,12,0,Math.PI*2);ctx.fillStyle=colors.goal;ctx.fill();ctx.strokeStyle='#fffef5';ctx.lineWidth=3;ctx.stroke();
    ctx.beginPath();ctx.arc(target.x,target.y,3.5,0,Math.PI*2);ctx.fillStyle='#5c441e';ctx.fill();
    const marker=carMapMarker(car,t.yaw);ctx.beginPath();marker.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();
    ctx.fillStyle=colors.car;ctx.fill();ctx.lineJoin='round';ctx.strokeStyle='#fffef5';ctx.lineWidth=3.5;ctx.stroke();
  }
}
