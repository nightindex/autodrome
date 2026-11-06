import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/wheels';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');await page.waitForTimeout(700);await page.keyboard.press('Escape');
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
    const reports=[];
    for(const w of s.wheels){
      const node=w.spin.children[0].children[0],calliper=w.pivot.children.find(n=>n.isMesh);
      w.pivot.rotation.y=0;w.spin.rotation.x=0;s.car.updateWorldMatrix(true,true);
      const toNode=node.matrixWorld.clone().invert(),bounds=new T.Box3();let marker;
      node.traverse(n=>{if(!n.isMesh)return;const positions=n.geometry.attributes.position,matrix=toNode.clone().multiply(n.matrixWorld);
        for(let i=0;i<positions.count;i++)bounds.expandByPoint(new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(matrix));
      });
      const hub=bounds.getCenter(new T.Vector3());marker=hub.clone().add(new T.Vector3(0,.3,0));
      const points=[],centers=[],axes=[],fixed=[];
      for(let i=0;i<=32;i++){
        w.spin.rotation.x=i*Math.PI/16;s.car.updateWorldMatrix(true,true);
        const matrix=s.car.matrixWorld.clone().invert().multiply(node.matrixWorld);
        points.push(marker.clone().applyMatrix4(matrix));centers.push(hub.clone().applyMatrix4(matrix));axes.push(new T.Vector3(1,0,0).transformDirection(matrix));
        fixed.push(s.car.worldToLocal(calliper.getWorldPosition(new T.Vector3())));
      }
      let maxAxisTilt=0,maxHubDrift=0,maxCalliperDrift=0;
      for(let i=0;i<points.length;i++){maxAxisTilt=Math.max(maxAxisTilt,Math.hypot(axes[i].y,axes[i].z));maxHubDrift=Math.max(maxHubDrift,centers[i].distanceTo(centers[0]));maxCalliperDrift=Math.max(maxCalliperDrift,fixed[i].distanceTo(fixed[0]));}
      const lateralRunout=Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x));
      w.pivot.rotation.y=w.front?.4:0;s.car.updateWorldMatrix(true,true);
      const axle=new T.Vector3(1,0,0).transformDirection(s.car.matrixWorld.clone().invert().multiply(node.matrixWorld));
      const steeringAlignment=Math.abs(axle.dot(new T.Vector3(Math.cos(w.front?.4:0),0,-Math.sin(w.front?.4:0))));
      reports.push({index:w.index,front:w.front,radius:w.radius,maxAxisTilt,maxHubDrift,maxCalliperDrift,lateralRunout,steeringAlignment});
    }
    // Drive the real controller forward and backward on a flat course section.
    const v=window.__avtodrom.vehicle,input={down:()=>false},samples=[];
    v.reset({x:-20,z:40.5},0);for(let i=0;i<60;i++)v.update(1/60,input,true);
    for(const speed of [2,-2]){
      v.drivetrain.handbrake=false;v.body.setLinvel({x:0,y:0,z:speed},true);
      const z=v.body.translation().z,before=v.controller.wheelRotation(0);
      for(let i=0;i<12;i++)v.update(1/60,input,true);
      const {updateCarWheel}=await import('/src/render/car-wheels.ts'),w=s.wheels.find(w=>w.index===0);
      updateCarWheel(w,v.controller,false,false);
      samples.push({speed,travel:v.body.translation().z-z,rotation:v.controller.wheelRotation(0)-before,visualRoll:w.spin.rotation.x,expectedRoll:v.controller.wheelRotation(0)*.317/w.radius});
    }
    return {wheels:reports,samples};
  });
  assert.equal(geometry.wheels.length,4);assert.deepEqual(geometry.wheels.map(w=>w.index).sort(),[0,1,2,3]);
  for(const w of geometry.wheels){assert(w.maxAxisTilt<1e-6&&w.lateralRunout<1e-6&&w.maxHubDrift<1e-6&&w.maxCalliperDrift<1e-6,JSON.stringify(w));assert(w.steeringAlignment>.999999);}
  for(const sample of geometry.samples){assert(sample.rotation*sample.travel>0,'Forward and reverse must roll in their direction of travel');assert(Math.abs(sample.visualRoll-sample.expectedRoll)<1e-8);assert(Math.abs(sample.rotation*.317-sample.travel)<.005);}
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,v=window.__avtodrom.vehicle;
    v.reset({x:-20,z:40.5},0);s.guide.visible=s.goal.visible=false;
    const render=s.render.bind(s);window.wheelPose={angle:0,steer:0};
    s.render=(...args)=>{
      render(...args);for(const w of s.wheels){w.pivot.rotation.y=w.front?window.wheelPose.steer:0;w.spin.rotation.x=window.wheelPose.angle;}
      s.camera.clearViewOffset();s.camera.fov=43;s.camera.updateProjectionMatrix();
      s.camera.position.copy(s.car.localToWorld(new T.Vector3(3.8,1.05,3.8)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(0,-.1,0)));
      s.renderer.render(s.scene,s.camera);
    };
  });
  for(const [name,angle,steer]of [['straight',0,0],['quarter-turn',Math.PI/2,0],['half-turn',Math.PI,0],['steered',Math.PI/2,.4]]){
    await page.evaluate(p=>window.wheelPose=p,{angle,steer});await page.waitForTimeout(200);await page.screenshot({path:`${directory}/${name}.png`});
  }
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({geometry,errors},null,2));console.log(JSON.stringify({geometry,errors}));
}finally{await browser.close();}
