import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const phase=process.argv[2]??'after',directory='test-results/startup';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,condition)=>{assert(condition,name);checks.push(name);};
try{
  const network=await page.context().newCDPSession(page);await network.send('Network.enable');await network.send('Network.setCacheDisabled',{cacheDisabled:true});
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  const startup=await page.evaluate(()=>{
    const a=window.__avtodrom,s=a.scene,render=s.render.bind(s);
    window.startupFrames=[];
    s.render=(...args)=>{const time=performance.now();render(...args);window.startupFrames.push({time,renderMs:performance.now()-time,fps:s.fps,programs:s.renderer.info.programs.length});};
    const result={readyMs:performance.now(),fps:s.fps,prepared:s.prepared,programs:s.renderer.info.programs.length,time:a.vehicle.time};
    a.start('practice');s.cameraMode='cockpit';return {...result,firstDrivingFps:s.fps};
  });
  await page.waitForFunction(()=>window.startupFrames.length>=100);
  const rows=await page.evaluate(()=>window.startupFrames.slice(0,100));
  if(phase==='after'){
    check('Graphics are prepared before controls become available',startup.prepared===true);
    check('Warmup leaves physics at its reset time',startup.time===0);
    check('Starting a drive discards the loading/menu FPS window',startup.firstDrivingFps===0);
    check('A full real-time driving window produces a measured FPS',rows.some(r=>r.fps>0));
    check('Initial driving does not compile a new shader program',rows.every(r=>r.programs<=startup.programs));
    const resumed=await page.evaluate(()=>{const a=window.__avtodrom;a.pause();a.scene.fps=999;a.resume();return a.scene.fps;});
    check('Resume discards a stale FPS window',resumed===0);
    check('No browser errors',errors.length===0);
  }
  const summary={startup,first10:rows.slice(0,10),firstFps:rows.find(r=>r.fps>0)?.fps,errors,checks};
  await writeFile(`${directory}/${phase}.json`,JSON.stringify({...summary,rows},null,2));console.log(JSON.stringify(summary,null,2));
}finally{await browser.close();}
