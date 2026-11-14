// Campaign: three hand-authored lessons, then generated puzzles with fixed seeds.
import { generateLevel, verifySolution } from './generator.js';
import { createLevelState, evaluate } from './level.js';

const TOL = 0.2;

// Fill mill windows from the authored solution.
function authored(def) {
  const st = createLevelState({ ...def, inventory: [] });
  for (const s of def.solution) st.cells[s.r * def.cols + s.c] = { id: Math.random(), type: s.type, rot: s.rot, open: s.open ?? 1, fixed: false };
  for (const f of def.fixed) if (f.type === 'valve' && f.solveOpen != null) st.cells[f.r * def.cols + f.c].open = f.solveOpen;
  const res = evaluate(st);
  for (const m of res.mills) {
    const f = def.fixed.find((x) => x.r * def.cols + x.c === m.i);
    f.lo = +(m.flow * (1 - TOL)).toFixed(4); f.hi = +(m.flow * (1 + TOL)).toFixed(4);
  }
  return def;
}

const E = 1, S = 2, W = 3; // rotations of a single-port piece (base port N)

export const LESSONS = [
  authored({
    id: 'l1', name: 'First Light', rows: 3, cols: 5, par: 1,
    hint: 'Water is escaping from the open pipe. Pinch the pipe in the tray and drop it in the gap to reach the mill.',
    teach: 'place',
    fixed: [
      { r: 1, c: 0, type: 'source', rot: E },
      { r: 1, c: 1, type: 'straight', rot: 1, locked: true },
      { r: 1, c: 3, type: 'mill', rot: 1 },
      { r: 1, c: 4, type: 'drain', rot: W },
      { r: 0, c: 3, type: 'rock' }, { r: 2, c: 1, type: 'rock' },
    ],
    inventory: [{ type: 'straight', rot: 1 }],
    solution: [{ r: 1, c: 2, type: 'straight', rot: 1 }],
  }),
  authored({
    id: 'l2', name: 'The Bend', rows: 3, cols: 4, par: 1,
    hint: 'Twist your wrist while holding a piece to turn it. A quick pinch on a placed piece turns it too.',
    teach: 'rotate',
    fixed: [
      { r: 0, c: 0, type: 'source', rot: S },
      { r: 1, c: 1, type: 'mill', rot: 1 },
      { r: 1, c: 2, type: 'straight', rot: 1, locked: true },
      { r: 1, c: 3, type: 'drain', rot: W },
      { r: 2, c: 2, type: 'rock' }, { r: 0, c: 3, type: 'rock' },
    ],
    inventory: [{ type: 'elbow', rot: 2 }],
    solution: [{ r: 1, c: 0, type: 'elbow', rot: 0 }],
  }),
  authored({
    id: 'l3', name: 'Easy Does It', rows: 3, cols: 4, par: 0,
    hint: 'Too much water spins the mill too fast. Pinch the valve wheel and twist to ease it into the green.',
    teach: 'valve',
    fixed: [
      { r: 1, c: 0, type: 'source', rot: E },
      { r: 1, c: 1, type: 'valve', rot: 1, open: 1, solveOpen: 0.4 },
      { r: 1, c: 2, type: 'mill', rot: 1 },
      { r: 1, c: 3, type: 'drain', rot: W },
      { r: 0, c: 2, type: 'rock' }, { r: 2, c: 0, type: 'rock' },
    ],
    inventory: [],
    solution: [],
  }),
];


// Authored progression: gestures, reconnecting a short line, then coupled supply.
export const RECONNECT = authored({
  id:'authored-reconnect',name:'Reconnect',rows:3,cols:5,par:3,
  hint:'Reconnect the broken line, then steady the mill with the valve.',
  fixed:[{r:0,c:0,type:'source',rot:2},{r:1,c:3,type:'mill',rot:1},{r:1,c:4,type:'drain',rot:3},{r:0,c:2,type:'rock'},{r:2,c:1,type:'rock'}],
  inventory:[{type:'elbow',rot:2},{type:'straight',rot:0},{type:'valve',rot:0}],
  solution:[{r:1,c:0,type:'elbow',rot:0},{r:1,c:1,type:'straight',rot:1},{r:1,c:2,type:'valve',rot:1,open:.4}],
});
export const NIGHT_SHIFT = authored({
  id:'authored-night-shift',name:'The Night Shift',rows:5,cols:6,par:4,
  hint:'One intake. Two mills. Reconnect the split, then keep both mills steady without spills. Tuning one branch changes the other.',
  fixed:[{r:4,c:0,type:'source',rot:1},{r:3,c:2,type:'straight',rot:0,locked:true},{r:1,c:2,type:'straight',rot:0,locked:true},
    {r:2,c:3,type:'valve',rot:1,open:1,solveOpen:.25},{r:0,c:3,type:'valve',rot:1,open:1,solveOpen:.4},
    {r:0,c:4,type:'mill',rot:1},{r:0,c:5,type:'drain',rot:3},{r:2,c:4,type:'mill',rot:1},{r:2,c:5,type:'drain',rot:3},
    {r:0,c:1,type:'rock'},{r:2,c:1,type:'rock'},{r:1,c:4,type:'rock'},{r:3,c:4,type:'rock'}],
  inventory:[{type:'straight',rot:0},{type:'tee',rot:1},{type:'elbow',rot:2},{type:'elbow',rot:2}],
  solution:[{r:4,c:1,type:'straight',rot:1},{r:4,c:2,type:'elbow',rot:3},{r:2,c:2,type:'tee',rot:0},{r:0,c:2,type:'elbow',rot:1}],
});

// Every generated level has a valve in series with each mill, so the puzzle is balancing flow, not guessing pipe length.
const CAMPAIGN_SPECS = [
  { name: 'Long Way Round', rows: 5, cols: 5, mills: 1, valves: 1, decoys: 1, rocks: 4, locked: 0.4, seed: 5202 },
  { name: 'Fork in the River', rows: 4, cols: 5, branch: true, valves: 2, decoys: 0, rocks: 2, locked: 0.5, seed: 4101 },
  { name: 'Stone Garden', rows: 5, cols: 5, mills: 1, valves: 1, decoys: 2, rocks: 6, locked: 0.25, seed: 8505 },
  { name: 'Share the Water', rows: 5, cols: 5, branch: true, valves: 2, decoys: 1, rocks: 3, locked: 0.35, seed: 7404 },
  { name: 'Two Mills', rows: 5, cols: 6, branch: true, valves: 2, decoys: 1, rocks: 4, locked: 0.25, seed: 6303 },
  { name: 'Mill Race', rows: 6, cols: 6, branch: true, valves: 2, decoys: 2, rocks: 4, locked: 0.2, seed: 9606 },
  { name: 'Balancing Act', rows: 6, cols: 6, branch: true, valves: 2, decoys: 2, rocks: 4, locked: 0.12, seed: 10707 },
  { name: 'Valley Grid', rows: 6, cols: 6, branch: true, valves: 2, decoys: 2, rocks: 5, locked: 0.05, seed: 11808 },
  { name: 'Watershed', rows: 6, cols: 6, branch: true, valves: 2, decoys: 3, rocks: 3, locked: 0, seed: 12909 },
];

let cache = null;
export function campaign() {
  if (cache) return cache;
  cache = [
    ...LESSONS,
    RECONNECT, NIGHT_SHIFT,
    ...CAMPAIGN_SPECS.slice(2).map((s, i) => generateLevel({ ...s, id: 'c' + (i + 3) })),
  ];
  return cache;
}

export { verifySolution };
