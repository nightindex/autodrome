import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/full-map';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');await page.waitForTimeout(600);await page.keyboard.press('Escape');
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{roadSurface,roadDistance,boundaryLoops}=await import('/src/render/course-world.ts');
    const {course,mapPoint}=await import('/src/data/course.ts'),{mapProjection}=await import('/src/ui/map-projection.ts'),{mapRouteLeg}=await import('/src/ui/map-route.ts'),{itinerary}=await import('/src/data/course.ts');
    const s=window.__avtodrom.scene,mesh=s.world.group.getObjectByName('course-asphalt');s.world.group.updateMatrixWorld(true);
    const witnesses=[[80,300],[205,380],[175,275],[270,300],[330,300],[420,300],[500,300],[545,310],[655,350],[760,300],[820,405],[890,362],[960,425],[850,240],[1000,285],[1140,360],[1220,300],[120,600],[260,600],[390,600],[420,715],[620,660],[400,795],[400,950],[400,100],
      [140,220],[140,350],[240,350],[320,200],[365,415],[465,300],[550,240],[550,370],[705,300],[800,450],[1020,400],[1000,190],[900,240],[200,650],[400,650],[550,650],[400,850]];
    const sampled=witnesses.map(([x,y])=>{const p=mapPoint(x,y),distance=roadDistance(p),painted=!!new T.Raycaster(new T.Vector3(p.x,10,p.z),new T.Vector3(0,-1,0)).intersectObject(mesh)[0];return {x,y,distance,painted};});
    const p=mapProjection(roadSurface,720,552),goals=course.exercises.map(e=>({id:e.id,point:p.project(e.point)}));
    const first=mapRouteLeg(itinerary[4],4),second=mapRouteLeg(itinerary[7],7);
    return {sampled,islands:roadSurface.flatMap(p=>p.slice(1)).length,goals,firstJunction:first,secondJunction:second,loops:boundaryLoops.map(loop=>loop.map(p=>[p.x*10+640,p.z*10+530])),route:course.route.map(p=>[p.x*10+640,p.z*10+530])};
  });
  assert.equal(geometry.islands,10);assert(geometry.sampled.every(s=>s.painted===(s.distance<0)),'3D pavement must agree with every plan witness');
  assert.notDeepEqual(geometry.firstJunction,geometry.secondJunction);
  const path=points=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1072"><g fill="none" stroke-linejoin="round"><g stroke="#ff20bf" stroke-width="2">${geometry.loops.map(points=>`<path d="${path(points)} Z"/>`).join('')}</g><path d="${path(geometry.route)}" stroke="#ff8b00" stroke-width="2.5" stroke-dasharray="7 5"/></g></svg>`);
  await sharp('images/2026-03-19_17-47-25_3UKDK1HJ4R.jpg').composite([{input:svg}]).png().toFile(`${directory}/plan-overlay.png`);
  await page.locator('.minimap').screenshot({path:`${directory}/minimap.png`});
  const canvas=await page.locator('.minimap canvas').evaluate(c=>c.toDataURL().split(',')[1]);await writeFile(`${directory}/minimap-detail.png`,Buffer.from(canvas,'base64'));
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);s.scene.fog=null;
    const halfHeight=49,camera=new T.OrthographicCamera(-halfHeight*1.5,halfHeight*1.5,halfHeight,-halfHeight,.1,400);
    camera.position.set(-.15,150,-.45);camera.up.set(0,0,-1);camera.lookAt(-.15,0,-.45);window.mapReviewPose='plan';
    s.render=(...args)=>{render(...args);s.guide.visible=s.goal.visible=false;
      if(window.mapReviewPose==='plan')s.renderer.render(s.scene,camera);
      else{s.camera.clearViewOffset();s.camera.fov=38;s.camera.updateProjectionMatrix();s.camera.position.set(-100,95,135);s.camera.lookAt(0,0,0);s.renderer.render(s.scene,s.camera);}
    };
  });
  await page.waitForTimeout(300);await page.screenshot({path:`${directory}/top-down.png`});
  await page.evaluate(()=>window.mapReviewPose='aerial');await page.waitForTimeout(300);await page.screenshot({path:`${directory}/aerial.png`});
  const reference='test-results/full-map-reference/frame-00-35.png';
  if(existsSync(reference)){
    const tiles=[];for(const [i,file]of [reference,`${directory}/aerial.png`].entries())tiles.push({input:await sharp(file).resize(1440,810,{fit:'contain',background:'#edf0e9'}).png().toBuffer(),left:i*1440,top:0});
    await sharp({create:{width:2880,height:810,channels:3,background:'#edf0e9'}}).composite(tiles).png().toFile(`${directory}/video-comparison.png`);
  }
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({reference:{video:'video/uz_video.mp4',time:'00:35',plan:'2026-03-19_17-47-25_3UKDK1HJ4R.jpg',overlay:'magenta = runtime asphalt boundary; orange = category B route'},geometry,errors},null,2));
  console.log(JSON.stringify({islands:geometry.islands,renderedWitnesses:geometry.sampled.length,distinctJunctionLegs:true,errors}));
}finally{await browser.close();}
