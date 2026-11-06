import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/all-markings';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');await page.waitForTimeout(500);await page.keyboard.press('Escape');
  const geometry=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{laneLines,laneGores}=await import('/src/data/lane-markings.ts'),{yellowControlLines}=await import('/src/data/road-markings.ts'),{mapPoint,startLinePoint}=await import('/src/data/course.ts');
    const group=window.__avtodrom.scene.world.group;group.updateMatrixWorld(true);
    const painted=(mesh,p)=>[[0,0],[1e-5,0],[-1e-5,0],[0,1e-5],[0,-1e-5]].some(([dx,dz])=>!!new T.Raycaster(new T.Vector3(p.x+dx,6,p.z+dz),new T.Vector3(0,-1,0)).intersectObject(mesh)[0]);
    let stations=0;const missing=[];
    for(const line of laneLines){const mesh=group.getObjectByName(`paint-lane-${line.id}`);
      for(let i=1;i<line.points.length;i++){const a=line.points[i-1],b=line.points[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.4);
        for(let j=0;j<=steps;j++){const p={x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps};stations++;if(!painted(mesh,p))missing.push({id:line.id,...p});}
      }
    }
    const yellow=group.getObjectByName('course-yellow-edge-lines'),yellowPoints=[[185.1,350],[127.1,275],[394.1,225],[477.1,260],[390,612.9],[420,697.1],[940,282.1],[920,342.9]].map(([x,y])=>({x,y,painted:painted(yellow,mapPoint(x,y))}));
    const gores=laneGores.map(gore=>({id:gore.id,triangles:group.getObjectByName(`paint-gore-${gore.id}`).geometry.index.count/3}));
    const controls=group.getObjectByName('paint-yellow-control-lines'),controlSamples=yellowControlLines.map(([a,b])=>{const length=Math.hypot(b.x-a.x,b.z-a.z);let hits=0,total=0;for(let d=.16;d<length;d+=.65){const p={x:a.x+(b.x-a.x)*d/length,z:a.z+(b.z-a.z)*d/length};total++;if(painted(controls,p))hits++;}return {hits,total};});
    return {stations,missing,yellowPoints,gores,controlSamples,startLine:startLinePoint};
  });
  assert.deepEqual(geometry.missing,[]);assert(geometry.yellowPoints.every(p=>p.painted));assert(geometry.gores.every(g=>g.triangles>10));
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{mapPoint}=await import('/src/data/course.ts'),s=window.__avtodrom.scene,v=window.__avtodrom.vehicle,render=s.render.bind(s);
    v.reset(mapPoint(715,745),-Math.PI/2);for(let i=0;i<60;i++)v.update(1/60,{down:()=>false},true);
    window.markingReviewPose={driver:true};
    s.render=(...args)=>{render(...args);s.guide.visible=s.goal.visible=false;const p=window.markingReviewPose;s.camera.clearViewOffset();s.camera.fov=p.fov??52;s.camera.updateProjectionMatrix();
      if(p.driver){s.camera.position.copy(s.car.localToWorld(new T.Vector3(0,3.4,-7.3)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(0,.65,2)));}
      else{s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));}
      s.renderer.render(s.scene,s.camera);
    };
  });
  for(const [name,pose]of [
    ['video-junction-driver',{driver:true}],
    ['video-junction-overview',{eye:[19,12,28],target:[-2,0,18],fov:48}],
    ['upper-perimeter',{eye:[13,35,-3],target:[-4,0,-35],fov:55}],
    ['garage-yellow',{eye:[-22,23,-2],target:[-33,0,-24],fov:56}],
    ['parking-yellow',{eye:[-12,18,25],target:[-30,0,9],fov:54}],
    ['start-and-finish',{eye:[-52,12,49],target:[-33,0,39],fov:58}],
  ]){await page.evaluate(p=>window.markingReviewPose=p,pose);await page.waitForTimeout(250);await page.screenshot({path:`${directory}/${name}.png`});}
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({geometry,errors},null,2));console.log(JSON.stringify({stations:geometry.stations,missing:geometry.missing.length,yellowWitnesses:geometry.yellowPoints.length,gores:geometry.gores,errors}));
}finally{await browser.close();}
