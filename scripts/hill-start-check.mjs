import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

const directory = 'test-results/hill-start';
await mkdir(directory, { recursive: true });
const label = process.argv.includes('--baseline') ? 'baseline' : 'current';
const executablePath = [process.env.CHROME_PATH, 'C:/Users/UXolboev/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe'].find(path => path && existsSync(path));
const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: ['--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
const errors = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
let report;
try {
  if (label === 'baseline') {
    const { transformWithOxc } = await import('vite');
    const baseline = await transformWithOxc(await readFile('test-results/tyre-forces-hill-before.ts', 'utf8'), 'tyre-forces.ts');
    await page.route('**/src/simulation/tyre-forces.ts*', route => route.fulfill({ body: baseline.code.replace("from './math'", "from '/src/simulation/math.ts'"), contentType: 'application/javascript' }));
  }
  await page.goto(process.env.AVTODROM_URL ?? 'http://127.0.0.1:5173/');
  await page.waitForFunction(() => window.__avtodrom?.snapshot().loaded, null, { timeout: 60000 });
  await page.addStyleTag({ content: '#hud,#menu-shell,#modal,.vignette,#toast{display:none!important}dialog::backdrop{display:none}' });
  await page.evaluate(async () => {
    const a = window.__avtodrom; a.start('practice'); a.pause();
    const v = a.vehicle, s = a.scene, dt = 1 / 60;
    const idle = { down: () => false };
    const input = (...actions) => ({ down: action => actions.includes(action) });
    let state;
    const sample = phase => {
      const t = v.telemetry(), position = v.body.translation();
      return { phase, frame: state.frames, time: v.time, position, velocity: v.body.linvel(), rpm: t.rpm, gear: t.gear, engine: t.engine, stalled: t.stalled, brake: t.brake, throttle: t.throttle, clutch: t.clutch, handbrake: t.handbrake, signedSpeed: t.signedSpeed, collision: t.collision,
        wheels: Array.from({ length: 4 }, (_, i) => ({ contact: v.controller.wheelIsInContact(i), load: v.controller.wheelSuspensionForce(i), engineForce: v.controller.wheelEngineForce(i), brakeImpulse: v.controller.wheelBrake(i), suspension: v.controller.wheelSuspensionLength(i), normal: v.controller.wheelContactNormal(i) })) };
    };
    const step = (controls, phase, frames, stop) => {
      for (let i = 0; i < frames; i++) {
        v.update(dt, controls, true); state.frames++;
        const t = sample(phase); state.minimumSpeed = Math.min(state.minimumSpeed, t.signedSpeed);
        if (i % 15 === 0) state.samples.push(t);
        if (stop?.(t)) { state.samples.push(t); break; }
      }
      return sample(phase);
    };
    const run = ({ target = 7, procedure = 'service', rollback = 0, brakeFrames = 180, launchFrames = 480 } = {}) => {
      state = { target, procedure, rollback, frames: 0, minimumSpeed: 0, samples: [] };
      v.reset({ x: -2, z: 42 }, Math.PI / 2);
      step(idle, 'settle', 90);
      v.action('ignition'); v.action('gear1', true); v.drivetrain.handbrake = false;
      state.approach = step(input('throttle'), 'approach', 600, t => t.position.x >= target);
      state.stopped = step(input('brake'), 'service-brake-hold', brakeFrames);
      if (rollback) state.rollbackState = step(idle, 'rollback', rollback);
      if (procedure === 'handbrake') {
        v.action('handbrake');
        state.prepared = step(input('throttle'), 'handbrake-rev', 120);
        v.action('handbrake');
      }
      state.launchStart = sample('release-and-gas');
      state.final = step(input('throttle'), 'release-and-gas', launchFrames, t => t.position.x >= 16);
      state.distance = state.final.position.x - state.launchStart.position.x;
      state.restarted = state.final.position.x >= 16;
      return { ...state };
    };
    const render = s.render.bind(s);
    s.render = (...args) => {
      render(...args); s.guide.visible = s.goal.visible = false;
      const p = v.body.translation();
      s.camera.clearViewOffset(); s.camera.fov = 48; s.camera.updateProjectionMatrix();
      s.camera.position.set(p.x - 7, p.y + 3, p.z + 5); s.camera.lookAt(p.x + 2, p.y, p.z);
      s.renderer.setRenderTarget(null); s.renderer.setScissorTest(false); s.renderer.setViewport(0, 0, innerWidth, innerHeight); s.renderer.render(s.scene, s.camera);
    };
    window.__hillStartCheck = { run, render: () => s.render(v, dt, v.time, false, 0) };
  });
  const scenarios = [];
  for (const target of [4.5, 5.5, 6.5]) {
    for (const procedure of ['service', 'handbrake']) {
      const run = await page.evaluate(options => window.__hillStartCheck.run(options), { target, procedure });
      scenarios.push(run);
      if (target === 5.5) {
        await page.evaluate(() => window.__hillStartCheck.render());
        await page.screenshot({ path: `${directory}/${label}-${procedure}.png` });
      }
    }
  }
  for (const rollback of [30, 60]) scenarios.push(await page.evaluate(options => window.__hillStartCheck.run(options), { target: 6.5, procedure: 'service', rollback }));
  // Exercise the actual key handlers and application step with deterministic
  // fixed steps, so rendering speed does not change the pedal sequence.
  const keyboard = {};
  await page.evaluate(() => window.__hillStartCheck.run({ target: 5.5, brakeFrames: 0, launchFrames: 0 }));
  await page.evaluate(() => window.__avtodrom.resume());
  await page.keyboard.down('KeyS');
  keyboard.stopped = await page.evaluate(() => {
    const a = window.__avtodrom;
    for (let i = 0; i < 180; i++) a.step(1 / 60);
    a.pause(); return a.snapshot().telemetry;
  });
  await page.keyboard.up('KeyS');
  await page.evaluate(() => window.__avtodrom.resume());
  await page.keyboard.down('KeyW');
  keyboard.launched = await page.evaluate(() => {
    const a = window.__avtodrom;
    for (let i = 0; i < 240; i++) a.step(1 / 60);
    a.pause(); return a.snapshot().telemetry;
  });
  await page.keyboard.up('KeyW');
  const check = (name, condition) => checks.push({ name, passed: !!condition });
  check('Actual course hill approached in first gear', scenarios.every(s => s.approach.gear === 1 && s.approach.engine && s.approach.signedSpeed > .5));
  check('Service brake brings the vehicle to rest', scenarios.every(s => Math.abs(s.stopped.signedSpeed) < .15));
  check('All stops remain entirely on the uphill slope', scenarios.every(s => s.stopped.position.x > 4 && s.stopped.position.x < 11.5 && s.stopped.wheels.every(w => w.contact && w.normal.x < -.1)));
  if (label === 'baseline') check('Service brake release reproduces the reported blockage', scenarios.some(s => s.procedure === 'service' && !s.rollback && !s.restarted));
  else check('Throttle restarts every service-brake and rollback scenario uphill', scenarios.filter(s => s.procedure === 'service').every(s => s.restarted));
  check('Handbrake launch remains available', scenarios.filter(s => s.procedure === 'handbrake').every(s => s.restarted));
  check('Keyboard S stops the car on the uphill slope', keyboard.stopped.brake > .99 && Math.abs(keyboard.stopped.signedSpeed) < .15 && keyboard.stopped.position.x > 4 && keyboard.stopped.position.x < 11.5);
  check(label === 'baseline' ? 'Historical keyboard W release reproduces blockage' : 'Keyboard W restarts uphill after S release', label === 'baseline' ? keyboard.launched.signedSpeed < .1 && keyboard.launched.position.x < keyboard.stopped.position.x : keyboard.launched.signedSpeed > 1 && keyboard.launched.position.x > keyboard.stopped.position.x + 2);
  check('Keyboard throttle release has no service brake or handbrake applied', keyboard.launched.brake === 0 && !keyboard.launched.handbrake && keyboard.launched.engine);
  check('No browser errors', errors.length === 0);
  report = { label, date: new Date().toISOString(), dt: 1 / 60, course: { z: 42, yaw: Math.PI / 2 }, scenarios, keyboard, checks, errors };
  console.log(JSON.stringify({ label, checks, keyboard, scenarios: scenarios.map(s => ({ target: s.target, procedure: s.procedure, rollback: s.rollback, stopped: { x: s.stopped.position.x, speed: s.stopped.signedSpeed, rpm: s.stopped.rpm }, prepared: s.prepared && { speed: s.prepared.signedSpeed, rpm: s.prepared.rpm }, restarted: s.restarted, distance: s.distance, minimumSpeed: s.minimumSpeed, final: { x: s.final.position.x, speed: s.final.signedSpeed, rpm: s.final.rpm, clutch: s.final.clutch, brake: s.final.brake, wheelEngineForces: s.final.wheels.map(w => w.engineForce), wheelBrakeImpulses: s.final.wheels.map(w => w.brakeImpulse) } })), errors }, null, 2));
  assert(checks.every(c => c.passed), checks.filter(c => !c.passed).map(c => c.name).join('\n'));
} catch (error) {
  report = { ...report, errors, checks, failure: String(error) }; throw error;
} finally {
  if (report) await writeFile(`${directory}/${label}.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
