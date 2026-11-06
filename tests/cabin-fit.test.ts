import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import * as T from 'three';

const surfaces:T.Mesh[]=[],material=new T.MeshBasicMaterial({side:T.DoubleSide});
const mirrorSwitchFrame=new T.Matrix4();
beforeAll(async()=>{
  const doc=await new NodeIO().registerExtensions(ALL_EXTENSIONS).read('public/assets/cobalt.glb');
  const r=doc.getRoot().getExtras().cobaltRefinement as {sourceOffset:number;sourceScale:number};
  const normalize=new T.Matrix4().compose(new T.Vector3(0,r.sourceOffset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3().setScalar(r.sourceScale));
  const mirrorSwitch=doc.getRoot().listNodes().find(node=>node.getName()==='COBALT_MIRROR_SWITCH');
  expect(mirrorSwitch,'physical mirror-switch assembly').toBeDefined();
  mirrorSwitchFrame.copy(normalize).multiply(new T.Matrix4().fromArray(mirrorSwitch!.getWorldMatrix()));
  for(const node of doc.getRoot().listNodes())for(const p of node.getMesh()?.listPrimitives()??[]){
    const source=p.getMaterial();if(!source||source.getAlphaMode()==='BLEND')continue;
    const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(p.getAttribute('POSITION')!.getArray()!,3));
    if(p.getAttribute('NORMAL'))geometry.setAttribute('normal',new T.Float32BufferAttribute(p.getAttribute('NORMAL')!.getArray()!,3));
    if(p.getIndices())geometry.setIndex(Array.from(p.getIndices()!.getArray()!));
    geometry.applyMatrix4(normalize.clone().multiply(new T.Matrix4().fromArray(node.getWorldMatrix())));
    const mesh=new T.Mesh(geometry,material);mesh.name=node.getName();mesh.userData.material=source.getName();mesh.userData.doubleSided=source.getDoubleSided();mesh.updateMatrixWorld();surfaces.push(mesh);
  }
});
afterAll(()=>{surfaces.forEach(mesh=>mesh.geometry.dispose());material.dispose();});
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
      expect(['COBALT_LowerDash','COBALT_Dashboard','COBALT_Rubber'],`dark bezel clearance ${eye.toArray()},${x},${y}`).toContain(backdrop?.object.userData.material);
    }
  });
  it('matches both door-side pillar returns to the surrounding grey trim',()=>{
    for(const side of [-1,1]){
      const eye=new T.Vector3(side*.31,.48,.2),target=new T.Vector3(side*.66148,.38562,.82670);
      expect(cast(eye,target.sub(eye).normalize())?.object.userData.material,`grey door-side pillar return ${side}`).toBe('COBALT_Dashboard');
    }
  });
  it('keeps exposed painted shards out of the dark window ledges below both mirrors',()=>{
    for(const side of [-1,1])for(const z of [.44,.50,.55]){
      const eye=new T.Vector3(side*.31,.48,.2),target=new T.Vector3(side*.74,.32,z);
      expect(cast(eye,target.sub(eye).normalize())?.object.userData.material,`inner window ledge ${side},${z}`).toMatch(/^COBALT_(Rubber|Dashboard)$/);
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
    const dashboard=surfaces.find(mesh=>mesh.name==='COBALT_MouldedDashboard')!;
    for(const side of [-1,1])for(const z of [1.055,1.079,1.103]){
      const origin=new T.Vector3(side*.43,.6,z),direction=new T.Vector3(0,-1,0),visible=cast(origin,direction),support=cast(origin,direction,[dashboard]);
      expect(visible?.object.name,`defrost slot ${side},${z}`).toBe(`COBALT_DefrostGrille_${side}`);
      expect(support).toBeDefined();
      const gap=visible!.point.y-support!.point.y;
      expect(gap).toBeGreaterThan(.0003);expect(gap).toBeLessThan(.0015);
    }
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
