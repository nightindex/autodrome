import {chromium} from 'playwright';import {existsSync} from 'node:fs';import {mkdir,writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';
const phase=process.argv[2]??'after',directory='test-results/mirror-motion';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[],results=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');
 for(const key of ['KeyB','KeyI','Digit1','Space'])await page.keyboard.press(key);await page.keyboard.down('KeyW');await page.waitForFunction(()=>window.__avtodrom.snapshot().telemetry.signedSpeed>1);
 await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,render=s.render.bind(s),draw=s.renderer.render;
  window.mirrorMotion={look:0,rows:[],active:false};s.cameraMode='cockpit';let current;
  s.renderer.render=function(scene,camera){const target=this.getRenderTarget(),index=[s.mirrorTarget,...s.sideTargets].indexOf(target);if(current&&index>=0)current.updates.push(index);return draw.call(this,scene,camera);};
  s.render=(...args)=>{
   const state=window.mirrorMotion;args[4]=state.look;current=state.active?{updates:[],time:performance.now()}:undefined;
   render(...args);
   if(current){const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(s.camera.projectionMatrix,s.camera.matrixWorldInverse));current.visible=[s.cabinMirror,...s.sideMirrors].flatMap((pane,i)=>pane&&frustum.intersectsObject(pane)?[i]:[]);current.speed=window.__avtodrom.snapshot().telemetry.signedSpeed;current.cost=performance.now()-current.time;state.rows.push(current);}current=undefined;
  };
 });
 for(const quality of ['low','medium','high'])for(const [view,look]of [['forward',0],['left',1],['right',-1]]){
  await page.evaluate(({quality,look})=>{const s=window.__avtodrom.scene;s.setQuality(quality);Object.assign(window.mirrorMotion,{look,active:false,rows:[]});},{quality,look});await page.waitForTimeout(180);
  await page.evaluate(()=>window.mirrorMotion.active=true);await page.waitForFunction(()=>window.mirrorMotion.rows.length>=24);
  const rows=await page.evaluate(()=>{window.mirrorMotion.active=false;return window.mirrorMotion.rows.slice(0,24);});
  const missing=rows.reduce((n,r)=>n+r.visible.filter(i=>!r.updates.includes(i)).length,0),wasted=rows.reduce((n,r)=>n+r.updates.filter(i=>!r.visible.includes(i)).length,0);
  results.push({quality,view,frames:rows.length,missing,wasted,visible:[...new Set(rows.flatMap(r=>r.visible))],updates:[0,1,2].map(i=>rows.filter(r=>r.updates.includes(i)).length),meanFrameMs:(rows.at(-1).time-rows[0].time)/(rows.length-1),meanRenderMs:rows.reduce((n,r)=>n+r.cost,0)/rows.length,maxSpeed:Math.max(...rows.map(r=>r.speed))});
 }
 await page.keyboard.up('KeyW');await writeFile(`${directory}/${phase}.json`,JSON.stringify({results,errors},null,2));console.log(JSON.stringify({results,errors},null,2));
 if(phase==='after'){assert(results.every(r=>r.missing===0),'Every visible mirror must update on every driving frame at every quality');assert(results.every(r=>r.wasted===0),'Offscreen mirrors must not consume render passes');assert(results.some(r=>r.maxSpeed>1),'The camera cadence must be tested while driving');assert.equal(errors.length,0);}
}finally{await browser.close();}
