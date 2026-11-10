import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/curb-joints',phase=process.argv[2]??'before';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']}),page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 if(phase==='before')await page.route('**/src/render/curb-appearance.ts*',async route=>{
  const response=await route.fetch(),source=await response.text(),pattern=/conform\(refined\[i\],\s*refined\[i\s*\+\s*1\],\s*refined\[i\s*\+\s*2\]\)/;
  assert(pattern.test(source),'The baseline must disable only edge conformance');
  await route.fulfill({response,body:source.replace(pattern,'index.push(refined[i],refined[i+1],refined[i+2])')});
 });
 await page.route('http://127.0.0.1:5173/',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}</style>'}));await page.goto('http://127.0.0.1:5173/');
 const report=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{CourseWorld}=await import('/src/render/course-world.ts'),{loadDirectionSignArtwork}=await import('/src/render/road-signs.ts');
  const source=await fetch('/src/simulation/vehicle.ts').then(r=>r.text()),R=(await import(source.match(/import RAPIER from ["']([^"']+)["']/)[1])).default;
  await Promise.all([R.init(),loadDirectionSignArtwork()]);const world=new CourseWorld(new R.World({x:0,y:-9.81,z:0}));
  const meshes=['course-curbs','intersection-curbs','departure-curbs'].map(name=>world.group.getObjectByName(name)),vertices=new Map(),edges=[],key=p=>p.map(v=>Math.round(v*1e4)).join(','),delta=(a,b)=>Math.abs(a-b-Math.round(a-b));
  for(const mesh of meshes){const {position:p,uv,normal:n}=mesh.geometry.attributes,index=mesh.geometry.index;
   for(let i=0;i<p.count;i++){
    if(n.getY(i)<-.99)continue;
    const point=[p.getX(i),p.getY(i),p.getZ(i)],k=key(point),list=vertices.get(k)??[];
    list.push({point,u:uv.getX(i),normal:[n.getX(i),n.getY(i),n.getZ(i)],mesh:mesh.name});vertices.set(k,list);
   }
   for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){
    const a=index.getX(i+j),b=index.getX(i+(j+1)%3);if(n.getY(a)<-.99&&n.getY(b)<-.99)continue;
    edges.push({a:[p.getX(a),p.getY(a),p.getZ(a)],b:[p.getX(b),p.getY(b),p.getZ(b)],u:uv.getX(a),v:uv.getX(b),mesh:mesh.name});
   }
  }
  const coincident=[],midpoints=[];
  for(const list of vertices.values())for(let i=1;i<list.length;i++){
   const error=delta(list[0].u,list[i].u);if(error>.0001)coincident.push({error,a:list[0],b:list[i]});
  }
  for(const edge of edges){const point=edge.a.map((v,i)=>(v+edge.b[i])/2),samples=vertices.get(key(point));if(!samples)continue;
   const dv=edge.v-edge.u;if(Math.abs(dv)>1)continue;
   const expected=(edge.u+edge.v)/2;
   for(const sample of samples){if(Math.hypot(...sample.point.map((v,i)=>v-point[i]))>1e-5||Math.hypot(...edge.a.map((v,i)=>v-edge.b[i]))<.001)continue;
    const error=delta(sample.u,expected);if(error>.0001)midpoints.push({error,point,samplePoint:sample.point,edge:[edge.a,edge.b],paintBoundary:Math.floor(edge.u*2)!==Math.floor(edge.v*2),mesh:edge.mesh,sampleMesh:sample.mesh,expected,actual:sample.u});}
  }
  coincident.sort((a,b)=>b.error-a.error);midpoints.sort((a,b)=>b.error-a.error);
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(1280,800);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color(0x76906a);
  for(const original of meshes){const m=original.clone();m.material=new T.MeshBasicMaterial({map:original.material.map});m.material.onBeforeCompile=original.material.onBeforeCompile;m.material.customProgramCacheKey=original.material.customProgramCacheKey;scene.add(m);}
  const camera=new T.PerspectiveCamera(43,1280/800,.05,250);window.curbJoint={T,renderer,scene,camera,meshes};
  return {coincident:{count:coincident.length,worst:coincident.slice(0,8)},midpoints:{count:midpoints.length,paintBoundaries:midpoints.filter(p=>p.paintBoundary).length,worst:midpoints.slice(0,8)},triangles:meshes.reduce((sum,m)=>sum+m.geometry.index.count/3,0)};
 });
 // Fixed top/wall probes from the previous broken-edge report keep before
 // and after captures comparable, and work without any prior local artifacts.
 const probes=[[30.966949,.2,28.936805],[28.819061,.0775,-7.494113]];
 const poses=[['straight',[-29,.2,44.545]],['corner',[55,.2,20]],...probes.map((p,i)=>[`worst-${i}`,p])];
 for(const [name,target]of poses){
  await page.evaluate(target=>{const {renderer,scene,camera}=window.curbJoint;camera.position.set(target[0]-1.4,target[1]+1.1,target[2]+1.5);camera.lookAt(...target);camera.updateMatrixWorld();renderer.render(scene,camera);},target);await page.screenshot({path:`${directory}/${phase}-${name}.png`});
 }
 report.motion=await page.evaluate(async targets=>{
  const {T,renderer,scene,camera,meshes}=window.curbJoint,{stableShadowTarget,sunOffset,shadowSpan}=await import('/src/render/shadow-stability.ts');
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
  const sun=new T.DirectionalLight(0xfff1d4,2.4);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-shadowSpan/2,right:shadowSpan/2,top:shadowSpan/2,bottom:-shadowSpan/2,near:1,far:110});sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00015;sun.shadow.normalBias=.018;
  scene.add(sun,sun.target,new T.HemisphereLight(0xe2f1ff,0x52604d,1));
  const draws=scene.children.filter(n=>n.isMesh);draws.forEach((m,i)=>{m.material=meshes[i].material.clone();m.material.onBeforeCompile=meshes[i].material.onBeforeCompile;m.material.customProgramCacheKey=meshes[i].material.customProgramCacheKey;m.castShadow=m.receiveShadow=true;});
  const frames=[];
  for(const style of ['yellow-black','white']){
   for(const m of draws){m.material.map=style==='yellow-black'?meshes[0].material.map:null;m.material.vertexColors=style==='white';m.material.needsUpdate=true;}
   for(const target of targets)for(let i=0;i<24;i++){
    const offset=(i-12)*.004;
    camera.position.set(target[0]-1.4+offset,target[1]+1.1,target[2]+1.5);camera.lookAt(target[0]+offset,target[1],target[2]);camera.updateMatrixWorld();
    const shadowTarget=stableShadowTarget(new T.Vector3(target[0]+offset,0,target[2]),2048);sun.target.position.copy(shadowTarget);sun.position.copy(shadowTarget).add(sunOffset);
    renderer.render(scene,camera);frames.push({style,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});await new Promise(requestAnimationFrame);
   }
  }
  return {frames:frames.length,cameraTravel:.092,styles:['yellow-black','white'],shadowResolution:2048,maxCalls:Math.max(...frames.map(f=>f.calls))};
 },probes);
 await page.screenshot({path:`${directory}/${phase}-lit-white.png`});
 report.errors=errors;await writeFile(`${directory}/${phase}.json`,JSON.stringify(report,null,2));assert.deepEqual(errors,[]);
 console.log(JSON.stringify({coincident:report.coincident.count,brokenEdges:report.midpoints.count,paintBoundaries:report.midpoints.paintBoundaries,triangles:report.triangles,motion:report.motion,errors},null,2));
 if(phase==='after'){assert.equal(report.coincident.count,0,'Coincident curb vertices must have continuous colour');assert.equal(report.midpoints.count,0,'Refined edges must match both incident faces');assert(report.triangles<85000);}
}finally{await browser.close();}
