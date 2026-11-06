import type { VehicleConfig } from '../types';
export const vehicleConfig: VehicleConfig = {
  length: 4.479, width: 1.735, height: 1.514, wheelbase: 2.620,
  mass: 1200, track: 1.49, wheelRadius: 0.317, idleRpm: 850, redlineRpm: 6200,
  gearRatios: [0, 3.73, 1.96, 1.32, 0.95, 0.76], reverseRatio: 3.55,
  finalDrive: 4.18, maxTorque: 134, verification: 'estimated',
};

// Gameplay estimates for a dry-road, front-wheel-drive manual Cobalt.
// Keep resistance explicit: body damping must not dictate top speed.
export const vehicleDynamics={
  airDensity:1.225,dragArea:.70,rollingResistance:.013,grassResistance:.065,
  drivelineEfficiency:.88,clutchCapacity:210,engineInertia:.24,
  serviceBrakeForce:10500,frontBrakeShare:.66,parkingBrakeForce:8000,
  suspensionRestLength:.28,suspensionTravel:.18,suspensionStiffness:32,antiRollStiffness:4200,
  maxSuspensionForce:9500,asphaltGrip:.95,grassGrip:.45,
  handbrakeGrip:.65,maxSteeringAngle:.56,steeringLateralAcceleration:6.5,
};
