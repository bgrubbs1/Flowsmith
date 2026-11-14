import * as THREE from 'three';
// Keep unpowered glass dark even under bright environment lighting.
export function preparePoweredMaterial(original, kind) {
  const material=original.clone();
  material.userData.poweredColor=original.color.clone();
  material.userData.unpoweredColor=new THREE.Color(kind==='water_core'?0x09242b:0x071522);
  setMaterialPower(material,0);
  return material;
}
export function setMaterialPower(material, fraction) {
  const f=Math.max(0,Math.min(1,fraction));
  material.color.copy(material.userData.unpoweredColor).lerp(material.userData.poweredColor,f);
  material.emissiveIntensity=f*1.6;
}

// GLTFLoader can expand a multi-primitive named node into a Group with suffixed
// child meshes. Resolve the semantic role from material OR any ancestor name.
export function bindPoweredMaterials(root) {
  const materials=[];const found=new Set();
  root.traverse(object=>{
    if(!object.isMesh)return;
    const ancestors=[];for(let node=object;node;node=node.parent)ancestors.push(node.name||'');
    const bind=original=>{
      const names=[original.name||'',...ancestors];
      const kind=['windows_power','water_core'].find(role=>names.some(name=>name===role||name.startsWith(role+'_')||name.startsWith(role+'.')));
      if(!kind)return original;
      const material=preparePoweredMaterial(original,kind);materials.push(material);found.add(kind);return material;
    };
    object.material=Array.isArray(object.material)?object.material.map(bind):bind(object.material);
  });
  if(!found.has('windows_power')||!found.has('water_core'))throw new Error('Landmark missing powered window/water material bindings');
  return materials;
}
