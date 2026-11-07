import { describe,expect,it } from 'vitest';
import * as T from 'three';
import polygonClipping from 'polygon-clipping';
import { laneLines,laneGores,lanePaintPaths,northSplitPaths } from '../src/data/lane-markings';
import { course,mapPoint,startLinePoint,finishLinePoint } from '../src/data/course';
import { coursePaintedArrows,roadSurface,whiteEdgeSurface,yellowEdgeSurface } from '../src/render/course-world';
import { asphaltGeometry,paintStripGeometry } from '../src/render/road-geometry';
import { CourseTracker } from '../src/simulation/tracker';
import { localPoint } from '../src/simulation/math';
import type { VehicleTelemetry } from '../src/types';

const material=new T.MeshBasicMaterial();
// Float32 end caps can land a few micrometres either side of the data point.
const hit=(mesh:T.Mesh,point:{x:number;z:number})=>[[0,0],[1e-5,0],[-1e-5,0],[0,1e-5],[0,-1e-5]].some(([dx,dz])=>new T.Raycaster(new T.Vector3(point.x+dx,6,point.z+dz),new T.Vector3(0,-1,0)).intersectObject(mesh).length>0);
describe('continuous marking paths from the video and plan',()=>{
  it('paints every station through the straight sections and curved joins',()=>{
    for(const line of laneLines){
      const geometry=paintStripGeometry(line.points,line.width,roadSurface,.052),mesh=new T.Mesh(geometry,material);mesh.updateMatrixWorld();
      for(const path of lanePaintPaths(line))for(let i=1;i<path.length;i++){
        const a=path[i-1],b=path[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.25);
        for(let j=0;j<=steps;j++)expect(hit(mesh,{x:a.x+(b.x-a.x)*j/steps,z:a.z+(b.z-a.z)*j/steps}),`${line.id} segment ${i} station ${j}`).toBe(true);
      }geometry.dispose();
    }
  });
  it('ends the B/CD separator before the turning area and uses narrow splitter hatching',()=>{
    const divider=laneLines.find(line=>line.id==='finish-divider')!;
    expect(divider.points.at(-1)).toEqual(mapPoint(535,775));
    expect(divider.points.every(point=>point.z===mapPoint(0,775).z)).toBe(true);
    const splitter=laneGores.find(gore=>gore.id==='finish-split')!;
    expect(splitter.fringe).toBe(true);expect(splitter.spacing).toBe(.65);
    expect(coursePaintedArrows.some(a=>Math.abs(a.point.x-mapPoint(590,755).x)<.01&&Math.abs(a.point.z-mapPoint(590,755).z)<.01)).toBe(false);
    expect(coursePaintedArrows.some(a=>Math.abs(a.point.x-mapPoint(590,795).x)<.01&&Math.abs(a.point.z-mapPoint(590,795).z)<.01)).toBe(false);
  });
  it('preserves the dashed parking separator and its source-map gap',()=>{
    const line=laneLines.find(l=>l.id==='parking-channel')!,paths=lanePaintPaths(line);
    expect(paths[0]).toEqual([mapPoint(87,543),mapPoint(103,543)]);
    const geometry=paintStripGeometry(paths[0],line.width,roadSurface,.052),mesh=new T.Mesh(geometry,material);mesh.updateMatrixWorld();
    expect(hit(mesh,mapPoint(94,543))).toBe(true);
    expect(hit(mesh,mapPoint(110,543))).toBe(false);geometry.dispose();
  });
  it('keeps the north separator straight into the two tangent splitter arcs',()=>{
    const divider=laneLines.find(line=>line.id==='north-junction')!;
    for(const p of divider.points)expect(p.x).toBeCloseTo(mapPoint(640,0).x);
    for(const arc of northSplitPaths.slice(0,2)){
      const end=arc.at(-1)!,previous=arc.at(-2)!;
      expect(end.x).toBeCloseTo(divider.points[0].x);expect(end.z).toBeCloseTo(divider.points[0].z);
      expect(Math.abs(end.x-previous.x)).toBeLessThan(Math.abs(end.z-previous.z)*.03);
    }
  });
  it('keeps the centre of the signal junction clear of longitudinal paint',()=>{
    for(const line of laneLines){const g=paintStripGeometry(line.points,line.width,roadSurface,.052),mesh=new T.Mesh(g,material);mesh.updateMatrixWorld();
      for(const [x,y]of [[635,505],[615,485],[655,525]])expect(hit(mesh,mapPoint(x,y)),line.id).toBe(false);g.dispose();
    }
  });
  it('keeps the opposing turn arrow at the T-junction instead of erasing it with the approach arrows',()=>{
    const point=mapPoint(621,643),arrow=coursePaintedArrows.find(a=>Math.hypot(a.point.x-point.x,a.point.z-point.z)<.01);
    expect(arrow?.normal).toEqual({x:0,z:1});expect(arrow?.turn).toBe('right');
    const incoming=coursePaintedArrows.filter(a=>a.normal.z===-1&&a.point.x>0&&a.point.x<3&&a.point.z>3&&a.point.z<15);
    expect(incoming).toHaveLength(1);
  });
  it('paints yellow boundaries on garage bays, parking pockets and both snake lanes',()=>{
    const g=asphaltGeometry(yellowEdgeSurface,.048),mesh=new T.Mesh(g,material);mesh.updateMatrixWorld();
    for(const [x,y]of [[185.1,350],[127.1,275],[394.1,225],[477.1,260],[390,612.9],[420,697.1],[940,282.1],[920,342.9]]){
      expect(hit(mesh,mapPoint(x,y)),`yellow at plan ${x},${y}`).toBe(true);
    }g.dispose();
  });
  it('keeps both B bends and the snake bend yellow across their complete curved edges',()=>{
    for(const [name,x0,z0,x1,z1]of [
      ['B upper bend',30,10.9,30.7,11.4],
      ['B lower bend',25.15,18.9,25.21,18.97],
      ['snake bend',20,-16.5,20.75,-15.8],
    ]as const){
      const region:polygonClipping.MultiPolygon=[[[[x0,z0],[x1,z0],[x1,z1],[x0,z1],[x0,z0]]]];
      expect(polygonClipping.intersection(whiteEdgeSurface,region),name).toEqual([]);
      expect(polygonClipping.intersection(yellowEdgeSurface,region).length,name).toBeGreaterThan(0);
    }
  });
  it('still changes from white to yellow at the B entrance control mark',()=>{
    const yellowGeometry=asphaltGeometry(yellowEdgeSurface,.048),whiteGeometry=asphaltGeometry(whiteEdgeSurface,.048);
    const yellow=new T.Mesh(yellowGeometry,material),white=new T.Mesh(whiteGeometry,material);
    yellow.updateMatrixWorld();white.updateMatrixWorld();
    try{
      for(const y of [592.1,637.9]){
        expect(hit(yellow,mapPoint(984.5,y))).toBe(true);expect(hit(white,mapPoint(984.5,y))).toBe(false);
        expect(hit(yellow,mapPoint(985.5,y))).toBe(false);expect(hit(white,mapPoint(985.5,y))).toBe(true);
        const inward=y<615?1:-1;
        for(const offset of [-.35,.7]){
          expect(hit(yellow,mapPoint(984.5,y+inward*offset))).toBe(true);
          expect(hit(white,mapPoint(985.5,y+inward*offset))).toBe(true);
        }
      }
    }finally{yellowGeometry.dispose();whiteGeometry.dispose();}
  });
  it('uses yellow on both ramp edges up to the hill stop stripe',()=>{
    const yellowGeometry=asphaltGeometry(yellowEdgeSurface,.048),whiteGeometry=asphaltGeometry(whiteEdgeSurface,.048);
    const yellow=new T.Mesh(yellowGeometry,material),white=new T.Mesh(whiteGeometry,material);
    yellow.updateMatrixWorld();white.updateMatrixWorld();
    try{
      for(const z of [36.81,44.19]){
        for(const x of [3,8,12.5]){
          expect(hit(yellow,{x,z}),`yellow ramp edge ${x},${z}`).toBe(true);
          expect(hit(white,{x,z}),`white ramp edge ${x},${z}`).toBe(false);
        }
        expect(hit(white,{x:13.5,z}),`white after stop ${z}`).toBe(true);
        expect(hit(yellow,{x:13.5,z}),`yellow after stop ${z}`).toBe(false);
      }
    }finally{yellowGeometry.dispose();whiteGeometry.dispose();}
  });
  it('keeps the B and CD snake labels clear and places the approach arrows on the feeder',()=>{
    for(const p of [mapPoint(770,195),mapPoint(825,195)]){
      expect(coursePaintedArrows.some(a=>Math.hypot(a.point.x-p.x,a.point.z-p.z)<1)).toBe(false);
    }
    const combined=coursePaintedArrows.find(a=>a.turn==='straight-right'&&Math.abs(a.point.x-mapPoint(718.5,151).x)<.01),turn=coursePaintedArrows.find(a=>a.turn==='right'&&Math.abs(a.point.x-mapPoint(809,153.5).x)<.01);
    expect(combined?.turn).toBe('straight-right');expect(turn?.turn).toBe('right');
    expect(combined!.point.x).toBeLessThan(turn!.point.x);
  });
  it('scores the finish at the physical stripe on plan x=145',()=>{
    const exercise=course.exercises.find(e=>e.id==='finish')!,stripe=laneLines.find(l=>l.id==='finish-line')!;
    expect(stripe.points.every(p=>p.x===finishLinePoint.x)).toBe(true);
    const tracker=new CourseTracker(true,[exercise]);
    const sample=(planBumperX:number,speed:number):VehicleTelemetry=>{
      const bumper=mapPoint(planBumperX,795),position={x:bumper.x+4.479/2,z:bumper.z};
      return {time:1,position,bumper,yaw:-Math.PI/2,speed,signedSpeed:speed,rpm:1000,gear:1,throttle:0,brake:0,clutch:0,steering:0,engine:true,stalled:false,belt:true,handbrake:false,indicator:'right',hazards:false,ignition:false,positionLights:false,headlights:false,fogLights:false,wheels:[],collision:false};
    };
    expect(tracker.update(sample(146,1),.1).observations.finishCrossed).toBe(false);
    expect(tracker.update(sample(144,1),.1).observations.finishCrossed).toBe(true);
    expect(tracker.update(sample(144,0),.1).atGoal).toBe(true);
  });
  it('places the start stripe before the category arrows and uses it for the start sensor',()=>{
    expect(startLinePoint).toEqual(mapPoint(232,935));expect(course.exercises[0].spawn.x).toBeLessThan(startLinePoint.x);
    const tracker=new CourseTracker(true,[course.exercises[0]]);
    const telemetry=(x:number):VehicleTelemetry=>{
      const position=mapPoint(x,950),yaw=Math.PI/2;
      return {time:1,position,yaw,speed:1,signedSpeed:1,rpm:1000,gear:1,throttle:0,brake:0,clutch:0,steering:0,engine:true,stalled:false,belt:true,handbrake:false,indicator:'left',hazards:false,ignition:false,positionLights:false,headlights:false,fogLights:false,bumper:localPoint(position,yaw,0,4.479/2),wheels:[],collision:false};
    };
    expect(tracker.update(telemetry(208),.1).observations.startCrossed).toBe(false);
    const crossing=tracker.update(telemetry(212),.1);expect(crossing.observations.startCrossed).toBe(true);expect(crossing.atGoal).toBe(false);
  });
});
