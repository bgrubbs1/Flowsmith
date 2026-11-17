// Original geometry exported by Blender: tools source is preserved with the art candidate.
import * as THREE from 'three';
import data from './blender-mill.json';
const cache=new Map();
export function authoredGeometry(name){
 if(!cache.has(name)){
  const d=data[name];if(!d)throw new Error(`Missing Blender geometry: ${name}`);
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(d.position,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(d.normal,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(d.position.length/3*2),2));g.setIndex(Array.from({length:d.position.length/3},(_,i)=>i));g.computeBoundingSphere();cache.set(name,g);
 }
 return cache.get(name);
}
export function authoredMesh(name,material){const m=new THREE.Mesh(authoredGeometry(name),material);m.name=name;m.castShadow=true;m.receiveShadow=true;return m;}
