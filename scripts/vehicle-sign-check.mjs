import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/sign-photo';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');await page.keyboard.press('Escape');
  const report=await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),{createRoadSign,signTexture,signSpecifications}=await import('/src/render/road-signs.ts');
    const kinds=['carPlate','truckPlate','busPlate'],plates=kinds.map(kind=>{
      const canvas=signTexture(kind).image,ctx=canvas.getContext('2d'),{width:w,height:h}=canvas,data=ctx.getImageData(0,0,w,h).data,seen=new Uint8Array(w*h),components=[];
      const ink=i=>data[i*4]<80&&data[i*4+1]<80&&data[i*4+2]<80;
      for(let index=0;index<w*h;index++)if(!seen[index]&&ink(index)){
        const queue=[index];seen[index]=1;let minX=w,minY=h,maxX=0,maxY=0;
        for(let cursor=0;cursor<queue.length;cursor++){const i=queue[cursor],x=i%w,y=Math.floor(i/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
          for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy,next=ny*w+nx;if(nx>=0&&nx<w&&ny>=0&&ny<h&&!seen[next]&&ink(next)){seen[next]=1;queue.push(next);}}
        }
        if(minY>h*.55&&maxX-minX>35&&maxY-minY>35)components.push({width:maxX-minX+1,height:maxY-minY+1});
      }
      return {kind,texture:[w,h],physical:signSpecifications[kind],wheels:components,png:canvas.toDataURL('image/png')};
    });
    const directions=['left','right'].map(kind=>{
      const ctx=signTexture(kind).image.getContext('2d'),pixel=(x,y)=>[...ctx.getImageData(x*2,y*2,1,1).data];
      return {kind,tip:pixel(kind==='left'?40:216,128),stem:pixel(kind==='left'?144:112,232),opposite:pixel(kind==='left'?216:40,128)};
    });
    const s=window.__avtodrom.scene,targets=s.world.group.children.filter(n=>n.userData.kind==='left'&&(n.getObjectByName('sign-carPlate-front')||n.getObjectByName('sign-truckPlate-front')));
    const positions=targets.map(n=>n.getWorldPosition(new T.Vector3()).toArray());
    const review=new T.Scene();review.background=new T.Color(0xdbe2de);review.add(new T.HemisphereLight(0xffffff,0x777c72,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(-3,6,7);review.add(light);
    const first=createRoadSign('left',false,'carPlate'),second=createRoadSign('left',false,['truckPlate','busPlate']);first.position.x=-.65;second.position.x=.65;review.add(first,second);
    window.vehicleSignReview={scene:review,positions};return {plates,directions,positions};
  });
  for(const plate of report.plates){
    assert.deepEqual(plate.texture,[512,256]);assert.equal(plate.physical.width/plate.physical.height,2);
    assert.equal(plate.wheels.length,2,`${plate.kind} must have two independent wheel silhouettes`);
    assert(plate.wheels.every(w=>Math.abs(w.width/w.height-1)<.035),`${plate.kind}: distorted wheels ${JSON.stringify(plate.wheels)}`);
    await writeFile(`${directory}/${plate.kind}.png`,Buffer.from(plate.png.split(',')[1],'base64'));delete plate.png;
  }
  for(const arrow of report.directions){assert(arrow.tip.slice(0,3).every(c=>c>240));assert(arrow.stem.slice(0,3).every(c=>c>240),'Turn arrow stem must reach the lower rim');assert(arrow.opposite[2]>arrow.opposite[0]+60);}
  assert.equal(report.positions.length,2);
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{
    const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);
    window.vehicleSignPose={eye:[0,2,4.6],target:[0,1.55,0],fov:39,review:true};
    s.render=(...args)=>{draw(...args);const p=window.vehicleSignPose;s.guide.visible=s.goal.visible=false;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.render(p.review?window.vehicleSignReview.scene:s.scene,s.camera);};
  });
  const center=report.positions.reduce((a,p)=>a.map((v,i)=>v+p[i]/report.positions.length),[0,0,0]);
  for(const [name,pose]of [
    ['front',{eye:[0,1.65,4.7],target:[0,1.65,0],fov:36,review:true}],
    ['oblique',{eye:[2.6,2.3,4.2],target:[0,1.5,0],fov:39,review:true}],
    ['rear',{eye:[0,2,-4.7],target:[0,1.65,0],fov:38,review:true}],
    ['in-course',{eye:[center[0]-6,2.6,center[2]+11],target:[center[0],1.65,center[2]],fov:43,review:false}],
  ]){await page.evaluate(p=>window.vehicleSignPose=p,pose);await page.waitForTimeout(250);await page.screenshot({path:`${directory}/${name}.png`});}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.vehicleSignPose={eye:[0,1.6,5.1],target:[0,1.55,0],fov:47,review:true});await page.waitForTimeout(250);await page.screenshot({path:`${directory}/mobile.png`});
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({report,errors},null,2));console.log(JSON.stringify({plates:report.plates,directions:report.directions.map(d=>d.kind),assemblies:report.positions.length,errors},null,2));
}finally{await browser.close();}
