import type {Language} from '../types';

const copy={
  uz:{title:'Simulyator tayyorlanmoqda',physics:'Haydash tizimi tayyorlanmoqda…',course:'Avtodrom tayyorlanmoqda…',car:'Cobalt yuklanmoqda…',finishing:'Avtomobil sahnaga joylanmoqda…',error:'Yuklab bo‘lmadi',failure:'Simulyatorni tayyorlab bo‘lmadi. Qayta yuklab ko‘ring.',retry:'Qayta yuklash'},
  ru:{title:'Подготовка симулятора',physics:'Подготовка системы вождения…',course:'Подготовка автодрома…',car:'Загрузка Cobalt…',finishing:'Подготовка автомобиля к показу…',error:'Не удалось загрузить',failure:'Не удалось подготовить симулятор. Попробуйте загрузить его ещё раз.',retry:'Повторить загрузку'},
};
export type LoadingStage='physics'|'course'|'car'|'finishing';

/** Visible before the app bundle starts; only the model download has byte progress. */
export class LoadingScreen {
  private panel=document.querySelector<HTMLElement>('#boot-loader')!;
  private title=this.panel.querySelector<HTMLElement>('#boot-title')!;
  private status=this.panel.querySelector<HTMLElement>('#boot-stage')!;
  private percent=this.panel.querySelector<HTMLElement>('#boot-percent')!;
  private bar=this.panel.querySelector<HTMLProgressElement>('#boot-progress')!;
  private message=this.panel.querySelector<HTMLElement>('#boot-error')!;
  private retry=this.panel.querySelector<HTMLButtonElement>('#boot-retry')!;
  private c:(typeof copy)[Language];
  constructor(language:Language){
    this.c=copy[language];this.title.textContent=this.c.title;this.retry.textContent=this.c.retry;
    this.retry.addEventListener('click',()=>location.reload());this.stage('physics');
  }
  stage(stage:LoadingStage){
    this.status.textContent=this.c[stage];this.panel.dataset.stage=stage;
    this.bar.removeAttribute('value');this.percent.textContent='';
  }
  progress(value?:number){
    if(value!==undefined&&Number.isFinite(value)&&value>=1){this.stage('finishing');return;}
    this.stage('car');
    if(value===undefined||!Number.isFinite(value))return;
    const progress=Math.max(0,Math.min(1,value));this.bar.value=progress;this.percent.textContent=`${Math.floor(progress*100)}%`;
  }
  ready(){this.panel.hidden=true;}
  fail(message?:string){
    this.panel.hidden=false;this.panel.dataset.stage='error';this.title.textContent=this.c.error;
    this.status.parentElement!.hidden=true;this.bar.hidden=true;
    this.message.textContent=message??this.c.failure;this.message.hidden=false;this.retry.hidden=false;this.retry.focus();
  }
}
