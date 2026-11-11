import type {Settings} from '../types';
import {cockpitLimits,readCockpitView,type CockpitView} from '../render/cockpit-view';
export const cockpitCopy={
 ru:{title:'Посадка в салоне',height:'Высота посадки',back:'Вперёд / назад',fov:'Угол обзора',backward:'назад',forward:'вперёд',cm:'см',reset:'Рекомендуемый обзор',help:'Настройте высоту и расстояние до руля. Изменения видны в камере салона и сохраняются.'},
 uz:{title:'Salonda o‘tirish',height:'O‘tirish balandligi',back:'Oldinga / orqaga',fov:'Ko‘rish burchagi',backward:'orqaga',forward:'oldinga',cm:'sm',reset:'Tavsiya etilgan ko‘rinish',help:'Balandlik va rulgacha masofani sozlang. O‘zgarishlar salon kamerasida ko‘rinadi va saqlanadi.'},
};
export function createCockpitControls(settings:Settings,change:()=>void,preview:()=>void,prefix:string){
 const c=cockpitCopy[settings.language],root=document.createElement('fieldset');root.className='cockpit-controls';
 root.innerHTML=`<legend>${c.title}</legend><p class="cockpit-help">${c.help}</p>${(['height','back','fov']as const).map(key=>{
  const limits=cockpitLimits[key],id=`${prefix}-${key}`;
  return `<label for="${id}"><span>${c[key]}</span><output for="${id}" data-seat-output="${key}"></output><input id="${id}" data-seat-axis="${key}" type="range" min="${limits.min}" max="${limits.max}" step="1" value="${settings.cockpit[key]}"></label>`;
 }).join('')}<button type="button" class="cockpit-reset">${c.reset}</button>`;
 const sync=()=>{
  for(const key of ['height','back','fov']as const){
   const value=settings.cockpit[key],text=key==='fov'?`${value}°`:key==='back'?`${value===0?'':value>0?c.backward:c.forward} ${Math.abs(value)} ${c.cm}`.trim():`${value>0?'+':''}${value} ${c.cm}`;
   const input=root.querySelector<HTMLInputElement>(`[data-seat-axis="${key}"]`)!;
   input.value=String(value);input.setAttribute('aria-valuetext',text);root.querySelector(`[data-seat-output="${key}"]`)!.textContent=text;
  }
 };
 root.addEventListener('input',event=>{
  const input=event.target as HTMLInputElement,key=input.dataset.seatAxis as keyof CockpitView|undefined;if(!key)return;
  settings.cockpit=readCockpitView({...settings.cockpit,[key]:Number(input.value)});sync();preview();change();
 });
 root.querySelector('button')!.addEventListener('click',()=>{settings.cockpit=readCockpitView(null);sync();preview();change();});
 sync();return root;
}
