import './stub-dom.js';
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { App } from '../src/game/app.js';
import { makeHandState, HandInput } from '../src/input/hands.js';
import { PIPE_Y } from '../src/view/materials.js';

const quietSound = new Proxy({}, { get: () => () => {} });

function setup() {
  const scene = new THREE.Scene();
  const app = new App(scene, quietSound);
  app.anchor.position.set(0, 0.8, -0.4);
  app.anchor.rotation.y = 0.3; // not axis-aligned, to catch frame mistakes
  app.anchor.updateMatrixWorld(true);
  const hand = makeHandState('right');
  hand.present = true; hand.kind = 'hand';
  hand.indexTip.set(0, 5, 0); // keep the fingertip away from buttons unless poking
  let now = 0;
  const frame = (n = 1) => { for (let i = 0; i < n; i++) { now += 1 / 72; app.update(1 / 72, [hand], now, null); hand.pinch.started = hand.pinch.ended = false; app.anchor.updateMatrixWorld(true); } };
  const world = (local) => app.board.root.localToWorld(local.clone());
  const moveTo = (local) => { hand.pinchPoint.copy(world(local)); };
  const pinch = () => { hand.pinch = { down: true, started: true, ended: false }; frame(); };
  const release = () => { hand.pinch = { down: false, started: false, ended: true }; frame(); };
  // Twist the wrist about its forward axis by `rad` over a few frames.
  const twist = (rad, steps = 6) => {
    for (let k = 0; k < steps; k++) {
      hand.wristQuat.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, -1), rad / steps));
      hand.forward.set(0, 0, -1).applyQuaternion(hand.wristQuat);
      frame();
    }
  };
  const poke = (btnId) => {
    if (app.mode !== 'menu' && (btnId.startsWith('level:') || btnId === 'daily')) poke('levels');
    const b = app.mode === 'menu' ? app.menu.buttons.find((x) => x.id === btnId) : app.board.buttons.find((x) => x.id === btnId);
    const root = app.mode === 'menu' ? app.menu.root : app.board.root;
    const top = b.group.position.clone(); top.y += 0.03;
    hand.indexTip.copy(root.localToWorld(top.clone())); frame(2);
    top.y -= 0.03; hand.indexTip.copy(root.localToWorld(top.clone())); frame(2);
    hand.indexTip.set(0, 5, 0); frame(2);
  };
  return { app, hand, frame, moveTo, pinch, release, twist, poke, world };
}

const above = (v) => v.clone().setY(PIPE_Y);

describe('playing with hands (synthetic)', () => {
  it('menu poke opens lesson 1; pinch-carry-drop solves it', () => {
    const t = setup();
    // A brand-new player lands straight in lesson 1, no menu first.
    expect(t.app.mode).toBe('play');
    expect(t.app.def.id).toBe('l1');
    const st = t.app.st;
    const slot = t.app.board.traySlot(0, st.tray.length);
    t.moveTo(above(slot).setY(slot.y + PIPE_Y)); t.frame();
    t.pinch();
    const s = t.app.def.solution[0];
    const target = t.app.board.cellCenter(s.r, s.c);
    for (let k = 1; k <= 10; k++) { t.moveTo(above(slot.clone().lerp(target, k / 10)).setY(0.03)); t.frame(); }
    t.frame(8); t.release();
    t.frame(40);
    expect(st.result.solved).toBe(true);
    expect(t.app.solved).toBe(true);
    expect(t.app.progress.stars.l1).toBe(3);
  });

  it('lesson 2: twisting the wrist while carrying turns the elbow', () => {
    const t = setup();
    t.poke('level:1');
    const st = t.app.st;
    const slot = t.app.board.traySlot(0, st.tray.length);
    t.moveTo(above(slot)); t.frame(); t.pinch();
    t.twist(Math.PI / 3 + 0.05); t.twist(Math.PI / 3 + 0.05); // a 60 degree wrist twist = one quarter turn; rot 2 -> 0
    const s = t.app.def.solution[0];
    const target = t.app.board.cellCenter(s.r, s.c);
    for (let k = 1; k <= 10; k++) { t.moveTo(above(slot.clone().lerp(target, k / 10)).setY(0.03)); t.frame(); }
    t.frame(8); t.release(); t.frame(40);
    expect(st.result.solved).toBe(true);
  });

  it('lesson 2 alt: quick pinch-taps on a placed piece rotate it', () => {
    const t = setup();
    t.poke('level:1');
    const st = t.app.st;
    const slot = t.app.board.traySlot(0, st.tray.length);
    const s = t.app.def.solution[0];
    const target = t.app.board.cellCenter(s.r, s.c);
    t.moveTo(above(slot)); t.frame(); t.pinch();
    for (let k = 1; k <= 10; k++) { t.moveTo(above(slot.clone().lerp(target, k / 10)).setY(0.03)); t.frame(); }
    t.frame(8); t.release(); t.frame(10);
    expect(st.result.solved).toBe(false);
    for (let k = 0; k < 4 && !st.result.solved; k++) { t.moveTo(above(target)); t.frame(); t.pinch(); t.frame(3); t.release(); t.frame(5); }
    expect(st.result.solved).toBe(true);
  });

  it('lesson 3: twisting the valve wheel brings the mill into the green', () => {
    const t = setup();
    t.poke('level:2');
    const st = t.app.st;
    expect(st.result.mills[0].status).toBe('high');
    const i = st.cells.findIndex((p) => p?.type === 'valve');
    const c = t.app.board.cellCenter(Math.floor(i / st.cols), i % st.cols);
    t.moveTo(c.clone().setY(PIPE_Y + 0.027)); t.frame(); t.pinch();
    let n = 0;
    while (!st.result.solved && n++ < 60) t.twist(0.05, 1);
    t.frame(8); t.release(); t.frame(40);
    expect(st.result.solved).toBe(true);
    expect(t.app.solved).toBe(true);
  });

  it('every campaign level and the daily puzzle build a scene, and hints never throw', () => {
    const t = setup();
    for (let k = 0; k < t.app.levels.length; k++) {
      t.app.startLevel(k);
      t.frame(3);
      for (let h = 0; h < 4; h++) t.app.showHint();
      t.frame(3);
    }
    t.app.startLevel('daily');
    t.frame(3);
    expect(t.app.board.objects.size).toBeGreaterThan(5);
  });

  it('hint-guided play solves generated levels through the hand path', () => {
    const t = setup();
    for (const k of [3, 6, 11]) {
      t.app.startLevel(k);
      const st = t.app.st, def = t.app.def;
      for (const s of def.solution) {
        const idx = st.tray.findIndex((p) => p.type === s.type);
        const slot = t.app.board.traySlot(idx, st.tray.length);
        const piece = st.tray[idx];
        t.moveTo(above(slot)); t.frame(); t.pinch();
        const turns = ((s.rot - piece.rot) % 4 + 4) % 4;
        for (let q = 0; q < turns; q++) t.twist(Math.PI / 3 + 0.05);
        const target = t.app.board.cellCenter(s.r, s.c);
        for (let j = 1; j <= 8; j++) { t.moveTo(above(slot.clone().lerp(target, j / 8)).setY(0.03)); t.frame(); }
        t.frame(8); t.release(); t.frame(2);
        if (s.type === 'valve') {
          const p = st.cells[s.r * st.cols + s.c];
          t.moveTo(target.clone().setY(PIPE_Y + 0.027)); t.frame(); t.pinch();
          let n = 0;
          while (Math.abs(p.open - s.open) > 0.03 && n++ < 200) t.twist(Math.sign(p.open - s.open) * 0.04, 1);
          t.release();
        }
      }
      t.frame(40);
      expect(st.result.solved, def.name).toBe(true);
    }
  });

  it('a piece is let go when the hand returns open after losing tracking', () => {
    const t = setup();
    if (t.app.mode === 'menu') t.poke('level:0');
    const input = new HandInput();
    const h = t.hand;
    h.detector = input.hands.right.detector;
    const st = t.app.st;
    const slot = t.app.board.traySlot(0, st.tray.length);
    t.moveTo(above(slot).setY(slot.y + PIPE_Y)); t.frame();
    h.pinch = h.detector.update(0.005); t.frame();
    expect(h.ix.mode).not.toBe('idle');
    // Tracking drops for a moment (the real input layer clears the hand), then the hand comes back open.
    input.clear(h); t.frame(5);
    h.present = true;
    h.pinch = h.detector.update(0.08); t.frame();
    expect(h.ix.mode).toBe('idle');
  });
});
