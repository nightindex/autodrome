import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';

// Fixed interior camera poses, with pixel witnesses linking visible defects to
// source meshes. The before snapshot stays stable across asset regeneration.
const phase = process.argv[2] ?? 'after';
const hideSourceInterior = process.argv.includes('--hide-source-interior');
const selectedPoses = process.argv.find(argument => argument.startsWith('--poses='))?.slice(8).split(',');
const directory = 'test-results/cabin-review';
await mkdir(directory, { recursive: true });
const baseline = `${directory}/before.glb`;
if (phase === 'before' && !existsSync(baseline)) await copyFile('public/assets/cobalt.glb', baseline);
const executablePath = [process.env.CHROME_PATH, 'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path => path && existsSync(path));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

try {
  if (phase === 'before' || hideSourceInterior) await page.route('**/assets/cobalt.glb*', route => route.fulfill({ path: baseline, contentType: 'model/gltf-binary' }));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__avtodrom?.snapshot().loaded, { timeout: 60000 });
  await page.click('#practice');
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.addStyleTag({ content: '#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}' });
  await page.evaluate(async hideSourceInterior => {
    const T = await import('/node_modules/three/build/three.module.js');
    const game = window.__avtodrom.scene;
    if (hideSourceInterior) game.car.getObjectByName('interior_interior0_0_bump_front_ok014_0').visible = false;
    const render = game.render.bind(game);
    window.cabinPose = { eye: [.31, .48, .2], target: [.25, .14, 1], fov: 80 };
    game.render = (...args) => {
      render(...args);
      const pose = window.cabinPose;
      game.camera.clearViewOffset();
      game.camera.near = .025;
      game.camera.fov = pose.fov;
      game.camera.updateProjectionMatrix();
      game.camera.position.copy(game.car.localToWorld(new T.Vector3(...pose.eye)));
      game.camera.up.set(0, 1, 0).applyQuaternion(game.car.quaternion);
      game.camera.lookAt(game.car.localToWorld(new T.Vector3(...pose.target)));
      game.renderer.setRenderTarget(null);
      game.renderer.setScissorTest(false);
      game.renderer.setViewport(0, 0, innerWidth, innerHeight);
      game.renderer.render(game.scene, game.camera);
    };
    window.cabinProbe = pixels => pixels.map(pixel => {
      const ray = new T.Raycaster();
      ray.setFromCamera(new T.Vector2(pixel[0] / innerWidth * 2 - 1, 1 - pixel[1] / innerHeight * 2), game.camera);
      const hits = ray.intersectObject(game.car, true).filter(hit => {
        for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
        return true;
      }).slice(0, 5).map(hit => {
        const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
        return {
          mesh: hit.object.name, material: material.name, transparent: material.transparent,
          point: game.car.worldToLocal(hit.point.clone()).toArray(), faceIndex: hit.faceIndex,
        };
      });
      return { pixel, hits };
    });
  }, hideSourceInterior);
  const poses = [
    ['driver', { eye: [.31, .48, .2], target: [.25, .14, 1], fov: 80 }],
    ['passenger', { eye: [-.34, .48, .25], target: [-.3, .05, 1], fov: 80 }],
    ['rear-forward', { eye: [0, .49, -1.02], target: [0, .13, .85], fov: 90 }],
    ['front-backward', { eye: [0, .50, .63], target: [0, .07, -1.1], fov: 90 }],
    ['rear-bench', { eye: [0, .40, -.55], target: [0, .04, -1.25], fov: 75 }],
    ['console', { eye: [0, .38, .05], target: [0, -.17, .57], fov: 76 }],
    ['footwell', { eye: [.34, .05, .25], target: [.36, -.29, 1], fov: 80 }],
    ['roofliner', { eye: [0, .40, -.05], target: [0, .80, -.35], fov: 100 }],
    ['driver-door', { eye: [.02, .40, .22], target: [.72, -.04, .2], fov: 85 }],
  ];
  const captures = [];
  const witnesses = [];
  const pixels = [[360, 240], [720, 240], [1080, 240], [360, 480], [720, 480], [1080, 480], [360, 720], [720, 720], [1080, 720]];
  for (const [name, pose] of poses) {
    if (selectedPoses && !selectedPoses.includes(name)) continue;
    await page.evaluate(pose => { window.cabinPose = pose; }, pose);
    await page.waitForTimeout(240);
    const path = `${directory}/${phase}-${name}.png`;
    await page.screenshot({ path });
    captures.push(path);
    const detailPixels = name === 'driver' ? [[250, 220], [390, 360], [1260, 360]]
      : name === 'rear-bench' ? [[200, 600], [280, 600], [1150, 600]] : [];
    witnesses.push({ pose: name, probes: await page.evaluate(pixels => window.cabinProbe(pixels), [...pixels, ...detailPixels]) });
  }
  const checks = await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const car = window.__avtodrom.scene.car;
    const checks = [];
    const probe = (name, origin, direction, expectedMaterial, expectedMesh) => {
      const ray = new T.Raycaster(car.localToWorld(new T.Vector3(...origin)), new T.Vector3(...direction).transformDirection(car.matrixWorld), 0, 3);
      const hit = ray.intersectObject(car, true).find(hit => {
        for (let object = hit.object; object; object = object.parent) if (!object.visible) return false;
        const material = Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material;
        return !material.transparent && !hit.object.userData.opticalHalo;
      });
      const material = hit && (Array.isArray(hit.object.material) ? hit.object.material[hit.face.materialIndex] : hit.object.material);
      checks.push({
        name, origin, expectedMaterial, expectedMesh,
        mesh: hit?.object.name, material: material?.name, point: hit && car.worldToLocal(hit.point.clone()).toArray(),
        passed: material?.name === expectedMaterial && (!expectedMesh || hit.object.name === expectedMesh),
      });
    };
    probe('Fabric headliner visible from inside', [0, .4, -.05], [0, 1, 0], 'COBALT_Headliner');
    probe('Rear bench fabric visible ahead of old shell', [0, .25, -.6], [0, -.15, -.7], 'COBALT_SeatFabric');
    for (const side of [-1, 1]) for (const z of [.16, .28, .4]) {
      probe(`Seat ${side} cushion cloth at z=${z}`, [side * .325, .15, z], [0, -1, 0], 'COBALT_SeatFabric', `COBALT_${side}_SeatCushion`);
    }
    for (const side of [-1, 1]) {
      probe(`Light pillar trim ${side}`, [side * .31, .48, .2], [side * .281, .011, .441], 'COBALT_Headliner');
      probe(`Rear inner wheel-well lining ${side}`, [side * .58, .2, -1.13], [0, -1, 0], 'COBALT_RearWheelWellLining');
    }
    return checks;
  });
  const report = { date: new Date().toISOString(), phase, hideSourceInterior, errors, captures, witnesses, checks };
  await writeFile(`${directory}/${phase}-report.json`, JSON.stringify(report, null, 2));
  assert.deepEqual(errors, [], 'No browser errors');
  if (phase === 'after') assert(checks.every(check => check.passed), `Cabin surface visibility: ${JSON.stringify(checks.filter(check => !check.passed))}`);
  console.log(JSON.stringify({ phase, errors, captures, witnessPoses: witnesses.map(witness => witness.pose), checks }, null, 2));
} finally {
  await browser.close();
}
