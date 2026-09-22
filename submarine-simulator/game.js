// ============================================================
// ABYSS - Deep Sea Submersible Simulator
// Continental Shelf to the Challenger Deep (Mariana Trench)
// ============================================================

(function() {
'use strict';

// ---- CONSTANTS ----
const DEG = Math.PI / 180;
const MAX_DEPTH = 11200;

// ---- GAME STATE ----
let scene, camera, renderer, clock;
let subGroup, propeller, rudderFin, headlightL, headlightR, subHeadlights = [];
let gameStarted = false;
let gameOver = false;
let cameraMode = 0; // 0=chase, 1=cockpit, 2=cinematic
let minimapVisible = true;
let minimapCanvas, minimapCtx;
let sonarSweep = 0;

let gameMode = 'normal';
const modeSettings = {
    normal:  { maxSpeed: 34, accel: 0.7, safeDepth: 800,  label: 'NORMAL' },
    deep:    { maxSpeed: 55, accel: 0.9, safeDepth: 3200, label: 'DEEP DIVE' },
    extreme: { maxSpeed: 85, accel: 1.3, safeDepth: 11200, label: 'EXTREME' }
};

// Submarine physical state
let sub = {
    pos: new THREE.Vector3(0, -8, 20),
    heading: 0,
    pitch: 0,
    roll: 0,
    speed: 0,
    throttle: 0.35,
    depth: 8,
    hull: 100,
    boost: false
};

// Scoring / stats
let score = 0;
let diveTime = 0;
let distanceTraveled = 0;
let checkpointsHit = 0;
let maxDepthReached = 0;
let scoreMultiplier = 1;
let comboTimer = 0;
let comboCount = 0;

// Controls
let keys = {};
let prevKeys = {};

// Depth/journey profile: [z, depth] keypoints, z decreasing (forward = -Z)
const DEPTH_PROFILE = [
    { z: 30,      depth: 5 },
    { z: -400,    depth: 25 },
    { z: -900,    depth: 45 },
    { z: -1600,   depth: 95 },
    { z: -2600,   depth: 185 },
    { z: -3800,   depth: 270 },
    { z: -5200,   depth: 560 },
    { z: -6800,   depth: 1420 },
    { z: -8600,   depth: 3250 },
    { z: -10400,  depth: 6050 },
    { z: -12200,  depth: 10935 },
    { z: -13600,  depth: 11150 }
];

function floorDepthAtZ(z) {
    for (let i = 0; i < DEPTH_PROFILE.length - 1; i++) {
        const a = DEPTH_PROFILE[i], b = DEPTH_PROFILE[i + 1];
        if (z <= a.z && z >= b.z) {
            const t = (a.z - z) / (a.z - b.z);
            return a.depth + (b.depth - a.depth) * t;
        }
    }
    return z > DEPTH_PROFILE[0].z ? DEPTH_PROFILE[0].depth : DEPTH_PROFILE[DEPTH_PROFILE.length - 1].depth;
}

// Waypoints along the descent
const waypoints = [
    { name: 'KELP FOREST',            pos: new THREE.Vector3(120, -25,   -400),   radius: 160, points: 250,  reached: false, type: 'shallow' },
    { name: 'CORAL REEF ENTRANCE',    pos: new THREE.Vector3(260, -45,   -900),   radius: 180, points: 300,  reached: false, type: 'reef' },
    { name: 'SS MERIDIAN WRECK',      pos: new THREE.Vector3(420, -95,   -1600),  radius: 200, points: 450,  reached: false, type: 'wreck' },
    { name: 'THE BLUE CAVERN',        pos: new THREE.Vector3(540, -185,  -2600),  radius: 220, points: 400,  reached: false, type: 'cavern' },
    { name: 'WHALE MIGRATION PATH',   pos: new THREE.Vector3(620, -270,  -3800),  radius: 260, points: 400,  reached: false, type: 'landmark' },
    { name: 'CONTINENTAL SHELF EDGE', pos: new THREE.Vector3(680, -560,  -5200),  radius: 300, points: 500,  reached: false, type: 'canyon' },
    { name: 'HYDROTHERMAL VENTS',     pos: new THREE.Vector3(560, -1420, -6800),  radius: 340, points: 650,  reached: false, type: 'vents' },
    { name: 'BIOLUMINESCENT TRENCH',  pos: new THREE.Vector3(380, -3250, -8600),  radius: 380, points: 750,  reached: false, type: 'biolum' },
    { name: 'ABYSSAL RESEARCH STN.',  pos: new THREE.Vector3(180, -6050, -10400), radius: 420, points: 900,  reached: false, type: 'station' },
    { name: 'CHALLENGER DEEP',        pos: new THREE.Vector3(0,   -10935,-12200), radius: 500, points: 2500, reached: false, type: 'destination' }
];
let currentWaypointIndex = 0;

// World object arrays
let fishSchools = [];
let jellyfish = [];
let kelpFronds = [];
let checkpointRings = [];
let ventParticles = [];
let biolumParticles = [];
let godRays = [];
let whale = null;
let ventGroups = [];

// Fog depth stops
const FOG_STOPS = [
    { depth: 0,     color: 0x1c8fae, density: 0.0020 },
    { depth: 60,    color: 0x0e6088, density: 0.0032 },
    { depth: 300,   color: 0x07314f, density: 0.0048 },
    { depth: 1000,  color: 0x031a2e, density: 0.0068 },
    { depth: 3500,  color: 0x02090f, density: 0.0090 },
    { depth: 11200, color: 0x000103, density: 0.0110 }
];

// Audio
let audioCtx;
let engineOsc, engineGain;
let audioStarted = false;

// ============================================================
// INITIALIZATION
// ============================================================

function init() {
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x1c8fae, 0.002);

    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.5, 40000);
    camera.position.set(0, -5, 45);

    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    setupLights();
    createSurfaceCeiling();
    createGodRays();
    createSeafloor();
    createKelpForest();
    createCoralReef();
    createShipwreck();
    createCavern();
    createCanyonWalls();
    createHydrothermalVents();
    createBioluminescence();
    createFishSchools();
    createJellyfish();
    createWhale();
    createResearchStation();
    createSubmarine();
    createCheckpointRings();
    setupMinimap();

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', function(e) { keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].indexOf(e.code) !== -1) e.preventDefault(); });
    window.addEventListener('keyup', function(e) { keys[e.code] = false; });

    simulateLoading();
}

function setupLights() {
    const ambient = new THREE.AmbientLight(0x224466, 0.55);
    scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xbfe8ff, 0.7);
    sun.position.set(200, 900, 300);
    scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x3aa9cc, 0x081018, 0.5);
    scene.add(hemi);
}

// ============================================================
// SURFACE / GOD RAYS
// ============================================================

function createSurfaceCeiling() {
    const geo = new THREE.PlaneGeometry(20000, 20000, 60, 60);
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            topColor: { value: new THREE.Color(0xeaffff) },
            baseColor: { value: new THREE.Color(0x1c8fae) }
        },
        vertexShader: [
            'uniform float time;',
            'varying float vElevation;',
            'void main() {',
            '  vec3 pos = position;',
            '  float w = sin(pos.x * 0.01 + time) * 3.0 + sin(pos.y * 0.013 + time * 0.8) * 2.5;',
            '  pos.z = w;',
            '  vElevation = w;',
            '  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform vec3 topColor;',
            'uniform vec3 baseColor;',
            'varying float vElevation;',
            'void main() {',
            '  float shimmer = smoothstep(1.0, 4.0, vElevation);',
            '  vec3 color = mix(baseColor, topColor, 0.5 + shimmer * 0.4);',
            '  gl_FragColor = vec4(color, 0.55);',
            '}'
        ].join('\n'),
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    const ceiling = new THREE.Mesh(geo, mat);
    ceiling.rotation.x = -Math.PI / 2;
    ceiling.position.y = 0;
    ceiling.userData.isSurface = true;
    scene.add(ceiling);
}

function createGodRays() {
    const rayMat = new THREE.MeshBasicMaterial({
        color: 0xdfffff, transparent: true, opacity: 0.06,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false
    });
    for (let i = 0; i < 50; i++) {
        const w = 8 + Math.random() * 20;
        const h = 450 + Math.random() * 300;
        const ray = new THREE.Mesh(new THREE.PlaneGeometry(w, h), rayMat.clone());
        ray.position.set((Math.random() - 0.5) * 1400, -h / 2 + 20, -Math.random() * 2200 + 100);
        ray.rotation.y = Math.random() * Math.PI;
        ray.rotation.z = (Math.random() - 0.5) * 0.3;
        ray.userData.baseOpacity = 0.03 + Math.random() * 0.08;
        scene.add(ray);
        godRays.push(ray);
    }
}

// ============================================================
// SEAFLOOR TERRAIN
// ============================================================

function noise2(x, z) {
    return Math.sin(x * 0.008 + z * 0.011) * 0.5 + Math.sin(x * 0.021 - z * 0.017) * 0.3 + Math.sin(x * 0.05 + z * 0.03) * 0.15;
}

function createSeafloor() {
    const chunkLen = 1700;
    const totalLen = 14200;
    const width = 3600;
    const segX = 36, segZ = 18;

    for (let start = 30; start > -totalLen; start -= chunkLen) {
        const geo = new THREE.PlaneGeometry(width, chunkLen, segX, segZ);
        const colors = [];
        const pos = geo.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const localX = pos.getX(i);
            const localZ = pos.getY(i); // plane built in XY before rotation
            const worldZ = start - chunkLen / 2 + localZ;
            const baseDepth = floorDepthAtZ(worldZ);
            const bumpiness = Math.min(baseDepth * 0.15 + 6, 90);
            const bump = noise2(localX, worldZ) * bumpiness;
            const y = -baseDepth + bump + 25; // floor sits below the path
            pos.setZ(i, y);

            const t = Math.min(baseDepth / 11000, 1);
            const c1 = new THREE.Color(0xc2a878); // sandy shallow
            const c2 = new THREE.Color(0x1c2430); // abyssal dark
            const c = c1.clone().lerp(c2, t);
            const shade = 0.85 + Math.random() * 0.3;
            colors.push(c.r * shade, c.g * shade, c.b * shade);
        }
        geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true, flatShading: true, roughness: 1, metalness: 0
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, 0, start - chunkLen / 2);
        mesh.receiveShadow = true;
        scene.add(mesh);

        scatterRocks(start, chunkLen, width);
    }
}

function scatterRocks(zStart, chunkLen, width) {
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x445059, flatShading: true, roughness: 1 });
    const count = 10;
    for (let i = 0; i < count; i++) {
        const x = (Math.random() - 0.5) * width * 0.85;
        const z = zStart - Math.random() * chunkLen;
        const depth = floorDepthAtZ(z);
        const size = 3 + Math.random() * 10 + depth * 0.01;
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(size, 0), rockMat);
        rock.position.set(x, -depth + size * 0.4, z);
        rock.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
        rock.scale.y = 0.6 + Math.random() * 0.5;
        scene.add(rock);
    }
}

// ============================================================
// KELP FOREST
// ============================================================

function createKelpForest() {
    const center = new THREE.Vector3(120, -25, -400);
    const mat = new THREE.MeshPhongMaterial({ color: 0x2f8a4a, flatShading: true, side: THREE.DoubleSide });
    for (let i = 0; i < 60; i++) {
        const x = center.x + (Math.random() - 0.5) * 500;
        const z = center.z + (Math.random() - 0.5) * 500;
        const depth = floorDepthAtZ(z);
        const baseY = -depth;
        const height = 20 + Math.random() * 30;
        const segs = 6;
        const frond = new THREE.Group();
        for (let s = 0; s < segs; s++) {
            const blade = new THREE.Mesh(new THREE.PlaneGeometry(1.6, height / segs + 0.4), mat);
            blade.position.y = baseY + s * (height / segs) + height / (segs * 2);
            frond.add(blade);
        }
        frond.position.set(x, 0, z);
        frond.userData = { phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 0.4 };
        scene.add(frond);
        kelpFronds.push(frond);
    }
}

// ============================================================
// CORAL REEF
// ============================================================

function createCoralReef() {
    const center = new THREE.Vector3(260, -45, -900);
    const colors = [0xff5577, 0xff9944, 0xffcc33, 0x44ddaa, 0xaa66ff, 0xff6699];
    for (let i = 0; i < 90; i++) {
        const x = center.x + (Math.random() - 0.5) * 480;
        const z = center.z + (Math.random() - 0.5) * 480;
        const depth = floorDepthAtZ(z);
        const color = colors[Math.floor(Math.random() * colors.length)];
        const mat = new THREE.MeshPhongMaterial({ color: color, flatShading: true });
        let mesh;
        const kind = Math.random();
        if (kind < 0.4) {
            mesh = new THREE.Mesh(new THREE.ConeGeometry(1.5 + Math.random() * 2.5, 4 + Math.random() * 8, 6), mat);
        } else if (kind < 0.7) {
            mesh = new THREE.Mesh(new THREE.TorusGeometry(2 + Math.random() * 2, 0.8, 6, 10), mat);
            mesh.rotation.x = Math.PI / 2;
        } else {
            mesh = new THREE.Mesh(new THREE.SphereGeometry(1.5 + Math.random() * 2, 6, 5), mat);
        }
        mesh.position.set(x, -depth + 2, z);
        mesh.rotation.y = Math.random() * Math.PI;
        scene.add(mesh);
    }
}

// ============================================================
// SHIPWRECK
// ============================================================

function createShipwreck() {
    const wreck = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x5a4d3f, flatShading: true, roughness: 0.9 });
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(6, 9, 90, 8, 1, true), hullMat);
    hull.rotation.z = Math.PI / 2;
    hull.rotation.x = 0.15;
    wreck.add(hull);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(88, 2, 10), hullMat);
    deck.position.y = 6;
    wreck.add(deck);

    for (let i = 0; i < 3; i++) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 26 - i * 3, 6), hullMat);
        mast.position.set(-30 + i * 25, 18 - i * 1.5, 0);
        mast.rotation.z = 0.1;
        wreck.add(mast);
    }

    const bridge = new THREE.Mesh(new THREE.BoxGeometry(14, 12, 10), hullMat);
    bridge.position.set(20, 12, 0);
    wreck.add(bridge);

    const depth = floorDepthAtZ(-1600);
    wreck.position.set(420, -depth + 8, -1600);
    wreck.rotation.y = 0.4;
    scene.add(wreck);
}

// ============================================================
// CAVERN
// ============================================================

function createCavern() {
    const depth = floorDepthAtZ(-2600);
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c3038, flatShading: true, roughness: 1, side: THREE.BackSide });
    const arch = new THREE.Mesh(new THREE.SphereGeometry(90, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat);
    arch.position.set(540, -depth + 20, -2600);
    scene.add(arch);

    const glowMat = new THREE.MeshBasicMaterial({ color: 0x33ddff });
    for (let i = 0; i < 8; i++) {
        const crystal = new THREE.Mesh(new THREE.ConeGeometry(1.5, 6, 5), glowMat);
        const ang = (i / 8) * Math.PI * 2;
        crystal.position.set(540 + Math.cos(ang) * 60, -depth + 3, -2600 + Math.sin(ang) * 60);
        crystal.rotation.x = Math.PI;
        scene.add(crystal);
    }
}

// ============================================================
// CANYON WALLS
// ============================================================

function createCanyonWalls() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x353c46, flatShading: true, roughness: 1 });
    const zCenter = -5200;
    const depth = floorDepthAtZ(zCenter);
    for (let side = -1; side <= 1; side += 2) {
        for (let i = 0; i < 14; i++) {
            const z = zCenter - 700 + i * 100;
            const localDepth = floorDepthAtZ(z);
            const h = 120 + Math.random() * 180;
            const spire = new THREE.Mesh(new THREE.ConeGeometry(20 + Math.random() * 15, h, 6), mat);
            spire.position.set(680 + side * (320 + Math.random() * 60), -localDepth + h / 2 - 30, z);
            spire.rotation.y = Math.random() * Math.PI;
            scene.add(spire);
        }
    }
}

// ============================================================
// HYDROTHERMAL VENTS
// ============================================================

function createHydrothermalVents() {
    const center = new THREE.Vector3(560, 0, -6800);
    const depth = floorDepthAtZ(center.z);
    const chimMat = new THREE.MeshStandardMaterial({ color: 0x33221a, flatShading: true, roughness: 1 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff5522 });

    for (let i = 0; i < 5; i++) {
        const x = center.x + (Math.random() - 0.5) * 220;
        const z = center.z + (Math.random() - 0.5) * 220;
        const h = 18 + Math.random() * 22;
        const chimney = new THREE.Mesh(new THREE.CylinderGeometry(2 + Math.random() * 2, 4 + Math.random() * 3, h, 7), chimMat);
        chimney.position.set(x, -depth + h / 2, z);
        scene.add(chimney);

        const glow = new THREE.PointLight(0xff5522, 2.2, 90);
        glow.position.set(x, -depth + h, z);
        scene.add(glow);

        const glowCap = new THREE.Mesh(new THREE.SphereGeometry(1.2, 6, 6), glowMat);
        glowCap.position.copy(glow.position);
        scene.add(glowCap);

        const smokeGeo = new THREE.BufferGeometry();
        const n = 60;
        const positions = new Float32Array(n * 3);
        const speeds = new Float32Array(n);
        for (let p = 0; p < n; p++) {
            positions[p * 3] = x + (Math.random() - 0.5) * 3;
            positions[p * 3 + 1] = -depth + h + Math.random() * 20;
            positions[p * 3 + 2] = z + (Math.random() - 0.5) * 3;
            speeds[p] = 4 + Math.random() * 6;
        }
        smokeGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const smokeMat = new THREE.PointsMaterial({ color: 0x996655, size: 2.5, transparent: true, opacity: 0.5, depthWrite: false });
        const smoke = new THREE.Points(smokeGeo, smokeMat);
        smoke.userData = { baseY: -depth + h, speeds: speeds, originX: x, originZ: z };
        scene.add(smoke);
        ventParticles.push(smoke);
    }
}

// ============================================================
// BIOLUMINESCENCE
// ============================================================

function createBioluminescence() {
    const center = new THREE.Vector3(380, 0, -8600);
    const depth = floorDepthAtZ(center.z);
    const n = 500;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(n * 3);
    const phases = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        positions[i * 3] = center.x + (Math.random() - 0.5) * 1400;
        positions[i * 3 + 1] = -depth + Math.random() * 500 - 100;
        positions[i * 3 + 2] = center.z + (Math.random() - 0.5) * 1400;
        phases[i] = Math.random() * Math.PI * 2;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x44ffcc, size: 2.2, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const points = new THREE.Points(geo, mat);
    points.userData = { phases: phases };
    scene.add(points);
    biolumParticles.push(points);
}

// ============================================================
// RESEARCH STATION
// ============================================================

function createResearchStation() {
    const depth = floorDepthAtZ(-10400);
    const station = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x7a8590, flatShading: true, roughness: 0.6, metalness: 0.4 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat);
    station.add(dome);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(20, 22, 6, 10), mat);
    base.position.y = -3;
    station.add(base);
    for (let i = 0; i < 4; i++) {
        const strut = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 14, 5), mat);
        const ang = (i / 4) * Math.PI * 2;
        strut.position.set(Math.cos(ang) * 16, -10, Math.sin(ang) * 16);
        station.add(strut);
    }
    const light = new THREE.PointLight(0x66ccff, 3, 140);
    light.position.y = 14;
    station.add(light);
    station.position.set(180, -depth + 12, -10400);
    scene.add(station);
}

// ============================================================
// FISH SCHOOLS
// ============================================================

function createFishMesh(color) {
    const mat = new THREE.MeshPhongMaterial({ color: color, flatShading: true });
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 5), mat);
    body.rotation.z = -Math.PI / 2;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.8, 1.2, 4), mat);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -1.6;
    const group = new THREE.Group();
    group.add(body, tail);
    return group;
}

function createFishSchools() {
    const spots = [
        { pos: new THREE.Vector3(120, -25, -400), color: 0xffcc33, n: 22 },
        { pos: new THREE.Vector3(260, -45, -900), color: 0x33ccff, n: 30 },
        { pos: new THREE.Vector3(260, -45, -1050), color: 0xff6699, n: 18 },
        { pos: new THREE.Vector3(420, -95, -1650), color: 0x88aacc, n: 16 },
        { pos: new THREE.Vector3(620, -270, -3800), color: 0x556677, n: 20 }
    ];
    spots.forEach(function(spot) {
        const school = { center: spot.pos.clone(), fish: [], radius: 40 + Math.random() * 20, phase: Math.random() * Math.PI * 2 };
        for (let i = 0; i < spot.n; i++) {
            const fish = createFishMesh(spot.color);
            fish.userData = {
                orbitR: 10 + Math.random() * spot.radius,
                orbitSpeed: 0.3 + Math.random() * 0.5,
                orbitAngle: Math.random() * Math.PI * 2,
                yOff: (Math.random() - 0.5) * 20,
                bobPhase: Math.random() * Math.PI * 2
            };
            scene.add(fish);
            school.fish.push(fish);
        }
        fishSchools.push(school);
    });
}

// ============================================================
// JELLYFISH
// ============================================================

function createJellyfish() {
    const mat = new THREE.MeshPhongMaterial({ color: 0xffaaee, transparent: true, opacity: 0.55, flatShading: true });
    const tentMat = new THREE.MeshPhongMaterial({ color: 0xffaaee, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 24; i++) {
        const z = -600 - Math.random() * 9000;
        const depth = floorDepthAtZ(z);
        const y = -Math.min(depth * 0.5, depth - 20) - Math.random() * 100;
        const jelly = new THREE.Group();
        const bell = new THREE.Mesh(new THREE.SphereGeometry(2.5 + Math.random() * 2, 8, 6, 0, Math.PI * 2, 0, Math.PI / 1.7), mat);
        jelly.add(bell);
        for (let t = 0; t < 6; t++) {
            const ang = (t / 6) * Math.PI * 2;
            const tentacle = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 6 + Math.random() * 4, 3), tentMat);
            tentacle.position.set(Math.cos(ang) * 1.5, -4, Math.sin(ang) * 1.5);
            jelly.add(tentacle);
        }
        jelly.position.set((Math.random() - 0.5) * 900, y, z);
        jelly.userData = { phase: Math.random() * Math.PI * 2, baseY: y };
        scene.add(jelly);
        jellyfish.push(jelly);
    }
}

// ============================================================
// WHALE
// ============================================================

function createWhale() {
    const mat = new THREE.MeshPhongMaterial({ color: 0x33506a, flatShading: true });
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 3, 36, 10), mat);
    body.rotation.z = Math.PI / 2;
    group.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(7, 8, 4), mat);
    tail.rotation.z = Math.PI / 2;
    tail.position.x = -22;
    tail.scale.y = 2.2;
    group.add(tail);
    const finL = new THREE.Mesh(new THREE.ConeGeometry(2, 8, 4), mat);
    finL.position.set(4, -4, 7);
    finL.rotation.z = 1.4;
    group.add(finL);
    const finR = finL.clone();
    finR.position.z = -7;
    group.add(finR);

    group.position.set(620, -260, -3300);
    group.userData = { t: 0 };
    scene.add(group);
    whale = group;
}

// ============================================================
// SUBMARINE
// ============================================================

function createSubmarine() {
    subGroup = new THREE.Group();

    const hullMat = new THREE.MeshStandardMaterial({ color: 0xffcc22, metalness: 0.5, roughness: 0.35 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x222833, metalness: 0.6, roughness: 0.4 });
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x113344, transparent: true, opacity: 0.6, shininess: 90 });

    const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 7, 14), hullMat);
    hull.rotation.z = Math.PI / 2;
    hull.castShadow = true;
    subGroup.add(hull);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(1.6, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), hullMat);
    nose.rotation.z = -Math.PI / 2;
    nose.position.x = 3.5;
    subGroup.add(nose);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(1.6, 2.2, 14), darkMat);
    tail.rotation.z = -Math.PI / 2;
    tail.position.x = -4.1;
    subGroup.add(tail);

    const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), glassMat);
    dome.position.set(0.8, 1.4, 0);
    subGroup.add(dome);

    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.2, 0.3), darkMat);
    fin.position.set(-2, 1.8, 0);
    subGroup.add(fin);

    for (let s = -1; s <= 1; s += 2) {
        const stab = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 1.6), darkMat);
        stab.position.set(-3.2, 0, s * 1.6);
        subGroup.add(stab);

        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.4, 8), darkMat);
        pod.rotation.z = Math.PI / 2;
        pod.position.set(-3.6, -0.3, s * 2.2);
        subGroup.add(pod);
    }

    propeller = new THREE.Group();
    for (let b = 0; b < 4; b++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.35), darkMat);
        blade.rotation.x = (b / 4) * Math.PI * 2;
        propeller.add(blade);
    }
    propeller.position.x = -5.1;
    propeller.rotation.y = Math.PI / 2;
    subGroup.add(propeller);

    headlightL = new THREE.SpotLight(0xeaffff, 3, 260, Math.PI / 6, 0.5, 1.4);
    headlightL.position.set(3.6, 0.4, 0.8);
    subGroup.add(headlightL);
    subGroup.add(headlightL.target);
    headlightL.target.position.set(20, -1, 0.8);

    headlightR = headlightL.clone();
    headlightR.position.set(3.6, 0.4, -0.8);
    subGroup.add(headlightR);
    subGroup.add(headlightR.target);
    headlightR.target.position.set(20, -1, -0.8);

    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [0.8, -0.8].forEach(function(zo) {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.18, 6, 6), bulbMat);
        bulb.position.set(3.6, 0.4, zo);
        subGroup.add(bulb);
    });

    subHeadlights = [headlightL, headlightR];

    subGroup.position.copy(sub.pos);
    scene.add(subGroup);
}

// ============================================================
// CHECKPOINT RINGS
// ============================================================

function createCheckpointRings() {
    waypoints.forEach(function(wp) {
        const group = new THREE.Group();
        const color = wp.type === 'destination' ? 0xff5533 : 0x22e2ff;
        const ringMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
        for (let i = 0; i < 3; i++) {
            const ring = new THREE.Mesh(new THREE.RingGeometry(wp.radius * 0.55 + i * 14, wp.radius * 0.55 + i * 14 + 3, 32), ringMat.clone());
            ring.position.copy(wp.pos);
            group.add(ring);
        }
        scene.add(group);
        checkpointRings.push(group);
    });
}

// ============================================================
// MINIMAP
// ============================================================

function setupMinimap() {
    minimapCanvas = document.getElementById('minimap-canvas');
    minimapCtx = minimapCanvas.getContext('2d');
}

function updateMinimap() {
    if (!minimapVisible || !minimapCtx) return;
    const w = minimapCanvas.width, h = minimapCanvas.height;
    const ctx = minimapCtx;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(0,20,30,0.4)';
    ctx.fillRect(0, 0, w, h);

    const range = 2600;
    const cx = w / 2, cy = h / 2;

    ctx.strokeStyle = 'rgba(34,226,255,0.15)';
    for (let r = 1; r <= 3; r++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (r / 3) * Math.min(w, h) / 2, 0, Math.PI * 2);
        ctx.stroke();
    }

    sonarSweep += 0.03;
    const sweepGrad = ctx.createLinearGradient(cx, cy, cx + Math.cos(sonarSweep) * w, cy + Math.sin(sonarSweep) * w);
    sweepGrad.addColorStop(0, 'rgba(34,226,255,0.35)');
    sweepGrad.addColorStop(1, 'rgba(34,226,255,0)');
    ctx.strokeStyle = sweepGrad;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(sonarSweep) * w, cy + Math.sin(sonarSweep) * w);
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineWidth = 1;

    waypoints.forEach(function(wp) {
        const dx = wp.pos.x - sub.pos.x;
        const dz = wp.pos.z - sub.pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > range) return;
        const px = cx + (dx / range) * (w / 2);
        const py = cy + (dz / range) * (h / 2);
        ctx.fillStyle = wp.reached ? 'rgba(80,255,120,0.9)' : (wp.type === 'destination' ? '#ff5533' : '#ffcc33');
        ctx.beginPath();
        ctx.arc(px, py, wp.reached ? 2.5 : 4, 0, Math.PI * 2);
        ctx.fill();
    });

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(sub.heading * DEG);
    ctx.fillStyle = '#22e2ff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// ============================================================
// INPUT & PHYSICS
// ============================================================

function updateInput(dt) {
    if (keys['Space'] && !prevKeys['Space']) triggerSonarPing();
    if (keys['KeyC'] && !prevKeys['KeyC']) cameraMode = (cameraMode + 1) % 3;
    if (keys['KeyM'] && !prevKeys['KeyM']) {
        minimapVisible = !minimapVisible;
        document.querySelector('.minimap').style.display = minimapVisible ? 'block' : 'none';
    }
    if (keys['KeyR'] && !prevKeys['KeyR']) resetPosition();

    if (keys['ArrowUp']) {
        sub.pitch = Math.min(sub.pitch + 1.6 * dt, 0.55);
    } else if (keys['ArrowDown']) {
        sub.pitch = Math.max(sub.pitch - 1.6 * dt, -0.5);
    } else {
        sub.pitch *= Math.max(0, 1 - 2.2 * dt);
    }

    if (keys['ArrowLeft']) {
        sub.roll = Math.max(sub.roll - 2.2 * dt, -0.6);
        sub.heading -= 42 * dt;
    } else if (keys['ArrowRight']) {
        sub.roll = Math.min(sub.roll + 2.2 * dt, 0.6);
        sub.heading += 42 * dt;
    } else {
        sub.roll *= Math.max(0, 1 - 3 * dt);
    }

    if (keys['KeyA']) { sub.heading -= 24 * dt; sub.roll = Math.max(sub.roll - 1.5 * dt, -0.35); }
    if (keys['KeyD']) { sub.heading += 24 * dt; sub.roll = Math.min(sub.roll + 1.5 * dt, 0.35); }

    if (keys['KeyW']) sub.throttle = Math.min(sub.throttle + 0.6 * dt, 1);
    if (keys['KeyS']) sub.throttle = Math.max(sub.throttle - 0.8 * dt, -0.3);

    sub.boost = !!(keys['ShiftLeft'] || keys['ShiftRight']);

    if (sub.heading < 0) sub.heading += 360;
    if (sub.heading >= 360) sub.heading -= 360;

    const m = modeSettings[gameMode];
    const targetSpeed = sub.throttle * m.maxSpeed * (sub.boost ? 1.6 : 1);
    sub.speed += (targetSpeed - sub.speed) * m.accel * dt;

    for (const k in keys) prevKeys[k] = keys[k];
}

function updateSubmarine(dt) {
    if (!subGroup) return;

    const headingRad = sub.heading * DEG;
    const speedMS = sub.speed * 0.6;
    const horiz = Math.cos(sub.pitch);

    sub.pos.x += Math.sin(headingRad) * speedMS * horiz * dt;
    sub.pos.z -= Math.cos(headingRad) * speedMS * horiz * dt;
    sub.pos.y -= Math.sin(sub.pitch) * speedMS * dt;

    if (sub.pos.y > -3) sub.pos.y = -3;
    if (sub.pos.y < -MAX_DEPTH) sub.pos.y = -MAX_DEPTH;

    sub.depth = -sub.pos.y;
    if (sub.depth > maxDepthReached) maxDepthReached = sub.depth;

    distanceTraveled += Math.abs(speedMS) * dt;

    const safe = modeSettings[gameMode].safeDepth;
    if (sub.depth > safe) {
        sub.hull -= (sub.depth - safe) * 0.0006 * dt;
        if (sub.hull < 0) sub.hull = 0;
    } else if (sub.hull < 100) {
        sub.hull += 1.5 * dt;
        if (sub.hull > 100) sub.hull = 100;
    }

    subGroup.position.copy(sub.pos);
    subGroup.rotation.set(sub.roll, Math.PI / 2 - headingRad, sub.pitch, 'YXZ');

    const propSpeed = 8 + sub.throttle * 30 + (sub.boost ? 12 : 0);
    if (propeller) propeller.rotation.x += propSpeed * dt;

    subGroup.position.y += Math.sin(diveTime * 1.6) * 0.15;

    if (sub.hull <= 0 && !gameOver) {
        endGame(true);
    }
}

function resetPosition() {
    sub.pos.set(0, -8, 20);
    sub.heading = 0;
    sub.pitch = 0;
    sub.roll = 0;
    sub.speed = 0;
    sub.throttle = 0.3;
    sub.hull = 100;
    showMessage('POSITION RESET', 1200);
}

// ============================================================
// CAMERA
// ============================================================

function updateCamera(dt) {
    const headingRad = sub.heading * DEG;

    switch (cameraMode) {
        case 0: { // chase
            const chaseDistance = 14 + Math.abs(sub.speed) * 0.05;
            const chaseHeight = 4 + Math.abs(sub.speed) * 0.02;
            const targetCamPos = new THREE.Vector3(
                sub.pos.x - Math.sin(headingRad) * chaseDistance,
                sub.pos.y + chaseHeight,
                sub.pos.z + Math.cos(headingRad) * chaseDistance
            );
            camera.position.lerp(targetCamPos, 4 * dt);
            camera.lookAt(
                sub.pos.x + Math.sin(headingRad) * 8,
                sub.pos.y - 1,
                sub.pos.z - Math.cos(headingRad) * 8
            );
            break;
        }
        case 1: { // cockpit
            camera.position.set(
                sub.pos.x + Math.sin(headingRad) * 1.4,
                sub.pos.y + 1.2,
                sub.pos.z - Math.cos(headingRad) * 1.4
            );
            camera.lookAt(
                sub.pos.x + Math.sin(headingRad) * 60,
                sub.pos.y - Math.sin(sub.pitch) * 30,
                sub.pos.z - Math.cos(headingRad) * 60
            );
            break;
        }
        case 2: { // cinematic
            const cinTime = diveTime * 0.12;
            const cinDist = 22;
            const targetCinPos = new THREE.Vector3(
                sub.pos.x + Math.sin(cinTime) * cinDist,
                sub.pos.y + 8 + Math.sin(cinTime * 0.5) * 3,
                sub.pos.z + Math.cos(cinTime) * cinDist
            );
            camera.position.lerp(targetCinPos, 2 * dt);
            camera.lookAt(sub.pos);
            break;
        }
    }

    if (Math.abs(sub.speed) > 55) {
        const shake = (Math.abs(sub.speed) - 55) * 0.0015;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
    }
}

// ============================================================
// FOG / VISIBILITY
// ============================================================

function updateFog() {
    const d = sub.depth;
    let lo = FOG_STOPS[0], hi = FOG_STOPS[FOG_STOPS.length - 1];
    for (let i = 0; i < FOG_STOPS.length - 1; i++) {
        if (d >= FOG_STOPS[i].depth && d <= FOG_STOPS[i + 1].depth) {
            lo = FOG_STOPS[i]; hi = FOG_STOPS[i + 1];
            break;
        }
    }
    const span = (hi.depth - lo.depth) || 1;
    const t = Math.min(Math.max((d - lo.depth) / span, 0), 1);
    const c1 = new THREE.Color(lo.color), c2 = new THREE.Color(hi.color);
    const c = c1.clone().lerp(c2, t);
    scene.fog.color.copy(c);
    scene.fog.density = lo.density + (hi.density - lo.density) * t;
    renderer.setClearColor(c);

    const darkT = Math.min(d / 1200, 1);
    subHeadlights.forEach(function(l) { l.intensity = 1.2 + darkT * 4.5; });

    godRays.forEach(function(ray) {
        const fade = Math.max(0, 1 - d / 260);
        ray.material.opacity = ray.userData.baseOpacity * fade;
    });
}

// ============================================================
// ANIMATED WORLD ELEMENTS
// ============================================================

function updateKelp(t) {
    kelpFronds.forEach(function(frond) {
        frond.rotation.z = Math.sin(t * frond.userData.speed + frond.userData.phase) * 0.18;
    });
}

function updateFish(dt, t) {
    fishSchools.forEach(function(school) {
        school.fish.forEach(function(fish) {
            const ud = fish.userData;
            ud.orbitAngle += ud.orbitSpeed * dt;
            const x = school.center.x + Math.cos(ud.orbitAngle) * ud.orbitR;
            const z = school.center.z + Math.sin(ud.orbitAngle) * ud.orbitR;
            const y = school.center.y + ud.yOff + Math.sin(t * 1.5 + ud.bobPhase) * 3;
            fish.position.set(x, y, z);
            fish.rotation.y = -ud.orbitAngle - Math.PI / 2;
            fish.rotation.z = Math.sin(t * 6 + ud.bobPhase) * 0.15;
        });
    });
}

function updateJellyfish(t) {
    jellyfish.forEach(function(j) {
        const ud = j.userData;
        j.position.y = ud.baseY + Math.sin(t * 0.6 + ud.phase) * 4;
        const s = 1 + Math.sin(t * 1.8 + ud.phase) * 0.12;
        j.scale.set(s, 1 / (s * 0.5 + 0.5), s);
    });
}

function updateWhale(dt, t) {
    if (!whale) return;
    whale.userData.t += dt;
    whale.position.x = 620 + Math.sin(whale.userData.t * 0.05) * 400;
    whale.position.y = -260 + Math.sin(whale.userData.t * 0.1) * 30;
    whale.rotation.y = Math.cos(whale.userData.t * 0.05) * 0.3 + Math.PI / 2;
    whale.rotation.z = Math.sin(t * 1.2) * 0.05;
}

function updateVents(dt) {
    ventParticles.forEach(function(smoke) {
        const pos = smoke.geometry.attributes.position;
        const ud = smoke.userData;
        for (let i = 0; i < pos.count; i++) {
            let y = pos.getY(i) + ud.speeds[i] * dt;
            if (y > ud.baseY + 40) {
                y = ud.baseY;
                pos.setX(i, ud.originX + (Math.random() - 0.5) * 3);
                pos.setZ(i, ud.originZ + (Math.random() - 0.5) * 3);
            }
            pos.setY(i, y);
        }
        pos.needsUpdate = true;
    });
}

function updateBiolum(t) {
    biolumParticles.forEach(function(points) {
        points.material.opacity = 0.5 + Math.sin(t * 2) * 0.3;
    });
}

function updateCheckpointRings(dt) {
    checkpointRings.forEach(function(group) {
        group.rotation.y += dt * 0.3;
        group.children.forEach(function(ring, i) {
            ring.material.opacity = 0.25 + Math.sin(diveTime * 2 + i) * 0.15;
        });
    });
}

// ============================================================
// SCORING & WAYPOINTS
// ============================================================

function updateScoring(dt) {
    if (Math.abs(sub.speed) > 3) {
        score += Math.abs(sub.speed) * 0.015 * dt * scoreMultiplier;
    }
    if (sub.depth > 1000) score += 2 * dt;
    if (sub.depth > 5000) score += 5 * dt;

    if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) { comboCount = 0; scoreMultiplier = 1; }
    }

    const safe = modeSettings[gameMode].safeDepth;
    if (sub.depth > safe && sub.hull > 20) {
        score += 8 * dt;
    }

    checkWaypoints();
    updateHUD();
}

function checkWaypoints() {
    waypoints.forEach(function(wp, idx) {
        if (wp.reached) return;
        const dist = sub.pos.distanceTo(wp.pos);
        if (dist < wp.radius) {
            wp.reached = true;
            checkpointsHit++;

            comboCount++;
            comboTimer = 10;
            scoreMultiplier = 1 + comboCount * 0.5;
            const points = wp.points * scoreMultiplier;
            score += points;

            showMessage(wp.name + ' +' + Math.floor(points), 2200);
            flashCheckpoint();
            playCheckpointSound();

            if (checkpointRings[idx]) {
                checkpointRings[idx].children.forEach(function(child) {
                    child.material.color.setHex(0x55ff88);
                });
            }

            if (idx >= currentWaypointIndex) currentWaypointIndex = idx + 1;

            if (wp.type === 'destination') endGame(false);
        }
    });
}

// ============================================================
// HUD
// ============================================================

function updateHUD() {
    document.getElementById('speed-val').textContent = Math.floor(Math.abs(sub.speed));
    document.getElementById('depth-val').textContent = Math.floor(sub.depth).toLocaleString();
    document.getElementById('heading-val').textContent = Math.floor(sub.heading).toString().padStart(3, '0') + '°';
    document.getElementById('hull-val').textContent = Math.floor(sub.hull);
    document.getElementById('score-val').textContent = Math.floor(score).toLocaleString();

    const depthPercent = Math.min((sub.depth / MAX_DEPTH) * 100, 100);
    document.getElementById('depth-bar-fill').style.height = depthPercent + '%';

    const throttlePercent = Math.min(Math.max((sub.throttle + 0.3) / 1.3, 0), 1) * 100;
    document.getElementById('throttle-fill').style.height = throttlePercent + '%';

    const dirs = ['dir-w', 'dir-nw', 'dir-n', 'dir-ne', 'dir-e'];
    const angles = { 'dir-w': 270, 'dir-nw': 315, 'dir-n': 0, 'dir-ne': 45, 'dir-e': 90 };
    dirs.forEach(function(id) {
        const el = document.getElementById(id);
        const diff = Math.min(Math.abs(sub.heading - angles[id]), 360 - Math.abs(sub.heading - angles[id]));
        el.classList.toggle('active', diff < 25);
    });

    const nextWp = waypoints[Math.min(currentWaypointIndex, waypoints.length - 1)];
    const wpIndicator = document.getElementById('waypoint-indicator');
    if (nextWp && !nextWp.reached) {
        const dist = sub.pos.distanceTo(nextWp.pos) / 1000;
        document.getElementById('waypoint-text').textContent = nextWp.name + ' - ' + dist.toFixed(1) + ' KM';
        wpIndicator.style.display = 'flex';
    } else {
        wpIndicator.style.display = 'none';
    }

    const progress = Math.min((sub.depth / MAX_DEPTH) * 100, 100);
    document.getElementById('progress-fill').style.width = progress + '%';

    const hullWarning = document.getElementById('hull-warning');
    hullWarning.classList.toggle('show', sub.hull < 35);

    updateMinimap();
}

// ============================================================
// UI HELPERS
// ============================================================

function showMessage(text, duration) {
    const el = document.getElementById('game-message');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(el._timer);
    el._timer = setTimeout(function() { el.classList.remove('show'); }, duration || 2000);
}

function flashCheckpoint() {
    const el = document.getElementById('checkpoint-flash');
    el.classList.add('active');
    setTimeout(function() { el.classList.remove('active'); }, 300);
}

function triggerSonarPing() {
    const el = document.getElementById('sonar-ping-ind');
    el.style.display = 'block';
    setTimeout(function() { el.style.display = 'none'; }, 700);
    playPingSound();

    const nextWp = waypoints[Math.min(currentWaypointIndex, waypoints.length - 1)];
    if (nextWp && !nextWp.reached) {
        const dist = sub.pos.distanceTo(nextWp.pos) / 1000;
        showMessage(nextWp.name + ' BEARING ' + Math.floor(sub.heading) + '° - ' + dist.toFixed(1) + 'KM', 1600);
    }
}

// ============================================================
// AUDIO
// ============================================================

function initAudio() {
    if (audioStarted) return;
    audioStarted = true;
    try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        engineOsc = audioCtx.createOscillator();
        engineGain = audioCtx.createGain();
        engineOsc.type = 'sine';
        engineOsc.frequency.value = 55;
        engineGain.gain.value = 0.02;
        engineOsc.connect(engineGain);
        engineGain.connect(audioCtx.destination);
        engineOsc.start();
    } catch (e) { /* audio unavailable */ }
}

function updateAudio() {
    if (!audioCtx || !engineOsc) return;
    const targetFreq = 40 + Math.abs(sub.speed) * 1.4 + (sub.boost ? 20 : 0);
    engineOsc.frequency.linearRampToValueAtTime(targetFreq, audioCtx.currentTime + 0.15);
    engineGain.gain.linearRampToValueAtTime(0.015 + Math.min(Math.abs(sub.speed) / 200, 0.03), audioCtx.currentTime + 0.15);
}

function playPingSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 1400;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.9);
    osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.9);
    osc.stop(audioCtx.currentTime + 0.9);
}

function playCheckpointSound() {
    if (!audioCtx) return;
    [660, 880, 1100].forEach(function(freq, i) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.value = 0.001;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        const t0 = audioCtx.currentTime + i * 0.08;
        osc.start(t0);
        gain.gain.linearRampToValueAtTime(0.1, t0 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.5);
        osc.stop(t0 + 0.5);
    });
}

// ============================================================
// GAME FLOW
// ============================================================

function simulateLoading() {
    const bar = document.getElementById('loading-bar');
    const text = document.getElementById('loading-text');
    const messages = ['PRESSURIZING HULL...', 'CALIBRATING SONAR...', 'CHARGING BALLAST TANKS...', 'SYNCING NAV BEACONS...', 'READY TO DIVE'];
    let progress = 0;
    const interval = setInterval(function() {
        progress += 8 + Math.random() * 12;
        if (progress >= 100) {
            progress = 100;
            clearInterval(interval);
            setTimeout(function() {
                document.getElementById('loading-screen').classList.add('fade-out');
                setTimeout(function() {
                    document.getElementById('loading-screen').style.display = 'none';
                    document.getElementById('start-screen').style.display = 'flex';
                }, 1000);
            }, 300);
        }
        bar.style.width = progress + '%';
        text.textContent = messages[Math.min(Math.floor(progress / 22), messages.length - 1)];
    }, 180);
}

window.selectMode = function(mode) {
    gameMode = mode;
    document.querySelectorAll('.mode-btn').forEach(function(btn) {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
};

window.startGame = function() {
    initAudio();
    document.getElementById('start-screen').classList.add('fade-out');
    setTimeout(function() {
        document.getElementById('start-screen').style.display = 'none';
        document.getElementById('hud').style.display = 'block';
        gameStarted = true;
    }, 1000);
};

window.restartGame = function() {
    score = 0;
    diveTime = 0;
    distanceTraveled = 0;
    checkpointsHit = 0;
    maxDepthReached = 0;
    scoreMultiplier = 1;
    comboCount = 0;
    comboTimer = 0;
    gameOver = false;

    waypoints.forEach(function(wp, idx) {
        wp.reached = false;
        if (checkpointRings[idx]) {
            checkpointRings[idx].children.forEach(function(child) {
                child.material.color.setHex(wp.type === 'destination' ? 0xff5533 : 0x22e2ff);
            });
        }
    });
    currentWaypointIndex = 0;
    resetPosition();

    document.getElementById('game-over').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
};

function endGame(crushed) {
    gameOver = true;
    setTimeout(function() {
        document.getElementById('hud').style.display = 'none';
        const overScreen = document.getElementById('game-over');
        document.getElementById('final-score').textContent = Math.floor(score).toLocaleString();
        document.querySelector('#game-over h1').textContent = crushed ? 'HULL BREACH' : 'DIVE COMPLETE';
        document.getElementById('stats-grid').innerHTML =
            '<div>Max Depth</div><div class="stat-val">' + Math.floor(maxDepthReached).toLocaleString() + ' m</div>' +
            '<div>Checkpoints</div><div class="stat-val">' + checkpointsHit + ' / ' + waypoints.length + '</div>' +
            '<div>Distance</div><div class="stat-val">' + (distanceTraveled / 1000).toFixed(1) + ' km</div>' +
            '<div>Dive Time</div><div class="stat-val">' + Math.floor(diveTime) + ' s</div>';
        overScreen.style.display = 'flex';
    }, crushed ? 800 : 300);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// MAIN LOOP
// ============================================================

function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.getElapsedTime();

    if (gameStarted && !gameOver) {
        diveTime += dt;
        updateInput(dt);
        updateSubmarine(dt);
        updateCamera(dt);
        updateFog();
        updateAudio();
        updateScoring(dt);
    }

    updateKelp(t);
    updateFish(dt, t);
    updateJellyfish(t);
    updateWhale(dt, t);
    updateVents(dt);
    updateBiolum(t);
    updateCheckpointRings(dt);

    const ceiling = scene.children.find(function(c) { return c.userData && c.userData.isSurface; });
    if (ceiling) ceiling.material.uniforms.time.value = t;

    renderer.render(scene, camera);
}

init();
animate();

})();
