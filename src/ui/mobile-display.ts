import {touchDevice} from '../device';
import type {Language} from '../types';
import {icon} from './icons';

type LockableOrientation=ScreenOrientation&{lock?:(orientation:'landscape')=>Promise<void>};
let entering:Promise<boolean>|undefined;

/** Call from a user gesture; rejected/unsupported browser APIs use the rotate UI. */
export function requestLandscapeFullscreen():Promise<boolean>{
  if(entering)return entering;
  entering=(async()=>{
    if(!document.fullscreenElement&&document.fullscreenEnabled&&document.documentElement.requestFullscreen){
      try{await document.documentElement.requestFullscreen({navigationUI:'hide'});}catch{/* The page still fills the available viewport. */}
    }
    if(touchDevice()){
      const orientation=screen.orientation as LockableOrientation|undefined;
      try{await orientation?.lock?.('landscape');}catch{/* Physical rotation remains available. */}
    }
    return !!document.fullscreenElement;
  })();
  void entering.then(()=>{entering=undefined;},()=>{entering=undefined;});
  return entering;
}

const copy={
  ru:{title:'Поверните телефон',detail:'Держите телефон горизонтально, чтобы видеть дорогу и все органы управления.',
    fullscreen:'На весь экран',hint:'Если экран не поворачивается, отключите блокировку поворота на телефоне.'},
  uz:{title:'Telefonni aylantiring',detail:'Yo‘l va barcha boshqaruv tugmalarini ko‘rish uchun telefonni gorizontal tuting.',
    fullscreen:'To‘liq ekran',hint:'Ekran aylanmasa, telefonning ekran aylanish qulfini o‘chiring.'},
};

/** A separate modal stays above pause/settings dialogs, including during boot. */
export class MobileDisplay {
  private dialog:HTMLDialogElement;
  private abort=new AbortController();
  blocked=false;
  constructor(private language:()=>Language,private onPortrait:()=>void){
    this.dialog=document.createElement('dialog');this.dialog.id='orientation-dialog';
    this.dialog.setAttribute('aria-labelledby','orientation-title');this.dialog.setAttribute('aria-describedby','orientation-detail orientation-hint');
    this.dialog.innerHTML=`<div class="rotate-content"><div class="rotate-art">${icon('rotatePhone')}</div><h1 id="orientation-title"></h1><p id="orientation-detail"></p><button id="orientation-fullscreen" type="button">${icon('fullscreen')}<span></span></button><p id="orientation-hint"></p></div>`;
    document.body.append(this.dialog);
    this.dialog.addEventListener('cancel',event=>event.preventDefault(),{signal:this.abort.signal});
    this.dialog.querySelector('#orientation-fullscreen')!.addEventListener('click',()=>{void requestLandscapeFullscreen();},{signal:this.abort.signal});
    window.addEventListener('resize',()=>this.update(),{signal:this.abort.signal});
    screen.orientation?.addEventListener('change',()=>requestAnimationFrame(()=>this.update()),{signal:this.abort.signal});
    document.addEventListener('fullscreenchange',()=>this.update(),{signal:this.abort.signal});
    let firstTap=false;
    document.addEventListener('click',event=>{
      if(firstTap||!event.isTrusted||!touchDevice())return;
      firstTap=true;void requestLandscapeFullscreen();
    },{capture:true,signal:this.abort.signal});
    this.update();
  }
  update(){
    const next=touchDevice()&&innerHeight>innerWidth;
    const changed=next!==this.blocked;this.blocked=next;
    document.documentElement.dataset.mobileLandscape=touchDevice()?(next?'portrait':'landscape'):'desktop';
    const c=copy[this.language()];
    this.dialog.querySelector('#orientation-title')!.textContent=c.title;
    this.dialog.querySelector('#orientation-detail')!.textContent=c.detail;
    this.dialog.querySelector('#orientation-hint')!.textContent=c.hint;
    this.dialog.querySelector('#orientation-fullscreen span')!.textContent=c.fullscreen;
    this.dialog.querySelector<HTMLButtonElement>('#orientation-fullscreen')!.hidden=!document.fullscreenEnabled;
    if(next){
      if(changed)this.onPortrait();
      if(!this.dialog.open)this.dialog.showModal();
    }else if(this.dialog.open)this.dialog.close();
  }
  enter(){return touchDevice()?requestLandscapeFullscreen():Promise.resolve(false);}
  dispose(){this.abort.abort();this.dialog.close();this.dialog.remove();delete document.documentElement.dataset.mobileLandscape;}
}
