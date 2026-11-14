// Water you can see: instanced droplets flowing through the glass pipes, spraying from leaks.
import * as THREE from 'three';
import { DIRS } from '../sim/pieces.js';
import { T, PIPE_Y, PIPE_R } from './materials.js';

const MAX = 1400;
const SPACING = 0.011;
export const VISIBLE_FLOW = 0.01;

export class WaterView {
  constructor(parent) {
    const g = new THREE.SphereGeometry(0.0036, 6, 4);
    this.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x9fe3ff }), MAX);
    // Solid water core inside the glass, one segment per wet link between two cells.
    const cg = new THREE.CylinderGeometry(PIPE_R * 0.72, PIPE_R * 0.72, 1, 10, 1, true);
    cg.rotateX(Math.PI / 2);
    const stripes = document.createElement('canvas'); stripes.width = 16; stripes.height = 64;
    const sg = stripes.getContext('2d');
    sg.fillStyle = '#3cc8ff'; sg.fillRect(0, 0, 16, 64);
    sg.fillStyle = '#c9f1ff'; sg.fillRect(0, 0, 16, 10); sg.fillStyle = '#7fdcff'; sg.fillRect(0, 10, 16, 6);
    this.stripeTex = new THREE.CanvasTexture(stripes);
    this.stripeTex.wrapS = this.stripeTex.wrapT = THREE.RepeatWrapping;
    this.stripeTex.repeat.set(1, 3);
    this.stripeTex.colorSpace = THREE.SRGBColorSpace;
    this.core = new THREE.InstancedMesh(cg, new THREE.MeshStandardMaterial({ map: this.stripeTex, color: 0xffffff, emissive: 0x1a8fd0, emissiveIntensity: 0.55, roughness: 0.1, transparent: true, opacity: 0.92 }), 400);
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
    if(nc>0)this.stripeTex.offset.y -= dt * 1.6;
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
    // Leaks: flow to the open end, then a spray arc.
    for (const L of res.leaks) {
      const r = Math.floor(L.i / cols), c = L.i % cols;
      const a = cellCenter(r, c);
      const d = DIRS.find((x) => x.bit === L.dir);
      const ex = a.x + (d.dc * T) / 2, ez = a.z + (d.dr * T) / 2;
      const strength = Math.min(1, L.q / 2);
      for (let i = 0; i < 3; i++) {
        const s = ((i / 3 + this.t * 2) % 1);
        put(a.x + (ex - a.x) * s, PIPE_Y, a.z + (ez - a.z) * s);
      }
      for (let i = 0; i < 24; i++) {
        const life = (i / 24 + this.t * 1.6) % 1;
        const spread = Math.sin(i * 12.9898) * 0.5;
        const v0 = 0.12 + 0.12 * strength;
        const horiz = v0 * life * 0.45;
        const px = ex + d.dc * horiz + (d.dr ? spread * horiz * 0.6 : 0);
        const pz = ez + d.dr * horiz + (d.dc ? spread * horiz * 0.6 : 0);
        const py = PIPE_Y + 0.02 * life - 0.06 * life * life;
        if (py < -0.002) continue;
        put(px, py, pz, 0.9 - life * 0.5);
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
