// Builds merged meshes for each piece type at rotation 0 (ports N=-z, E=+x, S=+z, W=-x).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { authoredGeometry, authoredMesh } from './blenderAssets.js';
import { PIECES, N, E, S, W } from '../sim/pieces.js';
import { T, PIPE_Y, PIPE_R, mat, windowMat } from './materials.js';
// Faceted field stones: a jittered icosphere, flat shaded, with grey-blue colour that darkens toward the
// ground (cheap baked-looking contact shade) and a few lichen-flecked faces. Deterministic per seed.
const boulderGeo = [];
function boulder(k) {
  k %= 4;
  if (!boulderGeo[k]) {
    const g = new THREE.IcosahedronGeometry(1, 1), p = g.attributes.position, v = new THREE.Vector3();
    const h = (x, y, z) => { const t = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 4.1) * 43758.5453; return t - Math.floor(t); };
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const r = 0.82 + 0.3 * h(Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100));
      v.multiplyScalar(r); v.y = v.y * 0.72 + 0.1; if (v.y < 0) v.y *= 0.35;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    const col = new Float32Array(p.count * 3), c = new THREE.Color();
    for (let f = 0; f < p.count; f += 3) {
      const cy = (p.getY(f) + p.getY(f + 1) + p.getY(f + 2)) / 3, n = h(f, k, 7);
      const shade = 0.55 + 0.45 * Math.min(1, Math.max(0, (cy + 0.1) / 0.75));
      c.setRGB(0.25, 0.27, 0.29).multiplyScalar(shade * (0.85 + 0.3 * n));
      if (n > 0.82 && cy > 0.2) c.lerp(new THREE.Color(0.2, 0.24, 0.12), 0.55); // lichen fleck
      for (let j = 0; j < 3; j++) c.toArray(col, (f + j) * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    boulderGeo[k] = g;
  }
  return new THREE.Mesh(boulderGeo[k], mat('boulder'));
}

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
  const g = authoredGeometry('flange').clone();
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
    const seed = opts.seed || 0;
    const m = boulder(seed);
    m.scale.setScalar(0.019);
    m.position.y = 0.0085;
    m.rotation.y = seed * 2.1;
    group.add(m);
    const m2 = boulder(seed + 1);
    m2.scale.setScalar(0.0105);
    m2.position.set(0.015, 0.005, 0.011);
    m2.rotation.y = seed * 1.3 + 1;
    group.add(m2);
    return { group, parts };
  }
  if (type === 'source') {
    // A spring: a ring of stones around a bubbling basin.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + 0.4;
      const s = boulder(k);
      s.scale.setScalar(0.0085 + 0.002 * (k % 2));
      s.position.set(Math.cos(a) * 0.017, 0.005, Math.sin(a) * 0.017);
      s.rotation.set(0, k * 2, 0);
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
    const sea = new THREE.Mesh(new THREE.BoxGeometry(T * 0.79, 0.004, T * 0.79), mat('sea'));
    sea.position.y = 0.004;
    group.add(sea);
    const sand = new THREE.Mesh(new THREE.BoxGeometry(T * 0.96, 0.003, T * 0.96), mat('sand'));
    sand.position.set(0, 0.001, 0);
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
    const hut=new THREE.Group();hut.name='blender-mill-house';
    for(const [name,material] of [['millWalls','plaster'],['millStone','limestone'],['millTimber','woodDark'],['millRoof','roof'],['millRoofSeams','roofEdge'],['millDoor','tealEnamel']])hut.add(authoredMesh(name,mat(material)));
    const wm=windowMat();hut.add(authoredMesh('millWindows',wm));
    hut.position.x=.016;group.add(hut);parts.hut=hut;parts.windows=wm;
    const wheel=new THREE.Group();wheel.name='blender-mill-wheel';wheel.scale.setScalar(.9);
    wheel.add(authoredMesh('wheelWood',mat('paleWood')),authoredMesh('wheelHub',mat('brass')));
    wheel.position.set(-.012,PIPE_Y+.012,0);group.add(wheel);parts.millWheel=wheel;
    const collar=new THREE.CylinderGeometry(PIPE_R*1.15,PIPE_R*1.15,.017,12,1,true);
    collar.rotateX(Math.PI/2);collar.translate(0,PIPE_Y,0);copperGeoms.push(collar);
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
