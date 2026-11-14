// Turns hand states into game actions: pick, carry, twist-to-rotate, drop, tap-to-rotate, valve twist, poke buttons, move board.
import * as THREE from 'three';
import { twistDelta, QuarterTurner, isTap } from '../input/gestures.js';
import { placePiece, returnToTray, rotatePiece, setValve, cellAt, findPiece } from '../sim/level.js';
import { T, PIPE_Y } from '../view/materials.js';

export const VALVE_RANGE = Math.PI * 0.6; // 108° of wrist twist from fully open to closed, 1:1 with the wheel (keeps the palm away from the face)
const GRACE = 0.3; // seconds a held piece survives a tracking dropout
const DROP_LAG = 0.08; // drop where the pinch was this long before release (release jitter)
const WHEEL_Y = PIPE_Y + 0.027;

export class Interaction {
  constructor(board, fx = {}, moveTarget = null) {
    this.board = board;
    this.moveTarget = moveTarget;
    this.fx = fx;
    this.assist = false;
    this.v = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.listeners = { button: [], change: [] };
  }
  on(evt, fn) { this.listeners[evt].push(fn); }
  emit(evt, ...a) { for (const f of this.listeners[evt]) f(...a); }

  get st() { return this.board.st; }
  get grabR() { return this.assist ? 0.05 : 0.034; }

  reset() {
    if (this.board.objects) for (const o of this.board.objects.values()) o.held = false;
    for (const h of this.handsCache || []) if (h.ix) h.ix.mode = 'idle';
  }

  candidates(pL) {
    const st = this.st, out = [];
    const R = this.grabR;
    if (st) {
    // Valve wheels (any valve on the board, fixed or not).
    for (let i = 0; i < st.cells.length; i++) {
      const p = st.cells[i];
      if (p?.type !== 'valve') continue;
      const c = this.board.cellCenter(Math.floor(i / st.cols), i % st.cols, this.v2);
      const d = Math.hypot(pL.x - c.x, (pL.y - WHEEL_Y) * 0.8, pL.z - c.z);
      if (d < R) out.push({ kind: 'valve', id: p.id, d: d * 0.85, pos: new THREE.Vector3(c.x, WHEEL_Y, c.z) });
    }
    // Movable pieces on the board.
    const cell = this.board.cellFromLocal(pL);
    if (cell.inside && pL.y < 0.08 && pL.y > -0.02) {
      const p = cellAt(st, cell.r, cell.c);
      if (p && !p.fixed && cell.dist < T * 0.55) {
        const c = this.board.cellCenter(cell.r, cell.c, this.v2);
        const d = Math.hypot(pL.x - c.x, pL.y - PIPE_Y, pL.z - c.z);
        if (d < R + 0.01) out.push({ kind: 'piece', id: p.id, d, pos: new THREE.Vector3(c.x, 0.002, c.z) });
      }
    }
    // Tray pieces.
    st.tray.forEach((p, k) => {
      const s = this.board.traySlot(k, st.tray.length, this.v2);
      const d = Math.hypot(pL.x - s.x, (pL.y - s.y - PIPE_Y) * 0.7, pL.z - s.z);
      if (d < R + 0.006) out.push({ kind: 'tray', id: p.id, d, pos: s.clone() });
    });
    }
    // Move knobs.
    for (const k of this.board.knobs) {
      const d = pL.distanceTo(k.position);
      if (d < R) out.push({ kind: 'knob', d, pos: k.position.clone() });
    }
    // Buttons by pinch.
    for (const b of this.board.buttons) {
      if (!b.enabled) continue;
      const bp = b.group.position;
      const d = Math.hypot(pL.x - bp.x, (pL.y - 0.01) * 0.6, pL.z - bp.z);
      if (d < b.radius * 1.4) out.push({ kind: 'button', btn: b, d: d * 0.9, pos: bp.clone() });
    }
    out.sort((a, b) => a.d - b.d);
    return out;
  }

  isHeldElsewhere(id, self) {
    for (const h of this.handsCache || []) if (h !== self && h.ix?.id === id && h.ix.mode !== 'idle') return true;
    return false;
  }

  update(dt, hands, now) {
    this.handsCache = hands;
    const root = this.board.root;
    let hoverShown = false;
    for (const h of hands) {
      if (!h.ix) h.ix = { mode: 'idle' };
      const ix = h.ix;
      if (!h.present) {
        if (ix.mode !== 'idle') {
          ix.lostAt ??= now;
          if (now - ix.lostAt > GRACE) { ix.lostAt = null; this.finish(h, now, true); }
        }
        continue;
      }
      ix.lostAt = null;
      const pL = root.worldToLocal(this.v.copy(h.pinchPoint)).clone();
      // Recent pinch positions, so a drop lands where the fingers were just before they opened.
      (ix.hist ||= []).push({ t: now, p: pL.clone() });
      while (ix.hist.length > 2 && now - ix.hist[1].t > DROP_LAG) ix.hist.shift();
      // Fingertip pokes on physical buttons.
      if (h.kind === 'hand') this.poke(h, root.worldToLocal(this.v.copy(h.indexTip)).clone(), now);
      if (ix.mode === 'idle') {
        const cand = this.candidates(pL).filter((c) => !(c.id && this.isHeldElsewhere(c.id, h)));
        const best = cand[0];
        if (best && !hoverShown) {
          this.board.highlight.visible = true;
          this.board.highlight.position.copy(best.pos).setY(best.kind === 'valve' ? WHEEL_Y : best.pos.y + 0.003);
          this.board.highlight.scale.setScalar(best.kind === 'button' ? 1.1 : best.kind === 'valve' ? 0.8 : 1);
          hoverShown = true;
        }
        // A pinch with the palm toward the face is Meta's system menu gesture: never start a grab from it.
        const palmRecent = h.palmUp || (h.palmUpAt && performance.now() - h.palmUpAt < 250);
        if (h.pinch.started && best && !palmRecent) this.begin(h, best, pL, now);
        continue;
      }
      // Turning the palm to the face mid-grab (the system gesture) lets go after a moment.
      if (h.palmFaceSince && performance.now() - h.palmFaceSince > 300) { this.finish(h, now, true); continue; }
      if (h.pinch.ended || !h.pinch.down) { this.finish(h, now, false, ix.hist && ix.hist.length ? ix.hist[0].p : pL); continue; }
      this.drag(h, pL, dt, now);
      if (ix.mode === 'hold') hoverShown = true;
    }
    if (!hoverShown) this.board.highlight.visible = false;
  }

  // Fingertip presses. Arming is kept per hand (buttons get rebuilt after a press), so one push = one press:
  // the finger must leave every button before it can press again, and presses are at least 0.5 s apart.
  poke(h, tipL, now) {
    let inside = false;
    for (const b of this.board.buttons) {
      if (!b.enabled) continue;
      const bp = b.group.position;
      const horiz = Math.hypot(tipL.x - bp.x, tipL.z - bp.z);
      const top = bp.y + 0.014;
      if (horiz < b.radius * 1.05 && tipL.y < top + 0.002 && tipL.y > top - 0.03) {
        inside = true;
        b.depth = 1;
        if (h.pokeArmed !== false && h.ix?.mode === 'idle') { h.pokeArmed = false; this.press(b, now, h); }
      } else if (horiz < b.radius * 1.5 && tipL.y < top + 0.02) {
        inside = true; // still near this button: stay disarmed
      }
    }
    if (!inside) h.pokeArmed = true;
  }

  press(b, now, h) {
    b.depth = 1;
    if (now - (h.lastPress ?? -1e9) < 0.5) return;
    h.lastPress = now;
    this.fx.press?.();
    this.emit('button', b.id);
  }

  begin(h, best, pL, now) {
    const ix = h.ix;
    ix.t0 = now; ix.start = pL.clone(); ix.prevQuat = h.wristQuat.clone();
    ix.axis = h.forward.clone();
    ix.turner = new QuarterTurner(this.assist ? Math.PI / 4 : Math.PI / 3);
    ix.id = best.id;
    if (best.kind === 'button') { h.pokeArmed = false; this.press(best.btn, now, h); ix.mode = 'button'; return; }
    if (best.kind === 'valve') { ix.mode = 'valve'; ix.lastTick = findPiece(this.st, best.id).piece.open; this.fx.grab?.(); return; }
    if (best.kind === 'knob') { ix.mode = 'move'; ix.prevWorld = h.pinchPoint.clone(); this.fx.grab?.(); return; }
    if (best.kind === 'piece') { ix.mode = 'tapCand'; return; }
    if (best.kind === 'tray') { this.startHold(h, best.id, false); }
  }

  startHold(h, id, fromBoard) {
    const ix = h.ix;
    ix.mode = 'hold'; ix.id = id; ix.fromBoard = fromBoard;
    const o = this.board.objects.get(id);
    if (o) o.held = true;
    // A piece lifted off the board leaves the network until it is dropped again.
    if (fromBoard) { returnToTray(this.st, id); this.board.sync(); this.emit('change'); }
    this.fx.pick?.();
  }

  twistOf(h) {
    const ix = h.ix;
    let d = h.kind === 'mouse' ? h.twistOverride : twistDelta(ix.prevQuat, h.wristQuat, ix.axis);
    ix.prevQuat.copy(h.wristQuat);
    return d;
  }

  drag(h, pL, dt, now) {
    const ix = h.ix, st = this.st;
    if (ix.mode === 'tapCand') {
      if (pL.distanceTo(ix.start) > 0.015 || now - ix.t0 > 0.32) this.startHold(h, ix.id, true);
      else { this.twistOf(h); return; }
    }
    if (ix.mode === 'hold') {
      const o = this.board.objects.get(ix.id);
      const f = findPiece(st, ix.id);
      if (!o || !f) { ix.mode = 'idle'; return; }
      const turns = ix.turner.add(this.twistOf(h));
      if (turns) { rotatePiece(st, ix.id, turns); this.fx.rotate?.(); this.emit('change'); }
      const ahead = this.v2.copy(h.forward).transformDirection(this.board.root.matrixWorld.clone().invert()).setY(0);
      if (h.kind === 'hand' && ahead.lengthSq() > 1e-6) ahead.normalize().multiplyScalar(0.022); else ahead.set(0, 0, 0);
      o.group.position.copy(pL).add(ahead).setY(Math.max(pL.y - PIPE_Y, 0.006));
      ix.ahead = ahead.clone();
      o.group.rotation.y = -f.piece.rot * Math.PI / 2 - ix.turner.partial * (Math.PI / 2) * 0.5;
      o.group.scale.setScalar(1.05);
      const cell = this.board.cellFromLocal(o.group.position);
      const occ = cell.inside ? cellAt(st, cell.r, cell.c) : undefined;
      const ok = cell.inside && pL.y < 0.12 && (occ === null || occ?.id === ix.id);
      const dm = this.board.dropMarker;
      dm.visible = ok;
      if (ok) dm.position.copy(this.board.cellCenter(cell.r, cell.c)).setY(0.004);
      return;
    }
    if (ix.mode === 'valve') {
      const d = this.twistOf(h);
      const f = findPiece(st, ix.id);
      if (!f) return;
      const open = Math.min(1, Math.max(0, f.piece.open - d / VALVE_RANGE));
      setValve(st, ix.id, open);
      if (Math.abs(open - ix.lastTick) >= 0.05) { ix.lastTick = open; this.fx.tick?.(open); }
      this.emit('change');
      return;
    }
    if (ix.mode === 'move') {
      const delta = this.v2.copy(h.pinchPoint).sub(ix.prevWorld);
      (this.moveTarget || this.board.root).position.add(delta);
      ix.prevWorld.copy(h.pinchPoint);
    }
  }

  finish(h, now, lost, pL) {
    const ix = h.ix, st = this.st;
    const mode = ix.mode;
    ix.mode = 'idle';
    this.board.dropMarker.visible = false;
    if (mode === 'tapCand' && !lost) {
      if (isTap(now - ix.t0, pL ? pL.distanceTo(ix.start) : 0)) {
        rotatePiece(st, ix.id, 1); this.fx.rotate?.(); this.emit('change');
      }
      return;
    }
    if (mode === 'hold') {
      const o = this.board.objects.get(ix.id);
      if (o) { o.held = false; o.group.scale.setScalar(1); }
      let placed = false;
      if (!lost && pL) {
        const cell = this.board.cellFromLocal(ix.ahead ? pL.clone().add(ix.ahead) : pL);
        if (cell.inside && pL.y < 0.12) {
          const occ = cellAt(st, cell.r, cell.c);
          const f = findPiece(st, ix.id);
          if (occ === null) placed = placePiece(st, ix.id, cell.r, cell.c);
          else if (occ?.id === ix.id) placed = true;
          void f;
        }
      }
      if (placed) this.fx.drop?.();
      else if (ix.fromBoard) { returnToTray(st, ix.id); this.fx.back?.(); }
      else this.fx.back?.();
      this.board.sync();
      this.emit('change');
    }
  }
}
