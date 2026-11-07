import type { Vec2 } from '../types';

export const intersectionCenter:Vec2={x:-.5,z:-2.5};
// Mouths and stop stations traced independently from the supplied plan. Their
// world values use the same 0.1 m/pixel frame as the pavement and scoring.
interface IntersectionApproach {id:string;stop:Vec2;crossing:Vec2;normal:Vec2;turn?:'left'|'right'}
const p=(x:number,y:number):Vec2=>({x:(x-640)*.1,z:(y-530)*.1});
export const intersectionApproaches:IntersectionApproach[]=[
  {id:'south',crossing:p(640,556.5),stop:p(640,590),normal:{x:0,z:-1}},
  {id:'north',crossing:p(640,455),stop:p(640,420),normal:{x:0,z:1},turn:'left'},
  {id:'west',crossing:p(589.5,505),stop:p(554,505),normal:{x:1,z:0},turn:'right'},
  {id:'east',crossing:p(691.5,505),stop:p(726,505),normal:{x:-1,z:0}},
];
