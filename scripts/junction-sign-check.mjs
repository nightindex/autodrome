import {chromium} from 'playwright';
import {existsSync} from 'node:fs';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const directory='test-results/junction-sign-photo';await mkdir(directory,{recursive:true});
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{}),args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
  const references={};for(const [key,file]of Object.entries({pedestrian:'pedestrian-2.gif',priority:'priority.gif',straight:'straight.gif',stopPlate:'stop-line.png'})){
    const path=`${directory}/reference/${file}`;if(existsSync(path))references[key]=`data:image/${file.endsWith('gif')?'gif':'png'};base64,${(await readFile(path)).toString('base64')}`;
  }
  await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');await page.keyboard.press('Escape');
  const result=await page.evaluate(async references=>{
    const T=await import('/node_modules/three/build/three.module.js'),{signTexture,signSpecifications,createRoadSign}=await import('/src/render/road-signs.ts'),s=window.__avtodrom.scene;
    const pixel=(canvas,x,y)=>[...canvas.getContext('2d').getImageData(Math.floor(canvas.width*x),Math.floor(canvas.height*y),1,1).data];
    const textures=['pedestrian','priority','stopPlate','straight'].map(kind=>{const canvas=signTexture(kind).image;return {kind,width:canvas.width,height:canvas.height,spec:signSpecifications[kind],png:canvas.toDataURL('image/png')};});
    const normal=signTexture('pedestrian').image,mirrored=signTexture('pedestrian',true).image,a=normal.getContext('2d').getImageData(0,0,512,512).data,b=mirrored.getContext('2d').getImageData(0,0,512,512).data;
    let ink=0,mismatch=0;for(let y=70;y<410;y++)for(let x=45;x<467;x++){const i=(y*512+x)*4,j=(y*512+511-x)*4,one=a[i]<80&&a[i+1]<80&&a[i+2]<80,two=b[j]<80&&b[j+1]<80&&b[j+2]<80;if(one||two)ink++;if(one!==two)mismatch++;}
    const comparisons={};
    for(const [kind,src]of Object.entries(references)){
      const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=src;});
      const canvases=[img,signTexture(kind).image].map(image=>{const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,256,256);ctx.drawImage(image,0,0,256,256);return ctx.getImageData(0,0,256,256).data;});
      let union=0,intersection=0;for(let y=0;y<256;y++)for(let x=0;x<256;x++){
        if(kind==='pedestrian'&&(x<30||x>226||y<40||y>205))continue;
        if(kind==='straight'&&Math.hypot(x-128,y-128)>110)continue;
        if(kind==='stopPlate'&&(x<25||x>231||y<40||y>216))continue;
        const masks=canvases.map(d=>{const i=(y*256+x)*4;return kind==='priority'?d[i]>200&&d[i+1]>150&&d[i+2]<90:kind==='straight'?d[i]>230&&d[i+1]>230&&d[i+2]>230:d[i]<80&&d[i+1]<80&&d[i+2]<80;});
        if(masks[0]||masks[1])union++;if(masks[0]&&masks[1])intersection++;
      }comparisons[kind]=intersection/union;
    }
    const placed=[];s.world.group.traverse(n=>{if(n.name==='sign-pedestrian-front'||n.name==='sign-stopPlate-front')placed.push({name:n.name,designation:n.userData.designation,side:n.material.side});});
    const straight=signTexture('straight').image,review=new T.Scene();review.background=new T.Color(0xdbe2de);review.add(new T.HemisphereLight(0xffffff,0x777c72,2));const light=new T.DirectionalLight(0xffffff,2);light.position.set(-3,6,7);review.add(light);
    ['pedestrian','priority','stopPlate','straight'].forEach((kind,i)=>{const sign=createRoadSign(kind);sign.position.x=(i-1.5)*1.1;review.add(sign);});
    window.junctionSignReview=review;return {textures,mirroredMismatch:mismatch/ink,placed,comparisons,straight:{tip:pixel(straight,.5,.14),stem:pixel(straight,.5,.91),margin:pixel(straight,.3,.37)}};
  },references);
  for(const texture of result.textures){assert.equal(texture.width,512);assert.equal(texture.height,texture.kind==='stopPlate'?256:512);await writeFile(`${directory}/${texture.kind}.png`,Buffer.from(texture.png.split(',')[1],'base64'));delete texture.png;}
  assert(result.mirroredMismatch<.025);assert(result.placed.some(p=>p.designation==='5.16.1')&&result.placed.some(p=>p.designation==='5.16.2'));assert(result.placed.filter(p=>p.name==='sign-stopPlate-front').every(p=>p.designation==='5.33'));assert(result.placed.every(p=>p.side===0));
  assert(result.straight.tip.slice(0,3).every(c=>c>230));assert(result.straight.stem.slice(0,3).every(c=>c>230));assert(result.straight.margin[2]>result.straight.margin[0]+60);
  await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});
  await page.evaluate(async()=>{const T=await import('/node_modules/three/build/three.module.js'),s=window.__avtodrom.scene,draw=s.render.bind(s);window.junctionSignPose={eye:[0,1.65,7.2],target:[0,1.65,0],fov:42,review:true};s.render=(...args)=>{draw(...args);s.guide.visible=s.goal.visible=false;const p=window.junctionSignPose;s.camera.clearViewOffset();s.camera.fov=p.fov;s.camera.updateProjectionMatrix();s.camera.position.fromArray(p.eye);s.camera.lookAt(new T.Vector3(...p.target));s.renderer.render(p.review?window.junctionSignReview:s.scene,s.camera);};});
  for(const [name,pose]of [
    ['front',{eye:[0,1.6,7.2],target:[0,1.6,0],fov:42,review:true}],
    ['oblique',{eye:[2.7,2.5,6.8],target:[0,1.7,0],fov:44,review:true}],
    ['in-course',{eye:[.5,3.3,20],target:[4.8,2,7.5],fov:40,review:false}],
  ]){await page.evaluate(p=>window.junctionSignPose=p,pose);await page.waitForTimeout(250);await page.screenshot({path:`${directory}/${name}.png`});}
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.junctionSignPose={eye:[.5,3.2,25],target:[4.8,2,7.5],fov:49,review:false});await page.waitForTimeout(250);await page.screenshot({path:`${directory}/mobile.png`});
  assert.deepEqual(errors,[]);await writeFile(`${directory}/report.json`,JSON.stringify({result,errors},null,2));console.log(JSON.stringify({comparisons:result.comparisons,mirrorMismatch:result.mirroredMismatch,placed:result.placed,errors},null,2));
}finally{await browser.close();}
