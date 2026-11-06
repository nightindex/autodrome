import { describe,expect,it } from 'vitest';
import sharp from 'sharp';
import { treePlacements,treePrototype } from '../src/render/trees';
import { roadDistance } from '../src/render/course-world';

describe('roadside trees',()=>{
  it('keeps every trunk outside asphalt with varied sizes and orientations',()=>{
    const trees=treePlacements();
    expect(trees.length).toBe(74);expect(new Set(trees.map(t=>t.variant)).size).toBe(3);
    expect(Math.min(...trees.map(roadDistance))).toBeGreaterThan(1);
    expect(Math.max(...trees.map(t=>t.scale))-Math.min(...trees.map(t=>t.scale))).toBeGreaterThan(.2);
    expect(new Set(trees.map(t=>t.yaw)).size).toBe(trees.length);
  });
  it('builds finite, indexed wood and foliage with bounded geometry and usable normals',()=>{
    for(let variant=0;variant<3;variant++){
      const tree=treePrototype(variant);
      for(const g of [tree.bark,...Object.values(tree.foliage)]){
        const p=g.getAttribute('position'),n=g.getAttribute('normal'),index=g.getIndex()!;
        expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
        expect(Math.max(...index.array)).toBeLessThan(p.count);expect(index.count%3).toBe(0);
        let minNormal=Infinity,maxNormal=0;
        for(let i=0;i<n.count;i++){const length=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));minNormal=Math.min(minNormal,length);maxNormal=Math.max(maxNormal,length);}
        expect(minNormal).toBeGreaterThan(.99);expect(maxNormal).toBeLessThan(1.01);
        g.computeBoundingBox();expect(g.boundingBox!.min.y).toBeGreaterThan(-.1);expect(g.boundingBox!.max.y).toBeLessThan(9);
        g.dispose();
      }
    }
  });
  it('reduces foliage detail at each quality level without sampling neighbouring atlas cells',()=>{
    const tree=treePrototype(0),{low,medium,high}=tree.foliage;
    expect(low.index!.count).toBeLessThan(medium.index!.count);expect(medium.index!.count).toBeLessThan(high.index!.count);
    for(const g of Object.values(tree.foliage)){
      const uv=g.getAttribute('uv');let gutter=Infinity;
      for(let i=0;i<uv.count;i++)for(const value of [uv.getX(i),uv.getY(i)]){const cell=value*2%1;gutter=Math.min(gutter,cell,1-cell);}
      expect(gutter).toBeGreaterThan(.029);g.dispose();
    }
    tree.bark.dispose();
  });
  it('ships four textured branch sprays with genuine transparent gaps',async()=>{
    const {data,info}=await sharp('public/assets/trees/foliage-atlas.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const transparent=[0,0,0,0],opaque=[0,0,0,0],total=[0,0,0,0];
    for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++){
      const tile=(x>=info.width/2?1:0)+(y>=info.height/2?2:0),alpha=data[(y*info.width+x)*info.channels+3];
      total[tile]++;if(alpha<16)transparent[tile]++;if(alpha>240)opaque[tile]++;
    }
    for(let tile=0;tile<4;tile++){expect(transparent[tile]/total[tile]).toBeGreaterThan(.1);expect(opaque[tile]/total[tile]).toBeGreaterThan(.05);}
  });
});
