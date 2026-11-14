// Level state: board cells, the tray of pieces, placement rules and the win check.
import { PIECES, portsOf } from './pieces.js';
import { solve } from './solver.js';

export const LEAK_EPS = 0.02;

let nextId = 1;
const newId = () => nextId++;

export function createLevelState(def) {
  const { rows, cols } = def;
  const cells = new Array(rows * cols).fill(null);
  for (const f of def.fixed) {
    cells[f.r * cols + f.c] = {
      id: newId(), type: f.type, rot: f.rot || 0, fixed: true,
      open: f.open ?? 1, lo: f.lo, hi: f.hi, adjustable: f.type === 'valve',
    };
  }
  const tray = def.inventory.map((it) => ({ id: newId(), type: it.type, rot: it.rot || 0, open: it.open ?? 1, fixed: false }));
  const st = {
    def, rows, cols, cells, tray, moves: 0,
    idx: (r, c) => r * cols + c,
  };
  st.result = evaluate(st);
  return st;
}

export function cellAt(st, r, c) {
  if (r < 0 || c < 0 || r >= st.rows || c >= st.cols) return undefined;
  return st.cells[r * st.cols + c];
}

export function findPiece(st, id) {
  for (let i = 0; i < st.cells.length; i++) if (st.cells[i]?.id === id) return { where: 'board', i, piece: st.cells[i] };
  const t = st.tray.findIndex((p) => p.id === id);
  if (t >= 0) return { where: 'tray', i: t, piece: st.tray[t] };
  return null;
}

// Move a piece (from tray or board) onto an empty cell. Returns true on success.
export function placePiece(st, id, r, c) {
  const at = cellAt(st, r, c);
  if (at === undefined || at !== null) return false;
  const f = findPiece(st, id);
  if (!f || f.piece.fixed) return false;
  if (f.where === 'tray') st.tray.splice(f.i, 1);
  else st.cells[f.i] = null;
  st.cells[r * st.cols + c] = f.piece;
  st.moves++;
  st.result = evaluate(st);
  return true;
}

export function returnToTray(st, id) {
  const f = findPiece(st, id);
  if (!f || f.piece.fixed || f.where === 'tray') return false;
  st.cells[f.i] = null;
  st.tray.push(f.piece);
  st.moves++;
  st.result = evaluate(st);
  return true;
}

export function rotatePiece(st, id, k = 1) {
  const f = findPiece(st, id);
  if (!f || f.piece.fixed) return false;
  f.piece.rot = (((f.piece.rot + k) % 4) + 4) % 4;
  if (f.where === 'board') { st.moves++; st.result = evaluate(st); }
  return true;
}

export function setValve(st, id, open) {
  const f = findPiece(st, id);
  if (!f || f.piece.type !== 'valve') return false;
  f.piece.open = Math.min(1, Math.max(0, open));
  if (f.where === 'board') st.result = evaluate(st);
  return true;
}

export function evaluate(st) {
  const sol = solve(st);
  const mills = [];
  for (let i = 0; i < st.cells.length; i++) {
    const p = st.cells[i];
    if (p?.type !== 'mill') continue;
    const flow = sol.throughput[i];
    const status = flow < p.lo ? 'low' : flow > p.hi ? 'high' : 'ok';
    mills.push({ i, flow, lo: p.lo, hi: p.hi, status, frac: millFrac(flow, p.lo, p.hi) });
  }
  const leaks = sol.leaks.filter((L) => L.q > LEAK_EPS);
  const placed = st.cells.filter((p) => p && !p.fixed).length;
  const solved = mills.length > 0 && mills.every((m) => m.status === 'ok') && leaks.length === 0;
  return { sol, mills, leaks, placed, solved };
}

// Map a flow onto a 0..1 gauge where the green window sits at 0.4..0.6.
export function millFrac(flow, lo, hi) {
  if (flow <= lo) return 0.4 * (flow / lo);
  if (flow <= hi) return 0.4 + 0.2 * ((flow - lo) / (hi - lo));
  return Math.min(1, 0.6 + 0.4 * ((flow - hi) / hi));
}

export function starsFor(st) {
  const par = st.def.par ?? 99;
  const placed = st.result.placed;
  return placed <= par ? 3 : placed <= par + 2 ? 2 : 1;
}

export function portsAt(st, i) {
  const p = st.cells[i];
  return p ? portsOf(p) : 0;
}

export function isPlaceable(type) { return !PIECES[type].fixedOnly; }
