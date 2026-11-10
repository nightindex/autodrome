/** Read the same ACES + sRGB appearance used by an HDR side-mirror pane. */
export function mirrorPixels(T,renderer,target){
  const hdr=target.texture.type===T.HalfFloatType;
  const raw=hdr?new Uint16Array(target.width*target.height*4):new Uint8Array(target.width*target.height*4);
  renderer.readRenderTargetPixels(target,0,0,target.width,target.height,raw);
  if(!hdr)return raw;
  const result=new Uint8Array(raw.length),color=new T.Vector3(),encoded=new T.Color();
  const input=new T.Matrix3().set(.59719,.35458,.04823,.076,.90834,.01566,.0284,.13383,.83777);
  const output=new T.Matrix3().set(1.60475,-.53108,-.07367,-.10208,1.10813,-.00605,-.00327,-.07276,1.07602);
  for(let i=0;i<raw.length;i+=4){
    color.set(T.DataUtils.fromHalfFloat(raw[i]),T.DataUtils.fromHalfFloat(raw[i+1]),T.DataUtils.fromHalfFloat(raw[i+2])).multiplyScalar(renderer.toneMappingExposure/.6).applyMatrix3(input);
    for(const axis of ['x','y','z']){const v=color[axis];color[axis]=(v*(v+.0245786)-.000090537)/(v*(.983729*v+.432951)+.238081);}
    color.applyMatrix3(output).clampScalar(0,1);encoded.setRGB(color.x,color.y,color.z).convertLinearToSRGB();
    result[i]=Math.round(encoded.r*255);result[i+1]=Math.round(encoded.g*255);result[i+2]=Math.round(encoded.b*255);result[i+3]=255;
  }
  return result;
}
