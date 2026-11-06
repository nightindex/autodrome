import * as T from 'three';

/** Clip the visible lens at exact section boundaries, including crossing triangles.
 * Classifying whole triangles by their centres left sawtooth red/clear edges.
 */
export function segmentRearLens({doc,buffer,node,primitive,mats,worldPoint}){
  const position=primitive.getAttribute('POSITION'),normal=primitive.getAttribute('NORMAL');
  const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i),groups=new Map();
  const vertex=i=>({p:new T.Vector3().fromArray(position.getArray(),i*3),n:new T.Vector3().fromArray(normal.getArray(),i*3),w:worldPoint(node,position,i)});
  const clip=(polygon,axis,value,above)=>{
    if(!Number.isFinite(value)||!polygon.length)return polygon;
    const out=[];let a=polygon.at(-1),da=(a.w[axis]-value)*(above?1:-1);
    for(const b of polygon){const db=(b.w[axis]-value)*(above?1:-1);
      if((da>=0)!==(db>=0)){const t=da/(da-db);out.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t),w:a.w.clone().lerp(b.w,t)});}
      if(db>=0)out.push(b);a=b;da=db;
    }return out;
  };
  const range=(polygon,axis,min,max)=>clip(clip(polygon,axis,min,true),axis,max,false);
  const add=(polygon,material)=>{
    if(polygon.length<3)return;const g=groups.get(material)??{p:[],n:[],uv:[]};
    for(let i=1;i<polygon.length-1;i++){
      if(new T.Vector3().subVectors(polygon[i].w,polygon[0].w).cross(new T.Vector3().subVectors(polygon[i+1].w,polygon[0].w)).lengthSq()<1e-18)continue;
      for(const v of [polygon[0],polygon[i],polygon[i+1]]){g.p.push(...v.p);g.n.push(...v.n.clone().normalize());g.uv.push((Math.abs(v.w.x)-.58)/.20,1-(v.w.y-.07)/.31);}
    }if(g.p.length)groups.set(material,g);
  };
  for(let i=0;i<indices.length;i+=3){
    const triangle=[vertex(indices[i]),vertex(indices[i+1]),vertex(indices[i+2])];
    add(range(triangle,'y',-Infinity,.145),mats.tail);add(range(triangle,'y',.297,Infinity),mats.brake);
    for(const [minY,maxY,indicator]of [[.145,.222,false],[.222,.297,true]]){
      const band=range(triangle,'y',minY,maxY);
      for(const [minX,maxX,side]of [[-Infinity,-.756,0],[-.756,-.59,-1],[-.59,.59,0],[.59,.756,1],[.756,Infinity,0]])
        add(range(band,'x',minX,maxX),side===0?mats.tail:indicator?(side>0?mats.left:mats.right):mats.reverse);
    }
  }
  const mesh=node.getMesh();
  for(const [material,g]of groups){
    const p=doc.createPrimitive().setMaterial(material);
    for(const [semantic,type,data]of [['POSITION','VEC3',g.p],['NORMAL','VEC3',g.n],['TEXCOORD_0','VEC2',g.uv]])p.setAttribute(semantic,doc.createAccessor().setType(type).setArray(new Float32Array(data)).setBuffer(buffer));
    mesh.addPrimitive(p);
  }
  mesh.removePrimitive(primitive);primitive.dispose();
}
