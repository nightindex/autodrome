import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
const directory='test-results/front-lights';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[],results=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,value,detail)=>{assert(value,`${name}: ${JSON.stringify(detail)}`);checks.push(name);};
const snapshot=()=>page.evaluate(()=>window.__avtodrom.snapshot().telemetry);
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#lang');await page.click('#practice');await page.click('#controls-button');
 for(const [width,height]of [[1440,960],[1024,640],[900,700],[390,844]]){
  await page.setViewportSize({width,height});
  const boxes=[];
  for(const id of ['positionlights-button','headlights-button','foglights-button','reset-button']){
   const button=page.locator(`#${id}`);await button.scrollIntoViewIfNeeded();const r=await button.boundingBox();boxes.push({id,...r});
   check(`${width}x${height}: ${id} is reachable and onscreen`,r&&r.x>=0&&r.x+r.width<=width&&r.y>=0&&r.y+r.height<=height&&r.height>=44,r);
  }
  await page.screenshot({path:`${directory}/hud-${width}.png`});
 }
 await page.setViewportSize({width:1440,height:960});
 await page.keyboard.press('KeyF');check('Fog lamps stay off without ignition or position lights',!(await snapshot()).fogLights&&!(await snapshot()).headlights&&!(await snapshot()).positionLights);
 await page.keyboard.press('KeyG');check('G enables position lights without dipped beams',(await snapshot()).positionLights&&!(await snapshot()).headlights);
 await page.keyboard.press('KeyF');check('Position lights alone do not bypass the ignition interlock',!(await snapshot()).fogLights);
 await page.keyboard.press('KeyI');await page.keyboard.press('KeyF');check('F enables fog lamps with ignition and position lights, leaving dipped beams off',(await snapshot()).fogLights&&!(await snapshot()).headlights);
 await page.keyboard.press('KeyL');check('L adds dipped beams independently',(await snapshot()).headlights&&(await snapshot()).fogLights);
 await page.keyboard.press('KeyL');check('Switching dipped beams off retains position and fog lamps',!(await snapshot()).headlights&&(await snapshot()).fogLights&&(await snapshot()).positionLights);
 await page.keyboard.press('KeyG');check('Switching position lights off clears all three light circuits',!(await snapshot()).headlights&&!(await snapshot()).fogLights&&!(await snapshot()).positionLights);
 await page.click('#positionlights-button');await page.click('#foglights-button');check('HUD switches enable position and fog lamps without dipped beams',(await snapshot()).positionLights&&(await snapshot()).fogLights&&!(await snapshot()).headlights);
 await page.waitForTimeout(150);check('HUD reflects the independent light circuits',await page.locator('#positionlights-button').getAttribute('aria-pressed')==='true'&&await page.locator('#headlights-button').getAttribute('aria-pressed')==='false'&&await page.locator('#foglights-button').getAttribute('aria-pressed')==='true');await page.click('#positionlights-button');
 await page.keyboard.press('KeyQ');const phases=[];
 for(let i=0;i<8;i++){await page.waitForTimeout(120);phases.push(await page.evaluate(()=>{const s=window.__avtodrom.scene,visible=name=>s.car.children.some(n=>n.name===name&&n.visible);return {front:visible('front-indicator-left-glow'),rear:visible('rear-left-glow'),right:visible('front-indicator-right-glow')};}));}
 check('Q flashes the front left lamp in phase with the rear and leaves the right dark',phases.every(p=>p.front===p.rear&&!p.right)&&phases.some(p=>p.front)&&phases.some(p=>!p.front),phases);
 await page.keyboard.press('KeyQ');await page.click('#controls-close');await page.keyboard.press('Escape');
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);s.guide.visible=s.goal.visible=false;
  window.frontLightPose={eye:[0,.85,5.5],target:[0,-.05,1.5],fov:45};
  s.render=(...args)=>{render(...args);const p=window.frontLightPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));s.renderer.render(s.scene,s.camera);};
 });await page.waitForTimeout(250);
 const regions=await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;return s.car.children.filter(n=>n.isSprite&&n.name.startsWith('front-')).map(n=>{const p=n.getWorldPosition(new T.Vector3()).project(s.camera),w=n.name.includes('indicator')?46:34,h=n.name.includes('indicator')?20:34;return {name:n.name,left:Math.round((p.x+1)*innerWidth/2)-w/2,top:Math.round((1-p.y)*innerHeight/2)-h/2,width:w,height:h};});});
 check('Both headlamps, position lamps, fog lamps and front turn sections load',regions.length===8,regions);
 const setState=state=>page.evaluate(state=>{const v=window.__avtodrom.vehicle;v.positionLights=state==='position'||state.includes('head')||state.includes('fog');v.headlights=state.includes('head');v.fogLights=state.includes('fog');v.hazards=state==='hazards';v.indicator=state.includes('left')?'left':state==='right'?'right':'off';v.time=state==='left-off'?.55:.2;},state);
 await setState('position');await page.waitForTimeout(150);
 check('Position lights light both small front bulbs and rear tails without road beams',await page.evaluate(()=>{const s=window.__avtodrom.scene,bulbs=s.car.children.filter(n=>n.name.startsWith('front-position-')&&n.name.endsWith('-bulb'));let tailLit=false;s.car.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])if(m.name==='COBALT_TAIL'&&m.emissiveIntensity>.2)tailLit=true;});return bulbs.length===2&&bulbs.every(n=>n.visible)&&tailLit&&!s.car.children.some(n=>n.isSpotLight&&n.visible);}));
 for(const quality of ['medium','low']){
  await page.evaluate(q=>window.__avtodrom.scene.setQuality(q),quality);const states={};
  for(const state of ['off','position','fog','head','head-fog','left-off','left','right','hazards','head-fog-left']){
   await setState(state);await page.waitForTimeout(150);const frame=await page.screenshot({path:`${directory}/${quality}-${state}.png`}),pixels=[];
   for(const region of regions){const {name,...rect}=region,{data,info}=await sharp(frame).extract(rect).removeAlpha().raw().toBuffer({resolveWithObject:true});let white=0,amber=0;for(let i=0;i<data.length;i+=info.channels){const [r,g,b]=data.subarray(i,i+3);if(r>230&&g>205&&r>=b)white++;if(r>210&&g>65&&r>g*1.1&&b<150)amber++;}pixels.push({name,white,amber});}
   states[state]=pixels;
  }
  const count=(state,kind,side,color)=>states[state].filter(p=>p.name===`front-${kind}-${side}-glow`).reduce((n,p)=>n+p[color],0);
  for(const side of ['left','right']){
   check(`${quality}: ${side} position bulb visibly lights without dipped beams`,count('position','position',side,'white')>count('off','position',side,'white')+3,states);
   check(`${quality}: ${side} headlamp visibly lights`,count('head','headlight',side,'white')>count('off','headlight',side,'white')+5,states);
   check(`${quality}: ${side} fog lamp visibly lights`,count('head-fog','fog',side,'white')>count('head','fog',side,'white')+5,states);
   check(`${quality}: ${side} fog lamp lights without dipped beams`,count('fog','fog',side,'white')>count('position','fog',side,'white')+5,states);
   check(`${quality}: ${side} front indicator flashes amber`,count(side,'indicator',side,'amber')>count('off','indicator',side,'amber')+5,states);
   check(`${quality}: hazards light both front indicators`,count('hazards','indicator',side,'amber')>count('off','indicator',side,'amber')+5,states);
  }
  check(`${quality}: front lamps leave renderer state intact`,await page.evaluate(()=>{const s=window.__avtodrom.scene;return s.car.visible&&s.renderer.getRenderTarget()===null&&s.renderer.shadowMap.autoUpdate;}));results.push({quality,states});
 }
 // Dim only the test scene to measure illumination of real road geometry.
 await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;s.sun.intensity=.02;s.scene.environmentIntensity=.01;s.scene.background=new T.Color(0x08121b);s.scene.children.forEach(n=>{if(n.isHemisphereLight)n.intensity=.04;if(n.material?.uniforms?.sunPosition)n.visible=false;});window.frontLightPose={eye:[0,3.6,-1.5],target:[0,-.62,12],fov:55};});
 const brightness=[];
 for(const state of ['off','head','head-fog']){
  await setState(state);await page.waitForTimeout(200);const rects=await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;return [6,15].map(z=>{const p=s.car.localToWorld(new T.Vector3(0,-.61,z)).project(s.camera);return {left:Math.round((p.x+1)*innerWidth/2)-24,top:Math.round((1-p.y)*innerHeight/2)-12,width:48,height:24};});});
  const frame=await page.screenshot({path:`${directory}/road-${state}.png`}),values=[];for(const rect of rects){const {data,info}=await sharp(frame).extract(rect).removeAlpha().raw().toBuffer({resolveWithObject:true});let sum=0;for(let i=0;i<data.length;i+=info.channels)sum+=(data[i]+data[i+1]+data[i+2])/3;values.push(sum/(data.length/info.channels));}brightness.push({state,values});
 }
 check('Headlights illuminate the road ahead',brightness[1].values[1]>brightness[0].values[1]+2,brightness);
 check('Fog lamps add illumination close to the car',brightness[2].values[0]>brightness[1].values[0]+.5,brightness);
 const rearLeak=await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,camera=new T.PerspectiveCamera(52,1,.1,50);camera.position.copy(s.car.localToWorld(new T.Vector3(0,1,-5)));camera.lookAt(s.car.getWorldPosition(new T.Vector3()));camera.updateMatrixWorld();s.renderer.render(s.scene,camera);return s.car.children.filter(n=>n.isSprite&&n.visible&&n.name.startsWith('front-')).map(n=>n.material.opacity);});
 check('Front glows do not shine through the car to a rear observer',rearLeak.every(v=>v===0),rearLeak);check('No browser errors',errors.length===0,errors);
 await writeFile(`${directory}/report.json`,JSON.stringify({checks,phases,regions,results,brightness,errors},null,2));console.log(JSON.stringify({checks,brightness,errors},null,2));
}catch(error){await page.screenshot({path:`${directory}/failure.png`});console.error(JSON.stringify({checks,errors}));throw error;}finally{await browser.close();}
