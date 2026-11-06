import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/sign-hill';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.click('#exercises');await page.click('[data-exercise="2"]');await page.waitForTimeout(500);await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    window.reviewPose={eye:[18,4.2,20],target:[17,1,40.5],fov:60};window.reviewScene=s.scene;
    s.render=(...args)=>{render(...args);s.guide.visible=s.goal.visible=false;const p=window.reviewPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(window.reviewScene,s.camera);};
  });
  for(const [name,pose]of [['hill-profile',{eye:[18,4.2,20],target:[17,1,40.5],fov:60}],['hill-approach',{eye:[-3,4.8,43],target:[16,1.3,40.5],fov:56}],['hill-stop-fullwidth',{eye:[2,8,47],target:[13,1.6,40.5],fov:50}],['hill-concrete',{eye:[13,4,47],target:[15.5,1.7,40.5],fov:48}]]){
    await page.evaluate(p=>window.reviewPose=p,pose);await page.waitForTimeout(300);await page.screenshot({path:`${directory}/${name}.png`});
  }
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{hillProfile,hillHeight}=await import('/src/data/course.ts');
    const s=window.__avtodrom.scene,signs=[];s.world.group.traverse(n=>{if(/^sign-.*-front$/.test(n.name)){n.geometry.computeBoundingBox();signs.push({name:n.name,position:n.getWorldPosition(new T.Vector3()).toArray(),size:n.geometry.boundingBox.getSize(new T.Vector3()).toArray(),texture:n.material.map.image.width,transparent:n.material.transparent,metadata:n.userData});}});
    const stop=s.world.group.getObjectByName('paint-hill-stop-line');stop.geometry.computeBoundingBox();
    const edges=s.world.group.getObjectByName('course-edge-lines'),{roadFrame}=await import('/src/render/course-world.ts');
    const edgeSamples=[5,10,13,17,22,28,32].flatMap(x=>{
      const frame=roadFrame({x,z:42},{x:1,z:0});
      return [-1,1].map(side=>{
      const z=frame.center.z+side*(frame.width/2-.21);
      const hit=new T.Raycaster(new T.Vector3(x,5,z),new T.Vector3(0,-1,0)).intersectObject(edges)[0];
      return {x,z,height:hit?.point.y,expected:hillHeight(x,z)+.048};
    });});
    const bounds=stop.geometry.boundingBox;
    const stopSamples=[.02,.25,.5,.75,.98].map(t=>{
      const z=bounds.min.z+(bounds.max.z-bounds.min.z)*t,x=(bounds.min.x+bounds.max.x)/2;
      const hit=new T.Raycaster(new T.Vector3(x,5,z),new T.Vector3(0,-1,0)).intersectObject(stop)[0];return {z,painted:!!hit,height:hit?.point.y};
    });
    const winding=s.world.group.getObjectByName('sign-winding-front'),image=winding.material.map.image,ctx=image.getContext('2d');
    const blackCenter=y=>{const row=ctx.getImageData(0,y*2,512,1).data,xs=[];for(let x=100;x<400;x++){const i=x*4;if(row[i+3]>200&&row[i]<60&&row[i+1]<60&&row[i+2]<60)xs.push(x);}return xs.reduce((a,b)=>a+b,0)/xs.length/2;};
    const windingArtwork={upperStem:blackCenter(120),lowerStem:blackCenter(220),material:winding.material.type,plateThickness:winding.userData.plateThickness};
    return {hill:hillProfile,peak:hillHeight(17,42),finish:s.world.group.getObjectByName('hill-structure').userData.edgeFinish,signs,edgeSamples,stopSamples,windingArtwork,stopLine:{min:stop.geometry.boundingBox.min.toArray(),max:stop.geometry.boundingBox.max.toArray()}};
  });
  assert.equal(geometry.peak,1.8);assert.equal(geometry.finish,'unpainted-concrete');assert(geometry.signs.every(s=>s.texture===512&&!s.transparent));assert(geometry.signs.some(s=>s.name==='sign-ascent-front'));
  assert.equal(geometry.signs.find(s=>s.name==='sign-ascent-front').metadata.gradePercent,12);
  assert(geometry.edgeSamples.every(s=>s.height!==undefined&&Math.abs(s.height-s.expected)<1e-5),`Both edge lines must follow the complete ramp profile: ${JSON.stringify(geometry.edgeSamples)}`);
  assert(geometry.stopLine.min[2]<39&&geometry.stopLine.max[2]-geometry.stopLine.min[2]>7,'The hill stop line must span both lanes, including the entire left half');
  assert(geometry.stopSamples.every(s=>s.painted),'The hill stop line must have no gaps across either lane');
  assert.equal(geometry.signs.find(s=>s.name==='sign-ascent-front').metadata.plateThickness,.0022);
  assert(geometry.signs.filter(s=>s.name==='sign-winding-front').every(s=>s.metadata.designation===(s.metadata.mirrored?'1.12.1':'1.12.2')&&s.metadata.firstTurn===(s.metadata.mirrored?'right':'left')));
  assert(geometry.windingArtwork.lowerStem-geometry.windingArtwork.upperStem>45,'1.12.2 must bend left first when followed from the bottom');
  assert.equal(geometry.windingArtwork.plateThickness,.001);assert.equal(geometry.windingArtwork.material,'MeshPhysicalMaterial');
  await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,p=s.world.group.getObjectByName('sign-winding-front').getWorldPosition(new T.Vector3());window.reviewPose={eye:[p.x+7,p.y+1.6,p.z+3],target:p.toArray(),fov:42};});
  await page.waitForTimeout(300);await page.screenshot({path:`${directory}/winding-in-course.png`});
  // Separate model inspection gallery; these are fixture renders, not extra signs placed on the course.
  for(const [name,kinds]of [['signs-front',['stop','speed20','speed40','pedestrian']],['signs-other',['parking','yield','ascent','railway']],['signs-back',['stop','speed20','parking','pedestrian']],['ascent-closeup',['ascent']],['winding-closeup',['winding']],['winding-back',['winding']]]){
    await page.evaluate(async({name,kinds})=>{
      const T=await import('/node_modules/three/build/three.module.js'),{createRoadSign}=await import('/src/render/road-signs.ts'),scene=new T.Scene();scene.background=new T.Color(0xc8d0d1);scene.environment=window.__avtodrom.scene.scene.environment;scene.environmentIntensity=.6;scene.add(new T.HemisphereLight(0xffffff,0x7d827d,1.5));const light=new T.DirectionalLight(0xfff7eb,2.5);light.position.set(-3,6,name==='signs-back'?-8:8);scene.add(light);
      const floor=new T.Mesh(new T.PlaneGeometry(35,35),new T.MeshStandardMaterial({color:0xa4aca8,roughness:1}));floor.rotation.x=-Math.PI/2;scene.add(floor);
      kinds.forEach((kind,i)=>{const sign=createRoadSign(kind);sign.position.x=(i-(kinds.length-1)/2)*1.8;scene.add(sign);});window.reviewScene=scene;window.reviewPose=name==='ascent-closeup'?{eye:[.45,2.48,1.65],target:[0,2.22,0],fov:40}:{eye:[name==='signs-back'?2:0,3,name==='signs-back'?-8:8],target:[0,1.6,0],fov:44};
      if(name==='winding-closeup')window.reviewPose={eye:[.12,2.32,1.65],target:[0,2.25,0],fov:39};
      if(name==='winding-back'){light.position.set(-3,6,-8);window.reviewPose={eye:[.65,2.4,-1.65],target:[0,2.25,0],fov:39};}
    },{name,kinds});await page.waitForTimeout(300);await page.screenshot({path:`${directory}/${name}.png`});
  }
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({date:new Date().toISOString(),geometry,errors},null,2));console.log(JSON.stringify({peak:geometry.peak,signs:geometry.signs.length,errors}));
}finally{await browser.close();}
