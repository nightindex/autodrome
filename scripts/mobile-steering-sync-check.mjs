import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/mobile-steering';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:844,height:390},hasTouch:true,isMobile:true});
const report={checks:[],samples:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
await page.addInitScript(()=>{localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',volume:0}));Object.defineProperty(document,'fullscreenEnabled',{configurable:true,value:false});Object.defineProperty(screen.orientation,'lock',{configurable:true,value:()=>Promise.reject(new Error('Unavailable in viewport tests'))});});
const client=await page.context().newCDPSession(page);let cx,cy,radius;
const finger=(type,angle=0)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{id:1,x:cx+radius*Math.sin(angle*Math.PI/180),y:cy-radius*Math.cos(angle*Math.PI/180),radiusX:3,radiusY:3,force:1}]});
const degrees=()=>page.evaluate(()=>-window.__avtodrom.vehicle.steering.wheelAngle*180/Math.PI);
async function settled(target){await page.waitForFunction(target=>Math.abs(-window.__avtodrom.vehicle.steering.wheelAngle*180/Math.PI-target)<.02,target,{timeout:10000});}
try{
  await page.goto(process.env.SIMULATOR_URL??'http://127.0.0.1:5174/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});await page.locator('#practice').tap();
  await page.evaluate(()=>{
    window.__avtodrom.scene.cameraMode='cockpit';window.steeringSamples=[];
    const sample=()=>{
      const s=window.__avtodrom.scene,q=s.steeringBase.clone().invert().multiply(s.steering.quaternion);
      const screen=parseFloat(document.querySelector('#touch-wheel img').style.transform.slice(7))||0;
      const cabin=2*Math.atan2(q.z,q.w)*180/Math.PI,expected=-s.handwheelAngle*180/Math.PI;
      const wrap=angle=>((angle+180)%360+360)%360-180;
      window.steeringSamples.push({screen,cabin,expected,cabinError:Math.abs(wrap(screen-cabin)),poseError:Math.abs(screen-expected),held:document.querySelector('#touch-wheel').dataset.held==='true'});
      window.steeringSampleFrame=requestAnimationFrame(sample);
    };window.steeringSampleFrame=requestAnimationFrame(sample);
  });
  const box=await page.locator('#touch-wheel').boundingBox();cx=box.x+box.width/2;cy=box.y+box.height/2;radius=box.width*.4;
  await finger('touchStart');for(const angle of [15,30,45])await finger('touchMove',angle);await settled(45);
  await page.screenshot({path:`${directory}/right-45-gesture.png`});
  report.checks.push('A 45-degree thumb gesture gives 45 degrees on both wheels, without input amplification');
  for(let angle=75;angle<=495;angle+=30)await finger('touchMove',angle);await finger('touchMove',516.6);await settled(516.6);await page.screenshot({path:`${directory}/right-lock.png`});
  for(let angle=486.6;angle>=-503.4;angle-=30)await finger('touchMove',angle);await finger('touchMove',-516.6);await settled(-516.6);await page.screenshot({path:`${directory}/left-lock.png`});
  await finger('touchEnd');await settled(0);report.checks.push('Both full locks, reversal and released self-centring stay synchronized');
  await finger('touchStart');await finger('touchMove',90);await settled(90);await finger('touchEnd');await page.waitForTimeout(35);
  await finger('touchStart',-40);const grabbed=await degrees();await page.waitForTimeout(250);const held=await degrees();
  assert(Math.abs(held-grabbed)<20,`Re-grab changed the angle: ${grabbed} -> ${held}`);await finger('touchEnd');await settled(0);
  report.checks.push('Taking hold while the wheel returns holds its angle without a jump');
  report.samples=await page.evaluate(()=>{cancelAnimationFrame(window.steeringSampleFrame);return window.steeringSamples;});
  report.maxCabinError=Math.max(...report.samples.map(s=>s.cabinError));report.maxPoseError=Math.max(...report.samples.map(s=>s.poseError));
  assert(report.samples.some(s=>s.held)&&report.samples.some(s=>!s.held));
  assert(report.maxCabinError<.001,`Cabin/screen difference: ${report.maxCabinError} degrees`);assert(report.maxPoseError<.001);
  assert.deepEqual(report.errors,[]);
  console.log(JSON.stringify({checks:report.checks,frames:report.samples.length,maxCabinError:report.maxCabinError,maxPoseError:report.maxPoseError,errors:report.errors},null,2));
}finally{await writeFile(`${directory}/sync-report.json`,JSON.stringify(report,null,2));await browser.close();}
