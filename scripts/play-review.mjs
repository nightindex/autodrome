import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
await mkdir('test-results/review',{recursive:true});
const page=await browser.newPage({viewport:{width:1366,height:768}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const snap=()=>page.evaluate(()=>window.__avtodrom.snapshot());
const phase=process.env.REVIEW_PHASE||'after';
const shot=name=>page.screenshot({path:`test-results/review/${phase}-${name}.png`});
const findings={};
const confirming=phase!=='before';
try{
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.waitForTimeout(800);await shot('menu');
  findings.desktopMenu=await page.evaluate(()=>{const h=document.querySelector('.hero').getBoundingClientRect(),f=document.querySelector('.menu-footer').getBoundingClientRect();return {heroBottom:h.bottom,footerTop:f.top};});
  if(confirming)assert(findings.desktopMenu.heroBottom<findings.desktopMenu.footerTop,'Laptop menu must not overlap its footer');
  findings.wheels=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const s=window.__avtodrom.scene;
    return s.wheels.map(w=>({base:w.base.toArray(),pivot:w.pivot.position.toArray(),size:new T.Box3().setFromObject(w.spin).getSize(new T.Vector3()).toArray()}));
  });
  if(confirming)assert(findings.wheels.every(w=>Math.abs(w.base[1]-w.pivot[1])<.001),'Menu wheels must remain in their wheel arches');
  findings.routeArrows=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {course}=await import('/src/data/course.ts');
    const arrows=window.__avtodrom.scene.guide.children[0];
    const matrix=new T.Matrix4(),position=new T.Vector3();
    return course.route.slice(1).flatMap((b,j)=>{
      const a=course.route[j],dx=b.x-a.x,dz=b.z-a.z,length=Math.hypot(dx,dz);if(length<.5)return [];
      const alignments=[];
      for(let i=0;i<arrows.count;i++){
        arrows.getMatrixAt(i,matrix);position.setFromMatrixPosition(matrix);
        const along=((position.x-a.x)*dx+(position.z-a.z)*dz)/length;
        const across=Math.abs((position.x-a.x)*dz-(position.z-a.z)*dx)/length;
        if(across<.01&&along>.1&&along<length-.1){
          const forward=new T.Vector3(0,1,0).transformDirection(matrix);
          alignments.push((forward.x*dx+forward.z*dz)/length);
        }
      }
      // Parking uses the same lane in both directions, so both headings can be present.
      return alignments.length?[{leg:j,alignment:Math.max(...alignments)}]:[];
    });
  });
  if(confirming)assert(findings.routeArrows.length>0&&findings.routeArrows.every(a=>a.alignment>.99),'Route arrows must point along the driven route');
  await page.click('#practice');await page.keyboard.press('KeyB');await page.keyboard.press('KeyI');
  await page.keyboard.down('ShiftLeft');await page.waitForTimeout(300);await page.keyboard.press('Digit1');await page.keyboard.press('Space');await page.keyboard.press('KeyQ');
  await page.keyboard.down('KeyW');await page.keyboard.up('ShiftLeft');await page.waitForTimeout(1100);await page.keyboard.up('KeyW');
  findings.forward=await snap();
  await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyS');await page.waitForTimeout(1800);await page.keyboard.up('KeyS');await page.keyboard.up('ShiftLeft');
  await shot('driving');
  if(confirming){
    // Drive using keyboard inputs and telemetry feedback, without moving the car through diagnostics.
    let throttle=false,brake=false,cancelled=false;
    const pedal=async(key,next,current)=>{if(next!==current)await page.keyboard[next?'down':'up'](key);return next;};
    for(let i=0;i<240;i++){
      const s=await snap(),t=s.telemetry,d=-16.5-t.bumper.x;
      if(t.position.x>-29&&!cancelled){await page.keyboard.press('KeyQ');cancelled=true;}
      const desired=Math.min(2.7,Math.sqrt(3*Math.max(0,d-.45)));
      throttle=await pedal('KeyW',d>.8&&t.speed<desired-.15,throttle);
      brake=await pedal('KeyS',t.speed>desired+.05||d<.65,brake);
      if(d>=0&&d<=1&&t.speed<.12){findings.pedestrianStop={distance:d,snapshot:s};break;}
      if(d<0)break;
      await page.waitForTimeout(150);
    }
    await page.keyboard.up('KeyW');await page.keyboard.down('KeyS');
    assert(findings.pedestrianStop,'Keyboard driver must stop within one metre of the pedestrian line');
    await page.waitForTimeout(3200);await shot('pedestrian-stop');
    findings.stopSatisfied=await page.evaluate(()=>window.__avtodrom.engine().stoppedCorrectly);
    assert(findings.stopSatisfied,'Three-second stop must be recognised');
    await page.keyboard.up('KeyS');await page.keyboard.down('KeyW');await page.waitForTimeout(2300);await page.keyboard.up('KeyW');
    await page.keyboard.down('KeyS');await page.waitForTimeout(1300);await page.keyboard.up('KeyS');
    findings.afterCrossing=await snap();
    assert(findings.afterCrossing.exercise==='hill','Driving across the crossing must advance to the hill exercise');
    assert.equal(findings.afterCrossing.score,0,'Correct start and crossing must incur no penalties');
  }
  await page.keyboard.press('KeyC');await page.waitForTimeout(400);await shot('cockpit');
  await page.keyboard.press('Escape');await page.click('#modal #settings');
  await page.selectOption('#language','ru');findings.language=await page.locator('html').getAttribute('lang');
  if(confirming)assert.equal(findings.language,'ru','Settings must update the document language');
  await page.click('[data-bind="camera"]');await page.keyboard.press('KeyV');
  await page.click('[data-bind="ignition"]');await page.keyboard.press('KeyJ');
  await page.click('[data-bind="throttle"]');await page.keyboard.press('Escape');await page.click('#modal #close');
  findings.bindingCancel={state:(await snap()).state,dialogOpen:await page.locator('#modal').evaluate(d=>d.open),dialogType:await page.locator('#modal').getAttribute('data-type')};
  if(confirming)assert(findings.bindingCancel.dialogOpen&&findings.bindingCancel.dialogType==='pause','Cancelling remapping must preserve the pause dialog');
  if(await page.locator('#resume').isVisible())await page.click('#resume');
  else await page.evaluate(()=>window.__avtodrom.resume());
  if(confirming){
    assert.equal(await page.locator('#camera-button kbd').innerText(),'V');
    assert((await page.locator('#stall').innerText()).includes('J'),'Stall recovery must show the remapped ignition key');
  }
  await page.keyboard.press('Escape');await page.click('#modal #menu');
  if(confirming)assert(!(await page.locator('#toast').getAttribute('class')).includes('show'),'Returning to menu must clear gameplay notifications');
  await page.setViewportSize({width:375,height:667});await shot('narrow-menu');
  findings.narrowMenu=await page.evaluate(()=>{const h=document.querySelector('.hero').getBoundingClientRect(),f=document.querySelector('.menu-footer').getBoundingClientRect();return {heroBottom:h.bottom,footerTop:f.top};});
  await page.setViewportSize({width:1024,height:600});await shot('short-menu');
  findings.shortMenu=await page.evaluate(()=>{const h=document.querySelector('.hero').getBoundingClientRect(),f=document.querySelector('.menu-footer').getBoundingClientRect();return {heroBottom:h.bottom,footerTop:f.top};});
  if(confirming)assert(findings.shortMenu.heroBottom<findings.shortMenu.footerTop,'Short-window menu must not overlap its footer');
  await page.click('#settings');await page.click('#restore');await page.click('#close');
  await page.setViewportSize({width:1366,height:768});await page.click('#exercises');await page.click('[data-exercise="6"]');
  await page.keyboard.press('KeyB');await page.keyboard.press('KeyI');await page.keyboard.down('ShiftLeft');await page.waitForTimeout(300);await page.keyboard.press('KeyR');await page.keyboard.press('Space');
  await page.keyboard.down('KeyW');await page.keyboard.up('ShiftLeft');await page.waitForTimeout(1500);await page.keyboard.up('KeyW');findings.reverse=await snap();
  await page.keyboard.down('KeyA');await page.waitForTimeout(300);await page.keyboard.up('KeyA');findings.steering=(await snap()).telemetry.steering;
  await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyS');await page.waitForTimeout(1500);await page.keyboard.up('KeyS');await page.keyboard.up('ShiftLeft');await shot('garage');
  findings.errors=errors;
  if(confirming){assert(findings.forward.telemetry.signedSpeed>1);assert(findings.reverse.telemetry.signedSpeed<-.3);assert(findings.steering>.1);assert.deepEqual(errors,[]);}
  await writeFile(`test-results/review/${phase}-report.json`,JSON.stringify(findings,null,2));
  console.log(JSON.stringify({phase,wheels:findings.wheels.length,routeLegs:findings.routeArrows.length,stopDistance:findings.pedestrianStop?.distance,stopSatisfied:findings.stopSatisfied,nextExercise:findings.afterCrossing?.exercise,score:findings.afterCrossing?.score,language:findings.language,bindingCancel:findings.bindingCancel,desktopMenu:findings.desktopMenu,shortMenu:findings.shortMenu,reverseSpeed:findings.reverse.telemetry.signedSpeed,steering:findings.steering,errors},null,2));
}finally{await browser.close();}
