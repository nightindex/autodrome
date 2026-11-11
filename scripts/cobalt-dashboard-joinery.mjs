import * as T from 'three';

/** Thin tooling joints follow the actual moulding in both front and top views.
 * The support is the complete dashboard, including the recessed shelf section.
 */
export function buildDashboardJoinery({dashboard,put,mats,lower,seam,satin}){
  const supportMaterial=new T.MeshBasicMaterial({side:T.DoubleSide});
  const support=new T.Mesh(dashboard,supportMaterial);support.updateMatrixWorld();
  const ray=new T.Raycaster();
  const surface=(point,axis,clearance=.00065)=>{
    ray.ray.origin.copy(point);ray.ray.direction.set(0,0,0);
    if(axis==='y'){ray.ray.origin.y=.7;ray.ray.direction.y=-1;}
    else{ray.ray.origin.z=.35;ray.ray.direction.z=1;}
    const hit=ray.intersectObject(support,false)[0];
    if(!hit)throw new Error(`Dashboard joint misses ${axis} support at ${point.toArray()}`);
    return hit.point.addScaledVector(ray.ray.direction,-clearance);
  };
  const ribbon=(points,width,mat,name,{axis='z',closed=false,clearance=.00065}={})=>{
    const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed,'centripetal');
    const positions=[],uv=[],indices=[],count=closed?64:32;
    for(let i=0;i<=count;i++){
      const point=curve.getPoint(i/count),tangent=curve.getTangent(i/count);
      const cross=axis==='y'?new T.Vector3(-tangent.z,0,tangent.x):new T.Vector3(-tangent.y,tangent.x,0);
      cross.normalize().multiplyScalar(width/2);
      for(const sign of [-1,1]){
        const p=surface(point.clone().addScaledVector(cross,sign),axis,clearance);positions.push(...p.toArray());uv.push(i/count,sign<0?0:1);
      }
      if(i<count){const k=i*2;indices.push(k,k+2,k+1,k+1,k+2,k+3);}
    }
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)).setAttribute('uv',new T.Float32BufferAttribute(uv,2));
    geometry.setIndex(indices);geometry.computeVertexNormals();
    // Winding follows the visible support; bends can cross the tangent sign.
    const n=geometry.getAttribute('normal');let average=0;for(let i=0;i<n.count;i++)average+=axis==='y'?n.getY(i):-n.getZ(i);
    if(average<0){for(let i=0;i<indices.length;i+=3)[indices[i],indices[i+1]]=[indices[i+1],indices[i]];geometry.setIndex(indices);geometry.computeVertexNormals();}
    put(geometry,mat,[0,0,0],[0,0,0],name);
  };
  try{
    // Factory glovebox follows the lower fascia; no second raised box or piping.
    ribbon([[-.644,-.094,0],[-.43,-.091,0],[-.227,-.089,0],[-.210,-.110,0],[-.230,-.229,0],[-.405,-.249,0],[-.610,-.238,0],[-.644,-.214,0]],.0018,seam,'COBALT_GloveboxPanelJoint',{closed:true});

    // Narrow split between the central instrument panel and broad passenger brow.
    // The upper path lies on the cowl and then continues down the front face.
    for(const side of [-1,1]){
      const edge=side===1?.58:1;
      ribbon([[side*.157*edge,0,1.174],[side*.176*edge,0,1.10],[side*.181*edge,0,1.013],[side*.172*edge,0,.940]],.0017,seam,`COBALT_CentreCowlJoint_${side}`,{axis:'y'});
      ribbon([[side*.176*edge,.281,0],[side*.172*edge,.265,0],[side*.163*edge,.229,0],[side*.155*edge,.169,0],[side*.156*edge,.103,0]],.0017,seam,`COBALT_CentreFasciaJoint_${side}`);
    }

    // A broad satin shoulder carries the tray into the paired central vents.
    // Its complete curved section sits on the cowl, without a suspended edge.
    const frame=[];
    for(let i=0;i<=64;i++){
      const a=i/64*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
      frame.push([.148*Math.sign(c)*Math.pow(Math.abs(c),.35),0,1.108+.064*Math.sign(s)*Math.pow(Math.abs(s),.45)]);
    }
    ribbon(frame.slice(0,-1),.010,satin,'COBALT_UpperTraySurround',{axis:'y',closed:true,clearance:.0016});
    ribbon([[-.161,0,1.043],[-.138,0,.997],[0,0,.984],[.138,0,.997],[.161,0,1.043]],.009,lower,'COBALT_CentreVentShoulder',{axis:'y'});

  }finally{supportMaterial.dispose();dashboard.dispose();}
}
