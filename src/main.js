// Entry point: renderer, WebXR session (passthrough first, VR fallback), the frame loop and the desktop preview.
import * as THREE from 'three';
import { App } from './game/app.js';
import { Environment } from './view/env.js';
import { HandViz } from './view/handviz.js';
import { HandInput, MouseHand } from './input/hands.js';
import { Sound } from './audio/audio.js';
import { setEphemeral } from './util/store.js';
import { mountArcade } from './view/arcade.js';
import { CanvasPanel, font } from './view/ui.js';
import { desktopFraming } from './view/framing.js';
import { LOOK } from './view/looks.js';

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

// A browser that cannot draw 3D (graphics off, very old device) gets a plain explanation, not a frozen button.
let renderer;
try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); }
catch (err) {
  const enter = document.getElementById('enter');
  enter.textContent = '3D graphics are off in this browser'; enter.disabled = true;
  document.getElementById('note').textContent = 'Flowsmith needs WebGL. Open this page on a Meta Quest, or in Chrome, Edge, Firefox or Safari with hardware acceleration turned on.';
  throw err;
}
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
camera.lookAt(0, 0.91, -0.32);

const env = new Environment(scene, renderer);
let powerDiagnostic=null;
if(import.meta.env.DEV && params.has('debugpower')) {
  powerDiagnostic=document.createElement('output');powerDiagnostic.id='power-diagnostic';
  Object.assign(powerDiagnostic.style,{position:'fixed',left:'12px',bottom:'48px',zIndex:20,color:'white',background:'#000d',font:'11px monospace',padding:'7px',pointerEvents:'none'});
  document.body.appendChild(powerDiagnostic);
}
const sound = new Sound();
setEphemeral(import.meta.env.DEV && params.has('director'));
const app = new App(scene, sound);
app.anchor.scale.setScalar(1.25);
const handViz = new HandViz(scene);
const hands = new HandInput();
window.flowsmith = app; // handy for tests and scripted capture

// Desktop placement: the board sits on the table in front of the preview camera.
app.anchor.position.set(0, 0.82, -0.32);
env.followAnchor(app.anchor);
env.connectSource(app.board);
app.onEvent(e => { if(e.type==='level') env.connectSource(app.board); });
const boardPlane = new THREE.Plane();
const mouse = new MouseHand(renderer.domElement, camera, () => {
  boardPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, app.anchor.position.y + 0.02, 0));
  return boardPlane;
}, { list: () => app.mode === 'menu' ? app.menu.buttons : app.board.buttons, press: (id) => app.onButton(id) });
mountArcade(app, renderer, sound);
function frameDesktop() {
  if (renderer.xr.isPresenting) return;
  const f = desktopFraming(camera.aspect, app.mode, app.st?.rows ?? 4);
  camera.position.set(...f.position); camera.lookAt(...f.target);
  camera.zoom = f.zoom;
  camera.updateProjectionMatrix();
  document.body.classList.toggle('portrait', f.portrait > 0.5);
}
app.onEvent(frameDesktop); frameDesktop();
renderer.xr.addEventListener('sessionstart', () => { camera.zoom = 1; camera.updateProjectionMatrix(); });
renderer.xr.addEventListener('sessionend', frameDesktop);

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
  let best = null, bestD = 0.8, bestHeightDelta = Infinity;
  for (const plane of planes) {
    if (plane.orientation !== 'horizontal') continue;
    const pose = frame.getPose(plane.planeSpace, refSpace);
    if (!pose) continue;
    const p = pose.transform.position;
    if (![p.x, p.y, p.z].every(Number.isFinite) || p.y < 0.45 || p.y > 1.1) continue;
    let near = Math.hypot(p.x - app.anchor.position.x, p.z - app.anchor.position.z);
    // A reported outline is authoritative: do not lower the board onto a nearby table it is outside.
    const polygon = plane.polygon;
    const usablePolygon = polygon?.length >= 3 && polygon.every(v => Number.isFinite(v.x) && Number.isFinite(v.z));
    // Runtimes without a usable outline retain the conservative <0.8 m centre-distance fallback.
    if (usablePolygon) {
      const inv = new THREE.Matrix4().fromArray(pose.transform.inverse.matrix);
      const lp = app.anchor.position.clone().applyMatrix4(inv);
      if (!insidePolygon(lp.x, lp.z, polygon)) continue;
      near = 0;
    }
    const heightDelta = Math.abs(p.y + 0.025 - app.anchor.position.y);
    // Overlapping surfaces often share horizontal distance zero. Prefer the smallest vertical move,
    // with a deterministic height tie-break instead of depending on XRPlaneSet iteration order.
    if (near < bestD || (best != null && near === bestD &&
        (heightDelta < bestHeightDelta || (heightDelta === bestHeightDelta && p.y > best)))) {
      bestD = near; bestHeightDelta = heightDelta; best = p.y;
    }
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
// In a passthrough session the menu offers My room / Valley: Valley draws the dusk world over passthrough.
function applyWorld() { const pt = !!app.passthroughAvailable && !app.progress.settings.valley; env.setPassthrough(pt); handViz.full = !pt; }
app.onEvent((e) => { if (e.type === 'world') applyWorld(); });

// Session start.
const enterBtn = document.getElementById('enter');
const note = document.getElementById('note');
let mode = null;
// Some browsers never answer isSessionSupported (no runtime, blocked permission). Give each check
// 1.5 s, so the start button always turns into something you can press.
const supported = (m) => Promise.race([navigator.xr.isSessionSupported(m).catch(() => false), new Promise((r) => setTimeout(() => r(false), 1500))]);
async function pickMode() {
  if (!navigator.xr) return null;
  if (params.has('vr') && await supported('immersive-vr')) return 'immersive-vr';
  if (await supported('immersive-ar')) return 'immersive-ar';
  if (await supported('immersive-vr')) return 'immersive-vr';
  return null;
}
const touchFirst = matchMedia('(pointer: coarse)').matches;
pickMode().then((m) => {
  mode = m;
  enterBtn.textContent = m === 'immersive-ar' ? 'Enter (passthrough)' : m ? 'Enter VR' : touchFirst ? 'Play on this screen' : 'Play in the browser';
  enterBtn.disabled = false;
  if (!m) note.textContent = touchFirst
    ? 'No headset here, so it plays by touch: drag a pipe onto the board, tap a pipe to turn it, slide a red valve sideways to tune it.'
    : 'No headset here, so it plays with the mouse: drag a pipe onto the board, click it (or press R while holding) to turn it, drag a red valve sideways or scroll to tune it.';
});
enterBtn.addEventListener('click', async () => {
  sound.start();
  if (!mode) { document.body.classList.add('playing'); return; }
  let session, sessionEnded = false;
  const restoreDesktop = () => {
    sessionEnded = true;
    document.body.classList.remove('playing');
    app.passthroughAvailable = false;
    env.setPassthrough(false);
    handViz.full = true;
    recenterIn = -1; snapUntil = 0;
    app.anchor.position.set(0, 0.82, -0.32); app.anchor.rotation.set(0, 0, 0);
    env.followAnchor(app.anchor);
  };
  try {
    session = await navigator.xr.requestSession(mode, { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking', 'plane-detection'] });
    session.addEventListener('end', restoreDesktop);
    app.passthroughAvailable = mode === 'immersive-ar';
    applyWorld();
    if (app.mode === 'menu') app.showMenu();
    renderer.setClearColor(0x000000, 0);
    await renderer.xr.setSession(session);
    if (sessionEnded) throw new Error('Headset session ended before startup completed. Try again.');
    session.updateTargetFrameRate?.(72)?.catch?.(() => {});
    document.body.classList.add('playing');
    recenterIn = 8;
  } catch (err) {
    // requestSession may succeed before renderer attachment fails. Do not leave that session open
    // or the desktop scene in passthrough mode; a retry must start from a clean application state.
    if (session) {
      try { if (!sessionEnded) await session.end(); } catch { /* Still restore local state if the runtime already ended. */ }
      restoreDesktop();
    }
    note.textContent = 'Could not start the headset session: ' + err.message;
  }
});

// Scripted capture for the demo video (?emulate&vr&director). Exposed for the capture script to start.
if (import.meta.env.DEV && params.has('director') && window.__xrdevice) {
  const capture = document.createElement('button');
  capture.id = 'record-demo';
  capture.textContent = params.has('showcase') ? 'Record The Night Shift (scripted emulator)' : 'Record 3 lessons (scripted emulator)';
  capture.title = 'Maximum 110 seconds. Synthetic hands, not real Quest footage.';
  document.body.appendChild(capture);
  const disclosure = document.createElement('div');
  disclosure.id = 'capture-disclosure';
  disclosure.textContent = 'SCRIPTED EMULATOR • NOT QUEST HARDWARE FOOTAGE';
  document.body.appendChild(disclosure);
  const stop = document.createElement('button');
  stop.id = 'stop-demo'; stop.textContent = 'Stop & save partial'; stop.hidden = true;
  document.body.appendChild(stop);
  const download = document.createElement('a'); download.id = 'save-demo'; download.hidden = true;
  document.body.appendChild(download);
  let controller;
  download.addEventListener('click', () => { disclosure.textContent = 'Download requested: ' + download.download + '. Keep this page open until the file is verified.'; });
  stop.addEventListener('click', () => { controller?.abort(); stop.disabled = true; stop.textContent = 'Finishing recording...'; });
  capture.addEventListener('click', async () => {
    if (!renderer.xr.isPresenting) { capture.textContent = 'Enter VR first, then record'; return; }
    capture.disabled = true; stop.hidden = false; stop.disabled = false; stop.textContent = 'Stop & save partial';
    download.hidden = true; controller = new AbortController();
    capture.textContent = 'Recording ' + (params.has('showcase') ? 'The Night Shift' : '3 lessons') + ' (110-second limit)';
    try {
      const result = await window.__startDirector(true, controller);
      download.href = result.url; download.download = result.fileName;
      download.textContent = (result.complete ? 'Save completed WebM' : 'Save partial WebM') + ' (' + (result.bytes / 1048576).toFixed(2) + ' MB)';
      download.title = result.fileName;
      disclosure.textContent = result.fileName + ' - keep this page open until the saved file is verified.';
      download.hidden = false;
      capture.textContent = result.complete ? 'Recording ready to save' : 'Partial ready: ' + result.error;
    } catch (err) { capture.textContent = 'Recording failed: ' + err.message; }
    finally { capture.disabled = false; stop.hidden = true; }
  });
  window.__startDirector = async (recordIt = true, abort = new AbortController()) => {
    const { Director, record } = await import('./director.js');
    if (!(await env.assetReady)) throw new Error('Authored landmark did not load; check the local asset before recording.');
    app.showMenu();
    const d = new Director(app, window.__xrdevice, sound, abort.signal);
    window.__director = d;
    const cancel = () => { abort.abort(); d.pinchV = 0; d.hand.updatePinchValue(0); };
    const fileName = (params.has('showcase') ? 'flowsmith-night-shift-' : 'flowsmith-three-lessons-') + new Date().toISOString().replace(/[:.]/g, '-') + '.webm';
    return recordIt ? record(renderer.domElement, sound, () => d.run({ lessonsOnly: !params.has('showcase'), signatureOnly: params.has('showcase') }), fileName, { signal: abort.signal, cancel, maxDurationMs: 110000 }) : d.run({ lessonsOnly: !params.has('showcase'), signatureOnly: params.has('showcase') });
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
  LOOK.time.value += dt;
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
  if(powerDiagnostic) powerDiagnostic.textContent='V5 POWER bound='+env.powerMaterials.length+' flow='+env.currentFlow.toFixed(3)+' '+env.powerMaterials.map(m=>m.name+':#'+m.color.getHexString()+'/e'+m.emissiveIntensity.toFixed(2)).join(' ');
  handViz.update(states, viewCam);
  renderer.render(scene, camera);
  renderer.domElement.__captureFrame?.();
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
  frameDesktop();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

