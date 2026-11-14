import './stub-dom.js';
import { it, expect } from 'vitest';
import * as THREE from 'three';
import { App } from '../src/game/app.js';
import { placePiece, setValve } from '../src/sim/level.js';
// Frame-time guardrail for Quest: the puzzle scene (board, pieces, water, HUD) must stay inside a fixed
// draw-call and triangle budget on every level, solved, so new art cannot quietly push it under 72 Hz.
const BUDGET = { draws: 200, tris: 32000 }; // measured: v1.0 189 draws / 20k tris, v1.1 189 draws / 24.5k tris
const quiet = new Proxy({}, { get: () => () => {} });
function cost(root) {
  let draws = 0, tris = 0;
  root.traverseVisible((o) => {
    if (!o.isMesh && !o.isSprite) return;
    const n = o.isInstancedMesh ? o.count : 1; if (!n) return;
    const g = o.geometry; const t = o.isSprite ? 2 : (g.index ? g.index.count : g.attributes.position.count) / 3;
    draws++; tris += t * n;
  });
  return { draws, tris: Math.round(tris) };
}
function solve(app) {
  const st = app.st, def = app.def;
  for (const s of def.solution || []) {
    const item = st.tray.find((p) => p.type === s.type); if (!item) continue;
    item.rot = s.rot; placePiece(st, item.id, s.r, s.c); if (s.type === 'valve') setValve(st, item.id, s.open);
  }
  for (const f of def.fixed || []) if (f.type === 'valve' && f.solveOpen != null) setValve(st, st.cells[f.r * st.cols + f.c].id, f.solveOpen);
  app.board.sync(); app.onChange();
}
it('every level, solved, stays inside the Quest draw-call and triangle budget', () => {
  localStorage.removeItem('flowsmith.v1');
  const scene = new THREE.Scene(), app = new App(scene, quiet);
  const cam = new THREE.PerspectiveCamera(55, 1, 0.01, 50); cam.position.set(0, 1.22, 0.32);
  const worst = { draws: 0, tris: 0 };
  for (const which of [...app.levels.keys(), 'daily']) {
    app.startLevel(which); solve(app);
    for (let i = 0; i < 90; i++) app.update(1 / 60, [], i / 60, cam);
    const c = cost(scene); worst.draws = Math.max(worst.draws, c.draws); worst.tris = Math.max(worst.tris, c.tris);
  }
  console.log('worst puzzle scene', worst);
  expect(worst.draws).toBeLessThanOrEqual(BUDGET.draws);
  expect(worst.tris).toBeLessThanOrEqual(BUDGET.tris);
});
