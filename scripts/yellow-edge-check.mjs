import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory='test-results/yellow-edge';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1200,height:900}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
 await page.click('#practice');await page.keyboard.press('Escape');
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s);
  s.car.visible=false;window.yellowPose=[30.4,11.1];
  s.render=(...args)=>{
   render(...args);s.guide.visible=s.goal.visible=false;const [x,z]=window.yellowPose;
   s.camera.clearViewOffset();s.camera.fov=44;s.camera.updateProjectionMatrix();s.camera.position.set(x,2.4,z+1.8);s.camera.lookAt(x,0,z);
   s.renderer.setRenderTarget(null);s.renderer.setScissorTest(false);s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);
  };
 });
 const captures=[];
 for(const [name,pose]of [['bend',[30.4,11.1]],['snake',[20.35,-16.15]],['lower-bend',[25.18,18.94]]]){
  await page.evaluate(p=>{window.yellowPose=p;},pose);await page.waitForTimeout(300);const path=`${directory}/${phase}-${name}.png`;await page.screenshot({path});captures.push(path);
 }
 const witnesses=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{mapPoint}=await import('/src/data/course.ts'),group=window.__avtodrom.scene.world.group;
  const white=group.getObjectByName('course-edge-lines'),yellow=group.getObjectByName('course-yellow-edge-lines');
  const probe=(name,x,z,expected)=>{
   const ray=new T.Raycaster(new T.Vector3(x,6,z),new T.Vector3(0,-1,0)),hits=ray.intersectObjects([white,yellow]);
   return {name,x,z,expected,meshes:hits.map(h=>h.object.name),passed:hits.length===1&&hits[0].object.name===expected};
  };
  const out=[
   probe('B upper wedge',30.3615800155,11.113925772,'course-yellow-edge-lines'),
   probe('Snake sliver',20.3536908401,-16.1379106552,'course-yellow-edge-lines'),
   probe('B lower sliver',25.1886267616,18.941273046,'course-yellow-edge-lines'),
  ];
  for(const y of [592.1,637.9])for(const x of [984.5,985.5]){
   const p=mapPoint(x,y);out.push(probe(`Control transition ${x},${y}`,p.x,p.z,x<985?'course-yellow-edge-lines':'course-edge-lines'));
  }
  return out;
 });
 await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({phase,errors,captures,witnesses},null,2));
 assert.deepEqual(errors,[]);if(phase==='after')assert(witnesses.every(w=>w.passed),JSON.stringify(witnesses.filter(w=>!w.passed)));
 console.log(JSON.stringify({phase,errors,captures,witnesses}));
}finally{await browser.close();}
