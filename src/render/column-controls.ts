import * as T from 'three';
import type { VehicleTelemetry } from '../types';

/** The left column switch latches with the selected signal, independently of
 * wheel rotation, lamp flash phase and the hazard switch. */
export class ColumnControls{
  private stalk:T.Object3D|undefined;private neutral=new T.Quaternion();private angle=0;
  constructor(model:T.Object3D){
    this.stalk=model.getObjectByName('COBALT_INDICATOR_STALK');
    if(this.stalk)this.neutral.copy(this.stalk.quaternion);
  }
  update(indicator:VehicleTelemetry['indicator'],dt:number){
    if(!this.stalk)return;
    // +X is the driver's left: down selects left; up selects right.
    const target=indicator==='left'?-.16:indicator==='right'?.16:0;
    this.angle=T.MathUtils.damp(this.angle,target,22,Math.max(0,dt));
    if(Math.abs(this.angle-target)<1e-5)this.angle=target;
    this.stalk.quaternion.copy(this.neutral).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),this.angle));
  }
}
