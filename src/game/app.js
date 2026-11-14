// Game flow: level picker, playing a level, lesson ghosts, hints, celebration, daily puzzle and saving.
import * as THREE from 'three';
import { BoardView } from '../view/board.js';
import { MenuView } from '../view/menu.js';
import { Interaction } from './interaction.js';
import { campaign } from '../sim/levels.js';
import { dailyLevel, dailySeed } from '../sim/generator.js';
import { createLevelState, cellAt } from '../sim/level.js';
import { portsOf } from '../sim/pieces.js';
import * as store from '../util/store.js';

const BOARD_BUTTONS = [
  { id: 'reset', label: 'Reset', icon: '↺', radius: 0.017, color: 0xf2c28b },
  { id: 'hint', label: 'Hint', icon: '?', radius: 0.017, color: 0xfde68a },
  { id: 'levels', label: 'Levels', icon: '☰', radius: 0.017, color: 0xc7d2fe },
  { id: 'next', label: 'Next', icon: '▶', radius: 0.019, color: 0x86efac },
];

// How close every mill is to the centre of its window: 100% = dead centre, 0% = at the window's edge.
function accuracy(res) {
  let worst = 0;
  for (const m of res.mills) {
    const c = (m.lo + m.hi) / 2, half = (m.hi - m.lo) / 2;
    worst = Math.max(worst, Math.abs(m.flow - c) / half);
  }
  return Math.max(0, Math.round(100 * (1 - worst)));
}
const PRECISE = 50; // accuracy needed for the precision star (needle within ±10% of the centre line)

export class App {
  constructor(scene, sound) {
    this.scene = scene;
    this.sound = sound;
    this.anchor = new THREE.Group();
    this.anchor.name = 'anchor';
    scene.add(this.anchor);
    this.board = new BoardView(this.anchor);
    this.menu = new MenuView(this.anchor);
    const fx = {
      pick: () => sound.pick(), drop: () => sound.drop(), back: () => sound.back(), rotate: () => sound.rotate(),
      tick: (o) => sound.tick(o), press: () => sound.press(), grab: () => sound.grab(),
    };
    this.ixBoard = new Interaction(this.board, fx, this.anchor);
    this.ixMenu = new Interaction(this.menu, fx, this.anchor);
    this.ixBoard.on('button', (id) => this.onButton(id));
    this.ixMenu.on('button', (id) => this.onButton(id));
    this.ixBoard.on('change', () => this.onChange());
    this.progress = store.load();
    this.applySettings();
    this.levels = campaign();
    this.sparks = new Sparks(this.anchor);
    this.mode = 'menu';
    this.time = 0;
    this.listeners = [];
    // First run goes straight into the first lesson: no menu to read before the first pinch.
    if (Object.keys(this.progress.stars).length === 0) this.startLevel(0);
    else this.showMenu();
  }

  onEvent(fn) { this.listeners.push(fn); }
  emit(e) { for (const f of this.listeners) f(e); }

  applySettings() {
    const s = this.progress.settings;
    this.ixBoard.assist = this.ixMenu.assist = s.assist;
    this.sound.setEnabled(s.sound);
  }

  dailyState() {
    const seed = dailySeed();
    return { seed, done: this.progress.daily.solvedSeeds.includes(seed), streak: this.progress.daily.streak };
  }

  showMenu() {
    this.mode = 'menu';
    this.board.root.visible = false;
    this.menu.root.visible = true;
    this.menu.build(this.levels, this.progress, this.dailyState());
    this.ixMenu.reset();
    this.emit({ type: 'menu' });
  }

  // Index into the campaign, or 'daily'.
  startLevel(which) {
    const def = which === 'daily' ? dailyLevel() : this.levels[which];
    if (!def) return this.showMenu();
    this.levelIndex = which;
    this.def = def;
    this.st = createLevelState(def);
    this.mode = 'play';
    this.solved = false;
    this.solvedHold = 0;
    this.hintShown = 0;
    this.hintText = null;
    this.flashCell = null;
    this.elapsed = 0;
    this.lessonStep = def.teach || null;
    this.menu.root.visible = false;
    this.board.root.visible = true;
    this.board.build(this.st, BOARD_BUTTONS);
    this.ixBoard.reset();
    this.nextBtn = this.board.buttons.find((b) => b.id === 'next');
    this.nextBtn.setEnabled(false);
    this.showLessonGhost();
    this.lastStatus = '';
    this.refreshHud();
    this.emit({ type: 'level', id: def.id });
  }

  onButton(id) {
    if (id.startsWith('level:')) return this.startLevel(+id.slice(6));
    switch (id) {
      case 'daily': return this.startLevel('daily');
      case 'assist': this.progress.settings.assist = !this.progress.settings.assist; this.applySettings(); store.save(this.progress); return this.showMenu();
      case 'sound': this.progress.settings.sound = !this.progress.settings.sound; this.applySettings(); store.save(this.progress); return this.showMenu();
      case 'recenter': this.emit({ type: 'recenter' }); return;
      case 'levels': return this.showMenu();
      case 'reset': return this.startLevel(this.levelIndex);
      case 'hint': return this.showHint();
      case 'next': {
        if (this.levelIndex === 'daily') return this.showMenu();
        const n = this.levelIndex + 1;
        return n < this.levels.length ? this.startLevel(n) : this.showMenu();
      }
    }
  }

  onChange() {
    if (this.mode !== 'play') return;
    // Lessons: drop the ghost once the taught action has happened.
    if (this.lessonStep === 'place' && this.st.result.placed > 0) this.clearLesson();
    if (this.lessonStep === 'rotate' && this.st.result.placed > 0 && this.solutionCellOk(this.def.solution[0])) this.clearLesson();
    if (this.lessonStep === 'valve') {
      const v = this.st.cells.find((p) => p?.type === 'valve');
      if (v && v.open < 0.9) this.clearLesson();
    }
    this.refreshHud();
  }

  clearLesson() { this.lessonStep = null; this.board.setGhost(null); }

  showLessonGhost() {
    const def = this.def, st = this.st;
    if (!this.lessonStep) return this.board.setGhost(null);
    if (this.lessonStep === 'valve') {
      const i = st.cells.findIndex((p) => p?.type === 'valve');
      const c = this.board.cellCenter(Math.floor(i / st.cols), i % st.cols);
      this.board.setGhost('valve', c, c, 'valve');
      this.board.ghost.group.rotation.y = -st.cells[i].rot * Math.PI / 2;
      return;
    }
    const s = def.solution[0];
    const from = this.board.traySlot(0, st.tray.length);
    const to = this.board.cellCenter(s.r, s.c);
    this.board.setGhost(s.type, from, to, this.lessonStep === 'rotate' ? 'rotate' : 'place');
    if (this.lessonStep !== 'rotate') this.board.ghost.group.rotation.y = -s.rot * Math.PI / 2;
    else this.board.ghost.baseRot = -st.tray[0].rot * Math.PI / 2;
  }

  solutionCellOk(s) {
    const p = cellAt(this.st, s.r, s.c);
    if (!p || p.type !== s.type) return false;
    return portsOf(p) === portsOf({ type: s.type, rot: s.rot });
  }

  showHint() {
    const st = this.st, def = this.def;
    this.lessonStep = null;
    // First a wrong piece on the board, then the next missing solution piece, then valve settings.
    const wanted = new Map(def.solution.map((s) => [s.r * st.cols + s.c, s]));
    const res = st.result;
    const leakCells = new Set(res.leaks.map((L) => L.i));
    for (let i = 0; i < st.cells.length; i++) {
      const p = st.cells[i];
      if (!p || p.fixed) continue;
      const s = wanted.get(i);
      // Only flag pieces that are dry or leaking: other layouts that carry water are allowed.
      if (res.sol.wet[i] && !leakCells.has(i)) continue;
      if (!s || !this.solutionCellOk(s)) {
        const c = this.board.cellCenter(Math.floor(i / st.cols), i % st.cols);
        this.board.setGhost(null);
        this.hintText = s && s.type === p.type ? 'Turn the highlighted piece.' : 'That piece is in the way. Lift it back to the tray.';
        this.flashCell = { pos: c, t: 2.5 };
        this.hintShown++;
        return this.refreshHud(true);
      }
    }
    const missing = def.solution.find((s) => !this.solutionCellOk(s) && cellAt(st, s.r, s.c) === null);
    if (missing) {
      const k = Math.max(0, st.tray.findIndex((t) => t.type === missing.type));
      const from = this.board.traySlot(k, st.tray.length);
      this.board.setGhost(missing.type, from, this.board.cellCenter(missing.r, missing.c), 'place');
      this.board.ghost.group.rotation.y = -missing.rot * Math.PI / 2;
      this.hintText = `A ${missing.type} goes where the ghost lands.`;
      this.hintShown++;
      return this.refreshHud(true);
    }
    const vs = [...def.solution.filter((s) => s.type === 'valve'), ...def.fixed.filter((f) => f.type === 'valve' && f.solveOpen != null).map((f) => ({ ...f, open: f.solveOpen }))];
    if (vs.length) {
      const m = this.st.result.mills.find((x) => x.status !== 'ok');
      this.hintText = m ? (m.status === 'high' ? 'A mill spins too fast: close a valve a little (twist it right).' : 'A mill is too slow: open a valve (twist it left), or close the other branch.') : 'Nearly there: check for leaks at open pipe ends.';
    } else this.hintText = 'Every open pipe end leaks. Cap the network so water only exits at the sea.';
    this.hintShown++;
    this.refreshHud(true);
  }

  statusLine() {
    const r = this.st.result;
    if (this.solved) return { title: 'Flowing!', body: 'Every mill is in the green and nothing leaks. Press Next.' };
    if (r.leaks.length) return { body: `${r.leaks.length === 1 ? 'A pipe end is' : r.leaks.length + ' pipe ends are'} leaking (red rings). Water must only reach the sea.` };
    const low = r.mills.filter((m) => m.status === 'low').length, high = r.mills.filter((m) => m.status === 'high').length;
    if (!r.sol.wet.some((w, i) => w && this.st.cells[i]?.type === 'mill')) return { body: this.def.hint || 'Connect the spring to the mills, then on to the sea.' };
    const valve = this.st.cells.some((p) => p?.type === 'valve');
    const valveInTray = this.st.tray.some((p) => p.type === 'valve');
    if ((r.mills.some((m) => m.status !== 'ok')) && !valve && valveInTray) return { body: 'The flow needs taming. Place the red valve from the tray on the pipe, then twist it.' };
    if (high) return { body: `${high === 1 ? 'A mill spins' : high + ' mills spin'} too fast. ` + (valve ? 'Pinch a red valve wheel and twist right to close it a little.' : 'Give the water a longer road, or split it.') };
    if (low) return { body: `${low === 1 ? 'A mill turns' : low + ' mills turn'} too slowly. ` + (valve ? 'Twist its valve left to open it, or close the other branch.' : 'Give it a shorter road.') };
    return { body: 'Hold steady…' };
  }

  refreshHud(force) {
    if (this.mode !== 'play') return;
    const st = this.st;
    const s = this.statusLine();
    const isLesson = !!this.def.teach;
    const body = this.hintText && !this.solved ? this.hintText : (isLesson && !this.solved && st.result.placed === 0 && this.lessonStep ? this.def.hint : s.body);
    const name = this.levelIndex === 'daily' ? `Daily Flow · ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : `${this.levelIndex + 1}. ${this.def.name}`;
    const acc = accuracy(st.result);
    const stars = this.solved ? '★'.repeat(this.solvedStars) + '☆'.repeat(3 - this.solvedStars) : (st.result.mills.some((m) => m.flow > 0.02) ? `${st.result.mills.filter((m) => m.status === 'ok').length}/${st.result.mills.length} mills green` : '');
    const footer = this.solved
      ? (this.levelIndex === 'daily' ? `Daily: ${st.result.placed} pieces · ${Math.round(this.elapsed)} s · flow ${acc}% · streak ${this.progress.daily?.streak ?? 1}`
        : `★ solved   ${this.hintShown ? '☆' : '★'} no hints   ${acc >= PRECISE ? '★' : '☆'} dead-on flow ${acc}%` + (acc < PRECISE ? '  (twist toward the centre line)' : ''))
      : 'Pinch to pick up · twist to turn · quick pinch to rotate';
    const key = [name, stars, body, footer, this.solved].join('|');
    if (!force && key === this.lastStatus) return;
    this.lastStatus = key;
    this.board.setHud(key, { title: s.title || name, right: stars, rightColor: this.solved ? '#1f8a4c' : '#b06a3b', body, footer });
  }

  starsNow() { return 1 + (this.hintShown ? 0 : 1) + (accuracy(this.st.result) >= PRECISE ? 1 : 0); }
  saveStars() {
    const id = this.def.id;
    if (this.levelIndex === 'daily') store.recordDaily(this.progress, dailySeed());
    else this.progress.stars[id] = Math.max(this.progress.stars[id] || 0, this.solvedStars);
    store.save(this.progress);
  }
  win() {
    this.solved = true;
    this.st.lit = true;
    this.solvedStars = this.starsNow();
    const id = this.def.id;
    this.saveStars();
    this.nextBtn.setEnabled(true);
    this.nextBtn.highlight = true;
    this.board.setGhost(null);
    this.hintText = null;
    this.sound.solved();
    // Sparks from every mill.
    for (const m of this.st.result.mills) {
      const c = this.board.cellCenter(Math.floor(m.i / this.st.cols), m.i % this.st.cols);
      this.sparks.burst(this.board.root.localToWorld(c.clone().setY(0.05)), this.anchor);
    }
    this.refreshHud(true);
    this.emit({ type: 'solved', id, stars: this.solvedStars });
  }

  busy(hands) { return hands.some((h) => h.ix && h.ix.mode !== 'idle'); }

  update(dt, hands, now, camera) {
    this.time += dt;
    if (this.mode === 'menu') {
      this.ixMenu.update(dt, hands, now);
      this.menu.update(dt);
    } else {
      this.ixBoard.update(dt, hands, now);
      const r = this.st.result;
      // Mill chime when a mill enters its window.
      const okNow = r.mills.filter((m) => m.status === 'ok').length;
      if (okNow > (this.prevOk ?? okNow)) this.sound.millOk();
      this.prevOk = okNow;
      if (!this.solved) {
        this.elapsed += dt;
        this.solvedHold = r.solved && !this.busy(hands) ? this.solvedHold + dt : 0;
        if (this.solvedHold > 0.35) this.win();
      } else {
        // Keep tuning after the win: landing every needle on its centre line earns the third star.
        this.st.lit = r.solved;
        if (r.solved && !this.busy(hands)) {
          const s = this.starsNow();
          if (s > this.solvedStars) { this.solvedStars = s; this.saveStars(); this.sound.solved(); this.refreshHud(true); this.emit({ type: 'stars', stars: s }); }
        }
      }
      if (this.flashCell) {
        this.flashCell.t -= dt;
        const hl = this.board.highlight;
        hl.visible = Math.sin(this.time * 12) > 0;
        hl.position.copy(this.flashCell.pos).setY(0.01);
        hl.scale.setScalar(1.3);
        if (this.flashCell.t <= 0) this.flashCell = null;
      }
      this.board.update(dt, camera);
      const total = r.sol.totalIn || 0;
      const millFlow = r.mills.reduce((a, m) => a + m.flow, 0);
      this.sound.ambient(total, millFlow, r.mills.some((m) => m.status === 'high'));
      this.refreshHud();
    }
    this.sparks.update(dt);
  }
}

// A short, cheap celebration burst.
class Sparks {
  constructor(parent) {
    this.max = 240;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(this.max * 3);
    this.vel = new Float32Array(this.max * 3);
    this.life = new Float32Array(this.max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffd36b, size: 0.006, transparent: true, depthWrite: false }));
    this.points.frustumCulled = false;
    parent.parent.add(this.points);
    this.n = 0;
  }
  burst(p) {
    for (let k = 0; k < 60; k++) {
      const i = this.n++ % this.max;
      this.pos.set([p.x, p.y, p.z], i * 3);
      const a = Math.random() * Math.PI * 2, s = 0.15 + Math.random() * 0.35;
      this.vel.set([Math.cos(a) * s * 0.5, 0.4 + Math.random() * 0.6, Math.sin(a) * s * 0.5], i * 3);
      this.life[i] = 1.2 + Math.random() * 0.6;
    }
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -100; continue; }
      any = true;
      this.life[i] -= dt;
      this.vel[i * 3 + 1] -= 1.6 * dt;
      for (let a = 0; a < 3; a++) this.pos[i * 3 + a] += this.vel[i * 3 + a] * dt;
    }
    this.points.visible = any;
    this.points.geometry.attributes.position.needsUpdate = true;
  }
}
