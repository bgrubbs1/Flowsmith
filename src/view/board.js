import { VALVE_RANGE } from '../game/interaction.js';
// The diorama: plinth, tiles, pieces, tray, gauges, buttons, hint panel and water.
import * as THREE from 'three';
import { T, PIPE_Y, COLORS, mat } from './materials.js';
import { buildPiece } from './pieceGeometry.js';
import { WaterView } from './water.js';
import { CanvasPanel, PushButton, roundRect, wrapText, font } from './ui.js';
import { addBoardJoinery } from './joinery.js';
import { DIRS } from '../sim/pieces.js';

const TRAY_SPACING = 0.056;
const TRAY_ROW = 0.058;
const GAUGE_A0 = (210 * Math.PI) / 180;
const GAUGE_SWEEP = (240 * Math.PI) / 180;

const GHOST_MAT = new THREE.MeshBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
let haloTex = null;
function haloTexture() {
  if (haloTex) return haloTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.25, 'rgba(255,200,110,0.6)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  haloTex = new THREE.CanvasTexture(c);
  return haloTex;
}

export class BoardView {
  constructor(scene) {
    this.root = new THREE.Group();
    this.root.name = 'board';
    scene.add(this.root);
    this.content = new THREE.Group();
    this.root.add(this.content);
    this.objects = new Map(); // piece id -> { group, parts, piece }
    this.gauges = new Map(); // cell index -> gauge
    this.buttons = [];
    this.knobs = [];
    this.hud = new CanvasPanel(0.28, 0.060, 1200);
    this.hud.mesh.renderOrder = 3;
    this.root.add(this.hud.mesh);
    this.water = new WaterView(this.root);
    this.highlight = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0016, 6, 32), new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.9 }));
    this.highlight.rotation.x = Math.PI / 2;
    this.highlight.visible = false;
    this.root.add(this.highlight);
    this.dropMarker = new THREE.Mesh(new THREE.BoxGeometry(T * 0.92, 0.002, T * 0.92), new THREE.MeshBasicMaterial({ color: 0xfff2a8, transparent: true, opacity: 0.35, depthWrite: false }));
    this.dropMarker.visible = false;
    this.root.add(this.dropMarker);
    this.leakMarkers = [];
    // Placement 'pop' rings: a brass ripple where a pipe lands (pooled, four at a time).
    this.rings = [];
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 32), new THREE.MeshBasicMaterial({ color: 0xffd58a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      ring.rotation.x = -Math.PI / 2; ring.visible = false; ring.userData.t = 1;
      this.root.add(ring); this.rings.push(ring);
    }
    this.ghost = null;
    this.time = 0;
    this.v = new THREE.Vector3();
  }

  get W() { return this.st.cols * T; }
  get D() { return this.st.rows * T; }

  cellCenter = (r, c, out = new THREE.Vector3()) => out.set((c - (this.st.cols - 1) / 2) * T, 0, (r - (this.st.rows - 1) / 2) * T);

  cellFromLocal(p) {
    const c = Math.round(p.x / T + (this.st.cols - 1) / 2);
    const r = Math.round(p.z / T + (this.st.rows - 1) / 2);
    const inside = r >= 0 && c >= 0 && r < this.st.rows && c < this.st.cols;
    const cc = this.cellCenter(r, c);
    return { r, c, inside, dist: Math.hypot(p.x - cc.x, p.z - cc.z) };
  }

  // Tray: up to 6 pieces per row, two rows, bowed toward the player so every slot stays within reach.
  trayRows(n) { return n > 6 ? 2 : 1; }
  traySlot(i, n, out = new THREE.Vector3()) {
    const rows = this.trayRows(n);
    const per = Math.ceil(n / rows);
    const row = Math.floor(i / per), j = i % per;
    const cnt = row === rows - 1 ? n - per * (rows - 1) : per;
    const x = (j - (cnt - 1) / 2) * TRAY_SPACING;
    return out.set(x, 0.004, this.D / 2 + 0.052 + row * TRAY_ROW - x * x * 0.9);
  }

  build(st, buttonDefs) {
    this.st = st;
    this.content.clear();
    this.objects.clear();
    this.gauges.clear();
    this.buttons = [];
    this.knobs = [];
    const W = this.W, D = this.D;
    const nT = Math.max(1, st.tray.length);
    const rowsT = this.trayRows(nT);
    const trayW = Math.max(W * 0.8, (Math.ceil(nT / rowsT) + 0.6) * TRAY_SPACING);
    // Plinth and tray shelf.
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(W + 0.03, 0.022, D + 0.03), mat('wood'));
    plinth.position.y = -0.011;
    this.content.add(plinth);
    const lip = new THREE.Mesh(new THREE.BoxGeometry(W + 0.034, 0.004, D + 0.034), mat('woodDark'));
    lip.position.y = -0.02;
    this.content.add(lip);
    const trayD = 0.062 + (rowsT - 1) * TRAY_ROW;
    const tray = new THREE.Mesh(new THREE.BoxGeometry(trayW, 0.014, trayD), mat('woodDark'));
    tray.position.set(0, -0.008, D / 2 + 0.05 + trayD / 2 - 0.031);
    this.content.add(tray);
    // Green felt in the tray so copper and glass stand out against it.
    const felt = new THREE.Mesh(new THREE.BoxGeometry(trayW - 0.012, 0.002, trayD - 0.012), mat('felt'));
    felt.position.set(tray.position.x, tray.position.y + 0.0075, tray.position.z);
    this.content.add(felt);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(W, trayW) + 0.2, D + 0.3), mat('shadow'));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -0.0225, 0.04);
    this.content.add(shadow);
    // Tiles.
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 0.95, 0.003, T * 0.95), mat('slate'), st.rows * st.cols);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
      const i = r * st.cols + c;
      const p = this.cellCenter(r, c);
      // Each slab turned a quarter at random and tinted slightly, so the floor reads as laid stone, not a grid.
      const h = Math.sin((r * 12.9898 + c * 78.233) * 43.17) * 0.5 + 0.5;
      m4.makeRotationY(Math.floor(h * 4) * Math.PI / 2).setPosition(p.x, 0.0015, p.z);
      tiles.setMatrixAt(i, m4);
      tiles.setColorAt(i, col.setRGB(0.78 + 0.16 * h, 0.82 + 0.12 * h, 0.86 + 0.1 * (1 - h)).multiplyScalar((r + c) % 2 ? 1 : 0.88));
    }
    this.tiles = tiles; this.tileBase = Array.from({ length: st.rows * st.cols }, (_, i) => { const k = new THREE.Color(); tiles.getColorAt(i, k); return k; });
    const si = st.cells.findIndex((q) => q?.type === 'source'); this.waveFrom = si < 0 ? [0, 0] : [Math.floor(si / st.cols), si % st.cols]; this.tileCols = st.cols;
    this.waveT = -1;
    this.content.add(tiles);
    addBoardJoinery(this.content, W, D, st.rows, st.cols);
    // Pieces.
    for (let i = 0; i < st.cells.length; i++) {
      const p = st.cells[i];
      if (p) this.ensure(p, i);
    }
    for (const p of st.tray) this.ensure(p, -1);
    // Gauges for mills.
    for (let i = 0; i < st.cells.length; i++) if (st.cells[i]?.type === 'mill') this.gauges.set(i, this.makeGauge(i));
    // Lanterns on the plinth corners and edges: dark while you work, lit when the valley flows.
    this.lamps = [];
    const lampMat = mat('lamp').clone();
    this.lampMat = lampMat;
    const lx = W / 2 + 0.008, lz = D / 2 + 0.008;
    for (const [x, z] of [[-lx, -lz], [lx, -lz], [-lx, lz], [lx, lz], [0, -lz], [-lx, 0], [lx, 0]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.002, 0.05, 6), mat('iron'));
      post.position.set(x, 0.025, z);
      const cap = new THREE.Mesh(new THREE.ConeGeometry(0.0065, 0.006, 6), mat('iron'));
      cap.position.set(x, 0.058, z);
      const bulb = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.010, 6), lampMat);
      bulb.position.set(x, 0.051, z);
      const halo = new THREE.Sprite(this.haloMat || (this.haloMat = new THREE.SpriteMaterial({ map: haloTexture(), color: 0xffc35a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })));
      halo.scale.setScalar(0.05); halo.position.copy(bulb.position);
      this.content.add(post, cap, bulb, halo);
    }
    this.lampLight = new THREE.PointLight(0xffc977, 0, 0, 2);
    this.lampLight.position.set(0, 0.25, 0);
    this.content.add(this.lampLight);
    this.lit = 0; this.litTarget = 0;
    // Move knobs at the tray ends.
    for (const sx of [-1, 1]) {
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.012, 16), mat('brass'));
      knob.position.set(sx * (trayW / 2 + 0.016), 0.004, D / 2 + 0.05);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.006, 0.02, 10), mat('woodDark'));
      post.position.set(knob.position.x, -0.01, knob.position.z);
      this.content.add(post, knob);
      this.knobs.push(knob);
    }
    // Buttons in a column to the right of the board.
    buttonDefs.forEach((bd, k) => {
      const b = new PushButton({ tag: 'side', ...bd });
      b.group.position.set(W / 2 + 0.05, -0.006, -D / 2 + 0.028 + k * 0.05);
      this.content.add(b.group);
      this.buttons.push(b);
    });
    // HUD behind the board, tilted toward the player.
    // Bring the placard in front of the gantry in the seated emulator view.
    this.hud.mesh.position.set(0, 0.18, -D / 2 - 0.008);
    this.hud.mesh.rotation.set(-0.25, 0, 0);
    this.hud.last = '';
    // Two slim hanging straps tie the enamel sign back to the gantry.
    // Instanced as one draw, decorative only: no interaction targets.
    const straps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0011, 0.0011, 1, 6), mat('brass'), 2);
    const strapMatrix = new THREE.Matrix4();
    for (const [i, x] of [-0.125, 0.125].entries()) {
      const start = new THREE.Vector3(x, 0.209, -D / 2 - 0.015);
      const end = new THREE.Vector3(x, 0.195, -0.29);
      const direction = end.clone().sub(start);
      strapMatrix.compose(start.clone().add(end).multiplyScalar(0.5),
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.clone().normalize()),
        new THREE.Vector3(1, direction.length(), 1));
      straps.setMatrixAt(i, strapMatrix);
    }
    this.content.add(straps);
    // Ghost hint.
    this.ghost = null;
    this.sync();
  }

  ensure(piece, cellIndex) {
    let o = this.objects.get(piece.id);
    if (!o) {
      const built = buildPiece(piece.type, { locked: piece.fixed && piece.type !== 'valve', seed: piece.id });
      o = { ...built, piece, held: false, lift: 0 };
      this.objects.set(piece.id, o);
      this.content.add(o.group);
    }
    return o;
  }

  sync() {
    const st = this.st;
    for (let i = 0; i < st.cells.length; i++) {
      const p = st.cells[i];
      if (!p) continue;
      const o = this.ensure(p, i);
      if (o.held) continue;
      const c = this.cellCenter(Math.floor(i / st.cols), i % st.cols);
      const landed = o.inTray !== false || !o.target || !o.target.equals(c);
      const turned = o.targetRot !== undefined && o.targetRot !== -p.rot * Math.PI / 2;
      o.target = c.clone();
      o.targetRot = -p.rot * Math.PI / 2;
      if (o.inTray === true || (landed && o.wasHeld)) { o.popT = 0; o.popAmp = 1; this.ripple(c); }
      else if (turned) { o.popT = 0; o.popAmp = 0.45; }
      o.wasHeld = false;
      o.inTray = false;
    }
    st.tray.forEach((p, k) => {
      const o = this.ensure(p, -1);
      if (o.held) return;
      o.target = this.traySlot(k, st.tray.length);
      o.targetRot = -p.rot * Math.PI / 2;
      o.inTray = true;
    });
  }

  ripple(at) {
    const ring = this.rings.find((r) => r.userData.t >= 1) || this.rings[0];
    ring.position.set(at.x, 0.0045, at.z); ring.userData.t = 0; ring.visible = true;
  }

  makeGauge(i) {
    const st = this.st;
    const g = new THREE.Group();
    const c = this.cellCenter(Math.floor(i / st.cols), i % st.cols);
    const meter = this.gauges.size;
    // Alternate small lateral offsets so meters in adjacent rows do not cover each other.
    g.position.set(c.x + (meter % 2 ? 0.025 : -0.009), 0.092, c.z + 0.008);
    g.scale.setScalar(0.76);
    const back = new THREE.Mesh(new THREE.CircleGeometry(0.019, 28), new THREE.MeshBasicMaterial({ color: 0xfff8ec }));
    g.add(back);
    const rim = new THREE.Mesh(new THREE.RingGeometry(0.019, 0.021, 28), new THREE.MeshBasicMaterial({ color: COLORS.copper }));
    g.add(rim);
    const arc = (f0, f1, color) => {
      const a0 = GAUGE_A0 - f1 * GAUGE_SWEEP;
      const m = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.0165, 16, 1, a0, (f1 - f0) * GAUGE_SWEEP), new THREE.MeshBasicMaterial({ color }));
      m.position.z = 0.0004;
      g.add(m);
    };
    arc(0, 0.4, COLORS.low); arc(0.4, 0.6, COLORS.ok); arc(0.6, 1, COLORS.high);
    // Centre tick: the needle on this line earns the precision star.
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(0.0011, 0.007), new THREE.MeshBasicMaterial({ color: 0x14532d }));
    const ta = GAUGE_A0 - 0.5 * GAUGE_SWEEP;
    tick.position.set(Math.cos(ta) * 0.0145, Math.sin(ta) * 0.0145, 0.0006);
    tick.rotation.z = ta - Math.PI / 2;
    g.add(tick);
    const needle = new THREE.Mesh(new THREE.BoxGeometry(0.0155, 0.003, 0.001), new THREE.MeshBasicMaterial({ color: 0x222222 }));
    needle.geometry.translate(0.0075, 0, 0);
    needle.position.z = 0.0009;
    g.add(needle);
    // Status pill hangs just under the dial rim, so it moves with the gauge and never floats into lamps.
    const label = new CanvasPanel(0.052, 0.012, 640);
    label.mesh.position.set(0, -0.0285, 0.0012);
    label.material.depthTest = false; label.mesh.renderOrder = 4; // always readable, even past the mill wheel
    g.add(label.mesh);
    // A short post: the gauge rides above the mill on it rather than spearing the hut roof.
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.022, 6), mat('copper'));
    stem.position.set(0, -0.040, -0.003);
    g.add(stem);
    this.content.add(g);
    return { group: g, needle, label, frac: 0 };
  }

  setHud(key, data) {
    this.hud.draw(key, (g, w, h) => {
      // An engraved enamel instrument placard, not a large floating chat bubble.
      g.fillStyle = '#142d38';
      roundRect(g, 4, 4, w - 8, h - 8, 9); g.fill();
      g.strokeStyle = '#bc9b66'; g.lineWidth = 3; g.stroke();
      g.strokeStyle = '#53605b'; g.lineWidth = 1;
      roundRect(g, 15, 15, w - 30, h - 30, 3); g.stroke();
      for (const x of [27, w - 27]) {
        g.fillStyle = '#bda77c'; g.beginPath(); g.arc(x, 28, 4, 0, Math.PI * 2); g.fill();
      }
      g.textBaseline = 'top'; g.textAlign = 'left';
      g.fillStyle = '#ecdfc2';
      const rightW = data.right ? 350 : 0;
      let titlePx = 58;
      g.font = `500 ${titlePx}px Georgia, serif`;
      while (g.measureText(data.title).width > w - 92 - rightW && titlePx > 28) {
        titlePx -= 2; g.font = `500 ${titlePx}px Georgia, serif`;
      }
      g.fillText(data.title, 42, 30);
      if (data.right) {
        g.textAlign = 'right'; g.font = font(40, 600);
        g.fillStyle = data.rightColor || '#d9b77c';
        g.fillText(data.right, w - 42, 39); g.textAlign = 'left';
      }
      g.strokeStyle = '#61706c'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(42, 90); g.lineTo(w - 42, 90); g.stroke();
      // Preserve guidance, but remove verbose repetition in the common leak state.
      const body = (data.body || '').replace('A pipe end is leaking (pulsing warning rings). Water must only reach the sea.',
        'Seal the flashing leak. Route water to the sea.').replace(' pipe ends are leaking (pulsing warning rings). Water must only reach the sea.',
        ' leaks: seal the flashing ends. Route water to the sea.');
      let bodyPx = 42;
      const lineCount = () => {
        let lines = 1, line = '';
        for (const word of body.split(' ')) {
          const next = line ? line + ' ' + word : word;
          if (line && g.measureText(next).width > w - 84) { lines++; line = word; } else line = next;
        }
        return lines;
      };
      g.font = font(bodyPx, 500);
      while (lineCount() > 2 && bodyPx > 28) { bodyPx -= 2; g.font = font(bodyPx, 500); }
      g.fillStyle = '#e4eee8';
      wrapText(g, body, 42, 108, w - 84, bodyPx + 5);
      if (data.footer) {
        const footer = data.footer === 'Pinch to pick up · twist to turn · quick pinch to rotate'
          ? 'Pinch: pick up · twist / quick pinch: rotate' : data.footer;
        let footerPx = 32; g.font = font(footerPx, 500);
        while (g.measureText(footer).width > w - 84 && footerPx > 18) {
          footerPx--; g.font = font(footerPx, 500);
        }
        g.fillStyle = '#aebdb7'; g.fillText(footer, 42, h - 43);
      }
    });
  }

  setGhost(type, fromLocal, toLocal, mode) {
    if (this.ghost) { this.content.remove(this.ghost.group); this.ghost = null; }
    // While a lesson ghost shows where a piece goes, the leak there only dribbles, so it never hides the ghost.
    this.water.quietAt = type && mode !== 'valve' ? toLocal.clone() : null;
    if (!type) return;
    const b = buildPiece(type, {});
    b.group.traverse((m) => {
      if (m.isMesh) m.material = GHOST_MAT;
    });
    this.content.add(b.group);
    this.ghost = { group: b.group, parts: b.parts, from: fromLocal.clone(), to: toLocal.clone(), mode, t: 0 };
  }

  update(dt, camera, held) {
    this.time += dt;
    const st = this.st;
    if (!st) return;
    if (st.lit && !this.litTarget) this.waveT = 0; // the valley just lit: send a wave of light across the stones
    this.litTarget = st.lit ? 1 : 0;
    const res = st.result;
    // Ease pieces toward their homes; held pieces are positioned by the interaction.
    for (const o of this.objects.values()) {
      if (o.held) o.wasHeld = true;
      if (o.held || !o.target) continue;
      const k = 1 - Math.exp(-dt * 18);
      o.group.position.lerp(o.target, k);
      let dr = o.targetRot - o.group.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      o.group.rotation.y += dr * k;
      // Once the valley is lit, leftover tray pieces tuck away so the finished valley has the stage.
      const sc = o.inTray ? (this.litTarget ? 0.001 : 0.85) : 1;
      o.group.scale.setScalar(o.group.scale.x + (sc - o.group.scale.x) * k);
      // Squash and stretch on landing or turning: a short, damped bounce (0.4 s) sells the weight of the copper.
      if (o.popT !== undefined && o.popT < 0.4) {
        o.popT += dt;
        const u = Math.min(1, o.popT / 0.4), w = Math.sin(u * Math.PI * 2.5) * (1 - u) * 0.16 * o.popAmp;
        const s0 = o.group.scale.x;
        o.group.scale.set(s0 * (1 + w * 0.6), s0 * (1 - w), s0 * (1 + w * 0.6));
      }
      if (o.parts.wheel && o.piece.type === 'valve') o.parts.wheel.rotation.y = -(1 - o.piece.open) * VALVE_RANGE;
    }
    // Mills, windows, gauges.
    for (const m of res.mills) {
      const p = st.cells[m.i];
      const o = this.objects.get(p.id);
      if (!o) continue;
      o.parts.millWheel.rotation.x -= dt * Math.min(30, m.flow * 6);
      // Keep the hut behind the wheel as seen from the seat, whichever way the mill is turned.
      const flip = (((p.rot % 4) + 4) % 4) === 1 ? -1 : 1;
      if (o.parts.hut) { o.parts.hut.position.x = 0.016 * flip; o.parts.hut.rotation.y = flip < 0 ? Math.PI : 0; }
      o.parts.millWheel.position.x = -0.012 * flip;
      const target = m.status === 'ok' ? 1.8 : m.status === 'low' ? 0.5 * Math.min(1, m.flow / m.lo) : (Math.sin(this.time * 40) > 0 ? 2.2 : 0.2);
      o.parts.windows.emissiveIntensity += (target - o.parts.windows.emissiveIntensity) * Math.min(1, dt * 6);
      const gauge = this.gauges.get(m.i);
      if (gauge) {
        gauge.frac += (m.frac - gauge.frac) * Math.min(1, dt * 8);
        gauge.needle.rotation.z = GAUGE_A0 - gauge.frac * GAUGE_SWEEP + (m.status === 'high' ? Math.sin(this.time * 50) * 0.04 : 0);
        const dry = m.flow < 0.02;
        const txt = dry ? '○ DRY' : m.status === 'ok' ? '✓ BALANCED' : m.status === 'low' ? '↓ LOW FLOW' : '↑ HIGH FLOW';
        const color = dry ? '#b9c5cc' : m.status === 'ok' ? '#8ce8ba' : m.status === 'low' ? '#abd7ff' : '#ffb078';
        gauge.label.draw(txt, (g, w, h) => {
          g.fillStyle = '#132c37'; roundRect(g, 3, 3, w - 6, h - 6, 10); g.fill();
          g.strokeStyle = '#987c50'; g.lineWidth = 2; g.stroke();
          let px = 92; g.font = font(px, 800);
          while (g.measureText(txt).width > w - 40 && px > 40) { px -= 4; g.font = font(px, 800); }
          g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
          g.fillText(txt, w / 2, h / 2 + 4);
        });
        if (camera) {
          camera.getWorldPosition(this.v);
          this.root.worldToLocal(this.v);
          gauge.group.rotation.y = Math.atan2(this.v.x - gauge.group.position.x, this.v.z - gauge.group.position.z);
        }
      }
      if (m.status === 'high') o.group.position.x += Math.sin(this.time * 70) * 0.0004;
    }
    // Source pool shimmer and sea bob.
    for (const o of this.objects.values()) {
      if (o.parts.pool) o.parts.pool.scale.setScalar(1 + Math.sin(this.time * 3) * 0.04);
      if (o.parts.sea) o.parts.sea.position.y = 0.004 + Math.sin(this.time * 2 + o.piece.id) * 0.0008;
    }
    // Leak markers.
    let li = 0;
    for (const L of res.leaks) {
      let mk = this.leakMarkers[li];
      if (!mk) {
        mk = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.018, 28), new THREE.MeshBasicMaterial({ color: COLORS.leak, transparent: true, side: THREE.DoubleSide }));
        const warningMat = new THREE.MeshBasicMaterial({color:0xfff3cf,side:THREE.DoubleSide});
        const stem = new THREE.Mesh(new THREE.PlaneGeometry(.0025,.010),warningMat); stem.position.set(0,.003,.0005);
        const dot = new THREE.Mesh(new THREE.CircleGeometry(.0016,8),warningMat); dot.position.set(0,-.005,.0005);
        mk.add(stem,dot);
        this.root.add(mk); this.leakMarkers.push(mk);
      }
      const r = Math.floor(L.i / st.cols), c = L.i % st.cols;
      const d = DIRS.find((x) => x.bit === L.dir);
      const cc = this.cellCenter(r, c);
      mk.position.set(cc.x + (d.dc * T) / 2, PIPE_Y, cc.z + (d.dr * T) / 2);
      if (camera) { camera.getWorldPosition(this.v); mk.lookAt(this.v); }
      else mk.lookAt(this.root.localToWorld(new THREE.Vector3(cc.x + d.dc * T, PIPE_Y, cc.z + d.dr * T)));
      const pulse = 1 + 0.35 * Math.sin(this.time * 9);
      mk.scale.setScalar(pulse);
      mk.material.opacity = 0.6 + 0.4 * Math.sin(this.time * 9);
      mk.visible = true;
      li++;
    }
    for (; li < this.leakMarkers.length; li++) this.leakMarkers[li].visible = false;
    // Ghost hint animation.
    if (this.ghost) {
      const gh = this.ghost;
      gh.t = (gh.t + dt / 2.6) % 1;
      const s = Math.min(1, Math.max(0, (gh.t - 0.15) / 0.6));
      const e = s * s * (3 - 2 * s);
      gh.group.position.lerpVectors(gh.from, gh.to, e);
      gh.group.position.y += Math.sin(e * Math.PI) * 0.05;
      if (gh.mode === 'rotate') gh.group.rotation.y = (gh.baseRot || 0) - Math.PI * e;
      if (gh.mode === 'valve' && gh.parts.wheel) gh.parts.wheel.rotation.y = -VALVE_RANGE * 0.6 * e;
      gh.group.visible = gh.t < 0.9;
    }
    for (const ring of this.rings) {
      if (ring.userData.t >= 1) { ring.visible = false; continue; }
      ring.userData.t = Math.min(1, ring.userData.t + dt / 0.55);
      const e = 1 - (1 - ring.userData.t) ** 3;
      ring.scale.setScalar(0.012 + e * 0.03);
      ring.material.opacity = (1 - ring.userData.t) * 0.85;
    }
    if (this.waveT >= 0 && this.tiles) {
      // Win wave: a warm band of light rolls out across the slabs from the spring (Tetris Effect style).
      this.waveT += dt;
      const cols = this.tileCols, n = this.tileBase.length, rows = n / cols, front = this.waveT * 4, col = this.v2 || (this.v2 = new THREE.Color());
      for (let i = 0; i < n; i++) {
        const d = Math.hypot(Math.floor(i / cols) - this.waveFrom[0], (i % cols) - this.waveFrom[1]);
        const k = Math.exp(-((front - d) ** 2) * 0.45);
        col.copy(this.tileBase[i]).multiplyScalar(1 + 2.2 * k);
        col.r += 1.4 * k; col.g += 0.95 * k; col.b += 0.3 * k;
        this.tiles.setColorAt(i, col);
      }
      if (front > Math.hypot(rows, cols) + 3) { for (let i = 0; i < n; i++) this.tiles.setColorAt(i, this.tileBase[i]); this.waveT = -1; }
      this.tiles.instanceColor.needsUpdate = true;
    }
    for (const b of this.buttons) b.update(dt);
    if (this.lampMat) {
      this.lit += (this.litTarget - this.lit) * Math.min(1, dt * 2.5);
      this.lampMat.emissiveIntensity = 0.05 + this.lit * (2.4 + 0.15 * Math.sin(this.time * 7));
      this.lampLight.intensity = this.lit * 0.035;
      if (this.haloMat) this.haloMat.opacity = this.lit * (0.85 + 0.1 * Math.sin(this.time * 7));
    }
    this.water.update(dt, st, (r, c) => this.cellCenter(r, c));
  }
}
