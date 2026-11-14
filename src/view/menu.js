// The level picker: a small wooden console with a title panel and a push button per level.
import * as THREE from 'three';
import { mat } from './materials.js';
import { CanvasPanel, PushButton, roundRect, wrapText, font } from './ui.js';

let haloMat = null;
function haloMaterial() {
  if (haloMat) return haloMat;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.25, 'rgba(255,200,110,0.6)'); gr.addColorStop(1, 'rgba(255,170,60,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  haloMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: 0xffc35a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  return haloMat;
}

export class MenuView {
  constructor(parent) {
    this.root = new THREE.Group();
    parent.add(this.root);
    this.buttons = [];
    this.knobs = [];
    this.title = new CanvasPanel(0.4, 0.15, 1200);
    this.title.mesh.position.set(0, 0.12, -0.15);
    this.title.mesh.rotation.x = -0.25;
    this.root.add(this.title.mesh);
    this.highlight = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0016, 6, 32), new THREE.MeshBasicMaterial({ color: 0xfff2a8 }));
    this.highlight.rotation.x = Math.PI / 2; this.highlight.visible = false;
    this.root.add(this.highlight);
    this.dropMarker = new THREE.Object3D();
    this.st = null;
  }
  build(levels, progress, daily) {
    for (const b of this.buttons) this.root.remove(b.group);
    for (const k of this.knobs) this.root.remove(k);
    if (this.plinth) this.root.remove(this.plinth);
    this.buttons = []; this.knobs = [];
    const cols = 4, sx = 0.075, sz = 0.09;
    const rows = Math.ceil(levels.length / cols);
    const W = cols * sx + 0.04, D = (rows + 1) * sz + 0.05;
    this.plinth = new THREE.Mesh(new THREE.BoxGeometry(W, 0.02, D), mat('wood'));
    this.plinth.position.set(0, -0.016, (-0.09 + (-0.09 + rows * sz)) / 2);
    this.root.add(this.plinth);
    levels.forEach((def, i) => {
      const r = Math.floor(i / cols), c = i % cols;
      const stars = progress.stars[def.id] || 0;
      const b = new PushButton({ id: 'level:' + i, label: '★'.repeat(stars) + '☆'.repeat(3 - stars), icon: String(i + 1), radius: 0.022, tag: 'cap', color: stars === 3 ? 0x7fd8a6 : stars ? 0xf2c46b : 0xe9dcc3 });
      b.group.position.set((c - (cols - 1) / 2) * sx, -0.006, -0.09 + r * sz);
      this.root.add(b.group); this.buttons.push(b);
      // The valley lights up: each solved level gets a lit lantern beside its button.
      if (stars) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0018, 0.045, 6), mat('iron'));
        post.position.set(b.group.position.x + 0.031, 0.0145, b.group.position.z - 0.014);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 12, 8), mat('lampLit'));
        lamp.position.set(0, 0.025, 0); post.add(lamp);
        const halo = new THREE.Sprite(haloMaterial()); halo.scale.setScalar(0.04); halo.position.copy(lamp.position); post.add(halo);
        this.root.add(post); this.knobs.push(post);
      }
    });
    const dz = -0.09 + rows * sz;
    const dailyBtn = new PushButton({ id: 'daily', label: daily.done ? 'Done ✓' : 'Daily', icon: '☀', radius: 0.022, color: 0xffcf6b });
    dailyBtn.group.position.set(-sx * 1.5, -0.006, dz);
    const assist = new PushButton({ id: 'assist', label: progress.settings.assist ? 'Assist ON' : 'Assist off', icon: '✋', radius: 0.02 });
    assist.group.position.set(-sx * 0.5, -0.006, dz);
    const sound = new PushButton({ id: 'sound', label: progress.settings.sound ? 'Sound ON' : 'Sound off', icon: '♪', radius: 0.02 });
    sound.group.position.set(sx * 0.5, -0.006, dz);
    const center = new PushButton({ id: 'recenter', label: 'Recenter', icon: '◎', radius: 0.02 });
    center.group.position.set(sx * 1.5, -0.006, dz);
    for (const b of [dailyBtn, assist, sound, center]) { this.root.add(b.group); this.buttons.push(b); }
    const total = Object.values(progress.stars).reduce((a, b) => a + b, 0);
    this.title.last = '';
    this.title.draw('t' + total + daily.streak + daily.done, (g, w, h) => {
      g.fillStyle = 'rgba(245,234,214,0.96)'; roundRect(g, 6, 6, w - 12, h - 12, 40); g.fill();
      g.strokeStyle = '#b06a3b'; g.lineWidth = 8; g.stroke();
      g.fillStyle = '#2b2118'; g.textAlign = 'center'; g.textBaseline = 'top';
      g.font = font(120, 800); g.fillText('Flowsmith', w / 2, 34);
      g.font = font(40, 500); g.fillStyle = '#4a3a2a';
      wrapText(g, 'Pinch pipes into place. Twist valves. Light the valley.', w / 2, 178, w - 120, 48);
      g.font = font(36, 700); g.fillStyle = '#b06a3b';
      g.fillText(`★ ${total} / ${levels.length * 3}     ☀ Daily streak ${daily.streak}`, w / 2, 262);
      g.font = font(30, 500); g.fillStyle = '#7a6550';
      g.fillText('Press a button with your fingertip, or pinch it.', w / 2, 320);
    });
  }
  update(dt) { for (const b of this.buttons) b.update(dt); }
}
