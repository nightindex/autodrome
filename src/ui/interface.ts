import { MirrorControls } from './mirror-controls';
import type { MirrorSide } from '../render/mirror-adjustment';
import type { ExamResult, Exercise, Language, Mode, Settings, VehicleTelemetry } from '../types';
import { copy, formatTime, label, hudCopy } from './i18n';
import { course } from '../data/course';
import { rules, ruleById } from '../data/rules';
import { Minimap } from './minimap';
import {icon} from './icons';
import type { ExamEngine } from '../simulation/exam';
import { defaultBindings } from '../simulation/input';
import { exerciseFeedback } from './exercise-feedback';
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const keyName=(s:string)=>s.replace('Key','').replace('Digit','').replace('Left','').replace('Arrow','');
export interface UIActions {
  mirrorCamera:()=>void;
  lights:(action:'positionLights'|'headlights'|'fogLights')=>void;
  mirrorsChanged:(persist:boolean)=>void;mirrorSelect:(side:MirrorSide|null)=>void;
  recover:()=>void;start:(mode:Mode,index?:number)=>void;pause:()=>void;resume:()=>void;menu:()=>void;reset:()=>void;camera:()=>void;settingsChanged:()=>void;
}
export class Interface {
  root:HTMLElement;menuPanel:HTMLElement;hud:HTMLElement;modal:HTMLDialogElement;toastPanel:HTMLElement;
  private status='';private lastScore=-1;private lastExercise='';private toastTimer=0;
  private mini:HTMLCanvasElement;private speed:HTMLElement;private rpm:HTMLElement;private gear:HTMLElement;private telemetry:HTMLElement;
  private map!:Minimap;private mapOpen=false;private controlsOpen=false;
  ready=false;onBind:((code:string)=>void)|null=null;
  private returnToPause=false;private mirrorControls:MirrorControls|undefined;
  constructor(public settings:Settings,public actions:UIActions){
    this.root=document.querySelector('#app')!;
    this.root.innerHTML=`<div id="viewport" aria-label="3D avtodrom"></div><div class="vignette"></div><div id="menu-shell"></div><div id="hud" hidden></div><div id="toast" role="status" aria-live="polite"></div><dialog id="modal"></dialog>`;
    this.menuPanel=document.querySelector('#menu-shell')!;this.hud=document.querySelector('#hud')!;this.modal=document.querySelector('#modal')!;this.toastPanel=document.querySelector('#toast')!;
    this.renderMenu();this.renderHud();this.mini=this.hud.querySelector('canvas')!;this.speed=this.hud.querySelector('#speed')!;this.rpm=this.hud.querySelector('#rpm')!;this.gear=this.hud.querySelector('#gear')!;this.telemetry=this.hud.querySelector('#telemetry')!;
    // Pointer controls return keys to driving; keyboard activation retains focus.
    this.hud.addEventListener('click',event=>{const button=event.target instanceof Element?event.target.closest('button'):null;if(event.detail>0&&button===document.activeElement)(button as HTMLButtonElement).blur();});
    document.addEventListener('pointerdown',event=>{
      if(event.target instanceof Element&&!event.target.closest('#route-map,#driving-controls,.header-controls,#modal'))this.closeHudPanels();
    });
    window.addEventListener('keydown',event=>{
      if(event.code==='Escape'&&!this.modal.open&&this.closeHudPanels(true)){event.preventDefault();event.stopImmediatePropagation();}
    },true);
    this.modal.addEventListener('cancel',e=>{e.preventDefault();if(this.modal.dataset.type==='pause')this.actions.resume();else if(this.modal.dataset.type==='settings'&&this.returnToPause)this.actions.pause();else if(this.modal.dataset.type!=='result')this.modal.close();});
    window.addEventListener('keydown',e=>{if(this.onBind){e.preventDefault();e.stopImmediatePropagation();const bind=this.onBind;this.onBind=null;if(e.code==='Escape'){this.showSettings(this.returnToPause);return;}bind(e.code);}},true);
  }
  get c(){return copy[this.settings.language];}
  private hotkeys(text:string){const map:Record<string,string>={B:'belt',I:'ignition',Shift:'clutch','1':'gear1',Space:'handbrake',W:'throttle',S:'brake',A:'left',D:'right',Q:'indicatorLeft',E:'indicatorRight'};return text.replace(/\b(?:Shift|Space|B|I|1|W|S|A|D|Q|E)\b/g,k=>esc(keyName(this.settings.bindings[map[k]])));}
  get viewport(){return this.root.querySelector<HTMLElement>('#viewport')!;}
  openMirrorControls(){this.closeHudPanels();this.mirrorControls?.show();}
  private button(id:string,text:string,primary=false){return `<button id="${id}" class="${primary?'primary':'secondary'}">${text}</button>`;}
  renderMenu(){
    const c=this.c;
    this.menuPanel.innerHTML=`<header class="menu-header"><a class="brand" href="#" aria-label="Avtodrom"><span class="brand-mark">A<span></span></span>AVTODROM<span class="brand-edition">/ 01</span></a><div class="header-right"><span class="live-dot"></span><span>${c.local}</span><button class="language-button" id="lang">${this.settings.language==='uz'?'UZ':'RU'} <span>⌄</span></button></div></header>
      <main class="hero"><div class="eyebrow"><span class="tiny-line"></span>${c.eyebrow}</div><h1>${c.title.replace('\n','<br>')}</h1><p class="hero-description">${c.subtitle}</p><div class="hero-actions">${this.button('practice',`${c.practice}<span>↗</span>`,true)}${this.button('exam',`${c.exam}<span>→</span>`)}</div><button class="text-button" id="exercises"><span>▦</span> ${c.exercises}</button><div class="hero-meta"><div><strong>12</strong><span>${this.settings.language==='uz'?'mashq':'упражнений'}</span></div><div><strong>32</strong><span>${this.settings.language==='uz'?'baholash qoidasi':'правила оценки'}</span></div><div><strong>B</strong><span>${this.settings.language==='uz'?'toifa':'категория'}</span></div></div></main>
      <div class="scene-label"><span class="small-cross">+</span><span>${c.daylight}</span></div>
      <div class="car-caption"><span class="caption-line"></span><div><span class="overline">CHEVROLET</span><h2>Cobalt <em>LTZ</em></h2><p>1.5 L <span>·</span> ${c.manual}</p></div><span class="model-tag">2014</span></div>
      <footer class="menu-footer"><div class="load-state"><span class="live-dot"></span><span id="loading-label">${this.ready?c.ready:c.loadingPhysics}</span></div><div><button id="settings">${c.settings}</button><button id="credits">${c.credits}</button><span class="build-number">v1.0</span></div></footer>`;
    this.menuPanel.querySelector('#practice')!.addEventListener('click',()=>this.actions.start('practice'));
    this.menuPanel.querySelector('#exam')!.addEventListener('click',()=>this.actions.start('exam'));
    this.menuPanel.querySelector('#exercises')!.addEventListener('click',()=>this.showExercises());
    this.menuPanel.querySelector('#settings')!.addEventListener('click',()=>this.showSettings());
    this.menuPanel.querySelector('#credits')!.addEventListener('click',()=>this.showCredits());
    this.menuPanel.querySelector('#lang')!.addEventListener('click',()=>{this.settings.language=this.settings.language==='uz'?'ru':'uz';document.documentElement.lang=this.settings.language;this.actions.settingsChanged();this.renderMenu();this.renderHud();});
    this.menuPanel.querySelectorAll<HTMLButtonElement>('#practice,#exam,#exercises').forEach(b=>b.disabled=!this.ready);
  }
  progress(value:number){this.menuPanel.querySelector('#loading-label')!.textContent=`${this.c.loading} · ${Math.round(value*100)}%`;}
  setReady(){this.ready=true;this.renderMenu();}
  showError(message:string){this.ready=false;this.menuPanel.querySelector('#loading-label')!.textContent=this.c.error;this.open('error',`<p class="eyebrow">AVTODROM</p><h2>${this.c.error}</h2><p>${esc(message)}</p>${this.button('retry',this.c.retry,true)}`);this.modal.querySelector('#retry')!.addEventListener('click',()=>location.reload());}
  renderHud(){this.mirrorControls?.dispose();const c=this.c,h=hudCopy[this.settings.language];
    this.hud.innerHTML=`<header class="drive-header"><div class="drive-brand"><span class="brand-mark">A<span></span></span><div>AVTODROM<small id="mode-label"></small></div></div><div class="exam-stats"><div><span>${c.points}</span><strong id="penalty-score">00 <small>/ 100</small></strong></div><div><span id="time-label">${c.remaining}</span><strong id="clock">15:00</strong></div></div><nav class="header-controls" aria-label="${h.controls}"><button id="map-button" title="${h.map} (${esc(keyName(this.settings.bindings.map))})" aria-label="${h.map}" aria-controls="route-map" aria-expanded="${this.mapOpen}">${icon('map')}<span>${h.map}</span><kbd>${esc(keyName(this.settings.bindings.map))}</kbd></button><button id="controls-button" title="${h.controls}" aria-label="${h.controls}" aria-controls="driving-controls" aria-expanded="${this.controlsOpen}">${icon('controls')}<span>${h.controls}</span></button><button id="camera-button" title="${c.camera}" aria-label="${c.camera}">${icon('camera')}<span>${c.camera}</span><kbd>${esc(keyName(this.settings.bindings.camera))}</kbd></button><button id="pause-button" title="${c.pause}" aria-label="${c.pause}">${icon('pause')}<span>${c.pause}</span></button></nav></header>
    <section class="exercise-card"><div class="exercise-eyebrow"><span>${c.next}</span><span id="exercise-count">01 / 12</span></div><h2 id="exercise-name"></h2><p id="exercise-instruction"></p><div id="exercise-feedback" hidden></div><div class="exercise-progress"><span id="exercise-progress"></span></div></section>
    <div id="emergency" class="emergency" hidden>${c.emergency}</div><div id="stall" class="stall-warning" hidden>${this.hotkeys(c.stalled)}</div>
    <section id="recovery-prompt" hidden aria-label="${c.overturned}"><p>${c.overturned}</p><button id="recover-button">${icon('reset')} ${c.recoverCar}</button></section>
    <div class="startup-hint" id="start-help">${this.hotkeys(c.startHelp)}</div>
    <section class="bottom-help hud-popover" id="driving-controls" aria-label="${h.controls}" ${this.controlsOpen?'':'hidden'}><header class="popover-heading"><h2>${h.controls}</h2><button id="controls-close" aria-label="${h.controlsClose}">${icon('close')}</button></header><div class="drive-shortcuts">${[['throttle','brake'],['left','right'],['clutch'],['indicatorLeft','indicatorRight']].map(actions=>`<div><span>${actions.map(a=>label(a,this.settings.language)).join(' / ')}</span><span>${actions.map(a=>`<kbd>${esc(keyName(this.settings.bindings[a]))}</kbd>`).join(' / ')}</span></div>`).join('')}</div><div class="assist-status"><span id="assist-badge">${c.assistOn}</span><span id="steering-assist-badge">${c.steeringAssistOn}</span></div><h3>${h.lights}</h3><div class="light-controls"><button id="positionlights-button" aria-pressed="false">${label('positionLights',this.settings.language)} <kbd>${esc(keyName(this.settings.bindings.positionLights))}</kbd></button><button id="headlights-button" aria-pressed="false">${label('headlights',this.settings.language)} <kbd>${esc(keyName(this.settings.bindings.headlights))}</kbd></button><button id="foglights-button" aria-pressed="false">${label('fogLights',this.settings.language)} <kbd>${esc(keyName(this.settings.bindings.fogLights))}</kbd></button></div><button id="reset-button">${icon('reset')} ${c.reset}</button></section>
    <section class="instrument-panel"><div class="instrument-top"><span id="left-signal">◀</span><span>CHEVROLET</span><span id="right-signal">▶</span></div><div class="speed-row"><div><strong id="speed">0</strong><span>km/h</span></div><div class="gear-box"><strong id="gear">N</strong><span id="gear-caption">${c.neutral}</span></div></div><div class="rpm-track"><span id="rpm"></span></div><div class="rpm-labels"><span>0</span><span>2</span><span>4</span><span>6 <small>×1000 rpm</small></span></div><div id="telemetry" class="vehicle-status"></div><div class="pedals"><div><span>${c.throttle}</span><i><b id="throttle-bar"></b></i></div><div><span>${c.pedalBrake}</span><i><b id="brake-bar"></b></i></div><div><span>${c.clutch}</span><i><b id="clutch-bar"></b></i></div></div></section>
    <aside class="minimap hud-popover" id="route-map" aria-label="${h.map}" ${this.mapOpen?'':'hidden'}><header class="popover-heading"><h2>${h.mapTitle}</h2><button id="map-close" aria-label="${h.mapClose}">${icon('close')}</button></header><canvas width="720" height="552" role="img" aria-label="${h.mapDescription}"></canvas><footer><span class="minimap-key"><span><i class="map-driver"></i>${this.settings.language==='ru'?'Вы':'Siz'}</span><span><i class="map-goal"></i>${this.settings.language==='ru'?'Цель':'Maqsad'}</span></span><span id="distance"></span></footer></aside><span id="fps" hidden></span><div class="provisional-note" id="provisional"></div>`;
    this.hud.querySelector('#recover-button')!.addEventListener('click',()=>this.actions.recover());
    this.hud.querySelector('#map-button')!.addEventListener('click',()=>this.toggleMap());
    this.hud.querySelector('#controls-button')!.addEventListener('click',()=>this.setHudPanel('controls',!this.controlsOpen));
    this.hud.querySelector<HTMLButtonElement>('#map-close')!.addEventListener('click',event=>{this.setHudPanel('map',false);if(event.detail===0)this.hud.querySelector<HTMLButtonElement>('#map-button')!.focus();});
    this.hud.querySelector<HTMLButtonElement>('#controls-close')!.addEventListener('click',event=>{this.setHudPanel('controls',false);if(event.detail===0)this.hud.querySelector<HTMLButtonElement>('#controls-button')!.focus();});
    this.hud.querySelector('#camera-button')!.addEventListener('click',()=>this.actions.camera());this.hud.querySelector('#pause-button')!.addEventListener('click',()=>this.actions.pause());this.hud.querySelector('#reset-button')!.addEventListener('click',()=>this.actions.reset());
    this.hud.querySelector('#headlights-button')!.addEventListener('click',()=>this.actions.lights('headlights'));
    this.hud.querySelector('#positionlights-button')!.addEventListener('click',()=>this.actions.lights('positionLights'));
    this.hud.querySelector('#foglights-button')!.addEventListener('click',()=>this.actions.lights('fogLights'));
    this.mirrorControls=new MirrorControls(this.hud,this.settings,this.actions.mirrorsChanged,this.actions.mirrorSelect,this.actions.mirrorCamera);
    this.hud.querySelector('#mirrors-button')!.addEventListener('click',()=>this.closeHudPanels());
    this.hud.dataset.controlsOpen=String(this.controlsOpen);
    this.mini=this.hud.querySelector('canvas')!;this.map=new Minimap(this.mini);this.speed=this.hud.querySelector('#speed')!;this.rpm=this.hud.querySelector('#rpm')!;this.gear=this.hud.querySelector('#gear')!;this.telemetry=this.hud.querySelector('#telemetry')!;this.lastExercise='';this.lastScore=-1;this.status='';
  }
  toggleMap(){this.setHudPanel('map',!this.mapOpen);}
  private setHudPanel(panel:'map'|'controls',open:boolean){
    if(open){this.mirrorControls?.close();this.closeHudPanels();}
    if(panel==='map')this.mapOpen=open;else this.controlsOpen=open;
    this.hud.querySelector<HTMLElement>(panel==='map'?'#route-map':'#driving-controls')!.hidden=!open;
    this.hud.querySelector(panel==='map'?'#map-button':'#controls-button')!.setAttribute('aria-expanded',String(open));
    this.hud.dataset.controlsOpen=String(this.controlsOpen);
  }
  private closeHudPanels(focus=false){
    const active=this.mapOpen?'map':this.controlsOpen?'controls':null;
    if(!active)return false;
    this.mapOpen=this.controlsOpen=false;
    for(const [panel,button]of [['#route-map','#map-button'],['#driving-controls','#controls-button']]){
      this.hud.querySelector<HTMLElement>(panel)!.hidden=true;this.hud.querySelector(button)!.setAttribute('aria-expanded','false');
    }
    this.hud.dataset.controlsOpen='false';
    if(focus)this.hud.querySelector<HTMLButtonElement>(`#${active}-button`)!.focus();
    return true;
  }
  enter(mode:Mode,single:boolean){this.renderHud();this.menuPanel.hidden=true;this.hud.hidden=false;document.body.classList.add('driving');this.modal.close();this.hud.querySelector('#mode-label')!.textContent=mode==='exam'?this.c.examMode:this.c.practiceMode;this.hud.querySelector('#time-label')!.textContent=mode==='exam'?this.c.remaining:this.c.time;
    this.hud.querySelector<HTMLElement>('#reset-button')!.hidden=mode==='exam';this.hud.querySelector<HTMLElement>('#assist-badge')!.hidden=mode==='exam'||!this.settings.assist;this.hud.querySelector<HTMLElement>('#steering-assist-badge')!.hidden=mode==='exam'||!this.settings.steeringAssist;
    this.hud.querySelector('#provisional')!.textContent=mode==='exam'?`${this.settings.examMinutes} ${this.settings.language==='uz'?'daqiqa — taxminiy limit':'минут — предварительный лимит'}`:this.c.qualityNote;
    if(single)this.hud.querySelector('#exercise-count')!.textContent=this.c.practiceMode;
  }
  showMenu(){this.closeHudPanels();this.mirrorControls?.close();this.menuPanel.hidden=false;this.hud.hidden=true;document.body.classList.remove('driving');this.modal.close();clearTimeout(this.toastTimer);this.toastPanel.className='';this.renderMenu();}
  update(t:VehicleTelemetry,engine:ExamEngine,e:Exercise,index:number,count:number,camera:string,fps:number,single:boolean){this.mirrorControls?.setCamera(camera);
    for(const [id,on]of [['positionlights-button',t.positionLights],['headlights-button',t.headlights],['foglights-button',t.fogLights]]as const)this.hud.querySelector(`#${id}`)!.setAttribute('aria-pressed',String(on));
    const fogButton=this.hud.querySelector<HTMLButtonElement>('#foglights-button')!,fogAvailable=t.ignition&&t.positionLights;
    fogButton.setAttribute('aria-disabled',String(!fogAvailable));fogButton.title=fogAvailable?label('fogLights',this.settings.language):label('fogLightsRequirement',this.settings.language);
    const c=this.c,lang=this.settings.language;
    this.speed.textContent=String(Math.round(t.speed*3.6));this.gear.textContent=t.gear<0?'R':t.gear===0?'N':String(t.gear);
    this.hud.querySelector('#gear-caption')!.textContent=t.gear===0?c.neutral:lang==='uz'?'UZATMA':'ПЕРЕДАЧА';this.rpm.style.width=`${Math.min(100,t.rpm/6200*100)}%`;
    this.hud.querySelector('#clock')!.textContent=formatTime(engine.mode==='exam'?engine.limitSeconds-engine.time:engine.time);
    if(this.lastScore!==engine.score){this.hud.querySelector('#penalty-score')!.innerHTML=`${String(engine.score).padStart(2,'0')} <small>/ 100</small>`;this.lastScore=engine.score;}
    if(this.lastExercise!==`${index}:${e.id}`){this.hud.querySelector('#exercise-name')!.textContent=e.name[lang];this.hud.querySelector('#exercise-instruction')!.textContent=e.instruction[lang];if(!single)this.hud.querySelector('#exercise-count')!.textContent=`${String(index+1).padStart(2,'0')} / ${count}`;this.hud.querySelector<HTMLElement>('#exercise-progress')!.style.width=`${(index+1)/count*100}%`;this.lastExercise=`${index}:${e.id}`;}
    const status=`${t.belt}:${t.engine}:${t.handbrake}`;if(this.status!==status){this.telemetry.innerHTML=`<span class="${t.belt?'ok':'warn'}">${c.belt}</span><span class="${t.engine?'ok':'warn'}">${c.engine}</span><span class="${t.handbrake?'warn':'off'}">Ⓟ</span>`;this.status=status;}
    for(const [id,value]of [['throttle',t.throttle],['brake',t.brake],['clutch',t.clutch]]as const)this.hud.querySelector<HTMLElement>(`#${id}-bar`)!.style.width=`${value*100}%`;
    this.hud.querySelector<HTMLElement>('#stall')!.hidden=!t.stalled;
    this.hud.querySelector('#left-signal')!.classList.toggle('signal-active',(t.hazards||t.indicator==='left')&&Math.sin(t.time*9)>0);
    this.hud.querySelector('#right-signal')!.classList.toggle('signal-active',(t.hazards||t.indicator==='right')&&Math.sin(t.time*9)>0);

    this.hud.querySelector('#fps')!.textContent=`${fps} FPS`;this.hud.querySelector('#distance')!.textContent=`${Math.round(Math.hypot(t.position.x-e.point.x,t.position.z-e.point.z))} m`;
    this.hud.querySelector<HTMLElement>('#start-help')!.hidden=t.engine&&t.belt&&!t.handbrake;
    const feedback=exerciseFeedback(t,e,engine,lang),panel=this.hud.querySelector<HTMLElement>('#exercise-feedback')!;
    panel.hidden=!feedback;if(feedback){panel.textContent=feedback.text;panel.dataset.state=feedback.state;}
    if(this.mapOpen)this.map.draw(t,e,index,single);
  }
  recovery(show:boolean){const panel=this.hud.querySelector<HTMLElement>('#recovery-prompt')!;if(panel.hidden===show)panel.hidden=!show;}
  emergency(show:boolean){this.hud.querySelector<HTMLElement>('#emergency')!.hidden=!show;}
  toast(message:string,bad=false){clearTimeout(this.toastTimer);this.toastPanel.textContent=message;this.toastPanel.className=`show ${bad?'bad':''}`;this.toastTimer=window.setTimeout(()=>this.toastPanel.className='',4500);}
  private open(type:string,html:string){this.onBind=null;this.modal.dataset.type=type;this.modal.innerHTML=html;const heading=this.modal.querySelector('h2');if(heading){heading.id='modal-title';this.modal.setAttribute('aria-labelledby',heading.id);}if(!this.modal.open)this.modal.showModal();}
  private closeButton(){this.modal.querySelector('#close')?.addEventListener('click',()=>this.modal.close());}
  showPause(mode:Mode){this.mirrorControls?.close();const c=this.c;this.open('pause',`<span class="eyebrow">AVTODROM / ${mode==='exam'?c.examMode:c.practiceMode}</span><h2>${c.paused}</h2><p>${c.pausedText}</p><div class="dialog-actions">${this.button('resume',c.resume,true)}${this.button('settings',c.settings)}${this.button('menu',mode==='exam'?c.leave:c.menu)}</div>${mode==='exam'?`<p class="muted">${c.exitText}</p>`:''}`);this.modal.querySelector('#resume')!.addEventListener('click',()=>this.actions.resume());this.modal.querySelector('#menu')!.addEventListener('click',()=>this.actions.menu());this.modal.querySelector('#settings')!.addEventListener('click',()=>this.showSettings(true));}
  showExercises(){const c=this.c,lang=this.settings.language;this.open('exercises',`<div class="dialog-heading"><div><span class="eyebrow">${c.practiceMode}</span><h2>${c.exercises}</h2></div><button id="close" class="icon-button" aria-label="${c.close}">×</button></div><p>${c.selectHint}</p><div class="exercise-grid">${course.exercises.map((e,i)=>`<button data-exercise="${i}"><span>${String(i+1).padStart(2,'0')}</span><strong>${e.name[lang]}</strong><span>↗</span></button>`).join('')}</div>`);this.closeButton();this.modal.querySelectorAll<HTMLButtonElement>('[data-exercise]').forEach(b=>b.addEventListener('click',()=>this.actions.start('practice',Number(b.dataset.exercise))));}
  showSettings(fromPause=false){this.returnToPause=fromPause;const c=this.c,lang=this.settings.language;this.open('settings',`<div class="dialog-heading"><div><span class="eyebrow">AVTODROM</span><h2>${c.settings}</h2></div><button id="close" class="icon-button" aria-label="${c.close}">×</button></div><div class="settings-grid"><label>${c.language}<select id="language"><option value="uz" ${lang==='uz'?'selected':''}>O‘zbekcha</option><option value="ru" ${lang==='ru'?'selected':''}>Русский</option></select></label><label>${c.graphics}<select id="quality">${(['low','medium','high']as const).map(q=>`<option value="${q}" ${this.settings.quality===q?'selected':''}>${c[q]}</option>`).join('')}</select></label><label>${c.curbs}<select id="curb-style"><option value="yellow-black" ${this.settings.curbStyle==='yellow-black'?'selected':''}>${c.curbYellowBlack}</option><option value="white" ${this.settings.curbStyle==='white'?'selected':''}>${c.curbWhite}</option></select></label><label>${c.volume}<input type="range" id="volume" min="0" max="1" step=".05" value="${this.settings.volume}"></label><label>${c.examTime}<input type="number" id="exam-minutes" min="1" max="60" value="${this.settings.examMinutes}"></label></div><label class="check-row"><input id="assist" type="checkbox" ${this.settings.assist?'checked':''}>${c.assist}</label><label class="check-row"><input id="steering-assist" type="checkbox" aria-describedby="steering-assist-help" ${this.settings.steeringAssist?'checked':''}>${c.steeringAssist}</label><p id="steering-assist-help" class="muted">${c.steeringAssistHelp}</p><p class="muted">${c.required}</p><div class="controls-heading"><h3>${c.controls}</h3><button id="restore">${c.restore}</button></div><div class="key-grid">${Object.entries(this.settings.bindings).map(([action,key])=>`<button data-bind="${action}"><span>${label(action,lang)}</span><kbd>${esc(keyName(key))}</kbd></button>`).join('')}</div>`);
    this.modal.querySelector('#close')!.addEventListener('click',()=>{this.onBind=null;if(fromPause)this.actions.pause();else this.modal.close();});
    this.modal.querySelector('#language')!.addEventListener('change',e=>{this.settings.language=(e.target as HTMLSelectElement).value as Language;document.documentElement.lang=this.settings.language;this.actions.settingsChanged();this.renderMenu();this.showSettings(fromPause);});
    this.modal.querySelector('#quality')!.addEventListener('change',e=>{this.settings.quality=(e.target as HTMLSelectElement).value as Settings['quality'];this.actions.settingsChanged();});
    this.modal.querySelector('#curb-style')!.addEventListener('change',e=>{this.settings.curbStyle=(e.target as HTMLSelectElement).value as Settings['curbStyle'];this.actions.settingsChanged();});
    this.modal.querySelector('#volume')!.addEventListener('input',e=>{this.settings.volume=Number((e.target as HTMLInputElement).value);this.actions.settingsChanged();});
    this.modal.querySelector('#exam-minutes')!.addEventListener('change',e=>{const input=e.target as HTMLInputElement;this.settings.examMinutes=Math.max(1,Math.min(60,Number(input.value)||15));input.value=String(this.settings.examMinutes);this.actions.settingsChanged();});
    this.modal.querySelector('#steering-assist')!.addEventListener('change',e=>{this.settings.steeringAssist=(e.target as HTMLInputElement).checked;this.actions.settingsChanged();});
    this.modal.querySelector('#assist')!.addEventListener('change',e=>{this.settings.assist=(e.target as HTMLInputElement).checked;this.actions.settingsChanged();});
    this.modal.querySelector('#restore')!.addEventListener('click',()=>{this.settings.bindings={...defaultBindings};this.actions.settingsChanged();this.showSettings(fromPause);});
    this.modal.querySelectorAll<HTMLButtonElement>('[data-bind]').forEach(b=>b.addEventListener('click',()=>{b.querySelector('kbd')!.textContent=c.bind;this.onBind=code=>{const action=b.dataset.bind!,old=this.settings.bindings[action];const other=Object.keys(this.settings.bindings).find(a=>this.settings.bindings[a]===code);if(other)this.settings.bindings[other]=old;this.settings.bindings[action]=code;this.actions.settingsChanged();this.showSettings(fromPause);};}));
  }
  showCredits(){const c=this.c;this.open('credits',`<div class="dialog-heading"><div><span class="eyebrow">REFERENCE / 2026</span><h2>${c.sourceTitle}</h2></div><button id="close" class="icon-button" aria-label="${c.close}">×</button></div><p>${c.sourceText}</p><div class="credit-box"><strong>Chevrolet Cobalt LTZ 2014</strong><p>${c.carCredit}</p><a href="https://sketchfab.com/3d-models/chevrolet-cobalt-ltz-2014-f91cbef731444f939e263041400216ca" target="_blank" rel="noreferrer">Sketchfab ↗</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noreferrer">CC BY 4.0 ↗</a></div><h3>${c.rules}</h3><div class="rules-list">${rules.map(r=>`<div><span>${r.id}</span><p>${r.text[this.settings.language]}</p><strong>+${r.points}</strong></div>`).join('')}</div><h3>${c.recent}</h3>${this.settings.results.length?this.settings.results.slice(-5).reverse().map(r=>`<p class="recent-result">${new Date(r.date).toLocaleDateString()} · ${r.mode==='exam'?c.examMode:c.practiceMode}<strong>${r.score} / 100 · ${formatTime(r.elapsed)}</strong></p>`).join(''):`<p>${c.noResults}</p>`}`);this.closeButton();}
  showResult(result:ExamResult,single:boolean){this.mirrorControls?.close();const c=this.c;this.open('result',`<span class="eyebrow">${result.mode==='exam'?c.examMode:c.practiceMode} / ${result.passed?'FINISH':'REVIEW'}</span><h2>${single?c.complete:result.passed?c.passed:c.failed}</h2><p>${c.resultText}</p><div class="result-stats"><div><span>${c.score}</span><strong>${result.score}<small> / 100</small></strong></div><div><span>${c.time}</span><strong>${formatTime(result.elapsed)}</strong></div></div><h3>${c.mistakes}</h3><div class="mistake-list">${result.events.length?result.events.map(e=>`<div><time>${formatTime(e.time)}</time><p>${ruleById(e.ruleId).text[this.settings.language]}</p><strong>+${e.points}</strong></div>`).join(''):`<p class="clean-result">✓ ${c.noMistakes}</p>`}</div><div class="dialog-actions">${this.button('again',c.again,true)}${this.button('menu',c.menu)}</div>`);this.modal.querySelector('#again')!.addEventListener('click',()=>this.actions.reset());this.modal.querySelector('#menu')!.addEventListener('click',()=>this.actions.menu());}
}
