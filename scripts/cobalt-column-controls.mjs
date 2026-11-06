import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Reconstructed from the supplied Cobalt/Ravon R4 switch-part photographs.
 * The mounting boxes are concealed by the column shroud in the installed car. */
export async function buildColumnControls({doc,root,mats,material,svgTexture,emit}){
  const plastic=material('COBALT_ColumnPlastic',0x202226,0,.84);
  plastic.setNormalTexture(mats.steering.getNormalTexture()).setNormalScale(.045);
  const cap=material('COBALT_ColumnCaps',0x25272b,0,.88);
  const menu=material('COBALT_IndicatorMenuButton',0x181a1e,0,.86);
  const knurl=material('COBALT_ColumnKnurledRing',0x24262a,0,.88);
  // A fine crossed moulded grip, rather than a bright smooth selector rim.
  const size=256,normals=new Uint8Array(size*size*4);
  const height=(x,y)=>Math.cos(x/size*Math.PI*2*96)*Math.cos(y/size*Math.PI*2*24);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const n=new T.Vector3((height(x-1,y)-height(x+1,y))*.34,(height(x,y-1)-height(x,y+1))*.8,1).normalize();
    normals.set([Math.round((n.x*.5+.5)*255),Math.round((n.y*.5+.5)*255),Math.round((n.z*.5+.5)*255),255],(y*size+x)*4);
  }
  const sharp=(await import('sharp')).default;
  knurl.setNormalTexture(doc.createTexture('Cobalt switch selector knurl').setMimeType('image/png').setImage(await sharp(normals,{raw:{width:size,height:size,channels:4}}).png().toBuffer())).setNormalScale(.4);
  const legend=async(name,art,width=384,height=128)=>material(name,0xe3e4e0,0,.95)
    .setBaseColorTexture(await svgTexture(name,`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><g fill="none" stroke="white" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">${art}</g></svg>`))
    .setAlphaMode('MASK').setAlphaCutoff(.45);
  const indicatorLegend=await legend('COBALT_IndicatorStalkLegend','<path d="M148 65H46m34-34L46 65l34 34M236 65h102m-34-34 34 34-34 34"/>');
  const menuLegend=await legend('COBALT_IndicatorMenuLegend','<text x="192" y="88" fill="white" stroke="none" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="80">MENU</text>');
  const setLegend=await legend('COBALT_IndicatorSetClearLegend','<g fill="white" stroke="none" text-anchor="middle" font-family="Arial" font-weight="bold" font-size="42"><text x="64" y="53">SET/</text><text x="64" y="107">CLR</text></g>',128,128);
  const selectorLegend=await legend('COBALT_IndicatorSelectorLegend','<path d="m28 54 36-33 36 33zm0 24 36 33 36-33z"/>',128,128);
  const wiperLegend=await legend('COBALT_WiperStalkLegend',
    '<path d="M24 161 42 90h108l18 71zM63 153l72-50M228 161l19-71q58-22 116 0l19 71q-77 25-154 0zm77 10 35-69m-60 55q24-24 48 0"/><g fill="white" stroke="none" font-family="Arial" font-weight="bold" font-size="34"><text x="494" y="43">HI</text><text x="494" y="86">LO</text><text x="494" y="129">INT</text><text x="494" y="172">OFF</text><text x="494" y="215">1x</text></g><path d="M470 29h-30m30 43h-30m30 43h-30m30 43h-30m30 43h-30M608 29h105m-105 43h105m-105 43h105m-105 43h105m-105 43h105"/>',768,256);
  const wiperRingLegend=await legend('COBALT_WiperRingLegend','<path d="M18 92 28 44q36-14 72 0l10 48q-46 13-92 0zm46 6 26-49M30 28v-9m22 9v-9m24 9v-9m22 9v-9"/>',128,128);

  // Rounded rectangular cross sections preserve the flat marked face and the
  // broad shank of the real part. Cylinders made the old handles look tubular.
  const sectionRadius=(angle,power)=>Math.sign(angle)*Math.abs(angle)**(2/power);
  const loft=(sections,side,segments=24,power=3)=>{
    const positions=[],uv=[],indices=[],stride=segments+1;
    for(let row=0;row<sections.length;row++){
      const {x=0,y=0,z=0,ry,rz}=sections[row];
      for(let j=0;j<=segments;j++){
        const a=j/segments*Math.PI*2;
        positions.push(side*x,y+ry*sectionRadius(Math.cos(a),power),z+rz*sectionRadius(Math.sin(a),power));
        uv.push(j/segments,row/(sections.length-1));
      }
    }
    const face=(a,b,c)=>indices.push(...(side===1?[a,b,c]:[a,c,b]));
    for(let row=0;row<sections.length-1;row++)for(let j=0;j<segments;j++){
      const a=row*stride+j,b=a+1;face(a,b,a+stride);face(b,b+stride,a+stride);
    }
    for(const [row,end]of [[0,false],[sections.length-1,true]]){
      const {x=0,y=0,z=0}=sections[row],centre=positions.length/3;positions.push(side*x,y,z);uv.push(.5,.5);
      for(let j=0;j<segments;j++){const a=row*stride+j;end?face(centre,a,a+1):face(centre,a+1,a);}
    }
    const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3)).setAttribute('uv',new T.Float32BufferAttribute(uv,2)).setIndex(indices);
    g.computeVertexNormals();return g;
  };
  const bodySections=[{x:0,ry:.009,rz:.010},{x:.008,ry:.011,rz:.0125},{x:.020,ry:.0125,rz:.0145},{x:.072,ry:.0135,rz:.0152},{x:.094,ry:.0138,rz:.0155}];
  const capSections=[{x:.110,ry:.0138,rz:.0155},{x:.119,ry:.0136,rz:.0153},{x:.123,ry:.0118,rz:.0135},{x:.124,ry:.0105,rz:.012}];
  for(const side of [1,-1]){
    const indicator=side===1,label=indicator?'Indicator':'Wiper';
    // Both installed switches mount at the column's upper shoulders. The
    // previous low/inboard wiper mount put its grip behind the lower spoke
    // and below the normal driver's field of view.
    const pivot=doc.createNode(indicator?'COBALT_INDICATOR_STALK':'COBALT_WIPER_STALK').setTranslation([.308+side*.050,.138,.737]);root.addChild(pivot);
    const parts=new Map();
    const add=(geometry,mat,position=[0,0,0],rotation=[0,0,0],frame)=>{
      const transform=new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(1,1,1));
      geometry.applyMatrix4(frame?frame.clone().multiply(transform):transform);
      const list=parts.get(mat)??[];list.push(geometry);parts.set(mat,list);
    };
    const frame=new T.Matrix4().compose(new T.Vector3(side*.050,.006,-.012),new T.Quaternion().setFromEuler(new T.Euler(0,side*.25,side*.12)),new T.Vector3(1,1,1));
    const neck=[
      {x:0,y:0,z:0,ry:.015,rz:.016},{x:.020,y:.002,z:-.004,ry:.012,rz:.013},{x:.046,y:.005,z:-.011,ry:.010,rz:.012},{x:.060,y:.007,z:-.0145,ry:.010,rz:.012},
    ];
    add(loft(neck,side,16,5),plastic);
    const body=loft(bodySections,side),ring=loft([{x:.094,ry:.0136,rz:.0153},{x:.095,ry:.0141,rz:.0158},{x:.109,ry:.0141,rz:.0158},{x:.110,ry:.0138,rz:.0155}],side,32),end=loft(capSections,side);
    const support=new T.Mesh(mergeGeometries([body,ring,end]),new T.MeshBasicMaterial({side:T.DoubleSide}));support.updateMatrixWorld();
    add(body,plastic,[0,0,0],[0,0,0],frame);
    add(ring,knurl,[0,0,0],[0,0,0],frame);
    add(end,cap,[0,0,0],[0,0,0],frame);
    // Deep, narrow selector joints, without the old metallic end rings.
    for(const x of [.094,.110])add(loft([{x:x-.0006,ry:.0136,rz:.0153},{x:x+.0006,ry:.0136,rz:.0153}],side,24),menu,[0,0,0],[0,0,0],frame);
    const decal=(mat,x,width,height,flatZ)=>{
      const g=new T.PlaneGeometry(width,height,flatZ===undefined?12:1,flatZ===undefined?8:1).rotateY(Math.PI),p=g.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const px=p.getX(i)+side*x,y=p.getY(i),u=side*px;
        const hit=flatZ===undefined?new T.Raycaster(new T.Vector3(px,y,-.05),new T.Vector3(0,0,1),0,.1).intersectObject(support)[0]:null;
        if(flatZ===undefined&&!hit)throw new Error(`${label} switch marking misses its moulded support at ${u},${y}`);
        p.setXYZ(i,px,y,flatZ??hit.point.z-.0004);
      }
      g.computeVertexNormals();add(g,mat,[0,0,0],[0,0,0],frame);
    };
    if(indicator){
      decal(indicatorLegend,.022,.025,.010);
      add(new RoundedBoxGeometry(.026,.012,.0025,1,.0015),menu,[side*.057,0,-.0158],[0,0,0],frame);
      decal(menuLegend,.057,.021,.008,-.0173);
      decal(selectorLegend,.084,.008,.011);
      decal(setLegend,.117,.010,.011);
    }else{
      decal(wiperLegend,.048,.083,.020);
      decal(wiperRingLegend,.102,.010,.012);
    }
    support.geometry.dispose();support.material.dispose();
    for(const [mat,geometries]of parts){
      const geometry=mergeGeometries(geometries.map(g=>g.index?g.toNonIndexed():g));
      emit(geometry,mat,`COBALT_Column_${label}_${mat.getName()}`,[0,0,0],[0,0,0],pivot);
    }
  }
}
