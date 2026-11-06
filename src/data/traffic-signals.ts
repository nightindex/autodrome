import type { Vec2 } from '../types';

export type SignalAxis='north-south'|'east-west';
export type SignalColor='red'|'amber'|'green';
export const signalCycleSeconds=64;
export function signalAxis(normal:Vec2):SignalAxis{return Math.abs(normal.z)>=Math.abs(normal.x)?'north-south':'east-west';}

/** Local practice timings; opposing approaches agree, crossing roads never get green together. */
export function signalAspects(time:number,axis:SignalAxis='north-south'){
  const t=((time%signalCycleSeconds)+signalCycleSeconds)%signalCycleSeconds;
  const green=axis==='north-south'?t>=18&&t<48:t<13||t>=53;
  const amber=axis==='north-south'?t>=48&&t<51:t>=13&&t<16;
  const preparing=axis==='north-south'?t>=17&&t<18:t>=52&&t<53;
  const blinking=green&&(axis==='north-south'?t>=45:t>=10&&t<13);
  return {red:!green&&!amber,amber:amber||preparing,green:green&&(!blinking||Math.floor(t*2)%2===0),permitted:green,phase:green?(blinking?'green-blink':'green'):amber?'amber':preparing?'red-amber':'red'};
}
export function signalState(time:number,axis:SignalAxis='north-south'):SignalColor{
  const state=signalAspects(time,axis);
  return state.permitted?'green':state.amber?'amber':'red';
}
