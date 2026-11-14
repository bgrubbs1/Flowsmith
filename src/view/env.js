// Lights, reflections and a simple cosy room for VR and the desktop preview. In passthrough only the lights stay.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export class Environment {
  constructor(scene, renderer) {
    this.scene = scene;
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.9;
    const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6b5a48, 1.2);
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.6);
    sun.position.set(0.6, 2, 0.8);
    scene.add(hemi, sun);
    this.hemi = hemi; this.sun = sun;
    this.room = new THREE.Group();
    scene.add(this.room);
    // Sky gradient dome.
    const sky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x24324f) }, bottom: { value: new THREE.Color(0xe9a36f) } },
      vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 p; void main(){ gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0, 0.35, p.y)), 1.0);\n#include <tonemapping_fragment>\n#include <colorspace_fragment>\n}',
    }));
    this.room.add(sky);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 48), new THREE.MeshStandardMaterial({ color: 0x3b3f4a, roughness: 1 }));
    floor.rotation.x = -Math.PI / 2;
    this.room.add(floor);
    // A table the board sits on (it follows the board anchor in VR).
    this.table = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.03, 64), new THREE.MeshStandardMaterial({ color: 0x2e3440, roughness: 0.55, metalness: 0.1 }));
    top.position.y = -0.04;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1, 16), new THREE.MeshStandardMaterial({ color: 0x232831, roughness: 0.8 }));
    leg.position.y = -0.55;
    this.table.add(top, leg);
    this.room.add(this.table);
  }
  setPassthrough(on) {
    this.room.visible = !on;
    this.scene.background = null;
  }
  followAnchor(anchor) {
    this.table.position.copy(anchor.position);
    this.table.rotation.y = anchor.rotation.y;
  }
  // As the valley lights up, the daylight fades so the lanterns and mill windows carry the scene.
  setDusk(f) {
    this.hemi.intensity = 1.2 - 0.65 * f;
    this.sun.intensity = 1.6 - 0.9 * f;
  }
}
