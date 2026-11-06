import {describe,expect,it} from 'vitest';
import {courseSigns,courseSignPoint} from '../src/data/course-signs';
import {signBoardLayout,signSpecifications} from '../src/render/road-signs';
import {roadDistance} from '../src/render/course-world';
import {intersectionApproaches} from '../src/data/intersection';

describe('sign assemblies surveyed from uz_video.mp4',()=>{
  it('keeps every surveyed post off the pavement and retains reviewable frame evidence',()=>{
    expect(new Set(courseSigns.map(s=>s.id)).size).toBe(courseSigns.length);
    for(const sign of courseSigns){
      expect(roadDistance(courseSignPoint(sign)),sign.id).toBeGreaterThanOrEqual(.3);
      expect(sign.frames.length,sign.id).toBeGreaterThan(0);
      expect(sign.frames.every(t=>t>=0&&t<701),sign.id).toBe(true);
    }
  });
  it('keeps vehicle restrictions paired with the correct turn, and parking out of the garage exercise',()=>{
    for(const prefix of ['departure','snake','garage']){
      expect(courseSigns.find(s=>s.id===`${prefix}-b-${prefix==='departure'?'left':'right'}`)?.lower).toEqual(['carPlate']);
      expect(courseSigns.find(s=>s.id===`${prefix}-cd-${prefix==='departure'?'left':'right'}`)?.lower).toEqual(['truckPlate','busPlate']);
    }
    expect(courseSigns.filter(s=>s.kind==='parking').map(s=>s.id)).toEqual(['parking-bay']);
    expect(courseSigns.find(s=>s.id==='acceleration-40-20')?.lower).toEqual(['minimum20']);
  });
  it('orders the railway approach boards towards the actual crossing',()=>{
    const ids=['east-end-left','railway-distance-two','railway-warning','railway-stop'];
    const signs=ids.map(id=>courseSigns.find(s=>s.id===id)!);
    for(let i=1;i<signs.length;i++)expect(signs[i].y).toBeLessThan(signs[i-1].y);
    expect(signs[0].lower).toEqual(['railBars3']);expect(signs[2].lower).toEqual(['railBars1']);
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
