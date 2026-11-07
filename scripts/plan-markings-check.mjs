import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const directory='test-results/plan-markings';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:1072}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');await page.keyboard.press('Escape');
 const report=await page.evaluate(async()=>{
  const {coursePaintedArrows,roadStopLines,whiteEdgeSurface,yellowEdgeSurface,intersectionCrossings,pedestrianCrossingLayout}=await import('/src/render/course-world.ts');
  const {laneLines,lanePaintPaths}=await import('/src/data/lane-markings.ts'),{roadArrowOutline}=await import('/src/render/road-arrows.ts'),{crosswalkStripes}=await import('/src/render/crosswalk.ts');
  const plan=p=>[640+p.x*10,530+p.z*10];
  const s=window.__avtodrom.scene;s.world.group.updateMatrixWorld(true);
  const T=await import('/node_modules/three/build/three.module.js');
  const dashMesh=s.world.group.getObjectByName('paint-lane-parking-channel');
  const painted=(x,y)=>new T.Raycaster(new T.Vector3((x-640)*.1,6,(y-530)*.1),new T.Vector3(0,-1,0)).intersectObject(dashMesh).length>0;
  const finish=laneLines.find(l=>l.id==='finish-line');
  return {arrows:coursePaintedArrows.map(a=>({point:plan(a.point),normal:a.normal,turn:a.turn??'straight',scale:a.scale??1,outline:roadArrowOutline(a).map(plan)})),
   lines:laneLines.map(l=>({id:l.id,width:l.width,paths:lanePaintPaths(l).map(path=>path.map(plan))})),
   stops:roadStopLines.map(l=>({id:l.name,width:l.width,points:l.points.map(plan)})),
   stripes:[pedestrianCrossingLayout(),...intersectionCrossings].flatMap(c=>crosswalkStripes(c).map(stripe=>({points:stripe.points.map(plan),yellow:stripe.yellow}))),
   white:whiteEdgeSurface.map(p=>p.map(r=>r.map(([x,z])=>plan({x,z})))),yellow:yellowEdgeSurface.map(p=>p.map(r=>r.map(([x,z])=>plan({x,z})))),
   checks:{parkingDash:painted(94,543),parkingGap:painted(110,543),finishAt145:Math.abs(finish.points[0].x-(145-640)*.1)<1e-8,combinedArrows:coursePaintedArrows.filter(a=>a.turn==='straight-right').length}};
 });
 assert(report.checks.parkingDash&&!report.checks.parkingGap,'Parking divider must contain real gaps');assert(report.checks.finishAt145);assert(report.checks.combinedArrows>=3);
 const path=points=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
 const surface=polygons=>polygons.flatMap(p=>p.map(r=>`${path(r)}Z`)).join(' ');
 const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1072"><g fill="none" stroke-linejoin="round"><path d="${surface(report.white)}" stroke="#00b9df" stroke-width=".8"/><path d="${surface(report.yellow)}" stroke="#f68800" stroke-width=".8"/>${report.lines.flatMap(l=>l.paths.map(p=>`<path d="${path(p)}" stroke="#03c1d9" stroke-width="${Math.max(1.5,l.width*10)}"/>`)).join('')}${report.stops.map(l=>`<path d="${path(l.points)}" stroke="#00b9df" stroke-width="${l.width*10}"/>`).join('')}${report.arrows.map(a=>`<path d="${path(a.outline)}Z" fill="#ff2885" fill-opacity=".6" stroke="#c4004a" stroke-width=".6"/>`).join('')}</g></svg>`);
 await sharp('images/2026-03-19_17-47-25_3UKDK1HJ4R.jpg').composite([{input:svg}]).png().toFile(`${directory}/map-overlay.png`);
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);s.scene.fog=null;
  const camera=new T.OrthographicCamera(-64,64,53.6,-53.6,.1,400);camera.position.set(0,150,.6);camera.up.set(0,0,-1);camera.lookAt(0,0,.6);
  s.render=(...a)=>{draw(...a);s.car.visible=s.guide.visible=s.goal.visible=false;s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,camera);};});
 await page.waitForTimeout(500);await page.screenshot({path:`${directory}/game-top-down.png`});
 await sharp({create:{width:2560,height:1072,channels:3,background:'#fff'}}).composite([{input:'images/2026-03-19_17-47-25_3UKDK1HJ4R.jpg',left:0,top:0},{input:`${directory}/game-top-down.png`,left:1280,top:0}]).png().toFile(`${directory}/map-comparison.png`);
 assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({...report,errors},null,2));console.log(JSON.stringify({arrows:report.arrows.length,lines:report.lines.length,checks:report.checks,errors}));
}finally{await browser.close();}
