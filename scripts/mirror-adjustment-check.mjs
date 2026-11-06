import {chromium} from 'playwright';import {existsSync} from 'node:fs';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const directory='test-results/mirror-adjustment';await mkdir(directory,{recursive:true});const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[];const check=(name,value)=>{assert(value,name);checks.push(name);};page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const neutralDirections=[];
const angles=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('avtodrom.settings.v1')).mirrors);
const watchMirrorDirections=()=>page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.renderer.render;window.mirrorDirections={};window.mirrorFrames={};s.renderer.render=function(scene,camera){const index=s.sideTargets.indexOf(this.getRenderTarget());if(index>=0){window.mirrorDirections[index]=camera.getWorldDirection(new T.Vector3()).applyQuaternion(s.car.getWorldQuaternion(new T.Quaternion()).invert()).toArray();window.mirrorFrames[index]=(window.mirrorFrames[index]??0)+1;}return draw.call(this,scene,camera);};});
const mirrorState=()=>page.evaluate(()=>{const s=window.__avtodrom.scene;return {settings:JSON.parse(localStorage.getItem('avtodrom.settings.v1')).mirrors,pivots:s.sideMirrorPivots.map(pivot=>pivot.rotation.toArray()),directions:structuredClone(window.mirrorDirections)};});
const settleMirror=async(side)=>{
 const index=side==='left'?0:1,last=await page.evaluate(index=>window.mirrorFrames[index]??0,index);
 await page.waitForFunction(({side,index,last})=>{const s=window.__avtodrom.scene,target=JSON.parse(localStorage.getItem('avtodrom.settings.v1')).mirrors[side],pivot=s.sideMirrorPivots[index];return window.mirrorFrames[index]>last&&Math.abs(pivot.rotation.x-target.pitch*Math.PI/180)<1e-6&&Math.abs(pivot.rotation.y-target.yaw*Math.PI/180)<1e-6;},{side,index,last});
};
const viewAngles=direction=>({yaw:Math.atan2(direction[0],-direction[2]),pitch:Math.asin(direction[1]/Math.hypot(...direction))});
const isDefault=positions=>['left','right'].every(side=>positions[side].yaw===0&&positions[side].pitch===0);
const checkDefaultPose=async(label)=>{
 for(const [side,index]of [['left',0],['right',1]]){
  await page.click(`[data-mirror=${side}]`);await settleMirror(side);const state=await mirrorState();
  check(`${label}: ${side} glass returns to its standard position`,Math.abs(state.pivots[index][0])<1e-6&&Math.abs(state.pivots[index][1])<1e-6);
  check(`${label}: ${side} reflected view returns to its standard direction`,Math.hypot(...state.directions[index].map((value,axis)=>value-neutralDirections[index][axis]))<1e-6);
 }
};
try{
 await page.addInitScript(()=>{if(!localStorage.getItem('avtodrom.settings.v1'))localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',volume:0}));});
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded);await page.click('#practice');
 check('Mirror switch is discoverable in chase view',await page.locator('#mirrors-button').isVisible());await page.click('#mirrors-button');
 check('Opening mirror controls switches to the cockpit',await page.evaluate(()=>window.__avtodrom.snapshot().camera)==='cockpit');
 check('The panel opens on the left mirror',await page.getAttribute('[data-mirror=left]','aria-pressed')==='true');
 await watchMirrorDirections();
 for(const [side,index,other]of [['left',0,'right'],['right',1,'left']]){
  await page.click(`[data-mirror=${side}]`);
  for(const [arrow,axis,sign]of [['left','yaw',1],['right','yaw',-1],['up','pitch',1],['down','pitch',-1]]){
   await page.click('#mirror-reset');await settleMirror(side);const before=await mirrorState();neutralDirections[index]??=before.directions[index];
   await page.click(`.mirror-${arrow}`);await settleMirror(side);const after=await mirrorState(),from=viewAngles(before.directions[index]),to=viewAngles(after.directions[index]),otherIndex=1-index;
   check(`${side}: ${arrow} moves the reflected view in its labelled direction`,(to[axis]-from[axis])*sign>.02);
   const fixedAxis=axis==='yaw'?'pitch':'yaw';check(`${side}: ${arrow} preserves the other viewing axis`,Math.abs(to[fixedAxis]-from[fixedAxis])<1e-6);
   check(`${side}: ${arrow} leaves the opposite mirror unchanged`,JSON.stringify(after.settings[other])===JSON.stringify(before.settings[other])&&JSON.stringify(after.pivots[otherIndex])===JSON.stringify(before.pivots[otherIndex]));
  }
  await page.click('#mirror-reset');await settleMirror(side);
 }
 await page.click('[data-mirror=left]');await settleMirror('left');const before=await page.evaluate(()=>window.mirrorDirections[0]);
 for(let i=0;i<3;i++)await page.click('.mirror-right');
 const up=await page.locator('.mirror-up').boundingBox();await page.mouse.move(up.x+up.width/2,up.y+up.height/2);await page.mouse.down();await page.waitForTimeout(450);await page.mouse.up();await page.waitForTimeout(400);
 let saved=await angles();check('Holding the pad adjusts only the chosen mirror',saved.left.yaw===3&&saved.left.pitch>1&&saved.right.yaw===0&&saved.right.pitch===0);
 const state=await page.evaluate(()=>{const s=window.__avtodrom.scene;return {direction:window.mirrorDirections[0],yaw:s.sideMirrorPivots[0].rotation.y,pitch:s.sideMirrorPivots[0].rotation.x};});
 check('The actuator tilts the glass and raises the rightward reflected view',state.yaw>.04&&state.pitch>0&&viewAngles(state.direction).yaw<viewAngles(before).yaw-.08&&state.direction[1]>before[1]);
 await page.waitForTimeout(300);check('Releasing the pad stops adjustment',JSON.stringify(saved)===JSON.stringify(await angles()));
 await page.screenshot({path:`${directory}/desktop.png`});
 await page.click('[data-mirror=off]');check('The neutral selector locks the directional pad',await page.locator('.mirror-up').isDisabled()&&await page.locator('#mirror-reset').isDisabled());
 await page.click('[data-mirror=right]');await page.click('.mirror-left');await page.click('.mirror-down');await page.click('#mirror-reset');saved=await angles();check('Reset affects only the selected mirror',saved.right.yaw===0&&saved.right.pitch===0&&saved.left.yaw===3);
 await page.click('[data-mirror=left]');await page.evaluate(()=>{for(let i=0;i<20;i++)document.querySelector('.mirror-right').click();});check('The mechanism stops at its travel limit',(await angles()).left.yaw===8&&await page.locator('.mirror-right').isDisabled());
 await page.waitForTimeout(500);await page.screenshot({path:`${directory}/limit.png`});
 await page.click('#mirror-reset');await page.click('.mirror-right');await page.click('.mirror-right');const handbrake=await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.handbrake);await page.focus('.mirror-up');await page.keyboard.press('Space');check('Keyboard activation adjusts the mirror without changing the handbrake',(await angles()).left.pitch===1&&await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.handbrake)===handbrake);
 const cancelBox=await page.locator('.mirror-down').boundingBox();await page.mouse.move(cancelBox.x+cancelBox.width/2,cancelBox.y+cancelBox.height/2);await page.mouse.down();await page.waitForTimeout(320);await page.dispatchEvent('.mirror-down','pointercancel');await page.mouse.up();const cancelled=JSON.stringify(await angles());await page.waitForTimeout(200);check('Cancelling a held switch stops the actuator command',cancelled===JSON.stringify(await angles()));await page.click('#mirror-reset');await page.click('.mirror-right');await page.click('.mirror-right');await page.click('.mirror-up');
 await page.keyboard.press('Escape');check('Escape closes the switch without pausing driving',await page.locator('#mirror-controls').isHidden()&&await page.evaluate(()=>window.__avtodrom.snapshot().state)==='driving');
 await page.reload();await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded);await page.click('#practice');await page.keyboard.press('KeyC');await page.locator('#mirrors-button').waitFor({state:'visible'});await page.click('#mirrors-button');await page.waitForTimeout(500);saved=await angles();check('Saved positions return after reload',saved.left.yaw===2&&saved.left.pitch===1&&saved.right.yaw===0);
 await watchMirrorDirections();await page.click('[data-mirror=right]');await page.click('.mirror-left');await page.click('.mirror-down');await settleMirror('right');
 saved=await angles();check('Both mirrors have customized positions before Default',saved.left.yaw!==0&&saved.left.pitch!==0&&saved.right.yaw!==0&&saved.right.pitch!==0);
 const defaultHandbrake=await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.handbrake),heldBox=await page.locator('.mirror-up').boundingBox();await page.mouse.move(heldBox.x+heldBox.width/2,heldBox.y+heldBox.height/2);await page.mouse.down();await page.waitForTimeout(320);await page.focus('#mirror-default');await page.keyboard.press('Space');await page.mouse.up();
 check('Keyboard Default restores both mirrors without changing the handbrake',isDefault(await angles())&&await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.handbrake)===defaultHandbrake);
 check('Default updates the selected mirror angle display',(await page.locator('#mirror-angles').textContent()).match(/0\.0°/g)?.length===2);
 await page.waitForTimeout(350);check('Default stops an active held adjustment',isDefault(await angles())&&await page.locator('[data-mirror-axis][data-held=true]').count()===0);
 await checkDefaultPose('Keyboard Default');
 for(const side of ['left','right']){await page.click(`[data-mirror=${side}]`);await page.click('.mirror-right');await page.click('.mirror-up');await settleMirror(side);}
 saved=await angles();check('Both mirrors are customized before Default with adjustment switched off',['left','right'].every(side=>saved[side].yaw!==0&&saved[side].pitch!==0));
 await page.click('[data-mirror=off]');check('Default stays available while the selector is off',await page.locator('#mirror-default').isEnabled()&&await page.locator('.mirror-up').isDisabled());await page.click('#mirror-default');
 check('Default restores both mirrors while keeping the selector off',isDefault(await angles())&&await page.getAttribute('[data-mirror=off]','aria-pressed')==='true'&&await page.locator('#mirror-reset').isDisabled());
 await checkDefaultPose('Default with selector off');await page.screenshot({path:`${directory}/default.png`});
 await page.reload();await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded);await page.click('#practice');await page.keyboard.press('KeyC');await page.click('#mirrors-button');check('Default positions remain saved after reload',isDefault(await angles()));await watchMirrorDirections();await checkDefaultPose('Reloaded Default');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(350);await page.screenshot({path:`${directory}/mobile.png`});const bounds=await page.locator('#mirror-controls').boundingBox();check('The adjustment panel fits a narrow screen',bounds.x>=0&&bounds.x+bounds.width<=390&&bounds.y+bounds.height<=844);
 const defaultBounds=await page.locator('#mirror-default').boundingBox();check('Default remains visible within the narrow viewport',await page.locator('#mirror-default').isVisible()&&defaultBounds.x>=0&&defaultBounds.x+defaultBounds.width<=390&&defaultBounds.y>=0&&defaultBounds.y+defaultBounds.height<=844);await page.click('#mirror-default');check('Default can be activated on a narrow screen',isDefault(await angles()));
 await page.keyboard.press('KeyC');await page.waitForTimeout(150);check('Leaving the cockpit closes the adjustment panel',await page.locator('#mirror-controls').isHidden());
 check('No browser errors',errors.length===0);await writeFile(`${directory}/report.json`,JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();}
