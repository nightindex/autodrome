import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';

// Matched cameras for the supplied Cobalt interior photo and independent column controls.
const phase = process.argv[2] ?? 'after';
const directory = process.env.CABIN_CAPTURE_DIRECTORY || 'test-results/cabin-reference';
await mkdir(directory, { recursive: true });
if (phase === 'before' && !existsSync(`${directory}/before.glb`)) await copyFile('public/assets/cobalt.glb', `${directory}/before.glb`);
const executablePath = [process.env.CHROME_PATH, 'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path => path && existsSync(path));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [], captures = [], checks = [];
const check = (name, passed, detail) => { checks.push({ name, passed, ...(detail ? { detail } : {}) }); assert(passed, `${name}${detail ? `: ${JSON.stringify(detail)}` : ''}`); };
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
try {
  if (phase === 'before') await page.route('**/assets/cobalt.glb*', route => route.fulfill({ path: `${directory}/before.glb`, contentType: 'model/gltf-binary' }));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__avtodrom?.snapshot().loaded, null, { timeout: 60000 });
  await page.click('#practice');
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: '#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}' });
  await page.evaluate(async () => {
    const T = await import('/node_modules/three/build/three.module.js');
    const scene = window.__avtodrom.scene, render = scene.render.bind(scene);
    window.cabinReferencePose = { eye: [.31, .48, .2], target: [.31, .24, .80], fov: 55 };
    scene.render = (...args) => {
      render(...args);
      const pose = window.cabinReferencePose;
      scene.camera.clearViewOffset(); scene.camera.near = .025; scene.camera.fov = pose.fov; scene.camera.updateProjectionMatrix();
      scene.camera.position.copy(scene.car.localToWorld(new T.Vector3(...pose.eye)));
      scene.camera.up.set(0, 1, 0).applyQuaternion(scene.car.quaternion);
      scene.camera.lookAt(scene.car.localToWorld(new T.Vector3(...pose.target)));
      const hidden = [], background = scene.scene.background;
      if (pose.isolate) {
        const rootName = pose.isolate === 'indicator' ? 'COBALT_INDICATOR_STALK' : 'COBALT_WIPER_STALK';
        scene.car.traverse(object => {
          if (!object.isMesh) return;
          let selected = false; for (let parent = object; parent; parent = parent.parent) if (parent.name === rootName) selected = true;
          if (!selected) { hidden.push([object, object.visible]); object.visible = false; }
        });
        for (const object of scene.scene.children) if (object !== scene.car && !object.isLight) { hidden.push([object, object.visible]); object.visible = false; }
        scene.scene.background = new T.Color(0xb6bdc4);
      }
      scene.renderer.setRenderTarget(null); scene.renderer.setScissorTest(false); scene.renderer.setViewport(0, 0, innerWidth, innerHeight); scene.renderer.render(scene.scene, scene.camera);
      for (const [object, visible] of hidden) object.visible = visible;
      scene.scene.background = background;
    };
    window.cabinReferenceState = () => {
      const app = window.__avtodrom, car = app.scene.car, left = car.getObjectByName('COBALT_INDICATOR_STALK'), right = car.getObjectByName('COBALT_WIPER_STALK');
      const relativeQuaternion = object => object && car.getWorldQuaternion(new T.Quaternion()).invert().multiply(object.getWorldQuaternion(new T.Quaternion())).toArray();
      const ancestors = []; for (let node = left?.parent; node; node = node.parent) ancestors.push(node.name);
      return { indicator: app.vehicle.indicator, hazards: app.vehicle.hazards, steering: app.vehicle.telemetry().steering, left: left?.rotation.z, leftAncestors: ancestors,
        leftInCar: relativeQuaternion(left), right: right?.quaternion.toArray(), rightInCar: relativeQuaternion(right), wheelInCar: relativeQuaternion(car.getObjectByName('COBALT_STEERING_ASSEMBLY')) };
    };
    window.cabinReferenceLighting = () => {
      const values = new Map();
      scene.car.traverse(object => {
        for (const material of object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : []) {
          if (['COBALT_ControlBacklight', 'COBALT_TachometerFace', 'COBALT_FactoryRadio', 'COBALT_ClimateLabels'].includes(material.name)) values.set(material.name, material.emissiveIntensity);
        }
      });
      return Object.fromEntries(values);
    };
  });
  const capture = async (name, pose, portrait = false) => {
    await page.setViewportSize(typeof portrait === 'object' ? portrait : portrait ? { width: 680, height: 850 } : { width: 1440, height: 960 });
    if (pose) await page.evaluate(pose => { window.cabinReferencePose = pose; }, pose);
    await page.waitForTimeout(400);
    const path = `${directory}/${phase}-${name}.png`; await page.screenshot({ path }); captures.push(path);
  };
  await capture('driver', { eye: [.31, .48, .2], target: [.31, .24, .80], fov: 55 });
  await capture('game-driver', { eye: [.31, .48, .2], target: [.31, .455, 1.20], fov: 70 });
  await capture('left-windscreen-joint', { eye: [.31, .48, .2], target: [.63, .39, .92], fov: 40 });
  await capture('right-windscreen-joint', { eye: [-.31, .48, .2], target: [-.63, .39, .92], fov: 40 });
  await capture('steering-detail', { eye: [.308, .32, .05], target: [.308, .113, .585], fov: 46 });
  await capture('photo-cabin', { eye: [0, .58, -.02], target: [0, -.08, .90], fov: 62 });
  await capture('reference-angle', { eye: [.61, .33, .15], target: [.25, .10, .70], fov: 65 }, true);
  await capture('manual-reference', { eye: [.50, .38, .12], target: [.13, .10, .88], fov: 70 }, { width: 1170, height: 600 });
  await capture('indicator-detail', { eye: [.65, .27, .43], target: [.46, .132, .72], fov: 42 });
  await capture('indicator-legend', { eye: [.49, .17, .60], target: [.49, .138, .70], fov: 50 });
  await capture('wiper-detail', { eye: [.06, .24, .43], target: [.14, .15, .72], fov: 42 });
  await capture('wiper-legend', { eye: [.15, .18, .56], target: [.15, .15, .71], fov: 50 });
  await capture('indicator-part', { eye: [.454, .185, .49], target: [.454, .140, .712], fov: 32, isolate: 'indicator' }, { width: 1200, height: 600 });
  await capture('wiper-part', { eye: [.16, .195, .49], target: [.16, .15, .707], fov: 32, isolate: 'wiper' }, { width: 1200, height: 600 });
  if (phase === 'after') {
    const buttonMeshes = await page.evaluate(() => {
      const names = [];
      window.__avtodrom.scene.car.traverse(object => {
        const materials = object.material ? (Array.isArray(object.material) ? object.material : [object.material]) : [];
        if (materials.some(material => /^COBALT_Steering(?:Buttons|Rockers|ButtonLegends)/.test(material.name))) names.push(object.name);
      });
      return names;
    });
    check('Steering wheel has no buttons, matching the latest photo', buttonMeshes.length === 0, buttonMeshes);
    check('Standard reference capture uses ignition off', !(await page.evaluate(() => window.__avtodrom.snapshot().telemetry.engine)));
    const lightsOff = await page.evaluate(() => window.cabinReferenceLighting());
    check('Cabin control backlights are off before ignition', 'COBALT_ControlBacklight' in lightsOff && Object.values(lightsOff).every(value => value === 0), lightsOff);
    await page.keyboard.press('KeyI'); await page.waitForTimeout(650);
    check('I starts the engine for the blue instrument reference', (await page.evaluate(() => window.__avtodrom.snapshot().telemetry.engine)));
    const lightsOn = await page.evaluate(() => window.cabinReferenceLighting());
    check('Ignition illuminates the cluster, radio and climate controls', ['COBALT_ControlBacklight', 'COBALT_TachometerFace', 'COBALT_FactoryRadio', 'COBALT_ClimateLabels'].every(name => lightsOn[name] > 0), lightsOn);
    await capture('reference-angle-engine-on', { eye: [.61, .33, .15], target: [.25, .10, .70], fov: 65 }, true);
    await capture('manual-reference-engine-on', { eye: [.50, .38, .12], target: [.13, .10, .88], fov: 70 }, { width: 1170, height: 600 });
    await page.keyboard.press('KeyI'); await page.waitForTimeout(650);
    check('I switches the ignition off again', !(await page.evaluate(() => window.__avtodrom.snapshot().telemetry.engine)));
    const lightsReturned = await page.evaluate(() => window.cabinReferenceLighting());
    check('Cabin control backlights turn off with ignition', Object.values(lightsReturned).every(value => value === 0), lightsReturned);
    const initial = await page.evaluate(() => window.cabinReferenceState());
    check('Both independent column switches load', initial.left !== undefined && initial.right !== undefined, initial);
    check('Indicator switch is outside the rotating wheel assembly', !initial.leftAncestors.includes('COBALT_STEERING_ASSEMBLY'), initial);
    await page.keyboard.press('KeyQ'); await page.waitForTimeout(650);
    const left = await page.evaluate(() => window.cabinReferenceState());
    check('Q selects left and lowers the indicator lever', left.indicator === 'left' && left.left < -.15, left);
    await capture('left-signal', { eye: [.31, .48, .2], target: [.31, .24, .80], fov: 55 });
    await page.keyboard.down('KeyA'); await page.waitForTimeout(650);
    const turning = await page.evaluate(() => window.cabinReferenceState());
    const angle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.reduce((sum, value, index) => sum + value * b[index], 0))));
    check('Selected lever stays latched while the wheel turns', Math.abs(turning.steering) > .2 && Math.abs(turning.left - left.left) < .001 && angle(turning.leftInCar, left.leftInCar) < .001 && angle(turning.wheelInCar, left.wheelInCar) > .2, turning);
    await capture('left-signal-wheel-turned');
    await page.keyboard.up('KeyA'); await page.waitForTimeout(650);
    await page.keyboard.press('KeyQ'); await page.waitForTimeout(650);
    const cancelled = await page.evaluate(() => window.cabinReferenceState());
    check('Repeating Q cancels the signal and returns the lever', cancelled.indicator === 'off' && Math.abs(cancelled.left) < .001, cancelled);
    await page.keyboard.press('KeyE'); await page.waitForTimeout(650);
    const right = await page.evaluate(() => window.cabinReferenceState());
    check('E selects right and raises the same lever', right.indicator === 'right' && right.left > .15, right);
    await capture('right-signal');
    await page.keyboard.press('KeyE'); await page.keyboard.press('KeyH'); await page.waitForTimeout(650);
    const hazards = await page.evaluate(() => window.cabinReferenceState());
    check('Hazard lights keep the indicator lever in neutral', hazards.indicator === 'off' && hazards.hazards && Math.abs(hazards.left) < .001, hazards);
    check('The right wiper switch stays fixed', JSON.stringify(initial.right) === JSON.stringify(hazards.right) && angle(turning.rightInCar, initial.rightInCar) < .001);
    await page.keyboard.press('KeyH');
  }
  check('No browser errors', errors.length === 0, errors);
  const report = { date: new Date().toISOString(), phase, checks, errors, captures };
  await writeFile(`${directory}/${phase}-report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
