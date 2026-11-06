import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import * as T from 'three';

// Offline pixel probes for the matched pillar close-up used by the browser check.
const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read(process.argv[2]||'public/assets/cobalt.glb');
const r=doc.getRoot().getExtras().cobaltRefinement;
const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
const material=new T.MeshBasicMaterial({side:T.DoubleSide}),surfaces=[];
for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
  const source=primitive.getMaterial();if(!source||source.getAlphaMode()==='BLEND')continue;
  const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(primitive.getAttribute('POSITION').getArray(),3));
  if(primitive.getIndices())geometry.setIndex(Array.from(primitive.getIndices().getArray()));
  geometry.applyMatrix4(normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())));
  const mesh=new T.Mesh(geometry,material);mesh.name=node.getName();mesh.userData={material:source.getName(),doubleSided:source.getDoubleSided()};surfaces.push(mesh);
}
const camera=new T.PerspectiveCamera(40,1.5,.025,20);camera.position.set(.31,.48,.2);camera.lookAt(.63,.39,.92);camera.updateMatrixWorld();
const ray=new T.Raycaster();
const pixels=process.argv[3]?JSON.parse(process.argv[3]):[[625,585],[630,600],[635,615],[640,630],[750,540],[765,555],[775,570],[790,570],[805,560]];
for(const [x,y]of pixels){
  ray.setFromCamera(new T.Vector2(x/1440*2-1,1-y/960*2),camera);
  const hits=ray.intersectObjects(surfaces).filter(h=>h.object.userData.doubleSided||h.face.normal.dot(ray.ray.direction)<0);
  console.log(JSON.stringify({pixel:[x,y],hits:hits.slice(0,4).map(h=>({node:h.object.name,material:h.object.userData.material,point:h.point.toArray().map(n=>+n.toFixed(6)),face:h.faceIndex}))}));
}
surfaces.forEach(mesh=>mesh.geometry.dispose());material.dispose();
