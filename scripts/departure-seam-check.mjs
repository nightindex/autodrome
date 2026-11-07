import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory='test-results/departure-seam';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded||document.querySelector('#modal[data-type="error"]'),null,{timeout:60000});assert(await page.evaluate(()=>window.__avtodrom?.snapshot().loaded),await page.locator('#modal').innerText());await page.click('#practice');await page.keyboard.press('Escape');
 const report=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{departurePaint}=await import('/src/render/course-world.ts'),{departureHatching}=await import('/src/data/road-markings.ts'),s=window.__avtodrom.scene;
  s.world.group.updateMatrixWorld(true);const meshes=['paint-departure-divider','paint-departure-hatching'].map(name=>s.world.group.getObjectByName(name));
  const joint=departurePaint.right[0],samples=[];
  for(const dx of [-.025,0,.025])for(let dz=-.2;dz<=.20001;dz+=.01){
   const x=joint.x+dx,z=joint.z+dz,hits=new T.Raycaster(new T.Vector3(x,3,z),new T.Vector3(0,-1,0)).intersectObjects(meshes);
   samples.push({x,z,heights:[...new Set(hits.map(hit=>+hit.point.y.toFixed(6)))]});
  }
  const paint=['paint-departure-hatching','paint-departure-right-guide','course-edge-lines','paint-line-joins'].map(name=>s.world.group.getObjectByName(name));
  const sections=[];
  for(let z=24.6;z<=25.4001;z+=.04)sections.push({x:61.165,z,nx:1,nz:0});
  // Measure the cap away from the two intentional branch junctions, where
  // intersecting strokes naturally occupy more than one line's cross section.
  for(const p of departurePaint.nose.slice(10,-10)){const dx=p.x-50,dz=p.z-12.25,length=Math.hypot(dx,dz);sections.push({...p,nx:dx/length,nz:dz/length});}
  const edgeWidths=sections.map(p=>{const offsets=[],heights=[];
   for(let step=-70;step<=70;step++){const offset=step*.002,hits=new T.Raycaster(new T.Vector3(p.x+p.nx*offset,3,p.z+p.nz*offset),new T.Vector3(0,-1,0)).intersectObjects(paint);
    if(hits.length){offsets.push(offset);heights.push(...hits.map(hit=>+hit.point.y.toFixed(6)));}}
   return {...p,width:offsets.length?Math.max(...offsets)-Math.min(...offsets)+.002:0,heights:[...new Set(heights)]};
  });
  return {joint,samples,heights:[...new Set(samples.flatMap(p=>p.heights))],missing:samples.filter(p=>!p.heights.length),expectedWidth:departureHatching.lineWidth,edgeWidths};
 });
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 await page.evaluate(async joint=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);window.seamView='close';
  s.render=(...a)=>{draw(...a);s.car.visible=s.guide.visible=s.goal.visible=false;s.camera.fov=40;s.camera.updateProjectionMatrix();
   if(window.seamView==='close'){s.camera.position.set(joint.x+.3,.75,joint.z+1.1);s.camera.lookAt(new T.Vector3(joint.x,.052,joint.z));}
   else if(window.seamView==='edge'){s.camera.position.set(59.8,2.4,28);s.camera.lookAt(new T.Vector3(61.165,0,25));}
   else if(window.seamView==='nose'){s.camera.position.set(55,4,16);s.camera.lookAt(new T.Vector3(50.6,0,12.25));}
   else{s.camera.position.set(64,11,29);s.camera.lookAt(new T.Vector3(55,0,21));}
   s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
 },report.joint);
 for(const view of ['close','overview','edge','nose']){await page.evaluate(view=>window.seamView=view,view);await page.waitForTimeout(400);await page.screenshot({path:`${directory}/${phase}-${view}.png`});}
 await writeFile(`${directory}/${phase}.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({phase,heights:report.heights,missing:report.missing.length,errors}));
 if(phase!=='before'){assert.deepEqual(report.missing,[]);assert.equal(report.heights.length,1,'Both connected paint sections must share one plane');
  for(const section of report.edgeWidths){assert(Math.abs(section.width-report.expectedWidth)<.004,`Edge overlap must not widen the paint: ${JSON.stringify(section)}`);assert.deepEqual(section.heights,[.054],'Edge paint and joining strokes must share one plane');}
 }assert.deepEqual(errors,[]);
}finally{await browser.close();}
