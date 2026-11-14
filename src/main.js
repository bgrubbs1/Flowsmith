// Entry point: renderer, WebXR session (passthrough first, VR fallback), the frame loop and the desktop preview.
import * as THREE from 'three';
import { App } from './game/app.js';
import { Environment } from './view/env.js';
import { HandViz } from './view/handviz.js';
import { HandInput, MouseHand } from './input/hands.js';
import { Sound } from './audio/audio.js';
import { CanvasPanel, font } from './view/ui.js';

const params = new URLSearchParams(location.search);
if (params.has('emulate')) {
  // Meta's Immersive Web Emulation Runtime: a virtual Quest 3 with tracked hands, for testing and capture on a PC.
  const { XRDevice, metaQuest3 } = await import('iwer');
  const device = new XRDevice(metaQuest3);
  device.installRuntime({ forceInstall: true });
  device.primaryInputMode = 'hand';
  device.stereoEnabled = false;
  device.position.set(0, 1.2, 0);
  // Look down at the table like a seated player.
  const look = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), params.has('director') ? -0.85 : -0.62);
  device.quaternion.set(look.x, look.y, look.z, look.w);
  window.__xrdevice = device;
}

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation(0.5);
document.getElementById('stage').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 1.22, 0.32);
camera.lookAt(0, 0.82, -0.32);

const env = new Environment(scene, renderer);
const sound = new Sound();
const app = new App(scene, sound);
app.anchor.scale.setScalar(1.25);
const handViz = new HandViz(scene);
const hands = new HandInput();
window.flowsmith = app; // handy for tests and scripted capture

// Desktop placement: the board sits on the table in front of the preview camera.
app.anchor.position.set(0, 0.82, -0.32);
env.followAnchor(app.anchor);
const boardPlane = new THREE.Plane();
const mouse = new MouseHand(renderer.domElement, camera, () => {
  boardPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, app.anchor.position.y + 0.02, 0));
  return boardPlane;
});

// Seat the board in front of the player: a forearm's reach ahead, below the eyes, facing them.
let recenterIn = -1;
let snapUntil = 0; // seconds: while recent, settle the board onto a detected table top
function recenter() {
  const cam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  const head = new THREE.Vector3(), q = new THREE.Quaternion();
  cam.getWorldPosition(head); cam.getWorldQuaternion(q);
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(q).setY(0);
  if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
  fwd.normalize();
  app.anchor.position.copy(head).addScaledVector(fwd, 0.42);
  app.anchor.position.y = Math.max(0.5, head.y - 0.36);
  app.anchor.rotation.set(0, Math.atan2(-fwd.x, -fwd.z), 0);
  env.followAnchor(app.anchor);
  snapUntil = performance.now() / 1000 + 3;
}

// If the headset knows where the real table is, rest the board on it (Quest room setup provides planes).
function snapToTable(frame, refSpace) {
  const planes = frame.detectedPlanes;
  if (!planes || !planes.size) return;
  let best = null, bestD = 0.8;
  for (const plane of planes) {
    if (plane.orientation !== 'horizontal') continue;
    const pose = frame.getPose(plane.planeSpace, refSpace);
    if (!pose) continue;
    const p = pose.transform.position;
    if (p.y < 0.45 || p.y > 1.1) continue;
    let near = Math.hypot(p.x - app.anchor.position.x, p.z - app.anchor.position.z);
    // A big table's centre can be far away: also accept it when the board sits inside its outline.
    if (plane.polygon?.length) {
      const inv = new THREE.Matrix4().fromArray(pose.transform.inverse.matrix);
      const lp = app.anchor.position.clone().applyMatrix4(inv);
      if (insidePolygon(lp.x, lp.z, plane.polygon)) near = 0;
    }
    if (near < bestD) { bestD = near; best = p.y; }
  }
  // Float the board a little above the real table so fingertips don't knock the surface while pinching.
  if (best != null) app.anchor.position.y += (best + 0.025 - app.anchor.position.y) * 0.2;
}
function insidePolygon(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.z > z) !== (b.z > z) && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) inside = !inside;
  }
  return inside;
}
app.onEvent((e) => { if (e.type === 'recenter') recenterIn = 2; });

// Session start.
const enterBtn = document.getElementById('enter');
const note = document.getElementById('note');
let mode = null;
async function pickMode() {
  if (!navigator.xr) return null;
  if (params.has('vr') && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) return 'immersive-vr';
  if (await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)) return 'immersive-ar';
  if (await navigator.xr.isSessionSupported('immersive-vr').catch(() => false)) return 'immersive-vr';
  return null;
}
pickMode().then((m) => {
  mode = m;
  enterBtn.textContent = m === 'immersive-ar' ? 'Enter (passthrough)' : m ? 'Enter VR' : 'Play on desktop';
  enterBtn.disabled = false;
  if (!m) note.textContent = 'No headset found: playing with the mouse. Click and drag pieces, scroll or press R to turn them.';
});
enterBtn.addEventListener('click', async () => {
  sound.start();
  if (!mode) { document.body.classList.add('playing'); return; }
  try {
    const session = await navigator.xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'plane-detection'] });
    env.setPassthrough(mode === 'immersive-ar');
    handViz.full = mode !== 'immersive-ar';
    renderer.setClearColor(0x000000, 0);
    await renderer.xr.setSession(session);
    session.updateTargetFrameRate?.(72)?.catch?.(() => {});
    document.body.classList.add('playing');
    recenterIn = 8;
    session.addEventListener('end', () => {
      document.body.classList.remove('playing');
      env.setPassthrough(false);
      handViz.full = true;
      app.anchor.position.set(0, 0.82, -0.32); app.anchor.rotation.set(0, 0, 0);
      env.followAnchor(app.anchor);
    });
  } catch (err) {
    note.textContent = 'Could not start the headset session: ' + err.message;
  }
});

// Scripted capture for the demo video (?emulate&vr&director). Exposed for the capture script to start.
if (params.has('director') && window.__xrdevice) {
  window.__startDirector = async (recordIt = true) => {
    const { Director, record } = await import('./director.js');
    const d = new Director(app, window.__xrdevice, sound);
    window.__director = d;
    return recordIt ? record(renderer.domElement, sound, () => d.run()) : d.run();
  };
}

// ?fps shows the measured frame rate in the headset, beside the board (for checking 60+ fps on a Quest).
let fpsPanel = null;
if (params.has('fps')) { fpsPanel = new CanvasPanel(0.06, 0.02, 256); fpsPanel.mesh.position.set(-0.24, 0.12, -0.1); app.anchor.add(fpsPanel.mesh); }

const headPos = new THREE.Vector3(), toHead = new THREE.Vector3();

// Frame loop.
const clock = new THREE.Clock();
const stats = { frames: 0, t0: performance.now(), fps: 0 };
window.__fps = stats;
renderer.setAnimationLoop((t, frame) => {
  const dt = Math.min(0.05, clock.getDelta());
  const now = t / 1000;
  let states;
  if (frame && renderer.xr.isPresenting) {
    hands.updateXR(frame, renderer.xr.getReferenceSpace(), renderer.xr.getSession());
    states = [hands.hands.left, hands.hands.right];
    // Meta's system gesture is a pinch with the palm turned toward your face. Flag it so it never grabs.
    renderer.xr.getCamera().getWorldPosition(headPos);
    for (const h of states) {
      if (!h.present || h.kind !== 'hand') continue;
      toHead.subVectors(headPos, h.joints[0]).normalize();
      if (h.palmNormal.dot(toHead) > 0.55) { h.palmUp = true; h.palmUpAt = performance.now(); h.palmFaceSince ??= performance.now(); }
      else h.palmFaceSince = null;
    }
    if (recenterIn > 0 && --recenterIn === 0) recenter();
    if (mode === 'immersive-ar' && performance.now() / 1000 < snapUntil) snapToTable(frame, renderer.xr.getReferenceSpace());
  } else {
    mouse.update();
    states = [mouse.state];
    if (recenterIn > 0) { recenterIn = 0; app.anchor.position.set(0, 0.82, -0.32); app.anchor.rotation.set(0, 0, 0); env.followAnchor(app.anchor); }
  }
  const viewCam = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  app.update(dt, states, now, viewCam);
  env.followAnchor(app.anchor);
  env.setDusk(app.mode === 'play' ? app.board.lit || 0 : 0);
  handViz.update(states, viewCam);
  renderer.render(scene, camera);
  stats.frames++;
  const pn = performance.now();
  if (pn - stats.t0 > 1000) {
    stats.fps = (stats.frames * 1000) / (pn - stats.t0); stats.frames = 0; stats.t0 = pn;
    if (fpsPanel) fpsPanel.draw(String(Math.round(stats.fps)), (g, w, h) => {
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(0, 0, w, h);
      g.fillStyle = stats.fps >= 70 ? '#7be08f' : stats.fps >= 60 ? '#fde68a' : '#f87171';
      g.font = font(90, 800); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(Math.round(stats.fps) + ' fps', w / 2, h / 2);
    });
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

