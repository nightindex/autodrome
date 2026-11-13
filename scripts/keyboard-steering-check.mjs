import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/keyboard-steering';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[],samples=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,ok)=>{assert(ok,name);checks.push(name);};
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.evaluate(async()=>{
    const {Input,defaultBindings}=await import('/src/simulation/input.ts'),{Steering}=await import('/src/simulation/steering.ts');
    window.__avtodrom.start('practice');window.__avtodrom.pause();
    const input=new Input({...defaultBindings}),rack=new Steering();input.enabled=true;
    window.keyboardSteering={input,rack,advance(seconds,kmh=0){for(let i=0;i<Math.round(seconds*120);i++)rack.update(1/120,+input.down('left')-+input.down('right'),kmh/3.6);return {degrees:rack.wheelAngle*180/Math.PI,left:input.down('left'),right:input.down('right')};}};
    document.activeElement?.blur();
  });
  const reset=()=>page.evaluate(()=>{const t=window.keyboardSteering;t.input.clear();t.rack.reset();document.activeElement?.blur();});
  const advance=(seconds,kmh=0)=>page.evaluate(([seconds,kmh])=>window.keyboardSteering.advance(seconds,kmh),[seconds,kmh]);
  for(const [key,sign]of [['KeyA',1],['KeyD',-1],['ArrowLeft',1],['ArrowRight',-1]]){
    await reset();await page.keyboard.down(key);const lock=await advance(.59);await page.keyboard.up(key);
    const centre=await advance(.54);samples.push({key,lock,centre});
    check(`${key} reaches the correct 516.6-degree lock`,Math.abs(lock.degrees-sign*516.6)<1e-7);
    check(`${key} releases and self-centres`,centre.degrees===0&&!centre.left&&!centre.right);
  }
  for(const [from,to,sign]of [['KeyA','KeyD',-1],['ArrowRight','ArrowLeft',1]]){
    await reset();await page.keyboard.down(from);await advance(.59);await page.keyboard.up(from);
    await page.keyboard.down(to);
    const unwound=await page.evaluate(()=>{
      const {rack,input}=window.keyboardSteering,dt=1/240;
      let previousRate,maxRateStep=0,minRate=Infinity;
      for(let i=0;i<92;i++){
        const before=rack.wheelAngle;
        rack.update(dt,+input.down('left')-+input.down('right'),0);
        const rate=Math.abs(rack.wheelAngle-before)*180/Math.PI/dt;
        if(previousRate!==undefined)maxRateStep=Math.max(maxRateStep,Math.abs(rate-previousRate));
        minRate=Math.min(minRate,rate);previousRate=rate;
      }
      return {degrees:rack.wheelAngle*180/Math.PI,maxRateStep,minRate};
    });
    const reversed=await advance(72/120);await page.keyboard.up(to);
    check(`${from} to ${to} unwinds through centre within 0.39 seconds`,sign*unwound.degrees>=0&&Math.abs(unwound.degrees)<10);
    check(`${from} to ${to} crosses centre without a rate jump or pause`,unwound.maxRateStep<75&&unwound.minRate>700);
    check(`${from} to ${to} reaches opposite lock within 0.99 seconds`,Math.abs(reversed.degrees-sign*516.6)<1e-7);
    samples.push({from,to,unwound,reversed});
  }
  await reset();await page.keyboard.down('KeyA');await page.keyboard.down('ArrowLeft');await advance(.2);await page.keyboard.up('KeyA');
  check('Releasing A keeps ArrowLeft held',(await advance(0)).left);
  await page.keyboard.up('ArrowLeft');check('Both left keys release',!(await advance(0)).left);
  await reset();await page.keyboard.down('KeyA');await advance(.2);await page.keyboard.down('ArrowRight');
  const opposed=await advance(.5);check('Opposed directions cancel and centre',opposed.left&&opposed.right&&opposed.degrees===0);
  await page.keyboard.up('KeyA');await page.keyboard.up('ArrowRight');
  await reset();await page.keyboard.down('ArrowLeft');const fast=await advance(1,100);await page.keyboard.up('ArrowLeft');
  check('Arrow input obeys the 100 km/h limit',Math.abs(fast.degrees-75)<1e-7);
  await reset();await page.keyboard.down('ArrowLeft');await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  check('Window blur clears held steering keys',!(await advance(0)).left);await page.keyboard.up('ArrowLeft');
  await page.evaluate(()=>{const field=document.createElement('textarea');field.id='keyboard-test-field';document.querySelector('#modal').append(field);field.focus();});
  await page.keyboard.down('KeyA');await page.keyboard.down('ArrowRight');const typing=await advance(.2);
  check('Typing and arrow navigation in fields do not steer',!typing.left&&!typing.right&&typing.degrees===0);
  await page.keyboard.up('KeyA');await page.keyboard.up('ArrowRight');await page.evaluate(()=>document.querySelector('#keyboard-test-field').remove());
  await reset();await page.evaluate(()=>{window.keyboardSteering.input.bindings.left='KeyJ';});await page.keyboard.down('KeyJ');
  check('Custom primary steering bindings still work',(await advance(.1)).left);await page.keyboard.up('KeyJ');
  await page.evaluate(()=>{window.keyboardSteering.input.bindings.lookLeft='ArrowLeft';});await page.keyboard.down('ArrowLeft');
  check('A remapped arrow belongs only to its explicit action',await page.evaluate(()=>!window.keyboardSteering.input.down('left')&&window.keyboardSteering.input.down('lookLeft')));
  await page.keyboard.up('ArrowLeft');await page.evaluate(()=>{window.keyboardSteering.input.enabled=false;window.keyboardSteering.input.clear();});
  check('No browser errors',errors.length===0);
  await writeFile(`${directory}/report.json`,JSON.stringify({checks,samples,fast,errors},null,2));console.log(JSON.stringify({checks:checks.length,errors,samples,fast},null,2));
}finally{await browser.close();}
