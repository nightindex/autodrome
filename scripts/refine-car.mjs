import * as T from 'three';
import sharp from 'sharp';
import { KHRMaterialsSpecular } from '@gltf-transform/extensions';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildCobaltCabin } from './cobalt-cabin.mjs';
import { segmentRearLens } from './cobalt-lamps.mjs';
import { frontGrilleMaterials,interiorTrimMaterials,fitRoofLining,buildRoofSeals,refineCabinRailMaterials } from './cobalt-body.mjs';
import { trimSourceInterior,lineRearWheelWells,refineRearCabinTrim } from './cobalt-interior.mjs';
import { fitFrontPillarFeet } from './cobalt-pillar-fit.mjs';
import { buildMirrorSwitch } from './cobalt-mirror-switch.mjs';
import { buildUpperCabinTrim } from './cobalt-upper-trim.mjs';
import { extractRearGlassExterior,extractSideMirror } from './cobalt-glass.mjs';
import {buildSideMirrorMounts,rebuildSideMirrorShells} from './cobalt-mirror-mount.mjs';

/** Refine the supplied mesh using authored materials/details, without embedding reference photos. */
export async function refineCar(doc){
  const buffer=doc.getRoot().listBuffers()[0],scene=doc.getRoot().listScenes()[0];
  const color=hex=>new T.Color(hex).toArray();
  const material=(name,hex,metal=0,rough=.8,alpha=1)=>doc.createMaterial(name).setBaseColorFactor([...color(hex),alpha]).setMetallicFactor(metal).setRoughnessFactor(rough).setAlphaMode(alpha<1?'BLEND':'OPAQUE');
  const mats={
    plastic:material('COBALT_Dashboard',0x505258,0,.88),rubber:material('COBALT_Rubber',0x282b29,0,.94),
    steering:material('COBALT_Steering',0x292a2e,0,.74),trim:material('COBALT_SatinTrim',0x959894,.45,.34),
    chrome:material('COBALT_Reflectors',0xd8dcdd,.92,.2),gold:material('COBALT_Bowtie',0xc9a04c,.55,.3),
    headliner:material('COBALT_Headliner',0xc1c0b8,0,1),cloth:material('COBALT_SeatFabric',0xc6c9c4,0,.98),
    housing:material('COBALT_LampHousing',0x6e0c18,.2,.32),lens:material('COBALT_RedClearLens',0xffffff,.05,.15,.38),
    brake:material('COBALT_BRAKE',0x950719,.08,.23),tail:material('COBALT_TAIL',0x840714,.08,.25),
    highStop:material('COBALT_HIGH_STOP',0x8b0917,.05,.25),
    reverse:material('COBALT_REVERSE',0xb7c0ba,.15,.22),left:material('COBALT_INDICATOR_LEFT',0xc0c3ba,.15,.25),right:material('COBALT_INDICATOR_RIGHT',0xc0c3ba,.15,.25),
    glass:material('COBALT_Windshield',0xbac8ce,.02,.12,.12),rearGlass:material('COBALT_RearGlass',0x3c4c54,.05,.16,.38),
    mirrorLeft:material('COBALT_SideMirrorLeft',0xaab9bd,.95,.12),mirrorRight:material('COBALT_SideMirrorRight',0xaab9bd,.95,.12),
    mirrorHousing:material('COBALT_SideMirrorHousing',0x282b29,0,.82),
    frontLeft:material('COBALT_FRONT_INDICATOR_LEFT',0xbfc6c7,.55,.25),frontRight:material('COBALT_FRONT_INDICATOR_RIGHT',0xbfc6c7,.55,.25),
    // A single rear pane replaces two blended .38-opacity shell faces.
    rearWindshield:material('COBALT_RearWindshield',0x3c4c54,.05,.16,1-(1-.38)**2),
    frontLens:material('COBALT_HeadlightLens',0xe1e7e7,.05,.1,.09),
    white:material('COBALT_Lettering',0xe8e7df,0,.7),red:material('COBALT_DialRed',0xb83930,0,.6),blue:material('COBALT_DialBlue',0x336b9c,0,.6),
  };
  mats.brake.setEmissiveFactor(color(0x240004));mats.tail.setEmissiveFactor(color(0x120003));
  mats.lens.setDoubleSided(true);mats.glass.setDoubleSided(true);mats.rearGlass.setDoubleSided(true);mats.rearWindshield.setDoubleSided(true);
  const svgTexture=async(name,svg)=>doc.createTexture(name).setMimeType('image/png').setImage(await sharp(Buffer.from(svg)).png().toBuffer());
  const cloth=await svgTexture('Cobalt woven fabric',`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><pattern id="w" width="4" height="4" patternUnits="userSpaceOnUse"><rect width="4" height="4" fill="#a8aaab"/><path d="M0 0h2v2H0zM2 2h2v2H2z" fill="#919497"/><path d="M0 0h4M0 2h4" stroke="#b3b5b6" stroke-width=".45"/></pattern></defs><rect width="256" height="256" fill="url(#w)"/></svg>`);
  mats.cloth.setBaseColorTexture(cloth);
  const optics=await svgTexture('Cobalt lens reflector prisms',`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="384"><defs><pattern id="p" width="12" height="12" patternUnits="userSpaceOnUse"><rect width="12" height="12" fill="#ededed"/><path d="M0 1h12M1 0v12" stroke="#b8b8b8" stroke-width="1"/><path d="M2 10h8" stroke="#d1d1d1" stroke-width="2"/></pattern></defs><rect width="256" height="384" fill="url(#p)"/></svg>`);
  for(const m of [mats.brake,mats.tail,mats.reverse,mats.left,mats.right,mats.frontLeft,mats.frontRight])m.setBaseColorTexture(optics);

  // The runtime uses length normalization and a half turn to orient this source model.
  let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  const originalNodes=[...doc.getRoot().listNodes()];
  for(const node of originalNodes){const matrix=new T.Matrix4().fromArray(node.getWorldMatrix());for(const p of node.getMesh()?.listPrimitives()??[]){const a=p.getAttribute('POSITION');for(let i=0;i<a.getCount();i++){const v=new T.Vector3().fromArray(a.getArray(),i*3).applyMatrix4(matrix);for(let j=0;j<3;j++){min[j]=Math.min(min[j],v.getComponent(j));max[j]=Math.max(max[j],v.getComponent(j));}}}}
  const scale=4.479/(max[2]-min[2]),offset=-.62-min[1]*scale;
  const normalize=new T.Matrix4().compose(new T.Vector3(0,offset,0),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI),new T.Vector3(scale,scale,scale));
  const root=doc.createNode('COBALT_AuthoredDetails').setMatrix(normalize.clone().invert().toArray());scene.addChild(root);
  const worldPoint=(node,accessor,index)=>new T.Vector3().fromArray(accessor.getArray(),index*3).applyMatrix4(new T.Matrix4().fromArray(node.getWorldMatrix())).applyMatrix4(normalize);
  let correctedMeshes=0,linedWheelWellTriangles=0;const interiorRepairs=[];
  const rearWellLining=material('COBALT_RearWheelWellLining',0x777b75,0,.98);
  for(const node of originalNodes){
    const mesh=node.getMesh();if(!mesh)continue;const name=node.getName().replaceAll(' ','_');
    // Replace the whole dashboard rather than layering patches over the source.
    if(/^(steering_ok|painel_|bancos_)/.test(name)){node.setMesh(null);continue;}
    for(const primitive of [...mesh.listPrimitives()]){
      const source=primitive.getMaterial(),position=primitive.getAttribute('POSITION');
      if(/^interior_interior[._]/.test(name)){
        primitive.setMaterial(mats.rubber);
        interiorRepairs.push(trimSourceInterior({doc,buffer,node,primitive,worldPoint,lining:mats.headliner}));
        correctedMeshes++;continue;
      }
      if(source?.getName()==='Realistic_Car_Paint'){
        // The painted shell faces outwards. Rendering its back faces inside
        // the cabin exposed white metal flaps through the fitted roof lining.
        source.setBaseColorFactor([...color(0xeeefeb),1]).setMetallicFactor(.025).setRoughnessFactor(.28).setDoubleSided(false);
        source.getExtension('KHR_materials_clearcoat')?.setClearcoatFactor(.85).setClearcoatRoughnessFactor(.16);
        interiorTrimMaterials({doc,buffer,node,primitive,worldPoint,trim:mats.headliner,belt:mats.rubber});
        correctedMeshes++;continue;
      }
      if(/^chassis_door/.test(name)){
        linedWheelWellTriangles+=lineRearWheelWells({doc,buffer,node,primitive,worldPoint,lining:rearWellLining});
        interiorTrimMaterials({doc,buffer,node,primitive,worldPoint,trim:mats.headliner});continue;
      }
      if(/^bump_front_ok_escape/.test(name)){
        frontGrilleMaterials({doc,buffer,node,primitive,worldPoint,gold:mats.gold,chrome:mats.chrome});correctedMeshes++;continue;
      }
      if(/front_light/.test(source?.getName()??'')){
        source.setBaseColorFactor([...color(0xa6adb0),1]).setMetallicFactor(.85).setRoughnessFactor(.22).setEmissiveFactor([0,0,0]);
        source.getExtension('KHR_materials_emissive_strength')?.setEmissiveStrength(0);
        const side=/left/.test(source.getName())?'LEFT':'RIGHT',kind=/^fara_/.test(name)?'HEADLIGHT':'FOG';
        primitive.setMaterial(source.clone().setName(`COBALT_${kind}_${side}`));correctedMeshes++;continue;
      }
      if(/^fara_fara\.3/.test(name)){
        const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i),groups=new Map();
        for(let i=0;i<indices.length;i+=3){const x=[0,1,2].reduce((sum,j)=>sum+worldPoint(node,position,indices[i+j]).x,0);const mat=x>0?mats.frontLeft:mats.frontRight;const list=groups.get(mat)??[];list.push(indices[i],indices[i+1],indices[i+2]);groups.set(mat,list);}
        for(const [mat,list]of groups)mesh.addPrimitive(primitive.clone().setMaterial(mat).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(buffer)));
        mesh.removePrimitive(primitive);primitive.dispose();correctedMeshes++;continue;
      }
      let target;
      if(/lanterna_glass/.test(name)){
        segmentRearLens({doc,buffer,node,primitive,mats,worldPoint});correctedMeshes++;continue;
      }else if(/^lanternaa/.test(name))target=mats.housing;
      else if(/^lanterna1|^lamp_bump/.test(name))target=mats.chrome;
      else if(/^fara_fara\.4/.test(name))target=mats.frontLens;
      else if(/^fara_escape/.test(name))target=mats.chrome;
      else if(/^ascende_escape|^ascende_(right|left)_rear_light/.test(name)){
        const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:position.getCount()},(_,i)=>i),groups=new Map();
        for(let i=0;i<indices.length;i+=3){
          const center=new T.Vector3();for(let j=0;j<3;j++)center.add(worldPoint(node,position,indices[i+j]));center.multiplyScalar(1/3);
          const side=center.x>0?mats.left:mats.right,y=center.y;
          const m=/^ascende_escape/.test(name)?(y>.222?side:mats.reverse):y>.295?mats.brake:y<.145?mats.tail:y>.222?side:mats.reverse;
          const list=groups.get(m)??[];list.push(indices[i],indices[i+1],indices[i+2]);groups.set(m,list);
        }
        for(const [m,list]of groups){const p=primitive.clone().setMaterial(m).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(buffer));mesh.addPrimitive(p);}
        mesh.removePrimitive(primitive);primitive.dispose();correctedMeshes++;continue;
      }else if(/^luzdefreio_/.test(name))target=mats.highStop;
      else if(/^interior_1/.test(name))target=mats.headliner;
      else if(/^interior_/.test(name))target=mats.rubber;
      else if(/^bancos_(bancos\.?3|painel\.?1)/.test(name))target=mats.cloth;
      else if(/^bancos_right_rear_light/.test(name))target=mats.headliner;
      else if(/^bancos_/.test(name))target=mats.rubber;
      else if(/^pedais_/.test(name))target=mats.rubber;
      else if(/door_.*door_rr_ok/.test(name)){
        // The remaining front-door plastic is the mirror casing, sail and
        // window seals. Use one finish across that assembly, without cutting
        // a material boundary through the source's large support triangles.
        target=/^door_[lr]f/.test(name)?mats.mirrorHousing:mats.plastic;
        if(/^door_[lr]f/.test(name))extractSideMirror({doc,buffer,node,primitive,worldPoint,material:/^door_lf/.test(name)?mats.mirrorLeft:mats.mirrorRight});
        // Remove the old inner door cards before fitting the moulded panels.
        // Keep the window seals, mirror mount and exposed outer door shell.
        const doorPosition=primitive.getAttribute('POSITION'),indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:doorPosition.getCount()},(_,i)=>i),kept=[];
        for(let i=0;i<indices.length;i+=3){const p=new T.Vector3();for(let j=0;j<3;j++)p.add(worldPoint(node,doorPosition,indices[i+j]));p.multiplyScalar(1/3);
          if(!(p.y<.31&&Math.abs(p.x)<.78))kept.push(indices[i],indices[i+1],indices[i+2]);}
        if(indices&&kept.length)primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(buffer));
      }
      else if(/boot_ok_bump_front_ok\.2/.test(name))target=mats.gold;
      else if(/boot_ok_escape/.test(name))target=mats.chrome;
      else if(source?.getName()==='Car_windshield_glass'){
        if(/^windscreen/.test(name)){
          const indices=primitive.getIndices().getArray(),front=[],rear=[];
          for(let i=0;i<indices.length;i+=3){const z=(worldPoint(node,position,indices[i]).z+worldPoint(node,position,indices[i+1]).z+worldPoint(node,position,indices[i+2]).z)/3;(z<-.7?rear:front).push(indices[i],indices[i+1],indices[i+2]);}
          for(const [list,m]of [[front,mats.glass],[rear,mats.rearWindshield]])if(list.length){
            const pane=primitive.clone().setMaterial(m).setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(list)).setBuffer(buffer));
            // Render one continuous sheet from either side. A closed blended
            // shell adds an inner reflection, with mismatched rim normals.
            if(m===mats.rearWindshield)extractRearGlassExterior({doc,buffer,node,primitive:pane,worldPoint});
            mesh.addPrimitive(pane);
          }
          mesh.removePrimitive(primitive);primitive.dispose();correctedMeshes++;continue;
        }
        target=/door_[rl]r/.test(name)?mats.rearGlass:mats.glass;
      }
      else if(/^roda.*roda/.test(name)&&source?.getName()==='roda.026')target=mats.trim;
      if(target){primitive.setMaterial(target);correctedMeshes++;}
      // Keep the seats and tunnel, removing the source automatic shifter.
      if(/^bancos_/.test(name)){
        const indices=primitive.getIndices()?.getArray();if(!indices)continue;const kept=[];
        for(let i=0;i<indices.length;i+=3){const p=new T.Vector3();for(let j=0;j<3;j++)p.add(worldPoint(node,position,indices[i+j]));p.multiplyScalar(1/3);
          const shifter=/^bancos_/.test(name)&&Math.abs(p.x)<.065&&p.y>-.27&&p.y<.15&&p.z>.32&&p.z<.78;
          if(!shifter)kept.push(indices[i],indices[i+1],indices[i+2]);
        }
        if(kept.length)primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(kept)).setBuffer(buffer));
        else{mesh.removePrimitive(primitive);primitive.dispose();}
      }
    }
  }

  const batches=new Map();
  const put=(geometry,mat,position=[0,0,0],rotation=[0,0,0],name)=>{
    const matrix=new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(1,1,1));
    if(name){emit(geometry,mat,name,position,rotation);return;}
    geometry.applyMatrix4(matrix);const list=batches.get(mat)??[];list.push(geometry);batches.set(mat,list);
  };
  const emit=(geometry,mat,name,position=[0,0,0],rotation=[0,0,0],parent=root)=>{
    const primitive=doc.createPrimitive().setMaterial(mat);
    for(const [source,semantic,type]of [['position','POSITION','VEC3'],['normal','NORMAL','VEC3'],['uv','TEXCOORD_0','VEC2']]){
      const a=geometry.getAttribute(source);if(a){const values=new Float32Array(a.array);if(source==='uv')for(let i=1;i<values.length;i+=2)values[i]=1-values[i];primitive.setAttribute(semantic,doc.createAccessor().setType(type).setArray(values).setBuffer(buffer));}
    }
    const indices=geometry.index;if(indices)primitive.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices.array)).setBuffer(buffer));
    const node=doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)).setTranslation(position).setRotation(new T.Quaternion().setFromEuler(new T.Euler(...rotation)).toArray());parent.addChild(node);
  };
  const box=(w,h,d,mat,pos,r=[0,0,0])=>put(new RoundedBoxGeometry(w,h,d,2,Math.min(.007,w/6,h/6,d/3)),mat,pos,r);
  const plane=(w,h,mat,pos,tilt=0,name)=>put(new T.PlaneGeometry(w,h),mat,pos,[tilt,Math.PI,0],name);
  const textureMaterial=async(name,svg)=>{const m=material(name,0xffffff,0,.7);m.setBaseColorTexture(await svgTexture(name,svg));return m;};
  await buildCobaltCabin({doc,root,mats,material,svgTexture,put,emit});
  buildSideMirrorMounts({emit,material});
  rebuildSideMirrorShells({doc,buffer,worldPoint,emit});
  buildRoofSeals({nodes:originalNodes,worldPoint,put,material:mats.rubber});
  // Put the lit strip in front of the source stop lamp's opaque cover, inside
  // its factory housing and behind the rear glass, rather than on the glass.
  put(new T.PlaneGeometry(.246,.013),mats.highStop,[0,.488,-1.660],[0,Math.PI,0],'COBALT_HighStopLens');
  // The source fog inserts are open reflector bowls. Close each real bumper
  // aperture with an optical face so emission is visible from the front.
  for(const side of [-1,1]){
    const lamp=doc.getRoot().listMaterials().find(m=>m.getName()===`COBALT_FOG_${side>0?'LEFT':'RIGHT'}`);
    if(lamp)put(new T.CircleGeometry(.045,32),lamp,[side*.674,-.280,2.045],[0,0,0],`COBALT_FogLens_${side}`);
  }
  await buildMirrorSwitch({doc,root,mats,material,svgTexture,emit});
  const pillarJoint=material('COBALT_PillarJoint',0x292c2e,0,1);
  fitFrontPillarFeet({doc,buffer,nodes:originalNodes,worldPoint,lining:mats.headliner,dashboard:mats.plastic,seam:pillarJoint,weatherstrip:mats.rubber});
  const bowtie=new T.Shape();bowtie.moveTo(-.094,-.012);bowtie.lineTo(-.026,-.012);bowtie.lineTo(-.026,-.024);bowtie.lineTo(.026,-.024);bowtie.lineTo(.026,-.012);bowtie.lineTo(.083,-.012);bowtie.lineTo(.094,.012);bowtie.lineTo(.026,.012);bowtie.lineTo(.026,.024);bowtie.lineTo(-.026,.024);bowtie.lineTo(-.026,.012);bowtie.lineTo(-.083,.012);bowtie.closePath();
  put(new T.ExtrudeGeometry(bowtie,{depth:.001,bevelEnabled:true,bevelSize:.0008,bevelThickness:.0008,bevelSegments:2,steps:1}),mats.gold,[0,.05,2.19],[0,0,0],'COBALT_FRONT_BOWTIE');
  const plate=await textureMaterial('COBALT_DemoPlate',`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="192"><rect x="5" y="5" width="758" height="182" rx="12" fill="#eaece8" stroke="#283d42" stroke-width="7"/><text x="365" y="130" fill="#203239" font-family="Arial" font-size="92" text-anchor="middle">AVTODROM</text><path d="M698 35h45v12h-45" fill="#58a8d4"/><path d="M698 50h45v12h-45" fill="#7da764"/><text x="699" y="153" fill="#31515b" font-family="Arial" font-size="35">UZ</text></svg>`);
  box(.439,.112,.008,mats.rubber,[0,-.154,-2.226]);plane(.425,.1,plate,[0,-.154,-2.232]);
  for(const [mat,geometries]of batches){const indexed=geometries.map(g=>g.index?g.toNonIndexed():g);const merged=mergeGeometries(indexed);if(!merged)throw new Error(`Could not batch ${mat.getName()}`);emit(merged,mat,`COBALT_Detail_${mat.getName()}`);}
  refineCabinRailMaterials({doc,buffer,nodes:originalNodes,worldPoint,lining:mats.headliner});
  const fittedRoofVertices=fitRoofLining(doc,buffer,normalize);
  buildUpperCabinTrim({doc,buffer,nodes:originalNodes,worldPoint,lining:mats.headliner,seam:material('COBALT_HeadlinerJoint',0x292b28,0,1),weatherstrip:material('COBALT_CabinWindowSeals',0x1b1c1a,0,1).setDoubleSided(true),put});
  const specular=doc.createExtension(KHRMaterialsSpecular);
  const matte=(name,hex)=>material(name,hex,0,1).setExtension('KHR_materials_specular',specular.createSpecular().setSpecularFactor(.12));
  const rearTrim=refineRearCabinTrim({doc,buffer,nodes:originalNodes,worldPoint,shelf:matte('COBALT_ParcelShelf',0x575b58),lining:matte('COBALT_RearPillarTrim',0xb1b2aa)});
  doc.getRoot().setExtras({...doc.getRoot().getExtras(),cobaltRefinement:{version:19,correctedMeshes,fittedRoofVertices,interiorRepairs,linedWheelWellTriangles,rearTrim,sourceScale:scale,sourceOffset:offset,paintNormals:'dense-edge-connected-fans',rearGlass:'single-double-sided-pane',frontCabin:'photo-fitted-rounded-pillar-feet-and-cowl-seam',columnControls:'cobalt-r4-menu-set-clr-and-wiper-parts',columnMount:'paired-height-beside-rim',interiorMirror:'gm-13585947-live-rear-view',sideMirrors:'source-planar-inserts-live-view',steeringReference:'supplied-manual-cabin-photo-plain-spokes',cabinFit:'mesh-conformed-upholstery',cabinPhotoReference:'user-supplied-2026-manual-exam-car',examMonitor:'16:9-fitted-centre-stack-live-exam-state',depictedModelYear:2026,transmission:'5MT',details:'Source-normal preservation, fitted cabin lining and upholstery; photo-fitted dashboard, charcoal plain-spoke wheel and dash, smaller bowtie, slimmer satin V trim, blue instrument display, neutral etched rotary-control labels and a fitted black examination monitor replacing the CD radio; long moulded Cobalt/R4 switch grips with broad flat shanks, a raised MENU button, SET/CLR end cap, knurled selectors and wiper-speed legends; retained manual console and mesh-conformed grey upholstery'}});
  return {correctedMeshes,fittedRoofVertices,interiorRepairs,linedWheelWellTriangles,rearTrim};
}
