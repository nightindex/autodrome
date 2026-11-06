import { describe,expect,it } from 'vitest';
import * as T from 'three';
import { ColumnControls } from '../src/render/column-controls';

function fixture(){
  const model=new T.Group(),stalk=new T.Group(),wiper=new T.Group(),wheel=new T.Group();
  stalk.name='COBALT_INDICATOR_STALK';wiper.name='COBALT_WIPER_STALK';wheel.name='COBALT_STEERING_ASSEMBLY';
  model.add(stalk,wiper,wheel);
  return {model,stalk,wiper,wheel,controls:new ColumnControls(model)};
}
describe('column indicator switch',()=>{
  it('moves down for left, up for right and returns when the signal is cancelled',()=>{
    const {stalk,controls}=fixture(),tip=new T.Vector3(.1,0,0);
    for(let i=0;i<30;i++)controls.update('left',1/60);
    expect(tip.clone().applyQuaternion(stalk.quaternion).y).toBeLessThan(-.01);
    for(let i=0;i<30;i++)controls.update('right',1/60);
    expect(tip.clone().applyQuaternion(stalk.quaternion).y).toBeGreaterThan(.01);
    for(let i=0;i<60;i++)controls.update('off',1/60);
    expect(stalk.quaternion.angleTo(new T.Quaternion())).toBeLessThan(1e-7);
  });
  it('keeps a selected signal latched while the wheel turns and the right switch stays still',()=>{
    const {stalk,wiper,wheel,controls}=fixture();
    for(let i=0;i<60;i++)controls.update('left',1/60);
    const selected=stalk.quaternion.clone();
    for(let i=0;i<60;i++){wheel.rotation.z+=.1;controls.update('left',1/60);}
    expect(stalk.quaternion.angleTo(selected)).toBeLessThan(1e-7);
    expect(wiper.quaternion.angleTo(new T.Quaternion())).toBe(0);
  });
  it('uses a smooth movement with the same result at different rendering rates',()=>{
    const run=(hz:number)=>{const {controls,stalk}=fixture();for(let i=0;i<hz/2;i++)controls.update('right',1/hz);return stalk.quaternion;};
    expect(run(30).angleTo(run(120))).toBeLessThan(1e-7);
    const {controls,stalk}=fixture();controls.update('left',1/60);
    expect(stalk.quaternion.angleTo(new T.Quaternion())).toBeGreaterThan(0);
    expect(stalk.quaternion.angleTo(new T.Quaternion())).toBeLessThan(.16);
  });
  it('preserves the authored neutral orientation and supports an older asset',()=>{
    const {model,stalk}=fixture();stalk.rotation.set(.08,-.12,.04);
    const neutral=stalk.quaternion.clone(),controls=new ColumnControls(model);
    for(let i=0;i<60;i++)controls.update('right',1/60);
    for(let i=0;i<60;i++)controls.update('off',1/60);
    expect(stalk.quaternion.angleTo(neutral)).toBeLessThan(1e-7);
    expect(()=>new ColumnControls(new T.Group()).update('left',1/60)).not.toThrow();
  });
});
