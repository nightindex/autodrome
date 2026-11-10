import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const directory='test-results/side-mirror-body';
await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path=>path&&existsSync(path));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),checks=[],errors=[],measurements=[];
const check=(name,passed,detail)=>{checks.push({name,passed,...(detail===undefined?{}:{detail})});assert(passed,`${name}: ${JSON.stringify(detail)}`);};
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});

try{
  await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',quality:'medium',volume:0,mirrors:{left:{yaw:0,pitch:0},right:{yaw:0,pitch:0}}})));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');
  await page.click('#mirrors-button');
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,renderer=s.renderer,draw=renderer.render,render=s.render.bind(s);
    const {mirrorPixels}=await import('/scripts/lib/mirror-pixels.mjs');
    const {hillHeight}=await import('/src/data/course.ts');
    const audit=window.sideMirrorBody={request:null,result:null,passes:[],pose:null};
    const encode=bytes=>{let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);};
    const fromWorld=new T.Matrix4();
    // Identify the disconnected, authored handle meshes rather than counting
    // arbitrary painted pixels in a hand-picked rectangle.
    s.car.traverse(object=>{
      if(!object.isMesh)return;
      const geometry=object.geometry,p=geometry.getAttribute('position'),marker=new Float32Array(p.count);
      const materials=Array.isArray(object.material)?object.material:[object.material];
      if(materials.some(m=>m.name==='Realistic_Car_Paint')){
        const indices=geometry.index?.array??Uint32Array.from({length:p.count},(_,i)=>i),parents=new Map(),keys=new Map(),boxes=new Map();
        const key=i=>{if(!keys.has(i))keys.set(i,[p.getX(i),p.getY(i),p.getZ(i)].map(v=>Math.round(v*1e6)).join(','));return keys.get(i);};
        const find=k=>{if(!parents.has(k))parents.set(k,k);let root=k;while(parents.get(root)!==root)root=parents.get(root);while(k!==root){const next=parents.get(k);parents.set(k,root);k=next;}return root;};
        for(let j=0;j<indices.length;j+=3)for(let k=1;k<3;k++)parents.set(find(key(indices[j+k])),find(key(indices[j])));
        const matrix=s.car.matrixWorld.clone().invert().multiply(object.matrixWorld);
        for(const i of indices){const root=find(key(i)),box=boxes.get(root)??new T.Box3();box.expandByPoint(new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(matrix));boxes.set(root,box);}
        for(const i of indices){const box=boxes.get(find(key(i))),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
          if(size.z>.15&&size.z<.3&&size.y<.08&&size.x<.10&&center.y>.1&&Math.abs(center.x)>.75)marker[i]=center.z>-.5?1:2;
        }
      }
      geometry.setAttribute('mirrorLandmark',new T.BufferAttribute(marker,1));
    });
    const masks=new Map();
    const maskFor=(material,object)=>{
      const tyre=/^roda/.test(object.name)&&material.name==='bump_front_ok.014',key=`${material.uuid}/${tyre}`;
      if(masks.has(key))return masks.get(key);
      const result=new T.ShaderMaterial({
        uniforms:{carFromWorld:{value:fromWorld},paint:{value:material.name==='Realistic_Car_Paint'?1:0},tyre:{value:tyre?1:0},alpha:{value:material.opacity}},
        vertexShader:'uniform mat4 carFromWorld; attribute float mirrorLandmark; varying float landmark; varying vec3 carPoint; void main(){ landmark=mirrorLandmark;vec4 world=modelMatrix*vec4(position,1.);carPoint=(carFromWorld*world).xyz;gl_Position=projectionMatrix*viewMatrix*world; }',
        fragmentShader:'uniform float paint; uniform float tyre; uniform float alpha; varying float landmark; varying vec3 carPoint; void main(){ bool housing=abs(carPoint.x)>.76&&carPoint.y>.30&&carPoint.y<.49&&carPoint.z>.53&&carPoint.z<.86; vec3 ink=housing?vec3(0.,1.,1.):(paint>.5?vec3(1.,0.,1.):vec3(0.));if(landmark>.5)ink=landmark<1.5?vec3(1.,.5,0.):vec3(.5,0.,1.);if(tyre>.5&&carPoint.z<-.9)ink=vec3(0.,1.,0.);gl_FragColor=vec4(ink,alpha); }',
        side:material.side,transparent:material.transparent,depthTest:material.depthTest,depthWrite:material.depthWrite,toneMapped:false,
      });
      masks.set(key,result);return result;
    };
    renderer.render=function(scene,camera){
      const target=this.getRenderTarget(),index=[s.mirrorTarget,...s.sideTargets].indexOf(target);
      if(index>=0){
        const pass={index,carVisible:s.car.visible,glassHidden:[s.cabinMirror,...s.sideMirrors].every(pane=>!pane||!pane.visible),near:camera.near,position:s.car.worldToLocal(camera.position.clone()).toArray(),direction:camera.getWorldDirection(new T.Vector3()).applyQuaternion(s.car.getWorldQuaternion(new T.Quaternion()).invert()).toArray()};
        if(index>0){
          const sign=index===1?1:-1,wheel=s.wheels.find(w=>!w.front&&Math.sign(w.base.x)===sign),contact=s.car.worldToLocal(wheel.pivot.getWorldPosition(new T.Vector3()));
          contact.y-=wheel.radius;contact.x=sign*(Math.abs(contact.x)+.195/2);pass.contact=contact.toArray();
          const roadContact=s.car.localToWorld(contact.clone());roadContact.y=hillHeight(roadContact.x,roadContact.z)+.048;pass.contactProjection=roadContact.project(camera).toArray();
          const pane=s.sideMirrors[index-1],uv=pane.geometry.getAttribute('uv'),indices=pane.geometry.index?.array??Uint32Array.from({length:uv.count},(_,i)=>i),point=new T.Vector3((pass.contactProjection[0]+1)/2,(pass.contactProjection[1]+1)/2,0);
          pass.contactOnPane=false;
          for(let j=0;j<indices.length;j+=3){const v=[0,1,2].map(k=>new T.Vector3(uv.getX(indices[j+k]),uv.getY(indices[j+k]),0));if(new T.Triangle(...v).containsPoint(point)){pass.contactOnPane=true;break;}}
        }
        audit.passes[index]=pass;
      }
      const output=draw.call(this,scene,camera);
      if(index<1||audit.request!==index-1)return output;
      audit.request=null;
      const normal=mirrorPixels(T,this,target);
      const maskTarget=new T.WebGLRenderTarget(target.width,target.height),materials=[],visibility=scene.children.map(child=>[child,child.visible]),background=scene.background,fog=scene.fog;
      const clearColor=this.getClearColor(new T.Color()),clearAlpha=this.getClearAlpha();
      fromWorld.copy(s.car.matrixWorld).invert();
      try{
        scene.children.forEach(child=>{if(child!==s.car&&child!==audit.line)child.visible=false;});scene.background=null;scene.fog=null;
        if(audit.line){materials.push([audit.line,audit.line.material]);audit.line.material=new T.MeshBasicMaterial({color:0xffffff,toneMapped:false});}
        s.car.traverse(object=>{if(!object.isMesh)return;materials.push([object,object.material]);object.material=Array.isArray(object.material)?object.material.map(m=>maskFor(m,object)):maskFor(object.material,object);});
        this.setClearColor(0x000000,1);this.setRenderTarget(maskTarget);draw.call(this,scene,camera);
        const mask=new Uint8Array(maskTarget.width*maskTarget.height*4);this.readRenderTargetPixels(maskTarget,0,0,maskTarget.width,maskTarget.height,mask);
        audit.result={index:index-1,width:target.width,height:target.height,normal:encode(normal),mask:encode(mask),camera:audit.passes[index]};
      }finally{
        materials.forEach(([object,material])=>{if(object===audit.line)object.material.dispose();object.material=material;});visibility.forEach(([child,visible])=>child.visible=visible);
        scene.background=background;scene.fog=fog;this.setClearColor(clearColor,clearAlpha);this.setRenderTarget(target);maskTarget.dispose();
      }
      return output;
    };
    s.render=(...args)=>{
      const pose=audit.pose;if(pose){const aim=s.sideMirrorPositions[pose==='left'?0:1];args[4]=Math.atan2(aim.x-.31,aim.z-.2)/.85;}
      render(...args);
      if(!pose)return;
      s.camera.clearViewOffset();s.camera.near=.025;s.camera.fov=38;s.camera.updateProjectionMatrix();
      s.camera.position.copy(s.car.localToWorld(new T.Vector3(.31,.48,.2)));s.camera.up.set(0,1,0).applyQuaternion(s.car.quaternion);
      s.camera.lookAt(s.car.localToWorld(s.sideMirrorPositions[pose==='left'?0:1].clone()));
      s.renderer.render(s.scene,s.camera);
    };
  });

  const settle=async(side,yaw=0,pitch=0)=>{
    const index=side==='left'?0:1;
    await page.click(`[data-mirror=${side}]`);
    await page.waitForFunction(({index,yaw,pitch})=>{const s=window.__avtodrom.scene,pivot=s.sideMirrorPivots[index];return Math.abs(pivot.rotation.y-yaw*Math.PI/180)<1e-6&&Math.abs(pivot.rotation.x-pitch*Math.PI/180)<1e-6;},{index,yaw,pitch});
  };
  const sample=async(side,name)=>{
    const index=side==='left'?0:1;
    await page.evaluate(index=>Object.assign(window.sideMirrorBody,{request:index,result:null}),index);
    await page.waitForFunction(index=>window.sideMirrorBody.result?.index===index,index,{timeout:15000});
    const result=await page.evaluate(()=>window.sideMirrorBody.result),mask=Buffer.from(result.mask,'base64'),normal=Buffer.from(result.normal,'base64');
    let body=0,housing=0,inner=0,xSum=0,green=0,minX=result.width,maxX=-1,frontHandle=0,rearHandle=0,rearTyre=0,linePixels=0,visibleLinePixels=0,lineDistance=Infinity,tyreDistance=Infinity;
    const [cx,cy]=result.camera.contactProjection,contactPixel=[(cx+1)*result.width/2,(cy+1)*result.height/2];
    for(let p=0;p<result.width*result.height;p++){
      const offset=p*4,[r,g,b]=mask.subarray(offset,offset+3),x=p%result.width;
      if(r>48&&b>48&&g<r*.25){body++;xSum+=x;minX=Math.min(minX,x);maxX=Math.max(maxX,x);if(side==='left'?x<result.width/3:x>=result.width*2/3)inner++;}
      if(g>48&&b>48&&r<g*.25)housing++;
      if(r>200&&g>80&&g<180&&b<20)frontHandle++;
      if(r>80&&r<180&&g<20&&b>200)rearHandle++;
      const distance=Math.hypot(x+.5-contactPixel[0],Math.floor(p/result.width)+.5-contactPixel[1]);
      if(r<20&&g>200&&b<20){rearTyre++;tyreDistance=Math.min(tyreDistance,distance);}
      if(r>240&&g>240&&b>240){linePixels++;lineDistance=Math.min(lineDistance,distance);}
      const [nr,ng,nb]=normal.subarray(offset,offset+3);if(ng>80&&ng>nr*1.8&&ng>nb*1.8)green++;
      if(r>240&&g>240&&b>240&&nr>170&&ng>170&&nb>170)visibleLinePixels++;
    }
    const measurement={side,name,bodyFraction:body/(result.width*result.height),housingPixels:housing,innerFraction:body?inner/body:0,centroidX:body?xSum/body/result.width:null,minX:minX/result.width,maxX:maxX/result.width,witnessPixels:green,frontHandle,rearHandle,rearTyre,tyreDistance,linePixels,visibleLinePixels,lineDistance,camera:result.camera};
    measurements.push(measurement);
    for(const [kind,buffer]of [['feed',normal],['mask',mask]])await sharp(buffer,{raw:{width:result.width,height:result.height,channels:4}}).flip().png().toFile(`${directory}/${side}-${name}-${kind}.png`);
    return measurement;
  };

  for(const side of ['left','right']){
    await settle(side);
    const neutral=await sample(side,'neutral');
    check(`${side}: actual white body forms a narrow reference strip`,neutral.bodyFraction>.02&&neutral.bodyFraction<.20,neutral);
    check(`${side}: body reference stays against the inner mirror edge`,neutral.innerFraction>.98&&(side==='left'?neutral.centroidX<.25:neutral.centroidX>.75),neutral);
    check(`${side}: the close mirror housing does not obstruct its own feed`,neutral.housingPixels===0,neutral);
    check(`${side}: live mirror panes are hidden during the reflected pass`,neutral.camera.carVisible&&neutral.camera.glassHidden,neutral.camera);
    check(`${side}: both real door handles remain visible`,neutral.frontHandle>12&&neutral.rearHandle>3,neutral);
    check(`${side}: the actual rear tyre is visible beside the doors`,neutral.rearTyre>20,neutral);
    check(`${side}: the tyre reaches its visible road contact`,neutral.tyreDistance<4,neutral);
    check(`${side}: the rounded physical mirror includes the tyre contact`,neutral.camera.contactOnPane,neutral.camera);

    await page.evaluate(async({side,camera})=>{
      const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
      const witness=new T.Mesh(new T.BoxGeometry(.5,.5,.12),new T.MeshBasicMaterial({color:0x00ff00,toneMapped:false}));
      witness.name='side-mirror-road-witness';witness.position.copy(s.car.localToWorld(new T.Vector3(...camera.position).addScaledVector(new T.Vector3(...camera.direction),5)));
      witness.quaternion.copy(s.car.quaternion);s.scene.add(witness);window.sideMirrorBody.witness=witness;
    },{side,camera:neutral.camera});
    const witness=await sample(side,'road-witness');
    check(`${side}: the rearward road remains visible beside the body`,witness.witnessPixels>20,witness);
    await page.evaluate(()=>{const a=window.sideMirrorBody;window.__avtodrom.scene.scene.remove(a.witness);a.witness.geometry.dispose();a.witness.material.dispose();delete a.witness;});

    // The controls retain their shared left/right meaning on both mirrors.
    // Outward travel is left on the driver's mirror and right on the passenger mirror.
    const arrow=side==='left'?'left':'right',yaw=side==='left'?-8:8;
    for(let i=0;i<8;i++)await page.click(`.mirror-${arrow}`);
    await settle(side,yaw);
    const outward=await sample(side,'outward');
    check(`${side}: outward adjustment opens more road beside the body`,outward.bodyFraction<neutral.bodyFraction/2,{neutral:neutral.bodyFraction,outward:outward.bodyFraction});
    check(`${side}: outward adjustment does not reveal the close mirror shell`,outward.housingPixels===0,outward);
    await page.click('#mirror-default');await settle(side);
    const restored=await sample(side,'default');
    check(`${side}: Default restores the original reflected body strip`,Math.abs(restored.bodyFraction-neutral.bodyFraction)<.005&&Math.abs(restored.centroidX-neutral.centroidX)<.01,{neutral:neutral.bodyFraction,restored:restored.bodyFraction});
    await page.evaluate(side=>window.sideMirrorBody.pose=side,side);await page.waitForTimeout(120);
    await page.screenshot({path:`${directory}/driver-${side}-mirror.png`});
    await page.evaluate(()=>window.sideMirrorBody.pose=null);
  }
  // Verify exam mode with a physical white road stripe, first clear of the
  // sidewall and then under its outer contact. Both poses use the live feed.
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__avtodrom.start('exam'));
  await page.click('#mirrors-button');
  for(const side of ['left','right']){
    await settle(side);const neutral=await sample(side,'exam-neutral');
    check(`${side}: exam retains both handles and the rear tyre`,neutral.frontHandle>12&&neutral.rearHandle>3&&neutral.rearTyre>20,neutral);
    const positions=[];
    for(const [name,gap]of [['line-clear',.12],['line-contact',0]]){
      await page.evaluate(async({side,contact,gap})=>{
        const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,a=window.sideMirrorBody;
        const {hillHeight}=await import('/src/data/course.ts');
        if(a.line){s.scene.remove(a.line);a.line.geometry.dispose();a.line.material.dispose();}
        const line=new T.Mesh(new T.PlaneGeometry(.10,1.5),new T.MeshBasicMaterial({color:0xffffff}));
        line.rotation.x=-Math.PI/2;line.position.copy(s.car.localToWorld(new T.Vector3(contact[0]+(side==='left'?1:-1)*gap,contact[1]+.003,contact[2]-.15)));line.quaternion.premultiply(s.car.quaternion);
        line.position.y=hillHeight(line.position.x,line.position.z)+.048;
        s.scene.add(line);a.line=line;
      },{side,contact:neutral.camera.contact,gap});
      positions.push(await sample(side,name));
    }
    check(`${side}: visible line distinguishes clearance from tyre contact`,positions.every(p=>p.linePixels>10&&p.visibleLinePixels>p.linePixels*.8)&&positions[0].lineDistance>3&&positions[1].lineDistance<2&&positions[0].lineDistance>positions[1].lineDistance+2,positions);
    await page.evaluate(()=>{const s=window.__avtodrom.scene,a=window.sideMirrorBody;s.scene.remove(a.line);a.line.geometry.dispose();a.line.material.dispose();delete a.line;});
    for(const quality of ['low','high']){
      await page.evaluate(quality=>window.__avtodrom.scene.setQuality(quality),quality);
      const view=await sample(side,`exam-${quality}`);
      check(`${side}: ${quality} retains the handles and tyre contact`,view.frontHandle>4&&view.rearHandle>1&&view.rearTyre>8&&view.tyreDistance<4,view);
    }
    await page.evaluate(()=>window.__avtodrom.scene.setQuality('medium'));
  }
  await page.keyboard.press('Escape');
  await page.waitForFunction(()=>window.sideMirrorBody.passes[0]);
  const state=await page.evaluate(()=>{
    const s=window.__avtodrom.scene;
    return {center:window.sideMirrorBody.passes[0],carVisible:s.car.visible,panesVisible:[s.cabinMirror,...s.sideMirrors].every(pane=>!pane||pane.visible),autoShadow:s.renderer.shadowMap.autoUpdate,renderTarget:s.renderer.getRenderTarget()===null,settings:JSON.parse(localStorage.getItem('avtodrom.settings.v1')).mirrors};
  });
  check('The center rear camera remains clear of the car and cabin',!state.center.carVisible&&state.center.glassHidden&&state.center.near<.05,state.center);
  check('All mirror passes restore car, glass, shadow and renderer state',state.carVisible&&state.panesVisible&&state.autoShadow&&state.renderTarget,state);
  check('Default returns both saved mirror adjustments to zero',['left','right'].every(side=>state.settings[side].yaw===0&&state.settings[side].pitch===0),state.settings);
  check('No browser errors occurred',errors.length===0,errors);
}finally{
  await writeFile(`${directory}/report.json`,JSON.stringify({checks,measurements,errors},null,2));
  await browser.close();
}
console.log(JSON.stringify({checks:checks.length,measurements:measurements.map(({side,name,bodyFraction,housingPixels,centroidX,witnessPixels})=>({side,name,bodyFraction,housingPixels,centroidX,witnessPixels})),errors},null,2));
