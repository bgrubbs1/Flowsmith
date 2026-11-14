import * as THREE from 'three';
import { bakedSurface, glassify, seaMaterial } from './looks.js';

export const T = 0.055; // tile size in metres
export const PIPE_Y = 0.014;
export const PIPE_R = 0.0085;

export const COLORS = {
  copper: 0xc98b58,
  copperDark: 0x76523a,
  brass: 0xc4a56b,
  glass: 0xbfe6ff,
  water: 0x3cc8ff,
  waterDeep: 0x1f6fd1,
  grassA: 0x334852,
  grassB: 0x293b46,
  wood: 0x202c35,
  woodDark: 0x101a23,
  stone: 0x708087,
  roof: 0x365762,
  ok: 0x4cd07d,
  low: 0x6a8fb8,
  high: 0xff7a45,
  leak: 0xff5a5a,
  wheel: 0xc0392b,
  text: '#2b2118',
  panel: '#f5ead6',
};

const cache = new Map();
export function mat(name) {
  if (cache.has(name)) return cache.get(name);
  let m;
  switch (name) {
    case 'copper': m = new THREE.MeshStandardMaterial({ color: COLORS.copper, metalness: 0.75, roughness: 0.27 }); break;
    case 'copperLocked': m = new THREE.MeshStandardMaterial({ color: COLORS.copperDark, metalness: 0.35, roughness: 0.55 }); break;
    case 'brass': m = new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 0.72, roughness: 0.28 }); break;
    case 'glass': m = glassify(new THREE.MeshStandardMaterial({ color: 0xf2fbff, metalness: 0, roughness: 0.04, transparent: true, opacity: 0.16, depthWrite: false, emissive: 0x9fdcff, emissiveIntensity: 0.1 })); break;
    case 'water': m = new THREE.MeshStandardMaterial({ color: COLORS.water, emissive: 0x0b3a77, roughness: 0.2, metalness: 0 }); break;
    case 'sea': m = seaMaterial(); break;
    case 'wood': m = bakedSurface('walnut', { color: 0xffffff, roughness: 0.42, metalness: 0.05 }, { normalScale: 0.6 }); break;
    case 'woodDark': m = bakedSurface('walnut', { color: 0x8a8580, roughness: 0.5, metalness: 0.05 }, { normalScale: 0.6 }); break;
    case 'stone': m = new THREE.MeshStandardMaterial({ color: COLORS.stone, roughness: 0.95, flatShading: true }); break;
    case 'boulder': m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 }); break;
    case 'slate': m = bakedSurface('slate_tile', { roughness: 0.62, metalness: 0.08 }, { normalScale: 1.4 }); break;
    case 'felt': m = bakedSurface('felt', { roughness: 1 }); break;
    case 'roof': m = new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.7, flatShading: true }); break;
    case 'wheelRed': m = new THREE.MeshStandardMaterial({ color: COLORS.wheel, roughness: 0.5, metalness: 0.2 }); break;
    case 'mound': m = new THREE.MeshStandardMaterial({ color: 0x516369, roughness: 0.9, flatShading: true }); break;
    case 'sand': m = new THREE.MeshStandardMaterial({ color: 0x667881, roughness: 0.95 }); break;
    case 'paleWood': m = new THREE.MeshStandardMaterial({ color: 0xb98c56, roughness: 0.7 }); break;
    case 'lamp': m = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffc35a, emissiveIntensity: 0.05, roughness: 0.4 }); break;
    case 'lampLit': m = new THREE.MeshStandardMaterial({ color: 0xfff1c9, emissive: 0xffc35a, emissiveIntensity: 1.6, roughness: 0.4 }); break;
    case 'iron': m = new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.6, metalness: 0.4 }); break;
    case 'white': m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }); break;
    case 'shadow': {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
      grd.addColorStop(0, 'rgba(0,0,0,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
      const tex = new THREE.CanvasTexture(c);
      m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
      break;
    }
    default: throw new Error('unknown material ' + name);
  }
  cache.set(name, m);
  return m;
}

export function windowMat() {
  return new THREE.MeshStandardMaterial({ color: 0x2a2a2a, emissive: 0xffc35a, emissiveIntensity: 0, roughness: 0.5 });
}
