import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { buildWorld, CITY } from './world.js';
import { Dove, SKINS } from './dove.js';
import { Audio } from './audio.js';
import * as T from './textures.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('jdove.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('jdove.' + k, JSON.stringify(v)); } catch {} },
};

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.5;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
$('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xe8b48a, 0.00042);
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.5, 9000);

// Sunset sky, sun low in the west.
const sky = new Sky(); sky.scale.setScalar(8000); scene.add(sky);
const sun = new THREE.Vector3();
const su = sky.material.uniforms;
su.turbidity.value = 7; su.rayleigh.value = 2.4; su.mieCoefficient.value = 0.008; su.mieDirectionalG.value = 0.86;
sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(-100));
su.sunPosition.value.copy(sun);
const pmrem = new THREE.PMREMGenerator(renderer);
const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(1000);
Object.assign(envSky.material.uniforms.sunPosition.value, sun);
envSky.material.uniforms.turbidity.value = 7; envSky.material.uniforms.rayleigh.value = 2.4;
envScene.add(envSky);
scene.environment = pmrem.fromScene(envScene).texture;
scene.environmentIntensity = 0.55;

const hemi = new THREE.HemisphereLight(0xffd2a8, 0x6a5a48, 0.9); scene.add(hemi);
const sunLight = new THREE.DirectionalLight(0xffb070, 2.7);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
const sc = sunLight.shadow.camera; sc.left = sc.bottom = -220; sc.right = sc.top = 220; sc.near = 10; sc.far = 1600;
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.6;
scene.add(sunLight, sunLight.target);

// Big sun glow sprite.
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glowTexture('255,190,110'), color: 0xffc07a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
sunSprite.scale.set(520, 520, 1); sunSprite.material.opacity = 0.7; scene.add(sunSprite);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { samples: 4, type: THREE.HalfFloatType }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.22, 0.5, 0.97);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// ---------- world ----------
const world = buildWorld(scene);
const { colliders, landmarks, heightAt } = world;

// Spatial grid for colliders.
const CELL = 60, grid = new Map();
colliders.forEach((b, i) => {
  for (let x = Math.floor(b.min.x / CELL); x <= Math.floor(b.max.x / CELL); x++)
    for (let z = Math.floor(b.min.z / CELL); z <= Math.floor(b.max.z / CELL); z++) {
      const k = x + ',' + z; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i);
    }
});
const nearColliders = (p) => grid.get(Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL)) || [];

// ---------- dove ----------
const dove = new Dove();
scene.add(dove.root);
const player = {
  pos: new THREE.Vector3(-700, 150, 40),
  yaw: -Math.PI / 2, pitch: 0, roll: 0,
  speed: 55, stamina: 1, boosting: false, flapT: 0,
};
const BASE = 55, MAXB = 115, MIN = 28;

// ---------- collectibles: the letters of ירושלים ----------
const WORD = ['י', 'ר', 'ו', 'ש', 'ל', 'י', 'ם'];
const letterSpots = [
  ['מגדל דוד', new THREE.Vector3(CITY.x0 + 44, 110, 59)],
  ['הכותל המערבי', new THREE.Vector3(40, 62, 70)],
  ['כיפת הסלע', new THREE.Vector3(150, 105, 20)],
  ['שער שכם', new THREE.Vector3(-20, 78, CITY.z0 - 20)],
  ['גשר המיתרים', null],
  ['טחנת הרוח של מונטיפיורי', null],
  ['הכנסת', null],
];
for (const s of letterSpots) if (!s[1]) { const l = landmarks.find(l => l.name === s[0]); s[1] = l.pos.clone().add(new THREE.Vector3(0, 12, 0)); }
const letters = WORD.map((ch, i) => {
  const g = new THREE.Group();
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.letterTexture(ch), transparent: true, depthWrite: false, fog: false }));
  sp.scale.set(14, 14, 1);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.5, 8, 48), new THREE.MeshStandardMaterial({ color: 0xffd36a, emissive: 0xffa21a, emissiveIntensity: 2.2, metalness: 1, roughness: 0.3 }));
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 3.5, 160, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
  beam.position.y = 80;
  g.add(sp, ring, beam);
  g.position.copy(letterSpots[i][1]);
  scene.add(g);
  return { ch, g, ring, got: false, where: letterSpots[i][0] };
});
let lettersGot = 0;

// ---------- ring course around the walls ----------
const ringCourse = [];
{
  const pts = [
    [CITY.x0 - 40, 70, 10], [CITY.x0 - 30, 75, -160], [-150, 80, CITY.z0 - 40], [60, 90, CITY.z0 - 45], [CITY.x1 + 40, 70, -170],
    [CITY.x1 + 60, 55, 0], [CITY.x1 + 40, 60, 170], [120, 75, CITY.z1 + 45], [-60, 85, CITY.z1 + 40], [-200, 70, CITY.z1 + 30],
    [CITY.x0 - 45, 80, 130], [CITY.x0 - 40, 70, 10],
  ];
  const mat = new THREE.MeshStandardMaterial({ color: 0x7fe0ff, emissive: 0x2aa8ff, emissiveIntensity: 1.6, transparent: true, opacity: 0.85 });
  pts.forEach(([x, y, z], i) => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(11, 0.9, 10, 40), mat.clone());
    m.position.set(x, y, z);
    const next = pts[(i + 1) % pts.length], prev = pts[(i - 1 + pts.length) % pts.length];
    m.lookAt(next[0] - prev[0] + x, y, next[2] - prev[2] + z);
    m.visible = i === 0;
    scene.add(m);
    ringCourse.push(m);
  });
  ringCourse[0].material.color.set(0x7dff9a); ringCourse[0].material.emissive.set(0x1fd66a);
}
const race = { active: false, idx: 0, t: 0, best: store.get('best', null) };

// ---------- particles (sparkles / fireworks) ----------
const sparkTex = T.glowTexture('255,230,160');
const sparks = [];
function burst(pos, color = 0xffd27a, n = 40, spread = 22) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.position.copy(pos); s.scale.setScalar(2 + Math.random() * 2);
    const v = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(spread * (0.4 + Math.random()));
    scene.add(s); sparks.push({ s, v, life: 1.2 + Math.random() * 0.8, max: 2 });
  }
}
// Wing trail.
const trail = [];
const trailMat = new THREE.SpriteMaterial({ map: sparkTex, color: 0xfff1d0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.5 });

// ---------- input ----------
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (state !== 'play') return;
  if (e.code === 'Space') { flapNow(); e.preventDefault(); }
  if (e.code === 'KeyC') camMode = (camMode + 1) % 2;
  if (e.code === 'KeyM') $('mute').textContent = audio.toggleMute() ? '🔇' : '🔊';
  if (e.code === 'KeyP' || e.code === 'Escape') pause(true);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
// Mouse drag to look around.
let look = { yaw: 0, pitch: 0, drag: false, lx: 0, ly: 0 };
renderer.domElement.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') { look.drag = true; look.lx = e.clientX; look.ly = e.clientY; } });
addEventListener('pointerup', () => { look.drag = false; });
addEventListener('pointermove', (e) => {
  if (!look.drag) return;
  look.yaw -= (e.clientX - look.lx) * 0.006; look.pitch = THREE.MathUtils.clamp(look.pitch + (e.clientY - look.ly) * 0.004, -0.6, 0.9);
  look.lx = e.clientX; look.ly = e.clientY;
});
// Touch joystick.
const touch = { x: 0, y: 0, id: null, boost: false };
const stick = $('stick'), knob = $('knob');
stick.addEventListener('pointerdown', (e) => { touch.id = e.pointerId; stick.setPointerCapture(e.pointerId); moveStick(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === touch.id) moveStick(e); });
stick.addEventListener('pointerup', () => { touch.id = null; touch.x = touch.y = 0; knob.style.transform = ''; });
function moveStick(e) {
  const r = stick.getBoundingClientRect();
  let dx = (e.clientX - r.left - r.width / 2) / (r.width / 2), dy = (e.clientY - r.top - r.height / 2) / (r.height / 2);
  const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; }
  touch.x = dx; touch.y = dy;
  knob.style.transform = `translate(${dx * 38}px, ${dy * 38}px)`;
}
$('btnFlap').addEventListener('pointerdown', (e) => { e.preventDefault(); flapNow(); });
$('btnBoost').addEventListener('pointerdown', (e) => { e.preventDefault(); touch.boost = true; });
$('btnBoost').addEventListener('pointerup', () => { touch.boost = false; });
$('btnBoost').addEventListener('pointerleave', () => { touch.boost = false; });

function flapNow() {
  if (player.flapT > 0.25) return;
  player.flapT = 0.7;
  audio.flap();
}

// ---------- UI ----------
const audio = new Audio();
let state = 'menu', camMode = 0;
let chosenSkin = 'white';
const unlocked = () => store.get('goldUnlocked', false);
function renderSkins() {
  const box = $('skins'); box.innerHTML = '';
  for (const [id, s] of Object.entries(SKINS)) {
    const locked = s.secret && !unlocked();
    const b = document.createElement('button');
    b.className = 'skin' + (id === chosenSkin ? ' on' : '') + (locked ? ' locked' : '');
    b.innerHTML = `<span class="sw" style="background:linear-gradient(135deg,#${s.body.toString(16).padStart(6, '0')} 40%,#${s.tip.toString(16).padStart(6, '0')})"></span>${locked ? '🔒 סוד' : s.name}`;
    b.onclick = () => { if (locked) return; chosenSkin = id; dove.setSkin(id); renderSkins(); };
    box.appendChild(b);
  }
}
renderSkins();
$('play').onclick = () => startGame();
$('resume').onclick = () => pause(false);
$('mute').onclick = () => { $('mute').textContent = audio.toggleMute() ? '🔇' : '🔊'; };
$('pauseBtn').onclick = () => pause(true);
$('toMenu').onclick = () => { $('pause').classList.add('hidden'); $('win').classList.add('hidden'); showMenu(); };
$('keepFlying').onclick = () => { $('win').classList.add('hidden'); state = 'play'; };

function showMenu() {
  state = 'menu';
  renderSkins();
  $('menu').classList.remove('hidden'); $('hud').classList.add('hidden');
}
function startGame() {
  audio.start();
  $('menu').classList.add('hidden'); $('hud').classList.remove('hidden');
  state = 'play';
  Object.assign(player, { pos: new THREE.Vector3(-700, 150, 40), yaw: -Math.PI / 2, // face east toward the Old City
    pitch: 0, roll: 0, speed: 55, stamina: 1 });
  snapCam = true;
  toast('ברוכים הבאים לירושלים — אספו את 7 אותיות העיר', 4);
}
function pause(on) {
  if (on && state === 'play') { state = 'pause'; $('pause').classList.remove('hidden'); }
  else if (!on && state === 'pause') { state = 'play'; $('pause').classList.add('hidden'); }
}
let toastTimer = 0;
function toast(msg, sec = 2.5) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); toastTimer = sec; }
function renderLetters() {
  // Display in reading order (RTL container).
  $('letters').innerHTML = letters.map(l => `<span class="${l.got ? 'got' : ''}">${l.ch}</span>`).join('');
}
renderLetters();

// ---------- minimap ----------
const mapCanvas = $('minimap'), mctx = mapCanvas.getContext('2d');
const MAP_RANGE = 2000, MAP_RES = 1024;
const mapImg = document.createElement('canvas'); mapImg.width = mapImg.height = MAP_RES;
{
  const g = mapImg.getContext('2d');
  const img = g.createImageData(MAP_RES, MAP_RES);
  for (let y = 0; y < MAP_RES; y += 2) for (let x = 0; x < MAP_RES; x += 2) {
    const wx = (x / MAP_RES - 0.5) * 2 * MAP_RANGE, wz = (y / MAP_RES - 0.5) * 2 * MAP_RANGE;
    const h = heightAt(wx, wz);
    const v = 60 + h * 0.9;
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = ((y + dy) * MAP_RES + x + dx) * 4;
      img.data[i] = v * 0.75; img.data[i + 1] = v * 0.72; img.data[i + 2] = v * 0.55; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const toMap = (v) => (v / (2 * MAP_RANGE) + 0.5) * MAP_RES;
  const k = MAP_RES / (2 * MAP_RANGE);
  g.fillStyle = 'rgba(90,110,60,0.8)';
  for (const [x, z] of world.mapFeatures.trees) g.fillRect(toMap(x) - 0.8, toMap(z) - 0.8, 1.6, 1.6);
  for (const [x, z, w, d, modern] of world.mapFeatures.buildings) {
    g.fillStyle = modern ? 'rgba(235,222,196,0.95)' : 'rgba(250,238,210,1)';
    g.fillRect(toMap(x) - w * k / 2, toMap(z) - d * k / 2, Math.max(1, w * k), Math.max(1, d * k));
  }
  g.strokeStyle = '#8a5a2b'; g.lineWidth = 3;
  for (const [ax, az, bx, bz] of world.mapFeatures.walls) { g.beginPath(); g.moveTo(toMap(ax), toMap(az)); g.lineTo(toMap(bx), toMap(bz)); g.stroke(); }
  g.fillStyle = '#f2c14e'; g.beginPath(); g.arc(toMap(150), toMap(20), 5, 0, 7); g.fill();
}
function drawMinimap() {
  const W = mapCanvas.width, R = W / 2, view = 700;
  mctx.save();
  mctx.clearRect(0, 0, W, W);
  mctx.beginPath(); mctx.arc(R, R, R - 2, 0, Math.PI * 2); mctx.clip();
  mctx.translate(R, R);
  // Rotate so the flight direction points up.
  mctx.rotate(player.yaw);
  const s = W / (2 * view), px = (player.pos.x / (2 * MAP_RANGE) + 0.5) * MAP_RES, pz = (player.pos.z / (2 * MAP_RANGE) + 0.5) * MAP_RES;
  const srcSize = view * 2 * MAP_RES / (2 * MAP_RANGE);
  mctx.drawImage(mapImg, px - srcSize / 2, pz - srcSize / 2, srcSize, srcSize, -view * s, -view * s, 2 * view * s, 2 * view * s);
  for (const l of letters) {
    if (l.got) continue;
    let dx = (l.g.position.x - player.pos.x) * s, dz = (l.g.position.z - player.pos.z) * s;
    const d = Math.hypot(dx, dz), max = R - 12;
    if (d > max) { dx *= max / d; dz *= max / d; }
    mctx.save(); mctx.translate(dx, dz); mctx.rotate(-player.yaw);
    mctx.fillStyle = '#ffcf4a'; mctx.strokeStyle = '#6b3d00'; mctx.lineWidth = 2;
    mctx.beginPath(); mctx.arc(0, 0, 9, 0, 7); mctx.fill(); mctx.stroke();
    mctx.fillStyle = '#4a2a00'; mctx.font = 'bold 12px Rubik, sans-serif'; mctx.textAlign = 'center'; mctx.textBaseline = 'middle';
    mctx.fillText(l.ch, 0, 1); mctx.restore();
  }
  {
    const r = ringCourse[race.active ? race.idx : 0];
    const dx = (r.position.x - player.pos.x) * s, dz = (r.position.z - player.pos.z) * s;
    if (Math.hypot(dx, dz) < R) { mctx.strokeStyle = race.active ? '#6fd8ff' : '#7dff9a'; mctx.lineWidth = 3; mctx.beginPath(); mctx.arc(dx, dz, 6, 0, 7); mctx.stroke(); }
  }
  mctx.restore();
  // Player arrow (always up).
  mctx.fillStyle = '#fff'; mctx.strokeStyle = '#1b2a3a'; mctx.lineWidth = 2;
  mctx.beginPath(); mctx.moveTo(R, R - 11); mctx.lineTo(R + 7, R + 8); mctx.lineTo(R, R + 4); mctx.lineTo(R - 7, R + 8); mctx.closePath(); mctx.fill(); mctx.stroke();
  // North marker.
  mctx.fillStyle = '#ffdf8a'; mctx.font = 'bold 13px Rubik, sans-serif'; mctx.textAlign = 'center';
  mctx.fillText('צ', R + Math.sin(player.yaw) * (R - 12), R - Math.cos(player.yaw) * (R - 12) + 4);
}

// ---------- game loop ----------
const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), fwd = new THREE.Vector3(), camTarget = new THREE.Vector3(), camPos = new THREE.Vector3(-650, 180, 40);
let snapCam = false, shake = 0, elapsed = 0, lastLandmark = null, menuOrbit = 0;
camera.position.copy(camPos);

function updatePlayer(dt) {
  const left = keys.KeyA || keys.ArrowLeft, right = keys.KeyD || keys.ArrowRight;
  const up = keys.KeyW || keys.ArrowUp, down = keys.KeyS || keys.ArrowDown;
  const steer = (right ? 1 : 0) - (left ? 1 : 0) + touch.x;
  const climb = (up ? 1 : 0) - (down ? 1 : 0) - touch.y;
  const wantBoost = (keys.ShiftLeft || keys.ShiftRight || touch.boost) && player.stamina > 0.02;
  player.boosting = wantBoost;
  player.stamina = THREE.MathUtils.clamp(player.stamina + (wantBoost ? -0.28 : 0.12) * dt, 0, 1);

  // Bank into turns; yaw rate follows bank.
  player.roll = THREE.MathUtils.lerp(player.roll, -steer * 0.85, dt * 3.5);
  player.yaw += player.roll * dt * 1.25;
  player.pitch = THREE.MathUtils.lerp(player.pitch, climb * 0.55, dt * 2.6);
  player.flapT = Math.max(0, player.flapT - dt);

  const target = wantBoost ? MAXB : BASE;
  player.speed = THREE.MathUtils.lerp(player.speed, target, dt * (wantBoost ? 1.6 : 0.8));
  player.speed -= Math.sin(player.pitch) * 18 * dt;       // climbing costs speed
  player.speed = THREE.MathUtils.clamp(player.speed, MIN, MAXB + 10);

  fwd.set(0, 0, -1).applyEuler(new THREE.Euler(player.pitch, player.yaw, 0, 'YXZ'));
  player.pos.addScaledVector(fwd, player.speed * dt);
  if (player.flapT > 0) player.pos.y += 26 * dt * (player.flapT / 0.7);

  // Ceiling, bounds.
  player.pos.y = Math.min(player.pos.y, 520);
  const lim = 1950;
  if (Math.abs(player.pos.x) > lim || Math.abs(player.pos.z) > lim) {
    player.yaw += dt * 2.2; if (toastTimer <= 0) toast('חוזרים לעיר…', 1.5);
    player.pos.x = THREE.MathUtils.clamp(player.pos.x, -lim - 20, lim + 20); player.pos.z = THREE.MathUtils.clamp(player.pos.z, -lim - 20, lim + 20);
  }
  // Ground.
  const gh = heightAt(player.pos.x, player.pos.z) + 3;
  if (player.pos.y < gh) { player.pos.y = gh; player.pitch = Math.max(player.pitch, 0.25); if (shake < 0.1) { shake = 0.4; audio.bump(); } player.speed *= 0.98; }
  // Buildings/landmarks.
  const R = 2.6;
  for (const i of nearColliders(player.pos)) {
    const b = colliders[i];
    if (player.pos.x > b.min.x - R && player.pos.x < b.max.x + R && player.pos.y > b.min.y - R && player.pos.y < b.max.y + R && player.pos.z > b.min.z - R && player.pos.z < b.max.z + R) {
      const pen = [
        [player.pos.y - (b.max.y + R), 'y', b.max.y + R + 0.1],   // resolve upward first (landing on roofs)
        [player.pos.x - (b.min.x - R), 'x', b.min.x - R - 0.1],
        [(b.max.x + R) - player.pos.x, 'x', b.max.x + R + 0.1],
        [player.pos.z - (b.min.z - R), 'z', b.min.z - R - 0.1],
        [(b.max.z + R) - player.pos.z, 'z', b.max.z + R + 0.1],
      ].map(([d, ax, v], k) => [k === 0 ? -d : d, ax, v]).sort((a, b) => a[0] - b[0])[0];
      player.pos[pen[1]] = pen[2];
      if (pen[1] !== 'y') { player.yaw += Math.PI * 0.35 * (Math.random() < 0.5 ? 1 : -1); player.speed = Math.max(MIN, player.speed * 0.6); }
      if (shake < 0.15) { shake = 0.6; audio.bump(); }
    }
  }

  dove.root.position.copy(player.pos);
  dove.root.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
  dove.visual.rotation.z = player.roll;
  dove.update(dt, (player.speed - MIN) / (MAXB - MIN), player.flapT > 0 || player.boosting ? 1 : 0, player.roll);
  audio.setWind((player.speed - MIN) / (MAXB - MIN), player.boosting);
}

function updateCamera(dt, t) {
  if (state === 'menu') {
    menuOrbit += dt * 0.05;
    camPos.set(Math.cos(menuOrbit) * 420, 170, Math.sin(menuOrbit) * 420);
    camera.position.lerp(camPos, 0.05);
    camera.lookAt(80, 60, 0);
    return;
  }
  const back = camMode === 0 ? 16 : 34, upOff = camMode === 0 ? 5 : 12;
  const yaw = player.yaw + look.yaw;
  if (!look.drag) { look.yaw *= Math.pow(0.1, dt); look.pitch *= Math.pow(0.2, dt); }
  const speedK = (player.speed - MIN) / (MAXB - MIN);
  camPos.set(Math.sin(yaw) * (back + speedK * 5), upOff + look.pitch * 18 - player.pitch * 4, Math.cos(yaw) * (back + speedK * 5)).add(player.pos);
  const gh = heightAt(camPos.x, camPos.z) + 2; if (camPos.y < gh) camPos.y = gh;
  if (snapCam) { camera.position.copy(camPos); snapCam = false; } else camera.position.lerp(camPos, 1 - Math.pow(0.0008, dt));
  camTarget.copy(player.pos).addScaledVector(fwd, 8); camTarget.y += 2;
  camera.lookAt(camTarget);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 1.5); }
  camera.fov = THREE.MathUtils.lerp(camera.fov, 62 + speedK * 14, dt * 2); camera.updateProjectionMatrix();
}

function updateGameplay(dt, t) {
  // Letters.
  for (const l of letters) {
    if (l.got) continue;
    l.ring.rotation.y = t * 1.4;
    l.g.position.y += Math.sin(t * 2 + l.g.position.x) * 0.03;
    if (l.g.position.distanceTo(player.pos) < 13) {
      l.got = true; l.g.visible = false; lettersGot++;
      audio.chime(lettersGot * 2); burst(l.g.position);
      renderLetters();
      toast(`אספת את האות ${l.ch} — ${l.where} (${lettersGot}/7)`, 3);
      if (lettersGot === 7) winGame();
    }
  }
  // Ring race.
  const r = ringCourse[race.active ? race.idx : 0];
  r.rotation.z += dt * 0.6;
  if (r.position.distanceTo(player.pos) < 12) {
    if (!race.active) {
      race.active = true; race.idx = 1; race.t = 0;
      ringCourse[0].visible = false; ringCourse[1].visible = true; ringCourse[2].visible = true;
      audio.ring(); toast('מסלול החומות! עברו בכל הטבעות', 2.5);
    } else {
      audio.ring(); burst(r.position, 0x8fe6ff, 18, 14);
      r.visible = false; race.idx++;
      if (race.idx >= ringCourse.length) {
        race.active = false;
        const tt = race.t;
        const best = race.best == null || tt < race.best;
        if (best) { race.best = tt; store.set('best', tt); }
        toast(`סיימת את מסלול החומות ב-${tt.toFixed(1)} שניות${best ? ' — שיא חדש! 🏆' : ''}`, 4);
        audio.fanfare();
        ringCourse.forEach((m, i) => { m.visible = i === 0; });
      } else {
        ringCourse[race.idx].visible = true;
        if (ringCourse[race.idx + 1]) ringCourse[race.idx + 1].visible = true;
      }
    }
  }
  if (race.active) { race.t += dt; $('race').textContent = `⏱ ${race.t.toFixed(1)}  ·  טבעת ${race.idx}/${ringCourse.length - 1}`; $('race').classList.remove('hidden'); }
  else { $('race').classList.add('hidden'); }

  // Landmark proximity.
  let near = null;
  for (const lm of landmarks) if (lm.pos.distanceTo(player.pos) < lm.radius) near = lm;
  if (near && near !== lastLandmark) { $('place').textContent = '📍 ' + near.name; $('place').classList.add('show'); }
  if (!near) $('place').classList.remove('show');
  lastLandmark = near;

  // Trail sparkles at speed.
  if (player.speed > 80 && Math.random() < 0.6) {
    const s = new THREE.Sprite(trailMat.clone());
    s.position.copy(player.pos).add(tmpV.set((Math.random() - 0.5) * 3, 0, (Math.random() - 0.5) * 1));
    s.scale.setScalar(1.2);
    scene.add(s); trail.push({ s, life: 0.6 });
  }

  // HUD.
  $('spd').textContent = Math.round(player.speed * 1.8);
  $('alt').textContent = Math.round(player.pos.y - heightAt(player.pos.x, player.pos.z) + 750);
  $('stam').style.width = (player.stamina * 100) + '%';
  $('stam').classList.toggle('low', player.stamina < 0.2);
  drawMinimap();
}

function winGame() {
  store.set('goldUnlocked', true);
  const p = player.pos.clone();
  for (let k = 0; k < 6; k++) setTimeout(() => burst(p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 80, 30 + Math.random() * 40, (Math.random() - 0.5) * 80)), [0xffd27a, 0x8fd0ff, 0xffffff][k % 3], 60, 30), k * 350);
  audio.fanfare();
  setTimeout(() => { state = 'win'; $('win').classList.remove('hidden'); }, 1800);
}

function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  if (state === 'play') { updatePlayer(dt); updateGameplay(dt, elapsed); }
  else if (state === 'menu') { dove.update(dt, 0.5, 0, 0); dove.root.position.set(Math.cos(menuOrbit + 0.3) * 330, 120 + Math.sin(elapsed) * 4, Math.sin(menuOrbit + 0.3) * 330); dove.root.rotation.set(0, -menuOrbit - 0.3 + Math.PI, 0); dove.visual.rotation.z = 0.25; }
  updateCamera(dt, elapsed);
  for (const a of world.animated) a(elapsed, dt);
  for (let i = sparks.length - 1; i >= 0; i--) {
    const p = sparks[i]; p.life -= dt;
    p.s.position.addScaledVector(p.v, dt); p.v.y -= 9 * dt; p.v.multiplyScalar(1 - dt * 0.8);
    p.s.material.opacity = Math.max(0, p.life / p.max);
    if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); sparks.splice(i, 1); }
  }
  for (let i = trail.length - 1; i >= 0; i--) {
    const p = trail[i]; p.life -= dt; p.s.material.opacity = p.life; p.s.scale.multiplyScalar(0.97);
    if (p.life <= 0) { scene.remove(p.s); p.s.material.dispose(); trail.splice(i, 1); }
  }
  if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) $('toast').classList.remove('show'); }

  // Shadow camera + sun follow the player.
  const focus = state === 'menu' ? tmpV.set(80, 40, 0) : player.pos;
  sunLight.target.position.copy(focus);
  sunLight.position.copy(focus).addScaledVector(sun, 700);
  sunSprite.position.copy(camera.position).addScaledVector(sun, 3500);
  composer.render();
  requestAnimationFrame(tick);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

// ---------- Custom hero model (Tripo GLB): assets/dove.glb, embedded data, or drag & drop ----------
async function tryLoadDove() {
  const src = window.__DOVE_GLB__ || 'assets/dove.glb';
  try {
    if (!window.__DOVE_GLB__) { if (!location.protocol.startsWith('http')) return; const h = await fetch(src, { method: 'HEAD' }); if (!h.ok) return; }
    await dove.loadGLB(src);
    $('glbNote').textContent = '✓ נטען מודל תלת-ממד מותאם';
  } catch (e) { console.warn('GLB load failed', e); }
}
addEventListener('dragover', (e) => e.preventDefault());
addEventListener('drop', async (e) => {
  e.preventDefault();
  const f = e.dataTransfer.files[0];
  if (!f || !/\.glb$/i.test(f.name)) return;
  const url = URL.createObjectURL(f);
  await dove.loadGLB(url);
  toast('המודל החדש של היונה נטען! 🕊️', 3);
});

$('loading').classList.add('hidden');
$('menu').classList.remove('hidden');
tryLoadDove();
tick();
// Test hook: advance the simulation without rendering (used by automated playtests).
function sim(n, input = {}) {
  Object.assign(keys, input);
  for (let i = 0; i < n; i++) { updatePlayer(1 / 60); updateGameplay(1 / 60, elapsed += 1 / 60); updateCamera(1 / 60, elapsed); }
  for (const k in input) keys[k] = false;
}
window.__game = { player, letters, race, get state() { return state; }, startGame, sim, snap: () => { snapCam = true; } };
