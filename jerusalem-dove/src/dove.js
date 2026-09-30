// The hero dove: procedural model with flapping wings, or a loaded GLB (e.g. from Tripo).
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export const SKINS = {
  white: { name: 'יונה לבנה', body: 0xf7f5f0, tip: 0x9fc6e8, accent: 0xe8c56a },
  sky:   { name: 'תכלת וזהב', body: 0xe4eef8, tip: 0x3b7fd1, accent: 0xf2c14e },
  sunset:{ name: 'שקיעה', body: 0xffe7d1, tip: 0xe0673a, accent: 0xb33a6e },
  gold:  { name: 'יונת הזהב', body: 0xf6d27a, tip: 0xffb627, accent: 0xfff2b0, metal: true, secret: true },
};

function featherShape(len, chord, feathers) {
  // Wing outline with a scalloped trailing edge (feather tips).
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(len * 0.3, chord * 0.25, len * 0.75, chord * 0.2, len, chord * 0.05);
  for (let i = feathers; i >= 0; i--) {
    const x = (i / feathers) * len;
    const y = -chord * (0.75 + 0.25 * Math.sin((i / feathers) * Math.PI)) * (1 - 0.35 * (i / feathers));
    const px = ((i + 0.5) / feathers) * len;
    s.quadraticCurveTo(px, y - chord * 0.12, x, y);
  }
  s.lineTo(0, -chord * 0.6);
  s.closePath();
  return s;
}

function wingMaterial(skin, tipMix) {
  const c = new THREE.Color(skin.body).lerp(new THREE.Color(skin.tip), tipMix);
  return new THREE.MeshStandardMaterial({ color: c, roughness: skin.metal ? 0.3 : 0.7, metalness: skin.metal ? 0.8 : 0, side: THREE.DoubleSide });
}

export class Dove {
  constructor() {
    this.root = new THREE.Group();      // moved by physics
    this.visual = new THREE.Group();    // banking/pitch visual tweaks
    this.root.add(this.visual);
    this.visual.scale.setScalar(1.7);
    this.flap = 0;
    this.flapSpeed = 6;
    this.flapAmp = 0.5;
    this.glb = null;
    this.skin = 'white';
    this.build();
  }

  build() {
    this.visual.clear();
    const skin = SKINS[this.skin];
    const bodyMat = new THREE.MeshStandardMaterial({ color: skin.body, roughness: skin.metal ? 0.28 : 0.65, metalness: skin.metal ? 0.85 : 0 });
    const accentMat = new THREE.MeshStandardMaterial({ color: skin.accent, roughness: 0.35, metalness: 0.6 });
    if (this.glb) {
      const m = this.glb.clone(true);
      this.visual.add(m);
      this.wings = null;
      return;
    }
    const g = this.visual;
    // Body (forward = -Z).
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), bodyMat);
    body.scale.set(0.62, 0.58, 1.35);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 14), bodyMat);
    chest.position.set(0, -0.08, -0.7); chest.scale.set(1, 0.95, 1.05);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 20, 14), bodyMat);
    head.position.set(0, 0.42, -1.3);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 10), new THREE.MeshStandardMaterial({ color: 0xd9a26b, roughness: 0.5 }));
    beak.rotation.x = -Math.PI / 2; beak.position.set(0, 0.36, -1.82);
    const cere = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    cere.position.set(0, 0.45, -1.68);
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
    const eyeRing = new THREE.MeshStandardMaterial({ color: skin.accent, roughness: 0.4 });
    for (const s of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), eyeRing); ring.position.set(s * 0.33, 0.52, -1.46);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), eyeMat); eye.position.set(s * 0.37, 0.53, -1.49);
      g.add(ring, eye);
    }
    // Tail fan.
    const tailShape = new THREE.Shape();
    tailShape.moveTo(-0.22, 0);
    tailShape.lineTo(-0.7, 1.35);
    for (let i = 0; i <= 6; i++) { const x = -0.7 + (1.4 * i) / 6; tailShape.quadraticCurveTo(x - 0.12, 1.55, x, 1.4); }
    tailShape.lineTo(0.22, 0);
    const tail = new THREE.Mesh(new THREE.ShapeGeometry(tailShape), wingMaterial(skin, 0.35));
    tail.rotation.x = -Math.PI / 2 + 0.12; tail.position.set(0, 0.05, 1.05);
    // Olive branch in beak.
    const branch = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 5), accentMat);
    stem.rotation.z = Math.PI / 2; branch.add(stem);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x6f8f3a, roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 4), leafMat);
      leaf.scale.set(1.7, 0.25, 0.6);
      leaf.position.set(-0.45 + i * 0.18, (i % 2 ? 0.07 : -0.07), 0);
      leaf.rotation.z = i % 2 ? 0.5 : -0.5;
      branch.add(leaf);
    }
    branch.position.set(0.15, 0.3, -1.85);
    g.add(body, chest, head, beak, cere, tail, branch);

    // Wings: shoulder pivot -> inner segment -> wrist pivot -> outer segment.
    this.wings = [];
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Group();
      shoulder.position.set(side * 0.45, 0.25, -0.45);
      const innerGeo = new THREE.ShapeGeometry(featherShape(1.6, 1.25, 5));
      const inner = new THREE.Mesh(innerGeo, wingMaterial(skin, 0.05));
      inner.rotation.x = -Math.PI / 2;
      const wrist = new THREE.Group();
      wrist.position.set(1.55, 0, 0);
      const outer = new THREE.Mesh(new THREE.ShapeGeometry(featherShape(2.1, 1.05, 7)), wingMaterial(skin, 0.65));
      outer.rotation.x = -Math.PI / 2;
      wrist.add(outer);
      const holder = new THREE.Group();
      holder.add(inner, wrist);
      holder.scale.x = side;
      shoulder.add(holder);
      g.add(shoulder);
      this.wings.push({ shoulder, wrist, side });
    }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  }

  setSkin(name) { this.skin = name; this.build(); }

  async loadGLB(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    const m = gltf.scene;
    // Normalize: fit ~4 units long, centered, facing -Z.
    const box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const s = 4 / Math.max(size.x, size.y, size.z);
    const wrap = new THREE.Group();
    m.position.sub(center);
    wrap.add(m); wrap.scale.setScalar(s);
    wrap.rotation.y = Math.PI; // Tripo models usually face +Z
    wrap.traverse(o => { if (o.isMesh) o.castShadow = true; });
    this.glb = wrap;
    this.glbMixer = gltf.animations?.length ? new THREE.AnimationMixer(m) : null;
    if (this.glbMixer) this.glbMixer.clipAction(gltf.animations[0]).play();
    this.build();
  }

  // speed01: 0..1, flapping: burst factor, dt seconds
  update(dt, speed01, flapBoost, bank) {
    this.flapSpeed = THREE.MathUtils.lerp(this.flapSpeed, 5 + flapBoost * 9 + (1 - speed01) * 3, dt * 4);
    this.flapAmp = THREE.MathUtils.lerp(this.flapAmp, 0.18 + flapBoost * 0.55 + (1 - speed01) * 0.25, dt * 4);
    this.flap += dt * this.flapSpeed;
    const f = Math.sin(this.flap);
    if (this.wings) {
      for (const w of this.wings) {
        w.shoulder.rotation.z = w.side * (f * this.flapAmp + 0.05) ;
        w.wrist.rotation.z = -w.side * (Math.max(0, -f) * this.flapAmp * 0.9 - 0.04);
        w.shoulder.rotation.y = -w.side * 0.08;
      }
    } else if (this.glb) {
      this.glb.position.y = f * 0.12;
      this.glbMixer?.update(dt);
    }
    this.visual.position.y = -f * 0.08 * this.flapAmp;
  }
}
