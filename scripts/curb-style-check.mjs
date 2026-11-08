import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/curb-style';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const errors=[],page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{if(!localStorage.getItem('avtodrom.settings.v1'))localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'}));});
const ready=()=>page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
const snapshot=()=>page.evaluate(()=>{
 const w=window.__avtodrom.scene.world,names=['course-curbs','intersection-curbs','departure-curbs'],ramp=w.group.getObjectByName('hill-concrete-edges');
 return {style:w.group.userData.curbStyle,colliders:w.physics.colliders.len(),ramp:{geometry:ramp.geometry.uuid,map:!!ramp.material.map,color:ramp.material.color.getHex()},meshes:names.map(name=>{const m=w.group.getObjectByName(name);return {name,geometry:m.geometry.uuid,vertices:m.geometry.getAttribute('position').count,uv:m.geometry.getAttribute('uv').count,map:!!m.material.map,vertexColors:m.material.vertexColors,color:m.material.color.getHex()};}),saved:JSON.parse(localStorage.getItem('avtodrom.settings.v1'))?.curbStyle};
});
async function screenshots(style){
 await page.addStyleTag({content:'body.curb-review #hud,body.curb-review #menu-shell,body.curb-review #modal,body.curb-review .vignette,body.curb-review #toast{display:none!important}'});
 await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);window.curbView='departure';
  s.render=(...args)=>{draw(...args);s.car.visible=s.guide.visible=s.goal.visible=false;s.camera.clearViewOffset();s.camera.fov=48;s.camera.updateProjectionMatrix();
   const poses={departure:[[64,10,29],[54,0,17]],junction:[[12,10,20],[0,0,-3]],ramp:[[25,8,50],[13,1,40.5]]},p=poses[window.curbView];s.camera.position.fromArray(p[0]);s.camera.lookAt(new T.Vector3(...p[1]));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};document.body.classList.add('curb-review');
 });
 for(const view of ['departure','junction','ramp']){await page.evaluate(view=>window.curbView=view,view);await page.waitForTimeout(350);await page.screenshot({path:`${directory}/${style}-${view}.png`});}
 await page.evaluate(()=>document.body.classList.remove('curb-review'));
}
try{
 await page.goto('http://127.0.0.1:5173/');await ready();const initial=await snapshot();assert.equal(initial.style,'yellow-black');assert(initial.meshes.every(m=>m.map&&m.uv===m.vertices));assert.equal(initial.ramp.map,false);assert.equal(initial.ramp.color,0xbab5a3);
 await page.click('#menu-shell #settings');await page.locator('#curb-style').selectOption('white');const white=await snapshot();assert.equal(white.style,'white');assert.equal(white.saved,'white');assert(white.meshes.every(m=>!m.map));
 assert.deepEqual(white.meshes.map(m=>m.geometry),initial.meshes.map(m=>m.geometry));assert.equal(white.colliders,initial.colliders);assert.deepEqual(white.ramp,initial.ramp);
 await page.screenshot({path:`${directory}/settings-ru.png`});await page.click('#close');await screenshots('white');
 await page.reload();await ready();const restored=await snapshot();assert.equal(restored.style,'white');assert(restored.meshes.every(m=>!m.map));
 await page.click('#menu-shell #settings');assert.equal(await page.locator('#curb-style').inputValue(),'white');await page.locator('#language').selectOption('uz');await page.locator('#curb-style').selectOption('yellow-black');
 await page.setViewportSize({width:390,height:844});assert(await page.getByLabel('Bordyur rangi').isVisible());await page.screenshot({path:`${directory}/settings-uz-mobile.png`});await page.setViewportSize({width:1440,height:960});await page.click('#close');
 const striped=await snapshot();assert.equal(striped.style,'yellow-black');assert.equal(striped.saved,'yellow-black');assert(striped.meshes.every(m=>m.map&&!m.vertexColors));assert.equal(striped.colliders,restored.colliders);
 assert.deepEqual(striped.meshes.map(m=>m.geometry),restored.meshes.map(m=>m.geometry));assert.deepEqual(striped.ramp,restored.ramp);assert.equal(restored.ramp.map,false);assert.equal(restored.ramp.color,initial.ramp.color);
 await page.click('#practice');await page.keyboard.press('Escape');await page.locator('#modal #settings').click();await page.locator('#curb-style').selectOption('white');assert.equal((await snapshot()).style,'white');await page.locator('#curb-style').selectOption('yellow-black');await page.click('#close');await page.click('#resume');
 await screenshots('yellow-black');assert.deepEqual(errors,[]);
 const report={initial,white,restored,striped,errors};await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({default:initial.style,persisted:restored.style,final:striped.style,meshes:striped.meshes.length,colliders:striped.colliders,errors}));
}finally{await browser.close();}
