import {describe,expect,it} from 'vitest';
import {MobilityAdvisor,type MobilityIssue,type RecoveryReason} from '../src/simulation/mobility-advisor';
import type {VehicleTelemetry} from '../src/types';

const gas={throttle:true,brake:false,clutch:false};
const released={throttle:false,brake:false,clutch:false};
function sample(patch:Partial<VehicleTelemetry>={}):VehicleTelemetry{
  return {time:0,position:{x:0,z:0},yaw:0,speed:0,signedSpeed:0,rpm:850,gear:1,throttle:0,brake:0,clutch:0,
    steering:0,engine:true,stalled:false,belt:true,handbrake:false,indicator:'off',hazards:false,ignition:true,
    positionLights:false,headlights:false,fogLights:false,bumper:{x:0,z:2.2395},wheels:[],collision:false,...patch};
}
function attempt(advisor:MobilityAdvisor,t:VehicleTelemetry,controls=gas,recovery:RecoveryReason=null){
  return advisor.update(t,controls,.71,recovery);
}

describe('contextual mobility advice',()=>{
  it.each<{issue:MobilityIssue;patch:Partial<VehicleTelemetry>}>([
    {issue:'engine',patch:{engine:false}},
    {issue:'stalled',patch:{engine:false,stalled:true}},
    {issue:'neutral',patch:{gear:0}},
    {issue:'handbrake',patch:{handbrake:true}},
    {issue:'brake',patch:{brake:1}},
    {issue:'clutch',patch:{clutch:1}},
  ])('explains a failed launch caused by $issue after sustained gas',({issue,patch})=>{
    const advisor=new MobilityAdvisor(),t=sample(patch);
    expect(advisor.update(t,gas,.35,null)).toBeNull();
    expect(advisor.update(t,gas,.36,null)).toBe(issue);
  });

  it('does not warn about ordinary parked controls without a launch attempt',()=>{
    const advisor=new MobilityAdvisor(),t=sample({engine:false,gear:0,handbrake:true,clutch:1});
    expect(advisor.update(t,released,60,null)).toBeNull();
  });

  it('does not accumulate separate short taps of the gas',()=>{
    const advisor=new MobilityAdvisor(),t=sample({handbrake:true});
    for(let i=0;i<5;i++){
      expect(advisor.update(t,gas,.3,null)).toBeNull();
      expect(advisor.update(t,released,.2,null)).toBeNull();
    }
  });

  it('uses only elapsed simulation time, including while paused',()=>{
    const advisor=new MobilityAdvisor(),t=sample({gear:0});
    expect(advisor.update(t,gas,.35,null)).toBeNull();
    for(let i=0;i<20;i++)expect(advisor.update({...t,time:1000+i},gas,0,null)).toBeNull();
    expect(advisor.update(t,gas,.36,null)).toBe('neutral');
    expect(advisor.update(t,released,0,null)).toBe('neutral');
    expect(advisor.update(t,released,3.9,null)).toBe('neutral');
    expect(advisor.update(t,released,.2,null)).toBeNull();
  });

  it('recognizes a manually held clutch before its animation reaches full travel',()=>{
    const advisor=new MobilityAdvisor();
    expect(attempt(advisor,sample({clutch:.5}),{...gas,clutch:true})).toBe('clutch');
  });

  it('does not mistake an assisted slipping clutch for a blocked launch',()=>{
    const advisor=new MobilityAdvisor();
    expect(attempt(advisor,sample({clutch:.8}))).toBeNull();
    expect(advisor.update(sample({clutch:.5,speed:.3}),gas,.5,null)).toBeNull();
    expect(advisor.update(sample({speed:1}),gas,.5,null)).toBeNull();
  });

  it('recognizes a held brake before pedal pressure has ramped up',()=>{
    expect(attempt(new MobilityAdvisor(),sample({brake:0}),{...gas,brake:true})).toBe('brake');
  });

  it('keeps advice briefly after gas release and clears as soon as its cause is fixed',()=>{
    const advisor=new MobilityAdvisor(),t=sample({handbrake:true});
    expect(attempt(advisor,t)).toBe('handbrake');
    expect(advisor.update(t,released,3.9,null)).toBe('handbrake');
    expect(advisor.update(sample({gear:0}),released,.01,null)).toBeNull();
    expect(advisor.update(sample({gear:0}),gas,.3,null)).toBeNull();
  });

  it('renews advice when another sustained launch is attempted',()=>{
    const advisor=new MobilityAdvisor(),t=sample({handbrake:true});
    expect(attempt(advisor,t)).toBe('handbrake');
    expect(advisor.update(t,released,3.9,null)).toBe('handbrake');
    expect(attempt(advisor,t)).toBe('handbrake');
    expect(advisor.update(t,released,3.9,null)).toBe('handbrake');
  });

  it('clears latched advice while moving and requires another sustained gas attempt',()=>{
    const advisor=new MobilityAdvisor(),t=sample({handbrake:true});
    expect(attempt(advisor,t)).toBe('handbrake');
    expect(advisor.update({...t,speed:.4},gas,.1,null)).toBeNull();
    expect(advisor.update(t,gas,.3,null)).toBeNull();
    expect(advisor.update({...t,speed:5},gas,10,'stuck')).toBeNull();
  });

  it('walks through simultaneous blockers in actionable priority order',()=>{
    const advisor=new MobilityAdvisor();let t=sample({engine:false,stalled:true,gear:0,handbrake:true,brake:1,clutch:1});
    expect(attempt(advisor,t)).toBe('stalled');
    t={...t,stalled:false};expect(advisor.update(t,gas,.1,null)).toBe('engine');
    t={...t,engine:true};expect(advisor.update(t,gas,.1,null)).toBe('neutral');
    t={...t,gear:1};expect(advisor.update(t,gas,.1,null)).toBe('handbrake');
    t={...t,handbrake:false};expect(advisor.update(t,gas,.1,null)).toBe('brake');
    t={...t,brake:0};expect(advisor.update(t,gas,.1,null)).toBe('clutch');
    t={...t,clutch:0};expect(advisor.update(t,gas,.1,null)).toBeNull();
  });

  it('prioritizes overturning immediately and retains confirmed stuck advice without gas',()=>{
    const advisor=new MobilityAdvisor(),t=sample({engine:false,gear:0,handbrake:true});
    expect(advisor.update(t,released,0,'overturned')).toBe('overturned');
    expect(advisor.update(sample(),released,60,'stuck')).toBe('stuck');
    expect(advisor.update(sample(),released,60,'stuck')).toBe('stuck');
    expect(advisor.update(sample(),released,.1,null)).toBeNull();
  });

  it('shows an immediate control blocker before confirmed stuck advice once the launch is attempted',()=>{
    const advisor=new MobilityAdvisor(),t=sample({handbrake:true});
    expect(attempt(advisor,t,gas,'stuck')).toBe('handbrake');
    expect(advisor.update(t,released,1,'stuck')).toBe('handbrake');
    expect(advisor.update(sample(),released,.1,'stuck')).toBe('stuck');
  });

  it('reset clears the old session and recovery attempt',()=>{
    const advisor=new MobilityAdvisor(),t=sample({gear:0});
    expect(attempt(advisor,t)).toBe('neutral');advisor.reset();
    expect(advisor.update(t,released,.1,null)).toBeNull();
    expect(advisor.update(t,gas,.3,null)).toBeNull();
  });
});
