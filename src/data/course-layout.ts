import { afterHillGrass,planArc,type PlanPoint } from './after-hill';

// Traced against the user's plan and the full-course view in uz_video.mp4 00:35.
// Coordinates remain in the source plan's frame: start below, garages left,
// snake above right and the B/CD right-angle corridors below right.
const cubic=(a:PlanPoint,b:PlanPoint,c:PlanPoint,d:PlanPoint,steps=20):PlanPoint[]=>Array.from({length:steps},(_,i)=>{
  const t=(i+1)/steps,u=1-t;return [u*u*u*a[0]+3*u*u*t*b[0]+3*u*t*t*c[0]+t*t*t*d[0],u*u*u*a[1]+3*u*u*t*b[1]+3*u*t*t*c[1]+t*t*t*d[1]];
});
// Exercise 7 has one connected island. In the plan, the CD bay's south kerb
// (y=330) and the lower B bay's north kerb (y=339) enclose a narrow grass
// divider. Keeping this bridge in the same simple ring prevents the bays from
// merging and avoids the old crossed kerbs at the blind stem near (245,441).
export const garageIslands:PlanPoint[][]=[[
  [103,400],[103,228],...planArc(174,228,71,180,270).slice(1),[200,157],...planArc(200,202,45,-90,0).slice(1),
  [245,441],[295,441],[295,388],[351,388],[351,339],[295,339],[295,202],
  ...planArc(340,202,45,180,270).slice(1),[430,157],...planArc(430,202,45,-90,0).slice(1),
  [475,390],[525,390],[525,341],...planArc(532,341,7,180,270).slice(1),[578,334],[578,288],[532,288],
  ...planArc(532,281,7,90,180).slice(1),[525,225],
  ...cubic([525,225],[525,200.15],[541.79,180],[562.5,180]),
  ...cubic([562.5,180],[583.21,180],[600,200.15],[600,225]),
  [600,395],...planArc(530,395,70,0,90).slice(1),[525,465],...planArc(525,395,70,90,180).slice(1),
  [455,183],[392,183],[392,248],...planArc(370,248,22,0,90).slice(1),[310,270],[310,330],[372,330],
  ...planArc(372,350,20,-90,0).slice(1),[392,399],...planArc(325,399,67,0,90).slice(1),[275,466],
  ...planArc(275,421,45,90,180).slice(1),[230,195],[183,195],[183,245],
  ...planArc(178,245,5,0,90).slice(1),[125,250],[125,298],[178,298],
  ...planArc(178,303,5,-90,0).slice(1),[183,400],...planArc(143,400,40,0,180).slice(1),
]];
export const snakeIslands:PlanPoint[][]=[
  [[678,205],...planArc(705,205,27,180,360).slice(1),[732,345],
    ...cubic([732,345],[732,390],[760,427],[810,427]),
    // Follow the plan's B-channel inner edge, not the old high, blunt nose.
    // The yellow-line crest is near (900,390); its asphalt edge lies inside
    // the island. These joined tangents keep the second bend about 4.8 m wide.
    ...cubic([810,427],[832,427],[850,423],[860,415]),
    ...cubic([860,415],[875,403],[879,392.5],[900,392.5]),
    ...cubic([900,392.5],[945,392.5],[945,465],[910,465]),[745,465],
    ...planArc(745,398,67,90,180).slice(1)],
  [[810,235],[816,235],...cubic([816,235],[816,283],[875,338],[935,338]),
    ...cubic([935,338],[997,338],[1012,289],[1045,289]),
    ...cubic([1045,289],[1080,289],[1100,340],[1100,380]),
    ...cubic([1100,380],[1100,420],[1050,465],[1020,465]),
    ...cubic([1020,465],[980,465],[985,420],[975,400]),
    ...cubic([975,400],[955,339],[885,330],[845,365]),
    ...cubic([845,365],[820,390],[785,380],[785,345]),[810,235]],
  [[930,157],[1100,157],...planArc(1100,232,75,-90,0).slice(1),[1175,405],
    ...planArc(1168.5,405,6.5,0,180).slice(1),[1162,345],
    ...cubic([1162,345],[1162,290],[1115,229],[1050,229]),
    ...cubic([1050,229],[1005,229],[990,280],[940,280]),
    ...cubic([940,280],[905,280],[880,260],[880,225]),[880,217],
    ...cubic([880,217],[880,180],[900,157],[930,157])],
];
export const parkingIsland:PlanPoint[]=[
  [66,585],[70,585],[70,615],[165,615],[165,585],[215,585],[215,615],[312,615],[312,585],[350,585],[350,615],
  [458,615],[458,585],[507,585],[507,550],[540,550],...planArc(540,610,60,-90,0).slice(1),
  [600,680],...planArc(545,680,55,0,90).slice(1),[510,735],[510,695],[350,695],[350,735],[66,735],
];
export const startFinishIsland:PlanPoint[]=[
  [145,815],[600,815],[660,878],[1020,878],[1020,896],[145,896],
  ...planArc(145,855.5,40.5,90,270).slice(1),
];
export const courseEnvelope:PlanPoint[]=[[23,77],[1254,77],[1254,974],[23,974]];
export const courseGrassIslands:PlanPoint[][]=[...garageIslands,...snakeIslands,parkingIsland,startFinishIsland,...afterHillGrass.slice(0,3)];
