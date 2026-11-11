import * as T from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries,mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCobaltUpholstery } from './cobalt-upholstery.mjs';
import { conformSurface } from './cobalt-surfaces.mjs';
import { buildColumnControls } from './cobalt-column-controls.mjs';
import { smoothBodyGeometry } from './cobalt-body.mjs';
import { buildDashboardJoinery } from './cobalt-dashboard-joinery.mjs';
import { buildCobaltFrontDoors } from './cobalt-door-trim.mjs';

/** Manual Cobalt cabin with the examination-centre monitor from the supplied 2026 photo.
 * Coordinates are metres in the normalized car frame, +Z forward, +X driver's side.
 */
export async function buildCobaltCabin({doc,root,mats,material,svgTexture,put:add,emit}){
  let centreStack=false;
  const put=(geometry,mat,position=[0,0,0],rotation=[0,0,0],name)=>{
    if(!centreStack){add(geometry,mat,position,rotation,name);return;}
    // Console proportions, measured relative to the 398 mm rim
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
  const dark=material('COBALT_CabinRecess',0x20211f,0,.96),lower=material('COBALT_LowerDash',0x3f403c,0,.94);
  const satin=material('COBALT_ConsoleSatin',0xaaa9a2,.28,.46),seam=material('COBALT_CabinSeams',0x292a27,0,1);
  mats.plastic.setBaseColorFactor([...new T.Color(0x595a54).toArray(),1]);
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
  // The passenger fascia rolls into a real open shelf and back out into the
  // knee panel. These are measured sections, not a black plate on the cowl.
  const passengerSections=[
    [0,.300,1.245],[3,.295,1.140],[6,.282,1.015],[8,.262,.932],
    [10,.222,.858],[12,.158,.814],[14,.082,.803],[15,.048,.806],
    [15.6,.035,.827],[16.4,.025,.973],[17.4,-.024,.990],
    [18.2,-.047,.966],[19,-.062,.814],[19.6,-.073,.803],
    [21,-.148,.824],[22.5,-.237,.865],[23.3,-.272,.912],[24,-.280,1.160],
  ];
  const passengerAt=row=>{
    const k=passengerSections.findIndex(p=>p[0]>=row);
    if(k<=0)return new T.Vector2(passengerSections[0][1],passengerSections[0][2]);
    const a=passengerSections[k-1],b=passengerSections[k],t=(row-a[0])/(b[0]-a[0]);
    return new T.Vector2(T.MathUtils.lerp(a[1],b[1],t),T.MathUtils.lerp(a[2],b[2],t));
  };
  const dashParts=[],faceClasses=[];
  const hoodLeft=.109,hoodRight=.523;
  for(const [left,right,start,end,columns]of [[-.695,hoodLeft,0,24,36],[hoodRight,.695,0,24,16],[hoodLeft,hoodRight,0,8,20],[hoodLeft,hoodRight,19,24,20]]){
    const rowValues=Array.from(new Set([...Array.from({length:end-start+1},(_,i)=>start+i),...passengerSections.map(p=>p[0]).filter(r=>r>start&&r<end)])).sort((a,b)=>a-b);
    const vertices=[],uv=[],indices=[],rows=rowValues.length-1;
    for(let xIndex=0;xIndex<=columns;xIndex++)for(let j=0;j<=rows;j++){
      const x=left+(right-left)*xIndex/columns,row=rowValues[j],p=profile.getPoint(row/24),edge=Math.abs(x)/.695;
      if(x<-.16){
        const section=passengerAt(row),blend=1-T.MathUtils.smoothstep(x,-.20,-.16);
        const pocket=T.MathUtils.smoothstep(x,-.690,-.632)*(1-T.MathUtils.smoothstep(x,-.222,-.178));
        // Close the shelf at its two ends while keeping the same curved brow.
        if(row>15&&row<19.6)section.y=T.MathUtils.lerp(.806,section.y,pocket);
        p.y=T.MathUtils.lerp(p.y,section.x,blend);p.z=T.MathUtils.lerp(p.z,section.y,blend);
      }
      const crown=.011*Math.cos(x/.695*Math.PI/2),sweep=.04*edge**3;
      // The cowl flows over the instrument hood instead of stopping in a
      // vertical cut at its sides. The aperture remains open in front.
      const brow=.055*Math.exp(-(((x-.315)/.225)**4))*Math.exp(-(((p.z-.955)/.23)**4));
      const middle=start===19||end===8;
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
      if(xIndex<columns&&j<rows){
        const i=xIndex*(rows+1)+j;indices.push(i,i+rows+1,i+1,i+1,i+rows+1,i+rows+2);
        const cx=x+(right-left)/columns/2,cy=(rowValues[j]+rowValues[j+1])/2;
        const region=cx<-.18?(cy>=15.6&&cy<19?1:cy>=19.6?2:0):0;
        faceClasses.push(region,region);
      }
    }
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();dashParts.push(g);
  }
  const joinedDashboard=mergeGeometries(dashParts),dashboard=smoothBodyGeometry(joinedDashboard);
  joinedDashboard.dispose();dashParts.forEach(part=>part.dispose());
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
  const supportDashboard=dashboard.clone();
  const partition=(region)=>{
    const p=dashboard.getAttribute('position'),attributes={position:[],normal:[],uv:[]};
    for(let i=0;i<p.count;i+=3){
      if(faceClasses[i/3]!==region)continue;
      for(const [name,array]of Object.entries(attributes)){const a=dashboard.getAttribute(name);for(let j=0;j<3;j++)for(let c=0;c<a.itemSize;c++)array.push(a.array[(i+j)*a.itemSize+c]);}
    }
    const g=new T.BufferGeometry();for(const [name,array]of Object.entries(attributes))g.setAttribute(name,new T.Float32BufferAttribute(array,name==='uv'?2:3));return g;
  };
  put(partition(0),mats.plastic,[0,0,0],[0,0,0],'COBALT_MouldedDashboard');
  put(partition(1),dark,[0,0,0],[0,0,0],'COBALT_PassengerShelfInterior');
  put(partition(2),lower,[0,0,0],[0,0,0],'COBALT_PassengerKneePanel');
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
  box(.66,.14,.20,lower,[.34,-.155,1.025],[0,0,0],.034);
  buildDashboardJoinery({dashboard:supportDashboard,put,seam,satin});

  // Exam car: paired vents, lock/hazard row, fitted monitor and manual HVAC.
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
  // A shallow black adapter fills the former audio aperture. The live LCD is
  // flush with its lip, below the hazard row and above the rotary controls.
  box(.338,.188,.026,mats.steering,[0,.005,.760],[0,0,0],.007);
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
  const hazard=await textureMaterial('COBALT_HazardButton',`<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="160"><rect width="1024" height="160" rx="12" fill="#636768"/><rect x="18" y="27" width="242" height="106" rx="20" fill="#292d2f"/><g fill="none" stroke="#c5cdcc" stroke-width="5"><path d="M72 75h34v37H72zM78 74V61q0-24 23-21m1 0v17M169 75h34v37h-34zM176 74V59q0-29 20 0v15"/></g><path d="M512 17q7 0 12 10l58 103q4 11-8 12H450q-12-1-8-12l58-103q5-10 12-10z" fill="#292c2e" stroke="#242729" stroke-width="5"/><path d="M512 45l43 75h-86zM512 63l27 47h-54z" fill="none" stroke="#ad4a45" stroke-width="4"/><rect x="734" y="27" width="272" height="106" rx="20" fill="#454a4c"/><text x="870" y="86" text-anchor="middle" font-family="Arial" font-size="23" fill="#b5bdbb">PASSENGER AIRBAG</text></svg>`);
  plane(.302,.049,hazard,[0,.127,.750]);
  const display=await textureMaterial('COBALT_ExamDisplay',`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><rect width="1280" height="720" fill="#242b30"/><g fill="#f0f3f5" font-family="Arial"><text x="30" y="64" font-size="32">ЭКЗАМЕНАЦИОННАЯ СИСТЕМА</text><text x="1114" y="64" font-size="40">00:00</text></g><rect x="24" y="102" width="1232" height="62" fill="#414d54" stroke="#a1afb6"/><text x="640" y="146" text-anchor="middle" fill="#f2fff4" font-family="Arial" font-size="37">Готов к поездке</text></svg>`);
  // Account for the console's separate X/Y scale so the fitted screen is 16:9.
  plane(.304,.166725,display,[0,.005,.7445],'COBALT_ExamDisplay');
  const controlBacklight=material('COBALT_ControlBacklight',0xc6d2d3,.05,.65);
  const fanSpeeds=Array.from({length:5},(_,i)=>{const a=(-160+i*37)*Math.PI/180;return `<text x="${384+Math.cos(a)*72}" y="${203+Math.sin(a)*72}" text-anchor="middle">${i}</text>`;}).join('');
  const airModes=[[-70,-32],[-43,-63],[0,-77],[43,-63],[70,-32]].map(([dx,dy],i)=>`<g transform="translate(${604+dx} ${98+dy}) scale(.7)">${i<3?`<circle cx="-4" cy="-7" r="4" fill="#d4dcdb"/><path d="M-6 0l6 11h10m-16-9-3 12H2m-14-11h-8m5-5-5 5 5 5"/>${i>0?'<path d="M15 3L8 16m-5-2 5 2 1-5"/>':''}`:'<path d="M-18 5Q0-16 18 5l-3 13h-30zM-8 12V0m-3 3 3-3 3 3M0 11V-4m-3 3 3-3 3 3M8 12V0m-3 3 3-3 3 3"/>'}</g>`).join('');
  const climate=await textureMaterial('COBALT_ClimateLabels',`<svg xmlns="http://www.w3.org/2000/svg" width="768" height="290"><rect width="768" height="290" rx="50" fill="#25292c"/><g fill="#d4dcdb" font-size="23" font-family="Arial">${fanSpeeds}<text x="292" y="65" font-size="21">A/C</text></g><g stroke="#d4dcdb" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${airModes}<path d="M131 48a62 62 0 0 1 25-8" stroke="#4f92bc" stroke-width="9"/><path d="M165 40a62 62 0 0 1 28 8" stroke="#b84e42" stroke-width="9"/><rect x="283" y="77" width="56" height="34" rx="8" stroke="#60696c"/><rect x="428" y="71" width="63" height="39" rx="8" stroke="#60696c"/><path d="M441 97h36l-6-12h-22zM447 82q11-12 26 0m-5-3 6 3-6 3"/><path d="M380 259c-22-1-27-17-12-19 12-2 15 10 16 15 1-18 17-25 22-12 4 11-9 17-17 17 18 2 24 17 11 22-12 5-19-10-17-17-3 18-19 22-23 9-3-10 9-15 17-14" stroke-width="2"/><circle cx="384" cy="260" r="5" fill="#d4dcdb"/></g></svg>`);
  plane(.302,.111,climate,[0,-.168,.756]);
  const knobEdge=material('COBALT_ClimateKnobEdge',0x43484b,.05,.77);
  // The label surface is in front of the moulded stack, rather than buried in
  // it. Knob recesses, grip ridges and pointers remain distinct in cockpit view.
  for(const [x,y]of [[.088,-.15],[0,-.19],[-.088,-.15]]){
    put(new T.CylinderGeometry(.024,.027,.017,32),mats.steering,[x,y,.738],[Math.PI/2,0,0]);torus(.027,.0008,knobEdge,[x,y,.728]);
    for(let i=0;i<16;i++){const a=i/16*Math.PI*2;box(.0013,.004,.006,dark,[x+Math.sin(a)*.0248,y+Math.cos(a)*.0248,.731],[0,0,-a],.0004);}
    box(.0026,.011,.002,controlBacklight,[x,y+.012,.725],[0,0,0],.0008);
  }

  // Deep passenger shelf with a curved lower lip and a glovebox integrated
  // into the knee bolster, matching the broad recess in the factory photograph.
  centreStack=false;
  box(.073,.012,.007,dark,[-.423,-.144,.813],[0,0,0],.003);
  const emboss=await textureMaterial('COBALT_AirbagEmboss',`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="96"><rect width="512" height="96" fill="#595a54"/><text x="256" y="63" font-family="Arial" font-size="36" letter-spacing="7" text-anchor="middle" fill="#676862">AIRBAG</text></svg>`);
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

  // Compound-curved front door cards and factory moulding joints.
  await buildCobaltFrontDoors({doc,mats,material,svgTexture,put});
  for(const side of [-1,1]){
    // Follow the rear door's wheel-arch cut instead of extending a rectangular
    // trim panel into the open wheel well.
    const rear=new T.Shape();rear.moveTo(side*-1.22,.29);rear.lineTo(side*-.31,.29);rear.lineTo(side*-.31,-.345);rear.lineTo(side*-.88,-.345);
    rear.quadraticCurveTo(side*-.91,-.04,side*-1.12,.12);rear.lineTo(side*-1.22,.21);rear.closePath();
    put(shaped(rear,.025,.018),lower,[side*.694,0,0],[0,-side*Math.PI/2,0]);
    box(.045,.065,.37,mats.plastic,[side*.664,-.03,-.72],[0,0,0],.018);
    // Close the door-card joint over the B-pillar jamb. The small gap between
    // the separately moulded cards exposed the white outer door skin below
    // the belt anchor when looking across the cabin.
    box(.028,.704,.074,lower,[side*.704,-.028,-.287],[0,0,0],.004);
    // The rear card follows the wheel arch, but its short rear edge left an
    // open view onto exterior paint beside the bench. A fitted quarter-panel
    // return joins the card to the C-pillar above the existing wheel-well shell.
    const quarter=new T.Shape();quarter.moveTo(side*-.95,.29);
    quarter.quadraticCurveTo(side*-1.2,.31,side*-1.48,.29);
    quarter.lineTo(side*-1.51,.08);quarter.quadraticCurveTo(side*-1.31,.035,side*-1.16,-.045);
    quarter.quadraticCurveTo(side*-1.015,-.035,side*-.95,.09);quarter.closePath();
    put(shaped(quarter,.022,.007,{bevelSegments:2,curveSegments:10}),lower,[side*.696,0,0],[0,-side*Math.PI/2,0],`COBALT_RearQuarterPanel_${side}`);
    // Keep the source A-pillar shell and its inward-facing trim. Additional
    // tubes duplicate that frame and pierce the upper windshield surface.
  }
  // GM 13585947 Cobalt mirror: a softly bowed outline, thin inset rim and
  // swept windscreen mount, rather than a rectangular chrome-like plate.
  const mirror=material('COBALT_RearViewMirror',0xa6aeab,.9,.14);
  const mirrorShell=material('COBALT_CabinMirrorShell',0x222426,0,.91);
  // The housing hangs below the windscreen mounting pad. Moving its centre
  // toward the pane keeps the complete mirror in the normal driver's view.
  const mirrorRotation=new T.Quaternion().setFromEuler(new T.Euler(-.06,-.16,0));
  const mirrorPosition=new T.Vector3(.060,.645,.495);
  const mirrorRoot=doc.createNode('COBALT_CABIN_MIRROR').setTranslation(mirrorPosition.toArray()).setRotation(mirrorRotation.toArray());root.addChild(mirrorRoot);
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
  const mount=new T.Vector3(0,.697,.492).sub(mirrorPosition).applyQuaternion(mirrorRotation.clone().invert());
  const armCurve=new T.CatmullRomCurve3([new T.Vector3(0,.025,.010),mount.clone().lerp(new T.Vector3(0,.025,.010),.45),mount]);
  mirrorPart(new T.TubeGeometry(armCurve,4,.0065,8,false),mirrorShell,'COBALT_CabinMirrorArm');
  mirrorPart(new RoundedBoxGeometry(.026,.031,.010,1,.003),mirrorShell,'COBALT_CabinMirrorMount',mount.toArray(),[-1.08,0,0]);
  const mirrorTab=shape([[-.010,-.039],[.010,-.039],[.008,-.054],[-.008,-.054]]);
  mirrorPart(shaped(mirrorTab,.005,.001,{bevelSegments:1,curveSegments:1}),mirrorShell,'COBALT_CabinMirrorDayNight',[0,0,.003],[-.22,0,0]);
  // Visors use the cabin frame, bypassing the centre-stack proportions.
  // Their upper faces sit beneath the headliner instead of inside its mesh.
  for(const x of [-.34,.34])add(new RoundedBoxGeometry(.330,.105,.018,1,.008),mats.headliner,[x,.710,.20],[Math.PI/2,0,0],`COBALT_SunVisor_${x>0?'Left':'Right'}`);
  await buildCobaltUpholstery({doc,root,mats,material,svgTexture,put,emit});
}
