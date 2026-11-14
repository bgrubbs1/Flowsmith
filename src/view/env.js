// Miniature pumping station. Decoration stays outside the reachable play grid.
import * as THREE from 'three';
import { bindPoweredMaterials, setMaterialPower } from './power.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { skyDome, lightPool, HORIZON, bakedSurface, LOOK } from './looks.js';

// Reflections come from the same dusk sky plus a warm lamp bank, so copper and glass pick up amber highlights.
function duskEnvironment(renderer){
  const s=new THREE.Scene();s.add(skyDome(10));
  const lamp=new THREE.MeshBasicMaterial({color:new THREE.Color(0xffb35c).multiplyScalar(5)});
  const cool=new THREE.MeshBasicMaterial({color:new THREE.Color(0x9cc8ff).multiplyScalar(1.6)});
  for(const [x,y,z,w,h,m] of [[-2.2,3,1.5,1.6,.6,lamp],[2.6,2.4,-1,.8,1.4,cool],[0,4.5,0,3,3,cool],[1.8,1.2,2.4,1,.5,lamp]]){const p=new THREE.Mesh(new THREE.PlaneGeometry(w,h),m);p.position.set(x,y,z);p.lookAt(0,0,0);s.add(p);}
  const pmrem=new THREE.PMREMGenerator(renderer);const tex=pmrem.fromScene(s,.035).texture;pmrem.dispose();return tex;
}
export class Environment {
  constructor(scene, renderer) {
    this.scene=scene;scene.background=HORIZON.clone();scene.fog=new THREE.Fog(HORIZON,3,16);
    scene.environment=duskEnvironment(renderer);scene.environmentIntensity=.7;
    // Warm lamplight from over the left shoulder, cool dusk fill, a blue rim to lift silhouettes off the sky.
    this.hemi=new THREE.HemisphereLight(0x9fb8e6,0x2a1c14,.9);this.sun=new THREE.DirectionalLight(0xffcf96,2.9);this.sun.position.set(-.7,2,.9);
    const rim=new THREE.DirectionalLight(0x8fbfff,1.8);rim.position.set(1.2,1.1,-2);scene.add(this.hemi,this.sun,rim);
    this.room=new THREE.Group();scene.add(this.room);this.table=new THREE.Group();scene.add(this.table);
    // The cabinet top is oiled walnut (baked in Blender), the rest dark painted steel.
    const slate=bakedSurface('walnut',{color:0xffffff,roughness:.62,metalness:0,envMapIntensity:.5},{repeat:[2,2],normalScale:.5});
    const iron=new THREE.MeshStandardMaterial({color:0x243440,roughness:.66,metalness:.38});
    const brass=new THREE.MeshStandardMaterial({color:0xb58b52,roughness:.3,metalness:.72});
    const copper=new THREE.MeshStandardMaterial({color:0x80563d,roughness:.32,metalness:.65});
    const glass=new THREE.MeshStandardMaterial({color:0x173f52,roughness:.17,metalness:.35});
    this.glow=new THREE.MeshStandardMaterial({color:0xffdd9e,emissive:0xffb65c,emissiveIntensity:.7});
    let target=this.table;
    const box=(w,h,d,x,y,z,material=slate)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),material);m.position.set(x,y,z);target.add(m);return m;};
    const cyl=(r,h,x,y,z,material=brass)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,32),material);m.position.set(x,y,z);target.add(m);return m;};
    // Tiered instrument cabinet, brass seams, recessed slatted apron.
    box(.72,.06,.67,0,-.071,.025);box(.74,.008,.69,0,-.038,.025,brass);box(.71,.012,.66,0,-.028,.025,iron);
    box(.66,.055,.018,0,-.105,.35,iron);for(let i=0;i<17;i++)box(.003,.036,.006,(i-8)*.034,-.105,.362,brass);
    for(const x of [-.3,.3])for(const z of [-.25,.29]){cyl(.024,.09,x,-.14,z,iron);cyl(.028,.008,x,-.19,z,brass);}
    this.landmarkFallback=new THREE.Group();this.table.add(this.landmarkFallback);target=this.landmarkFallback;
    // Hooped copper reservoir with a sight glass.
    cyl(.047,.19,-.30,.055,-.19,copper);for(const y of [-.035,.035,.13])cyl(.05,.008,-.30,y,-.19,brass);
    box(.012,.13,.008,-.30,.05,-.141,glass);for(let i=0;i<6;i++)box(.02,.001,.004,-.30,-.01+i*.021,-.135,brass);
    // Slender gantry frames the instrument panel without blocking it.
    for(const x of [-.31,.31]){box(.035,.31,.035,x,.105,-.29,iron);box(.055,.015,.055,x,-.035,-.29,brass);box(.045,.012,.045,x,.26,-.29,brass);box(.018,.038,.018,x,.285,-.29,this.glow);box(.032,.008,.032,x,.308,-.29,iron);}
    box(.62,.018,.025,0,.24,-.29,iron);for(const x of [-.25,-.15,-.05,.05,.15,.25])box(.012,.028,.03,x,.24,-.29,brass);
    const elbow=new THREE.Mesh(new THREE.TorusGeometry(.045,.009,8,32,Math.PI),copper);elbow.position.set(.29,.065,-.19);target.add(elbow);
    cyl(.009,.1,.245,.015,-.19,copper);cyl(.009,.1,.335,.015,-.19,copper);cyl(.033,.022,.29,-.006,-.08,iron);
    for(let i=0;i<8;i++){const a=i*Math.PI/4;box(.003,.004,.006,.29+Math.cos(a)*.025,.008,-.08+Math.sin(a)*.025,brass);}
    target=this.table;
    for(const x of [-.354,.354])box(.003,.004,.54,x,-.025,.03,this.glow);
    this.room.add(skyDome());
    const floor=new THREE.Mesh(new THREE.CircleGeometry(16,48),new THREE.MeshStandardMaterial({color:0x14141a,roughness:.8,metalness:0,envMapIntensity:.35}));floor.rotation.x=-Math.PI/2;this.room.add(floor);
    this.pool=lightPool(2.2,0xffb46a,.22);this.pool.position.set(0,.002,-.3);this.room.add(this.pool);
    // Repeated vaulted bays add perspective, with no animated scenery cost.
    // An open colonnade of brick piers and arches marching toward the dusk horizon.
    const brickArch=new THREE.MeshStandardMaterial({color:0x3a2620,roughness:.85});
    for(let i=0;i<5;i++){const z=-5-i*1.6;for(const x of [-3.4,3.4]){const pier=new THREE.Mesh(new THREE.BoxGeometry(.18,2.6,.22),brickArch);pier.position.set(x,1.3,z);this.room.add(pier);const cap=new THREE.Mesh(new THREE.BoxGeometry(.24,.06,.28),brass);cap.position.set(x,2.62,z);this.room.add(cap);}const arch=new THREE.Mesh(new THREE.TorusGeometry(3.4,.12,8,40,Math.PI),brickArch);arch.position.set(0,2.6,z);this.room.add(arch);}
    this.powerMaterials=[];this.currentFlow=0;
    this.assetReady=new GLTFLoader().loadAsync(import.meta.env.BASE_URL+'assets/flowsmith-waterworks-landmark.glb').then(gltf=>{
      const landmark=gltf.scene;landmark.name='authored-waterworks';landmark.position.set(0,0,-.30);
      this.powerMaterials=bindPoweredMaterials(landmark);
      this.table.add(landmark);this.landmarkFallback.visible=false;this.landmark=landmark;
      this.setDusk(this.currentFlow);return true;
    }).catch(error=>{console.warn('Authored waterworks asset unavailable; using geometry fallback.',error);return false;});
    // Merge static cabinet pieces by material to keep its draw-call cost bounded.
    const batches=new Map();
    for(const child of [...this.table.children]){if(!child.isMesh)continue;child.updateMatrix();const geo=child.geometry.clone().applyMatrix4(child.matrix);if(!batches.has(child.material))batches.set(child.material,[]);batches.get(child.material).push(geo);this.table.remove(child);}
    for(const [material,geometries] of batches){const merged=mergeGeometries(geometries,false);this.table.add(new THREE.Mesh(merged,material));for(const geometry of geometries)geometry.dispose();}
  }
  connectSource(board) {
    if(!board.st)return;
    const index=board.st.cells.findIndex(p=>p?.type==='source');if(index<0)return;
    this.table.updateWorldMatrix(true,false);board.root.updateWorldMatrix(true,false);
    const p=board.cellCenter(Math.floor(index/board.st.cols),index%board.st.cols);
    board.root.localToWorld(p);this.table.worldToLocal(p);
    if(this.feed){this.table.remove(this.feed);this.feed.geometry.dispose();this.feed.material.dispose();}
    const points=[new THREE.Vector3(-.2579,.019,-.267),new THREE.Vector3(-.36,.02,-.29),new THREE.Vector3(-.36,-.015,p.z),new THREE.Vector3(p.x,-.015,p.z),new THREE.Vector3(p.x,.005,p.z)];
    const curve=new THREE.CatmullRomCurve3(points,false,'centripetal');
    this.feed=new THREE.Mesh(new THREE.TubeGeometry(curve,32,.0065,8,false),new THREE.MeshStandardMaterial({color:0xa7794c,metalness:.7,roughness:.3}));
    this.feed.name='reservoir-supply-line';this.table.add(this.feed);
  }
  setPassthrough(on){this.room.visible=!on;this.scene.background=on?null:HORIZON.clone();this.scene.fog=on?null:new THREE.Fog(HORIZON,3,16);}
  followAnchor(anchor){this.table.position.copy(anchor.position);this.table.rotation.y=anchor.rotation.y;}
  setDusk(f){this.currentFlow=f;for(const material of this.powerMaterials||[])setMaterialPower(material,f);this.hemi.intensity=1.1-.15*f;this.sun.intensity=2.5-.35*f;this.glow.emissiveIntensity=.7+f*2;if(this.pool)this.pool.material.opacity=.22+f*.16;LOOK.lit.value=f;}
}
