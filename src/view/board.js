import { VALVE_RANGE } from '../game/interaction.js';
// The diorama: plinth, tiles, pieces, tray, gauges, buttons, hint panel and water.
import * as THREE from 'three';
import { T, PIPE_Y, COLORS, mat } from './materials.js';
import { buildPiece } from './pieceGeometry.js';
import { WaterView } from './water.js';
import { CanvasPanel, PushButton, roundRect, wrapText, font } from './ui.js';
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
    this.hud = new CanvasPanel(0.34, 0.078, 1200);
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
    const felt = new THREE.Mesh(new THREE.BoxGeometry(trayW - 0.012, 0.002, trayD - 0.012), new THREE.MeshStandardMaterial({ color: 0x1f3a34, roughness: 1 }));
    felt.position.set(tray.position.x, tray.position.y + 0.0075, tray.position.z);
    this.content.add(felt);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(W, trayW) + 0.2, D + 0.3), mat('shadow'));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.set(0, -0.0225, 0.04);
    this.content.add(shadow);
    // Tiles.
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(T * 0.95, 0.003, T * 0.95), new THREE.MeshStandardMaterial({ roughness: 0.95 }), st.rows * st.cols);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let r = 0; r < st.rows; r++) for (let c = 0; c < st.cols; c++) {
      const i = r * st.cols + c;
      const p = this.cellCenter(r, c);
      m4.makeTranslation(p.x, 0.0015, p.z);
      tiles.setMatrixAt(i, m4);
      tiles.setColorAt(i, col.setHex((r + c) % 2 ? COLORS.grassA : COLORS.grassB));
    }
    this.content.add(tiles);
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
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 12, 8), lampMat);
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
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), mat('brass'));
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
    this.hud.mesh.position.set(0, 0.125, -D / 2 - 0.07);
    this.hud.mesh.rotation.set(-0.25, 0, 0);
    this.hud.last = '';
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
      o.target = c.clone();
      o.targetRot = -p.rot * Math.PI / 2;
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

  makeGauge(i) {
    const st = this.st;
    const g = new THREE.Group();
    const c = this.cellCenter(Math.floor(i / st.cols), i % st.cols);
    g.position.set(c.x + 0.012, 0.095, c.z);
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
    const label = new CanvasPanel(0.072, 0.016, 640);
    label.mesh.position.set(0, 0.027, 0.0005);
    g.add(label.mesh);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 0.045, 6), mat('copper'));
    stem.position.set(0, -0.041, -0.003);
    g.add(stem);
    this.content.add(g);
    return { group: g, needle, label, frac: 0 };
  }

  setHud(key, data) {
    this.hud.draw(key, (g, w, h) => {
      g.fillStyle = 'rgba(245,234,214,0.96)';
      roundRect(g, 6, 6, w - 12, h - 12, 36); g.fill();
      g.strokeStyle = '#b06a3b'; g.lineWidth = 8; g.stroke();
      g.fillStyle = '#2b2118'; g.textBaseline = 'top'; g.textAlign = 'left';
      g.font = font(54, 800);
      g.fillText(data.title, 40, 30);
      if (data.right) { g.textAlign = 'right'; g.font = font(48, 700); g.fillStyle = data.rightColor || '#b06a3b'; g.fillText(data.right, w - 40, 34); g.textAlign = 'left'; }
      g.fillStyle = '#2a2420'; g.font = font(40, 600);
      wrapText(g, data.body || '', 40, 104, w - 80, 48);
      if (data.footer) { g.font = font(36, 700); g.fillStyle = '#5a4532'; g.fillText(data.footer, 40, h - 50); }
    });
  }

  setGhost(type, fromLocal, toLocal, mode) {
    if (this.ghost) { this.content.remove(this.ghost.group); this.ghost = null; }
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
    this.litTarget = st.lit ? 1 : 0;
    const res = st.result;
    // Ease pieces toward their homes; held pieces are positioned by the interaction.
    for (const o of this.objects.values()) {
      if (o.held || !o.target) continue;
      const k = 1 - Math.exp(-dt * 18);
      o.group.position.lerp(o.target, k);
      let dr = o.targetRot - o.group.rotation.y;
      dr = Math.atan2(Math.sin(dr), Math.cos(dr));
      o.group.rotation.y += dr * k;
      // Once the valley is lit, leftover tray pieces tuck away so the finished valley has the stage.
      const sc = o.inTray ? (this.litTarget ? 0.001 : 0.85) : 1;
      o.group.scale.setScalar(o.group.scale.x + (sc - o.group.scale.x) * k);
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
        const txt = dry ? '○ DRY' : m.status === 'ok' ? '✓ JUST RIGHT' : m.status === 'low' ? '▼ TOO SLOW' : '▲ TOO FAST';
        const color = dry ? '#6b6b6b' : m.status === 'ok' ? '#1f8a4c' : m.status === 'low' ? '#3d6694' : '#c2410c';
        gauge.label.draw(txt, (g, w, h) => {
          g.fillStyle = 'rgba(255,248,236,0.95)'; roundRect(g, 4, 4, w - 8, h - 8, 30); g.fill();
          g.fillStyle = color; g.font = font(78, 800); g.textAlign = 'center'; g.textBaseline = 'middle';
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
