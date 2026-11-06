import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const phase=process.argv[2]||'after',directory='test-results/trees';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/assets/trees/')&&!r.ok())errors.push(`Asset HTTP ${r.status()}`);});
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  if(phase==='after')await page.waitForFunction(()=>window.__avtodrom.scene.world.group.getObjectByName('course-trees')?.userData.textureLoaded,{timeout:30000});
  await page.waitForTimeout(500);await page.screenshot({path:`${directory}/${phase}-menu.png`});
  await page.click('#practice');await page.waitForTimeout(700);await page.screenshot({path:`${directory}/${phase}-driving.png`});await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);window.reviewPose={eye:[22,3.8,42],target:[22,4,53],fov:50};
    s.render=(...args)=>{render(...args);s.guide.visible=s.goal.visible=false;const p=window.reviewPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
  });
  for(const [name,pose]of [['row',{eye:[-42,3.1,44.5],target:[-12,4.3,53],fov:55}],['tree',{eye:[22,3.8,42],target:[22,4,53],fov:50}],['leaves',{eye:[22,4.2,47],target:[22,4.3,53],fov:60}]]){
    await page.evaluate(p=>window.reviewPose=p,pose);await page.waitForTimeout(350);await page.screenshot({path:`${directory}/${phase}-${name}.png`});
  }
  const geometry=await page.evaluate(()=>{
    const group=window.__avtodrom.scene.world.group.getObjectByName('course-trees');if(!group)return null;
    const meshes=[];group.traverse(n=>{if(n.isMesh)meshes.push({name:n.name,count:n.count,triangles:(n.geometry.index?.count??n.geometry.getAttribute('position').count)/3,alphaTest:n.material.alphaTest,alphaToCoverage:n.material.alphaToCoverage,transparent:n.material.transparent,map:n.material.map?.image?.width});});
    return {metadata:group.userData,meshes};
  });
  if(phase==='after'){
    assert(geometry?.metadata.textureLoaded);assert.equal(geometry.meshes.length,6);assert.equal(geometry.meshes.filter(m=>m.name.includes('foliage')).reduce((n,m)=>n+m.count,0),74);
    assert(geometry.meshes.filter(m=>m.name.includes('foliage')).every(m=>m.alphaTest>0&&!m.transparent&&m.alphaToCoverage&&m.map>500));
    const qualities=await page.evaluate(()=>{const s=window.__avtodrom.scene,out=[];for(const q of ['low','high','medium']){s.setQuality(q);const group=s.world.group.getObjectByName('course-trees');out.push({quality:q,triangles:group.children.filter(n=>n.name.includes('foliage')).reduce((sum,n)=>sum+n.geometry.index.count/3*n.count,0)});}return out;});
    assert(qualities.find(q=>q.quality==='low').triangles<qualities.find(q=>q.quality==='high').triangles);geometry.qualities=qualities;
  }
  assert.deepEqual(errors,[]);await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({date:new Date().toISOString(),geometry,errors},null,2));console.log(JSON.stringify({phase,metadata:geometry?.metadata,errors}));
}finally{await browser.close();}
