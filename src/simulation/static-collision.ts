import RAPIER from '@dimforge/rapier3d-compat';
import type { BufferGeometry } from 'three';

/** Share the rendered edge, bevel and ramp elevation with physical contact. */
export function addStaticObstacle(world:RAPIER.World,geometry:BufferGeometry,obstacles:Set<number>){
  const position=geometry.getAttribute('position');
  if(!position?.count)return;
  const vertices=new Float32Array(position.count*3);
  for(let i=0;i<position.count;i++)vertices.set([position.getX(i),position.getY(i),position.getZ(i)],i*3);
  const indices=geometry.index?new Uint32Array(geometry.index.array):Uint32Array.from({length:position.count},(_,i)=>i);
  const collider=world.createCollider(RAPIER.ColliderDesc.trimesh(vertices,indices)
    .setFriction(.65).setRestitution(.02));
  obstacles.add(collider.handle);
  return collider;
}
