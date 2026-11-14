import './stub-dom.js';
import { it, expect } from 'vitest';
import * as THREE from 'three';
import { XRHandInput, oculusHandConfig } from '../node_modules/iwer/lib/device/XRHandInput.js';
import { GlobalSpace, XRSpaceUtils } from '../node_modules/iwer/lib/spaces/XRSpace.js';
import { P_JOINT_SPACE } from '../node_modules/iwer/lib/private.js';
import { App } from '../src/game/app.js';
import { Director, valveCorrection } from '../src/director.js';
import { HandInput } from '../src/input/hands.js';
it('real IWER transforms solve authored Night Shift through the visible menu',async()=>{
 const frameMs=14;
 localStorage.removeItem('flowsmith.v1');
 const app=new App(new THREE.Scene(),new Proxy({},{get:()=>()=>{}}));
 app.anchor.position.set(0,.84,-.42);app.anchor.scale.setScalar(1.25);app.anchor.updateMatrixWorld(true);app.showMenu();
 const hand=new XRHandInput(oculusHandConfig,'right',new GlobalSpace());
 const input=new HandInput();
 const frame={session:{dispatchEvent(){}},fillPoses(spaces,ref,out){spaces.forEach((s,i)=>out.set(XRSpaceUtils.calculateGlobalOffsetMatrix(s),i*16));return true;},fillJointRadii(spaces,out){spaces.forEach((s,i)=>out[i]=s[P_JOINT_SPACE].radius);return true;}};
 const d=new Director(app,{hands:{right:hand,left:{}}},null);
 let now=0;const pump=setInterval(()=>{hand.onFrameStart(frame);input.readHand(frame,null,hand.inputSource.hand,input.hands.right);now+=frameMs/1000;app.update(Math.min(frameMs/1000,.05),[input.hands.right],now,null);app.anchor.updateMatrixWorld(true);},frameMs);
 try{await d.run({signatureOnly:true});expect(app.def.id).toBe('authored-night-shift');expect(app.solved).toBe(true);expect(app.st.result.solved).toBe(true);expect(app.st.result.leaks).toHaveLength(0);expect(app.st.result.mills).toHaveLength(2);}finally{clearInterval(pump);}
},90000);

