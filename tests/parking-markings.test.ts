import {describe,it,expect} from 'vitest';
import * as T from 'three';
import {mapPoint} from '../src/data/course';
import {parkingMouths} from '../src/data/parking-control-lines';
import {laneLines,lanePaintPaths} from '../src/data/lane-markings';
import {parkingMouthLines,yellowControlPaintPaths} from '../src/data/road-markings';
import {asphaltGeometry} from '../src/render/road-geometry';
import {yellowEdgeSurface,whiteEdgeSurface,roadDistance} from '../src/render/course-world';

describe('video parking boundaries for B and C/D',()=>{
 it('uses a broken white separator on the B parking approach',()=>{
  const line=laneLines.find(l=>l.id==='parking-channel')!;
  expect(line.dash).toEqual({length:1.6,gap:1.5});
  const paths=lanePaintPaths(line);
  expect(paths.length).toBeGreaterThan(8);
  expect(paths[1][0].x-paths[0][1].x).toBeCloseTo(1.5);
 });
 it('keeps the B/CD finish separator solid as seen at 11:21',()=>{
  const line=laneLines.find(l=>l.id==='finish-divider')!;
  expect(line.dash).toBeUndefined();expect(lanePaintPaths(line)).toEqual([line.points]);
 });
 it('marks four separate mouths with centred dashes and clear corners',()=>{
  expect(parkingMouths.map(m=>m.category)).toEqual(['B','B','B','CD']);
  for(const mouth of parkingMouthLines){
   const paths=yellowControlPaintPaths(mouth.points),[a,b]=mouth.points;
   expect(paths.length).toBeGreaterThan(10);
   expect(paths[0][0].x-a.x).toBeGreaterThan(.15);
   expect(b.x-paths.at(-1)![1].x).toBeCloseTo(paths[0][0].x-a.x);
   for(const [i,[p,q]]of paths.entries()){
    expect(q.x-p.x).toBeCloseTo(.32);expect(q.z).toBeCloseTo(a.z);expect(p.z).toBeCloseTo(a.z);
    expect(roadDistance({x:(p.x+q.x)/2,z:p.z})).toBeLessThan(0);
    if(i)expect(p.x-paths[i-1][1].x).toBeCloseTo(.33);
   }
  }
  expect(parkingMouthLines[3].points[1].x-parkingMouthLines[3].points[0].x).toBe(16);
 });
 it('keeps continuous yellow lips around all B bays and the CD recess without white duplicates',()=>{
  const material=new T.MeshBasicMaterial({side:T.DoubleSide});
  const meshes=[yellowEdgeSurface,whiteEdgeSurface].map(surface=>new T.Mesh(asphaltGeometry(surface,.05),material));
  meshes.forEach(m=>m.updateMatrixWorld());
  try{
   for(const [x,y]of [[190,582.9],[330,582.9],[480,582.9],[117,612.9],[263,612.9],[400,612.9],[352.1,720],[507.9,720],[420,697.1]]){
    const p=mapPoint(x,y),ray=new T.Raycaster(new T.Vector3(p.x,1,p.z),new T.Vector3(0,-1,0));
    expect(ray.intersectObject(meshes[0]).length,`yellow ${x},${y}`).toBeGreaterThan(0);
    expect(ray.intersectObject(meshes[1]).length,`no white duplicate ${x},${y}`).toBe(0);
   }
  }finally{meshes.forEach(m=>m.geometry.dispose());material.dispose();}
 });
});
