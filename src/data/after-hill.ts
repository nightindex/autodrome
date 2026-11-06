// Plan coordinates from 2026-03-19_17-47-25_3UKDK1HJ4R.jpg, checked against
// uz_video.mp4 at 03:30–04:04. The B and CD exercises are separate corridors.
export type PlanPoint=[number,number];
export function planArc(cx:number,cy:number,radius:number,from:number,to:number,steps=Math.max(8,Math.ceil(Math.abs(to-from)/5))):PlanPoint[]{
  return Array.from({length:steps+1},(_,i)=>{const a=(from+(to-from)*i/steps)*Math.PI/180;return [cx+Math.cos(a)*radius,cy+Math.sin(a)*radius];});
}
export const perimeterExit:PlanPoint[]=[
  [1215,600],[1215,720],[1215,845],...planArc(1125,845,90,0,90).slice(1),[1100,935],[975,935],[640,935],[45,935],
];
export const bTurnCourse:PlanPoint[]=[
  [1235,805],[1235,740],...planArc(1110,740,125,0,-90).slice(1),
  [917.5,615],[917.5,745],[715,745],...planArc(715,685,60,90,180).slice(1),[655,590],
];
export const cdTurnCourse:PlanPoint[]=[
  [1195,835],[1195,775],...planArc(1110,775,85,0,-90).slice(1),
  [995,690],[995,850],[715,850],...planArc(715,790,60,90,180).slice(1),[655,730],
];
export const afterHillEnvelope:PlanPoint[]=[[630,540],[1254,540],[1254,974],[630,974]];
export const afterHillGrass:PlanPoint[][]=[
  // Large upper island, with a rounded tip facing the B entrance.
  [[715,545],[1135,545],...planArc(1135,567.5,22.5,-90,90).slice(1),[895,590],[895,710],...planArc(885,710,10,0,90).slice(1),[715,720],...planArc(715,680,40,90,180).slice(1),[675,585],...planArc(715,585,40,180,270).slice(1)],
  // Thin L-shaped separator: east-facing nose and west-facing lower nose.
  [[952.5,640],[1140,640],...planArc(1140,652.5,12.5,-90,90).slice(1),[966,665],[966,795],...planArc(938.5,795,27.5,0,90).slice(1),[780,822.5],...planArc(780,795,27.5,90,270).slice(1),[940,767.5],[940,652.5],...planArc(952.5,652.5,12.5,180,270).slice(1)],
  // The inside of the exit bend is concentric with the perimeter centreline:
  // 90 px radius minus the 39 px half-width. Its bottom tangent stays at y=896,
  // in line with the ramp edge, with no lateral step at the island join.
  [[1045,720],[1100,720],...planArc(1100,796,76,-90,0).slice(1),[1176,845],...planArc(1125,845,51,0,90).slice(1),[1020,896],[1020,745],...planArc(1045,745,25,180,270).slice(1)],
  // The straight joins the existing 7.8 m ramp deck at plan y=896.
  [[630,825],[660,878],[1020,878],[1020,896],[630,896]],
];
export const afterHillBRoute:PlanPoint[]=[
  [975,950],[1100,950],...planArc(1125,840,110,90,0),[1235,805],[1235,740],
  // 5.5 m guide radii leave room for the Cobalt's steering and body overhang.
  ...planArc(1110,740,125,0,-90).slice(1).map(([x,y]):PlanPoint=>{
    const angle=Math.atan2(y-740,x-1110),extra=8*Math.sin(2*angle)**2;
    return [x+(x-1110)/125*extra,y+(y-740)/125*extra];
  }),[972.5,615],
  ...planArc(972.5,670,55,-90,-180).slice(1),[917.5,690],
  ...planArc(862.5,690,55,0,90).slice(1),[715,745],
  ...planArc(715,685,60,90,180).slice(1),[655,590],
];
