// Power-ups dropped by big monsters: repair, missiles and boost. Each floats above the
// ground inside a tall beam of light so it can be found from far away.
import * as THREE from 'three';

export const PICKUPS = {
  repair: { color: 0x40ff80, name: 'תיקון', text: '+35 שריון' },
  ammo: { color: 0xffb020, name: 'טילים', text: 'טילים מלאים' },
  boost: { color: 0x40c0ff, name: 'טורבו', text: 'טורבו מלא' },
};

export class Pickups {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;
    this.list = [];
    this.coreGeo = new THREE.OctahedronGeometry(3.2, 0);
    this.ringGeo = new THREE.TorusGeometry(5, 0.35, 8, 32);
    this.beamGeo = new THREE.CylinderGeometry(3, 6, 1, 20, 1, true).translate(0, 0.5, 0);
    this.beamMat = {};
    this.mats = {};
    for (const [k, p] of Object.entries(PICKUPS)) {
      const c = new THREE.Color(p.color);
      this.mats[k] = new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.2 });
      this.beamMat[k] = new THREE.ShaderMaterial({
        uniforms: { uColor: { value: c.clone().multiplyScalar(2.5) }, uTime: { value: 0 } },
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
void main(){ float a = pow(1.0 - vUv.y, 1.5) * 0.35 * (0.8 + 0.2 * sin(uTime * 3.0 + vUv.y * 20.0)); gl_FragColor = vec4(uColor * a, a); }`,
      });
    }
  }

  spawn(kind, at) {
    const g = new THREE.Group();
    const core = new THREE.Mesh(this.coreGeo, this.mats[kind]);
    const ring = new THREE.Mesh(this.ringGeo, this.mats[kind]);
    const beam = new THREE.Mesh(this.beamGeo, this.beamMat[kind]);
    beam.scale.set(1, 260, 1);
    beam.position.y = -40;
    beam.renderOrder = 7;
    g.add(core, ring, beam);
    const ground = this.terrain.groundOrWater(at.x, at.z);
    const pos = new THREE.Vector3(at.x, ground + 34, at.z);
    g.position.copy(pos);
    this.scene.add(g);
    const p = { kind, group: g, core, ring, pos, life: 45, t: Math.random() * 10 };
    this.list.push(p);
    return p;
  }

  update(dt, time, jet, onCollect) {
    for (const m of Object.values(this.beamMat)) m.uniforms.uTime.value = time;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      p.life -= dt;
      p.core.rotation.y += dt * 2;
      p.core.position.y = Math.sin(p.t * 2) * 1.5;
      p.ring.rotation.x = Math.PI / 2 + Math.sin(p.t) * 0.3;
      p.ring.rotation.z += dt;
      const blink = p.life < 8 ? (Math.sin(p.t * 12) > 0 ? 1 : 0.2) : 1;
      p.group.visible = blink > 0.5 || p.life > 8;
      if (jet.alive && jet.pos.distanceTo(p.pos) < 26) {
        onCollect(p.kind, p.pos);
        this.remove(i);
      } else if (p.life <= 0) this.remove(i);
    }
  }

  remove(i) {
    this.scene.remove(this.list[i].group);
    this.list.splice(i, 1);
  }

  clear() { while (this.list.length) this.remove(this.list.length - 1); }
}
