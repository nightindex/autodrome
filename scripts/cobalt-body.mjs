import * as T from 'three';

/** Corner-angle weighted normals on edge-connected smoothing fans. Precise
 * position matching joins UV seams without blending nearby sheet-metal lips.
 * Every corner in a fan receives the same normal, including at gradual bends. */
export function smoothBodyGeometry(geometry,creaseAngle=Math.PI/3){
  const result=geometry.index?geometry.toNonIndexed():geometry.clone();
  const p=result.getAttribute('position'),vertices=new Map(),edges=new Map(),faces=[];
  const point=i=>new T.Vector3().fromBufferAttribute(p,i);
  const ids=new Uint32Array(p.count),parents=Uint32Array.from({length:p.count},(_,i)=>i),weights=new Float64Array(p.count);
  const find=i=>{let root=i;while(parents[root]!==root)root=parents[root];while(parents[i]!==i){const next=parents[i];parents[i]=root;i=next;}return root;};
  const join=(a,b)=>{parents[find(b)]=find(a);};
  for(let i=0;i<p.count;i++){
    const key=[p.getX(i),p.getY(i),p.getZ(i)].map(n=>Math.round(n*1e6)).join(',');
    if(!vertices.has(key))vertices.set(key,vertices.size);ids[i]=vertices.get(key);
  }
  for(let i=0;i<p.count;i+=3){
    const corners=[point(i),point(i+1),point(i+2)];
    const normal=new T.Vector3().subVectors(corners[1],corners[0]).cross(new T.Vector3().subVectors(corners[2],corners[0])).normalize();
    faces.push(normal);
    for(let j=0;j<3;j++){
      const a=new T.Vector3().subVectors(corners[(j+1)%3],corners[j]),b=new T.Vector3().subVectors(corners[(j+2)%3],corners[j]);
      weights[i+j]=Math.atan2(new T.Vector3().crossVectors(a,b).length(),a.dot(b));
      const from=i+j,to=i+(j+1)%3;
      if(ids[from]===ids[to]||normal.lengthSq()===0)continue;
      const key=ids[from]<ids[to]?`${ids[from]}:${ids[to]}`:`${ids[to]}:${ids[from]}`;
      const adjacent=edges.get(key)??[];adjacent.push({from,to,normal});edges.set(key,adjacent);
    }
  }
  const threshold=Math.cos(creaseAngle);
  for(const adjacent of edges.values()){
    // A non-manifold edge, same-winding overlap or hard fold separates fans.
    if(adjacent.length!==2)continue;
    const [a,b]=adjacent;
    if(ids[a.from]!==ids[b.to]||ids[a.to]!==ids[b.from]||a.normal.dot(b.normal)<=threshold)continue;
    join(a.from,b.to);join(a.to,b.from);
  }
  const sums=new Map(),normals=new Float32Array(p.count*3);
  for(let i=0;i<p.count;i++){
    const root=find(i),sum=sums.get(root)??new T.Vector3();
    sum.addScaledVector(faces[Math.floor(i/3)],weights[i]);sums.set(root,sum);
  }
  for(const sum of sums.values())sum.normalize();
  for(let i=0;i<p.count;i++){
    const normal=sums.get(find(i));
    (normal.lengthSq()>1e-12?normal:faces[Math.floor(i/3)]).toArray(normals,i*3);
  }
  result.setAttribute('normal',new T.BufferAttribute(normals,3));
  result.deleteAttribute('tangent');return result;
}

/** Smooth curved sheet metal while retaining hard panel folds and UV seams. */
export function smoothPaintPrimitive(doc,buffer,primitive){
  const geometry=new T.BufferGeometry();
  for(const semantic of primitive.listSemantics()){
    const attribute=primitive.getAttribute(semantic),name={POSITION:'position',NORMAL:'normal',TEXCOORD_0:'uv',TEXCOORD_1:'uv1',TANGENT:'tangent'}[semantic];
    if(name)geometry.setAttribute(name,new T.BufferAttribute(new Float32Array(attribute.getArray()),attribute.getElementSize()));
  }
  geometry.setIndex(new T.BufferAttribute(new Uint32Array(primitive.getIndices().getArray()),1));
  const smooth=smoothBodyGeometry(geometry);
  for(const [name,semantic,type]of [['position','POSITION','VEC3'],['normal','NORMAL','VEC3'],['uv','TEXCOORD_0','VEC2'],['uv1','TEXCOORD_1','VEC2'],['tangent','TANGENT','VEC4']]){
    const attribute=smooth.getAttribute(name);if(attribute)primitive.setAttribute(semantic,doc.createAccessor().setType(type).setArray(new Float32Array(attribute.array)).setBuffer(buffer));
  }
  primitive.setIndices(null);geometry.dispose();if(smooth!==geometry)smooth.dispose();
  primitive.setAttribute('TANGENT',null);
}

/** The source roof lining crosses the painted outer skin near its side rails.
 * Fit only interior trim beneath the real roof; preserve the roof and antenna. */
export function fitRoofLining(doc,buffer,normalize){
  const surfaces=[],material=new T.MeshBasicMaterial({side:T.DoubleSide});
  for(const node of doc.getRoot().listNodes())if(/^chassis_primary/.test(node.getName()))for(const p of node.getMesh()?.listPrimitives()??[]){
    if(p.getMaterial()?.getName()!=='Realistic_Car_Paint')continue;
    const matrix=normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())),position=p.getAttribute('POSITION'),values=[];
    for(let i=0;i<position.getCount();i++)values.push(...new T.Vector3().fromArray(position.getArray(),i*3).applyMatrix4(matrix).toArray());
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(values,3));
    if(p.getIndices())geometry.setIndex(Array.from(p.getIndices().getArray()));
    const mesh=new T.Mesh(geometry,material);mesh.updateMatrixWorld();surfaces.push(mesh);
  }
  let corrected=0;const ray=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0),0,2);
  for(const node of doc.getRoot().listNodes())if(/^(chassis_door|interior_1)/.test(node.getName())){
    const matrix=normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())),inverse=matrix.clone().invert(),accessors=new Map();
    for(const p of node.getMesh()?.listPrimitives()??[]){if(p.getMaterial()?.getName()!=='COBALT_Headliner')continue;const position=p.getAttribute('POSITION');const used=accessors.get(position)??new Set();for(const i of p.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i))used.add(i);accessors.set(position,used);}
    for(const [position,used]of accessors){
      const values=new Float32Array(position.getArray());let changed=0;
      for(const i of used){
        const point=new T.Vector3().fromArray(values,i*3).applyMatrix4(matrix);
        if(point.y<.64||Math.abs(point.x)<.42||Math.abs(point.x)>.74||point.z< -1.25||point.z>.5)continue;
        ray.ray.origin.set(point.x,1.5,point.z);const roof=ray.intersectObjects(surfaces)[0];
        // Preserve the intentional roof/door seal gaps. Fit only beneath an
        // existing metal surface, with clearance for the separate triangulation.
        if(!roof||roof.point.y<.65||point.y<=roof.point.y-.015)continue;
        point.y=roof.point.y-.015;
        point.applyMatrix4(inverse).toArray(values,i*3);changed++;
      }
      if(changed){
        const fitted=doc.createAccessor().setType('VEC3').setArray(values).setBuffer(buffer);
        for(const p of node.getMesh().listPrimitives())if(p.getMaterial()?.getName()==='COBALT_Headliner'&&p.getAttribute('POSITION')===position)p.setAttribute('POSITION',fitted);
        corrected+=changed;
      }
    }
  }
  surfaces.forEach(m=>m.geometry.dispose());material.dispose();return corrected;
}

/** The grille's disconnected centre bowtie is gold; its surround is chrome. */
export function frontGrilleMaterials({doc,buffer,node,primitive,worldPoint,gold,chrome}){
  const position=primitive.getAttribute('POSITION'),indices=primitive.getIndices().getArray();
  const points=Array.from({length:position.getCount()},(_,i)=>worldPoint(node,position,i));
  const keys=points.map(p=>p.toArray().map(n=>Math.round(n*1e5)).join(',')),parents=new Map(keys.map(k=>[k,k]));
  const find=k=>{let p=k;while(parents.get(p)!==p)p=parents.get(p);while(k!==p){const next=parents.get(k);parents.set(k,p);k=next;}return p;};
  for(let i=0;i<indices.length;i+=3)for(let j=1;j<3;j++)parents.set(find(keys[indices[i+j]]),find(keys[indices[i]]));
  const bounds=new Map();
  for(let i=0;i<points.length;i++){const key=find(keys[i]),box=bounds.get(key)??new T.Box3();box.expandByPoint(points[i]);bounds.set(key,box);}
  const groups=new Map([[gold,[]],[chrome,[]]]);
  for(let i=0;i<indices.length;i+=3){const box=bounds.get(find(keys[indices[i]]));
    const badge=box.max.x-box.min.x<.25&&box.max.y-box.min.y>.05&&box.min.z>2.13;
    groups.get(badge?gold:chrome).push(indices[i],indices[i+1],indices[i+2]);
  }
  for(const [mat,list]of groups)if(list.length)node.getMesh().addPrimitive(primitive.clone().setMaterial(mat).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(buffer)));
  node.getMesh().removePrimitive(primitive);primitive.dispose();
}

/** The inward faces of pillars/roof have cloth or plastic trim, rather than
 * white exterior paint or the source's uniformly black window-frame material. */
export function interiorTrimMaterials({doc,buffer,node,primitive,worldPoint,trim,belt=trim}){
  const position=primitive.getAttribute('POSITION'),normals=primitive.getAttribute('NORMAL');
  if(!normals)return;
  const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i);
  const normalMatrix=new T.Matrix3().getNormalMatrix(new T.Matrix4().fromArray(node.getWorldMatrix()));
  // worldPoint includes the source model's half-turn; uniform scale does not
  // affect normal directions.
  const halfTurn=new T.Matrix3().set(-1,0,0,0,1,0,0,0,-1),inside=[],outside=[],beltline=[];
  for(let i=0;i<indices.length;i+=3){const p=new T.Vector3(),normal=new T.Vector3();
    for(let j=0;j<3;j++){p.add(worldPoint(node,position,indices[i+j]));normal.add(new T.Vector3().fromArray(normals.getArray(),indices[i+j]*3).applyMatrix3(normalMatrix).applyMatrix3(halfTurn));}p.multiplyScalar(1/3);normal.normalize();
    const pillar=p.y>.29&&p.y<.79&&Math.abs(p.x)>.50&&Math.abs(p.x)<.81&&p.z>-.9&&p.z<1.2&&(normal.x*p.x<-.10||p.z>.3&&normal.z<-.25);
    const ceiling=p.y>.66&&Math.abs(p.x)<.73&&p.z>-1.45&&p.z<.55&&normal.y<-.2;
    // The inner window ledge is a black weatherstrip. Leaving its upward
    // painted faces visible between the door card and glass made white shards
    // below the mirror; keep the outer door skin and mirror shell painted.
    const doorBelt=/^door_[lr]f/.test(node.getName())&&p.y>.29&&p.y<.35&&Math.abs(p.x)>.695&&Math.abs(p.x)<.77&&p.z>-.35&&p.z<.78&&Math.abs(normal.y)>.25;
    (doorBelt?beltline:pillar||ceiling?inside:outside).push(indices[i],indices[i+1],indices[i+2]);
  }
  if(!inside.length&&!beltline.length)return;
  for(const [mat,list]of [[trim,inside],[belt,beltline],[primitive.getMaterial(),outside]])if(list.length)node.getMesh().addPrimitive(primitive.clone().setMaterial(mat).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(buffer)));
  node.getMesh().removePrimitive(primitive);primitive.dispose();
}
