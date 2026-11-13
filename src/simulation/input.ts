import {steeringConfig} from '../data/steering';

export const defaultBindings: Record<string,string> = {
  positionLights:'KeyG',headlights:'KeyL',fogLights:'KeyF',map:'KeyM',
  throttle:'KeyW',brake:'KeyS',left:'KeyA',right:'KeyD',clutch:'ShiftLeft',
  gear1:'Digit1',gear2:'Digit2',gear3:'Digit3',gear4:'Digit4',gear5:'Digit5',reverse:'KeyR',neutral:'KeyN',
  handbrake:'Space',indicatorLeft:'KeyQ',indicatorRight:'KeyE',hazards:'KeyH',belt:'KeyB',ignition:'KeyI',camera:'KeyC',pause:'Escape',lookLeft:'KeyZ',lookRight:'KeyX',
};
export class Input {
  held=new Set<string>();enabled=false;onAction:(action:string)=>void=()=>{};
  private touchHeld=new Set<string>();
  private touchSteering:number|null=null;
  private aliasCodes(action:string){return (steeringConfig.keyboard.aliases[action]??[])
    .filter(code=>!Object.entries(this.bindings).some(([boundAction,boundCode])=>boundAction!==action&&boundCode===code));}
  constructor(public bindings:Record<string,string>){
    window.addEventListener('keydown',e=>{
      if(!this.enabled || (e.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)))return;
      if(e.target instanceof HTMLElement&&e.target.closest('button,summary')&&['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
      const action=Object.keys(this.bindings).find(a=>this.bindings[a]===e.code)
        ??Object.keys(steeringConfig.keyboard.aliases).find(a=>steeringConfig.keyboard.aliases[a].includes(e.code));
      if(!action)return;e.preventDefault();this.held.add(e.code);
      if(!e.repeat)this.onAction(action);
    });
    window.addEventListener('keyup',e=>this.held.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
  }
  down(action:string){return this.enabled&&(this.touchHeld.has(action)||this.held.has(this.bindings[action])
    ||this.aliasCodes(action).some(code=>this.held.has(code)));}
  press(action:string){if(!this.enabled||this.touchHeld.has(action))return;this.touchHeld.add(action);this.onAction(action);}
  release(action:string){this.touchHeld.delete(action);}
  trigger(action:string){if(this.enabled)this.onAction(action);}
  setTouchSteering(value:number|null){this.touchSteering=value===null||!Number.isFinite(value)?null:Math.max(-1,Math.min(1,value));}
  steeringCommand(){return this.enabled?(this.touchSteering??(+this.down('left')-+this.down('right'))):0;}
  clear(){this.held.clear();this.touchHeld.clear();this.touchSteering=null;}
}
