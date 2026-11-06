# Roadside trees - 2 November 2026

The former cylinder/icosahedron trees are replaced by three procedurally modelled deciduous tree variants. Curved, tapered trunks have roots, main branches and secondary branches, with locally generated bark colour and normal maps. Irregular crowns use bent leaf cards with four textured branch sprays, transparent gaps, varied sizes, rotations and tints, plus subtle wind driven by simulation time. Pausing freezes the wind. Trunks remain outside the asphalt.

The 74 trees are rendered as six instanced groups: wood and foliage for each variant. Low/medium/high graphics use 48/72/96 leaf cards per tree. At medium quality the tree geometry totals 77,256 triangles before shadow and mirror passes. Leaf shadows use the same alpha cutout and movement as the visible material. Switching quality recalculates instance bounds.

## Generated texture

Saved runtime asset: [foliage-atlas.png](../public/assets/trees/foliage-atlas.png), approximately 2.6 MB. It is loaded locally with the app; no image service is contacted during gameplay. The generated RGBA image is copied unchanged into the project, preserving transparency. Code adds atlas coordinates and material settings; the PNG is not repainted or composited.

Mode: **built-in imagegen**, one new image with `transparent_background: true`. No CLI fallback or API key was used. This is generated botanical artwork, not a downloaded photograph or a scan of a specific tree species.

Final prompt:

```text
Use case: photorealistic-natural. Asset type: realtime 3D game foliage texture atlas. Create ONE square RGBA texture atlas on a genuinely transparent background, arranged in an exact 2 by 2 grid of equally sized square cells. In each quadrant put one different isolated leafy branch spray of a summer deciduous plane/ash tree, photographed orthographically from the front. Four branch sprays in total. Each spray has roughly 45-70 individually distinguishable small green leaves on fine brown twigs, in an irregular airy organic mass with numerous truly transparent small gaps between leaves. Thin branching twigs extend from the lower-middle towards the outside. Varied muted olive, mid-green and fresh green leaves, subtle leaf veins. Natural photographic botanical detail, softly lit neutral diffuse light, no directional cast shadow, no white or coloured matte. The branch sprays must fill about 85 percent of their own cell, with a fully transparent gutter on every cell edge; never touch the cell boundaries or each other. Leafy branch clusters only, no trunk, no full tree silhouettes, no whole round canopy. No text, labels, border, ground, pot, sky, scenery, checkerboard pattern or background objects. Straight-on sharp botanical material suitable for alpha-tested leaf cards in a realistic driving simulator.
```

## Repeatable review

Run `npm run test:trees` against the local development server. Screenshots cover driving, a row of trees, a closer tree and leaf detail. The script checks texture loading, material cutouts, all three quality levels and browser/console errors. Images and diagnostics are in `test-results/trees/`. Fixed review cameras inspect the geometry; they are not an additional driven playthrough.
