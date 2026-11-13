import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {shadowSpan,sunOffset} from './shadow-stability';

export const courseShadowSettings={
  span:220,resolution:2048,lightDistance:220,near:1,far:500,
  bias:-.00003,normalBias:.018,radius:.35,transitionMetres:3,
} as const;
// Only fixed course geometry belongs in the distant map. Animated foliage
// still updates every frame; the car casts through the original detail map.
export const courseShadowLayer=2;

/** Shadow-only batches keep hundreds of rigid course fittings out of separate
 * distant draw calls. Main/detail rendering and named source meshes are intact.
 * Alpha cutouts, shader displacement and instanced wind stay on their own path.
 */
export function createCourseShadowCasters(world:T.Object3D){
  world.updateWorldMatrix(true,true);
  const inverse=world.matrixWorld.clone().invert(),matrix=new T.Matrix4(),point=new T.Vector3();
  const groups=new Map<T.Side,{source:T.Mesh;geometry:T.BufferGeometry}[]>();
  const visit=(node:T.Object3D)=>{
    if(!node.visible)return;
    if(node instanceof T.Mesh&&node.castShadow){
      const material=node.material;
      if(node instanceof T.InstancedMesh||node instanceof T.SkinnedMesh||Array.isArray(material)||
        material instanceof T.ShaderMaterial||material.alphaTest>0||node.customDepthMaterial||
        (material instanceof T.MeshStandardMaterial&&material.displacementMap)||Object.keys(node.geometry.morphAttributes).length){node.layers.enable(courseShadowLayer);}
      else if(material.visible){
        const side=material.shadowSide??(material.side===T.FrontSide?T.BackSide:material.side===T.BackSide?T.FrontSide:T.DoubleSide);
        const p=node.geometry.getAttribute('position'),index=node.geometry.index,range=node.geometry.drawRange;
        matrix.multiplyMatrices(inverse,node.matrixWorld);const mirrored=matrix.determinant()<0,positions:number[]=[];
        const end=Math.min(index?.count??p.count,range.start+range.count);
        for(let i=range.start;i+2<end;i+=3)for(const corner of mirrored?[0,2,1]:[0,1,2]){
          point.fromBufferAttribute(p,index?index.getX(i+corner):i+corner).applyMatrix4(matrix);positions.push(point.x,point.y,point.z);
        }
        const geometry=new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(positions,3));
        const parts=groups.get(side)??[];parts.push({source:node,geometry});groups.set(side,parts);
      }
    }
    for(const child of node.children)visit(child);
  };
  visit(world);
  const casters=new T.Group();casters.name='course-shadow-casters';
  for(const [side,parts]of groups){
    const geometry=mergeGeometries(parts.map(p=>p.geometry))!;parts.forEach(p=>p.geometry.dispose());
    const material=new T.MeshBasicMaterial();material.shadowSide=side;
    const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.layers.set(courseShadowLayer);
    // A visibility edit can hide a source or parent without leaving a ghost
    // shadow in the batch. Index filtering runs only when visibility changes.
    const count=geometry.getAttribute('position').count,indices=new Uint32Array(count);for(let i=0;i<count;i++)indices[i]=i;
    geometry.setIndex(new T.BufferAttribute(indices,1));let offset=0;
    const records=parts.map(({source,geometry:g})=>{const start=offset,length=g.getAttribute('position').count;offset+=length;return {source,start,length,visible:true};});
    mesh.onBeforeShadow=()=>{
      let changed=false;
      for(const record of records){let visible=true;for(let n:T.Object3D|null=record.source;n&&n!==world;n=n.parent)if(!n.visible){visible=false;break;}
        if(record.visible!==visible){record.visible=visible;changed=true;}}
      if(!changed)return;
      let cursor=0;
      for(const record of records)if(record.visible)for(let i=record.start;i<record.start+record.length;i++)indices[cursor++]=i;
      geometry.setDrawRange(0,cursor);geometry.index!.needsUpdate=true;
    };
    geometry.computeBoundingSphere();casters.add(mesh);
  }
  world.add(casters);return casters;
}

export function createCourseShadowLight(world:T.Object3D){
  createCourseShadowCasters(world);
  const c=courseShadowSettings,light=new T.DirectionalLight(0xfff1d4,0);
  light.name='course-shadow-coverage';light.castShadow=true;
  light.position.copy(sunOffset).normalize().multiplyScalar(c.lightDistance);
  Object.assign(light.shadow.camera,{left:-c.span/2,right:c.span/2,top:c.span/2,bottom:-c.span/2,near:c.near,far:c.far});
  light.shadow.camera.updateProjectionMatrix();light.shadow.camera.layers.set(courseShadowLayer);
  light.shadow.mapSize.set(c.resolution,c.resolution);light.shadow.bias=c.bias;light.shadow.normalBias=c.normalBias;light.shadow.radius=c.radius;
  return light;
}

const sample='getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
const original=`directLight.color *= ( directLight.visible && receiveShadow ) ? ${sample} : 1.0;`;
const replacement=`
  #if NUM_DIR_LIGHT_SHADOWS >= 2 && UNROLLED_LOOP_INDEX == 0
    float courseVisibility = 1.0;
    if ( directLight.visible && receiveShadow ) {
      vec3 detailCoord = vDirectionalShadowCoord[ 0 ].xyz / vDirectionalShadowCoord[ 0 ].w;
      vec2 edge = min( detailCoord.xy, vec2( 1.0 ) - detailCoord.xy );
      float detailWeight = smoothstep( 0.0, ${courseShadowSettings.transitionMetres.toFixed(1)}, min( edge.x, edge.y ) * ${shadowSpan.toFixed(1)} );
      detailWeight *= step( 0.0, detailCoord.z ) * step( detailCoord.z, 1.0 );
      if ( detailWeight > 0.0 ) courseVisibility = ${sample};
      if ( detailWeight < 1.0 ) {
        DirectionalLightShadow distant = directionalLightShadows[ 1 ];
        float distantVisibility = getShadow( directionalShadowMap[ 1 ], distant.shadowMapSize, distant.shadowIntensity, distant.shadowBias, distant.shadowRadius, vDirectionalShadowCoord[ 1 ] );
        courseVisibility = mix( distantVisibility, courseVisibility, detailWeight );
      }
    }
    directLight.color *= courseVisibility;
  #elif NUM_DIR_LIGHT_SHADOWS >= 2 && UNROLLED_LOOP_INDEX == 1
    // The zero-intensity coverage light supplies a map, not extra sunlight.
  #else
    ${original}
  #endif
`;
const directionalLoop=/(for \( int i = 0; i < NUM_DIR_LIGHTS; i \+\+ \) \{)([\s\S]*?)(\n\t\}\n\t#pragma unroll_loop_end)/;
const courseFragment=T.ShaderChunk.lights_fragment_begin.replace(original,replacement).replace(directionalLoop,
  '$1\n#if NUM_DIR_LIGHT_SHADOWS < 2 || UNROLLED_LOOP_INDEX != 1\n$2\n#endif\n$3');

/** Compose two world-space shadow maps, with no view-dependent cascade split.
 * The normal sun is index 0; add the zero-intensity coverage light after it.
 * Close up, sampling/texel density are unchanged. At the boundary blend shadow
 * visibility (never multiply/darken twice), then use full-course coverage.
 * Retain existing hooks such as foliage wind and distinguish cached programs.
 */
export function configureCourseShadowReceivers(root:T.Object3D){
  if(!T.ShaderChunk.lights_fragment_begin.includes(original)||!directionalLoop.test(T.ShaderChunk.lights_fragment_begin))throw new Error('Unsupported Three.js directional shadow shader');
  root.traverse(node=>{
    if(!(node instanceof T.Mesh))return;
    for(const material of Array.isArray(node.material)?node.material:[node.material]){
      if(!(material instanceof T.MeshStandardMaterial)||material.userData.courseShadowCoverage)continue;
      material.userData.courseShadowCoverage=true;
      const beforeCompile=material.onBeforeCompile,key=material.customProgramCacheKey();
      material.onBeforeCompile=function(shader,renderer){
        beforeCompile.call(this,shader,renderer);
        shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_begin>',courseFragment);
      };
      material.customProgramCacheKey=()=>`${key}:course-shadow-coverage-v1`;material.needsUpdate=true;
    }
  });
}
