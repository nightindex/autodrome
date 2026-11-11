import * as T from 'three';
import { weldPrimitive,simplifyPrimitive } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

/** Fit the moulded A-pillar feet to the real dashboard, as in the supplied
 * close-up: a tapered pale return with a fine dark joint, not a flat colour cut. */
export function fitFrontPillarFeet({doc,buffer,nodes,worldPoint,lining,dashboard,seam,weatherstrip=dashboard}){
  const dash=doc.getRoot().listNodes().find(n=>n.getName()==='COBALT_MouldedDashboard');
  const supportMaterial=new T.MeshBasicMaterial({side:T.DoubleSide}),supports=[],outerPanels=[];
  for(const primitive of dash.getMesh().listPrimitives()){
    const position=primitive.getAttribute('POSITION'),values=[];
    for(let i=0;i<position.getCount();i++)values.push(...worldPoint(dash,position,i).toArray());
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(values,3));
    if(primitive.getIndices())geometry.setIndex(Array.from(primitive.getIndices().getArray()));
    const mesh=new T.Mesh(geometry,supportMaterial);mesh.updateMatrixWorld();supports.push(mesh);
  }
  for(const node of nodes)if(/^(chassis_primary|bonnet_ok)/.test(node.getName()))for(const primitive of node.getMesh()?.listPrimitives()??[]){
    if(primitive.getMaterial()?.getName()!=='Realistic_Car_Paint')continue;
    const position=primitive.getAttribute('POSITION'),values=[];
    for(let i=0;i<position.getCount();i++)values.push(...worldPoint(node,position,i).toArray());
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(values,3));
    if(primitive.getIndices())geometry.setIndex(Array.from(primitive.getIndices().getArray()));
    const mesh=new T.Mesh(geometry,supportMaterial);mesh.updateMatrixWorld();outerPanels.push(mesh);
  }
  const ray=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0),0,1),heights=new Map();
  const heightAt=point=>{
    const x=T.MathUtils.clamp(point.x,-.686,.686),z=T.MathUtils.clamp(point.z,.84,1.265),key=`${x.toFixed(5)},${z.toFixed(5)}`;
    if(!heights.has(key)){ray.ray.origin.set(x,.7,z);heights.set(key,ray.intersectObjects(supports)[0]?.point.y??.29);}
    return heights.get(key);
  };
  try{
    for(const node of nodes)for(const primitive of [...node.getMesh()?.listPrimitives()??[]]){
      if(primitive.getMaterial()!==lining){
        if(/^chassis_primary/.test(node.getName())&&primitive.getMaterial()?.getName()==='Realistic_Car_Paint'){
          const position=primitive.getAttribute('POSITION'),indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i),inside=[],outside=[];
          for(let i=0;i<indices.length;i+=3){
            const points=[0,1,2].map(j=>worldPoint(node,position,indices[i+j]));
            const p=points.reduce((sum,p)=>sum.add(p),new T.Vector3()).multiplyScalar(1/3);
            const normal=points[1].clone().sub(points[0]).cross(points[2].clone().sub(points[0])).normalize();
            // This vertical inner cowl continues beyond the main pillar's
            // material boundary. Its outward neighbour remains body paint.
            const cowl=p.y>.275&&p.y<.335&&Math.abs(p.x)>.672&&Math.abs(p.x)<.690&&p.z>1.19&&p.z<1.265&&Math.sign(p.x)*normal.x<-.95&&Math.abs(normal.y)<.1&&Math.abs(normal.z)<.2;
            (cowl?inside:outside).push(indices[i],indices[i+1],indices[i+2]);
          }
          if(inside.length){
            node.getMesh().addPrimitive(primitive.clone().setMaterial(dashboard).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(inside)).setBuffer(buffer)));
            if(outside.length)primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(outside)).setBuffer(buffer));
            else{node.getMesh().removePrimitive(primitive);primitive.dispose();}
          }
        }
        continue;
      }
      const attributes=primitive.listSemantics().map(semantic=>({semantic,accessor:primitive.getAttribute(semantic)})),position=primitive.getAttribute('POSITION');
      const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i),groups=new Map();
      const origin=worldPoint(node,position,0),source=new T.Vector3().fromArray(position.getArray());
      const basis=[0,1,2].map(axis=>{const values=new Float32Array(source.toArray());values[axis]+=1;return worldPoint(node,{getArray:()=>values},0).sub(origin);});
      const transform=new T.Matrix4().makeBasis(...basis);transform.setPosition(origin.clone().sub(source.clone().applyMatrix4(transform)));const inverse=transform.clone().invert();
      const sourceShell=/^interior_interior(?:[._]|$)/.test(node.getName());
      const vertex=i=>({point:worldPoint(node,position,i),values:attributes.map(({accessor:a})=>Array.from(a.getArray().slice(i*a.getElementSize(),(i+1)*a.getElementSize())))});
      const lerp=(a,b,t)=>({point:a.point.clone().lerp(b.point,t),values:a.values.map((values,j)=>values.map((v,k)=>T.MathUtils.lerp(v,b.values[j][k],t)))});
      const clip=(polygon,level,above,field=v=>v.point.y-heightAt(v.point),linear=false)=>{
        if(!polygon.length)return [];const output=[],sign=above?1:-1;
        const distance=v=>(field(v)-level)*sign;
        let a=polygon.at(-1),da=distance(a);
        for(const b of polygon){const db=distance(b);
          if((da>=0)!==(db>=0)){
            if(linear){output.push(lerp(a,b,da/(da-db)));if(db>=0)output.push(b);a=b;da=db;continue;}
            // The cowl is curved, so locate the joint on its actual surface
            // instead of assuming a planar height between edge endpoints.
            let low=0,high=1;
            for(let i=0;i<20;i++){const middle=(low+high)/2;if((distance(lerp(a,b,middle))>=0)===(da>=0))low=middle;else high=middle;}
            output.push(lerp(a,b,(low+high)/2));
          }
          if(db>=0)output.push(b);a=b;da=db;
        }return output;
      };
      const add=(polygon,material)=>{
        const arrays=groups.get(material)??attributes.map(()=>[]);
        for(let j=1;j<polygon.length-1;j++){
          const triangle=[polygon[0],polygon[j],polygon[j+1]];
          if(triangle[1].point.clone().sub(triangle[0].point).cross(triangle[2].point.clone().sub(triangle[0].point)).lengthSq()<1e-18)continue;
          for(const v of triangle)v.values.forEach((values,k)=>arrays[k].push(...values));
        }if(arrays[0].length)groups.set(material,arrays);
      };
      const process=(triangle,authored=false)=>{
        let polygon=triangle;
        const normal=polygon[1].point.clone().sub(polygon[0].point).cross(polygon[2].point.clone().sub(polygon[0].point)).normalize();
        // Keep the pale foot on the pillar. Long source cowl triangles used
        // to carry stray white tips and isolated joint slivers toward the hood.
        const outboard=v=>Math.abs(v.point.x)-(.620-.105*T.MathUtils.smoothstep(v.point.y,.31,.43));
        // Only the real dashboard should close the inboard side of the foot;
        // recolouring a floating source blade leaves the same pointed bulge.
        add(clip(clip(polygon,0,false,outboard),.0015,false),dashboard);polygon=clip(polygon,0,true,outboard);
        add(clip(polygon,.004,true),lining);
        // The authored cowl already closes the horizontal return. Its old
        // upward/downward-facing shell layers would leave isolated dark
        // slivers and z-fighting just above that surface.
        if(!authored&&Math.abs(normal.y)>.7&&polygon.every(v=>Math.abs(v.point.x)<.686))return;
        const lower=clip(polygon,.004,false);add(clip(lower,.0015,true),seam);add(clip(lower,.0015,false),dashboard);
      };
      if(sourceShell){
        // Continue the real upper section down a smooth rail. Bending the
        // source's 110 mm inward blade folds its triangulation over itself.
        // This loft retains the door lip, broad face and windscreen return,
        // with a rounded section and a monotone lower edge instead.
        for(const side of [-1,1]){
          const section=new Map(),connections=new Map(),level=.44;
          const key=p=>p.toArray().map(n=>Math.round(n*1e6)).join(',');
          for(let i=0;i<indices.length;i+=3){
            const triangle=[0,1,2].map(j=>vertex(indices[i+j])),hits=[];
            for(let j=0;j<3;j++){
              const a=triangle[j],b=triangle[(j+1)%3];
              if((a.point.y>=level)===(b.point.y>=level))continue;
              const v=lerp(a,b,(level-a.point.y)/(b.point.y-a.point.y)),p=v.point;
              if(side*p.x>.49&&side*p.x<.74&&p.z>.65&&p.z<1.10)hits.push(v);
            }
            if(hits.length===2){
              const keys=hits.map(v=>key(v.point));if(keys[0]===keys[1])continue;
              hits.forEach((v,j)=>{section.set(keys[j],v);const adjacent=connections.get(keys[j])??new Set();adjacent.add(keys[1-j]);connections.set(keys[j],adjacent);});
            }
          }
          // Follow connected triangle cuts. Sorting by Z loses the door lip
          // when simplification gives its nominally coplanar points a small
          // slope, and used to leave a gap on just one side of the cabin.
          const ends=[...connections.keys()].filter(k=>connections.get(k).size===1).sort((a,b)=>side*(section.get(b).point.x-section.get(a).point.x));
          const points=[],visited=new Set();let next=ends[0];
          while(next&&!visited.has(next)){visited.add(next);points.push(section.get(next));next=[...connections.get(next)].find(k=>!visited.has(k));}
          if(points.length<4)throw new Error(`Missing source A-pillar section on side ${side}`);
          const a=points[0].point,b=points.reduce((min,v)=>side*v.point.x<side*min.x?v.point:min,a),d=points.at(-1).point,c=d.clone().add(new T.Vector3(0,0,-.01831));
          const line=new T.CurvePath();for(let i=1;i<points.length;i++)line.add(new T.LineCurve3(points[i-1].point,points[i].point));
          const main=c.clone().sub(b).normalize(),lip=a.clone().sub(b).normalize(),r=.006,rounded=new T.CurvePath();
          rounded.add(new T.LineCurve3(a,b.clone().addScaledVector(lip,r)));
          rounded.add(new T.QuadraticBezierCurve3(b.clone().addScaledVector(lip,r),b,b.clone().addScaledVector(main,r)));
          rounded.add(new T.LineCurve3(b.clone().addScaledVector(main,r),c.clone().addScaledVector(main,-r)));
          rounded.add(new T.QuadraticBezierCurve3(c.clone().addScaledVector(main,-r),c,c.clone().add(new T.Vector3(0,0,r))));
          rounded.add(new T.LineCurve3(c.clone().add(new T.Vector3(0,0,r)),d));
          const rail=new T.CatmullRomCurve3([
            [.59218,.48,.66696],[.60333,.44,.74085],[.6137,.40,.8072],
            [.6240,.36,.8665],[.6298,.34,.8918],[.6366,.32,.9124],
            [.6453,.30,.9269],[.6562,.28,.9352],[.668,.26,.940],[.680,.24,.942],
          ].map(([x,y,z])=>new T.Vector3(side*(x-.60333)+b.x,y,z-.74085+b.z)),false,'centripetal');
          const surfacePoint=(u,y)=>{
            let low=0,high=1;
            for(let j=0;j<20;j++){const t=(low+high)/2;if(rail.getPoint(t).y>y)low=t;else high=t;}
            const delta=rail.getPoint((low+high)/2).sub(b),blend=1-T.MathUtils.smoothstep(y,.405,.44);
            return line.getPoint(u).lerp(rounded.getPoint(u),blend).add(delta);
          };
          // Put shared mesh rows exactly on both sides of the moulding joint.
          // Clipping a uniform grid across the curved dashboard left long,
          // differently simplified triangles along this very visible edge.
          const fittedRows=new WeakMap();
          const rowHeight=(pointAt,u,row)=>{
            let cache=fittedRows.get(pointAt);if(!cache){cache=new Map();fittedRows.set(pointAt,cache);}
            if(!cache.has(u)){
              const roots=[.004,.0015].map(clearance=>{
                let low=.24,high=level;
                for(let i=0;i<24;i++){
                  const y=(low+high)/2,p=pointAt(u,y);
                  if(y-heightAt(p)>clearance)high=y;else low=y;
                }
                return (low+high)/2;
              });cache.set(u,roots);
            }
            const [top,bottom]=cache.get(u);
            return row<=rows-2?T.MathUtils.lerp(level,top,row/(rows-2)):row===rows-1?bottom:.24;
          };
          const lengths=line.getCurveLengths(),total=line.getLength(),ni=attributes.findIndex(a=>a.semantic==='NORMAL'),normalToLocal=new T.Matrix3().getNormalMatrix(inverse);
          const rows=32,samples=[...new Set([...Array.from({length:25},(_,i)=>i/24),...lengths.map(length=>length/total)])].sort((a,b)=>a-b),columns=samples.length-1,grid=[];
          for(let row=0;row<=rows;row++){
            for(let column=0;column<=columns;column++){
              const u=samples[column],y=rowHeight(surfacePoint,u,row),blend=1-T.MathUtils.smoothstep(y,.405,.44),p=surfacePoint(u,y),length=u*total;
              let span=lengths.findIndex(end=>end>=length);if(span<0)span=lengths.length-1;
              const start=span?lengths[span-1]:0,v=lerp(points[span],points[span+1],(length-start)/Math.max(1e-12,lengths[span]-start));v.point=p;
              v.values[attributes.findIndex(a=>a.semantic==='POSITION')]=p.clone().applyMatrix4(inverse).toArray();grid.push(v);
              if(ni>=0){
                const across=surfacePoint(Math.min(1,u+.001),y).sub(surfacePoint(Math.max(0,u-.001),y));
                const up=surfacePoint(u,y+.0001).sub(surfacePoint(u,y-.0001));
                const normal=across.cross(up).multiplyScalar(side).normalize().applyMatrix3(normalToLocal).normalize();
                // Match the existing shading exactly at the upper join;
                // below it use the loft's own continuous derivative field.
                v.values[ni]=new T.Vector3().fromArray(v.values[ni]).normalize().lerp(normal,blend).normalize().toArray();
              }
            }
          }
          for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){
            const i=row*(columns+1)+column;
            for(const face of [[i,i+columns+1,i+1],[i+1,i+columns+1,i+columns+2]]){
              if(side<0)[face[1],face[2]]=[face[2],face[1]];process(face.map(i=>grid[i]),true);
            }
          }
          // The face also needs its returns: without these, the small spaces
          // between the moulding, mirror sail and windscreen reveal outer paint.
          const closeReturn=(pointAt,material,segments,edge=0)=>{
            const vertices=[];
            for(let row=0;row<=rows;row++)for(let column=0;column<=segments;column++){
              const u=column/segments,y=rowHeight(pointAt,u,row),p=pointAt(u,y);
              const v={point:p,values:points[0].values.map(values=>[...values])};
              v.values[attributes.findIndex(a=>a.semantic==='POSITION')]=p.clone().applyMatrix4(inverse).toArray();
              if(ni>=0){
                const across=pointAt(Math.min(1,u+.001),y).sub(pointAt(Math.max(0,u-.001),y));
                const up=pointAt(u,y+.0001).sub(pointAt(u,y-.0001));
                const normal=across.cross(up).multiplyScalar(side).normalize().applyMatrix3(normalToLocal).normalize();
                v.values[ni]=normal.lengthSq()>.5?normal.toArray():[...points[edge].values[ni]];
              }
              vertices.push(v);
            }
            for(let row=0;row<rows;row++)for(let column=0;column<segments;column++){
              const i=row*(segments+1)+column;
              for(const face of [[i,i+segments+1,i+1],[i+1,i+segments+1,i+segments+2]]){
                if(side<0)[face[1],face[2]]=[face[2],face[1]];
                const triangle=face.map(i=>vertices[i]);
                if(material===lining)process(triangle,true);else add(triangle,material);
              }
            }
          };
          closeReturn((u,y)=>{
            const inner=surfacePoint(0,y),amount=1-T.MathUtils.smoothstep(y,.36,.44);
            const outer=inner.clone().lerp(new T.Vector3(side*.721,y,inner.z+.002),amount);
            return outer.lerp(inner,u);
          },weatherstrip,1);
          const backing=new T.CatmullRomCurve3([
            [.65734,.44,.89810],[.66237,.42,.93528],[.66722,.40,.97313],
            [.67817,.38,1.00791],[.67890,.36,1.03671],[.67982,.34,1.06813],
            [.68085,.32,1.10163],[.68177,.30,1.14229],[.6827,.28,1.180],
            [.684,.26,1.220],[.686,.24,1.250],
          ].map(([x,y,z])=>new T.Vector3(side*x,y,z)),false,'centripetal');
          closeReturn((u,y)=>{
            let low=0,high=1;
            for(let j=0;j<20;j++){const t=(low+high)/2;if(backing.getPoint(t).y>y)low=t;else high=t;}
            const start=surfacePoint(1,y),amount=1-T.MathUtils.smoothstep(y,.38,.44);
            const end=start.clone().lerp(backing.getPoint((low+high)/2).add(new T.Vector3(side*.003,0,.002)),amount);
            return new T.CubicBezierCurve3(start,start.clone().add(new T.Vector3(0,0,.025*amount)),end.clone().sub(new T.Vector3(side*.012*amount,0,.020*amount)),end).getPoint(u);
          },lining,4,points.length-1);
          // Close the narrow cowl pocket underneath the windscreen return.
          // The dashboard ended at x=+/-.695 while the source frame continued
          // farther out; the open corner exposed white exterior paint.
          const cap=[];
          for(let j=0;j<=12;j++)for(let i=0;i<=6;i++){
            const p=new T.Vector3(side*(.675+.08*i/6),0,1.02+.31*j/12);
            p.y=heightAt(p)-.0005;
            // Close the interior corner below the actual fender/bonnet skin.
            // The dashboard-height cap used to cross the sloping sheet metal,
            // exposing a dark triangular "scratch" on both front wings.
            ray.ray.origin.set(p.x,.7,p.z);
            const panel=ray.intersectObjects(outerPanels).find(hit=>hit.point.y>.20);
            if(panel)p.y=Math.min(p.y,panel.point.y-.004);
            const v={point:p,values:points[0].values.map(values=>[...values])};
            v.values[attributes.findIndex(a=>a.semantic==='POSITION')]=p.clone().applyMatrix4(inverse).toArray();
            if(ni>=0)v.values[ni]=new T.Vector3(0,1,0).applyMatrix3(normalToLocal).normalize().toArray();
            cap.push(v);
          }
          for(let j=0;j<12;j++)for(let i=0;i<6;i++){
            const k=j*7+i;
            for(const face of [[k,k+7,k+1],[k+1,k+7,k+8]]){
              if(side<0)[face[1],face[2]]=[face[2],face[1]];
              add(face.map(k=>cap[k]),dashboard);
            }
          }
        }
      }
      const refine=(triangle,depth=0)=>{
        const midpoints=triangle.map((a,j)=>{
          const b=triangle[(j+1)%3],middle=lerp(a,b,.5),p=middle.point;
          // Every shell uses the same edge rule. Subdivide before bending, so
          // the rounded return is sampled evenly on both sides. Four-way
          // subdivision avoids the very thin spokes of a centre-point fan.
          return depth<4&&p.y>.23&&p.y<.49&&p.z>.75&&p.z<1.24&&Math.abs(p.x)>.47&&Math.abs(p.x)<.74&&a.point.distanceTo(b.point)>.035?middle:null;
        }),count=midpoints.filter(Boolean).length;
        if(count){
          if(count===3){
            const [a,b,c]=triangle,[ab,bc,ca]=midpoints;
            for(const child of [[a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]])refine(child,depth+1);
          }else{
            const start=count===1?midpoints.findIndex(Boolean):midpoints.findIndex((m,j)=>m&&midpoints[(j+1)%3]);
            const a=triangle[start],b=triangle[(start+1)%3],c=triangle[(start+2)%3],ab=midpoints[start],bc=midpoints[(start+1)%3];
            for(const child of count===1?[[a,ab,c],[ab,b,c]]:[[a,ab,c],[ab,bc,c],[ab,b,bc]])refine(child,depth+1);
          }
        }else{
          const center=triangle.reduce((p,v)=>p.add(v.point),new T.Vector3()).divideScalar(3);
          const normal=triangle[1].point.clone().sub(triangle[0].point).cross(triangle[2].point.clone().sub(triangle[0].point)).normalize();
          const mirrorSail=/^door_[lr]f_ok_primary/.test(node.getName())&&center.y>.29&&center.y<.44&&Math.abs(center.x)>.69&&Math.abs(center.x)<.75&&center.z>.76&&center.z<.90&&normal.z<-.45;
          if(mirrorSail)add(triangle,weatherstrip);
          else if(center.z>.30&&center.z<1.20&&Math.abs(center.x)>.49&&center.y<.65){
            if(sourceShell)add(clip(triangle,.44,true,v=>v.point.y,true),lining);
            else process(triangle);
          }
          else add(triangle,lining);
        }
      };
      for(let i=0;i<indices.length;i+=3)refine([0,1,2].map(j=>vertex(indices[i+j])));
      for(const [material,arrays]of groups){
        const part=doc.createPrimitive().setMaterial(material);
        attributes.forEach(({semantic,accessor},i)=>{
          if(semantic==='NORMAL')for(let j=0;j<arrays[i].length;j+=3)new T.Vector3().fromArray(arrays[i],j).normalize().toArray(arrays[i],j);
          part.setAttribute(semantic,doc.createAccessor().setType(accessor.getType()).setArray(new Float32Array(arrays[i])).setBuffer(buffer));
        });
        // Keep the game mesh budget: only the bent patch needs retessellation.
        // Simplify its planar interiors after fitting, keeping its shared edge
        // vertices locked and including the new normal field in the error.
        const positions=arrays[attributes.findIndex(a=>a.semantic==='POSITION')],local=[],rest=[];
        for(let i=0;i<positions.length;i+=9){
          const points=[0,1,2].map(j=>new T.Vector3().fromArray(positions,i+j*3).applyMatrix4(transform));
          const selected=points.every(p=>Math.abs(p.x)>.47&&Math.abs(p.x)<.75&&p.y>.23&&p.y<.50&&p.z>.74&&p.z<1.25);
          (selected?local:rest).push(i/3,i/3+1,i/3+2);
        }
        if(local.length){
          const patch=part.clone().setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(local)).setBuffer(buffer));
          weldPrimitive(patch,{overwrite:true});
          const simplifier={simplify:(indices,positions,stride,target,error,flags)=>MeshoptSimplifier.simplifyWithAttributes(indices,positions,stride,patch.getAttribute('NORMAL').getArray(),3,[.25,.25,.25],null,target,error,flags)};
          simplifyPrimitive(patch,{simplifier,ratio:.35,error:.00015,lockBorder:true});node.getMesh().addPrimitive(patch);
        }
        if(rest.length){part.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(rest)).setBuffer(buffer));node.getMesh().addPrimitive(part);}
        else part.dispose();
      }
      node.getMesh().removePrimitive(primitive);primitive.dispose();
    }
  }finally{[...supports,...outerPanels].forEach(mesh=>mesh.geometry.dispose());supportMaterial.dispose();}
}
