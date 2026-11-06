import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as T from 'three';
import { writeFile } from 'node:fs/promises';
const file=process.argv[2]??'public/assets/cobalt.glb';
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(file);
const meshes=[];
for(const node of doc.getRoot().listNodes()){
  const box=new T.Box3(),matrix=new T.Matrix4().fromArray(node.getWorldMatrix());
  let triangles=0;
  for(const primitive of node.getMesh()?.listPrimitives()??[]){
    const p=primitive.getAttribute('POSITION');for(let i=0;i<p.getCount();i++)box.expandByPoint(new T.Vector3().fromArray(p.getArray(),i*3).applyMatrix4(matrix));
    triangles+=(primitive.getIndices()?.getCount()??p.getCount())/3;
  }
  if(!box.isEmpty())meshes.push({name:node.getName(),materials:node.getMesh().listPrimitives().map(p=>p.getMaterial()?.getName()),min:box.min.toArray(),max:box.max.toArray(),triangles});
}
const all=new T.Box3();meshes.forEach(m=>{all.expandByPoint(new T.Vector3(...m.min));all.expandByPoint(new T.Vector3(...m.max));});
const refinement=doc.getRoot().getExtras().cobaltRefinement;
const scale=refinement?.sourceScale??4.479/(all.max.z-all.min.z),offset=refinement?.sourceOffset??-.62-all.min.y*scale;
for(const mesh of meshes){
  const points=[mesh.min,mesh.max].map(([x,y,z])=>[-x*scale,y*scale+offset,-z*scale]);
  mesh.min=points[0].map((n,i)=>Math.min(n,points[1][i]));mesh.max=points[0].map((n,i)=>Math.max(n,points[1][i]));
}
await writeFile('test-results/model-review/body-inventory.json',JSON.stringify({file,scale,offset,meshes},null,2));
console.log(JSON.stringify(meshes.filter(m=>!/^roda|COBALT/.test(m.name)),null,2));
