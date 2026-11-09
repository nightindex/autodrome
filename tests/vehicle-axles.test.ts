import {beforeAll,describe,expect,it} from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import {vehicleConfig,wheelCenter} from '../src/data/vehicle';
import {Vehicle} from '../src/simulation/vehicle';
import {localPoint} from '../src/simulation/math';
import type {Input} from '../src/simulation/input';

beforeAll(async()=>{await RAPIER.init();});
const idle={down:()=>false}as unknown as Input;

describe('Cobalt axle geometry from the supplied dimensions',()=>{
  it('keeps suspension, physical tyres and scoring wheel positions on the same axles',()=>{
    const world=new RAPIER.World({x:0,y:-9.81,z:0});
    world.createCollider(RAPIER.ColliderDesc.cuboid(100,.2,100).setTranslation(0,-.2,0));
    const car=new Vehicle(world,new Set());
    try{
      for(const yaw of [0,1.1]){
        car.reset({x:4,z:-3},yaw);
        for(let i=0;i<90;i++)car.update(1/60,idle,true);
        const telemetry=car.telemetry();
        for(let index=0;index<4;index++){
          const center=wheelCenter(index),connection=car.controller.wheelChassisConnectionPointCs(index)!;
          const expected=localPoint(telemetry.position,telemetry.yaw,center.x,center.z);
          const tyre=car.body.collider(index+1),position=tyre.translation();
          expect(connection.x).toBeCloseTo(center.x,6);expect(connection.z).toBeCloseTo(center.z,6);
          expect(car.controller.wheelRadius(index)).toBeCloseTo(.31725,6);
          expect(telemetry.wheels[index].x).toBeCloseTo(expected.x,6);
          expect(telemetry.wheels[index].z).toBeCloseTo(expected.z,6);
          expect(position.x).toBeCloseTo(expected.x,4);expect(position.z).toBeCloseTo(expected.z,4);
        }
        const wheels=telemetry.wheels,distance=(a:number,b:number)=>Math.hypot(wheels[a].x-wheels[b].x,wheels[a].z-wheels[b].z);
        expect(distance(0,1)).toBeCloseTo(1.504,6);expect(distance(2,3)).toBeCloseTo(1.509,6);
        const front={x:(wheels[0].x+wheels[1].x)/2,z:(wheels[0].z+wheels[1].z)/2};
        const rear={x:(wheels[2].x+wheels[3].x)/2,z:(wheels[2].z+wheels[3].z)/2};
        expect(Math.hypot(front.x-rear.x,front.z-rear.z)).toBeCloseTo(2.620,6);
      }
    }finally{car.dispose();world.free();}
  });
  it('uses the 195/65 R15 tyre diameter and width for each finite contact shape',()=>{
    const world=new RAPIER.World({x:0,y:-9.81,z:0}),car=new Vehicle(world,new Set());
    try{
      expect(vehicleConfig.wheelRadius*2).toBeCloseTo(.381+2*.195*.65,8);
      for(let index=0;index<4;index++){
        const shape=car.body.collider(index+1).shape as RAPIER.RoundCylinder;
        expect(2*(shape.halfHeight+shape.borderRadius)).toBeCloseTo(.195,6);
        // The existing obstacle solver retains its 17 mm skin clearance.
        expect(shape.radius+shape.borderRadius).toBeCloseTo(vehicleConfig.wheelRadius-.017,6);
      }
    }finally{car.dispose();world.free();}
  });
});
