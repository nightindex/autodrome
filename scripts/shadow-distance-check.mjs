// Fixed world-space tree view while the car approaches: exposes shadow pop-in
// without confusing it with camera movement, changing wind or texture loading.
import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const phase=process.argv[2]??'after',directory='test-results/shadow-distance';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const check=(name,value)=>{assert(value,name);checks.push(name);};
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.scene.prepared,null,{timeout:60000});
  const setup=await page.evaluate(async phase=>{
    const T=await import('/node_modules/three/build/three.module.js'),a=window.__avtodrom,s=a.scene,v=a.vehicle;
    a.start('practice');a.pause();s.setQuality('high');s.setGoal({x:0,z:0},false);
    if(phase==='before'&&s.distantSun)s.distantSun.visible=false;
    v.reset({x:22,z:0},0);for(let i=0;i<120;i++)v.update(1/60,{down:()=>false},true);v.time=2;s.resetMotion();
    window.shadowDistance={render:s.render.bind(s),base:v.body.translation()};s.render=()=>{};
    const camera=new T.PerspectiveCamera(45,innerWidth/innerHeight,.06,200);camera.position.set(24,16,72);camera.lookAt(24,0,55);window.shadowDistance.camera=camera;
    const gl=s.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
    return {gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),dpr:devicePixelRatio};
  },phase);
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  const approaches=[];
  for(const z of [0,12,24,36,44]){
    for(const shadows of [true,false]){
      await page.evaluate(({z,shadows})=>{
        const a=window.__avtodrom,s=a.scene,r=s.renderer,p=window.shadowDistance;
        a.vehicle.body.setTranslation({...p.base,z},true);s.resetMotion();
        s.sun.shadow.intensity=shadows?1:0;if(s.distantSun)s.distantSun.shadow.intensity=shadows?1:0;
        p.render(a.vehicle,1,0,false,0);
        const auto=r.shadowMap.autoUpdate;r.shadowMap.autoUpdate=false;
        r.setViewport(0,0,innerWidth,innerHeight);r.render(s.scene,p.camera);r.shadowMap.autoUpdate=auto;
      },{z,shadows});
      await page.locator('canvas').first().screenshot({path:`${directory}/${phase}-${z}-${shadows?'shadow':'clear'}.png`});
    }
    const dark=await sharp(`${directory}/${phase}-${z}-shadow.png`).removeAlpha().raw().toBuffer();
    const clear=await sharp(`${directory}/${phase}-${z}-clear.png`).removeAlpha().raw().toBuffer();
    let pixels=0,strength=0;
    for(let i=0;i<dark.length;i+=3){const difference=(clear[i]+clear[i+1]+clear[i+2]-dark[i]-dark[i+1]-dark[i+2])/3;if(difference>8){pixels++;strength+=difference;}}
    const distantMatrix=await page.evaluate(()=>window.__avtodrom.scene.distantSun?.shadow.matrix.elements);
    approaches.push({carZ:z,shadowPixels:pixels,strength,distantMatrix});
  }
  const performanceCases=[];
  for(const [mode,look]of [['cockpit',0],['cockpit',1],['chase',0]]){
    const stats=await page.evaluate(async({mode,look})=>{
      const a=window.__avtodrom,s=a.scene,v=a.vehicle,r=s.renderer,p=window.shadowDistance,rows=[];
      v.body.setTranslation(p.base,true);s.resetMotion();s.cameraMode=mode;s.sun.shadow.intensity=1;if(s.distantSun)s.distantSun.shadow.intensity=1;
      for(let i=0;i<72;i++){
        await new Promise(resolve=>requestAnimationFrame(resolve));r.info.autoReset=false;r.info.reset();
        const start=performance.now();p.render(v,1/60,0,false,look);const ms=performance.now()-start;
        if(i>=24)rows.push({ms,calls:r.info.render.calls,triangles:r.info.render.triangles});
      }
      r.info.autoReset=true;
      const sorted=rows.map(r=>r.ms).sort((a,b)=>a-b),mean=key=>rows.reduce((sum,row)=>sum+row[key],0)/rows.length;
      return {renderMs:mean('ms'),p95RenderMs:sorted[Math.floor(sorted.length*.95)],calls:mean('calls'),triangles:mean('triangles'),pixelRatio:r.getPixelRatio(),nearResolution:s.sun.shadow.mapSize.x,distantResolution:s.distantSun?.shadow.mapSize.x};
    },{mode,look});performanceCases.push({mode,look,...stats});
  }
  const qualityStates=await page.evaluate(()=>{
    const a=window.__avtodrom,s=a.scene,states=[];
    for(const quality of ['low','medium','high']){s.setQuality(quality);window.shadowDistance.render(a.vehicle,1,0,false,0);states.push({quality,enabled:s.renderer.shadowMap.enabled,near:s.sun.castShadow,distant:s.distantSun?.castShadow});}
    return states;
  });
  let nearComparison;
  if(phase==='after'&&existsSync(`${directory}/before-44-shadow.png`)){
    const old=await sharp(`${directory}/before-44-shadow.png`).removeAlpha().raw().toBuffer(),current=await sharp(`${directory}/after-44-shadow.png`).removeAlpha().raw().toBuffer();
    let changed=0,error=0;
    for(let i=0;i<old.length;i+=3){let maximum=0;for(let c=0;c<3;c++){const difference=Math.abs(old[i+c]-current[i+c]);error+=difference;maximum=Math.max(maximum,difference);}if(maximum>8)changed++;}
    nearComparison={changedPixelsAbove8:changed,meanAbsoluteError:error/old.length};
  }
  const report={setup,approaches,performanceCases,qualityStates,nearComparison,errors,checks};await writeFile(`${directory}/${phase}.json`,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(phase==='after'){
    check('Tree shadows exist before the car approaches the old 48 m map',approaches[0].shadowPixels>1500);
    check('Approaching does not grow shadows from an empty distant view',approaches.every(r=>r.shadowPixels>approaches.at(-1).shadowPixels*.7));
    check('Near resolution stays 2048 at unchanged display resolution',performanceCases.every(r=>r.nearResolution===2048&&r.pixelRatio===1));
    check('Distant coverage stays fixed as the car approaches',approaches.every(r=>r.distantMatrix?.every((n,i)=>Math.abs(n-approaches[0].distantMatrix[i])<1e-10)));
    check('Quality switching disables both maps on low and restores them on medium/high',qualityStates.every(r=>[r.enabled,r.near,r.distant].every(flag=>flag===(r.quality!=='low'))));
    if(nearComparison)check('Close shadows retain their original image',nearComparison.meanAbsoluteError<.01&&nearComparison.changedPixelsAbove8<100);
    check('No browser or shader errors',errors.length===0);
  }
  await writeFile(`${directory}/${phase}.json`,JSON.stringify(report,null,2));
}finally{await browser.close();}
