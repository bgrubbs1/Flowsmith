// Canvas-text panels and physical push buttons (poke with a fingertip or pinch).
import * as THREE from 'three';
import { mat } from './materials.js';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export class CanvasPanel {
  constructor(widthM, heightM, px = 1024) {
    this.canvas = makeCanvas(px, Math.round((px * heightM) / widthM));
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.material = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(widthM, heightM), this.material);
    this.w = this.canvas.width; this.h = this.canvas.height;
    this.last = '';
  }
  // draw(fn) only repaints when the key changes, to keep frame time low.
  draw(key, fn) {
    if (key === this.last) return;
    this.last = key;
    const g = this.ctx;
    g.clearRect(0, 0, this.w, this.h);
    fn(g, this.w, this.h);
    this.texture.needsUpdate = true;
  }
}

export function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function wrapText(g, text, x, y, maxW, lineH) {
  const words = String(text).split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) { g.fillText(line, x, yy); line = w; yy += lineH; }
    else line = t;
  }
  if (line) g.fillText(line, x, yy);
  return yy + lineH;
}

const FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const font = (px, weight = 600) => `${weight} ${px}px ${FONT}`;

// A round physical button. Pressed by a fingertip moving down into it, or by a pinch on it.
export class PushButton {
  constructor({ id, label, radius = 0.017, color = 0xe9dcc3, icon = '', tag = 'back' }) {
    this.tagMode = tag;
    this.id = id; this.radius = radius; this.label = label; this.icon = icon;
    this.group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(radius * 1.18, radius * 1.25, 0.006, 24), mat('woodDark'));
    base.position.y = 0.003;
    this.group.add(base);
    this.capMat = new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    this.cap = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 0.008, 24), this.capMat);
    this.cap.position.y = 0.01;
    this.group.add(this.cap);
    this.labelPanel = new CanvasPanel(radius * 2, radius * 2, 256);
    this.labelPanel.mesh.rotation.x = -Math.PI / 2;
    this.labelPanel.mesh.position.y = 0.0142;
    this.cap.add(this.labelPanel.mesh);
    this.labelPanel.mesh.position.y = 0.0042;
    // A standing name tag behind the button, readable from the seat.
    this.tag = new CanvasPanel(0.062, 0.017, 512);
    if (tag === 'side' || tag === 'sideLeft') { this.tag.mesh.position.set((radius + 0.036) * (tag === 'sideLeft' ? -1 : 1), 0.012, 0); this.tag.mesh.rotation.x = -0.9; }
    else { this.tag.mesh.position.set(0, 0.03, -radius - 0.006); this.tag.mesh.rotation.x = -0.35; }
    this.tag.mesh.visible = tag !== 'cap';
    this.group.add(this.tag.mesh);
    this.depth = 0; // 0..1 visual press
    this.enabled = true;
    this.highlight = false;
    this.time = Math.random() * 6;
    this.setLabel(label, icon);
  }
  setLabel(label, icon = this.icon) {
    this.label = label; this.icon = icon;
    this.labelPanel.draw(label + '|' + icon + '|' + this.enabled, (g, w, h) => {
      g.fillStyle = '#2a2420';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (this.tagMode === 'cap') {
        // Menu pucks: the number on top, the stars under it, all on the cap (nothing standing to hide the next row).
        g.font = font(110, 800); g.fillText(icon, w / 2, h * 0.4);
        g.font = font(54, 800); g.fillStyle = '#7a4a12'; g.fillText(label, w / 2, h * 0.76);
        return;
      }
      g.font = font(icon ? 150 : (label.length > 4 ? 64 : 110), 800);
      g.fillText(icon || label, w / 2, h / 2 + 6);
    });
    this.tag.draw(label, (g, w, h) => {
      g.fillStyle = '#18313c'; roundRect(g, 6, 8, w - 12, h - 16, 10); g.fill();
      g.strokeStyle = '#b99862'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#ecdfc2'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = font(label.length > 9 ? 62 : 74, 500); g.fillText(label, w / 2, h / 2 + 4);
    });
  }
  setEnabled(v) {
    this.enabled = v;
    this.group.visible = v;
  }
  topWorldY() {
    const p = new THREE.Vector3(0, 0.014, 0);
    return this.cap.localToWorld(p).y;
  }
  update(dt) {
    this.cap.position.y = 0.01 - this.depth * 0.005;
    this.time += dt;
    this.capMat.emissive.setHex(this.highlight ? 0x1f6f3a : 0x000000);
    this.capMat.emissiveIntensity = this.highlight ? 0.6 + 0.6 * Math.sin(this.time * 6) : 0;
    if (this.highlight) this.group.scale.setScalar(1 + 0.05 * Math.sin(this.time * 6));
    this.depth = Math.max(0, this.depth - dt * 4);
  }
}
