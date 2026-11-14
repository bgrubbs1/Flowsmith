// Scripted, real-time play-through for recording the demo video in the emulator (?emulate&vr&director).
// It moves IWER's emulated right hand exactly like a player would; every action goes through the normal game code.
import * as THREE from 'three';
import { PIPE_Y } from './view/materials.js';
import { VALVE_RANGE } from './game/interaction.js';

export function valveCorrection(error) { return Math.sign(error) * Math.min(0.15, Math.abs(error) * VALVE_RANGE * 0.75); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => t * t * (3 - 2 * t);

export class Director {
  constructor(app, device, sound, signal = null) {
    this.signal = signal;
    this.app = app; this.device = device; this.sound = sound;
    this.hand = device.hands.right;
    this.pos = new THREE.Vector3(0.12, 0.95, -0.15);
    this.twist = 0;
    this.pinchV = 0;
    this.pose = 'default';
    this.log = [];
  }
  // Wrist rotation: fingers point forward and down at the board, palm down, plus a twist about the fingers.
  wristQuat(fingersDown = 0.55, twist = this.twist) {
    const yaw = this.app.anchor.rotation.y;
    const fingers = new THREE.Vector3(0, -fingersDown, -1).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const z = fingers.clone().negate();
    const back = new THREE.Vector3(0, 1, 0);
    const x = new THREE.Vector3().crossVectors(back, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    // Twist about the forearm (fingers) axis; positive = clockwise as seen by the player.
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(fingers, twist));
    return q;
  }
  apply() {
    const q = this.wristQuat(this.pose === 'point' ? 1.6 : 0.55);
    this.hand.setPin({
      anchor: this.pose === 'point' ? 'index-tip' : 'grasp',
      target: [this.pos.x, this.pos.y, this.pos.z],
      wristRotation: [q.x, q.y, q.z, q.w],
      graspPinch: 1,
    });
    this.hand.updatePinchValue(this.pinchV);
  }
  checkStopped() { if (this.signal?.aborted) throw new Error('Recording stopped by request.'); }
  async sampledFrame() {
    this.checkStopped();
    const serial = this.app.frameSerial || 0, started = performance.now();
    while ((this.app.frameSerial || 0) === serial) {
      this.checkStopped();
      if (performance.now() - started > 15000) throw new Error('No rendered game frame for 15 seconds; recording stopped.');
      await sleep(12);
    }
  }
  async tween(ms, fn) {
    const t0 = performance.now();
    for (;;) {
      this.checkStopped();
      const t = Math.min(1, (performance.now() - t0) / ms);
      fn(ease(t));
      this.apply();
      // Every endpoint must be sampled by the real frame loop, even at low FPS.
      await this.sampledFrame();
      if (t >= 1) break;
      await sleep(11);
    }
  }
  local(root, v) { return root.localToWorld(v.clone()); }
  async moveTo(world, ms = 700, lift = 0.04) {
    const from = this.pos.clone();
    await this.tween(ms, (e) => {
      this.pos.lerpVectors(from, world, e);
      this.pos.y += Math.sin(e * Math.PI) * lift;
    });
  }
  async setPinch(v, ms = 160) { const a = this.pinchV; await this.tween(ms, (e) => { this.pinchV = a + (v - a) * e; }); }
  async twistBy(rad, ms = 500) { const a = this.twist; await this.tween(ms, (e) => { this.twist = a + rad * e; }); }
  async point(on) { this.checkStopped(); this.pose = on ? 'point' : 'default'; this.hand.poseId = on ? 'point' : 'default'; this.apply(); await this.sampledFrame(); await sleep(150); }

  boardLocal(r, c, y = PIPE_Y) { return this.app.board.cellCenter(r, c).setY(y); }
  async press(id) {
    this.checkStopped();
    const inMenu = this.app.mode === 'menu';
    const list = inMenu ? this.app.menu.buttons : this.app.board.buttons;
    const root = inMenu ? this.app.menu.root : this.app.board.root;
    const b = list.find((x) => x.id === id);
    if (!b || !b.enabled) throw new Error('Button not available: ' + id);
    await this.point(true);
    const top = b.group.position.clone();
    await this.moveTo(this.local(root, top.clone().setY(top.y + 0.05)), 700, 0.02);
    await this.moveTo(this.local(root, top.clone().setY(top.y + 0.004)), 260, 0);
    await sleep(120);
    await this.moveTo(this.local(root, top.clone().setY(top.y + 0.06)), 300, 0);
    await this.point(false);
    await sleep(250);
  }
  // Pick the tray piece of `type`, turn it to `rot` with wrist twists, carry it to (r, c) and let go.
  async place(type, r, c, rot) {
    const st = this.app.st;
    const k = st.tray.findIndex((p) => p.type === type);
    if (k < 0) throw new Error('no ' + type + ' in tray');
    const piece = st.tray[k];
    const slot = this.app.board.traySlot(k, st.tray.length);
    const root = this.app.board.root;
    await this.moveTo(this.local(root, slot.clone().setY(slot.y + PIPE_Y + 0.03)), 650);
    await this.moveTo(this.local(root, slot.clone().setY(slot.y + PIPE_Y)), 220, 0);
    await this.setPinch(1);
    await sleep(120);
    await this.moveTo(this.local(root, slot.clone().setY(0.06)), 300, 0);
    const turns = (((rot - piece.rot) % 4) + 4) % 4;
    const step = (Math.PI / 3) + 0.08;
    for (let i = 0; i < (turns === 3 ? 1 : turns); i++) await this.twistBy(turns === 3 ? -step : step, 420);
    const to = this.boardLocal(r, c, 0.045);
    await this.moveTo(this.local(root, to), 800, 0.02);
    await this.moveTo(this.local(root, to.clone().setY(0.03)), 200, 0);
    await this.setPinch(0);
    await this.twistBy(-this.twist, 300); // relax the wrist
    await this.moveTo(this.local(root, to.clone().setY(0.09)), 300, 0);
  }
  // Pinch the valve at (r, c) and twist until its opening reaches `open`.
  async valve(r, c, open) {
    const st = this.app.st;
    const p = st.cells[r * st.cols + c];
    const root = this.app.board.root;
    const at = this.boardLocal(r, c, PIPE_Y + 0.027);
    await this.moveTo(this.local(root, at.clone().setY(at.y + 0.03)), 600);
    await this.moveTo(this.local(root, at), 200, 0);
    await this.setPinch(1);
    const deadline = performance.now() + 15000;
    try {
      for (let n = 0; Math.abs(p.open - open) > 0.02; n++) {
        if (n >= 24 || performance.now() > deadline) throw new Error('Valve did not reach its target within the bounded adjustment window.');
        // Gain below one prevents oscillation when a whole twist arrives in one frame.
        await this.twistBy(valveCorrection(p.open - open), 90);
      }
    } finally {
      // Always release, including timeout/cancel; never leave a synthetic grab stuck.
      this.pinchV = 0; this.hand.updatePinchValue(0);
    }
    await this.setPinch(0);
    await this.twistBy(-this.twist, 300);
    await this.moveTo(this.local(root, at.clone().setY(0.1)), 300, 0);
  }
  async solveCurrent(maxPieces = 99) {
    const def = this.app.def;
    let n = 0;
    for (const s of def.solution) {
      if (n++ >= maxPieces) break;
      await this.place(s.type, s.r, s.c, s.rot);
      if (s.type === 'valve') await this.valve(s.r, s.c, s.open);
    }
    for (const f of def.fixed) if (f.type === 'valve' && f.solveOpen != null) await this.valve(f.r, f.c, f.solveOpen);
    if (maxPieces === 99) {
      const deadline = performance.now() + 15000;
      while (!this.app.solved) {
        if (performance.now() > deadline) throw new Error('Puzzle did not confirm solved within 15 seconds.');
        await this.sampledFrame();
      }
    }
  }

  // The demo: menu → three lessons → a harder level (with a deliberate leak first) → the Daily Flow.
  async run({ lessonsOnly = false, signatureOnly = false } = {}) {
    const app = this.app;
    this.device.hands.left.connected = false;
    this.apply();
    await sleep(2500);
    if (signatureOnly) {
      if (app.mode !== 'menu') await this.press('levels');
      await this.press('level:4');
      await sleep(1800);
      await this.solveCurrent();
      await this.moveTo(this.local(app.board.root, new THREE.Vector3(.27,.08,.20)),700);
      await sleep(3500);
      this.log.push('night shift complete'); return true;
    }
    if (app.mode === 'menu') await this.press('level:0');
    if (app.mode !== 'play' || app.def.id !== 'l1') throw new Error('The real menu press was not received.');
    await sleep(2200);
    await this.solveCurrent();
    await sleep(3500);
    await this.press('next');
    await sleep(2500);
    await this.solveCurrent();
    await sleep(3000);
    await this.press('next');
    await sleep(2500);
    await this.solveCurrent();
    await sleep(1800);
    if (lessonsOnly) { this.log.push('three lessons complete'); return true; }
    await this.press('levels');
    await sleep(1200);
    await this.press('level:6');
    await sleep(2500);
    // Show a mistake: a straight dropped where it doesn't belong leaks, then it goes back to the tray.
    const def = app.def;
    const empty = this.findEmptyCell();
    const decoy = app.st.tray.find((p) => !def.solution.some((s) => s.type === p.type && false)) || app.st.tray[0];
    if (empty) {
      await this.place(decoy.type, empty.r, empty.c, decoy.rot);
      await sleep(2200);
      const root = app.board.root;
      await this.moveTo(this.local(root, this.boardLocal(empty.r, empty.c, PIPE_Y + 0.005)), 500);
      await this.setPinch(1);
      await this.moveTo(this.local(root, this.app.board.traySlot(0, app.st.tray.length + 1).setY(0.05)), 700);
      await this.setPinch(0);
      await sleep(600);
    }
    await this.solveCurrent();
    await sleep(4000);
    await this.press('levels');
    await sleep(1500);
    await this.press('daily');
    await sleep(2500);
    await this.solveCurrent(3);
    await sleep(2500);
    this.log.push('done');
    return true;
  }
  findEmptyCell() {
    const st = this.app.st, def = this.app.def;
    const used = new Set(def.solution.map((s) => s.r * st.cols + s.c));
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
      const i = r * st.cols + c;
      if (st.cells[i] === null && !used.has(i)) {
        // Prefer a cell touching the wet network so the leak is visible.
        const nb = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].some(([rr, cc]) => rr >= 0 && cc >= 0 && rr < st.rows && cc < st.cols && st.result.sol.wet[rr * st.cols + cc]);
        if (nb) return { r, c };
      }
    }
    return null;
  }
}

// Records the canvas (and the game's own audio) to a WebM file the browser downloads.
export async function record(canvas, sound, run, fileName = 'flowsmith-demo.webm', options = {}) {
  // Burn provenance into the file itself; DOM labels are not in canvas recordings.
  const output = document.createElement('canvas');
  output.width = canvas.width; output.height = canvas.height;
  const ctx = output.getContext('2d');

  const paint = () => {
    ctx.drawImage(canvas, 0, 0);
    const size = Math.max(14, Math.round(output.width / 90));
    ctx.font = `bold ${size}px sans-serif`;
    const label = 'FLOWSMITH | SCRIPTED EMULATOR | NOT QUEST HARDWARE';
    ctx.fillStyle = 'rgba(10,25,22,0.9)';
    ctx.fillRect(12, 12, ctx.measureText(label).width + 24, size + 22);
    ctx.fillStyle = '#f4dbac'; ctx.fillText(label, 24, size + 23);

  };
  canvas.__captureFrame = paint;
  paint();
  const stream = output.captureStream(30);
  let dest;
  if (sound.ctx) {
    dest = sound.ctx.createMediaStreamDestination();
    sound.master.connect(dest);
    for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
  }
  const mime = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp9,opus', 'video/webm'].find((m) => MediaRecorder.isTypeSupported(m));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const done = new Promise((r) => (rec.onstop = r));
  rec.start(1000);
  let timer, onAbort;
  const interrupted = new Promise(resolve => {
    onAbort = () => resolve({ complete: false, error: 'Stopped by request' });
    options.signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => { resolve({ complete: false, error: 'Automatic capture time limit reached' }); options.cancel?.(); }, options.maxDurationMs ?? 180000);
    if (options.signal?.aborted) onAbort();
  });
  const completed = Promise.resolve().then(run).then(() => ({complete:true}), error => ({complete:false,error:error.message}));
  const result = await Promise.race([completed, interrupted]);
  clearTimeout(timer); options.signal?.removeEventListener('abort', onAbort);
  if (!result.complete) options.cancel?.();
  if (rec.state !== 'inactive') rec.stop();
  await done;
  delete canvas.__captureFrame;
  stream.getTracks().forEach(track => track.stop());
  if (dest) sound.master.disconnect(dest);
  const blob = new Blob(chunks, { type: 'video/webm' });
  return { ...result, bytes: blob.size, url: URL.createObjectURL(blob), fileName: result.complete ? fileName : fileName.replace('.webm','-partial.webm') };
}
