import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const phase=process.argv[2]||'after',directory='test-results/curbs';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.click('#practice');await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);window.curbPose={eye:[-33,.9,42],target:[-29,.12,44.55]};
    s.render=(...args)=>{render(...args);s.guide.visible=s.goal.visible=false;const p=window.curbPose;s.camera.clearViewOffset();s.camera.fov=48;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
  });
  for(const [name,pose]of [['road-side',{eye:[-33,.9,42],target:[-29,.12,44.55]}],['grass-side',{eye:[-33,.7,47],target:[-29,.12,44.55]}],['end',{eye:[-.3,.65,46],target:[1.95,.12,44.55]}]]){
    await page.evaluate(p=>window.curbPose=p,pose);await page.waitForTimeout(250);await page.screenshot({path:`${directory}/${phase}-${name}.png`});
  }
  const sides=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{hillProfile}=await import('/src/data/course.ts'),mesh=window.__avtodrom.scene.world.group.getObjectByName('course-curbs');
    const position=mesh.geometry.getAttribute('position'),normal=mesh.geometry.getAttribute('normal');let minZ=Infinity,maxZ=-Infinity;
    // The sampled road curves slightly here; select the real ramp-cut end cap.
    for(let i=0;i<position.count;i++)if(Math.abs(position.getX(i)-hillProfile.start)<1e-4&&Math.abs(normal.getX(i))>.99){minZ=Math.min(minZ,position.getZ(i));maxZ=Math.max(maxZ,position.getZ(i));}
    const endZ=(minZ+maxZ)/2;
    const out=[{name:'road',origin:[-29,.12,43],direction:[0,0,1]},{name:'grass',origin:[-29,.12,46],direction:[0,0,-1]},{name:'end',origin:[hillProfile.start+1,.12,endZ],direction:[-1,0,0]}].map(p=>{
      const hit=new T.Raycaster(new T.Vector3(...p.origin),new T.Vector3(...p.direction),0,3).intersectObject(mesh)[0];return {name:p.name,hit:!!hit,normal:hit?.face.normal.toArray(),point:hit?.point.toArray()};
    });mesh.geometry.computeBoundingBox();return {faces:out,bottom:mesh.geometry.boundingBox.min.y,materialSide:mesh.material.side,triangles:mesh.geometry.index.count/3};
  });
  if(phase==='after'){assert(sides.faces.every(face=>face.hit),JSON.stringify(sides));assert(sides.faces[0].point[2]<sides.faces[1].point[2]);assert(sides.bottom<0);assert.equal(sides.materialSide,0);}
  assert.deepEqual(errors,[]);await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({date:new Date().toISOString(),sides,errors},null,2));console.log(JSON.stringify({phase,sides,errors}));
}finally{await browser.close();}
