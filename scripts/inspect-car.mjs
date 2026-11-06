import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const b=await readFile('chevrolet_cobalt_ltz_2014.glb');
const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
const root=gltf.scene;root.updateMatrixWorld(true);
const box=new T.Box3().setFromObject(root);
console.log('BOUNDS',box.min.toArray(),box.max.toArray(),'SIZE',box.getSize(new T.Vector3()).toArray());
root.traverse(n=>{
  if(/dummy|steering_ok$/.test(n.name)){
    const b=new T.Box3().setFromObject(n);
    console.log(n.name,'CENTER',b.getCenter(new T.Vector3()).toArray().map(x=>+x.toFixed(4)),'SIZE',b.getSize(new T.Vector3()).toArray().map(x=>+x.toFixed(4)));
  }
});
