import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';

const directory='test-results/powered-curb';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const check=(name,condition)=>{checks.push({name,passed:!!condition});assert(condition,name);};
let report;
try{
  await page.goto(process.env.AVTODROM_URL??'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const a=window.__avtodrom;a.start('practice');a.pause();
    const T=await import('/node_modules/three/build/three.module.js');
    const {curbGeometry}=await import('/src/render/road-geometry.ts');
    const {addStaticObstacle}=await import('/src/simulation/static-collision.ts');
    const {vehicleConfig}=await import('/src/data/vehicle.ts');
    const v=a.vehicle,s=a.scene,edge=v.wheelEdge.bind(v),support=v.wheelSupport.bind(v),surfaceAt=v.surfaceAt;
    // Approach the inner grass island: the outer verge has a fence directly
    // behind a reversing car, which would test that fence instead of recovery.
    const courseCurb=s.world.group.getObjectByName('course-curbs');
    const courseNear=new T.Raycaster(new T.Vector3(-25,.1,27),new T.Vector3(0,0,1),0,5).intersectObject(courseCurb)[0].point.z;
    const courseFar=new T.Raycaster(new T.Vector3(-25,.1,31),new T.Vector3(0,0,-1),0,5).intersectObject(courseCurb)[0].point.z;
    // A separate 10 cm test kerb demonstrates a climb that previously failed.
    // The second fixture uses the untouched actual course and surface mapping.
    const geometry=curbGeometry({black:[[[[-15,-120],[15,-120],[15,-119.76],[-15,-119.76],[-15,-120]]]],yellow:[]},{height:.08,bevel:.02});
    const collider=addStaticObstacle(v.world,geometry,v.obstacles);
    const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({color:0xe4e2d6,roughness:.95}));s.scene.add(mesh);
    const patch=new T.Mesh(new T.PlaneGeometry(30,25),new T.MeshStandardMaterial({color:0x626b70,roughness:1}));
    patch.rotation.x=-Math.PI/2;patch.position.set(0,.015,-120);patch.receiveShadow=true;s.scene.add(patch);
    let state;
    const idle={down:()=>false},power={down:action=>action==='throttle'||(state?.steering&&action==='left')};
    const sample=()=>{
      const p=v.body.translation(),q=v.body.rotation(),t=v.telemetry();
      const wheels=v.tyres.map((tyre,i)=>({position:tyre.translation(),ground:v.controller.wheelIsInContact(i),load:v.controller.wheelSuspensionForce(i)}));
      const chassisContacts=[];
      v.world.contactPairsWith(v.collider,other=>{
        if(!v.obstacles.has(other.handle))return;
        v.world.contactPair(v.collider,other,manifold=>{
          for(let i=0;i<manifold.numContacts();i++)if(manifold.contactDist(i)<=0||manifold.contactImpulse(i)>0){
            chassisContacts.push({normal:manifold.normal(),distance:manifold.contactDist(i),impulse:manifold.contactImpulse(i)});
          }
        });
      });
      const clear=state.course?wheels.every(w=>w.position.z+vehicleConfig.wheelRadius<courseNear):wheels.every(w=>w.position.z-vehicleConfig.wheelRadius>-119.76);
      return {position:p,speed:t.speed,gear:t.gear,rpm:t.rpm,clutch:t.clutch,collision:t.collision,up:1-2*(q.x*q.x+q.z*q.z),wheels,chassisContacts,clear};
    };
    const setup=({course=false,baseline=false,steering=false}={})=>{
      const yaw=course?steering?Math.PI/2:Math.PI+Math.PI/6:0;
      const z=course?steering?courseFar+.85:courseFar+vehicleConfig.wheelbase/2*Math.cos(Math.PI/6)+vehicleConfig.frontTrack/2*Math.sin(Math.PI/6)+vehicleConfig.wheelRadius+.003:-120-vehicleConfig.wheelbase/2-vehicleConfig.wheelRadius-.003;
      v.wheelEdge=baseline?()=>undefined:edge;v.wheelSupport=baseline?()=>undefined:support;v.surfaceAt=course?surfaceAt:()=> 'asphalt';
      v.reset({x:course?-25:0,z},yaw);
      state={course,baseline,steering,courseNear,courseFar,frames:0,peak:0,minimumUp:1,samples:[],cleared:false};
      for(let i=0;i<60;i++)v.update(1/60,idle,true);
      v.drivetrain.handbrake=false;
      for(let i=0;i<(steering?0:240);i++){
        v.body.setLinvel({x:Math.sin(yaw)*.3,y:0,z:Math.cos(yaw)*.3},true);v.update(1/60,idle,true);
        if(v.collision)break;
      }
      v.body.setLinvel({x:0,y:0,z:0},true);v.drivetrain.handbrake=true;
      for(let i=0;i<60;i++)v.update(1/60,idle,true);
      const initial=sample();state.initial=initial;state.peak=initial.position.y;
      v.action('ignition');v.action('gear1',true);v.drivetrain.handbrake=false;
      return initial;
    };
    const advance=(frames=600)=>{
      for(let i=0;i<frames;i++){
        v.update(1/60,power,true);state.frames++;const current=sample();
        state.peak=Math.max(state.peak,current.position.y);state.minimumUp=Math.min(state.minimumUp,current.up);
        if(state.frames%30===0)state.samples.push(current);
        state.cleared||=current.clear;if(current.clear)break;
      }
      return {...state,final:sample()};
    };
    const reverse=()=>{
      for(let i=0;i<60;i++)v.update(1/60,{down:action=>action==='brake'||action==='clutch'},true);
      v.action('reverse',true);const before=sample();
      for(let i=0;i<120;i++)v.update(1/60,power,true);
      return {before,after:sample(),distance:Math.hypot(v.body.translation().x-before.position.x,v.body.translation().z-before.position.z)};
    };
    const render=s.render.bind(s);
    s.render=(...args)=>{
      render(...args);s.guide.visible=s.goal.visible=false;
      s.camera.clearViewOffset();s.camera.fov=48;s.camera.updateProjectionMatrix();
      if(state?.course){s.camera.position.set(-18,3.8,35);s.camera.lookAt(-25,.6,29);}
      else{s.camera.position.set(6,3.4,-126);s.camera.lookAt(0,.5,-120);}
      s.renderer.setRenderTarget(null);s.renderer.setScissorTest(false);s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);
    };
    window.__poweredCurb={setup,advance,reverse,render:()=>s.render(v,1/60,v.time,false,0)};
  });
  const capture=async name=>{
    await page.evaluate(()=>window.__poweredCurb.render());
    await page.screenshot({path:`${directory}/${name}.png`});
  };
  await page.evaluate(()=>window.__poweredCurb.setup({baseline:true}));
  const before=await page.evaluate(()=>window.__poweredCurb.advance());await capture('10cm-before-stuck');
  const initial=await page.evaluate(()=>window.__poweredCurb.setup());await capture('10cm-after-touching');
  const after=await page.evaluate(()=>window.__poweredCurb.advance());await capture('10cm-after-clear');
  const courseInitial=await page.evaluate(()=>window.__poweredCurb.setup({course:true}));await capture('20cm-course-oblique-touching');
  const course=await page.evaluate(()=>window.__poweredCurb.advance(300));await capture('20cm-course-oblique-grounded');
  const steeringInitial=await page.evaluate(()=>window.__poweredCurb.setup({course:true,steering:true}));
  const steering=await page.evaluate(()=>window.__poweredCurb.advance(480));await capture('20cm-course-steering-clear');
  // Check reverse after a successful crossing, separately from a car supported
  // on its floor: wheel torque cannot guarantee escape from a high-centre.
  await page.evaluate(()=>{const h=window.__poweredCurb;h.setup();h.advance();});
  const reverse=await page.evaluate(()=>window.__poweredCurb.reverse());await capture('10cm-reverse-away');
  report={date:new Date().toISOString(),initial,before,after,courseInitial,course,steeringInitial,steering,reverse,checks,errors};
  check('The 10 cm baseline reproduces a powered blockage',!before.cleared&&before.final.speed<.1);
  check('The throttle starts from touching rest',initial.speed<.05);
  check('All four tyres clear the 10 cm kerb under engine power',after.cleared);
  check('Powered crossing remains upright without a launch',after.minimumUp>.85&&after.peak<initial.position.y+.35);
  check('A 20 cm curb can support the 16 cm floor and arrest the oblique car',!course.cleared&&course.final.speed<.1&&course.final.chassisContacts.some(c=>Math.abs(c.normal.y)>.9&&c.distance<=0));
  check('Grounding unloads the tyres instead of forcing the chassis through concrete',course.final.wheels.reduce((sum,w)=>sum+w.load,0)<courseInitial.wheels.reduce((sum,w)=>sum+w.load,0)*.75&&course.minimumUp>.85&&course.peak<courseInitial.position.y+.45);
  check('All four tyres cross the actual 20 cm curb from grass with throttle and steering',steering.cleared&&steering.minimumUp>.85&&steering.peak<steeringInitial.position.y+.45);
  check('Reverse remains available after a successful powered crossing',reverse.after.gear===-1&&reverse.distance>1);
  check('Every sampled vehicle and suspension state remains finite',[before,after,course,steering].every(run=>run.samples.every(s=>[s.position.x,s.position.y,s.position.z,s.speed,...s.wheels.map(w=>w.load)].every(Number.isFinite))));
  check('No browser errors',errors.length===0);
  console.log(JSON.stringify({checks,before:before.final,after:after.final,course:course.final,reverseDistance:reverse.distance,errors},null,2));
}catch(error){report={...report,checks,errors,failure:String(error)};throw error;}
finally{if(report)await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await browser.close();}
