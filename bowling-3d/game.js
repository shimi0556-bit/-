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
const GUTTER_WIDTH = 0.23;
const APPROACH_LENGTH = 3.5;
const FOUL_LINE_Z = 0;
const HEADPIN_Z = -16.8;
const BACK_WALL_Z = HEADPIN_Z - 3 * 0.2639 - 1.4;
const BALL_RADIUS = 0.109;
const PIN_BASE_RADIUS = 0.075;
const PIN_HEIGHT = 0.38;
const PIN_DX = 0.3048;
const PIN_DZ = 0.2639;
const MAX_BALL_SPEED = 9.4;
const MIN_BALL_SPEED = 4.2;
const FRICTION = 0.55;
const GRAVITY_TORQUE = 16;
const STAND_X_LIMIT = LANE_HALF_WIDTH - BALL_RADIUS - 0.02;
const AIM_ANGLE_LIMIT = 0.34;

const PIN_LOCAL_POSITIONS = [
  [0, 0],
  [-PIN_DX / 2, -PIN_DZ], [PIN_DX / 2, -PIN_DZ],
  [-PIN_DX, -2 * PIN_DZ], [0, -2 * PIN_DZ], [PIN_DX, -2 * PIN_DZ],
  [-1.5 * PIN_DX, -3 * PIN_DZ], [-0.5 * PIN_DX, -3 * PIN_DZ], [0.5 * PIN_DX, -3 * PIN_DZ], [1.5 * PIN_DX, -3 * PIN_DZ],
];

/* ---------------------------------------------------------------------- */
/* Renderer / scene / camera                                              */
/* ---------------------------------------------------------------------- */

const canvasHost = document.body;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060c);
scene.fog = new THREE.Fog(0x05060c, 14, 34);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.05, 100);

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
keyLight.position.set(3, 8, 4);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -6;
keyLight.shadow.camera.right = 6;
keyLight.shadow.camera.top = 10;
keyLight.shadow.camera.bottom = -22;
keyLight.shadow.camera.near = 1;
keyLight.shadow.camera.far = 25;
keyLight.shadow.bias = -0.0015;
scene.add(keyLight);

function laneSpot(z, color = 0xbcd4ff, intensity = 9) {
  const spot = new THREE.SpotLight(color, intensity, 9, Math.PI / 5, 0.6, 1.4);
  spot.position.set(0, 3.2, z);
  spot.target.position.set(0, 0, z - 1.5);
  scene.add(spot, spot.target);
  return spot;
}
laneSpot(-2);
laneSpot(-8);
laneSpot(-14.5, 0xffe3bf, 11);

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
/* Lane geometry                                                           */
/* ---------------------------------------------------------------------- */

const laneGroup = new THREE.Group();
scene.add(laneGroup);

const woodTex = makeWoodTexture();
woodTex.repeat.set(1, 8);
const laneMat = new THREE.MeshPhysicalMaterial({
  map: woodTex, roughness: 0.28, metalness: 0.05, clearcoat: 0.9, clearcoatRoughness: 0.18,
});

const laneLen = APPROACH_LENGTH + Math.abs(BACK_WALL_Z);
const laneGeo = new THREE.PlaneGeometry(LANE_HALF_WIDTH * 2, laneLen, 1, 40);
const lane = new THREE.Mesh(laneGeo, laneMat);
lane.rotation.x = -Math.PI / 2;
lane.position.set(0, 0, (APPROACH_LENGTH + BACK_WALL_Z) / 2);
lane.receiveShadow = true;
laneGroup.add(lane);

const gutterMat = new THREE.MeshStandardMaterial({ color: 0x1a1d28, roughness: 0.5, metalness: 0.6 });
for (const side of [-1, 1]) {
  const gutter = new THREE.Mesh(
    new THREE.BoxGeometry(GUTTER_WIDTH, 0.09, laneLen),
    gutterMat,
  );
  gutter.position.set(side * (LANE_HALF_WIDTH + GUTTER_WIDTH / 2), -0.05, (APPROACH_LENGTH + BACK_WALL_Z) / 2);
  gutter.receiveShadow = true;
  laneGroup.add(gutter);
}

const railMat = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.6 });
for (const side of [-1, 1]) {
  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.14, laneLen), railMat);
  rail.position.set(side * (LANE_HALF_WIDTH + GUTTER_WIDTH + 0.03), 0.0, (APPROACH_LENGTH + BACK_WALL_Z) / 2);
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

const backWall = new THREE.Mesh(
  new THREE.PlaneGeometry(6, 4),
  new THREE.MeshStandardMaterial({ color: 0x0b0d16, roughness: 0.9 }),
);
backWall.position.set(0, 1.8, BACK_WALL_Z - 0.05);
scene.add(backWall);

const pinDeckMat = new THREE.MeshPhysicalMaterial({ color: 0x2b2f42, roughness: 0.35, metalness: 0.2, clearcoat: 0.6 });
const pinDeck = new THREE.Mesh(new THREE.CircleGeometry(1.05, 24), pinDeckMat);
pinDeck.rotation.x = -Math.PI / 2;
pinDeck.position.set(0, 0.002, HEADPIN_Z - PIN_DZ * 1.4);
pinDeck.receiveShadow = true;
laneGroup.add(pinDeck);

/* ---------------------------------------------------------------------- */
/* Ball                                                                    */
/* ---------------------------------------------------------------------- */

const ballTex = makeBallTexture('#5b1fb3', '#9d5bff');
const ballMat = new THREE.MeshPhysicalMaterial({
  map: ballTex, roughness: 0.18, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06,
});
const ballMesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_RADIUS, 40, 40), ballMat);
ballMesh.castShadow = true;
ballMesh.receiveShadow = true;
scene.add(ballMesh);

const ball = {
  position: new THREE.Vector3(0, BALL_RADIUS, APPROACH_LENGTH * 0.55),
  velocity: new THREE.Vector3(0, 0, 0),
  inGutter: false,
  moving: false,
};

function placeBallAtStart(standX) {
  ball.position.set(standX, BALL_RADIUS, APPROACH_LENGTH * 0.55);
  ball.velocity.set(0, 0, 0);
  ball.inGutter = false;
  ball.moving = false;
  ballMesh.position.copy(ball.position);
  ballMesh.quaternion.identity();
}

/* ---------------------------------------------------------------------- */
/* Pins                                                                    */
/* ---------------------------------------------------------------------- */

function buildPinGeometry() {
  const pts = [
    new THREE.Vector2(0.0, 0.0),
    new THREE.Vector2(0.062, 0.0),
    new THREE.Vector2(0.068, 0.02),
    new THREE.Vector2(0.058, 0.07),
    new THREE.Vector2(0.05, 0.11),
    new THREE.Vector2(0.052, 0.16),
    new THREE.Vector2(0.062, 0.20),
    new THREE.Vector2(0.05, 0.235),
    new THREE.Vector2(0.034, 0.255),
    new THREE.Vector2(0.03, 0.28),
    new THREE.Vector2(0.05, 0.32),
    new THREE.Vector2(0.045, 0.355),
    new THREE.Vector2(0.024, PIN_HEIGHT),
    new THREE.Vector2(0.0, PIN_HEIGHT),
  ];
  return new THREE.LatheGeometry(pts, 28);
}
const pinGeo = buildPinGeometry();
const pinBodyMat = new THREE.MeshPhysicalMaterial({ color: 0xf5f2ea, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.1 });

const pins = [];
const pinsGroup = new THREE.Group();
scene.add(pinsGroup);

for (let i = 0; i < 10; i++) {
  const [lx, lz] = PIN_LOCAL_POSITIONS[i];
  const root = new THREE.Group();
  const mesh = new THREE.Mesh(pinGeo, pinBodyMat);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.056, 0.05, 20), new THREE.MeshPhysicalMaterial({ color: 0xd8282f, roughness: 0.35, clearcoat: 1 }));
  band.position.y = 0.245;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  root.add(mesh, band);
  const basePos = new THREE.Vector3(lx, 0, HEADPIN_Z + lz);
  root.position.copy(basePos);
  pinsGroup.add(root);
  pins.push({
    root, basePos: basePos.clone(),
    standing: true, falling: false,
    tiltAngle: 0, angularVel: 0,
    fallAxis: new THREE.Vector3(1, 0, 0),
    fallDir: new THREE.Vector3(0, 0, -1),
    settleTimer: 0,
    visible: true,
  });
}

function resetRack() {
  for (const p of pins) {
    p.standing = true;
    p.falling = false;
    p.tiltAngle = 0;
    p.angularVel = 0;
    p.settleTimer = 0;
    p.visible = true;
    p.root.visible = true;
    p.root.position.copy(p.basePos);
    p.root.quaternion.identity();
  }
}
resetRack();

function knockPin(pin, fallDirHint, strength) {
  if (pin.falling || !pin.standing) return;
  pin.falling = true;
  pin.standing = false;
  const dir = fallDirHint.clone();
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
  dir.normalize();
  pin.fallDir.copy(dir);
  pin.fallAxis.set(-dir.z, 0, dir.x).normalize();
  pin.angularVel = THREE.MathUtils.clamp(strength, 2.0, 11);
}

/* ---------------------------------------------------------------------- */
/* Scoring                                                                 */
/* ---------------------------------------------------------------------- */

const frames = Array.from({ length: 10 }, () => ({ rolls: [], standingBefore: [] }));
let frameIndex = 0;
let rollInFrame = 0;
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
      if (frames[f].rolls.length === 0) { broke = true; }
      if (!broke) {
        if (flat[ptr] === 10) {
          if (flat[ptr + 1] === undefined || flat[ptr + 2] === undefined) { broke = true; }
          else { total += 10 + flat[ptr + 1] + flat[ptr + 2]; ptr += 1; }
        } else if (flat[ptr + 1] !== undefined) {
          const sum = flat[ptr] + flat[ptr + 1];
          if (sum === 10) {
            if (flat[ptr + 2] === undefined) { broke = true; }
            else { total += 10 + flat[ptr + 2]; ptr += 2; }
          } else { total += sum; ptr += 2; }
        } else { broke = true; }
      }
    } else {
      const r = frames[9].rolls;
      if (r.length === 0) { broke = true; } else if (!broke) { total += r.reduce((a, b) => a + b, 0); ptr += r.length; }
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

function rollSymbol(pins_, before) {
  if (pins_ === 10 && before === 10) return 'X';
  if (pins_ === before && before < 10) return '/';
  if (pins_ === 0) return '-';
  return String(pins_);
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
  frameIndex = 0; rollInFrame = 0; gameOver = false;
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

function throwBall(power) {
  const speed = MIN_BALL_SPEED + (MAX_BALL_SPEED - MIN_BALL_SPEED) * power;
  const dir = new THREE.Vector3(Math.sin(aimAngle), 0, -Math.cos(aimAngle));
  ball.position.set(standX, BALL_RADIUS, APPROACH_LENGTH * 0.55);
  ball.velocity.copy(dir).multiplyScalar(speed);
  ball.moving = true;
  ball.inGutter = false;
  ballMesh.position.copy(ball.position);
  state = 'rolling';
  rollTimer = 0;
}

function standingCount() {
  return pins.reduce((n, p) => n + (p.standing ? 1 : 0), 0);
}

function endOfRoll() {
  state = 'settle';
  const before = frames[frameIndex]._before ?? 10;
  const remaining = standingCount();
  const knocked = before - remaining;
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
    if (decision.frameComplete) { frameIndex++; rollInFrame = 0; }
    else rollInFrame++;
    frames[frameIndex]._before = standingCount();
    standX = 0;
    placeBallAtStart(standX);
    state = 'aim';
    refreshScoreboard();
  }, 1500);
}
frames[0]._before = 10;

/* ---------------------------------------------------------------------- */
/* Camera rig                                                              */
/* ---------------------------------------------------------------------- */

const camTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(0, 1.15, ball.position.z + 1.1);
camera.position.copy(camPos);

function updateCamera(dt) {
  let desiredPos, desiredLook;
  if (state === 'aim' || state === 'intro') {
    const dir = new THREE.Vector3(Math.sin(aimAngle), 0, -Math.cos(aimAngle));
    desiredPos = new THREE.Vector3(standX - dir.x * 0.9, 1.05, ball.position.z + 0.9);
    desiredLook = new THREE.Vector3(standX, 0.7, ball.position.z).addScaledVector(dir, 12);
  } else if (state === 'rolling') {
    const dir = ball.velocity.clone().normalize();
    desiredPos = ball.position.clone().addScaledVector(dir, -1.4).add(new THREE.Vector3(0, 0.75, 0));
    desiredLook = ball.position.clone().addScaledVector(dir, 6).add(new THREE.Vector3(0, 0.2, 0));
  } else {
    desiredPos = new THREE.Vector3(1.1, 1.3, HEADPIN_Z + 1.6);
    desiredLook = new THREE.Vector3(0, 0.3, HEADPIN_Z - 0.6);
  }
  const t = 1 - Math.pow(0.0025, dt);
  camPos.lerp(desiredPos, t);
  camTarget.lerp(desiredLook, t);
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
}

/* ---------------------------------------------------------------------- */
/* Physics update                                                          */
/* ---------------------------------------------------------------------- */

function updateBall(dt) {
  if (!ball.moving) return;

  if (!ball.inGutter && state === 'rolling') {
    if (keys.has('ArrowLeft') || keys.has('KeyA')) ball.velocity.x -= 1.1 * dt;
    if (keys.has('ArrowRight') || keys.has('KeyD')) ball.velocity.x += 1.1 * dt;
  }

  const speed = ball.velocity.length();
  if (speed > 0.01) {
    const decel = Math.min(FRICTION * dt, speed);
    ball.velocity.multiplyScalar((speed - decel) / speed);
  }

  ball.position.addScaledVector(ball.velocity, dt);

  const gutterLimit = LANE_HALF_WIDTH - BALL_RADIUS * 0.4;
  const overLimit = Math.abs(ball.position.x) > gutterLimit;
  if (overLimit && !ball.inGutter) {
    ball.velocity.x = 0;
  }
  ball.inGutter = overLimit;
  if (overLimit) {
    const side = Math.sign(ball.position.x);
    ball.position.x = side * (LANE_HALF_WIDTH + GUTTER_WIDTH / 2);
  }
  ball.position.y = overLimit ? -0.05 : BALL_RADIUS;

  ballMesh.position.copy(ball.position);
  const dist = ball.velocity.length() * dt;
  if (dist > 0.0001) {
    const axis = new THREE.Vector3(-ball.velocity.z, 0, ball.velocity.x).normalize();
    const angle = dist / BALL_RADIUS;
    ballMesh.rotateOnWorldAxis(axis, angle);
  }

  if (!ball.inGutter) {
    for (const pin of pins) {
      if (!pin.standing || pin.falling) continue;
      const dx = ball.position.x - pin.basePos.x;
      const dz = ball.position.z - pin.basePos.z;
      const d = Math.hypot(dx, dz);
      if (d < BALL_RADIUS + PIN_BASE_RADIUS) {
        const dir = new THREE.Vector3(-dx, 0, -dz);
        knockPin(pin, dir, ball.velocity.length() * 1.15);
        ball.velocity.x += -dx * 0.6;
        ball.velocity.multiplyScalar(0.9);
      }
    }
  }

  rollTimer += dt;
  const passedPins = ball.position.z < HEADPIN_Z - 3 * PIN_DZ - 0.9;
  const stopped = ball.velocity.length() < 0.05 && rollTimer > 0.4;
  if (passedPins || stopped || rollTimer > 7) {
    ball.moving = false;
    endOfRoll();
  }
}

function updatePins(dt) {
  const HALF_PI = Math.PI / 2;
  for (const pin of pins) {
    if (!pin.falling) continue;
    if (pin.tiltAngle < HALF_PI) {
      const accel = GRAVITY_TORQUE * Math.sin(pin.tiltAngle + 0.18);
      pin.angularVel += accel * dt;
      pin.tiltAngle += pin.angularVel * dt;
      if (pin.tiltAngle >= HALF_PI) pin.tiltAngle = HALF_PI;
      pin.root.quaternion.setFromAxisAngle(pin.fallAxis, pin.tiltAngle);

      if (pin.tiltAngle > 0.35) {
        const top = new THREE.Vector3(0, PIN_HEIGHT, 0).applyQuaternion(pin.root.quaternion).add(pin.root.position);
        for (const other of pins) {
          if (other === pin || !other.standing || other.falling) continue;
          const dx = top.x - other.basePos.x;
          const dz = top.z - other.basePos.z;
          if (Math.hypot(dx, dz) < PIN_BASE_RADIUS + 0.09) {
            knockPin(other, pin.fallDir, pin.angularVel * 0.7 + 2);
          }
        }
      }
    } else {
      pin.settleTimer += dt;
      if (pin.settleTimer < 0.9) {
        pin.root.position.addScaledVector(pin.fallDir, 0.35 * dt);
      } else if (pin.settleTimer < 1.6) {
        pin.root.position.y -= 0.6 * dt;
      } else if (pin.visible) {
        pin.visible = false;
        pin.root.visible = false;
      }
    }
  }
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
  ball.position.x = standX;
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
/* Main loop                                                               */
/* ---------------------------------------------------------------------- */

function updatePinsLeftUI() {
  pinsLeftEl.textContent = standingCount();
}

const clock = new THREE.Clock();
function tick() {
  const dt = Math.min(clock.getDelta(), 0.033);
  updateAimInput(dt);
  updateBall(dt);
  updatePins(dt);
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
