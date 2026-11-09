import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/intersection';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded||document.querySelector('#modal[data-type="error"]'),null,{timeout:60000});
  assert(await page.evaluate(()=>window.__avtodrom?.snapshot().loaded),await page.locator('#modal').innerText());
  await page.click('#exercises');await page.click('[data-exercise="4"]');await page.waitForTimeout(500);await page.keyboard.press('Escape');
  const pausedTime=await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.time);await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>window.__avtodrom.snapshot().telemetry.time),pausedTime,'Pausing must freeze the signal clock with vehicle physics');
  await page.evaluate(()=>{for(let i=0;i<1200;i++)window.__avtodrom.step(1/60);});await page.waitForTimeout(250);
  assert.equal(await page.evaluate(()=>window.__avtodrom.scene.world.trafficLights.find(h=>h.group.userData.approach==='south').group.userData.phase),'green','The live rendered signal must advance with simulated time');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);window.signalReviewTime=0;
    window.signalPose={eye:[13,15,16],target:[0,0,-3],fov:58};
    s.render=(...args)=>{window.__avtodrom.vehicle.time=window.signalReviewTime;render(...args);s.guide.visible=s.goal.visible=false;const p=window.signalPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
  });
  for(const [name,pose]of [
    ['junction',{eye:[13,15,16],target:[0,0,-3],fov:58}],
    ['south-driver',{eye:[1.5,3.4,19.3],target:[1.5,.65,10],fov:52}],
    ['west-approach',{eye:[-17,6,3],target:[0,1,-2.5],fov:57}],
    ['white-curbs',{eye:[8,.8,7],target:[4,.16,2],fov:48}],
    ['curb-join',{eye:[1,1.4,15.5],target:[3.65,.1,13],fov:45}],
  ]){await page.evaluate(p=>window.signalPose=p,pose);await page.waitForTimeout(350);await page.screenshot({path:`${directory}/${name}.png`});}
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{roadDistance,intersectionCrossings}=await import('/src/render/course-world.ts'),{intersectionApproaches}=await import('/src/data/intersection.ts'),{crosswalkStripes}=await import('/src/render/crosswalk.ts'),{Minimap}=await import('/src/ui/minimap.ts');
    const world=window.__avtodrom.scene.world,curbs=world.group.getObjectByName('intersection-curbs');
    const heads=world.trafficLights.map(head=>{
      const p=head.group.getWorldPosition(new T.Vector3()),a=intersectionApproaches.find(a=>a.id===head.group.userData.approach),right={x:-a.normal.z,z:a.normal.x};
      const ray=new T.Raycaster(new T.Vector3(p.x,.12,p.z),new T.Vector3(-right.x,0,-right.z),0,6),hit=ray.intersectObject(curbs)[0];
      return {approach:a.id,axis:head.axis,position:p.toArray(),clearance:roadDistance({x:p.x,z:p.z}),curbVisible:!!hit,curbDistance:hit?.distance};
    });
    const signs=[];world.group.traverse(n=>{if(/^sign-.*-front$/.test(n.name)){const p=n.getWorldPosition(new T.Vector3());signs.push({name:n.name,assembly:n.parent.name,clearance:roadDistance({x:p.x,z:p.z})});}});
    const stops=intersectionApproaches.map(a=>{
      const mesh=world.group.getObjectByName(`intersection-stop-${a.id}`);mesh.geometry.computeBoundingBox();return {id:a.id,min:mesh.geometry.boundingBox.min.toArray(),max:mesh.geometry.boundingBox.max.toArray()};
    });
    const mini=new Minimap(document.createElement('canvas')),ctx=mini.base.getContext('2d');
    const crossings=intersectionCrossings.map(c=>({id:c.id,width:c.width,stripes:crosswalkStripes(c).map(stripe=>{
      const center=stripe.points.reduce((sum,p)=>({x:sum.x+p.x/4,z:sum.z+p.z/4}),{x:0,z:0}),pixel=mini.projection.project(center);
      const mesh=world.group.getObjectByName(`intersection-crossing-${c.id}-${stripe.yellow?'yellow':'white'}`);
      return {hit:new T.Raycaster(new T.Vector3(center.x,2,center.z),new T.Vector3(0,-1,0)).intersectObject(mesh).length>0,clearance:roadDistance(center),yellow:stripe.yellow,mapPixel:[...ctx.getImageData(Math.floor(pixel.x),Math.floor(pixel.y),1,1).data]};
    })}));
    const join=[12.95,12.995,13,13.005,13.05].map(z=>{
      const meshes=['intersection-curbs','departure-curbs'].map(name=>world.group.getObjectByName(name));
      const hit=new T.Raycaster(new T.Vector3(3.65,1,z),new T.Vector3(0,-1,0)).intersectObjects(meshes)[0];return {z,top:hit?.point.y};
    });
    curbs.geometry.computeBoundingBox();
    return {heads,signs,stops,crossings,join,curbSide:curbs.material.side,curbHeight:curbs.geometry.boundingBox.max.y};
  });
  assert.equal(geometry.heads.length,4);assert(geometry.heads.every(h=>h.clearance>=.3),'Every signal post must stand off the asphalt');
  assert(geometry.heads.every(h=>h.curbVisible),'The curb must be visible between every signal post and its approaching road');
  assert.equal(geometry.curbSide,0);assert(geometry.curbHeight>=.2);
  assert(geometry.join.every(p=>Math.abs(p.top-.2)<1e-6),'No step or gap where the junction kerb joins the departure kerb');
  for(const crossing of geometry.crossings){
    assert(crossing.width>7);assert(crossing.stripes.every(s=>s.hit&&s.clearance<-.17),'All zebra stripes must render on asphalt');
    // Small raster stripes have antialiasing; the optional gold route is also
    // drawn over this background. Both should retain the stripe's colour.
    for(const stripe of crossing.stripes){const [r,g,b]=stripe.mapPixel,visible=stripe.yellow?r>190&&g>160&&b<170:r>210&&g>210&&b>180;assert(visible,`Mini-map stripe ${crossing.id}: ${JSON.stringify(stripe)}`);}
  }
  assert(geometry.signs.every(s=>['hill-stop','hill-descent'].includes(s.assembly)?s.clearance>-.14&&s.clearance<-.05:s.clearance>.15),JSON.stringify(geometry.signs.filter(s=>!['hill-stop','hill-descent'].includes(s.assembly)&&s.clearance<=.15)));
  for(const kind of ['right','left','straight','yield','priority','stopPlate','winding','carPlate','truckPlate','busPlate'])assert(geometry.signs.some(s=>s.name===`sign-${kind}-front`),`Missing ${kind} sign`);
  const phases=[];
  for(const [name,time]of [['red',0],['red-amber',17.5],['green',20],['green-blink-off',45.6],['amber',49],['clearance',51.5],['cross-road-green',56]]){
    const states=await page.evaluate(async time=>{
      const {signalAspects}=await import('/src/data/traffic-signals.ts'),world=window.__avtodrom.scene.world;window.signalReviewTime=time;world.update(time);
      const south=world.trafficLights.find(h=>h.group.userData.approach==='south').group,p=south.getWorldPosition(south.position.clone());
      window.signalPose={eye:[p.x+.8,3.42,p.z+2.1],target:[p.x,3,p.z],fov:42};
      return world.trafficLights.map(h=>({axis:h.axis,phase:h.group.userData.phase,actual:Object.fromEntries(['red','amber','green'].map(color=>[color,h.group.getObjectByName(`signal-${color}-lens`).material.emissiveIntensity>0])),expected:signalAspects(time,h.axis)}));
    },time);
    for(const s of states)for(const color of ['red','amber','green'])assert.equal(s.actual[color],s.expected[color],`${name}: ${s.axis} ${color}`);
    phases.push({name,time,states});await page.waitForTimeout(300);await page.screenshot({path:`${directory}/signal-${name}.png`});
  }
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({geometry,phases,errors},null,2));console.log(JSON.stringify({heads:geometry.heads,signs:geometry.signs.length,phases:phases.length,errors}));
}catch(error){console.error(JSON.stringify({errors,dialog:await page.locator('#modal').innerText()}));throw error;}finally{await browser.close();}
