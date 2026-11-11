import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/curb-physics-browser';
await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const check=(name,condition)=>{assert(condition,name);checks.push(name);};
const capture=async(name)=>{
  await page.evaluate(()=>window.__curbPhysical.render());
  await page.screenshot({path:`${directory}/${name}.png`});
};
let report;
try{
  await page.goto(process.env.AVTODROM_URL??'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  const fixture=await page.evaluate(async()=>{
    const a=window.__avtodrom;a.start('practice');a.pause();
    const T=await import('/node_modules/three/build/three.module.js');
    const {ExamEngine}=await import('/src/simulation/exam.ts');
    const {vehicleConfig}=await import('/src/data/vehicle.ts');
    const {courseSigns,courseSignPoint}=await import('/src/data/course-signs.ts');
    const source=await fetch('/src/simulation/vehicle.ts').then(response=>response.text());
    const R=(await import(source.match(/import RAPIER from ["']([^"']+)["']/)[1])).default;
    const v=a.vehicle,s=a.scene,idle={down:()=>false};
    for(let i=0;i<60;i++)v.update(1/60,idle,true);
    // Resolve the current sign placement; historical coordinates can miss a
    // relocated pole and turn an obstacle check into another free curb lane.
    const polePosition=courseSignPoint(courseSigns.find(sign=>sign.id==='start-speed20'));
    const poleCollider=[...v.obstacles].map(handle=>v.world.getCollider(handle)).find(c=>{
      const p=c.translation();return Math.hypot(p.x-polePosition.x,p.z-polePosition.z)<.01;
    });
    const laneX=-25,mesh=s.world.group.getObjectByName('course-curbs');
    const ray=(z,direction)=>new T.Raycaster(new T.Vector3(laneX,.1,z),new T.Vector3(0,0,direction),0,10).intersectObject(mesh)[0];
    const near=ray(40,1).point.z,far=ray(47,-1).point.z;
    const curb=v.world.castRay(new R.Ray({x:laneX,y:2,z:(near+far)/2},{x:0,y:-1,z:0}),3,true).collider;
    let state;
    const sample=()=>{
      const p=v.body.translation(),q=v.body.rotation(),velocity=v.body.linvel(),telemetry=v.telemetry();
      const tyreContacts=[];
      for(let wheel=0;wheel<4;wheel++)v.world.contactPair(v.tyres[wheel],curb,manifold=>{
        for(let i=0;i<manifold.numContacts();i++)if(manifold.contactDist(i)<=0||manifold.contactImpulse(i)>0){tyreContacts.push(wheel);break;}
      });
      const wheels=v.tyres.map((tyre,index)=>{
        const center=tyre.translation(),rotation=tyre.rotation();
        const axle=new T.Vector3(0,1,0).applyQuaternion(rotation);
        const extentZ=vehicleConfig.tyreWidth/2*Math.abs(axle.z)+(vehicleConfig.wheelRadius-.017)*Math.sqrt(Math.max(0,1-axle.z*axle.z));
        return {index,center,extentZ,length:v.controller.wheelSuspensionLength(index),force:v.controller.wheelSuspensionForce(index),ground:v.controller.wheelIsInContact(index),onCurb:v.controller.wheelGroundObject(index)?.handle===curb.handle,solidContact:tyreContacts.includes(index)};
      });
      const fullClear=state.reverse?wheels.every(w=>w.center.z+w.extentZ<near):wheels.every(w=>w.center.z-w.extentZ>far);
      const poleContact=!!poleCollider&&v.impactPatches.has(poleCollider.handle);
      return {frame:state.frame,time:state.frame/60,position:p,rotation:q,velocity,speedKmh:telemetry.speed*3.6,collision:telemetry.collision,poleContact,up:1-2*(q.x*q.x+q.z*q.z),wheels,fullClear,examEpisodes:state.exam.events.filter(event=>event.ruleId===30).length};
    };
    const setup=(scenario)=>{
      const angle=(scenario.angle??0)*Math.PI/180,reverse=!!scenario.reverse;
      v.reset({x:scenario.pole?polePosition.x:laneX,z:reverse?46.5:40},angle);
      for(let i=0;i<60;i++)v.update(1/60,idle,true);
      v.drivetrain.handbrake=false;
      v.body.setLinvel({x:Math.sin(angle)*scenario.kmh/3.6,y:0,z:Math.cos(angle)*scenario.kmh/3.6*(reverse?-1:1)},true);
      state={...scenario,reverse,frame:0,exam:new ExamEngine('practice'),samples:[],braking:false};
      state.samples.push(sample());
      return state.samples[0];
    };
    const advance=(count=1)=>{
      for(let i=0;i<count;i++){
        v.update(1/60,state.braking?{down:action=>action==='brake'||action==='clutch'}:idle,true);
        state.frame++;state.exam.update(v.telemetry(),{},1/60);state.samples.push(sample());
      }
      return state.samples.at(-1);
    };
    const until=(condition,maxFrames=600)=>{
      for(let i=0;i<maxFrames;i++){const current=advance();if(condition(current))return current;}
      return null;
    };
    const result=()=>{
      const samples=state.samples,firstImpact=samples.find(sample=>sample.collision),firstClear=samples.find(sample=>sample.fullClear);
      return {name:state.name,initialKmh:state.kmh,reverse:state.reverse,angle:state.angle??0,firstImpact,firstClear,poleContact:samples.some(sample=>sample.poleContact),peakHeight:Math.max(...samples.map(sample=>sample.position.y)),furthest:state.reverse?Math.min(...samples.map(sample=>sample.position.z)):Math.max(...samples.map(sample=>sample.position.z)),minimumUp:Math.min(...samples.map(sample=>sample.up)),collisionEpisodes:state.exam.events.filter(event=>event.ruleId===30).length,suspensionRange:[0,1,2,3].map(index=>({wheel:index,min:Math.min(...samples.map(sample=>sample.wheels[index].length)),max:Math.max(...samples.map(sample=>sample.wheels[index].length))})),finite:samples.every(sample=>[sample.position.x,sample.position.y,sample.position.z,sample.speedKmh,...sample.wheels.flatMap(wheel=>[wheel.length,wheel.force])].every(Number.isFinite)),final:samples.at(-1)};
    };
    const originalRender=s.render.bind(s);
    s.render=(...args)=>{
      originalRender(...args);s.guide.visible=s.goal.visible=false;
      s.camera.clearViewOffset();s.camera.fov=48;s.camera.updateProjectionMatrix();
      s.camera.position.set(-15.5,3.3,42);s.camera.lookAt(new T.Vector3(-25,1,44.2));
      s.renderer.setScissorTest(false);s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);
    };
    window.__curbPhysical={setup,advance,until,result,sample,render:()=>s.render(v,1/60,v.time,false,0),brake:()=>{state.braking=true;}};
    return {laneX,near,far,top:2-v.world.castRay(new R.Ray({x:laneX,y:2,z:(near+far)/2},{x:0,y:-1,z:0}),3,true).timeOfImpact,physicsHz:60,ccdSubsteps:v.world.maxCcdSubsteps,worldObstacleCount:v.obstacles.size};
  });
  const scenarios=await page.evaluate(()=>{
    const h=window.__curbPhysical,results=[];
    for(const scenario of [{name:'slow',kmh:8},{name:'medium',kmh:25},{name:'fast',kmh:50},{name:'reverse',kmh:50,reverse:true},{name:'oblique',kmh:50,angle:15},{name:'pole-behind-curb',kmh:50,pole:true}]){
      h.setup(scenario);h.advance(600);results.push(h.result());
    }
    return results;
  });
  const stages=[];
  report={date:new Date().toISOString(),fixture,checks,errors,scenarios,stages};
  stages.push({name:'approach',...await page.evaluate(()=>window.__curbPhysical.setup({name:'visual-fast',kmh:50}))});
  await capture('50-approach');
  for(const [name,condition]of [
    ['first-impact','s.collision'],
    ['flight','s.position.y>1.1&&s.wheels.filter(w=>w.ground).length<2'],
    // A fast impact may jump the rear tyres over the concrete. Verify their
    // actual passage instead of requiring a second impact on the same curb.
    ['rear-axle-passage',`s.wheels.filter(w=>w.index>=2).every(w=>w.center.z-w.extentZ>${fixture.far})`],
    ['clearance','s.fullClear'],
  ]){
    const stage=await page.evaluate(({condition})=>window.__curbPhysical.until(new Function('s',`return ${condition}`)),{condition});
    if(!stage)throw new Error(`Actual 50 km/h traversal did not reach ${name}`);
    stages.push({name,...stage});await capture(`50-${name}`);
  }
  const traversal=await page.evaluate(()=>window.__curbPhysical.result());
  const settled=await page.evaluate(()=>{const h=window.__curbPhysical;h.brake();h.advance(240);return h.sample();});
  stages.push({name:'settled-with-brake',...settled});await capture('50-settled');
  report={date:new Date().toISOString(),fixture,checks,errors,scenarios,stages,traversal};
  const slow=scenarios.find(row=>row.name==='slow'),medium=scenarios.find(row=>row.name==='medium'),fast=scenarios.find(row=>row.name==='fast'),reverse=scenarios.find(row=>row.name==='reverse'),oblique=scenarios.find(row=>row.name==='oblique'),pole=scenarios.find(row=>row.name==='pole-behind-curb');
  check('Actual course curb has a 20 cm top and 24 cm width',Math.abs(fixture.top-.2)<.001&&Math.abs(fixture.far-fixture.near-.24)<.001);
  check('Full course physics remains present',fixture.worldObstacleCount>20&&fixture.physicsHz===60);
  check('Slow contact cannot cross the curb',!!slow.firstImpact&&!slow.firstClear&&slow.furthest<fixture.near);
  check('Medium contact reaches the curb without guaranteed crossing',!!medium.firstImpact&&medium.furthest>slow.furthest&&!medium.firstClear);
  check('All four physical tyres cross at 50 km/h',!!fast.firstClear&&fast.firstClear.wheels.every(w=>w.center.z-w.extentZ>fixture.far));
  check('All four physical tyres can cross in reverse',!!reverse.firstClear&&reverse.firstClear.wheels.every(w=>w.center.z+w.extentZ<fixture.near));
  for(const row of [slow,medium,fast,reverse,oblique]){
    if(row.name==='oblique')check('Rolled chassis landing at a separate curb patch counts another impact',!!row.firstImpact&&row.collisionEpisodes>=2);
    else check(`${row.name}: both axles share one impact before clearance`,!!row.firstImpact&&(row.firstClear??row.final).examEpisodes===1);
    check(`${row.name}: impact dissipates speed`,(row.firstClear??row.final).speedKmh<row.initialKmh*.5);
    check(`${row.name}: finite suspension and vehicle state`,row.finite);
  }
  check('Suspension responds during the fast impact',fast.suspensionRange.some(range=>range.max-range.min>.05));
  check('The actual sign pole records contact and blocks the car before clearance',pole.poleContact&&!!pole.firstImpact&&!pole.firstClear&&pole.final.speedKmh<.5);
  check('Staged traversal scores one impact across both axles',traversal.collisionEpisodes===1&&traversal.firstClear.fullClear);
  check('The staged car settles with the service brake',settled.speedKmh<.5);
  check('No browser errors',errors.length===0);
  report={date:new Date().toISOString(),fixture,checks,errors,scenarios,stages,traversal,note:'Actual CourseWorld and production vehicle code at the fixed 60 Hz game step. Coast into curb; service brake is applied only after the staged clearance. Collision is an exam error even when the car crosses. Oblique impacts are not required to stay upright.',obliqueEpisodeNote:'The 15 degree impact rolls the car sideways. After clearing the first local impact patch, the overturned chassis lands about 4.8 m farther along the same curb. That new physical impact counts separately; it is not a duplicate front/rear axle penalty.'};
  console.log(JSON.stringify({checks,fixture,scenarios:scenarios.map(row=>({name:row.name,peakHeight:row.peakHeight,furthest:row.furthest,clearanceFrame:row.firstClear?.frame,clearanceKmh:row.firstClear?.speedKmh,collisionEpisodes:row.collisionEpisodes})),stages:stages.map(({name,frame,position,speedKmh})=>({name,frame,position,speedKmh})),errors},null,2));
}catch(error){
  report={...report,date:new Date().toISOString(),checks,errors,failure:String(error)};
  throw error;
}finally{
  if(report)await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));
  await browser.close();
}
