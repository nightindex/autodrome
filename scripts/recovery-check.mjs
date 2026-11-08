import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/recovery';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const snapshot=()=>page.evaluate(()=>window.__avtodrom.snapshot());
async function flip(){await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js'),v=window.__avtodrom.vehicle,p=v.body.translation(),yaw=v.telemetry().yaw;
 v.body.setTranslation({x:p.x,y:.4,z:p.z},true);v.body.setRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI)),true);v.body.setLinvel({x:0,y:0,z:0},true);v.body.setAngvel({x:0,y:0,z:0},true);
 });}
try{
 await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'})));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');
 assert.equal(await page.locator('#recovery-prompt').isVisible(),false);await page.keyboard.press('KeyB');await page.keyboard.press('KeyI');await flip();
 await page.locator('#recover-button').waitFor({state:'visible',timeout:10000});await page.screenshot({path:`${directory}/desktop.png`});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${directory}/mobile.png`});
 const box=await page.locator('#recover-button').boundingBox();assert(box&&box.x>=0&&box.x+box.width<=390&&box.y>=0&&box.y+box.height<=844&&box.height>=44);
 const before=await snapshot();await page.click('#recover-button');await page.locator('#recovery-prompt').waitFor({state:'hidden'});const after=await snapshot();
 assert.equal(after.exercise,before.exercise);assert.equal(after.index,before.index);assert.equal(after.score,before.score);assert(after.telemetry.time>=before.telemetry.time);assert.equal(after.telemetry.gear,0);assert.equal(after.telemetry.handbrake,true);assert.equal(after.telemetry.belt,true);
 await page.waitForTimeout(1500);assert.equal(await page.evaluate(()=>window.__avtodrom.vehicle.canRecover),false);
 await page.keyboard.down('ShiftLeft');await page.keyboard.press('Digit1');await page.keyboard.press('Space');await page.keyboard.down('KeyW');await page.keyboard.up('ShiftLeft');await page.waitForTimeout(1800);await page.keyboard.up('KeyW');assert((await snapshot()).telemetry.speed>1);
 await page.setViewportSize({width:1440,height:900});await page.click('#pause-button');await page.click('#modal #menu');await page.click('#exam');await flip();await page.waitForTimeout(500);assert.equal(await page.locator('#recovery-prompt').isVisible(),false);
 await page.evaluate(()=>document.querySelector('#recover-button').click());assert.equal(await page.evaluate(()=>window.__avtodrom.vehicle.canRecover),true);
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({before,after,examRecoveryBlocked:true,driveAfterRecovery:true,errors},null,2));console.log(JSON.stringify({practiceRecovery:true,progressPreserved:true,driveAfterRecovery:true,examRecoveryBlocked:true,errors}));
}finally{await browser.close();}
