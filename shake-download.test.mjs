import test from 'node:test';
import assert from 'node:assert/strict';
import { ShakeDetector, ShakeShortcut } from './shake-download.js';

const linear = (x, y = 0, z = 0) => ({ acceleration: { x, y, z } });
const gravity = (x = 0, y = 0, z = 9.81) => ({ acceleration: null, accelerationIncludingGravity: { x, y, z } });
function settle(detector, event = linear(0), start = 0) {
  for (let t = start; t <= start + 350; t += 50) assert.equal(detector.push(event, t), false);
}
function shake(detector, start = 450, sample = x => linear(x)) {
  return [20, -20, 20, -20].map((x, i) => detector.push(sample(x), start + i * 140));
}

test('two back-and-forth shakes trigger exactly on the fourth peak', () => {
  const d = new ShakeDetector(); settle(d);
  assert.deepEqual(shake(d), [false, false, false, true]);
});
test('one knock or one back-and-forth is insufficient', () => {
  const d = new ShakeDetector(); settle(d);
  assert.equal(d.push(linear(30), 450), false);
  assert.equal(d.push(linear(-30), 590), false);
  assert.equal(d.push(linear(0), 730), false);
});
test('walking-scale noise and repeated peaks in one direction never trigger', () => {
  const d = new ShakeDetector(); settle(d);
  for (let t = 450; t < 5000; t += 100) assert.equal(d.push(linear(4 * Math.sin(t), 3, 2), t), false);
  for (let t = 5100; t < 7000; t += 100) assert.equal(d.push(linear(25), t), false);
});
test('four peaks outside the shake time window are rejected', () => {
  const d = new ShakeDetector({ windowMs: 350 }); settle(d);
  assert.deepEqual(shake(d), [false, false, false, false]);
});
test('rapid sensor jitter cannot count as deliberate reversals', () => {
  const d = new ShakeDetector(); settle(d);
  for (let i = 0; i < 4; i++) assert.equal(d.push(linear(i % 2 ? -30 : 30), 450 + i * 10), false);
});
test('stationary gravity and slow rotation are ignored', () => {
  const d = new ShakeDetector(); settle(d, gravity());
  for (let t = 400; t < 8000; t += 50) {
    const angle = t / 8000 * Math.PI;
    assert.equal(d.push(gravity(9.81 * Math.sin(angle), 0, 9.81 * Math.cos(angle)), t), false);
  }
});
test('gravity-only devices can trigger a deliberate shake', () => {
  const d = new ShakeDetector(); settle(d, gravity());
  assert.deepEqual(shake(d, 450, x => gravity(x)), [false, false, false, true]);
});
test('missing or malformed axes cannot become zero-valued sensor data', () => {
  const d = new ShakeDetector();
  for (const value of [null, { x: null, y: 0, z: 0 }, { x: NaN, y: 0, z: 0 }, { x: Infinity, y: 0, z: 0 }]) {
    assert.equal(d.push({ acceleration: value }, 500), false);
    assert.equal(d.startedAt, null);
  }
});
test('a sensor stream gap breaks a pending shake', () => {
  const d = new ShakeDetector(); settle(d);
  d.push(linear(20), 450); d.push(linear(-20), 590);
  assert.equal(d.push(linear(20), 1200), false);
  assert.equal(d.push(linear(-20), 1340), false);
});
test('changing from gravity to linear readings resets pending peaks', () => {
  const d = new ShakeDetector(); settle(d, gravity());
  d.push(gravity(20), 450); d.push(gravity(-20), 590);
  assert.equal(d.push(linear(20), 730), false);
  assert.equal(d.push(linear(-20), 870), false);
});
test('detector cooldown blocks repeated shakes', () => {
  const d = new ShakeDetector(); settle(d); shake(d);
  assert.deepEqual(shake(d, 1000), [false, false, false, false]);
  settle(d, linear(0), 9000);
  assert.deepEqual(shake(d, 9450), [false, false, false, true]);
});

function environment(permission = 'granted', withPermissionMethod = true) {
  const win = new EventTarget(), doc = new EventTarget();
  let now = 0, triggerCount = 0, calls = 0;
  const timers = new Map(); let nextTimer = 0;
  win.isSecureContext = true;
  win.DeviceMotionEvent = class {};
  if (withPermissionMethod) win.DeviceMotionEvent.requestPermission = () => {
    calls++; return typeof permission === 'function' ? permission() : Promise.resolve(permission);
  };
  win.performance = { now: () => now };
  win.setTimeout = fn => { const id = ++nextTimer; timers.set(id, fn); return id; };
  win.clearTimeout = id => timers.delete(id);
  doc.hidden = false;
  const states = [];
  const s = new ShakeShortcut({ win, doc, onTrigger: () => triggerCount++, onState: (...state) => states.push(state) });
  function send(sample, time) {
    now = time;
    const event = new Event('devicemotion'); Object.assign(event, sample); win.dispatchEvent(event);
  }
  return { win, doc, s, states, timers, send, setNow: t => { now = t; }, get count() { return triggerCount; }, get permissionCalls() { return calls; } };
}
function sendShake(e, start = 450) {
  for (let t = start - 450; t <= start - 100; t += 50) e.send(linear(0), t);
  for (let i = 0; i < 4; i++) e.send(linear(i % 2 ? -20 : 20), start + i * 140);
}

test('permission is requested immediately; no listening occurs before grant', async () => {
  let grant; const e = environment(() => new Promise(resolve => { grant = resolve; }));
  const promise = e.s.enable();
  assert.equal(e.permissionCalls, 1); assert.equal(e.s.active, false);
  sendShake(e); assert.equal(e.count, 0);
  grant('granted'); await promise;
  sendShake(e, 1450); assert.equal(e.count, 1);
  e.s.destroy();
});
test('denied or rejected motion permission never enables downloads', async () => {
  for (const permission of ['denied', () => Promise.reject(new Error('NotAllowedError'))]) {
    const e = environment(permission); assert.equal(await e.s.enable(), false);
    sendShake(e); assert.equal(e.count, 0); assert.equal(e.s.state, 'denied'); e.s.destroy();
  }
});
test('non-iOS browsers without a permission method work', async () => {
  const e = environment('granted', false); await e.s.enable(); sendShake(e);
  assert.equal(e.count, 1); assert.equal(e.permissionCalls, 0); e.s.destroy();
});
test('one enable can request only one download and immediately removes listeners', async () => {
  const e = environment(); await e.s.enable(); sendShake(e);
  assert.equal(e.count, 1); assert.equal(e.s.active, false); assert.equal(e.s.state, 'downloaded');
  sendShake(e, 1450); assert.equal(e.count, 1);
  assert.equal(await e.s.enable(), false); assert.equal(e.permissionCalls, 1);
  e.setNow(10000); await e.s.enable(); sendShake(e, 10450); assert.equal(e.count, 2);
  e.s.destroy();
});
test('turning off explicitly prevents later shakes', async () => {
  const e = environment(); await e.s.enable(); e.s.disable(); sendShake(e);
  assert.equal(e.count, 0); assert.equal(e.timers.size, 0); e.s.destroy();
});
test('hidden tabs and page exits disarm motion', async () => {
  for (const action of ['visibility', 'pagehide']) {
    const e = environment(); await e.s.enable();
    if (action === 'visibility') { e.doc.hidden = true; e.doc.dispatchEvent(new Event('visibilitychange')); }
    else e.win.dispatchEvent(new Event('pagehide'));
    e.doc.hidden = false; sendShake(e); assert.equal(e.count, 0); assert.equal(e.s.active, false); e.s.destroy();
  }
});
test('permission resolving after a page hide does not restart listening', async () => {
  let grant; const e = environment(() => new Promise(resolve => { grant = resolve; }));
  const promise = e.s.enable(); e.doc.hidden = true; e.doc.dispatchEvent(new Event('visibilitychange'));
  grant('granted'); await promise; e.doc.hidden = false;
  sendShake(e); assert.equal(e.count, 0); assert.equal(e.s.active, false); e.s.destroy();
});
test('no sensor data times out with a usable fallback state', async () => {
  const e = environment(); await e.s.enable(); e.send({ acceleration: null }, 50);
  for (const fn of [...e.timers.values()]) fn();
  assert.equal(e.s.state, 'unavailable'); assert.equal(e.s.active, false);
  sendShake(e); assert.equal(e.count, 0); e.s.destroy();
});
test('valid sensor data clears the availability timeout', async () => {
  const e = environment(); await e.s.enable(); e.send(linear(0), 0);
  assert.equal(e.s.state, 'enabled'); assert.equal(e.timers.size, 0); e.s.destroy();
});
test('missing motion API and insecure pages are unavailable without requesting permission', async () => {
  for (const mode of ['insecure', 'unsupported']) {
    const e = environment(); e.s.destroy();
    if (mode === 'insecure') e.win.isSecureContext = false;
    else delete e.win.DeviceMotionEvent;
    const s = new ShakeShortcut({ win: e.win, doc: e.doc, onTrigger: () => assert.fail('unexpected download') });
    assert.equal(s.state, 'unsupported'); assert.equal(await s.enable(), false); assert.equal(e.permissionCalls, 0); s.destroy();
  }
});
