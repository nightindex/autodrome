import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/cabin-mirror-switch';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),checks=[],errors=[];
page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const check=(name,value,detail)=>{assert(value,`${name}: ${JSON.stringify(detail)}`);checks.push(name);};
const position=()=>page.evaluate(async()=>{
 const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,node=s.car.getObjectByName('COBALT_MirrorSwitchKnob'),point=node.getWorldPosition(new T.Vector3()).project(s.camera);
 return {x:(point.x+1)*innerWidth/2,y:(1-point.y)*innerHeight/2,z:point.z};
});
try{
 await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru',volume:0,mirrors:{left:{yaw:0,pitch:0},right:{yaw:0,pitch:0}}})));
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 await page.click('#practice');await page.keyboard.press('KeyC');await page.waitForTimeout(400);
 const point=await position();check('The physical mirror switch is visible from the normal driver camera',point.x>0&&point.x<1440&&point.y>0&&point.y<960&&point.z<1,point);
 await page.mouse.move(point.x,point.y);await page.waitForTimeout(120);
 check('The visible 3D knob offers a pointer and localized tooltip',await page.locator('#viewport canvas').evaluate(canvas=>canvas.style.cursor==='pointer'&&canvas.title==='Регулировка зеркал'));
 await page.screenshot({path:`${directory}/driver.png`});
 await page.mouse.click(point.x,point.y);await page.locator('#mirror-controls').waitFor({state:'visible'});
 check('Clicking the model opens the real mirror controls',await page.getAttribute('#mirrors-button','aria-expanded')==='true');
 const before=await page.evaluate(()=>JSON.parse(localStorage.getItem('avtodrom.settings.v1')).mirrors);
 await page.click('.mirror-right');await page.click('.mirror-up');await page.waitForTimeout(350);
 const after=await page.evaluate(()=>({saved:JSON.parse(localStorage.getItem('avtodrom.settings.v1')).mirrors,angle:window.__avtodrom.scene.sideMirrorPivots[0].rotation.y}));
 check('Controls opened from the cabin switch drive and save the left actuator only',after.saved.left.yaw===before.left.yaw+1&&after.saved.left.pitch===before.left.pitch+1&&after.saved.right.yaw===before.right.yaw&&Math.abs(after.angle)>.01,after);
 await page.screenshot({path:`${directory}/panel.png`});await page.keyboard.press('Escape');await page.waitForTimeout(200);
 check('Escape closes the panel opened from the physical switch',await page.locator('#mirror-controls').isHidden());
 // A piece of bodywork in front of the switch must block picking it.
 await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,p=s.car.worldToLocal(s.car.getObjectByName('COBALT_MirrorSwitchKnob').getWorldPosition(new T.Vector3())),eye=s.car.worldToLocal(s.camera.position.clone());window.switchBlocker=new T.Mesh(new T.BoxGeometry(.08,.08,.08),new T.MeshBasicMaterial());window.switchBlocker.position.copy(p.lerp(eye,.3));s.car.add(window.switchBlocker);});
 const blockedPoint=await position();await page.mouse.move(blockedPoint.x,blockedPoint.y);await page.waitForTimeout(200);
 const occlusion=await page.evaluate(async point=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(point.x/innerWidth*2-1,1-point.y/innerHeight*2),s.camera);return ray.intersectObject(s.car,true).slice(0,5).map(h=>({name:h.object.name,distance:h.distance}));},blockedPoint);
 await page.mouse.click(blockedPoint.x,blockedPoint.y);
 check('Bodywork occludes the control instead of allowing clicks through it',await page.locator('#mirror-controls').isHidden(),occlusion);
 await page.evaluate(()=>{const b=window.switchBlocker;b.removeFromParent();b.geometry.dispose();b.material.dispose();});
 await page.evaluate(()=>window.__avtodrom.scene.setQuality('low'));await page.waitForTimeout(150);const low=await position();await page.mouse.click(low.x,low.y);await page.locator('#mirror-controls').waitFor({state:'visible'});
 check('The physical switch works at low graphics quality',await page.locator('#mirror-controls').isVisible());await page.keyboard.press('Escape');
 await page.keyboard.press('KeyC');await page.waitForTimeout(200);await page.mouse.click(low.x,low.y);
 check('Exterior camera clicks leave cabin controls closed',await page.locator('#mirror-controls').isHidden());
 // Inspect the authored shape from the actual driver eye, looking at the part.
 await page.keyboard.press('KeyC');await page.keyboard.press('KeyC');await page.waitForTimeout(150);
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}'});
 await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);s.render=(...args)=>{draw(...args);s.camera.clearViewOffset();s.camera.fov=22;s.camera.updateProjectionMatrix();s.camera.position.copy(s.car.localToWorld(new T.Vector3(.31,.48,.2)));s.camera.lookAt(s.car.getObjectByName('COBALT_MirrorSwitchKnob').getWorldPosition(new T.Vector3()));s.renderer.render(s.scene,s.camera);};});
 await page.waitForTimeout(200);await page.screenshot({path:`${directory}/switch-close.png`});
 check('No browser errors',errors.length===0,errors);await writeFile(`${directory}/report.json`,JSON.stringify({checks,point,after,errors},null,2));console.log(JSON.stringify({checks,point,errors},null,2));
}catch(error){await page.screenshot({path:`${directory}/failure.png`});console.error(JSON.stringify({checks,errors}));throw error;}finally{await browser.close();}
