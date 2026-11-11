import RAPIER from '@dimforge/rapier3d-compat';
import * as T from 'three';
import { vehicleConfig as config,vehicleDynamics as dynamics,wheelCenter } from '../data/vehicle';
import { hillHeight } from '../data/course';
import type { Vec2, VehicleTelemetry } from '../types';
import { Drivetrain } from './drivetrain';
import { Input } from './input';
import { clamp,localPoint } from './math';
import { tyreForces } from './tyre-forces';
import { Steering } from './steering';
const tyreHalfWidth=config.tyreWidth/2,tyreShoulder=.03,tyreClearance=.017;
const nominalBodyHeight=config.wheelRadius+dynamics.loadedSuspensionLength-.02;
export class Vehicle {
  body:RAPIER.RigidBody;collider:RAPIER.Collider;controller:RAPIER.DynamicRayCastVehicleController;
  drivetrain=new Drivetrain();belt=false;indicator:'off'|'left'|'right'='off';hazards=false;
  positionLights=false;headlights=false;fogLights=false;private ignitionOn=false;
  get canUseFogLights(){return (this.ignitionOn||this.drivetrain.engine)&&(this.positionLights||this.headlights);}
  readonly steering=new Steering();
  surfaceAt:(point:Vec2)=>'asphalt'|'grass'=()=> 'asphalt';
  time=0;collision=false;private queue=new RAPIER.EventQueue(true);
  private tyres:RAPIER.Collider[]=[];private tyreHandles=new Set<number>();
  private tyreContactForces=new Map<number,number>();
  private contactPairs=new Set<string>();private collisionHold=0;
  private impactPatches=new Map<number,Vec2>();
  private failedLaunchTime=0;private failedLaunchOrigin:Vec2|undefined;private stuckOrigin:Vec2|undefined;
  private readonly tyreShape=new RAPIER.RoundCylinder(tyreHalfWidth-tyreShoulder,config.wheelRadius-tyreClearance-tyreShoulder,tyreShoulder);
  // Ray suspension supplies tyre traction and braking. The massless tyre
  // solids resolve obstacle normals only: they have no independent spin, so
  // Coulomb friction here would make a rolling tyre behave like a locked skid.
  // Powered rolling at an obstacle edge is resolved separately below.
  private hooks:RAPIER.PhysicsHooks={
    filterContactPair:(a,b)=>{
      const obstacle=this.tyreHandles.has(a)?b:this.tyreHandles.has(b)?a:null;
      return obstacle===null||this.obstacles.has(obstacle)?RAPIER.SolverFlags.COMPUTE_IMPULSE:null;
    },
    filterIntersectionPair:()=>true,
  };
  constructor(public world:RAPIER.World,public obstacles:Set<number>,public traversableSurfaces=new Set<number>()){
    this.body=world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0,1,0).setLinearDamping(0).setAngularDamping(.8).setCcdEnabled(true));
    const colliderOffset=.12;
    const hull:number[]=[];
    for(const x of [-config.width/2,config.width/2])for(const y of [-.24,.24])for(const z of [-config.length/2,config.length/2])hull.push(x,y,z);
    // Keep the low floor between the axles. Sloped transitions to the raised
    // ends let a tyre engage a kerb before the chassis reaches the concrete.
    for(const x of [-.52,.52])for(const z of [-.82,.82])hull.push(x,config.groundClearance-nominalBodyHeight-colliderOffset,z);
    // Include the tapered cabin so an overturned car rests on its visible
    // roof instead of letting that roof pass through the road surface.
    for(const x of [-.60,.60])for(const z of [-.75,.35])hull.push(x,config.height-nominalBodyHeight-colliderOffset,z);
    const chassis=RAPIER.ColliderDesc.convexHull(new Float32Array(hull));
    if(!chassis)throw new Error('Invalid vehicle chassis hull');
    this.collider=world.createCollider(chassis.setTranslation(0,colliderOffset,0)
      .setMassProperties(config.mass,{x:0,y:-.08,z:0},{x:1900,y:2200,z:480},{x:0,y:0,z:0,w:1})
      .setFriction(.3).setRestitution(.02).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS|RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),this.body);
    this.controller=world.createVehicleController(this.body);this.controller.indexUpAxis=1;this.controller.setIndexForwardAxis=2;
    for(let index=0;index<4;index++){
      const {x,z}=wheelCenter(index);
      this.controller.addWheel({x,y:.02,z},{x:0,y:-1,z:0},{x:-1,y:0,z:0},dynamics.suspensionRestLength,config.wheelRadius);
      const i=this.controller.numWheels()-1;
      this.controller.setWheelSuspensionStiffness(i,dynamics.suspensionStiffness);this.controller.setWheelSuspensionCompression(i,4.4);this.controller.setWheelSuspensionRelaxation(i,5.2);
      this.controller.setWheelMaxSuspensionForce(i,dynamics.maxSuspensionForce);this.controller.setWheelMaxSuspensionTravel(i,dynamics.suspensionTravel);this.controller.setWheelFrictionSlip(i,dynamics.asphaltGrip);this.controller.setWheelSideFrictionStiffness(i,1.5);
      const tyre=world.createCollider(RAPIER.ColliderDesc.roundCylinder(tyreHalfWidth-tyreShoulder,config.wheelRadius-tyreClearance-tyreShoulder,tyreShoulder)
        .setTranslation(x,.02-dynamics.suspensionRestLength,z)
        .setRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2))
        .setMass(0).setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(.03)
        .setActiveHooks(RAPIER.ActiveHooks.FILTER_CONTACT_PAIRS).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS|RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS),this.body);
      this.tyres.push(tyre);this.tyreHandles.add(tyre.handle);
    }
  }
  reset(p:Vec2,yaw:number){
    this.body.setTranslation({x:p.x,y:hillHeight(p.x,p.z)+.67,z:p.z},true);
    this.body.setRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw),true);
    this.body.setLinvel({x:0,y:0,z:0},true);this.body.setAngvel({x:0,y:0,z:0},true);this.body.resetForces(true);this.body.resetTorques(true);
    this.drivetrain.reset();this.steering.reset();this.belt=false;this.indicator='off';this.hazards=false;this.ignitionOn=false;this.positionLights=false;this.headlights=false;this.fogLights=false;this.time=0;this.collision=false;this.collisionHold=0;this.contactPairs.clear();this.impactPatches.clear();this.tyreContactForces.clear();this.queue.clear();
    this.failedLaunchTime=0;this.failedLaunchOrigin=undefined;this.stuckOrigin=undefined;
    this.tyres.forEach((tyre,i)=>{
      const {x,z}=wheelCenter(i);
      this.controller.setWheelSteering(i,0);
      this.controller.setWheelRadius(i,config.wheelRadius);
      this.controller.setWheelChassisConnectionPointCs(i,{x,y:.02,z});
      tyre.setTranslationWrtParent({x,y:.02-dynamics.suspensionRestLength,z});
      tyre.setRotationWrtParent(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2));
    });
  }
  /** A failed launch remains recoverable after the driver releases the pedals. */
  get recoveryReason():'overturned'|'stuck'|null{
    const q=this.body.rotation(),v=this.body.linvel(),angular=this.body.angvel();
    const up=1-2*(q.x*q.x+q.z*q.z),speed=Math.hypot(v.x,v.y,v.z);
    if(up<.25&&speed<3)return 'overturned';
    if(this.stuckOrigin&&up>.75&&speed<.4&&Math.hypot(angular.x,angular.y,angular.z)<.4)return 'stuck';
    return null;
  }
  get canRecover(){return this.recoveryReason!==null;}
  recover(){
    const reason=this.recoveryReason;if(!reason)return false;
    const rotation=new T.Quaternion().copy(this.body.rotation()),forward=new T.Vector3(0,0,1).applyQuaternion(rotation),right=new T.Vector3(1,0,0).applyQuaternion(rotation);
    const yaw=Math.hypot(forward.x,forward.z)>.1?Math.atan2(forward.x,forward.z):Math.atan2(-right.z,right.x),upright=new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw);
    // Cover the whole upright chassis and the fully extended tyres at the
    // recovery spawn height, including the roof before the suspension settles.
    // Keep the previous conservative side, end and bottom clearance margins.
    const bottom=Math.min(-.6,.02-dynamics.suspensionRestLength-config.wheelRadius-.02);
    const top=Math.max(.4,config.height-nominalBodyHeight+.02),clearanceY=(bottom+top)/2;
    const halfWidth=Math.max(.96,config.width/2+.09,Math.max(config.frontTrack,config.rearTrack)/2+tyreHalfWidth+.09);
    const halfLength=Math.max(2.3,config.length/2+.06,config.wheelbase/2+config.wheelRadius+.06);
    const origin=this.body.translation(),clearance=new RAPIER.Cuboid(halfWidth,(top-bottom)/2,halfLength);
    // Prefer a complete asphalt tyre footprint, including when the nearest
    // clear space is grass. A second pass keeps off-road righting available.
    let placement:{x:number;y:number;z:number}|undefined;
    for(const requireAsphalt of reason==='stuck'?[true]:[true,false]){
     for(const radius of [0,1.25,2.5,4,6,8]){
      const directions=radius===0?1:radius<4?8:16;
      for(let i=0;i<directions;i++){
        const angle=yaw+Math.PI+i*Math.PI*2/directions,x=origin.x+Math.sin(angle)*radius,z=origin.z+Math.cos(angle)*radius;
        if(requireAsphalt&&![0,1,2,3].every(index=>{
          const wheel=wheelCenter(index);
          return [-tyreHalfWidth,0,tyreHalfWidth].every(side=>[-config.wheelRadius,0,config.wheelRadius].every(end=>
            this.surfaceAt(localPoint({x,z},yaw,wheel.x+side,wheel.z+end))==='asphalt'));
        }))continue;
        const heights=[hillHeight(x,z)];
        for(const side of [-halfWidth,halfWidth])for(const end of [-halfLength,halfLength]){
          const corner=localPoint({x,z},yaw,side,end);heights.push(hillHeight(corner.x,corner.z));
        }
        const y=Math.max(...heights)+.78;
        if(!this.world.intersectionWithShape({x,y:y+clearanceY,z},upright,clearance,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,this.body,c=>this.obstacles.has(c.handle))){placement={x,y,z};break;}
      }
      if(placement)break;
     }
     if(placement)break;
    }
    if(!placement)return false;
    const saved={time:this.time,belt:this.belt,engine:this.drivetrain.engine,ignition:this.ignitionOn,indicator:this.indicator,hazards:this.hazards,positionLights:this.positionLights,headlights:this.headlights,fogLights:this.fogLights};
    this.reset(placement,yaw);this.body.setTranslation(placement,true);
    this.time=saved.time;this.belt=saved.belt;this.ignitionOn=saved.ignition;this.indicator=saved.indicator;this.hazards=saved.hazards;
    this.positionLights=saved.positionLights;this.headlights=saved.headlights;this.fogLights=saved.fogLights;
    if(saved.engine)this.drivetrain.ignite();
    return true;
  }
  action(action:string,assist=false,clutchHeld=false){
    if(action==='positionLights'){this.positionLights=!this.positionLights;if(!this.positionLights){this.headlights=false;this.fogLights=false;}}
    if(action==='headlights'){this.headlights=!this.headlights;if(this.headlights)this.positionLights=true;}
    if(action==='fogLights'&&this.canUseFogLights)this.fogLights=!this.fogLights;
    if(action.startsWith('gear'))this.drivetrain.shift(Number(action.slice(-1)),assist,clutchHeld);
    if(action==='reverse')this.drivetrain.shift(-1,assist,clutchHeld);if(action==='neutral')this.drivetrain.shift(0);
    if(action==='ignition'){this.ignitionOn=!this.drivetrain.engine;this.drivetrain.ignite();if(!this.ignitionOn)this.fogLights=false;}
    if(action==='handbrake'){this.drivetrain.handbrake=!this.drivetrain.handbrake;this.body.wakeUp();}
    if(action==='belt')this.belt=!this.belt;if(action==='hazards')this.hazards=!this.hazards;
    if(action==='indicatorLeft')this.indicator=this.indicator==='left'?'off':'left';
    if(action==='indicatorRight')this.indicator=this.indicator==='right'?'off':'right';
  }
  update(dt:number,input:Input,assist:boolean,steeringAssist=false){
    if(input.down('throttle')||input.down('brake')||input.down('left')||input.down('right'))this.body.wakeUp();
    this.time+=dt;const q=this.body.rotation(),rotation=new T.Quaternion(q.x,q.y,q.z,q.w);
    const forward=new T.Vector3(0,0,1).applyQuaternion(rotation),position=this.body.translation();
    const vel=this.body.linvel(),speed=vel.x*forward.x+vel.y*forward.y+vel.z*forward.z;
    const drive=this.drivetrain.update(dt,speed,{throttle:+input.down('throttle'),brake:+input.down('brake'),clutch:+input.down('clutch')},assist);
    const horizontalSpeed=Math.hypot(vel.x,vel.z);
    const steeringGrip=steeringAssist?Math.min(...[0,1].map(i=>{
      const contact=this.controller.wheelIsInContact(i)?this.controller.wheelContactPoint(i):null;
      const {x,z}=wheelCenter(i),point=contact??new T.Vector3(x,0,z).applyQuaternion(rotation).add(position);
      return this.surfaceAt(point)==='grass'?dynamics.grassGrip:dynamics.asphaltGrip;
    })):undefined;
    const steer=this.steering.update(dt,+input.down('left')-+input.down('right'),horizontalSpeed,steeringGrip);
    if(horizontalSpeed>.001){
      const drag=.5*dynamics.airDensity*dynamics.dragArea*horizontalSpeed*horizontalSpeed;
      const impulse=Math.min(drag*dt,config.mass*horizontalSpeed);
      this.body.applyImpulse({x:-vel.x/horizontalSpeed*impulse,y:0,z:-vel.z/horizontalSpeed*impulse},false);
    }
    // Live engine torque can overcome rollback; passive engine drag only brakes.
    const powered=this.drivetrain.engine&&drive.force*this.drivetrain.gear>0;
    const brakes:number[]=[],gripLimits:number[]=[];
    for(let i=0;i<4;i++){
      // Ackermann geometry: the inside wheel follows the tighter radius.
      const {x,z}=wheelCenter(i);
      const wheelSteer=i<2&&Math.abs(steer)>.0001?Math.sign(steer)*Math.atan(config.wheelbase/(config.wheelbase/Math.tan(Math.abs(steer))-x*Math.sign(steer))):0;
      this.controller.setWheelSteering(i,wheelSteer);
      const support=this.wheelSupport(i,position,rotation,wheelSteer);
      this.controller.setWheelRadius(i,support?.radius??config.wheelRadius);
      this.controller.setWheelChassisConnectionPointCs(i,support?.connection??{x,y:.02,z});
      const length=clamp(this.controller.wheelSuspensionLength(i)??dynamics.suspensionRestLength,.08,dynamics.suspensionRestLength+dynamics.suspensionTravel);
      const wheelPoint=new T.Vector3(x,.02-length-config.wheelRadius,z).applyQuaternion(rotation).add(position);
      const grass=!support&&this.surfaceAt(wheelPoint)==='grass';
      // Each tyre responds to the surface underneath it, including split verges.
      // Previous-step spring load includes acceleration/braking load transfer.
      const load=this.controller.wheelIsInContact(i)?clamp(this.controller.wheelSuspensionForce(i)??0,0,dynamics.maxSuspensionForce):0;
      const lockedRear=i>=2&&drive.parkingBrake>0&&Math.abs(speed)>1;
      const ground=this.controller.wheelGroundObject(i);
      const surfaceGrip=ground&&this.traversableSurfaces.has(ground.handle)?Math.min(dynamics.asphaltGrip,ground.friction()):dynamics.asphaltGrip;
      const grip=(support?Math.min(dynamics.asphaltGrip,support.friction):grass?dynamics.grassGrip:surfaceGrip)*(lockedRear?dynamics.handbrakeGrip:1);
      const limit=load*grip;gripLimits.push(limit);
      this.controller.setWheelFrictionSlip(i,grip);
      this.controller.setWheelSideFrictionStiffness(i,lockedRear ? .65 : 1.5);
      // Service brakes act on all wheels; the handbrake holds the rear axle.
      const brakingForce=drive.braking*(i<2?dynamics.frontBrakeShare:1-dynamics.frontBrakeShare)/2+(i>=2?drive.parkingBrake/2:0);
      const rollingForce=load*(grass?dynamics.grassResistance:dynamics.rollingResistance);
      const direction=new T.Vector3(Math.sin(wheelSteer),0,Math.cos(wheelSteer)).applyQuaternion(rotation);
      const wheelVelocity=this.body.velocityAtPoint(wheelPoint),wheelSpeed=direction.dot(wheelVelocity);
      const edge=i<2&&!support?this.wheelEdge(i,direction,new T.Vector3(0,1,0).applyQuaternion(rotation),drive.force):undefined;
      // A finite tyre can touch a curb before the downward suspension ray
      // reaches it. Redirect this wheel's existing axle force into its rolling
      // tangent instead of applying another drive impulse on the flat road.
      // Use the measured contact load as well when the road ray is unloaded.
      const tractionLimit=edge?Math.min(grip,edge.friction)*(load+(this.tyreContactForces.get(this.tyres[i].handle)??0)):limit;
      const force=tyreForces(i<2?drive.force/2:0,brakingForce+rollingForce,tractionLimit,wheelSpeed,dt,powered);
      this.controller.setWheelEngineForce(i,edge&&force.engine?0:force.engine);this.controller.setWheelBrake(i,force.brake);
      if(edge&&force.engine)this.body.applyImpulseAtPoint(edge.tangent.multiplyScalar(force.engine*dt),edge.point,true);
      brakes.push(Math.min(brakingForce,Math.max(0,force.brake/dt-rollingForce)));
    }
    this.controller.updateVehicle(dt,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,c=>c.handle!==this.collider.handle&&!this.tyreHandles.has(c.handle));
    // Update the solid tyre poses after the new suspension rays, before contact
    // resolution. A curb impact must not use last frame's wheel height.
    for(let i=0;i<4;i++){
      const length=clamp(this.controller.wheelSuspensionLength(i)??dynamics.suspensionRestLength,.08,dynamics.suspensionRestLength+dynamics.suspensionTravel);
      const {x,z}=wheelCenter(i);
      this.tyres[i].setTranslationWrtParent({x,y:.02-length,z});
      this.tyres[i].setRotationWrtParent(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),this.controller.wheelSteering(i)??0).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2)));
    }
    // At rest, static tyre friction balances the component of gravity along
    // the road. Integrate this as a force alongside gravity: a whole-step
    // impulse arrives before Rapier's gravity substeps and creeps uphill.
    let staticTyreForce:T.Vector3|undefined;
    if(Math.abs(speed)<.15&&horizontalSpeed<.15&&(drive.braking>100||drive.parkingBrake>0)){
      const normal=new T.Vector3();let contacts=0,holdingForce=0;
      for(let i=0;i<4;i++)if(this.controller.wheelIsInContact(i)){
        normal.add(this.controller.wheelContactNormal(i)!);contacts++;
        holdingForce+=Math.min(brakes[i],gripLimits[i]);
      }
      if(contacts>=2){
        normal.normalize();
        const tangent=new T.Vector3(-normal.x*normal.y,1-normal.y*normal.y,-normal.z*normal.y).multiplyScalar(config.mass*9.81);
        if(holdingForce>=tangent.length()){
          staticTyreForce=tangent;
          this.body.addForce(staticTyreForce,false);
        }
      }
    }
    for(const a of [0,2]){
      const b=a+1;if(!this.controller.wheelIsInContact(a)||!this.controller.wheelIsInContact(b))continue;
      const force=clamp(((this.controller.wheelSuspensionLength(b)??0)-(this.controller.wheelSuspensionLength(a)??0))*dynamics.antiRollStiffness,-1500,1500);
      this.body.applyImpulseAtPoint({x:0,y:force*dt,z:0},this.controller.wheelContactPoint(a)!,false);
      this.body.applyImpulseAtPoint({x:0,y:-force*dt,z:0},this.controller.wheelContactPoint(b)!,false);
    }
    this.tyreContactForces.clear();
    this.world.timestep=dt;this.world.step(this.queue,this.hooks);
    // User forces persist in Rapier. Remove only this step's static friction,
    // preserving external forces and allowing immediate rollback on release.
    if(staticTyreForce)this.body.addForce(staticTyreForce.negate(),false);
    this.collisionHold=Math.max(0,this.collisionHold-dt);
    // Front and rear axles can touch the same curb seconds apart. Keep that
    // local impact episode until the whole footprint clears it, even in the
    // air. A whole-course curb mesh must still permit later, separate hits.
    const bodyPosition=this.body.translation(),bodyRotation=this.body.rotation();
    const heading=new T.Vector3(0,0,1).applyQuaternion(bodyRotation),yaw=Math.atan2(heading.x,heading.z);
    const sin=Math.sin(yaw),cos=Math.cos(yaw);
    for(const [handle,point]of this.impactPatches){
      const dx=point.x-bodyPosition.x,dz=point.z-bodyPosition.z;
      if(!this.world.getCollider(handle)||Math.abs(dx*cos-dz*sin)>config.width/2||Math.abs(dx*sin+dz*cos)>config.length/2)this.impactPatches.delete(handle);
    }
    // CCD may resolve a brief impact before the final manifolds are refreshed,
    // leaving separated contacts with no stored impulses. Force events retain
    // that physical hit without counting inactive predictive contact pairs.
    this.queue.drainContactForceEvents(event=>{
      const a=event.collider1(),b=event.collider2(),own=(h:number)=>h===this.collider.handle||this.tyreHandles.has(h);
      if(event.totalForceMagnitude()<=0)return;
      const tyre=this.tyreHandles.has(a)?a:this.tyreHandles.has(b)?b:undefined;
      if(tyre!==undefined)this.tyreContactForces.set(tyre,(this.tyreContactForces.get(tyre)??0)+event.totalForceMagnitude());
      if(own(a)&&this.obstacles.has(b))this.recordImpact(this.world.getCollider(a),this.world.getCollider(b));
      else if(own(b)&&this.obstacles.has(a))this.recordImpact(this.world.getCollider(b),this.world.getCollider(a));
    });
    this.queue.clear();
    // Rapier can retain a pair across teleports and emit its "started" event
    // while the shapes are still separated by its prediction distance. Read
    // touching or impulse-bearing contacts so resets and near misses report
    // correctly, including curb impacts resolved before shapes penetrate.
    const contacts=new Set<string>();
    for(const own of [this.collider,...this.tyres])this.world.contactPairsWith(own,other=>{
      if(!this.obstacles.has(other.handle))return;
      let touching=false;
      this.world.contactPair(own,other,manifold=>{
        for(let i=0;i<manifold.numContacts();i++)if(manifold.contactDist(i)<=0||manifold.contactImpulse(i)>0){touching=true;break;}
      });
      if(touching){
        const a=own.handle,b=other.handle,key=a<b?`${a}:${b}`:`${b}:${a}`;
        contacts.add(key);
        if(!this.contactPairs.has(key))this.recordImpact(own,other);
      }
    });
    this.contactPairs=contacts;
    this.collision=this.contactPairs.size>0||this.collisionHold>0||this.impactPatches.size>0;
    this.updateFailedLaunch(dt,input);
  }
  private updateFailedLaunch(dt:number,input:Input){
    const p=this.body.translation(),v=this.body.linvel(),q=this.body.rotation(),angular=this.body.angvel(),d=this.drivetrain;
    if(this.stuckOrigin&&Math.hypot(p.x-this.stuckOrigin.x,p.z-this.stuckOrigin.z)>=1)this.stuckOrigin=undefined;
    if(this.stuckOrigin)return;
    const supported=[0,1,2,3].filter(i=>this.controller.wheelIsInContact(i)).length>=2;
    const attempting=input.down('throttle')&&!input.down('brake')&&!input.down('clutch')&&d.throttle>.2&&d.engine&&d.gear!==0&&d.clutch<.85&&d.brake<.1&&!d.handbrake;
    if(!attempting||!supported||1-2*(q.x*q.x+q.z*q.z)<=.75||Math.hypot(v.x,v.y,v.z)>=.4||Math.hypot(angular.x,angular.y,angular.z)>=.4){
      this.failedLaunchTime=0;this.failedLaunchOrigin=undefined;return;
    }
    if(!this.failedLaunchOrigin||Math.hypot(p.x-this.failedLaunchOrigin.x,p.z-this.failedLaunchOrigin.z)>.5){
      this.failedLaunchOrigin={x:p.x,z:p.z};this.failedLaunchTime=0;
    }
    this.failedLaunchTime+=dt;
    if(this.failedLaunchTime>=3){this.stuckOrigin={x:p.x,z:p.z};this.failedLaunchTime=0;this.failedLaunchOrigin=undefined;}
  }
  private wheelSupport(index:number,position:RAPIER.Vector,rotation:T.Quaternion,steer:number){
    // The centre ray misses a curb or narrow railhead under the tyre. Sweep
    // the finite tyre along its suspension to find the actual supported axle
    // height, so the ray cannot extend the wheel back down into the concrete.
    const {x,z}=wheelCenter(index),root=new T.Vector3(x,.02,z).applyQuaternion(rotation).add(position);
    const up=new T.Vector3(0,1,0).applyQuaternion(rotation),down=up.clone().negate();
    const range=dynamics.suspensionRestLength+dynamics.suspensionTravel;
    const road=this.world.castRay(new RAPIER.Ray(root,down),range+config.wheelRadius,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,this.body);
    if(!road)return;
    const orientation=rotation.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),steer)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI/2));
    const support=this.world.castShape(root,orientation,down,this.tyreShape,0,range,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,this.body,c=>this.obstacles.has(c.handle)||this.traversableSurfaces.has(c.handle));
    if(!support||support.time_of_impact<=.001||up.dot(support.normal1)<.05)return;
    const traversable=this.traversableSurfaces.has(support.collider.handle);
    // The massless solid tyre is smaller by tyreClearance. Restore that
    // clearance when deciding whether a shallow rail already supports it;
    // otherwise a rail introduces a spurious 17 mm suspension step.
    const rise=road.timeOfImpact-config.wheelRadius-support.time_of_impact+(traversable?tyreClearance:0);
    if(rise<=.001||rise>=config.wheelRadius)return;
    const ground=root.clone().addScaledVector(down,road.timeOfImpact);
    if(new T.Vector3().copy(support.witness1).sub(ground).dot(up)>=config.wheelRadius-.02)return;
    const center=root.clone().addScaledVector(down,support.time_of_impact);
    const point=new T.Vector3().copy(support.witness1);
    const offset=point.sub(center);offset.addScaledVector(down,-offset.dot(down));
    // Cast inside the 2 cm bevel, away from its almost vertical side face.
    // Use that fresh ray's distance to retain the shape sweep's axle height
    // with the same clearance as the ordinary road ray, including when the
    // ray lands on the higher top of the bevel.
    offset.addScaledVector(new T.Vector3(support.normal1.x,0,support.normal1.z),traversable?-.003:-.03);
    const shiftedRoot=root.add(offset);
    const ray=this.world.castRayAndGetNormal(new RAPIER.Ray(shiftedRoot,down),range+config.wheelRadius,true,RAPIER.QueryFilterFlags.EXCLUDE_SENSORS,undefined,undefined,this.body);
    if(!ray||up.dot(ray.normal)<.25)return;
    if(shiftedRoot.clone().addScaledVector(down,ray.timeOfImpact).sub(ground).dot(up)>=config.wheelRadius-.02)return;
    const radius=Math.min(config.wheelRadius,ray.timeOfImpact-support.time_of_impact+tyreClearance);
    if(radius<.01)return;
    const connection=shiftedRoot.sub(position).applyQuaternion(rotation.clone().invert());
    return {radius,connection,friction:support.collider.friction()};
  }
  private wheelEdge(index:number,forward:T.Vector3,up:T.Vector3,engineForce:number){
    if(Math.abs(engineForce)<.001)return;
    const tyre=this.tyres[index],center=new T.Vector3().copy(tyre.translation()),axle=new T.Vector3().crossVectors(up,forward).normalize();
    let closest:{distance:number;point:T.Vector3;tangent:T.Vector3;friction:number}|undefined;
    this.world.contactPairsWith(tyre,other=>{
      if(!this.obstacles.has(other.handle)||other.isSensor())return;
      const contact=tyre.contactCollider(other,.002);
      if(!contact)return;
      const normal=new T.Vector3().copy(contact.normal2),point=new T.Vector3().copy(contact.point2);
      // Only an edge below the axle and opposing powered rolling. A vertical
      // wall, sidewall scrape or a contact on top of the wheel supplies no lift.
      const rise=normal.dot(up);
      if(normal.y<=.05||rise<=.05||rise>=.98||normal.dot(forward)*Math.sign(engineForce)>=-.02||point.clone().sub(center).dot(up)>=-.01||Math.abs(normal.dot(axle))>.8)return;
      const tangent=new T.Vector3().crossVectors(axle,normal).normalize();
      if(!closest||contact.distance<closest.distance)closest={distance:contact.distance,point,tangent,friction:other.friction()};
    });
    return closest;
  }
  private recordImpact(own:RAPIER.Collider,obstacle:RAPIER.Collider){
    this.collisionHold=.35;
    if(this.impactPatches.has(obstacle.handle))return;
    const hit=obstacle.projectPoint(own.translation(),false);
    if(hit)this.impactPatches.set(obstacle.handle,{x:hit.point.x,z:hit.point.z});
  }
  telemetry():VehicleTelemetry{
    const p=this.body.translation(),q=this.body.rotation(),v=this.body.linvel();
    const dir=new T.Vector3(0,0,1).applyQuaternion(new T.Quaternion(q.x,q.y,q.z,q.w));const yaw=Math.atan2(dir.x,dir.z);
    // Ground speed follows the supporting road plane, including sideways
    // slipping. Suspension velocity along its normal is not road travel.
    // With no stable support, keep reporting horizontal airborne motion.
    const groundNormal=new T.Vector3();let supportingWheels=0;
    for(let i=0;i<4;i++)if(this.controller.wheelIsInContact(i)){
      const normal=this.controller.wheelContactNormal(i);
      if(normal&&normal.y>.25){groundNormal.add(normal);supportingWheels++;}
    }
    let speed=Math.hypot(v.x,v.z);
    if(supportingWheels>=2){
      groundNormal.normalize();
      const normalSpeed=v.x*groundNormal.x+v.y*groundNormal.y+v.z*groundNormal.z;
      speed=Math.hypot(v.x-groundNormal.x*normalSpeed,v.y-groundNormal.y*normalSpeed,v.z-groundNormal.z*normalSpeed);
    }
    const d=this.drivetrain;
    return {time:this.time,position:{x:p.x,z:p.z},yaw,speed,signedSpeed:v.x*dir.x+v.y*dir.y+v.z*dir.z,rpm:d.rpm,gear:d.gear,throttle:d.throttle,brake:d.brake,clutch:d.clutch,steering:this.steering.normalized,engine:d.engine,stalled:d.stalled,belt:this.belt,handbrake:d.handbrake,indicator:this.indicator,hazards:this.hazards,ignition:this.ignitionOn||d.engine,positionLights:this.positionLights||this.headlights,headlights:this.headlights,fogLights:this.fogLights&&this.canUseFogLights,bumper:localPoint(p,yaw,0,config.length/2),wheels:[0,1,2,3].map(i=>{const {x,z}=wheelCenter(i);return localPoint(p,yaw,x,z);}),collision:this.collision};
  }
  dispose(){this.queue.free();this.world.removeVehicleController(this.controller);this.world.removeRigidBody(this.body);}
}
