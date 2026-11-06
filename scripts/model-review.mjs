import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/model-review',phase=process.argv[2]||'after';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.click('#practice');await page.waitForTimeout(700);await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    window.reviewPose={eye:[0,1,-5],target:[0,.05,-.5],fov:45};
    s.render=(...args)=>{render(...args);const pose=window.reviewPose;if(!pose)return;
      s.camera.clearViewOffset();s.camera.fov=pose.fov;s.camera.updateProjectionMatrix();s.camera.position.copy(new T.Vector3(...pose.eye).applyQuaternion(s.car.quaternion).add(s.car.position));
      s.camera.lookAt(new T.Vector3(...pose.target).applyQuaternion(s.car.quaternion).add(s.car.position));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);
    };
  });
  const poses=[['rear',{eye:[0,1,-5],target:[0,.07,-.6],fov:42}],['rear-quarter',{eye:[3.6,1.35,-4.2],target:[0,.1,-.25],fov:43}],['front-quarter',{eye:[3.5,1.3,4.2],target:[0,.1,.1],fov:43}],['cabin',{eye:[0,.52,-.1],target:[0,.05,.97],fov:80}],['driver',{eye:[.31,.48,.2],target:[.31,.34,1.5],fov:70}]];
  for(const [name,pose]of poses){await page.evaluate(p=>window.reviewPose=p,pose);await page.waitForTimeout(400);await page.screenshot({path:`${directory}/${phase}-${name}.png`});}
  await page.evaluate(()=>window.reviewPose={eye:[0,.58,-.02],target:[0,-.08,.90],fov:62});await page.waitForTimeout(300);await page.screenshot({path:`${directory}/${phase}-photo-cabin.png`});
  if(phase==='shadow-review'){
    await page.evaluate(()=>{window.__avtodrom.scene.car.getObjectByName('COBALT_MouldedDashboard').receiveShadow=false;});await page.waitForTimeout(250);await page.screenshot({path:`${directory}/${phase}-smooth-dash.png`});
  }
  await page.evaluate(()=>{const d=window.__avtodrom.vehicle.drivetrain;d.engine=true;d.brake=1;});await page.evaluate(p=>window.reviewPose=p,poses[0][1]);await page.waitForTimeout(300);await page.screenshot({path:`${directory}/${phase}-braking.png`});
  const lights=[],visibility=[];
  if(phase==='after'){
    const apertures=await page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js'),car=window.__avtodrom.scene.car;
      const eye=car.localToWorld(new T.Vector3(.31,.48,.2)),out=[];
      // Sample the dial clear of its physical needle and centre cap.
      for(const [name,point]of [['COBALT_DIGITAL_SPEED',[.237,.218,.891]],['COBALT_TachometerFace',[.43,.24,.891]]]){
        const target=car.localToWorld(new T.Vector3(...point)),ray=new T.Raycaster(eye,target.sub(eye).normalize(),0,2);
        const hit=ray.intersectObject(car,true).find(hit=>{const m=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;return !m.transparent;});
        const material=hit&&(Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material);out.push({expected:name,visible:material?.name});
      }return out;
    });assert(apertures.every(p=>p.expected===p.visible),JSON.stringify(apertures));visibility.push(...apertures);
    const regions=await page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,out={};
      for(const [name,y]of [['brake',.33],['reverse',.185]])out[name]=[-1,1].map(side=>{
        const p=s.car.localToWorld(new T.Vector3(side*.675,y,-2.13)).project(s.camera);return {left:Math.round((p.x+1)*innerWidth/2)-6,top:Math.round((1-p.y)*innerHeight/2)-3,width:12,height:6};
      });return out;
    });
    const pixels={};
    for(const state of ['off','tail','brake','stalled-brake','reverse','brake-reverse','left','right','hazards']){
      await page.evaluate(state=>{const v=window.__avtodrom.vehicle,d=v.drivetrain;v.time=.2;d.engine=!['off','stalled-brake'].includes(state);d.brake=state.includes('brake')?1:0;d.gear=state.includes('reverse')?-1:0;v.indicator=state==='left'?'left':state==='right'?'right':'off';v.hazards=state==='hazards';},state);
      await page.waitForTimeout(180);
      const sample=await page.evaluate(()=>{const out={};window.__avtodrom.scene.car.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(/^COBALT_(BRAKE|REVERSE|INDICATOR)/.test(m.name))out[m.name]=m.emissiveIntensity;});return out;});
      lights.push({state,...sample});const frame=await page.screenshot({path:`${directory}/${phase}-${state}.png`});pixels[state]={};
      for(const [name,boxes]of Object.entries(regions))pixels[state][name]=await Promise.all(boxes.map(async box=>{
        const {data,info}=await sharp(frame).extract(box).removeAlpha().raw().toBuffer({resolveWithObject:true}),rgb=[0,0,0];
        for(let i=0;i<data.length;i++)rgb[i%info.channels]+=data[i]/(info.width*info.height);return rgb.map(n=>+n.toFixed(1));
      }));
    }
    assert(lights.find(s=>s.state==='brake').COBALT_BRAKE>1);assert.equal(lights.find(s=>s.state==='off').COBALT_REVERSE,0);
    assert(lights.find(s=>s.state==='reverse').COBALT_REVERSE>1);assert(lights.find(s=>s.state==='left').COBALT_INDICATOR_LEFT>1);assert.equal(lights.find(s=>s.state==='left').COBALT_INDICATOR_RIGHT,0);
    assert(lights.find(s=>s.state==='right').COBALT_INDICATOR_RIGHT>1);assert.equal(lights.find(s=>s.state==='right').COBALT_INDICATOR_LEFT,0);
    assert(lights.find(s=>s.state==='hazards').COBALT_INDICATOR_LEFT>1&&lights.find(s=>s.state==='hazards').COBALT_INDICATOR_RIGHT>1);
    for(let side=0;side<2;side++){
      for(const state of ['brake','stalled-brake','brake-reverse']){const rgb=pixels[state].brake[side];assert(rgb[0]>pixels.tail.brake[side][0]+30&&rgb[0]>rgb[1]*1.7,`Visible red brake: ${state} side ${side}, ${rgb}`);}
      for(const state of ['reverse','brake-reverse']){const rgb=pixels[state].reverse[side],off=pixels.tail.reverse[side];assert(Math.min(...rgb)>210&&rgb.reduce((a,b)=>a+b)/3>off.reduce((a,b)=>a+b)/3+35,`Visible white reverse: ${state} side ${side}, ${rgb}`);}
    }
    visibility.push({lampRegions:regions,pixels});
    for(const state of ['brake','reverse']){
      await page.evaluate(state=>{const d=window.__avtodrom.vehicle.drivetrain;d.engine=true;d.brake=state==='brake'?1:0;d.gear=state==='reverse'?-1:0;window.__avtodrom.vehicle.hazards=false;window.reviewPose={eye:[0,3.4,-7.3],target:[0,.65,2],fov:52};},state);
      await page.waitForTimeout(250);await page.screenshot({path:`${directory}/${phase}-chase-${state}.png`});
    }
    const display=await page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js'),api=window.__avtodrom;
      const canvas=api.scene.cobalt.canvas,before=canvas.toDataURL(),needle=api.scene.car.getObjectByName('COBALT_TACH_NEEDLE'),angle=needle.rotation.z;
      const forward=new T.Vector3(0,0,1).applyQuaternion(api.scene.car.quaternion).multiplyScalar(50/3.6);api.vehicle.body.setLinvel(forward,true);api.vehicle.drivetrain.rpm=3000;api.vehicle.drivetrain.gear=2;
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      return {changed:canvas.toDataURL()!==before,needleChanged:needle.rotation.z!==angle,key:api.scene.cobalt.lastDisplay};
    });assert(display.changed&&display.needleChanged&&display.key.startsWith('50:2:'));
  }
  await page.evaluate(()=>{window.reviewPose=null;const s=window.__avtodrom.scene;if(s.cameraMode!=='cockpit')s.cycleCamera();});
  await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().camera),'cockpit');await page.screenshot({path:`${directory}/${phase}-game-driver.png`});
  assert.deepEqual(errors,[]);await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({date:new Date().toISOString(),errors,lights,visibility,snapshot:await page.evaluate(()=>window.__avtodrom.snapshot())},null,2));console.log(JSON.stringify({phase,errors,lights,visibility}));
}finally{await browser.close();}
