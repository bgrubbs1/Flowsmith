// Piece definitions, ports and rotation. Ports: N=1 (far), E=2, S=4 (near), W=8.
export const N = 1, E = 2, S = 4, W = 8;
export const DIRS = [
  { bit: N, dr: -1, dc: 0, opp: S },
  { bit: E, dr: 0, dc: 1, opp: W },
  { bit: S, dr: 1, dc: 0, opp: N },
  { bit: W, dr: 0, dc: -1, opp: E },
];

// Base ports at rotation 0 and hydraulic conductance (1 = one tile of plain pipe).
export const PIECES = {
  straight: { ports: N | S, g: 1, label: 'Pipe' },
  elbow: { ports: N | E, g: 1, label: 'Elbow' },
  tee: { ports: N | E | S, g: 1, label: 'Tee' },
  cross: { ports: N | E | S | W, g: 1, label: 'Cross' },
  valve: { ports: N | S, g: 1, label: 'Valve', adjustable: true },
  mill: { ports: N | S, g: 0.5, label: 'Mill', fixedOnly: true },
  source: { ports: N, g: 1, label: 'Spring', fixedOnly: true },
  drain: { ports: N, g: 1, label: 'Sea', fixedOnly: true },
  rock: { ports: 0, g: 0, label: 'Rock', fixedOnly: true },
};

export const PLACEABLE = ['straight', 'elbow', 'tee', 'cross', 'valve'];

// Rotate a port mask clockwise (seen from above) by k quarter turns.
export function rotatePorts(mask, k) {
  k = ((k % 4) + 4) % 4;
  let m = mask;
  for (let i = 0; i < k; i++) {
    let r = 0;
    if (m & N) r |= E;
    if (m & E) r |= S;
    if (m & S) r |= W;
    if (m & W) r |= N;
    m = r;
  }
  return m;
}

export function portsOf(piece) {
  return rotatePorts(PIECES[piece.type].ports, piece.rot || 0);
}

// Conductance of a piece; valves scale with opening (0..1), never exactly zero.
export function conductanceOf(piece) {
  const def = PIECES[piece.type];
  if (def.adjustable) {
    const o = Math.min(1, Math.max(0, piece.open ?? 1));
    return Math.max(1e-6, Math.pow(o, 1.5));
  }
  return def.g;
}

// Smallest rotation (0..3) that turns base ports of `type` into `mask`, or -1.
export function rotationFor(type, mask) {
  for (let k = 0; k < 4; k++) if (rotatePorts(PIECES[type].ports, k) === mask) return k;
  return -1;
}

// Which placeable piece type produces exactly this port mask.
export function typeForMask(mask) {
  for (const t of ['straight', 'elbow', 'tee', 'cross']) if (rotationFor(t, mask) >= 0) return t;
  return null;
}

export function bitCount(m) {
  let c = 0;
  while (m) { c += m & 1; m >>= 1; }
  return c;
}
