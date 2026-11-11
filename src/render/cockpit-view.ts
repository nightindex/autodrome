import {Vector3} from 'three';

/** Centimetres from the fitted original eye; FOV is vertical degrees. */
export interface CockpitView {height:number;back:number;fov:number}
export const defaultCockpitView:Readonly<CockpitView>={height:8,back:18,fov:64};
export const cockpitLimits={height:{min:-4,max:12},back:{min:-4,max:25},fov:{min:50,max:80}} as const;
export function readCockpitView(value:unknown):CockpitView{
 const raw=value&&typeof value==='object'?value as Record<string,unknown>:{};
 const read=(key:keyof CockpitView)=>{
  const value=raw[key],limits=cockpitLimits[key];
  return typeof value==='number'&&Number.isFinite(value)?Math.max(limits.min,Math.min(limits.max,value)):defaultCockpitView[key];
 };
 return {height:read('height'),back:read('back'),fov:read('fov')};
}
/** Apply centimetres after dimensional fitting, without accumulating offsets. */
export function cockpitEyePosition(base:Vector3,view:CockpitView){return base.clone().add(new Vector3(0,view.height/100,-view.back/100));}

/** Keep the 16:9 horizontal view when a desktop window becomes wider.
 * Narrow/portrait displays retain their vertical framing. The saved slider
 * value always describes the reference view, never a transient window size. */
export function cockpitVerticalFov(fov:number,aspect:number){
 const ratio=Number.isFinite(aspect)&&aspect>0?Math.max(16/9,aspect):16/9;
 return 2*Math.atan(Math.tan(fov*Math.PI/360)*(16/9)/ratio)*180/Math.PI;
}
