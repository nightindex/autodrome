import * as T from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Vehicle } from '../simulation/vehicle';
import type { Settings, Vec2 } from '../types';
import { CourseWorld,roadDistance } from './course-world';
import { course, hillHeight } from '../data/course';
import { intersectionApproaches } from '../data/intersection';
import { vehicleConfig } from '../data/vehicle';
import { CobaltVisuals } from './cobalt-visuals';
import { CabinControls } from './cabin-controls';
import { stableShadowTarget,shadowSpan,sunOffset } from './shadow-stability';
import { rigCarWheel,updateCarWheel,carBodyLift,type CarWheel } from './car-wheels';
import { configureCarShadows } from './car-shadows';
import { carAssetVersion } from './car-asset-version';
import { moveMirrorAngle,readMirrorAdjustments,sideMirrorDirection,type MirrorAdjustments } from './mirror-adjustment';

export class GameScene {
  onCabinMirrorSwitch:()=>void=()=>{};
  cabinInteractionEnabled=false;cabinControlLabel='Регулировка зеркал';
  private cabinControls:CabinControls|undefined;
  scene=new T.Scene();camera=new T.PerspectiveCamera(52,1,.06,600);renderer:T.WebGLRenderer;
  car=new T.Group();cameraMode:'chase'|'cockpit'|'overview'='chase';world:CourseWorld;
  private sun=new T.DirectionalLight(0xfff1d4,2.4);
  private wheels:CarWheel[]=[];private bodyLift=0;
  private steering:T.Object3D|undefined;private steeringBase=new T.Quaternion();
  private cobalt:CobaltVisuals|undefined;
  private guide=new T.Group();private goal=new T.Group();
  private mirrorCamera=new T.PerspectiveCamera(20,3.2,.025,120);private mirrorTarget=new T.WebGLRenderTarget(512,160);
  private cabinMirror:T.Mesh|undefined;private mirrorFrustum=new T.Frustum();private mirrorProjection=new T.Matrix4();
  private sideTargets=[new T.WebGLRenderTarget(256,144),new T.WebGLRenderTarget(256,144)];
  private sideMirrors:(T.Mesh|undefined)[]=[];private sideMirrorPositions:T.Vector3[]=[];
  private sideMirrorPivots:T.Group[]=[];
  private mirrorAdjustments=readMirrorAdjustments(null);private mirrorAngles=readMirrorAdjustments(null);
  private quality:Settings['quality']|undefined;private frameCount=0;private fpsTime=0;fps=0;
  loaded=false;carError='';
  renderStats={calls:0,triangles:0};
  constructor(container:HTMLElement,vehicle:Vehicle){
    this.renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
    this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.65;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFShadowMap;container.append(this.renderer.domElement);
    this.scene.background=new T.Color(0xb6d0d0);this.scene.fog=new T.FogExp2(0xc1d2cb,.0035);
    const sky=new Sky();sky.scale.setScalar(450000);const u=sky.material.uniforms;u.turbidity.value=3;u.rayleigh.value=1.6;u.mieCoefficient.value=.004;u.mieDirectionalG.value=.82;
    const sunVector=sunOffset.clone().normalize();u.sunPosition.value.copy(sunVector);this.scene.add(sky);
    const pmrem=new T.PMREMGenerator(this.renderer);const environmentScene=new T.Scene();environmentScene.add(sky.clone());this.scene.environment=pmrem.fromScene(environmentScene,.04).texture;pmrem.dispose();
    this.scene.environmentIntensity=.18;this.scene.add(new T.HemisphereLight(0xe0f1ff,0x7b8462,.65));this.sun.position.copy(sunVector.multiplyScalar(50));this.sun.castShadow=true;
    Object.assign(this.sun.shadow.camera,{left:-shadowSpan/2,right:shadowSpan/2,top:shadowSpan/2,bottom:-shadowSpan/2,near:1,far:110});this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.018;this.sun.shadow.radius=1.5;
    this.scene.add(this.sun,this.sun.target);
    this.world=new CourseWorld(vehicle.world);vehicle.obstacles=this.world.obstacles;vehicle.surfaceAt=point=>roadDistance(point)<=0?'asphalt':'grass';this.scene.add(this.world.group,this.car,this.guide,this.goal);
    this.createGuide();
    window.addEventListener('resize',()=>this.resize());this.resize();
  }
  async loadCar(onProgress:(value:number)=>void){
    try{
      const gltf=await new GLTFLoader().loadAsync(`/assets/cobalt.glb?v=${carAssetVersion}`,e=>onProgress(e.total?e.loaded/e.total:.5));
      const model=gltf.scene;const rawBox=new T.Box3().setFromObject(model);const scale=vehicleConfig.length/rawBox.getSize(new T.Vector3()).z;
      model.scale.setScalar(scale);model.rotation.y=Math.PI;model.updateMatrixWorld(true);
      const box=new T.Box3().setFromObject(model);model.position.y=-.62-box.min.y;this.car.add(model);this.car.updateMatrixWorld(true);
      const wheelNodes:T.Object3D[]=[];
      model.traverse(n=>{
        if(n.name.startsWith('wheel_rf_dummy'))wheelNodes.push(n);
        if(n.name==='steering_dummy')this.steering=n;
        if(n.name==='COBALT_STEERING_ASSEMBLY')this.steering=n;
        if(n instanceof T.Mesh){configureCarShadows(n);
          const mats=Array.isArray(n.material)?n.material:[n.material];mats.forEach((m,index)=>{
          if(m instanceof T.MeshStandardMaterial){m.envMapIntensity=m.metalness>.4?2.2:m.roughness>.65?.4:1.15;if(m.transparent)m.depthWrite=false;}
          const sideIndex=m.name==='COBALT_SideMirrorLeft'?0:m.name==='COBALT_SideMirrorRight'?1:-1;
          if(m.name==='COBALT_RearViewMirror'||sideIndex>=0){
            // Expand only the selected pane's triangles: source door primitives
            // can share an accessor with their much larger housing.
            if(n.geometry.index)n.geometry=n.geometry.toNonIndexed();
            const p=n.geometry.getAttribute('position'),points:T.Vector3[]=[],bounds=new T.Box3();
            for(let i=0;i<p.count;i++){
              const point=this.car.worldToLocal(n.localToWorld(new T.Vector3().fromBufferAttribute(p,i)));
              points.push(point);bounds.expandByPoint(point);
            }
            // +X is the driver's left: upright, horizontally reversed rear view.
            const uv=new Float32Array(p.count*2);
            points.forEach((point,i)=>{uv[i*2]=(point.x-bounds.min.x)/(bounds.max.x-bounds.min.x);uv[i*2+1]=(point.y-bounds.min.y)/(bounds.max.y-bounds.min.y);});
            n.geometry.setAttribute('uv',new T.BufferAttribute(uv,2));
            const display=new T.MeshBasicMaterial({name:m.name,map:sideIndex<0?this.mirrorTarget.texture:this.sideTargets[sideIndex].texture,toneMapped:false});
            if(Array.isArray(n.material))n.material[index]=display;else n.material=display;
            if(sideIndex<0)this.cabinMirror=n;else {this.sideMirrors[sideIndex]=n;this.sideMirrorPositions[sideIndex]=bounds.getCenter(new T.Vector3());}
            n.castShadow=false;
          }
        });}
      });
      // Move just the glass onto its actuator pivot; the painted housing stays
      // fixed. Attach after traversal so reparenting cannot skip source meshes.
      this.sideMirrors.forEach((pane,i)=>{
        if(!pane)return;const pivot=new T.Group();pivot.name=`mirror-actuator-${i}`;
        pivot.position.copy(this.sideMirrorPositions[i]);this.car.add(pivot);pivot.attach(pane);this.sideMirrorPivots[i]=pivot;
      });
      for(const n of wheelNodes)this.wheels.push(rigCarWheel(this.car,n));
      this.bodyLift=carBodyLift(this.wheels);
      // Soft daylight bounced inside the cabin. Its short, shadow-free range
      // lifts the footwells and moulded controls without brightening the course.
      const cabinBounce=new T.PointLight(0xfff4de,.14,1.65,2);cabinBounce.position.set(0,.59,.52);cabinBounce.name='cabin-daylight-bounce';this.car.add(cabinBounce);
      if(this.steering){const badge=model.getObjectByName('COBALT_STEERING_BADGE');if(badge)this.steering.attach(badge);this.steeringBase.copy(this.steering.quaternion);}
      this.cobalt=new CobaltVisuals(model);
      this.cabinControls=new CabinControls(this.car,this.camera,this.renderer.domElement,()=>this.onCabinMirrorSwitch());
      this.loaded=true;onProgress(1);
    }catch(error){this.carError=String(error);throw error;}
  }
  private createGuide(){
    const material=new T.MeshBasicMaterial({color:0xe7bd60,transparent:true,opacity:.85,depthWrite:false});
    const shape=new T.Shape();shape.moveTo(-.3,-.3);shape.lineTo(0,.25);shape.lineTo(.3,-.3);shape.lineTo(0,-.04);shape.closePath();
    const geometry=new T.ShapeGeometry(shape);
    const transforms:T.Matrix4[]=[];
    const junction={minX:Math.min(...intersectionApproaches.map(a=>a.stop.x))-3,maxX:Math.max(...intersectionApproaches.map(a=>a.stop.x))+3,minZ:Math.min(...intersectionApproaches.map(a=>a.stop.z))-3,maxZ:Math.max(...intersectionApproaches.map(a=>a.stop.z))+3};
    let remaining=0;
    for(let i=1;i<course.route.length;i++){
      const a=course.route[i-1],b=course.route[i],dx=b.x-a.x,dz=b.z-a.z,len=Math.hypot(dx,dz);
      for(let d=remaining;d<len;d+=3){const x=a.x+dx*d/len,z=a.z+dz*d/len;
        // Keep navigation chevrons off the junction's zebra/stop/turn markings.
        if(x>junction.minX&&x<junction.maxX&&z>junction.minZ&&z<junction.maxZ)continue;
        const arrow=new T.Object3D();arrow.rotation.set(-Math.PI/2,0,Math.PI+Math.atan2(dx,dz));arrow.position.set(x,hillHeight(x,z)+.075,z);arrow.updateMatrix();transforms.push(arrow.matrix.clone());}remaining=(remaining-len)%3+3;
    }
    const arrows=new T.InstancedMesh(geometry,material,transforms.length);transforms.forEach((m,i)=>arrows.setMatrixAt(i,m));this.guide.add(arrows);
    const ring=new T.Mesh(new T.RingGeometry(1.6,1.72,48),new T.MeshBasicMaterial({color:0xedd18b,transparent:true,opacity:.9,side:T.DoubleSide}));ring.rotation.x=-Math.PI/2;this.goal.add(ring);
    const beam=new T.Mesh(new T.CylinderGeometry(.03,.03,2.3,8),new T.MeshBasicMaterial({color:0xedd18b,transparent:true,opacity:.6}));beam.position.y=1.15;this.goal.add(beam);
  }
  setGoal(point:Vec2,visible:boolean){this.goal.position.set(point.x,hillHeight(point.x,point.z)+.06,point.z);this.goal.visible=visible;this.guide.visible=visible;}
  setCurbStyle(style:Settings['curbStyle']){this.world.setCurbStyle(style);}
  setQuality(q:Settings['quality']){if(this.quality===q)return;this.quality=q;this.world.setTreeQuality(q);const mirrorScale=q==='low'?.5:q==='medium'?.75:1;this.mirrorTarget.setSize(512*mirrorScale,160*mirrorScale);for(const target of this.sideTargets)target.setSize(256*mirrorScale,144*mirrorScale);this.renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?1.75:q==='medium'?1.25:1));this.renderer.shadowMap.enabled=q!=='low';this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.resize();}
  resize(){const w=window.innerWidth,h=window.innerHeight;this.renderer.setSize(w,h);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();}
  cycleCamera(){this.cameraMode=this.cameraMode==='chase'?'cockpit':this.cameraMode==='cockpit'?'overview':'chase';}
  setMirrorAdjustments(value:MirrorAdjustments){this.mirrorAdjustments=readMirrorAdjustments(value);}
  render(vehicle:Vehicle,dt:number,time:number,menu:boolean,look:number){
    const p=vehicle.body.translation(),r=vehicle.body.rotation();this.car.position.set(p.x,p.y,p.z);this.car.quaternion.set(r.x,r.y,r.z,r.w);
    if(menu)this.car.position.y=hillHeight(p.x,p.z)+.63;else this.car.translateY(this.bodyLift);
    const t=vehicle.telemetry();
    for(const w of this.wheels)updateCarWheel(w,vehicle.controller,vehicle.time===0,menu,this.bodyLift);
    // Telemetry is the actual rack position, including optional assistance.
    if(this.steering)this.steering.quaternion.copy(this.steeringBase).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-t.steering*4.2));
    this.cobalt?.update(t,dt);
    (['left','right'] as const).forEach((side,i)=>{
      const angles=this.mirrorAngles[side],target=this.mirrorAdjustments[side];
      angles.yaw=moveMirrorAngle(angles.yaw,target.yaw,dt);angles.pitch=moveMirrorAngle(angles.pitch,target.pitch,dt);
      this.sideMirrorPivots[i]?.rotation.set(T.MathUtils.degToRad(angles.pitch),T.MathUtils.degToRad(angles.yaw),0);
    });
    const pos=this.car.position.clone(),forward=new T.Vector3(0,0,1).applyQuaternion(this.car.quaternion);
    this.camera.clearViewOffset();
    if(menu){const a=.75+Math.sin(time*.025)*.25;const desired=new T.Vector3(p.x+Math.sin(a)*8,p.y+2.6,p.z+Math.cos(a)*8);this.camera.position.lerp(desired,1-Math.exp(-dt*2));this.camera.lookAt(p.x,p.y+.1,p.z);this.camera.fov=48;this.camera.setViewOffset(window.innerWidth,window.innerHeight,-window.innerWidth*.14,0,window.innerWidth,window.innerHeight);}
    else if(this.cameraMode==='cockpit'){
      this.camera.position.copy(new T.Vector3(.31,.48,.2).applyQuaternion(this.car.quaternion).add(pos));
      const target=new T.Vector3(Math.sin(look*.85),-.025,Math.cos(look*.85)).applyQuaternion(this.car.quaternion).multiplyScalar(10).add(this.camera.position);this.camera.lookAt(target);this.camera.fov=70;
    }else if(this.cameraMode==='overview'){
      this.camera.position.lerp(new T.Vector3(p.x,p.y+32,p.z-8),1-Math.exp(-dt*5));this.camera.lookAt(p.x,p.y,p.z);this.camera.fov=52;
    }else{
      const desired=pos.clone().addScaledVector(forward,-7.3-Math.min(2,t.speed*.14)).add(new T.Vector3(0,3.4,0));
      this.camera.position.lerp(desired,1-Math.exp(-dt*5));this.camera.lookAt(pos.clone().addScaledVector(forward,2).add(new T.Vector3(0,.65,0)));this.camera.fov=52;
    }
    this.camera.updateProjectionMatrix();
    // Anchor to the road rather than the bouncing chassis or the camera.
    const shadowTarget=stableShadowTarget(new T.Vector3(p.x,hillHeight(p.x,p.z),p.z),this.sun.shadow.mapSize.x);
    this.sun.position.copy(shadowTarget).add(sunOffset);this.sun.target.position.copy(shadowTarget);this.sun.target.updateMatrixWorld();
    this.world.update(vehicle.time);this.goal.rotation.y=Math.sin(time)*.05;
    const renderer=this.renderer;
    this.camera.updateMatrixWorld();
    this.car.updateMatrixWorld(true);
    if(this.cabinControls){this.cabinControls.label=this.cabinControlLabel;this.cabinControls.update(this.cabinInteractionEnabled&&!menu&&this.cameraMode==='cockpit');}
    const panes=[this.cabinMirror,...this.sideMirrors];
    this.mirrorFrustum.setFromProjectionMatrix(this.mirrorProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));
    const eligible=panes.flatMap((pane,i)=>pane&&!menu&&this.mirrorFrustum.intersectsObject(pane)?[i]:[]);
    if(!menu&&eligible.length){
      // A visible mirror must use this frame's car pose. Save work by skipping
      // offscreen panes and scaling target resolution, never by delaying frames.
      for(const which of eligible){
        let target=this.mirrorTarget;
        this.mirrorCamera.up.set(0,1,0).applyQuaternion(this.car.quaternion);
        if(which===0){
          // Digital rear-camera mirror: a wide exterior view, clear of the
          // rear seats and headrests, with the road below the horizon.
          this.mirrorCamera.position.copy(this.car.localToWorld(new T.Vector3(0,.55,-vehicleConfig.length/2-.025)));
          this.mirrorCamera.lookAt(this.car.localToWorld(new T.Vector3(0,-.45,-12.26)));this.mirrorCamera.aspect=3.2;this.mirrorCamera.fov=42;
        }
        else{const i=which-1,side=i===0?1:-1;
          this.mirrorCamera.position.copy(this.car.localToWorld(this.sideMirrorPositions[i].clone()));
          this.mirrorCamera.position.add(new T.Vector3(-side*.48,0,-.88).applyQuaternion(this.car.quaternion).multiplyScalar(.012));
          const angles=this.mirrorAngles[i===0?'left':'right'];
          // Turning mirror glass deflects its reflected view by twice the angle.
          const back=sideMirrorDirection(i===0?'left':'right',angles).applyQuaternion(this.car.quaternion);this.mirrorCamera.lookAt(this.mirrorCamera.position.clone().addScaledVector(back,20));this.mirrorCamera.aspect=1.78;this.mirrorCamera.fov=62;target=this.sideTargets[i];}
        this.mirrorCamera.updateProjectionMatrix();
        const carVisible=this.car.visible,glassVisible=panes.map(pane=>pane?.visible),autoShadow=renderer.shadowMap.autoUpdate,previousTarget=renderer.getRenderTarget();
        this.car.visible=false;panes.forEach(pane=>{if(pane)pane.visible=false;});
        renderer.shadowMap.autoUpdate=false;
        try{renderer.setRenderTarget(target);renderer.render(this.scene,this.mirrorCamera);}
        finally{renderer.setRenderTarget(previousTarget);renderer.shadowMap.autoUpdate=autoShadow;this.car.visible=carVisible;panes.forEach((pane,i)=>{if(pane)pane.visible=glassVisible[i]!;});}
      }
    }
    // All three feeds are drawn directly on their physical mirror surfaces.
    renderer.setScissorTest(false);renderer.setViewport(0,0,window.innerWidth,window.innerHeight);renderer.render(this.scene,this.camera);
    this.renderStats={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
    this.frameCount++;this.fpsTime+=dt;if(this.fpsTime>=1){this.fps=Math.round(this.frameCount/this.fpsTime);this.frameCount=0;this.fpsTime=0;}
  }
}
