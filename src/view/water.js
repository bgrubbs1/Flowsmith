// Water you can see: instanced droplets flowing through the glass pipes, spraying from leaks.
import * as THREE from 'three';
import { DIRS } from '../sim/pieces.js';
import { T, PIPE_Y, PIPE_R } from './materials.js';
import { flowingWaterMaterial } from './looks.js';

const MAX = 1800;
const SPACING = 0.011;
export const VISIBLE_FLOW = 0.01;

export class WaterView {
  constructor(parent) {
    const g = new THREE.SphereGeometry(0.0036, 8, 6);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x9fdcf7, transparent: true, opacity: 0.85 }), MAX);
    // Solid water core inside the glass, one segment per wet link between two cells.
    const cg = new THREE.CylinderGeometry(PIPE_R * 0.72, PIPE_R * 0.72, 1, 10, 1, true);
    cg.rotateX(Math.PI / 2);
    this.flowPhase = { value: 0 };
    this.core = new THREE.InstancedMesh(cg, flowingWaterMaterial(this.flowPhase), 400);
    this.core.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.core.frustumCulled = false;
    this.core.count = 0;
    parent.add(this.core);
    // Filled but effectively still water must not borrow the moving stripe texture.
    this.stillCore = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({color:0x297c9c,roughness:.22,transparent:true,opacity:.8}),400);
    this.stillCore.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.stillCore.frustumCulled=false;this.stillCore.count=0;parent.add(this.stillCore);
    this.q = new THREE.Quaternion();
    this.sc = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 0, 1);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    parent.add(this.mesh);
    this.puddleParent = parent; this.puddles = [];
    this.puddleGeo = new THREE.CircleGeometry(1, 24); this.puddleGeo.rotateX(-Math.PI / 2);
    this.puddleMat = new THREE.MeshStandardMaterial({ color: 0x2a7fc4, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.75, depthWrite: false });
    this.phase = new Map();
    this.m = new THREE.Matrix4();
    this.v = new THREE.Vector3();
    this.t = 0;
  }
  update(dt, st, cellCenter) {
    this.t += dt;
    const res = st.result;
    if (!res) { this.mesh.count = this.core.count = this.stillCore.count = 0; return; }
    let n = 0;
    const put = (x, y, z, s = 1) => {
      if (n >= MAX) return;
      this.m.makeScale(s, s, s).setPosition(x, y, z);
      this.mesh.setMatrixAt(n++, this.m);
    };
    const cols = st.cols;
    let nc = 0, ns = 0;
    const seg = (ax, az, bx, bz, moving = true) => {
      if ((moving ? nc : ns) >= 400) return;
      this.v.set(bx - ax, 0, bz - az);
      const len = this.v.length();
      this.q.setFromUnitVectors(this.up, this.v.normalize());
      this.m.compose(this.v.set((ax + bx) / 2, PIPE_Y, (az + bz) / 2), this.q, this.sc.set(1, 1, len));
      if(moving)this.core.setMatrixAt(nc++, this.m);else this.stillCore.setMatrixAt(ns++,this.m);
    };
    for (const e of res.sol.edges) {
      if (!res.sol.wet[e.a] || !res.sol.wet[e.b]) continue;
      const a = cellCenter(Math.floor(e.a / cols), e.a % cols);
      const b = cellCenter(Math.floor(e.b / cols), e.b % cols);
      const moving=Math.abs(e.q)>=VISIBLE_FLOW;
      if (e.q >= 0) seg(a.x, a.z, b.x, b.z,moving); else seg(b.x, b.z, a.x, a.z,moving);
    }
    for (const L of res.leaks) {
      const a = cellCenter(Math.floor(L.i / cols), L.i % cols);
      const d = DIRS.find((x) => x.bit === L.dir);
      seg(a.x, a.z, a.x + (d.dc * T) / 2, a.z + (d.dr * T) / 2, Math.abs(L.q)>=VISIBLE_FLOW);
    }
    if (nc > 0) this.flowPhase.value -= dt * 1.6;
    this.core.count = nc;
    this.stillCore.count=ns;this.stillCore.instanceMatrix.needsUpdate=true;
    this.core.instanceMatrix.needsUpdate = true;
    for (const e of res.sol.edges) {
      if (!res.sol.wet[e.a] || Math.abs(e.q) < VISIBLE_FLOW) continue;
      const k = e.a * 4096 + e.b;
      const speed = Math.min(0.22, 0.035 * Math.abs(e.q) + 0.01);
      const ph = ((this.phase.get(k) || 0) + (speed * dt) / T) % 1;
      this.phase.set(k, ph);
      const a = cellCenter(Math.floor(e.a / cols), e.a % cols);
      const b = cellCenter(Math.floor(e.b / cols), e.b % cols);
      const count = Math.max(2, Math.round(T / SPACING));
      const dir = e.q > 0 ? 1 : -1;
      for (let i = 0; i < count; i++) {
        let s = (i / count + ph) % 1;
        if (dir < 0) s = 1 - s;
        put(a.x + (b.x - a.x) * s, PIPE_Y + Math.sin((s + i) * 9) * 0.0015, a.z + (b.z - a.z) * s, 0.8 + 0.3 * Math.abs(e.q) / 3);
      }
    }
    // Leaks: a gushing arc that lands in a spreading puddle with a splash, not a dotted line.
    let pi = 0;
    for (const L of res.leaks) {
      const r = Math.floor(L.i / cols), c = L.i % cols;
      const a = cellCenter(r, c);
      const d = DIRS.find((x) => x.bit === L.dir);
      const ex = a.x + (d.dc * T) / 2, ez = a.z + (d.dr * T) / 2;
      const strength = Math.min(1, Math.abs(L.q) / 2);
      for (let i = 0; i < 4; i++) {
        const s = ((i / 4 + this.t * 2) % 1);
        put(a.x + (ex - a.x) * s, PIPE_Y, a.z + (ez - a.z) * s);
      }
      const v0 = 0.13 + 0.1 * strength;
      // Where a mid-sized drop lands: y(t) = PIPE_Y + 0.03 t - 0.09 t^2 reaches 0 at t_land.
      const tLand = (0.03 + Math.sqrt(0.0009 + 0.36 * PIPE_Y)) / 0.18;
      const reach = v0 * 0.45 * tLand;
      const lx = ex + d.dc * reach, lz = ez + d.dr * reach;
      for (let i = 0; i < 56; i++) {
        const h1 = Math.sin(i * 12.9898) * 43758.5453, h2 = Math.sin(i * 78.233) * 12345.678;
        const j1 = h1 - Math.floor(h1) - 0.5, j2 = h2 - Math.floor(h2) - 0.5;
        const life = (i / 56 + this.t * (1.5 + j2 * 0.4)) % 1;
        const tt = life * tLand * 1.15;
        const horiz = v0 * (1 + j1 * 0.25) * 0.45 * Math.min(tt, tLand);
        const side = j2 * 0.35 * horiz;
        let py = PIPE_Y + 0.03 * tt - 0.09 * tt * tt;
        let px = ex + d.dc * horiz + d.dr * side, pz = ez + d.dr * horiz + d.dc * side;
        let size = 0.75 + 0.5 * Math.abs(j1) * 2 - life * 0.25;
        if (py < 0.001) {
          // Splash: bounce up and outward from the impact point.
          const k = (tt - tLand) / (tLand * 0.15);
          const ang = i * 2.39996;
          px = lx + Math.cos(ang) * 0.012 * k; pz = lz + Math.sin(ang) * 0.012 * k;
          py = 0.002 + 0.008 * k * (1 - k); size = 0.6 * (1 - k);
          if (size <= 0.05) continue;
        }
        put(px, py, pz, size);
      }
      // Puddle under the splash; it grows while the leak runs.
      let pud = this.puddles[pi];
      if (!pud) { pud = new THREE.Mesh(this.puddleGeo, this.puddleMat); pud.name = 'leak-puddle'; this.puddleParent.add(pud); this.puddles.push(pud); pud.userData.s = 0; }
      pud.visible = true; pud.position.set(lx, 0.0035, lz);
      pud.userData.s = Math.min(1, pud.userData.s + dt * 0.5);
      const ps = (0.012 + 0.014 * strength) * pud.userData.s * (1 + 0.06 * Math.sin(this.t * 5 + pi));
      pud.scale.set(ps, 1, ps * 0.8);
      pi++;
    }
    for (; pi < this.puddles.length; pi++) { this.puddles[pi].visible = false; this.puddles[pi].userData.s = 0; }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
