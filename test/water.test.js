import './stub-dom.js';
import * as THREE from 'three';
import {it,expect} from 'vitest';
import {WaterView} from '../src/view/water.js';
import {NIGHT_SHIFT} from '../src/sim/levels.js';
import {createLevelState,placePiece,setValve} from '../src/sim/level.js';
const center=(r,c)=>new THREE.Vector3(c*.055,0,r*.055);
it('closed Night Shift stays visibly filled without streaming, reopening restores motion',()=>{
 const st=createLevelState(NIGHT_SHIFT);
 for(const s of NIGHT_SHIFT.solution){const p=st.tray.find(p=>p.type===s.type);p.rot=s.rot;placePiece(st,p.id,s.r,s.c);}
 const valves=st.cells.filter(p=>p?.type==='valve');for(const v of valves)setValve(st,v.id,0);
 const water=new WaterView(new THREE.Group());water.update(.1,st,center);
 expect(water.core.count).toBe(0);expect(water.stillCore.count).toBeGreaterThan(0);expect(water.mesh.count).toBe(0);expect(water.flowPhase.value).toBe(0);
 for(const v of valves)setValve(st,v.id,1);water.update(.1,st,center);
 expect(water.core.count).toBeGreaterThan(0);expect(water.mesh.count).toBeGreaterThan(0);expect(water.flowPhase.value).toBeLessThan(0);
});
it('a still branch never shares moving stripes with a flowing branch',()=>{
 const water=new WaterView(new THREE.Group());const st={cols:3,result:{sol:{wet:[true,true,true],edges:[{a:0,b:1,q:.00001},{a:1,b:2,q:.5}]},leaks:[]}};
 water.update(.1,st,center);expect(water.stillCore.count).toBe(1);expect(water.core.count).toBe(1);
});
it('leaking water has continuous ballistic jets, cleared when flow stops',()=>{
 const water=new WaterView(new THREE.Group());const st={cols:2,result:{sol:{wet:[true,false],edges:[]},leaks:[{i:0,dir:2,q:1}]}};
 water.update(.1,st,center);expect(water.jets.count).toBe(1);expect(water.puddles[0].visible).toBe(true);
 st.result.leaks=[];water.update(.1,st,center);expect(water.jets.count).toBe(0);expect(water.puddles[0].visible).toBe(false);
});
