// Procedural level generator. Builds a known solution first, then derives mill windows from it,
// so every generated level is solvable by construction.
import { DIRS, PLACEABLE, typeForMask, rotationFor, bitCount } from './pieces.js';
import { createLevelState, placePiece, setValve, evaluate } from './level.js';
import { mulberry32, pick, shuffle } from '../util/rng.js';

const TOL = 0.2;

function dirBetween(a, b) {
  for (const d of DIRS) if (a.r + d.dr === b.r && a.c + d.dc === b.c) return d.bit;
  return 0;
}
const key = (r, c) => r * 64 + c;

function randomPath(rng, rows, cols, start, goalTest, blocked, minLen, maxLen, budget = 4000) {
  let best = null;
  const path = [start];
  const seen = new Set([key(start.r, start.c), ...blocked]);
  let steps = 0;
  function dfs() {
    if (++steps > budget) return true;
    const cur = path[path.length - 1];
    if (path.length >= minLen && goalTest(cur)) { best = path.slice(); return true; }
    if (path.length >= maxLen) return false;
    for (const d of shuffle(rng, DIRS.slice())) {
      const n = { r: cur.r + d.dr, c: cur.c + d.dc };
      if (n.r < 0 || n.c < 0 || n.r >= rows || n.c >= cols) continue;
      const k = key(n.r, n.c);
      if (seen.has(k)) continue;
      seen.add(k); path.push(n);
      if (dfs()) return true;
      path.pop(); seen.delete(k);
    }
    return false;
  }
  dfs();
  return best;
}

export function generateLevel(opts) {
  for (let attempt = 0; attempt < 3000; attempt++) {
    const def = tryGenerate({ ...opts, seed: (opts.seed + attempt * 7919) >>> 0 });
    if (def) return def;
  }
  throw new Error('generator failed for seed ' + opts.seed);
}

function tryGenerate({ seed, rows = 5, cols = 5, branch = false, mills = 1, valves = 0, decoys = 1, rocks = 2, locked = 0, name, id, minPieces = 0, maxElbowShare = 1 }) {
  const rng = mulberry32(seed);
  const cells = new Map(); // key -> {r,c,ports}
  // Spring on the west edge, sea on the east edge.
  const sr = Math.floor(rng() * rows), dr = Math.floor(rng() * rows);
  const src = { r: sr, c: 0 }, dst = { r: dr, c: cols - 1 };
  const start = { r: sr, c: 1 };
  const main = randomPath(rng, rows, cols, start, (p) => p.r === dr && p.c === cols - 2,
    [key(src.r, src.c), key(dst.r, dst.c)], cols - 2, Math.min(rows * cols - 4, cols + rows + 3));
  if (!main) return null;
  const chain = [src, ...main, dst];
  const ports = new Map();
  const addPort = (p, bit) => ports.set(key(p.r, p.c), (ports.get(key(p.r, p.c)) || 0) | bit);
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i], b = chain[i + 1];
    addPort(a, dirBetween(a, b)); addPort(b, dirBetween(b, a));
  }
  let branchPath = null, pond = null, teeCell = null;
  if (branch) {
    const used = new Set(chain.map((p) => key(p.r, p.c)));
    const candidates = shuffle(rng, main.slice(1, -2));
    for (const t of candidates) {
      for (const d of shuffle(rng, DIRS.slice())) {
        const n = { r: t.r + d.dr, c: t.c + d.dc };
        if (n.r < 0 || n.c < 0 || n.r >= rows || n.c >= cols || used.has(key(n.r, n.c))) continue;
        const bp = randomPath(rng, rows, cols, n, () => true, [...used], 3, 5, 500);
        if (!bp || bp.length < 3) continue;
        branchPath = bp; teeCell = t; break;
      }
      if (branchPath) break;
    }
    if (!branchPath) return null;
    pond = branchPath.pop();
    addPort(teeCell, dirBetween(teeCell, branchPath[0])); addPort(branchPath[0], dirBetween(branchPath[0], teeCell));
    for (let i = 0; i < branchPath.length - 1; i++) {
      const a = branchPath[i], b = branchPath[i + 1];
      addPort(a, dirBetween(a, b)); addPort(b, dirBetween(b, a));
    }
    const last = branchPath[branchPath.length - 1];
    addPort(last, dirBetween(last, pond)); addPort(pond, dirBetween(pond, last));
  }
  const isStraight = (p) => { const m = ports.get(key(p.r, p.c)); return m === 5 || m === 10; };
  // Choose mill cells: on the main run after the tee (or anywhere), and one on the branch.
  const millCells = [];
  const teeIdx = teeCell ? main.findIndex((p) => p.r === teeCell.r && p.c === teeCell.c) : -1;
  const mainAfter = main.slice(teeIdx + 1).filter(isStraight);
  const mainAny = main.filter(isStraight);
  if (branch) {
    const bStraight = branchPath.filter(isStraight);
    if (!mainAfter.length || !bStraight.length) return null;
    millCells.push(pick(rng, mainAfter), pick(rng, bStraight));
  } else {
    const pool = shuffle(rng, mainAny.slice());
    if (pool.length < mills) return null;
    millCells.push(...pool.slice(0, mills));
  }
  const millKeys = new Set(millCells.map((p) => key(p.r, p.c)));
  // Valves on straight cells that are not mills.
  const valveCells = [];
  if (valves > 0) {
    const pools = branch
      ? [branchPath.filter(isStraight), main.slice(teeIdx + 1).filter(isStraight)]
      : [main.filter(isStraight)];
    for (let v = 0; v < valves; v++) {
      const pool = pools[v % pools.length].filter((p) => !millKeys.has(key(p.r, p.c)) && !valveCells.includes(p));
      if (!pool.length) return null;
      valveCells.push(pick(rng, pool));
    }
  }
  const valveKeys = new Set(valveCells.map((p) => key(p.r, p.c)));
  // Assemble definition.
  const fixed = [];
  const solution = [];
  const rotTo = (type, mask) => rotationFor(type, mask);
  fixed.push({ r: src.r, c: src.c, type: 'source', rot: rotTo('source', ports.get(key(src.r, src.c))) });
  fixed.push({ r: dst.r, c: dst.c, type: 'drain', rot: rotTo('drain', ports.get(key(dst.r, dst.c))) });
  if (pond) fixed.push({ r: pond.r, c: pond.c, type: 'drain', rot: rotTo('drain', ports.get(key(pond.r, pond.c))), pond: true });
  const pathCells = [...main, ...(branchPath || [])];
  for (const p of pathCells) {
    const m = ports.get(key(p.r, p.c));
    const k = key(p.r, p.c);
    if (millKeys.has(k)) { fixed.push({ r: p.r, c: p.c, type: 'mill', rot: rotTo('mill', m), lo: 0, hi: 0 }); continue; }
    if (bitCount(m) > 3 && !typeForMask(m)) return null;
    const type = valveKeys.has(k) ? 'valve' : typeForMask(m);
    if (!type) return null;
    // Valves start well throttled in the solution, so a wide-open valve is clearly off the green band.
    const open = type === 'valve' ? +(0.2 + rng() * 0.2).toFixed(3) : undefined;
    solution.push({ r: p.r, c: p.c, type, rot: rotTo(type, m), open });
  }
  if (solution.length < minPieces) return null;
  if (solution.filter((s) => s.type === 'elbow').length > maxElbowShare * solution.length) return null;
  // Lock some solution pieces in place for easier levels.
  shuffle(rng, solution);
  // Lock a share of the plain pipes (never valves) in place for easier levels.
  const plain = solution.filter((s) => s.type !== 'valve');
  const lockedPieces = plain.slice(0, Math.floor(plain.length * locked));
  for (const s of lockedPieces) { fixed.push({ ...s, locked: true }); solution.splice(solution.indexOf(s), 1); }
  // Rocks on empty cells.
  const occupied = new Set([...fixed, ...solution].map((p) => key(p.r, p.c)));
  const empties = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!occupied.has(key(r, c))) empties.push({ r, c });
  shuffle(rng, empties);
  for (const e of empties.slice(0, rocks)) fixed.push({ r: e.r, c: e.c, type: 'rock' });
  // Compute windows from the solved state.
  const draft = { id, name, rows, cols, fixed, inventory: [], par: solution.length };
  const st = createLevelState(draft);
  const solvedFlows = solveWith(st, solution);
  if (!solvedFlows) return null;
  for (const f of fixed) if (f.type === 'mill') {
    const q = solvedFlows.get(key(f.r, f.c));
    if (!(q > 0.05)) return null;
    f.lo = +(q * (1 - TOL)).toFixed(4); f.hi = +(q * (1 + TOL)).toFixed(4);
  }
  // With valves wide open the level must not already be solved (otherwise the twist is pointless).
  if (valves > 0) {
    const st2 = createLevelState({ ...draft, fixed });
    for (const s of solution) {
      const item = { id: -1 };
      const p = { id: Math.random(), type: s.type, rot: s.rot, open: 1, fixed: false };
      st2.cells[s.r * cols + s.c] = p; void item;
    }
    if (evaluate(st2).solved) return null;
    // With two valves, each one must matter: turning any single valve (the other wide open) must not solve it.
    const valveIdx = solution.filter((s) => s.type === 'valve').map((s) => s.r * cols + s.c);
    if (valveIdx.length >= 2) {
      for (const vi of valveIdx) {
        for (const o of valveIdx) st2.cells[o].open = 1;
        if (oneValveSolves(st2, vi)) return null;
      }
    }
  }
  // Inventory: solution pieces with scrambled rotations + decoys.
  const inventory = solution.map((s) => ({ type: s.type, rot: Math.floor(rng() * 4) }));
  for (let d = 0; d < decoys; d++) inventory.push({ type: pick(rng, ['straight', 'elbow', 'tee']), rot: Math.floor(rng() * 4) });
  shuffle(rng, inventory);
  const def = { id, name, rows, cols, fixed, inventory, par: solution.length, solution };
  // Final verification through the real placement API.
  if (!verifySolution(def)) return null;
  return def;
}

// Can turning valve `vi` alone (anything else as it is) solve the level? Sweeps 200 steps of travel.
// Mill flows change monotonically with one valve, so a solved stretch can only sit where some mill's
// status changes: sample every 10th step and only fill in the gaps where a status changed.
function oneValveSolves(st, vi) {
  const at = (k) => { st.cells[vi].open = k / 200; return evaluate(st); };
  let prev = at(0);
  if (prev.solved) return true;
  for (let k = 10; k <= 200; k += 10) {
    const cur = at(k);
    if (cur.solved) return true;
    const changed = cur.mills.some((m, j) => m.status !== prev.mills[j].status);
    if (changed) for (let f = k - 9; f < k; f++) if (at(f).solved) return true;
    prev = cur;
  }
  return false;
}

function solveWith(st, solution) {
  for (const s of solution) {
    st.cells[s.r * st.cols + s.c] = { id: Math.random(), type: s.type, rot: s.rot, open: s.open ?? 1, fixed: false };
  }
  const res = evaluate(st);
  if (res.leaks.length) return null;
  const m = new Map();
  for (const mm of res.mills) m.set(key(Math.floor(mm.i / st.cols), mm.i % st.cols), mm.flow);
  return m;
}

export function verifySolution(def) {
  const st = createLevelState(def);
  for (const s of def.solution) {
    const item = st.tray.find((t) => t.type === s.type);
    if (!item) return false;
    item.rot = s.rot;
    if (!placePiece(st, item.id, s.r, s.c)) return false;
    if (s.type === 'valve') setValve(st, item.id, s.open);
  }
  for (const f of def.fixed) if (f.type === 'valve' && f.solveOpen != null) setValve(st, st.cells[f.r * st.cols + f.c].id, f.solveOpen);
  return st.result.solved;
}

export function dailySeed(date = new Date()) {
  const y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
  return y * 10000 + m * 100 + d;
}

export function dailyLevel(date = new Date()) {
  const seed = dailySeed(date);
  const rng = mulberry32(seed);
  void rng;
  // Every Daily is a two-mill balancing puzzle of a decent size.
  return generateLevel({ seed, rows: 6, cols: 6, branch: true, mills: 2, valves: 2, decoys: 2, rocks: 4, locked: 0.15, minPieces: 9, maxElbowShare: 0.5, id: 'daily-' + seed, name: 'Daily Flow' });
}

export { PLACEABLE };
