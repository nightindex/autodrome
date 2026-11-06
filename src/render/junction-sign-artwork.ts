// Native vector redraws of 5.16.1/2, 2.1 and 5.33 from:
// https://uzavtoyolbelgi.uz/dorojnie/znaki
const white='#fffefa',black='#181816',blue='#075caa';

export function drawPedestrianSign(ctx:CanvasRenderingContext2D,mirror:boolean,width:number,height:number){
  ctx.save();ctx.scale(width/600,height/600);
  ctx.fillStyle=white;ctx.fillRect(0,0,600,600);
  ctx.fillStyle=blue;ctx.beginPath();ctx.roundRect(15,15,570,570,32);ctx.fill();
  ctx.fillStyle=white;ctx.fill(new Path2D('M291 40 Q299 28 307 40 L562 451 Q570 468 553 468 H47 Q30 468 38 453Z'));
  // 5.16.2 is the right-facing figure; 5.16.1 mirrors the entire symbol,
  // including its three perspective crossing stripes.
  if(mirror){ctx.translate(600,0);ctx.scale(-1,1);}
  ctx.fillStyle=black;
  for(const d of [
    'M281 121 C294 115 313 119 319 132 C326 148 318 166 304 170 C289 174 278 172 273 161 C266 143 268 128 281 121Z',
    'M307 176 Q315 175 325 183 L374 220 Q382 226 382 235 V279 Q381 291 371 292 Q358 294 358 280 V238 L321 209 L324 278 Q325 287 316 294 L259 338 L226 420 Q219 433 207 430 Q194 427 197 412 L224 330 Q227 320 236 313 L280 279 L279 199 Q280 189 290 182Z',
    'M270 233 L225 270 Q216 278 221 287 Q228 300 240 292 L270 268Z',
    'M324 302 L389 410 Q397 420 386 429 Q374 436 365 423 L301 338Z',
    'M146 389 H180 L161 446 H110Z',
    'M280 388 H310 L320 446 H268Z',
    'M410 389 H444 L475 446 H425Z',
  ])ctx.fill(new Path2D(d));
  ctx.restore();
}

export function drawPrioritySign(ctx:CanvasRenderingContext2D,width:number,height:number){
  ctx.save();ctx.scale(width/600,height/600);ctx.fillStyle=white;ctx.fillRect(0,0,600,600);
  const diamond=(inset:number,cut:number,fill:string)=>{
    const vertices=[[300,inset],[600-inset,300],[300,600-inset],[inset,300]];
    ctx.beginPath();vertices.forEach(([x,y],i)=>{
      const before=vertices[(i+3)%4],after=vertices[(i+1)%4],distance=Math.hypot(x-before[0],y-before[1]);
      const bx=x+(before[0]-x)*cut/distance,by=y+(before[1]-y)*cut/distance,ax=x+(after[0]-x)*cut/distance,ay=y+(after[1]-y)*cut/distance;
      i?ctx.lineTo(bx,by):ctx.moveTo(bx,by);ctx.quadraticCurveTo(x,y,ax,ay);
    });ctx.closePath();ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=black;ctx.lineWidth=7;ctx.stroke();
  };
  diamond(14,20,white);diamond(103,17,'#ffeb00');ctx.restore();
}

export function drawStopLineSign(ctx:CanvasRenderingContext2D,width:number,height:number){
  ctx.save();ctx.scale(width/600,height/300);ctx.fillStyle=white;ctx.fillRect(0,0,600,300);
  ctx.strokeStyle=black;ctx.lineWidth=8;ctx.beginPath();ctx.roundRect(12,12,576,276,25);ctx.stroke();
  ctx.fillStyle=black;ctx.font='400 160px Arial,sans-serif';ctx.textAlign='left';ctx.textBaseline='alphabetic';
  const metrics=ctx.measureText('STOP'),inkWidth=metrics.actualBoundingBoxLeft+metrics.actualBoundingBoxRight,inkHeight=metrics.actualBoundingBoxAscent+metrics.actualBoundingBoxDescent;
  // The physical boards at 04:47 / 06:52 / 09:30 use centred sans-serif STOP.
  // Fit the ink bounds independently of the platform's font baseline.
  ctx.translate(300,150);ctx.scale(440/inkWidth,130/inkHeight);
  ctx.fillText('STOP',(metrics.actualBoundingBoxLeft-metrics.actualBoundingBoxRight)/2,(metrics.actualBoundingBoxAscent-metrics.actualBoundingBoxDescent)/2);ctx.restore();
}
