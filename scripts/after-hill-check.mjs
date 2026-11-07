import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/after-hill';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded||document.querySelector('#modal[data-type="error"]'),null,{timeout:60000});
  assert(await page.evaluate(()=>window.__avtodrom?.snapshot().loaded),await page.locator('#modal').innerText());
  await page.click('#exercises');await page.click('[data-exercise="3"]');await page.keyboard.press('Escape');
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const {boundaryLoops,roadDistance}=await import('/src/render/course-world.ts'),{afterHillBRoute}=await import('/src/data/after-hill.ts');
    const {course,mapPoint}=await import('/src/data/course.ts');
    const corridor=[[1235,800],[1080,615],[917.5,690],[850,745],[1080,690],[995,775],[900,850],[655,620]].map(([x,y])=>({x,y,distance:roadDistance(mapPoint(x,y))}));
    const islands=[[850,650],[950,710],[800,795],[1100,800],[900,885]].map(([x,y])=>({x,y,distance:roadDistance(mapPoint(x,y))}));
    const world=window.__avtodrom.scene.world.group;world.updateMatrixWorld(true);
    const {departureMarkingPaths}=await import('/src/render/departure-markings.ts'),paths=departureMarkingPaths();
    const painted=(mesh,p)=>!!new T.Raycaster(new T.Vector3(p.x,5,p.z),new T.Vector3(0,-1,0)).intersectObject(mesh)[0];
    const guide=world.getObjectByName('paint-departure-right-guide'),fork=world.getObjectByName('paint-departure-hatching'),edges=world.getObjectByName('course-edge-lines');
    // The final section merges into the existing island edge paint.
    const guideSamples=paths.rightGuide.filter((_,i)=>i%8===0).map(p=>({...p,painted:painted(guide,p)||painted(edges,p),roadDistance:roadDistance(p)}));
    const chevrons=paths.chevrons.map(points=>({painted:points.every(p=>painted(fork,p))}));
    const noseSamples=paths.nose.filter((_,i)=>i%4===0).map(p=>({...p,painted:painted(fork,p)||painted(edges,p)}));
    const leftEnd=paths.left.at(-1),rightEnd=paths.right.at(-1),noseSpan=Math.hypot(leftEnd.x-rightEnd.x,leftEnd.z-rightEnd.z);
    const curb=world.getObjectByName('departure-curbs');
    const sideHit=new T.Raycaster(new T.Vector3(60.8,.1,26),new T.Vector3(1,0,0)).intersectObject(curb)[0];
    const topHit=new T.Raycaster(new T.Vector3(61.5,1,26),new T.Vector3(0,-1,0)).intersectObject(curb)[0];
    const departurePaint={guideSamples,chevrons,noseSamples,noseSpan,curb:{height:curb.userData.height,bevel:curb.userData.bevel,sideVisible:!!sideHit,topHeight:topHit?.point.y}};
    const straightSamples=[32,33,34,37.9,38,38.1,40,44,48].flatMap(x=>[36.81,44.19].map(z=>{
      const hit=new T.Raycaster(new T.Vector3(x,5,z),new T.Vector3(0,-1,0)).intersectObject(edges)[0];
      return {x,z,painted:!!hit};
    }));
    const turnSigns=['after-hill-left-turn','after-hill-chevron'].map(name=>{
      const root=world.getObjectByName(name);assertExists(root,name);
      const face=root.getObjectByName(`sign-${root.userData.kind}-front`),center=face.getWorldPosition(new T.Vector3());
      const eye=new T.Vector3(38,3.5,42),direction=center.clone().sub(eye),ray=new T.Raycaster(eye,direction.clone().normalize(),0,direction.length()+.1);
      const hit=ray.intersectObject(world,true)[0];
      const normal=new T.Vector3(0,0,1).transformDirection(face.matrixWorld);
      const canvas=face.material.map.image,pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      let redPixels=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]>150&&pixels[i+1]<90&&pixels[i+2]<90)redPixels++;
      return {name,kind:root.userData.kind,clearance:roadDistance({x:center.x,z:center.z}),position:center.toArray(),facingDriver:normal.dot(eye.clone().sub(center).normalize()),visible:hit?.object===face,redPixels};
    });
    function assertExists(value,name){if(!value)throw new Error(`Missing departure sign: ${name}`);}
    return {boundaryLoops:boundaryLoops.map(loop=>loop.map(p=>[p.x*10+640,p.z*10+530])),route:afterHillBRoute,corridor,islands,straightSamples,turnSigns,departurePaint,goal:course.exercises[3].point,spawn:course.exercises[3].spawn};
  });
  assert(geometry.corridor.every(p=>p.distance<-1.5));assert(geometry.islands.every(p=>p.distance>.4));
  assert(geometry.straightSamples.every(p=>p.painted),'Both edge lines must continue straight after the ramp without a sideways step');
  assert(geometry.departurePaint.guideSamples.every(p=>p.painted),`The outer B guide must be continuous from the verge to the island: ${JSON.stringify(geometry.departurePaint.guideSamples.filter(p=>!p.painted))}`);
  assert(geometry.departurePaint.chevrons.every(p=>p.painted),'Every chevron must have both arms and its approach-facing apex');
  assert(geometry.departurePaint.noseSamples.every(p=>p.painted)&&geometry.departurePaint.noseSpan>2.8,'The hatch borders must join opposite sides of the island nose and wrap its full rounded cap');
  assert(geometry.departurePaint.curb.sideVisible&&Math.abs(geometry.departurePaint.curb.topHeight-.2)<1e-5,'The lowered kerb must have a visible side and solid top');
  assert(geometry.turnSigns.every(s=>s.clearance>.3&&s.facingDriver>.8&&s.visible),'Both departure signs must stand off the road, face the ramp and be unobstructed');
  assert(geometry.turnSigns.find(s=>s.kind==='chevronLeft').redPixels>10000,'The direction board must display red chevrons');
  // Preserve the original map. Overlay the actual runtime boundary and B guide.
  const path=points=>points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const overlay=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="1072"><defs><clipPath id="area"><rect x="630" y="540" width="625" height="435"/></clipPath></defs><g clip-path="url(#area)" fill="none" stroke-linejoin="round"><g stroke="#ff20bf" stroke-width="1.8">${geometry.boundaryLoops.map(points=>`<path d="${path(points)} Z"/>`).join('')}</g><path d="${path(geometry.route)}" stroke="#ff7d00" stroke-width="3" stroke-dasharray="8 5"/></g></svg>`);
  const comparison=await sharp('images/2026-03-19_17-47-25_3UKDK1HJ4R.jpg').composite([{input:overlay}]).png().toBuffer();
  await sharp(comparison).extract({left:620,top:520,width:650,height:470}).resize(1300,940).png().toFile(`${directory}/plan-overlay.png`);
  await page.locator('.minimap').screenshot({path:`${directory}/minimap.png`});
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(()=>{const s=window.__avtodrom.scene;s.guide.visible=s.goal.visible=false;});
  await page.waitForTimeout(1000);await page.screenshot({path:`${directory}/fork-driver.png`});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    window.afterHillPose={eye:[32,60,23.001],target:[32,0,23],fov:45};
    s.render=(...args)=>{render(...args);s.guide.visible=s.goal.visible=false;const p=window.afterHillPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
  });
  for(const [name,pose]of [
    ['layout',{eye:[32,60,23.001],target:[32,0,23],fov:45}],
    ['ramp-departure',{eye:[39,8,45],target:[57,0,35],fov:55}],
    ['centered-turn-arrows',{eye:[34,9,46],target:[42,0,40.5],fov:50}],
    ['straight-ramp-join',{eye:[27,7,47],target:[44,0,36.6],fov:45}],
    ['departure-signs-driver',{eye:[38,3.5,42],target:[62,1.5,40.5],fov:50}],
    ['b-cd-separation',{eye:[43,15,42],target:[55,0,21],fov:55}],
    ['fork-closeup',{eye:[63,8,29],target:[54,0,17],fov:48}],
    ['b-corners',{eye:[43,21,28],target:[27,0,17],fov:55}],
    ['exit-to-junction',{eye:[5,7,28],target:[1.5,0,7],fov:55}],
  ]){await page.evaluate(p=>window.afterHillPose=p,pose);await page.waitForTimeout(350);await page.screenshot({path:`${directory}/${name}.png`});}
  assert.deepEqual(errors,[]);
  await writeFile(`${directory}/report.json`,JSON.stringify({reference:{video:'video/uz_video.mp4',frames:'03:30–04:04',plan:'2026-03-19_17-47-25_3UKDK1HJ4R.jpg',overlay:'magenta = runtime asphalt boundary; orange dashed = B guide'},geometry,errors},null,2));
  console.log(JSON.stringify({corridorWitnesses:geometry.corridor.length,islandWitnesses:geometry.islands.length,turnSigns:geometry.turnSigns,errors}));
}finally{await browser.close();}
