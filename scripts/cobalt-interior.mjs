import * as T from 'three';
import { smoothPaintPrimitive as smoothTrimPrimitive } from './cobalt-body.mjs';

/** Remove the source's duplicate inner ceiling and steep rear-seat sheet.
 * The same connected shell also supplies the floor, firewall, window seals and
 * wheel-well walls, so retain it everywhere outside those two inner surfaces. */
export function trimSourceInterior({doc,buffer,node,primitive,worldPoint,lining}){
  const position=primitive.getAttribute('POSITION');
  const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i);
  const stats={originalTriangles:indices.length/3,removedCeilingTriangles:0,removedRearBenchTriangles:0,relinedPillarTriangles:0,remainingTriangles:indices.length/3};
  if(!/^interior_interior(?:[._]|$)/.test(node.getName()))return stats;
  const points=Array.from({length:position.getCount()},(_,i)=>worldPoint(node,position,i)),groups=new Map();
  const attributes=primitive.listSemantics().map(semantic=>({semantic,accessor:primitive.getAttribute(semantic)}));
  const vertex=i=>({world:points[i],values:attributes.map(({accessor})=>Array.from(accessor.getArray().slice(i*accessor.getElementSize(),(i+1)*accessor.getElementSize())))});
  const clip=(polygon,above,distance=p=>p.y-.245)=>{
    if(!polygon.length)return [];
    const out=[];let a=polygon.at(-1),da=distance(a.world)*(above?1:-1);
    for(const b of polygon){const db=distance(b.world)*(above?1:-1);
      if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({world:a.world.clone().lerp(b.world,t),values:a.values.map((values,j)=>values.map((value,k)=>T.MathUtils.lerp(value,b.values[j][k],t)))});}
      if(db>=0)out.push(b);a=b;da=db;
    }return out;
  };
  const add=(polygon,material)=>{
    const arrays=groups.get(material)??attributes.map(()=>[]);
    for(let j=1;j<polygon.length-1;j++){
      const triangle=[polygon[0],polygon[j],polygon[j+1]];
      if(new T.Vector3().subVectors(triangle[1].world,triangle[0].world).cross(new T.Vector3().subVectors(triangle[2].world,triangle[0].world)).lengthSq()<1e-18)continue;
      for(const v of triangle)for(let k=0;k<attributes.length;k++)arrays[k].push(...v.values[k]);
    }
    if(arrays[0].length)groups.set(material,arrays);
  };
  for(let i=0;i<indices.length;i+=3){
    const triangle=[indices[i],indices[i+1],indices[i+2]],a=points[triangle[0]],b=points[triangle[1]],c=points[triangle[2]];
    const centre=new T.Vector3().add(a).add(b).add(c).multiplyScalar(1/3);
    const normal=new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a)).normalize();
    // These downward faces sit 15–60 mm beneath the already present headliner.
    // The narrow seals farther out than x=±.55 and the upright rails remain.
    const ceiling=centre.y>.63&&Math.abs(centre.x)<.55&&centre.z> -1.23&&centre.z<.45&&normal.y<-.65;
    // The old backrest is an oblique, almost flat sheet across the entire cabin.
    // Preserve its outboard wheel wells, the floor step and the parcel shelf.
    const rearBench=centre.y>-.34&&centre.y<.305&&centre.z> -1.34&&centre.z<-.78&&Math.abs(centre.x)<.63&&normal.z>.60&&Math.abs(normal.x)<.12;
    // These moulded returns close the pillar/dashboard joints. Keep their
    // shape, using light interior trim rather than the source's black rubber.
    // The farther outboard glass seals and the low cowl remain dark.
    const frontPillar=Math.abs(centre.x)>.49&&Math.abs(centre.x)<.72&&centre.z>.30&&centre.z<1.20;
    const pillar=centre.y>.30&&Math.abs(centre.x)>.49&&Math.abs(centre.x)<.72&&centre.z> -1.75&&centre.z<1.05;
    if(ceiling)stats.removedCeilingTriangles++;
    else if(rearBench)stats.removedRearBenchTriangles++;
    else if(frontPillar&&lining){
      // Keep a continuous pale shell here. The photo-fitted lower foot and
      // its seam are fitted against the authored dashboard after it is built.
      const polygon=triangle.map(vertex);add(clip(polygon,true),lining);add(clip(polygon,false),primitive.getMaterial());
      if(centre.y>.245)stats.relinedPillarTriangles++;
    }else if(pillar&&lining){add(triangle.map(vertex),lining);stats.relinedPillarTriangles++;}
    else add(triangle.map(vertex),primitive.getMaterial());
  }
  const mesh=node.getMesh();stats.remainingTriangles=0;
  for(const [material,arrays]of groups){
    const p=doc.createPrimitive().setMaterial(material);
    for(let i=0;i<attributes.length;i++){
      const {semantic,accessor}=attributes[i];
      if(semantic==='NORMAL')for(let j=0;j<arrays[i].length;j+=3)new T.Vector3().fromArray(arrays[i],j).normalize().toArray(arrays[i],j);
      p.setAttribute(semantic,doc.createAccessor().setType(accessor.getType()).setArray(new Float32Array(arrays[i])).setBuffer(buffer));
    }
    mesh.addPrimitive(p);stats.remainingTriangles+=p.getAttribute('POSITION').getCount()/3;
  }
  mesh.removePrimitive(primitive);primitive.dispose();
  return stats;
}

/** Keep the wheel-well shell, with black wheel-facing surfaces and grey cabin
 * cladding on the reverse side. This does not open a view into the tyre wells. */
export function lineRearWheelWells({doc,buffer,node,primitive,worldPoint,lining}){
  if(!/^chassis_door/.test(node.getName()))return 0;
  const position=primitive.getAttribute('POSITION'),indices=primitive.getIndices()?.getArray();
  if(!indices)return 0;
  const kept=[],outer=[],inner=[];
  for(let i=0;i<indices.length;i+=3){
    const triangle=[indices[i],indices[i+1],indices[i+2]];
    const points=triangle.map(index=>worldPoint(node,position,index));
    const centre=new T.Vector3().add(points[0]).add(points[1]).add(points[2]).multiplyScalar(1/3);
    const normal=new T.Vector3().subVectors(points[1],points[0]).cross(new T.Vector3().subVectors(points[2],points[0])).normalize();
    const wheelWell=centre.z> -1.69&&centre.z<-.94&&centre.y>-.32&&centre.y<.10&&Math.abs(centre.x)>.43&&Math.abs(centre.x)<.75&&(normal.y<-.2||normal.x*centre.x>.2);
    if(wheelWell){outer.push(...triangle);inner.push(triangle[0],triangle[2],triangle[1]);}
    else kept.push(...triangle);
  }
  if(!inner.length)return 0;
  const mesh=node.getMesh(),indexAccessor=list=>doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(buffer);
  const exterior=primitive.getMaterial().clone().setName('COBALT_RearWheelWellOuter').setDoubleSided(false);
  mesh.addPrimitive(primitive.clone().setMaterial(exterior).setIndices(indexAccessor(outer)));
  const cabin=primitive.clone().setMaterial(lining).setIndices(indexAccessor(inner)),normals=primitive.getAttribute('NORMAL');
  if(normals)cabin.setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(Float32Array.from(normals.getArray(),value=>-value)).setBuffer(buffer));
  cabin.setAttribute('TANGENT',null);mesh.addPrimitive(cabin);
  primitive.setIndices(indexAccessor(kept));return inner.length/3;
}

/** The source parcel shelf and inward C-pillar returns share materials with
 * outer shells. Split only these cabin faces, preserving the glass seals,
 * outward body paint and the closed surface underneath the new matte trim. */
export function refineRearCabinTrim({doc,buffer,nodes,worldPoint,shelf,lining}){
  const stats={shelfTriangles:0,pillarTriangles:0};
  for(const node of nodes){
    if(!/^(chassis_|interior_)/.test(node.getName()))continue;
    const mesh=node.getMesh();if(!mesh)continue;
    for(const primitive of [...mesh.listPrimitives()]){
      if(primitive.getMaterial()?.getAlphaMode()==='BLEND')continue;
      const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:positions.getCount()},(_,i)=>i);
      const groups=new Map([[shelf,[]],[lining,[]]]),kept=[];
      for(let i=0;i<indices.length;i+=3){
        const triangle=[indices[i],indices[i+1],indices[i+2]],points=triangle.map(index=>worldPoint(node,positions,index));
        const p=new T.Vector3().add(points[0]).add(points[1]).add(points[2]).multiplyScalar(1/3);
        const n=new T.Vector3().subVectors(points[1],points[0]).cross(new T.Vector3().subVectors(points[2],points[0])).normalize();
        const rear=p.z<-.95&&p.z> -1.82&&p.y>.29&&p.y<.79;
        // Test every corner, not just the centre: long source triangles can
        // cross the glass opening and continue onto the painted outer rim.
        const parcel=rear&&p.z< -1.43&&p.y<.50&&n.y>.55&&points.every(q=>Math.abs(q.x)<.64&&q.z> -1.77&&q.z< -1.43&&q.y<.50);
        const pillar=rear&&Math.abs(p.x)>.49&&n.x*p.x<-.08&&points.every(q=>Math.abs(q.x)<.70&&q.z> -1.80&&q.z<-.95);
        if(parcel){groups.get(shelf).push(...triangle);stats.shelfTriangles++;}
        else if(pillar){groups.get(lining).push(...triangle);stats.pillarTriangles++;}
        else kept.push(...triangle);
      }
      if(kept.length===indices.length)continue;
      const accessor=list=>doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(buffer);
      for(const [material,list]of groups)if(list.length){
        const trim=primitive.clone().setMaterial(material).setIndices(accessor(list));
        smoothTrimPrimitive(doc,buffer,trim);mesh.addPrimitive(trim);
      }
      if(kept.length)primitive.setIndices(accessor(kept));
      else{mesh.removePrimitive(primitive);primitive.dispose();}
    }
  }
  return stats;
}
