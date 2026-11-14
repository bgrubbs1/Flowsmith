// Builds merged meshes for each piece type at rotation 0 (ports N=-z, E=+x, S=+z, W=-x).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PIECES, N, E, S, W } from '../sim/pieces.js';
import { T, PIPE_Y, PIPE_R, mat, windowMat } from './materials.js';

const ARM = { [N]: [0, -1], [E]: [1, 0], [S]: [0, 1], [W]: [-1, 0] };

function armGeom(bit, radius, len, y = PIPE_Y) {
  const [dx, dz] = ARM[bit];
  const g = new THREE.CylinderGeometry(radius, radius, len, 14, 1, true);
  g.rotateX(Math.PI / 2); // along z
  if (dx) g.rotateY(Math.PI / 2);
  g.translate((dx * len) / 2, y, (dz * len) / 2);
  return g;
}
function flange(bit) {
  const [dx, dz] = ARM[bit];
  const g = new THREE.CylinderGeometry(PIPE_R * 1.35, PIPE_R * 1.35, 0.004, 16);
  g.rotateX(Math.PI / 2);
  if (dx) g.rotateY(Math.PI / 2);
  const d = T / 2 - 0.003;
  g.translate(dx * d, PIPE_Y, dz * d);
  return g;
}
function support(bit) {
  const [dx, dz] = ARM[bit];
  const g = new THREE.BoxGeometry(0.004, PIPE_Y - PIPE_R + 0.001, 0.01);
  if (dx) g.rotateY(Math.PI / 2);
  const d = T / 2 - 0.009;
  g.translate(dx * d, (PIPE_Y - PIPE_R) / 2, dz * d);
  return g;
}

const geoCache = new Map();

// Returns { group: THREE.Group, parts } for a piece type; parts holds animated sub-objects.
export function buildPiece(type, opts = {}) {
  const def = PIECES[type];
  const group = new THREE.Group();
  const parts = {};
  const locked = !!opts.locked;
  const copper = mat(locked ? 'copperLocked' : 'copper');
  if (type === 'rock') {
    const g = new THREE.DodecahedronGeometry(0.018, 0);
    const m = new THREE.Mesh(g, mat('stone'));
    m.scale.set(1.1, 0.8, 1);
    m.position.y = 0.012;
    m.rotation.y = (opts.seed || 0) * 2.1;
    group.add(m);
    const g2 = new THREE.DodecahedronGeometry(0.011, 0);
    const m2 = new THREE.Mesh(g2, mat('stone'));
    m2.position.set(0.014, 0.007, 0.01);
    group.add(m2);
    return { group, parts };
  }
  if (type === 'source') {
    // A spring: a ring of stones around a bubbling basin.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.0085 + 0.002 * (k % 2), 0), mat('stone'));
      s.position.set(Math.cos(a) * 0.017, 0.007, Math.sin(a) * 0.017);
      s.rotation.set(k, k * 2, 0);
      group.add(s);
    }
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 0.01, 20), mat('iron'));
    basin.position.y = 0.005;
    group.add(basin);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0125, 0.003, 20), mat('water'));
    pool.position.set(0, 0.0105, 0);
    group.add(pool);
    parts.pool = pool;
  }
  if (type === 'drain') {
    const sea = new THREE.Mesh(new THREE.BoxGeometry(T * 0.96, 0.006, T * 0.96), mat('sea'));
    sea.position.y = 0.004;
    group.add(sea);
    const sand = new THREE.Mesh(new THREE.BoxGeometry(T * 0.96, 0.003, 0.012), mat('sand'));
    sand.position.set(0, 0.006, -T / 2 + 0.008);
    group.add(sand);
    parts.sea = sea;
  }
  // Pipe arms (glass with copper flanges) for everything with ports.
  const glassGeoms = [], copperGeoms = [];
  const bits = [N, E, S, W].filter((b) => def.ports & b);
  const armLen = T / 2;
  for (const b of bits) {
    if (type === 'source' || type === 'drain') {
      glassGeoms.push(armGeom(b, PIPE_R, armLen * 0.9));
    } else {
      glassGeoms.push(armGeom(b, PIPE_R, armLen));
    }
    copperGeoms.push(flange(b));
    if (type !== 'drain' && type !== 'source') copperGeoms.push(support(b));
  }
  if (bits.length >= 2 && type !== 'mill') {
    const hub = new THREE.SphereGeometry(PIPE_R * 1.08, 14, 10);
    hub.translate(0, PIPE_Y, 0);
    if (type === 'elbow' || type === 'tee' || type === 'cross') copperGeoms.push(hub);
  }
  if (type === 'valve') {
    const body = new THREE.CylinderGeometry(PIPE_R * 1.5, PIPE_R * 1.5, 0.016, 16);
    body.rotateX(Math.PI / 2);
    body.translate(0, PIPE_Y, 0);
    copperGeoms.push(body);
    const stem = new THREE.CylinderGeometry(0.002, 0.002, 0.02, 8);
    stem.translate(0, PIPE_Y + 0.016, 0);
    copperGeoms.push(stem);
    const wheel = new THREE.Group();
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0135, 0.0026, 8, 24), mat('wheelRed'));
    rim.rotation.x = Math.PI / 2;
    wheel.add(rim);
    for (let k = 0; k < 3; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.027, 0.002, 0.0025), mat('wheelRed'));
      spoke.rotation.y = (k * Math.PI) / 3;
      wheel.add(spoke);
    }
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.0035, 10, 8), mat('brass'));
    knob.position.set(0.0135, 0.003, 0);
    wheel.add(knob);
    wheel.position.y = PIPE_Y + 0.027;
    group.add(wheel);
    parts.wheel = wheel;
  }
  if (type === 'mill') {
    const hut = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.02, 0.03), mat('stone'));
    walls.position.y = 0.01;
    hut.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.016, 4), mat('roof'));
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 0.028;
    hut.add(roof);
    const wm = windowMat();
    for (const z of [-0.007, 0.007]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.008), wm);
      win.position.set(0.0131, 0.012, z);
      win.rotation.y = Math.PI / 2;
      hut.add(win);
    }
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.008, 0.012), wm);
    door.position.set(0, 0.006, 0.0151);
    hut.add(door);
    hut.position.x = 0.016;
    group.add(hut);
    parts.hut = hut;
    parts.windows = wm;
    // Water wheel straddling the pipe.
    const wheel = new THREE.Group();
    const hubM = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.012, 8), mat('woodDark'));
    hubM.rotation.z = Math.PI / 2;
    wheel.add(hubM);
    for (let k = 0; k < 10; k++) {
      const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.0024, 0.011), mat('paleWood'));
      const a = (k / 10) * Math.PI * 2;
      paddle.position.set(0, Math.sin(a) * 0.03, Math.cos(a) * 0.03);
      paddle.rotation.x = -a;
      wheel.add(paddle);
    }
    for (const sx of [-0.006, 0.006]) {
      const rimG = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.002, 6, 32), mat('paleWood'));
      rimG.rotation.y = Math.PI / 2;
      rimG.position.x = sx;
      wheel.add(rimG);
    }
    wheel.position.set(-0.012, PIPE_Y + 0.018, 0);
    group.add(wheel);
    parts.millWheel = wheel;
    // Copper collar where the pipe enters the wheel housing.
    const collar = new THREE.CylinderGeometry(PIPE_R * 1.3, PIPE_R * 1.3, 0.02, 14);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, PIPE_Y, 0);
    copperGeoms.push(collar);
  }
  if (glassGeoms.length) {
    const key = type + ':glass';
    let g = geoCache.get(key);
    if (!g) { g = mergeGeometries(glassGeoms); geoCache.set(key, g); }
    const m = new THREE.Mesh(g, mat('glass'));
    m.renderOrder = 2;
    group.add(m);
  }
  if (copperGeoms.length) {
    const key = type + ':copper';
    let g = geoCache.get(key);
    if (!g) { g = mergeGeometries(copperGeoms); geoCache.set(key, g); }
    group.add(new THREE.Mesh(g, copper));
  }
  return { group, parts };
}
