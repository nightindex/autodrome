import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';

const phase=process.argv[2]??'after',directory='test-results/curb-video';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.scene.prepared,null,{timeout:60000});
  await page.evaluate(()=>{const a=window.__avtodrom;a.start('practice');a.pause();window.curbVideoDraw=a.scene.render.bind(a.scene);a.scene.render=()=>{};a.scene.car.visible=false;a.scene.setGoal({x:0,z:0},false);});
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  const report=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{mapPoint}=await import('/src/data/course.ts'),s=window.__avtodrom.scene;
    s.world.group.updateMatrixWorld(true);
    const curbs=['course-curbs','intersection-curbs','departure-curbs'].map(name=>s.world.group.getObjectByName(name));
    const probes=[];
    for(const y of [585.37,586.73,588.41,590.23,600.23,610.23,614.79])for(let x=66.3;x<69.8;x+=.21){
      const p=mapPoint(x,y),hits=new T.Raycaster(new T.Vector3(p.x,2,p.z),new T.Vector3(0,-1,0)).intersectObjects(curbs);
      const top=hits.filter(hit=>hit.point.y>.17);probes.push({x,y,surfaces:top.length,heights:top.map(h=>h.point.y)});
    }
    const {laneLines,lanePaintPaths}=await import('/src/data/lane-markings.ts');
    const divider=laneLines.find(line=>line.id==='finish-divider'),finish=s.world.group.getObjectByName('paint-lane-finish-divider');
    const finishChecks=[200,208,216,224,232,240].map(x=>{const p=mapPoint(x,775);return {x,painted:!!new T.Raycaster(new T.Vector3(p.x,2,p.z),new T.Vector3(0,-1,0)).intersectObject(finish)[0]};});
    const source=await fetch('/src/simulation/vehicle.ts').then(r=>r.text()),R=(await import(source.match(/import RAPIER from ["']([^"']+)["']/)[1])).default;
    const physics=s.world.physics;physics.step();
    const colliderChecks=[66.7,68,69.3].map(x=>{
      const p=mapPoint(x,600.23),rendered=new T.Raycaster(new T.Vector3(p.x,2,p.z),new T.Vector3(0,-1,0)).intersectObjects(curbs)[0];
      const hit=physics.castRay(new R.Ray({x:p.x,y:2,z:p.z},{x:0,y:-1,z:0}),3,true,undefined,undefined,undefined,undefined,collider=>s.world.obstacles.has(collider.handle));
      return {x,renderedY:rendered?.point.y??null,colliderY:hit?2-hit.timeOfImpact:null};
    });
    const {Minimap}=await import('/src/ui/minimap.ts'),mini=new Minimap(document.createElement('canvas')),ctx=mini.freeBase.getContext('2d');
    const minimapChecks=finishChecks.map(({x})=>{const p=mini.projection.project(mapPoint(x,775)),data=ctx.getImageData(Math.floor(p.x)-1,Math.floor(p.y)-1,3,3).data;return {x,painted:Array.from({length:9},(_,i)=>[...data.slice(i*4,i*4+3)]).some(([r,g,b])=>Math.min(r,g,b)>140)};});
    return {overlaps:probes.filter(p=>p.surfaces>1),probes,finishChecks,minimapChecks,colliderChecks,finishPaths:lanePaintPaths(divider).length,references:['uz_video.mp4 05:50–06:30','uz_video.mp4 08:55–09:15','uz_video.mp4 11:21']};
  });
  for(const style of ['yellow-black','white'])for(const [name,eye,target]of [
    ['lip',[-61,3.3,3],[-57.2,.1,7]],
    ['parking',[-58,13,-3],[-45,0,8]],
    ['finish',[-40,12,35],[-39,0,24]],
  ]){
    await page.evaluate(({style,eye,target})=>{
      const a=window.__avtodrom,s=a.scene;s.setCurbStyle(style);window.curbVideoDraw(a.vehicle,1,0,false,0);
      s.car.visible=s.guide.visible=s.goal.visible=false;s.camera.clearViewOffset();s.camera.fov=50;s.camera.updateProjectionMatrix();s.camera.position.fromArray(eye);s.camera.lookAt(...target);
      s.renderer.render(s.scene,s.camera);
    },{style,eye,target});
    await page.locator('canvas').first().screenshot({path:`${directory}/${phase}-${name}-${style}.png`});
  }
  // Existing extracted reference frames are optional review artifacts, not
  // runtime assets. Each panel is labelled to distinguish video from game.
  const comparisons=[
    ['parking','08-55','parking-white'],['parking-mouth','09-15','lip-white'],['finish','11-21','finish-white'],
  ];
  for(const [name,stamp,game]of comparisons){
    const reference=`test-results/curb-video-reference/details/frame-${stamp}.png`;if(!existsSync(reference))continue;
    const left=await sharp(reference).resize(800,500,{fit:'contain',background:'#202926'}).toBuffer();
    const right=await sharp(`${directory}/${phase}-${game}.png`).resize(800,500,{fit:'contain',background:'#202926'}).toBuffer();
    const label=Buffer.from(`<svg width="1600" height="40"><rect width="100%" height="100%" fill="#202926"/><g fill="white" font-size="20" font-family="Arial"><text x="20" y="27">uz_video.mp4 ${stamp.replace('-',':')}</text><text x="820" y="27">Simulator: ${phase}</text></g></svg>`);
    await sharp({create:{width:1600,height:540,channels:3,background:'#202926'}}).composite([{input:label,left:0,top:0},{input:left,left:0,top:40},{input:right,left:800,top:40}]).png().toFile(`${directory}/${phase}-${name}-comparison.png`);
  }
  await page.evaluate(()=>{
    const a=window.__avtodrom,s=a.scene;s.car.visible=true;s.setCurbStyle('yellow-black');s.cameraMode='cockpit';
    a.vehicle.reset({x:-59.5,z:1.5},0);for(let i=0;i<120;i++)a.vehicle.update(1/60,{down:()=>false},true);s.resetMotion();
    window.curbVideoDraw(a.vehicle,1,0,false,.8);
  });
  await page.locator('canvas').first().screenshot({path:`${directory}/${phase}-cockpit.png`});
  await writeFile(`${directory}/${phase}.json`,JSON.stringify({report,errors},null,2));console.log(JSON.stringify({overlaps:report.overlaps.length,finishChecks:report.finishChecks,finishPaths:report.finishPaths,minimapChecks:report.minimapChecks,colliderChecks:report.colliderChecks,errors},null,2));
  if(phase==='after'){
    assert.equal(report.overlaps.length,0,'Narrow parking lip must have no overlapping curb tops');assert(report.finishChecks.every(p=>p.painted),'Video finish divider is continuous');assert.equal(report.finishPaths,1);
    assert(report.minimapChecks.every(p=>p.painted),'Minimap must share the solid finish divider');
    assert(report.colliderChecks.every(p=>p.renderedY===null?p.colliderY===null:p.colliderY!==null&&Math.abs(p.renderedY-p.colliderY)<.002),'Physical narrow curbs must match their visible tops and clear grass gap');
    assert.deepEqual(errors,[]);
  }
}finally{await browser.close();}
