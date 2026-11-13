import * as T from 'three';

/** Pick the actual cabin switch, including occlusion by the rest of the car. */
export class CabinControls {
  private control:T.Object3D|undefined;
  private knob:T.Object3D|undefined;private rest=0;private pressedAt=-Infinity;
  private pointer=new T.Vector2(2,2);private ray=new T.Raycaster();
  private bounds=new T.Box3();private corner=new T.Vector3();
  private enabled=false;private hovered=false;
  label='Регулировка зеркал';
  constructor(private car:T.Object3D,private camera:T.Camera,private canvas:HTMLCanvasElement,private activate:()=>void){
    this.control=car.getObjectByName('COBALT_MIRROR_SWITCH');
    this.knob=car.getObjectByName('COBALT_MirrorSwitchKnob');this.rest=this.knob?.position.z??0;
    const point=(event:MouseEvent)=>{const rect=canvas.getBoundingClientRect();this.pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);};
    canvas.addEventListener('pointermove',point);
    canvas.addEventListener('pointerleave',()=>this.clear());
    window.addEventListener('blur',()=>this.clear());
    canvas.addEventListener('click',event=>{
      if(event.button!==0||!this.enabled)return;point(event);
      if(!this.pick())return;
      event.preventDefault();this.pressedAt=performance.now();this.activate();
    });
  }
  private clear(){this.pointer.set(2,2);this.setHover(false);}
  private setHover(hovered:boolean){
    if(hovered===this.hovered)return;this.hovered=hovered;
    this.canvas.style.cursor=hovered?'pointer':'';this.canvas.title=hovered?this.label:'';
  }
  private pick(){
    if(!this.control)return false;
    this.ray.setFromCamera(this.pointer,this.camera);this.ray.far=Infinity;
    const target=this.ray.intersectObject(this.control,true)[0];if(!target)return false;
    this.ray.far=target.distance+.0001;
    const visible=this.ray.intersectObject(this.car,true).find(hit=>{
      const mesh=hit.object as T.Mesh;if(!mesh.isMesh)return false;
      const material=Array.isArray(mesh.material)?mesh.material[hit.face?.materialIndex??0]:mesh.material;
      return !material.transparent||material.opacity>=.98;
    });
    if(!visible)return false;
    for(let node:T.Object3D|null=visible.object;node;node=node.parent)if(node===this.control)return true;
    return false;
  }
  update(enabled:boolean){
    this.enabled=enabled;
    if(this.knob){const phase=(performance.now()-this.pressedAt)/160;this.knob.position.z=this.rest-(phase>=0&&phase<1?Math.sin(phase*Math.PI)*.0013:0);this.knob.updateMatrixWorld();}
    if(!enabled||!this.control||Math.abs(this.pointer.x)>1||Math.abs(this.pointer.y)>1){this.setHover(false);return;}
    // Reject almost all pointer positions before raycasting the detailed car.
    this.bounds.setFromObject(this.control);let left=Infinity,right=-Infinity,bottom=Infinity,top=-Infinity;
    for(let i=0;i<8;i++){
      this.corner.set(i&1?this.bounds.max.x:this.bounds.min.x,i&2?this.bounds.max.y:this.bounds.min.y,i&4?this.bounds.max.z:this.bounds.min.z).project(this.camera);
      left=Math.min(left,this.corner.x);right=Math.max(right,this.corner.x);bottom=Math.min(bottom,this.corner.y);top=Math.max(top,this.corner.y);
    }
    this.setHover(this.pointer.x>=left&&this.pointer.x<=right&&this.pointer.y>=bottom&&this.pointer.y<=top&&this.pick());
  }
}
