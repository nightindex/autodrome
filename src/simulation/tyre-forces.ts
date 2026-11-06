import { clamp } from './math';

/** Rapier applies engine force OR brake impulse on a wheel, never both.
 * Combine the axle torque and resistance before passing them to the controller.
 * Passive retardation uses its brake path so it cannot push through zero.
 * Powered torque must also be able to overcome motion against the selected
 * gear, such as rolling downhill before an uphill launch.
 */
export function tyreForces(engineForce:number,resistance:number,gripLimit:number,speed:number,dt:number,powered=false){
  if(powered&&Math.abs(engineForce)>resistance){
    const net=engineForce-Math.sign(engineForce)*resistance;
    return {engine:clamp(net,-gripLimit,gripLimit),brake:0};
  }
  const direction=Math.abs(speed)>.05?Math.sign(speed):Math.sign(engineForce);
  const net=engineForce-direction*resistance;
  if(direction===0||net*direction<=0){
    return {engine:0,brake:clamp(resistance-engineForce*direction,0,gripLimit)*dt};
  }
  return {engine:clamp(net,-gripLimit,gripLimit),brake:0};
}
