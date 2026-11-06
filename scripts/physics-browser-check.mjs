import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],checks=[];
const check=(name,condition)=>{assert(condition,name);checks.push(name);};
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const snap=()=>page.evaluate(()=>window.__avtodrom.snapshot());
await mkdir('test-results/physics-browser',{recursive:true});
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  const physicsTiming=await page.evaluate(()=>{
    const a=window.__avtodrom;a.start('practice');a.pause();const input={down:()=>false};
    const start=performance.now();for(let i=0;i<180;i++)a.vehicle.update(1/60,input,true);
    const msPerStep=(performance.now()-start)/180;a.start('practice');return {msPerStep};
  });
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.time>.5,null,{timeout:15000});
  await page.keyboard.press('KeyB');await page.keyboard.press('KeyI');await page.keyboard.press('Digit1');await page.keyboard.press('Space');
  await page.keyboard.down('KeyW');await page.waitForFunction(()=>{const t=window.__avtodrom.snapshot().telemetry;return t.gear===1&&t.signedSpeed>1&&t.engine;},null,{timeout:15000});
  const launch=await snap();check('Keyboard assisted first-gear launch',launch.telemetry.gear===1&&launch.telemetry.signedSpeed>1&&launch.telemetry.engine);
  await page.keyboard.press('Digit2');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.gear===2,null,{timeout:10000});
  const shift=await snap();check('Keyboard assisted upshift',shift.telemetry.gear===2&&shift.telemetry.engine&&shift.telemetry.signedSpeed>0);
  await page.keyboard.press('KeyR');await page.waitForTimeout(100);
  check('Keyboard reverse interlock while moving',(await snap()).telemetry.gear===2);
  await page.keyboard.up('KeyW');await page.keyboard.press('Escape');
  const brakingStart=await page.evaluate(async()=>{
    const {rpmAtSpeed}=await import('/src/simulation/drivetrain.ts');
    const a=window.__avtodrom,v=a.vehicle;a.start('practice');a.pause();
    v.reset({x:-44,z:42},Math.PI/2);const input={down:()=>false};
    for(let i=0;i<60;i++)v.update(1/60,input,true);
    const d=v.drivetrain;d.clutch=1;d.ignite();d.shift(2);d.rpm=rpmAtSpeed(50/3.6,2);
    d.clutch=0;d.throttle=1;d.handbrake=false;v.body.setLinvel({x:50/3.6,y:0,z:0},true);
    const t=v.telemetry();window.__physicsBrake={distance:0,last:t.position,collision:t.collision};return t;
  });
  check('Braking starts at 50 km/h in second gear',brakingStart.gear===2&&Math.abs(brakingStart.speed*3.6-50)<.01&&brakingStart.engine);
  await page.evaluate(()=>window.__avtodrom.resume());await page.keyboard.down('KeyW');await page.keyboard.down('KeyS');
  await page.waitForFunction(()=>{
    const t=window.__avtodrom.snapshot().telemetry,m=window.__physicsBrake;
    m.distance+=Math.hypot(t.position.x-m.last.x,t.position.z-m.last.z);m.last=t.position;m.collision ||= t.collision;
    return t.brake>.95&&t.throttle>.95&&t.speed<.15;
  },null,{timeout:10000});
  const braking=await page.evaluate(()=>({telemetry:window.__avtodrom.snapshot().telemetry,...window.__physicsBrake}));
  check('Keyboard brake stops against full throttle within 25 m',braking.distance<25&&!braking.collision&&braking.telemetry.engine&&braking.telemetry.speed<.15);
  await page.keyboard.up('KeyW');await page.keyboard.up('KeyS');await page.keyboard.press('Escape');
  await page.evaluate(()=>window.__avtodrom.start('exam'));
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.time>.35,null,{timeout:15000});await page.keyboard.press('KeyI');await page.keyboard.press('Digit1');
  check('Exam retains manual clutch interlock',(await snap()).telemetry.gear===0);
  await page.keyboard.down('ShiftLeft');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.clutch>.9,null,{timeout:10000});await page.keyboard.press('Digit1');
  check('Exam accepts a gear with the clutch down',(await snap()).telemetry.gear===1);
  await page.keyboard.up('ShiftLeft');await page.keyboard.press('Escape');
  const curbs=await page.evaluate(()=>{
    const a=window.__avtodrom,v=a.vehicle;a.start('practice');a.pause();
    const input={down:()=>false},results=[];
    for(const kmh of [8,25]){
      // Keep clear of the speed-limit pole immediately behind x=-29.
      v.reset({x:-25,z:40},0);for(let i=0;i<60;i++)v.update(1/60,input,true);
      v.action('handbrake');v.body.setLinvel({x:0,y:0,z:kmh/3.6},true);
      let collision=false,peakHeight=0,furthest=-Infinity,firstContact=null;
      for(let i=0;i<240;i++){
        v.update(1/60,input,true);const t=v.telemetry();collision ||= t.collision;
        peakHeight=Math.max(peakHeight,v.body.translation().y);furthest=Math.max(furthest,t.position.z);
        if(t.collision&&firstContact===null)firstContact={time:i/60,position:t.position,speed:t.speed*3.6};
      }
      results.push({kmh,collision,peakHeight,furthest,firstContact,final:v.telemetry()});
    }
    document.querySelector('#modal').close();return results;
  });
  for(const result of curbs){
    check(`Actual course curb contact at ${result.kmh} km/h`,result.collision&&result.final.speed*3.6<result.kmh*.95&&result.peakHeight<3.2);
    if(result.kmh===8)check('A slow course-curb impact stays blocked',result.furthest<44);
  }
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');const a=window.__avtodrom,s=a.scene,render=s.render.bind(s);
    s.render=(...args)=>{render(...args);s.guide.visible=s.goal.visible=false;s.camera.clearViewOffset();s.camera.fov=48;s.camera.updateProjectionMatrix();s.camera.position.set(-19,2.5,47);s.camera.lookAt(new T.Vector3(-25,.4,43));s.renderer.render(s.scene,s.camera);};
  });
  await page.waitForTimeout(300);await page.screenshot({path:'test-results/physics-browser/curb-impact.png'});
  await page.evaluate(()=>{
    const v=window.__avtodrom.vehicle;v.reset({x:-25,z:40},0);const input={down:()=>false};
    for(let i=0;i<60;i++)v.update(1/60,input,true);
  });
  await page.waitForTimeout(250);await page.screenshot({path:'test-results/physics-browser/curb-approach.png'});
  check('No browser errors',errors.length===0);
  const report={date:new Date().toISOString(),checks,errors,physicsTiming,launch:launch.telemetry,upshift:shift.telemetry,brakingStart,braking,curbs};
  await writeFile('test-results/physics-browser/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({checks,errors,physicsTiming,braking,curbs},null,2));
}finally{await browser.close();}
