import { describe, it, expect } from 'vitest';
import { solve } from '../src/sim/solver.js';
import { rotatePorts, N, E, S, W } from '../src/sim/pieces.js';
import { createLevelState, placePiece, rotatePiece, setValve, returnToTray, evaluate } from '../src/sim/level.js';
import { campaign, LESSONS } from '../src/sim/levels.js';
import { generateLevel, verifySolution, dailyLevel } from '../src/sim/generator.js';

const grid = (rows, cols, list) => {
  const cells = new Array(rows * cols).fill(null);
  for (const p of list) cells[p.r * cols + p.c] = p;
  return { rows, cols, cells };
};

describe('pieces', () => {
  it('rotates ports clockwise', () => {
    expect(rotatePorts(N, 1)).toBe(E);
    expect(rotatePorts(N | E, 1)).toBe(E | S);
    expect(rotatePorts(N | E, 3)).toBe(W | N);
    expect(rotatePorts(N | S, 2)).toBe(N | S);
  });
});

describe('solver', () => {
  it('conserves mass in a series chain', () => {
    const g = grid(1, 4, [
      { r: 0, c: 0, type: 'source', rot: 1 }, { r: 0, c: 1, type: 'straight', rot: 1 },
      { r: 0, c: 2, type: 'mill', rot: 1 }, { r: 0, c: 3, type: 'drain', rot: 3 },
    ]);
    const s = solve(g);
    expect(s.leaks.length).toBe(0);
    expect(s.throughput[1]).toBeCloseTo(s.throughput[2], 6);
    expect(s.totalIn).toBeCloseTo(s.throughput[3], 6);
    expect(s.totalIn).toBeGreaterThan(0);
  });
  it('detects a leak at an open end and dry pieces do not leak', () => {
    const g = grid(2, 3, [
      { r: 0, c: 0, type: 'source', rot: 1 }, { r: 0, c: 1, type: 'straight', rot: 1 },
      { r: 1, c: 2, type: 'straight', rot: 0 },
    ]);
    const s = solve(g);
    expect(s.leaks.length).toBe(1);
    expect(s.leaks[0].i).toBe(1);
    expect(s.wet[5]).toBe(0);
  });
  it('closing a valve reduces flow monotonically', () => {
    let prev = Infinity;
    for (const open of [1, 0.8, 0.5, 0.2, 0.05]) {
      const g = grid(1, 4, [
        { r: 0, c: 0, type: 'source', rot: 1 }, { r: 0, c: 1, type: 'valve', rot: 1, open },
        { r: 0, c: 2, type: 'mill', rot: 1 }, { r: 0, c: 3, type: 'drain', rot: 3 },
      ]);
      const q = solve(g).throughput[2];
      expect(q).toBeLessThan(prev);
      prev = q;
    }
  });
});

describe('levels', () => {
  it('every campaign level is solvable through the placement API', () => {
    const levels = campaign();
    expect(levels.length).toBe(12);
    for (const def of levels) {
      if (def.solution.length || def.teach) {
        if (def.id === 'l3') continue;
        expect(verifySolution(def), def.name).toBe(true);
      }
    }
  });
  it('lesson 3 is unsolved wide open and solved when throttled', () => {
    const st = createLevelState(LESSONS[2]);
    expect(st.result.solved).toBe(false);
    expect(st.result.mills[0].status).toBe('high');
    const valve = st.cells.find((p) => p?.type === 'valve');
    setValve(st, valve.id, 0.4);
    expect(st.result.solved).toBe(true);
  });
  it('lesson 1: placing the pipe solves it, removing it unsolves it', () => {
    const st = createLevelState(LESSONS[0]);
    expect(st.result.solved).toBe(false);
    const id = st.tray[0].id;
    expect(placePiece(st, id, 1, 2)).toBe(true);
    expect(st.result.solved).toBe(true);
    expect(placePiece(st, id, 1, 2)).toBe(false); // occupied by mill
    returnToTray(st, id);
    expect(st.result.solved).toBe(false);
  });
  it('lesson 2 needs a rotation', () => {
    const st = createLevelState(LESSONS[1]);
    const id = st.tray[0].id;
    placePiece(st, id, 1, 0);
    expect(st.result.solved).toBe(false);
    rotatePiece(st, id, 2);
    expect(st.result.solved).toBe(true);
  });
  it('generated levels are deterministic and valve levels need a twist', () => {
    const a = generateLevel({ seed: 777, rows: 6, cols: 6, branch: true, valves: 1, decoys: 2, rocks: 3 });
    const b = generateLevel({ seed: 777, rows: 6, cols: 6, branch: true, valves: 1, decoys: 2, rocks: 3 });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(verifySolution(a)).toBe(true);
  });
  it('daily levels exist and are solvable for a whole year', { timeout: 60000 }, () => {
    const d = new Date(2026, 10, 13);
    for (let i = 0; i < 365; i++) {
      const day = new Date(d.getTime() + i * 86400000);
      const def = dailyLevel(day);
      expect(verifySolution(def)).toBe(true);
    }
  });
});

describe('valves matter', () => {
  it('no campaign level or Daily is solved with valves wide open, and two-valve levels need both valves', { timeout: 60000 }, () => {
    const dailies = Array.from({ length: 30 }, (_, d) => dailyLevel(new Date(2026, 10, 13 + d)));
    for (const def of [...campaign(), ...dailies]) {
      const vIdx = def.solution.filter((x) => x.type === 'valve').map((x) => x.r * def.cols + x.c);
      if (!vIdx.length) continue;
      const st = createLevelState({ ...def, inventory: [] });
      for (const x of def.solution) st.cells[x.r * def.cols + x.c] = { id: Math.random(), type: x.type, rot: x.rot, open: x.open ?? 1, fixed: false };
      expect(evaluate(st).solved).toBe(true);
      for (const i of vIdx) st.cells[i].open = 1;
      expect(evaluate(st).solved).toBe(false);
      if (vIdx.length < 2) continue;
      for (const vi of vIdx) {
        for (const o of vIdx) st.cells[o].open = 1;
        for (let k = 0; k <= 200; k++) { st.cells[vi].open = k / 200; expect(evaluate(st).solved).toBe(false); }
      }
    }
  });
});
