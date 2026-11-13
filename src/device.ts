/** Detect the available input, including tablets with a connected mouse. */
export function touchDevice(){
  return typeof window!=='undefined'&&(
    window.matchMedia?.('(pointer: coarse)').matches||
    (typeof navigator!=='undefined'&&navigator.maxTouchPoints>0));
}
