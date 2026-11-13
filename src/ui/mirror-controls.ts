import type { Settings } from '../types';
import {icon} from './icons';
import { mirrorLimits,readMirrorAdjustments,type MirrorSide } from '../render/mirror-adjustment';

const labels={
  ru:{title:'Зеркала',left:'Левое зеркало',right:'Правое зеркало',lock:'Регулировка выключена',close:'Закрыть регулировку',hint:'Выберите зеркало. Удерживайте стрелку для регулировки.',up:'Наклонить вверх',down:'Наклонить вниз',leftward:'Повернуть влево',rightward:'Повернуть вправо',reset:'Сбросить это зеркало',defaults:'Стандартное положение обоих зеркал',defaultButton:'По умолчанию'},
  uz:{title:'Ko‘zgular',left:'Chap ko‘zgu',right:'O‘ng ko‘zgu',lock:'Sozlash o‘chirilgan',close:'Sozlashni yopish',hint:'Ko‘zguni tanlang. Sozlash uchun o‘qni bosib turing.',up:'Yuqoriga',down:'Pastga',leftward:'Chapga',rightward:'O‘ngga',reset:'Bu ko‘zguni tiklash',defaults:'Ikkala ko‘zguning standart holati',defaultButton:'Standart'},
};

/** A held pad behaves like a momentary electric mirror switch. */
export class MirrorControls {
  private selected:MirrorSide|null='left';private abort=new AbortController();
  private frame=0;private held:HTMLButtonElement|undefined;private open=false;
  private panel:HTMLElement;private toggle:HTMLButtonElement;
  constructor(private hud:HTMLElement,private settings:Settings,private change:(persist:boolean)=>void,private preview:(side:MirrorSide|null)=>void,activate:()=>void){
    const c=labels[settings.language],signal=this.abort.signal;
    this.toggle=document.createElement('button');this.toggle.id='mirrors-button';this.toggle.innerHTML=`${icon('mirror')}<span>${c.title}</span>`;this.toggle.title=c.title;this.toggle.setAttribute('aria-label',c.title);
    this.toggle.setAttribute('aria-expanded','false');this.toggle.setAttribute('aria-controls','mirror-controls');
    hud.querySelector('.header-controls')!.prepend(this.toggle);
    this.panel=document.createElement('section');this.panel.id='mirror-controls';this.panel.hidden=true;this.panel.setAttribute('aria-label',c.title);
    this.panel.innerHTML=`<div class="mirror-heading"><strong>${c.title}</strong><button id="mirror-close" aria-label="${c.close}">×</button></div>
      <div class="mirror-selector" role="group" aria-label="${c.title}"><button data-mirror="left" aria-label="${c.left}" aria-pressed="true">L</button><button data-mirror="off" aria-label="${c.lock}" aria-pressed="false">0</button><button data-mirror="right" aria-label="${c.right}" aria-pressed="false">R</button></div>
      <p>${c.hint}</p><div class="mirror-pad" role="group" aria-label="${c.title}">
      <button data-mirror-axis="pitch" data-step="1" class="mirror-up" aria-label="${c.up}">↑</button>
      <button data-mirror-axis="yaw" data-step="-1" class="mirror-left" aria-label="${c.leftward}">←</button><span aria-hidden="true">＋</span>
      <button data-mirror-axis="yaw" data-step="1" class="mirror-right" aria-label="${c.rightward}">→</button>
      <button data-mirror-axis="pitch" data-step="-1" class="mirror-down" aria-label="${c.down}">↓</button></div>
      <output id="mirror-angles"></output><button id="mirror-reset">${c.reset}</button>
      <button id="mirror-default" title="${c.defaults}" aria-label="${c.defaults}">${c.defaultButton}</button>`;
    hud.append(this.panel);
    this.toggle.addEventListener('click',()=>{if(!this.open)activate();this.setOpen(!this.open);},{signal});
    this.panel.querySelector('#mirror-close')!.addEventListener('click',()=>this.setOpen(false,true),{signal});
    this.panel.querySelectorAll<HTMLButtonElement>('[data-mirror]').forEach(button=>button.addEventListener('click',()=>{
      this.stop();this.selected=button.dataset.mirror==='off'?null:button.dataset.mirror as MirrorSide;this.update();this.preview(this.selected);
    },{signal}));
    this.panel.querySelectorAll<HTMLButtonElement>('[data-mirror-axis]').forEach(button=>{
      button.addEventListener('pointerdown',event=>{
        if(event.button!==0||!this.selected)return;event.preventDefault();this.stop();this.held=button;button.setPointerCapture(event.pointerId);
        button.dataset.held='true';this.nudge(button,1);let previous=performance.now(),delay=previous+250;
        const repeat=(now:number)=>{if(this.held!==button)return;if(now>=delay)this.nudge(button,12*Math.min(.05,(now-Math.max(previous,delay))/1000));previous=now;this.frame=requestAnimationFrame(repeat);};
        this.frame=requestAnimationFrame(repeat);
      },{signal});
      for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,()=>this.stop(),{signal});
      button.addEventListener('click',event=>{if(event.detail===0){this.nudge(button,1);this.change(true);}},{signal});
    });
    this.panel.querySelector('#mirror-reset')!.addEventListener('click',()=>{
      this.stop();if(this.selected){this.settings.mirrors[this.selected]={yaw:0,pitch:0};this.change(true);this.update();}
    },{signal});
    this.panel.querySelector('#mirror-default')!.addEventListener('click',()=>{
      this.stop();this.settings.mirrors=readMirrorAdjustments(null);this.change(true);this.update();
    },{signal});
    window.addEventListener('blur',()=>this.stop(),{signal});
    window.addEventListener('pointerup',()=>this.stop(),{signal});
    window.addEventListener('pointercancel',()=>this.stop(),{signal});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)this.stop();},{signal});
    window.addEventListener('keydown',event=>{
      if(this.open&&event.code==='Escape'){event.preventDefault();event.stopImmediatePropagation();this.setOpen(false,true);}
    },{capture:true,signal});
    this.update();
  }
  private nudge(button:HTMLButtonElement,amount:number){
    if(!this.selected||button.disabled)return;
    const axis=button.dataset.mirrorAxis as 'yaw'|'pitch',angles=this.settings.mirrors[this.selected];
    angles[axis]=Math.max(-mirrorLimits[axis],Math.min(mirrorLimits[axis],angles[axis]+Number(button.dataset.step)*amount));
    this.change(false);this.update();
  }
  private stop(){
    cancelAnimationFrame(this.frame);this.frame=0;
    if(this.held){delete this.held.dataset.held;this.held=undefined;this.change(true);}
  }
  private update(){
    this.panel.querySelectorAll<HTMLButtonElement>('[data-mirror]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.mirror===(this.selected??'off'))));
    this.panel.querySelectorAll<HTMLButtonElement>('[data-mirror-axis]').forEach(button=>{
      const axis=button.dataset.mirrorAxis as 'yaw'|'pitch',step=Number(button.dataset.step),value=this.selected?this.settings.mirrors[this.selected][axis]:0;
      button.disabled=!this.selected||(step>0?value>=mirrorLimits[axis]:value<=-mirrorLimits[axis]);
    });
    this.panel.querySelector<HTMLButtonElement>('#mirror-reset')!.disabled=!this.selected;
    const angle=(value:number)=>`${value>0?'+':''}${value.toFixed(1)}°`;
    this.panel.querySelector('output')!.textContent=this.selected?`↔ ${angle(this.settings.mirrors[this.selected].yaw)}   ↕ ${angle(this.settings.mirrors[this.selected].pitch)}`:'—';
  }
  private setOpen(open:boolean,focus=false){
    this.stop();this.open=open;this.panel.hidden=!open;this.toggle.setAttribute('aria-expanded',String(open));this.hud.dataset.mirrorAdjusting=String(open);
    this.preview(open?this.selected:null);if(focus){const tools=this.toggle.closest<HTMLElement>('#driving-controls');(tools?.hidden?this.hud.querySelector<HTMLButtonElement>('#controls-button'):this.toggle)?.focus();}
  }
  setCamera(camera:string){if(this.open&&camera!=='cockpit')this.setOpen(false);}
  show(){this.setOpen(true);}
  close(){if(this.open)this.setOpen(false);else this.stop();}
  dispose(){this.close();this.abort.abort();this.toggle.remove();this.panel.remove();}
}
