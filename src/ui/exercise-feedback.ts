import type { Exercise, Language, VehicleTelemetry } from '../types';
import type { ExamEngine } from '../simulation/exam';
import { lineDistance } from '../simulation/math';
import { signalAxis,signalState } from '../data/traffic-signals';
import { formatTime } from './i18n';
import { stopLineApproachEdge } from '../data/marking-standards';

const text={
  uz:{distance:'Stop chizig‘igacha',metres:'m',hold:'To‘xtab turing',seconds:'s',done:'To‘xtash qabul qilindi',past:'Stop chizig‘i ortda',time:'Qolgan vaqt',red:'Qizil — kuting',amber:'Sariq — kuting',green:'Yashil — davom eting',reverse:'Orqaga kirib joylashing'},
  ru:{distance:'До стоп-линии',metres:'м',hold:'Стойте ещё',seconds:'с',done:'Остановка засчитана',past:'Стоп-линия позади',time:'Осталось времени',red:'Красный — ждите',amber:'Жёлтый — ждите',green:'Зелёный — можно ехать',reverse:'Въезжайте задним ходом'},
};
export function exerciseFeedback(t:VehicleTelemetry,e:Exercise,engine:ExamEngine,language:Language){
  const c=text[language];
  if(e.stop){
    const d=lineDistance(t.bumper,stopLineApproachEdge(e.stop.point,e.stop.normal),e.stop.normal);
    const distance=`${c.distance}: ${Math.max(0,d).toFixed(1)} ${c.metres}`;
    if(e.stop.light){const signal=signalState(t.time,signalAxis(e.stop.normal));return {text:`${c[signal]} · ${distance}`,state:signal==='green'?'ready':'hold'};}
    if(engine.stoppedCorrectly)return {text:c.done,state:'ready'};
    if(d<0)return {text:c.past,state:'warning'};
    if(d<=1&&t.speed<.12)return {text:`${distance} · ${c.hold}: ${Math.max(0,3-engine.stopSeconds).toFixed(1)} ${c.seconds}`,state:'hold'};
    return {text:distance,state:'info'};
  }
  if(e.timeLimit)return {text:`${c.time}: ${formatTime(Math.max(0,e.timeLimit-engine.exerciseTime))}`,state:engine.exerciseTime>e.timeLimit?'warning':'info'};
  if(e.parking&&!engine.parkingReversed)return {text:c.reverse,state:'info'};
  return null;
}
