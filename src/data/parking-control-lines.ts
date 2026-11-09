import type { PlanPoint } from './after-hill';
import { vehicleConfig } from './vehicle';

// Training wheel-contact stripes, not ordinary parking-space outlines.
// The supplied plan shows about three pixels of white at 0.1 m/pixel;
// uz_video.mp4 06:00 and 09:20 establish which wheels stop on each stripe.
export const parkingControlWidth=.30;
export const parkingControlLines:{id:string;points:[PlanPoint,PlanPoint]}[]=[
  {id:'garage-left-stop',points:[[139,252.1],[139,295.9]]},
  {id:'garage-middle-stop',points:[[333,272.1],[333,327.9]]},
  {id:'garage-middle-lower-stop',points:[[335,341.1],[335,385.9]]},
  {id:'garage-right-stop',points:[[564.5,290.1],[564.5,331.9]]},
  {id:'parking-left-stop',points:[[72.1,606],[162.9,606]]},
  {id:'parking-middle-stop',points:[[217.1,606],[309.9,606]]},
  {id:'parking-right-stop',points:[[352.1,606],[455.9,606]]},
  {id:'parking-cd-stop',points:[[352.1,706],[507.9,706]]},
];

// Vehicle-centre destinations put the rear axle / right wheels on the paint.
// Coordinates use the existing estimated plan scale, not surveyed dimensions.
export const parkingTargetPlan:{garage:PlanPoint;parallel:PlanPoint}={
  garage:[parkingControlLines[0].points[0][0]+vehicleConfig.wheelbase/2/.1,275],
  parallel:[390,parkingControlLines[6].points[0][1]-vehicleConfig.track/2/.1],
};
