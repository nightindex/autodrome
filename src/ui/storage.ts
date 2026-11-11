import type { Settings } from '../types';
import { defaultBindings } from '../simulation/input';
import { readMirrorAdjustments } from '../render/mirror-adjustment';
import {readCockpitView} from '../render/cockpit-view';
const key='avtodrom.settings.v1';
export function readSettings():Settings{
  const defaults:Settings={cockpitVersion:4,cockpit:readCockpitView(null),curbStyle:'yellow-black',mirrors:readMirrorAdjustments(null),language:'uz',quality:'medium',volume:.35,assist:true,steeringAssist:false,examMinutes:15,bindings:{...defaultBindings},results:[]};
  try{const raw=JSON.parse(localStorage.getItem(key)??'null');if(!raw)return defaults;
    // Upgrade the previous standard seating once; preserve custom positions,
    // including a deliberately selected 12 cm position after this revision.
    if(raw.cockpitVersion!==4&&raw.cockpit?.height===8&&[12,14,16].includes(raw.cockpit?.back)&&raw.cockpit?.fov===64)raw.cockpit={...raw.cockpit,back:18};
    const savedBindings=raw.bindings&&typeof raw.bindings==='object'?raw.bindings:{};
    const bindings={...defaultBindings};for(const [k,v]of Object.entries(savedBindings)){if(k in bindings&&typeof v==='string')bindings[k]=v;}
    for(const action of ['positionLights','headlights','fogLights','map'])if(!(action in savedBindings)&&Object.keys(bindings).some(other=>other!==action&&bindings[other]===bindings[action])){bindings[action]=['KeyG','KeyL','KeyF','KeyJ','KeyK','KeyO','KeyP','KeyM'].find(code=>!Object.values(bindings).includes(code))??'';}
    return {...defaults,cockpit:readCockpitView(raw.cockpit),curbStyle:raw.curbStyle==='white'?'white':'yellow-black',mirrors:readMirrorAdjustments(raw.mirrors),language:raw.language==='ru'?'ru':'uz',quality:['low','medium','high'].includes(raw.quality)?raw.quality:'medium',volume:Number.isFinite(raw.volume)?Math.max(0,Math.min(1,raw.volume)):.35,assist:typeof raw.assist==='boolean'?raw.assist:true,steeringAssist:typeof raw.steeringAssist==='boolean'?raw.steeringAssist:false,examMinutes:Number.isFinite(raw.examMinutes)?Math.max(1,Math.min(60,raw.examMinutes)):15,bindings,results:Array.isArray(raw.results)?raw.results.filter((r:unknown)=>r&&typeof r==='object'&&'events'in r&&Array.isArray(r.events)).slice(-10):[]};
  }catch{return defaults;}
}
export function saveSettings(s:Settings){try{localStorage.setItem(key,JSON.stringify(s));}catch{/* Driving remains available when storage is unavailable. */}}
