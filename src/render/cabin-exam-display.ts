import * as T from 'three';
import type { Language, Mode } from '../types';

export interface CabinExamDisplayState {
  language:Language;
  mode:Mode;
  status:'idle'|'running'|'paused'|'passed'|'failed';
  /** Elapsed simulation seconds; pausing the simulation also freezes this clock. */
  elapsed:number;
  /** Actual accumulated penalty points, including totals above 100. */
  score:number;
  exerciseName:string;
  /** Chronological engine events. The most recent six appear first on the monitor. */
  events:readonly {points:number;text:string}[];
}

const copy={
  ru:{exam:'ПРАКТИЧЕСКИЙ ЭКЗАМЕН',practice:'ПРАКТИКА ВОЖДЕНИЯ',idle:'Готов к поездке',running:'Экзамен идёт',training:'Практика идёт',paused:'Пауза',passed:'Сдан',failed:'Не сдан',complete:'Практика завершена',ended:'Попытка завершена',exercise:'ТЕКУЩЕЕ УПРАЖНЕНИЕ',points:'ШТРАФНЫЕ БАЛЛЫ',events:'ПОСЛЕДНИЕ НАРУШЕНИЯ',empty:'Нарушений не зафиксировано',ready:'Выберите упражнение',pending:'Поездка ещё не начата'},
  uz:{exam:'AMALIY IMTIHON',practice:'HAYDASH MASHG‘ULOTI',idle:'Haydashga tayyor',running:'Imtihon davom etmoqda',training:'Mashg‘ulot davom etmoqda',paused:'Tanaffus',passed:'Topshirildi',failed:'Topshirilmadi',complete:'Mashg‘ulot yakunlandi',ended:'Urinish yakunlandi',exercise:'JORIY MASHQ',points:'JARIMA BALLARI',events:'OXIRGI QOIDABUZARLIKLAR',empty:'Qoidabuzarlik qayd etilmadi',ready:'Mashqni tanlang',pending:'Haydash hali boshlanmadi'},
}as const;

function finite(value:number){return Number.isFinite(value)?Math.max(0,value):0;}
function clean(value:string){return value.replace(/\s+/gu,' ').trim();}

/** A drive clock, never the wall clock or the photographed candidate's result. */
export function formatExamDisplayTime(elapsed:number){
  const seconds=Math.floor(finite(elapsed));
  return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
}

/** The rendered content is also the dirty key, so sub-second telemetry cannot upload a texture every frame. */
export function examDisplayContent(state:CabinExamDisplayState){
  const c=copy[state.language],practice=state.mode==='practice';
  const status=state.status==='running'?(practice?c.training:c.running):state.status==='passed'?(practice?c.complete:c.passed):state.status==='failed'?(practice?c.ended:c.failed):c[state.status];
  return {
    title:practice?c.practice:c.exam,
    time:formatExamDisplayTime(state.elapsed),status,
    statusColor:state.status==='failed'?'#793c3e':state.status==='paused'?'#705b31':state.status==='idle'?'#414d54':'#365d42',
    exerciseLabel:c.exercise,exercise:clean(state.exerciseName)||c.ready,
    pointsLabel:c.points,points:String(Math.round(finite(state.score))),
    eventsLabel:c.events,
    empty:state.status==='idle'?c.pending:c.empty,
    events:state.events.slice(-6).reverse().map(event=>({points:`+${Math.round(finite(event.points))}`,text:clean(event.text)})),
  };
}

function fitText(ctx:CanvasRenderingContext2D,text:string,width:number){
  if(ctx.measureText(text).width<=width)return text;
  let end=text.length;
  while(end>0&&ctx.measureText(`${text.slice(0,end)}…`).width>width)end--;
  return `${text.slice(0,end).trimEnd()}…`;
}

/** The examination centre's fitted monitor is powered independently from the engine. */
export class CabinExamDisplay {
  private canvas:HTMLCanvasElement|undefined;
  private context:CanvasRenderingContext2D|undefined;
  private texture:T.CanvasTexture|undefined;
  private materials:T.MeshBasicMaterial[]=[];
  private lastDisplay='';

  constructor(model:T.Object3D){
    const screens:{mesh:T.Mesh;materials:T.Material[]}[]=[];
    model.traverse(node=>{
      if(!(node instanceof T.Mesh))return;
      const materials=Array.isArray(node.material)?node.material:[node.material];
      if(materials.some(material=>material.name==='COBALT_ExamDisplay'))screens.push({mesh:node,materials});
    });
    if(!screens.length)return;
    this.canvas=document.createElement('canvas');this.canvas.width=1280;this.canvas.height=720;
    this.context=this.canvas.getContext('2d')??undefined;
    if(!this.context)return;
    this.texture=new T.CanvasTexture(this.canvas);this.texture.colorSpace=T.SRGBColorSpace;this.texture.flipY=false;
    // An unlit LCD keeps its black/green appearance in daylight and in the cabin's
    // shadow, without bright emissive geometry or a fictitious light source.
    const replacements=new Map<T.Material,T.MeshBasicMaterial>();
    for(const {mesh,materials}of screens){
      const fitted=materials.map(original=>{
        if(original.name!=='COBALT_ExamDisplay')return original;
        let screen=replacements.get(original);
        if(!screen){
          screen=new T.MeshBasicMaterial({name:original.name,map:this.texture,toneMapped:false,side:original.side});
          replacements.set(original,screen);this.materials.push(screen);
        }
        return screen;
      });
      mesh.material=Array.isArray(mesh.material)?fitted:fitted[0];
    }
    this.update({language:'ru',mode:'practice',status:'idle',elapsed:0,score:0,exerciseName:'',events:[]});
  }

  update(state:CabinExamDisplayState){
    if(!this.context||!this.texture)return;
    const content=examDisplayContent(state),key=JSON.stringify(content);
    if(key===this.lastDisplay)return;
    this.lastDisplay=key;
    const ctx=this.context;
    ctx.fillStyle='#242b30';ctx.fillRect(0,0,1280,720);
    ctx.textBaseline='middle';ctx.textAlign='left';
    ctx.strokeStyle='#a1afb6';ctx.lineWidth=1.5;
    const box=(x:number,y:number,w:number,h:number)=>ctx.strokeRect(x+.75,y+.75,w-1.5,h-1.5);
    ctx.fillStyle='#f0f3f5';ctx.font='600 31px Arial, sans-serif';
    ctx.fillText(fitText(ctx,content.title,960),30,51);
    box(1062,20,192,62);ctx.textAlign='center';ctx.font='600 39px Arial, sans-serif';ctx.fillText(content.time,1158,52);

    ctx.fillStyle=content.statusColor;ctx.fillRect(24,102,1232,62);box(24,102,1232,62);
    ctx.fillStyle='#f2fff4';ctx.font='500 37px Arial, sans-serif';ctx.fillText(content.status,640,134);

    ctx.textAlign='left';ctx.fillStyle='#c6d1d7';ctx.font='23px Arial, sans-serif';
    ctx.fillText(content.exerciseLabel,30,195);ctx.fillText(content.pointsLabel,975,195);
    ctx.fillStyle='#f3f5f6';ctx.font='500 34px Arial, sans-serif';ctx.fillText(fitText(ctx,content.exercise,902),30,238);
    ctx.textAlign='right';ctx.font='600 45px Arial, sans-serif';ctx.fillText(content.points,1244,238);
    ctx.strokeStyle='#6d7a83';ctx.beginPath();ctx.moveTo(950,180);ctx.lineTo(950,267);ctx.moveTo(24,278);ctx.lineTo(1256,278);ctx.stroke();

    ctx.textAlign='left';ctx.fillStyle='#c6d1d7';ctx.font='23px Arial, sans-serif';ctx.fillText(content.eventsLabel,30,306);
    // Keep the photographed monitor's fixed table visible as history fills it.
    // Unoccupied cells stay blank; they do not imply completed tasks or penalties.
    for(let index=0;index<6;index++){
      const y=332+index*56,event=content.events[index];
      ctx.fillStyle=index%2?'#2e373e':'#303b42';ctx.fillRect(24,y,1232,50);box(24,y,1232,50);
      ctx.beginPath();ctx.moveTo(108.75,y);ctx.lineTo(108.75,y+50);ctx.stroke();
      if(event){
        ctx.fillStyle='#f0f3f5';ctx.textAlign='center';ctx.font='600 27px Arial, sans-serif';ctx.fillText(event.points,66,y+25);
        ctx.textAlign='left';ctx.font='27px Arial, sans-serif';ctx.fillText(fitText(ctx,event.text,1105),128,y+25);
      }else if(index===0){
        ctx.fillStyle='#e4ecef';ctx.textAlign='left';ctx.font='27px Arial, sans-serif';ctx.fillText(fitText(ctx,content.empty,1105),128,y+25);
      }
    }
    this.texture.needsUpdate=true;
  }

  dispose(){
    this.texture?.dispose();this.materials.forEach(material=>material.dispose());
    this.texture=undefined;this.context=undefined;this.canvas=undefined;this.materials=[];
  }
}
