import * as T from 'three';

/** Rounded moulded neck, with a recessed folding joint, fitted between the
 * factory sail and shell. All sections remain behind the moving glass cavity. */
export function buildSideMirrorMounts({emit,material}){
  const rubber=material('COBALT_SideMirrorMount',0x282b29,0,.82);
  const horizontal=new T.Vector3(.88,0,-.48).normalize(),normal=new T.Vector3(-.48,0,-.88).normalize();
  // Perimeter coordinate, lower/upper edge, and front/back depth relative to
  // the source mirror plane. Glass is at depth .988, cavity at 1.024.
  const sections=[
    {u:.290,bottom:.335,top:.375,front:1.045,back:1.075,r:.006},
    {u:.304,bottom:.333,top:.375,front:1.039,back:1.075,r:.007},
    {u:.309,bottom:.332,top:.375,front:1.037,back:1.075,r:.007},
    {u:.310,bottom:.333,top:.3735,front:1.0385,back:1.0735,r:.006},
    {u:.312,bottom:.332,top:.3745,front:1.0385,back:1.0735,r:.006},
    {u:.313,bottom:.330,top:.377,front:1.037,back:1.075,r:.007},
    {u:.343,bottom:.321,top:.383,front:1.030,back:1.074,r:.009},
    {u:.380,bottom:.318,top:.390,front:1.028,back:1.065,r:.010},
  ];
  for(const side of [1,-1]){
    const positions=[],indices=[];
    for(const s of sections){
      // Three samples per corner produce real curved bevels; flat faces keep
      // their own planar normals rather than borrowing a cap's normal.
      const r=s.r,outline=[];
      for(const [y,depth,start]of [[s.top-r,s.front+r,Math.PI],[s.top-r,s.back-r,Math.PI/2],[s.bottom+r,s.back-r,0],[s.bottom+r,s.front+r,-Math.PI/2]]){
        for(let j=0;j<3;j++){const angle=start-j*Math.PI/4;outline.push([y+Math.sin(angle)*r,depth+Math.cos(angle)*r]);}
      }
      for(const [y,depth]of outline){const p=horizontal.clone().multiplyScalar(s.u).addScaledVector(normal,-depth);positions.push(p.x*side,y,p.z);}
    }
    const ring=12;
    for(let section=0;section+1<sections.length;section++)for(let i=0;i<ring;i++){
      const a=section*ring+i,b=section*ring+(i+1)%ring,c=b+ring,d=a+ring;indices.push(a,b,c,a,c,d);
    }
    // Caps use separate vertices to keep the rounded side normals smooth.
    const cap=positions.length/3;positions.push(...positions.slice(0,ring*3),...positions.slice(-ring*3));
    for(let i=1;i<ring-1;i++){indices.push(cap,cap+i+1,cap+i);indices.push(cap+ring,cap+ring+i,cap+ring+i+1);}
    // The mirrored part changes handedness. Keep outward faces on both sides.
    if(side<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    emit(geometry,rubber,`COBALT_SideMirrorMount_${side>0?'Left':'Right'}`);
    geometry.dispose();
  }
}

/** Replace the disconnected source casing and cap, retaining the original
 * door sail, glass and actuator cavity. Shared surface normals and clipped
 * material boundaries prevent overlapping sheets and jagged paint seams. */
export function rebuildSideMirrorShells({doc,buffer,worldPoint,emit}){
  const finish=doc.getRoot().listMaterials().find(m=>m.getName()==='COBALT_SideMirrorHousing');
  const paint=doc.getRoot().listMaterials().find(m=>m.getName()==='Realistic_Car_Paint');
  const cavity=doc.getRoot().listMaterials().find(m=>m.getName()==='COBALT_SideMirrorCavity');
  for(const side of [1,-1]){
    const label=side>0?'Left':'Right',prefix=side>0?'door_lf':'door_rf';
    const h=new T.Vector3(side*.88,0,-.48).normalize(),depth=new T.Vector3(side*.48,0,.88).normalize();
    const nodes=doc.getRoot().listNodes().filter(n=>n.getName().startsWith(prefix));
    let pane;
    for(const node of nodes)for(const primitive of node.getMesh()?.listPrimitives()??[]){
      const name=primitive.getMaterial()?.getName();
      if(name===`COBALT_SideMirror${label}`){pane={node,primitive};continue;}
      if(name==='COBALT_SideMirrorCavity'){node.getMesh().removePrimitive(primitive);primitive.dispose();continue;}
      if(!['Realistic_Car_Paint','COBALT_SideMirrorHousing','COBALT_Headliner','COBALT_Rubber'].includes(name))continue;
      const a=primitive.getAttribute('POSITION'),ids=primitive.getIndices()?.getArray()??Uint32Array.from({length:a.getCount()},(_,i)=>i);
      const points=Array.from({length:a.getCount()},(_,i)=>worldPoint(node,a,i)),keys=points.map(v=>v.toArray().map(x=>Math.round(x*1e5)).join(',')),parents=new Map();
      const find=k=>{if(!parents.has(k))parents.set(k,k);let root=k;while(parents.get(root)!==root)root=parents.get(root);while(k!==root){const next=parents.get(k);parents.set(k,root);k=next;}return root;};
      for(let i=0;i<ids.length;i+=3)for(let j=1;j<3;j++)parents.set(find(keys[ids[i+j]]),find(keys[ids[i]]));
      const bounds=new Map();
      for(const i of ids){const key=find(keys[i]),box=bounds.get(key)??new T.Box3();box.expandByPoint(points[i]);bounds.set(key,box);}
      const removed=new Set([...bounds].filter(([,b])=>{
        const inboard=side>0?b.min.x:-b.max.x;
        return inboard>.75&&b.min.y>.30&&b.max.y<.48&&b.min.z>.59&&b.max.z<.83;
      }).map(([key])=>key)),kept=[];
      for(let i=0;i<ids.length;i+=3)if(!removed.has(find(keys[ids[i]])))kept.push(ids[i],ids[i+1],ids[i+2]);
      if(kept.length)primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(buffer));
      else{node.getMesh().removePrimitive(primitive);primitive.dispose();}
    }
    if(!pane)throw new Error(`Missing ${label} mirror glass`);
    const p=pane.primitive.getAttribute('POSITION'),points=Array.from({length:p.getCount()},(_,i)=>{const v=worldPoint(pane.node,p,i);return [h.dot(v),v.y];}).sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
    const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
    const half=list=>{const out=[];for(const v of list){while(out.length>1&&cross(out.at(-2),out.at(-1),v)<=0)out.pop();out.push(v);}return out;};
    const lower=half(points),upper=half([...points].reverse());lower.pop();upper.pop();const hull=lower.concat(upper);
    const expanded=hull.map(([u,y],i)=>{
      const before=hull[(i+hull.length-1)%hull.length],after=hull[(i+1)%hull.length];
      const a=new T.Vector2(y-before[1],before[0]-u).normalize(),b=new T.Vector2(after[1]-y,u-after[0]).normalize();
      const offset=a.clone().add(b).multiplyScalar(.012/(1+a.dot(b)));
      return new T.Vector3(u+offset.x,y+offset.y,0);
    });
    // Project the aperture onto the backing plane from the driver eye. A
    // simple parallel copy exposes the road below the far mirror's glass.
    const eye=new T.Vector3(.285,.465,.18),eyeU=h.dot(eye),eyeDepth=depth.dot(eye),projection=(1.024-eyeDepth)/(.988-eyeDepth);
    for(const point of expanded){point.x=eyeU+(point.x-eyeU)*projection;point.y=eye.y+(point.y-eye.y)*projection;}
    const curve=new T.CatmullRomCurve3(expanded,true,'centripetal'),outline=curve.getSpacedPoints(64).slice(0,64);
    const box=new T.Box3().setFromPoints(outline),center=box.getCenter(new T.Vector3()),positions=[],indices=[];
    // The backing and case share a rim. The earlier projected backing had
    // corners protruding through the painted cap when viewed from the cabin.
    const backing=[center,...outline].map(point=>{
      const v=h.clone().multiplyScalar(center.x+(point.x-center.x)*1.011-.003).addScaledVector(depth,1.024);
      return new T.Vector3(v.x,point.y,v.z);
    }),backingIndices=[];
    for(let i=0;i<outline.length;i++)backingIndices.push(0,1+(i+1)%outline.length,1+i);
    if(side<0)for(let i=0;i<backingIndices.length;i+=3)[backingIndices[i+1],backingIndices[i+2]]=[backingIndices[i+2],backingIndices[i+1]];
    const backingGeometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(backing.flatMap(v=>v.toArray()),3)).setIndex(backingIndices);backingGeometry.computeVertexNormals();
    emit(backingGeometry,cavity,`COBALT_SideMirrorCavity_${label}`);backingGeometry.dispose();
    const profiles=[
      [1.016,1,0,0],[1.027,1.015,-.004,0],[1.049,1.025,-.015,.001],
      [1.068,.94,-.024,.003],[1.081,.73,-.027,.004],[1.086,.38,-.026,.005],
    ];
    for(const [d,scale,uShift,yShift]of profiles)for(const point of outline){
      const u=center.x+(point.x-center.x)*scale+uShift,y=center.y+(point.y-center.y)*scale+yShift;
      const v=h.clone().multiplyScalar(u).addScaledVector(depth,d);positions.push(v.x,y,v.z);
    }
    const ring=outline.length;
    for(let j=0;j<profiles.length-1;j++)for(let i=0;i<ring;i++){
      const a=j*ring+i,b=j*ring+(i+1)%ring,c=b+ring,d=a+ring;indices.push(a,b,c,a,c,d);
    }
    const end=h.clone().multiplyScalar(center.x-.024).addScaledVector(depth,1.087),cap=positions.length/3;positions.push(end.x,center.y+.005,end.z);
    for(let i=0;i<ring;i++)indices.push((profiles.length-1)*ring+i,(profiles.length-1)*ring+(i+1)%ring,cap);
    if(side<0)for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    const whole=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)).setIndex(indices);whole.computeVertexNormals();
    const normal=whole.getAttribute('normal'),black=[],white=[];
    const clip=(polygon,distance,inside)=>{
      if(!polygon.length)return [];const out=[];let a=polygon.at(-1),da=distance(a)*(inside?1:-1);
      for(const b of polygon){const db=distance(b)*(inside?1:-1);if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize()});}if(db>=0)out.push(b);a=b;da=db;}return out;
    };
    const append=(list,polygon)=>{for(let i=1;i<polygon.length-1;i++){
      const [a,b,c]=[polygon[0],polygon[i],polygon[i+1]];
      if(b.p.clone().sub(a.p).cross(c.p.clone().sub(a.p)).lengthSq()>1e-18)list.push(a,b,c);
    }};
    for(let i=0;i<indices.length;i+=3){
      const triangle=[0,1,2].map(j=>({p:new T.Vector3().fromArray(positions,indices[i+j]*3),n:new T.Vector3().fromBufferAttribute(normal,indices[i+j])}));
      const front=v=>depth.dot(v.p)-1.027,seam=v=>v.p.y-.374;
      append(black,clip(triangle,front,false));const outer=clip(triangle,front,true);
      append(black,clip(outer,seam,false));append(white,clip(outer,seam,true));
    }
    for(const [vertices,mat,name]of [[black,finish,'Shell'],[white,paint,'Cap']]){
      const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(vertices.flatMap(v=>v.p.toArray()),3)).setAttribute('normal',new T.Float32BufferAttribute(vertices.flatMap(v=>v.n.toArray()),3));
      emit(g,mat,`COBALT_SideMirror${name}_${label}`);g.dispose();
    }
    whole.dispose();
  }
}
