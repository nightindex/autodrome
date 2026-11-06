import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as T from 'three';
import { smoothBodyGeometry } from './cobalt-body.mjs';

// Usage: node scripts/surface-normals-check.mjs [asset.glb] [report.json]
// Add --report-only when measuring an intentionally unfixed comparison asset.
const args=process.argv.slice(2),paths=args.filter(arg=>!arg.startsWith('--'));
const asset=paths[0]??'public/assets/cobalt.glb';
const reportPath=paths[1]??'test-results/surface-review/normals.json';
const sourceAsset=args.find(arg=>arg.startsWith('--source='))?.slice('--source='.length)??'chevrolet_cobalt_ltz_2014.glb';
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc=await io.read(asset);
const refinement=doc.getRoot().getExtras().cobaltRefinement;
const normalize=refinement?new T.Matrix4().compose(
  new T.Vector3(0,refinement.sourceOffset,0),
  new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),
  new T.Vector3().setScalar(refinement.sourceScale),
):new T.Matrix4();
const normalTolerance=1e-5,creaseCos=Math.cos(Math.PI/3),panels=[];
const positionKey=p=>p.toArray().map(n=>Math.round(n*1e6)).join(',');
let sourceDocument;
const denseSourceFans=new Map();
async function sourceFans(nodeName){
  if(args.includes('--no-source'))return new Map();
  if(denseSourceFans.has(nodeName))return denseSourceFans.get(nodeName);
  sourceDocument??=await io.read(sourceAsset);
  const node=sourceDocument.getRoot().listNodes().find(n=>n.getName()===nodeName),lookup=new Map();
  for(const primitive of node?.getMesh()?.listPrimitives()??[]){
    if(primitive.getMaterial()?.getName()!=='Realistic_Car_Paint')continue;
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));
    if(primitive.getIndices())geometry.setIndex(Array.from(primitive.getIndices().getArray()));
    const smooth=smoothBodyGeometry(geometry),position=smooth.getAttribute('position'),normal=smooth.getAttribute('normal');
    for(let i=0;i<position.count;i++){
      const key=positionKey(new T.Vector3().fromBufferAttribute(position,i)),norm=new T.Vector3().fromBufferAttribute(normal,i),normals=lookup.get(key)??[];
      if(!normals.some(n=>n.distanceToSquared(norm)<1e-14))normals.push(norm);
      lookup.set(key,normals);
    }
    geometry.dispose();smooth.dispose();
  }
  denseSourceFans.set(nodeName,lookup);return lookup;
}
for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
  if(primitive.getMaterial()?.getName()!=='Realistic_Car_Paint')continue;
  const position=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL');
  assert.ok(normal,`Paint panel ${node.getName()} has no normals`);
  const points=Array.from({length:position.getCount()},(_,i)=>new T.Vector3().fromArray(position.getArray(),i*3));
  const keys=points.map(positionKey);
  const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i);
  const edges=new Map(),faces=[],stored=normal.getArray();
  const panel={node:node.getName(),triangles:indices.length/3,smoothEdges:0,hardEdges:0,boundaryEdges:0,nonManifoldEdges:0,windingConflicts:0,degenerateTriangles:0,discontinuousEndpoints:0,preservedSourceSplits:0,unexpectedDiscontinuousEndpoints:0,maxNormalDelta:0,invalidNormals:0,samples:[]};
  const discontinuities=[];
  for(let i=0;i<normal.getCount();i++){
    const length=new T.Vector3().fromArray(stored,i*3).length();
    if(!Number.isFinite(length)||Math.abs(length-1)>1e-4)panel.invalidNormals++;
  }
  for(let i=0;i<indices.length;i+=3){
    const ids=[indices[i],indices[i+1],indices[i+2]];
    const direction=new T.Vector3().subVectors(points[ids[1]],points[ids[0]]).cross(new T.Vector3().subVectors(points[ids[2]],points[ids[0]])).normalize();
    const face=faces.length;faces.push({ids,direction});
    if(direction.lengthSq()===0){panel.degenerateTriangles++;continue;}
    for(let j=0;j<3;j++){
      const from=ids[j],to=ids[(j+1)%3];
      if(keys[from]===keys[to])continue;
      const pair=[keys[from],keys[to]].sort(),key=pair.join('|'),adjacent=edges.get(key)??[];
      adjacent.push({face,from,to});edges.set(key,adjacent);
    }
  }
  const matrix=normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix()));
  for(const adjacent of edges.values()){
    if(adjacent.length===1){panel.boundaryEdges++;continue;}
    if(adjacent.length!==2){panel.nonManifoldEdges++;continue;}
    const [a,b]=adjacent;
    // Only consistently oriented, two-face edges define one surface. Overlaps
    // and separate sheets touching a point do not impose normal continuity.
    if(keys[a.from]!==keys[b.to]||keys[a.to]!==keys[b.from]){panel.windingConflicts++;continue;}
    const dot=faces[a.face].direction.dot(faces[b.face].direction);
    if(dot<=creaseCos){panel.hardEdges++;continue;}
    panel.smoothEdges++;
    for(const [ai,bi]of [[a.from,b.to],[a.to,b.from]]){
      const delta=new T.Vector3().fromArray(stored,ai*3).distanceTo(new T.Vector3().fromArray(stored,bi*3));
      panel.maxNormalDelta=Math.max(panel.maxNormalDelta,delta);
      if(delta<=normalTolerance)continue;
      panel.discontinuousEndpoints++;
      discontinuities.push({ai,bi,delta,dot});
    }
  }
  if(discontinuities.length){
    const source=await sourceFans(node.getName());
    for(const {ai,bi,delta,dot}of discontinuities){
      const sourceNormals=source.get(keys[ai])??[],a=new T.Vector3().fromArray(stored,ai*3),b=new T.Vector3().fromArray(stored,bi*3);
      // Decimation can change a sharp edge's geometric dihedral. Accept its
      // normal split only when BOTH normals reproduce separate full-resolution
      // source fans at this exact retained position. No angle allowance is used.
      const preserved=sourceNormals.some(n=>n.distanceTo(a)<1e-6)&&sourceNormals.some(n=>n.distanceTo(b)<1e-6);
      if(preserved)panel.preservedSourceSplits++;else panel.unexpectedDiscontinuousEndpoints++;
      if(panel.samples.length<12)panel.samples.push({
        position:points[ai].clone().applyMatrix4(matrix).toArray(),normalDelta:delta,
        dihedralDegrees:Math.acos(Math.max(-1,Math.min(1,dot)))*180/Math.PI,preservedSourceSplit:preserved,
      });
    }
  }
  panels.push(panel);
}
const totals={paintPanels:panels.length,paintTriangles:0,smoothEdges:0,discontinuousEndpoints:0,preservedSourceSplits:0,unexpectedDiscontinuousEndpoints:0,invalidNormals:0,degenerateTriangles:0,maxNormalDelta:0};
for(const panel of panels){
  for(const key of ['smoothEdges','discontinuousEndpoints','preservedSourceSplits','unexpectedDiscontinuousEndpoints','invalidNormals','degenerateTriangles'])totals[key]+=panel[key];
  totals.paintTriangles+=panel.triangles;totals.maxNormalDelta=Math.max(totals.maxNormalDelta,panel.maxNormalDelta);
}
await mkdir(dirname(reportPath),{recursive:true});
await writeFile(reportPath,JSON.stringify({asset,sourceAsset:args.includes('--no-source')?null:sourceAsset,normalTolerance,totals,panels},null,2));
console.log(JSON.stringify({asset,reportPath,...totals},null,2));
if(!args.includes('--report-only')){
  assert.ok(totals.paintPanels>0,'No paint panels were checked');
  assert.equal(totals.unexpectedDiscontinuousEndpoints,0,'Smooth manifold paint edges contain normal seams absent from the full-resolution source');
  assert.equal(totals.invalidNormals,0,'Paint normals must be finite unit vectors');
}
