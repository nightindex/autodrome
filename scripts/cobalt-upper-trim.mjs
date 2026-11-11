import * as T from 'three';
import {mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {weldPrimitive,simplifyPrimitive} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';

/** Replace the overlapping source roof/pillar sheets with a shared moulding
 * boundary. Coordinates are in the same metre frame as the authored cabin. */
export function buildUpperCabinTrim({doc,buffer,nodes,worldPoint:sourceWorldPoint,lining,seam,weatherstrip,put}){
  const pointCache=new WeakMap();
  const worldPoint=(node,accessor,index)=>{
    let accessors=pointCache.get(node);if(!accessors){accessors=new WeakMap();pointCache.set(node,accessors);}
    let points=accessors.get(accessor);if(!points){points=new Map();accessors.set(accessor,points);}
    if(!points.has(index))points.set(index,sourceWorldPoint(node,accessor,index));
    return points.get(index);
  };
  const level=.55,back=-.15,sections=[];
  const key=p=>p.toArray().map(n=>Math.round(n*1e6)).join(',');
  // Read the real upper edge of the cabin-facing windscreen sheet. The roof's
  // straight front edge needs a fitted return at its curved outer corners.
  const glazingTop=[];
  for(const node of nodes.filter(node=>/^windscreen/.test(node.getName())))for(const primitive of node.getMesh()?.listPrimitives()??[]){
    if(primitive.getMaterial()?.getName()!=='COBALT_Windshield')continue;
    const p=primitive.getAttribute('POSITION'),ix=primitive.getIndices()?.getArray()??Uint32Array.from({length:p.getCount()},(_,i)=>i),points=new Map(),edges=new Map();
    for(let i=0;i<ix.length;i+=3){
      const triangle=[0,1,2].map(j=>worldPoint(node,p,ix[i+j])),normal=triangle[1].clone().sub(triangle[0]).cross(triangle[2].clone().sub(triangle[0])).normalize();
      if(normal.y>-.6||normal.z>-.2)continue;
      const keys=triangle.map(v=>{const k=key(v);points.set(k,v);return k;});
      for(let j=0;j<3;j++){const k=[keys[j],keys[(j+1)%3]].sort().join('|');edges.set(k,(edges.get(k)??0)+1);}
    }
    const boundary=new Set([...edges].filter(([,count])=>count===1).flatMap(([edge])=>edge.split('|')));
    for(const k of boundary){const p=points.get(k);if(p.y>.66&&p.z<.5)glazingTop.push(p);}
  }
  glazingTop.sort((a,b)=>a.x-b.x);if(glazingTop.length<8)throw new Error('Missing upper windscreen contour');
  const ceilingTriangles=[];
  for(const node of nodes)for(const primitive of node.getMesh()?.listPrimitives()??[]){
    if(primitive.getMaterial()!==lining)continue;
    const p=primitive.getAttribute('POSITION'),ix=primitive.getIndices()?.getArray()??Uint32Array.from({length:p.getCount()},(_,i)=>i);
    for(let i=0;i<ix.length;i+=3){const points=[0,1,2].map(j=>worldPoint(node,p,ix[i+j]));if(points.some(p=>p.z>=back-.001)&&points.some(p=>p.z<=back)&&points.every(p=>p.y>.55))ceilingTriangles.push(...points.flatMap(p=>p.toArray()));}
  }
  const ceilingGeometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(ceilingTriangles,3)),ceilingMaterial=new T.MeshBasicMaterial({side:T.DoubleSide}),ceiling=new T.Mesh(ceilingGeometry,ceilingMaterial);ceiling.updateMatrixWorld();
  const rearLevels=Array.from({length:25},(_,i)=>{const x=-.62+1.24*i/24,ray=new T.Raycaster(new T.Vector3(x,.60,back-.000001),new T.Vector3(0,1,0),0,.20);return ray.intersectObject(ceiling).find(hit=>hit.point.y>.66)?.point.y;});
  ceilingGeometry.dispose();ceilingMaterial.dispose();
  for(const side of [-1,1]){
    const points=new Map(),edges=new Map();
    for(const node of nodes.filter(n=>/^interior_interior/.test(n.getName())))for(const primitive of node.getMesh()?.listPrimitives()??[]){
      if(primitive.getMaterial()!==lining)continue;
      const position=primitive.getAttribute('POSITION'),normals=primitive.getAttribute('NORMAL'),normalMatrix=new T.Matrix3().getNormalMatrix(new T.Matrix4().fromArray(node.getWorldMatrix())),ix=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i);
      for(let i=0;i<ix.length;i+=3){
        const triangle=[0,1,2].map(j=>worldPoint(node,position,ix[i+j])),hits=[];
        for(let j=0;j<3;j++){
          const a=triangle[j],b=triangle[(j+1)%3];if((a.y>=level)===(b.y>=level))continue;
          const t=(level-a.y)/(b.y-a.y),p=a.clone().lerp(b,t);
          if(normals){const n=new T.Vector3().fromArray(normals.getArray(),ix[i+j]*3).lerp(new T.Vector3().fromArray(normals.getArray(),ix[i+(j+1)%3]*3),t).applyMatrix3(normalMatrix).normalize();n.x*=-1;n.z*=-1;p.sourceNormal=n;}
          if(side*p.x>.5&&p.z>.3&&p.z<.8)hits.push(p);
        }
        if(hits.length!==2)continue;
        const keys=hits.map(key);if(keys[0]===keys[1])continue;
        hits.forEach((p,j)=>{points.set(keys[j],p);const adjacent=edges.get(keys[j])??new Set();adjacent.add(keys[1-j]);edges.set(keys[j],adjacent);});
      }
    }
    const ends=[...edges.keys()].filter(k=>edges.get(k).size===1).sort((a,b)=>side*(points.get(b).x-points.get(a).x));
    let next=ends[0];const section=[],seen=new Set();
    while(next&&!seen.has(next)){seen.add(next);section.push(points.get(next));next=[...edges.get(next)].find(k=>!seen.has(k));}
    if(section.length<4)throw new Error(`Missing upper pillar section ${side}`);
    sections.push({side,section});
  }
  // Clip all layers against identical planes; selecting whole triangles leaves
  // the diagonal shards visible in the original roof-to-pillar joint.
  for(const node of nodes)for(const primitive of [...node.getMesh()?.listPrimitives()??[]]){
    if(primitive.getMaterial()!==lining)continue;
    const attributes=primitive.listSemantics().map(semantic=>({semantic,a:primitive.getAttribute(semantic)})),position=primitive.getAttribute('POSITION');
    const ix=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i),arrays=attributes.map(()=>[]);
    const clip=(polygon,field,inside)=>{
      if(!polygon.length)return [];const result=[],sign=inside?1:-1;let a=polygon.at(-1),da=field(a.p)*sign;
      for(const b of polygon){const db=field(b.p)*sign;
        if((da>=0)!==(db>=0)){const t=da/(da-db);result.push({p:a.p.clone().lerp(b.p,t),values:a.values.map((v,j)=>v.map((n,k)=>T.MathUtils.lerp(n,b.values[j][k],t)))});}
        if(db>=0)result.push(b);a=b;da=db;
      }return result;
    };
    const add=polygon=>{for(let j=1;j<polygon.length-1;j++)for(const v of [polygon[0],polygon[j],polygon[j+1]])v.values.forEach((a,k)=>arrays[k].push(...a));};
    for(let i=0;i<ix.length;i+=3){
      const triangle=[0,1,2].map(j=>{const index=ix[i+j];return {p:worldPoint(node,position,index),values:attributes.map(({a})=>Array.from(a.getArray().slice(index*a.getElementSize(),(index+1)*a.getElementSize())))};});
      add(clip(triangle,p=>p.y-level,false));add(clip(clip(triangle,p=>p.y-level,true),p=>p.z-back,false));
    }
    if(arrays[0].length){const part=doc.createPrimitive().setMaterial(lining);attributes.forEach(({semantic,a},i)=>part.setAttribute(semantic,doc.createAccessor().setType(a.getType()).setArray(new Float32Array(arrays[i])).setBuffer(buffer)));node.getMesh().addPrimitive(part);}
    node.getMesh().removePrimitive(primitive);primitive.dispose();
  }
  const roofY=(x,z)=>.748-.038*(x/.60)**2-.016*T.MathUtils.clamp((z-back)/.60,0,1);
  const topSections=[],cornerSections=[];
  for(const {side,section}of sections){
    const a=section[0],b=section.reduce((p,q)=>side*q.x<side*p.x?q:p,a),d=section.at(-1),c=d.clone().add(new T.Vector3(0,0,-.018));
    const outsideDoor=new T.Vector3(side*.645,level,.485),outsideGlass=new T.Vector3(side*.625,level,.715);
    const curve=new T.CurvePath();
    const main=c.clone().sub(b).normalize(),lip=a.clone().sub(b).normalize(),r=.006;
    curve.add(new T.LineCurve3(outsideDoor,a));
    curve.add(new T.LineCurve3(a,b.clone().addScaledVector(lip,r)));
    curve.add(new T.QuadraticBezierCurve3(b.clone().addScaledVector(lip,r),b,b.clone().addScaledVector(main,r)));
    curve.add(new T.LineCurve3(b.clone().addScaledVector(main,r),c.clone().addScaledVector(main,-r)));
    curve.add(new T.QuadraticBezierCurve3(c.clone().addScaledVector(main,-r),c,c.clone().add(new T.Vector3(0,0,r))));
    curve.add(new T.LineCurve3(c.clone().add(new T.Vector3(0,0,r)),d));
    curve.add(new T.LineCurve3(d,outsideGlass));
    const original=new T.CurvePath(),originalPoints=[outsideDoor,...section,outsideGlass];
    outsideDoor.sourceNormal=a.sourceNormal;outsideGlass.sourceNormal=d.sourceNormal;
    for(let i=1;i<originalPoints.length;i++)original.add(new T.LineCurve3(originalPoints[i-1],originalPoints[i]));
    const lengths=curve.getCurveLengths(),total=curve.getLength();
    const samples=[...new Set([...Array.from({length:9},(_,i)=>i/8),...lengths.map(n=>n/total),...original.getCurveLengths().map(n=>n/original.getLength())])].sort((a,b)=>a-b);
    const surface=(u,v)=>{const p=original.getPoint(u).lerp(curve.getPoint(u),T.MathUtils.smoothstep(v,0,.4)),x=p.x-side*.034*v,z=p.z-.34*v;return new T.Vector3(x,T.MathUtils.lerp(level,roofY(x,z),v),z);};
    const top=samples.map(u=>surface(u,1));topSections.push(top);
    cornerSections.push({side,surface,total});
    const mesh=(start,end,material,name,rows)=>{
      const positions=[],indices=[],columns=samples.length;
      for(let row=0;row<=rows;row++)for(const u of samples)positions.push(...surface(u,T.MathUtils.lerp(start,end,row/rows)).toArray());
      for(let row=0;row<rows;row++)for(let c=0;c<columns-1;c++){const a=row*columns+c;for(const face of [[a,a+columns,a+1],[a+1,a+columns,a+columns+1]]){if(side>0)face.reverse();indices.push(...face);}}
      const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)).setIndex(indices);g.computeVertexNormals();
      const normals=g.getAttribute('normal'),spans=original.getCurveLengths();
      for(let row=0;row<=rows;row++)for(let column=0;column<columns;column++){
        const v=T.MathUtils.lerp(start,end,row/rows),blend=1-T.MathUtils.smoothstep(v,0,.30);if(!blend)continue;
        const length=samples[column]*original.getLength(),span=Math.max(0,spans.findIndex(end=>end>=length)),from=span?spans[span-1]:0;
        const a=originalPoints[span].sourceNormal,b=originalPoints[span+1].sourceNormal;if(!a||!b)continue;
        const source=a.clone().lerp(b,(length-from)/Math.max(1e-12,spans[span]-from)).normalize(),index=row*columns+column;
        const n=new T.Vector3().fromBufferAttribute(normals,index).lerp(source,blend).normalize();normals.setXYZ(index,n.x,n.y,n.z);
      }
      put(g,material,[0,0,0],[0,0,0],name);
      if(rows>1){
        const primitive=doc.getRoot().listNodes().find(node=>node.getName()===name).getMesh().listPrimitives()[0];weldPrimitive(primitive,{overwrite:true});
        const simplifier={simplify:(indices,positions,stride,target,error,flags)=>MeshoptSimplifier.simplifyWithAttributes(indices,positions,stride,primitive.getAttribute('NORMAL').getArray(),3,[.10,.10,.10],null,target,error,flags)};
        simplifyPrimitive(primitive,{simplifier,ratio:.5,error:.0005,lockBorder:true});
      }
    };
    mesh(0,.991,lining,`COBALT_UpperPillar_${side}`,6);
    mesh(.991,1,seam,`COBALT_UpperPillarJoint_${side}`,1);
    // Narrow black rubber reveals run along the glazing edges in the cabin
    // photographs. Keep these on the fitted surface rather than recolouring
    // entire frame triangles, which makes their borders visibly jagged.
    const ribbon=(rows,name)=>{
      const values=[];
      for(let i=1;i<rows.length;i++)for(const face of [[rows[i-1][0],rows[i][0],rows[i-1][1]],[rows[i-1][1],rows[i][0],rows[i][1]]]){
        if(side>0)face.reverse();for(const p of face)values.push(...p.toArray());
      }
      const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(values,3));g.computeVertexNormals();put(g,weatherstrip,[0,0,0],[0,0,0],name);
    };
    for(const edge of [0,1]){
      const rows=Array.from({length:9},(_,i)=>[edge===0?0:1-.006/total,edge===0?.006/total:1].map(u=>surface(u,i/8*(edge===1?.82:1)).add(new T.Vector3(-side*.001,0,-.001))));
      ribbon(rows,`COBALT_${edge===1?'Windscreen':'Door'}PillarSeal_${side}`);
    }
    // A returned edge covers the inner door rail below the roof. Without it
    // the outer painted window frame remains visible through a thin slit.
    const rear=new T.Vector3(side*.62,roofY(side*.62,back),back),front=top[0],lower=surface(0,.80),rearLower=new T.Vector3(side*.646,.66,back);
    const band=[rear,rearLower,front,front,rearLower,lower];if(side<0)band.reverse();
    const returnGeometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(band.flatMap(p=>p.toArray()),3));returnGeometry.computeVertexNormals();
    put(returnGeometry,lining,[0,0,0],[0,0,0],`COBALT_HeadlinerSideReturn_${side}`);
  }
  const [left,right]=topSections,outline=[new T.Vector2(-.62,back),new T.Vector2(.62,back),...right.map(p=>new T.Vector2(p.x,p.z)),new T.Vector2(0,.445),...left.toReversed().map(p=>new T.Vector2(p.x,p.z))];
  const shape=new T.Shape(outline),g=new T.ShapeGeometry(shape,1),positions=g.getAttribute('position');
  // Triangulate the shared contour and sample its gentle compound roof curve.
  const values=[],indices=g.index.array;
  const subdivide=(a,b,c,depth)=>{if(depth===0){for(const p of [a,b,c])values.push(p.x,roofY(p.x,p.y),p.y);return;}const ab=a.clone().lerp(b,.5),bc=b.clone().lerp(c,.5),ca=c.clone().lerp(a,.5);for(const face of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])subdivide(...face,depth-1);};
  for(let i=0;i<indices.length;i+=3)subdivide(...[0,1,2].map(j=>new T.Vector2().fromBufferAttribute(positions,indices[i+j])),1);
  const roof=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(values,3));roof.computeVertexNormals();put(roof,lining,[0,0,0],[0,0,0],'COBALT_FrontHeadliner');g.dispose();
  const roofSupport=new T.Mesh(roof,new T.MeshBasicMaterial({side:T.DoubleSide}));roofSupport.updateMatrixWorld();
  const onRoof=(x,z)=>new T.Raycaster(new T.Vector3(x,.60,z-.00001),new T.Vector3(0,1,0),0,.25).intersectObject(roofSupport)[0]?.point.y??roofY(x,z);
  // End the header at the top-to-side tangent of the glazing contour. Taking
  // it around the downward side arc makes a hooked black tip at the pillar.
  const leftCorner=glazingTop.filter(p=>p.x<0).reduce((a,b)=>b.z<a.z?b:a),rightCorner=glazingTop.filter(p=>p.x>0).reduce((a,b)=>b.z<a.z?b:a);
  const glassAt=x=>{
    x=T.MathUtils.clamp(x,leftCorner.x+.0005,rightCorner.x-.0005);
    const i=glazingTop.findIndex(p=>p.x>=x),a=glazingTop[Math.max(0,i-1)],b=glazingTop[Math.max(0,i)];
    return a.clone().lerp(b,(x-a.x)/Math.max(1e-9,b.x-a.x));
  };
  const xs=[...new Set([-.591,-.587,0,.587,.591,...glazingTop.map(p=>p.x)])].sort((a,b)=>a-b),contour=xs.map(x=>{
    const z=.445-.070*Math.abs(x)/.591,backPoint=new T.Vector3(x,onRoof(x,z),z),glass=glassAt(x),frontZ=Math.max(z,glass.z+.004);
    const frontPoint=new T.Vector3(glass.x,glass.y-.48*(frontZ-glass.z)-.002,frontZ);
    return {back:backPoint,front:frontPoint,split:Math.max(0,1-.004/backPoint.distanceTo(frontPoint))};
  });
  const returnFaces=[],sealFaces=[];
  const addFace=(points,output)=>{if(points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).lengthSq()>1e-18)for(const p of points)output.push(...p.toArray());};
  for(let i=0;i<contour.length-1;i++){
    const a=contour[i],b=contour[i+1];
    for(let row=0;row<4;row++){
      const at=(p,j)=>p.back.clone().lerp(p.front,j<3?p.split*j/3:j===3?p.split:1);
      const p=[at(a,row),at(b,row),at(a,row+1),at(b,row+1)],output=row===3?sealFaces:returnFaces;
      addFace([p[0],p[1],p[2]],output);addFace([p[2],p[1],p[3]],output);
    }
  }
  for(const [positions,mat,name]of [[returnFaces,lining,'COBALT_INNER_HeadlinerFrontReturn'],[sealFaces,weatherstrip,'COBALT_WindscreenHeaderSeal']]){
    const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();put(g,mat,[0,0,0],[0,0,0],name);
  }
  // Continue the pillar itself into the header with a rounded fillet. The old
  // pillar edge is now inside the moulding; only the new glazing edge carries
  // a seal, avoiding a second diagonal line across the corner.
  for(const {side,surface,total}of cornerSections){
    const end=side<0?contour[0].front:contour.at(-1).front;
    const neighbour=(side<0?contour:contour.toReversed()).find(p=>Math.abs(p.front.x-end.x)>.00001).front;
    const start=surface(1,.82),up=surface(1,.821).sub(start).normalize(),alongHeader=neighbour.clone().sub(end).normalize();
    const curve=new T.CubicBezierCurve3(start,start.clone().addScaledVector(up,.012),end.clone().addScaledVector(alongHeader,-.012),end);
    const sections=Array.from({length:13},(_,i)=>{
      const t=i/12,old=surface(1,T.MathUtils.lerp(.82,1,t)),edge=curve.getPoint(t),width=T.MathUtils.lerp(.006,.004,t),span=old.distanceTo(edge);
      const split=old.clone().lerp(edge,span>1e-9?Math.max(0,1-width/span):0);
      return {old,edge,split};
    });
    const pale=[],black=[],offset=new T.Vector3(-side*.001,0,-.001),normalsByPoint=new Map();
    const face=(points,output)=>{if(side>0)points.reverse();addFace(points,output);};
    for(let i=0;i<sections.length;i++){
      const v=T.MathUtils.lerp(.82,1,i/12),across=surface(1,v).sub(surface(.999,v)),up=surface(1,v+.00001).sub(surface(1,v-.00001));
      normalsByPoint.set(key(sections[i].old),across.cross(up).multiplyScalar(side).normalize());
    }
    for(let i=0;i<sections.length-1;i++){
      const a=sections[i],b=sections[i+1];
      face([a.old,b.old,a.split],pale);face([a.split,b.old,b.split],pale);
      const innerA=i===0?surface(1-.006/total,.82):a.split;
      face([innerA.clone().add(offset),b.split.clone().add(offset),a.edge.clone().add(offset)],black);
      face([a.edge.clone().add(offset),b.split.clone().add(offset),b.edge.clone().add(offset)],black);
    }
    for(const [positions,mat,name]of [[pale,lining,`COBALT_INNER_PillarCorner_${side}`],[black,weatherstrip,`COBALT_INNER_PillarCornerSeal_${side}`]]){
      const raw=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)),g=mergeVertices(raw);g.computeVertexNormals();
      if(mat===lining){const p=g.getAttribute('position'),n=g.getAttribute('normal');for(let i=0;i<p.count;i++){const normal=normalsByPoint.get(key(new T.Vector3().fromBufferAttribute(p,i)));if(normal)n.setXYZ(i,normal.x,normal.y,normal.z);}}
      put(g,mat,[0,0,0],[0,0,0],name);raw.dispose();g.dispose();
    }
  }
  roofSupport.material.dispose();
  // Close the rear lip against the retained ceiling. The source ceiling has
  // several layers here; a cut without this return leaves a full-width slit.
  const rearLip=[];
  for(let i=0;i<24;i++){
    const a=-.62+1.24*i/24,b=-.62+1.24*(i+1)/24;
    const ya=rearLevels[i]??roofY(a,back)+.012,yb=rearLevels[i+1]??roofY(b,back)+.012;
    rearLip.push(a,roofY(a,back),back,a,ya,back,b,yb,back,a,roofY(a,back),back,b,yb,back,b,roofY(b,back),back);
  }
  const lip=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(rearLip,3));lip.computeVertexNormals();put(lip,lining,[0,0,0],[0,0,0],'COBALT_HeadlinerRearReturn');
}
