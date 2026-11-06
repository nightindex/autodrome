import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';

// Examine the same model in a shadow-free studio. Normal colour exposes surface
// discontinuities independently of the game's moving shadows and reflections.
const phase = process.argv[2] ?? 'after';
const directory = 'test-results/surface-review';
await mkdir(directory, { recursive: true });
const baseline = `${directory}/before.glb`;
if (phase === 'before' && !existsSync(baseline)) await copyFile('public/assets/cobalt.glb', baseline);
const executablePath = [process.env.CHROME_PATH, 'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path => path && existsSync(path));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  if (phase === 'before') await page.route('**/assets/cobalt.glb*', route => route.fulfill({ path: baseline, contentType: 'model/gltf-binary' }));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__avtodrom?.snapshot().loaded, { timeout: 60000 });
  await page.click('#practice');
  await page.waitForTimeout(600);
  await page.keyboard.press('Escape');
  await page.addStyleTag({ content: '#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}' });
  const geometry = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const { RoomEnvironment } = await import('/node_modules/three/examples/jsm/environments/RoomEnvironment.js');
    const game = window.__avtodrom.scene;
    const scene = new T.Scene();
    scene.background = new T.Color(0x565d66);
    const pmrem = new T.PMREMGenerator(game.renderer);
    const room = new RoomEnvironment();
    const environment = pmrem.fromScene(room, .04);
    scene.environment = environment.texture;
    scene.environmentIntensity = .55;
    room.dispose();
    pmrem.dispose();
    scene.add(new T.HemisphereLight(0xf4f7ff, 0x444449, .8));
    const light = new T.DirectionalLight(0xffffff, 2.1);
    light.position.set(-4, 5, 3);
    scene.add(light);
    const car = game.car.clone(true);
    car.position.set(0, 0, 0);
    car.quaternion.identity();
    car.scale.set(1, 1, 1);
    scene.add(car);
    const normal = new T.MeshNormalMaterial();
    const painted = [];
    let triangles = 0;
    car.traverse(node => {
      if (node.isLight) node.visible = false;
      if (!node.isMesh) return;
      node.castShadow = node.receiveShadow = false;
      triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      if (materials.some(material => material.name === 'Realistic_Car_Paint')) {
        painted.push({ node, original: node.material, normal: Array.isArray(node.material) ? materials.map(material => material.name === 'Realistic_Car_Paint' ? normal : material) : normal });
      }
    });
    const camera = new T.PerspectiveCamera(43, innerWidth / innerHeight, .05, 100);
    // Retain original material names while the normal material is active, so a
    // suspicious screenshot pixel can be traced back to its source triangle.
    window.surfaceProbe = pixels => pixels.map(pixel => {
      const ray = new T.Raycaster();
      ray.setFromCamera(new T.Vector2(pixel[0] / innerWidth * 2 - 1, 1 - pixel[1] / innerHeight * 2), camera);
      const hits = ray.intersectObject(car, true).slice(0, 4).map(hit => {
        const original = painted.find(entry => entry.node === hit.object)?.original ?? hit.object.material;
        const material = Array.isArray(original) ? original[hit.face.materialIndex] : original;
        const geometry = hit.object.geometry;
        return {
          mesh: hit.object.name, material: material.name, transparent: material.transparent,
          point: car.worldToLocal(hit.point.clone()).toArray(), faceIndex: hit.faceIndex,
          vertices: [hit.face.a, hit.face.b, hit.face.c].map(index => ({
            position: car.worldToLocal(hit.object.localToWorld(new T.Vector3().fromBufferAttribute(geometry.attributes.position, index))).toArray(),
            normal: new T.Vector3().fromBufferAttribute(geometry.attributes.normal, index).transformDirection(hit.object.matrixWorld).toArray(),
          })),
        };
      });
      return { pixel, hits };
    });
    game.renderer.shadowMap.enabled = false;
    game.renderer.toneMappingExposure = .8;
    game.renderer.setPixelRatio(1);
    game.renderer.setSize(innerWidth, innerHeight);
    // Replace the game callback so it cannot overwrite the diagnostic camera.
    window.surfacePose = { eye: [3.7, 1.1, 4.2], target: [0, .1, 0], mode: 'paint', fov: 43 };
    game.render = () => {
      const pose = window.surfacePose;
      painted.forEach(({ node, original, normal }) => { node.material = pose.mode === 'normal' ? normal : original; });
      camera.fov = pose.fov;
      camera.updateProjectionMatrix();
      camera.position.set(...pose.eye);
      camera.lookAt(...pose.target);
      game.renderer.setRenderTarget(null);
      game.renderer.setScissorTest(false);
      game.renderer.setViewport(0, 0, innerWidth, innerHeight);
      game.renderer.render(scene, camera);
    };
    return { paintedMeshes: painted.length, triangles };
  });
  const poses = [
    ['front-left', { eye: [3.7, 1.2, 4.3], target: [0, .1, .05], fov: 43 }],
    ['front-right', { eye: [-3.7, 1.2, 4.3], target: [0, .1, .05], fov: 43 }],
    ['left-side', { eye: [5.5, .58, .15], target: [0, .08, 0], fov: 43 }],
    ['right-side', { eye: [-5.5, .58, .15], target: [0, .08, 0], fov: 43 }],
    ['rear-left', { eye: [3.6, 1.15, -4.2], target: [0, .1, -.15], fov: 43 }],
    ['roof-hood', { eye: [2, 3.6, 2.9], target: [0, .25, .05], fov: 50 }],
    ['roof-edge', { eye: [.85, 1.55, -1.7], target: [0, .63, -.65], fov: 55 }],
  ];
  const captures = [];
  const witnesses = [];
  for (const [name, pose] of poses) for (const mode of ['paint', 'normal']) {
    await page.evaluate(pose => { window.surfacePose = pose; }, { ...pose, mode });
    await page.waitForTimeout(180);
    const path = `${directory}/${phase}-${name}-${mode}.png`;
    await page.screenshot({ path });
    captures.push(path);
    const pixels = name === 'front-left' ? [[815, 625], [822, 625], [812, 620], [812, 631], [815, 615]]
      : name === 'rear-left' ? [[875, 416], [910, 408], [950, 402], [990, 399], [1030, 398]] : [];
    if (mode === 'normal' && pixels.length) witnesses.push({ pose: name, probes: await page.evaluate(pixels => window.surfaceProbe(pixels), pixels) });
  }
  const report = { date: new Date().toISOString(), phase, geometry, errors, captures, witnesses };
  await writeFile(`${directory}/${phase}-report.json`, JSON.stringify(report, null, 2));
  assert.equal(geometry.paintedMeshes > 0, true, 'Studio contains painted body panels');
  assert.deepEqual(errors, [], 'No browser errors');
  console.log(JSON.stringify({ phase, geometry, errors, captures, witnessPoses: witnesses.map(witness => witness.pose) }, null, 2));
} finally {
  await browser.close();
}
