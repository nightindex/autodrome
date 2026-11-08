import {describe,expect,it} from 'vitest';
import {courseSigns,courseSignPoint} from '../src/data/course-signs';
import {signBoardLayout,signSpecifications} from '../src/render/road-signs';
import {roadDistance} from '../src/render/course-world';
import {hillHeight,startLinePoint,finishLinePoint,course} from '../src/data/course';
import {yellowControlLines} from '../src/data/road-markings';
import {roadPaint} from '../src/render/road-geometry';
import {intersectionApproaches} from '../src/data/intersection';

describe('sign assemblies surveyed from uz_video.mp4',()=>{
  it('keeps every surveyed post off the pavement and retains reviewable frame evidence',()=>{
    expect(new Set(courseSigns.map(s=>s.id)).size).toBe(courseSigns.length);
    for(const sign of courseSigns){
      if(sign.id!=='hill-stop'&&sign.id!=='hill-descent')expect(roadDistance(courseSignPoint(sign)),sign.id).toBeGreaterThanOrEqual(.3);
      expect(sign.frames.length,sign.id).toBeGreaterThan(0);
      expect(sign.frames.every(t=>t>=0&&t<701),sign.id).toBe(true);
    }
  });
  it('places the hill posts on the deck between the yellow line and the concrete edge',()=>{
    const signs=courseSigns.filter(s=>s.id==='hill-stop'||s.id==='hill-descent');
    expect(signs).toHaveLength(2);
    for(const sign of signs){
      const p=courseSignPoint(sign),distance=-roadDistance(p);
      expect(hillHeight(p.x,p.z),sign.id).toBeGreaterThan(0);
      expect(distance,sign.id).toBeGreaterThan(.034);
      expect(distance+.034,sign.id).toBeLessThan(roadPaint.edgeInset);
    }
    const stop=courseSignPoint(signs.find(s=>s.id==='hill-stop')!),descent=courseSignPoint(signs.find(s=>s.id==='hill-descent')!),ascent=courseSignPoint(courseSigns.find(s=>s.id==='hill-ascent')!);
    expect(stop.x).toBe(13);
    expect(descent.x).toBe(22);
    expect(ascent.x).toBe(2);
    expect(roadDistance(ascent)).toBeGreaterThanOrEqual(.3);
  });
  it('keeps vehicle restrictions paired with the correct turn, and parking out of the garage exercise',()=>{
    for(const prefix of ['departure','snake','garage']){
      expect(courseSigns.find(s=>s.id===`${prefix}-b-${prefix==='departure'?'left':'right'}`)?.lower).toEqual(['carPlate']);
      expect(courseSigns.find(s=>s.id===`${prefix}-cd-${prefix==='departure'?'left':'right'}`)?.lower).toEqual(['truckPlate','busPlate']);
    }
    expect(courseSigns.filter(s=>s.kind==='parking').map(s=>s.id)).toEqual(['parking-bay']);
    expect(courseSigns.find(s=>s.id==='acceleration-40-20')?.lower).toEqual(['minimum20']);
    // The C/D bend has a standalone right-turn sign; the B approach retains
    // the yield/right-turn pair seen in the same frame.
    expect(courseSigns.find(s=>s.id==='bend-cd-right')?.lower??[]).toEqual([]);
    expect(courseSigns.find(s=>s.id==='bend-b-yield-right')?.lower).toEqual(['right']);
  });
  it('faces the C/D winding-road warning towards the approaching turn',()=>{
    const sign=courseSigns.find(s=>s.id==='bend-cd-warning')!;
    const p=courseSignPoint(sign),approach={x:57,z:24};
    const dx=approach.x-p.x,dz=approach.z-p.z,length=Math.hypot(dx,dz);
    const facing=(Math.sin(sign.yaw)*dx+Math.cos(sign.yaw)*dz)/length;
    expect(facing).toBeGreaterThan(.9);
    expect(Math.cos(sign.yaw)).toBeGreaterThan(.4);
  });
  it('orders the railway approach boards towards the actual crossing',()=>{
    const ids=['east-end-left','railway-distance-two','railway-warning','railway-stop'];
    const signs=ids.map(id=>courseSigns.find(s=>s.id===id)!);
    for(let i=1;i<signs.length;i++)expect(signs[i].y).toBeLessThan(signs[i-1].y);
    expect(signs[0].lower).toEqual(['railBars3']);expect(signs[2].lower).toEqual(['railBars1']);
    expect(courseSignPoint(signs[3]).z).toBeCloseTo(course.exercises.find(e=>e.id==='railway')!.stop!.point.z);
  });
  it('faces the garage turn boards towards the westbound approach from the junction',()=>{
    const approach={x:-2,z:-4.2};
    for(const id of ['garage-b-right','garage-cd-right','garage-end-right','garage-right-chevron']){
      const sign=courseSigns.find(s=>s.id===id)!,p=courseSignPoint(sign),dx=approach.x-p.x,dz=approach.z-p.z;
      expect((Math.sin(sign.yaw)*dx+Math.cos(sign.yaw)*dz)/Math.hypot(dx,dz),id).toBeGreaterThan(0);
    }
  });
  it('anchors the northern speed restrictions to the exercise control marks',()=>{
    const acceleration=courseSignPoint(courseSigns.find(s=>s.id==='acceleration-40-20')!),limit=courseSignPoint(courseSigns.find(s=>s.id==='northwest-speed20')!);
    expect(yellowControlLines.some(([a,b])=>Math.abs(a.x-acceleration.x)<1e-6&&Math.abs(b.x-acceleration.x)<1e-6&&a.z< -40)).toBe(true);
    expect(yellowControlLines.some(([a,b])=>Math.abs(a.x-limit.x)<1e-6&&Math.abs(b.x-limit.x)<1e-6&&a.z< -40)).toBe(true);
  });
  it('puts FINISH on the driver\'s right verge rather than across the two lanes',()=>{
    const sign=courseSignPoint(courseSigns.find(s=>s.id==='finish-board')!);
    expect(sign.x).toBeCloseTo(finishLinePoint.x);
    expect(sign.z).toBeLessThan(finishLinePoint.z);
    expect(roadDistance(sign)).toBeGreaterThanOrEqual(.3);
  });
  it('shows both opposing start-crossing signs to drivers leaving the start',()=>{
    const near=courseSigns.find(s=>s.id==='start-crossing-near')!,far=courseSigns.find(s=>s.id==='start-crossing-far')!;
    expect(near.x).toBe(far.x);
    expect(far.mirror).toBe(true);expect(near.mirror??false).toBe(false);
    for(const sign of [near,far]){
      const p=courseSignPoint(sign),dx=startLinePoint.x-p.x,dz=startLinePoint.z-p.z;
      expect((Math.sin(sign.yaw)*dx+Math.cos(sign.yaw)*dz)/Math.hypot(dx,dz),sign.id).toBeGreaterThan(.9);
    }
  });
  it('uses the observed signal approach directions',()=>{
    expect(intersectionApproaches.find(a=>a.id==='south')?.turn).toBeUndefined();
    expect(intersectionApproaches.find(a=>a.id==='north')?.turn).toBe('left');
    expect(intersectionApproaches.find(a=>a.id==='west')?.turn).toBe('right');
  });
});

describe('installation heights of compound signs',()=>{
  it('raises full lower signs while keeping the lowest main board at its specified lower edge',()=>{
    for(const [kind,lower]of [['pedestrian',['stop']],['yield',['right']],['speed40',['minimum20']]] as const){
      const boards=signBoardLayout(kind,[...lower],{bottom:1.5});
      expect(boards.at(-1)!.center-signSpecifications[boards.at(-1)!.kind].height/2).toBeCloseTo(1.5);
      for(let i=1;i<boards.length;i++)expect(boards[i-1].center-signSpecifications[boards[i-1].kind].height/2-(boards[i].center+signSpecifications[boards[i].kind].height/2)).toBeGreaterThanOrEqual(.05);
    }
  });
  it('allows supplementary vehicle plates below the main sign without lowering its face',()=>{
    const single=signBoardLayout('right',[],{bottom:2}),stack=signBoardLayout('right',['truckPlate','busPlate'],{bottom:2});
    expect(stack[0].center).toBe(single[0].center);
    expect(stack.at(-1)!.center-signSpecifications.busPlate.height/2).toBeGreaterThan(1);
  });
});
