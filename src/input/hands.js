// Reads tracked hands (or controllers, or a mouse) into one simple per-hand state each frame.
import * as THREE from 'three';
import { PinchDetector } from './gestures.js';

const JOINTS = [
  'wrist', 'thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip',
  'index-finger-metacarpal', 'index-finger-phalanx-proximal', 'index-finger-phalanx-intermediate', 'index-finger-phalanx-distal', 'index-finger-tip',
  'middle-finger-metacarpal', 'middle-finger-phalanx-proximal', 'middle-finger-phalanx-intermediate', 'middle-finger-phalanx-distal', 'middle-finger-tip',
  'ring-finger-metacarpal', 'ring-finger-phalanx-proximal', 'ring-finger-phalanx-intermediate', 'ring-finger-phalanx-distal', 'ring-finger-tip',
  'pinky-finger-metacarpal', 'pinky-finger-phalanx-proximal', 'pinky-finger-phalanx-intermediate', 'pinky-finger-phalanx-distal', 'pinky-finger-tip',
];
export const JOINT_NAMES = JOINTS;
const UP = new THREE.Vector3(0, 1, 0);

export function makeHandState(handedness) {
  return {
    handedness,
    present: false,
    kind: 'none', // 'hand' | 'controller' | 'mouse'
    joints: Array.from({ length: 25 }, () => new THREE.Vector3()),
    radii: new Float32Array(25).fill(0.008),
    pinchPoint: new THREE.Vector3(),
    indexTip: new THREE.Vector3(),
    wristQuat: new THREE.Quaternion(),
    forward: new THREE.Vector3(0, 0, -1),
    palmNormal: new THREE.Vector3(0, -1, 0),
    palmUp: false,
    pinchDist: 1,
    pinch: { down: false, started: false, ended: false },
    detector: new PinchDetector(),
    twistOverride: 0, // mouse wheel twist (radians) for this frame
  };
}

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class HandInput {
  constructor() {
    this.hands = { left: makeHandState('left'), right: makeHandState('right') };
    this.poses = new Float32Array(16 * 25);
    this.radii = new Float32Array(25);
  }

  // XR frame path.
  updateXR(frame, refSpace, session) {
    const seen = { left: false, right: false };
    for (const src of session.inputSources) {
      const h = this.hands[src.handedness];
      if (!h) continue;
      if (src.hand) {
        if (this.readHand(frame, refSpace, src.hand, h)) seen[src.handedness] = true;
      } else if (src.gripSpace) {
        if (this.readController(frame, refSpace, src, h)) seen[src.handedness] = true;
      }
    }
    for (const k of ['left', 'right']) {
      const h = this.hands[k];
      if (!seen[k]) this.clear(h);
    }
  }

  clear(h) {
    h.present = false;
    // Keep the detector's state: if the hand comes back open, the next update reports the release,
    // so a piece never stays stuck to a hand that let go while it was out of view.
    h.pinch = { down: h.detector.down, started: false, ended: false };
  }

  readHand(frame, refSpace, hand, h) {
    const spaces = JOINTS.map((n) => hand.get(n));
    if (spaces.some((s) => !s)) return false;
    let ok = false;
    if (frame.fillPoses) {
      ok = frame.fillPoses(spaces, refSpace, this.poses);
      if (ok && frame.fillJointRadii) frame.fillJointRadii(spaces, this.radii);
      if (ok) for (let i = 0; i < 25; i++) {
        _m.fromArray(this.poses, i * 16);
        h.joints[i].setFromMatrixPosition(_m);
        h.radii[i] = this.radii[i] || 0.008;
        if (i === 0) { _m.decompose(_p, _q, _s); h.wristQuat.copy(_q); }
      }
    } else {
      ok = true;
      for (let i = 0; i < 25; i++) {
        const pose = frame.getJointPose(spaces[i], refSpace);
        if (!pose) { ok = false; break; }
        const t = pose.transform;
        h.joints[i].set(t.position.x, t.position.y, t.position.z);
        h.radii[i] = pose.radius || 0.008;
        if (i === 0) h.wristQuat.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
      }
    }
    if (!ok) return false;
    h.present = true; h.kind = 'hand';
    const thumb = h.joints[4], index = h.joints[9];
    // Allow for big fingers: measure between the tip surfaces, re-based to typical tip radii.
    h.pinchDist = thumb.distanceTo(index) - Math.max(0, h.radii[4] + h.radii[9] - 0.016);
    h.pinchPoint.copy(thumb).add(index).multiplyScalar(0.5);
    h.indexTip.copy(index);
    h.forward.set(0, 0, -1).applyQuaternion(h.wristQuat);
    h.palmNormal.set(0, -1, 0).applyQuaternion(h.wristQuat);
    // Palm up and fingers open (index tip far from thumb tip).
    h.palmUp = h.palmNormal.dot(UP) > 0.72;
    if (h.palmUp) h.palmUpAt = performance.now();
    h.pinch = h.detector.update(h.pinchDist);
    return true;
  }

  readController(frame, refSpace, src, h) {
    const pose = frame.getPose(src.gripSpace, refSpace);
    if (!pose) return false;
    const t = pose.transform;
    h.present = true; h.kind = 'controller';
    h.wristQuat.set(t.orientation.x, t.orientation.y, t.orientation.z, t.orientation.w);
    h.forward.set(0, 0, -1).applyQuaternion(h.wristQuat);
    h.pinchPoint.set(t.position.x, t.position.y, t.position.z).addScaledVector(h.forward, 0.05);
    h.indexTip.copy(h.pinchPoint);
    h.palmNormal.set(0, -1, 0).applyQuaternion(h.wristQuat);
    h.palmUp = false;
    const trigger = src.gamepad?.buttons?.[0]?.value ?? 0;
    h.pinchDist = trigger > 0.6 ? 0 : 0.05;
    h.pinch = h.detector.update(h.pinchDist);
    return true;
  }
}

// Mouse fallback for desktop preview: the "hand" sits where the pointer ray meets a plane just above the board.
export class MouseHand {
  constructor(dom, camera, getBoardPlane, buttons = null) {
    this.state = makeHandState('right');
    this.state.kind = 'mouse';
    this.camera = camera; this.getBoardPlane = getBoardPlane;
    this.ndc = new THREE.Vector2(); this.ray = new THREE.Raycaster();
    this.downReq = false; this.wheel = 0; this.active = false;
    dom.addEventListener('pointermove', (e) => { this.setNdc(e, dom); this.active = true; });
    dom.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      this.setNdc(e, dom); this.active = true;
      this.ray.setFromCamera(this.ndc, camera);
      // Hit the rendered button/tag, not its projection onto the pipe plane.
      const button = buttons && desktopButtonAt(this.ray, buttons.list());
      if (button) { buttons.press(button.id); return; }
      this.downReq = true;
    });
    window.addEventListener('pointerup', () => { this.downReq = false; });
    dom.addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY) * (Math.PI / 12); e.preventDefault(); }, { passive: false });
    window.addEventListener('keydown', (e) => { if (e.key === 'r' || e.key === 'R') this.wheel += Math.PI / 3 + 0.01; });
  }
  setNdc(e, dom) {
    const r = dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }
  update() {
    const h = this.state;
    h.present = this.active;
    this.ray.setFromCamera(this.ndc, this.camera);
    const plane = this.getBoardPlane();
    const hit = new THREE.Vector3();
    if (plane && this.ray.ray.intersectPlane(plane, hit)) h.pinchPoint.copy(hit);
    h.indexTip.copy(h.pinchPoint);
    h.twistOverride = this.wheel; this.wheel = 0;
    const wasDown = h.pinch.down;
    h.pinch = { down: this.downReq, started: this.downReq && !wasDown, ended: !this.downReq && wasDown };
    h.palmUp = false;
  }
}

// A desktop click targets the actual visible surface. XR still uses near pinch/poke.
export function desktopButtonAt(ray, buttons) {
  let closest = null, distance = Infinity;
  for (const button of buttons) {
    if (!button.enabled || !button.group.visible) continue;
    button.group.updateWorldMatrix(true, true);
    const targets = [button.cap];
    if (button.tag?.mesh.visible) targets.push(button.tag.mesh);
    for (const hit of ray.intersectObjects(targets, true)) {
      if (hit.distance < distance) { closest = button; distance = hit.distance; }
    }
  }
  return closest;
}
