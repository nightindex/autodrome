import {describe,expect,it} from 'vitest';
import * as T from 'three';
import {treePlacements} from '../src/render/trees';
import {createCourseShadowLight,createCourseShadowCasters,configureCourseShadowReceivers,courseShadowLayer,courseShadowSettings} from '../src/render/course-shadows';

describe('full-course shadow coverage',()=>{
  it('covers both complete tree rows, crowns and projected ground shadows before approaching',()=>{
    const world=new T.Group(),light=createCourseShadowLight(world),scene=new T.Scene();scene.add(light,light.target);scene.updateMatrixWorld(true);light.shadow.updateMatrices(light);
    const toShadow=light.shadow.matrix;
    for(const tree of treePlacements())for(const dx of [-3,3])for(const dz of [-3,3])for(const y of [0,10]){
      const point=new T.Vector3(tree.x+dx,y,tree.z+dz),uv=point.clone().applyMatrix4(toShadow);
      for(const value of uv.toArray()){expect(value).toBeGreaterThan(0);expect(value).toBeLessThan(1);}
      // The ground projection along the sunlight has the same light-space XY.
      const ground=point.clone().addScaledVector(new T.Vector3(25,-38,23),y/38).applyMatrix4(toShadow);
      expect(ground.x).toBeCloseTo(uv.x);expect(ground.y).toBeCloseTo(uv.y);
    }
  });
  it('keeps the distant map world-fixed and does not illuminate the scene twice',()=>{
    const world=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());mesh.castShadow=true;world.add(mesh);
    const light=createCourseShadowLight(world);expect(light.intensity).toBe(0);expect(mesh.layers.isEnabled(courseShadowLayer)).toBe(false);
    expect(mesh.layers.isEnabled(0)).toBe(true);expect(light.shadow.camera.layers.mask).toBe(1<<courseShadowLayer);
    expect(world.getObjectByName('course-shadow-casters')!.children.every(n=>n.layers.isEnabled(courseShadowLayer))).toBe(true);
    expect(light.shadow.autoUpdate).toBe(true);expect(light.shadow.mapSize.toArray()).toEqual([2048,2048]);
    expect(light.shadow.camera.right-light.shadow.camera.left).toBe(courseShadowSettings.span);
  });
  it('batches only rigid opaque shadows and retains independent source/parent visibility',()=>{
    const world=new T.Group(),parent=new T.Group(),material=new T.MeshStandardMaterial();world.add(parent);
    const a=new T.Mesh(new T.BoxGeometry(),material),b=new T.Mesh(new T.BoxGeometry(),material);
    a.castShadow=b.castShadow=true;a.position.x=-2;b.position.x=2;parent.add(a);world.add(b);
    const casters=createCourseShadowCasters(world),batch=casters.children[0] as T.Mesh;
    expect(casters.children).toHaveLength(1);expect(batch.geometry.index!.count).toBe(72);
    parent.visible=false;(batch.onBeforeShadow as ()=>void)();expect(batch.geometry.drawRange.count).toBe(36);
    b.visible=false;(batch.onBeforeShadow as ()=>void)();expect(batch.geometry.drawRange.count).toBe(0);
    parent.visible=b.visible=true;(batch.onBeforeShadow as ()=>void)();expect(batch.geometry.drawRange.count).toBe(72);
    expect(a.geometry.index!.count).toBe(36);expect(a.layers.mask).toBe(1);
  });
  it('retains cutout and animated instanced casters with their original shaders',()=>{
    const world=new T.Group(),geometry=new T.BoxGeometry();
    const cutout=new T.Mesh(geometry,new T.MeshStandardMaterial({alphaTest:.5}));cutout.castShadow=true;
    const wind=new T.InstancedMesh(geometry,new T.MeshStandardMaterial(),2);wind.castShadow=true;
    wind.customDepthMaterial=new T.MeshDepthMaterial();world.add(cutout,wind);
    const casters=createCourseShadowCasters(world);expect(casters.children).toHaveLength(0);
    expect(cutout.layers.isEnabled(courseShadowLayer)).toBe(true);expect(wind.layers.isEnabled(courseShadowLayer)).toBe(true);
    expect(wind.customDepthMaterial).toBeDefined();expect(wind.count).toBe(2);
  });
  it('retains the existing material/wind hook and does not patch shared materials twice',()=>{
    const root=new T.Group(),material=new T.MeshStandardMaterial();root.add(new T.Mesh(new T.BoxGeometry(),material),new T.Mesh(new T.BoxGeometry(),material));
    material.onBeforeCompile=shader=>{shader.vertexShader+='\n// wind';};material.customProgramCacheKey=()=>'wind-key';
    configureCourseShadowReceivers(root);const hook=material.onBeforeCompile;configureCourseShadowReceivers(root);expect(material.onBeforeCompile).toBe(hook);
    const shader={vertexShader:'',fragmentShader:'#include <lights_fragment_begin>'};
    (hook as (program:typeof shader,renderer:unknown)=>void)(shader,{});
    expect(shader.vertexShader).toContain('// wind');expect(shader.fragmentShader).toContain('distantVisibility');
    expect(shader.fragmentShader).toContain('mix( distantVisibility, courseVisibility, detailWeight )');
    expect(material.customProgramCacheKey()).toBe('wind-key:course-shadow-coverage-v1');
  });
  it('keeps basic mirror surfaces and depth materials on their normal shaders',()=>{
    const root=new T.Group(),material=new T.MeshBasicMaterial(),depth=new T.MeshDepthMaterial();
    root.add(new T.Mesh(new T.BoxGeometry(),material),new T.Mesh(new T.BoxGeometry(),depth));
    const basicHook=material.onBeforeCompile,depthHook=depth.onBeforeCompile;configureCourseShadowReceivers(root);
    expect(material.onBeforeCompile).toBe(basicHook);expect(depth.onBeforeCompile).toBe(depthHook);
  });
});
