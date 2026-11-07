import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const mode=process.argv[2]??'after',directory='test-results/sign-edges';await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH??'C:/Program Files/Google/Chrome/Application/chrome.exe',args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:5173/');await page.waitForFunction(()=>window.__avtodrom?.snapshot().loaded,null,{timeout:60000});await page.click('#practice');await page.keyboard.press('Escape');
 const report=await page.evaluate(async()=>{
  const T=await import('/node_modules/three/build/three.module.js'),{signShape,signSpecifications,createRoadSign,loadDirectionSignArtwork}=await import('/src/render/road-signs.ts');await loadDirectionSignArtwork();
  const cases=[['winding',false,'1.12.2'],['winding',true,'1.12.1'],['ascent',false,'1.14'],['descent',false,'1.13'],['railWarning',false,'1.2'],['yield',false,'2.4']];
  const measurements=[];
  for(const [kind,mirror,id]of cases){
   const img=new Image();img.src=`/assets/road-signs/reference/${id}.png`;await img.decode();
   const source=document.createElement('canvas');source.width=source.height=512;source.getContext('2d').drawImage(img,0,0,512,512);
   const alpha=source.getContext('2d').getImageData(0,0,512,512).data;
   const mask=document.createElement('canvas');mask.width=mask.height=512;const ctx=mask.getContext('2d'),spec=signSpecifications[kind];
   ctx.beginPath();signShape(kind).getPoints(32).forEach((p,i)=>{const x=(p.x/spec.width+.5)*512,y=(.5-p.y/spec.height)*512;i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();ctx.fill();
   const shape=ctx.getImageData(0,0,512,512).data;let total=0,outside=0;
   for(let i=3;i<shape.length;i+=4)if(shape[i]>240){total++;if(alpha[i]<16)outside++;}
   measurements.push({kind,mirror,total,outside,ratio:outside/total});
  }
  const s=window.__avtodrom.scene,scene=new T.Scene();scene.background=new T.Color(0x879da8);scene.environment=s.scene.environment;
  scene.add(new T.HemisphereLight(0xffffff,0x728075,1.4));const light=new T.DirectionalLight(0xffffff,2.2);light.position.set(-3,5,6);scene.add(light);
  cases.forEach(([kind,mirror],i)=>{const root=createRoadSign(kind,mirror,undefined,{center:0,post:false});root.position.set((i%3-1)*1.15,(i<3?.55:-.55),0);scene.add(root);});
  const camera=new T.OrthographicCamera(-1.8,1.8,1.2,-1.2,.1,20);camera.position.set(0,0,5);camera.lookAt(0,0,0);
  const draw=s.render.bind(s);s.render=(...a)=>{draw(...a);s.renderer.setViewport(0,0,innerWidth,innerHeight);s.renderer.render(scene,camera);};
  return measurements;
 });
 await page.addStyleTag({content:'#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}'});await page.waitForTimeout(500);await page.screenshot({path:`${directory}/${mode}.png`});
 await writeFile(`${directory}/${mode}.json`,JSON.stringify({report,errors},null,2));console.log(JSON.stringify({mode,report,errors}));
 if(mode!=='before')assert(report.every(r=>r.ratio<.0002),'The metal face must not extend into transparent image corners');assert.deepEqual(errors,[]);
}finally{await browser.close();}
