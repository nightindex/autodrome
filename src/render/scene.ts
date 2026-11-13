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
import {fitCarDimensions} from './car-dimensions';
import {fitCarTyreProfile} from './car-tyre-profile';
import {CabinExamDisplay,type CabinExamDisplayState} from './cabin-exam-display';
import type {PracticeHint} from '../simulation/practice-guide';
import type {Exercise} from '../types';
import { moveMirrorAngle,readMirrorAdjustments,sideMirrorDirection,sideMirrorView,type MirrorAdjustments } from './mirror-adjustment';
import {readCockpitView,cockpitEyePosition,cockpitVerticalFov,type CockpitView} from './cockpit-view';
import {VehicleMotion} from './vehicle-motion';
import {createCourseShadowLight,configureCourseShadowReceivers} from './course-shadows';
import {createCarShadowBatches,detailShadowLayer} from './car-shadow-batches';
import {touchDevice} from '../device';

export class GameScene {
  onCabinMirrorSwitch:()=>void=()=>{};
  cabinInteractionEnabled=false;cabinControlLabel='Регулировка зеркал';
  private cabinControls:CabinControls|undefined;
  scene=new T.Scene();camera=new T.PerspectiveCamera(52,1,.06,600);renderer:T.WebGLRenderer;
  car=new T.Group();cameraMode:'chase'|'cockpit'|'overview'='chase';world:CourseWorld;
  private sun=new T.DirectionalLight(0xfff1d4,2.4);
  private distantSun:T.DirectionalLight;
  private wheels:CarWheel[]=[];private bodyLift=0;
  private cabinEye=new T.Vector3(.31,.48,.2);
  private cockpitView=readCockpitView(null);
  get cockpitEye(){return cockpitEyePosition(this.cabinEye,this.cockpitView);}
  setCockpitView(value:CockpitView){this.cockpitView=readCockpitView(value);}
  private steering:T.Object3D|undefined;private steeringBase=new T.Quaternion();
  private motion=new VehicleMotion();
  private cobalt:CobaltVisuals|undefined;
  private examDisplay:CabinExamDisplay|undefined;
  private guide=new T.Group();private goal=new T.Group();
  private mirrorCamera=new T.PerspectiveCamera(20,3.2,.025,120);private mirrorTarget=new T.WebGLRenderTarget(512,160);
  private cabinMirror:T.Mesh|undefined;private mirrorFrustum=new T.Frustum();private mirrorProjection=new T.Matrix4();
  // Retain daylight highlights until the mirror surface is tone mapped on
  // screen. Byte targets clipped white paint and erased the handle contours.
  private sideTargets=[new T.WebGLRenderTarget(512,288,{type:T.HalfFloatType}),new T.WebGLRenderTarget(512,288,{type:T.HalfFloatType})];
  private sideMirrors:(T.Mesh|undefined)[]=[];private sideMirrorPositions:T.Vector3[]=[];
  private sideMirrorPivots:T.Group[]=[];
  private mirrorAdjustments=readMirrorAdjustments(null);private mirrorAngles=readMirrorAdjustments(null);
  private quality:Settings['quality']|undefined;private frameCount=0;private fpsTime=0;fps=0;
  loaded=false;prepared=false;carError='';
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
    this.world=new CourseWorld(vehicle.world);vehicle.obstacles=this.world.obstacles;vehicle.traversableSurfaces=this.world.traversableSurfaces;vehicle.surfaceAt=point=>roadDistance(point)<=0?'asphalt':'grass';this.scene.add(this.world.group,this.car,this.guide,this.goal);
    this.distantSun=createCourseShadowLight(this.world.group);this.scene.add(this.distantSun,this.distantSun.target);
    this.sun.shadow.camera.layers.set(detailShadowLayer);
    this.world.group.traverse(node=>{if(node instanceof T.Mesh&&node.castShadow&&node.layers.isEnabled(0))node.layers.enable(detailShadowLayer);});
    configureCourseShadowReceivers(this.world.group);
    this.createGuide();
    // Course animation changes materials and wind uniforms, never transforms.
    // Keep its local matrices and update world matrices once before all views.
    this.world.group.traverse(node=>{node.updateMatrix();node.matrixAutoUpdate=false;});
    this.scene.matrixAutoUpdate=false;this.scene.matrixWorldAutoUpdate=false;
    window.addEventListener('resize',()=>this.resize());this.resize();
  }
  async loadCar(onProgress:(value:number|undefined)=>void){
    try{
      const gltf=await new GLTFLoader().loadAsync(`/assets/cobalt.glb?v=${carAssetVersion}`,e=>onProgress(e.total?e.loaded/e.total:undefined));
      const model=gltf.scene;const rawBox=new T.Box3().setFromObject(model);const scale=vehicleConfig.length/rawBox.getSize(new T.Vector3()).z;
      model.scale.setScalar(scale);model.rotation.y=Math.PI;model.updateMatrixWorld(true);
      const box=new T.Box3().setFromObject(model);model.position.y=-.62-box.min.y;this.car.add(model);this.car.updateMatrixWorld(true);
      const wheelNodes:T.Object3D[]=[];
      model.traverse(n=>{if(n.name.startsWith('wheel_rf_dummy'))wheelNodes.push(n);});
      for(const n of wheelNodes)this.wheels.push(rigCarWheel(this.car,n));
      const dimensions=fitCarDimensions(this.car,model,this.wheels);dimensions.mapPoint(this.cabinEye);
      for(const wheel of this.wheels)fitCarTyreProfile(wheel.pivot,vehicleConfig.rimDiameter,vehicleConfig.tyreWidth);
      this.bodyLift=carBodyLift(this.wheels);
      this.car.traverse(n=>{
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
            const display=new T.MeshBasicMaterial({name:m.name,map:sideIndex<0?this.mirrorTarget.texture:this.sideTargets[sideIndex].texture,toneMapped:sideIndex>=0});
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
      // Soft daylight bounced inside the cabin. Its short, shadow-free range
      // lifts the footwells and moulded controls without brightening the course.
      const cabinBounce=new T.PointLight(0xfff4de,.14,1.65,2);cabinBounce.position.set(0,.59,.52);cabinBounce.name='cabin-daylight-bounce';this.car.add(cabinBounce);
      if(this.steering){const badge=model.getObjectByName('COBALT_STEERING_BADGE');if(badge)this.steering.attach(badge);this.steeringBase.copy(this.steering.quaternion);}
      this.cobalt=new CobaltVisuals(model);
      this.examDisplay=new CabinExamDisplay(model);
      this.cabinControls=new CabinControls(this.car,this.camera,this.renderer.domElement,()=>this.onCabinMirrorSwitch());
      configureCourseShadowReceivers(this.car);
      const animated=[...this.wheels.flatMap(w=>[w.pivot,w.spin]),...this.sideMirrorPivots,
        this.steering,model.getObjectByName('COBALT_INDICATOR_STALK'),model.getObjectByName('COBALT_TACH_NEEDLE'),model.getObjectByName('COBALT_MirrorSwitchKnob')]
        .filter((node):node is T.Object3D=>!!node);
      createCarShadowBatches(this.car,animated);
      this.loaded=true;onProgress(1);
    }catch(error){this.carError=String(error);throw error;}
  }
  /** Compile and upload before the loading screen releases the controls.
   * The exterior rear feed hides the car and its cabin light, so it needs
   * a different lighting program from the main view and the side mirrors. */
  async prepareForPlay(vehicle:Vehicle){
    const renderer=this.renderer,mode=this.cameraMode,carVisible=this.car.visible;
    const nextFrame=()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()));
    try{
      await this.world.whenReady();
      const textures=new Set<T.Texture>();
      this.scene.traverse(node=>{
        if(!(node instanceof T.Mesh||node instanceof T.Sprite||node instanceof T.Line||node instanceof T.Points))return;
        const materials=Array.isArray(node.material)?node.material:[node.material];
        for(const material of materials)for(const value of Object.values(material)){
          if(value instanceof T.Texture&&!value.isRenderTargetTexture&&value.source.data)textures.add(value);
        }
      });
      for(const texture of textures)renderer.initTexture(texture);
      for(const target of [this.mirrorTarget,...this.sideTargets])renderer.initRenderTarget(target);
      this.scene.updateMatrixWorld(true);
      this.car.visible=true;await renderer.compileAsync(this.scene,this.camera);
      this.car.visible=false;await renderer.compileAsync(this.scene,this.mirrorCamera);
      this.car.visible=true;
      // Real passes also prepare shadow programs, vertex buffers, reflection
      // output formats and the actual driver/side-view material variants.
      for(const [camera,look]of [['chase',0],['cockpit',0],['cockpit',1],['cockpit',-1]] as const){
        this.cameraMode=camera;this.render(vehicle,1,0,false,look);await nextFrame();
      }
      this.cameraMode=mode;this.render(vehicle,1,0,true,0);
      // Wait asynchronously for submitted GPU work instead of showing the
      // menu while texture uploads and first-pass rendering are still queued.
      const gl=renderer.getContext();
      if('fenceSync' in gl){
        const fence=gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE,0);
        if(fence){
          gl.flush();
          try{
            while(gl.clientWaitSync(fence,0,0)===gl.TIMEOUT_EXPIRED)await nextFrame();
          }finally{gl.deleteSync(fence);}
        }
      }
      this.prepared=true;
    }finally{this.cameraMode=mode;this.car.visible=carVisible;this.resetFPS();}
  }
  resetFPS(){this.fps=0;this.fpsTime=0;this.frameCount=0;}
  private createGuide(){
    const material=new T.MeshBasicMaterial({color:0xe7bd60,transparent:true,opacity:.85,depthWrite:false});
    const shape=new T.Shape();shape.moveTo(-.3,-.3);shape.lineTo(0,.25);shape.lineTo(.3,-.3);shape.lineTo(0,-.04);shape.closePath();
    const geometry=new T.ShapeGeometry(shape);
    const arrows=new T.InstancedMesh(geometry,material,64);arrows.count=0;arrows.frustumCulled=false;arrows.instanceMatrix.setUsage(T.DynamicDrawUsage);this.guide.add(arrows);
    const outline=new T.LineLoop(new T.BufferGeometry().setFromPoints([
      new T.Vector3(-vehicleConfig.width/2,0,-vehicleConfig.length/2),new T.Vector3(vehicleConfig.width/2,0,-vehicleConfig.length/2),
      new T.Vector3(vehicleConfig.width/2,0,vehicleConfig.length/2),new T.Vector3(-vehicleConfig.width/2,0,vehicleConfig.length/2),
    ]),new T.LineBasicMaterial({color:0xe7bd60,depthWrite:false}));outline.name='practice-parking-outline';outline.visible=false;this.goal.add(outline);
    this.setGoal({x:0,z:0},false);
  }
  setPracticeGuide(hint:PracticeHint,parking?:Exercise['parking']){
    this.setGoal(hint.target,true);
    const arrows=this.guide.children[0] as T.InstancedMesh,arrow=new T.Object3D();let count=0,station=2;
    const junction={minX:Math.min(...intersectionApproaches.map(a=>a.stop.x))-3,maxX:Math.max(...intersectionApproaches.map(a=>a.stop.x))+3,minZ:Math.min(...intersectionApproaches.map(a=>a.stop.z))-3,maxZ:Math.max(...intersectionApproaches.map(a=>a.stop.z))+3};
    for(let i=1;i<hint.route.length;i++){
      const a=hint.route[i-1],b=hint.route[i],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<1e-6)continue;
      for(;station<length;station+=3){
        const x=a.x+dx*station/length,z=a.z+dz*station/length;
        // Navigation must leave the actual signal-junction markings legible.
        if(x>junction.minX&&x<junction.maxX&&z>junction.minZ&&z<junction.maxZ)continue;
        arrow.rotation.set(-Math.PI/2,0,Math.PI+Math.atan2(dx,dz));arrow.position.set(x,hillHeight(x,z)+.075,z);arrow.updateMatrix();
        if(count<64)arrows.setMatrixAt(count++,arrow.matrix);
      }station-=length;
    }
    arrows.count=count;arrows.instanceMatrix.needsUpdate=true;
    const outline=this.goal.getObjectByName('practice-parking-outline')!;outline.visible=!!parking;
    if(parking)outline.rotation.y=parking.yaw;
  }
  setGoal(point:Vec2,visible:boolean){this.goal.position.set(point.x,hillHeight(point.x,point.z)+.06,point.z);this.goal.visible=visible;this.guide.visible=visible;}
  setCurbStyle(style:Settings['curbStyle']){this.world.setCurbStyle(style);}
  setQuality(q:Settings['quality']){if(this.quality===q)return;this.quality=q;this.world.setTreeQuality(q);const mirrorScale=q==='low'?.5:q==='medium'?.75:1;this.mirrorTarget.setSize(512*mirrorScale,160*mirrorScale);for(const target of this.sideTargets)target.setSize(512*mirrorScale,288*mirrorScale);this.renderer.setPixelRatio(Math.min(devicePixelRatio,q==='high'?1.75:q==='medium'?1.25:1));this.renderer.shadowMap.enabled=q!=='low';this.sun.castShadow=this.distantSun.castShadow=this.renderer.shadowMap.enabled;this.sun.shadow.mapSize.set(2048,2048);this.sun.shadow.map?.dispose();this.sun.shadow.map=null;this.resize();}
  resize(){const w=window.innerWidth,h=window.innerHeight;
    if(touchDevice())this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.quality==='high'?1.5:1,Math.sqrt(1_500_000/(w*h))));
    this.renderer.setSize(w,h);this.camera.aspect=w/h;if(this.cameraMode==='cockpit')this.camera.fov=cockpitVerticalFov(this.cockpitView.fov,this.camera.aspect);this.camera.updateProjectionMatrix();}
  cycleCamera(){this.cameraMode=this.cameraMode==='chase'?'cockpit':this.cameraMode==='cockpit'?'overview':'chase';}
  setMirrorAdjustments(value:MirrorAdjustments){this.mirrorAdjustments=readMirrorAdjustments(value);}
  setExamDisplay(value:CabinExamDisplayState){this.examDisplay?.update(value);}
  capturePhysicsPose(vehicle:Vehicle){this.motion.beforeStep(vehicle);}
  get handwheelAngle(){return this.motion.handwheelAngle;}
  resetMotion(){this.motion.reset();}
  render(vehicle:Vehicle,dt:number,time:number,menu:boolean,look:number,alpha=1){
    const pose=this.motion.sample(vehicle,menu?1:alpha),p=pose.position,r=pose.rotation;
    this.car.position.copy(p);this.car.quaternion.copy(r);
    if(menu)this.car.position.y=hillHeight(p.x,p.z)+(this.wheels.length?vehicleConfig.wheelRadius-this.wheels[0].base.y:.63);else this.car.translateY(this.bodyLift);
    const t=vehicle.telemetry();
    for(const w of this.wheels){const wheel=pose.wheels[w.index];updateCarWheel(w,vehicle.controller,vehicle.time===0,menu,this.bodyLift,wheel.rotation,wheel);}
    // Use the actual virtual handwheel angle 1:1, including speed/grip limits.
    if(this.steering)this.steering.quaternion.copy(this.steeringBase).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),-pose.handwheel));
    this.cobalt?.update(t,dt);
    (['left','right'] as const).forEach((side,i)=>{
      const angles=this.mirrorAngles[side],target=this.mirrorAdjustments[side];
      angles.yaw=moveMirrorAngle(angles.yaw,target.yaw,dt);angles.pitch=moveMirrorAngle(angles.pitch,target.pitch,dt);
      this.sideMirrorPivots[i]?.rotation.set(T.MathUtils.degToRad(angles.pitch),T.MathUtils.degToRad(angles.yaw),0);
    });
    const pos=this.car.position.clone(),forward=new T.Vector3(0,0,1).applyQuaternion(this.car.quaternion);
    this.camera.clearViewOffset();
    if(menu){const portrait=window.innerHeight>window.innerWidth&&window.innerWidth<900;
      const a=.75+Math.sin(time*.025)*.25,distance=portrait?12:8;
      const desired=new T.Vector3(p.x+Math.sin(a)*distance,p.y+(portrait?3.3:2.6),p.z+Math.cos(a)*distance);
      this.camera.position.lerp(desired,1-Math.exp(-dt*2));this.camera.lookAt(p.x,p.y+.1,p.z);this.camera.fov=48;
      this.camera.setViewOffset(window.innerWidth,window.innerHeight,portrait?0:-window.innerWidth*.14,portrait?window.innerHeight*.2:0,window.innerWidth,window.innerHeight);}
    else if(this.cameraMode==='cockpit'){
      this.camera.position.copy(this.cockpitEye.applyQuaternion(this.car.quaternion).add(pos));
      const target=new T.Vector3(Math.sin(look*.85),-.025,Math.cos(look*.85)).applyQuaternion(this.car.quaternion).multiplyScalar(10).add(this.camera.position);this.camera.lookAt(target);this.camera.fov=cockpitVerticalFov(this.cockpitView.fov,this.camera.aspect);
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
    // Main view and mirrors share the same pose. Renderer.render otherwise
    // traverses and recomputes this hierarchy separately for every feed.
    this.scene.updateMatrixWorld();
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
          this.mirrorCamera.near=.025;
          this.mirrorCamera.position.copy(this.car.localToWorld(new T.Vector3(0,.55,-vehicleConfig.length/2-.025)));
          this.mirrorCamera.lookAt(this.car.localToWorld(new T.Vector3(0,-.45,-12.26)));this.mirrorCamera.aspect=3.2;this.mirrorCamera.fov=42;
        }
        else{const i=which-1,side=i===0?1:-1;
          this.mirrorCamera.position.copy(this.car.localToWorld(this.sideMirrorPositions[i].clone()));
          // Sample the outer portion of the real pane: the door shoulder
          // otherwise conceals the rear sidewall and its contact with the road.
          this.mirrorCamera.position.add(new T.Vector3(side*sideMirrorView.outboard,0,0).applyQuaternion(this.car.quaternion));
          this.mirrorCamera.position.add(new T.Vector3(-side*.48,0,-.88).applyQuaternion(this.car.quaternion).multiplyScalar(.012));
          const angles=this.mirrorAngles[i===0?'left':'right'];
          // Turning mirror glass deflects its reflected view by twice the angle.
          const back=sideMirrorDirection(i===0?'left':'right',angles).applyQuaternion(this.car.quaternion);this.mirrorCamera.lookAt(this.mirrorCamera.position.clone().addScaledVector(back,20));
          this.mirrorCamera.near=sideMirrorView.near;this.mirrorCamera.aspect=sideMirrorView.aspect;this.mirrorCamera.fov=sideMirrorView.fov;target=this.sideTargets[i];}
        this.mirrorCamera.updateProjectionMatrix();
        const carVisible=this.car.visible,glassVisible=panes.map(pane=>pane?.visible),autoShadow=renderer.shadowMap.autoUpdate,previousTarget=renderer.getRenderTarget();
        // Side mirrors need the real body as a distance reference. Hide only
        // the live panes to avoid recursive feedback; the exterior rear camera
        // remains clear of the cabin and rear bodywork.
        this.car.visible=which!==0&&carVisible;panes.forEach(pane=>{if(pane)pane.visible=false;});
        renderer.shadowMap.autoUpdate=false;
        try{renderer.setRenderTarget(target);renderer.render(this.scene,this.mirrorCamera);}
        finally{renderer.setRenderTarget(previousTarget);renderer.shadowMap.autoUpdate=autoShadow;this.car.visible=carVisible;panes.forEach((pane,i)=>{if(pane)pane.visible=glassVisible[i]!;});}
      }
    }
    // All three feeds are drawn directly on their physical mirror surfaces.
    renderer.setScissorTest(false);renderer.setViewport(0,0,window.innerWidth,window.innerHeight);renderer.render(this.scene,this.camera);
    this.renderStats={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};
    // Rendering receives a capped simulation delta; measure FPS against real
    // elapsed time so slow frames are not reported as at least 10 FPS.
    const frameTime=performance.now();
    if(this.fpsTime===0){this.fpsTime=frameTime;this.frameCount=0;}
    else{
      this.frameCount++;const elapsed=frameTime-this.fpsTime;
      if(elapsed>=1000){this.fps=Math.round(this.frameCount*1000/elapsed);this.frameCount=0;this.fpsTime=frameTime;}
    }
  }
}
