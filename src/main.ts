import './style.css';
import RAPIER from '@dimforge/rapier3d-compat';
import { course, itinerary } from './data/course';
import { Vehicle } from './simulation/vehicle';
import { Input } from './simulation/input';
import { ExamEngine } from './simulation/exam';
import { CourseTracker } from './simulation/tracker';
import { GameScene } from './render/scene';
import { EngineAudio } from './render/audio';
import { Interface } from './ui/interface';
import { readSettings, saveSettings } from './ui/storage';
import { ruleById } from './data/rules';
import type { ExamResult, Mode } from './types';
import { label } from './ui/i18n';
import {loadDirectionSignArtwork} from './render/road-signs';

const settings=readSettings();document.documentElement.lang=settings.language;
let vehicle:Vehicle,scene:GameScene,physics:RAPIER.World;
let engine=new ExamEngine('practice'),tracker=new CourseTracker(false),mode:Mode='practice';
let mirrorPreviewLook:number|undefined;
let state:'menu'|'driving'|'paused'|'result'='menu';let selectedIndex:number|undefined;
let accumulator=0,lastTime=performance.now(),uiAccumulator=0,eventCount=0,emergencyUntil=0;
const audio=new EngineAudio();audio.volume=settings.volume;
const input=new Input(settings.bindings);
const ui=new Interface(settings,{
  mirrorCamera:()=>{if(state==='driving')scene.cameraMode='cockpit';},
  lights:action=>{if(state==='driving')switchLights(action);},
  mirrorsChanged:persist=>{scene?.setMirrorAdjustments(settings.mirrors);if(persist)saveSettings(settings);},
  mirrorSelect:side=>{mirrorPreviewLook=side==='left'?1:side==='right'?-1:undefined;},
  start,pause,resume,menu:goMenu,reset:()=>start(mode,selectedIndex),camera:()=>scene?.cycleCamera(),
  settingsChanged:()=>{saveSettings(settings);input.bindings=settings.bindings;audio.volume=settings.volume;scene?.setQuality(settings.quality);scene?.setMirrorAdjustments(settings.mirrors);},
});
input.onAction=action=>{
  if(action==='pause'){state==='driving'?pause():state==='paused'?resume():null;return;}
  if(state!=='driving')return;
  if(action==='camera'){scene.cycleCamera();return;}
  if(['positionLights','headlights','fogLights'].includes(action)){switchLights(action);return;}
  const assist=mode==='practice'&&settings.assist;
  if((action.startsWith('gear')||action==='reverse')&&vehicle.drivetrain.clutch<=.65&&vehicle.drivetrain.engine&&!assist)ui.toast(ui.c.gearWarning);
  vehicle.action(action,assist);
};
function switchLights(action:string){
  if(action==='fogLights'&&!vehicle.canUseFogLights){ui.toast(label('fogLightsRequirement',settings.language));return;}
  vehicle.action(action);
}
function start(nextMode:Mode,index?:number){
  if(!ui.ready)return;
  mode=nextMode;selectedIndex=index;engine=new ExamEngine(mode,settings.examMinutes*60);
  tracker=new CourseTracker(index!==undefined,index!==undefined?[course.exercises[index]]:itinerary);
  const exercise=tracker.current;engine.setExercise(exercise.id);vehicle.reset(exercise.spawn,exercise.yaw);
  input.clear();input.enabled=true;state='driving';accumulator=0;eventCount=0;emergencyUntil=0;
  scene.cameraMode='chase';scene.setGoal(exercise.point,mode==='practice');ui.enter(mode,index!==undefined);ui.emergency(false);void audio.start().catch(()=>{});
}
function pause(){if(state!=='driving'&&state!=='paused')return;state='paused';input.clear();input.enabled=false;accumulator=0;ui.showPause(mode);}
function resume(){if(state!=='paused')return;state='driving';input.clear();input.enabled=true;ui.enter(mode,selectedIndex!==undefined);accumulator=0;lastTime=performance.now();void audio.start().catch(()=>{});}
function goMenu(){
  if(state==='paused'&&mode==='exam'){engine.update(vehicle.telemetry(),{abandoned:true},0);finish();return;}
  state='menu';input.clear();input.enabled=false;ui.showMenu();scene.setGoal(tracker.current.point,false);
  vehicle.reset(course.exercises[0].spawn,course.exercises[0].yaw);
}
function finish(){
  if(state==='result')return;state='result';input.enabled=false;input.clear();
  const result:ExamResult={date:new Date().toISOString(),mode,elapsed:engine.time,score:engine.score,passed:engine.status==='passed'||(mode==='practice'&&engine.score<100),completed:engine.status==='passed',events:[...engine.events]};
  if(selectedIndex===undefined){settings.results.push(result);settings.results=settings.results.slice(-10);saveSettings(settings);}
  ui.showResult(result,selectedIndex!==undefined);
}
function step(dt:number){
  vehicle.update(dt,input,mode==='practice'&&settings.assist,mode==='practice'&&settings.steeringAssist);const t=vehicle.telemetry();const evaluation=tracker.update(t,dt);
  engine.update(t,evaluation.observations,dt);
  if(evaluation.emergency){audio.beep();emergencyUntil=engine.time+4;ui.emergency(true);}
  if(engine.time>emergencyUntil)ui.emergency(false);
  if(engine.events.length>eventCount){const event=engine.events.at(-1)!;ui.toast(`+${event.points} · ${ruleById(event.ruleId).text[settings.language]}`,true);eventCount=engine.events.length;}
  if(engine.status!=='running'){finish();return;}
  let done=evaluation.atGoal;
  if(tracker.current.id==='emergency')done=engine.emergencyCompleted&&!t.hazards&&t.speed>.25;
  if(done){
    if(selectedIndex!==undefined){engine.status='passed';finish();return;}
    if(tracker.next()){engine.setExercise(tracker.current.id);scene.setGoal(tracker.current.point,mode==='practice');ui.toast(`${ui.c.newExercise}: ${tracker.current.name[settings.language]}`);}
    else {engine.status=engine.score<100?'passed':'failed';finish();}
  }
}
function frame(now:number){
  const raw=(now-lastTime)/1000,dt=Math.min(.1,Math.max(.001,raw));lastTime=now;
  if(state==='driving'){
    accumulator+=dt;while(accumulator>=1/60&&state==='driving'){step(1/60);accumulator-=1/60;}
  }
  if(scene&&vehicle){
    scene.cabinInteractionEnabled=state==='driving';
    scene.cabinControlLabel=settings.language==='ru'?'Регулировка зеркал':'Ko‘zgularni sozlash';
    scene.render(vehicle,dt,now/1000,state==='menu',mirrorPreviewLook??(+input.down('lookRight')-+input.down('lookLeft')));
    const t=vehicle.telemetry();audio.update(t.rpm,t.throttle,t.engine,state!=='driving');
    uiAccumulator+=dt;if(uiAccumulator>.08&&state!=='menu'){uiAccumulator=0;ui.update(t,engine,tracker.current,tracker.index,tracker.exercises.length,scene.cameraMode,scene.fps,selectedIndex!==undefined);}
  }
  requestAnimationFrame(frame);
}
window.addEventListener('blur',()=>{if(state==='driving')pause();});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&state==='driving')pause();});
async function boot(){
  try{
    await Promise.all([RAPIER.init(),loadDirectionSignArtwork()]);physics=new RAPIER.World({x:0,y:-9.81,z:0});vehicle=new Vehicle(physics,new Set());
    vehicle.reset(course.exercises[0].spawn,course.exercises[0].yaw);
    scene=new GameScene(ui.viewport,vehicle);scene.setQuality(settings.quality);scene.setMirrorAdjustments(settings.mirrors);
    scene.onCabinMirrorSwitch=()=>{if(state==='driving')ui.openMirrorControls();};
    requestAnimationFrame(frame);await scene.loadCar(v=>ui.progress(v));ui.setReady();
    // Diagnostics are read-only in production. Test controls are gated by Vite's dev mode.
    Object.defineProperty(window,'__avtodrom',{value:{
      snapshot:()=>({state,mode,exercise:tracker.current.id,index:tracker.index,telemetry:vehicle.telemetry(),score:engine.score,events:engine.events,fps:scene.fps,drawCalls:scene.renderStats.calls,triangles:scene.renderStats.triangles,camera:scene.cameraMode,loaded:scene.loaded,wheels:vehicle.controller.numWheels()}),
      ...(import.meta.env.DEV?{start,vehicle,engine:()=>engine,tracker:()=>tracker,scene,step,pause,resume}:{}),
    }});
  }catch(error){console.error(error);ui.showError(error instanceof Error&&/WebGL/i.test(error.message)?ui.c.webgl:`${ui.c.loadError}. ${String(error)}`);}
}
void boot();
