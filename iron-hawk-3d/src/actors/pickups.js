// Supply crates dropped by the bigger monsters. They float in the air for a while inside a
// short column of light; shooting one open collects it: repair for the shield, a full rack
// of missiles, or coolant that stops the cannons overheating for a while.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { canvasTexture } from '../core/textures.js';

export const PICKUPS = {
  repair: { color: 0x40ff80, name: 'תיקון', text: '+25 מגן' },
  ammo: { color: 0xffb020, name: 'טילים', text: 'מדף טילים מלא' },
  cool: { color: 0x40c0ff, name: 'קירור', text: 'בלי התחממות ל־10 שניות' },
};

function crateFace(kind, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#23272c';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#3a4048';
  g.lineWidth = 6;
  g.strokeRect(10, 10, 108, 108);
  g.beginPath(); g.moveTo(14, 14); g.lineTo(114, 114); g.moveTo(114, 14); g.lineTo(14, 114); g.stroke();
  g.fillStyle = '#' + new THREE.Color(color).getHexString();
  g.strokeStyle = g.fillStyle;
  g.lineWidth = 12;
  g.fillRect(0, 0, 128, 7); g.fillRect(0, 121, 128, 7); g.fillRect(0, 0, 7, 128); g.fillRect(121, 0, 7, 128);
  g.fillStyle = '#1a1d21';
  g.beginPath(); g.arc(64, 64, 34, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#' + new THREE.Color(color).getHexString();
  if (kind === 'repair') { g.fillRect(56, 38, 16, 52); g.fillRect(38, 56, 52, 16); }
  if (kind === 'ammo') {
    g.beginPath(); g.moveTo(64, 34); g.lineTo(74, 50); g.lineTo(74, 80); g.lineTo(82, 92); g.lineTo(46, 92); g.lineTo(54, 80); g.lineTo(54, 50); g.closePath(); g.fill();
  }
  if (kind === 'cool') {
    g.lineWidth = 7;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      g.beginPath(); g.moveTo(64 - Math.cos(a) * 26, 64 - Math.sin(a) * 26); g.lineTo(64 + Math.cos(a) * 26, 64 + Math.sin(a) * 26); g.stroke();
    }
  }
  return canvasTexture(c, true);
}

export class Pickups {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.list = [];
    this.onTake = null;
    this.fx = null;
    this.geo = new RoundedBoxGeometry(2.6, 2.6, 2.6, 2, 0.25);
    this.beamGeo = new THREE.CylinderGeometry(1.6, 2.6, 1, 16, 1, true).translate(0, 0.5, 0);
    this.mats = {};
    this.beamMat = {};
    for (const [k, p] of Object.entries(PICKUPS)) {
      const col = new THREE.Color(p.color);
      const map = crateFace(k, p.color);
      this.mats[k] = new THREE.MeshStandardMaterial({ map, emissiveMap: map, emissive: col, emissiveIntensity: 1.6, roughness: 0.5, metalness: 0.4 });
      this.beamMat[k] = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: col.clone().multiplyScalar(2.5) }, uTime: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
void main(){ float a = pow(1.0 - vUv.y, 1.5) * 0.3 * (0.8 + 0.2 * sin(uTime * 3.0 + vUv.y * 20.0)); gl_FragColor = vec4(uColor * a, a); }`,
      });
    }
  }

  spawn(kind, at) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(this.geo, this.mats[kind]);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat[kind]);
    beam.scale.set(1, 60, 1);
    beam.position.y = -30;
    beam.renderOrder = 7;
    g.add(box, beam);
    const ground = this.terrain.groundOrWater(at.x, at.z);
    const pos = new THREE.Vector3(at.x, Math.max(at.y, ground + 2) + 3.5, at.z);
    g.position.copy(pos);
    this.scene.add(g);
    const p = { kind, group: g, box, pos, life: 22, t: Math.random() * 10, taken: false };
    this.list.push(p);
    return p;
  }

  // shot open
  take(p) {
    if (p.taken) return;
    p.taken = true;
    this.onTake?.(p.kind, p.pos.clone());
    this.remove(this.list.indexOf(p));
  }

  update(dt, time) {
    for (const m of Object.values(this.beamMat)) m.uniforms.uTime.value = time;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      p.life -= dt;
      p.box.rotation.y += dt * 1.2;
      p.box.rotation.x = Math.sin(p.t * 0.8) * 0.25;
      p.box.position.y = Math.sin(p.t * 2) * 0.6;
      p.group.visible = p.life > 5 || Math.sin(p.t * 12) > 0;
      if (p.life <= 0) this.remove(i);
    }
  }

  remove(i) {
    if (i < 0) return;
    this.scene.remove(this.list[i].group);
    this.list.splice(i, 1);
  }

  clear() { while (this.list.length) this.remove(this.list.length - 1); }
}
