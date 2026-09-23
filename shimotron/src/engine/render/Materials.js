import * as THREE from 'three';
import { TextureBaker, RECIPES } from './TextureBaker.js';

/**
 * Shared material roles for the whole engine. Textures are GPU-baked once;
 * emissive materials are re-scaled every frame against the adaptive
 * exposure so neon reads the same at noon and at midnight.
 */
export class Materials {
  constructor(engine) {
    this.engine = engine;
    this.baker = new TextureBaker(engine.renderer);
    this.emissive = []; // { material, base }
    this.animated = []; // materials with a uTime uniform in userData.shader
    this.lib = {};
    this.textures = {};
    // Real refraction costs a full extra scene render (Three's transmission
    // pass), so glass refracts only when it is close enough to matter.
    this.refractive = [];
    this.refraction = true;
  }

  /** Registers a transmissive material for adaptive refraction. */
  trackRefractive(material) {
    this.refractive.push({ material, transmission: material.transmission || 1, opacity: 0.32 });
  }

  setRefraction(on) {
    if (on === this.refraction) return;
    this.refraction = on;
    for (const r of this.refractive) {
      const m = r.material;
      m.transmission = on ? r.transmission : 0;
      m.transparent = !on;
      m.opacity = on ? 1 : r.opacity;
      m.depthWrite = on;
      m.needsUpdate = true;
    }
  }

  tex(name, opts) {
    if (!this.textures[name]) this.textures[name] = this.baker.bake(name, RECIPES[name], opts);
    return this.textures[name];
  }

  /** Bakes the texture kit and builds every named material role. */
  build() {
    const t = (n, o) => this.tex(n, o);
    // Baked textures live in render targets and cannot be cloned per
    // material, so tiling is authored in each mesh's UVs instead.
    const T = this.textures;

    t('grass', { size: 1024 });
    t('grassNormal', { size: 512, kind: 'normal', strength: 1.2 });
    t('rock', { size: 1024 });
    t('rockNormal', { size: 1024, kind: 'normal', strength: 2.2 });
    t('sand', { size: 512 });
    t('sandNormal', { size: 512, kind: 'normal', strength: 1.0 });
    t('dirt', { size: 512 });
    t('tiles', { size: 1024 });
    t('tilesNormal', { size: 1024, kind: 'normal', strength: 2.5 });
    t('tilesORM', { size: 512, kind: 'data' });
    t('wood', { size: 512 });
    t('woodNormal', { size: 512, kind: 'normal', strength: 2.0 });
    t('woodORM', { size: 256, kind: 'data' });
    t('panels', { size: 512 });
    t('panelsNormal', { size: 512, kind: 'normal', strength: 2.5 });
    t('panelsORM', { size: 512, kind: 'data' });
    t('bark', { size: 512 });
    t('barkNormal', { size: 512, kind: 'normal', strength: 2.5 });
    t('brushed', { size: 512, kind: 'data' });
    t('waterNormal', { size: 512, kind: 'normal', strength: 1.6 });
    t('leaves', { size: 512, alpha: true, seed: 3, wrap: THREE.ClampToEdgeWrapping });
    t('needles', { size: 512, alpha: true, seed: 5, wrap: THREE.ClampToEdgeWrapping });
    t('softDot', { size: 64, kind: 'data', alpha: true });
    // Race kit (baked lazily by games that ask for it).
    this.bakeRaceKit = () => {
      t('asphalt', { size: 1024 });
      t('asphaltNormal', { size: 512, kind: 'normal', strength: 1.4 });
      t('curb', { size: 256 });
      t('frond', { size: 512, alpha: true, seed: 9, wrap: THREE.ClampToEdgeWrapping });
      return this.textures;
    };
    t('smoke', { size: 128, kind: 'data', alpha: true });
    t('flame', { size: 128, kind: 'data', alpha: true });
    t('spark', { size: 64, kind: 'data', alpha: true });

    const L = this.lib;
    L.plaza = new THREE.MeshStandardMaterial({
      name: 'אבן רחבה',
      map: T.tiles,
      normalMap: T.tilesNormal,
      roughnessMap: T.tilesORM,
      aoMap: T.tilesORM,
      aoMapIntensity: 0.9,
      roughness: 1,
      metalness: 0,
    });
    L.stone = new THREE.MeshStandardMaterial({ name: 'אבן', color: 0xb9b3a8, roughness: 0.78, metalness: 0 });
    this.triplanar(L.stone, this.textures.rock, this.textures.rockNormal, 0.35, 0.8);
    L.marble = new THREE.MeshPhysicalMaterial({ name: 'שיש', color: 0xefebe4, roughness: 0.22, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.18 });
    this.triplanar(L.marble, this.textures.tiles, this.textures.rockNormal, 0.12, 0.15, true);
    L.rock = new THREE.MeshStandardMaterial({ name: 'סלע', color: 0xffffff, roughness: 0.92, metalness: 0 });
    this.triplanar(L.rock, this.textures.rock, this.textures.rockNormal, 0.22, 1.1);
    L.wood = new THREE.MeshStandardMaterial({
      name: 'עץ',
      map: this.textures.wood,
      normalMap: this.textures.woodNormal,
      roughnessMap: this.textures.woodORM,
      aoMap: this.textures.woodORM,
      roughness: 1,
    });
    L.panels = new THREE.MeshStandardMaterial({
      name: 'לוחות מתכת',
      map: this.textures.panels,
      normalMap: this.textures.panelsNormal,
      roughnessMap: this.textures.panelsORM,
      metalnessMap: this.textures.panelsORM,
      aoMap: this.textures.panelsORM,
      roughness: 1,
      metalness: 1,
    });
    L.bark = new THREE.MeshStandardMaterial({ name: 'קליפת עץ', map: T.bark, normalMap: T.barkNormal, roughness: 0.95 });
    L.darkMetal = new THREE.MeshStandardMaterial({ name: 'מתכת כהה', color: 0x2a2d33, roughness: 0.42, metalness: 0.9 });
    L.iron = new THREE.MeshStandardMaterial({ name: 'ברזל', color: 0x1b1c1f, roughness: 0.6, metalness: 0.75 });
    L.brass = new THREE.MeshStandardMaterial({ name: 'פליז', color: 0xc9a24a, roughness: 0.32, metalness: 1 });

    // Showcase PBR set.
    L.gold = new THREE.MeshStandardMaterial({ name: 'זהב', color: 0xffc766, metalness: 1, roughness: 0.16 });
    L.chrome = new THREE.MeshStandardMaterial({ name: 'כרום', color: 0xf2f4f7, metalness: 1, roughness: 0.03 });
    L.copper = new THREE.MeshStandardMaterial({ name: 'נחושת מוברשת', color: 0xf0a37a, metalness: 1, roughness: 1, roughnessMap: T.brushed });
    L.carPaint = new THREE.MeshPhysicalMaterial({ name: 'צבע מכונית', color: 0x9c0f1e, metalness: 0.35, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.03 });
    L.glass = new THREE.MeshPhysicalMaterial({ name: 'זכוכית', color: 0xffffff, metalness: 0, roughness: 0.015, transmission: 1, thickness: 1.2, ior: 1.52, attenuationColor: new THREE.Color(0xd8f6ff), attenuationDistance: 9, specularIntensity: 1, envMapIntensity: 1.2 });
    this.trackRefractive(L.glass);
    L.velvet = new THREE.MeshPhysicalMaterial({ name: 'קטיפה', color: 0x2c1a5c, roughness: 0.9, sheen: 1, sheenRoughness: 0.35, sheenColor: new THREE.Color(0xb49cff) });
    L.pearl = new THREE.MeshPhysicalMaterial({ name: 'פנינה', color: 0xf5f1ff, metalness: 0.1, roughness: 0.2, iridescence: 1, iridescenceIOR: 1.6, iridescenceThicknessRange: [180, 620], clearcoat: 0.5 });
    L.ceramic = new THREE.MeshPhysicalMaterial({ name: 'קרמיקה', color: 0xf3f0ea, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 });
    L.rubber = new THREE.MeshStandardMaterial({ name: 'גומי', color: 0x151516, roughness: 0.9, metalness: 0 });
    L.plastic = new THREE.MeshStandardMaterial({ name: 'פלסטיק', color: 0xe85d2a, roughness: 0.5, metalness: 0 });

    // Authored emissive signals.
    L.neonCyan = this.emissiveMaterial('ניאון תכלת', 0x0b0d10, 0x39d9ff, 3.2);
    L.neonAmber = this.emissiveMaterial('ניאון ענבר', 0x0b0d10, 0xffa21f, 3.2);
    L.neonMagenta = this.emissiveMaterial('ניאון מג׳נטה', 0x0b0d10, 0xff3fae, 3.0);
    L.lampGlow = this.emissiveMaterial('נורה', 0xfff2dd, 0xffc98a, 0.0);
    L.core = this.emissiveMaterial('ליבה', 0x10141a, 0x7fe6ff, 4.2);
    this.fresnel(L.core, new THREE.Color(0.4, 0.9, 1.0), 2.4, 4.0);
    L.ember = this.emissiveMaterial('גחלים', 0x120804, 0xff5a12, 2.5);
    return L;
  }

  emissiveMaterial(name, color, emissive, base) {
    const m = new THREE.MeshStandardMaterial({ name, color, emissive, emissiveIntensity: base, roughness: 0.35, metalness: 0 });
    this.emissive.push({ material: m, base });
    return m;
  }

  /** Registers an existing material's emissive for exposure compensation. */
  trackEmissive(material, base) {
    this.emissive.push({ material, base });
  }

  untrackEmissive(material) {
    const i = this.emissive.findIndex((x) => x.material === material);
    if (i >= 0) this.emissive.splice(i, 1);
  }

  setEmissiveBase(material, base) {
    const e = this.emissive.find((x) => x.material === material);
    if (e) e.base = base;
  }

  /** Called every frame with the current exposure. */
  update(exposure, time) {
    const s = Math.pow(1 / Math.max(exposure, 1e-4), 0.85) * 1.2;
    for (const e of this.emissive) e.material.emissiveIntensity = e.base * s;
    for (const m of this.animated) {
      const sh = m.userData.shader;
      if (sh && sh.uniforms.uTime) sh.uniforms.uTime.value = time;
    }
    this.emissiveScale = s;
  }

  /** World-space triplanar albedo + whiteout-blended normal mapping. */
  triplanar(material, map, normalMap, scale = 0.25, normalScale = 1, tintOnly = false) {
    material.map = map;
    material.normalMap = normalMap;
    material.normalScale = new THREE.Vector2(normalScale, normalScale);
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      if (prev) prev(shader, r);
      shader.uniforms.uTpScale = { value: scale };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNormal;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          mat4 tpModel = modelMatrix;
          #ifdef USE_INSTANCING
            tpModel = modelMatrix * instanceMatrix;
          #endif
          vTpPos = (tpModel * vec4(transformed, 1.0)).xyz;
          vTpNormal = normalize(mat3(tpModel) * objectNormal);`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTpPos;\nvarying vec3 vTpNormal;\nuniform float uTpScale;')
        .replace(
          '#include <map_fragment>',
          `vec3 tpN = normalize(vTpNormal);
          vec3 tpW = pow(abs(tpN), vec3(4.0)); tpW /= dot(tpW, vec3(1.0));
          vec2 tpUx = vTpPos.zy * uTpScale; vec2 tpUy = vTpPos.xz * uTpScale; vec2 tpUz = vTpPos.xy * uTpScale;
          vec4 tpCol = texture2D(map, tpUx) * tpW.x + texture2D(map, tpUy) * tpW.y + texture2D(map, tpUz) * tpW.z;
          ${tintOnly ? 'diffuseColor.rgb *= mix(vec3(1.0), tpCol.rgb * 1.6, 0.35);' : 'diffuseColor *= tpCol;'}`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `{
            vec3 tnX = texture2D(normalMap, tpUx).xyz * 2.0 - 1.0;
            vec3 tnY = texture2D(normalMap, tpUy).xyz * 2.0 - 1.0;
            vec3 tnZ = texture2D(normalMap, tpUz).xyz * 2.0 - 1.0;
            tnX.xy *= normalScale; tnY.xy *= normalScale; tnZ.xy *= normalScale;
            tnX = vec3(tnX.xy + tpN.zy, abs(tnX.z) * tpN.x);
            tnY = vec3(tnY.xy + tpN.xz, abs(tnY.z) * tpN.y);
            tnZ = vec3(tnZ.xy + tpN.xy, abs(tnZ.z) * tpN.z);
            vec3 tpWorldN = normalize(tnX.zyx * tpW.x + tnY.xzy * tpW.y + tnZ.xyz * tpW.z);
            normal = normalize((viewMatrix * vec4(tpWorldN, 0.0)).xyz);
            #ifdef DOUBLE_SIDED
              normal *= faceDirection;
            #endif
          }`,
        );
    };
    const key = `triplanar-${scale}-${tintOnly}`;
    const prevKey = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => prevKey() + key;
    material.needsUpdate = true;
    return material;
  }

  /** Adds a view-dependent rim glow (energy cores, shields). */
  fresnel(material, color, power, strength) {
    const prev = material.onBeforeCompile;
    material.onBeforeCompile = (shader, r) => {
      if (prev) prev(shader, r);
      shader.uniforms.uRimColor = { value: color };
      shader.uniforms.uRimPower = { value: power };
      shader.uniforms.uRimStrength = { value: strength };
      material.userData.rim = shader.uniforms;
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimPower; uniform float uRimStrength;')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float rimF = pow(1.0 - saturate(dot(normalize(vNormal), normalize(vViewPosition))), uRimPower);
          totalEmissiveRadiance += uRimColor * rimF * uRimStrength * max(max(emissive.r, emissive.g), emissive.b) * 0.25;`,
        );
    };
    const prevKey = material.customProgramCacheKey.bind(material);
    material.customProgramCacheKey = () => prevKey() + 'fresnel';
    material.needsUpdate = true;
    return material;
  }
}
