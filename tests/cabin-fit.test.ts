import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as T from 'three';

const surfaces:T.Mesh[]=[],glazing:T.Mesh[]=[],material=new T.MeshBasicMaterial({side:T.DoubleSide});
const mirrorSwitchFrame=new T.Matrix4();
beforeAll(async()=>{
  const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/assets/cobalt.glb');
  const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
  const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
  const mirrorSwitch=doc.getRoot().listNodes().find(node=>node.getName()==='COBALT_MIRROR_SWITCH');
  expect(mirrorSwitch,'physical mirror-switch assembly').toBeDefined();
  mirrorSwitchFrame.copy(normalize).multiply(new T.Matrix4().fromArray(mirrorSwitch!.getWorldMatrix()));
  for(const node of doc.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()??[]){
    const source=p.getMaterial();if(!source||source.getAlphaMode()==='BLEND'&&source.getName()!=='COBALT_Windshield')continue;
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(p.getAttribute('POSITION')!.getArray()!,3));
    if(p.getAttribute('NORMAL'))geometry.setAttribute('normal',new T.Float32BufferAttribute(p.getAttribute('NORMAL')!.getArray()!,3));
    if(p.getIndices())geometry.setIndex(Array.from(p.getIndices()!.getArray()!));
    geometry.applyMatrix4(normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())));
    const mesh=new T.Mesh(geometry,material);mesh.name=node.getName();mesh.userData.material=source.getName();mesh.userData.doubleSided=source.getDoubleSided();mesh.updateMatrixWorld();(source.getAlphaMode()==='BLEND'?glazing:surfaces).push(mesh);
  }
});
afterAll(()=>{[...surfaces,...glazing].forEach(mesh=>mesh.geometry.dispose());material.dispose();});
const cast=(origin:T.Vector3,direction:T.Vector3,targets=surfaces)=>new T.Raycaster(origin,direction,0,3).intersectObjects(targets,false).find(hit=>hit.object.userData.doubleSided||hit.face!.normal.dot(direction)<0);
// Match the close-up reference camera and mirror its probes for the other side.
const castPillarPhotoPixel=(side:number,x:number,y:number)=>{
  const camera=new T.PerspectiveCamera(40,1440/960,.025,3);
  camera.position.set(side*.31,.48,.2);camera.lookAt(side*.63,.39,.92);camera.updateMatrixWorld();
  const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(side*(x/720-1),1-y/480),camera);
  // Probe the supporting trim itself, even where the fitted switch covers it.
  return cast(ray.ray.origin,ray.ray.direction,surfaces.filter(mesh=>!/^COBALT_MirrorSwitch/.test(mesh.name)));
};

describe('cabin surfaces fit their supports',()=>{
  it('covers the mirror-sail corner with continuous dark trim below the pale pillar',()=>{
    for(const side of [-1,1])for(const [y,z]of [[.415,.740],[.440,.770]]){
      const x=.6851625-(.272/.960)*(y-.3489)-(.066/.960)*(z-.8355)-.0008;
      const eye=new T.Vector3(side*.31,.552,.016),target=new T.Vector3(side*x,y,z);
      const hit=cast(eye,target.sub(eye).normalize());expect(['COBALT_Rubber','COBALT_SideMirrorHousing'],`dark sail corner ${side},${y},${z},${hit?.object.name}`).toContain(hit?.object.userData.material);
    }
  });
  it('shows cabin lining instead of the back of the painted shell at the upper windscreen corners',()=>{
    for(const side of [-1,1])for(const [x,y,z]of [[.56737,.69639,.35525],[.56616,.71256,.34150],[.531,.706,.400]]){
      const eye=new T.Vector3(side*.31,.552,.016),target=new T.Vector3(side*x,y,z);
      const direction=target.sub(eye).normalize(),hit=cast(eye,direction);
      if(hit)expect(['COBALT_Headliner','COBALT_HeadlinerJoint','COBALT_CabinWindowSeals'],`clean upper corner ${side},${x},${y},${z}`).toContain(hit.object.userData.material);
      else expect(cast(eye,direction,glazing),`glazed upper corner ${side},${x},${y},${z}`).toBeDefined();
    }
  });
  it('keeps the cowl pocket caps below the exterior front wings and bonnet',()=>{
    const paint=surfaces.filter(mesh=>mesh.userData.material==='Realistic_Car_Paint'&&/^(chassis_primary|bonnet_ok)/.test(mesh.name));
    let checked=0;
    for(const side of [-1,1])for(const x of [.735,.745,.750])for(const z of [1.10,1.18,1.26,1.30]){
      const origin=new T.Vector3(side*x,.7,z),down=new T.Vector3(0,-1,0);
      if(!cast(origin,down,paint))continue;
      expect(cast(origin,down)?.object.userData.material,`clean outer cowl ${side*x},${z}`).toBe('Realistic_Car_Paint');checked++;
    }
    expect(checked).toBeGreaterThan(12);
  });
  it('keeps the exposed front-door B-pillar frames uniformly dark below the roof rail',()=>{
    let checked=0;
    for(const mesh of surfaces.filter(mesh=>/^door_[lr]f_ok_door_rr/.test(mesh.name))){
      const p=mesh.geometry.getAttribute('position'),ix=mesh.geometry.index?.array??Uint32Array.from({length:p.count},(_,i)=>i);
      for(let i=0;i<ix.length;i+=3){
        const center=new T.Vector3();for(let j=0;j<3;j++)center.add(new T.Vector3().fromBufferAttribute(p,ix[i+j]));center.divideScalar(3);
        if(center.z<-.35||center.z>.28||center.y<.43||center.y>.63)continue;
        expect(mesh.userData.material,`dark B-pillar frame ${center.toArray()}`).not.toBe('COBALT_Headliner');checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });
  it('keeps the upper dashboard free of broken trim arcs and stray dark panel lines',()=>{
    const expected=['COBALT_MouldedDashboard','COBALT_InstrumentHood','COBALT_DashboardTray','COBALT_DashboardTrayRim','COBALT_UpperTraySurround'];
    for(const x of [-.14,-.07,0,.07,.14])for(const z of [.984,.998,1.020]){
      const hit=cast(new T.Vector3(x,.7,z),new T.Vector3(0,-1,0));
      expect(expected,`clean upper panel at ${x},${z}: ${hit?.object.name}`).toContain(hit?.object.name);
    }
  });
  it('closes the upper pillar seams against the headliner and pillar on both sides',()=>{
    const roof=surfaces.find(mesh=>mesh.name==='COBALT_FrontHeadliner')!;
    expect(roof).toBeDefined();
    for(const side of [-1,1]){
      const pillar=surfaces.find(mesh=>mesh.name===`COBALT_UpperPillar_${side}`)!;
      const joint=surfaces.find(mesh=>mesh.name===`COBALT_UpperPillarJoint_${side}`)!;
      expect(pillar).toBeDefined();expect(joint).toBeDefined();
      const seals=surfaces.filter(mesh=>mesh.name===`COBALT_DoorPillarSeal_${side}`||mesh.name===`COBALT_WindscreenPillarSeal_${side}`);
      const neighbours=[roof,pillar,...seals].flatMap(mesh=>{const p=mesh.geometry.getAttribute('position');return Array.from({length:p.count},(_,i)=>new T.Vector3().fromBufferAttribute(p,i));});
      const position=joint.geometry.getAttribute('position');
      for(let i=0;i<position.count;i++){
        const point=new T.Vector3().fromBufferAttribute(position,i);
        expect(Math.min(...neighbours.map(p=>p.distanceTo(point))),`closed upper joint ${side},${i}`).toBeLessThan(.000002);
      }
    }
  });
  it('replaces the overlapping middle pillar sheets and gives the rubber its own faces',()=>{
    for(const side of [-1,1]){
      const pillar=surfaces.find(mesh=>mesh.name===`COBALT_UpperPillar_${side}`)!;
      const box=new T.Box3().setFromObject(pillar);
      expect(box.min.y).toBeCloseTo(.4399,5);
      const source=surfaces.filter(mesh=>mesh.userData.material==='COBALT_Headliner'&&!mesh.name.startsWith('COBALT_'));
      for(const mesh of source){
        const p=mesh.geometry.getAttribute('position'),ix=mesh.geometry.index?.array??Uint32Array.from({length:p.count},(_,i)=>i);
        for(let i=0;i<ix.length;i+=3){
          const center=new T.Vector3();for(let j=0;j<3;j++)center.add(new T.Vector3().fromBufferAttribute(p,ix[i+j]));center.divideScalar(3);
          expect(center.y>.44001&&center.y<.55&&center.z>.3&&side*center.x>.5,`removed duplicate middle trim ${mesh.name}`).toBe(false);
        }
      }
      for(const name of ['Door','Windscreen']){
        const seal=surfaces.find(mesh=>mesh.name===`COBALT_${name}PillarSeal_${side}`)!;
        const p=seal.geometry.getAttribute('position'),ix=seal.geometry.index!.array;
        for(let i=0;i<ix.length;i+=30){
          const [a,b,c]=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(p,ix[i+j]));
          const center=a.clone().add(b).add(c).divideScalar(3),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
          const hits=new T.Raycaster(center.clone().addScaledVector(normal,.0001),normal.negate(),0,.0002).intersectObject(pillar);
          expect(hits.length,`rubber must not overlay pale trim: ${seal.name},${i}`).toBe(0);
        }
      }
    }
  });
  it('keeps the pillar silhouette and shading smooth across the lower loft join',()=>{
    const skin=surfaces.filter(mesh=>mesh.userData.material==='COBALT_Headliner'&&/^(COBALT_UpperPillar_|interior_interior)/.test(mesh.name));
    for(const side of [-1,1])for(const z of [.76,.78,.80,.82]){
      const hits=[.4359,.4399,.4439].map(y=>cast(new T.Vector3(0,y,z),new T.Vector3(side,0,0),skin));
      expect(hits.every(Boolean),`continuous pillar skin ${side},${z}`).toBe(true);
      const x=hits.map(hit=>Math.abs(hit!.point.x));
      const lowerSlope=(x[1]-x[0])/.004,upperSlope=(x[2]-x[1])/.004;
      // The final sample crosses the rounded windscreen lip rather than the
      // broad face: allow its curvature, while rejecting the old .21+ kink.
      expect(Math.abs(upperSlope-lowerSlope),`no silhouette kink ${side},${z}`).toBeLessThan(z<.82?.04:.08);
      // Allow the moulding's gentle curvature over this 8 mm strip.
      if(z<.82)expect(hits[0]!.normal!.dot(hits[2]!.normal!),`continuous broad-face shading ${side},${z}`).toBeGreaterThan(Math.cos(4*Math.PI/180));
    }
  });
  it('keeps both windscreen-side pillar edges free of a bulging middle section',()=>{
    for(const side of [-1,1]){
      const skin=surfaces.filter(mesh=>mesh.name===`COBALT_UpperPillar_${side}`||mesh.name===`COBALT_WindscreenPillarSeal_${side}`);
      const frontAt=(y:number)=>{
        let front=-Infinity;
        for(const mesh of skin){
          const p=mesh.geometry.getAttribute('position'),ix=mesh.geometry.index!.array;
          for(let i=0;i<ix.length;i+=3)for(let j=0;j<3;j++){
            const a=new T.Vector3().fromBufferAttribute(p,ix[i+j]),b=new T.Vector3().fromBufferAttribute(p,ix[i+(j+1)%3]);
            if((a.y>=y)===(b.y>=y))continue;
            front=Math.max(front,T.MathUtils.lerp(a.z,b.z,(y-a.y)/(b.y-a.y)));
          }
        }
        expect(Number.isFinite(front),`pillar section ${side},${y}`).toBe(true);return front;
      };
      const bottom=frontAt(.46),top=frontAt(.64);
      for(const y of [.48,.50,.52,.54,.56,.58,.60,.62]){
        const chord=T.MathUtils.lerp(bottom,top,(y-.46)/.18);
        // A gentle taper is allowed; the former pinned donor section bulged
        // over 60 mm beyond this line despite having smooth local tangents.
        expect(Math.abs(frontAt(y)-chord),`straight pillar edge ${side},${y}`).toBeLessThan(.015);
      }
    }
  });
  it('forms a passenger shelf with real depth behind its rolled upper edge',()=>{
    for(const x of [-.54,-.42,-.30]){
      const back=cast(new T.Vector3(x,0,.50),new T.Vector3(0,0,1));
      const brow=cast(new T.Vector3(x,.09,.50),new T.Vector3(0,0,1));
      expect(back?.object.name,`recessed shelf at ${x}`).toBe('COBALT_PassengerShelfInterior');
      expect(brow).toBeDefined();
      expect(back!.point.z-brow!.point.z,`usable shelf depth at ${x}`).toBeGreaterThan(.11);
      expect(back!.point.z-brow!.point.z).toBeLessThan(.23);
    }
  });
  it('keeps the inner roof and upper A-pillar continuous pale trim on both sides',()=>{
    for(const side of [-1,1])for(const [x,y,z]of [[.585,.695,.08],[.60,.68,.18],[.61,.63,.31],[.62,.58,.43]]){
      const eye=new T.Vector3(side*.31,.56,0),target=new T.Vector3(side*x,y,z);
      expect(cast(eye,target.sub(eye).normalize())?.object.userData.material,`pale inner rail ${side},${x},${y},${z}`).toBe('COBALT_Headliner');
    }
  });
  it('keeps the pale roof-rail lining below the metal and its seal gaps',()=>{
    const roof=surfaces.filter(mesh=>/^chassis_primary/.test(mesh.name)&&mesh.userData.material==='Realistic_Car_Paint');
    let checked=0;const seen=new Set<string>();
    for(const mesh of surfaces.filter(mesh=>/^(chassis_|interior_1|door_[lr][fr])/.test(mesh.name)&&mesh.userData.material==='COBALT_Headliner')){
      const p=mesh.geometry.getAttribute('position');
      const used=new Set(mesh.geometry.index?.array??Uint32Array.from({length:p.count},(_,i)=>i));
      for(const i of used){
        const point=new T.Vector3().fromBufferAttribute(p,i);
        if(point.y<.64||Math.abs(point.x)<.42||Math.abs(point.x)>.74||point.z< -1.25||point.z>0)continue;
        const key=point.toArray().map(v=>Math.round(v*1e6)).join(',');if(seen.has(key))continue;seen.add(key);
        let support=cast(new T.Vector3(point.x,1.5,point.z),new T.Vector3(0,-1,0),roof);
        if(!support)for(const inset of [.005,.01,.02,.04,.06]){
          support=cast(new T.Vector3(point.x-Math.sign(point.x)*inset,1.5,point.z),new T.Vector3(0,-1,0),roof);
          if(support&&support.point.y>.65)break;
        }
        if(!support||support.point.y<.65||support.face!.normal.y<.5)continue;
        expect(support.point.y-point.y,`roof lining clearance ${mesh.name} ${point.toArray()}`).toBeGreaterThan(.001);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
  it('covers exterior paint at the door-card jambs and beside the rear bench',()=>{
    for(const side of [-1,1]){
      for(const y of [-.25,-.12,.02,.18]){
        const hit=cast(new T.Vector3(side*.60,y,-.287),new T.Vector3(side,0,0));
        expect(hit?.object.userData.material,`closed door-card jamb ${side},${y}`).toBe('COBALT_LowerDash');
      }
      for(const [y,z]of [[.15,-1.25],[.18,-1.35],[.20,-1.44]]){
        const hit=cast(new T.Vector3(side*.60,y,z),new T.Vector3(side,0,0));
        expect(hit?.object.name,`closed rear-quarter lining ${side},${y},${z}`).toBe(`COBALT_RearQuarterPanel_${side}`);
      }
    }
  });
  it('shares smooth normals where the dashboard sections join beside the instrument hood',()=>{
    const mesh=surfaces.find(mesh=>mesh.name==='COBALT_MouldedDashboard')!,p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal');
    const indices=mesh.geometry.index?.array??Uint32Array.from({length:p.count},(_,i)=>i),edges=new Map<string,Array<{a:number;b:number;face:T.Vector3}>>();
    const points=Array.from({length:p.count},(_,i)=>new T.Vector3().fromBufferAttribute(p,i)),keys=points.map(p=>p.toArray().map(v=>Math.round(v*1e6)).join(','));
    for(let i=0;i<indices.length;i+=3){
      const ids=[indices[i],indices[i+1],indices[i+2]],face=points[ids[1]].clone().sub(points[ids[0]]).cross(points[ids[2]].clone().sub(points[ids[0]])).normalize();
      for(let j=0;j<3;j++){const a=ids[j],b=ids[(j+1)%3],key=[keys[a],keys[b]].sort().join('|'),adjacent=edges.get(key)??[];adjacent.push({a,b,face});edges.set(key,adjacent);}
    }
    let checked=0;
    for(const [key,adjacent]of edges){
      if(adjacent.length!==2)continue;
      const [a,b]=adjacent;if(keys[a.a]!==keys[b.b]||keys[a.b]!==keys[b.a]||a.face.dot(b.face)<=.5)continue;
      for(const [i,j]of [[a.a,b.b],[a.b,b.a]])expect(new T.Vector3().fromBufferAttribute(n,i).distanceTo(new T.Vector3().fromBufferAttribute(n,j)),`dashboard shading seam ${key}`).toBeLessThan(1e-5);
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });
  it('keeps both exterior door shoulders painted below the window seals',()=>{
    for(const side of [-1,1])for(const y of [.28,.30,.315])for(const z of [-.1,.1,.3,.5]){
      const hit=cast(new T.Vector3(side*1.2,y,z),new T.Vector3(-side,0,0));
      expect(hit?.object.userData.material,`painted outer door shoulder ${side},${y},${z}`).toBe('Realistic_Car_Paint');
    }
  });
  it('faces the physical mirror switch toward the driver and leaves its controls unobstructed',()=>{
    const legends=surfaces.find(mesh=>mesh.name==='COBALT_MirrorSwitchLegends')!;
    expect(legends).toBeDefined();
    const center=new T.Box3().setFromObject(legends).getCenter(new T.Vector3());
    const normal=new T.Vector3().fromBufferAttribute(legends.geometry.getAttribute('normal'),0).normalize();
    for(const eye of [new T.Vector3(.31,.48,.2),new T.Vector3(.28,.48,.16)]){
      expect(normal.dot(eye.clone().sub(center).normalize()),'legible mirror-switch face').toBeGreaterThan(.9);
      expect(cast(eye,center.clone().sub(eye).normalize())?.object.name).toMatch(/^COBALT_MirrorSwitch/);
    }
  });
  it('leaves dark trim between the mirror-switch bezel and the pale pillar',()=>{
    const supports=surfaces.filter(mesh=>!/^COBALT_MirrorSwitch/.test(mesh.name));
    // Probe 2–3 mm beyond the rounded bezel, including its top and bottom.
    // Removing the control from these rays tests the actual visible backdrop.
    const perimeter=[...[-.016,.016].flatMap(x=>[-.025,-.015,0,.015,.025].map(y=>[x,y])),[0,-.025],[0,.025]];
    for(const eye of [new T.Vector3(.31,.48,.2),new T.Vector3(.28,.48,.16)])for(const [x,y]of perimeter){
      const target=new T.Vector3(x,y,.004).applyMatrix4(mirrorSwitchFrame);
      const backdrop=cast(eye,target.sub(eye).normalize(),supports);
      expect(['COBALT_LowerDash','COBALT_Dashboard','COBALT_Rubber','COBALT_SideMirrorHousing'],`dark bezel clearance ${eye.toArray()},${x},${y}`).toContain(backdrop?.object.userData.material);
    }
  });
  it('matches both door-side pillar returns to the surrounding dark sail trim',()=>{
    for(const side of [-1,1]){
      const eye=new T.Vector3(side*.31,.48,.2),target=new T.Vector3(side*.66148,.38562,.82670);
      expect(cast(eye,target.sub(eye).normalize())?.object.userData.material,`dark door-side pillar return ${side}`).toBe('COBALT_Rubber');
    }
  });
  it('keeps exposed painted shards out of the dark window ledges below both mirrors',()=>{
    for(const side of [-1,1])for(const z of [.44,.50,.55]){
      const eye=new T.Vector3(side*.31,.48,.2),target=new T.Vector3(side*.74,.32,z);
      expect(cast(eye,target.sub(eye).normalize())?.object.userData.material,`inner window ledge ${side},${z}`).toMatch(/^COBALT_(Rubber|Dashboard|SideMirrorHousing)$/);
    }
  });
  it('keeps the mirror-mount joint dark on both sides of the cabin',()=>{
    for(const side of [-1,1]){
      const visible=castPillarPhotoPixel(side,555,594);
      expect(visible?.object.userData.material,`dark mirror-mount joint ${side}`).toBe('COBALT_Rubber');
    }
  });
  it('closes the lower pillar lips beside both door cards',()=>{
    for(const side of [-1,1])for(const [x,y]of [[628,590],[638,615]]){
      const visible=castPillarPhotoPixel(side,x,y);
      expect(['COBALT_Rubber','COBALT_Headliner','COBALT_Dashboard'],`opaque door-side pillar return ${side},${x},${y}`).toContain(visible?.object.userData.material);
    }
  });
  it('covers the exposed outer paint at both windscreen-side pillar returns',()=>{
    for(const side of [-1,1])for(const [x,y]of [[742,535],[753,562]]){
      const visible=castPillarPhotoPixel(side,x,y);
      expect(['COBALT_Headliner','COBALT_Dashboard','COBALT_PillarJoint'],`continuous windscreen-side pillar return ${side},${x},${y}`).toContain(visible?.object.userData.material);
    }
  });
  it('keeps the inward cowl returns dark beside both pillar feet',()=>{
    for(const side of [-1,1])for(const x of [805,810]){
      const visible=castPillarPhotoPixel(side,x,560);
      expect(visible?.object.userData.material,`dark inward cowl return ${side},${x}`).toBe('COBALT_Dashboard');
    }
  });
  it('exposes the high stop lamp through the rear glass without its housing masking the lens',()=>{
    for(const x of [-.08,0,.08]){
      const eye=new T.Vector3(x,.86,-2.6),target=new T.Vector3(x,.488,-1.660);
      expect(cast(eye,target.sub(eye).normalize())?.object.userData.material,`visible high stop lens ${x}`).toBe('COBALT_HIGH_STOP');
    }
  });
  it('fits the photo-reference pillar joint to the curved dashboard on both sides',()=>{
    const dashboard=surfaces.find(mesh=>mesh.name==='COBALT_MouldedDashboard')!;
    const checked=[0,0];
    for(const mesh of surfaces.filter(mesh=>mesh.userData.material==='COBALT_PillarJoint')){
      const position=mesh.geometry.getAttribute('position');
      for(let i=0;i<position.count;i++){
        const point=new T.Vector3().fromBufferAttribute(position,i);
        if(Math.abs(point.x)>.685||point.z<.84||point.z>1.20)continue;
        const support=cast(new T.Vector3(point.x,.7,point.z),new T.Vector3(0,-1,0),[dashboard]);
        if(!support)continue;
        const gap=point.y-support.point.y;
        expect(gap,`pillar joint clearance at ${point.toArray()}`).toBeGreaterThan(.0004);
        expect(gap,`pillar joint clearance at ${point.toArray()}`).toBeLessThan(.0055);
        checked[point.x>0?0:1]++;
      }
    }
    expect(Math.min(...checked)).toBeGreaterThan(5);
  });
  it('keeps the pale pillar feet out of the adjacent dashboard view',()=>{
    const dashboard=surfaces.find(mesh=>mesh.name==='COBALT_MouldedDashboard')!;
    for(const side of [-1,1])for(const x of [.60,.62])for(const z of [.94,.98]){
      const eye=new T.Vector3(side*.31,.48,.2);
      const support=cast(new T.Vector3(side*x,.7,z),new T.Vector3(0,-1,0),[dashboard]);
      expect(support,`dashboard beside pillar ${side},${x},${z}`).toBeDefined();
      const target=support!.point.clone().add(new T.Vector3(0,.006,0));
      const visible=cast(eye,target.sub(eye).normalize());
      expect(visible?.object.userData.material,`unobstructed dashboard beside pillar ${side},${x},${z}`).toBe('COBALT_Dashboard');
    }
  });
  it('closes both outboard windscreen pockets with dashboard plastic',()=>{
    const plastic=surfaces.filter(mesh=>mesh.userData.material==='COBALT_Dashboard');
    const crown=surfaces.filter(mesh=>mesh.name==='COBALT_MouldedDashboard');
    for(const side of [-1,1])for(const x of [.702,.712])for(const z of [1.17,1.22,1.26]){
      const cover=cast(new T.Vector3(side*x,.40,z),new T.Vector3(0,-1,0),plastic);
      const support=cast(new T.Vector3(side*.686,.40,z),new T.Vector3(0,-1,0),crown);
      expect(cover,`closed cowl pocket ${side},${x},${z}`).toBeDefined();
      expect(support).toBeDefined();
      expect(Math.abs(cover!.point.y-support!.point.y)).toBeLessThan(.002);
    }
    for(const side of [-1,1])for(const z of [1.29,1.31]){
      expect(cast(new T.Vector3(side*.74,.40,z),new T.Vector3(0,-1,0),plastic),`closed outer cowl corner ${side},${z}`).toBeDefined();
    }
  });
  it('preserves the painted rim outside the rear glass opening',()=>{
    for(const side of [-1,1])for(const z of [-1.45,-1.6,-1.75]){
      const hit=cast(new T.Vector3(side*.72,2,z),new T.Vector3(0,-1,0));
      expect(hit,`rear outer rim ${side},${z}`).toBeDefined();
      expect(hit?.object.userData.material).not.toMatch(/^COBALT_(ParcelShelf|RearPillarTrim)$/);
    }
  });
  it('retains the source floor and firewall while removing duplicated inner surfaces',()=>{
    const shell=surfaces.filter(mesh=>/^interior_interior(?:[._]|$)/.test(mesh.name));
    expect(shell.length).toBeGreaterThan(0);
    const floor=cast(new T.Vector3(0,-.2,.4),new T.Vector3(0,-1,0),shell);
    const firewall=cast(new T.Vector3(.3,-.2,.5),new T.Vector3(0,0,1),shell);
    expect(floor?.point.y).toBeCloseTo(-.41315,3);
    expect(firewall?.point.z).toBeCloseTo(1.18286,3);
  });
  it('reveals the headliner instead of the duplicate black inner ceiling',()=>{
    for(const x of [-.3,0,.3])for(const z of [-.65,-.3]){
      const hit=cast(new T.Vector3(x,.5,z),new T.Vector3(0,1,0));
      expect(hit?.object.userData.material,`ceiling at ${x},${z}`).toBe('COBALT_Headliner');
    }
  });
  it('keeps the old rear-seat sheet out of the reconstructed cloth backrest',()=>{
    for(const x of [-.39,0,.39])for(const y of [.05,.2]){
      const hit=cast(new T.Vector3(x,y,-.7),new T.Vector3(0,0,-1));
      expect(hit?.object.userData.material,`rear backrest at ${x},${y}`).toBe('COBALT_SeatFabric');
    }
  });
  it('uses light pillar trim while keeping the closed wheel-well cabin lining',()=>{
    for(const side of [-1,1]){
      const eye=new T.Vector3(side*.31,.48,.2),target=new T.Vector3(side*.591,.491,.641);
      const pillar=cast(eye,target.sub(eye).normalize());
      expect(pillar?.object.userData.material,`pillar trim ${side}`).toBe('COBALT_Headliner');
      for(const [y,z]of [[.30,.88],[.27,1.04]]){
        const foot=cast(eye,new T.Vector3(side*.64,y,z).sub(eye).normalize());
        expect(['COBALT_Headliner','COBALT_PillarJoint','COBALT_Dashboard'],`continuous pillar/dashboard joint ${side},${y},${z}`).toContain(foot?.object.userData.material);
      }
      const arch=cast(new T.Vector3(side*.58,.20,-1.13),new T.Vector3(0,-1,0));
      expect(arch?.object.userData.material,`rear inner arch ${side}`).toBe('COBALT_RearWheelWellLining');
      const walls=surfaces.filter(mesh=>/^COBALT_RearWheelWell/.test(mesh.userData.material));
      const exterior=cast(new T.Vector3(side*.58,-.2,-1.13),new T.Vector3(0,1,0),walls);
      expect(exterior?.object.userData.material,`rear outer arch ${side}`).toBe('COBALT_RearWheelWellOuter');
    }
  });
  it('shows cloth on both front cushions and the rear bench',()=>{
    for(const side of [-1,1])for(const dx of [-.10,0,.10])for(const z of [.08,.25,.42]){
      const hit=cast(new T.Vector3(side*.325+dx,.05,z),new T.Vector3(0,-1,0));
      expect(hit?.object.userData.material,`front cushion ${side},${dx},${z}`).toBe('COBALT_SeatFabric');
    }
    for(const x of [-.4,0,.4])for(const z of [-1.0,-.87]){
      const hit=cast(new T.Vector3(x,.2,z),new T.Vector3(0,-1,0));
      expect(hit?.object.userData.material,`rear cushion ${x},${z}`).toBe('COBALT_SeatFabric');
    }
  });
  it('keeps the upholstery just above the real padding without clipping or floating',()=>{
    const bolsters=surfaces.filter(mesh=>/^COBALT_(Rear)?SeatBolster$/.test(mesh.userData.material));
    let checked=0;
    for(const mesh of surfaces.filter(mesh=>mesh.userData.material==='COBALT_SeatFabric')){
      const position=mesh.geometry.getAttribute('position'),normal=mesh.geometry.getAttribute('normal');
      for(let i=0;i<position.count;i++){
        const point=new T.Vector3().fromBufferAttribute(position,i),n=new T.Vector3().fromBufferAttribute(normal,i).normalize();
        let direction:T.Vector3;
        if(/SeatCushion/.test(mesh.name))direction=new T.Vector3(0,1,0);
        else if(/SeatInsert/.test(mesh.name)&&point.z>-.5)direction=new T.Vector3(0,Math.sin(.17),Math.cos(.17));
        else if(point.z<-.8&&n.y>.8)direction=new T.Vector3(0,1,0);
        else if(point.z< -1.2&&n.dot(new T.Vector3(0,Math.sin(.16),Math.cos(.16)))>.8)direction=new T.Vector3(0,Math.sin(.16),Math.cos(.16));
        else continue;
        let supportName:string|undefined;
        if(mesh.name==='COBALT_RearSeatCushion')supportName='COBALT_RearSeatBase';
        else if(/^COBALT_RearSeatInsert_/.test(mesh.name))supportName='COBALT_RearSeatBack';
        else if(/^COBALT_-?1_SeatCushion$/.test(mesh.name))supportName=`COBALT_SeatBase_${mesh.name.includes('_-1_')?-1:1}`;
        else if(/^COBALT_SeatInsert_/.test(mesh.name))supportName=mesh.name.replace('SeatInsert','SeatBack');
        // A cushion's rear edge can sit beneath the backrest at the seat joint.
        // Compare each panel with its own padding rather than that other part.
        const support=bolsters.find(mesh=>mesh.name===supportName);
        const hit=cast(point.clone().addScaledVector(direction,.1),direction.clone().negate(),support?[support]:bolsters);
        expect(hit,`padding beneath ${mesh.name} vertex ${i}`).toBeDefined();
        const gap=point.sub(hit!.point).dot(direction);
        expect(gap,`cloth clearance ${mesh.name} vertex ${i}`).toBeGreaterThan(.0005);
        expect(gap,`cloth clearance ${mesh.name} vertex ${i}`).toBeLessThan(.004);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
  it('closes the seat backs across the UV seam and the end caps',()=>{
    for(const side of [-1,1]){
      const mesh=surfaces.find(mesh=>mesh.name===`COBALT_SeatBack_${side}`)!;
      expect(mesh,`seat back ${side}`).toBeDefined();
      const p=mesh.geometry.getAttribute('position'),indices=mesh.geometry.index?.array??Uint32Array.from({length:p.count},(_,i)=>i);
      const keys=Array.from({length:p.count},(_,i)=>new T.Vector3().fromBufferAttribute(p,i).toArray().map(n=>Math.round(n*1e6)).join(','));
      const edges=new Map<string,Array<[string,string]>>();
      for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){
        const from=keys[indices[i+j]],to=keys[indices[i+(j+1)%3]];
        if(from===to)continue;
        const key=[from,to].sort().join('|'),adjacent=edges.get(key)??[];
        adjacent.push([from,to]);edges.set(key,adjacent);
      }
      for(const [key,adjacent]of edges){
        expect(adjacent.length,`closed seat ${side} edge ${key}`).toBe(2);
        expect(adjacent[0][0],`consistent seat ${side} winding`).toBe(adjacent[1][1]);
      }
    }
  });
  it('exposes the defrost slots above the dashboard crown',()=>{
    const dashboard=surfaces.filter(mesh=>/^COBALT_MouldedDashboard(?:Cowl)?$/.test(mesh.name));
    for(const side of [-1,1])for(const z of [1.055,1.079,1.103]){
      const origin=new T.Vector3(side*.43,.6,z),direction=new T.Vector3(0,-1,0),visible=cast(origin,direction),support=cast(origin,direction,dashboard);
      expect(visible?.object.name,`defrost slot ${side},${z}`).toBe(`COBALT_DefrostGrille_${side}`);
      expect(support).toBeDefined();
      const gap=visible!.point.y-support!.point.y;
      expect(gap).toBeGreaterThan(.0003);expect(gap).toBeLessThan(.0015);
    }
  });
  it('joins the front cowl to the dashboard and keeps its narrow seal against the glass',()=>{
    const cowl=surfaces.find(mesh=>mesh.name==='COBALT_MouldedDashboardCowl')!,seal=surfaces.find(mesh=>mesh.name==='COBALT_WindscreenLowerSeal')!;
    expect(cowl).toBeDefined();expect(seal).toBeDefined();
    const dashboard=surfaces.filter(mesh=>mesh.name==='COBALT_MouldedDashboard'),p=cowl.geometry.getAttribute('position');
    let rear=0,front=0;
    for(let i=0;i<p.count;i++){
      const point=new T.Vector3().fromBufferAttribute(p,i);
      if(Math.abs(point.x)>.68)continue;
      if(Math.abs(point.y-.345)<1e-6){
        const hit=cast(point.clone().add(new T.Vector3(0,0,-.01)),new T.Vector3(0,0,1),glazing);
        expect(hit,`glazed cowl edge ${point.toArray()}`).toBeDefined();
        expect(hit!.point.z-point.z).toBeGreaterThan(.0005);expect(hit!.point.z-point.z).toBeLessThan(.003);front++;
      }
      const hit=cast(new T.Vector3(point.x,.6,point.z),new T.Vector3(0,-1,0),dashboard);
      if(hit&&Math.abs(point.y-hit.point.y)<.0003)rear++;
    }
    expect(front).toBeGreaterThan(40);expect(rear).toBeGreaterThan(40);
    expect(new T.Box3().setFromObject(seal).getSize(new T.Vector3()).y).toBeLessThan(.005);
  });
  it('lays the shift-pattern plate above its knob cap without sinking or floating',()=>{
    const knob=surfaces.find(mesh=>mesh.name==='COBALT_ShiftKnob');
    const supports=knob?[knob]:surfaces.filter(mesh=>mesh.userData.material==='COBALT_LowerDash');
    for(const [x,dz]of [[0,0],[.012,.012],[-.012,.012],[.012,-.012],[-.012,-.012]]){
      const origin=new T.Vector3(x,.05,.482+dz),direction=new T.Vector3(0,-1,0),visible=cast(origin,direction),support=cast(origin,direction,supports);
      expect(visible?.object.userData.material,`shift pattern ${x},${dz}`).toBe('COBALT_ManualShiftPattern');
      expect(support).toBeDefined();
      const gap=visible!.point.y-support!.point.y;
      expect(gap).toBeGreaterThan(.0003);expect(gap).toBeLessThan(.0015);
    }
  });
});
