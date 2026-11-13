import {afterEach,describe,expect,it,vi} from 'vitest';
import {TouchSteering} from '../src/simulation/touch-steering';
import {Input,defaultBindings} from '../src/simulation/input';
import {readSettings} from '../src/ui/storage';

afterEach(()=>vi.unstubAllGlobals());
describe('touch steering gestures',()=>{
  it('takes hold without jumping, turns proportionally, and uses the vehicle left/right convention',()=>{
    const wheel=new TouchSteering();wheel.begin(0,-1);
    expect(wheel.command).toBeCloseTo(0);
    expect(wheel.move(1,0)).toBeCloseTo(-90/TouchSteering.lock);
    expect(wheel.angle).toBeCloseTo(90);
    wheel.begin(-1,0);expect(wheel.command).toBeCloseTo(-90/TouchSteering.lock);
    expect(wheel.move(0,1)).toBeCloseTo(0);
  });
  it('crosses the angle seam without reversing or jumping to lock',()=>{
    const wheel=new TouchSteering();
    const point=(degrees:number)=>[Math.cos(degrees*Math.PI/180),Math.sin(degrees*Math.PI/180)] as const;
    wheel.begin(...point(179));wheel.move(...point(-179));expect(wheel.angle).toBeCloseTo(2);
    wheel.move(...point(178));expect(wheel.angle).toBeCloseTo(-1);
  });
  it('ignores the ambiguous centre, clamps at both locks, and immediately unwinds from a lock',()=>{
    const point=(degrees:number)=>[Math.cos(degrees*Math.PI/180),Math.sin(degrees*Math.PI/180)] as const;
    const wheel=new TouchSteering();wheel.begin(...point(0));wheel.move(0,0);expect(wheel.angle).toBe(0);
    for(let angle=90;angle<=630;angle+=90)wheel.move(...point(angle));
    expect(wheel.command).toBe(-1);expect(wheel.angle).toBe(TouchSteering.lock);
    wheel.move(...point(615));expect(wheel.angle).toBeCloseTo(TouchSteering.lock-15);
    for(let angle=525;angle>=-555;angle-=90)wheel.move(...point(angle));
    expect(wheel.command).toBe(1);
  });
});
function input(){vi.stubGlobal('window',new EventTarget());const value=new Input({...defaultBindings});value.enabled=true;return value;}
describe('independent touch and keyboard inputs',()=>{
  it('supports simultaneous steering, throttle, and clutch without manufacturing key events',()=>{
    const value=input(),actions:string[]=[];value.onAction=action=>actions.push(action);
    value.press('throttle');value.press('clutch');value.press('throttle');value.setTouchSteering(.3);
    expect(actions).toEqual(['throttle','clutch']);expect(value.down('throttle')).toBe(true);expect(value.down('clutch')).toBe(true);expect(value.steeringCommand()).toBe(.3);
    value.release('clutch');expect(value.down('throttle')).toBe(true);expect(value.down('clutch')).toBe(false);
    value.clear();expect(value.down('throttle')).toBe(false);expect(value.steeringCommand()).toBe(0);
  });
  it('does not release a held keyboard pedal when the same touch pedal is released',()=>{
    const value=input();value.held.add('KeyW');value.press('throttle');value.release('throttle');expect(value.down('throttle')).toBe(true);
    value.held.add('KeyA');value.setTouchSteering(-.2);expect(value.steeringCommand()).toBe(-.2);
    value.setTouchSteering(null);expect(value.steeringCommand()).toBe(1);
    value.enabled=false;expect(value.down('throttle')).toBe(false);expect(value.steeringCommand()).toBe(0);
  });
  it('ignores touch actions while paused and clears held inputs when focus is lost',()=>{
    const value=input(),action=vi.fn();value.onAction=action;value.enabled=false;
    value.press('throttle');value.trigger('ignition');expect(action).not.toHaveBeenCalled();
    value.enabled=true;expect(value.down('throttle')).toBe(false);value.press('brake');value.setTouchSteering(-1);
    window.dispatchEvent(new Event('blur'));expect(value.down('brake')).toBe(false);expect(value.steeringCommand()).toBe(0);
  });
});
describe('mobile graphics defaults',()=>{
  it('uses a lighter default on touch devices and preserves an explicit graphics preference',()=>{
    vi.stubGlobal('window',{matchMedia:()=>({matches:true})});vi.stubGlobal('localStorage',{getItem:()=>null});
    expect(readSettings().quality).toBe('low');
    vi.stubGlobal('localStorage',{getItem:()=>'{"quality":"high"}'});expect(readSettings().quality).toBe('high');
    vi.stubGlobal('window',{matchMedia:()=>({matches:false})});vi.stubGlobal('navigator',{maxTouchPoints:0});vi.stubGlobal('localStorage',{getItem:()=>null});
    expect(readSettings().quality).toBe('medium');
  });
});
