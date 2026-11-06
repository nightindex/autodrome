import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const directory='test-results/rear-lights';await mkdir(directory,{recursive:true});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.click('#practice');await page.waitForTimeout(700);await page.keyboard.press('KeyB');await page.keyboard.press('KeyI');
  await page.keyboard.down('KeyS');await page.waitForTimeout(650);
  const keyboardBrake=await page.evaluate(()=>({state:window.__avtodrom.snapshot().state,brake:window.__avtodrom.snapshot().telemetry.brake,glows:window.__avtodrom.scene.car.children.filter(n=>n.name==='rear-brake-glow'&&n.visible).length}));
  await page.keyboard.up('KeyS');assert(keyboardBrake.brake>.5&&keyboardBrake.glows===2,JSON.stringify(keyboardBrake));
  await page.keyboard.press('KeyQ');const blinking=[];
  for(let i=0;i<8;i++){await page.waitForTimeout(120);blinking.push(await page.evaluate(()=>({indicator:window.__avtodrom.snapshot().telemetry.indicator,on:window.__avtodrom.scene.car.children.some(n=>n.name==='rear-left-glow'&&n.visible),rightOn:window.__avtodrom.scene.car.children.some(n=>n.name==='rear-right-glow'&&n.visible)})));}
  assert(blinking.every(s=>s.indicator==='left'&&!s.rightOn));assert(blinking.some(s=>s.on)&&blinking.some(s=>!s.on),'Keyboard turn signal must visibly blink during normal simulation');
  await page.keyboard.press('KeyQ');await page.keyboard.down('ShiftLeft');await page.keyboard.press('KeyR');await page.keyboard.up('ShiftLeft');await page.waitForTimeout(300);
  const keyboardReverse=await page.evaluate(()=>({gear:window.__avtodrom.snapshot().telemetry.gear,glows:window.__avtodrom.scene.car.children.filter(n=>n.name==='rear-reverse-glow'&&n.visible).length}));
  assert(keyboardReverse.gear===-1&&keyboardReverse.glows===2,JSON.stringify(keyboardReverse));await page.keyboard.press('KeyN');await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(()=>{const s=window.__avtodrom.scene;s.guide.visible=s.goal.visible=false;});await page.waitForTimeout(500);
  const regions=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
    return ['brake','high-stop','reverse','left','right'].flatMap(signal=>s.car.children.filter(n=>n.name===`rear-${signal}-glow`).map(n=>{
      const p=n.getWorldPosition(new T.Vector3()).project(s.camera);return {signal,side:Math.sign(n.position.x),left:Math.round((p.x+1)*innerWidth/2)-16,top:Math.round((1-p.y)*innerHeight/2)-20,width:32,height:32};
    }));
  });assert.equal(regions.length,7,'Two brake, two reverse, two indicators and the high stop lamp must match their real lenses');
  const results=[];
  for(const quality of ['medium','low']){
    await page.evaluate(q=>window.__avtodrom.scene.setQuality(q),quality);
    const states={};
    for(const state of ['tail','brake','stalled-brake','reverse','brake-reverse','stalled-reverse','left-off','left-on','right-on','hazards','brake-left']){
      await page.evaluate(state=>{
        const v=window.__avtodrom.vehicle,d=v.drivetrain;d.engine=!state.startsWith('stalled-');d.gear=state.includes('reverse')?-1:0;d.brake=state.includes('brake')?1:0;
        v.time=state==='left-off'?.55:.2;v.indicator=state.includes('left')?'left':state==='right-on'?'right':'off';v.hazards=state==='hazards';
      },state);await page.waitForTimeout(180);
      const frame=await page.screenshot({path:`${directory}/${quality}-${state}.png`}),pixels=[];
      for(const region of regions){
        const {signal,side,...box}=region,{data,info}=await sharp(frame).extract(box).removeAlpha().raw().toBuffer({resolveWithObject:true});let red=0,amber=0,white=0;
        for(let i=0;i<data.length;i+=info.channels){const [r,g,b]=[data[i],data[i+1],data[i+2]];if(r>240&&r>g*1.5&&r>b*1.5)red++;if(r>230&&g>75&&g<r*.92&&b<140)amber++;if(r>230&&g>230&&b>230)white++;}
        pixels.push({signal,side,red,amber,white});
      }
      const glows=await page.evaluate(()=>window.__avtodrom.scene.car.children.filter(n=>n.isSprite&&n.name.startsWith('rear-')).map(n=>({name:n.name,visible:n.visible,opacity:n.material.opacity,depthTest:n.material.depthTest})));
      states[state]={pixels,glows};
    }
    const count=(state,signal,color)=>states[state].pixels.filter(p=>p.signal===signal).reduce((sum,p)=>sum+p[color],0);
    assert(count('brake','brake','red')>count('tail','brake','red')+20,'Braking must visibly brighten both rear lamps in chase view');
    assert(count('stalled-brake','brake','red')>count('tail','brake','red')+20,'Brake visibility must survive an engine stall');
    for(const state of ['brake','stalled-brake','brake-reverse'])assert(count(state,'high-stop','red')>count('tail','high-stop','red')+5,`${quality}: the high stop lamp must visibly light only when braking (${state})`);
    for(const side of [-1,1])for(const state of ['reverse','brake-reverse']){
      const white=key=>states[key].pixels.find(p=>p.signal==='reverse'&&p.side===side).white;
      assert(white(state)>white('tail')+5,`${quality}: both reverse lamps must shine white in R, including under braking`);
    }
    assert(states['stalled-reverse'].glows.filter(g=>g.name==='rear-reverse-glow').every(g=>!g.visible),'Reverse lamps switch off with engine power');
    assert(states.reverse.glows.find(g=>g.name==='rear-high-stop-glow').visible===false,'Reverse alone must leave the high stop lamp off');
    assert(count('left-on','left','amber')>count('left-off','left','amber')+10,`Left indicator must flash amber rather than disappear in daylight: ${JSON.stringify(states['left-on'].pixels)}`);
    assert(count('right-on','right','amber')>count('tail','right','amber')+10);
    assert(count('brake-left','left','amber')>count('tail','left','amber')+10,'Braking must not hide the turn signal');
    assert(states['left-off'].glows.every(g=>!g.visible));assert(states['left-on'].glows.filter(g=>g.visible).every(g=>g.name==='rear-left-glow'));
    assert(states.hazards.glows.filter(g=>g.visible).length===2);assert(states.brake.glows.every(g=>g.depthTest));results.push({quality,states});
  }
  const frontLeak=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,camera=new T.PerspectiveCamera(52,1,.1,50);
    camera.position.copy(s.car.localToWorld(new T.Vector3(0,1,5)));camera.lookAt(s.car.getWorldPosition(new T.Vector3()));camera.updateMatrixWorld(true);
    s.renderer.render(s.scene,camera);return s.car.children.filter(n=>n.isSprite&&n.visible&&n.name.startsWith('rear-')).map(n=>n.material.opacity);
  });assert(frontLeak.every(v=>v===0),'Rear halos must not shine through the car towards a front camera');
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({keyboardBrake,keyboardReverse,blinking,regions,results,frontLeak,errors},null,2));
  console.log(JSON.stringify({keyboardBrake,keyboardReverse,blinkOn:blinking.some(s=>s.on),blinkOff:blinking.some(s=>!s.on),qualities:results.map(r=>r.quality),errors}));
}catch(error){console.error(JSON.stringify({errors}));throw error;}finally{await browser.close();}
