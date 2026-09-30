import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { Random } from '../engine/core/Random.js';

/**
 * Low orbit over the archipelago: the planet curving away below with its
 * oceans, islands, clouds and a thin blue rim of air; a starfield; the
 * sun; a spinning space station with a ring to fly through; an asteroid
 * belt to thread. The space race course loops through all of it.
 *
 * Everything lives in its own group, shown instead of the islands.
 */
export class SpaceScene {
  constructor(engine, materials) {
    this.engine = engine;
    this.materials = materials;
    this.group = new THREE.Group();
    this.group.name = 'חלל';
    this.group.visible = false;
    this.rng = new Random(4242);
    this.mats = [];
    this.rocks = []; // { x, y, z, r } obstacles
    this.time = 0;
  }

  build() {
    this._planet();
    this._stars();
    this._station();
    this._asteroids();
    this._dust();
    this.engine.scene.add(this.group);
    return this;
  }

  _mat(m) {
    this.mats.push(m);
    return m;
  }

  // ---------------------------------------------------------------- planet

  _planet() {
    const R = 9000;
    this.planetCenter = new THREE.Vector3(0, -R - 900, 0);
    const noise = /* glsl */ `
      vec3 h3(vec3 p){ p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6))); return fract(sin(p) * 43758.5453) * 2.0 - 1.0; }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); vec3 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(dot(h3(i), f), dot(h3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x), mix(dot(h3(i + vec3(0,1,0)), f - vec3(0,1,0)), dot(h3(i + vec3(1,1,0)), f - vec3(1,1,0)), u.x), u.y),
                   mix(mix(dot(h3(i + vec3(0,0,1)), f - vec3(0,0,1)), dot(h3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x), mix(dot(h3(i + vec3(0,1,1)), f - vec3(0,1,1)), dot(h3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z); }
      float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { s += n3(p) * a; p *= 2.03; a *= 0.5; } return s; }`;
    const ground = this._mat(
      new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, metalness: 0 }),
    );
    ground.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vDir;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvDir = normalize(position);');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vDir;\n${noise}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float land = fbm(vDir * 3.2 + 1.7) + fbm(vDir * 11.0) * 0.25;
          float lat = abs(vDir.x * 0.3 + vDir.z * 0.95);
          vec3 deep = vec3(0.01, 0.05, 0.14), shallow = vec3(0.02, 0.22, 0.32);
          vec3 green = vec3(0.1, 0.22, 0.06), desert = vec3(0.45, 0.36, 0.2), ice = vec3(0.85, 0.88, 0.92);
          float coast = smoothstep(0.05, 0.1, land);
          vec3 sea = mix(deep, shallow, smoothstep(-0.05, 0.08, land));
          vec3 ground = mix(green, desert, smoothstep(0.1, 0.5, fbm(vDir * 6.0 + 9.0) + (1.0 - lat) * 0.2));
          ground = mix(ground, ice, smoothstep(0.78, 0.88, lat));
          diffuseColor.rgb = mix(sea, ground, coast);
          diffuseColor.rgb = mix(diffuseColor.rgb, ice, smoothstep(0.86, 0.95, lat));`,
        )
        .replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(0.25, 0.95, smoothstep(0.05, 0.1, fbm(vDir * 3.2 + 1.7) + fbm(vDir * 11.0) * 0.25));`);
    };
    ground.customProgramCacheKey = () => 'space-planet';
    const planet = new THREE.Mesh(new THREE.SphereGeometry(R, 160, 96), ground);
    planet.position.copy(this.planetCenter);
    planet.name = 'כוכב הלכת';
    this.group.add(planet);
    // Clouds.
    const clouds = this._mat(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uTime: { value: 0 }, uLight: { value: 1 } },
        vertexShader: 'varying vec3 vDir; varying vec3 vN; void main(){ vDir = normalize(position); vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 uSun; uniform float uTime; uniform float uLight; varying vec3 vDir; varying vec3 vN; ${noise}
          void main(){
            float c = fbm(vDir * 7.0 + vec3(uTime * 0.002, 0.0, 0.0)) + fbm(vDir * 19.0) * 0.35;
            float a = smoothstep(0.05, 0.35, c) * 0.85;
            float lit = clamp(dot(vDir, uSun) * 1.2 + 0.2, 0.05, 1.0);
            gl_FragColor = vec4(vec3(lit) * uLight, a);
          }`,
      }),
    );
    this.cloudMat = clouds;
    const cl = new THREE.Mesh(new THREE.SphereGeometry(R + 25, 128, 64), clouds);
    cl.position.copy(this.planetCenter);
    this.group.add(cl);
    // Air: a glowing rim.
    const rim = this._mat(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uSun: { value: new THREE.Vector3(0, 1, 0) }, uLight: { value: 1 }, uCenter: { value: this.planetCenter } },
        vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform vec3 uSun; uniform float uLight; uniform vec3 uCenter; varying vec3 vW;
          void main(){
            vec3 n = normalize(vW - uCenter);
            vec3 v = normalize(cameraPosition - vW);
            float rim = pow(1.0 - abs(dot(n, v)), 5.0);
            float day = clamp(dot(n, uSun) + 0.3, 0.0, 1.0);
            vec3 col = vec3(0.3, 0.55, 1.0) * rim * day * 1.6;
            gl_FragColor = vec4(col * uLight, 1.0);
          }`,
      }),
    );
    this.rimMat = rim;
    const air = new THREE.Mesh(new THREE.SphereGeometry(R * 1.022, 96, 48), rim);
    air.position.copy(this.planetCenter);
    this.group.add(air);
    this.planet = planet;
  }

  // ---------------------------------------------------------------- sky

  _stars() {
    const n = 5000;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const rng = this.rng;
    for (let i = 0; i < n; i++) {
      const u = rng.random() * 2 - 1;
      const a = rng.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      pos.set([Math.cos(a) * r * 20000, u * 20000, Math.sin(a) * r * 20000], i * 3);
      const t = rng.random();
      const b = 0.3 + Math.pow(rng.random(), 6) * 3;
      col.set(t < 0.2 ? [b, b * 0.8, b * 0.6] : t < 0.4 ? [b * 0.75, b * 0.85, b] : [b, b, b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const m = this._mat(new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false }));
    this.starMat = m;
    this.stars = new THREE.Points(g, m);
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -900;
    this.group.add(this.stars);
    // The sun: a hot disc with a soft glow.
    const sunMat = this._mat(new THREE.MeshBasicMaterial({ color: 0xfff4e0, fog: false, depthWrite: false }));
    this.sunMat = sunMat;
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(260, 32), sunMat);
    this.group.add(this.sun);
    const glowMat = this._mat(
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uLight: { value: 1 } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uLight; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float g = pow(max(0.0, 1.0 - d), 3.0); gl_FragColor = vec4(vec3(1.0, 0.9, 0.75) * g * uLight, 1.0); }',
      }),
    );
    this.glowMat = glowMat;
    this.sunGlow = new THREE.Mesh(new THREE.PlaneGeometry(3200, 3200), glowMat);
    this.group.add(this.sunGlow);
  }

  // ---------------------------------------------------------------- station

  _station() {
    const g = new THREE.Group();
    g.name = 'תחנת חלל';
    const paint = (geo, hex) => {
      geo = geo.index ? geo.toNonIndexed() : geo;
      if (geo.attributes.uv) geo.deleteAttribute('uv');
      const c = new THREE.Color(hex);
      const a = new Float32Array(geo.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) c.toArray(a, i);
      geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
      return geo;
    };
    const parts = [];
    const R = 110;
    parts.push(paint(new THREE.TorusGeometry(R, 9, 12, 64), 0xd8dadc)); // habitat ring (flying through it)
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      parts.push(paint(new THREE.BoxGeometry(14, 6, 20).translate(Math.cos(a) * R, Math.sin(a) * R, 0), k % 4 === 0 ? 0xe0a030 : 0xbfc3c8));
    }
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      const spoke = new THREE.CylinderGeometry(2.2, 2.2, R - 16, 8).translate(0, (R - 16) / 2 + 16, 0).rotateZ(a);
      parts.push(paint(spoke, 0x9aa0a6));
    }
    // Hub along the axis, sticking out both sides: docking tubes and solar arrays beyond the ring.
    parts.push(paint(new THREE.CylinderGeometry(15, 15, 30, 16).rotateX(Math.PI / 2), 0xd0d3d6));
    parts.push(paint(new THREE.CylinderGeometry(6, 6, 180, 12).rotateX(Math.PI / 2), 0xb0b4b8));
    for (const z of [-80, 80]) {
      parts.push(paint(new THREE.BoxGeometry(170, 1, 30).translate(0, 0, z), 0x1d3b7a));
      parts.push(paint(new THREE.BoxGeometry(2, 2, 34).translate(0, 0, z), 0x888c90));
    }
    const mat = this._mat(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 }));
    const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
    mesh.castShadow = true;
    g.add(mesh);
    // Blinking lights.
    const lightMat = this._mat(new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff3020, emissiveIntensity: 1 }));
    this.materials.trackEmissive(lightMat, 6);
    this.blink = lightMat;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), lightMat);
      b.position.set(Math.cos(a) * (R + 10), Math.sin(a) * (R + 10), 0);
      g.add(b);
    }
    this.station = g;
    this.stationR = R;
    this.group.add(g);
  }

  // ---------------------------------------------------------------- rocks

  _asteroids() {
    const rng = this.rng;
    // 3D value noise for the shapes.
    const hash = (x, y, z) => {
      let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
      h = Math.imul(h ^ (h >>> 13), 1103515245);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    const noise = (x, y, z) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const zi = Math.floor(z);
      const f = (t) => t * t * (3 - 2 * t);
      const u = f(x - xi);
      const v = f(y - yi);
      const w = f(z - zi);
      const L = (a, b, t) => a + (b - a) * t;
      const c = (dx, dy, dz) => hash(xi + dx, yi + dy, zi + dz);
      return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w) * 2 - 1;
    };
    const fbm = (x, y, z, o) => {
      let sum = 0;
      let amp = 0.5;
      let fr = 1;
      for (let i = 0; i < o; i++) {
        sum += amp * noise(x * fr, y * fr, z * fr);
        amp *= 0.5;
        fr *= 2.1;
      }
      return sum;
    };
    this.rockGeos = [];
    for (let variant = 0; variant < 3; variant++) {
      let g = new THREE.IcosahedronGeometry(1, 6);
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      g = mergeVertices(g);
      const p = g.attributes.position;
      const seed = variant * 17.3 + 3.1;
      // Craters: dents with raised rims.
      const craters = [];
      for (let k = 0; k < 7 + variant * 2; k++) {
        const d = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
        craters.push({ d, r: rng.range(0.18, 0.5), depth: rng.range(0.05, 0.14) });
      }
      const stretch = [new THREE.Vector3(1.25, 0.8, 1), new THREE.Vector3(1, 0.9, 1.1), new THREE.Vector3(1.45, 0.75, 0.85)][variant];
      const shade = new Float32Array(p.count);
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).normalize();
        let h = 1 + fbm(v.x * 1.3 + seed, v.y * 1.3, v.z * 1.3 - seed, 5) * 0.45;
        let crater = 0;
        for (const C of craters) {
          const ang = Math.acos(THREE.MathUtils.clamp(v.dot(C.d), -1, 1));
          const t = ang / C.r;
          if (t < 1) crater -= C.depth * (1 - t * t);
          else if (t < 1.35) crater += C.depth * 0.35 * Math.sin(((t - 1) / 0.35) * Math.PI);
        }
        h += crater;
        shade[i] = crater;
        p.setXYZ(i, v.x * h * stretch.x, v.y * h * stretch.y, v.z * h * stretch.z);
      }
      g.computeVertexNormals();
      // Regolith colour: darker in the craters, lighter on rims and ridges, a few rusty patches.
      const col = new Float32Array(p.count * 3);
      const c = new THREE.Color();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i);
        const n = fbm(v.x * 2.2 - seed, v.y * 2.2, v.z * 2.2 + seed, 3);
        c.setRGB(0.5, 0.47, 0.44).multiplyScalar(0.82 + n * 0.35 + shade[i] * 2.2);
        if (fbm(v.x * 1.1 + 7, v.y * 1.1, v.z * 1.1 - 3, 2) > 0.18) c.lerp(new THREE.Color(0.55, 0.36, 0.24), 0.45);
        c.toArray(col, i * 3);
      }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      this.rockGeos.push(g);
    }
    this.rockGeo = this.rockGeos[0];
    // Gritty close-up detail: a bump from noise in object space.
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0.04 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vRock;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = position;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vRock;\nfloat rh(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }\nfloat rn(vec3 p){ vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(mix(rh(i), rh(i + vec3(1,0,0)), f.x), mix(rh(i + vec3(0,1,0)), rh(i + vec3(1,1,0)), f.x), f.y), mix(mix(rh(i + vec3(0,0,1)), rh(i + vec3(1,0,1)), f.x), mix(rh(i + vec3(0,1,1)), rh(i + vec3(1,1,1)), f.x), f.y), f.z); }')
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          {
            vec3 q = vRock * 9.0;
            float e = 0.12;
            float b0 = rn(q) + rn(q * 2.7) * 0.5;
            vec3 grad = vec3(rn(q + vec3(e, 0, 0)) - rn(q - vec3(e, 0, 0)), rn(q + vec3(0, e, 0)) - rn(q - vec3(0, e, 0)), rn(q + vec3(0, 0, e)) - rn(q - vec3(0, 0, e)));
            normal = normalize(normal - (mat3(viewMatrix) * grad) * 0.9);
            diffuseColor.rgb *= 0.85 + 0.3 * b0;
          }`,
        );
    };
    mat.customProgramCacheKey = () => 'asteroid-v2';
    this.rockMat = this._mat(mat);
  }

  /** Scatters the belt around a stretch of the course (keeping the racing line open). */
  scatterRocks(course, from, to) {
    const rng = this.rng;
    if (from < 0.2 && this.rockMesh) {
      // A new race: clear the previous belt.
      for (const m of this.rockMeshes || []) {
        m.removeFromParent();
        m.dispose();
      }
      this.rockMeshes = [];
      this.rocks.length = 0;
    }
    const list = [];
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let k = 0; k < 300; k++) {
      const s = from + rng.random() * (to - from);
      const pose = course.pose(s, 0);
      const t = pose.tangent;
      const r = pose.right;
      const up = new THREE.Vector3().crossVectors(r, t).normalize();
      const a = rng.random() * Math.PI * 2;
      const d = 70 + Math.pow(rng.random(), 1.6) * 280;
      const size = 3 + Math.pow(rng.random(), 2.5) * 34;
      const pos = pose.position.clone().addScaledVector(r, Math.cos(a) * d).addScaledVector(up, Math.sin(a) * d * 0.7);
      if (d - size < 58) continue; // a wide open lane down the racing line
      q.setFromEuler(new THREE.Euler(rng.random() * 6, rng.random() * 6, rng.random() * 6));
      m.compose(pos, q, new THREE.Vector3(size, size * rng.range(0.7, 1), size * rng.range(0.8, 1.2)));
      list.push(m.clone());
      this.rocks.push({ x: pos.x, y: pos.y, z: pos.z, r: size * 0.95 });
    }
    // A few big ones out wide, for scale.
    for (let k = 0; k < 10; k++) {
      const pose = course.pose(from + rng.random() * (to - from), 0);
      const size = 60 + rng.random() * 90;
      const side = rng.random() < 0.5 ? -1 : 1;
      const pos = pose.position.clone().addScaledVector(pose.right, side * (size + 180 + rng.random() * 200)).add(new THREE.Vector3(0, rng.range(-120, 120), 0));
      m.compose(pos, q.setFromEuler(new THREE.Euler(k, k * 2, k * 3)), new THREE.Vector3(size, size * 0.8, size));
      list.push(m.clone());
      this.rocks.push({ x: pos.x, y: pos.y, z: pos.z, r: size * 0.95 });
    }
    // Three shapes, and each rock its own tint: grey, brown, rusty, now and then an icy one.
    const tints = [0xffffff, 0xd8c8b8, 0xc8a890, 0xe8e0d8, 0xbfd8ff];
    const c = new THREE.Color();
    for (let v = 0; v < this.rockGeos.length; v++) {
      const mine = list.filter((_, i) => i % this.rockGeos.length === v);
      if (!mine.length) continue;
      const mesh = new THREE.InstancedMesh(this.rockGeos[v], this.rockMat, mine.length);
      mine.forEach((mm, i) => {
        mesh.setMatrixAt(i, mm);
        c.set(tints[Math.floor(rng.random() * (rng.random() < 0.9 ? 4 : 5))]).multiplyScalar(0.85 + rng.random() * 0.3);
        mesh.setColorAt(i, c);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = 'חגורת אסטרואידים';
      this.rockMesh = mesh;
      (this.rockMeshes = this.rockMeshes || []).push(mesh);
      this.group.add(mesh);
    }
  }

  /** Motes drifting past the camera, so speed reads in empty space. */
  _dust() {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) pos[i] = (Math.random() - 0.5) * 400;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = this._mat(new THREE.PointsMaterial({ size: 0.6, color: 0x9fb2c8, transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  // ---------------------------------------------------------------- course

  /** Control points for the orbit course: through the station's ring, round a loop, through the belt. */
  courseControls() {
    const pts = [];
    const N = 24;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2;
      // Gentle: long sweeping bends and small climbs (the space race is for everyone).
      const r = 1300 + Math.sin(a * 2) * 260 + Math.sin(a * 3 + 1) * 90;
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a * 2 + 0.5) * 90 + Math.sin(a * 5) * 25, Math.sin(a) * r * 0.8));
    }
    return pts;
  }

  /** Puts the station on the course so the racing line runs through its ring. */
  placeStation(course, s) {
    const pose = course.pose(s, 0);
    const i = pose.index;
    const t = new THREE.Vector3(course.tx[i], course.ty[i], course.tz[i]).normalize();
    // Local Z along the course, local Y "up" across it; the course runs 60 m below the hub.
    const up = new THREE.Vector3(0, 1, 0).addScaledVector(t, -t.y).normalize();
    const x = new THREE.Vector3().crossVectors(up, t).normalize();
    const m = new THREE.Matrix4().makeBasis(x, up, t);
    this.station.quaternion.setFromRotationMatrix(m);
    this.station.position.copy(pose.position).addScaledVector(up, 60);
    this.station.updateMatrixWorld(true);
    this._inv = new THREE.Matrix4().copy(this.station.matrixWorld).invert();
  }

  /** Station hull as an obstacle: returns a push-out direction (world) or null. */
  collide(p) {
    if (!this._inv) return null;
    const l = this._lp || (this._lp = new THREE.Vector3());
    l.copy(p).applyMatrix4(this._inv);
    const R = this.stationR;
    const r = Math.hypot(l.x, l.y);
    const n = this._ln || (this._ln = new THREE.Vector3());
    const dr = r - R;
    const d = Math.hypot(dr, l.z);
    if (d < 13 && d > 1e-3) n.set((l.x / (r || 1)) * dr, (l.y / (r || 1)) * dr, l.z).normalize();
    else if (r < 18 && Math.abs(l.z) < 18) n.set(l.x / (r || 1), l.y / (r || 1), 0);
    else if (Math.abs(Math.abs(l.z) - 80) < 17 && Math.abs(l.x) < 88 && Math.abs(l.y) < 3.5) n.set(0, Math.sign(l.y) || 1, 0);
    else return null;
    return n.transformDirection(this.station.matrixWorld);
  }

  // ---------------------------------------------------------------- on / off

  enter() {
    this.group.visible = true;
    const atm = this.engine.atmosphere;
    atm.space = 1;
    this.sunDir = atm.sunDir.clone();
    if (this.sunDir.y < 0.25) this.sunDir.set(0.4, 0.55, -0.73).normalize();
  }

  exit() {
    this.group.visible = false;
    this.engine.atmosphere.space = 0;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    const cam = this.engine.camera.position;
    const atm = this.engine.atmosphere;
    const sun = atm.sunDir;
    this.stars.position.copy(cam);
    this.sun.position.copy(cam).addScaledVector(sun, 18000);
    this.sun.lookAt(cam);
    this.sunGlow.position.copy(this.sun.position);
    this.sunGlow.lookAt(cam);
    const e = this.materials.emissiveScale || 1;
    this.sunMat.color.setRGB(1, 0.96, 0.88).multiplyScalar(e * 40);
    this.glowMat.uniforms.uLight.value = e * 6;
    this.cloudMat.uniforms.uSun.value.copy(sun);
    this.cloudMat.uniforms.uTime.value = this.time;
    this.cloudMat.uniforms.uLight.value = atm.keyLight.intensity / Math.PI;
    this.rimMat.uniforms.uSun.value.copy(sun);
    this.rimMat.uniforms.uLight.value = e * 1.2;
    this.starMat.size = 2.2;
    this.materials.setEmissiveBase(this.blink, Math.sin(this.time * 3) > 0.6 ? 8 : 0.3);
    // Dust wraps around the camera.
    const p = this.dust.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      for (let k = 0; k < 3; k++) {
        const c = k === 0 ? cam.x : k === 1 ? cam.y : cam.z;
        let v = p.array[i * 3 + k];
        if (v - c > 200) v -= 400;
        else if (v - c < -200) v += 400;
        p.array[i * 3 + k] = v;
      }
    }
    p.needsUpdate = true;
  }

  dispose() {
    this.group.removeFromParent();
    this.group.traverse((o) => o.geometry && o.geometry.dispose());
    for (const m of this.mats) {
      this.materials.untrackEmissive(m);
      m.dispose();
    }
  }
}
