import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Front-door mouldings measured against the Cobalt cabin reference.
 * All surfaces use the car frame: X outboard, Y up, Z toward the windscreen.
 * The visible face is gently compound-curved; material joints follow that
 * face, instead of sitting on top as extruded plaques or circular piping.
 */
export async function buildCobaltFrontDoors({doc,mats,material,svgTexture,put:write}){
  const existing=(name,color,metal=0,rough=.94)=>doc.getRoot().listMaterials().find(m=>m.getName()===name)??material(name,color,metal,rough);
  const lower=existing('COBALT_LowerDash',0x3c3e40);
  const dark=existing('COBALT_CabinRecess',0x1e2022,0,.96);
  const seam=existing('COBALT_CabinSeams',0x2e3032,0,1);
  const insert=existing('COBALT_DoorInsert',0x515250,0,.97);
  const top=existing('COBALT_DoorUpperTrim',0x444644,0,.95);
  const grain=mats.plastic.getNormalTexture();
  if(grain){insert.setNormalTexture(grain).setNormalScale(.075);top.setNormalTexture(grain).setNormalScale(.09);}
  const speaker=existing('COBALT_DoorSpeaker',0xffffff,0,.98);
  speaker.setBaseColorTexture(await svgTexture('COBALT_DoorSpeaker',`<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384"><defs><pattern id="s" width="8" height="7" patternUnits="userSpaceOnUse"><rect width="8" height="7" fill="#393c3c"/><circle cx="2" cy="2" r="1.1" fill="#1d2020"/><circle cx="6" cy="5.5" r="1.1" fill="#1d2020"/></pattern></defs><rect width="384" height="384" fill="url(#s)"/></svg>`));
  const clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp,smooth=T.MathUtils.smoothstep;
  const batches=new Map();
  const put=(g,mat,p=[0,0,0],r=[0,0,0],name)=>{
    if(/COBALT_Door(?:Card|DiagonalJoint|HandleCup|WindowLedge)_/.test(name??'')){write(g,mat,p,r,name);return;}
    g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...r)),new T.Vector3(1,1,1)));
    const list=batches.get(mat)??[];list.push(g);batches.set(mat,list);
  };

  // A regular patch keeps continuous normals across the changing section.
  // Parametric U runs forward and V up; this winding faces into the cabin.
  const patch=(side,fn,nu=48,nv=12,textureScale=1)=>{
    const p=[],uv=[],index=[];
    for(let i=0;i<=nu;i++)for(let j=0;j<=nv;j++){
      const u=i/nu,v=j/nv,point=fn(u,v);p.push(side*point[0],point[1],point[2]);uv.push(u*textureScale,v*textureScale);
      if(i<nu&&j<nv){const a=i*(nv+1)+j,b=a+nv+1;side===1?index.push(a,b,a+1,a+1,b,b+1):index.push(a,a+1,b,a+1,b+1,b);}
    }
    const g=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(p,3)).setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(index);g.computeVertexNormals();return g;
  };
  const box=(w,h,d,mat,p,name,r=.004)=>put(Math.min(w,h,d)<.008?new T.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,1,Math.min(r,w*.23,h*.23,d*.23)),mat,p,[0,0,0],name);
  const reverse=g=>{const indices=g.index;for(let i=0;i<indices.count;i+=3){const a=indices.getX(i);indices.setX(i,indices.getX(i+2));indices.setX(i+2,a);}g.computeVertexNormals();return g;};
  const seamTop=z=>.006+.245*smooth(z,-.265,.755);
  const insertBottom=z=>-.155+.152*smooth(z,-.265,.76);
  const cardTop=z=>z<=.9?.305:.14+.165*Math.sqrt(Math.max(0,1-((z-.9)/.05)**2));
  const cardBottom=z=>z<=.88?-.369+.034*smooth(z,-.21,.88):lerp(-.335,.14,smooth(z,.88,.95));
  const handleRadius=(z,y)=>((Math.abs((z-.514)/.080))**4+(Math.abs((y-.119-.11*(z-.514))/.034))**4)**.25;
  const face=(z,y)=>{
    const length=clamp((z+.27)/1.22,0,1),height=clamp((y+.369)/.674,0,1);
    const insertWeight=smooth(z,-.27,-.23)*(1-smooth(z,.69,.735))*smooth(y,insertBottom(z)-.018,insertBottom(z)+.016)*(1-smooth(y,seamTop(z)-.016,seamTop(z)+.012));
    // Broad convex shoulder, shallow inset, and the actual inward handle cup.
    return .697-.007*Math.sin(length*Math.PI)*Math.sin(height*Math.PI)-.008*insertWeight+.019*(1-smooth(handleRadius(z,y),.50,1.12));
  };
  const band=(side,z0,z1,low,high,offset=0,nu=64,nv=12)=>patch(side,(u,v)=>{
    const z=lerp(z0,z1,u),y=lerp(low(z),high(z),v);return [face(z,y)+offset,y,z];
  },nu,nv);
  const bandPoints=(side,zs,low,high,offset=0,nv=5)=>patch(side,(u,v)=>{
    const z=zs[Math.round(u*(zs.length-1))],y=lerp(low(z),high(z),v);return [face(z,y)+offset,y,z];
  },zs.length-1,nv);
  // Share the exact Z stations along every material boundary. Around the
  // release handle they cluster at the curved aperture, so the same topology
  // describes the inset and cup without overlapping surface triangles.
  const cupZ=Array.from({length:25},(_,i)=>{const a=-Math.PI/2+i*Math.PI/24,s=Math.sin(a);return .514+.080*Math.sign(s)*Math.sqrt(Math.abs(s));});
  const doorZ=[...new Set([...Array.from({length:25},(_,i)=>lerp(-.27,.755,i/24)),...cupZ])].sort((a,b)=>a-b);
  const beforeCup=doorZ.filter(z=>z<=cupZ[0]),afterCup=doorZ.filter(z=>z>=cupZ.at(-1));
  const cupMiddle=z=>.119+.11*(z-.514);
  const cupHalf=z=>.034*Math.max(0,1-((z-.514)/.080)**4)**.25;
  const cupLow=z=>cupMiddle(z)-cupHalf(z),cupHigh=z=>cupMiddle(z)+cupHalf(z);
  const insetLow=z=>insertBottom(z)+.0006,insetHigh=z=>seamTop(z)-.0007;

  for(const side of [-1,1]){
    // Continuous shell and returns preserve the old aperture and mirror fit.
    const front=bandPoints(side,doorZ,cardBottom,z=>insertBottom(z)-.0006,0,6);
    const frontEnd=band(side,.755,.95,cardBottom,cardTop,0,12,10);
    const back=patch(-side,(u,v)=>{const z=lerp(-.27,.95,u);return [-.727,lerp(cardBottom(z),cardTop(z),v),z];},16,2);
    const returns=[];
    const edgeZ=[...doorZ,...Array.from({length:12},(_,i)=>lerp(.755,.95,(i+1)/12))];
    for(const boundary of [cardBottom,cardTop]){const g=patch(side,(u,v)=>{const z=edgeZ[Math.round(u*(edgeZ.length-1))],y=boundary(z);return [lerp(face(z,y),.727,v),y,z];},edgeZ.length-1,1);returns.push(boundary===cardBottom?reverse(g):g);}
    returns.push(patch(side,(u,v)=>{const y=lerp(cardBottom(-.27),cardTop(-.27),u);return [lerp(face(-.27,y),.727,v),y,-.27];},6,1));
    // Two-sided material covers the thin edge returns in both door views.
    const shell=mergeGeometries([front,frontEnd,back,...returns]);
    put(shell,lower,[0,0,0],[0,0,0],`COBALT_DoorCard_${side}`);
    [front,frontEnd,back,...returns].forEach(g=>g.dispose());

    // Retain the fitted window ledge and flange exactly: these close the
    // source body rail without entering the outside-mirror viewing cone.
    const ledge=new RoundedBoxGeometry(.036,.034,.98,2,.007),lp=ledge.getAttribute('position');
    for(let i=0;i<lp.count;i++){
      const z=lp.getZ(i)+.215,t=smooth(z,.38,.52);
      lp.setX(i,lp.getX(i)*lerp(1,.025/.036,t)+side*lerp(.710,.704,t));
      lp.setY(i,lp.getY(i)*lerp(1,.018/.034,t)+lerp(.321,.31,t));lp.setZ(i,z);
    }
    ledge.computeVertexNormals();put(ledge,mats.rubber,[0,0,0],[0,0,0],`COBALT_DoorWindowLedge_${side}`);
    // The return overlaps the inner ledge, but ends before the painted outer
    // shoulder. Its former outboard edge cut through that curve in a long tip.
    box(.028,.002,1.01,mats.rubber,[side*.730,.339,-.10],`COBALT_DoorOuterFlange_${side}`,.001);

    // The photographed diagonal division reaches almost to the sail panel.
    // The seam is a 1.4 mm ribbon following the curved moulding, not a tube.
    put(bandPoints(side,doorZ,z=>seamTop(z)+.0007,cardTop,0,5),top,[0,0,0],[0,0,0],`COBALT_DoorShoulder_${side}`);
    put(bandPoints(side,doorZ,z=>seamTop(z)-.0007,z=>seamTop(z)+.0007,0,1),seam,[0,0,0],[0,0,0],`COBALT_DoorDiagonalJoint_${side}`);
    const insertParts=[];
    // Splitting the rear/front sections on the cup centreline also makes the
    // first and last aperture columns meet exactly, including the indentation.
    for(const zs of [beforeCup,afterCup]){
      const end=zs===beforeCup?cupZ[0]:cupZ.at(-1),fraction=(cupMiddle(end)-insetLow(end))/(insetHigh(end)-insetLow(end));
      const middle=z=>lerp(insetLow(z),insetHigh(z),fraction);
      insertParts.push(bandPoints(side,zs,insetLow,middle,0,5));
      insertParts.push(bandPoints(side,zs,middle,insetHigh,0,5));
    }
    insertParts.push(bandPoints(side,cupZ,insetLow,cupLow,0,5),bandPoints(side,cupZ,cupHigh,insetHigh,0,5));
    put(mergeGeometries(insertParts),insert,[0,0,0],[0,0,0],`COBALT_DoorInset_${side}`);
    insertParts.forEach(g=>g.dispose());
    put(bandPoints(side,doorZ,z=>insertBottom(z)-.0006,z=>insertBottom(z)+.0006,0,1),seam,[0,0,0],[0,0,0],`COBALT_DoorInsetLowerJoint_${side}`);

    // A rounded trapezoid cup is depressed into the insert itself. Radial
    // rows follow the same surface as the surrounding face, giving a real
    // curved transition and a recessed dark floor instead of a raised box.
    const cup=bandPoints(side,cupZ,cupLow,cupHigh,0,8);
    put(cup,dark,[0,0,0],[0,0,0],`COBALT_DoorHandleCup_${side}`);
    const handlePath=new T.CatmullRomCurve3([new T.Vector3(side*.680,.101,.456),new T.Vector3(side*.674,.111,.510),new T.Vector3(side*.680,.130,.568)]);
    // A flattened blade matches the short chrome release lever.
    const blade=new T.TubeGeometry(handlePath,12,.0038,6,false),bp=blade.getAttribute('position');
    for(let i=0;i<bp.count;i++){
      const z=bp.getZ(i),u=clamp((z-.456)/.112,0,1),center=handlePath.getPoint(u);bp.setX(i,center.x+(bp.getX(i)-center.x)*.58);
    }
    blade.computeVertexNormals();put(blade,mats.chrome,[0,0,0],[0,0,0],`COBALT_DoorReleaseHandle_${side}`);

    // The armrest grows out of the lower card. Its rounded section has a
    // broad upward-facing pad, a short rolled edge and a sloping underside.
    const armSection=new T.CatmullRomCurve3([
      new T.Vector3(0,.001,0),new T.Vector3(.42,.002,0),new T.Vector3(.92,-.002,0),
      new T.Vector3(1,-.012,0),new T.Vector3(.94,-.035,0),new T.Vector3(.45,-.060,0),new T.Vector3(0,-.062,0),
    ],true,'centripetal');
    const armTop=z=>-.047+.083*smooth(z,-.23,.56);
    const armWidth=z=>(.043+.034*smooth(z,-.23,.49))*smooth(z,-.25,-.19)*(1-smooth(z,.49,.57));
    const arm=patch(side,(u,v)=>{
      const z=lerp(-.25,.57,u),p=armSection.getPoint(v),fade=smooth(z,-.25,-.19)*(1-smooth(z,.49,.57)),y=armTop(z)+p.y*fade;
      return [face(z,armTop(z))-p.x*armWidth(z)-.001,y,z];
    },24,16);
    put(reverse(arm),lower,[0,0,0],[0,0,0],`COBALT_DoorArmrest_${side}`);
    // Flush switch bed sits on the front half of the pad; the driver has four
    // rockers, the passenger one, as in the supplied photograph.
    const switchZ=.330,switchY=armTop(switchZ)+.003,switchX=face(switchZ,armTop(switchZ))-.039;
    const switchBed=new RoundedBoxGeometry(.042,.0045,.142,1,.001),sp=switchBed.getAttribute('position');
    for(let i=0;i<sp.count;i++)sp.setY(i,sp.getY(i)+armTop(sp.getZ(i)+switchZ)-armTop(switchZ));switchBed.computeVertexNormals();
    put(switchBed,dark,[side*switchX,switchY,switchZ],[0,0,0],`COBALT_DoorSwitchBed_${side}`);
    for(let i=0;i<(side===1?4:1);i++){
      const z=side===1?.277+i*.032:.355,y=armTop(z)+.006;
      box(.026,.005,.025,mats.steering,[side*switchX,y,z],`COBALT_WindowSwitch_${side}_${i}`,.001);
      box(.007,.0008,.0015,insert,[side*switchX,y+.0027,z+.006],`COBALT_WindowSwitchMark_${side}_${i}`,.0002);
    }

    // Long lower pocket: a dark open mouth and a low moulded lip. The front
    // speaker blends into the same panel, without a separate toroidal frame.
    const pocketLow=z=>-.319+.021*smooth(z,-.21,.37);
    const pocketHigh=z=>-.226+.028*smooth(z,-.21,.37);
    put(band(side,-.205,.363,pocketLow,pocketHigh,-.0014,16,3),dark,[0,0,0],[0,0,0],`COBALT_DoorPocketRecess_${side}`);
    const pocketLip=patch(side,(u,v)=>{
      const z=lerp(-.214,.375,u),fade=Math.sin(Math.PI*u)**.35,y=lerp(-.336,-.281+.022*smooth(z,-.21,.37),v);
      return [face(z,y)-.035*fade*Math.sin(Math.PI*v*.7),y,z];
    },20,6);
    put(pocketLip,lower,[0,0,0],[0,0,0],`COBALT_DoorPocketLip_${side}`);
    const grille=patch(side,(u,v)=>{
      const a=u*Math.PI*2,r=.001+v*.998,z=.562+Math.cos(a)*.094*r,y=-.222+Math.sin(a)*.105*r;
      return [face(z,y)-.0014-.0018*(1-r*r),y,z];
    },32,3);
    reverse(grille);
    const gp=grille.getAttribute('position'),guv=grille.getAttribute('uv');for(let i=0;i<gp.count;i++)guv.setXY(i,(gp.getZ(i)-.468)/.188,(gp.getY(i)+.327)/.210);
    put(grille,speaker,[0,0,0],[0,0,0],`COBALT_DoorSpeakerGrille_${side}`);
    const grilleEdge=patch(side,(u,v)=>{
      const a=u*Math.PI*2,r=lerp(1,1.016,v),z=.562+Math.cos(a)*.094*r,y=-.222+Math.sin(a)*.105*r;
      return [face(z,y)-.0008,y,z];
    },32,1);
    reverse(grilleEdge);
    put(grilleEdge,seam,[0,0,0],[0,0,0],`COBALT_DoorSpeakerJoint_${side}`);
  }
  for(const [mat,geometries]of batches){
    const plain=geometries.map(g=>g.index?g.toNonIndexed():g),merged=mergeGeometries(plain);
    write(merged,mat,[0,0,0],[0,0,0],`COBALT_DoorTrim_${mat.getName()}`);
    plain.forEach((g,i)=>{if(g!==geometries[i])g.dispose();});geometries.forEach(g=>g.dispose());
  }
}
