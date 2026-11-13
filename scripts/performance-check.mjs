import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const label=process.argv[2]??'after',directory='test-results/performance';
await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:720},deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const summary={label,viewport:'1280x720',quality:'high',scenarios:[],errors};
try{
  await page.goto(process.env.SIMULATOR_URL??'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.scene?.prepared,null,{timeout:120000});
  summary.environment=await page.evaluate(baseline=>{
    const a=window.__avtodrom,s=a.scene,gl=s.renderer.getContext(),extension=gl.getExtension('WEBGL_debug_renderer_info');
    s.setQuality('high');a.start('practice');
    // Reproduce the original source-mesh shadow pass and repeated matrix
    // updates, so before/after remains reproducible with the same assets.
    if(baseline){
      s.sun.shadow.camera.layers.set(0);s.scene.matrixAutoUpdate=true;s.scene.matrixWorldAutoUpdate=true;
      s.world.group.traverse(node=>{node.matrixAutoUpdate=true;});
    }
    const render=s.renderer.render.bind(s.renderer),frame=s.render.bind(s),matrix=s.scene.updateMatrixWorld.bind(s.scene);
    window.performanceFrames=[];window.performancePasses=[];window.matrixMs=0;
    s.scene.updateMatrixWorld=(...args)=>{const start=performance.now();const result=baseline&&!window.performanceInPass?s.car.updateMatrixWorld(true):matrix(...args);window.matrixMs+=performance.now()-start;return result;};
    s.renderer.render=(...args)=>{const start=performance.now();window.performanceInPass=true;try{render(...args);}finally{window.performanceInPass=false;}window.performancePasses.push({ms:performance.now()-start,calls:s.renderer.info.render.calls,triangles:s.renderer.info.render.triangles});};
    s.render=(...args)=>{args[4]=window.performanceLook??0;window.performancePasses=[];window.matrixMs=0;const start=performance.now();frame(...args);window.performanceFrames.push({time:start,renderMs:performance.now()-start,matrixMs:window.matrixMs,passes:window.performancePasses});};
    const counts={objects:0,meshes:0,autoMatrices:0,worldObjects:0,carObjects:0};
    s.scene.traverse(n=>{counts.objects++;if(n.isMesh)counts.meshes++;if(n.matrixAutoUpdate)counts.autoMatrices++;});s.world.group.traverse(()=>counts.worldObjects++);s.car.traverse(()=>counts.carObjects++);
    return {gpu:extension?gl.getParameter(extension.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),pixelRatio:s.renderer.getPixelRatio(),counts};
  },label==='before');
  for(const [camera,look] of [['chase',0],['cockpit',0],['cockpit',1],['overview',0]]){
    await page.evaluate(({camera,look})=>{const a=window.__avtodrom;a.start('practice');a.scene.cameraMode=camera;window.performanceLook=look;window.performanceFrames=[];},{camera,look});
    await page.waitForTimeout(1800);
    await page.evaluate(()=>{window.performanceFrames=[];});
    await page.waitForFunction(()=>window.performanceFrames.length>=120,null,{timeout:120000});
    const result=await page.evaluate(()=>{
      const rows=window.performanceFrames.slice(0,120),mean=values=>values.reduce((a,b)=>a+b,0)/values.length,sorted=rows.map(r=>r.renderMs).sort((a,b)=>a-b);
      return {fps:1000*(rows.length-1)/(rows.at(-1).time-rows[0].time),renderMs:mean(rows.map(r=>r.renderMs)),p95RenderMs:sorted[Math.floor(sorted.length*.95)],matrixMs:mean(rows.map(r=>r.matrixMs)),passes:mean(rows.map(r=>r.passes.length)),calls:mean(rows.map(r=>r.passes.reduce((sum,p)=>sum+p.calls,0))),triangles:mean(rows.map(r=>r.passes.reduce((sum,p)=>sum+p.triangles,0)))};
    });
    summary.scenarios.push({camera,look,...result});
    // Fixed simulation and camera pose for before/after image comparison.
    const capture=await page.evaluate(({camera,look})=>{const a=window.__avtodrom;a.pause();a.vehicle.reset({x:-58,z:-30},0);a.scene.resetMotion();a.scene.cameraMode=camera;for(let i=0;i<3;i++)a.scene.render(a.vehicle,1,0,false,look,1);return a.scene.renderer.domElement.toDataURL('image/png').split(',')[1];},{camera,look});
    // Capture the actual framebuffer before presentation clears it, without
    // the pause dialog/backdrop obscuring small surface or shadow differences.
    await writeFile(`${directory}/${label}-${camera}-${look}.png`,Buffer.from(capture,'base64'));
  }
  if(label!=='before'&&existsSync(`${directory}/before.json`)){
    const baseline=JSON.parse(await readFile(`${directory}/before.json`,'utf8'));
    summary.comparisons=[];
    for(const scenario of summary.scenarios){
      const previous=baseline.scenarios.find(row=>row.camera===scenario.camera&&row.look===scenario.look);
      assert.equal(scenario.passes,previous.passes,'Every visible mirror still updates every frame');
      assert.equal(scenario.triangles,previous.triangles,'All original triangle detail is retained');
      assert(scenario.calls<previous.calls,'Shadow batching reduces draw submissions');
      const name=`${scenario.camera}-${scenario.look}`;
      const before=await sharp(`${directory}/before-${name}.png`).removeAlpha().raw().toBuffer();
      const after=await sharp(`${directory}/${label}-${name}.png`).removeAlpha().raw().toBuffer();
      assert.equal(before.length,after.length,'Comparison viewports match');
      let changed=0,error=0;
      for(let i=0;i<before.length;i+=3){let maximum=0;for(let c=0;c<3;c++){const delta=Math.abs(before[i+c]-after[i+c]);error+=delta;maximum=Math.max(maximum,delta);}if(maximum>8)changed++;}
      const image={pixelsChangedAbove8:changed,meanChannelDifference:error/before.length};
      assert(changed/(before.length/3)<.0005,'Rendered views retain their visual quality');
      summary.comparisons.push({camera:scenario.camera,look:scenario.look,drawCallsSaved:previous.calls-scenario.calls,fpsChangePercent:100*(scenario.fps/previous.fps-1),image});
    }
  }
  if(label!=='before'){
    summary.animatedShadows=[];
    for(const [steer,spin]of [[0,0],[.4,1.7],[-.5,4.1]]){
      const captures=await page.evaluate(async({steer,spin})=>{
        const T=await import('/node_modules/three/build/three.module.js'),a=window.__avtodrom,s=a.scene;
        a.pause();a.vehicle.reset({x:-58,z:-30},0);s.resetMotion();s.render(a.vehicle,1,0,false,0,1);
        for(const w of s.wheels){w.pivot.rotation.y=w.front?steer:0;w.spin.rotation.x=spin;}
        if(s.steering)s.steering.rotateZ(steer*10);
        const stalk=s.car.getObjectByName('COBALT_INDICATOR_STALK');if(stalk)stalk.rotateZ(steer);
        s.scene.updateMatrixWorld(true);
        const camera=new T.PerspectiveCamera(48,innerWidth/innerHeight,.06,200);
        camera.position.copy(s.car.localToWorld(new T.Vector3(0,8,-.1)));camera.lookAt(s.car.localToWorld(new T.Vector3(0,-.5,0)));
        const captures=[];
        for(const layer of [0,3]){s.sun.shadow.camera.layers.set(layer);s.renderer.render(s.scene,camera);captures.push(s.renderer.domElement.toDataURL('image/png').split(',')[1]);}
        return captures;
      },{steer,spin});
      const pixels=[];
      for(const [i,capture]of captures.entries()){
        const buffer=Buffer.from(capture,'base64');await writeFile(`${directory}/${label}-shadow-${steer}-${i}.png`,buffer);
        pixels.push(await sharp(buffer).removeAlpha().raw().toBuffer());
      }
      let changed=0;for(let i=0;i<pixels[0].length;i+=3)if([0,1,2].some(c=>Math.abs(pixels[0][i+c]-pixels[1][i+c])>8))changed++;
      assert(changed/(pixels[0].length/3)<.0005,'Wheel and steering motion retain the original shadow image');
      summary.animatedShadows.push({steer,spin,pixelsChangedAbove8:changed});
    }
  }
  await writeFile(`${directory}/${label}.json`,JSON.stringify(summary,null,2));
  console.log(JSON.stringify(summary,null,2));
  if(errors.length)process.exitCode=1;
}finally{await browser.close();}
