import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { KHRMaterialsSpecular } from '@gltf-transform/extensions';
import { smoothBodyGeometry } from './cobalt-body.mjs';
import { conformSurface } from './cobalt-surfaces.mjs';

/** Factory grey cloth seats and the manual car's floor/tunnel, in metres. */
export async function buildCobaltUpholstery({mats,material,svgTexture,put,emit,doc,root}){
  const bolster=material('COBALT_SeatBolster',0x666865,0,.96),stitch=material('COBALT_SeatStitch',0x424440,0,1);
  // The factory insert has a fine, neutral grey knit. One repeat represents
  // 160 mm of fabric, so its 8-pixel stitch stays 2.5 mm wide on every seat.
  const fabric=await svgTexture('Cobalt factory fine grey woven cloth',`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#747674"/><path d="M1 0v8M5 0v8" stroke="#626561" stroke-width="1"/><path d="M0 1h8M0 5h8" stroke="#858782" stroke-width=".65"/><path d="M1 1l2 2m2 2 2 2M5 1l2 2M1 5l2 2" stroke="#91928d" stroke-width=".7" opacity=".5"/></pattern></defs><rect width="512" height="512" fill="url(#weave)"/></svg>`);
  mats.cloth.setBaseColorTexture(fabric).setBaseColorFactor([.93,.93,.93,1]);
  // The photographed front inserts are charcoal woven cloth against softer
  // grey bolsters. Keep the rear bench's existing fabric and colour separate.
  const frontFabric=await svgTexture('Cobalt front charcoal woven cloth',`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><defs><pattern id="weave" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#4c4f4b"/><path d="M1 0v8M5 0v8" stroke="#373a36" stroke-width="1.1"/><path d="M0 1h8M0 5h8" stroke="#6a6d67" stroke-width=".8"/><path d="M1 1l2 2m2 2 2 2M5 1l2 2M1 5l2 2" stroke="#777a73" stroke-width=".8" opacity=".7"/></pattern></defs><rect width="512" height="512" fill="url(#weave)"/></svg>`);
  const frontCloth=mats.cloth.clone().setBaseColorTexture(frontFabric);
  const weaveUV=(geometry,verticalAxis='z')=>{
    const position=geometry.getAttribute('position'),uv=geometry.getAttribute('uv');
    for(let i=0;i<uv.count;i++)uv.setXY(i,position.getX(i)/.16+.5,(verticalAxis==='z'?position.getZ(i):position.getY(i))/.16+.5);
    return geometry;
  };
  const box=(w,h,d,mat,p,r=[0,0,0],radius=.02,name)=>{
    const g=Math.min(w,h,d)<.01?new T.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,Math.min(w,h,d)<.03?1:2,Math.min(radius,w*.4,h*.4,d*.4));
    put(g,mat,p,r,name);
  };
  const tube=(points,r,mat)=>put(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),24,r,5,false),mat);
  // Continuous padded surfaces replace overlapping rectangular back/bolsters.
  const backProfile=[[-.315,.165,.043],[-.30,.199,.059],[-.24,.217,.067],[-.13,.223,.070],[0,.216,.067],[.12,.208,.064],[.23,.196,.060],[.285,.176,.051],[.312,.145,.032],[.32,.105,.008]];
  const sampleBack=y=>{
    for(let i=1;i<backProfile.length;i++)if(y<=backProfile[i][0]){
      const a=backProfile[i-1],b=backProfile[i],t=T.MathUtils.clamp((y-a[0])/(b[0]-a[0]),0,1);
      return [T.MathUtils.lerp(a[1],b[1],t),T.MathUtils.lerp(a[2],b[2],t)];
    }return backProfile.at(-1).slice(1);
  };
  const lumbar=y=>.011*Math.exp(-(((y+.13)/.15)**2));
  const frontAt=(x,y)=>{const [w,d]=sampleBack(y);return (d+lumbar(y))*Math.pow(Math.max(0,1-Math.pow(Math.abs(x)/w,4)),.25);};
  const insertHalfWidth=y=>{
    const width=.154-.022*Math.max(0,(y-.07)/.13),radius=.035;
    const corner=Math.max(0,Math.abs(y+.035)-(.23-radius));
    return width-radius+Math.sqrt(Math.max(0,radius*radius-corner*corner));
  };
  const cushionHalfWidth=z=>{
    const along=z-.012,radius=along>0?.048:.038;
    const corner=Math.max(0,Math.abs(along)-(.215-radius));
    return .169-radius+Math.sqrt(Math.max(0,radius*radius-corner*corner));
  };
  const seatShell=()=>{
    const vertices=[],uv=[],indices=[],segments=32;
    for(let row=0;row<backProfile.length;row++){
      const [y,w,d]=backProfile[row];
      for(let j=0;j<=segments;j++){
        const angle=j===segments?0:j/segments*Math.PI*2,c=Math.cos(angle),s=Math.sin(angle);
        vertices.push(w*Math.sign(c)*Math.sqrt(Math.abs(c)),y,(d+(s>=0?lumbar(y):0))*Math.sign(s)*Math.sqrt(Math.abs(s)));uv.push(j/segments,row/(backProfile.length-1));
        if(row<backProfile.length-1&&j<segments){const i=row*(segments+1)+j;indices.push(i,i+segments+1,i+1,i+1,i+segments+1,i+segments+2);}
      }
    }
    // Seal the top and lower edge; seams join at identical positions.
    for(const row of [0,backProfile.length-1])for(let j=1;j<segments-1;j++){
      const i=row*(segments+1);indices.push(...(row===0?[i,i+j,i+j+1]:[i,i+j+1,i+j]));
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);
    const smooth=smoothBodyGeometry(g);g.dispose();return smooth;
  };
  box(1.38,.035,2.35,mats.rubber,[0,-.415,-.34],[0,0,0],.012);
  box(.21,.10,1.02,mats.plastic,[0,-.351,.02],[0,0,0],.035);
  // Ribbed rubber mats lie in both footwells, clear of the clutch/brake pedals.
  for(const side of [-1,1]){
    box(.42,.009,.48,mats.rubber,[side*.33,-.39,.65],[0,0,0],.025);
    for(let i=0;i<14;i++)box(.002,.002,.41,mats.steering,[side*.33-.17+i*.026,-.384,.65],[0,0,0],.0005);
    const x=side*.325;
    // Support rails, shaped cushion, separate raised side bolsters and centre cloth.
    for(const dx of [-.16,.16])box(.025,.045,.44,mats.rubber,[x+dx,-.365,.235],[0,0,0],.006);
    // Compensate the imported asset's longitudinal fit for a 520 mm cushion.
    const cushionShape=new RoundedBoxGeometry(.465,.14,.53904,4,.05),cp=cushionShape.getAttribute('position');
    for(let i=0;i<cp.count;i++)if(cp.getY(i)>0)cp.setY(i,cp.getY(i)+.027*(Math.abs(cp.getX(i))/.2325)**4);
    const cushion=smoothBodyGeometry(cushionShape);cushionShape.dispose();
    const pad=new T.PlaneGeometry(1,.43,16,24).rotateX(-Math.PI/2).translate(0,0,.012),pp=pad.getAttribute('position');
    for(let i=0;i<pp.count;i++)pp.setX(i,pp.getX(i)*2*cushionHalfWidth(pp.getZ(i)));
    weaveUV(conformSurface(pad,cushion));
    const cushionSeams=[-1,1].map(side=>{
      const seam=new T.PlaneGeometry(.0009,.43,1,24).rotateX(-Math.PI/2).translate(0,0,.012),p=seam.getAttribute('position');
      for(let i=0;i<p.count;i++)p.setX(i,p.getX(i)+side*(cushionHalfWidth(p.getZ(i))+.00045));
      return conformSurface(seam,cushion,{clearance:.0018});
    });
    // Only the construction join between the insert and its rounded front
    // bolster crosses the cushion; dark thread avoids a contrasting piping.
    const frontJoin=new T.PlaneGeometry(cushionHalfWidth(.227)*2,.0009,16,1).rotateX(-Math.PI/2).translate(0,0,.22745);
    cushionSeams.push(conformSurface(frontJoin,cushion,{clearance:.0018}));
    put(cushion,bolster,[x,-.277,.245],[0,0,0],`COBALT_SeatBase_${side}`);
    put(pad,frontCloth,[x,-.277,.245],[0,0,0],`COBALT_${side}_SeatCushion`);
    for(const seam of cushionSeams)put(seam,stitch,[x,-.277,.245]);
    // Tapered shoulders, lumbar crown and an inset cloth panel follow the same
    // rearward recline. Head restraint rods are almost entirely inside padding.
    const back=new T.Object3D();back.position.set(x,.073,-.13);back.rotation.x=-.17;back.updateMatrix();
    const backPut=(g,mat,name)=>put(g.applyMatrix4(back.matrix),mat,[0,0,0],[0,0,0],name);
    const shell=seatShell();
    const insert=new T.PlaneGeometry(1,.46,14,24),ip=insert.getAttribute('position');
    for(let i=0;i<ip.count;i++){
      const y=ip.getY(i)-.035,u=ip.getX(i)*2,px=u*insertHalfWidth(y);
      ip.setXYZ(i,px,y,frontAt(px,y)+.0015);
    }
    weaveUV(conformSurface(insert,shell,{axis:'z'}),'y');
    // Fit these narrow construction joins to the same support as the cloth,
    // so they cannot float above the mesh along the lumbar curve.
    const backSeams=[-1,1].map(sign=>{
      const seam=new T.PlaneGeometry(.0009,.46,1,24),p=seam.getAttribute('position');
      for(let i=0;i<p.count;i++){
        const y=p.getY(i)-.035;
        p.setXYZ(i,p.getX(i)+sign*(insertHalfWidth(y)+.00045),y,0);
      }
      return conformSurface(seam,shell,{axis:'z',clearance:.0018});
    });
    backPut(shell,bolster,`COBALT_SeatBack_${side}`);backPut(insert,frontCloth,`COBALT_SeatInsert_${side}`);
    backSeams.forEach(seam=>backPut(seam,stitch));
    for(const dx of [-.066,.066]){
      const rod=new T.CylinderGeometry(.004,.004,.052,12).translate(dx,.333,0);
      backPut(rod,mats.chrome,`COBALT_HeadrestPost_${side}_${dx}`);
    }
    backPut(new RoundedBoxGeometry(.235,.205,.12,3,.043).translate(0,.443,-.004),bolster,`COBALT_Headrest_${side}`);
    // Buckle is on the tunnel side; parked belt follows the outer B-pillar.
    box(.029,.05,.035,mats.rubber,[x-side*.256,-.225,-.17],[0,0,side*-.13],.005);
    const red=material(`COBALT_BeltRelease_${side}`,0xa12722,0,.8);box(.022,.008,.027,red,[x-side*.256,-.196,-.17],[0,0,0],.003);
    tube([[side*.65,.53,-.27],[side*.655,.20,-.24],[side*.65,-.29,-.27]],.011,mats.rubber);
  }
  // Full-width rear bench with a separate cushion, back and two head restraints.
  const rearBolster=bolster.clone().setName('COBALT_RearSeatBolster').setRoughnessFactor(1)
    .setBaseColorTexture(fabric).setBaseColorFactor([.78,.80,.78,1])
    .setExtension('KHR_materials_specular',doc.createExtension(KHRMaterialsSpecular).createSpecular().setSpecularFactor(.12));
  const smoothRounded=(...args)=>{const source=new RoundedBoxGeometry(...args),smooth=smoothBodyGeometry(source);source.dispose();return smooth;};
  // The same longitudinal fit leaves this rear cushion 490 mm deep.
  const rearBase=smoothRounded(1.22,.15,.50794,2,.055);
  const rearPad=new T.PlaneGeometry(1.13,.39,20,8).rotateX(-Math.PI/2).translate(0,0,.005);
  weaveUV(conformSurface(rearPad,rearBase));
  weaveUV(rearBase);put(rearBase,rearBolster,[0,-.27,-1.04],[0,0,0],'COBALT_RearSeatBase');
  put(rearPad,mats.cloth,[0,-.27,-1.04],[0,0,0],'COBALT_RearSeatCushion');
  const rearBack=smoothRounded(1.23,.64,.14,2,.045),rearInserts=[];
  for(const x of [-.39,0,.39]){
    const panel=new T.PlaneGeometry(.34,.49,6,12).translate(x,.018,0);
    weaveUV(conformSurface(panel,rearBack,{axis:'z'}),'y');rearInserts.push(panel);
  }
  weaveUV(rearBack,'y');put(rearBack,rearBolster,[0,.077,-1.34],[-.16,0,0],'COBALT_RearSeatBack');
  rearInserts.forEach((panel,i)=>put(panel,mats.cloth,[0,.077,-1.34],[-.16,0,0],`COBALT_RearSeatInsert_${i}`));
  for(const x of [-.39,.39]){
    for(const dx of [-.06,.06])put(new T.CylinderGeometry(.005,.005,.09,10),mats.chrome,[x+dx,.43,-1.40]);
    put(weaveUV(smoothRounded(.22,.145,.09,2,.027),'y'),rearBolster,[x,.515,-1.41],[-.16,0,0]);
  }
  // Handbrake, twin cup wells and the storage recess in the manual tunnel.
  box(.175,.043,.37,mats.plastic,[0,-.305,-.19],[0,0,0],.026);
  const lever=new T.CatmullRomCurve3([new T.Vector3(.058,-.29,-.23),new T.Vector3(.058,-.235,-.13),new T.Vector3(.058,-.23,.005)]);
  put(new T.TubeGeometry(lever,16,.017,10,false),mats.steering);
  put(new T.SphereGeometry(.015,14,8),mats.chrome,[.058,-.229,.015]);
  for(const x of [-.041,.041]){
    put(new T.CylinderGeometry(.033,.027,.026,28),mats.rubber,[x,-.302,-.37]);
    put(new T.TorusGeometry(.033,.003,6,28),mats.plastic,[x,-.286,-.37],[Math.PI/2,0,0]);
  }
}
