import * as T from 'three';
import { smoothPaintPrimitive } from './cobalt-body.mjs';

const rearOutward=new T.Vector3(0,.88,-.48).normalize();

/** Carry the front pane's upper corners underneath the fitted pillar/roof
 * returns. The donor outline otherwise leaves an unglazed triangular slit.
 * Move both shell faces together so their tint remains uniform at the edge. */
export function fitFrontGlassFrame({doc,buffer,node,primitive,worldPoint}){
  const position=primitive.getAttribute('POSITION'),values=new Float32Array(position.getArray());
  const zero={getArray:()=>new Float32Array(3)},origin=worldPoint(node,zero,0);
  const basis=[0,1,2].map(axis=>{const a=new Float32Array(3);a[axis]=1;return worldPoint(node,{getArray:()=>a},0).sub(origin);});
  const transform=new T.Matrix4().makeBasis(...basis).setPosition(origin),inverse=transform.clone().invert();
  const toCarNormal=new T.Matrix3().getNormalMatrix(transform),toSourceNormal=new T.Matrix3().setFromMatrix4(transform).transpose();
  const normals=primitive.getAttribute('NORMAL'),normalValues=normals?new Float32Array(normals.getArray()):null;
  const warp=p=>{
    const amount=T.MathUtils.smoothstep(Math.abs(p.x),.45,.60)*T.MathUtils.smoothstep(p.y,.55,.73);
    return p.clone().add(new T.Vector3(Math.sign(p.x)*.035,.018,-.036).multiplyScalar(amount));
  };
  const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i);
  let moved=0;
  for(const i of new Set(indices)){
    const p=worldPoint(node,position,i),q=warp(p);if(p.distanceToSquared(q)<1e-18)continue;
    q.applyMatrix4(inverse).toArray(values,i*3);moved++;
    if(normalValues){
      const epsilon=.00001,columns=[0,1,2].map(axis=>{
        const delta=new T.Vector3();delta.setComponent(axis,epsilon);
        return warp(p.clone().add(delta)).sub(warp(p.clone().sub(delta))).multiplyScalar(.5/epsilon);
      });
      const jacobian=new T.Matrix4().makeBasis(...columns),normalWarp=new T.Matrix3().getNormalMatrix(jacobian);
      new T.Vector3().fromArray(normalValues,i*3).applyMatrix3(toCarNormal).applyMatrix3(normalWarp).applyMatrix3(toSourceNormal).normalize().toArray(normalValues,i*3);
    }
  }
  primitive.setAttribute('POSITION',position.clone().setArray(values).setBuffer(buffer));
  if(normalValues)primitive.setAttribute('NORMAL',normals.clone().setArray(normalValues).setBuffer(buffer));
  primitive.setAttribute('TANGENT',null);
  return {movedVertices:moved};
}

/** Fit one continuous glass sheet over the source mirror's triangulated insert.
 * The shell contains overlapping rear faces; a single sheet prevents plastic
 * slivers from occluding individual triangles of the live image. */
export function extractSideMirror({doc,buffer,node,primitive,worldPoint,material}){
  const positions=primitive.getAttribute('POSITION'),indices=primitive.getIndices().getArray(),points=[],housing=[];
  const side=/^door_lf/.test(node.getName())?1:-1,normal=new T.Vector3(-side*.48,0,-.88).normalize();
  const horizontal=new T.Vector3(.88,0,-side*.48).normalize();
  for(let i=0;i<indices.length;i+=3){
    const vertices=[0,1,2].map(j=>worldPoint(node,positions,indices[i+j]));
    const center=vertices[0].clone().add(vertices[1]).add(vertices[2]).divideScalar(3);
    const face=vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
    const insert=Math.abs(center.x)>.78&&center.y>.31&&center.y<.46&&center.z>.60&&center.z<.72&&face.dot(normal)>.98&&Math.abs(normal.dot(center)+1.0006)<.0015;
    if(insert)for(const v of vertices)points.push([v.dot(horizontal),v.y]);
    else housing.push(indices[i],indices[i+1],indices[i+2]);
  }
  if(!points.length)throw new Error(`Missing side mirror insert: ${node.getName()}`);
  points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
  const half=list=>{const out=[];for(const p of list){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out;};
  const lower=half(points),upper=half([...points].reverse());lower.pop();upper.pop();const hull=lower.concat(upper);
  // Eight supporting planes enclose the curved aperture without adding a
  // separate rim subdivision for every tiny source outline edge.
  const supports=Array.from({length:8},(_,i)=>{
    const n=[Math.cos(i*Math.PI/4),Math.sin(i*Math.PI/4)];
    // Clear the shallow lip behind the full actuator travel, including the
    // inboard arc. The painted outer shell is a separate primitive.
    return {n,d:Math.max(...hull.map(p=>p[0]*n[0]+p[1]*n[1]))+.012};
  });
  const aperture=supports.map((a,i)=>{
    const b=supports[(i+1)%supports.length],det=a.n[0]*b.n[1]-a.n[1]*b.n[0];
    return [(a.d*b.n[1]-a.n[1]*b.d)/det,(a.n[0]*b.d-a.d*b.n[0])/det];
  });
  // The source has additional flat, rear-facing fragments behind its insert.
  // Remove their portion inside the aperture: a tilted actuator otherwise
  // exposes these as triangular plastic patches through the live picture.
  const attributes=primitive.listSemantics().map(semantic=>({semantic,accessor:primitive.getAttribute(semantic)}));
  const arrays=attributes.map(()=>[]);
  const vertex=i=>({point:worldPoint(node,positions,i),values:attributes.map(({accessor:a})=>Array.from(a.getArray().slice(i*a.getElementSize(),(i+1)*a.getElementSize())))});
  const project=v=>[v.point.dot(horizontal),v.point.y];
  const clip=(polygon,a,b,inside)=>{
    if(!polygon.length)return [];const output=[],sign=inside?1:-1;
    let v=polygon.at(-1),dv=cross(a,b,project(v))*sign;
    for(const w of polygon){const dw=cross(a,b,project(w))*sign;
      if((dv>=0)!==(dw>=0)){const t=dv/(dv-dw);output.push({point:v.point.clone().lerp(w.point,t),values:v.values.map((values,j)=>values.map((value,k)=>T.MathUtils.lerp(value,w.values[j][k],t)))});}
      if(dw>=0)output.push(w);v=w;dv=dw;
    }return output;
  };
  const add=polygon=>{for(let j=1;j<polygon.length-1;j++){
    const triangle=[polygon[0],polygon[j],polygon[j+1]];
    if(triangle[1].point.clone().sub(triangle[0].point).cross(triangle[2].point.clone().sub(triangle[0].point)).lengthSq()<1e-18)continue;
    for(const v of triangle)v.values.forEach((values,k)=>arrays[k].push(...values));
  }};
  for(let i=0;i<housing.length;i+=3){
    let polygon=[0,1,2].map(j=>vertex(housing[i+j]));
    const c=polygon.reduce((p,v)=>p.add(v.point),new T.Vector3()).divideScalar(3),face=polygon[1].point.clone().sub(polygon[0].point).cross(polygon[2].point.clone().sub(polygon[0].point)).normalize(),depth=normal.dot(c);
    if(Math.abs(c.x)>.74&&c.y>.30&&c.y<.47&&c.z>.59&&c.z<.74&&face.dot(normal)>.05&&depth>-1.015&&depth<-.98){
      // Keep disjoint rim triangles intact instead of subdividing them once
      // for every edge of the curved opening.
      const disjoint=aperture.some((a,j)=>polygon.every(v=>cross(a,aperture[(j+1)%aperture.length],project(v))<=1e-10));
      if(disjoint){add(polygon);continue;}
      for(let j=0;j<aperture.length&&polygon.length;j++){add(clip(polygon,aperture[j],aperture[(j+1)%aperture.length],false));polygon=clip(polygon,aperture[j],aperture[(j+1)%aperture.length],true);}
    }else add(polygon);
  }
  attributes.forEach(({semantic,accessor:a},i)=>{
    if(semantic==='NORMAL')for(let j=0;j<arrays[i].length;j+=3)new T.Vector3().fromArray(arrays[i],j).normalize().toArray(arrays[i],j);
    primitive.setAttribute(semantic,doc.createAccessor().setType(a.getType()).setArray(new Float32Array(arrays[i])).setBuffer(buffer));
  });
  primitive.setIndices(null);
  const center=hull.reduce((c,p)=>[c[0]+p[0]/hull.length,c[1]+p[1]/hull.length],[0,0]);
  // Move the clean sheet just ahead of the old stepped insert, inside its rim.
  const a=worldPoint(node,positions,0),source=new T.Vector3().fromArray(positions.getArray(),0);
  const transform=new T.Matrix4();
  // Derive source-to-normalized-car transform from the supplied world mapping.
  const basis=[0,1,2].map(axis=>{
    const values=new Float32Array(source.toArray());values[axis]+=1;
    const accessor={getArray:()=>values};return worldPoint(node,accessor,0).sub(a);
  });
  transform.makeBasis(...basis);transform.setPosition(a.clone().sub(source.clone().applyMatrix4(transform)));transform.invert();
  const vertices=[center,...hull].map(([u,v],i)=>{
    if(i){u=center[0]+(u-center[0])*.985;v=center[1]+(v-center[1])*.985;}
    return horizontal.clone().multiplyScalar(u).add(new T.Vector3(0,v,0)).addScaledVector(normal,-.988).applyMatrix4(transform);
  });
  const triangles=[];
  for(let i=0;i<hull.length;i++)triangles.push(0,1+(i+1)%hull.length,1+i);
  const accessor=(values,type)=>doc.createAccessor().setType(type).setArray(values).setBuffer(buffer);
  const pane=doc.createPrimitive().setMaterial(material).setAttribute('POSITION',accessor(new Float32Array(vertices.flatMap(v=>v.toArray())),'VEC3')).setIndices(accessor(new Uint32Array(triangles),'SCALAR'));
  node.getMesh().addPrimitive(pane);
  // The actuator needs an opaque cavity behind the moving sheet. Without it,
  // clearing the old overlapping lip leaves a view through the housing.
  const cavityMaterial=doc.getRoot().listMaterials().find(m=>m.getName()==='COBALT_SideMirrorCavity')??doc.createMaterial('COBALT_SideMirrorCavity')
    .setBaseColorFactor([...new T.Color(0x20252a).toArray(),1]).setMetallicFactor(0).setRoughnessFactor(1);
  const cavityDepth=-1.024,eye=new T.Vector3(.285,.465,.18),eyeDepth=normal.dot(eye);
  const cavityVertices=[center,...hull].map(([u,v],i)=>{
    if(i){
      const before=hull[(i+hull.length-2)%hull.length],after=hull[i%hull.length];
      const previous=new T.Vector2(u-before[0],v-before[1]).normalize(),next=new T.Vector2(after[0]-u,after[1]-v).normalize();
      const a=new T.Vector2(previous.y,-previous.x),b=new T.Vector2(next.y,-next.x),offset=a.clone().add(b).multiplyScalar(.012/(1+a.dot(b)));
      u+=offset.x;v+=offset.y;
    }
    const front=horizontal.clone().multiplyScalar(u).add(new T.Vector3(0,v,0)).addScaledVector(normal,-.988);
    // Project the curved opening from the driver seat onto the deeper cavity
    // plane. This covers the inboard edge of the distant passenger mirror too.
    return eye.clone().lerp(front,(cavityDepth-eyeDepth)/(-.988-eyeDepth)).applyMatrix4(transform);
  });
  node.getMesh().addPrimitive(doc.createPrimitive().setMaterial(cavityMaterial)
    .setAttribute('POSITION',accessor(new Float32Array(cavityVertices.flatMap(v=>v.toArray())),'VEC3'))
    .setIndices(accessor(new Uint32Array(triangles),'SCALAR')));
  return triangles.length/3;
}

/** Keep one bidirectional rear pane instead of blending the inner and outer
 * walls of the source's closed glass shell. worldPoint returns a source vertex
 * in normalized car coordinates, including the node transform and half-turn.
 * The supplied primitive is updated in place; its material is retained. */
export function extractRearGlassExterior({doc,buffer,node,primitive,worldPoint}){
  const position=primitive.getAttribute('POSITION');
  const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i);
  const selected=[];
  for(let i=0;i<indices.length;i+=3){
    const a=worldPoint(node,position,indices[i]),b=worldPoint(node,position,indices[i+1]),c=worldPoint(node,position,indices[i+2]);
    const normal=new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a)).normalize();
    if(normal.dot(rearOutward)>.5)selected.push(indices[i],indices[i+1],indices[i+2]);
  }
  if(!selected.length)throw new Error(`Rear glass exterior sheet is empty for "${node.getName()}".`);

  // Expand every attribute with the same corner selection, including normalized
  // integer colors and custom attributes that the normal helper does not know.
  // This also handles indexed and already-expanded source primitives uniformly.
  const retained=new Map();
  for(const semantic of primitive.listSemantics()){
    if(semantic==='TANGENT')continue;
    const source=primitive.getAttribute(semantic),values=source.getArray(),size=source.getElementSize();
    const expanded=new values.constructor(selected.length*size);
    for(let i=0;i<selected.length;i++)for(let j=0;j<size;j++)expanded[i*size+j]=values[selected[i]*size+j];
    const attribute=source.clone().setArray(expanded).setBuffer(buffer);
    retained.set(semantic,attribute);primitive.setAttribute(semantic,attribute);
  }
  primitive.setAttribute('TANGENT',null);
  primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(Uint32Array.from({length:selected.length},(_,i)=>i)).setBuffer(buffer));
  smoothPaintPrimitive(doc,buffer,primitive);
  // The shared smoother rebuilds float UV accessors. Restore the selected
  // originals so their values, component types and normalization stay intact.
  for(const [semantic,attribute]of retained)if(semantic!=='POSITION'&&semantic!=='NORMAL')primitive.setAttribute(semantic,attribute);
  return {sourceTriangles:indices.length/3,exteriorTriangles:selected.length/3};
}
