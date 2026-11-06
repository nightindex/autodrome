import * as T from 'three';

/** Electric mirror switch on the driver's triangular sail trim, as photographed. */
export async function buildMirrorSwitch({doc,root,mats,material,svgTexture,emit}){
  const mountingNormal=new T.Vector3(-.960,-.272,-.066).normalize();
  // The factory control sits on an inward-facing pad. A switch coplanar with
  // the door becomes edge-on from the driver's eye and hides its markings.
  const normal=new T.Vector3(-.65,.05,-.758).normalize();
  const up=new T.Vector3(0,1,0).addScaledVector(normal,-normal.y).normalize();
  const right=new T.Vector3().crossVectors(up,normal).normalize();
  const rotation=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,normal));
  // Leave clearance to the pale pillar while staying on the same sail plane.
  const position=new T.Vector3(.6851625,.3489,.8355).addScaledVector(mountingNormal,.020);
  const assembly=doc.createNode('COBALT_MIRROR_SWITCH').setTranslation(position.toArray()).setRotation(rotation.toArray());root.addChild(assembly);
  const part=(geometry,mat,name,position=[0,0,0],rotation=[0,0,0])=>emit(geometry,mat,name,position,rotation,assembly);
  const capsule=new T.Shape(),w=.013,h=.022,r=.010;
  capsule.moveTo(-w+r,-h);capsule.lineTo(w-r,-h);capsule.quadraticCurveTo(w,-h,w,-h+r);
  capsule.lineTo(w,h-r);capsule.quadraticCurveTo(w,h,w-r,h);capsule.lineTo(-w+r,h);
  capsule.quadraticCurveTo(-w,h,-w,h-r);capsule.lineTo(-w,-h+r);capsule.quadraticCurveTo(-w,-h,-w+r,-h);
  const housing=new T.ExtrudeGeometry(capsule,{depth:.003,steps:1,curveSegments:3,bevelEnabled:true,bevelSize:.0008,bevelThickness:.0006,bevelSegments:1}),vertices=housing.getAttribute('position');
  // Extend only the back to meet the original angled trim. The front stays
  // flat and legible, while the wedge closes the gap below the rotated face.
  for(let i=0;i<vertices.count;i++)if(vertices.getZ(i)<.0015){
    const back=-(.020+mountingNormal.dot(right)*vertices.getX(i)+mountingNormal.dot(up)*vertices.getY(i))/mountingNormal.dot(normal);
    vertices.setZ(i,back+vertices.getZ(i));
  }
  housing.computeVertexNormals();part(housing,mats.steering,'COBALT_MirrorSwitchHousing');
  part(new T.BoxGeometry(.017,.006,.002),mats.rubber,'COBALT_MirrorSwitchSelector',[0,.012,.0042]);
  part(new T.RingGeometry(.009,.0102,20),mats.trim,'COBALT_MirrorSwitchBezel',[0,-.009,.004]);
  part(new T.CylinderGeometry(.0088,.0092,.003,20,1),mats.steering,'COBALT_MirrorSwitchKnob',[0,-.009,.005],[Math.PI/2,0,0]);
  const legends=material('COBALT_MirrorSwitchLegend',0xe6e7e2,0,.9).setAlphaMode('MASK').setAlphaCutoff(.5);
  legends.setBaseColorTexture(await svgTexture('Cobalt mirror control legends',`<svg xmlns="http://www.w3.org/2000/svg" width="260" height="440" viewBox="0 0 260 440"><g fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"><path d="m44 79 29-8v35l-29-8zM187 71l29 8v19l-29 8zM86 85h23m42 0h23M101 76l9 9-9 9m58-18-9 9 9 9"/><path d="m130 268-8 13h16zM130 352l-8-13h16zM88 310l13-8v16zm84 0-13-8v16z"/></g><path d="M126 119h8v25h-8z" fill="#fff"/></svg>`));
  part(new T.PlaneGeometry(.026,.044),legends,'COBALT_MirrorSwitchLegends',[0,0,.0067]);
}
