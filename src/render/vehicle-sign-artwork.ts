export type VehiclePlateKind='carPlate'|'truckPlate'|'busPlate';

/** Redrawn from Uzavtoyo‘lbelgi's 7.4.1 / 7.4.3 / 7.4.4 catalogue.
 * Work in the plate's 2:1 aspect ratio so wheels remain circular in the world.
 */
export function drawVehiclePlate(ctx:CanvasRenderingContext2D,kind:VehiclePlateKind,width:number,height:number){
  ctx.save();ctx.scale(width/600,height/300);
  const black='#181816',white='#fffefa';
  const path=(d:string,color:string)=>{ctx.fillStyle=color;ctx.fill(new Path2D(d));};
  ctx.fillStyle=white;ctx.fillRect(0,0,600,300);
  ctx.strokeStyle=black;ctx.lineWidth=8;ctx.beginPath();ctx.roundRect(12,12,576,276,25);ctx.stroke();
  const wheel=(x:number,y:number,radius:number,hub:number)=>{
    for(const [r,color]of [[radius+7,white],[radius,black],[hub,white]] as const){ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  };
  if(kind==='carPlate'){
    path('M100 142 Q102 136 117 131 L205 112 L277 48 H449 L491 112 Q504 149 491 181 Q485 198 472 208 H122 Q104 195 101 175 Q98 159 100 142Z',black);
    path('M217 123 L283 63 H433 L459 106 Q466 118 458 123Z',white);
    wheel(165,208,40,23);wheel(427,208,40,23);
  }else if(kind==='truckPlate'){
    path('M114 183 V49 Q114 31 132 31 H338 Q356 31 356 49 V183Z',black);
    path('M111 194 H363 V109 Q363 89 383 89 H439 Q450 89 457 99 L482 135 Q487 142 487 152 V211 Q487 228 471 228 H111Z',black);
    path('M382 111 Q382 101 392 101 H431 Q438 101 443 108 L460 132 Q466 142 457 149 H390 Q382 149 382 141Z',white);
    wheel(184,228,33,17);wheel(413,228,33,17);
  }else{
    path('M68 108 L108 47 Q113 39 123 39 H487 Q498 39 503 50 L535 108 V194 Q535 211 522 211 H78 L68 199Z',black);
    path('M89 101 L117 57 Q121 50 128 50 H164 Q175 50 175 62 V101 Q175 112 164 112 H97 Q85 112 89 101Z',white);
    ctx.fillStyle=white;for(const x of [195,303]){ctx.beginPath();ctx.roundRect(x,50,87,64,5);ctx.fill();}
    path('M421 50 H481 Q491 50 495 59 L503 99 Q507 112 495 112 H421 Q409 112 409 100 V62 Q409 50 421 50Z',white);
    wheel(145,217,41,23);wheel(430,217,41,23);
  }
  ctx.restore();
}
