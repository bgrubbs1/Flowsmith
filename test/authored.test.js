import {it,expect} from 'vitest';
import {RECONNECT,NIGHT_SHIFT} from '../src/sim/levels.js';
import {createLevelState,placePiece,setValve,rotatePiece,returnToTray} from '../src/sim/level.js';
import {verifySolution} from '../src/sim/generator.js';
function connect(def){const st=createLevelState(def);for(const s of def.solution){const p=st.tray.find(p=>p.type===s.type);p.rot=s.rot;placePiece(st,p.id,s.r,s.c);if(s.type==='valve')setValve(st,p.id,s.open);}return st;}
it('authored progression uses three then four pieces, and solution verifier includes fixed valves',()=>{expect(RECONNECT.inventory).toHaveLength(3);expect(NIGHT_SHIFT.inventory).toHaveLength(4);expect(verifySolution(RECONNECT)).toBe(true);expect(verifySolution(NIGHT_SHIFT)).toBe(true);});
it('shared feed visibly transfers pressure and both adjustments are necessary',()=>{
 const st=connect(NIGHT_SHIFT),near=st.cells[2*6+3],far=st.cells[3];
 const status=i=>st.result.mills.find(m=>m.i===i).status;
 expect(status(4)).toBe('ok');expect(status(16)).toBe('high');
 setValve(st,near.id,.25);expect(status(16)).toBe('ok');expect(status(4)).toBe('high');
 setValve(st,far.id,.4);expect(st.result.solved).toBe(true);expect(st.result.leaks).toHaveLength(0);
 setValve(st,near.id,.02);expect(st.result.solved).toBe(false);expect(status(16)).toBe('low');
 setValve(st,near.id,.25);expect(st.result.solved).toBe(true);
 const tee=st.cells[14];rotatePiece(st,tee.id,1);expect(st.result.solved).toBe(false);expect(st.result.leaks.length).toBeGreaterThan(0);rotatePiece(st,tee.id,-1);expect(st.result.solved).toBe(true);
 const elbow=st.cells[26];returnToTray(st,elbow.id);expect(st.result.solved).toBe(false);placePiece(st,elbow.id,4,2);expect(st.result.solved).toBe(true);
});
it('neither single valve can solve Night Shift with the other wide open across 2001 samples',()=>{
 const st=connect(NIGHT_SHIFT),near=st.cells[15],far=st.cells[3];
 for(const [one,other] of [[near,far],[far,near]]){setValve(st,other.id,1);for(let i=0;i<=2000;i++){setValve(st,one.id,i/2000);expect(st.result.solved).toBe(false);}}
});
