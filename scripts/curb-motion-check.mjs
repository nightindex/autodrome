import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/curb-motion',phase=process.argv[2]??'after';await mkdir(directory,{recursive:true});
const baseUrl=process.env.AVTODROM_URL??'http://127.0.0.1:5173/';
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:960,height:640}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 if(phase==='before')await page.route('**/src/render/course-world.ts*',async route=>{
  const response=await route.fetch(),source=await response.text(),pattern=/mesh\.geometry\.dispose\(\);\s*mesh\.geometry\s*=\s*ribbons\[mesh\.name\];/;
  assert(pattern.test(source),'The baseline must retain the original extruded curb meshes');
  await route.fulfill({response,body:source.replace(pattern,'')});
 });
 await page.route(baseUrl,r=>r.fulfill({contentType:'text/html',body:'<!doctype html><style>body{margin:0}</style>'}));await page.goto(baseUrl);
 const geometry=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{CourseWorld}=await import('/src/render/course-world.ts'),{loadDirectionSignArtwork}=await import('/src/render/road-signs.ts');
  const source=await fetch('/src/simulation/vehicle.ts').then(r=>r.text()),R=(await import(source.match(/import RAPIER from ["']([^"']+)["']/)[1])).default;await Promise.all([R.init(),loadDirectionSignArtwork()]);
  const world=new CourseWorld(new R.World({x:0,y:-9.81,z:0})),meshes=['course-curbs','intersection-curbs','departure-curbs'].map(name=>world.group.getObjectByName(name));
  const renderer=new T.WebGLRenderer({antialias:true});renderer.setSize(960,640);renderer.outputColorSpace=T.SRGBColorSpace;document.body.append(renderer.domElement);
  const scene=new T.Scene();scene.background=new T.Color(0x76906a);const originals=[];
  for(const original of meshes){const m=original.clone();originals.push(original.material);m.material=original.material.clone();m.material.onBeforeCompile=original.material.onBeforeCompile;m.material.customProgramCacheKey=original.material.customProgramCacheKey;m.castShadow=m.receiveShadow=true;scene.add(m);}
  const ground=new T.Mesh(new T.PlaneGeometry(300,300),new T.MeshStandardMaterial({color:0x74836a,roughness:1}));ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const {stableShadowTarget,sunOffset,shadowSpan}=await import('/src/render/shadow-stability.ts');
  const sun=new T.DirectionalLight(0xfff1d4,2.4);sun.castShadow=true;Object.assign(sun.shadow.camera,{left:-shadowSpan/2,right:shadowSpan/2,top:shadowSpan/2,bottom:-shadowSpan/2,near:1,far:110});sun.shadow.mapSize.set(2048,2048);sun.shadow.bias=-.00015;sun.shadow.normalBias=.018;sun.shadow.radius=1.5;
  scene.add(sun,sun.target,new T.HemisphereLight(0xe0f1ff,0x7b8462,.65));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFShadowMap;
  const camera=new T.PerspectiveCamera(48,960/640,.06,600),caps=[];
  for(const mesh of meshes){const {position:p,normal:n}=mesh.geometry.attributes,index=mesh.geometry.index;let count=0;
   for(let i=0;i<index.count;i+=3){const ids=[0,1,2].map(j=>index.getX(i+j));if(ids.every(j=>Math.abs(n.getY(j))<1e-4)&&['x','z'].some(axis=>[-18,-16,-1.5,.5,13,16,46,63].some(v=>ids.every(j=>Math.abs((axis==='x'?p.getX(j):p.getZ(j))-v)<1e-5))))count++;}
   caps.push({mesh:mesh.name,internalCapTriangles:count,triangles:index.count/3});
  }
  const overlaps=[];
  for(let i=-10;i<=10;i++)for(let j=-10;j<=10;j++){
   const x=29.8679689+i*.003,z=29.2017653+j*.003,hits=new T.Raycaster(new T.Vector3(x,1,z),new T.Vector3(0,-1,0)).intersectObjects(meshes).filter(h=>Math.abs(h.point.y-.2)<1e-5);
   if(hits.length>1)overlaps.push({x,z,hits:hits.map(h=>({uv:h.uv.toArray(),face:h.faceIndex,mesh:h.object.name}))});
  }
  const points=new Map(),edges=new Map(),cells=new Map(),cell=.5,key=p=>p.map(v=>Math.round(v*1e5)).join(',');
  for(const mesh of meshes){const p=mesh.geometry.attributes.position,n=mesh.geometry.attributes.normal,uv=mesh.geometry.attributes.uv,index=mesh.geometry.index;
   for(const i of new Set(index.array)){if(n.getY(i)<-.99)continue;const point=[p.getX(i),p.getY(i),p.getZ(i)],k=key(point);if(!points.has(k))points.set(k,{point,u:uv.getX(i),mesh:mesh.name});}
   for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){const a=index.getX(i+j),b=index.getX(i+(j+1)%3);if(n.getY(a)<-.99&&n.getY(b)<-.99)continue;const pa=[p.getX(a),p.getY(a),p.getZ(a)],pb=[p.getX(b),p.getY(b),p.getZ(b)],ka=key(pa),kb=key(pb),k=ka<kb?ka+':'+kb:kb+':'+ka;const opposite=index.getX(i+(j+2)%3),oppositeKey=key([p.getX(opposite),p.getY(opposite),p.getZ(opposite)]);if(!edges.has(k))edges.set(k,{a:pa,b:pb,u:uv.getX(a),v:uv.getX(b),mesh:mesh.name,opposites:new Set()});edges.get(k).opposites.add(oppositeKey);}
  }
  for(const p of points.values()){const k=Math.floor(p.point[0]/cell)+','+Math.floor(p.point[2]/cell),list=cells.get(k)??[];list.push(p);cells.set(k,list);}
  const cracks=[];
  for(const edge of edges.values()){
   const d=edge.b.map((v,i)=>v-edge.a[i]),length=d.reduce((s,v)=>s+v*v,0);if(length<1e-8)continue;
   for(let x=Math.floor((Math.min(edge.a[0],edge.b[0])-1e-5)/cell);x<=Math.floor((Math.max(edge.a[0],edge.b[0])+1e-5)/cell);x++)for(let z=Math.floor((Math.min(edge.a[2],edge.b[2])-1e-5)/cell);z<=Math.floor((Math.max(edge.a[2],edge.b[2])+1e-5)/cell);z++){
    for(const p of cells.get(x+','+z)??[]){if(edge.opposites.has(key(p.point)))continue;const t=p.point.reduce((s,v,i)=>s+(v-edge.a[i])*d[i],0)/length;if(t<1e-5||t>1-1e-5)continue;if(Math.hypot(...p.point.map((v,i)=>v-edge.a[i]-d[i]*t))>1e-5)continue;const delta=p.u-(edge.u+(edge.v-edge.u)*t),error=Math.abs(delta-Math.round(delta));if(error>.0001)cracks.push({...edge,point:p.point,actual:p.u,error,t});}
   }
  }
  cracks.sort((a,b)=>b.error-a.error);
  window.curbMotion={T,renderer,scene,camera,sun,meshes,originals,stableShadowTarget,sunOffset};return {caps,overlaps:overlaps.length,worst:overlaps.slice(0,5),arbitraryJunctions:cracks.length,cracks:cracks.slice(0,5)};
 });
 const poses=[['straight',[-33,.9,42],[-29,.12,44.55]],['corner',[29.5,1.3,30.5],[30.966949,.12,28.936805]],['region-join',[1,1.4,15.5],[3.65,.1,13]],['distance',[-39,1.3,29],[-29,.1,44.55]]];
 const reports=[];
 for(const [name,eye,target]of poses){
  const report=await page.evaluate(({eye,target})=>{
   const {T,renderer,scene,camera,sun,stableShadowTarget,sunOffset}=window.curbMotion;
   camera.position.fromArray(eye);camera.lookAt(...target);camera.updateMatrixWorld();
   const rt=new T.WebGLRenderTarget(480,320,{samples:4}),pixels=new Uint8Array(480*320*4);
   let first=null,max=0,sum=0,changed=0;
   for(let i=0;i<24;i++){
    const anchor=stableShadowTarget(new T.Vector3(target[0]+i*.003,0,target[2]),2048);sun.target.position.copy(anchor);sun.position.copy(anchor).add(sunOffset);
    renderer.setRenderTarget(rt);renderer.render(scene,camera);renderer.readRenderTargetPixels(rt,0,0,480,320,pixels);
    if(first){for(let j=0;j<pixels.length;j+=4){const d=Math.max(...[0,1,2].map(k=>Math.abs(pixels[j+k]-first[j+k])));max=Math.max(max,d);sum+=d;if(d>2)changed++;}}else first=pixels.slice();
   }
   renderer.setRenderTarget(null);renderer.render(scene,camera);rt.dispose();return {staticCamera:{frames:24,maxDifference:max,meanDifference:sum/(480*320*23),changedPixels:changed}};
  },{eye,target});
  await page.screenshot({path:`${directory}/${phase}-${name}.png`});reports.push({name,...report});
 }
 const filtering=await page.evaluate(()=>{
  const {T,renderer,scene,camera,meshes,originals}=window.curbMotion;
  renderer.shadowMap.enabled=false;const draws=scene.children.filter(n=>n.isMesh);
  scene.background=new T.Color(0x0000ff);draws[3].material=new T.MeshBasicMaterial({color:0x0000ff});
  for(let i=0;i<3;i++){draws[i].material=new T.MeshBasicMaterial({map:originals[i].map});draws[i].material.onBeforeCompile=originals[i].onBeforeCompile;draws[i].material.customProgramCacheKey=originals[i].customProgramCacheKey;}
  const width=320,height=200,factor=4,read=()=>{const gl=renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return pixels;};
  camera.aspect=width/height;camera.updateProjectionMatrix();const result=[];
  for(const [name,eye,target]of [['near',[-33,.9,42],[-29,.12,44.55]],['far',[-39,1.3,29],[-29,.1,44.55]],['curve',[29.5,1.3,30.5],[30.966949,.12,28.936805]]]){
   let worst=0,total=0,count=0,large=0,worstSample,previousActual,previousExpected,temporalMax=0,temporalLarge=0,temporalTotal=0;
   for(let frame=0;frame<8;frame++){
    const offset=frame*.002;camera.position.set(eye[0]+offset,eye[1],eye[2]);camera.lookAt(target[0]+offset,target[1],target[2]);camera.updateMatrixWorld();
    renderer.setSize(width,height);renderer.render(scene,camera);const a=read();
    renderer.setSize(width*factor,height*factor);renderer.render(scene,camera);const b=read(),expectedFrame=new Float32Array(width*height).fill(NaN);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
     const i=(y*width+x)*4;if(a[i+2]>100)continue;
     let expected=0,interior=true;for(let yy=0;yy<factor;yy++)for(let xx=0;xx<factor;xx++){const j=((y*factor+yy)*width*factor+x*factor+xx)*4;expected+=b[j];if(b[j+2]>100)interior=false;}if(!interior)continue;expected/=factor*factor;expectedFrame[y*width+x]=expected;
     const error=Math.abs(a[i]-expected);if(error>worst){worst=error;const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2((x+.5)/width*2-1,(y+.5)/height*2-1),camera);const hit=ray.intersectObjects(draws.slice(0,3))[0];worstSample={x,y,frame,actual:a[i],expected,point:hit?.point.toArray(),uv:hit?.uv.toArray(),normal:hit?.face.normal.toArray(),mesh:hit?.object.name};}total+=error;count++;if(error>16)large++;
     if(previousActual&&Number.isFinite(previousExpected[y*width+x])){const jump=Math.abs(a[i]-previousActual[i]-(expected-previousExpected[y*width+x]));temporalMax=Math.max(temporalMax,jump);temporalTotal+=jump;if(jump>16)temporalLarge++;}
    }
    previousActual=a;previousExpected=expectedFrame;
   }
   result.push({name,frames:8,meanError:total/count,maxError:worst,largeErrors:large,sampledPixels:count,temporalMax,temporalLarge,temporalTotal,worstSample});
  }
  renderer.setRenderTarget(null);return result;
 });
 const report={phase,geometry,reports,filtering,errors};await writeFile(`${directory}/${phase}.json`,JSON.stringify(report,null,2));
 console.log(JSON.stringify({phase,geometry,filtering:filtering.map(({worstSample,...rest})=>rest),errors},null,2));assert.deepEqual(errors,[]);
 if(phase==='after'){
  assert.equal(geometry.arbitraryJunctions,0,'Paint must agree at every interior edge vertex, not only midpoints');
  assert(geometry.caps.every(m=>m.internalCapTriangles===0),'Rendering-region boundaries must not add overlapping internal ends');
  assert.equal(geometry.overlaps,0);assert(geometry.caps.reduce((sum,m)=>sum+m.triangles,0)<58000);
  assert(reports.every(r=>r.staticCamera.maxDifference<=5),'Stationary curbs remain stable as the shadow anchor advances');
  assert(filtering.find(r=>r.name==='curve').temporalMax<80,'A subpixel camera movement must not produce the original half-contrast flash');
 }
}finally{await browser.close();}
