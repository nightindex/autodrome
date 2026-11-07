import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/marking-standards';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');await page.keyboard.press('Escape');
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {roadStopLines,coursePaintedArrows,intersectionCrossings,pedestrianCrossingLayout}=await import('/src/render/course-world.ts');
    const {crosswalkStripes}=await import('/src/render/crosswalk.ts');
    const {Minimap}=await import('/src/ui/minimap.ts');
    const world=window.__avtodrom.scene.world.group;world.updateMatrixWorld(true);
    const extent=(mesh,point,normal,start=0,count=mesh.geometry.getAttribute('position').count)=>{
      const p=mesh.geometry.getAttribute('position'),along=[],across=[];
      for(let i=start;i<start+count;i++){const v=new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);along.push((v.x-point.x)*normal.x+(v.z-point.z)*normal.z);across.push((v.x-point.x)*-normal.z+(v.z-point.z)*normal.x);}
      return {length:Math.max(...along)-Math.min(...along),width:Math.max(...across)-Math.min(...across),vertices:count};
    };
    const stops=roadStopLines.map(line=>({name:line.name,...extent(world.getObjectByName(line.name),line.point,line.normal)}));
    const arrowBatch=world.getObjectByName('paint-direction-arrows');
    const arrows=arrowBatch.userData.arrows.map(arrow=>({name:`paint-arrow-${arrow.turn??'straight'}`,turn:arrow.turn,scale:arrow.scale??1,profile:arrow.profile,traced:!!arrow.outline,...extent(arrowBatch,arrow.point,arrow.normal,arrow.start,arrow.count)}));
    const crossings=[pedestrianCrossingLayout(),...intersectionCrossings].map(c=>({length:c.length,stripes:crosswalkStripes(c).length}));
    const mini=new Minimap(document.createElement('canvas')),ctx=mini.base.getContext('2d');
    const mapStops=roadStopLines.map(line=>{const [a,b]=line.points,p=mini.projection.project({x:(a.x+b.x)/2,z:(a.z+b.z)/2});return {name:line.name,pixel:[...ctx.getImageData(Math.floor(p.x),Math.floor(p.y),1,1).data]};});
    return {stops,arrows,crossings,mapStops,expectedArrows:coursePaintedArrows.length};
  });
  assert.equal(geometry.stops.length,7);
  for(const stop of geometry.stops)assert(Math.abs(stop.length-.4)<2e-5,`${stop.name}: ${stop.length}`);
  assert.equal(geometry.arrows.length,geometry.expectedArrows);
  for(const arrow of geometry.arrows){
    assert(Math.abs(arrow.length-(arrow.traced?4.8:arrow.turn==='straight-right'?6:5)*arrow.scale)<2e-5,`${arrow.name}: full length ${arrow.length}`);
    assert(Math.abs(arrow.width-(arrow.profile==='standard-turn'?1.05:arrow.traced?1.6:arrow.turn==='straight-right'?2.2:arrow.turn?1.8:1.2)*arrow.scale)<2e-5,`${arrow.name}: width ${arrow.width}`);
  }
  assert(geometry.crossings.every(c=>c.length===2.6&&c.stripes>0));
  for(const line of geometry.mapStops){const [r,g,b]=line.pixel;assert(r>190&&g>190&&b>160,`Mini-map ${line.name}: ${line.pixel}`);}
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);
    window.markingStandardsPose={eye:[18,17,24],target:[-.5,0,-2.5],fov:54};
    s.render=(...args)=>{draw(...args);s.guide.visible=s.goal.visible=false;const p=window.markingStandardsPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.render(s.scene,s.camera);};
  });
  for(const [name,pose]of [
    ['junction',{eye:[18,17,24],target:[-.5,0,-2.5],fov:54}],
    ['pedestrian',{eye:[-22,12,49],target:[-14,0,40.5],fov:48}],
    ['departure',{eye:[42,17,43],target:[56,0,26],fov:48}],
    ['arrows',{eye:[-28,10,48],target:[-26.5,0,40.5],fov:46}],
  ]){await page.evaluate(p=>window.markingStandardsPose=p,pose);await page.waitForTimeout(250);await page.screenshot({path:`${directory}/${name}.png`});}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.markingStandardsPose={eye:[10,23,19],target:[-.5,0,-2.5],fov:55});await page.waitForTimeout(250);await page.screenshot({path:`${directory}/mobile.png`});
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({geometry,errors},null,2));
  console.log(JSON.stringify({stops:geometry.stops.length,arrows:geometry.arrows.length,crossings:geometry.crossings.length,errors}));
}finally{await browser.close();}
