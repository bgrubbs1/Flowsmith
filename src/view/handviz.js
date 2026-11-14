// Draws tracked hands as soft capsule skeletons plus a pinch cursor that closes as the fingers meet.
// In passthrough the real hands are visible, so only fingertips and the cursor are drawn.
import * as THREE from 'three';

const BONES = [];
for (const base of [1, 5, 10, 15, 20]) {
  const n = base === 1 ? 4 : 5;
  BONES.push([0, base]);
  for (let k = 0; k < n - 1; k++) BONES.push([base + k, base + k + 1]);
}
BONES.push([5, 10], [10, 15], [15, 20]); // knuckle line

export class HandViz {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.full = true;
    const skin = new THREE.MeshStandardMaterial({ color: 0xf3d9c4, roughness: 0.6, transparent: true, opacity: 0.92 });
    // In passthrough the real hands should appear in front of virtual pipes: draw the tracked hand
    // into the depth buffer only, so it cuts a hand-shaped window through the scene to the camera feed.
    const occluder = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: true });
    this.skin = skin; this.occluder = occluder;
    const joint = new THREE.SphereGeometry(1, 10, 8);
    const bone = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    bone.translate(0, 0.5, 0);
    this.hands = ['left', 'right'].map(() => {
      const joints = new THREE.InstancedMesh(joint, skin, 25);
      const bones = new THREE.InstancedMesh(bone, skin, BONES.length);
      const cursor = new THREE.Mesh(new THREE.RingGeometry(0.009, 0.0115, 28), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthTest: false }));
      cursor.renderOrder = 10;
      const dot = new THREE.Mesh(new THREE.CircleGeometry(0.0045, 20), new THREE.MeshBasicMaterial({ color: 0xffd36b, side: THREE.DoubleSide, depthTest: false }));
      dot.renderOrder = 11;
      cursor.add(dot);
      joints.visible = bones.visible = cursor.visible = false;
      joints.frustumCulled = bones.frustumCulled = false;
      this.group.add(joints, bones, cursor);
      return { joints, bones, cursor, dot };
    });
    this.m = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.s = new THREE.Vector3(); this.d = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
  }
  update(states, camera) {
    states.forEach((h, k) => {
      const v = this.hands[k];
      if (!v) return;
      const show = h.present;
      v.cursor.visible = show;
      const skeleton = show && h.kind === 'hand';
      v.joints.visible = v.bones.visible = skeleton;
      const m = this.full ? this.skin : this.occluder;
      if (v.joints.material !== m) { v.joints.material = v.bones.material = m; v.joints.renderOrder = v.bones.renderOrder = this.full ? 0 : -10; }
      if (skeleton) {
        for (let i = 0; i < 25; i++) {
          const tip = i === 4 || i === 9 || i === 14 || i === 19 || i === 24;
          const r = Math.max(0.0055, h.radii[i] * (this.full ? 0.95 : 1.05));
          this.m.compose(h.joints[i], this.q.identity(), this.s.setScalar(r));
          v.joints.setMatrixAt(i, this.m);
        }
        BONES.forEach(([a, b], i) => {
          const pa = h.joints[a], pb = h.joints[b];
          this.d.subVectors(pb, pa);
          const len = this.d.length();
          this.q.setFromUnitVectors(this.up, this.d.normalize());
          const r = Math.max(0.0045, h.radii[b] * (this.full ? 0.8 : 0.95));
          this.m.compose(pa, this.q, this.s.set(r, len, r));
          v.bones.setMatrixAt(i, this.m);
        });
        v.joints.instanceMatrix.needsUpdate = true;
        v.bones.instanceMatrix.needsUpdate = true;
      }
      if (show) {
        v.cursor.position.copy(h.pinchPoint);
        if (camera) v.cursor.quaternion.copy(camera.getWorldQuaternion(this.q));
        const closeness = Math.min(1, Math.max(0, (0.06 - h.pinchDist) / 0.045));
        v.dot.scale.setScalar(h.pinch.down ? 1.6 : 0.4 + closeness * 0.8);
        v.dot.material.color.setHex(h.pinch.down ? 0x7be08f : 0xffd36b);
        v.cursor.scale.setScalar(h.kind === 'mouse' ? 0.8 : 1);
      }
    });
  }
}
