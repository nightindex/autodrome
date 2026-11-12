import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/wheel-airborne';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),a=window.__avtodrom,v=a.vehicle,s=a.scene;
  a.start('practice');a.pause();v.reset({x:-15,z:42},Math.PI/2);
  v.body.setTranslation({x:-15,y:1.3,z:42},true);
  v.body.setRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI/2).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI)),true);
  const idle={down:()=>false};for(let i=0;i<180;i++)v.update(1/60,idle,true);
  window.airborneFrame=()=>{
   s.render(v,1/60,v.time,false,0);const p=v.body.translation();s.guide.visible=s.goal.visible=false;
   s.camera.clearViewOffset();s.camera.fov=43;s.camera.updateProjectionMatrix();s.camera.position.set(p.x+4,p.y+2.5,p.z+5);s.camera.lookAt(p.x,p.y,p.z);s.camera.updateMatrixWorld();s.renderer.render(s.scene,s.camera);
   return {telemetry:v.telemetry(),wheels:s.wheels.map(w=>({index:w.index,visibleAngle:w.spin.rotation.x,physicalAngle:v.wheelRotation(w.index),contact:v.controller.wheelIsInContact(w.index)}))};
  };
 });
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 const before=await page.evaluate(()=>window.airborneFrame());await page.screenshot({path:`${directory}/before-throttle.png`});
 const spinning=await page.evaluate(()=>{
  const v=window.__avtodrom.vehicle;v.action('ignition');v.drivetrain.clutch=1;v.action('gear1');
  // Leave the handbrake applied: it holds the rear wheels, not the front drive.
  const throttle={down:key=>key==='throttle'};for(let i=0;i<180;i++)v.update(1/60,throttle,true);
  return window.airborneFrame();
 });await page.screenshot({path:`${directory}/spinning-front-wheels.png`});
 for(const wheel of spinning.wheels){
  const previous=before.wheels.find(w=>w.index===wheel.index);assert.equal(wheel.contact,false);
  if(wheel.index<2){assert(wheel.physicalAngle-previous.physicalAngle>5);assert(wheel.visibleAngle-previous.visibleAngle>5);}
  else assert(Math.abs(wheel.visibleAngle-previous.visibleAngle)<.01);
 }
 assert.equal(spinning.telemetry.engine,true);assert.equal(spinning.telemetry.handbrake,true);
 const recovered=await page.evaluate(()=>{if(!window.__avtodrom.vehicle.recover())throw new Error('Unable to recover roof-resting car');return window.airborneFrame();});
 for(const wheel of recovered.wheels){assert.equal(wheel.physicalAngle,0);assert(Math.abs(wheel.visibleAngle)<1e-8);}
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({before,spinning,recovered,errors},null,2));console.log(JSON.stringify({wheels:spinning.wheels,rpm:spinning.telemetry.rpm,errors}));
}finally{await browser.close();}
