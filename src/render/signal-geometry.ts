import * as T from 'three';

/** Capsule outline for contrast boards and gently bevelled signal housings. */
export function signalCapsuleGeometry(width:number,height:number,depth:number,bevel=0){
  const radius=width/2-bevel,straight=(height-width)/2,shape=new T.Shape();
  shape.moveTo(-radius,-straight);shape.lineTo(-radius,straight);
  shape.absarc(0,straight,radius,Math.PI,0,true);shape.lineTo(radius,-straight);
  shape.absarc(0,-straight,radius,0,-Math.PI,true);shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth:depth-2*bevel,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,curveSegments:48});
  geometry.translate(0,0,-depth/2+bevel);return geometry;
}

/** A circular hood cut by a tilted plane: a smooth elliptical opening. */
export function signalVisorGeometry(radius:number,back:number,front:number,slope=.9){
  const positions:number[]=[],indices:number[]=[],segments=64,wall=.003;
  const quad=(a:number,b:number,c:number,d:number)=>indices.push(a,b,c,a,c,d);
  for(let i=0;i<=segments;i++){
    const angle=i*2*Math.PI/segments,sin=Math.sin(angle),cos=Math.cos(angle);
    for(const r of [radius,radius-wall]){
      const lipRadius=r*1.04;
      positions.push(cos*r,sin*r,back,cos*lipRadius,sin*lipRadius,front+slope*sin*lipRadius);
    }
    if(i){
      const p=(i-1)*4,n=i*4;
      quad(p,n,n+1,p+1);quad(p+2,p+3,n+3,n+2);
      quad(p+1,n+1,n+3,p+3);quad(p,p+2,n+2,n);
    }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}
