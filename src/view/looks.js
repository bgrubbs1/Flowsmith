// Surface looks: Blender-baked textures, water and glass shading, the dusk sky. Shared so every board,
// menu and piece reuses one copy of each texture and shader program (Quest draw-call and memory budget).
import * as THREE from 'three';

export const LOOK = { time: { value: 0 }, lit: { value: 0 } }; // lit: 0 while you work, 1 once the valley flows
const base = () => import.meta.env?.BASE_URL ?? globalThis.__BASE ?? './';

// ---------------------------------------------------------------- baked textures
const loader = new THREE.TextureLoader();
const texCache = new Map();
export function bakedTexture(name, { srgb = true, repeat = [1, 1] } = {}) {
  const key = name + repeat.join('x');
  if (texCache.has(key)) return texCache.get(key);
  const tex = loader.load(base() + 'assets/textures/' + name + '.jpg');
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  // Mirrored repeat: the baked textures are not tileable, and mirroring hides the seams.
  tex.wrapS = tex.wrapT = THREE.MirroredRepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 4;
  texCache.set(key, tex);
  return tex;
}
export function bakedSurface(name, params = {}, { repeat = [1, 1], normalScale = 1 } = {}) {
  return new THREE.MeshStandardMaterial({
    map: bakedTexture(name + '_color', { repeat }),
    normalMap: bakedTexture(name + '_normal', { srgb: false, repeat }),
    normalScale: new THREE.Vector2(normalScale, normalScale),
    ...params,
  });
}

// ---------------------------------------------------------------- glass: a fresnel rim so tubes read as glass
export function glassify(material, rim = new THREE.Color(0xbfe9ff), strength = 0.9) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = { value: rim };
    shader.uniforms.uRimStrength = { value: strength };
    shader.fragmentShader = 'uniform vec3 uRim;\nuniform float uRimStrength;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float fsFres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 3.0);
      totalEmissiveRadiance += uRim * fsFres * uRimStrength;
      diffuseColor.a = min(1.0, diffuseColor.a + fsFres * 0.55);`);
  };
  material.customProgramCacheKey = () => 'fs-glass';
  return material;
}

// ---------------------------------------------------------------- flowing water inside the pipes
// Bands of bright and deep water slide along each segment; a fresnel edge keeps the core round.
export function flowingWaterMaterial(phase = { value: 0 }) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x114c58, emissiveIntensity: .24, roughness: 0.08, metalness: 0, transparent: true, opacity: 0.93 });
  m.defines = { USE_UV: '' };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = LOOK.time;
    shader.uniforms.uPhase = phase; // advances only while water is moving, so still water holds still
    shader.fragmentShader = 'uniform float uTime;\nuniform float uPhase;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
      float fsAlong = vUv.y * 3.0 + uPhase;
      float fsBand = sin(fsAlong * 6.2832 + sin(vUv.x * 6.2832 * 2.0 + uTime * 3.0) * 0.6) * 0.5 + 0.5;
      float fsFoam = smoothstep(0.86, 1.0, sin(fsAlong * 6.2832 * 2.0 + vUv.x * 9.0) * 0.5 + 0.5);
      vec3 fsDeep = vec3(0.025, 0.20, 0.25), fsBright = vec3(0.18, 0.65, 0.72);
      diffuseColor.rgb = mix(fsDeep, fsBright, fsBand * 0.75) + fsFoam * 0.18;`).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      float fsRim = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.0);
      totalEmissiveRadiance = totalEmissiveRadiance * (0.35 + fsBand * 0.5) + vec3(0.55, 0.9, 1.0) * fsRim * 0.16 + fsFoam * 0.08;`);
  };
  m.customProgramCacheKey = () => 'fs-flow';
  return m;
}

// Wet ceramic stays visible under a soft irregular edge; expanding impact rings replace flat blue blobs.
export function ripplePuddleMaterial() {
  const m=new THREE.MeshStandardMaterial({color:0x397d80,roughness:.17,metalness:.1,transparent:true,opacity:.48,depthWrite:false});
  m.defines={USE_UV:''};
  m.onBeforeCompile=(shader)=>{
    shader.uniforms.uRippleTime=LOOK.time;
    shader.fragmentShader='uniform float uRippleTime;\n'+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec2 wetP=vUv*2.0-1.0;
      float wetR=length(wetP), wetAngle=atan(wetP.y,wetP.x);
      float wetEdge=wetR+.035*sin(wetAngle*5.0)+.025*sin(wetAngle*9.0);
      float wetMask=1.0-smoothstep(.78,1.0,wetEdge);
      float wetWave=sin(wetR*34.0-uRippleTime*7.0+sin(wetAngle*3.0)*.3);
      float wetRing=pow(max(0.0,wetWave),14.0)*(1.0-wetR)*.38;
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.58,.80,.77),wetRing);
      diffuseColor.a*=wetMask*(.55+wetRing);
    `);
  };m.customProgramCacheKey=()=> 'fs-ripple-puddle';return m;
}

// ---------------------------------------------------------------- the sea at the drain
// World-space ripples (so neighbouring sea tiles join up), sparkle on wave crests and a lighter shallow edge.
export function seaMaterial({scale=140,glint=.22,emission=1,ripple=.09}={}) {
  const m = new THREE.MeshStandardMaterial({ color: 0x357e89, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.84 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = LOOK.time;
    shader.uniforms.uFsWaterScale={value:scale};shader.uniforms.uFsGlint={value:glint};shader.uniforms.uFsEmission={value:emission};shader.uniforms.uFsRipple={value:ripple};
    shader.vertexShader = 'varying vec3 vFsWorld;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvFsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = 'uniform float uTime;\nuniform float uFsWaterScale;\nuniform float uFsGlint;\nuniform float uFsEmission;\nuniform float uFsRipple;\nvarying vec3 vFsWorld;\n' + shader.fragmentShader.replace(
      '#include <normal_fragment_maps>',
      `#include <normal_fragment_maps>
      vec2 fsP = vFsWorld.xz * uFsWaterScale;
      float fsT = uTime;
      vec2 fsG = vec2(cos(fsP.x + fsT * 1.7) + 0.6 * cos(fsP.x * 0.7 + fsP.y * 1.3 - fsT * 2.1),
                      cos(fsP.y * 1.1 - fsT * 1.3) + 0.6 * cos(fsP.y * 0.8 - fsP.x * 1.2 + fsT * 1.9)) * uFsRipple;
      normal = normalize(normal + (viewMatrix * vec4(fsG.x, 0.0, fsG.y, 0.0)).xyz);
      float fsWave = sin(fsP.x + fsT * 1.7) * sin(fsP.y * 1.1 - fsT * 1.3);`).replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      totalEmissiveRadiance += vec3(0.02, 0.10, 0.12) * uFsEmission * (0.4 + 0.6 * smoothstep(0.55, 0.95, fsWave)) + vec3(0.7, 0.9, 1.0) * smoothstep(0.92, 0.99, fsWave) * uFsGlint;`);
  };
  m.customProgramCacheKey = () => 'fs-sea';
  return m;
}

// ---------------------------------------------------------------- dusk sky dome
// Indigo zenith, an amber band at the horizon, a few stars and a distant ridge line. Unlit and fog-free.
export const HORIZON = new THREE.Color(0x536574);
export function skyDome(radius = 24) {
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: LOOK.time, uLit: LOOK.lit },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; }`,
    fragmentShader: `varying vec3 vDir; uniform float uTime; uniform float uLit;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main(){
        float e = vDir.y; float az = atan(vDir.z, vDir.x);
        vec3 zenith = vec3(0.035, 0.05, 0.13), mid = vec3(0.13, 0.12, 0.26), glow = vec3(0.85, 0.42, 0.20), ground = vec3(0.08, 0.11, 0.15);
        float warm = 0.55 + 0.45 * cos(az + 1.2);
        vec3 col = mix(mid, zenith, smoothstep(0.05, 0.6, e));
        col = mix(col, glow * (0.45 + 0.55 * warm) * (1.0 + 0.5 * uLit), exp(-max(e, 0.0) * 14.0) * 0.9);
        // When the valley flows the sky answers: a slow teal ribbon wakes up over the ridge.
        float rib = 0.3 + 0.06 * sin(az * 2.0 + uTime * 0.25) + 0.03 * sin(az * 5.0 - uTime * 0.4);
        float ribA = exp(-pow((e - rib) / 0.05, 2.0)) * (0.55 + 0.45 * sin(az * 9.0 + uTime * 0.8));
        col += vec3(0.10, 0.55, 0.45) * ribA * uLit * 0.55;
        vec2 sp = vec2(az * 60.0, e * 90.0); vec2 cell = floor(sp);
        float star = step(0.985, hash(cell)) * smoothstep(0.45, 0.0, length(fract(sp) - 0.5)) * smoothstep(0.12, 0.4, e);
        col += vec3(0.9, 0.92, 1.0) * star * (0.6 + 0.4 * sin(uTime * 2.0 + hash(cell) * 30.0)) * (1.0 + 0.6 * uLit);
        float ridge = 0.035 + 0.03 * sin(az * 3.0 + 0.5) + 0.018 * sin(az * 7.0 + 2.0) + 0.008 * sin(az * 19.0);
        // Layered atmospheric ridges: soften the old single hard horizon silhouette.
        float farRidge = ridge + 0.025 + 0.012 * sin(az * 5.0 - 1.2);
        float midRidge = ridge - 0.012 + 0.009 * sin(az * 11.0);
        col = mix(col, vec3(0.24, 0.31, 0.34), 1.0-smoothstep(farRidge-0.003,farRidge+0.003,e));
        col = mix(col, vec3(0.16, 0.24, 0.28), 1.0-smoothstep(midRidge-0.002,midRidge+0.002,e));
        col = mix(col, vec3(0.10, 0.18, 0.22), 1.0-smoothstep(ridge-0.04,ridge-0.036,e));
        if (e < 0.0) col = mix(col, ground, smoothstep(0.0, -0.08, e));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, 48, 24), m);
  dome.name = 'sky-dome';
  dome.renderOrder = -10;
  dome.frustumCulled = false;
  return dome;
}

// A soft warm pool of lamplight on the floor under the table.
export function lightPool(size = 3, color = 0xffb46a, opacity = 0.32) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.rotation.x = -Math.PI / 2;
  return m;
}
