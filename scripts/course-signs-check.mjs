import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/course-sign-audit';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');await page.keyboard.press('Escape');
  const report=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{courseSigns}=await import('/src/data/course-signs.ts'),{roadDistance}=await import('/src/render/course-world.ts'),{signTexture,signSpecifications}=await import('/src/render/road-signs.ts');
    const group=window.__avtodrom.scene.world.group;
    const signs=group.children.filter(n=>n.userData.kind).map(root=>{
      const faces=root.children.filter(n=>/^sign-.*-front$/.test(n.name)).map(n=>{n.geometry.computeBoundingBox();const box=n.geometry.boundingBox,p=n.getWorldPosition(new T.Vector3());return {kind:n.userData.kind,designation:n.userData.designation,center:p.toArray(),lowerEdge:p.y+box.min.y-root.position.y,width:box.max.x-box.min.x,height:box.max.y-box.min.y,side:n.material.side};});
      const crossHeight=root.userData.crossbuckCenter,crossArms=[];
      // Hardware is merged into shared material batches. Raycast its visible
      // arms in the final world rather than relying on pre-batch child names.
      if(crossHeight!==undefined)for(const side of [-1,1])for(const arm of [-1,1]){
        const origin=root.localToWorld(new T.Vector3(side*.4,crossHeight+arm*.4*Math.tan(.43),.7)),direction=new T.Vector3(0,0,-1).transformDirection(root.matrixWorld);
        crossArms.push(new T.Raycaster(origin,direction,0,1).intersectObject(group,true).length>0);
      }
      return {id:root.name,placementId:root.userData.placementId,point:root.position.toArray(),yaw:root.rotation.y,lowerMainEdge:root.userData.lowerMainEdge,clearance:roadDistance(root.position),frames:root.userData.referenceFrames,faces,crossHeight,crossArms};
    });
    const canvas=document.createElement('canvas'),columns=6,cell=220,kinds=Object.keys(signSpecifications);canvas.width=columns*cell;canvas.height=Math.ceil(kinds.length/columns)*cell;const ctx=canvas.getContext('2d');ctx.fillStyle='#e2e8df';ctx.fillRect(0,0,canvas.width,canvas.height);
    kinds.forEach((kind,i)=>{const spec=signSpecifications[kind],scale=Math.min(170/spec.width,154/spec.height),w=spec.width*scale,h=spec.height*scale,x=(i%columns)*cell+(cell-w)/2,y=Math.floor(i/columns)*cell+18+(154-h)/2;ctx.drawImage(signTexture(kind).image,x,y,w,h);ctx.fillStyle='#183b2a';ctx.textAlign='center';ctx.font='14px Arial';ctx.fillText(`${spec.designation} · ${kind}`,(i%columns)*cell+cell/2,Math.floor(i/columns)*cell+195);});
    return {signs,expected:courseSigns.map(p=>({id:p.id,kind:p.kind,lower:p.lower??[],bottom:p.bottom??2,yaw:p.yaw})),atlas:canvas.toDataURL('image/png')};
  });
  if(!process.argv.includes('--geometry-only')){
  await writeFile(`${directory}/artwork.png`,Buffer.from(report.atlas.split(',')[1],'base64'));
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);window.signAuditPose={eye:[-25,12,50],target:[7,1,40],fov:58};s.render=(...args)=>{draw(...args);s.guide.visible=s.goal.visible=s.car.visible=false;const p=window.signAuditPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(s.scene,s.camera);};});
  for(const [name,pose]of [
    ['start',{eye:[-27,7,47],target:[6,1.6,41],fov:52}],
    ['ramp-exit',{eye:[48,12,55],target:[57,1,30],fov:55}],
    ['b-cd-bends',{eye:[50,18,36],target:[27,0,17],fov:55}],
    ['junction',{eye:[12,10,20],target:[0,1,-3],fov:60}],
    ['snake',{eye:[-12,15,-49],target:[14,0,-27],fov:57}],
    ['garages',{eye:[-5,20,-2],target:[-30,0,-18],fov:65}],
    ['railway',{eye:[52,8,-8],target:[61,1.7,-28],fov:55}],
    ['speed',{eye:[32,7,-48],target:[-22,1,-43],fov:50}],
    ['parking-finish',{eye:[-25,15,25],target:[-35,0,9],fov:60}],
  ]){await page.evaluate(p=>window.signAuditPose=p,pose);await page.waitForTimeout(220);await page.screenshot({path:`${directory}/${name}.png`});}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.signAuditPose={eye:[-12,18,-49],target:[14,1,-27],fov:80});await page.waitForTimeout(220);await page.screenshot({path:`${directory}/mobile.png`});
  }delete report.atlas;
  await writeFile(`${directory}/report.json`,JSON.stringify({...report,errors},null,2));
  console.log(JSON.stringify({assemblies:report.signs.length,boards:report.signs.reduce((n,s)=>n+s.faces.length,0),badPositions:report.signs.filter(s=>s.clearance<.3),errors},null,2));
  for(const expected of report.expected){const matches=report.signs.filter(s=>s.placementId===expected.id);assert.equal(matches.length,1,expected.id);const sign=matches[0];assert.equal(sign.faces.length,1+expected.lower.length,expected.id);assert.deepEqual(sign.faces.map(f=>f.kind),[expected.kind,...expected.lower]);assert(Math.abs(sign.lowerMainEdge-expected.bottom)<1e-6,`${expected.id}: lower main edge`);assert.equal(sign.yaw,expected.yaw);assert(sign.frames?.length>0);}
  assert(report.signs.every(s=>s.clearance>=.3),'Sign posts must stand off the asphalt');
  for(const sign of report.signs){assert(Number.isFinite(sign.lowerMainEdge));assert(sign.faces.every(f=>f.side===0));for(let i=1;i<sign.faces.length;i++)assert(sign.faces[i].center[1]+sign.faces[i].height/2<sign.faces[i-1].center[1]-sign.faces[i-1].height/2-.04,`${sign.id}: boards overlap`);}
  const railway=report.signs.find(s=>s.id==='railway-stop');assert(railway.crossHeight+railway.point[1]>railway.faces[0].center[1]+railway.faces[0].height/2);assert(railway.crossArms.length===4&&railway.crossArms.every(Boolean),'All four crossbuck arms remain visible after static batching');
  assert.deepEqual(errors,[]);
}finally{await browser.close();}
