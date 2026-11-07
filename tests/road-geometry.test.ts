import { describe,expect,it } from 'vitest';
import * as T from 'three';
import polygonClipping from 'polygon-clipping';
import { boundaryLoops,curbSections,curbSurface,roadDistance,roads,roadSurface,whiteEdgeSurface,yellowEdgeSurface } from '../src/render/course-world';
import { asphaltGeometry,boundaryGeometry,boundarySections,curbGeometry,offsetPath,paintStripGeometry,roadPaint,roundJunction,unifiedRoads } from '../src/render/road-geometry';
import { hillHeight,hillProfile,mapPoint } from '../src/data/course';
import { categoryLabels } from '../src/data/road-markings';
import { stableShadowTarget,shadowSpan } from '../src/render/shadow-stability';

describe('continuous pavement and curbs',()=>{
  it('rounds all four junction corners while keeping the grass beyond the kerb',()=>{
    const surface=unifiedRoads([{points:[{x:-10,z:0},{x:10,z:0}],width:4},{points:[{x:0,z:-10},{x:0,z:10}],width:4}]);
    const geometry=asphaltGeometry(roundJunction(surface,{x:0,z:0},4,4)),mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.updateMatrixWorld();
    const painted=(x:number,z:number)=>new T.Raycaster(new T.Vector3(x,5,z),new T.Vector3(0,-1,0)).intersectObject(mesh).length>0;
    for(const sx of [-1,1])for(const sz of [-1,1]){expect(painted(sx*2.3,sz*2.3)).toBe(true);expect(painted(sx*3.8,sz*3.8)).toBe(false);}
    geometry.dispose();
  });
  it('unifies overlapping roads without an internal curb at their junction',()=>{
    const surface=unifiedRoads([{points:[{x:-5,z:0},{x:5,z:0}],width:4},{points:[{x:0,z:-5},{x:0,z:5}],width:4}]);
    expect(surface).toHaveLength(1);expect(surface[0]).toHaveLength(1);
    const ring=surface[0][0],area=Math.abs(ring.slice(1).reduce((a,p,i)=>a+ring[i][0]*p[1]-p[0]*ring[i][1],0)/2);
    expect(area).toBeCloseTo(64);
    expect(ring.every(([x,z])=>Math.abs(x)>=2||Math.abs(z)>=2)).toBe(true);
  });
  it('preserves the full width around a right-angle corner',()=>{
    const offset=offsetPath([{x:0,z:0},{x:5,z:0},{x:5,z:5}],2);
    expect(offset[1]).toEqual({x:3,z:2});
    expect(roads[0].width).toBe(7.8);expect(roads[2].width).toBe(8);
  });
  it('joins curb sections and keeps black, yellow, and asphalt surfaces disjoint',()=>{
    const keys=new Set<string>();
    for(let loop=0;loop<boundaryLoops.length;loop++){
      const sections=curbSections.filter(s=>s.loop===loop);expect(sections.length).toBeGreaterThan(2);
      sections.forEach((s,i)=>{
        const next=sections[(i+1)%sections.length];
        expect(Math.hypot(s.b.x-next.a.x,s.b.z-next.a.z)).toBeLessThan(1e-6);
        expect(Math.hypot(s.outerB.x-next.outerA.x,s.outerB.z-next.outerA.z)).toBeLessThan(1e-6);
        expect(s.length).toBeLessThanOrEqual(roadPaint.curbStripe+1e-6);
        const key=[s.a.x,s.a.z,s.b.x,s.b.z].map(v=>v.toFixed(6)).join(',');expect(keys.has(key)).toBe(false);keys.add(key);
      });
    }
    expect(polygonClipping.intersection(curbSurface.black,curbSurface.yellow)).toEqual([]);
    expect(polygonClipping.intersection(curbSurface.black,roadSurface)).toEqual([]);
    expect(polygonClipping.intersection(curbSurface.yellow,roadSurface)).toEqual([]);
  });
  it('builds non-degenerate upward asphalt and follows both sides of the physical ramp',()=>{
    const g=asphaltGeometry(roadSurface),p=g.getAttribute('position'),indices=g.index!.array,normal=g.getAttribute('normal');
    for(let i=0;i<indices.length;i+=3){
      const a=new T.Vector3().fromBufferAttribute(p,indices[i]),b=new T.Vector3().fromBufferAttribute(p,indices[i+1]),c=new T.Vector3().fromBufferAttribute(p,indices[i+2]);
      expect(b.clone().sub(a).cross(c.clone().sub(a)).y).toBeGreaterThan(0);
    }
    for(let i=0;i<p.count;i++)expect(normal.getY(i)).toBeGreaterThan(.9);
    for(const z of [36.6,44.4])expect(Array.from({length:p.count},(_,i)=>({x:p.getX(i),y:p.getY(i),z:p.getZ(i)})).some(v=>v.x>=13&&v.x<=22&&v.y>1&&Math.abs(v.z-z)<.3)).toBe(true);
  });
  it('closes both sides, both ends, top and bottom with outward-facing surfaces',()=>{
    const surface:polygonClipping.MultiPolygon=[[[[0,0],[3,0],[3,.24],[0,.24],[0,0]]]];
    const g=curbGeometry({black:surface,yellow:[]}),mesh=new T.Mesh(g,new T.MeshBasicMaterial({side:T.FrontSide}));mesh.updateMatrixWorld();
    const top=.02+roadPaint.curbHeight;
    for(const [origin,direction,distance]of [
      [[-1,.12,.12],[1,0,0],1],[[4,.12,.12],[-1,0,0],1],
      [[1,.12,-1],[0,0,1],1],[[1,.12,1.24],[0,0,-1],1],
      [[1,1.26,.12],[0,-1,0],1],[[1,-1.025,.12],[0,1,0],1],
    ] as [number[],number[],number][]){
      const ray=new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction)),hit=ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();expect(hit.distance).toBeCloseTo(distance,5);expect(hit.face!.normal.dot(ray.ray.direction)).toBeLessThan(-.99);
    }
    g.computeBoundingBox();expect(g.boundingBox!.min.y).toBeLessThan(0);expect(g.boundingBox!.max.y).toBeCloseTo(top);g.dispose();
  });
  it('carries the top and edge bevel through a rendering-region join without an end notch',()=>{
    const pieces=[[[[0,0],[1,0],[1,.24],[0,.24],[0,0]]],[[[1,0],[3,0],[3,.24],[1,.24],[1,0]]]] as polygonClipping.Polygon[];
    const meshes=pieces.map(polygon=>new T.Mesh(curbGeometry({black:[],yellow:[polygon]},{height:.18,bevel:.02,seams:[{axis:'x',value:1}]}),new T.MeshBasicMaterial()));
    meshes.forEach(m=>m.updateMatrixWorld());
    for(const x of [.98,.995,1,1.005,1.02])for(const [z,height]of [[.12,.2],[.01,.19]]){
      const hit=new T.Raycaster(new T.Vector3(x,1,z),new T.Vector3(0,-1,0)).intersectObjects(meshes)[0];
      expect(hit,`join at ${x}, ${z}`).toBeDefined();expect(hit.point.y).toBeCloseTo(height,5);
    }
    meshes.forEach(m=>m.geometry.dispose());
  });
  it('faces the walls around inner holes towards the opening',()=>{
    const surface:polygonClipping.MultiPolygon=[[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[1,3],[3,3],[3,1],[1,1]]]];
    const g=curbGeometry({black:[],yellow:surface}),mesh=new T.Mesh(g,new T.MeshBasicMaterial({side:T.FrontSide}));mesh.updateMatrixWorld();
    for(const direction of [[1,0,0],[-1,0,0],[0,0,1],[0,0,-1]]){
      const ray=new T.Raycaster(new T.Vector3(2,.12,2),new T.Vector3(...direction)),hit=ray.intersectObject(mesh)[0];
      expect(hit).toBeDefined();expect(hit.distance).toBeCloseTo(1,5);expect(hit.face!.normal.dot(ray.ray.direction)).toBeLessThan(-.99);
    }
    g.dispose();
  });
  it('forms a lower concrete kerb with a continuous top bevel and outward wall',()=>{
    const surface:polygonClipping.MultiPolygon=[[[[0,0],[3,0],[3,.24],[0,.24],[0,0]]]];
    const geometry=curbGeometry({black:[],yellow:surface},{height:.18,bevel:.02,color:0xe4e2d6,sideColor:0xa9ada5});
    const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.updateMatrixWorld();
    const ray=(origin:T.Vector3,direction:T.Vector3)=>new T.Raycaster(origin,direction).intersectObject(mesh)[0];
    const top=ray(new T.Vector3(1,1,.12),new T.Vector3(0,-1,0)),bevel=ray(new T.Vector3(1,1,.01),new T.Vector3(0,-1,0));
    expect(top.point.y).toBeCloseTo(.2);expect(top.face!.normal.y).toBeCloseTo(1);
    expect(bevel.point.y).toBeCloseTo(.19);expect(bevel.face!.normal.y).toBeCloseTo(Math.SQRT1_2);
    const side=ray(new T.Vector3(1,.1,-1),new T.Vector3(0,0,1));
    expect(side.point.z).toBeCloseTo(0);expect(side.face!.normal.z).toBeLessThan(-.99);
    geometry.dispose();
  });
});
describe('reference markings and stable lighting',()=>{
  it('uses yellow exercise edges without overlapping white paint or painting off the asphalt',()=>{
    // Adjacent colour regions can share a zero-area ring at a boundary.
    const overlap=polygonClipping.intersection(whiteEdgeSurface,yellowEdgeSurface);
    const area=overlap.reduce((total,p)=>total+p.reduce((sum,r)=>sum+Math.abs(r.slice(1).reduce((a,b,i)=>a+r[i][0]*b[1]-b[0]*r[i][1],0)/2),0),0);
    expect(area).toBeLessThan(1e-9);
    expect(polygonClipping.difference(yellowEdgeSurface,roadSurface)).toEqual([]);
    const geometry=asphaltGeometry(yellowEdgeSurface,.048),mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.updateMatrixWorld();
    for(const [x,y]of [[897.1,690],[937.9,690],[900,824.6],[1017.9,800]]){
      const p=mapPoint(x,y),hit=new T.Raycaster(new T.Vector3(p.x,5,p.z),new T.Vector3(0,-1,0)).intersectObject(mesh)[0];
      expect(hit,`yellow boundary at ${x},${y}`).toBeDefined();
    }
    geometry.dispose();
  });
  it('keeps long edge lines on the ramp at both feet and both crest transitions',()=>{
    const sections=boundarySections([[{x:-5,z:36.6},{x:40,z:36.6},{x:40,z:44.4},{x:-5,z:44.4}]],.16,.26);
    const geometry=boundaryGeometry(sections),mesh=new T.Mesh(geometry,new T.MeshBasicMaterial());mesh.updateMatrixWorld();
    for(const x of [0,2,8,13,17,22,28,33,36])for(const z of [36.81,44.19]){
      const hit=new T.Raycaster(new T.Vector3(x,5,z),new T.Vector3(0,-1,0)).intersectObject(mesh)[0];
      expect(hit,`edge paint at ${x},${z}`).toBeDefined();
      expect(hit.point.y).toBeCloseTo(hillHeight(x,z)+.048,5);
    }
    const positions=geometry.getAttribute('position');
    for(const x of [hillProfile.crestStart,hillProfile.crestEnd])expect(Array.from({length:positions.count},(_,i)=>positions.getX(i)).some(v=>Math.abs(v-x)<1e-5)).toBe(true);
    geometry.dispose();
  });
  it('clips painted lines to the asphalt instead of painting over grass and curbs',()=>{
    const surface=unifiedRoads([{points:[{x:-5,z:0},{x:5,z:0}],width:4}]);
    const g=paintStripGeometry([{x:0,z:-5},{x:0,z:5}],.1,surface,.05),p=g.getAttribute('position');
    expect(p.count).toBeGreaterThan(0);
    for(let i=0;i<p.count;i++){expect(Math.abs(p.getZ(i))).toBeLessThanOrEqual(2);expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(.050001);}
  });
  it('keeps both ramp edge lines straight through the departure and island join',()=>{
    const geometries=[whiteEdgeSurface,yellowEdgeSurface].map(surface=>asphaltGeometry(surface,.048));
    const meshes=geometries.map(geometry=>new T.Mesh(geometry,new T.MeshBasicMaterial()));meshes.forEach(mesh=>mesh.updateMatrixWorld());
    for(const x of [5,10,13,17,22,28,32,33,34,37.9,38,38.1,40,44,48])for(const z of [36.81,44.19]){
      const hit=new T.Raycaster(new T.Vector3(x,5,z),new T.Vector3(0,-1,0)).intersectObjects(meshes)[0];
      expect(hit,`actual ramp paint at ${x},${z}`).toBeDefined();
      expect(hit.point.y).toBeCloseTo(hillHeight(x,z)+.048,5);
    }
    geometries.forEach(geometry=>geometry.dispose());
  });
  it('places B/CD labels on asphalt and uses fifteen-centimetre white edge lines',()=>{
    expect(categoryLabels.some(l=>l.text==='B')).toBe(true);expect(categoryLabels.some(l=>l.text==='CD')).toBe(true);
    for(const label of categoryLabels)expect(roadDistance(label.point),`${label.text} at ${JSON.stringify(label.point)}`).toBeLessThan(-.25);
    expect(roadPaint.edgeWidth).toBe(.15);
    const sections=boundarySections([[{x:0,z:0},{x:10,z:0},{x:10,z:10},{x:0,z:10}]],.16,.31);
    expect(Math.hypot(sections[0].a.z-sections[0].outerA.z)).toBeCloseTo(.15);
  });
  it('locks the shadow projection to texels during sub-pixel car movement',()=>{
    const offset=new T.Vector3(-25,38,-23),basis=new T.Matrix4().lookAt(offset,new T.Vector3(),new T.Vector3(0,1,0));
    const right=new T.Vector3().setFromMatrixColumn(basis,0),up=new T.Vector3().setFromMatrixColumn(basis,1),texel=shadowSpan/1024;
    const a=stableShadowTarget(new T.Vector3(),1024),b=stableShadowTarget(right.clone().multiplyScalar(texel*.2).addScaledVector(up,texel*.2),1024);
    expect(a.distanceTo(b)).toBeLessThan(1e-8);
    const c=stableShadowTarget(right.clone().multiplyScalar(texel*1.2),1024);expect(c.dot(right)).toBeCloseTo(texel);
  });
});
