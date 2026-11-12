import * as T from 'three';

const basis=(y,z)=>{
  const v=(y-.13)/.20,u=(z+.70)/.55;
  return Array.from({length:16},(_,i)=>v**(i%4)*u**Math.floor(i/4));
};
const weight=(y,z)=>T.MathUtils.smoothstep(y,.10,.16)*(1-T.MathUtils.smoothstep(y,.28,.34))
  *T.MathUtils.smoothstep(z,-.95,-.87)*(1-T.MathUtils.smoothstep(z,-.32,-.22));

/** Fair the broad shoulder of a rear door against a smooth bicubic sheet.
 * Work in the authored metre frame. The handle, stamped lower line, window
 * return and panel boundaries remain outside the deformation's support. */
export function fairRearDoorGeometry(geometry){
  const raw=geometry.index?geometry.toNonIndexed():geometry.clone();raw.computeBoundingBox();
  const side=Math.sign(raw.boundingBox.getCenter(new T.Vector3()).x);
  const support=new T.Mesh(raw,new T.MeshBasicMaterial({side:T.DoubleSide}));support.updateMatrixWorld();
  const ray=new T.Raycaster(new T.Vector3(),new T.Vector3(-side,0,0));
  const equations=Array.from({length:16},()=>Array(17).fill(0));let samples=0;
  for(let y=-.07;y<=.32;y+=.0125)for(let z=-1.2;z<=-.175;z+=.025){
    // Exclude the real handle and finger recess from the panel fit.
    if(((y-.22)/.065)**2+((z+1.06)/.12)**2<1.4)continue;
    ray.ray.origin.set(side*2,y,z);const hit=ray.intersectObject(support)[0];
    if(!hit||hit.face.normal.x*side<.85||Math.abs(hit.point.x)<.75)continue;
    const terms=basis(y,z);samples++;
    for(let i=0;i<16;i++){for(let j=0;j<16;j++)equations[i][j]+=terms[i]*terms[j];equations[i][16]+=terms[i]*Math.abs(hit.point.x);}
  }
  support.material.dispose();
  if(samples<100)throw new Error('Rear-door skin has insufficient exterior samples');
  for(let i=0;i<16;i++){
    let pivot=i;for(let j=i+1;j<16;j++)if(Math.abs(equations[j][i])>Math.abs(equations[pivot][i]))pivot=j;
    [equations[i],equations[pivot]]=[equations[pivot],equations[i]];
    const divisor=equations[i][i];if(Math.abs(divisor)<1e-10)throw new Error('Singular rear-door surface fit');
    for(let j=i;j<=16;j++)equations[i][j]/=divisor;
    for(let row=0;row<16;row++)if(row!==i){const factor=equations[row][i];for(let j=i;j<=16;j++)equations[row][j]-=factor*equations[i][j];}
  }
  const coefficients=equations.map(row=>row[16]);
  const fittedX=(y,z)=>basis(y,z).reduce((sum,value,i)=>sum+value*coefficients[i],0);
  const names=Object.keys(raw.attributes),positionIndex=names.indexOf('position'),normalIndex=names.indexOf('normal');
  const attributes=names.map(name=>raw.getAttribute(name)),output=attributes.map(()=>[]);
  const vertex=i=>attributes.map(a=>Array.from(a.array.slice(i*a.itemSize,(i+1)*a.itemSize)));
  const midpoint=(a,b)=>a.map((values,j)=>values.map((value,k)=>(value+b[j][k])/2));
  const point=v=>new T.Vector3(...v[positionIndex]);
  const eligible=v=>v[normalIndex][0]*side>.8&&Math.abs(v[positionIndex][0])>.75;
  let changed=0,maxDisplacement=0;
  const emit=v=>{
    // Adjacent triangles share subdivision vertices. Each corner must start
    // from that source vertex, rather than deforming it again on every use.
    v=v.map(values=>[...values]);
    const p=point(v),n=new T.Vector3(...v[normalIndex]).normalize(),w=weight(p.y,p.z);
    if(w>0&&eligible(v)){
      const delta=fittedX(p.y,p.z)-Math.abs(p.x);
      // A fitted shoulder must never pull a separate shell into the panel.
      if(Math.abs(delta)<.006){
        const epsilon=.0001,dy=(fittedX(p.y+epsilon,p.z)-fittedX(p.y-epsilon,p.z))/(2*epsilon),dz=(fittedX(p.y,p.z+epsilon)-fittedX(p.y,p.z-epsilon))/(2*epsilon);
        const wy=(weight(p.y+epsilon,p.z)-weight(p.y-epsilon,p.z))/(2*epsilon),wz=(weight(p.y,p.z+epsilon)-weight(p.y,p.z-epsilon))/(2*epsilon);
        const ny=-n.y/Math.abs(n.x),nz=-n.z/Math.abs(n.x);
        v[positionIndex][0]=side*(Math.abs(p.x)+w*delta);
        v[normalIndex]=new T.Vector3(side,-((1-w)*ny+w*dy+wy*delta),-((1-w)*nz+w*dz+wz*delta)).normalize().toArray();
        changed++;maxDisplacement=Math.max(maxDisplacement,Math.abs(w*delta));
      }
    }
    v.forEach((values,i)=>output[i].push(...values));
  };
  const tessellate=(triangle,depth=0)=>{
    // Decide from the edge alone so both adjacent faces use identical rows.
    // Include the adjoining returns, even when their normals face inward.
    const mids=triangle.map((a,j)=>{
      const b=triangle[(j+1)%3],m=midpoint(a,b);
      return depth<10&&point(a).distanceTo(point(b))>.045?m:null;
    }),count=mids.filter(Boolean).length;
    if(!count){triangle.forEach(emit);return;}
    const [a,b,c]=triangle,[ab,bc,ca]=mids;
    if(count===3){for(const face of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])tessellate(face,depth+1);}
    else{
      const start=count===1?mids.findIndex(Boolean):mids.findIndex((m,j)=>m&&mids[(j+1)%3]);
      const a=triangle[start],b=triangle[(start+1)%3],c=triangle[(start+2)%3],ab=mids[start],bc=mids[(start+1)%3];
      for(const face of count===1?[[a,ab,c],[ab,b,c]]:[[a,ab,c],[ab,bc,c],[ab,b,bc]])tessellate(face,depth+1);
    }
  };
  for(let i=0;i<raw.getAttribute('position').count;i+=3)tessellate([vertex(i),vertex(i+1),vertex(i+2)]);
  const result=new T.BufferGeometry();
  names.forEach((name,i)=>result.setAttribute(name,new T.BufferAttribute(new Float32Array(output[i]),attributes[i].itemSize)));
  result.userData={samples,changed,maxDisplacement};raw.dispose();return result;
}

export function sourceCarFrame(doc){
  const bounds=new T.Box3(),point=new T.Vector3();
  for(const node of doc.getRoot().listNodes()){
    const matrix=new T.Matrix4().fromArray(node.getWorldMatrix());
    for(const p of node.getMesh()?.listPrimitives()??[]){const positions=p.getAttribute('POSITION');for(let i=0;i<positions.getCount();i++)bounds.expandByPoint(point.fromArray(positions.getArray(),i*3).applyMatrix4(matrix));}
  }
  const scale=4.479/(bounds.max.z-bounds.min.z);
  return new T.Matrix4().compose(new T.Vector3(0,-.62-bounds.min.y*scale,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(scale));
}

export function fairRearDoorPrimitive(doc,buffer,node,primitive,frame){
  const matrix=frame.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())),geometry=new T.BufferGeometry();
  const semantics=primitive.listSemantics().filter(s=>s!=='TANGENT'),names=semantics.map(s=>({POSITION:'position',NORMAL:'normal'}[s]??s));
  semantics.forEach((s,i)=>{const a=primitive.getAttribute(s);geometry.setAttribute(names[i],new T.BufferAttribute(new Float32Array(a.getArray()),a.getElementSize()));});
  if(primitive.getIndices())geometry.setIndex(Array.from(primitive.getIndices().getArray()));
  // Use the same geometric weld as the source smoothing fans before splitting
  // edges: UV duplicates can otherwise choose slightly different midpoints.
  const sourcePositions=geometry.getAttribute('position'),sourcePoints=new Map();
  for(let i=0;i<sourcePositions.count;i++){
    const point=new T.Vector3().fromBufferAttribute(sourcePositions,i),key=point.toArray().map(x=>Math.round(x*1e6)).join(',');
    if(!sourcePoints.has(key))sourcePoints.set(key,point);const shared=sourcePoints.get(key);sourcePositions.setXYZ(i,shared.x,shared.y,shared.z);
  }
  geometry.applyMatrix4(matrix);const fitted=fairRearDoorGeometry(geometry);fitted.applyMatrix4(matrix.clone().invert());
  // Interpolation on opposite sides of a UV seam can differ in its last float
  // bits. Weld those positions and nearly identical normals before decimation,
  // keeping genuinely sharp source smoothing fans separate.
  const positions=fitted.getAttribute('position'),normals=fitted.getAttribute('normal'),shared=new Map();
  for(let i=0;i<positions.count;i++){
    const p=new T.Vector3().fromBufferAttribute(positions,i),n=new T.Vector3().fromBufferAttribute(normals,i).normalize(),key=p.toArray().map(x=>Math.round(x*1e6)).join(',');
    const entries=shared.get(key)??[];const entry=entries.find(entry=>entry.normal.distanceTo(n)<.01);
    if(entry){entry.indices.push(i);entry.sum.add(n);}
    else entries.push({point:p,normal:n,sum:n.clone(),indices:[i]});
    shared.set(key,entries);
  }
  for(const entries of shared.values())for(const entry of entries){entry.sum.normalize();for(const i of entry.indices){positions.setXYZ(i,entry.point.x,entry.point.y,entry.point.z);normals.setXYZ(i,entry.sum.x,entry.sum.y,entry.sum.z);}}
  semantics.forEach((s,i)=>primitive.setAttribute(s,doc.createAccessor().setType(primitive.getAttribute(s).getType()).setArray(new Float32Array(fitted.getAttribute(names[i]).array)).setBuffer(buffer)));
  primitive.setIndices(null);primitive.setAttribute('TANGENT',null);geometry.dispose();fitted.dispose();
}
