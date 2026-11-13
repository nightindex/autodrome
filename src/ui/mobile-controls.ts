import type {Input} from '../simulation/input';
import {TouchSteering} from '../simulation/touch-steering';
import {steeringConfig} from '../data/steering';
import type {Language,VehicleTelemetry} from '../types';
import {touchDevice} from '../device';
import {icon} from './icons';
import {requestLandscapeFullscreen} from './mobile-display';

const copy={
  uz:{wheel:'Rul',drag:'Burish uchun aylantiring',throttle:'Gaz',brake:'Tormoz',clutch:'Ilashish',
    ignition:'Dvigatel',belt:'Kamar',handbrake:'Qo‘l tormozi',left:'Chap burilish',right:'O‘ng burilish',hazards:'Avariya',
    start:'Dvigatelni ishga tushirish',stop:'Dvigatelni o‘chirish',restart:'Dvigatel o‘chib qoldi. Qayta ishga tushirish',startLabel:'Start',
    fasten:'Kamarni taqish',unfasten:'Kamarni yechish',beltReady:'Kamar taqilgan. Boshqaruvni ochish',
    down:'Pastki uzatma',up:'Yuqori uzatma',fullscreen:'To‘liq ekran',exitFullscreen:'Ekranni kichraytirish',
    help:'Rulni aylantiring. Gaz va tormozni bosib turing. Uzatmani − / + bilan tanlang. Orqaga yurish: N → R, so‘ng gaz.',
    controls:'Sensorli boshqaruv'},
  ru:{wheel:'Руль',drag:'Поворачивайте пальцем',throttle:'Газ',brake:'Тормоз',clutch:'Сцепление',
    ignition:'Двигатель',belt:'Ремень',handbrake:'Ручник',left:'Левый поворот',right:'Правый поворот',hazards:'Аварийка',
    start:'Завести двигатель',stop:'Заглушить двигатель',restart:'Двигатель заглох. Завести снова',startLabel:'Запуск',
    fasten:'Пристегнуть ремень',unfasten:'Отстегнуть ремень',beltReady:'Ремень пристёгнут. Открыть управление',
    down:'Понизить передачу',up:'Повысить передачу',fullscreen:'На весь экран',exitFullscreen:'Выйти из полного экрана',
    help:'Вращайте руль. Удерживайте газ и тормоз. Передачи: − / +. Задний ход: N → R, затем газ.',
    controls:'Сенсорное управление'},
};

/** Independent pointer captures let a thumb steer while another holds a pedal. */
export class MobileControls {
  private abort=new AbortController();
  private root:HTMLElement;
  private wheel:HTMLElement;
  private wheelImage:HTMLElement;
  private steering=new TouchSteering();
  private wheelPointer:number|null=null;
  private pointers=new Map<number,{action:string;button:HTMLElement}>();
  private touchActionAt=-Infinity;
  private gear=0;
  private fullscreen:HTMLButtonElement;
  private beltFastened=false;
  private beltMenu:HTMLButtonElement|undefined;
  private ignitionMenu:HTMLButtonElement|undefined;
  private mobile=touchDevice();
  private c:typeof copy[Language];
  constructor(private hud:HTMLElement,private input:Input,language:Language,private openVehicleControls:()=>void,hasMoved=false){
    this.c=copy[language];const c=this.c;
    if(touchDevice())document.documentElement.classList.add('touch-device');
    this.root=document.createElement('section');this.root.id='mobile-controls';this.root.setAttribute('aria-label',c.controls);
    const action=(name:string,text:string,art:string)=>`<button type="button" data-touch-action="${name}" aria-label="${text}" title="${text}" aria-pressed="false">${art}<span>${text}</span></button>`;
    const pedal=(name:'clutch'|'brake'|'throttle')=>`<button type="button" class="touch-pedal ${name}" data-touch-hold="${name}" aria-label="${c[name]}" aria-pressed="false"><svg viewBox="0 0 32 48" aria-hidden="true"><rect x="5" y="3" width="22" height="40" rx="5"/><path d="M11 10v25m5-25v25m5-25v25"/></svg><span>${c[name]}</span></button>`;
    this.root.innerHTML=`<div class="touch-wheel-area"><div id="touch-wheel" role="slider" tabindex="0" aria-label="${c.wheel}" aria-description="${c.drag}" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"><img src="/assets/controls/cobalt-wheel.png" alt="" width="512" height="512" draggable="false" decoding="async"></div><span class="touch-wheel-label">${c.drag}</span></div>
      <div class="touch-switches"><div class="touch-signals">${action('indicatorLeft',c.left,icon('turnLeft'))}${action('hazards',c.hazards,icon('hazards'))}${action('indicatorRight',c.right,icon('turnRight'))}</div><div class="touch-preparation">${action('ignition',c.ignition,icon('power'))}${action('belt',c.belt,icon('belt'))}${action('handbrake',c.handbrake,icon('parking'))}</div></div>
      <div class="touch-drive"><div class="touch-gears"><button type="button" data-touch-shift="-1" aria-label="${c.down}">${icon('minus')}</button><output id="touch-gear" aria-label="${language==='ru'?'Передача':'Uzatma'}" aria-live="polite">N</output><button type="button" data-touch-shift="1" aria-label="${c.up}">${icon('plus')}</button></div><div class="touch-pedals">${pedal('clutch')}${pedal('brake')}${pedal('throttle')}</div></div>`;
    this.hud.append(this.root);
    this.wheel=this.root.querySelector('#touch-wheel')!;this.wheelImage=this.wheel.querySelector('img')!;
    const options={signal:this.abort.signal};
    this.hud.addEventListener('pointerdown',e=>{if(e.isPrimary)this.touchActionAt=-Infinity;},{...options,capture:true});
    // A menu can disappear during pointerdown. Suppress its compatibility
    // click at the HUD too, so it cannot activate a newly exposed control.
    this.hud.addEventListener('click',e=>{
      if(e.detail>0&&performance.now()-this.touchActionAt<800){e.preventDefault();e.stopImmediatePropagation();}
    },{...options,capture:true});
    this.wheel.addEventListener('pointerdown',e=>{
      if(!this.input.enabled||this.wheelPointer!==null||e.button!==0)return;
      e.preventDefault();this.wheelPointer=e.pointerId;this.wheel.setPointerCapture(e.pointerId);
      const point=this.point(e);this.steering.begin(point.x,point.y);
      this.input.setTouchSteering(this.steering.command);this.wheel.dataset.held='true';
    },options);
    this.wheel.addEventListener('pointermove',e=>{
      if(e.pointerId!==this.wheelPointer)return;
      e.preventDefault();const point=this.point(e);this.input.setTouchSteering(this.steering.move(point.x,point.y));
    },options);
    const releaseWheel=(e:PointerEvent)=>{if(e.pointerId===this.wheelPointer){this.wheelPointer=null;this.input.setTouchSteering(null);this.wheel.dataset.held='false';}};
    for(const event of ['pointerup','pointercancel','lostpointercapture']as const)this.wheel.addEventListener(event,releaseWheel,options);
    this.wheel.addEventListener('keydown',e=>{
      if(!this.input.enabled||!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;
      e.preventDefault();e.stopPropagation();this.steering.angle=e.key==='Home'?0:Math.max(-TouchSteering.lock,Math.min(TouchSteering.lock,this.steering.angle+(e.key==='ArrowLeft'?-15:15)));
      this.input.setTouchSteering(this.steering.command);
    },options);
    this.wheel.addEventListener('keyup',e=>{if(['ArrowLeft','ArrowRight','Home'].includes(e.key)){e.stopPropagation();this.input.setTouchSteering(null);}},options);
    this.wheel.addEventListener('blur',()=>this.input.setTouchSteering(null),options);
    for(const button of this.root.querySelectorAll<HTMLElement>('[data-touch-hold]')){
      const action=button.dataset.touchHold!;
      button.addEventListener('pointerdown',e=>{
        if(!this.input.enabled||e.button!==0)return;
        e.preventDefault();button.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,{action,button});
        this.input.press(action);button.setAttribute('aria-pressed','true');
      },options);
      const release=(e:PointerEvent)=>{
        if(!this.pointers.delete(e.pointerId))return;
        if(![...this.pointers.values()].some(p=>p.action===action)){this.input.release(action);button.setAttribute('aria-pressed','false');}
      };
      for(const event of ['pointerup','pointercancel','lostpointercapture']as const)button.addEventListener(event,release,options);
      button.addEventListener('keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();this.input.press(action);button.setAttribute('aria-pressed','true');}},options);
      button.addEventListener('keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();e.stopPropagation();this.input.release(action);button.setAttribute('aria-pressed','false');}},options);
      button.addEventListener('blur',()=>{if(![...this.pointers.values()].some(p=>p.action===action)){this.input.release(action);button.setAttribute('aria-pressed','false');}},options);
    }
    this.root.querySelectorAll<HTMLElement>('[data-touch-action]').forEach(button=>this.touchClick(button,()=>{
      if(this.mobile&&button.dataset.touchAction==='belt'&&this.beltFastened)this.openVehicleControls();
      else this.input.trigger(button.dataset.touchAction!);
    }));
    this.root.querySelectorAll<HTMLElement>('[data-touch-shift]').forEach(button=>this.touchClick(button,()=>{
      const next=Math.max(-1,Math.min(5,this.gear+Number(button.dataset.touchShift)));
      this.input.trigger(next===-1?'reverse':next===0?'neutral':`gear${next}`);
    }));
    this.fullscreen=document.createElement('button');this.fullscreen.id='fullscreen-button';this.fullscreen.type='button';
    this.fullscreen.innerHTML=icon('fullscreen');this.fullscreen.setAttribute('aria-label',c.fullscreen);this.fullscreen.title=c.fullscreen;
    this.fullscreen.hidden=!document.fullscreenEnabled;
    this.hud.querySelector('#pause-button')!.before(this.fullscreen);
    this.fullscreen.addEventListener('click',()=>{
      const request=document.fullscreenElement?document.exitFullscreen():requestLandscapeFullscreen();
      void request.catch(()=>{});
    },options);
    // Browsers only synthesize a click for the primary touch. A second thumb
    // must still be able to shift, pause or switch cameras while a pedal is held.
    this.hud.querySelectorAll<HTMLElement>('.header-controls button:not(#fullscreen-button)').forEach(button=>this.touchClick(button,()=>button.click(),true));
    document.addEventListener('fullscreenchange',()=>{const label=document.fullscreenElement?c.exitFullscreen:c.fullscreen;this.fullscreen.setAttribute('aria-label',label);this.fullscreen.title=label;},options);
    window.addEventListener('blur',()=>this.reset(),options);
    window.addEventListener('resize',()=>this.reset(),options);
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();},options);
    const help=document.createElement('p');help.className='touch-control-help';help.textContent=c.help;
    this.hud.querySelector('#driving-controls .popover-heading')!.after(help);
    const preparation=this.root.querySelector<HTMLElement>('.touch-preparation')!;
    const parking=preparation.querySelector<HTMLElement>('[data-touch-action="handbrake"]')!;parking.classList.add('touch-handbrake');
    this.root.querySelector('.touch-drive')!.prepend(parking);
    if(this.mobile){
      preparation.className='touch-startup';preparation.dataset.ready='false';
      preparation.dataset.driven=String(hasMoved);preparation.hidden=hasMoved;
      const vehicleBar=document.createElement('div');vehicleBar.className='touch-vehicle';
      vehicleBar.append(preparation,parking);this.root.querySelector('.touch-drive')!.prepend(vehicleBar);
      const ignition=preparation.querySelector<HTMLElement>('[data-touch-action="ignition"]')!;
      ignition.setAttribute('aria-label',c.start);ignition.title=c.start;ignition.querySelector('span')!.textContent=c.startLabel;
      const belt=preparation.querySelector<HTMLElement>('[data-touch-action="belt"]')!;
      belt.setAttribute('aria-label',c.fasten);belt.title=c.fasten;
      const menu=document.createElement('div');menu.className='touch-preparation';
      menu.innerHTML=`<button type="button" data-vehicle-action="ignition" aria-pressed="false">${icon('power')}<span>${c.start}</span></button><button type="button" data-vehicle-action="belt" aria-pressed="false">${icon('belt')}<span>${c.fasten}</span></button>`;
      this.ignitionMenu=menu.querySelector('[data-vehicle-action="ignition"]')!;
      this.touchClick(this.ignitionMenu,()=>this.input.trigger('ignition'));
      this.beltMenu=menu.querySelector('[data-vehicle-action="belt"]')!;
      this.touchClick(this.beltMenu,()=>this.input.trigger('belt'));
      this.hud.querySelector('#driving-controls .popover-heading')!.after(menu);
    }else this.hud.querySelector('#driving-controls .popover-heading')!.after(preparation);
  }
  private touchClick(button:HTMLElement,action:()=>void,nativeClick=false){
    button.addEventListener('pointerdown',e=>{
      if(!this.input.enabled||e.pointerType==='mouse'||e.button!==0)return;
      e.preventDefault();this.touchActionAt=performance.now();action();
    },{signal:this.abort.signal});
    button.addEventListener('click',e=>{
      if(!nativeClick)action();
    },{capture:true,signal:this.abort.signal});
  }
  private point(e:PointerEvent){const r=this.wheel.getBoundingClientRect();return {x:(e.clientX-r.x-r.width/2)/(r.width/2),y:(e.clientY-r.y-r.height/2)/(r.height/2)};}
  private drawWheel(handwheelAngle:number){
    const degrees=handwheelAngle*180/Math.PI;
    this.wheelImage.style.transform=`rotate(${-degrees}deg)`;
    this.wheel.setAttribute('aria-valuenow',String(Math.round(degrees/steeringConfig.mechanics.maxHandwheelAngleDeg*100)));
  }
  frame(handwheelAngle:number,holdCommand:number){
    if(!document.documentElement.classList.contains('touch-device'))return;
    // Gesture travel uses the handwheel's full range. Both rendered wheels
    // show the same physical angle, with no separate animation lag.
    if(this.wheelPointer===null)this.steering.angle=-holdCommand*TouchSteering.lock;
    this.drawWheel(handwheelAngle);
  }
  update(t:VehicleTelemetry,hasMoved=false){
    this.beltFastened=t.belt;
    this.gear=t.gear;const text=t.gear<0?'R':t.gear===0?'N':String(t.gear);
    const output=this.root.querySelector('#touch-gear')!;if(output.textContent!==text)output.textContent=text;
    for(const [action,active]of Object.entries({ignition:t.engine,belt:t.belt,handbrake:t.handbrake,indicatorLeft:t.indicator==='left',indicatorRight:t.indicator==='right',hazards:t.hazards})){
      this.hud.querySelector(`[data-touch-action="${action}"]`)!.setAttribute('aria-pressed',String(active));
    }
    if(this.mobile){
      const startup=this.root.querySelector<HTMLElement>('.touch-startup')!;
      startup.dataset.ready=String(t.engine&&t.belt);
      startup.dataset.driven=String(hasMoved);
      const ignition=startup.querySelector<HTMLElement>('[data-touch-action="ignition"]')!;
      const ignitionLabel=t.engine?this.c.stop:t.stalled?this.c.restart:this.c.start;
      ignition.setAttribute('aria-label',ignitionLabel);ignition.title=ignitionLabel;ignition.dataset.stalled=String(t.stalled);
      ignition.querySelector('span')!.textContent=t.engine?this.c.ignition:this.c.startLabel;
      const belt=startup.querySelector<HTMLElement>('[data-touch-action="belt"]')!;
      belt.setAttribute('aria-label',t.belt?this.c.beltReady:this.c.fasten);belt.title=t.belt?this.c.beltReady:this.c.fasten;
      if(t.belt){
        belt.removeAttribute('aria-pressed');belt.setAttribute('aria-controls','driving-controls');
        belt.setAttribute('aria-expanded',this.hud.querySelector('#controls-button')!.getAttribute('aria-expanded')!);
      }else{
        belt.removeAttribute('aria-controls');belt.removeAttribute('aria-expanded');
      }
      belt.dataset.fastened=String(t.belt);
      const hideIgnition=hasMoved&&t.engine,hideBelt=hasMoved&&t.belt;
      if(hideIgnition&&document.activeElement===ignition||hideBelt&&document.activeElement===belt)this.hud.querySelector<HTMLButtonElement>('#controls-button')!.focus({preventScroll:true});
      ignition.hidden=hideIgnition;belt.hidden=hideBelt;startup.hidden=hideIgnition&&hideBelt;
      this.ignitionMenu!.setAttribute('aria-pressed',String(t.engine));
      this.ignitionMenu!.querySelector('span')!.textContent=t.engine?this.c.stop:this.c.start;
      this.beltMenu!.setAttribute('aria-pressed',String(t.belt));
      this.beltMenu!.querySelector('span')!.textContent=t.belt?this.c.unfasten:this.c.fasten;
    }
  }
  reset(){
    for(const {action,button}of this.pointers.values()){this.input.release(action);button.setAttribute('aria-pressed','false');}
    this.pointers.clear();this.wheelPointer=null;this.input.setTouchSteering(null);this.wheel.dataset.held='false';
    for(const action of ['throttle','brake','clutch'])this.input.release(action);
  }
  dispose(){this.reset();this.abort.abort();this.root.remove();this.fullscreen.remove();this.hud.querySelector('.touch-preparation')?.remove();}
}
