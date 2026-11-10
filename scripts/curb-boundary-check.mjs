import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory='test-results/curb-boundaries';
await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
  // Load the real course in isolation: camera/texture diagnostics do not need
  // vehicle physics, UI animation, trees or the car asset.
  await page.route('http://127.0.0.1:5173/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}</style>'}));
  await page.goto('http://127.0.0.1:5173/');
  const report=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{CourseWorld}=await import('/src/render/course-world.ts');
    const source=await fetch('/src/simulation/vehicle.ts').then(r=>r.text()),R=(await import(source.match(/import RAPIER from ["']([^"']+)["']/)[1])).default;
    const {loadDirectionSignArtwork}=await import('/src/render/road-signs.ts');
    await Promise.all([R.init(),loadDirectionSignArtwork()]);const physics=new R.World({x:0,y:-9.81,z:0}),world=new CourseWorld(physics);
    const scene=new T.Scene();scene.background=new T.Color(0xbfcbd0);
    const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1280,800);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
    const meshes=['course-curbs','intersection-curbs','departure-curbs'].map(name=>world.group.getObjectByName(name));
    for(const original of meshes){const mesh=original.clone();mesh.material=new T.MeshBasicMaterial({map:original.material.map});mesh.material.onBeforeCompile=original.material.onBeforeCompile;mesh.material.customProgramCacheKey=original.material.customProgramCacheKey;scene.add(mesh);}
    const ground=new T.Mesh(new T.PlaneGeometry(300,300),new T.MeshBasicMaterial({color:0x6d756a}));ground.rotation.x=-Math.PI/2;scene.add(ground);
    const camera=new T.PerspectiveCamera(48,1280/800,.1,250);camera.position.set(-33,.7,47);camera.lookAt(-29,.12,44.55);camera.updateMatrixWorld();
    renderer.render(scene,camera);
    const samples=[];let overlaps=0;
    for(let i=0;i<200;i++){
      const x=-31+i*.0217,z=44.545;
      const hits=new T.Raycaster(new T.Vector3(x,1,z),new T.Vector3(0,-1,0),0,2).intersectObjects(meshes);
      if(hits.filter(h=>Math.abs(h.point.y-(hits[0]?.point.y??0))<1e-5).length>1)overlaps++;
      if(i%20===0){const across=[];for(const depth of [44.43,44.46,44.54,44.64]){
        const hit=new T.Raycaster(new T.Vector3(x,1,depth),new T.Vector3(0,-1,0),0,2).intersectObjects(meshes)[0];
        across.push({depth,u:hit?.uv?.x,y:hit?.point.y,mesh:hit?.object.name});
      }samples.push({x,across});}
    }
    window.curbBoundary={T,renderer,scene,camera,world,meshes};
    return {overlaps,samples};
  });
  for(const [name,eye,target]of [['grass',[-33,.7,47],[-29,.12,44.55]],['road',[-33,.9,42],[-29,.12,44.55]],['curve',[64,8,29],[54,0,17]]]){
    await page.evaluate(({eye,target})=>{const {renderer,scene,camera}=window.curbBoundary;camera.position.fromArray(eye);camera.lookAt(...target);camera.updateMatrixWorld();renderer.render(scene,camera);},{eye,target});
    await page.screenshot({path:`${directory}/${phase}-${name}.png`});
  }
  report.motion=await page.evaluate(async()=>{
    const {T,renderer,scene,camera,meshes}=window.curbBoundary,frames=[];
    for(let i=0;i<24;i++){
      camera.position.set(-33+i*.004,.7,47);camera.lookAt(-29+i*.004,.12,44.55);camera.updateMatrixWorld();renderer.render(scene,camera);
      frames.push({x:camera.position.x,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
      await new Promise(requestAnimationFrame);
    }
    return {frames:frames.length,travel:frames.at(-1).x-frames[0].x,maxTriangles:Math.max(...frames.map(f=>f.triangles)),maxCalls:Math.max(...frames.map(f=>f.calls)),curbTriangles:meshes.reduce((sum,m)=>sum+m.geometry.index.count/3,0)};
  });
  report.filter=await page.evaluate(()=>{
    const {T,renderer,meshes}=window.curbBoundary,texture=meshes[0].material.map.clone();texture.needsUpdate=true;
    const material=new T.MeshBasicMaterial({map:texture});material.onBeforeCompile=meshes[0].material.onBeforeCompile;material.customProgramCacheKey=meshes[0].material.customProgramCacheKey;
    const g=new T.PlaneGeometry(2,2),uv=g.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setX(i,uv.getX(i)*64*8);
    const scene=new T.Scene();scene.add(new T.Mesh(g,material));const camera=new T.OrthographicCamera(-1,1,1,-1,.1,10);camera.position.z=1;
    const target=new T.WebGLRenderTarget(64,32),samples=[];
    renderer.setRenderTarget(target);
    for(let i=0;i<16;i++){
      texture.offset.x=218+i/16;renderer.render(scene,camera);const pixel=new Uint8Array(4);renderer.readRenderTargetPixels(target,31,15,1,1,pixel);samples.push(Array.from(pixel));
    }
    renderer.setRenderTarget(null);g.dispose();material.dispose();texture.dispose();target.dispose();
    const black=new T.Color(0x242923),yellow=new T.Color(0xf0ce45),expected=['r','g','b'].map(k=>(black[k]+yellow[k])*.5*255);
    const range=Math.max(...[0,1,2].map(k=>Math.max(...samples.map(s=>s[k]))-Math.min(...samples.map(s=>s[k]))));
    const error=Math.max(...samples.flatMap(s=>[0,1,2].map(k=>Math.abs(s[k]-expected[k]))));
    return {samples,expected,range,error};
  });
  const maxSpread=Math.max(...report.samples.map(s=>{const u=s.across.map(p=>p.u);return Math.max(...u)-Math.min(...u);}));
  report.maxAcrossSpread=maxSpread;
  await writeFile(`${directory}/${phase}.json`,JSON.stringify({report,errors},null,2));
  assert.deepEqual(errors,[]);
  if(phase==='after'){
    assert.equal(report.overlaps,0,'No overlapping coplanar curb tops');
    assert(maxSpread<.03,`Paint must line up across the top and bevel: ${maxSpread}`);
    assert(report.filter.range<=1&&report.filter.error<1.5,`Subpixel stripes must average to stable 50/50 paint while the camera phase changes: ${JSON.stringify(report.filter)}`);
    assert(report.motion.travel>.08&&report.motion.maxCalls===4,'Camera movement renders all three curb regions and the ground');
    assert(report.motion.curbTriangles<85000,'Curb filtering stays within its geometry budget');
  }
  console.log(JSON.stringify({overlaps:report.overlaps,maxAcrossSpread:maxSpread,motion:report.motion,filter:{range:report.filter.range,error:report.filter.error},errors},null,2));
}finally{await browser.close();}
