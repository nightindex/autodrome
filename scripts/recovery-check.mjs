import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/recovery';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1920,height:1080}}),errors=[],checks=[],diagnostics=[],layouts=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,condition)=>{checks.push({name,passed:!!condition});assert(condition,name);};
const snapshot=()=>page.evaluate(()=>window.__avtodrom.snapshot());
const tick=n=>page.evaluate(n=>{for(let i=0;i<n;i++)window.__avtodrom.step(1/60);},n);
const release=async()=>{for(const key of ['KeyW','KeyS','ShiftLeft','ArrowUp','ArrowDown','KeyU'])await page.keyboard.up(key);};
let report={};
async function fixture(issue='neutral'){
 await release();await page.evaluate(issue=>{
  const a=window.__avtodrom,v=a.vehicle;a.start('practice');a.pause();v.reset({x:-44,z:42},Math.PI/2);
  for(let i=0;i<120;i++)v.update(1/60,{down:()=>false},true);v.belt=true;v.drivetrain.clutch=1;
  if(issue!=='engine')v.action('ignition');if(issue!=='neutral'&&issue!=='engine')v.action('gear1',true);v.drivetrain.handbrake=issue==='handbrake';a.resume();
  if(issue==='stalled'){v.drivetrain.engine=false;v.drivetrain.stalled=true;}
 },issue);
 // Closing a dialog restores keyboard focus on the next browser turn.
 await page.waitForFunction(()=>!document.activeElement?.closest('#modal'));
}
async function waitIssue(issue){
 await page.waitForFunction(issue=>{const p=document.querySelector('#recovery-prompt');return p&&!p.hidden&&p.dataset.issue===issue;},issue,{timeout:15000});return page.locator('#recovery-prompt').innerText();
}
async function layout(name){
 const r=await page.evaluate(()=>{
  const rect=s=>{const n=document.querySelector(s),r=n?.getBoundingClientRect();return !n||n.hidden||getComputedStyle(n).display==='none'||!r.width||!r.height?null:{x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
  const panel=rect('#recovery-prompt'),others=Object.fromEntries(['.instrument-panel','#start-help','.exercise-card'].map(s=>[s,rect(s)]));
  const overlap=(a,b)=>a&&b&&Math.min(a.right,b.right)-Math.max(a.x,b.x)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.y,b.y)>1;
  return {viewport:{width:innerWidth,height:innerHeight},panel,button:rect('#recover-button'),others,overlaps:Object.entries(others).filter(([,r])=>overlap(panel,r)).map(([s])=>s)};
 });layouts.push({name,...r});
 check(`${name}: card stays in viewport`,r.panel&&r.panel.x>=0&&r.panel.y>=0&&r.panel.right<=r.viewport.width&&r.panel.bottom<=r.viewport.height);
 check(`${name}: no overlap with speed, startup help or exercise`,r.overlaps.length===0);
 if(r.button)check(`${name}: recovery action has visible 44px target`,r.button.height>=44&&r.button.x>=0&&r.button.right<=r.viewport.width&&r.button.bottom<=r.viewport.height&&r.button.y>=r.panel.y&&r.button.bottom<=r.panel.bottom);
 await page.screenshot({path:`${directory}/${name}.png`});
}
async function reverseDrive({clutch='ShiftLeft',reverse='KeyR',handbrake='Space',throttle='KeyW'}={}){
 await page.keyboard.down(clutch);await tick(18);await page.keyboard.press(reverse);await tick(18);check('Clutch and reverse select R',(await snapshot()).telemetry.gear===-1);
 if((await snapshot()).telemetry.handbrake)await page.keyboard.press(handbrake);await page.keyboard.up(clutch);await page.keyboard.down(throttle);await tick(180);await page.keyboard.up(throttle);
 const r=await snapshot();check('Keyboard throttle actually drives backwards',r.telemetry.signedSpeed<-.5&&r.telemetry.engine);return r;
}
async function flip(){await page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js'),v=window.__avtodrom.vehicle,p=v.body.translation(),yaw=v.telemetry().yaw;
 v.body.setTranslation({x:p.x,y:.4,z:p.z},true);v.body.setRotation(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),yaw).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),Math.PI)),true);v.body.setLinvel({x:0,y:0,z:0},true);v.body.setAngvel({x:0,y:0,z:0},true);
});}
try{
 await page.addInitScript(()=>{if(!localStorage.getItem('avtodrom.settings.v1'))localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',quality:'low'}));});
 await page.goto(process.env.AVTODROM_URL??'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});await page.click('#practice');
 check('An unattempted launch shows no diagnosis',!await page.locator('#recovery-prompt').isVisible());
 for(const issue of ['engine','stalled','neutral','handbrake','brake','clutch']){
  await fixture(issue);if(issue==='brake')await page.keyboard.down('KeyS');if(issue==='clutch')await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyW');await tick(75);
  const text=await waitIssue(issue);diagnostics.push({issue,text,telemetry:(await snapshot()).telemetry});check(`${issue}: useful failed-launch diagnosis`,text.trim().length>20);check(`${issue}: no teleport for ordinary controls`,!await page.locator('#recover-button').isVisible());
  if(issue==='neutral'){check('Neutral help explains clutch, reverse and gas',/R/.test(text)&&/Shift/.test(text)&&/W/.test(text));await layout('neutral-desktop');await page.setViewportSize({width:390,height:844});await layout('neutral-mobile');await page.setViewportSize({width:1920,height:1080});}
  if(issue==='stalled'){await page.setViewportSize({width:390,height:844});await layout('stalled-mobile');check('Stall has one readable explanation',!await page.locator('#stall').isVisible());await page.setViewportSize({width:1920,height:1080});}await release();
 }
 await fixture();await page.keyboard.down('KeyS');await tick(90);await page.keyboard.up('KeyS');check('S brakes and never selects reverse',(await snapshot()).telemetry.gear===0&&(await snapshot()).telemetry.speed<.05);const flatReverse=await reverseDrive();
 await fixture();await page.keyboard.down('ShiftLeft');await tick(18);await page.keyboard.press('Digit1');await page.keyboard.up('ShiftLeft');await page.keyboard.down('KeyW');await tick(150);
 const forward=await snapshot();check('Interlock test starts driving forwards',forward.telemetry.gear===1&&forward.telemetry.signedSpeed>1);await page.keyboard.press('KeyR');await page.waitForTimeout(100);check('Reverse is rejected while rolling forwards',(await snapshot()).telemetry.gear===1);
 const rejection=await page.locator('#toast').innerText();check('Rejected reverse explains stopping',/останов|to‘xta/i.test(rejection));await release();
 await fixture();await flip();await tick(180);await waitIssue('overturned');await layout('overturned-desktop');const overturnedBefore=await snapshot();await page.click('#recover-button');await page.waitForFunction(()=>window.__avtodrom.vehicle.recoveryReason===null);const overturnedAfter=await snapshot();
 check('Overturned recovery preserves exercise, score and belt',overturnedAfter.exercise===overturnedBefore.exercise&&overturnedAfter.index===overturnedBefore.index&&overturnedAfter.score===overturnedBefore.score&&overturnedAfter.telemetry.belt);check('Overturned recovery leaves N and handbrake',overturnedAfter.telemetry.gear===0&&overturnedAfter.telemetry.handbrake);
 const curb=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{vehicleConfig:c}=await import('/src/data/vehicle.ts');const a=window.__avtodrom,v=a.vehicle;a.start('practice');a.pause();const mesh=a.scene.world.group.getObjectByName('course-curbs');
  const near=new T.Raycaster(new T.Vector3(-25,.1,27),new T.Vector3(0,0,1),0,5).intersectObject(mesh)[0].point.z,far=new T.Raycaster(new T.Vector3(-25,.1,31),new T.Vector3(0,0,-1),0,5).intersectObject(mesh)[0].point.z;
  v.reset({x:-25,z:near-c.wheelbase/2-c.wheelRadius-.003},0);const idle={down:()=>false};for(let i=0;i<60;i++)v.update(1/60,idle,true);v.drivetrain.handbrake=false;
  for(let i=0;i<240;i++){v.body.setLinvel({x:0,y:0,z:.3},true);v.update(1/60,idle,true);if(v.collision)break;}v.body.setLinvel({x:0,y:0,z:0},true);v.drivetrain.handbrake=true;for(let i=0;i<60;i++)v.update(1/60,idle,true);
  v.belt=true;v.action('ignition');v.action('gear1',true);v.drivetrain.handbrake=false;for(let i=0;i<300;i++)v.update(1/60,{down:a=>a==='throttle'},true);a.resume();return {near,far,initial:v.telemetry(),surfaces:v.telemetry().wheels.map(p=>v.surfaceAt(p))};
 });
 check('Actual curb has front tyres on grass and rear tyres on asphalt',curb.surfaces.slice(0,2).every(s=>s==='grass')&&curb.surfaces.slice(2).every(s=>s==='asphalt'));
 await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyS');await tick(60);await page.keyboard.press('KeyR');await tick(18);await release();const reverseAttemptStart=await snapshot();check('R is selected before grounded reverse attempt',reverseAttemptStart.telemetry.gear===-1);
 await page.keyboard.down('KeyW');await tick(360);await page.keyboard.up('KeyW');await tick(12);await waitIssue('stuck');const stuckBefore=await snapshot();
 check('Failed reverse launch detects a genuinely grounded upright car',await page.evaluate(()=>{const v=window.__avtodrom.vehicle,q=v.body.rotation();return v.recoveryReason==='stuck'&&1-2*(q.x*q.x+q.z*q.z)>.75;}));
 check('The curb still blocks reverse movement',Math.hypot(stuckBefore.telemetry.position.x-reverseAttemptStart.telemetry.position.x,stuckBefore.telemetry.position.z-reverseAttemptStart.telemetry.position.z)<1);check('Released throttle leaves the action available',await page.locator('#recover-button').isVisible());check('Stuck action describes returning to road',/Вернуть на дорогу/.test(await page.locator('#recover-button').innerText()));
 await layout('stuck-desktop');
 for(const size of [{width:700,height:500},{width:800,height:600},{width:650,height:360},{width:390,height:384}]){await page.setViewportSize(size);await layout(`stuck-${size.width}x${size.height}`);}
 await page.setViewportSize({width:390,height:844});await layout('stuck-mobile');const beforeRecovery=await snapshot();await page.click('#recover-button');await tick(120);const afterRecovery=await snapshot();
 check('Grounded recovery preserves score, events and time',afterRecovery.score===beforeRecovery.score&&JSON.stringify(afterRecovery.events)===JSON.stringify(beforeRecovery.events)&&afterRecovery.telemetry.time>=beforeRecovery.telemetry.time);check('Grounded recovery preserves exercise progress',afterRecovery.exercise===beforeRecovery.exercise&&afterRecovery.index===beforeRecovery.index);
 check('Recovery puts all tyres on asphalt in N with handbrake',afterRecovery.telemetry.gear===0&&afterRecovery.telemetry.handbrake&&await page.evaluate(()=>{const v=window.__avtodrom.vehicle;return v.recoveryReason===null&&v.telemetry().wheels.every(p=>v.surfaceAt(p)==='asphalt');}));const driveAfterRecovery=await reverseDrive();
 await release();await page.setViewportSize({width:1920,height:1080});await page.evaluate(()=>{const a=window.__avtodrom;a.start('exam');a.vehicle.action('ignition');a.vehicle.drivetrain.clutch=0;});
 await page.keyboard.down('ShiftLeft');await page.keyboard.press('KeyR');await tick(45);await page.keyboard.up('ShiftLeft');
 const fastChord=await snapshot();check('A fast manual Shift+R request completes when the held clutch opens',fastChord.telemetry.gear===-1);
 await flip();await tick(150);check('Exam hides practice recovery',!await page.locator('#recovery-prompt').isVisible());await page.evaluate(()=>document.querySelector('#recover-button').click());check('Synthetic click cannot recover in exam',await page.evaluate(()=>window.__avtodrom.vehicle.recoveryReason==='overturned'));
 await page.evaluate(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',quality:'low',bindings:{throttle:'ArrowUp',brake:'ArrowDown',clutch:'KeyU',reverse:'KeyV',handbrake:'KeyJ'}})));await page.reload();await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:90000});
 await fixture();await page.keyboard.down('ArrowUp');await tick(75);const remappedText=await waitIssue('neutral');await page.keyboard.up('ArrowUp');check('Diagnosis reflects remapped clutch, reverse and throttle',/U/.test(remappedText)&&/V/.test(remappedText)&&/↑|ArrowUp|Up/.test(remappedText)&&!/Shift/.test(remappedText));await page.keyboard.down('ArrowDown');await tick(90);await page.keyboard.up('ArrowDown');check('Remapped brake never selects reverse',(await snapshot()).telemetry.gear===0);const remappedReverse=await reverseDrive({clutch:'KeyU',reverse:'KeyV',handbrake:'KeyJ',throttle:'ArrowUp'});
 check('No browser errors',errors.length===0);report={checks,errors,diagnostics,layouts,flatReverse,forward,rejection,overturnedBefore,overturnedAfter,curb,reverseAttemptStart,stuckBefore,beforeRecovery,afterRecovery,driveAfterRecovery,fastChord,remappedText,remappedReverse};console.log(JSON.stringify({checks,errors},null,2));
}catch(error){report={...report,checks,errors,diagnostics,layouts,failure:String(error),failureState:await page.evaluate(()=>({snapshot:window.__avtodrom?.snapshot(),settings:localStorage.getItem('avtodrom.settings.v1'),panel:document.querySelector('#recovery-prompt')?.outerHTML})).catch(()=>null)};await page.screenshot({path:`${directory}/failure.png`}).catch(()=>{});throw error;}
finally{await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await browser.close();}
