import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const directory='test-results/shadows';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,condition)=>{assert(condition,name);checks.push(name);};
const matrix=()=>page.evaluate(()=>[...window.__avtodrom.scene.sun.shadow.matrix.elements]);
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.time>.5);
  await page.keyboard.press('KeyB');await page.keyboard.press('KeyI');await page.keyboard.press('Digit1');await page.keyboard.press('Space');
  await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.signedSpeed>1);
  const driving=[],frames=[];
  for(let i=0;i<6;i++){
    await page.waitForTimeout(160);const state=await page.evaluate(()=>{
      const a=window.__avtodrom,s=a.scene;return {position:a.snapshot().telemetry.position,speed:a.snapshot().telemetry.speed,shadowTarget:s.sun.target.position.toArray(),resolution:s.sun.shadow.mapSize.x,fps:s.fps};
    });driving.push(state);frames.push(await page.screenshot({path:`${directory}/drive-${i}.png`}));
  }
  check('Keyboard drive advances while shadows update',Math.hypot(driving.at(-1).position.x-driving[0].position.x,driving.at(-1).position.z-driving[0].position.z)>.5&&driving.every(s=>s.resolution===2048));
  await page.keyboard.up('KeyW');await page.keyboard.down('ShiftLeft');await page.keyboard.down('KeyS');
  await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.speed<.12);await page.keyboard.up('KeyS');await page.keyboard.up('ShiftLeft');await page.keyboard.press('Escape');
  await page.evaluate(()=>{const v=window.__avtodrom.vehicle;for(let i=0;i<120;i++)v.update(1/60,{down:()=>false},true);});
  await page.waitForTimeout(150);const before=await matrix();
  const bodyY=await page.evaluate(()=>{const v=window.__avtodrom.vehicle,p=v.body.translation();v.body.setTranslation({...p,y:p.y+.02},true);return p.y;});
  await page.waitForTimeout(150);const bobbed=await matrix();
  check('Suspension bob does not move the world shadow projection',Math.max(...before.map((n,i)=>Math.abs(n-bobbed[i])))<1e-10);
  await page.evaluate(y=>{const a=window.__avtodrom,p=a.vehicle.body.translation();a.vehicle.body.setTranslation({...p,y},true);a.scene.cameraMode='cockpit';},bodyY);
  await page.waitForTimeout(200);const cockpit=await matrix();
  check('Cockpit mirrors preserve the shadow projection',Math.max(...before.map((n,i)=>Math.abs(n-cockpit[i])))<1e-10&&await page.evaluate(()=>window.__avtodrom.scene.renderer.shadowMap.autoUpdate));
  await page.evaluate(()=>window.__avtodrom.scene.cameraMode='chase');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    s.render=(...args)=>{render(...args);s.guide.visible=s.goal.visible=false;s.camera.clearViewOffset();s.camera.fov=48;s.camera.updateProjectionMatrix();s.camera.position.copy(s.car.localToWorld(new T.Vector3(0,8,-.1)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(0,-.5,0)));s.renderer.render(s.scene,s.camera);};
  });
  await page.waitForTimeout(200);
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,glass=[];
    s.car.traverse(n=>{if(n.isMesh&&(Array.isArray(n.material)?n.material:[n.material]).every(m=>m.transparent&&m.opacity<.95))glass.push({name:n.name,casts:n.castShadow});});
    const box=new T.Box3().setFromObject(s.car),points=[];
    for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])points.push(new T.Vector3(x,y,z).project(s.camera));
    const rect={left:Math.min(...points.map(p=>(p.x+1)*innerWidth/2)),right:Math.max(...points.map(p=>(p.x+1)*innerWidth/2)),top:Math.min(...points.map(p=>(1-p.y)*innerHeight/2)),bottom:Math.max(...points.map(p=>(1-p.y)*innerHeight/2))};
    const tyreGroundErrors=s.wheels.map(w=>w.pivot.getWorldPosition(new T.Vector3()).y-w.radius);
    return {glass,rect,tyreGroundErrors,bodyLift:s.bodyLift};
  });
  check('Blended windows do not cast opaque shadows',geometry.glass.length>=4&&geometry.glass.every(g=>!g.casts));
  check('Visible tyres touch the road after the body height correction',geometry.tyreGroundErrors.every(y=>Math.abs(y)<.02));
  const shadow=await page.screenshot({path:`${directory}/contact-shadow.png`});
  await page.evaluate(()=>{
    const s=window.__avtodrom.scene;s.car.traverse(n=>{if(n.isMesh){n.userData.savedCastShadow=n.castShadow;n.castShadow=false;}});s.renderer.shadowMap.needsUpdate=true;
  });
  await page.waitForTimeout(200);const clear=await page.screenshot({path:`${directory}/without-car-shadow.png`});
  const a=await sharp(shadow).removeAlpha().raw().toBuffer({resolveWithObject:true}),b=await sharp(clear).removeAlpha().raw().toBuffer();
  let shadowPixels=0;const r=geometry.rect;
  for(let y=0;y<a.info.height;y++)for(let x=0;x<a.info.width;x++){
    if(x>=r.left&&x<=r.right&&y>=r.top&&y<=r.bottom)continue;
    const i=(y*a.info.width+x)*a.info.channels;
    if((b[i]+b[i+1]+b[i+2]-a.data[i]-a.data[i+1]-a.data[i+2])/3>12)shadowPixels++;
  }
  check('The car casts a visible shadow onto the road',shadowPixels>100);
  await page.evaluate(()=>{
    const s=window.__avtodrom.scene;s.car.traverse(n=>{if(n.isMesh)n.castShadow=n.userData.savedCastShadow;});s.setQuality('low');
  });
  check('Low graphics disables expensive world shadows',!await page.evaluate(()=>window.__avtodrom.scene.renderer.shadowMap.enabled));
  await page.evaluate(()=>window.__avtodrom.scene.setQuality('medium'));
  check('Medium graphics restores stable 2048-pixel shadows',await page.evaluate(()=>{const s=window.__avtodrom.scene;return s.renderer.shadowMap.enabled&&s.sun.shadow.mapSize.x===2048;}));
  const tiles=await Promise.all(frames.map(frame=>sharp(frame).resize(426,266).png().toBuffer()));
  await sharp({create:{width:1278,height:532,channels:3,background:'#e4e7e6'}}).composite(tiles.map((input,i)=>({input,left:i%3*426,top:Math.floor(i/3)*266}))).png().toFile(`${directory}/driving-sequence.png`);
  check('No browser errors',errors.length===0);
  const report={date:new Date().toISOString(),checks,errors,driving,geometry,shadowPixels};
  await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();}
