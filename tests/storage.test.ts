import { afterEach,describe,expect,it,vi } from 'vitest';
import { readSettings,saveSettings } from '../src/ui/storage';

afterEach(()=>vi.unstubAllGlobals());
function storage(raw:string|null){
  let value=raw;
  vi.stubGlobal('localStorage',{getItem:()=>value,setItem:(_key:string,next:string)=>{value=next;}});
}
describe('steering assistance preferences',()=>{
  it('updates the old standard seat once without overwriting custom or newly selected positions',()=>{
    storage('{"cockpit":{"height":8,"back":12,"fov":64}}');
    const settings=readSettings();expect(settings.cockpit.back).toBe(18);expect(settings.cockpitVersion).toBe(4);
    settings.cockpit.back=12;saveSettings(settings);expect(readSettings().cockpit.back).toBe(12);
    storage('{"cockpitVersion":2,"cockpit":{"height":8,"back":14,"fov":64}}');expect(readSettings().cockpit.back).toBe(18);
    storage('{"cockpit":{"height":4,"back":10,"fov":60}}');expect(readSettings().cockpit).toEqual({height:4,back:10,fov:60});
  });
  it('migrates seating preferences and persists a custom cockpit view',()=>{
    storage('{}');const settings=readSettings();expect(settings.cockpit).toEqual({height:8,back:18,fov:64});
    settings.cockpit={height:4,back:10,fov:60};saveSettings(settings);expect(readSettings().cockpit).toEqual(settings.cockpit);
    storage('{"cockpit":{"height":999,"back":"bad","fov":20}}');expect(readSettings().cockpit).toEqual({height:12,back:18,fov:50});
  });
  it.each([null,'{}','{"curbStyle":"invalid"}','{"curbStyle":null}'])('defaults to yellow/black curbs for new, legacy or invalid settings: %s',raw=>{
    storage(raw);expect(readSettings().curbStyle).toBe('yellow-black');
  });
  it('persists each curb style without changing the driving preferences',()=>{
    storage('{}');const settings=readSettings();settings.curbStyle='white';settings.assist=false;saveSettings(settings);
    expect(readSettings().curbStyle).toBe('white');expect(readSettings().assist).toBe(false);
    settings.curbStyle='yellow-black';saveSettings(settings);expect(readSettings().curbStyle).toBe('yellow-black');
  });
  it('adds lighting controls without taking an existing custom key binding',()=>{
    storage('{"bindings":{"gear1":"KeyL","belt":"KeyF","camera":"KeyG","gear2":"KeyM"}}');
    const bindings=readSettings().bindings;
    expect(bindings.gear1).toBe('KeyL');expect(bindings.belt).toBe('KeyF');
    expect(bindings.headlights).not.toBe('KeyL');expect(bindings.fogLights).not.toBe('KeyF');
    expect(bindings.camera).toBe('KeyG');expect(bindings.positionLights).not.toBe('KeyG');
    expect(bindings.gear2).toBe('KeyM');expect(bindings.map).not.toBe('KeyM');
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
