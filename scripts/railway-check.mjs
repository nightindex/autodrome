import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const directory='test-results/railway';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist','--enable-unsafe-swiftshader']});
const errors=[],checks=[];let report;
const check=(name,condition)=>{assert(condition,name);checks.push(name);};
try{
  const page=await browser.newPage({viewport:{width:1440,height:960}});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.AVTODROM_URL??'http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  const fixture=await page.evaluate(async()=>{
    const app=window.__avtodrom;app.start('practice',7);app.pause();
    const T=await import('/node_modules/three/build/three.module.js');
    const {railwayCrossing:c,railwayRailCenters:offsets,railwaySleeperCenters,railwayMarkings}=await import('/src/data/railway.ts');
    const {vehicleConfig}=await import('/src/data/vehicle.ts'),{ExamEngine}=await import('/src/simulation/exam.ts');
    const source=await fetch('/src/simulation/vehicle.ts').then(r=>r.text()),R=(await import(source.match(/import RAPIER from ["']([^"']+)["']/)[1])).default;
    const v=app.vehicle,s=app.scene,idle={down:()=>false};v.update(1/60,idle,true);s.world.group.updateMatrixWorld(true);s.setCurbStyle('white');
    const crossing=s.world.group.getObjectByName('railway-crossing'),railMeshes=offsets.map((_,i)=>crossing.getObjectByName(`railway-rail-head-${i}`));
    const physicsAt=(x,z)=>{
      const hit=v.world.castRay(new R.Ray({x,y:2,z},{x:0,y:-1,z:0}),3,true,undefined,undefined,undefined,v.body,collider=>v.traversableSurfaces.has(collider.handle));
      return hit?{height:2-hit.timeOfImpact,handle:hit.collider.handle}:null;
    };
    const visualAt=(x,z)=>new T.Raycaster(new T.Vector3(x,2,z),new T.Vector3(0,-1,0),0,3).intersectObject(crossing,true)[0]?.point.y;
    const railSurfaces=offsets.map((z,i)=>{const p=physicsAt(c.center.x,c.center.z+z);return {index:i,offset:z,physical:p.height,visual:visualAt(c.center.x,c.center.z+z),handle:p.handle};});
    const deckX=c.center.x+.16,deck={physical:physicsAt(deckX,c.center.z).height,visual:visualAt(deckX,c.center.z)};
    const paintMeshes=['paint-lane-east-perimeter','course-edge-lines'].map(name=>s.world.group.getObjectByName(name));
    const paintClear=[c.center.x,c.center.x+c.length/2-.235].every(x=>[-.796,0,.796].every(z=>new T.Raycaster(new T.Vector3(x,1,c.center.z+z),new T.Vector3(0,-1,0),0,2).intersectObjects(paintMeshes).length===0));
    const divider=s.world.group.getObjectByName('paint-lane-east-perimeter');
    const dividerOpen=[-2.5,-1.2,1.2,2.5].every(z=>new T.Raycaster(new T.Vector3(c.center.x,1,c.center.z+z),new T.Vector3(0,-1,0)).intersectObject(divider).length===0);
    const bars=[s.world.group.getObjectByName('paint-railway-stop-line'),s.world.group.getObjectByName('paint-lane-railway-return-limit')];
    const connectedBars=bars.every((bar,i)=>{
      const z=i===0?railwayMarkings.approachStopZ:railwayMarkings.returnStopZ,start=i===0?railwayMarkings.dividerX:c.center.x-c.length/2+.235,end=i===0?c.center.x+c.length/2-.235:railwayMarkings.dividerX;
      for(let x=start+.005;x<end;x+=.1)if(!new T.Raycaster(new T.Vector3(x,1,z),new T.Vector3(0,-1,0)).intersectObject(bar).length)return false;
      return true;
    });
    const outsideClear=[-1.2,-.95,.95,1.2].every(z=>physicsAt(deckX,c.center.z+z)===null&&visualAt(deckX,c.center.z+z)===undefined);
    const railHandles=railSurfaces.map(r=>r.handle);let state;
    const sample=()=>{
      const p=v.body.translation(),q=v.body.rotation(),vel=v.body.linvel();
      const wheels=Array.from({length:4},(_,i)=>({index:i,ground:v.controller.wheelGroundObject(i)?.handle??null,contact:v.controller.wheelIsInContact(i),length:v.controller.wheelSuspensionLength(i),point:v.controller.wheelContactPoint(i)}));
      return {frame:state.frame,time:state.frame/60,position:p,velocity:vel,up:1-2*(q.x*q.x+q.z*q.z),pitch:q.x,speed:v.telemetry().speed,collision:v.collision,wheels};
    };
    const setup=({kmh,direction=-1,reverse=false,angle=0,lane=59.5})=>{
      const startZ=c.center.z-direction*6.5,travelYaw=(direction<0?Math.PI:0)+angle,dx=Math.sin(travelYaw),dz=Math.cos(travelYaw),startX=lane-6.5*dx;
      v.reset({x:startX,z:startZ},travelYaw+(reverse?Math.PI:0));
      for(let i=0;i<90;i++)v.update(1/60,idle,true);v.drivetrain.handbrake=false;
      state={frame:0,direction,kmh,reverse,angle,lane,initialHeight:v.body.translation().y,samples:[],railContacts:[new Set(),new Set()],exam:new ExamEngine('practice')};
      v.body.setLinvel({x:dx*kmh/3.6,y:0,z:dz*kmh/3.6},true);state.samples.push(sample());return sample();
    };
    const advance=()=>{
      v.update(1/60,idle,true);state.frame++;state.exam.update(v.telemetry(),{},1/60);const row=sample();state.samples.push(row);
      for(const wheel of row.wheels){const rail=railHandles.indexOf(wheel.ground);if(wheel.contact&&rail!==-1)state.railContacts[wheel.index<2?0:1].add(rail);}
      return row;
    };
    const clear=()=>v.telemetry().wheels.every(w=>state.direction*(w.z-c.center.z)>c.deckHalfSpan+vehicleConfig.wheelRadius);
    const result=()=>({kmh:state.kmh,direction:state.direction,reverse:state.reverse,angle:state.angle,lane:state.lane,crossed:clear(),railContacts:state.railContacts.map(s=>s.size),collision:state.samples.some(s=>s.collision),collisionPenalties:state.exam.events.filter(e=>e.ruleId===30).length,peakRise:Math.max(...state.samples.map(s=>s.position.y))-state.initialHeight,peakVerticalSpeed:Math.max(...state.samples.map(s=>Math.abs(s.velocity.y))),maxSuspensionSpeed:Math.max(...state.samples.slice(1).flatMap((s,index)=>s.wheels.map((w,i)=>Math.abs(w.length-state.samples[index].wheels[i].length)*60))),minUp:Math.min(...state.samples.map(s=>s.up)),finite:state.samples.every(s=>[s.position.x,s.position.y,s.position.z,s.speed,...s.wheels.map(w=>w.length)].every(Number.isFinite)),samples:state.samples});
    window.railwayView={eye:[64,5,-19],target:[57.5,0,-25.25],hideCar:true};const render=s.render.bind(s);
    s.render=(...args)=>{render(...args);s.car.visible=!window.railwayView.hideCar;s.guide.visible=s.goal.visible=false;const pose=window.railwayView;s.camera.clearViewOffset();s.camera.fov=44;s.camera.updateProjectionMatrix();s.camera.position.fromArray(pose.eye);s.camera.lookAt(new T.Vector3(...pose.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};
    window.railwayReview={setup,advance,clear,result,railHandles,render:()=>s.render(v,1/60,v.time,false,0)};
    return {center:c.center,railTop:c.railTop,deckTop:c.deckTop,railSurfaces,deck,paintClear,dividerOpen,connectedBars,outsideClear,width:c.deckHalfSpan*2,sleepers:railwaySleeperCenters.length,supportCount:v.traversableSurfaces.size,obstacleOverlap:[...v.traversableSurfaces].some(h=>v.obstacles.has(h)),sharedSupportSet:v.traversableSurfaces===s.world.traversableSurfaces,headDrawGroups:railMeshes.map(m=>m.geometry.groups.length),deckMeshes:crossing.children.filter(m=>['railway-deck-boards','railway-infill'].includes(m.name)).length};
  });
  const captures=[];
  for(const [name,view]of [
    ['overview',{eye:[64,5,-19],target:[57.5,0,-25.25],hideCar:true}],
    ['rail-close',{eye:[59.4,.35,-23.8],target:[58,.02,-25.25],hideCar:true}],
  ]){
    await page.evaluate(view=>{window.railwayView=view;window.railwayReview.render();},view);await page.screenshot({path:`${directory}/${name}.png`});captures.push(`${directory}/${name}.png`);
  }
  await page.evaluate(()=>{
    window.railwayReview.setup({kmh:8});window.railwayView={eye:[59.5,5,-12],target:[57.5,0,-25.25],hideCar:false};window.railwayReview.render();
  });
  await page.screenshot({path:`${directory}/reference-approach.png`});captures.push(`${directory}/reference-approach.png`);
  const scenarios=await page.evaluate(()=>{
    const h=window.railwayReview,rows=[];
    for(const options of [{kmh:8},{kmh:25},{kmh:45},{kmh:15,reverse:true},{kmh:15,angle:.12},{kmh:15,direction:1,lane:55.5}]){
      h.setup(options);for(let i=0;i<600&&!h.clear();i++)h.advance();rows.push(h.result());
    }return rows;
  });
  await page.evaluate(()=>{
    const h=window.railwayReview;h.setup({kmh:15});
    for(let i=0;i<400;i++){const row=h.advance();if(row.wheels.some(w=>w.index<2&&h.railHandles.includes(w.ground)))break;}
    window.railwayView={eye:[54,2.7,-21],target:[59.5,.4,-25.25],hideCar:false};h.render();
  });
  await page.screenshot({path:`${directory}/front-axle.png`});captures.push(`${directory}/front-axle.png`);
  await page.evaluate(()=>{
    const h=window.railwayReview;for(let i=0;i<300;i++){const row=h.advance();if(row.wheels.some(w=>w.index>=2&&h.railHandles.includes(w.ground)))break;}h.render();
  });
  await page.screenshot({path:`${directory}/rear-axle.png`});captures.push(`${directory}/rear-axle.png`);
  await page.evaluate(()=>{
    const s=window.__avtodrom.scene,original=s.world.group.getObjectByName('railway-crossing'),cutaway=original.clone(true);
    cutaway.name='railway-cutaway-preview';cutaway.position.y=.31;
    for(const name of ['railway-deck-boards','railway-infill','railway-flangeway-0','railway-flangeway-1'])cutaway.getObjectByName(name)?.removeFromParent();
    original.visible=false;s.scene.add(cutaway);
    window.railwayView={eye:[62.8,1.4,-22.2],target:[59,.20,-25.25],hideCar:true};
    const caption=document.createElement('div');caption.id='railway-cutaway-label';caption.textContent='Конструкция переезда · настил скрыт';
    Object.assign(caption.style,{position:'fixed',left:'24px',bottom:'24px',padding:'12px 18px',background:'#f5f5edee',color:'#294338',font:'18px Segoe UI',zIndex:'100'});document.body.append(caption);
    window.railwayReview.render();
  });
  await page.screenshot({path:`${directory}/profile-cutaway.png`});captures.push(`${directory}/profile-cutaway.png`);
  await page.evaluate(()=>{const s=window.__avtodrom.scene;s.scene.remove(s.scene.getObjectByName('railway-cutaway-preview'));s.world.group.getObjectByName('railway-crossing').visible=true;document.querySelector('#railway-cutaway-label').remove();});
  report={fixture,scenarios,captures,errors,checks};
  check('Running CourseWorld registers the two rails and their central infill',fixture.supportCount===3&&fixture.sharedSupportSet&&!fixture.obstacleOverlap);
  check('Reference crossing is narrow, with asphalt directly outside the rails',fixture.outsideClear&&fixture.width>1.6&&fixture.width<1.8);
  check('Both rendered rail crowns coincide with their collision surfaces',fixture.railSurfaces.every(r=>Math.abs(r.physical-r.visual)<.0001&&Math.abs(r.physical-fixture.railTop)<.0001));
  check('Rendered deck agrees with its physical support',Math.abs(fixture.deck.physical-fixture.deck.visual)<.0001&&Math.abs(fixture.deck.physical-fixture.deckTop)<.0001);
  check('Lane and roadside paint do not float across the railway deck',fixture.paintClear);
  check('Video longitudinal divider ends at both stopping bars and the L corners have no gaps',fixture.dividerOpen&&fixture.connectedBars);
  check('Deck slabs are batched and rail material groups stay compact',fixture.deckMeshes===2&&fixture.headDrawGroups.every(n=>n<=6));
  for(const row of scenarios){
    const name=`${row.kmh} km/h ${row.reverse?'reverse':row.direction<0?'northbound':'southbound'} angle ${row.angle}`;
    check(`${name}: both axles contact both railheads and clear the full crossing`,row.crossed&&row.railContacts.every(n=>n===2));
    check(`${name}: stable, finite and no collision penalty`,row.finite&&row.minUp>.95&&!row.collision&&row.collisionPenalties===0);
    check(`${name}: physical suspension response remains modest`,row.peakRise>.008&&row.peakRise<.15&&row.peakVerticalSpeed>.02);
  }
  check('Speed increases the rate of physical suspension travel',scenarios[1].maxSuspensionSpeed>scenarios[0].maxSuspensionSpeed*1.3);
  check('No browser errors',errors.length===0);
  console.log(JSON.stringify({fixture,scenarios:scenarios.map(({samples,...row})=>row),checks,errors},null,2));
}catch(error){report={...report,checks,errors,failure:String(error)};throw error;}
finally{if(report)await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await browser.close();}
