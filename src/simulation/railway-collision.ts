import RAPIER from '@dimforge/rapier3d-compat';
import { railwayCrossing,railwayDeckProfiles,railwayRailCenters,railwayRailHeadProfile,type RailwaySection } from '../data/railway';

/** Traversable support surfaces are deliberately separate from exam obstacles:
 * suspension follows their real geometry without reporting a curb collision.
 */
export function addRailwayColliders(world:RAPIER.World,surfaces:Set<number>){
  const c=railwayCrossing,colliders:RAPIER.Collider[]=[];
  const add=(profile:RailwaySection,offset:number,friction:number)=>{
    const points=new Float32Array(profile.length*2*3);
    for(let side=0;side<2;side++)profile.forEach(([z,y],index)=>{
      points.set([(side-.5)*c.length,y,z+offset],(side*profile.length+index)*3);
    });
    const shape=RAPIER.ColliderDesc.convexHull(points);
    if(!shape)throw new Error('Railway support profile must form a solid convex prism');
    const collider=world.createCollider(shape.setTranslation(c.center.x,0,c.center.z).setFriction(friction).setRestitution(0));
    surfaces.add(collider.handle);colliders.push(collider);
  };
  railwayRailCenters.forEach(offset=>add(railwayRailHeadProfile,offset,.6));
  railwayDeckProfiles.forEach(({profile})=>add(profile,0,.9));
  return colliders;
}
