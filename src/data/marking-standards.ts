import type { Vec2 } from '../types';

/** O‘z DSt 3419:2022, annexes 1–2. Metres; V ≤ 70 km/h.
 * Sources and training-only markings: docs/road-markings.md.
 */
export const markingDimensions={
  divider:.10,edge:.15,yellowBoundary:.10,stop:.40,
  dash:2,dashGap:6,crossingStripe:.40,crossingGap:.10,crossingLength:4,
  islandBorder:.10,islandStripe:.40,islandGap:1.20,
} as const;
export const directionArrowDimensions={
  length:5,headLength:2.05,shaft:.15,headWidth:.75,
  turnWidth:1.05,turnHeadDepth:.30,turnHeadBack:.70,
  turnHeadFront:.80,turnHalfNeck:.50,turnStem:2.60,
} as const;
/** Centreline spacing of 45° hatching along the island. */
export const islandHatchPitch=(markingDimensions.islandStripe+markingDimensions.islandGap)*Math.SQRT2;

/** Stop stations are paint centres; drivers stop before the nearer edge. */
export function stopLineApproachEdge(point:Vec2,normal:Vec2):Vec2 {
  return {x:point.x-normal.x*markingDimensions.stop/2,z:point.z-normal.z*markingDimensions.stop/2};
}
