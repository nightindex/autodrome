import type { Vec2, VehicleConfig } from '../types';
// Body dimensions, wheelbase, axle tracks and 160 mm clearance follow the
// user-supplied Cobalt diagram. Tyres use the selected 195/65 R15 size.
export const vehicleConfig: VehicleConfig = {
  length: 4.479, width: 1.735, height: 1.514, wheelbase: 2.620,
  mass: 1200, frontTrack: 1.504, rearTrack: 1.509, wheelRadius: 0.31725, tyreWidth: .195, rimDiameter: .381, groundClearance: .160,
  idleRpm: 850, redlineRpm: 6200,
  gearRatios: [0, 3.73, 1.96, 1.32, 0.95, 0.76], reverseRatio: 3.55,
  finalDrive: 4.18, maxTorque: 134, verification: 'estimated',
};

/** Controller order: front (-X,+X), rear (-X,+X); +X is the driver's left. */
export const wheelTrack=(index:number)=>index<2?vehicleConfig.frontTrack:vehicleConfig.rearTrack;
export const wheelCenter=(index:number):Vec2=>({
  x:(index%2===0?-1:1)*wheelTrack(index)/2,
  z:(index<2?1:-1)*vehicleConfig.wheelbase/2,
});

// Gameplay estimates for a dry-road, front-wheel-drive manual Cobalt.
// Keep resistance explicit: body damping must not dictate top speed.
export const vehicleDynamics={
  airDensity:1.225,dragArea:.70,rollingResistance:.013,grassResistance:.065,
  drivelineEfficiency:.88,clutchCapacity:210,engineInertia:.24,
  serviceBrakeForce:10500,frontBrakeShare:.66,parkingBrakeForce:8000,
  // Nominal settled length measured on flat asphalt with this controller.
  suspensionRestLength:.28,loadedSuspensionLength:.21179,suspensionTravel:.18,suspensionStiffness:32,antiRollStiffness:4200,
  maxSuspensionForce:9500,asphaltGrip:.95,grassGrip:.45,
  handbrakeGrip:.65,maxSteeringAngle:.56,steeringLateralAcceleration:6.5,
};
