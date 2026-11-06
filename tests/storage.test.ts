import { afterEach,describe,expect,it,vi } from 'vitest';
import { readSettings,saveSettings } from '../src/ui/storage';

afterEach(()=>vi.unstubAllGlobals());
function storage(raw:string|null){
  let value=raw;
  vi.stubGlobal('localStorage',{getItem:()=>value,setItem:(_key:string,next:string)=>{value=next;}});
}
describe('steering assistance preferences',()=>{
  it('adds lighting controls without taking an existing custom key binding',()=>{
    storage('{"bindings":{"gear1":"KeyL","belt":"KeyF","camera":"KeyG"}}');
    const bindings=readSettings().bindings;
    expect(bindings.gear1).toBe('KeyL');expect(bindings.belt).toBe('KeyF');
    expect(bindings.headlights).not.toBe('KeyL');expect(bindings.fogLights).not.toBe('KeyF');
    expect(bindings.camera).toBe('KeyG');expect(bindings.positionLights).not.toBe('KeyG');
    expect(new Set(Object.values(bindings)).size).toBe(Object.values(bindings).length);
  });
  it('persists both mirror positions without sharing their settings',()=>{
    storage('{}');const settings=readSettings();settings.mirrors.left={yaw:3,pitch:-2};settings.mirrors.right={yaw:-1,pitch:4};saveSettings(settings);
    expect(readSettings().mirrors).toEqual(settings.mirrors);
    storage('{"mirrors":{"left":{"yaw":200,"pitch":"bad"}}}');
    expect(readSettings().mirrors).toEqual({left:{yaw:8,pitch:0},right:{yaw:0,pitch:0}});
  });
  it.each([null,'{}','{"assist":true}','{"steeringAssist":"true"}','invalid'])('leaves the new aid off for absent, legacy or invalid settings: %s',(raw)=>{
    storage(raw);expect(readSettings().steeringAssist).toBe(false);
  });
  it('persists steering assistance independently from automatic clutch',()=>{
    storage(null);const settings=readSettings();settings.assist=false;settings.steeringAssist=true;saveSettings(settings);
    expect(readSettings().steeringAssist).toBe(true);expect(readSettings().assist).toBe(false);
    settings.steeringAssist=false;saveSettings(settings);expect(readSettings().steeringAssist).toBe(false);
  });
});
