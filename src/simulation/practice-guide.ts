import type {Exercise,Language,Vec2,VehicleTelemetry} from '../types';
import {exerciseRouteLeg,GuidePath} from '../data/exercise-route';
import {vehicleConfig} from '../data/vehicle';
import {finishLinePoint,startLinePoint} from '../data/course';
import {stopLineApproachEdge} from '../data/marking-standards';
import {signalAxis,signalState} from '../data/traffic-signals';
import {lineDistance} from './math';
import {parkingFit} from './parking';
import type {ExamEngine,Observations} from './exam';
import {exerciseFeedback} from '../ui/exercise-feedback';
import {ruleById} from '../data/rules';

export interface PracticeHint {
  phase:string;action:string;detail:string;tone:'info'|'hold'|'ready'|'warning';
  keys:string[];target:Vec2;stop:boolean;route:Vec2[];
}
/** A teaching layer over the same geometry and engine facts used for scoring. */
export class PracticeGuide {
  readonly path:GuidePath;parkingHold=0;
  private startValid=false;private finishValid=false;private greenCrossed=false;private hillHandbrake=false;
  private invalidCrossing=false;private emergencyHold=0;private emergencyHeld=false;
  constructor(readonly exercise:Exercise,index=0,readonly single=false,private eventStart=0){this.path=new GuidePath(exerciseRouteLeg(exercise,index,single),!!exercise.parking);}
  update(t:VehicleTelemetry,engine:ExamEngine,o:Observations,dt:number){
    this.path.ahead(t.position);
    this.parkingHold=this.exercise.parking&&o.parkingCorrect&&engine.parkingReversed&&t.speed<.12?this.parkingHold+dt:0;
    if(o.startCrossed){this.startValid=t.belt&&t.engine&&t.gear===1&&t.indicator==='left'&&!t.handbrake;this.invalidCrossing ||=!this.startValid;}
    if(o.finishCrossed){this.finishValid=t.indicator==='right';this.invalidCrossing ||=!this.finishValid;}
    if(o.stopCrossed&&o.greenLight)this.greenCrossed=true;
    if(this.exercise.id==='hill'&&o.stopDistance!==undefined&&o.stopDistance>=0&&o.stopDistance<=1&&t.speed<.12&&t.handbrake)this.hillHandbrake=true;
    if(engine.emergencyStopped&&t.speed<.12&&t.hazards){this.emergencyHold+=dt;if(this.emergencyHold>=3-1e-8)this.emergencyHeld=true;}else if(!this.emergencyHeld)this.emergencyHold=0;
  }
  private failure(engine:ExamEngine){
    const blocking:Partial<Record<Exercise['id'],number[]>>={start:[1,2],hill:[14],rightAngle:[5,15,16],snake:[15,16],intersection:[24],acceleration:[6,18,31],emergency:[19,20,21],finish:[7]};
    return engine.events.slice(this.eventStart).find(event=>blocking[this.exercise.id]?.includes(event.ruleId));
  }
  canComplete(atGoal:boolean,t:VehicleTelemetry,engine:ExamEngine){
    if(this.single){
      if(this.invalidCrossing||this.failure(engine))return false;
      if(this.exercise.id==='start')return atGoal&&this.startValid;
      if(this.exercise.id==='finish')return atGoal&&this.finishValid&&t.speed<.12;
      if(this.exercise.id==='intersection')return atGoal&&this.greenCrossed;
      if(this.exercise.id==='hill')return atGoal&&engine.stoppedCorrectly&&this.hillHandbrake;
      if(this.exercise.id==='rightAngle'||this.exercise.id==='snake')return atGoal&&this.path.segment===this.path.points.length-1&&t.speed*3.6<=20;
    }
    if(this.exercise.id==='emergency')return engine.emergencyCompleted&&(!this.single||this.emergencyHeld)&&!t.hazards&&t.speed>.25;
    if(this.exercise.parking)return this.parkingHold>=2;
    if(this.exercise.stop&&!this.exercise.stop.light)return atGoal&&engine.stoppedCorrectly;
    if(this.exercise.id==='acceleration')return atGoal&&engine.secondGearUsed&&t.speed*3.6>=20&&t.speed*3.6<=40;
    return atGoal;
  }
  view(t:VehicleTelemetry,engine:ExamEngine,language:Language):PracticeHint{
    const e=this.exercise,say=(ru:string,uz:string)=>language==='ru'?ru:uz;
    const emergencyComplete=engine.emergencyCompleted&&(!this.single||this.emergencyHeld);
    let target=e.point,stop=false;
    const hint=(phase:string,action:string,detail='',keys:string[]=[],tone:PracticeHint['tone']='info'):PracticeHint=>
      ({phase,action,detail,keys,tone,target,stop,route:this.path.ahead(t.position,30,stop?target:undefined)});
    // Position the stopping marker at the car's centre with its bumper 50 cm
    // before the approaching paint edge, never on the destination beyond it.
    let d=Infinity;
    if(e.stop){
      const edge=stopLineApproachEdge(e.stop.point,e.stop.normal);d=lineDistance(t.bumper,edge,e.stop.normal);
      stop=d>=0&&(e.stop.light?signalState(t.time,signalAxis(e.stop.normal))!=='green':!engine.stoppedCorrectly);
      if(stop)target={x:edge.x-e.stop.normal.x*(vehicleConfig.length/2+.5),z:edge.z-e.stop.normal.z*(vehicleConfig.length/2+.5)};
    }
    if(!t.belt)return hint('belt',say('Пристегните ремень','Xavfsizlik kamarini taqing'),'', ['belt']);
    if(!t.engine)return hint('engine',say(t.stalled?'Запустите заглохший двигатель':'Запустите двигатель',t.stalled?'O‘chgan dvigatelni qayta yoqing':'Dvigatelni yoqing'),say('Выжмите сцепление и включите зажигание.','Ilashishni bosib, dvigatelni yoqing.'),['clutch','ignition']);
    const failure=this.single?this.failure(engine):undefined;
    if(this.single&&(this.invalidCrossing||failure))return hint('retry-required',say('Повторите упражнение','Mashqni takrorlang'),failure?ruleById(failure.ruleId).text[language]:say('Перед стартом нужны ремень, работающий двигатель, первая передача и левый поворотник.','Startdan oldin kamar, ishlayotgan dvigatel, birinchi uzatma va chap burilish chirog‘i kerak.'),[],'warning');
    if(this.single&&(e.id==='rightAngle'||e.id==='snake')&&Math.hypot(t.position.x-e.point.x,t.position.z-e.point.z)<e.radius&&this.path.segment<this.path.points.length-1)return hint('route-incomplete',say('Пройдите весь участок по стрелкам','Butun yo‘lni strelkalar bo‘yicha bosib o‘ting'),say('Приближение к концу не завершает задание. Можно повторить попытку.','Oxiriga yaqinlashish mashqni tugatmaydi. Qayta urinishingiz mumkin.'),[],'warning');
    if(this.single&&e.id==='hill'&&engine.stoppedCorrectly&&!this.hillHandbrake&&d<0)return hint('retry-required',say('Повторите старт с ручника','Qo‘l tormozi bilan boshlashni takrorlang'),say('На остановке перед линией нужно зафиксировать автомобиль ручником.','Chiziq oldida to‘xtaganda avtomobilni qo‘l tormozi bilan ushlab turish kerak.'),[],'warning');
    const holding=stop&&d<=1||!!e.parking&&parkingFit(t,e.parking).correct||e.id==='emergency'&&engine.emergencySignalled&&(!emergencyComplete||t.hazards);
    if(!holding&&t.speed<.12){
      const reverse=!!e.parking&&this.path.reversing;
      if(t.gear===0)return hint('gear',say(reverse?'Включите заднюю передачу':'Включите первую передачу',reverse?'Orqa uzatmani tanlang':'Birinchi uzatmani tanlang'),'', ['clutch',reverse?'reverse':'gear1']);
      if(t.handbrake)return hint('handbrake',say('Отпустите ручник','Qo‘l tormozini bo‘shating'),'', ['handbrake']);
    }
    if(e.id==='emergency'&&engine.emergencySignalled){
      target=t.position;stop=true;
      if(!engine.emergencyStopped||t.speed>=.12&&!emergencyComplete)return hint('emergency-stop',say('Остановитесь по сигналу','Signal bo‘yicha to‘xtang'),say('На остановку отведено 2 секунды.','To‘xtash uchun 2 soniya berilgan.'),['brake'],'warning');
      if(!t.hazards&&!emergencyComplete)return hint('hazards-on',say('Включите аварийную сигнализацию','Avariya chirog‘ini yoqing'),say('После остановки — не позднее 3 секунд.','To‘xtagach, 3 soniyadan kechiktirmang.'),['hazards'],'hold');
      const remaining=Math.max(engine.emergencyHoldRemaining,this.single?3-this.emergencyHold:0);
      if(!emergencyComplete)return hint('emergency-hold',say('Оставайтесь на месте','Joyingizda turing'),say(`Стойте ещё ${remaining.toFixed(1)} с.`,`Yana ${remaining.toFixed(1)} s turing.`),['brake'],'hold');
      if(t.hazards)return hint('hazards-off',say('Выключите аварийную сигнализацию','Avariya chirog‘ini o‘chiring'),say('Затем продолжайте движение.','Keyin harakatni davom ettiring.'),['hazards'],'ready');
      target=e.point;stop=false;return hint('emergency-resume',say('Продолжайте движение','Harakatni davom ettiring'),'', ['throttle'],'ready');
    }
    if(e.stop){
      const lateral=Math.abs((t.bumper.x-e.stop.point.x)*e.stop.normal.z-(t.bumper.z-e.stop.point.z)*e.stop.normal.x);
      if(lateral>=4)return hint('stop-lane',say('Вернитесь на полосу перед стоп-линией','Stop chizig‘i oldidagi tasmaga qayting'),say('Стрелки показывают подход к вашему заданию.','Strelkalar mashqqa kirish yo‘lini ko‘rsatadi.'));
      if(e.id==='pedestrian'&&t.indicator==='left'&&t.position.x-startLinePoint.x>=8)return hint('cancel-start-signal',say('Выключите левый поворотник после старта','Startdan keyin chap burilish chirog‘ini o‘chiring'),'', ['indicatorLeft']);
      const feedback=exerciseFeedback(t,e,engine,language)?.text??'';
      if(d<0&&e.stop.light)return hint('junction-exit',say('Освободите перекрёсток','Chorrahaning chiqishigacha yuring'),say('Продолжайте по своей полосе.','O‘z tasmangizda davom eting.'),['throttle']);
      if(d<0&&!engine.stoppedCorrectly)return hint('missed-stop',say('Стоп-линия уже позади','Stop chizig‘i ortda qoldi'),this.single?say('Повторите этот этап, чтобы отработать остановку перед линией.','Chiziq oldida to‘xtashni mashq qilish uchun bosqichni takrorlang.'):say('Вернитесь к линии или начните маршрут заново через «Управление».','Chiziqqa qayting yoki «Boshqaruv» orqali yo‘nalishni qayta boshlang.'),[],'warning');
      if(stop){
        if(e.stop.light)return hint(d<=1&&t.speed<.12?'signal-wait':'signal-approach',say('Остановитесь перед линией и ждите зелёного','Chiziq oldida to‘xtab, yashilni kuting'),feedback,['brake'],'hold');
        if(d<=1&&t.speed<.12)return hint('stop-hold',say('Удерживайте автомобиль на месте','Avtomobilni joyida ushlab turing'),feedback,['brake'],'hold');
        return hint('stop-approach',say('Остановитесь не далее 1 м перед линией','Chiziqqacha 1 m dan uzoq bo‘lmagan joyda to‘xtang'),feedback,['brake']);
      }
      if(e.id==='hill'&&t.handbrake)return hint('hill-launch',say('Троньтесь с ручника без отката','Qo‘l tormozidan foydalanib, orqaga ketmasdan yuring'),say('Подберите тягу и отпустите ручник.','Tortishni tanlab, qo‘l tormozini bo‘shating.'),['throttle','handbrake'],'ready');
      return hint('stop-exit',say(e.stop.light?'На зелёный продолжайте движение':'Остановка засчитана — продолжайте',e.stop.light?'Yashilda harakatni davom ettiring':'To‘xtash qabul qilindi — davom eting'),feedback,['throttle'],'ready');
    }
    if(e.parking){
      const fit=parkingFit(t,e.parking),near=Math.hypot(t.position.x-e.point.x,t.position.z-e.point.z)<10;
      const reversing=this.path.reversing;
      if(!near||!reversing&&!engine.parkingReversed)return hint('parking-approach',say('Подъезжайте к месту начала манёвра','Manyovr boshlanadigan joyga yuring'),say('Следуйте стрелкам вперёд, затем подготовьтесь к заднему ходу.','Strelkalar bo‘ylab oldinga yuring, keyin orqaga yurishga tayyorlaning.'),['throttle']);
      if(!engine.parkingReversed)return hint('parking-reverse',say('Включите R и въезжайте задним ходом','R ni tanlab, orqaga kiring'),say('Ориентируйтесь по боковым зеркалам.','Yon ko‘zgularga qarab mo‘ljal oling.'),['clutch','reverse']);
      if(!fit.contained||!fit.aligned)return hint('parking-align',say('Выровняйте автомобиль внутри места','Avtomobilni joy ichida tekislang'),say('Проверяйте границы и задние колёса в зеркалах.','Chegaralar va orqa g‘ildiraklarni ko‘zgularda tekshiring.'),[]);
      if(!fit.onLine)return hint('parking-line',say(e.id==='garage'?'Поставьте оба задних колеса на белую линию':'Поставьте оба правых колеса на белую линию',e.id==='garage'?'Ikkala orqa g‘ildirakni oq chiziqqa qo‘ying':'Ikkala o‘ng g‘ildirakni oq chiziqqa qo‘ying'),say(`Колёса на линии: ${fit.matched} из ${fit.total}.`,`Chiziqdagi g‘ildiraklar: ${fit.matched} / ${fit.total}.`));
      stop=true;return hint('parking-hold',say('Остановитесь и зафиксируйте положение','To‘xtab, holatni saqlang'),say(`Стойте ещё ${Math.max(0,2-this.parkingHold).toFixed(1)} с.`,`Yana ${Math.max(0,2-this.parkingHold).toFixed(1)} s turing.`),['brake'],'hold');
    }
    if(t.gear===0||e.id==='start'&&t.gear!==1)return hint('gear',say('Включите первую передачу','Birinchi uzatmani tanlang'),'', ['clutch','gear1']);
    if(e.id==='start'&&t.indicator!=='left')return hint('start-signal',say('Включите левый поворотник','Chap burilish chirog‘ini yoqing'),'', ['indicatorLeft']);
    if(t.handbrake)return hint('handbrake',say('Отпустите ручник','Qo‘l tormozini bo‘shating'),'', ['handbrake']);
    if(e.id==='start')return hint('start-move',say('Начинайте движение по стрелкам','Strelkalar bo‘ylab harakatni boshlang'),say('Через 10 м после старта выключите левый поворотник.','Startdan 10 m o‘tgach chap burilish chirog‘ini o‘chiring.'),['throttle']);
    if(e.id==='acceleration'){
      if(t.gear!==2)return hint('second-gear',say('Переключитесь на вторую передачу','Ikkinchi uzatmaga o‘ting'),say('На выходе нужна скорость не ниже 20 км/ч.','Chiqishda tezlik kamida 20 km/soat bo‘lishi kerak.'),['clutch','gear2']);
      const speed=t.speed*3.6;return hint('acceleration-speed',say(speed<20?'Разгонитесь до 20 км/ч':speed>40?'Снизьте скорость до 40 км/ч':'Держите скорость 20–40 км/ч',speed<20?'20 km/soatgacha tezlaning':speed>40?'Tezlikni 40 km/soatgacha kamaytiring':'20–40 km/soat tezlikni saqlang'),say(`Сейчас ${Math.round(speed)} км/ч.`,`Hozir ${Math.round(speed)} km/soat.`),[speed>40?'brake':'throttle'],speed>=20&&speed<=40?'ready':'info');
    }
    if(e.id==='emergency')return hint('emergency-approach',say('Двигайтесь и ждите звукового сигнала','Harakatlanib, tovush signalini kuting'),say('После сигнала остановитесь и включите аварийку.','Signaldan keyin to‘xtab, avariya chirog‘ini yoqing.'),['throttle']);
    if(e.id==='finish'){
      const passed=lineDistance(t.bumper,{x:finishLinePoint.x,z:e.point.z},{x:-1,z:0})<0;
      if(t.indicator!=='right')return hint('finish-signal',say('Включите правый поворотник','O‘ng burilish chirog‘ini yoqing'),'', ['indicatorRight']);
      return hint(passed?'finish-stop':'finish-approach',say(passed?'Остановитесь за финишной линией':'Пересеките финишную линию',passed?'Finish chizig‘idan keyin to‘xtang':'Finish chizig‘ini kesib o‘ting'),'', [passed?'brake':'throttle'],passed?'hold':'info');
    }
    if(e.indicator&&t.indicator!==e.indicator)return hint('turn-signal',say('Включите правый поворотник перед поворотом','Burilishdan oldin o‘ng chiroqni yoqing'),'', ['indicatorRight']);
    return hint('follow-route',say('Следуйте стрелкам, держитесь внутри линий','Strelkalarga ergashing, chiziqlar ichida qoling'),exerciseFeedback(t,e,engine,language)?.text??'', ['throttle']);
  }
}
