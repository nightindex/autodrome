import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory=process.env.PILLAR_CAPTURE_DIRECTORY||'test-results/pillar-photo';
await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path=>path&&existsSync(path));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],captures=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');
  const live=await page.evaluate(()=>{const s=window.__avtodrom.scene,eye=s.cockpitEye.toArray();return {eye,target:[eye[0],eye[1]-.025,eye[2]+1],fov:s.cockpitView.fov};});
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    s.cameraMode='cockpit';window.pillarPose={eye:[.31,.48,.2],target:[.63,.39,.92],fov:40};
    s.render=(...args)=>{
      const p=window.pillarPose;args[4]=Math.atan2(p.target[0]-p.eye[0],p.target[2]-p.eye[2])/.85;render(...args);
      s.camera.clearViewOffset();s.camera.near=.025;s.camera.fov=p.fov;s.camera.updateProjectionMatrix();
      s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));
      s.renderer.render(s.scene,s.camera);
    };
  });
  const poses=[
    ['left-windscreen-joint',{eye:[.31,.48,.2],target:[.63,.39,.92],fov:40}],
    ['right-windscreen-joint',{eye:[-.31,.48,.2],target:[-.63,.39,.92],fov:40}],
    ['game-driver',live],
    ['driver-left-joint',{...live,target:[.68,.34,1.02],fov:45}],
    ['driver-right-joint',{...live,target:[-.68,.34,1.02],fov:45}],
    ['wide-front-pillars',{eye:[0,.55,-.05],target:[0,.43,1.1],fov:70}],
  ];
  for(const [name,pose]of poses){
    await page.evaluate(pose=>window.pillarPose=pose,pose);await page.waitForTimeout(400);
    const path=`${directory}/after-${name}.png`;await page.screenshot({path});captures.push(path);

  }
  await page.setViewportSize({width:768,height:960});
  await page.evaluate(()=>window.pillarPose={eye:[.31,.48,.2],target:[.63,.39,.92],fov:55});
  await page.waitForTimeout(400);
  const compactPath=`${directory}/after-compact-left-joint.png`;await page.screenshot({path:compactPath});captures.push(compactPath);
  assert.equal(errors.length,0,JSON.stringify(errors));
  await writeFile(`${directory}/photo-report.json`,JSON.stringify({captures,errors},null,2));
  console.log(JSON.stringify({captures,errors},null,2));
}finally{await browser.close();}
