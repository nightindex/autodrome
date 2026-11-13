import {afterEach,describe,expect,it,vi} from 'vitest';
import {requestLandscapeFullscreen} from '../src/ui/mobile-display';

afterEach(()=>vi.unstubAllGlobals());
function setup({fullscreen=true,touch=true}={}){
  const events:string[]=[];
  const doc={fullscreenElement:null as object|null,fullscreenEnabled:fullscreen,documentElement:{requestFullscreen:vi.fn(async()=>{events.push('fullscreen');doc.fullscreenElement={};})}};
  const lock=vi.fn(async(mode:string)=>{events.push(`lock:${mode}`);});
  vi.stubGlobal('document',doc);vi.stubGlobal('screen',{orientation:{lock}});
  vi.stubGlobal('window',{matchMedia:()=>({matches:touch})});vi.stubGlobal('navigator',{maxTouchPoints:touch?1:0});
  return {doc,lock,events};
}
describe('landscape fullscreen entry',()=>{
  it('enters fullscreen before requesting landscape on a touch device',async()=>{
    const {doc,events}=setup();expect(await requestLandscapeFullscreen()).toBe(true);
    expect(events).toEqual(['fullscreen','lock:landscape']);expect(doc.documentElement.requestFullscreen).toHaveBeenCalledWith({navigationUI:'hide'});
  });
  it('keeps the app usable when fullscreen and orientation lock are rejected',async()=>{
    const {doc,lock}=setup();doc.documentElement.requestFullscreen.mockRejectedValue(new Error('user activation required'));lock.mockRejectedValue(new Error('unsupported'));
    await expect(requestLandscapeFullscreen()).resolves.toBe(false);expect(lock).toHaveBeenCalledWith('landscape');
  });
  it('works with browsers without fullscreen or an orientation lock API',async()=>{
    const {doc}=setup({fullscreen:false});vi.stubGlobal('screen',{orientation:undefined});
    expect(await requestLandscapeFullscreen()).toBe(false);expect(doc.documentElement.requestFullscreen).not.toHaveBeenCalled();
  });
  it('does not request fullscreen twice when start and the first tap arrive together',async()=>{
    const {doc,lock}=setup();const first=requestLandscapeFullscreen(),second=requestLandscapeFullscreen();
    await Promise.all([first,second]);expect(doc.documentElement.requestFullscreen).toHaveBeenCalledTimes(1);expect(lock).toHaveBeenCalledTimes(1);
  });
  it('retains explicit desktop fullscreen without locking desktop orientation',async()=>{
    const {lock}=setup({touch:false});expect(await requestLandscapeFullscreen()).toBe(true);expect(lock).not.toHaveBeenCalled();
  });
});
