function buildRoomEnvironment() {
  const scene = new THREE.Scene();
  const geometry = new THREE.BoxGeometry();
  geometry.deleteAttribute('uv');
  const roomMaterial = new THREE.MeshStandardMaterial({ side: THREE.BackSide });
  const boxMaterial = new THREE.MeshStandardMaterial();
  const areaLightMat = (intensity) => {
    const m = new THREE.MeshBasicMaterial();
    m.color.setScalar(intensity);
    return m;
  };

  const mainLight = new THREE.PointLight(0xffffff, 900, 28, 2);
  mainLight.position.set(0.418, 16.199, 0.3);
  scene.add(mainLight);

  const room = new THREE.Mesh(geometry, roomMaterial);
  room.position.set(-0.757, 13.219, 0.717);
  room.scale.set(31.713, 28.305, 28.591);
  scene.add(room);

  const boxes = [
    [[-10.906, 2.009, 1.846], [0, -0.195, 0], [2.328, 7.905, 4.651]],
    [[-5.607, -0.754, -0.758], [0, 0.994, 0], [1.97, 1.534, 3.955]],
    [[6.167, 0.857, 7.803], [0, 0.561, 0], [3.927, 6.285, 3.687]],
    [[-2.017, 0.018, 6.124], [0, 0.333, 0], [2.002, 4.566, 2.064]],
    [[2.291, -0.756, -2.621], [0, -0.286, 0], [1.546, 1.552, 1.496]],
    [[-2.193, -0.369, -5.547], [0, 0.516, 0], [3.875, 3.487, 2.986]],
  ];
  for (const [pos, rot, scale] of boxes) {
    const box = new THREE.Mesh(geometry, boxMaterial);
    box.position.set(...pos);
    box.rotation.set(...rot);
    box.scale.set(...scale);
    scene.add(box);
  }

  const lights = [
    [[-16.116, 14.37, 8.208], [0.1, 2.428, 2.739], 50],
    [[-16.109, 18.021, -8.207], [0.1, 2.425, 2.751], 50],
    [[14.904, 12.198, -1.832], [0.15, 4.265, 6.331], 17],
    [[-0.462, 8.89, 14.52], [4.38, 5.441, 0.088], 43],
    [[3.235, 11.486, -12.541], [2.5, 2.0, 0.1], 20],
    [[0.0, 20.0, 0.0], [1.0, 0.1, 1.0], 100],
  ];
  for (const [pos, scale, intensity] of lights) {
    const light = new THREE.Mesh(geometry, areaLightMat(intensity));
    light.position.set(...pos);
    light.scale.set(...scale);
    scene.add(light);
  }
  return scene;
}

/* ---------------------------------------------------------------------- */
/* Constants                                                               */
/* ---------------------------------------------------------------------- */

const LANE_HALF_WIDTH = 0.525;
const GUTTER_WIDTH = 0.24;
const GUTTER_DEPTH = 0.08;
const APPROACH_LENGTH = 2.0;
const FOUL_LINE_Z = 0;
const HEADPIN_Z = -9.2;
const PIN_DX = 0.3048;
const PIN_DZ = 0.2639;
const BACK_WALL_Z = HEADPIN_Z - 3 * PIN_DZ - 0.9;
const BALL_RADIUS = 0.109;
const PIN_TOP_RADIUS = 0.028;
const PIN_BASE_RADIUS = 0.062;
const PIN_HEIGHT = 0.38;
const MIN_BALL_SPEED = 4.0;
const MAX_BALL_SPEED = 8.2;
const STAND_X_LIMIT = LANE_HALF_WIDTH - BALL_RADIUS - 0.02;
const AIM_ANGLE_LIMIT = 0.32;
const TILT_KNOCKED_DOT = 0.72; // cos of ~44 degrees

const PIN_LOCAL_POSITIONS = [
  [0, 0],
  [-PIN_DX / 2, -PIN_DZ], [PIN_DX / 2, -PIN_DZ],
  [-PIN_DX, -2 * PIN_DZ], [0, -2 * PIN_DZ], [PIN_DX, -2 * PIN_DZ],
  [-1.5 * PIN_DX, -3 * PIN_DZ], [-0.5 * PIN_DX, -3 * PIN_DZ], [0.5 * PIN_DX, -3 * PIN_DZ], [1.5 * PIN_DX, -3 * PIN_DZ],
];

/* ---------------------------------------------------------------------- */
/* Renderer / scene / camera                                              */
/* ---------------------------------------------------------------------- */

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060c);
scene.fog = new THREE.Fog(0x05060c, 5, 13);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.05, 100);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(buildRoomEnvironment(), 0.04).texture;

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------------------------------------------------------------- */
/* Lighting                                                                */
/* ---------------------------------------------------------------------- */

scene.add(new THREE.HemisphereLight(0x8fa6ff, 0x0a0a12, 0.55));

const keyLight = new THREE.DirectionalLight(0xfff3e0, 1.6);
keyLight.position.set(2, 6, 3);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -4;
keyLight.shadow.camera.right = 4;
keyLight.shadow.camera.top = 6;
keyLight.shadow.camera.bottom = -13;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 16;
keyLight.shadow.bias = -0.0015;
scene.add(keyLight);

function laneSpot(z, color = 0xbcd4ff, intensity = 8) {
  const spot = new THREE.SpotLight(color, intensity, 7, Math.PI / 5, 0.6, 1.4);
  spot.position.set(0, 2.6, z);
  spot.target.position.set(0, 0, z - 1.2);
  scene.add(spot, spot.target);
}
laneSpot(-1.5);
laneSpot(-5.5);
laneSpot(-8.2, 0xffe3bf, 10);

/* ---------------------------------------------------------------------- */
/* Procedural textures                                                    */
/* ---------------------------------------------------------------------- */

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 1024;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, '#caa06a');
  grad.addColorStop(0.5, '#c1935a');
  grad.addColorStop(1, '#caa06a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 60; i++) {
    ctx.strokeStyle = Math.random() > 0.5 ? '#5a3d1f' : '#e6c896';
    ctx.lineWidth = Math.random() * 1.4 + 0.3;
    ctx.beginPath();
    const x = Math.random() * c.width;
    ctx.moveTo(x, 0);
    ctx.bezierCurveTo(x + 8, c.height * 0.3, x - 8, c.height * 0.6, x + (Math.random() * 10 - 5), c.height);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeBallTexture(hex1, hex2) {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(180, 160, 30, 256, 256, 380);
  grad.addColorStop(0, hex2);
  grad.addColorStop(1, hex1);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 140; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? hex2 : '#ffffff';
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, Math.random() * 26, 0, Math.PI * 2);
    ctx.fill();
  }
  return new THREE.CanvasTexture(c);
}

/* ---------------------------------------------------------------------- */
/* Lane geometry (visual)                                                  */
/* ---------------------------------------------------------------------- */

const laneGroup = new THREE.Group();
scene.add(laneGroup);

const woodTex = makeWoodTexture();
woodTex.repeat.set(1, 5);
const laneMat = new THREE.MeshPhysicalMaterial({
  map: woodTex, roughness: 0.28, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.18,
});

const laneLen = APPROACH_LENGTH + Math.abs(BACK_WALL_Z);
const laneCenterZ = (APPROACH_LENGTH + BACK_WALL_Z) / 2;
const laneGeo = new THREE.PlaneGeometry(LANE_HALF_WIDTH * 2, laneLen, 1, 40);
const lane = new THREE.Mesh(laneGeo, laneMat);
lane.rotation.x = -Math.PI / 2;
lane.position.set(0, 0, laneCenterZ);
lane.receiveShadow = true;
laneGroup.add(lane);

const gutterMat = new THREE.MeshPhysicalMaterial({ color: 0x1e2230, roughness: 0.4, metalness: 0.5, clearcoat: 0.5 });
for (const side of [-1, 1]) {
  const trough = new THREE.Mesh(
    new THREE.CylinderGeometry(GUTTER_WIDTH / 2, GUTTER_WIDTH / 2, laneLen, 20, 1, true, Math.PI, Math.PI),
    gutterMat,
  );
  trough.rotation.x = Math.PI / 2;
  trough.position.set(side * (LANE_HALF_WIDTH + GUTTER_WIDTH / 2), -GUTTER_DEPTH + GUTTER_WIDTH / 2, laneCenterZ);
  trough.receiveShadow = true;
  laneGroup.add(trough);
}

const railMat = new THREE.MeshPhysicalMaterial({ color: 0x3a2415, roughness: 0.45, clearcoat: 0.6 });
for (const side of [-1, 1]) {
  const rail = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, laneLen - 0.3, 4, 12), railMat);
  rail.rotation.x = Math.PI / 2;
  rail.position.set(side * (LANE_HALF_WIDTH + GUTTER_WIDTH + 0.05), 0.03, laneCenterZ);
  rail.castShadow = true;
  laneGroup.add(rail);
}

const foulLine = new THREE.Mesh(
  new THREE.PlaneGeometry(LANE_HALF_WIDTH * 2, 0.03),
  new THREE.MeshBasicMaterial({ color: 0xff5050 }),
);
foulLine.rotation.x = -Math.PI / 2;
foulLine.position.set(0, 0.001, FOUL_LINE_Z);
laneGroup.add(foulLine);

const pinDeckMat = new THREE.MeshPhysicalMaterial({ color: 0x2b2f42, roughness: 0.35, metalness: 0.2, clearcoat: 0.6 });
const pinDeck = new THREE.Mesh(new THREE.CircleGeometry(1.0, 32), pinDeckMat);
pinDeck.rotation.x = -Math.PI / 2;
pinDeck.position.set(0, 0.002, HEADPIN_Z - PIN_DZ * 1.4);
pinDeck.receiveShadow = true;
laneGroup.add(pinDeck);

/* ---------------------------------------------------------------------- */
/* Physics world                                                          */
/* ---------------------------------------------------------------------- */

const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
world.broadphase = new CANNON.SAPBroadphase(world);
world.allowSleep = true;

const physLane = new CANNON.Material('lane');
const physGutter = new CANNON.Material('gutter');
const physBall = new CANNON.Material('ball');
const physPin = new CANNON.Material('pin');
const physWall = new CANNON.Material('wall');

world.addContactMaterial(new CANNON.ContactMaterial(physLane, physBall, { friction: 0.05, restitution: 0.02 }));
world.addContactMaterial(new CANNON.ContactMaterial(physLane, physPin, { friction: 0.35, restitution: 0.1 }));
world.addContactMaterial(new CANNON.ContactMaterial(physGutter, physBall, { friction: 0.01, restitution: 0.05 }));
world.addContactMaterial(new CANNON.ContactMaterial(physBall, physPin, { friction: 0.25, restitution: 0.35 }));
world.addContactMaterial(new CANNON.ContactMaterial(physPin, physPin, { friction: 0.2, restitution: 0.25 }));
world.addContactMaterial(new CANNON.ContactMaterial(physWall, physBall, { friction: 0.1, restitution: 0.3 }));
world.addContactMaterial(new CANNON.ContactMaterial(physWall, physPin, { friction: 0.1, restitution: 0.2 }));

function addStaticBox(halfExtents, position, material) {
  const body = new CANNON.Body({ mass: 0, material });
  body.addShape(new CANNON.Box(new CANNON.Vec3(...halfExtents)));
  body.position.set(...position);
  world.addBody(body);
  return body;
}

addStaticBox([LANE_HALF_WIDTH, 0.05, laneLen / 2], [0, -0.05, laneCenterZ], physLane);
for (const side of [-1, 1]) {
  addStaticBox(
    [GUTTER_WIDTH / 2, 0.05, laneLen / 2],
    [side * (LANE_HALF_WIDTH + GUTTER_WIDTH / 2), -GUTTER_DEPTH - 0.05, laneCenterZ],
    physGutter,
  );
  addStaticBox([0.05, 0.4, laneLen / 2], [side * (LANE_HALF_WIDTH + GUTTER_WIDTH + 0.06), 0.3, laneCenterZ], physWall);
}
addStaticBox([2.5, 1, 0.2], [0, 1, BACK_WALL_Z], physWall);

/* ---------------------------------------------------------------------- */
/* Ball                                                                    */
/* ---------------------------------------------------------------------- */

const ballTex = makeBallTexture('#5b1fb3', '#9d5bff');
const ballMat = new THREE.MeshPhysicalMaterial({
  map: ballTex, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06,
});
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 48, 48), ballMat);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

const ballStartZ = APPROACH_LENGTH * 0.55;
const ballBody = new CANNON.Body({
  mass: 7,
  shape: new CANNON.Sphere(BALL_RADIUS),
  material: physBall,
  linearDamping: 0.03,
  angularDamping: 0.15,
});
world.addBody(ballBody);

let ballMoving = false;

function placeBallAtStart(standX) {
  ballBody.position.set(standX, BALL_RADIUS + 0.01, ballStartZ);
  ballBody.velocity.set(0, 0, 0);
  ballBody.angularVelocity.set(0, 0, 0);
  ballBody.quaternion.set(0, 0, 0, 1);
  ballBody.sleep();
  ballMoving = false;
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);
}

/* ---------------------------------------------------------------------- */
/* Pins                                                                    */
/* ---------------------------------------------------------------------- */

function buildPinGeometry() {
  const half = PIN_HEIGHT / 2;
  const pts = [
    [0.0, 0.0], [0.062, 0.0], [0.068, 0.02], [0.058, 0.07], [0.05, 0.11],
    [0.052, 0.16], [0.062, 0.20], [0.05, 0.235], [0.034, 0.255], [0.03, 0.28],
    [0.05, 0.32], [0.045, 0.355], [0.024, PIN_HEIGHT], [0.0, PIN_HEIGHT],
  ].map(([x, y]) => new THREE.Vector2(x, y - half));
  return new THREE.LatheGeometry(pts, 48);
}
const pinGeo = buildPinGeometry();
const pinBodyMat = new THREE.MeshPhysicalMaterial({ color: 0xf5f2ea, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
const pinBandMat = new THREE.MeshPhysicalMaterial({ color: 0xd8282f, roughness: 0.3, clearcoat: 1 });

const pinShape = new CANNON.Cylinder(PIN_TOP_RADIUS, PIN_BASE_RADIUS, PIN_HEIGHT, 16);

const pins = [];
const pinsGroup = new THREE.Group();
scene.add(pinsGroup);

for (let i = 0; i < 10; i++) {
  const [lx, lz] = PIN_LOCAL_POSITIONS[i];
  const mesh = new THREE.Mesh(pinGeo, pinBodyMat);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.058, 0.05, 24), pinBandMat);
  band.position.y = 0.245 - PIN_HEIGHT / 2;
  mesh.add(band);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  pinsGroup.add(mesh);

  const basePos = new CANNON.Vec3(lx, PIN_HEIGHT / 2, HEADPIN_Z + lz);
  const body = new CANNON.Body({
    mass: 0.65,
    shape: pinShape,
    material: physPin,
    linearDamping: 0.4,
    angularDamping: 0.5,
  });
  body.position.copy(basePos);
  world.addBody(body);

  pins.push({ mesh, body, basePos });
}

function isPinStanding(pin) {
  const up = new CANNON.Vec3(0, 1, 0);
  const worldUp = pin.body.quaternion.vmult(up);
  return worldUp.y > TILT_KNOCKED_DOT && pin.body.position.y > PIN_HEIGHT * 0.35;
}

function standingCount() {
  return pins.reduce((n, p) => n + (isPinStanding(p) ? 1 : 0), 0);
}

function resetRack() {
  for (const p of pins) {
    p.body.position.copy(p.basePos);
    p.body.quaternion.set(0, 0, 0, 1);
    p.body.velocity.set(0, 0, 0);
    p.body.angularVelocity.set(0, 0, 0);
    p.body.wakeUp();
  }
}
resetRack();

/* ---------------------------------------------------------------------- */
/* Scoring                                                                 */
/* ---------------------------------------------------------------------- */

const frames = Array.from({ length: 10 }, () => ({ rolls: [], standingBefore: [] }));
let frameIndex = 0;
let gameOver = false;

function afterRoll(fIndex, frame) {
  const rolls = frame.rolls;
  const isTenth = fIndex === 9;
  if (!isTenth) {
    if (rolls.length === 1) {
      if (rolls[0] === 10) return { resetRack: true, frameComplete: true };
      return { resetRack: false, frameComplete: false };
    }
    return { resetRack: true, frameComplete: true };
  }
  if (rolls.length === 1) {
    if (rolls[0] === 10) return { resetRack: true, frameComplete: false };
    return { resetRack: false, frameComplete: false };
  }
  if (rolls.length === 2) {
    if (rolls[0] === 10) {
      if (rolls[1] === 10) return { resetRack: true, frameComplete: false };
      return { resetRack: false, frameComplete: false };
    }
    if (rolls[0] + rolls[1] === 10) return { resetRack: true, frameComplete: false };
    return { resetRack: false, frameComplete: true, gameOver: true };
  }
  return { resetRack: true, frameComplete: true, gameOver: true };
}

function computeScores() {
  const flat = [];
  frames.forEach((f) => f.rolls.forEach((r) => flat.push(r)));
  const perFrame = [];
  let ptr = 0;
  let total = 0;
  let broke = false;
  for (let f = 0; f < 10; f++) {
    if (f < 9) {
      if (frames[f].rolls.length === 0) broke = true;
      if (!broke) {
        if (flat[ptr] === 10) {
          if (flat[ptr + 1] === undefined || flat[ptr + 2] === undefined) broke = true;
          else { total += 10 + flat[ptr + 1] + flat[ptr + 2]; ptr += 1; }
        } else if (flat[ptr + 1] !== undefined) {
          const sum = flat[ptr] + flat[ptr + 1];
          if (sum === 10) {
            if (flat[ptr + 2] === undefined) broke = true;
            else { total += 10 + flat[ptr + 2]; ptr += 2; }
          } else { total += sum; ptr += 2; }
        } else broke = true;
      }
    } else {
      const r = frames[9].rolls;
      if (r.length === 0) broke = true;
      else if (!broke) { total += r.reduce((a, b) => a + b, 0); ptr += r.length; }
    }
    perFrame.push(broke ? null : total);
  }
  return perFrame;
}

/* ---------------------------------------------------------------------- */
/* UI wiring                                                               */
/* ---------------------------------------------------------------------- */

const scoreboardEl = document.getElementById('scoreboard');
const scoreTotalEl = document.getElementById('scoreTotal');
const frameNumEl = document.getElementById('frameNum');
const pinsLeftEl = document.getElementById('pinsLeft');
const messageEl = document.getElementById('message');
const aimMarkerEl = document.getElementById('aimMarker');
const powerWrapEl = document.getElementById('powerWrap');
const powerFillEl = document.getElementById('powerFill');
const powerMarkerEl = document.getElementById('powerMarker');

function buildScoreboardCells() {
  scoreboardEl.innerHTML = '';
  for (let i = 0; i < 10; i++) {
    const cell = document.createElement('div');
    cell.className = 'frame-cell';
    cell.innerHTML = `<div class="fnum">${i + 1}</div><div class="rolls" id="rolls-${i}"></div><span class="total" id="total-${i}">&nbsp;</span>`;
    scoreboardEl.appendChild(cell);
  }
}
buildScoreboardCells();

function rollSymbol(pinsCount, before) {
  if (pinsCount === 10 && before === 10) return 'X';
  if (pinsCount === before && before < 10) return '/';
  if (pinsCount === 0) return '-';
  return String(pinsCount);
}

function refreshScoreboard() {
  const totals = computeScores();
  for (let i = 0; i < 10; i++) {
    const f = frames[i];
    const rollsEl = document.getElementById(`rolls-${i}`);
    const totalEl = document.getElementById(`total-${i}`);
    rollsEl.innerHTML = f.rolls.map((r, idx) => `<span>${rollSymbol(r, f.standingBefore[idx])}</span>`).join('');
    totalEl.textContent = totals[i] === null ? '' : totals[i];
    scoreboardEl.children[i].classList.toggle('active', i === frameIndex && !gameOver);
  }
  const lastResolved = [...totals].reverse().find((t) => t !== null);
  scoreTotalEl.textContent = lastResolved ?? 0;
  frameNumEl.textContent = gameOver ? 10 : frameIndex + 1;
}
refreshScoreboard();

function showMessage(text, ms = 1400) {
  messageEl.textContent = text;
  messageEl.classList.add('show');
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => messageEl.classList.remove('show'), ms);
}

/* ---------------------------------------------------------------------- */
/* Input: aim / stand position / power                                    */
/* ---------------------------------------------------------------------- */

let aimAngle = 0;
let standX = 0;
let dragging = false;
let dragStartX = 0;
let dragStartAim = 0;

const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  if (e.code === 'Space') { e.preventDefault(); onPowerDown(); }
  if (e.code === 'KeyR') resetGame();
});
window.addEventListener('keyup', (e) => {
  keys.delete(e.code);
  if (e.code === 'Space') onPowerUp();
});

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (state !== 'aim') return;
  dragging = true;
  dragStartX = e.clientX;
  dragStartAim = aimAngle;
});
window.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - dragStartX;
  aimAngle = THREE.MathUtils.clamp(dragStartAim + dx * 0.0026, -AIM_ANGLE_LIMIT, AIM_ANGLE_LIMIT);
});
window.addEventListener('pointerup', () => { dragging = false; });

let charging = false;
let chargeStart = 0;
let lockedPower = 0;

function onPowerDown() {
  if (state !== 'aim' || charging) return;
  charging = true;
  chargeStart = performance.now();
  powerWrapEl.classList.add('show');
}
function onPowerUp() {
  if (!charging) return;
  charging = false;
  powerWrapEl.classList.remove('show');
  throwBall(lockedPower);
}

document.getElementById('playBtn').addEventListener('click', () => {
  document.getElementById('startScreen').classList.add('hidden');
});
document.getElementById('newGameBtn').addEventListener('click', resetGame);

function resetGame() {
  for (let i = 0; i < 10; i++) { frames[i].rolls = []; frames[i].standingBefore = []; }
  frameIndex = 0; gameOver = false;
  resetRack();
  standX = 0; aimAngle = 0;
  placeBallAtStart(standX);
  state = 'aim';
  refreshScoreboard();
  showMessage('NEW GAME', 1200);
}

/* ---------------------------------------------------------------------- */
/* Game state machine                                                      */
/* ---------------------------------------------------------------------- */

let state = 'intro'; // intro -> aim -> rolling -> settle -> aim ...
let rollTimer = 0;
let settleTimer = 0;

function throwBall(power) {
  const speed = MIN_BALL_SPEED + (MAX_BALL_SPEED - MIN_BALL_SPEED) * power;
  const dir = new THREE.Vector3(Math.sin(aimAngle), 0, -Math.cos(aimAngle));
  ballBody.position.set(standX, BALL_RADIUS + 0.01, ballStartZ);
  ballBody.velocity.set(dir.x * speed, 0, dir.z * speed);
  ballBody.angularVelocity.set(dir.z * speed / BALL_RADIUS, 0, -dir.x * speed / BALL_RADIUS);
  ballBody.wakeUp();
  ballMoving = true;
  state = 'rolling';
  rollTimer = 0;
  resolvingRoll = false;
}

function endOfRoll() {
  state = 'settle';
  settleTimer = 0;
}
let resolvingRoll = false;

function finalizeRoll() {
  const before = frames[frameIndex]._before ?? 10;
  const remaining = standingCount();
  const knocked = Math.max(0, before - remaining);
  const frame = frames[frameIndex];
  frame.rolls.push(knocked);
  frame.standingBefore.push(before);
  const decision = afterRoll(frameIndex, frame);
  refreshScoreboard();

  if (knocked === before && before === 10) showMessage('STRIKE!');
  else if (knocked === before && before > 0) showMessage('SPARE!');
  else if (knocked === 0) showMessage('MISS');

  setTimeout(() => {
    if (decision.gameOver) {
      gameOver = true;
      const totals = computeScores();
      showMessage(`GAME OVER\nFinal Score: ${totals[9]}`, 4000);
      state = 'gameover';
      refreshScoreboard();
      return;
    }
    if (decision.resetRack) resetRack();
    if (decision.frameComplete) frameIndex++;
    frames[frameIndex]._before = standingCount();
    standX = 0;
    placeBallAtStart(standX);
    state = 'aim';
    refreshScoreboard();
  }, 1200);
}
frames[0]._before = 10;

/* ---------------------------------------------------------------------- */
/* Camera rig                                                              */
/* ---------------------------------------------------------------------- */

const camPos = new THREE.Vector3(0, 0.62, ballStartZ + 0.6);
const camTarget = new THREE.Vector3(0, 0.4, ballStartZ - 6);
camera.position.copy(camPos);

function updateCamera(dt) {
  let desiredPos, desiredLook;
  if (state === 'aim' || state === 'intro') {
    const dir = new THREE.Vector3(Math.sin(aimAngle), 0, -Math.cos(aimAngle));
    desiredPos = new THREE.Vector3(standX - dir.x * 0.85, 0.62, ballStartZ + 0.85);
    desiredLook = new THREE.Vector3(standX, BALL_RADIUS + 0.02, ballStartZ).addScaledVector(dir, 2.3);
  } else if (state === 'rolling') {
    const v = ballBody.velocity;
    const dir = new THREE.Vector3(v.x, 0, v.z);
    if (dir.lengthSq() < 1e-4) dir.set(0, 0, -1); else dir.normalize();
    const bp = ballMesh.position;
    desiredPos = new THREE.Vector3(bp.x, bp.y, bp.z).addScaledVector(dir, -1.0).add(new THREE.Vector3(0, 0.5, 0));
    desiredLook = new THREE.Vector3(bp.x, bp.y, bp.z).addScaledVector(dir, 2.0);
  } else {
    desiredPos = new THREE.Vector3(1.3, 1.5, HEADPIN_Z + 2.6);
    desiredLook = new THREE.Vector3(0, 0.3, HEADPIN_Z - 0.4);
  }
  const t = 1 - Math.pow(0.0025, dt);
  camPos.lerp(desiredPos, t);
  camTarget.lerp(desiredLook, t);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

/* ---------------------------------------------------------------------- */
/* Aim / power UI update                                                   */
/* ---------------------------------------------------------------------- */

function updateAimInput(dt) {
  if (state !== 'aim') return;
  if (!dragging) {
    if (keys.has('KeyA')) aimAngle -= 0.9 * dt;
    if (keys.has('KeyD')) aimAngle += 0.9 * dt;
    aimAngle = THREE.MathUtils.clamp(aimAngle, -AIM_ANGLE_LIMIT, AIM_ANGLE_LIMIT);
  }
  if (keys.has('ArrowLeft')) standX -= 0.6 * dt;
  if (keys.has('ArrowRight')) standX += 0.6 * dt;
  standX = THREE.MathUtils.clamp(standX, -STAND_X_LIMIT, STAND_X_LIMIT);
  ballBody.position.x = standX;
  ballMesh.position.x = standX;

  const pct = 50 + (aimAngle / AIM_ANGLE_LIMIT) * 50;
  aimMarkerEl.style.left = `${pct}%`;

  if (charging) {
    const t = (performance.now() - chargeStart) / 900;
    const wave = (Math.sin(t * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    lockedPower = wave;
    powerFillEl.style.width = `${wave * 100}%`;
    powerMarkerEl.style.left = `${wave * 100}%`;
  }
}

/* ---------------------------------------------------------------------- */
/* Physics step + roll-end detection                                       */
/* ---------------------------------------------------------------------- */

function updateBallControl(dt) {
  if (state !== 'rolling' || !ballMoving) return;
  const lateral = 2.2 * dt;
  if (keys.has('ArrowLeft') || keys.has('KeyA')) ballBody.velocity.x -= lateral;
  if (keys.has('ArrowRight') || keys.has('KeyD')) ballBody.velocity.x += lateral;

  rollTimer += dt;
  const speed = Math.hypot(ballBody.velocity.x, ballBody.velocity.z);
  const passedPins = ballBody.position.z < HEADPIN_Z - 3 * PIN_DZ - 0.7;
  const stopped = speed < 0.12 && rollTimer > 0.5;
  const inGutterAndSlow = ballBody.position.y < -0.02 && speed < 0.3 && rollTimer > 0.5;
  if (passedPins || stopped || inGutterAndSlow || rollTimer > 6) {
    ballMoving = false;
    endOfRoll();
  }
}

function updateSettle(dt) {
  if (state !== 'settle' || resolvingRoll) return;
  settleTimer += dt;
  let maxSpeed = 0;
  for (const p of pins) {
    maxSpeed = Math.max(maxSpeed, p.body.velocity.length(), p.body.angularVelocity.length());
  }
  if (settleTimer > 1.6 || (settleTimer > 0.5 && maxSpeed < 0.12)) {
    resolvingRoll = true;
    finalizeRoll();
  }
}

/* ---------------------------------------------------------------------- */
/* Main loop                                                               */
/* ---------------------------------------------------------------------- */

function syncMeshes() {
  ballMesh.position.copy(ballBody.position);
  ballMesh.quaternion.copy(ballBody.quaternion);
  for (const p of pins) {
    p.mesh.position.copy(p.body.position);
    p.mesh.quaternion.copy(p.body.quaternion);
  }
}

function updatePinsLeftUI() {
  pinsLeftEl.textContent = standingCount();
}

const clock = new THREE.Clock();
const FIXED_STEP = 1 / 120;
function tick() {
  const dt = Math.min(clock.getDelta(), 0.05);
  updateAimInput(dt);
  updateBallControl(dt);
  world.step(FIXED_STEP, dt, 6);
  syncMeshes();
  updateSettle(dt);
  updateCamera(dt);
  updatePinsLeftUI();
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

/* ---------------------------------------------------------------------- */
/* Boot                                                                    */
/* ---------------------------------------------------------------------- */

const loadBar = document.getElementById('loadBar');
let p = 0;
const loadTimer = setInterval(() => {
  p += 10 + Math.random() * 20;
  loadBar.style.width = `${Math.min(p, 100)}%`;
  if (p >= 100) {
    clearInterval(loadTimer);
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('startScreen').classList.remove('hidden');
    state = 'aim';
    placeBallAtStart(0);
  }
}, 90);

tick();
