import './stub-dom.js';
import { it, expect } from 'vitest';
import * as THREE from 'three';
import { App } from '../src/game/app.js';
import { MouseHand, desktopButtonAt } from '../src/input/hands.js';
import * as store from '../src/util/store.js';
import { placePiece, returnToTray } from '../src/sim/level.js';
const quiet = new Proxy({}, { get: () => () => {} });
function setup() {
  localStorage.removeItem('flowsmith.v1');
  const app = new App(new THREE.Scene(), quiet);
  app.anchor.position.set(0, .82, -.32); app.anchor.scale.setScalar(1.25);
  app.anchor.updateMatrixWorld(true);
  const camera = new THREE.PerspectiveCamera(55,1017/482,.01,50);
  camera.position.set(0,1.22,.32);camera.lookAt(0,.82,-.32);camera.updateMatrixWorld();
  return {app,camera};
}
function rayAt(object,camera) {
  const ndc=object.getWorldPosition(new THREE.Vector3()).project(camera);
  const ray=new THREE.Raycaster();ray.setFromCamera(ndc,camera);return {ray,ndc};
}
it('every visible menu puck center ray targets that exact button at the reported desktop viewport',()=>{
 const {app,camera}=setup();app.showMenu();app.anchor.updateMatrixWorld(true);
 for(const b of app.menu.buttons) expect(desktopButtonAt(rayAt(b.labelPanel.mesh,camera).ray,app.menu.buttons)?.id).toBe(b.id);
});
it('board name tags are clickable and disabled Next cannot be clicked',()=>{
 const {app,camera}=setup();app.anchor.updateMatrixWorld(true);
 for(const id of ['reset','hint','levels']){const b=app.board.buttons.find(x=>x.id===id);expect(desktopButtonAt(rayAt(b.tag.mesh,camera).ray,app.board.buttons)?.id).toBe(id);}
 const next=app.board.buttons.find(x=>x.id==='next');expect(desktopButtonAt(rayAt(next.cap,camera).ray,[next])).toBe(null);
});
it('mouse button navigation dispatches immediately without leaving a held pipe',()=>{
 const {app,camera}=setup();app.showMenu();app.anchor.updateMatrixWorld(true);
 const listeners={};const dom={addEventListener:(key,fn)=>listeners[key]=fn,getBoundingClientRect:()=>({left:0,top:0,width:1017,height:482})};
 const mouse=new MouseHand(dom,camera,()=>new THREE.Plane(new THREE.Vector3(0,1,0),-.84),{list:()=>app.mode==='menu'?app.menu.buttons:app.board.buttons,press:id=>app.onButton(id)});
 const b=app.menu.buttons[1],{ndc}=rayAt(b.labelPanel.mesh,camera);
 listeners.pointerdown({button:0,clientX:(ndc.x+1)*1017/2,clientY:(1-ndc.y)*482/2});
 expect(app.def.id).toBe('l2');expect(mouse.downReq).toBe(false);
});
it('reset and repeated navigation keep board state and earned progress separate',()=>{
 const {app}=setup();const first=app.st.tray[0];expect(placePiece(app.st,first.id,1,2)).toBe(true);
 for(let i=0;i<40;i++)app.update(1/72,[],i/72,null);
 expect(app.solved).toBe(true);expect(app.progress.records.l1.score).toBe(4000);
 for(let i=0;i<5;i++){app.onButton('reset');expect(app.st.result.solved).toBe(false);expect(app.solved).toBe(false);expect(app.progress.stars.l1).toBe(3);app.startLevel(1);app.showMenu();app.startLevel(0);}
 expect(store.load().records.l1.score).toBe(4000);
});
it('local records replace only a better score or equal-score faster time',()=>{
 const s=store.load();s.records={};
 store.recordRun(s,'l1',{stars:3,accuracy:80,seconds:40,hints:0});
 store.recordRun(s,'l1',{stars:2,accuracy:100,seconds:10,hints:1});expect(s.records.l1.score).toBe(3800);
 store.recordRun(s,'l1',{stars:3,accuracy:80,seconds:35,hints:0});expect(s.records.l1.seconds).toBe(35);
 store.save(s);expect(store.load().records).toEqual(s.records);
});

it('elapsed score time follows monotonic time rather than clamped render steps',()=>{const {app}=setup();app.update(.01,[],100,null);app.update(.05,[],110,null);expect(app.elapsed).toBeCloseTo(10.01);app.onButton('reset');app.update(.01,[],115,null);expect(app.elapsed).toBeCloseTo(.01);});

it('post-win break and repair reports current flow without erasing earned stars',()=>{
 const {app}=setup();const id=app.st.tray[0].id;placePiece(app.st,id,1,2);
 for(let i=0;i<40;i++)app.update(1/72,[],i/72,null);
 expect(app.solved).toBe(true);expect(app.statusLine().title).toBe('Flow restored');
 returnToTray(app.st,id);app.update(.02,[],2,null);
 expect(app.st.result.solved).toBe(false);expect(app.st.lit).toBe(false);expect(app.statusLine().title).toBe('Flow interrupted');expect(app.progress.stars.l1).toBe(3);
 placePiece(app.st,id,1,2);app.update(.02,[],3,null);
 expect(app.st.lit).toBe(true);expect(app.statusLine().title).toBe('Flow restored');expect(app.progress.stars.l1).toBe(3);
});

it('menu resume preserves an unfinished board without restarting its clock',()=>{
 const {app}=setup();const id=app.st.tray[0].id;placePiece(app.st,id,0,1);app.update(.02,[],1,null);
 const state=app.st, elapsed=app.elapsed;app.showMenu();app.onButton('resume');
 expect(app.mode).toBe('play');expect(app.st).toBe(state);expect(app.st.cells[1].id).toBe(id);expect(app.elapsed).toBe(elapsed);
});
