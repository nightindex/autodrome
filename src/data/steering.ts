/** Keyboard steering calibration. Angles/rates here are handwheel degrees,
 * speeds are km/h; the simulation converts to radians and m/s at its boundary.
 * Input filtering is a gameplay choice, independent of the mechanical ratio. */
export interface SteeringCurvePoint {speedKmh:number;value:number}
export const steeringConfig={
  mechanics:{maxHandwheelAngleDeg:516.6,steeringRatio:15.8},
  keyboard:{
    // Keyboard response: about 0.58 s centre-to-lock / 0.96 s lock-to-lock.
    turnRateDegPerSecond:900,
    // Opposite input unwinds the existing turn faster, up to centre only.
    countersteerRateDegPerSecond:1440,
    // Blend unwinding into the soft-centre rate over the final 15% of travel.
    countersteerBlendZoneFraction:.15,
    returnRateDegPerSecond:960,
    // The configured A/D bindings remain remappable; these are extra keys.
    aliases:{left:['ArrowLeft'],right:['ArrowRight']} as Record<string,string[]>,
  },
  // Smoothstep interpolation gives a flat tangent at both speed thresholds.
  speedLimitCurve:[{speedKmh:20,value:516.6},{speedKmh:100,value:75}] satisfies SteeringCurvePoint[],
  returnMultiplierCurve:[{speedKmh:0,value:1},{speedKmh:100,value:1.25}] satisfies SteeringCurvePoint[],
  gamma:{
    centerZoneFraction:.15,
    exponent:1.5,
    minimumRateFactor:.85,
  },
  // Optional practice aid may reduce the speed envelope further on poor grip.
  gripAssist:{maxLateralAcceleration:6.5,frictionSafetyFactor:.85},
  // Integrate the variable near-centre rate consistently at different FPS.
  maxIntegrationStepSeconds:1/240,
};
export type SteeringConfig=typeof steeringConfig;
