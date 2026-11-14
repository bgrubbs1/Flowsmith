// Pure gesture helpers, unit-tested without a headset.
import * as THREE from 'three';

export const PINCH_START = 0.019; // metres between thumb tip and index tip
export const PINCH_END = 0.034;

export class PinchDetector {
  constructor() { this.down = false; }
  // Returns { down, started, ended }
  update(distance) {
    let started = false, ended = false;
    if (!this.down && distance < PINCH_START) { this.down = true; started = true; }
    else if (this.down && distance > PINCH_END) { this.down = false; ended = true; }
    return { down: this.down, started, ended };
  }
}

// Signed rotation (radians) of `qNow` relative to `qPrev` about world-space `axis` (swing-twist decomposition).
const _qi = new THREE.Quaternion();
const _qd = new THREE.Quaternion();
export function twistDelta(qPrev, qNow, axis) {
  _qi.copy(qPrev).invert();
  _qd.copy(qNow).multiply(_qi);
  const proj = _qd.x * axis.x + _qd.y * axis.y + _qd.z * axis.z;
  let a = 2 * Math.atan2(proj, _qd.w);
  if (a > Math.PI) a -= 2 * Math.PI;
  if (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// Accumulates twist into whole quarter turns with hysteresis.
export class QuarterTurner {
  constructor(stepAngle = Math.PI / 3) { this.step = stepAngle; this.acc = 0; }
  // Returns integer number of quarter turns to apply now (+ clockwise from the player's view).
  add(delta) {
    this.acc += delta;
    let turns = 0;
    while (this.acc >= this.step) { this.acc -= this.step; turns++; }
    while (this.acc <= -this.step) { this.acc += this.step; turns--; }
    return turns;
  }
  // Partial progress in -1..1 for visual feedback.
  get partial() { return this.acc / this.step; }
}

// Tap = short pinch with little movement.
export function isTap(durationS, travelM) { return durationS < 0.32 && travelM < 0.015; }
