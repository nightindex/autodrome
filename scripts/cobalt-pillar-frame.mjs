import * as T from 'three';

/** Clear obsolete donor returns inside the fitted windscreen aperture and
 * extend the two glass faces beneath the continuous pillar moulding. */
export function fitPillarFrameOpening({doc,buffer,nodes,worldPoint}){
  let removedFrameFragments=0,fittedGlassVertices=0;
  for(const node of nodes){
    const frame=/^(chassis_primary|chassis_door|interior_1)/.test(node.getName()),glassNode=/^windscreen/.test(node.getName());
    if(!frame&&!glassNode)continue;
    for(const primitive of node.getMesh()?.listPrimitives()??[]){
      const material=primitive.getMaterial()?.getName(),glass=glassNode&&material==='COBALT_Windshield';
      if(!glass&&!(frame&&['COBALT_Headliner','COBALT_Rubber','bump_front_ok.014'].includes(material)))continue;
      const position=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL');
      if(!glass){
        const attributes=primitive.listSemantics().map(semantic=>({semantic,a:primitive.getAttribute(semantic)})),arrays=attributes.map(()=>[]);
        const ix=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i);
        const opening=p=>{
          const bottom=.30+.04*T.MathUtils.smoothstep(Math.abs(p.x),.45,.72),pillar=.84-.5*p.z;
          const edge=.5*(bottom+pillar+Math.sqrt((bottom-pillar)**2+.008**2));
          return p.y-edge;
        };
        const fields=[p=>p.y-.26,p=>.56-p.y,p=>p.z-.70,p=>1.30-p.z,p=>Math.abs(p.x)-.50,p=>.78-Math.abs(p.x),opening];
        const vertex=i=>({p:worldPoint(node,position,i),values:attributes.map(({a})=>Array.from(a.getArray().slice(i*a.getElementSize(),(i+1)*a.getElementSize())))});
        const clip=(polygon,field,inside)=>{
          if(!polygon.length)return [];const result=[],sign=inside?1:-1;let a=polygon.at(-1),da=field(a.p)*sign;
          for(const b of polygon){const db=field(b.p)*sign;
            if((da>=0)!==(db>=0)){
              let low=0,high=1;for(let j=0;j<24;j++){const t=(low+high)/2;if((field(a.p.clone().lerp(b.p,t))*sign>=0)===(da>=0))low=t;else high=t;}
              const t=(low+high)/2;result.push({p:a.p.clone().lerp(b.p,t),values:a.values.map((v,j)=>v.map((n,k)=>T.MathUtils.lerp(n,b.values[j][k],t)))});
            }
            if(db>=0)result.push(b);a=b;da=db;
          }return result;
        };
        const add=polygon=>{for(let j=1;j<polygon.length-1;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]])v.values.forEach((a,k)=>arrays[k].push(...a));};
        let changed=0;
        const process=triangle=>{
          if(fields.some(field=>triangle.every(v=>field(v.p)<0))){add(triangle);return;}
          let candidate=triangle;
          for(const field of fields){add(clip(candidate,field,false));candidate=clip(candidate,field,true);}
          if(candidate.length>=3)changed+=candidate.length-2;
        };
        for(let i=0;i<ix.length;i+=3)process([0,1,2].map(j=>vertex(ix[i+j])));
        if(changed){
          attributes.forEach(({semantic,a},i)=>{
            if(semantic==='NORMAL')for(let j=0;j<arrays[i].length;j+=3)new T.Vector3().fromArray(arrays[i],j).normalize().toArray(arrays[i],j);
            primitive.setAttribute(semantic,a.clone().setArray(new (a.getArray().constructor)(arrays[i])).setBuffer(buffer));
          });primitive.setIndices(null);removedFrameFragments+=changed;
        }
        continue;
      }
      const origin=worldPoint(node,{getArray:()=>new Float32Array(3)},0);
      const basis=[0,1,2].map(axis=>{const a=new Float32Array(3);a[axis]=1;return worldPoint(node,{getArray:()=>a},0).sub(origin);});
      const transform=new T.Matrix4().makeBasis(...basis).setPosition(origin),inverse=transform.clone().invert();
      const toCarNormal=new T.Matrix3().getNormalMatrix(transform),toSourceNormal=new T.Matrix3().setFromMatrix4(transform).transpose();
      const values=new Float32Array(position.getArray()),normals=normal?new Float32Array(normal.getArray()):null;
      const warp=p=>{
        const w=T.MathUtils.smoothstep(Math.abs(p.x),.45,.64)*T.MathUtils.smoothstep(p.y,.27,.35)*(1-T.MathUtils.smoothstep(p.y,.50,.56));
        // Continue within the windscreen's sloping plane. Moving only Z would
        // pull blended glass in front of the opaque cowl and leave grey patches.
        return p.clone().add(new T.Vector3(Math.sign(p.x)*.045,.0225,-.045).multiplyScalar(w));
      };
      const ix=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i);
      let changed=0;
      for(const i of new Set(ix)){
        const p=worldPoint(node,position,i),q=warp(p);if(q.distanceToSquared(p)<1e-18)continue;
        q.applyMatrix4(inverse).toArray(values,i*3);changed++;
        if(normals){
          const epsilon=.00001,columns=[0,1,2].map(axis=>{const delta=new T.Vector3();delta.setComponent(axis,epsilon);return warp(p.clone().add(delta)).sub(warp(p.clone().sub(delta))).multiplyScalar(.5/epsilon);});
          const jacobian=new T.Matrix4().makeBasis(...columns),normalWarp=new T.Matrix3().getNormalMatrix(jacobian);
          new T.Vector3().fromArray(normals,i*3).applyMatrix3(toCarNormal).applyMatrix3(normalWarp).applyMatrix3(toSourceNormal).normalize().toArray(normals,i*3);
        }
      }
      if(!changed)continue;
      primitive.setAttribute('POSITION',position.clone().setArray(values).setBuffer(buffer));
      if(normals)primitive.setAttribute('NORMAL',normal.clone().setArray(normals).setBuffer(buffer));
      primitive.setAttribute('TANGENT',null);
      if(glass)fittedGlassVertices+=changed;
    }
  }
  // Close the cabin at the actual pane, as in the supplied interior photo.
  // The donor's wide upright black return is replaced by a shallow dashboard
  // cowl and a narrow seal, rather than exposing the painted outer scuttle.
  const makeSupport=(node,primitive)=>{
    const p=primitive.getAttribute('POSITION'),values=[];
    for(let i=0;i<p.getCount();i++)values.push(...worldPoint(node,p,i).toArray());
    const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(values,3));
    const n=primitive.getAttribute('NORMAL');
    if(n){
      const origin=worldPoint(node,{getArray:()=>new Float32Array(3)},0),basis=[0,1,2].map(axis=>{const a=new Float32Array(3);a[axis]=1;return worldPoint(node,{getArray:()=>a},0).sub(origin);});
      const normalMatrix=new T.Matrix3().getNormalMatrix(new T.Matrix4().makeBasis(...basis)),normals=[];
      for(let i=0;i<n.getCount();i++)normals.push(...new T.Vector3().fromArray(n.getArray(),i*3).applyMatrix3(normalMatrix).normalize().toArray());
      g.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
    }
    if(primitive.getIndices())g.setIndex(Array.from(primitive.getIndices().getArray()));
    const m=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));m.updateMatrixWorld();return m;
  };
  const panes=[],dash=[];
  for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
    if(/^windscreen/.test(node.getName())&&primitive.getMaterial()?.getName()==='COBALT_Windshield')panes.push(makeSupport(node,primitive));
    if(node.getName()==='COBALT_MouldedDashboard')dash.push(makeSupport(node,primitive));
  }
  const strips=Array.from({length:57},(_,i)=>{
    const x=-.695+1.39*i/56,point=new T.Raycaster(new T.Vector3(x,.345,.8),new T.Vector3(0,0,1),0,.7).intersectObjects(panes)[0]?.point;
    if(!point)throw new Error(`Missing windscreen cowl support at ${x}`);
    const rear=point.clone();rear.z-=.13;
    const support=new T.Raycaster(new T.Vector3(T.MathUtils.clamp(x,-.686,.686),.6,rear.z),new T.Vector3(0,-1,0),0,.5).intersectObjects(dash)[0];
    if(!support)throw new Error(`Missing dashboard cowl support at ${x}`);
    rear.y=support.point.y+.0001;point.z-=.0015;
    return {rear,front:point,normal:support.normal??support.face.normal};
  });
  const authored=doc.getRoot().listNodes().find(n=>n.getName()==='COBALT_AuthoredDetails');
  const emit=(geometry,material,name)=>{
    const primitive=doc.createPrimitive().setMaterial(material);
    for(const [key,semantic]of [['position','POSITION'],['normal','NORMAL']])primitive.setAttribute(semantic,doc.createAccessor().setType('VEC3').setArray(new Float32Array(geometry.getAttribute(key).array)).setBuffer(buffer));
    primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(geometry.index.array)).setBuffer(buffer));
    authored.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)));geometry.dispose();
  };
  const positions=[],indices=[];
  for(const {rear,front,normal}of strips)for(let j=0;j<=4;j++){
    const t=j/4,p=rear.clone().lerp(front,t),tangent=-normal.z/Math.max(.1,normal.y)*(front.z-rear.z);
    p.y=(2*t**3-3*t*t+1)*rear.y+(t**3-2*t*t+t)*tangent+(-2*t**3+3*t*t)*front.y;positions.push(...p.toArray());
  }
  for(let i=0;i<strips.length-1;i++)for(let j=0;j<4;j++){const a=i*5+j;indices.push(a,a+1,a+5,a+1,a+6,a+5);}
  const cowl=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)).setIndex(indices);cowl.computeVertexNormals();
  strips.forEach(({normal},i)=>cowl.getAttribute('normal').setXYZ(i*5,normal.x,normal.y,normal.z));
  const cowlSupport=new T.Mesh(cowl,new T.MeshBasicMaterial({side:T.DoubleSide}));cowlSupport.updateMatrixWorld();
  // Keep the existing demister slots exposed on the fitted cowl surface.
  for(const node of doc.getRoot().listNodes().filter(n=>/^COBALT_DefrostGrille_/.test(n.getName())))for(const primitive of node.getMesh()?.listPrimitives()??[]){
    const p=primitive.getAttribute('POSITION'),values=new Float32Array(p.getArray()),origin=worldPoint(node,{getArray:()=>new Float32Array(3)},0);
    const basis=[0,1,2].map(axis=>{const a=new Float32Array(3);a[axis]=1;return worldPoint(node,{getArray:()=>a},0).sub(origin);}),inverse=new T.Matrix4().makeBasis(...basis).setPosition(origin).invert();
    for(let i=0;i<p.getCount();i++){
      const point=worldPoint(node,p,i),hit=new T.Raycaster(new T.Vector3(point.x,.6,point.z),new T.Vector3(0,-1,0),0,.5).intersectObject(cowlSupport)[0];
      if(hit&&hit.point.y>point.y){point.y=hit.point.y+.0008;point.applyMatrix4(inverse).toArray(values,i*3);}
    }
    primitive.setAttribute('POSITION',p.clone().setArray(values).setBuffer(buffer));
  }
  cowlSupport.material.dispose();
  emit(cowl,doc.getRoot().listMaterials().find(m=>m.getName()==='COBALT_Dashboard'),'COBALT_MouldedDashboardCowl');
  const sealPositions=[],sealIndices=[];
  for(const {front}of strips){sealPositions.push(front.x,front.y,front.z,front.x,front.y+.004,front.z-.008);}
  for(let i=0;i<strips.length-1;i++){const a=i*2;sealIndices.push(a,a+1,a+2,a+1,a+3,a+2);}
  const seal=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(sealPositions,3)).setIndex(sealIndices);seal.computeVertexNormals();
  emit(seal,doc.getRoot().listMaterials().find(m=>m.getName()==='COBALT_CabinWindowSeals'),'COBALT_WindscreenLowerSeal');
  for(const m of [...panes,...dash]){m.geometry.dispose();m.material.dispose();}
  return {removedFrameFragments,fittedGlassVertices};
}
