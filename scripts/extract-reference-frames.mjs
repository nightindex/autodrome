import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const args=process.argv.slice(2);
const option=(name,fallback)=>{const i=args.indexOf(name);if(i<0)return fallback;const value=args[i+1];if(!value)throw new Error(`Missing value for ${name}`);args.splice(i,2);return value;};
const videoPath=option('--video','video/RQZeRiXdsk9ualSykoFF+J6Yl64tQNes.mp4').replaceAll('\\','/');
const directory=option('--out','test-results/reference-video');
if(!existsSync(videoPath))throw new Error(`Video not found: ${videoPath}`);
const executablePath=[process.env.CHROME_PATH,'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(p=>p&&existsSync(p));
const browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
await mkdir(directory,{recursive:true});
try{
  const page=await browser.newPage();
  await page.route('http://127.0.0.1:5173/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('http://127.0.0.1:5173/');
  const metadata=await page.evaluate(async source=>{
    document.body.innerHTML='';
    const video=document.createElement('video');video.id='reference';video.muted=true;video.preload='auto';
    video.src='/'+source;document.body.append(video);
    await new Promise((resolve,reject)=>{video.addEventListener('loadedmetadata',resolve,{once:true});video.addEventListener('error',()=>reject(new Error(video.error?.message||'Video decode failed')),{once:true});});
    return {duration:video.duration,width:video.videoWidth,height:video.videoHeight};
  },videoPath);
  console.log(JSON.stringify(metadata));
  const requested=args.map(Number).filter(t=>Number.isFinite(t)&&t>=0&&t<metadata.duration);
  const times=requested.length?requested:Array.from({length:24},(_,i)=>Math.min(metadata.duration-.1,(i+.3)*metadata.duration/24));
  const frames=[];
  for(const time of times){
    const data=await page.evaluate(async(time)=>{
      const video=document.querySelector('#reference');
      await new Promise(resolve=>{video.addEventListener('seeked',resolve,{once:true});video.currentTime=time;});
      const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=Math.round(video.videoHeight/video.videoWidth*1280);
      canvas.getContext('2d').drawImage(video,0,0,canvas.width,canvas.height);
      return canvas.toDataURL('image/png').split(',')[1];
    },time);
    const stamp=`${Math.floor(time/60).toString().padStart(2,'0')}-${Math.floor(time%60).toString().padStart(2,'0')}`;
    const path=`${directory}/frame-${stamp}.png`;await writeFile(path,Buffer.from(data,'base64'));
    frames.push({time:+time.toFixed(2),stamp,path});
  }
  const width=480,height=Math.round(metadata.height/metadata.width*width),tileHeight=height+32,columns=4;
  const composite=[];
  for(const [i,frame]of frames.entries()){
    const label=Buffer.from(`<svg width="${width}" height="32"><rect width="100%" height="100%" fill="#173c32"/><text x="14" y="23" fill="white" font-family="Arial" font-size="18">${frame.stamp.replace('-',':')}</text></svg>`);
    composite.push({input:await sharp(frame.path).resize(width,height).toBuffer(),left:i%columns*width,top:Math.floor(i/columns)*tileHeight});
    composite.push({input:label,left:i%columns*width,top:Math.floor(i/columns)*tileHeight+height});
  }
  const sheet=`${directory}/${requested.length?'details':'contact-sheet'}.png`;
  await sharp({create:{width:columns*width,height:Math.ceil(frames.length/columns)*tileHeight,channels:3,background:'#173c32'}}).composite(composite).png().toFile(sheet);
  await writeFile(`${directory}/${requested.length?'details':'frames'}.json`,JSON.stringify({source:videoPath,...metadata,frames},null,2));
  console.log(`Extracted ${frames.length} frames: ${sheet}`);
}finally{await browser.close();}
