import './stub-dom.js';
import { it, expect } from 'vitest';
import * as THREE from 'three';
import { MouseHand } from '../src/input/hands.js';
it('losing window focus releases drag and clears queued valve rotation', () => {
 const prior=window.addEventListener, events={}, domEvents={};
 window.addEventListener=(name,fn)=>events[name]=fn;
 try {
  const dom={clientWidth:800,addEventListener:(n,f)=>domEvents[n]=f,getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})};
  const camera=new THREE.PerspectiveCamera();
  const mouse=new MouseHand(dom,camera,()=>new THREE.Plane(new THREE.Vector3(0,0,1),-1));
  domEvents.pointerdown({button:0,clientX:400,clientY:300});mouse.update();
  expect(mouse.state.pinch.down).toBe(true);
  mouse.wheel=1;mouse.dragX=50;
  events.blur?.();mouse.update();
  expect(mouse.state.pinch.down).toBe(false);
  expect(mouse.state.twistOverride).toBe(0);
  expect(mouse.state.pinch.ended).toBe(true);
 } finally {window.addEventListener=prior;}
});

import { App } from '../src/game/app.js';
import { placePiece } from '../src/sim/level.js';
const quiet = new Proxy({}, { get: () => () => {} });
function withInput(run) {
 const prior = window.addEventListener, events = {}, domEvents = {};
 window.addEventListener = (name, fn) => events[name] = fn;
 try {
  localStorage.removeItem('flowsmith.v1');
  const app = new App(new THREE.Scene(), quiet);
  app.anchor.updateMatrixWorld(true);
  const dom = { clientWidth:800, addEventListener:(n,f)=>domEvents[n]=f, getBoundingClientRect:()=>({left:0,top:0,width:800,height:600}) };
  // Pointer position is supplied in board space to isolate cancellation from camera projection.
  const mouse = new MouseHand(dom, new THREE.PerspectiveCamera(), () => null);
  const move = p => { mouse.state.pinchPoint.copy(app.board.root.localToWorld(p.clone())); };
  const tick = now => { mouse.update(); app.ixBoard.update(1/72,[mouse.state],now); };
  const down = () => domEvents.pointerdown({button:0,clientX:400,clientY:300});
  run({app,mouse,events,move,tick,down});
 } finally { window.addEventListener = prior; }
}
for (const event of ['blur','pointercancel']) {
 it(`${event} during a short placed-pipe press does not rotate it`, () => withInput(({app,events,move,tick,down}) => {
  const piece=app.st.tray[0]; placePiece(app.st,piece.id,1,2); app.board.sync();
  const before=piece.rot;
  move(app.board.cellCenter(1,2).setY(.02));down();tick(1);
  events[event]();tick(1.05);
  expect(piece.rot).toBe(before);
  expect(app.st.cells[1*app.st.cols+2]?.id).toBe(piece.id);
 }));
 it(`${event} during a carry cancels placement, and a fresh drag still works`, () => withInput(({app,mouse,events,move,tick,down}) => {
  const piece=app.st.tray[0], slot=app.board.traySlot(0,app.st.tray.length).setY(.02);
  const target=app.board.cellCenter(1,2).setY(.02);
  move(slot);down();tick(1);expect(mouse.state.ix.mode).toBe('hold');
  move(target);tick(1.1);tick(1.2);events[event]();tick(1.21);
  expect(app.st.cells[1*app.st.cols+2]).toBe(null);
  expect(app.st.tray.some(p=>p.id===piece.id)).toBe(true);
  expect(mouse.state.ix.mode).toBe('idle');
  move(slot);down();tick(2);expect(mouse.state.ix.mode).toBe('hold');
  move(target);tick(2.1);tick(2.2);events.pointerup();tick(2.3);
  expect(app.st.cells[1*app.st.cols+2]?.id).toBe(piece.id);
 }));
}

for (const kind of ['mouse', 'hand']) {
 it(`${kind} release uses ${kind === 'mouse' ? 'current pointer' : 'historical pinch'} position after a fast final move`, () => withInput(({app,mouse,events,move,tick,down}) => {
  mouse.state.kind=kind;
  mouse.state.forward.set(0,0,0); // Isolate temporal smoothing from hand lead compensation.
  const piece=app.st.tray[0], slot=app.board.traySlot(0,app.st.tray.length).setY(.02);
  const prior=app.board.cellCenter(2,2).setY(.02), target=app.board.cellCenter(1,2).setY(.02);
  expect(app.st.cells[2*app.st.cols+2]).toBe(null);
  move(slot);down();tick(1);expect(mouse.state.ix.mode).toBe('hold');
  move(prior);tick(1.1);tick(1.2);
  move(target);tick(1.22);events.pointerup();tick(1.23);
  const row=kind === 'mouse' ? 1 : 2;
  expect(app.st.cells[row*app.st.cols+2]?.id).toBe(piece.id);
 }));
}
