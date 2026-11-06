import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';

const phase=process.argv[2]??'after',directory='test-results/column-controls';
await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path=>path&&existsSync(path));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[],captures=[];
const check=(name,passed)=>{checks.push({name,passed});assert(passed,name);};
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  if(phase==='before')await page.route('**/assets/cobalt.glb*',route=>route.fulfill({path:`${directory}/before.glb`,contentType:'model/gltf-binary'}));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');
  await page.waitForTimeout(600);
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    window.columnPose={eye:[.31,.48,.2],target:[.31,.24,.80],fov:55};
    s.render=(...args)=>{
      render(...args);const p=window.columnPose;
      s.camera.clearViewOffset();s.camera.near=.025;s.camera.fov=p.fov;s.camera.updateProjectionMatrix();
      s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));
      s.camera.up.set(0,1,0).applyQuaternion(s.car.quaternion);
      s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));
      s.renderer.setRenderTarget(null);s.renderer.setScissorTest(false);s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);
    };
    window.columnState=()=>{
      const a=window.__avtodrom,car=a.scene.car;
      return {indicator:a.vehicle.indicator,hazards:a.vehicle.hazards,steering:a.vehicle.telemetry().steering,
        left:car.getObjectByName('COBALT_INDICATOR_STALK')?.rotation.z,
        right:car.getObjectByName('COBALT_WIPER_STALK')?.quaternion.toArray()};
    };
  });
  const capture=async(name,pose)=>{
    if(pose)await page.evaluate(pose=>{window.columnPose=pose;},pose);
    await page.waitForTimeout(350);const path=`${directory}/${phase}-${name}.png`;await page.screenshot({path});captures.push(path);
  };
  await capture('driver');
  await capture('photo-cabin',{eye:[0,.58,-.02],target:[0,-.08,.90],fov:62});
  await capture('indicator-detail',{eye:[.55,.24,.43],target:[.43,.132,.72],fov:42});
  await capture('wiper-detail',{eye:[.06,.24,.43],target:[.18,.132,.72],fov:42});
  await capture('indicator-legend',{eye:[.45,.18,.59],target:[.45,.132,.72],fov:32});
  await capture('wiper-legend',{eye:[.167,.18,.59],target:[.167,.132,.72],fov:32});
  if(phase==='after'){
    const initial=await page.evaluate(()=>window.columnState());
    check('Both independent column switches are loaded',initial.left!==undefined&&initial.right!==undefined);
    await page.keyboard.press('KeyQ');await page.waitForTimeout(650);
    const left=await page.evaluate(()=>window.columnState());
    check('Q selects left and lowers its lever',left.indicator==='left'&&left.left<-.15);
    await capture('left-signal',{eye:[.31,.48,.2],target:[.31,.24,.80],fov:55});
    await page.keyboard.down('KeyA');await page.waitForTimeout(650);
    const turning=await page.evaluate(()=>window.columnState());
    check('Lever stays latched while the wheel turns and lamps flash',Math.abs(turning.steering)>.2&&Math.abs(turning.left-left.left)<.001);
    await page.keyboard.up('KeyA');await page.waitForTimeout(650);
    await page.keyboard.press('KeyQ');await page.waitForTimeout(650);
    const cancelled=await page.evaluate(()=>window.columnState());
    check('Repeating Q cancels and returns the lever',cancelled.indicator==='off'&&Math.abs(cancelled.left)<.001);
    await page.keyboard.press('KeyE');await page.waitForTimeout(650);
    const right=await page.evaluate(()=>window.columnState());
    check('E selects right and raises the left lever',right.indicator==='right'&&right.left>.15);
    await capture('right-signal');
    await page.keyboard.press('KeyE');await page.keyboard.press('KeyH');await page.waitForTimeout(650);
    const hazards=await page.evaluate(()=>window.columnState());
    check('Hazards leave the neutral lever still',hazards.indicator==='off'&&hazards.hazards&&Math.abs(hazards.left)<.001);
    check('The wiper switch remains stationary',JSON.stringify(initial.right)===JSON.stringify(hazards.right));
    await page.keyboard.press('KeyH');
  }
  check('No browser errors',errors.length===0);
  await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({date:new Date().toISOString(),phase,checks,errors,captures},null,2));
  console.log(JSON.stringify({phase,checks,errors,captures},null,2));
}finally{await browser.close();}
