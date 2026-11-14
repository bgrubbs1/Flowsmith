// Linear pipe-network solver (Kirchhoff + conductance per tile, Dirichlet heads at springs/sea).
import { DIRS, portsOf, conductanceOf } from './pieces.js';

export const SOURCE_HEAD = 10;

// grid: { rows, cols, cells: Array(rows*cols) of piece|null }
// Returns { head: Float64Array, wet: Uint8Array, edges: [{a,b,q}], leaks: [{i,dir,q}], throughput: Float64Array, totalLeak, totalIn }
export function solve(grid) {
  const { rows, cols, cells } = grid;
  const n = rows * cols;
  const idx = (r, c) => r * cols + c;
  const edges = [];
  const leaks = [];
  const adj = Array.from({ length: n }, () => []);
  const ports = new Int32Array(n);
  const g = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = cells[i];
    if (!p || p.type === 'rock') continue;
    ports[i] = portsOf(p);
    g[i] = conductanceOf(p);
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = idx(r, c);
    if (!ports[i]) continue;
    for (const d of DIRS) {
      if (!(ports[i] & d.bit)) continue;
      const rr = r + d.dr, cc = c + d.dc;
      const j = rr >= 0 && rr < rows && cc >= 0 && cc < cols ? idx(rr, cc) : -1;
      if (j >= 0 && ports[j] & d.opp) {
        if (i < j) {
          const ge = 1 / (1 / (2 * g[i]) + 1 / (2 * g[j]));
          const e = { a: i, b: j, g: ge, q: 0 };
          edges.push(e);
          adj[i].push(e); adj[j].push(e);
        }
      } else {
        leaks.push({ i, dir: d.bit, g: 2 * g[i], q: 0 });
      }
    }
  }
  // Dirichlet nodes
  const fixed = new Float64Array(n).fill(NaN);
  for (let i = 0; i < n; i++) {
    const p = cells[i];
    if (!p) continue;
    if (p.type === 'source') fixed[i] = SOURCE_HEAD;
    if (p.type === 'drain') fixed[i] = 0;
  }
  // Wet = connected (through edges) to a source.
  const wet = new Uint8Array(n);
  const stack = [];
  for (let i = 0; i < n; i++) if (cells[i]?.type === 'source') { wet[i] = 1; stack.push(i); }
  while (stack.length) {
    const i = stack.pop();
    for (const e of adj[i]) {
      const j = e.a === i ? e.b : e.a;
      if (!wet[j]) { wet[j] = 1; stack.push(j); }
    }
  }
  // Unknowns: wet, non-fixed nodes.
  const map = new Int32Array(n).fill(-1);
  let m = 0;
  for (let i = 0; i < n; i++) if (wet[i] && Number.isNaN(fixed[i])) map[i] = m++;
  const A = Array.from({ length: m }, () => new Float64Array(m));
  const bvec = new Float64Array(m);
  const leakG = new Float64Array(n);
  for (const L of leaks) if (wet[L.i]) leakG[L.i] += L.g;
  for (let i = 0; i < n; i++) {
    const k = map[i];
    if (k < 0) continue;
    A[k][k] += leakG[i]; // leak to atmosphere at head 0
    for (const e of adj[i]) {
      const j = e.a === i ? e.b : e.a;
      A[k][k] += e.g;
      if (map[j] >= 0) A[k][map[j]] -= e.g;
      else if (!Number.isNaN(fixed[j])) bvec[k] += e.g * fixed[j];
    }
  }
  // A wet component with no outlet at all is dead-headed: add a tiny tie to the source head for stability.
  for (let k = 0; k < m; k++) { A[k][k] += 1e-9; bvec[k] += 1e-9 * SOURCE_HEAD; }
  const x = gauss(A, bvec);
  const head = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    if (!wet[i]) head[i] = 0;
    else if (map[i] >= 0) head[i] = x[map[i]];
    else head[i] = fixed[i];
  }
  const throughput = new Float64Array(n);
  for (const e of edges) {
    e.q = wet[e.a] ? e.g * (head[e.a] - head[e.b]) : 0; // + means a -> b
    throughput[e.a] += Math.abs(e.q) / 2;
    throughput[e.b] += Math.abs(e.q) / 2;
  }
  let totalLeak = 0;
  for (const L of leaks) {
    L.q = wet[L.i] ? L.g * head[L.i] : 0;
    totalLeak += L.q;
    throughput[L.i] += L.q / 2;
  }
  // Sources/drains: throughput = net flow through them.
  let totalIn = 0;
  for (let i = 0; i < n; i++) {
    const t = cells[i]?.type;
    if (t === 'source' || t === 'drain') {
      let net = 0;
      for (const e of adj[i]) net += e.a === i ? e.q : -e.q;
      for (const L of leaks) if (L.i === i) net += L.q;
      throughput[i] = Math.abs(net);
      if (t === 'source') totalIn += net;
    }
  }
  return { head, wet, edges, leaks: leaks.filter((L) => wet[L.i]), throughput, totalLeak, totalIn };
}

function gauss(A, b) {
  const m = b.length;
  const M = A.map((row, i) => { const r = new Float64Array(m + 1); r.set(row); r[m] = b[i]; return r; });
  for (let col = 0; col < m; col++) {
    let piv = col;
    for (let r = col + 1; r < m; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    [M[col], M[piv]] = [M[piv], M[col]];
    const d = M[col][col];
    if (Math.abs(d) < 1e-15) continue;
    for (let r = col + 1; r < m; r++) {
      const f = M[r][col] / d;
      if (!f) continue;
      for (let c = col; c <= m; c++) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Float64Array(m);
  for (let r = m - 1; r >= 0; r--) {
    let s = M[r][m];
    for (let c = r + 1; c < m; c++) s -= M[r][c] * x[c];
    x[r] = Math.abs(M[r][r]) < 1e-15 ? 0 : s / M[r][r];
  }
  return x;
}
