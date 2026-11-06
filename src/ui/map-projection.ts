import type { MultiPolygon } from 'polygon-clipping';
import type { Vec2 } from '../types';

/** One metric scale in both axes: a round island stays round on the map. */
export function mapProjection(surface:MultiPolygon,width:number,height:number,padding=28){
  const points=surface.flat(2),xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const scale=Math.min((width-padding*2)/(maxX-minX),(height-padding*2)/(maxZ-minZ));
  const left=(width-(maxX-minX)*scale)/2,top=(height-(maxZ-minZ)*scale)/2;
  return {scale,minX,maxX,minZ,maxZ,left,top,
    project:(p:Vec2)=>({x:left+(p.x-minX)*scale,y:top+(p.z-minZ)*scale}),
    unproject:(p:{x:number;y:number})=>({x:(p.x-left)/scale+minX,z:(p.y-top)/scale+minZ}),
  };
}
export function carMapMarker(position:{x:number;y:number},yaw:number,radius=15){
  const forward={x:Math.sin(yaw),y:Math.cos(yaw)},right={x:Math.cos(yaw),y:-Math.sin(yaw)};
  return [[1,0],[-.65,-.65],[-.35,0],[-.65,.65]].map(([along,across])=>({x:position.x+radius*(forward.x*along+right.x*across),y:position.y+radius*(forward.y*along+right.y*across)}));
}
