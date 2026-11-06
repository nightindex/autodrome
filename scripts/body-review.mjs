import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory='test-results/body-review';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  if(phase==='before')await page.route('**/assets/cobalt.glb*',route=>route.fulfill({path:'test-results/model-review/surface-before.glb',contentType:'model/gltf-binary'}));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,{timeout:60000});
  await page.click('#practice');await page.waitForTimeout(600);await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
    window.bodyPose={eye:[4,1,4],target:[0,.1,0],fov:43};
    s.render=(...args)=>{render(...args);const p=window.bodyPose;s.guide.visible=s.goal.visible=false;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));s.renderer.render(s.scene,s.camera);};
  });
  const poses=[
    ['front-left',{eye:[3.5,1.3,4.2],target:[0,.1,.1],fov:43}],
    ['front-right',{eye:[-3.5,1.3,4.2],target:[0,.1,.1],fov:43}],
    ['left-side',{eye:[5.7,.7,0],target:[0,.08,0],fov:43}],
    ['right-side',{eye:[-5.7,.7,0],target:[0,.08,0],fov:43}],
    ['rear-left',{eye:[3.6,1.35,-4.2],target:[0,.1,-.25],fov:43}],
    ['rear-right',{eye:[-3.6,1.35,-4.2],target:[0,.1,-.25],fov:43}],
    ['windshield',{eye:[-1.6,1.1,3.1],target:[0,.3,.05],fov:43}],
    ['seats',{eye:[.75,.58,1.0],target:[-.1,.08,-.3],fov:79}],
    ['rear-arch',{eye:[2.5,.4,-1.32],target:[.78,.02,-1.32],fov:43}],
  ];
  if(!process.argv.includes('--probes'))for(const [name,pose]of poses){await page.evaluate(p=>window.bodyPose=p,pose);await page.waitForTimeout(250);await page.screenshot({path:`${directory}/${phase}-${name}.png`});}
  const probes=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,out=[];
    const probe=(origin,direction,label)=>{
      const ray=new T.Raycaster(s.car.localToWorld(new T.Vector3(...origin)),new T.Vector3(...direction).transformDirection(s.car.matrixWorld));
      const hit=ray.intersectObject(s.car,true).find(hit=>{const m=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;return !m.transparent&&!hit.object.userData.opticalHalo;});
      if(!hit)return;const m=Array.isArray(hit.object.material)?hit.object.material[hit.face.materialIndex]:hit.object.material;
      out.push({label,origin,mesh:hit.object.name,material:m.name,point:s.car.worldToLocal(hit.point).toArray()});
    };
    for(const side of [-1,1])for(const y of [.035,.065,.095,.125])for(const z of [-1.15,-1.25,-1.35,-1.45,-1.55])probe([side*2,y,z],[-side,0,0],'arch');
    // Probe the metal panel, clear of the intentional roof/door weatherstrip.
    for(const side of [-1,1])for(const x of [.3,.45,.5])for(const z of [-.5,-.2,0])probe([side*x,2,z],[0,-1,0],'roof');
    return out;
  });
  const validation=await page.evaluate(()=>{
    const s=window.__avtodrom.scene,names=[];s.car.traverse(n=>{if(/^COBALT_(SeatBack|SeatInsert|Headrest_)/.test(n.name))names.push(n.name);});return {names,wheels:window.__avtodrom.snapshot().wheels};
  });
  const report={date:new Date().toISOString(),phase,errors,validation,probes};
  await writeFile(`${directory}/${phase}-report.json`,JSON.stringify(report,null,2));
  if(phase==='after'){
    assert.equal(validation.wheels,4);assert.equal(validation.names.length,6);
    assert(probes.filter(p=>p.label==='roof').every(p=>p.material==='Realistic_Car_Paint'),`No liner or pillar protrudes through the roof: ${JSON.stringify(probes.filter(p=>p.label==='roof'&&p.material!=='Realistic_Car_Paint'))}`);
    const upperArches=probes.filter(p=>p.label==='arch'&&p.origin[1]>=.095);
    assert(upperArches.every(p=>!/^roda/.test(p.mesh)),'Tyres do not pierce the upper arch panels');
    assert(upperArches.every(p=>p.material!=='COBALT_LowerDash'),'Rear door trim stays clear of the wheel wells');
    assert(upperArches.filter(p=>p.material==='Realistic_Car_Paint').length>=upperArches.length*.8,'Upper arch witnesses hit the painted panels, clear of the wheel-well opening');
  }
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({phase,errors,validation,nonPaintProbes:probes.filter(p=>p.material!=='Realistic_Car_Paint')},null,2));
}finally{await browser.close();}
