import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ParticleSystem, Emitter } from '../engine/fx/Particles.js';

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function paint(g, hex, dark = null) {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex);
  const d = dark ? new THREE.Color(dark.color) : null;
  const p = g.attributes.position;
  const a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) (d && dark.test(p.getX(i), p.getY(i), p.getZ(i)) ? d : c).toArray(a, i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}

/**
 * The spaceport in the city: a launch mount over a flame trench, a
 * lattice tower with swing arms, tank farm, and a two-stage rocket — a
 * super-heavy booster (33 engines, grid fins, chines, a vented hot-stage
 * ring, frost over its tanks) with a steel spaceship on top (heat-shield
 * tiles, flaps, sea-level and vacuum engines). It stands there in every
 * visit to the city, and it flies at the start of the space race.
 */
export class Spaceport {
  constructor(engine, materials, pad) {
    this.engine = engine;
    this.materials = materials;
    this.pad = pad;
    this.group = new THREE.Group();
    this.group.name = 'נמל חלל';
  }

  build() {
    const P = this.pad;
    const base = P.h;
    this.top = base + 18; // launch mount deck
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });
    this.mat = mat;
    const parts = [];
    // Launch mount: a ring table on six legs over the trench, on a concrete apron.
    parts.push(paint(new THREE.CylinderGeometry(55, 58, 1.2, 40).translate(0, 0.6, 0), 0xb9b6ae));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      parts.push(paint(new THREE.BoxGeometry(2.4, 17, 2.4).translate(Math.cos(a) * 9, 8.5, Math.sin(a) * 9), 0x55595e));
    }
    parts.push(paint(new THREE.TorusGeometry(8.5, 1.4, 8, 24).rotateX(Math.PI / 2).translate(0, 17.3, 0), 0x6b6f75));
    parts.push(paint(new THREE.BoxGeometry(12, 1.2, 60).translate(0, 0.9, 40), 0x2a2a2a)); // trench, both ways
    parts.push(paint(new THREE.BoxGeometry(12, 1.2, 60).translate(0, 0.9, -40), 0x2a2a2a));
    // Tower: four columns, braces every 6 m, two swing arms.
    const tx = 20;
    const H = 110;
    for (const [dx, dz] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) parts.push(paint(new THREE.BoxGeometry(1, H, 1).translate(tx + dx, H / 2, dz), 0x3c4046));
    for (let y = 6; y < H; y += 6) {
      parts.push(paint(new THREE.BoxGeometry(9, 0.5, 0.5).translate(tx, y, -4), 0x3c4046));
      parts.push(paint(new THREE.BoxGeometry(9, 0.5, 0.5).translate(tx, y, 4), 0x3c4046));
      parts.push(paint(new THREE.BoxGeometry(0.5, 0.5, 9).translate(tx - 4, y, 0), 0x3c4046));
      parts.push(paint(new THREE.BoxGeometry(0.5, 0.5, 9).translate(tx + 4, y, 0), 0x3c4046));
    }
    parts.push(paint(new THREE.BoxGeometry(10, 4, 10).translate(tx, H + 2, 0), 0xd94a3a));
    parts.push(paint(new THREE.BoxGeometry(0.4, 12, 0.4).translate(tx, H + 10, 0), 0xdddddd));
    // Tank farm.
    for (let k = 0; k < 4; k++) {
      parts.push(paint(new THREE.SphereGeometry(7, 14, 10).translate(-40 + k * 16, 7, -44), 0xeeeeea));
      parts.push(paint(new THREE.CylinderGeometry(3.5, 3.5, 22, 12).rotateZ(Math.PI / 2).translate(-38 + k * 14, 4, 46), 0xdcdcd6));
    }
    const pad = new THREE.Mesh(mergeGeometries(parts), mat);
    pad.castShadow = true;
    pad.receiveShadow = true;
    pad.name = 'כן שיגור';
    this.group.add(pad);
    // Swing arms (they rotate away before liftoff).
    this.arms = [];
    for (const [y, len] of [[this.top - base + 58, 13], [this.top - base + 78, 13]]) {
      const arm = new THREE.Group();
      arm.position.set(tx - 4, y, 0);
      const beam = new THREE.Mesh(paint(new THREE.BoxGeometry(len, 2.2, 2.6).translate(-len / 2, 0, 0), 0x6b6f75), mat);
      arm.add(beam);
      this.group.add(arm);
      this.arms.push(arm);
    }
    this.group.position.set(P.x, base, P.z);
    // The rocket.
    this.rocket = this._rocket();
    this.group.add(this.rocket.group);
    this.reset();
    this.group.traverse((o) => (o.userData.noPick = true));
    return this.group;
  }

  _rocket() {
    const steel = 0xc9ccd0;
    const dark = 0x1c1d20;
    const tiles = { color: dark, test: (x) => x < -1.2 };
    const R = 4.5;
    const booster = [];
    booster.push(paint(new THREE.CylinderGeometry(R, R, 50, 40, 12).translate(0, 25, 0), steel));
    // Aft skirt and the engine shield.
    booster.push(paint(new THREE.CylinderGeometry(R * 1.02, R * 1.04, 3, 40, 1, true).translate(0, 1.5, 0), 0xb8bbc0));
    booster.push(paint(new THREE.CylinderGeometry(R * 0.98, R * 0.98, 0.3, 40).translate(0, 0.1, 0), 0x2a2c30));
    // Hot-staging ring: a band of vents.
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      booster.push(paint(new THREE.BoxGeometry(0.9, 1.3, 0.25).translate(0, 49.2, R + 0.02).rotateY(a), 0x202226));
    }
    // Chines: two long fairings down the sides.
    for (const s of [1, -1]) booster.push(paint(new THREE.BoxGeometry(0.6, 42, 0.9).translate(s * (R + 0.2), 24, 0), 0xb0b3b8));
    // Grid fins: open lattices near the top.
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const fin = [];
      fin.push(new THREE.BoxGeometry(0.35, 3.4, 0.2).translate(0, 0, 1.8), new THREE.BoxGeometry(0.35, 3.4, 0.2).translate(0, 0, -1.8), new THREE.BoxGeometry(0.35, 0.2, 3.8).translate(0, 1.6, 0), new THREE.BoxGeometry(0.35, 0.2, 3.8).translate(0, -1.6, 0));
      for (let j = -2; j <= 2; j++) {
        fin.push(new THREE.BoxGeometry(0.3, 3.2, 0.06).rotateX(0.785).translate(0, 0, j * 0.7));
        fin.push(new THREE.BoxGeometry(0.3, 3.2, 0.06).rotateX(-0.785).translate(0, 0, j * 0.7));
      }
      booster.push(...fin.map((g) => paint(g.translate(R + 0.45, 45.5, 0).rotateY(a), 0x3a3d42)));
    }
    // Thirty-three engines: 3 in the middle, 10 round them, 20 on the rim.
    const bells = [];
    const ring = (n, r, off = 0) => {
      for (let k = 0; k < n; k++) bells.push([Math.cos((k / n) * Math.PI * 2 + off) * r, Math.sin((k / n) * Math.PI * 2 + off) * r]);
    };
    ring(3, 0.75, 0.5);
    ring(10, 2.25);
    ring(20, 3.75, 0.1);
    for (const [x, z] of bells) {
      booster.push(paint(new THREE.CylinderGeometry(0.28, 0.55, 1.3, 10, 1, true).translate(x, -0.65, z), 0x2b2b2e));
      booster.push(paint(new THREE.CylinderGeometry(0.2, 0.28, 0.5, 8).translate(x, 0.05, z), 0x55595f));
    }
    this.bells = bells;
    const ship = [];
    ship.push(paint(new THREE.CylinderGeometry(R, R, 32, 40, 8).translate(0, 16, 0), steel, tiles));
    const nose = new THREE.LatheGeometry(
      [
        [R, 0],
        [R * 0.99, 2.5],
        [R * 0.93, 5],
        [R * 0.8, 7.5],
        [R * 0.6, 9.8],
        [R * 0.36, 11.7],
        [R * 0.12, 12.8],
        [0.01, 13.1],
      ].map(([r, y]) => new THREE.Vector2(r, y)),
      40,
    ).translate(0, 32, 0);
    ship.push(paint(nose, steel, tiles));
    // Flaps: trapezoid panels, forward pair high on the nose, aft pair at the base.
    const flap = (h, w0, w1, t) => {
      const shape = new THREE.Shape([new THREE.Vector2(0, -h / 2), new THREE.Vector2(w0, -h / 2), new THREE.Vector2(w1, h / 2), new THREE.Vector2(0, h / 2)]);
      return new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false }).translate(0, 0, -t / 2);
    };
    for (const side of [-1, 1]) {
      ship.push(paint(flap(5.5, 2.4, 1.2, 0.35).rotateY(side > 0 ? 0 : Math.PI).translate(side * (R - 0.4), 38.5, 0), dark));
      ship.push(paint(flap(9, 3.4, 2.2, 0.4).rotateY(side > 0 ? 0 : Math.PI).translate(side * (R - 0.4), 5, 0), dark));
    }
    // Three sea-level engines and three big vacuum bells.
    for (let k = 0; k < 3; k++) ship.push(paint(new THREE.CylinderGeometry(0.35, 0.8, 1.5, 12, 1, true).translate(Math.cos(k * 2.1) * 1.1, -0.75, Math.sin(k * 2.1) * 1.1), 0x2b2b2e));
    for (let k = 0; k < 3; k++) ship.push(paint(new THREE.CylinderGeometry(0.5, 1.25, 2.3, 14, 1, true).translate(Math.cos(k * 2.1 + 1.05) * 2.9, -1.15, Math.sin(k * 2.1 + 1.05) * 2.9), 0x2b2b2e));
    // Stainless steel: weld rings and seams, frost over the cold tanks, the ship's tiles.
    this.frost = { value: 1 };
    const mat = this._steel(this.frost, true);
    const shipMat = this._steel({ value: 0 }, false);
    this.rocketMat = mat;
    this.shipMat = shipMat;
    const bMesh = new THREE.Mesh(mergeGeometries(booster), mat);
    const sMesh = new THREE.Mesh(mergeGeometries(ship), shipMat);
    bMesh.castShadow = sMesh.castShadow = true;
    // Engine glow: a disc of fire under each stage when it burns.
    const glow = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffc070, emissiveIntensity: 1 });
    this.materials.trackEmissive(glow, 0);
    this.glowMat = glow;
    const bGlow = new THREE.Mesh(new THREE.CircleGeometry(R * 0.95, 32).rotateX(Math.PI / 2).translate(0, -1.35, 0), glow);
    const group = new THREE.Group();
    const bGroup = new THREE.Group();
    bGroup.add(bMesh, bGlow);
    const sGroup = new THREE.Group();
    sGroup.add(sMesh);
    sGroup.position.y = 50;
    // The flame: a long bright core with shock diamonds, stretched by thrust and altitude.
    const flameMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uPower: { value: 0 }, uHot: { value: new THREE.Color(1, 0.72, 0.38) } },
      vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
      fragmentShader: `uniform float uTime; uniform float uPower; uniform vec3 uHot; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
        void main(){
          float along = 1.0 - vUv.y; // 0 at the engines, 1 at the tail of the flame
          float rim = abs(dot(vN, vV));
          float core = pow(rim, 1.5);
          float flick = 0.85 + 0.15 * sin(uTime * 60.0 + along * 30.0);
          float diamonds = 0.6 + 0.4 * smoothstep(0.55, 1.0, sin(along * 34.0 - uTime * 4.0) * 0.5 + 0.5) * (1.0 - along);
          float fade = pow(1.0 - along, 1.6);
          vec3 col = mix(uHot, vec3(1.0, 0.97, 0.9), core * (1.0 - along));
          float a = fade * core * diamonds * flick * uPower;
          gl_FragColor = vec4(col * a * 2.0, a);
        }`,
    });
    this.flameMat = flameMat;
    const flameGeo = new THREE.CylinderGeometry(R * 0.85, R * 0.55, 1, 28, 12, true).translate(0, -0.5, 0);
    const flame = new THREE.Mesh(flameGeo, flameMat);
    flame.position.y = -1.3;
    flame.scale.set(1, 0.001, 1);
    flame.frustumCulled = false;
    flame.renderOrder = 22;
    bGroup.add(flame);
    const sFlameMat = flameMat.clone();
    sFlameMat.uniforms = { uTime: flameMat.uniforms.uTime, uPower: { value: 0 }, uHot: { value: new THREE.Color(0.55, 0.62, 1) } };
    this.shipFlameMat = sFlameMat;
    const sFlame = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.6, R * 0.3, 1, 24, 8, true).translate(0, -0.5, 0), sFlameMat);
    sFlame.position.y = -2.2;
    sFlame.scale.set(1, 0.001, 1);
    sFlame.frustumCulled = false;
    sFlame.renderOrder = 22;
    sGroup.add(sFlame);
    group.add(bGroup, sGroup);
    group.name = 'רקטה';
    // The engines light the pad and the smoke.
    const light = new THREE.PointLight(0xffa860, 0, 900, 1.6);
    light.position.y = -6;
    bGroup.add(light);
    return { group, booster: bGroup, ship: sGroup, flame, sFlame, light };
  }

  /** Stainless steel with weld rings and panel seams; `frost` whitens the tank walls (booster), tiles get a hex grid (ship). */
  _steel(frost, isBooster) {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.85 });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uFrost = frost;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vLocal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vLocal; uniform float uFrost;\nfloat lh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\nfloat ln(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lh(i), lh(i + vec2(1.0, 0.0)), f.x), mix(lh(i + vec2(0.0, 1.0)), lh(i + vec2(1.0, 1.0)), f.x), f.y); }')
        .replace(
          '#include <roughnessmap_fragment>',
          `#include <roughnessmap_fragment>
          float ang = atan(vLocal.z, vLocal.x);
          float arc = ang * 4.5;
          float lum = dot(diffuseColor.rgb, vec3(0.333));
          // Weld rings every 1.8 m and vertical panel seams.
          float ringL = 1.0 - smoothstep(0.0, 0.035, abs(fract(vLocal.y / 1.8) - 0.5) * 1.8 - 0.86);
          float seamL = 1.0 - smoothstep(0.0, 0.03, abs(fract(ang / 6.2831853 * 12.0) - 0.5) - 0.47);
          if (lum > 0.45) {
            diffuseColor.rgb *= 1.0 - 0.14 * max(ringL, seamL);
            // Faint heat tint and streaks.
            diffuseColor.rgb *= 0.93 + 0.1 * ln(vec2(arc * 0.6, vLocal.y * 0.08));
          } else if (lum < 0.14) {
            // Heat-shield tiles: a staggered grid of dark hexagon-ish tiles with pale gaps.
            vec2 h = vec2(arc, vLocal.y) / 0.9;
            h.x += step(1.0, mod(floor(h.y), 2.0)) * 0.5;
            vec2 f = fract(h) - 0.5;
            float gap = smoothstep(0.42, 0.48, max(abs(f.x) * 1.15 + abs(f.y) * 0.35, abs(f.y)));
            diffuseColor.rgb = mix(diffuseColor.rgb * (0.85 + 0.3 * lh(floor(h))), vec3(0.35), gap * 0.6);
            roughnessFactor = 0.85;
          }
          ${isBooster ? `// Frost over the cold propellant tanks before launch.
          float fz = smoothstep(4.0, 7.0, vLocal.y) * smoothstep(44.0, 40.0, vLocal.y);
          float fp = smoothstep(0.35, 0.7, ln(vec2(arc * 1.4, vLocal.y * 0.5)) * 0.7 + ln(vec2(arc * 5.0, vLocal.y * 2.0)) * 0.3);
          float fr = uFrost * fz * fp;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.97, 1.0), fr * 0.85);
          roughnessFactor = mix(roughnessFactor, 0.9, fr);` : ''}`,
        )
        .replace(
          '#include <metalnessmap_fragment>',
          `#include <metalnessmap_fragment>
          ${isBooster ? 'metalnessFactor = mix(metalnessFactor, 0.05, uFrost * smoothstep(4.0, 7.0, vLocal.y) * smoothstep(44.0, 40.0, vLocal.y) * 0.8);' : ''}
          if (dot(diffuseColor.rgb, vec3(0.333)) < 0.2) metalnessFactor = 0.1;`,
        );
    };
    mat.customProgramCacheKey = () => (isBooster ? 'rocket-steel-b' : 'rocket-steel-s');
    return mat;
  }

  /** Rocket back on the mount, arms in. */
  reset() {
    const r = this.rocket;
    r.group.position.set(0, this.top - this.pad.h + 1, 0);
    r.group.rotation.set(0, 0, 0);
    r.group.visible = true;
    r.group.add(r.booster);
    r.booster.position.set(0, 0, 0);
    r.booster.rotation.set(0, 0, 0);
    r.ship.position.set(0, 50, 0);
    for (const a of this.arms) a.rotation.y = 0;
    this.frost.value = 1;
    r.flame.scale.set(1, 0.001, 1);
    r.sFlame.scale.set(1, 0.001, 1);
    this.flameMat.uniforms.uPower.value = 0;
    this.shipFlameMat.uniforms.uPower.value = 0;
    r.light.intensity = 0;
    this.materials.setEmissiveBase(this.glowMat, 0);
  }

  // ---------------------------------------------------------------- launch

  /**
   * The launch, as a film in nine shots: the spaceport from the air; low
   * under the rocket as it vents and the arms swing away; ignition across
   * the flame trench; liftoff from the apron; riding alongside as it
   * clears the tower; a long lens from across the city; the climb from
   * below as the sky goes dark; staging up close; the ship alone over the
   * planet. Fire, smoke, deluge spray and a shock ring of dust, the
   * engines lighting the smoke, the ground shaking. Resolves when the
   * ship reaches space (or when the player skips).
   */
  play(game, hooks = {}) {
    const eng = this.engine;
    const cam = eng.camera;
    const atm = eng.atmosphere;
    const P = this.pad;
    const world = new THREE.Vector3();
    const R = this.rocket;
    const origin = new THREE.Vector3(P.x, this.top + 1, P.z);
    const T = this.materials.textures;
    const q = eng.quality.settings.particlesScale || 1;
    const plume = new ParticleSystem(eng, { name: 'ענן שיגור', texture: T.smoke, max: Math.round(5200 * Math.max(0.6, q)), additive: false, lit: true, gain: 0.95 });
    const flame = new ParticleSystem(eng, { name: 'להבת מנועים', texture: T.flame, max: Math.round(2600 * Math.max(0.6, q)), additive: true });
    const glowP = new ParticleSystem(eng, { name: 'זוהר שיגור', texture: T.softDot, max: 400, additive: true });
    eng.particles.systems.launchPlume = plume;
    eng.particles.systems.launchFlame = flame;
    eng.particles.systems.launchGlow = glowP;
    const spray = eng.particles.systems.spray || plume;
    const vents = [new THREE.Vector3(0, 46, 4.8), new THREE.Vector3(-4.8, 30, 0), new THREE.Vector3(4.2, 70, 2)].map(
      (off, k) => new Emitter(plume, { position: origin.clone().add(off), dir: new THREE.Vector3(k === 1 ? -1 : 0.3, 0.1, k === 1 ? 0 : 1).normalize(), rate: 12, spread: 0.35, speed: [2, 4.5], life: [2.5, 4], size0: [1, 2], size1: [6, 10], color0: [0.97, 0.98, 1, 0.55], color1: [1, 1, 1, 0], gravity: 0.9, drag: 0.6, turbulence: 0.6 }),
    );
    const engines = new Emitter(flame, { position: origin.clone(), dir: new THREE.Vector3(0, -1, 0), rate: 0, spread: 0.14, radius: 3.6, speed: [50, 80], life: [0.3, 0.6], size0: [3, 5], size1: [8, 14], color0: [1, 0.85, 0.55, 1], color1: [1, 0.4, 0.1, 0], intensity: 3.5, drag: 0.5 });
    const trench = [1, -1].map((side) => new Emitter(plume, { position: new THREE.Vector3(P.x, P.h + 2, P.z + side * 66), dir: new THREE.Vector3(0, 0.3, side).normalize(), rate: 0, spread: 0.6, radius: 8, speed: [22, 40], life: [7, 12], size0: [10, 16], size1: [40, 70], color0: [0.93, 0.88, 0.82, 0.9], color1: [0.8, 0.79, 0.77, 0], drag: 0.3, turbulence: 1.6, gravity: -0.6 }));
    const billow = new Emitter(plume, { position: origin.clone().setY(P.h + 6), dir: new THREE.Vector3(0, 0.15, 0), rate: 0, spread: 1.45, radius: 14, speed: [12, 26], life: [8, 14], size0: [12, 18], size1: [45, 80], color0: [0.94, 0.9, 0.85, 0.85], color1: [0.84, 0.83, 0.82, 0], drag: 0.28, turbulence: 1.8, gravity: -0.4 });
    const column = new Emitter(plume, { position: origin.clone(), dir: new THREE.Vector3(0, -1, 0), rate: 0, spread: 0.4, radius: 4.5, speed: [8, 18], life: [10, 22], size0: [7, 11], size1: [26, 44], color0: [0.96, 0.88, 0.78, 0.8], color1: [0.86, 0.86, 0.86, 0], drag: 0.45, turbulence: 1.2, gravity: -0.25 });
    const baseGlow = new Emitter(glowP, { position: origin.clone(), dir: new THREE.Vector3(0, 1, 0), rate: 0, spread: 1.5, radius: 8, speed: [1, 4], life: [0.3, 0.6], size0: [12, 18], size1: [22, 32], color0: [1, 0.6, 0.25, 0.3], color1: [1, 0.4, 0.1, 0], intensity: 1.5 });
    const shipFire = new Emitter(flame, { position: origin.clone(), dir: new THREE.Vector3(0, -1, 0), rate: 0, spread: 0.12, radius: 2.4, speed: [45, 65], life: [0.3, 0.55], size0: [3, 4.5], size1: [8, 12], color0: [0.8, 0.85, 1, 1], color1: [0.5, 0.4, 1, 0], intensity: 10, drag: 0.4 });
    const emitters = [...vents, engines, ...trench, billow, column, baseGlow, shipFire];
    for (const e of emitters) eng.particles.add(e);
    // Rumble: filtered noise on the effects bus, and a crackle on top once it flies.
    const A = eng.audio;
    let rumble = null;
    if (A.ctx && A.enabled) {
      const ctx = A.ctx;
      const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = last * 0.97 + (Math.random() * 2 - 1) * 0.03;
        d[i] = last * 6 + (Math.random() < 0.002 ? (Math.random() - 0.5) * 3 : 0);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 260;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(lp).connect(g).connect(A.sfx);
      src.start();
      rumble = { src, g, lp, ctx };
    }
    const saved = { fov: cam.fov };
    let t = 0;
    let done = false;
    let skip = false;
    let said = -1;
    let lift = 0; // seconds since liftoff
    let y = 0;
    let v = 0;
    let separated = false;
    let ignited = false;
    let shot = -1;
    const boosterFall = { v: new THREE.Vector3(), w: 0 };
    const IGNITE = 8.4;
    const LIFTOFF = 11;
    const STAGE = 27;
    const END = 32;
    const look = new THREE.Vector3();
    const want = new THREE.Vector3();
    const caption = (text, sub = '') => hooks.message && hooks.message(text, sub);
    const onSkip = (e) => {
      if (e.type === 'keydown' && !['Space', 'Enter', 'Escape'].includes(e.code)) return;
      skip = true;
    };
    window.addEventListener('keydown', onSkip);
    window.addEventListener('pointerdown', onSkip);
    // The shots: [until t, name]. A new shot is a hard cut.
    const SHOTS = [
      [4.6, 'aerial'],
      [7.6, 'under'],
      [LIFTOFF + 0.6, 'trench'],
      [LIFTOFF + 4.2, 'apron'],
      [LIFTOFF + 7.8, 'ride'],
      [LIFTOFF + 11.5, 'lens'],
      [STAGE - 0.8, 'below'],
      [STAGE + 3, 'staging'],
      [99, 'alone'],
    ];
    const fixed = new THREE.Vector3();
    return new Promise((resolve) => {
      const rig = {
        focusPoint: () => look.clone(),
        update: (dt) => {
          if (done) return;
          dt = Math.min(dt, 0.05);
          t += dt;
          // Countdown captions.
          const count = Math.ceil(LIFTOFF - t);
          if (count !== said && count >= 0 && count <= 10) {
            said = count;
            caption(count > 0 ? String(count) : 'המראה!', count === 3 ? 'הצתת מנועים' : count > 0 ? 'ספירה לאחור' : '33 מנועים בדחף מלא');
            if (A.ctx && A.enabled && count > 0) A._tone(A.sfx, { freq: count <= 3 ? 880 : 660, dur: 0.12, gain: 0.06, type: 'sine' });
          }
          // Swing arms retract before ignition; the frost stays until the tanks warm in flight.
          for (const a of this.arms) a.rotation.y = -smooth(IGNITE - 3.5, IGNITE - 1, t) * 1.4;
          this.frost.value = 1 - smooth(LIFTOFF + 3, LIFTOFF + 14, t) * 0.8;
          // Engines and motion.
          const fire = smooth(IGNITE, IGNITE + 1.4, t);
          if (t > LIFTOFF) {
            lift = t - LIFTOFF;
            const acc = 7 + lift * 2.6;
            v += acc * dt;
            y += v * dt;
          }
          R.group.position.y = this.top - P.h + 1 + y;
          // A gentle pitch-over (gravity turn) once clear of the tower.
          R.group.rotation.x = -smooth(5, 18, lift) * 0.35;
          R.group.updateMatrixWorld(true);
          R.booster.getWorldPosition(world);
          const tail = world.clone();
          const down = new THREE.Vector3(0, -1, 0).applyQuaternion(R.group.quaternion);
          for (const e of vents) e.enabled = t < IGNITE + 0.5;
          engines.position.copy(tail);
          engines.o.dir.copy(down);
          // Fast enough and the particles would be left behind in beads: the flame mesh carries on alone.
          const fast = smooth(110, 240, v);
          engines.rate = separated ? 0 : fire * 620 * (1 - fast);
          engines.o.speed = [50 + lift * 5, 80 + lift * 7];
          // The core flame grows with thrust and fans out as the air thins.
          const thin = smooth(1500, 6000, y);
          this.flameMat.uniforms.uTime.value = t;
          this.flameMat.uniforms.uPower.value = separated ? 0 : fire;
          R.flame.scale.set(1 + thin * 1.6, (separated ? 0.001 : fire * (28 + lift * 2.5 + thin * 40)), 1 + thin * 1.6);
          R.light.intensity = separated ? 0 : fire * (9e3 + Math.random() * 2e3) * (1 - thin);
          this.materials.setEmissiveBase(this.glowMat, separated ? 0 : fire * 6);
          // Ignition: a flash, a ring of dust racing out and the deluge bursting into spray.
          if (!ignited && t > IGNITE + 0.2) {
            ignited = true;
            const dust = eng.particles.systems.dust;
            for (let k = 0; k < 160; k++) {
              const a = (k / 160) * Math.PI * 2;
              const sp = 25 + Math.random() * 20;
              (dust || plume).emit({ x: P.x + Math.cos(a) * 12, y: P.h + 1.5, z: P.z + Math.sin(a) * 12, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 3, vz: Math.sin(a) * sp, life: 3 + Math.random() * 2, size0: 3, size1: 14, color0: [0.72, 0.66, 0.58, 0.7], color1: [0.7, 0.66, 0.6, 0], drag: 0.9 });
            }
            for (let k = 0; k < 220; k++) {
              const a = Math.random() * Math.PI * 2;
              const sp = 8 + Math.random() * 22;
              spray.emit({ x: P.x + Math.cos(a) * 9, y: this.top - 1, z: P.z + Math.sin(a) * 9, vx: Math.cos(a) * sp, vy: 4 + Math.random() * 14, vz: Math.sin(a) * sp, life: 1.5 + Math.random() * 1.5, size0: 1.5, size1: 7, color0: [0.97, 0.99, 1, 0.8], color1: [0.95, 0.97, 1, 0], gravity: 9.8, drag: 0.4 });
            }
            if (A.ctx && A.enabled) A._burst(A.sfx, { dur: 1.4, freq: 120, q: 0.5, gain: 0.8, type: 'lowpass' });
          }
          const near = smooth(14, 0, y);
          for (const e of trench) e.rate = fire * near * 90;
          billow.rate = fire * near * 55;
          baseGlow.position.copy(tail);
          baseGlow.rate = separated ? 0 : fire * (1 - thin) * 25;
          column.position.copy(tail);
          column.o.dir.copy(down);
          // The smoke trail: dense low down, gone once the air is too thin (and the rocket too fast) to leave one.
          column.rate = separated || y > 2600 ? 0 : fire * (t < LIFTOFF + 12 ? 60 : 30);
          column.o.color0 = [0.96, 0.88, 0.78, 0.8 * (1 - smooth(1200, 2600, y))];
          engines.o.color0 = [1, 0.85, 0.55, 1 - thin * 0.7];
          if (rumble) {
            const tt = rumble.ctx.currentTime;
            rumble.g.gain.setTargetAtTime(fire * 1.1 * (1 - smooth(2500, 6000, y) * 0.8), tt, 0.3);
            rumble.lp.frequency.setTargetAtTime(140 + fire * 260 + smooth(0, 6, lift) * 180, tt, 0.3);
          }
          if (fire > 0.3 && y < 600) eng.events.emit('shake', { strength: 0.16 * fire * (1 - y / 600) });
          // Staging: a flash between the stages, the booster falls away, the ship lights up.
          if (!separated && t > STAGE) {
            separated = true;
            R.ship.getWorldPosition(world);
            for (let k = 0; k < 90; k++) {
              const a = Math.random() * Math.PI * 2;
              flame.emit({ x: world.x + Math.cos(a) * 4.6, y: world.y - 0.5, z: world.z + Math.sin(a) * 4.6, vx: Math.cos(a) * 30, vy: (Math.random() - 0.5) * 8, vz: Math.sin(a) * 30, life: 0.5, size0: 4, size1: 12, color0: [1, 0.85, 0.5, 1], color1: [1, 0.4, 0.1, 0], drag: 1.5 });
            }
            R.group.parent.attach(R.booster);
            boosterFall.v.copy(down).multiplyScalar(-v * 0.8).add(new THREE.Vector3(0, -5, 0));
            caption('הפרדת שלבים', 'החללית מציתה את מנועיה');
            if (A.ctx && A.enabled) A._burst(A.sfx, { dur: 0.8, freq: 220, q: 0.6, gain: 0.6, type: 'lowpass' });
          }
          if (separated) {
            boosterFall.v.y -= 9.8 * dt;
            R.booster.position.addScaledVector(boosterFall.v, dt);
            R.booster.rotation.z += dt * 0.25;
            R.ship.getWorldPosition(world);
            shipFire.position.copy(world);
            shipFire.o.dir.copy(down);
            const sk = smooth(STAGE + 0.4, STAGE + 1.2, t);
            shipFire.rate = 0;
            this.shipFlameMat.uniforms.uPower.value = sk * 1.3;
            R.sFlame.scale.set(1.6 + sk * 0.8, sk * 48, 1.6 + sk * 0.8);
          }
          // Out of the air: the sky darkens to black as the ship climbs.
          atm.space = smooth(900, 4600, y);
          // Camera: which shot are we in?
          let k = 0;
          while (t > SHOTS[k][0]) k++;
          const cut = k !== shot;
          if (cut) {
            shot = k;
            if (SHOTS[k][1] === 'lens') fixed.set(P.x + 820, P.h + 24, P.z + 640);
            if (SHOTS[k][1] === 'apron') caption('המראה!', 'מגדל השיגור נשאר מאחור');
            if (SHOTS[k][1] === 'below') caption('מקס-Q', 'הלחץ האווירי בשיאו');
          }
          const rp = R.group.getWorldPosition(new THREE.Vector3());
          const sp = R.ship.getWorldPosition(new THREE.Vector3());
          const name = SHOTS[k][1];
          if (name === 'aerial') {
            // From the air over the city: the rocket on its mount, venting.
            const a = 0.7 + t * 0.05;
            want.set(P.x + Math.cos(a) * 420, P.h + 190 - t * 12, P.z + Math.sin(a) * 420);
            look.set(P.x, P.h + 55, P.z);
            cam.fov = 40;
          } else if (name === 'under') {
            // Low under the rocket, looking up the steel as it vents and the arms swing clear.
            const s2 = t - SHOTS[k - 1][0];
            want.set(P.x - 24 + s2 * 1.5, P.h + 6, P.z + 20);
            look.set(P.x, rp.y + 70, P.z);
            cam.fov = 52;
          } else if (name === 'trench') {
            // Across the trench: the engines light under the mount, fire and cloud burst out of both ends.
            want.set(P.x - 60, P.h + 5, P.z - 34);
            look.set(P.x, P.h + 14, P.z + 20);
            cam.fov = 50;
          } else if (name === 'apron') {
            // On the apron, looking up as it clears the mount.
            want.set(P.x + 75, P.h + 10, P.z + 45);
            look.copy(rp).add(new THREE.Vector3(0, 35, 0));
            cam.fov = THREE.MathUtils.clamp(58 - lift * 3, 30, 58);
          } else if (name === 'ride') {
            // Riding alongside: the steel wall, the flame below and the city falling away.
            want.copy(rp).add(new THREE.Vector3(30, 78, 34));
            look.copy(rp).add(new THREE.Vector3(0, 10, 0));
            cam.fov = 62;
          } else if (name === 'lens') {
            // A long lens from across the city: the flame over the skyline.
            want.copy(fixed);
            look.copy(rp).add(new THREE.Vector3(0, 20, 0));
            cam.fov = THREE.MathUtils.clamp(900 / Math.max(200, fixed.distanceTo(rp)) * 18, 4, 30);
          } else if (name === 'below') {
            // From behind and below: the plume, the sky going dark.
            want.copy(rp).add(new THREE.Vector3(60, -40 - lift * 2, 190 + lift * 5));
            look.copy(rp).add(new THREE.Vector3(0, 30, -40));
            cam.fov = 50;
          } else if (name === 'staging') {
            // Up close at staging.
            want.copy(sp).add(new THREE.Vector3(34, 6, 46));
            look.copy(sp).add(new THREE.Vector3(0, -4, 0));
            cam.fov = 48;
          } else {
            // The ship alone, the planet's curve below.
            want.copy(sp).add(new THREE.Vector3(-26, 40, 95));
            look.copy(sp).add(new THREE.Vector3(0, -12, -10));
            cam.fov = 58;
          }
          const kk = cut || t < 0.1 ? 1 : 1 - Math.exp(-dt * (name === 'ride' || name === 'staging' || name === 'alone' || name === 'below' ? 5 : 2));
          cam.position.lerp(want, kk);
          cam.lookAt(look);
          cam.updateProjectionMatrix();
          if (hooks.fade) hooks.fade(smooth(END - 1.3, END, t));
          if (t > END || skip) finish();
        },
      };
      const finish = () => {
        if (done) return;
        done = true;
        window.removeEventListener('keydown', onSkip);
        window.removeEventListener('pointerdown', onSkip);
        for (const e of emitters) eng.particles.remove(e);
        // Let the plume hang a moment, then take the systems down.
        setTimeout(() => {
          for (const s of [plume, flame, glowP]) {
            s.mesh.removeFromParent();
            s.mesh.geometry.dispose();
            s.mesh.material.dispose();
          }
          delete eng.particles.systems.launchPlume;
          delete eng.particles.systems.launchFlame;
          delete eng.particles.systems.launchGlow;
        }, 100);
        if (rumble) {
          rumble.g.gain.setTargetAtTime(0, rumble.ctx.currentTime, 0.4);
          setTimeout(() => rumble.src.stop(), 2000);
        }
        cam.fov = saved.fov;
        cam.updateProjectionMatrix();
        resolve();
      };
      eng.cameraRig = rig;
    });
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => o.geometry && o.geometry.dispose());
    this.mat.dispose();
    this.rocketMat.dispose();
    this.shipMat.dispose();
    this.flameMat.dispose();
    this.shipFlameMat.dispose();
    this.materials.untrackEmissive(this.glowMat);
    this.glowMat.dispose();
  }
}
