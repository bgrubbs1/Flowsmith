import {it,expect} from 'vitest';
import * as THREE from 'three';
import {preparePoweredMaterial,setMaterialPower,bindPoweredMaterials} from '../src/view/power.js';
it('unpowered windows darken their base color, restore warm color, and go dark again',()=>{
 const original=new THREE.MeshStandardMaterial({color:0xffbd67,emissive:0xffaa33,emissiveIntensity:2});
 const material=preparePoweredMaterial(original,'windows_power');
 expect(material.color.getHex()).toBe(0x071522);expect(material.emissiveIntensity).toBe(0);
 expect(original.color.getHex()).toBe(0xffbd67);expect(original.emissiveIntensity).toBe(2);
 setMaterialPower(material,1);expect(material.color.equals(original.color)).toBe(true);expect(material.emissiveIntensity).toBe(1.6);
 setMaterialPower(material,0);expect(material.color.getHex()).toBe(0x071522);expect(material.emissiveIntensity).toBe(0);
});
it('power interpolation is bounded and water stays distinct from restored windows',()=>{
 const material=preparePoweredMaterial(new THREE.MeshStandardMaterial({color:0x88ffff}),'water_core');
 expect(material.color.getHex()).toBe(0x09242b);setMaterialPower(material,-1);expect(material.emissiveIntensity).toBe(0);
 setMaterialPower(material,.5);expect(material.emissiveIntensity).toBe(.8);
 setMaterialPower(material,2);expect(material.emissiveIntensity).toBe(1.6);
});

it('binds actual GLTF multi-primitive groups and material names rather than exact mesh names only',()=>{
 const root=new THREE.Group();const windows=new THREE.Group();windows.name='windows_power';root.add(windows);
 const orange=new THREE.MeshStandardMaterial({color:0xffbd67,emissive:0xffaa33,emissiveIntensity:2});
 const a=new THREE.Mesh(new THREE.BoxGeometry(),orange);a.name='windows_power_1';windows.add(a);
 const blue=new THREE.MeshStandardMaterial({color:0x88ffff});blue.name='water_core';
 const b=new THREE.Mesh(new THREE.BoxGeometry(),blue);b.name='mesh_10';root.add(b);
 const materials=bindPoweredMaterials(root);expect(materials).toHaveLength(2);
 expect(a.material.color.getHex()).toBe(0x071522);expect(a.material.emissiveIntensity).toBe(0);expect(b.material.color.getHex()).toBe(0x09242b);
});
it('missing powered bindings cannot silently report a ready landmark',()=>{expect(()=>bindPoweredMaterials(new THREE.Group())).toThrow('missing powered');});
