export const defaultBindings: Record<string,string> = {
  positionLights:'KeyG',headlights:'KeyL',fogLights:'KeyF',
  throttle:'KeyW',brake:'KeyS',left:'KeyA',right:'KeyD',clutch:'ShiftLeft',
  gear1:'Digit1',gear2:'Digit2',gear3:'Digit3',gear4:'Digit4',gear5:'Digit5',reverse:'KeyR',neutral:'KeyN',
  handbrake:'Space',indicatorLeft:'KeyQ',indicatorRight:'KeyE',hazards:'KeyH',belt:'KeyB',ignition:'KeyI',camera:'KeyC',pause:'Escape',lookLeft:'KeyZ',lookRight:'KeyX',
};
export class Input {
  held=new Set<string>();enabled=false;onAction:(action:string)=>void=()=>{};
  constructor(public bindings:Record<string,string>){
    window.addEventListener('keydown',e=>{
      if(!this.enabled || (e.target instanceof HTMLElement && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)))return;
      if(e.target instanceof HTMLElement&&e.target.closest('button')&&['Space','Enter','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))return;
      const action=Object.keys(this.bindings).find(a=>this.bindings[a]===e.code);
      if(!action)return;e.preventDefault();this.held.add(e.code);
      if(!e.repeat)this.onAction(action);
    });
    window.addEventListener('keyup',e=>this.held.delete(e.code));
    window.addEventListener('blur',()=>this.clear());
  }
  down(action:string){return this.enabled&&this.held.has(this.bindings[action]);}
  clear(){this.held.clear();}
}
