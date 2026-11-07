import type { Vec2 } from '../types';

/** O‘z DSt 3419:2022, annexes 1–2. Metres; V ≤ 70 km/h.
 * Sources and training-only markings: docs/road-markings.md.
 */
export const markingDimensions={
  divider:.10,edge:.15,stop:.40,
  dash:2,dashGap:6,crossingStripe:.40,crossingGap:.10,crossingLength:2.6,
  islandBorder:.10,islandStripe:.40,islandGap:1.20,
} as const;
// Silhouettes measured on the supplied plan at the existing 0.1 m/pixel scale.
// These are diagram proportions, rather than a claim of regulatory dimensions.
export const directionArrowDimensions={
  length:5,headLength:1.8,shaft:.2,headWidth:1.2,
  turnWidth:1.8,turnStem:2.6,combinedLength:6,combinedWidth:2.2,
} as const;
// O'z DSt 3419:2022, annex 2, figure 3 and table 1 (V <= 70 km/h).
// The dimensioned 1.18 drawing is also reproduced in GOST R 51256-2011, B.2.
export const standardTurnArrowDimensions={
  length:5,shaft:.15,stem:2.6,a1:.7,a2:.8,b:.5,headBase:.75,headDepth:.3,
} as const;
/** Centreline spacing of 45° hatching along the island. */
export const islandHatchPitch=(markingDimensions.islandStripe+markingDimensions.islandGap)*Math.SQRT2;

/** Stop stations are paint centres; drivers stop before the nearer edge. */
export function stopLineApproachEdge(point:Vec2,normal:Vec2):Vec2 {
  return {x:point.x-normal.x*markingDimensions.stop/2,z:point.z-normal.z*markingDimensions.stop/2};
}
