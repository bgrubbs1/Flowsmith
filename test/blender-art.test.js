import './stub-dom.js';
import {it,expect} from 'vitest';
import * as THREE from 'three';
import {buildPiece} from '../src/view/pieceGeometry.js';
it('mill uses compact Blender-authored house and wheel while preserving animated parts',()=>{
 const {group,parts}=buildPiece('mill');
 expect(group.getObjectByName('blender-mill-house')).toBeTruthy();
 expect(parts.windows).toBeTruthy();expect(parts.millWheel).toBeTruthy();
 const box=new THREE.Box3().setFromObject(parts.millWheel),size=box.getSize(new THREE.Vector3());
 expect(size.y).toBeLessThan(.05);expect(size.z).toBeLessThan(.05);
 expect(parts.hut.position.x).toBeGreaterThan(0);
});
