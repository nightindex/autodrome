import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

// Optional historical comparison: --baseline=test-results/vehicle-steering-before.ts.
// Its module is transformed only in the browser response; source files stay intact.
const baselinePath=process.argv.find(arg=>arg.startsWith('--baseline='))?.slice('--baseline='.length);
const directory=`test-results/curb-steering${baselinePath?'-baseline':''}`;
await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path=>path&&existsSync(path));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
let report;
const check=(name,condition)=>{checks.push({name,passed:!!condition});};
try{
  if(baselinePath){
    const {transformWithOxc}=await import('vite');
    const baseline=(await transformWithOxc(await readFile(baselinePath,'utf8'),'vehicle.ts')).code;
    await page.route('**/src/simulation/vehicle.ts*',async route=>{
      const response=await route.fetch(),current=await response.text();
      const rapier=current.match(/import RAPIER from ["']([^"']+)["']/)?.[1];
      const three=current.match(/import \* as T from ["']([^"']+)["']/)?.[1];
      assert(rapier&&three,'Historical module dependencies can be resolved from Vite');
      const body=baseline.replace(/from (["'])([^"']+)\1/g,(_match,quote,specifier)=>{
        const target=specifier==='@dimforge/rapier3d-compat'?rapier:specifier==='three'?three:new URL(`${specifier}.ts`,'http://localhost/src/simulation/vehicle.ts').pathname;
        return `from ${quote}${target}${quote}`;
      });
      await route.fulfill({response,body,contentType:'application/javascript'});
    });
  }
  await page.goto(process.env.AVTODROM_URL??'http://127.0.0.1:5173/');
  await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  const fixture=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js');
    const a=window.__avtodrom;a.start('practice');a.pause();
    const v=a.vehicle,s=a.scene,idle={down:()=>false},held={down:action=>action==='throttle'||action==='left'};
    const mesh=s.world.group.getObjectByName('course-curbs'),laneX=-25;
    const near=new T.Raycaster(new T.Vector3(laneX,.1,27),new T.Vector3(0,0,1),0,5).intersectObject(mesh)[0].point.z;
    const far=new T.Raycaster(new T.Vector3(laneX,.1,31),new T.Vector3(0,0,-1),0,5).intersectObject(mesh)[0].point.z;
    const middle=(near+far)/2;
    const hasCurb=x=>new T.Raycaster(new T.Vector3(x,2,middle),new T.Vector3(0,-1,0),0,3).intersectObject(mesh).length>0;
    const span=[];
    for(const direction of [-1,1]){
      let inside=laneX,outside=inside;
      for(let distance=.1;distance<=80;distance+=.1){outside=laneX+direction*distance;if(!hasCurb(outside))break;inside=outside;}
      for(let i=0;i<20;i++){const midpoint=(inside+outside)/2;if(hasCurb(midpoint))inside=midpoint;else outside=midpoint;}
      span.push((inside+outside)/2);
    }
    const top=new T.Raycaster(new T.Vector3(laneX,2,middle),new T.Vector3(0,-1,0),0,3).intersectObject(mesh)[0].point.y;
    let state;
    const sample=()=>{
      const position=v.body.translation(),rotation=v.body.rotation(),velocity=v.body.linvel(),telemetry=v.telemetry();
      const wheels=v.tyres.map((tyre,index)=>{
        const center=tyre.translation(),axle=new T.Vector3(0,1,0).applyQuaternion(tyre.rotation()),shape=tyre.shape;
        // Exact support extent for the physical rounded cylinder, including its
        // rounded border; rendered tyres and suspension rays are not clearance.
        const extent=axis=>shape.halfHeight*Math.abs(axle[axis])+shape.radius*Math.sqrt(Math.max(0,1-axle[axis]*axle[axis]))+(shape.borderRadius??0);
        return {index,center,extentX:extent('x'),extentZ:extent('z'),suspension:v.controller.wheelSuspensionLength(index),load:v.controller.wheelSuspensionForce(index),engineForce:v.controller.wheelEngineForce(index)};
      });
      const withinSpan=wheels.every(wheel=>wheel.center.x-wheel.extentX>span[0]&&wheel.center.x+wheel.extentX<span[1]);
      return {frame:state.frame,position,rotation,velocity,speed:telemetry.speed,steering:telemetry.steering,up:1-2*(rotation.x*rotation.x+rotation.z*rotation.z),wheels,withinSpan,clear:wheels.every(wheel=>wheel.center.z+wheel.extentZ<near)};
    };
    const setup=offset=>{
      v.reset({x:laneX,z:far+offset},Math.PI/2);
      for(let i=0;i<120;i++)v.update(1/60,idle,true);
      state={offset,frame:0,samples:[],cleared:false,escapedSpan:false,peakHeight:0,minimumUp:1,finite:true};
      const initial=sample();state.initial=initial;state.peakHeight=initial.position.y;
      v.action('ignition');v.action('gear1',true);v.drivetrain.handbrake=false;
      return initial;
    };
    const advance=(frames=480)=>{
      for(let i=0;i<frames;i++){
        v.update(1/60,held,true);state.frame++;
        const current=sample();
        state.peakHeight=Math.max(state.peakHeight,current.position.y);state.minimumUp=Math.min(state.minimumUp,current.up);
        state.escapedSpan||=!current.withinSpan;
        state.finite&&=[current.position.x,current.position.y,current.position.z,current.velocity.x,current.velocity.y,current.velocity.z,current.speed,...current.wheels.flatMap(wheel=>[wheel.extentX,wheel.extentZ,wheel.suspension,wheel.load,wheel.engineForce])].every(Number.isFinite);
        if(state.frame%15===0||current.clear)state.samples.push(current);
        if(current.clear){state.cleared=true;state.clearance=current;break;}
      }
      return {...state,final:sample()};
    };
    const originalRender=s.render.bind(s);
    s.render=(...args)=>{
      originalRender(...args);s.guide.visible=s.goal.visible=false;
      const position=v.body.translation();
      s.camera.clearViewOffset();s.camera.fov=48;s.camera.updateProjectionMatrix();
      s.camera.position.set(position.x-7.5,4.3,position.z+4.1);s.camera.lookAt(position.x+.7,.45,position.z-.1);
      s.renderer.setRenderTarget(null);s.renderer.setScissorTest(false);s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);
    };
    window.__curbSteering={setup,advance,render:()=>s.render(v,1/60,v.time,false,0)};
    return {laneX,near,far,top,span,physicsHz:60,obstacleCount:v.obstacles.size,input:['throttle','left'],yaw:Math.PI/2};
  });
  const capture=async name=>{await page.evaluate(()=>window.__curbSteering.render());await page.screenshot({path:`${directory}/${name}.png`});};
  const scenarios=[];
  for(const offset of [.7,.85,1,1.15,1.3]){
    await page.evaluate(offset=>window.__curbSteering.setup(offset),offset);
    if(offset===.7)await capture('01-before-gas-and-left');
    const run=await page.evaluate(()=>window.__curbSteering.advance());
    scenarios.push(run);
    if(offset===.7)await capture(baselinePath?'02-blocked-with-gas-and-left':'02-all-four-tyres-clear');
  }
  report={date:new Date().toISOString(),baselinePath,fixture,scenarios,checks,errors};
  check('The actual course has its 20 cm curb and all obstacles',Math.abs(fixture.top-.2)<.001&&Math.abs(fixture.far-fixture.near-.24)<.001&&fixture.obstacleCount>20);
  for(const run of scenarios){
    check(`${run.offset} m: starts from rest`,run.initial.speed<.05);
    if(baselinePath)check(`${run.offset} m: historical gas plus left reproduces blockage`,!run.cleared&&run.final.speed<.25);
    else{
      check(`${run.offset} m: all four physical tyres clear the curb under gas plus left`,run.cleared);
      check(`${run.offset} m: crosses the curb inside its span`,!run.escapedSpan&&run.clearance?.withinSpan);
      check(`${run.offset} m: remains upright without a launch`,run.minimumUp>.85&&run.peakHeight<run.initial.position.y+.45);
    }
    check(`${run.offset} m: all vehicle and suspension states remain finite`,run.finite);
  }
  check('No browser errors',errors.length===0);
  console.log(JSON.stringify({fixture,checks,scenarios:scenarios.map(run=>({offset:run.offset,cleared:run.cleared,frame:run.frame,position:run.final.position,escapedSpan:run.escapedSpan,minimumUp:run.minimumUp,peakHeight:run.peakHeight})),errors},null,2));
  assert(checks.every(check=>check.passed),checks.filter(check=>!check.passed).map(check=>check.name).join('\n'));
}catch(error){report={...report,date:new Date().toISOString(),checks,errors,failure:String(error)};throw error;}
finally{if(report)await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2));await browser.close();}
