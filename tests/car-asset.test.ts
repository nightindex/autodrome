import { beforeAll,describe,expect,it } from 'vitest';
import { NodeIO, type Document } from '@gltf-transform/core';
import { ALL_EXTENSIONS,type Specular } from '@gltf-transform/extensions';
import * as T from 'three';

let doc:Document;
beforeAll(async()=>{doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/assets/cobalt.glb');});
describe('refined Cobalt asset',()=>{
  it('keeps opaque housing triangles out of both mirror images from the driver seat',()=>{
    const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
    const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
    const material=new T.MeshBasicMaterial(),doubleSided=new T.MeshBasicMaterial({side:T.DoubleSide}),surfaces:T.Mesh[]=[];
    try{
      for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()??[]){
        if(primitive.getMaterial()?.getAlphaMode()==='BLEND')continue;
        const geometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(primitive.getAttribute('POSITION')!.getArray()!),3));
        if(primitive.getIndices())geometry.setIndex(Array.from(primitive.getIndices()!.getArray()!));
        geometry.applyMatrix4(normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())));
        geometry.computeBoundingBox();
        const surface=new T.Mesh(geometry,primitive.getMaterial()!.getDoubleSided()?doubleSided:material);surface.name=primitive.getMaterial()!.getName();surfaces.push(surface);
      }
      for(const side of ['Left','Right']){
        const pane=surfaces.find(mesh=>mesh.name===`COBALT_SideMirror${side}`)!;
        expect(pane,`${side} continuous glass`).toBeDefined();
        const position=pane.geometry.getAttribute('position'),indices=pane.geometry.index!.array;
        const pivot=new T.Box3().setFromObject(pane).getCenter(new T.Vector3());pane.geometry.translate(-pivot.x,-pivot.y,-pivot.z);pane.position.copy(pivot);
        const frame=Array.from({length:indices.length/3},(_,j)=>{
          const a=new T.Vector3().fromBufferAttribute(position,indices[j*3+1]).add(pivot),b=new T.Vector3().fromBufferAttribute(position,indices[j*3+2]).add(pivot);
          const midpoint=a.add(b).multiplyScalar(.5);
          return midpoint.addScaledVector(midpoint.clone().sub(pivot).normalize(),.006);
        });
        let checked=0;
        for(const [yaw,pitch]of [[0,0],[8,6],[-8,-6],[8,-6],[-8,6]]){
          pane.rotation.set(T.MathUtils.degToRad(pitch),T.MathUtils.degToRad(yaw),0);pane.updateMatrixWorld(true);
          for(const eye of [new T.Vector3(.31,.48,.2),new T.Vector3(.26,.45,.16)])for(let i=0;i<indices.length;i+=3){
            const triangle=[0,1,2].map(j=>pane.localToWorld(new T.Vector3().fromBufferAttribute(position,indices[i+j])));
            const center=triangle.reduce((p,v)=>p.add(v),new T.Vector3()).divideScalar(3);
            const perimeter=triangle.flatMap((corner,j)=>[corner,corner.clone().lerp(triangle[(j+1)%3],.5)]);
            for(const corner of perimeter){
              const point=center.clone().lerp(corner,.94),ray=new T.Raycaster(eye,point.sub(eye).normalize());
              const hit=ray.intersectObjects(surfaces,false)[0];
              expect(hit?.object===pane,`${side} glass triangle ${i/3}, angle ${yaw}/${pitch}, from ${eye.toArray()}, hit ${hit?.object.name} at ${hit?.point.toArray()}`).toBe(true);checked++;
            }
          }
          for(const eye of [new T.Vector3(.31,.48,.2),new T.Vector3(.26,.45,.16)])for(const point of frame){
            const ray=new T.Raycaster(eye,point.clone().sub(eye).normalize(),0,point.distanceTo(eye)+.15);
            expect(ray.intersectObjects(surfaces,false).length,`${side} open cavity at ${point.toArray()}, angle ${yaw}/${pitch}`).toBeGreaterThan(0);
          }
        }
        pane.rotation.set(0,0,0);pane.updateMatrixWorld(true);
        expect(checked).toBeGreaterThan(100);
      }
    }finally{surfaces.forEach(mesh=>mesh.geometry.dispose());material.dispose();doubleSided.dispose();}
    const cavity=doc.getRoot().listMaterials().find(m=>m.getName()==='COBALT_SideMirrorCavity');
    expect(cavity).toBeDefined();expect(cavity!.getRoughnessFactor()).toBe(1);expect(cavity!.getMetallicFactor()).toBe(0);
  },30000);
  it('fits the long labelled Cobalt switch grips independently beside the wheel',()=>{
    const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
    const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
    const counts:number[]=[];
    for(const [name,legend,side]of [['COBALT_INDICATOR_STALK','COBALT_IndicatorStalkLegend',1],['COBALT_WIPER_STALK','COBALT_WiperStalkLegend',-1]]as const){
      const node=doc.getRoot().listNodes().find(n=>n.getName()===name)!;
      expect(node,name).toBeTruthy();expect(node.getParentNode()?.getName()).toBe('COBALT_AuthoredDetails');
      const bounds=new T.Box3();let vertices=0;
      const visit=(n:typeof node)=>{
        for(const p of n.getMesh()?.listPrimitives()??[]){
          const positions=p.getAttribute('POSITION')!,matrix=normalize.clone().multiply(new T.Matrix4().fromArray(n.getWorldMatrix()));
          vertices+=positions.getCount();
          for(let i=0;i<positions.getCount();i++)bounds.expandByPoint(new T.Vector3().fromArray(positions.getArray(),i*3).applyMatrix4(matrix));
        }
        n.listChildren().forEach(visit);
      };visit(node);counts.push(vertices);
      if(side===1){
        expect(bounds.getSize(new T.Vector3()).x).toBeGreaterThan(.16);expect(bounds.getSize(new T.Vector3()).x).toBeLessThan(.22);
        expect(bounds.min.x).toBeGreaterThan(.308+.025);
        expect(bounds.max.x).toBeGreaterThan(.308+.199+.015);expect(bounds.max.x).toBeLessThan(.308+.199+.055);
      }else{
        expect(bounds.getSize(new T.Vector3()).x).toBeGreaterThan(.15);expect(bounds.getSize(new T.Vector3()).x).toBeLessThan(.21);
        expect(bounds.min.x).toBeGreaterThan(.308-.199-.055);expect(bounds.min.x).toBeLessThan(.308-.199-.015);
        expect(bounds.max.x).toBeLessThan(.308-.025);
      }
      expect(bounds.min.z).toBeGreaterThan(side===1?.65:.62);expect(bounds.max.z).toBeLessThan(.8);
      expect((bounds.getCenter(new T.Vector3()).x-.308)*side).toBeGreaterThan(0);
      const material=doc.getRoot().listMaterials().find(m=>m.getName()===legend)!;
      expect(material.getBaseColorTexture()).toBeTruthy();expect(material.getAlphaMode()).toBe('MASK');
    }
    expect(counts[0]).not.toBe(counts[1]);
  });
  it('has one smooth rear-glass layer from outside and inside, including near the rim',()=>{
    const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
    const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
    const material=new T.MeshBasicMaterial({side:T.DoubleSide}),meshes:T.Mesh[]=[];
    try{
      for(const node of doc.getRoot().listNodes().filter(n=>/^windscreen/.test(n.getName())))for(const p of node.getMesh()?.listPrimitives()??[]){
        if(p.getMaterial()?.getName()!=='COBALT_RearWindshield')continue;
        expect(p.getMaterial()!.getDoubleSided()).toBe(true);
        expect(p.getMaterial()!.getAlphaMode()).toBe('BLEND');
        expect(p.getMaterial()!.getBaseColorFactor()[3]).toBeCloseTo(1-(1-.38)**2,6);
        const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(p.getAttribute('POSITION')!.getArray()!,3))
          .setAttribute('normal',new T.Float32BufferAttribute(p.getAttribute('NORMAL')!.getArray()!,3));
        if(p.getIndices())g.setIndex(Array.from(p.getIndices()!.getArray()!));
        g.applyMatrix4(normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())));
        const mesh=new T.Mesh(g,material);mesh.updateMatrixWorld();meshes.push(mesh);
      }
      expect(meshes).toHaveLength(1);
      for(const x of [-.55,-.4,-.2,0,.2,.4,.55])for(const z of [-1.68,-1.55,-1.4,-1.25]){
        const origin=new T.Vector3(x,2,z),direction=new T.Vector3(0,-1,0);
        const outside=new T.Raycaster(origin,direction).intersectObjects(meshes);
        expect(outside,`outside rear pane at ${x},${z}`).toHaveLength(1);
        const hit=outside[0],normal=hit.normal!.clone().normalize();
        expect(normal.y).toBeGreaterThan(.75);
        expect(normal.z).toBeLessThan(-.3);
        const inside=new T.Raycaster(hit.point.clone().addScaledVector(direction,.2),direction.clone().negate()).intersectObjects(meshes);
        expect(inside,`inside rear pane at ${x},${z}`).toHaveLength(1);
        expect(inside[0].point.distanceTo(hit.point)).toBeLessThan(1e-5);
        expect(Math.abs(normal.dot(inside[0].normal!.clone().normalize()))).toBeGreaterThan(.9999);
      }
    }finally{meshes.forEach(m=>m.geometry.dispose());material.dispose();}
  });
  it('uses low-specular matte surfaces on rear trim without changing front-seat materials',()=>{
    for(const name of ['COBALT_ParcelShelf','COBALT_RearPillarTrim','COBALT_RearSeatBolster']){
      const material=doc.getRoot().listMaterials().find(m=>m.getName()===name)!;
      expect(material,name).toBeTruthy();expect(material.getRoughnessFactor()).toBeGreaterThanOrEqual(.95);
      expect(material.getMetallicFactor()).toBe(0);
      expect(material.getExtension<Specular>('KHR_materials_specular')?.getSpecularFactor()).toBeLessThanOrEqual(.15);
      expect(material.getAlphaMode()).toBe('OPAQUE');
    }
    const front=doc.getRoot().listMaterials().find(m=>m.getName()==='COBALT_SeatBolster')!;
    expect(front.getExtension('KHR_materials_specular')).toBeNull();
    expect(doc.getRoot().listMaterials().find(m=>m.getName()==='COBALT_RearSeatBolster')?.getBaseColorTexture()).toBeTruthy();
  });
  it('joins rear-backrest normals across geometric seams while retaining its silhouette',()=>{
    const node=doc.getRoot().listNodes().find(n=>n.getName()==='COBALT_RearSeatBack')!;
    const normalsByPosition=new Map<string,T.Vector3>();let seams=0;
    for(const primitive of node.getMesh()!.listPrimitives()){
      const positions=primitive.getAttribute('POSITION')!,normals=primitive.getAttribute('NORMAL')!;
      const bounds=new T.Box3();
      for(let i=0;i<positions.getCount();i++){
        const p=new T.Vector3().fromArray(positions.getArray(),i*3),n=new T.Vector3().fromArray(normals.getArray(),i*3),key=p.toArray().map(v=>Math.round(v*1e6)).join(',');
        bounds.expandByPoint(p);expect(n.length()).toBeCloseTo(1,5);
        if(normalsByPosition.has(key)){expect(n.dot(normalsByPosition.get(key)!)).toBeGreaterThan(.9999);seams++;}
        else normalsByPosition.set(key,n);
      }
      expect(bounds.getSize(new T.Vector3()).toArray()).toEqual(expect.arrayContaining([expect.closeTo(1.23,5),expect.closeTo(.64,5),expect.closeTo(.14,5)]));
    }
    // The final GLB may weld matching seams into a single vertex; the bounds
    // and unit-normal checks still cover that representation.
    expect(normalsByPosition.size+seams).toBeGreaterThan(100);
  });
  it('keeps trim behind the glass at both upper windshield edges',()=>{
    const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
    const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
    const material=new T.MeshBasicMaterial({side:T.DoubleSide}),surfaces:T.Mesh[]=[];
    try{
      for(const node of doc.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()??[]){
        const geometry=new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(p.getAttribute('POSITION')!.getArray()!),3));
        if(p.getIndices())geometry.setIndex(Array.from(p.getIndices()!.getArray()!));
        geometry.applyMatrix4(normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())));
        const surface=new T.Mesh(geometry,material);surface.name=p.getMaterial()!.getName();surfaces.push(surface);
      }
      // These rays enter the glass opening beside each factory A-pillar.
      // An extra tubular cover previously pierced the exterior glass here.
      for(const side of [-1,1])for(const [x,y]of [[.56,.666],[.57,.64]]){
        const ray=new T.Raycaster(new T.Vector3(side*x,y,2),new T.Vector3(0,0,-1));
        expect(ray.intersectObjects(surfaces,false)[0]?.object.name,`windshield edge ${side*x}, ${y}`).toBe('COBALT_Windshield');
      }
    }finally{for(const surface of surfaces)surface.geometry.dispose();material.dispose();}
  });
  it('has contoured seat backs, separate cloth inserts and short headrest supports',()=>{
    const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
    const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
    const bounds=(name:string)=>{
      const node=doc.getRoot().listNodes().find(n=>n.getName()===name)!;expect(node,name).toBeTruthy();
      const matrix=normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())),box=new T.Box3();
      for(const p of node.getMesh()!.listPrimitives()){const a=p.getAttribute('POSITION')!;for(let i=0;i<a.getCount();i++)box.expandByPoint(new T.Vector3().fromArray(a.getArray(),i*3).applyMatrix4(matrix));}
      return box;
    };
    for(const side of [-1,1]){
      const back=bounds(`COBALT_SeatBack_${side}`),head=bounds(`COBALT_Headrest_${side}`);
      const insert=doc.getRoot().listNodes().find(n=>n.getName()===`COBALT_SeatInsert_${side}`)!;
      expect(insert.getMesh()!.listPrimitives()[0].getMaterial()!.getName()).toBe('COBALT_SeatFabric');
      expect(head.min.y-back.max.y).toBeGreaterThan(0);expect(head.min.y-back.max.y).toBeLessThan(.05);
      expect(head.max.y).toBeLessThan(.68);
      for(const dx of [-.066,.066])expect(bounds(`COBALT_HeadrestPost_${side}_${dx}`).getSize(new T.Vector3()).y).toBeLessThan(.06);
    }
  });
  it('embeds cabin textures and all independently controlled lamp sections',()=>{
    const names=new Set(doc.getRoot().listMaterials().map(m=>m.getName()));
    for(const name of ['COBALT_BRAKE','COBALT_TAIL','COBALT_REVERSE','COBALT_INDICATOR_LEFT','COBALT_INDICATOR_RIGHT','COBALT_DIGITAL_SPEED'])expect(names.has(name),name).toBe(true);
    expect(doc.getRoot().listTextures().length).toBeGreaterThanOrEqual(7);
    expect(doc.getRoot().listTextures().every(t=>(t.getImage()?.byteLength??0)>0)).toBe(true);
  });
  it('preserves four wheel assemblies and an independent steering pivot',()=>{
    expect(doc.getRoot().listNodes().filter(n=>n.getName().startsWith('wheel_rf_dummy'))).toHaveLength(4);
    const steering=doc.getRoot().listNodes().find(n=>n.getName()==='COBALT_STEERING_ASSEMBLY');expect(steering?.listChildren().length).toBeGreaterThan(1);
  });
  it('uses clearcoated non-metallic paint and independently switched front optics',()=>{
    const paint=doc.getRoot().listMaterials().find(m=>m.getName()==='Realistic_Car_Paint')!;
    expect(paint.getMetallicFactor()).toBeLessThan(.05);expect(paint.getRoughnessFactor()).toBeGreaterThan(.2);
    const optics=doc.getRoot().listMaterials().filter(m=>/^COBALT_(HEADLIGHT|FOG)_(LEFT|RIGHT)$/.test(m.getName()));
    expect(optics.length).toBe(4);
    for(const m of optics){
      expect(m.getEmissiveFactor()).toEqual([0,0,0]);expect(m.getMetallicFactor()).toBeGreaterThan(.7);
    }
    for(const side of ['LEFT','RIGHT'])expect(doc.getRoot().listMaterials().some(m=>m.getName()===`COBALT_FRONT_INDICATOR_${side}`)).toBe(true);
    const badge=doc.getRoot().listNodes().find(n=>n.getName()==='COBALT_FRONT_BOWTIE');
    expect(badge?.getMesh()?.listPrimitives()[0].getMaterial()?.getName()).toBe('COBALT_Bowtie');
  });
  it('fits reconstructed door trim inside the body and provides cloth upholstery and manual controls',()=>{
    const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
    const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
    for(const node of doc.getRoot().listNodes().filter(n=>/^COBALT_DoorCard_/.test(n.getName()))){
      const matrix=normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix()));
      for(const p of node.getMesh()!.listPrimitives()){const a=p.getAttribute('POSITION')!;
        for(let i=0;i<a.getCount();i++)expect(Math.abs(new T.Vector3().fromArray(a.getArray(),i*3).applyMatrix4(matrix).x)).toBeLessThan(.74);
      }
    }
    const materials=new Set(doc.getRoot().listMaterials().map(m=>m.getName()));
    for(const name of ['COBALT_ExamDisplay','COBALT_ClimateLabels','COBALT_ManualShiftPattern','COBALT_SeatFabric','COBALT_SeatBolster','COBALT_RearViewMirror'])expect(materials.has(name),name).toBe(true);
    expect(materials.has('COBALT_FactoryRadio')).toBe(false);
    expect(doc.getRoot().listMaterials().find(m=>m.getName()==='COBALT_SeatFabric')?.getBaseColorTexture()).toBeTruthy();
  });
  it('provides a rear indicator surface on each correct side of the car',()=>{
    const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
    const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
    for(const [name,side]of [['COBALT_INDICATOR_LEFT',1],['COBALT_INDICATOR_RIGHT',-1]] as const){
      const bounds=new T.Box3();let count=0;
      for(const node of doc.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()??[]){
        if(p.getMaterial()?.getName()!==name)continue;
        const positions=p.getAttribute('POSITION')!,matrix=normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix()));
        for(const index of p.getIndices()?.getArray()??Array.from({length:positions.getCount()},(_,i)=>i)){
          const v=new T.Vector3().fromArray(positions.getArray(),index*3).applyMatrix4(matrix);if(v.z> -1.9)continue;
          expect(v.x*side).toBeGreaterThan(.5);bounds.expandByPoint(v);count++;
        }
      }
      expect(count,name).toBeGreaterThan(0);expect(bounds.max.y-bounds.min.y,name).toBeGreaterThan(.035);
    }
  });
  it('keeps indices valid and the detailed derivative below 220k triangles',()=>{
    let triangles=0;
    for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
      const count=p.getAttribute('POSITION')!.getCount(),indices=p.getIndices()?.getArray();
      if(indices){let highest=-1;for(const index of indices)highest=Math.max(highest,index);expect(highest,mesh.getName()).toBeLessThan(count);triangles+=indices.length/3;}else triangles+=count/3;
    }
    expect(triangles).toBeGreaterThan(170000);expect(triangles).toBeLessThan(220000);
  });
  it('puts controlled, opaque light sections on the outer lenses with clean red/clear boundaries',()=>{
    const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
    const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
    const names=new Set<string>();let checked=0;
    for(const node of doc.getRoot().listNodes().filter(n=>n.getName().includes('lanterna_glass'))){
      const matrix=normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix()));
      for(const p of node.getMesh()?.listPrimitives()??[]){
        const material=p.getMaterial()!,name=material.getName(),position=p.getAttribute('POSITION')!;names.add(name);
        expect(material.getAlphaMode()).toBe('OPAQUE');expect(material.getBaseColorTexture()).toBeTruthy();
        let minY=Infinity,maxY=-Infinity;
        for(let i=0;i<position.getCount();i++){const v=new T.Vector3().fromArray(position.getArray(),i*3).applyMatrix4(matrix);minY=Math.min(minY,v.y);maxY=Math.max(maxY,v.y);}
        if(name==='COBALT_REVERSE'){expect(minY).toBeGreaterThanOrEqual(.145-1e-5);expect(maxY).toBeLessThanOrEqual(.222+1e-5);}
        else if(name.includes('INDICATOR')){expect(minY).toBeGreaterThanOrEqual(.222-1e-5);expect(maxY).toBeLessThanOrEqual(.297+1e-5);}
        else if(name==='COBALT_BRAKE')expect(minY).toBeGreaterThanOrEqual(.297-1e-5);
        else expect(name).toBe('COBALT_TAIL');
        checked++;
      }
    }
    expect(checked).toBeGreaterThanOrEqual(5);expect(names).toEqual(new Set(['COBALT_BRAKE','COBALT_TAIL','COBALT_REVERSE','COBALT_INDICATOR_LEFT','COBALT_INDICATOR_RIGHT']));
  });
  it.each(['COBALT_DIGITAL_SPEED','COBALT_ExamDisplay'])('keeps %s upright in glTF coordinates',name=>{
    const node=doc.getRoot().listNodes().find(n=>n.getName()===name)!,p=node.getMesh()!.listPrimitives()[0];
    const position=p.getAttribute('POSITION')!,uv=p.getAttribute('TEXCOORD_0')!,refinement=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
    const normalized=new T.Matrix4().compose(new T.Vector3(0,refinement.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(refinement.sourceScale)).multiply(new T.Matrix4().fromArray(node.getWorldMatrix()));
    const vertices=Array.from({length:position.getCount()},(_,i)=>({y:new T.Vector3().fromArray(position.getArray(),i*3).applyMatrix4(normalized).y,v:uv.getArray()[i*2+1]}));
    const top=Math.max(...vertices.map(v=>v.y)),bottom=Math.min(...vertices.map(v=>v.y));
    expect(vertices.filter(v=>Math.abs(v.y-top)<1e-5).every(v=>v.v===0)).toBe(true);
    expect(vertices.filter(v=>Math.abs(v.y-bottom)<1e-5).every(v=>v.v===1)).toBe(true);
  });
});
