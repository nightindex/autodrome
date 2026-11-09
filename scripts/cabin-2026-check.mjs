import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const phase=process.argv[2]??'after',directory='test-results/cabin-2026';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[];
page.on('pageerror',e=>errors.push(e.message));
const check=(name,passed)=>{checks.push({name,passed:!!passed});assert(passed,name);};
try{
  await page.addInitScript(()=>localStorage.setItem('avtodrom.settings.v1',JSON.stringify({language:'ru'})));
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  const title=await page.title(),menu=await page.locator('.car-caption').innerText();
  await page.click('#practice');await page.keyboard.press('Escape');
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),a=window.__avtodrom,s=a.scene,v=a.vehicle;
    v.reset({x:-20,z:40.5},0);for(let i=0;i<180;i++)v.update(1/60,{down:()=>false},true);
    s.guide.visible=s.goal.visible=false;s.cameraMode='cockpit';const production=s.render.bind(s);
    window.cabin2026Pose={eye:[.21,.30,.22],target:[0,.015,.75],fov:51};
    s.render=(...args)=>{
      production(...args);const p=window.cabin2026Pose;if(!p)return;
      s.camera.clearViewOffset();s.camera.near=.025;s.camera.fov=p.fov;s.camera.updateProjectionMatrix();
      s.camera.position.copy(s.car.localToWorld(new T.Vector3(...p.eye)));s.camera.up.set(0,1,0).applyQuaternion(s.car.quaternion);
      s.camera.lookAt(s.car.localToWorld(new T.Vector3(...p.target)));s.camera.updateMatrixWorld();s.renderer.render(s.scene,s.camera);
    };
  });
  const capture=async(name,pose,viewport={width:1440,height:960})=>{
    await page.setViewportSize(viewport);await page.evaluate(p=>{window.cabin2026Pose=p;},pose);await page.waitForTimeout(150);
    await page.screenshot({path:`${directory}/${phase}-${name}.png`});
  };
  await capture('centre',{eye:[.21,.30,.22],target:[0,.015,.75],fov:51});
  await capture('photo-angle',{eye:[.035,.29,.22],target:[0,.02,.75],fov:55},{width:680,height:1040});
  await capture('manual-cabin',{eye:[0,.59,-.06],target:[.02,-.08,.86],fov:65});
  await capture('driver',null);
  if(phase==='after'){
    check('Site identifies the 2026 manual Cobalt',/2026/.test(title)&&/2026/.test(menu)&&/MT/.test(menu));
    const inspect=()=>page.evaluate(async()=>{
      const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene;
      const panel=s.car.getObjectByName('COBALT_ExamDisplay'),m=panel?.material;
      const center=panel?new T.Box3().setFromObject(panel).getCenter(new T.Vector3()):null;
      const eye=s.car.localToWorld(new T.Vector3(.21,.30,.22));
      const hit=center?new T.Raycaster(eye,center.clone().sub(eye).normalize()).intersectObject(s.car,true)[0]:null;
      return {content:JSON.parse(s.examDisplay.lastDisplay),version:m?.map?.version,canvas:!!m?.map?.image?.getContext,
        unlit:m?.isMeshBasicMaterial,flipY:m?.map?.flipY,toneMapped:m?.toneMapped,
        visible:hit?.object===panel,engine:window.__avtodrom.vehicle.drivetrain.engine};
    });
    const before=await inspect();
    check('Photo-fitted monitor is visible, upright and legible without the engine',before.canvas&&before.unlit&&before.flipY===false&&before.toneMapped===false&&before.visible&&!before.engine);
    check('Pause reflects real state without a fabricated pass or candidate identity',before.content.status==='Пауза'&&before.content.events.length===0);
    await page.waitForTimeout(250);const held=await inspect();
    check('Paused content does not upload an unchanged texture each frame',held.version===before.version&&held.content.time===before.content.time);
    await page.evaluate(async()=>{
      const a=window.__avtodrom,{ruleById}=await import('/src/data/rules.ts'),r=ruleById(5);
      a.start('exam');a.pause();const e=a.engine();e.time=12;e.score=r.points;
      e.events=[{ruleId:r.id,points:r.points,time:10,exercise:e.exercise,key:'monitor-test'}];
    });
    await page.waitForTimeout(150);const scored=await inspect();
    check('Actual exam time, penalty total and rule text reach the monitor',scored.content.time==='00:12'&&scored.content.points==='5'&&scored.content.events[0].text.includes('поворота'));
    await page.evaluate(()=>window.__avtodrom.resume());await page.waitForTimeout(150);
    const running=await inspect();check('Exam running state has no premature pass',running.content.status==='Экзамен идёт');
    await capture('exam-monitor',{eye:[.035,.29,.22],target:[0,.02,.75],fov:55},{width:680,height:1040});
    await page.evaluate(()=>{const a=window.__avtodrom;a.engine().status='passed';});await page.waitForFunction(()=>window.__avtodrom.snapshot().state==='result');
    await page.waitForTimeout(150);check('Only an actual successful engine result shows Сдан',(await inspect()).content.status==='Сдан');
    await capture('passed',{eye:[.21,.30,.22],target:[0,.015,.75],fov:51});
    await page.evaluate(()=>{const a=window.__avtodrom;a.start('exam');a.engine().status='failed';});await page.waitForFunction(()=>window.__avtodrom.snapshot().state==='result');
    await page.waitForTimeout(150);check('Failed result shows Не сдан',(await inspect()).content.status==='Не сдан');
    await page.evaluate(()=>document.querySelector('#lang').click());await page.waitForTimeout(150);
    check('Monitor follows the actual Uzbek language setting',(await inspect()).content.status==='Topshirilmadi');
    await capture('uzbek',{eye:[.21,.30,.22],target:[0,.015,.75],fov:51});
  }
  check('No browser errors',errors.length===0);
  await writeFile(`${directory}/${phase}-report.json`,JSON.stringify({title,menu,checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
