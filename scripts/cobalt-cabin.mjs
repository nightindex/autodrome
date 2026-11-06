import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries,mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCobaltUpholstery } from './cobalt-upholstery.mjs';
import { conformSurface } from './cobalt-surfaces.mjs';
import { buildColumnControls } from './cobalt-column-controls.mjs';

/** Modelled from the period Cobalt dashboard photo and GM's 2014 control diagrams.
 * Coordinates are metres in the normalized car frame, +Z forward, +X driver's side.
 */
export async function buildCobaltCabin({doc,root,mats,material,svgTexture,put:add,emit}){
  let centreStack=false;
  const put=(geometry,mat,position=[0,0,0],rotation=[0,0,0],name)=>{
    if(!centreStack){add(geometry,mat,position,rotation,name);return;}
    // Factory radio/console proportions, measured relative to the 398 mm rim
    // and the full dashboard in the reference photograph.
    geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...position),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(1,1,1)));
    geometry.scale(.78,.80,1);add(geometry,mat,[0,0,0],[0,0,0],name);
  };
  const box=(w,h,d,mat,p,r=[0,0,0],radius=.012)=>put(Math.min(w,h,d)<.008?new T.BoxGeometry(w,h,d):new RoundedBoxGeometry(w,h,d,Math.min(w,h,d)<.025?1:2,Math.min(radius,w*.23,h*.23,d*.45)),mat,p,r);
  const plane=(w,h,mat,p,name)=>put(new T.PlaneGeometry(w,h),mat,p,[0,Math.PI,0],name);
  const torus=(radius,tube,mat,p)=>put(new T.TorusGeometry(radius,tube,8,48),mat,p);
  const shaped=(shape,depth,bevel=.005,{bevelSegments=3,curveSegments=12}={})=>{
    const source=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments,curveSegments,steps:1}).translate(0,0,-depth/2);
    source.deleteAttribute('normal');source.deleteAttribute('uv');const g=mergeVertices(source);source.dispose();g.computeVertexNormals();
    const p=g.getAttribute('position'),uv=[];for(let i=0;i<p.count;i++)uv.push(p.getX(i),p.getY(i));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));return g;
  };
  const textureMaterial=async(name,svg)=>{const m=material(name,0xffffff,0,.83);m.setBaseColorTexture(await svgTexture(name,svg));return m;};
  const shape=(points)=>{const s=new T.Shape();s.moveTo(...points[0]);for(const p of points.slice(1))s.lineTo(...p);s.closePath();return s;};
  const dark=material('COBALT_CabinRecess',0x1e2022,0,.96),lower=material('COBALT_LowerDash',0x3c3e40,0,.94);
  const satin=material('COBALT_ConsoleSatin',0x909294,.24,.43),seam=material('COBALT_CabinSeams',0x2e3032,0,1);
  const grain=new Uint8Array(128*128*4);let seed=8721;
  for(let i=0;i<grain.length;i+=4){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const n=(seed/4294967296-.5)*38;grain.set([128+n,128-n*.6,254,255],i);}
  const grainTexture=doc.createTexture('Cobalt moulded plastic grain').setMimeType('image/png').setImage(await (await import('sharp')).default(grain,{raw:{width:128,height:128,channels:4}}).png().toBuffer());
  for(const mat of [mats.plastic,mats.steering,lower])mat.setNormalTexture(grainTexture).setNormalScale(.09);

  // Continuous compound dashboard: a shallow windscreen cowl, broad sculpted
  // passenger brow and softly rolled face. Its width/depth vary together; a
  // constant extruded section looks like a cylinder in the cabin photograph.
  const profile=new T.CatmullRomCurve3([
    new T.Vector3(0,.30,1.245),new T.Vector3(0,.295,1.14),new T.Vector3(0,.284,1.015),
    new T.Vector3(0,.253,.895),new T.Vector3(0,.181,.815),new T.Vector3(0,.062,.812),
    new T.Vector3(0,-.018,.86),new T.Vector3(0,-.105,1.03),new T.Vector3(0,-.14,1.16),
  ],false,'centripetal');
  const hoodCrown=[
    ...new T.CubicBezierCurve(new T.Vector2(-.202,.045),new T.Vector2(-.202,.164),new T.Vector2(-.11,.174),new T.Vector2(.02,.174)).getPoints(32),
    ...new T.CubicBezierCurve(new T.Vector2(.02,.174),new T.Vector2(.157,.174),new T.Vector2(.204,.12),new T.Vector2(.204,.035)).getPoints(32).slice(1),
  ];
  const crownAt=x=>{
    const local=x-.315;
    for(let i=1;i<hoodCrown.length;i++)if(local<=hoodCrown[i].x){const a=hoodCrown[i-1],b=hoodCrown[i];return .182+T.MathUtils.lerp(a.y,b.y,T.MathUtils.clamp((local-a.x)/(b.x-a.x),0,1));}
    return .182+hoodCrown.at(-1).y;
  };
  const dashParts=[];
  const hoodLeft=.109,hoodRight=.523;
  for(const [left,right,start,end,columns]of [[-.695,hoodLeft,0,24,36],[hoodRight,.695,0,24,16],[hoodLeft,hoodRight,0,8,20],[hoodLeft,hoodRight,19,24,20]]){
    const vertices=[],uv=[],indices=[],rows=end-start;
    for(let xIndex=0;xIndex<=columns;xIndex++)for(let j=0;j<=rows;j++){
      const x=left+(right-left)*xIndex/columns,p=profile.getPoint((start+j)/24),edge=Math.abs(x)/.695;
      const crown=.011*Math.cos(x/.695*Math.PI/2),sweep=.04*edge**3;
      // The cowl flows over the instrument hood instead of stopping in a
      // vertical cut at its sides. The aperture remains open in front.
      const brow=.09*Math.exp(-(((x-.315)/.225)**4))*Math.exp(-(((p.z-.955)/.23)**4));
      const row=start+j,middle=start===19||end===8;
      const boundary=x<.315?hoodLeft:hoodRight;
      const sideBlend=1-T.MathUtils.smoothstep(Math.abs(x-boundary),0,.075);
      let join=0,joinY=crownAt(middle?x:boundary),joinZ=.934;
      if(row<=8)join=T.MathUtils.smoothstep(row,6,8)*(middle?1:sideBlend);
      else if(row<19){
        join=sideBlend;const t=(row-8)/11;
        joinY=T.MathUtils.lerp(crownAt(boundary),.103,t);joinZ=T.MathUtils.lerp(.934,.792,t);
      }else{
        join=(1-T.MathUtils.smoothstep(row,19,22))*(middle?1:sideBlend);joinY=.103;joinZ=.792;
      }
      // Continue the join along the hood's side walls. Dropping the blend to
      // zero after row 8 folded the outer dashboard into sharp open wedges.
      vertices.push(x,T.MathUtils.lerp(p.y+crown-.012*edge**4+brow,joinY,join),T.MathUtils.lerp(p.z+sweep,joinZ,join));uv.push(x*24,p.z*24);
      if(xIndex<columns&&j<rows){const i=xIndex*(rows+1)+j;indices.push(i,i+rows+1,i+1,i+1,i+rows+1,i+rows+2);}
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();dashParts.push(g);
  }
  const dashboard=mergeGeometries(dashParts);
  // Fit the thin defrost slots to the real dashboard crown; fixed Y buried
  // them several centimetres beneath the moulded top surface.
  for(const side of [-1,1]){
    const slots=[];
    for(let i=0;i<9;i++){
      const slot=new T.PlaneGeometry(.18,.003,6,1).rotateX(-Math.PI/2).translate(side*.43,0,1.055+i*.006);
      slots.push(conformSurface(slot,dashboard,{clearance:.0008}));
    }
    put(mergeGeometries(slots),dark,[0,0,0],[0,0,0],`COBALT_DefrostGrille_${side}`);
  }
  put(dashboard,mats.plastic,[0,0,0],[0,0,0],'COBALT_MouldedDashboard');
  // Shallow top storage tray seen above the centre vents in the period cabin.
  // Both contours follow the swept cowl rather than floating on a flat plate.
  const traySurface=scale=>{
    const g=new T.PlaneGeometry(2,2,12,8),p=g.getAttribute('position');
    for(let i=0;i<p.count;i++){const u=p.getX(i),v=p.getY(i);p.setXYZ(i,u*.139*Math.sqrt(1-.18*v*v)*scale,0,1.108+v*.055*Math.sqrt(1-.1*u*u)*scale);}
    // Plane XY -> XZ reverses the winding; turn each triangle toward the roof.
    const index=g.index;for(let i=0;i<index.count;i+=3){const a=index.getX(i);index.setX(i,index.getX(i+2));index.setX(i+2,a);}
    return conformSurface(g,dashboard,{clearance:scale===1?.0009:.0013});
  };
  put(traySurface(1),seam,[0,0,0],[0,0,0],'COBALT_DashboardTrayRim');
  put(traySurface(.95),lower,[0,0,0],[0,0,0],'COBALT_DashboardTray');
  box(1.34,.14,.20,lower,[0,-.155,1.025],[0,0,0],.034);

  // Factory centre stack: paired vents, hazard row, framed radio, triangular HVAC layout.
  centreStack=true;
  const stack=new T.Shape();stack.moveTo(-.181,.258);stack.quadraticCurveTo(0,.279,.181,.258);stack.lineTo(.178,-.06);
  stack.bezierCurveTo(.175,-.20,.143,-.258,.075,-.267);stack.quadraticCurveTo(0,-.277,-.075,-.267);stack.bezierCurveTo(-.143,-.258,-.175,-.20,-.178,-.06);stack.closePath();
  put(shaped(stack,.062,.014),lower,[0,0,.805],[0,0,0],'COBALT_CentreStack');
  const bezel=new T.Shape();bezel.moveTo(-.173,.254);bezel.quadraticCurveTo(0,.281,.173,.254);bezel.lineTo(.168,-.068);bezel.quadraticCurveTo(0,-.096,-.168,-.068);bezel.closePath();
  for(const [x0,y0,x1,y1]of [[-.145,.155,-.013,.245],[.013,.155,.145,.245],[-.155,-.075,.155,.153]]){
    const opening=new T.Path();opening.moveTo(x0,y0);opening.lineTo(x1,y0);opening.lineTo(x1,y1);opening.lineTo(x0,y1);opening.closePath();bezel.holes.push(opening);
  }
  put(shaped(bezel,.014,.005),satin,[0,0,.771]);
  const ventPod=new T.Shape();ventPod.moveTo(-.157,.257);ventPod.quadraticCurveTo(0,.272,.157,.257);ventPod.lineTo(.157,.155);ventPod.quadraticCurveTo(0,.133,-.157,.155);ventPod.closePath();
  for(const x of [-.079,.079]){
    const hole=new T.Path();hole.moveTo(x-.063,.162);hole.lineTo(x+.063,.162);hole.lineTo(x+.063,.232);hole.lineTo(x-.063,.232);hole.closePath();ventPod.holes.push(hole);
  }
  put(shaped(ventPod,.012,.008),mats.steering,[0,0,.763]);
  const radioSurround=new T.Shape();radioSurround.moveTo(-.166,.122);radioSurround.quadraticCurveTo(0,.13,.166,.122);radioSurround.lineTo(.165,-.065);radioSurround.quadraticCurveTo(0,-.09,-.165,-.065);radioSurround.closePath();
  put(shaped(radioSurround,.014,.006),satin,[0,0,.765]);
  const vent=(x,y,z,w,h)=>{
    box(w+.012,h+.012,.025,mats.plastic,[x,y,z],[0,0,0],.009);
    box(w,h,.014,dark,[x,y,z-.014],[0,0,0],.008);
    // Louvres sit inside the opening. Previously their forward ends extended
    // beyond the frame, making the outer vents resemble loose ladder rungs.
    for(let i=0;i<5;i++)box(w-.018,.0024,.006,mats.steering,[x,y-h*.33+i*h*.165,z-.019],[.12,0,0],.001);
    box(.018,.004,.004,satin,[x,y-.012,z-.024],[0,0,0],.001);
  };
  vent(-.079,.197,.775,.126,.070);vent(.079,.197,.775,.126,.070);
  centreStack=false;for(const x of [-.6,.6])vent(x,.157,.803,.113,.089);centreStack=true;
  const hazard=await textureMaterial('COBALT_HazardButton',`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="128"><rect width="512" height="128" rx="12" fill="#8b8f89"/><rect x="34" y="32" width="110" height="60" rx="17" fill="#242725"/><rect x="369" y="32" width="110" height="60" rx="17" fill="#242725"/><path d="M256 25l42 72h-84z" fill="#30322e" stroke="#242725" stroke-width="8"/><path d="M256 39l27 47h-54z" fill="none" stroke="#c75b49" stroke-width="6"/><path d="M79 49h22v25H79zM83 49v-8q7-13 14 0v8" fill="none" stroke="#c2c4bc" stroke-width="4"/></svg>`);
  plane(.302,.049,hazard,[0,.127,.750]);
  const radioButtons=[['RADIO / BAND',260,268],['CD / AUX',474,268],['CONFIG',674,268],['TONE',260,336],['FAV 1–2–3',474,336],['INFO',674,336],['BACK',260,404],['MENU / SELECT',474,404],['SEEK  ››',674,404]].map(([text,x,y])=>`<rect x="${x-65}" y="${y-25}" width="172" height="46" rx="8" fill="#2e3236" stroke="#555c63" stroke-width="2"/><text x="${x+20}" y="${y+6}" text-anchor="middle">${text}</text>`).join('');
  const presets=Array.from({length:6},(_,i)=>`<rect x="${145+i*104}" y="177" width="96" height="43" rx="5" fill="#292e32" stroke="#5c646c" stroke-width="2"/><text x="${193+i*104}" y="205" text-anchor="middle">${i+1}</text>`).join('');
  const radio=await textureMaterial('COBALT_FactoryRadio',`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="480"><defs><linearGradient id="p" x2="0" y2="1"><stop stop-color="#36393d"/><stop offset="1" stop-color="#25282c"/></linearGradient></defs><rect width="900" height="480" rx="25" fill="url(#p)"/><rect x="148" y="27" width="603" height="107" rx="8" fill="#123b86" stroke="#171c22" stroke-width="9"/><g fill="#a9dcff" font-family="Arial"><text x="174" y="76" font-size="34">FM 100.7</text><text x="607" y="69" font-size="23">12:35</text><text x="178" y="113" font-size="17">STEREO       FM / AM</text></g><rect x="143" y="148" width="615" height="8" rx="4" fill="#14191f"/><g fill="#c9ced3" font-family="Arial" font-size="20">${presets}${radioButtons}<text x="72" y="142" text-anchor="middle" font-size="15">VOL / ⏻</text><text x="126" y="447" text-anchor="middle" font-size="15">PUSH / MENU</text><text x="807" y="157" text-anchor="middle">⏏</text></g><circle cx="72" cy="82" r="46" fill="#20252a"/><circle cx="127" cy="362" r="57" fill="#20252a"/></svg>`);
  plane(.294,.158,radio,[0,.017,.749]);
  for(const [x,y,r]of [[.122,.068,.014],[.105,-.023,.018]]){
    put(new T.CylinderGeometry(r,r,.012,32),mats.steering,[x,y,.739],[Math.PI/2,0,0]);torus(r,.0012,satin,[x,y,.732]);
  }
  const controlBacklight=material('COBALT_ControlBacklight',0x369ccf,.05,.65);
  const climate=await textureMaterial('COBALT_ClimateLabels',`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="290"><rect width="768" height="290" rx="70" fill="#36383b"/><g stroke="#79c8e9" fill="none" stroke-width="3"><path d="M117 68a57 57 0 0 1 93 0M337 164a57 57 0 0 1 94 0M558 68a57 57 0 0 1 93 0"/><path d="M592 23q24 20 0 40m17-40q24 20 0 40m17-40q24 20 0 40"/></g><g fill="#a9dcff" font-size="21" font-family="Arial"><text x="333" y="139">0 1 2 3 4</text><text x="292" y="68">A/C</text></g><circle cx="310" cy="88" r="9" fill="#23272c"/><rect x="430" y="40" width="60" height="42" rx="17" fill="#272b30"/><path d="M440 59h30m-8-8 9 8-9 8" fill="none" stroke="#a9dcff" stroke-width="3"/><path d="M117 68a57 57 0 0 1 45-22" stroke="#39a7df" stroke-width="9" fill="none"/><path d="M164 46a57 57 0 0 1 46 22" stroke="#b44e3d" stroke-width="9" fill="none"/></svg>`);
  plane(.302,.111,climate,[0,-.168,.756]);
  // The label surface is in front of the moulded stack, rather than buried in
  // it. Knob recesses, grip ridges and pointers remain distinct in cockpit view.
  for(const [x,y]of [[.088,-.15],[0,-.19],[-.088,-.15]]){
    put(new T.CylinderGeometry(.024,.027,.017,32),mats.steering,[x,y,.738],[Math.PI/2,0,0]);torus(.027,.0015,controlBacklight,[x,y,.728]);
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2;box(.0013,.004,.006,dark,[x+Math.sin(a)*.0248,y+Math.cos(a)*.0248,.731],[0,0,-a],.0004);}
    box(.0026,.011,.002,controlBacklight,[x,y+.012,.725],[0,0,0],.0008);
  }

  // Deep passenger shelf with a curved lower lip and a glovebox integrated
  // into the knee bolster, matching the broad recess in the factory photograph.
  centreStack=false;
  const shelf=new T.Shape();shelf.moveTo(-.224,.040);shelf.bezierCurveTo(-.12,.062,.12,.063,.231,.035);shelf.quadraticCurveTo(.247,.015,.224,-.027);shelf.bezierCurveTo(.08,-.061,-.10,-.066,-.225,-.037);shelf.quadraticCurveTo(-.247,.002,-.224,.040);shelf.closePath();
  put(shaped(shelf,.021,.006),dark,[-.427,-.01,.835]);
  const lipCurve=new T.CatmullRomCurve3([new T.Vector3(-.66,-.06,.802),new T.Vector3(-.48,-.069,.787),new T.Vector3(-.29,-.06,.789),new T.Vector3(-.196,-.031,.806)]);
  put(new T.TubeGeometry(lipCurve,32,.007,8,false),lower);
  const glove=new T.Shape();glove.moveTo(-.233,.072);glove.quadraticCurveTo(0,.061,.229,.081);glove.lineTo(.226,-.071);glove.quadraticCurveTo(0,-.104,-.221,-.077);glove.closePath();
  put(shaped(glove,.028,.008),seam,[-.425,-.167,.85]);
  put(shaped(glove,.028,.008).scale(.982,.96,1),lower,[-.425,-.167,.844]);
  box(.086,.019,.007,dark,[-.42,-.116,.822],[0,0,0],.006);
  const emboss=await textureMaterial('COBALT_AirbagEmboss',`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="96"><rect width="512" height="96" fill="#69665f"/><text x="256" y="63" font-family="Arial" font-size="36" letter-spacing="7" text-anchor="middle" fill="#77756e">AIRBAG</text></svg>`);
  plane(.061,.011,emboss,[-.52,.087,.787]);

  // Arched instrument binnacle, recessed face, analogue tachometer and digital speed.
  const hood=new T.Shape();hood.moveTo(-.202,-.077);hood.lineTo(-.202,.045);hood.bezierCurveTo(-.202,.164,-.11,.174,.02,.174);hood.bezierCurveTo(.157,.174,.204,.12,.204,.035);hood.lineTo(.204,-.077);hood.closePath();
  const hole=new T.Path();hole.moveTo(-.184,-.061);hole.lineTo(.184,-.061);hole.lineTo(.184,.038);hole.bezierCurveTo(.182,.137,.10,.148,.015,.148);hole.bezierCurveTo(-.11,.148,-.184,.14,-.184,.039);hole.closePath();hood.holes.push(hole);
  put(shaped(hood,.14,.004),mats.plastic,[.315,.18,.862],[0,0,0],'COBALT_InstrumentHood');
  put(shaped(new T.Shape(hole.getPoints()),.015,.002),dark,[.315,.18,.915]);
  const ticks=Array.from({length:41},(_,i)=>{const a=(-220+i*260/40)*Math.PI/180,r=104,inner=i%5===0?88:97;return `<path d="M${128+Math.cos(a)*inner} ${128+Math.sin(a)*inner}L${128+Math.cos(a)*r} ${128+Math.sin(a)*r}" stroke="${i>32?'#d65d46':'#bdddeb'}" stroke-width="${i%5===0?3:1.3}"/>`;}).join('');
  const numbers=Array.from({length:9},(_,i)=>{const a=(-220+i*260/8)*Math.PI/180;return `<text x="${128+Math.cos(a)*73}" y="${134+Math.sin(a)*73}">${i}</text>`;}).join('');
  const tach=await textureMaterial('COBALT_TachometerFace',`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#111c25"/><circle cx="128" cy="128" r="115" fill="none" stroke="#42bbef" stroke-width="3"/>${ticks}<g fill="#69c8f4" font-family="Arial" font-size="19" text-anchor="middle">${numbers}<text x="128" y="206" font-size="12">x1000 r/min</text></g><circle cx="88" cy="207" r="5" fill="#aa3424"/><path d="M162 201v10m-5-5h10" stroke="#aa3424" stroke-width="3"/></svg>`);
  plane(.145,.145,tach,[.398,.216,.891]);
  put(new T.TorusGeometry(.074,.0013,6,64),controlBacklight,[.398,.216,.889]);
  const needle=new T.BoxGeometry(.0023,.06,.0012);needle.translate(0,.025,0);put(needle,mats.red,[.398,.216,.886],[0,0,-2.269],'COBALT_TACH_NEEDLE');
  put(new T.CylinderGeometry(.007,.007,.003,24),mats.steering,[.398,.216,.883],[Math.PI/2,0,0]);
  const lcd=await textureMaterial('COBALT_DIGITAL_SPEED',`<svg xmlns="http://www.w3.org/2000/svg" width="320" height="192"><rect width="320" height="192" rx="8" fill="#0e2c68"/><text x="132" y="119" fill="#a9dcff" font-size="106" font-family="Arial" text-anchor="middle">0</text><text x="132" y="151" fill="#a9dcff" font-size="24" text-anchor="middle">km/h</text></svg>`);
  lcd.setEmissiveFactor([.012,.04,.07]);plane(.137,.089,lcd,[.237,.218,.891],'COBALT_DIGITAL_SPEED');

  // The selected manual-cabin reference uses plain moulded spokes without
  // switch buttons, with a single satin lower V and a compact gold bowtie.
  const steering=doc.createNode('COBALT_STEERING_ASSEMBLY').setTranslation([.308,.113,.585]).setRotation(new T.Quaternion().setFromEuler(new T.Euler(.30,0,0)).toArray());root.addChild(steering);
  const wheelParts=new Map();
  const wheel=(g,mat,p=[0,0,0],r=[0,0,0])=>{g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...r)),new T.Vector3(1,1,1)));const list=wheelParts.get(mat)??[];list.push(g);wheelParts.set(mat,list);};
  // Tiny emblem bevels need fewer subdivisions than the moulded dashboard.
  const wheelShaped=(outline,depth,bevel)=>shaped(outline,depth,bevel,{bevelSegments:1,curveSegments:5});
  const wheelSatin=material('COBALT_SteeringSatin',0x85898a,.28,.48);
  const wheelSeam=material('COBALT_SteeringSeams',0x24272a,0,.98);
  wheel(new T.TorusGeometry(.178,.021,12,80),mats.steering);
  // Short joins across the leather rim are visible in the supplied close-up.
  for(const angle of [.82,Math.PI-.82]){
    const points=Array.from({length:9},(_,i)=>{const r=.158+i*.005;return new T.Vector3(Math.cos(angle)*r,Math.sin(angle)*r,-Math.sqrt(Math.max(0,.021**2-(r-.178)**2))-.0004);});
    wheel(new T.TubeGeometry(new T.CatmullRomCurve3(points),8,.00065,4,false),wheelSeam);
  }
  const pad=new T.Shape();pad.moveTo(-.079,.062);pad.bezierCurveTo(-.055,.083,.055,.083,.079,.062);pad.quadraticCurveTo(.086,.030,.064,-.050);pad.bezierCurveTo(.058,-.077,.028,-.096,0,-.098);pad.bezierCurveTo(-.028,-.096,-.058,-.077,-.064,-.050);pad.quadraticCurveTo(-.086,.030,-.079,.062);pad.closePath();
  wheel(shaped(pad,.033,.009,{bevelSegments:2,curveSegments:8}),mats.steering,[0,.006,-.017]);
  for(const side of [-1,1]){
    const spoke=new T.Shape();spoke.moveTo(side*.060,.057);spoke.quadraticCurveTo(side*.110,.050,side*.158,.042);spoke.quadraticCurveTo(side*.167,.040,side*.163,.009);spoke.quadraticCurveTo(side*.115,-.009,side*.067,-.025);spoke.closePath();
    wheel(shaped(spoke,.030,.004,{bevelSegments:1,curveSegments:6}),mats.steering,[0,0,.002]);
  }
  const vPath=new T.Path();vPath.moveTo(-.151,.002);vPath.bezierCurveTo(-.126,-.010,-.117,-.031,-.105,-.053);vPath.lineTo(-.041,-.148);vPath.quadraticCurveTo(-.036,-.155,-.027,-.155);vPath.lineTo(.027,-.155);vPath.quadraticCurveTo(.036,-.155,.041,-.148);vPath.lineTo(.105,-.053);vPath.bezierCurveTo(.117,-.031,.126,-.010,.151,.002);
  const vSegments=56,vPoints=vPath.getSpacedPoints(vSegments),vTangents=vPoints.map((p,i)=>vPoints[Math.min(i+1,vSegments)].clone().sub(vPoints[Math.max(0,i-1)]).normalize());
  const vEdges=vPoints.map((p,i)=>{const half=(.006+.012*Math.sin(Math.PI*i/vSegments)**.6)/2,n=new T.Vector2(-vTangents[i].y,vTangents[i].x).multiplyScalar(half);return [p.clone().add(n),p.clone().sub(n)];});
  const lowerV=new T.Shape();lowerV.moveTo(...vEdges[0][0]);
  for(const edge of vEdges.slice(1))lowerV.lineTo(...edge[0]);
  const endCap=vPoints.at(-1).clone().addScaledVector(vTangents.at(-1),.003);
  lowerV.quadraticCurveTo(endCap.x,endCap.y,...vEdges.at(-1)[1]);
  for(const edge of vEdges.slice(0,-1).reverse())lowerV.lineTo(...edge[1]);
  const startCap=vPoints[0].clone().addScaledVector(vTangents[0],-.003);
  lowerV.quadraticCurveTo(startCap.x,startCap.y,...vEdges[0][0]);lowerV.closePath();
  // A moulded backing connects the lower spoke to the hub and rim. The satin
  // face has blunt rounded ends; acute extruded tips produced folded fins.
  wheel(shaped(lowerV,.024,.003,{bevelSegments:1,curveSegments:6}).scale(1.025,1.025,1),mats.steering,[0,0,.004]);
  wheel(shaped(lowerV,.008,.0012,{bevelSegments:1,curveSegments:8}),wheelSatin,[0,0,-.014]);
  const hubSeam=pad.getPoints(42).slice(0,-1).map(p=>new T.Vector3(p.x*.94,p.y*.94+.006,-.043));
  wheel(new T.TubeGeometry(new T.CatmullRomCurve3(hubSeam,true),48,.00055,4,true),wheelSeam);
  const airbag=material('COBALT_SteeringAirbagEmboss',0x2c3033,0,.96)
    .setBaseColorTexture(await svgTexture('COBALT_SteeringAirbagEmboss','<svg xmlns="http://www.w3.org/2000/svg" width="384" height="96"><text x="192" y="68" fill="white" text-anchor="middle" font-family="Arial" font-size="48" letter-spacing="5">AIRBAG</text></svg>'))
    .setAlphaMode('MASK').setAlphaCutoff(.45);
  wheel(new T.PlaneGeometry(.034,.0085).rotateY(Math.PI),airbag,[0,-.069,-.0438]);
  const bowtie=shape([[-.035,-.007],[-.014,-.007],[-.014,-.012],[.014,-.012],[.014,-.007],[.035,-.007],[.039,.007],[.014,.007],[.014,.012],[-.014,.012],[-.014,.007],[-.039,.007]]);
  wheel(wheelShaped(bowtie,.001,.0005).scale(.056/.078,.056/.078,1),mats.chrome,[0,.025,-.045]);wheel(wheelShaped(bowtie,.001,.0005).scale(.056/.078*.88,.056/.078*.85,1),mats.gold,[0,.025,-.047]);
  for(const [mat,geometries]of wheelParts){const merged=mergeGeometries(geometries.map(g=>g.index?g.toNonIndexed():g));emit(merged,mat,`COBALT_Steering_${mat.getName()}`,[0,0,0],[0,0,0],steering);}
  // Column switches have their own roots; turning the rim must not turn them.
  box(.12,.102,.15,mats.steering,[.308,.10,.739],[.30,0,0],.022);
  await buildColumnControls({doc,root,mats,material,svgTexture,emit});
  put(new T.CylinderGeometry(.027,.027,.013,32),mats.steering,[.59,-.007,.785],[Math.PI/2,0,0]);torus(.027,.001,satin,[.59,-.007,.777]);

  // Short manual lever, folded leather gaiter and a properly proportioned knob.
  box(.167,.022,.238,lower,[0,-.289,.482],[0,0,0],.021);
  const vertices=[],indices=[],uv=[],rings=12,sides=32;
  for(let ring=0;ring<=rings;ring++)for(let side=0;side<=sides;side++){
    const t=ring/rings,a=side/sides*Math.PI*2,r=(1-t)*.072+t*.014,fold=Math.sin(a*6+t*5)*.006*Math.sin(Math.PI*t);
    vertices.push(Math.cos(a)*(r+fold),-.278+t*.133,.482+Math.sin(a)*(r*1.38+fold));uv.push(side/sides,t);
    if(ring<rings&&side<sides){const k=ring*(sides+1)+side;indices.push(k,k+sides+1,k+1,k+1,k+sides+1,k+sides+2);}
  }
  const boot=new T.BufferGeometry();boot.setAttribute('position',new T.Float32BufferAttribute(vertices,3));boot.setAttribute('uv',new T.Float32BufferAttribute(uv,2));boot.setIndex(indices);boot.computeVertexNormals();put(boot,mats.steering);
  put(new T.CylinderGeometry(.007,.008,.05,16),mats.chrome,[0,-.125,.482]);
  const knob=new T.SphereGeometry(.027,28,18).scale(1,1.15,1.12),knobPosition=knob.getAttribute('position');
  for(let i=0;i<knobPosition.count;i++)knobPosition.setY(i,Math.min(.020,knobPosition.getY(i)));
  knob.computeVertexNormals();put(knob,lower,[0,-.085,.482],[0,0,0],'COBALT_ShiftKnob');
  const pattern=await textureMaterial('COBALT_ManualShiftPattern',`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#494b46"/><circle cx="128" cy="128" r="118" fill="none" stroke="#c0c3b8" stroke-width="5"/><g stroke="#dadbd2" stroke-width="5"><path d="M65 80v95m63-95v95m63-95v95M65 128h126"/></g><g fill="#dadbd2" font-family="Arial" font-size="36" text-anchor="middle"><text x="65" y="65">1</text><text x="128" y="65">3</text><text x="191" y="65">5</text><text x="65" y="215">2</text><text x="128" y="215">4</text><text x="191" y="215">R</text></g></svg>`);
  put(new T.CircleGeometry(.0195,32),pattern,[0,-.0642,.482],[-Math.PI/2,0,0],'COBALT_ShiftPattern');
  box(.105,.055,.045,dark,[0,-.24,.675],[0,0,0],.012);

  // Door inserts, recessed pulls, armrests, speaker grilles and switch packs.
  const speaker=await textureMaterial('COBALT_DoorSpeaker',`<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><pattern id="s" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#373b35"/><circle cx="3" cy="3" r="1.6" fill="#151b17"/></pattern></defs><circle cx="128" cy="128" r="126" fill="url(#s)"/></svg>`);
  for(const side of [-1,1]){
    const card=new T.Shape();card.moveTo(side*-.27,.305);card.lineTo(side*.90,.305);card.quadraticCurveTo(side*.95,.26,side*.95,.14);card.lineTo(side*.88,-.335);card.quadraticCurveTo(side*.46,-.385,side*-.21,-.369);card.lineTo(side*-.27,.305);card.closePath();
    put(shaped(card,.027,.012),lower,[side*.710,0,0],[0,-side*Math.PI/2,0],`COBALT_DoorCard_${side}`);
    box(.025,.018,.96,mats.rubber,[side*.704,.31,.215],[0,0,0],.006);
    const insert=new T.Shape();insert.moveTo(side*-.21,.155);insert.quadraticCurveTo(side*.12,.215,side*.66,.205);insert.lineTo(side*.63,-.018);insert.quadraticCurveTo(side*.22,-.075,side*-.20,-.10);insert.closePath();
    put(shaped(insert,.012,.012),mats.plastic,[side*.684,0,0],[0,-side*Math.PI/2,0]);
    box(.023,.063,.15,dark,[side*.665,.145,.492],[0,0,0],.018);
    const handle=new T.CatmullRomCurve3([new T.Vector3(side*.647,.14,.442),new T.Vector3(side*.641,.15,.492),new T.Vector3(side*.650,.158,.545)]);
    put(new T.TubeGeometry(handle,12,.0045,7,false),mats.chrome);
    const arm=new T.Shape();arm.moveTo(side*-.16,-.026);arm.quadraticCurveTo(side*.14,.017,side*.48,.026);arm.lineTo(side*.53,-.028);arm.quadraticCurveTo(side*.17,-.083,side*-.16,-.083);arm.closePath();
    put(shaped(arm,.062,.012),lower,[side*.66,0,0],[0,-side*Math.PI/2,0]);
    box(.043,.008,.126,dark,[side*.623,.025,.33],[0,0,0],.006);
    for(let i=0;i<(side===1?4:1);i++)box(.026,.005,.021,mats.steering,[side*.622,.032,.285+i*.027],[0,0,0],.003);
    const pocket=new T.Shape();pocket.moveTo(side*-.18,-.206);pocket.lineTo(side*.28,-.168);pocket.quadraticCurveTo(side*.39,-.21,side*.30,-.292);pocket.quadraticCurveTo(side*.10,-.34,side*-.16,-.32);pocket.closePath();
    put(shaped(pocket,.012,.009),dark,[side*.683,0,0],[0,-side*Math.PI/2,0]);
    box(.05,.045,.48,lower,[side*.664,-.318,.055],[0,0,0],.017);
    put(new T.CircleGeometry(.091,48),speaker,[side*.673,-.221,.562],[0,-side*Math.PI/2,0]);
    put(new T.TorusGeometry(.094,.004,8,48),lower,[side*.675,-.221,.562],[0,-side*Math.PI/2,0]);
    // Follow the rear door's wheel-arch cut instead of extending a rectangular
    // trim panel into the open wheel well.
    const rear=new T.Shape();rear.moveTo(side*-1.22,.29);rear.lineTo(side*-.31,.29);rear.lineTo(side*-.31,-.345);rear.lineTo(side*-.88,-.345);
    rear.quadraticCurveTo(side*-.91,-.04,side*-1.12,.12);rear.lineTo(side*-1.22,.21);rear.closePath();
    put(shaped(rear,.025,.018),lower,[side*.694,0,0],[0,-side*Math.PI/2,0]);
    box(.045,.065,.37,mats.plastic,[side*.664,-.03,-.72],[0,0,0],.018);
    // Keep the source A-pillar shell and its inward-facing trim. Additional
    // tubes duplicate that frame and pierce the upper windshield surface.
  }
  // GM 13585947 Cobalt mirror: a softly bowed outline, thin inset rim and
  // swept windscreen mount, rather than a rectangular chrome-like plate.
  const mirror=material('COBALT_RearViewMirror',0xa6aeab,.9,.14);
  const mirrorShell=material('COBALT_CabinMirrorShell',0x222426,0,.91);
  const mirrorRoot=doc.createNode('COBALT_CABIN_MIRROR').setTranslation([0,.580,.65]).setRotation(new T.Quaternion().setFromEuler(new T.Euler(-.06,-.16,0)).toArray());root.addChild(mirrorRoot);
  const mirrorPart=(g,mat,name,p=[0,0,0],r=[0,0,0])=>emit(g,mat,name,p,r,mirrorRoot);
  const outline=new T.Shape();outline.moveTo(-.108,.031);
  outline.quadraticCurveTo(0,.043,.108,.031);outline.quadraticCurveTo(.122,.028,.122,.012);
  outline.lineTo(.120,-.023);outline.quadraticCurveTo(.119,-.034,.105,-.036);
  outline.quadraticCurveTo(0,-.043,-.105,-.036);outline.quadraticCurveTo(-.119,-.034,-.120,-.023);
  outline.lineTo(-.122,.012);outline.quadraticCurveTo(-.122,.028,-.108,.031);outline.closePath();
  mirrorPart(shaped(outline,.022,.003,{bevelSegments:1,curveSegments:5}),mirrorShell,'COBALT_CabinMirrorHousing');
  const glass=new T.ShapeGeometry(outline,6).scale(.95,.87,1).rotateY(Math.PI);
  glass.computeBoundingBox();const glassBounds=glass.boundingBox,glassPosition=glass.getAttribute('position'),glassUv=glass.getAttribute('uv');
  for(let i=0;i<glassPosition.count;i++){
    // Positive car X appears on the left to the driver. This U direction
    // mirrors the rear camera; compensate the glTF writer's V convention so
    // a render-target texture stays upright without flipping the shared feed.
    glassUv.setXY(i,(glassPosition.getX(i)-glassBounds.min.x)/(glassBounds.max.x-glassBounds.min.x),1-(glassPosition.getY(i)-glassBounds.min.y)/(glassBounds.max.y-glassBounds.min.y));
  }
  mirrorPart(glass,mirror,'COBALT_CabinMirrorGlass',[0,0,-.0144]);
  const armCurve=new T.CatmullRomCurve3([new T.Vector3(0,.025,.010),new T.Vector3(0,.050,-.022),new T.Vector3(0,.072,-.050)]);
  mirrorPart(new T.TubeGeometry(armCurve,4,.0065,8,false),mirrorShell,'COBALT_CabinMirrorArm');
  mirrorPart(new RoundedBoxGeometry(.026,.031,.010,1,.003),mirrorShell,'COBALT_CabinMirrorMount',[0,.080,-.063],[-1.08,0,0]);
  const mirrorTab=shape([[-.010,-.039],[.010,-.039],[.008,-.054],[-.008,-.054]]);
  mirrorPart(shaped(mirrorTab,.005,.001,{bevelSegments:1,curveSegments:1}),mirrorShell,'COBALT_CabinMirrorDayNight',[0,0,.003],[-.22,0,0]);
  for(const x of [-.34,.34])box(.294,.098,.024,mats.headliner,[x,.738,.22],[Math.PI/2,0,0],.015);
  await buildCobaltUpholstery({doc,root,mats,material,svgTexture,put,emit});
}
