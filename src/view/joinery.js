import * as THREE from 'three';
import { mat, T } from './materials.js';
// Static, batched joinery. These meshes are visual only, not interaction targets.
export function addBoardJoinery(parent, W, D, rows, cols) {
  const trim=new THREE.Group();trim.name='waterworks-joinery';parent.add(trim);
  const add=(w,h,d,x,y,z,m)=>{const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),mat(m));o.position.set(x,y,z);trim.add(o);};
  for(const x of [-1,1])add(.004,.009,D+.036,x*(W/2+.016),-.001,0,'brass');
  for(const z of [-1,1])add(W+.036,.009,.004,0,-.001,z*(D/2+.016),'brass');
  const bolts=new THREE.InstancedMesh(new THREE.CylinderGeometry(.0018,.0018,.002,6),mat('brass'),rows*cols*4);
  const matrix=new THREE.Matrix4();let b=0;
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const x=(c-(cols-1)/2)*T,z=(r-(rows-1)/2)*T;
    for(const dx of [-1,1])for(const dz of [-1,1]){matrix.makeTranslation(x+dx*T*.38,.0035,z+dz*T*.38);bolts.setMatrixAt(b++,matrix);}
  }
  trim.add(bolts);
  // Machined corner blocks and stacked reveal underneath the slate tiles.
  for(const x of [-1,1])for(const z of [-1,1])add(.018,.025,.018,x*(W/2+.005),-.01,z*(D/2+.005),'iron');
  return trim;
}
