import { beforeAll,describe,expect,it } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Quaternion,Vector3 } from 'three';
import { Vehicle } from '../src/simulation/vehicle';
import { rpmAtSpeed } from '../src/simulation/drivetrain';
import type { Input } from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});

function flatTrack(){
  const world=new RAPIER.World({x:0,y:-9.81,z:0});
  world.createCollider(RAPIER.ColliderDesc.cuboid(1000,.2,1000).setTranslation(0,-.2,0));
  const car=new Vehicle(world,new Set());car.reset({x:0,z:0},0);
  const held=new Set<string>(),input={down:(action:string)=>held.has(action)}as Input;
  const step=()=>car.update(1/60,input,true);
  for(let i=0;i<120;i++)step();
  return {car,held,input,step,dispose(){car.dispose();world.free();}};
}

describe('tyre contact and braking',()=>{
  it.each([1,-1])('increases rollback deceleration when the brake is pressed in gear direction %i',(direction)=>{
    const deceleration=(brake:number)=>{
      const run=flatTrack();
      try{
        const {car,held,input}=run;
        car.drivetrain.clutch=1;car.action('ignition');car.action(direction>0?'gear1':'reverse');car.action('handbrake');
        // The car has rolled back after selecting its intended launch gear.
        // Compare the same partially engaged clutch during brake pedal travel.
        car.drivetrain.clutch=.6;car.drivetrain.rpm=2000;car.drivetrain.throttle=1;car.drivetrain.brake=brake;
        car.body.setLinvel({x:0,y:0,z:-direction*2},true);held.add('throttle');held.add('brake');
        car.update(1/60,input,false);
        return (car.telemetry().signedSpeed+direction*2)*direction;
      }finally{run.dispose();}
    };
    const changes=[0,.2,.4,.6,.8].map(deceleration);
    expect(changes[0]).toBeGreaterThan(0);
    for(let i=1;i<changes.length;i++)expect(changes[i]).toBeGreaterThanOrEqual(changes[i-1]-.001);
    expect(changes[2]).toBeGreaterThan(changes[0]+.02);
  });

  it.each([
    {direction:'forward',speed:50/3.6,action:'gear2',gear:2},
    {direction:'reverse',speed:-30/3.6,action:'reverse',gear:-1},
  ])('stops $direction motion in gear while the throttle remains fully pressed',({speed,action,gear})=>{
    const run=flatTrack();
    try{
      const {car,held,step}=run,direction=Math.sign(speed);
      car.drivetrain.clutch=1;car.action('ignition');car.action(action);car.action('handbrake');
      expect(car.drivetrain.gear).toBe(gear);
      car.drivetrain.clutch=0;car.drivetrain.throttle=1;car.drivetrain.rpm=rpmAtSpeed(speed,gear);
      car.body.setLinvel({x:0,y:0,z:speed},true);
      held.add('throttle');held.add('brake');const start=car.body.translation().z;
      let lowestSpeed=Math.abs(speed);
      for(let i=0;i<300;i++){step();lowestSpeed=Math.min(lowestSpeed,car.telemetry().signedSpeed*direction);}
      const stopped=car.telemetry(),distance=(stopped.position.z-start)*direction;
      expect(stopped.speed).toBeLessThan(.15);
      expect(distance).toBeLessThan(25);
      expect(distance).toBeGreaterThan(2);
      expect(lowestSpeed).toBeGreaterThan(-.1);
      expect(stopped.engine).toBe(true);
    }finally{run.dispose();}
  });

  it('samples the road surface at each tyre when only one side is on grass',()=>{
    const run=flatTrack();
    try{
      run.car.surfaceAt=point=>point.x>0?'grass':'asphalt';
      for(let i=0;i<5;i++)run.step();
      expect(Math.abs(run.car.body.translation().x)).toBeLessThan(.05);
      for(const [left,right]of [[0,1],[2,3]]){
        expect(run.car.controller.wheelIsInContact(left)).toBe(true);
        expect(run.car.controller.wheelIsInContact(right)).toBe(true);
        expect(run.car.controller.wheelContactPoint(left)!.x).toBeLessThan(0);
        expect(run.car.controller.wheelContactPoint(right)!.x).toBeGreaterThan(0);
        expect(run.car.controller.wheelFrictionSlip(right)!).toBeLessThan(run.car.controller.wheelFrictionSlip(left)!);
      }
    }finally{run.dispose();}
  });

  it('needs more stopping distance on grass despite its higher rolling resistance',()=>{
    const stop=(grass:boolean)=>{
      const run=flatTrack();
      try{
        if(grass)run.car.surfaceAt=()=> 'grass';
        run.car.action('handbrake');run.car.body.setLinvel({x:0,y:0,z:50/3.6},true);
        run.held.add('brake');const start=run.car.body.translation().z;
        for(let i=0;i<360&&run.car.telemetry().speed>.1;i++)run.step();
        expect(run.car.telemetry().speed).toBeLessThan(.1);
        return run.car.body.translation().z-start;
      }finally{run.dispose();}
    };
    const asphalt=stop(false),grass=stop(true);
    expect(grass).toBeGreaterThan(asphalt*1.2);
    expect(grass).toBeLessThan(60);
  });

  it('includes uphill velocity when measuring speed along the tilted chassis',()=>{
    const run=flatTrack();
    try{
      const orientation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-.3);
      const velocity=new Vector3(0,0,12).applyQuaternion(orientation);
      run.car.body.setRotation(orientation,true);run.car.body.setLinvel(velocity,true);
      expect(run.car.telemetry().signedSpeed).toBeCloseTo(12,4);
    }finally{run.dispose();}
  });

  it('allows the rear axle to slide and rotate the car during a moving handbrake turn',()=>{
    const turn=(handbrake:boolean)=>{
      const run=flatTrack();
      try{
        const {car,held,step}=run;car.action('handbrake');
        car.body.setLinvel({x:0,y:0,z:50/3.6},true);held.add('left');
        for(let i=0;i<36;i++)step();
        if(handbrake)car.action('handbrake');
        let sideSpeed=0,yawRate=0;
        for(let i=0;i<60;i++){
          step();const q=car.body.rotation(),v=car.body.linvel();
          const side=new Vector3(1,0,0).applyQuaternion(new Quaternion(q.x,q.y,q.z,q.w));
          sideSpeed=Math.max(sideSpeed,Math.abs(side.dot(new Vector3(v.x,v.y,v.z))));
          yawRate=Math.max(yawRate,Math.abs(car.body.angvel().y));
          expect(1-2*(q.x*q.x+q.z*q.z)).toBeGreaterThan(.75);
        }
        return {sideSpeed,yawRate};
      }finally{run.dispose();}
    };
    const coasting=turn(false),locked=turn(true);
    expect(locked.sideSpeed).toBeGreaterThan(coasting.sideSpeed*1.8);
    expect(locked.yawRate).toBeGreaterThan(coasting.yawRate*1.4);
  });

  it('lets insufficient rear tyre grip slide downhill instead of creating artificial brake hold',()=>{
    const park=(grass:boolean)=>{
      const angle=Math.atan(.3),world=new RAPIER.World({x:0,y:-9.81,z:0});
      const slope=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle);
      world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100)
        .setTranslation(0,-.2/Math.cos(angle),0).setRotation(slope));
      const car=new Vehicle(world,new Set());car.reset({x:0,z:0},Math.PI/2);
      car.body.setRotation(slope.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2)),true);
      if(grass)car.surfaceAt=()=> 'grass';
      const input={down:()=>false}as unknown as Input;
      try{
        for(let i=0;i<240;i++)car.update(1/60,input,true);
        return car.body.translation().x;
      }finally{car.dispose();world.free();}
    };
    expect(Math.abs(park(false))).toBeLessThan(.15);
    expect(park(true)).toBeLessThan(-.7);
  });

  it('wakes a parked sleeping car when its handbrake is released on a ramp',()=>{
    const angle=Math.atan(.1),world=new RAPIER.World({x:0,y:-9.81,z:0});
    const slope=new Quaternion().setFromAxisAngle(new Vector3(0,0,1),angle);
    world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100)
      .setTranslation(0,-.2/Math.cos(angle),0).setRotation(slope));
    const car=new Vehicle(world,new Set());car.reset({x:0,z:0},Math.PI/2);
    car.body.setRotation(slope.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0,1,0),Math.PI/2)),true);
    const input={down:()=>false}as unknown as Input;
    try{
      for(let i=0;i<180;i++)car.update(1/60,input,true);
      const start=car.body.translation().x;car.body.sleep();expect(car.body.isSleeping()).toBe(true);
      car.action('handbrake');expect(car.body.isSleeping()).toBe(false);
      for(let i=0;i<180;i++)car.update(1/60,input,true);
      expect(car.body.translation().x).toBeLessThan(start-.3);
    }finally{car.dispose();world.free();}
  });
});
