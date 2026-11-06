import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/course-details';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.click('#practice');await page.waitForTimeout(500);await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;window.originalReviewRender=s.render.bind(s);
    window.reviewPose={eye:[-49,11,46],target:[-26,0,40.5],fov:55};
    s.render=(...args)=>{window.originalReviewRender(...args);s.guide.visible=s.goal.visible=false;const p=window.reviewPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
  });
  const poses=[['start',{eye:[-49,11,46],target:[-26,0,40.5],fov:55}],['right-angle',{eye:[61,13,40],target:[55,0,20],fov:58}],['intersection',{eye:[15,18,16],target:[0,0,-3],fov:58}],['parking',{eye:[-43,13,11],target:[-25,0,3],fov:55}],['finish',{eye:[-43,12,38],target:[-33,0,24.5],fov:55}],['overview',{eye:[0,151,0],target:[0,0,0],fov:45}]];
  for(const [name,pose]of poses){await page.evaluate(p=>window.reviewPose=p,pose);await page.waitForTimeout(350);await page.screenshot({path:`${directory}/${name}.png`});}
  const geometry=await page.evaluate(async()=>{
    const {roadPaint}=await import('/src/render/road-geometry.ts'),{boundaryLoops,curbSections,roads}=await import('/src/render/course-world.ts');const world=window.__avtodrom.scene.world.group;
    const curbs=world.getObjectByName('course-curbs'),colors=curbs.geometry.getAttribute('color'),unique=new Set();for(let i=0;i<colors.count;i++)unique.add(`${colors.getX(i)},${colors.getY(i)},${colors.getZ(i)}`);
    return {labels:world.children.filter(n=>n.name.startsWith('paint-label-')).map(n=>({name:n.name,point:n.position.toArray()})),curbSections:curbSections.length,boundaryLoops:boundaryLoops.length,curbTriangles:curbs.geometry.index.count/3,curbColors:unique.size,roadWidths:roads.map(r=>r.width),paint:roadPaint,asphaltTriangles:world.getObjectByName('course-asphalt').geometry.index.count/3};
  });
  assert.equal(geometry.curbColors,2);assert(geometry.labels.some(l=>l.name==='paint-label-B'));assert(geometry.labels.some(l=>l.name==='paint-label-CD'));assert(geometry.curbSections>1000);
  assert(geometry.curbTriangles>geometry.curbSections*2);assert.deepEqual(errors,[]);
  await writeFile(`${directory}/report.json`,JSON.stringify({date:new Date().toISOString(),geometry,errors},null,2));console.log(JSON.stringify({curbSections:geometry.curbSections,labels:geometry.labels.length,errors}));
}finally{await browser.close();}
