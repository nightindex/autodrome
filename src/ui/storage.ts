import type { Settings } from '../types';
import { defaultBindings } from '../simulation/input';
import { readMirrorAdjustments } from '../render/mirror-adjustment';
const key='avtodrom.settings.v1';
export function readSettings():Settings{
  const defaults:Settings={mirrors:readMirrorAdjustments(null),language:'uz',quality:'medium',volume:.35,assist:true,steeringAssist:false,examMinutes:15,bindings:{...defaultBindings},results:[]};
  try{const raw=JSON.parse(localStorage.getItem(key)??'null');if(!raw)return defaults;
    const savedBindings=raw.bindings&&typeof raw.bindings==='object'?raw.bindings:{};
    const bindings={...defaultBindings};for(const [k,v]of Object.entries(savedBindings)){if(k in bindings&&typeof v==='string')bindings[k]=v;}
    for(const action of ['positionLights','headlights','fogLights'])if(!(action in savedBindings)&&Object.keys(bindings).some(other=>other!==action&&bindings[other]===bindings[action])){bindings[action]=['KeyG','KeyL','KeyF','KeyJ','KeyK','KeyO','KeyP'].find(code=>!Object.values(bindings).includes(code))??'';}
    return {...defaults,mirrors:readMirrorAdjustments(raw.mirrors),language:raw.language==='ru'?'ru':'uz',quality:['low','medium','high'].includes(raw.quality)?raw.quality:'medium',volume:Number.isFinite(raw.volume)?Math.max(0,Math.min(1,raw.volume)):.35,assist:typeof raw.assist==='boolean'?raw.assist:true,steeringAssist:typeof raw.steeringAssist==='boolean'?raw.steeringAssist:false,examMinutes:Number.isFinite(raw.examMinutes)?Math.max(1,Math.min(60,raw.examMinutes)):15,bindings,results:Array.isArray(raw.results)?raw.results.filter((r:unknown)=>r&&typeof r==='object'&&'events'in r&&Array.isArray(r.events)).slice(-10):[]};
  }catch{return defaults;}
}
export function saveSettings(s:Settings){try{localStorage.setItem(key,JSON.stringify(s));}catch{/* Driving remains available when storage is unavailable. */}}
