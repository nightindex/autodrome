import { describe,expect,it } from 'vitest';
import * as T from 'three';
import { rigCarWheel,carBodyLift,updateCarWheel } from '../src/render/car-wheels';
import type { Vehicle } from '../src/simulation/vehicle';
import { vehicleConfig } from '../src/data/vehicle';

function wheelFixture(){
  const car=new T.Group();car.position.set(17,.7,-9);car.rotation.set(.08,1.2,-.03);
  const source=new T.Group();source.position.set(.75,-.3,1.35);source.rotation.set(Math.PI,-.062,0);source.scale.setScalar(.86);car.add(source);
  const tyre=new T.Mesh(new T.CylinderGeometry(.37,.37,.24,64).rotateZ(Math.PI/2),new T.MeshStandardMaterial());
  tyre.position.set(.02,.025,-.04);source.add(tyre);
  const material=new T.MeshStandardMaterial();material.name='roda.043';
  const calliper=new T.Mesh(new T.BoxGeometry(.04,.12,.1),material);calliper.position.copy(tyre.position).add(new T.Vector3(0,.1,.1));source.add(calliper);
  return {car,source,tyre,calliper,wheel:rigCarWheel(car,source)};
}

describe('imported Cobalt wheel rig',()=>{
  it('raises the body to its loaded ride height while keeping tyres on the suspension',()=>{
    const {wheel}=wheelFixture(),lift=carBodyLift([wheel]);
    expect(lift).toBeGreaterThan(.07);expect(lift).toBeLessThan(.16);
    const controller={wheelSteering:()=>0,wheelRotation:()=>0,wheelSuspensionLength:()=>.212}as unknown as Vehicle['controller'];
    updateCarWheel(wheel,controller,false,false,lift);
    expect(wheel.pivot.position.y+lift-wheel.radius+vehicleConfig.wheelRadius).toBeCloseTo(.02-.212,6);
    expect(wheel.pivot.position.y-wheel.base.y).toBeLessThan(.02);
  });
  it('removes source toe-in and keeps the axle and hub fixed through a full revolution',()=>{
    const {car,source,tyre,wheel}=wheelFixture(),hub=wheel.base.clone();
    const marker=new T.Vector3(.12,.37,0).add(tyre.position),samples:T.Vector3[]=[];
    for(let i=0;i<=16;i++){
      wheel.spin.rotation.x=i*Math.PI/8;car.updateWorldMatrix(true,true);
      const matrix=car.matrixWorld.clone().invert().multiply(source.matrixWorld);
      const axis=new T.Vector3(1,0,0).transformDirection(matrix);
      expect(Math.abs(axis.x)).toBeCloseTo(1,8);expect(Math.hypot(axis.y,axis.z)).toBeLessThan(1e-8);
      const center=tyre.getWorldPosition(new T.Vector3());car.worldToLocal(center);
      expect(center.distanceTo(hub)).toBeLessThan(1e-7);
      samples.push(marker.clone().applyMatrix4(matrix));
    }
    expect(Math.max(...samples.map(p=>p.x))-Math.min(...samples.map(p=>p.x))).toBeLessThan(1e-7);
  });
  it('turns the front assembly about its hub while its calliper remains independent of spin',()=>{
    const {car,source,calliper,wheel}=wheelFixture();
    wheel.pivot.rotation.y=.45;car.updateWorldMatrix(true,true);
    const before=calliper.getWorldPosition(new T.Vector3());
    wheel.spin.rotation.x=1.7;car.updateWorldMatrix(true,true);
    expect(calliper.getWorldPosition(new T.Vector3()).distanceTo(before)).toBeLessThan(1e-8);
    const axle=new T.Vector3(1,0,0).transformDirection(car.matrixWorld.clone().invert().multiply(source.matrixWorld));
    expect(Math.abs(axle.dot(new T.Vector3(Math.cos(.45),0,-Math.sin(.45))))).toBeCloseTo(1,8);
    wheel.pivot.rotation.y=-.45;car.updateWorldMatrix(true,true);
    expect(calliper.getWorldPosition(new T.Vector3()).distanceTo(before)).toBeGreaterThan(.05);
  });
});
