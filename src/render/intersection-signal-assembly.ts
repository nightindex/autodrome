import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import type {SignalAxis} from '../data/traffic-signals';
import {TrafficLight} from './traffic-light';
import {PedestrianTrafficLight} from './pedestrian-traffic-light';

interface PedestrianMount {id:string;crossingId:string;side:number;yaw:number}
const steel=new T.MeshStandardMaterial({color:0x8d979c,roughness:.4,metalness:.78});
export class IntersectionSignalAssembly {
  group=new T.Group();
  front:TrafficLight;rear:TrafficLight;
  pedestrians:PedestrianTrafficLight[]=[];
  constructor(axis:SignalAxis,mounts:PedestrianMount[]){
    this.group.name='intersection-signal-assembly';this.group.userData={type:'combined-signal',axis,postHeight:3.6};
    const parts:T.BufferGeometry[]=[];
    const part=(geometry:T.BufferGeometry,x:number,y:number,z:number)=>{geometry.translate(x,y,z);parts.push(geometry);};
    part(new T.CylinderGeometry(.036,.043,3.6,16),0,1.8,0);
    part(new T.CylinderGeometry(.075,.1,.12,16),0,.06,0);
    part(new T.CylinderGeometry(.044,.044,.025,16),0,3.61,0);
    this.front=new TrafficLight(axis,{post:false});this.front.group.name='vehicle-signal-front';this.front.group.position.set(0,.32,.2);this.front.group.userData.face='front';
    this.rear=new TrafficLight(axis,{post:false});this.rear.group.name='vehicle-signal-rear';this.rear.group.position.set(0,.32,-.2);this.rear.group.rotation.y=Math.PI;this.rear.group.userData.face='rear';
    this.group.add(this.front.group,this.rear.group);
    const sideYaw=mounts.find(m=>Math.abs(Math.sin(m.yaw))>.5)?.yaw??Math.PI/2;
    const adjacentSide=-Math.sign(Math.sin(sideYaw));
    for(const mount of mounts){
      const direction={x:Math.sin(mount.yaw),z:Math.cos(mount.yaw)},sideMounted=Math.abs(direction.x)>.5;
      // Both zebra heads join the upper cluster, with aligned lower edges.
      // Place the adjacent crossing's head on the opposite side of the pole
      // to keep all four faces clear without a low, extended bracket.
      const height=.145,radius=sideMounted?.41:.2;
      const x=direction.x*radius+(sideMounted?0:adjacentSide*.46),z=direction.z*radius;
      const head=new PedestrianTrafficLight({post:false});head.group.name=mount.id;
      head.group.position.set(x,height,z);head.group.rotation.y=mount.yaw;
      Object.assign(head.group.userData,{crossingId:mount.crossingId,side:mount.side,sharedPost:true,mountRole:sideMounted?'side':'adjacent-crossing'});
      this.pedestrians.push(head);this.group.add(head.group);
      for(const y of [2.39+height,2.85+height]){
        const reach=Math.hypot(x,z),scale=(reach-.02)/reach;
        const bracket=new T.CylinderGeometry(.015,.015,reach-.02,10);bracket.rotateX(Math.PI/2);bracket.rotateY(Math.atan2(x,z));part(bracket,x*scale/2,y,z*scale/2);
        const collar=new T.TorusGeometry(.046,.008,6,16);collar.rotateX(Math.PI/2);part(collar,0,y,0);
      }
    }
    const hardware=new T.Mesh(mergeGeometries(parts)!,steel);parts.forEach(g=>g.dispose());hardware.name='shared-signal-post';hardware.userData.preserveMesh=true;hardware.castShadow=hardware.receiveShadow=true;this.group.add(hardware);
  }
}
