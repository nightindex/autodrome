import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const directory='test-results/finish-split';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:960,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');await page.keyboard.press('Escape');
 const report=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{finishSplitPaths}=await import('/src/data/lane-markings.ts'),{roadDistance}=await import('/src/render/course-world.ts');
  const group=window.__avtodrom.scene.world.group;group.updateMatrixWorld(true);const mesh=group.getObjectByName('paint-gore-finish-split');
  let checked=0;const missing=[],clipped=[];
  for(const [pathIndex,path]of finishSplitPaths.entries())for(let i=1;i<path.length;i++){
   const a=path[i-1],b=path[i],count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.1);
   for(let j=0;j<=count;j++){
    const x=a.x+(b.x-a.x)*j/count,z=a.z+(b.z-a.z)*j/count;checked++;
    if(![[0,0],[1e-5,0],[-1e-5,0],[0,1e-5],[0,-1e-5]].some(([dx,dz])=>new T.Raycaster(new T.Vector3(x+dx,5,z+dz),new T.Vector3(0,-1,0)).intersectObject(mesh).length))missing.push({pathIndex,x,z});
    if(roadDistance({x,z})>-.05)clipped.push({pathIndex,x,z});
   }
  }
  const center={x:-.2,z:27.5};const unwantedFill=new T.Raycaster(new T.Vector3(center.x,5,center.z),new T.Vector3(0,-1,0)).intersectObject(mesh).length>0;
  return {checked,missing,clipped,unwantedFill,paths:finishSplitPaths.map(path=>path.map(p=>[p.x*10+640,p.z*10+530]))};
 });
 assert.deepEqual(report.missing,[]);assert.deepEqual(report.clipped,[]);assert(!report.unwantedFill,'Leave the comb centre open');
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);s.scene.fog=null;
  const camera=new T.OrthographicCamera(-8.4,8.4,7,-7,.1,300);camera.position.set(2.4,100,29);camera.up.set(0,0,-1);camera.lookAt(2.4,0,29);window.finishSplitView='plan';
  s.render=(...a)=>{draw(...a);s.car.visible=s.guide.visible=s.goal.visible=false;s.renderer.setViewport(0,0,innerWidth,innerHeight);
   if(window.finishSplitView==='plan')s.renderer.render(s.scene,camera);
   else{s.camera.fov=45;s.camera.updateProjectionMatrix();s.camera.position.set(16,9,28);s.camera.lookAt(new T.Vector3(0,0,27));s.renderer.render(s.scene,s.camera);}
  };});
 await page.waitForTimeout(500);await page.screenshot({path:`${directory}/game-plan.png`});
 await page.evaluate(()=>window.finishSplitView='perspective');await page.waitForTimeout(500);await page.screenshot({path:`${directory}/game-perspective.png`});
 await sharp('images/2026-03-19_17-47-25_3UKDK1HJ4R.jpg').extract({left:580,top:750,width:168,height:140}).resize(960,800).png().toFile(`${directory}/source-plan.png`);
 await sharp({create:{width:1920,height:800,channels:3,background:'#fff'}}).composite([{input:`${directory}/source-plan.png`,left:0,top:0},{input:`${directory}/game-plan.png`,left:960,top:0}]).png().toFile(`${directory}/comparison.png`);
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({checked:report.checked,missing:report.missing.length,clipped:report.clipped.length,errors}));
}finally{await browser.close();}
