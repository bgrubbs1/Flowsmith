// Runs the scripted demo against a stand-in for the emulator's hand, in real time, to check the script solves what it shows.
import './stub-dom.js';
import { it, expect } from 'vitest';
import * as THREE from 'three';
import { App } from '../src/game/app.js';
import { Director } from '../src/director.js';
import { makeHandState } from '../src/input/hands.js';

it('short capture completes exactly three lessons without entering campaign', async () => {
  const app = new App(new THREE.Scene(), new Proxy({}, { get: () => () => {} }));
  app.anchor.position.set(0, 0.84, -0.42);
  app.anchor.updateMatrixWorld(true);
  const h = makeHandState('right'); h.kind = 'hand'; h.present = true;
  let pinchV = 0, pose = 'default';
  const fakeHand = {
    set poseId(p) { pose = p; },
    setPin(pin) {
      h.pinchPoint.fromArray(pin.target);
      h.indexTip.copy(pose === 'point' ? h.pinchPoint : new THREE.Vector3(0, 9, 0));
      if (pose === 'point') h.pinchPoint.set(0, 9, 0);
      h.wristQuat.fromArray(pin.wristRotation);
      h.forward.set(0, 0, -1).applyQuaternion(h.wristQuat);
    },
    updatePinchValue(v) { pinchV = v; },
  };
  const device = { hands: { right: fakeHand, left: {} } };
  const solvedIds = [];
  app.onEvent((e) => { if (e.type === 'solved') solvedIds.push(e.id); });
  const d = new Director(app, device, null);
  let now = 0;
  const pump = setInterval(() => {
    h.pinch = h.detector.update(pinchV > 0.9 ? 0.005 : 0.06);
    now += 1 / 72;
    app.update(1 / 72, [h], now, null);
    app.anchor.updateMatrixWorld(true);
  }, 1000 / 72);
  try { await d.run({ lessonsOnly: true }); } finally { clearInterval(pump); }
  console.log('solved during demo:', solvedIds.join(', '));
  expect(solvedIds).toEqual(['l1','l2','l3']);
  expect(app.def.id).toBe('l3');
}, 240000);
