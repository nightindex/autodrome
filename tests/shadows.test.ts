import { describe,expect,it } from 'vitest';
import * as T from 'three';
import { configureCarShadows } from '../src/render/car-shadows';
import { stableShadowTarget,shadowSpan,sunOffset } from '../src/render/shadow-stability';

describe('moving car shadow stability',()=>{
  it('keeps all three light-space axes fixed within a shadow texel',()=>{
    const basis=new T.Matrix4().lookAt(sunOffset,new T.Vector3(),new T.Vector3(0,1,0));
    const subTexel=new T.Vector3(.2,.2,.2).applyMatrix4(basis).multiplyScalar(shadowSpan/2048);
    expect(stableShadowTarget(subTexel,2048).length()).toBeLessThan(1e-8);
  });
  it('moves in whole light-space texels at each resolution',()=>{
    const basis=new T.Matrix4().lookAt(sunOffset,new T.Vector3(),new T.Vector3(0,1,0));
    for(const resolution of [1024,2048]){
      const target=stableShadowTarget(new T.Vector3(12.345,1.8,-31.234),resolution),texel=shadowSpan/resolution;
      for(let column=0;column<3;column++){
        const steps=target.dot(new T.Vector3().setFromMatrixColumn(basis,column))/texel;
        expect(steps).toBeCloseTo(Math.round(steps),8);
      }
    }
  });
  it('lets light through blended glass rather than casting an opaque window',()=>{
    const mesh=new T.Mesh(new T.PlaneGeometry(),new T.MeshPhysicalMaterial({transparent:true,opacity:.12}));
    configureCarShadows(mesh);expect(mesh.castShadow).toBe(false);expect(mesh.receiveShadow).toBe(false);
  });
  it('retains exterior shadows while preventing moving bands on cabin details',()=>{
    const paint=new T.Mesh(new T.BoxGeometry(),new T.MeshPhysicalMaterial());paint.name='chassis_primary';
    const seat=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());seat.name='COBALT_SeatBack_1';
    configureCarShadows(paint);configureCarShadows(seat);
    expect(paint.castShadow&&paint.receiveShadow).toBe(true);
    expect((paint.material as T.Material).shadowSide).toBe(T.BackSide);
    expect(seat.castShadow).toBe(true);expect(seat.receiveShadow).toBe(false);
  });
  it('keeps reconstructed rear upholstery, small fittings and inner arch lining free of coarse shadow bands',()=>{
    for(const name of ['COBALT_RearSeatBack','COBALT_RearQuarterPanel_1','COBALT_DefrostGrille_1','COBALT_ShiftPattern','COBALT_DashboardTray','COBALT_InstrumentHood','COBALT_Column_Indicator_COBALT_ColumnPlastic','chassis_door_lining']){
      const material=new T.MeshStandardMaterial();if(name==='chassis_door_lining')material.name='COBALT_RearWheelWellLining';
      const mesh=new T.Mesh(new T.BoxGeometry(),material);mesh.name=name;
      configureCarShadows(mesh);expect(mesh.castShadow).toBe(true);expect(mesh.receiveShadow).toBe(false);
      mesh.geometry.dispose();material.dispose();
    }
  });
  it('keeps the source parcel shelf and rear pillar lining free of coarse shadow patches',()=>{
    for(const name of ['COBALT_ParcelShelf','COBALT_RearPillarTrim','COBALT_Headliner','COBALT_HeadlinerJoint','COBALT_CabinWindowSeals','COBALT_PillarJoint']){
      const material=new T.MeshPhysicalMaterial();material.name=name;
      const mesh=new T.Mesh(new T.BoxGeometry(),material);mesh.name='chassis_door_source_trim';
      configureCarShadows(mesh);expect(mesh.castShadow).toBe(true);expect(mesh.receiveShadow).toBe(false);
      mesh.geometry.dispose();material.dispose();
    }
  });
});
