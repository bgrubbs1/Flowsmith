import * as THREE from 'three';

export const T = 0.055; // tile size in metres
export const PIPE_Y = 0.014;
export const PIPE_R = 0.0085;

export const COLORS = {
  copper: 0xd98a52,
  copperDark: 0x8a5232,
  brass: 0xd8b04a,
  glass: 0xbfe6ff,
  water: 0x3cc8ff,
  waterDeep: 0x1f6fd1,
  grassA: 0x7fb069,
  grassB: 0x6fa25c,
  wood: 0x5a3a24,
  woodDark: 0x5e3b22,
  stone: 0x9a948a,
  roof: 0xb5523b,
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
    case 'copper': m = new THREE.MeshStandardMaterial({ color: COLORS.copper, metalness: 0.45, roughness: 0.38 }); break;
    case 'copperLocked': m = new THREE.MeshStandardMaterial({ color: COLORS.copperDark, metalness: 0.35, roughness: 0.55 }); break;
    case 'brass': m = new THREE.MeshStandardMaterial({ color: COLORS.brass, metalness: 0.5, roughness: 0.3 }); break;
    case 'glass': m = new THREE.MeshStandardMaterial({ color: 0xf2fbff, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.22, depthWrite: false, emissive: 0x9fdcff, emissiveIntensity: 0.12 }); break;
    case 'water': m = new THREE.MeshStandardMaterial({ color: COLORS.water, emissive: 0x0b3a77, roughness: 0.2, metalness: 0 }); break;
    case 'sea': m = new THREE.MeshStandardMaterial({ color: COLORS.waterDeep, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.9 }); break;
    case 'wood': m = new THREE.MeshStandardMaterial({ color: COLORS.wood, roughness: 0.8 }); break;
    case 'woodDark': m = new THREE.MeshStandardMaterial({ color: COLORS.woodDark, roughness: 0.85 }); break;
    case 'stone': m = new THREE.MeshStandardMaterial({ color: COLORS.stone, roughness: 0.95, flatShading: true }); break;
    case 'roof': m = new THREE.MeshStandardMaterial({ color: COLORS.roof, roughness: 0.7, flatShading: true }); break;
    case 'wheelRed': m = new THREE.MeshStandardMaterial({ color: COLORS.wheel, roughness: 0.5, metalness: 0.2 }); break;
    case 'mound': m = new THREE.MeshStandardMaterial({ color: 0x8fae6b, roughness: 0.9, flatShading: true }); break;
    case 'sand': m = new THREE.MeshStandardMaterial({ color: 0xe2cf9b, roughness: 0.95 }); break;
    case 'paleWood': m = new THREE.MeshStandardMaterial({ color: 0xd9b37a, roughness: 0.7 }); break;
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
