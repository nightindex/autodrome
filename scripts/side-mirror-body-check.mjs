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
    const audit=window.sideMirrorBody={request:null,result:null,passes:[],pose:null};
    const encode=bytes=>{let raw='';for(let i=0;i<bytes.length;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(raw);};
    const fromWorld=new T.Matrix4();
    const masks=new Map();
    const maskFor=material=>{
      if(masks.has(material))return masks.get(material);
      const result=new T.ShaderMaterial({
        uniforms:{carFromWorld:{value:fromWorld},paint:{value:material.name==='Realistic_Car_Paint'?1:0},alpha:{value:material.opacity}},
        vertexShader:'uniform mat4 carFromWorld; varying vec3 carPoint; void main(){ vec4 world=modelMatrix*vec4(position,1.);carPoint=(carFromWorld*world).xyz;gl_Position=projectionMatrix*viewMatrix*world; }',
        fragmentShader:'uniform float paint; uniform float alpha; varying vec3 carPoint; void main(){ bool housing=abs(carPoint.x)>.76&&carPoint.y>.30&&carPoint.y<.49&&carPoint.z>.53&&carPoint.z<.86; vec3 ink=housing?vec3(0.,1.,1.):(paint>.5?vec3(1.,0.,1.):vec3(0.));gl_FragColor=vec4(ink,alpha); }',
        side:material.side,transparent:material.transparent,depthTest:material.depthTest,depthWrite:material.depthWrite,toneMapped:false,
      });
      masks.set(material,result);return result;
    };
    renderer.render=function(scene,camera){
      const target=this.getRenderTarget(),index=[s.mirrorTarget,...s.sideTargets].indexOf(target);
      if(index>=0){
        const pass={index,carVisible:s.car.visible,glassHidden:[s.cabinMirror,...s.sideMirrors].every(pane=>!pane||!pane.visible),near:camera.near,position:s.car.worldToLocal(camera.position.clone()).toArray(),direction:camera.getWorldDirection(new T.Vector3()).applyQuaternion(s.car.getWorldQuaternion(new T.Quaternion()).invert()).toArray()};
        audit.passes[index]=pass;
      }
      const output=draw.call(this,scene,camera);
      if(index<1||audit.request!==index-1)return output;
      audit.request=null;
      const normal=new Uint8Array(target.width*target.height*4);this.readRenderTargetPixels(target,0,0,target.width,target.height,normal);
      const maskTarget=new T.WebGLRenderTarget(target.width,target.height),materials=[],visibility=scene.children.map(child=>[child,child.visible]),background=scene.background,fog=scene.fog;
      const clearColor=this.getClearColor(new T.Color()),clearAlpha=this.getClearAlpha();
      fromWorld.copy(s.car.matrixWorld).invert();
      try{
        scene.children.forEach(child=>{if(child!==s.car)child.visible=false;});scene.background=null;scene.fog=null;
        s.car.traverse(object=>{if(!object.isMesh)return;materials.push([object,object.material]);object.material=Array.isArray(object.material)?object.material.map(maskFor):maskFor(object.material);});
        this.setClearColor(0x000000,1);this.setRenderTarget(maskTarget);draw.call(this,scene,camera);
        const mask=new Uint8Array(maskTarget.width*maskTarget.height*4);this.readRenderTargetPixels(maskTarget,0,0,maskTarget.width,maskTarget.height,mask);
        audit.result={index:index-1,width:target.width,height:target.height,normal:encode(normal),mask:encode(mask),camera:audit.passes[index]};
      }finally{
        materials.forEach(([object,material])=>object.material=material);visibility.forEach(([child,visible])=>child.visible=visible);
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
    let body=0,housing=0,inner=0,xSum=0,green=0,minX=result.width,maxX=-1;
    for(let p=0;p<result.width*result.height;p++){
      const offset=p*4,[r,g,b]=mask.subarray(offset,offset+3),x=p%result.width;
      if(r>48&&b>48&&g<r*.25){body++;xSum+=x;minX=Math.min(minX,x);maxX=Math.max(maxX,x);if(side==='left'?x<result.width/3:x>=result.width*2/3)inner++;}
      if(g>48&&b>48&&r<g*.25)housing++;
      const [nr,ng,nb]=normal.subarray(offset,offset+3);if(ng>80&&ng>nr*2.5&&ng>nb*2.5)green++;
    }
    const measurement={side,name,bodyFraction:body/(result.width*result.height),housingPixels:housing,innerFraction:body?inner/body:0,centroidX:body?xSum/body/result.width:null,minX:minX/result.width,maxX:maxX/result.width,witnessPixels:green,camera:result.camera};
    measurements.push(measurement);
    for(const [kind,buffer]of [['feed',normal],['mask',mask]])await sharp(buffer,{raw:{width:result.width,height:result.height,channels:4}}).flip().png().toFile(`${directory}/${side}-${name}-${kind}.png`);
    return measurement;
  };

  for(const side of ['left','right']){
    await settle(side);
    const neutral=await sample(side,'neutral');
    check(`${side}: actual white body forms a narrow reference strip`,neutral.bodyFraction>.02&&neutral.bodyFraction<.20,neutral);
    check(`${side}: body reference stays against the inner mirror edge`,neutral.innerFraction>.98&&(side==='left'?neutral.centroidX<.17:neutral.centroidX>.83),neutral);
    check(`${side}: the close mirror housing does not obstruct its own feed`,neutral.housingPixels===0,neutral);
    check(`${side}: live mirror panes are hidden during the reflected pass`,neutral.camera.carVisible&&neutral.camera.glassHidden,neutral.camera);

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
    check(`${side}: outward adjustment can remove the body reference`,outward.bodyFraction<.005&&outward.bodyFraction<neutral.bodyFraction/5,{neutral:neutral.bodyFraction,outward:outward.bodyFraction});
    check(`${side}: outward adjustment does not reveal the close mirror shell`,outward.housingPixels===0,outward);
    await page.click('#mirror-default');await settle(side);
    const restored=await sample(side,'default');
    check(`${side}: Default restores the original reflected body strip`,Math.abs(restored.bodyFraction-neutral.bodyFraction)<.005&&Math.abs(restored.centroidX-neutral.centroidX)<.01,{neutral:neutral.bodyFraction,restored:restored.bodyFraction});
    await page.evaluate(side=>window.sideMirrorBody.pose=side,side);await page.waitForTimeout(120);
    await page.screenshot({path:`${directory}/driver-${side}-mirror.png`});
    await page.evaluate(()=>window.sideMirrorBody.pose=null);
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
