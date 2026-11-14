import './stub-dom.js';
import { it, expect } from 'vitest';
import * as THREE from 'three';
import { XRHandInput, oculusHandConfig } from '../node_modules/iwer/lib/device/XRHandInput.js';
import { GlobalSpace, XRSpaceUtils } from '../node_modules/iwer/lib/spaces/XRSpace.js';
import { P_JOINT_SPACE } from '../node_modules/iwer/lib/private.js';
import { App } from '../src/game/app.js';
import { Director, valveCorrection } from '../src/director.js';
import { HandInput } from '../src/input/hands.js';
it.each([14, 500])('real IWER joint transforms drive director menu and puzzle with %ims frames',async(frameMs)=>{
 localStorage.removeItem('flowsmith.v1');
 const app=new App(new THREE.Scene(),new Proxy({},{get:()=>()=>{}}));
 app.anchor.position.set(0,.84,-.42);app.anchor.scale.setScalar(1.25);app.anchor.updateMatrixWorld(true);app.showMenu();
 const hand=new XRHandInput(oculusHandConfig,'right',new GlobalSpace());
 const input=new HandInput();
 const frame={session:{dispatchEvent(){}},fillPoses(spaces,ref,out){spaces.forEach((s,i)=>out.set(XRSpaceUtils.calculateGlobalOffsetMatrix(s),i*16));return true;},fillJointRadii(spaces,out){spaces.forEach((s,i)=>out[i]=s[P_JOINT_SPACE].radius);return true;}};
 const d=new Director(app,{hands:{right:hand,left:{}}},null);
 let now=0;const pump=setInterval(()=>{hand.onFrameStart(frame);input.readHand(frame,null,hand.inputSource.hand,input.hands.right);now+=frameMs/1000;app.update(Math.min(frameMs/1000,.05),[input.hands.right],now,null);app.anchor.updateMatrixWorld(true);},frameMs);
 try{await d.press('level:0');expect(app.mode).toBe('play');expect(app.def.id).toBe('l1');await d.solveCurrent();await new Promise(r=>setTimeout(r,4500));expect(app.solved).toBe(true);app.startLevel(2);await d.solveCurrent();expect(app.solved).toBe(true);expect(Math.abs(app.st.cells.find(p=>p?.type==='valve').open-.4)).toBeLessThanOrEqual(.02);}finally{clearInterval(pump);}
},90000);

it('regresses the low-frame valve oscillation counterexample',()=>{
 let old=1;for(let i=0;i<120;i++)old-=Math.sign(old-.4)*Math.min(.15,Math.abs(old-.4)*4+.02)/(Math.PI*.6);
 expect(old).toBeCloseTo(.3633802,5);expect(Math.abs(old-.4)).toBeGreaterThan(.02);
 for(const start of [0,.3633802276,.4429576992,1]){let value=start;for(let i=0;i<24&&Math.abs(value-.4)>.02;i++){const before=Math.abs(value-.4);value-=valveCorrection(value-.4)/(Math.PI*.6);expect(Math.abs(value-.4)).toBeLessThan(before);}expect(Math.abs(value-.4)).toBeLessThanOrEqual(.02);}
});
