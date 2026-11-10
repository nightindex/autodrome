import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import assert from 'node:assert/strict';

const executablePath=process.env.CHROME_PATH&&existsSync(process.env.CHROME_PATH)?process.env.CHROME_PATH:undefined;
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',error=>errors.push(error.message));
try{
  await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'uz',bindings:{indicatorLeft:'KeyU',indicatorRight:'KeyO'}})));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  for(const [language,guided,defaultLabel] of [['uz','Yo‘nalish bo‘yicha mashq','Standart'],['ru','Практика по маршруту','По умолчанию']]){
    assert((await page.locator('#guided').innerText()).includes(guided));
    await page.click('#exercises');assert.equal(await page.locator('[data-exercise]').count(),12);
    const names=await page.locator('[data-exercise] strong').allTextContents();assert(names.every(name=>name.trim()));
    await page.click('#close');await page.click('#practice');
    assert((await page.locator('#start-help').innerText()).includes('U / O'));
    await page.evaluate(()=>{const a=window.__avtodrom,t=a.vehicle.telemetry();a.engine().update({...t,speed:1,belt:false,collision:true},{},1/60);});
    await page.waitForFunction(()=>document.querySelector('#practice-error-list li'));
    await page.locator('#practice-errors summary').click();
    for(const [width,height] of [[375,667],[844,390]]){
      await page.setViewportSize({width,height});
      const separate=await page.evaluate(()=>{const a=document.querySelector('.exercise-card').getBoundingClientRect(),b=document.querySelector('#start-help').getBoundingClientRect();return a.right<=b.left||a.bottom<=b.top||a.left>=b.right||a.top>=b.bottom;});
      assert(separate,`${language}: free practice and help overlap at ${width}x${height}`);
    }
    await page.setViewportSize({width:1280,height:800});
    await page.evaluate(()=>window.__avtodrom.pause());await page.click('#menu');
    await page.click('#guided');
    await page.waitForFunction(()=>document.querySelector('#coach-action')?.textContent);
    assert.equal(await page.locator('#mode-label').textContent(),guided);
    await page.click('#camera-button');await page.click('#mirrors-button');
    assert.equal(await page.locator('#mirror-default').innerText(),defaultLabel);
    await page.click('#mirror-close');
    await page.evaluate(()=>window.__avtodrom.pause());await page.click('#menu');
    if(language==='uz')await page.click('#lang');
  }
  assert.deepEqual(errors,[]);console.log('Uzbek and Russian menus, exercises, guided coaching and mirror controls passed.');
}finally{await browser.close();}
