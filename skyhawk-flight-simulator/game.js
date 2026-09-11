// ============================================================
// SKYHAWK - Helicopter Flight Simulator
// San Francisco to London
// ============================================================

(function() {
'use strict';

// ---- CONSTANTS ----
const DEG = Math.PI / 180;
const TOTAL_DISTANCE = 8634; // km SF to London
const KM_TO_NM = 0.539957;
const WORLD_SCALE = 10; // world units per km

// ---- GAME STATE ----
let scene, camera, renderer, clock;
let helicopter, heliGroup, rotorTop, rotorTail;
let mixers = [];
let gameStarted = false;
let gameOver = false;
let cameraMode = 0; // 0=chase, 1=cockpit, 2=cinematic
let minimapVisible = true;
let minimapCanvas, minimapCtx;

let gameMode = 'normal'; // normal, fast, turbo
const modeSettings = {
    normal: { speedMult: 1, maxSpeed: 250, accel: 0.5, label: 'NORMAL' },
    fast:   { speedMult: 3, maxSpeed: 600, accel: 1.2, label: 'FAST' },
    turbo:  { speedMult: 6, maxSpeed: 1200, accel: 2.5, label: 'TURBO' }
};

// Helicopter state
let heli = {
    pos: new THREE.Vector3(0, 80, 0),
    vel: new THREE.Vector3(0, 0, 0),
    rotation: new THREE.Euler(0, 0, 0, 'YXZ'),
    speed: 0,
    altitude: 500,
    throttle: 0.3,
    pitch: 0,
    roll: 0,
    yaw: 0,
    heading: 45, // NE towards London
    targetAltitude: 500,
    boost: false,
    fastMode: false
};

// Scoring
let score = 0;
let flightTime = 0;
let distanceTraveled = 0;
let checkpointsHit = 0;
let perfectManeuvers = 0;
let maxSpeedReached = 0;
let scoreMultiplier = 1;
let comboTimer = 0;
let comboCount = 0;

// Controls
let keys = {};
let prevKeys = {};

// Waypoints along SF to London route
const waypoints = [
    { name: 'GOLDEN GATE BRIDGE', pos: new THREE.Vector3(0, 80, 0), radius: 200, points: 500, reached: false, type: 'landmark' },
    { name: 'ALCATRAZ ISLAND', pos: new THREE.Vector3(300, 60, -200), radius: 150, points: 300, reached: false, type: 'landmark' },
    { name: 'PACIFIC COAST', pos: new THREE.Vector3(1500, 100, -1500), radius: 400, points: 200, reached: false, type: 'waypoint' },
    { name: 'SIERRA NEVADA', pos: new THREE.Vector3(4000, 300, -4000), radius: 500, points: 400, reached: false, type: 'mountain' },
    { name: 'ROCKY MOUNTAINS', pos: new THREE.Vector3(10000, 400, -10000), radius: 600, points: 500, reached: false, type: 'mountain' },
    { name: 'GREAT PLAINS', pos: new THREE.Vector3(18000, 150, -18000), radius: 800, points: 300, reached: false, type: 'waypoint' },
    { name: 'CHICAGO SKYLINE', pos: new THREE.Vector3(26000, 200, -26000), radius: 500, points: 600, reached: false, type: 'city' },
    { name: 'APPALACHIAN MTNS', pos: new THREE.Vector3(33000, 350, -33000), radius: 600, points: 400, reached: false, type: 'mountain' },
    { name: 'NEW YORK HARBOR', pos: new THREE.Vector3(40000, 100, -40000), radius: 500, points: 700, reached: false, type: 'landmark' },
    { name: 'ATLANTIC OCEAN', pos: new THREE.Vector3(52000, 120, -52000), radius: 1000, points: 300, reached: false, type: 'ocean' },
    { name: 'MID-ATLANTIC', pos: new THREE.Vector3(64000, 150, -64000), radius: 1000, points: 500, reached: false, type: 'ocean' },
    { name: 'IRISH COAST', pos: new THREE.Vector3(76000, 100, -76000), radius: 600, points: 600, reached: false, type: 'landmark' },
    { name: 'ENGLISH CHANNEL', pos: new THREE.Vector3(82000, 80, -82000), radius: 500, points: 500, reached: false, type: 'ocean' },
    { name: 'LONDON HEATHROW', pos: new THREE.Vector3(86340, 50, -86340), radius: 400, points: 2000, reached: false, type: 'destination' }
];

let currentWaypointIndex = 0;

// World objects arrays
let worldObjects = [];
let terrainChunks = new Map();
let clouds = [];
let particles = [];
let checkpointRings = [];
let seagulls = [];

// Audio
let audioCtx;
let rotorOscillator, engineOscillator;
let audioStarted = false;

// ============================================================
// INITIALIZATION
// ============================================================

function init() {
    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x87CEEB, 0.00004);

    // Camera
    camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 1, 80000);
    camera.position.set(-15, 8, 0);

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    document.body.appendChild(renderer.domElement);

    clock = new THREE.Clock();

    // Lights
    setupLights();

    // Sky
    createSky();

    // Water
    createOcean();

    // Build World
    createGoldenGateBridge();
    createSanFranciscoSkyline();
    createAlcatraz();
    createHelicopter();
    createCheckpointRings();

    // Minimap
    setupMinimap();

    // Events
    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', function(e) { keys[e.code] = true; e.preventDefault(); });
    window.addEventListener('keyup', function(e) { keys[e.code] = false; });

    // Start loading sequence
    simulateLoading();
}

function setupLights() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x6688aa, 0.6);
    scene.add(ambient);

    // Sun
    const sun = new THREE.DirectionalLight(0xffeedd, 1.4);
    sun.position.set(500, 800, 300);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 2000;
    sun.shadow.camera.left = -500;
    sun.shadow.camera.right = 500;
    sun.shadow.camera.top = 500;
    sun.shadow.camera.bottom = -500;
    scene.add(sun);

    // Hemisphere
    const hemi = new THREE.HemisphereLight(0x88bbff, 0x445522, 0.5);
    scene.add(hemi);
}

// ============================================================
// SKY
// ============================================================

function createSky() {
    const skyGeo = new THREE.SphereGeometry(40000, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
        uniforms: {
            topColor: { value: new THREE.Color(0x0044aa) },
            bottomColor: { value: new THREE.Color(0x88ccff) },
            offset: { value: 20 },
            exponent: { value: 0.4 }
        },
        vertexShader: [
            'varying vec3 vWorldPosition;',
            'void main() {',
            '  vec4 worldPosition = modelMatrix * vec4(position, 1.0);',
            '  vWorldPosition = worldPosition.xyz;',
            '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform vec3 topColor;',
            'uniform vec3 bottomColor;',
            'uniform float offset;',
            'uniform float exponent;',
            'varying vec3 vWorldPosition;',
            'void main() {',
            '  float h = normalize(vWorldPosition + offset).y;',
            '  gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);',
            '}'
        ].join('\n'),
        side: THREE.BackSide
    });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // Sun glow
    const sunGeo = new THREE.SphereGeometry(200, 16, 16);
    const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffee });
    const sunMesh = new THREE.Mesh(sunGeo, sunMat);
    sunMesh.position.set(5000, 3000, 3000);
    scene.add(sunMesh);

    // Clouds
    createClouds();
}

function createClouds() {
    const cloudMat = new THREE.MeshPhongMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.8,
        flatShading: true
    });

    for (let i = 0; i < 200; i++) {
        const cloud = new THREE.Group();
        const numPuffs = 3 + Math.floor(Math.random() * 5);

        for (let j = 0; j < numPuffs; j++) {
            const size = 30 + Math.random() * 80;
            const puff = new THREE.Mesh(
                new THREE.SphereGeometry(size, 8, 6),
                cloudMat.clone()
            );
            puff.position.set(
                (Math.random() - 0.5) * size * 2,
                (Math.random() - 0.5) * size * 0.5,
                (Math.random() - 0.5) * size * 2
            );
            puff.scale.y = 0.4 + Math.random() * 0.3;
            cloud.add(puff);
        }

        cloud.position.set(
            (Math.random() - 0.5) * 20000,
            300 + Math.random() * 1500,
            (Math.random() - 0.5) * 20000
        );
        scene.add(cloud);
        clouds.push(cloud);
    }
}

// ============================================================
// OCEAN / WATER
// ============================================================

function createOcean() {
    const waterGeo = new THREE.PlaneGeometry(100000, 100000, 100, 100);
    const waterMat = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            waterColor: { value: new THREE.Color(0x006688) },
            foamColor: { value: new THREE.Color(0x88ccff) }
        },
        vertexShader: [
            'uniform float time;',
            'varying vec2 vUv;',
            'varying float vElevation;',
            'void main() {',
            '  vUv = uv;',
            '  vec3 pos = position;',
            '  float wave1 = sin(pos.x * 0.01 + time) * 3.0;',
            '  float wave2 = sin(pos.y * 0.015 + time * 0.7) * 2.0;',
            '  float wave3 = sin((pos.x + pos.y) * 0.008 + time * 1.3) * 4.0;',
            '  pos.z = wave1 + wave2 + wave3;',
            '  vElevation = pos.z;',
            '  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);',
            '}'
        ].join('\n'),
        fragmentShader: [
            'uniform vec3 waterColor;',
            'uniform vec3 foamColor;',
            'varying vec2 vUv;',
            'varying float vElevation;',
            'void main() {',
            '  float foam = smoothstep(2.0, 4.0, vElevation);',
            '  vec3 color = mix(waterColor, foamColor, foam * 0.3);',
            '  gl_FragColor = vec4(color, 0.9);',
            '}'
        ].join('\n'),
        transparent: true
    });
    waterMat.userData = { isWater: true };

    const water = new THREE.Mesh(waterGeo, waterMat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = -2;
    scene.add(water);
}

// ============================================================
// GOLDEN GATE BRIDGE
// ============================================================

function createGoldenGateBridge() {
    const bridge = new THREE.Group();
    const redMat = new THREE.MeshPhongMaterial({ color: 0xCC4422, flatShading: false });
    const cableMat = new THREE.MeshPhongMaterial({ color: 0x993322 });
    const roadMat = new THREE.MeshPhongMaterial({ color: 0x333333 });

    // Two main towers
    for (let i = 0; i < 2; i++) {
        const x = i === 0 ? -200 : 200;

        // Tower legs
        for (let leg = -1; leg <= 1; leg += 2) {
            const legGeo = new THREE.BoxGeometry(8, 230, 12);
            const legMesh = new THREE.Mesh(legGeo, redMat);
            legMesh.position.set(x, 115, leg * 12);
            legMesh.castShadow = true;
            bridge.add(legMesh);
        }

        // Cross beams
        for (let h = 0; h < 4; h++) {
            const beam = new THREE.Mesh(
                new THREE.BoxGeometry(8, 6, 30),
                redMat
            );
            beam.position.set(x, 40 + h * 55, 0);
            bridge.add(beam);
        }

        // Tower top
        const top = new THREE.Mesh(
            new THREE.BoxGeometry(12, 15, 30),
            redMat
        );
        top.position.set(x, 235, 0);
        bridge.add(top);
    }

    // Road deck
    const road = new THREE.Mesh(
        new THREE.BoxGeometry(600, 4, 30),
        roadMat
    );
    road.position.set(0, 65, 0);
    road.castShadow = true;
    road.receiveShadow = true;
    bridge.add(road);

    // Road lines
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    for (let i = -290; i <= 290; i += 20) {
        const line = new THREE.Mesh(
            new THREE.BoxGeometry(8, 0.5, 0.5),
            lineMat
        );
        line.position.set(i, 67.5, 0);
        bridge.add(line);
    }

    // Suspension cables (main cables)
    for (let side = -1; side <= 1; side += 2) {
        const cablePoints = [];
        for (let t = 0; t <= 50; t++) {
            const x = -300 + t * 12;
            let y;
            if (x < -200) {
                y = 65 + (230 - 65) * (1 - (x + 200) / -100);
            } else if (x > 200) {
                y = 65 + (230 - 65) * ((x - 200) / 100);
            } else {
                // Catenary curve
                const norm = x / 200;
                y = 120 + norm * norm * 110;
            }
            cablePoints.push(new THREE.Vector3(x, y, side * 14));
        }
        const cableCurve = new THREE.CatmullRomCurve3(cablePoints);
        const cableTube = new THREE.TubeGeometry(cableCurve, 64, 1.2, 8, false);
        const cable = new THREE.Mesh(cableTube, cableMat);
        bridge.add(cable);

        // Vertical suspender cables
        for (let i = -180; i <= 180; i += 20) {
            const norm = i / 200;
            const topY = 120 + norm * norm * 110;
            const suspender = new THREE.Mesh(
                new THREE.CylinderGeometry(0.3, 0.3, topY - 67, 4),
                cableMat
            );
            suspender.position.set(i, 67 + (topY - 67) / 2, side * 14);
            bridge.add(suspender);
        }
    }

    // Side barriers
    const barrierMat = new THREE.MeshPhongMaterial({ color: 0xCC4422 });
    for (let side = -1; side <= 1; side += 2) {
        const barrier = new THREE.Mesh(
            new THREE.BoxGeometry(600, 3, 1),
            barrierMat
        );
        barrier.position.set(0, 68.5, side * 15);
        bridge.add(barrier);
    }

    bridge.position.set(-100, 0, 0);
    scene.add(bridge);

    // Add a glow ring around the bridge for visual flair
    const glowRing = new THREE.Mesh(
        new THREE.TorusGeometry(350, 2, 8, 64),
        new THREE.MeshBasicMaterial({ color: 0xff6633, transparent: true, opacity: 0.15 })
    );
    glowRing.position.set(-100, 150, 0);
    glowRing.rotation.x = Math.PI / 2;
    scene.add(glowRing);
}

// ============================================================
// SAN FRANCISCO SKYLINE
// ============================================================

function createSanFranciscoSkyline() {
    const buildingMat = new THREE.MeshPhongMaterial({ color: 0x556677, flatShading: true });
    const glassMat = new THREE.MeshPhongMaterial({ color: 0x88aacc, emissive: 0x112233, flatShading: true });
    const concreteMat = new THREE.MeshPhongMaterial({ color: 0x667766 });

    // Transamerica Pyramid
    const pyramidGeo = new THREE.ConeGeometry(15, 200, 4);
    const pyramid = new THREE.Mesh(pyramidGeo, glassMat);
    pyramid.position.set(500, 100, 300);
    pyramid.castShadow = true;
    scene.add(pyramid);

    // Salesforce Tower
    const salesforceGeo = new THREE.CylinderGeometry(12, 14, 280, 8);
    const salesforce = new THREE.Mesh(salesforceGeo, glassMat.clone());
    salesforce.material.color.setHex(0x99bbdd);
    salesforce.position.set(550, 140, 350);
    salesforce.castShadow = true;
    scene.add(salesforce);

    // Downtown buildings cluster
    for (let i = 0; i < 60; i++) {
        const w = 10 + Math.random() * 25;
        const h = 30 + Math.random() * 150;
        const d = 10 + Math.random() * 25;
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(w, h, d),
            Math.random() > 0.5 ? buildingMat : glassMat
        );
        building.position.set(
            400 + Math.random() * 400,
            h / 2,
            200 + Math.random() * 400
        );
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
    }

    // Hills
    for (let i = 0; i < 15; i++) {
        const hillSize = 50 + Math.random() * 150;
        const hill = new THREE.Mesh(
            new THREE.SphereGeometry(hillSize, 12, 8),
            new THREE.MeshPhongMaterial({
                color: new THREE.Color().setHSL(0.25 + Math.random() * 0.1, 0.4, 0.35),
                flatShading: true
            })
        );
        hill.scale.y = 0.3 + Math.random() * 0.3;
        hill.position.set(
            200 + Math.random() * 1000,
            -10,
            -200 + Math.random() * 800
        );
        scene.add(hill);
    }

    // Pier buildings
    for (let i = 0; i < 8; i++) {
        const pier = new THREE.Mesh(
            new THREE.BoxGeometry(40, 10, 15),
            concreteMat
        );
        pier.position.set(150 + i * 60, 5, -80);
        scene.add(pier);
    }

    // Add some trees on hills
    createTrees(300, 800, 0, 600, 80);
}

function createTrees(minX, maxX, minZ, maxZ, count) {
    const trunkMat = new THREE.MeshPhongMaterial({ color: 0x554433 });
    const leafMat = new THREE.MeshPhongMaterial({ color: 0x228833, flatShading: true });

    for (let i = 0; i < count; i++) {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(
            new THREE.CylinderGeometry(0.5, 1, 8, 6),
            trunkMat
        );
        trunk.position.y = 4;
        tree.add(trunk);

        const foliage = new THREE.Mesh(
            new THREE.ConeGeometry(4 + Math.random() * 3, 12 + Math.random() * 6, 6),
            leafMat
        );
        foliage.position.y = 12;
        tree.add(foliage);

        tree.position.set(
            minX + Math.random() * (maxX - minX),
            0,
            minZ + Math.random() * (maxZ - minZ)
        );
        tree.scale.setScalar(0.8 + Math.random() * 0.8);
        scene.add(tree);
    }
}

// ============================================================
// ALCATRAZ
// ============================================================

function createAlcatraz() {
    const island = new THREE.Group();

    // Island base
    const base = new THREE.Mesh(
        new THREE.CylinderGeometry(40, 55, 20, 8),
        new THREE.MeshPhongMaterial({ color: 0x887755, flatShading: true })
    );
    base.position.y = 5;
    island.add(base);

    // Main building
    const building = new THREE.Mesh(
        new THREE.BoxGeometry(35, 15, 20),
        new THREE.MeshPhongMaterial({ color: 0xbbaa88 })
    );
    building.position.y = 22;
    island.add(building);

    // Lighthouse
    const lighthouse = new THREE.Mesh(
        new THREE.CylinderGeometry(3, 4, 25, 8),
        new THREE.MeshPhongMaterial({ color: 0xeeeeee })
    );
    lighthouse.position.set(10, 27, 5);
    island.add(lighthouse);

    const light = new THREE.PointLight(0xffff00, 2, 200);
    light.position.set(10, 42, 5);
    island.add(light);

    island.position.set(300, 0, -200);
    scene.add(island);
}

// ============================================================
// HELICOPTER
// ============================================================

function createHelicopter() {
    heliGroup = new THREE.Group();

    // Fuselage
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0x222233, flatShading: true });
    const accentMat = new THREE.MeshPhongMaterial({ color: 0x00ccaa });
    const glassMat = new THREE.MeshPhongMaterial({
        color: 0x88ccff, transparent: true, opacity: 0.4,
        emissive: 0x224466, emissiveIntensity: 0.3
    });

    // Main body
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(3, 2, 6),
        bodyMat
    );
    body.castShadow = true;
    heliGroup.add(body);

    // Nose
    const nose = new THREE.Mesh(
        new THREE.ConeGeometry(1.2, 3, 6),
        bodyMat
    );
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 4.5;
    heliGroup.add(nose);

    // Cockpit glass
    const cockpit = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 8, 6),
        glassMat
    );
    cockpit.scale.set(1, 0.8, 1.2);
    cockpit.position.set(0, 0.8, 2);
    heliGroup.add(cockpit);

    // Tail boom
    const tail = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.8, 6),
        bodyMat
    );
    tail.position.set(0, 0.2, -5.5);
    heliGroup.add(tail);

    // Tail fin (vertical)
    const tailFin = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 2.5, 1.5),
        accentMat
    );
    tailFin.position.set(0, 1.2, -8);
    heliGroup.add(tailFin);

    // Tail fin (horizontal)
    const tailFinH = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.3, 1),
        accentMat
    );
    tailFinH.position.set(0, 1.8, -8);
    heliGroup.add(tailFinH);

    // Main rotor mast
    const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.2, 1.5, 6),
        new THREE.MeshPhongMaterial({ color: 0x444444 })
    );
    mast.position.set(0, 1.8, 0);
    heliGroup.add(mast);

    // Main rotor blades
    rotorTop = new THREE.Group();
    const bladeMat = new THREE.MeshPhongMaterial({ color: 0x555555 });
    for (let i = 0; i < 4; i++) {
        const blade = new THREE.Mesh(
            new THREE.BoxGeometry(12, 0.15, 0.6),
            bladeMat
        );
        blade.rotation.y = (i * Math.PI) / 2;
        rotorTop.add(blade);
    }
    // Rotor disc (transparent for spinning effect)
    const rotorDisc = new THREE.Mesh(
        new THREE.CircleGeometry(6, 32),
        new THREE.MeshBasicMaterial({ color: 0x88aacc, transparent: true, opacity: 0.1, side: THREE.DoubleSide })
    );
    rotorDisc.rotation.x = -Math.PI / 2;
    rotorTop.add(rotorDisc);

    rotorTop.position.set(0, 2.5, 0);
    heliGroup.add(rotorTop);

    // Tail rotor
    rotorTail = new THREE.Group();
    for (let i = 0; i < 2; i++) {
        const blade = new THREE.Mesh(
            new THREE.BoxGeometry(0.15, 2.5, 0.3),
            bladeMat
        );
        blade.rotation.z = (i * Math.PI) / 2;
        rotorTail.add(blade);
    }
    rotorTail.position.set(0.6, 1.2, -8.3);
    heliGroup.add(rotorTail);

    // Landing skids
    const skidMat = new THREE.MeshPhongMaterial({ color: 0x333344 });
    for (let side = -1; side <= 1; side += 2) {
        // Skid tube
        const skid = new THREE.Mesh(
            new THREE.BoxGeometry(0.2, 0.2, 5),
            skidMat
        );
        skid.position.set(side * 1.5, -1.5, 0.5);
        heliGroup.add(skid);

        // Skid struts
        for (let s = -1; s <= 1; s += 2) {
            const strut = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 1, 0.15),
                skidMat
            );
            strut.position.set(side * 1.5, -1, s * 1.5);
            heliGroup.add(strut);
        }
    }

    // Navigation lights
    const redLight = new THREE.PointLight(0xff0000, 0.5, 20);
    redLight.position.set(-2, 0, 0);
    heliGroup.add(redLight);
    const greenLight = new THREE.PointLight(0x00ff00, 0.5, 20);
    greenLight.position.set(2, 0, 0);
    heliGroup.add(greenLight);

    // Strobe light
    const strobe = new THREE.PointLight(0xffffff, 1, 50);
    strobe.position.set(0, -1.5, -2);
    strobe.userData = { isStrobe: true, timer: 0 };
    heliGroup.add(strobe);

    // Searchlight
    const searchlight = new THREE.SpotLight(0xffffcc, 2, 500, 0.3, 0.5);
    searchlight.position.set(0, -1.5, 2);
    searchlight.target.position.set(0, -100, 20);
    heliGroup.add(searchlight);
    heliGroup.add(searchlight.target);

    // Accent stripes
    const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(3.1, 0.3, 6.1),
        accentMat
    );
    stripe.position.y = 0;
    heliGroup.add(stripe);

    heliGroup.position.copy(heli.pos);
    scene.add(heliGroup);
}

// ============================================================
// CHECKPOINT RINGS
// ============================================================

function createCheckpointRings() {
    waypoints.forEach(function(wp, idx) {
        const ringGroup = new THREE.Group();

        // Outer ring
        var ringColor;
        switch(wp.type) {
            case 'landmark': ringColor = 0xff8844; break;
            case 'mountain': ringColor = 0x44ff88; break;
            case 'city': ringColor = 0x8844ff; break;
            case 'ocean': ringColor = 0x4488ff; break;
            case 'destination': ringColor = 0xffcc00; break;
            default: ringColor = 0x00ffcc;
        }

        const ring = new THREE.Mesh(
            new THREE.TorusGeometry(wp.radius * 0.3, 3, 8, 32),
            new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.6 })
        );
        ring.rotation.y = Math.PI / 4;
        ringGroup.add(ring);

        // Inner glow ring
        const innerRing = new THREE.Mesh(
            new THREE.TorusGeometry(wp.radius * 0.3 - 5, 1, 8, 32),
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 })
        );
        innerRing.rotation.y = Math.PI / 4;
        ringGroup.add(innerRing);

        // Marker beacon
        const beacon = new THREE.Mesh(
            new THREE.SphereGeometry(5, 8, 8),
            new THREE.MeshBasicMaterial({ color: ringColor })
        );
        beacon.position.y = wp.radius * 0.3 + 10;
        ringGroup.add(beacon);

        // Point light
        const light = new THREE.PointLight(ringColor, 1, wp.radius);
        ringGroup.add(light);

        ringGroup.position.copy(wp.pos);
        ringGroup.userData = { waypointIndex: idx, baseY: wp.pos.y, color: ringColor };
        scene.add(ringGroup);
        checkpointRings.push(ringGroup);
    });
}

// ============================================================
// TERRAIN GENERATION (Procedural along route)
// ============================================================

function generateTerrainChunk(chunkX, chunkZ) {
    const key = chunkX + ',' + chunkZ;
    if (terrainChunks.has(key)) return;

    const chunkSize = 2000;
    const detail = 20;
    const geo = new THREE.PlaneGeometry(chunkSize, chunkSize, detail, detail);

    const distFromStart = Math.sqrt(chunkX * chunkX + chunkZ * chunkZ) * chunkSize;
    const progress = distFromStart / (TOTAL_DISTANCE * WORLD_SCALE);

    // Determine terrain type based on progress
    var terrainColor, maxHeight;
    if (progress < 0.05) {
        terrainColor = new THREE.Color(0x447744);
        maxHeight = 40;
    } else if (progress < 0.15) {
        terrainColor = new THREE.Color(0x556644);
        maxHeight = 120;
    } else if (progress < 0.25) {
        terrainColor = new THREE.Color(0x666655);
        maxHeight = 200;
    } else if (progress < 0.4) {
        terrainColor = new THREE.Color(0x668844);
        maxHeight = 20;
    } else if (progress < 0.5) {
        terrainColor = new THREE.Color(0x557755);
        maxHeight = 60;
    } else {
        terrainChunks.set(key, null);
        return;
    }

    const positions = geo.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i] + chunkX * chunkSize;
        const y = positions[i + 1] + chunkZ * chunkSize;
        const noise = Math.sin(x * 0.003) * Math.cos(y * 0.003) * maxHeight +
                     Math.sin(x * 0.01 + y * 0.01) * maxHeight * 0.3 +
                     Math.sin(x * 0.05) * Math.cos(y * 0.05) * maxHeight * 0.1;
        positions[i + 2] = Math.max(noise, 0);
    }
    geo.computeVertexNormals();

    const mat = new THREE.MeshPhongMaterial({
        color: terrainColor,
        flatShading: true,
        side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(chunkX * chunkSize, 0, chunkZ * chunkSize);
    mesh.receiveShadow = true;
    scene.add(mesh);
    terrainChunks.set(key, mesh);

    addChunkFeatures(chunkX, chunkZ, chunkSize, progress);
}

function addChunkFeatures(chunkX, chunkZ, chunkSize, progress) {
    const baseX = chunkX * chunkSize;
    const baseZ = chunkZ * chunkSize;

    if (progress < 0.5 && progress > 0.05) {
        const treeCount = Math.floor(Math.random() * 10);
        for (let i = 0; i < treeCount; i++) {
            const tree = createSimpleTree();
            tree.position.set(
                baseX + (Math.random() - 0.5) * chunkSize,
                0,
                baseZ + (Math.random() - 0.5) * chunkSize
            );
            scene.add(tree);
            worldObjects.push(tree);
        }
    }

    if (progress > 0.3 && progress < 0.35) {
        const buildCount = Math.floor(Math.random() * 5);
        for (let i = 0; i < buildCount; i++) {
            const h = 20 + Math.random() * 100;
            const building = new THREE.Mesh(
                new THREE.BoxGeometry(8 + Math.random() * 15, h, 8 + Math.random() * 15),
                new THREE.MeshPhongMaterial({
                    color: new THREE.Color().setHSL(0.55 + Math.random() * 0.1, 0.2, 0.4 + Math.random() * 0.2),
                    flatShading: true
                })
            );
            building.position.set(
                baseX + (Math.random() - 0.5) * chunkSize,
                h / 2,
                baseZ + (Math.random() - 0.5) * chunkSize
            );
            building.castShadow = true;
            scene.add(building);
            worldObjects.push(building);
        }
    }
}

function createSimpleTree() {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.3, 0.5, 5, 5),
        new THREE.MeshPhongMaterial({ color: 0x553311 })
    );
    trunk.position.y = 2.5;
    tree.add(trunk);

    const foliage = new THREE.Mesh(
        new THREE.ConeGeometry(3, 8, 6),
        new THREE.MeshPhongMaterial({ color: 0x226622, flatShading: true })
    );
    foliage.position.y = 8;
    tree.add(foliage);
    return tree;
}

function updateTerrain() {
    const chunkSize = 2000;
    const cx = Math.floor(heli.pos.x / chunkSize);
    const cz = Math.floor(heli.pos.z / chunkSize);
    const range = 3;

    for (let dx = -range; dx <= range; dx++) {
        for (let dz = -range; dz <= range; dz++) {
            generateTerrainChunk(cx + dx, cz + dz);
        }
    }

    // Remove distant chunks
    for (const [key, mesh] of terrainChunks) {
        if (!mesh) continue;
        const parts = key.split(',');
        const kx = Number(parts[0]);
        const kz = Number(parts[1]);
        if (Math.abs(kx - cx) > range + 2 || Math.abs(kz - cz) > range + 2) {
            scene.remove(mesh);
            mesh.geometry.dispose();
            mesh.material.dispose();
            terrainChunks.delete(key);
        }
    }
}

// ============================================================
// DYNAMIC CLOUDS ALONG ROUTE
// ============================================================

function updateDynamicClouds() {
    clouds.forEach(function(cloud) {
        const dx = cloud.position.x - heli.pos.x;
        const dz = cloud.position.z - heli.pos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        if (dist > 15000) {
            cloud.position.x = heli.pos.x + (Math.random() - 0.5) * 20000;
            cloud.position.z = heli.pos.z + (Math.random() - 0.5) * 20000;
            cloud.position.y = 300 + Math.random() * 1500;
        }

        cloud.position.x += 0.1;
        cloud.position.z += 0.05;
    });
}

// ============================================================
// MINIMAP
// ============================================================

function setupMinimap() {
    const container = document.querySelector('.minimap');
    if (!container) return;
    minimapCanvas = document.createElement('canvas');
    minimapCanvas.width = 180;
    minimapCanvas.height = 120;
    container.appendChild(minimapCanvas);
    minimapCtx = minimapCanvas.getContext('2d');
}

function updateMinimap() {
    if (!minimapCtx) return;
    const ctx = minimapCtx;
    const w = 180, h = 120;

    ctx.fillStyle = '#0a1020';
    ctx.fillRect(0, 0, w, h);

    // Draw route line
    ctx.strokeStyle = '#334';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, h - 10);
    ctx.lineTo(w - 10, 10);
    ctx.stroke();

    // Draw waypoints
    waypoints.forEach(function(wp, idx) {
        var progress = idx / (waypoints.length - 1);
        var x = 10 + progress * (w - 20);
        var y = (h - 10) - progress * (h - 20);

        ctx.beginPath();
        ctx.arc(x, y, wp.reached ? 3 : 2, 0, Math.PI * 2);
        ctx.fillStyle = wp.reached ? '#00ffcc' : '#445';
        ctx.fill();
    });

    // Draw helicopter position
    var heliProgress = distanceTraveled / (TOTAL_DISTANCE * WORLD_SCALE);
    var hx = 10 + Math.min(heliProgress, 1) * (w - 20);
    var hy = (h - 10) - Math.min(heliProgress, 1) * (h - 20);

    ctx.beginPath();
    ctx.arc(hx, hy, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ff4444';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(hx, hy, 6, 0, Math.PI * 2);
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 1;
    ctx.stroke();
}

// ============================================================
// AUDIO
// ============================================================

function initAudio() {
    if (audioStarted) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioStarted = true;

    // Rotor sound
    rotorOscillator = audioCtx.createOscillator();
    var rotorGain = audioCtx.createGain();
    rotorOscillator.type = 'sawtooth';
    rotorOscillator.frequency.value = 20;
    rotorGain.gain.value = 0.04;
    rotorOscillator.connect(rotorGain);
    rotorGain.connect(audioCtx.destination);
    rotorOscillator.start();
    rotorOscillator.userData = { gain: rotorGain };

    // Engine sound
    engineOscillator = audioCtx.createOscillator();
    var engineGain = audioCtx.createGain();
    engineOscillator.type = 'triangle';
    engineOscillator.frequency.value = 80;
    engineGain.gain.value = 0.02;
    engineOscillator.connect(engineGain);
    engineGain.connect(audioCtx.destination);
    engineOscillator.start();
    engineOscillator.userData = { gain: engineGain };
}

function updateAudio() {
    if (!audioStarted || !audioCtx) return;
    var speedRatio = heli.speed / modeSettings[gameMode].maxSpeed;
    var throttleRatio = heli.throttle;

    if (rotorOscillator) {
        rotorOscillator.frequency.value = 18 + throttleRatio * 15 + speedRatio * 10;
        rotorOscillator.userData.gain.gain.value = 0.02 + throttleRatio * 0.04;
    }
    if (engineOscillator) {
        engineOscillator.frequency.value = 60 + speedRatio * 80 + throttleRatio * 40;
        engineOscillator.userData.gain.gain.value = 0.01 + speedRatio * 0.03;
    }
}

function playCheckpointSound() {
    if (!audioCtx) return;
    var osc = audioCtx.createOscillator();
    var gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.5);

    setTimeout(function() {
        var osc2 = audioCtx.createOscillator();
        var gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.value = 1320;
        gain2.gain.value = 0.12;
        gain2.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start();
        osc2.stop(audioCtx.currentTime + 0.4);
    }, 150);
}

// ============================================================
// CONTROLS & PHYSICS
// ============================================================

function handleControls(dt) {
    var settings = modeSettings[gameMode];
    var accel = settings.accel;
    var maxSpeed = settings.maxSpeed;

    // Toggle fast mode
    if (keys['Space'] && !prevKeys['Space']) {
        heli.fastMode = !heli.fastMode;
        document.getElementById('fast-mode-ind').style.display = heli.fastMode ? 'block' : 'none';
        if (heli.fastMode) {
            showMessage('FAST MODE ENGAGED', 1500);
            score += 50;
        }
    }

    // Camera toggle
    if (keys['KeyC'] && !prevKeys['KeyC']) {
        cameraMode = (cameraMode + 1) % 3;
        var camNames = ['CHASE CAM', 'COCKPIT', 'CINEMATIC'];
        showMessage(camNames[cameraMode], 800);
    }

    // Reset position
    if (keys['KeyR'] && !prevKeys['KeyR']) {
        var wp = waypoints[currentWaypointIndex] || waypoints[0];
        heli.pos.copy(wp.pos);
        heli.pos.y = wp.pos.y + 50;
        heli.speed = 50;
        showMessage('POSITION RESET', 1000);
    }

    // Pitch (up/down arrows)
    if (keys['ArrowUp']) {
        heli.pitch = Math.max(heli.pitch - 2.0 * dt, -0.5);
        heli.throttle = Math.min(heli.throttle + 0.5 * dt, 1);
    } else if (keys['ArrowDown']) {
        heli.pitch = Math.min(heli.pitch + 2.0 * dt, 0.5);
        heli.throttle = Math.max(heli.throttle - 0.3 * dt, 0.05);
    } else {
        heli.pitch *= 0.95;
    }

    // Roll / Bank (left/right arrows)
    if (keys['ArrowLeft']) {
        heli.roll = Math.max(heli.roll - 2.5 * dt, -0.7);
        heli.heading -= 60 * dt;
    } else if (keys['ArrowRight']) {
        heli.roll = Math.min(heli.roll + 2.5 * dt, 0.7);
        heli.heading += 60 * dt;
    } else {
        heli.roll *= 0.93;
    }

    // Yaw (A/D)
    if (keys['KeyA']) {
        heli.yaw -= 45 * dt;
        heli.heading -= 30 * dt;
    }
    if (keys['KeyD']) {
        heli.yaw += 45 * dt;
        heli.heading += 30 * dt;
    }

    // Altitude (W/S)
    if (keys['KeyW']) {
        heli.targetAltitude += 200 * dt;
        heli.throttle = Math.min(heli.throttle + 0.3 * dt, 1);
    }
    if (keys['KeyS']) {
        heli.targetAltitude -= 200 * dt;
    }

    // Boost (Shift)
    heli.boost = keys['ShiftLeft'] || keys['ShiftRight'];

    // Normalize heading
    if (heli.heading < 0) heli.heading += 360;
    if (heli.heading >= 360) heli.heading -= 360;

    // Clamp altitude
    heli.targetAltitude = Math.max(20, Math.min(heli.targetAltitude, 5000));

    // Speed calculation
    var targetSpeed = heli.throttle * maxSpeed;
    if (heli.boost) targetSpeed *= 1.5;
    if (heli.fastMode) targetSpeed *= 2;
    if (heli.pitch < -0.1) targetSpeed *= 1.3;

    heli.speed += (targetSpeed - heli.speed) * accel * dt;
    heli.speed = Math.max(0, Math.min(heli.speed, maxSpeed * (heli.boost ? 1.5 : 1) * (heli.fastMode ? 2 : 1)));

    // Track max speed
    if (heli.speed > maxSpeedReached) maxSpeedReached = heli.speed;

    // Movement
    var headingRad = heli.heading * DEG;
    var moveSpeed = heli.speed * WORLD_SCALE * dt * 0.01;
    var speedMultiplier = heli.fastMode ? 3 : 1;

    heli.vel.x = Math.sin(headingRad) * moveSpeed * speedMultiplier;
    heli.vel.z = -Math.cos(headingRad) * moveSpeed * speedMultiplier;

    heli.pos.x += heli.vel.x;
    heli.pos.z += heli.vel.z;

    // Smooth altitude change
    heli.altitude += (heli.targetAltitude - heli.altitude) * 2 * dt;
    heli.pos.y += (heli.altitude * 0.15 - heli.pos.y) * 3 * dt;
    heli.pos.y = Math.max(5, heli.pos.y);

    // Distance tracking
    distanceTraveled += Math.sqrt(heli.vel.x * heli.vel.x + heli.vel.z * heli.vel.z);

    // Store previous keys
    prevKeys = {};
    for (var k in keys) {
        prevKeys[k] = keys[k];
    }
}

// ============================================================
// HELICOPTER VISUAL UPDATE
// ============================================================

function updateHelicopter(dt) {
    if (!heliGroup) return;

    heliGroup.position.copy(heli.pos);
    heliGroup.rotation.set(
        heli.pitch * 0.5,
        heli.heading * DEG + Math.PI,
        -heli.roll * 0.5,
        'YXZ'
    );

    // Rotor spin
    var rotorSpeed = 15 + heli.throttle * 25;
    if (rotorTop) rotorTop.rotation.y += rotorSpeed * dt;
    if (rotorTail) rotorTail.rotation.x += rotorSpeed * 1.5 * dt;

    // Strobe light
    heliGroup.children.forEach(function(child) {
        if (child.isPointLight && child.userData.isStrobe) {
            child.userData.timer += dt;
            child.intensity = Math.sin(child.userData.timer * 8) > 0.8 ? 3 : 0;
        }
    });

    // Slight hover oscillation
    heliGroup.position.y += Math.sin(flightTime * 2) * 0.3;
}

// ============================================================
// CAMERA
// ============================================================

function updateCamera(dt) {
    var headingRad = heli.heading * DEG;

    switch(cameraMode) {
        case 0: // Chase cam
            var chaseDistance = 25 + heli.speed * 0.02;
            var chaseHeight = 8 + heli.speed * 0.01;
            var targetCamPos = new THREE.Vector3(
                heli.pos.x - Math.sin(headingRad) * chaseDistance,
                heli.pos.y + chaseHeight,
                heli.pos.z + Math.cos(headingRad) * chaseDistance
            );
            camera.position.lerp(targetCamPos, 4 * dt);
            camera.lookAt(
                heli.pos.x + Math.sin(headingRad) * 10,
                heli.pos.y,
                heli.pos.z - Math.cos(headingRad) * 10
            );
            break;

        case 1: // Cockpit
            camera.position.set(
                heli.pos.x + Math.sin(headingRad) * 2,
                heli.pos.y + 1.5,
                heli.pos.z - Math.cos(headingRad) * 2
            );
            camera.lookAt(
                heli.pos.x + Math.sin(headingRad) * 100,
                heli.pos.y - 2,
                heli.pos.z - Math.cos(headingRad) * 100
            );
            break;

        case 2: // Cinematic
            var cinTime = flightTime * 0.1;
            var cinDist = 40;
            var targetCinPos = new THREE.Vector3(
                heli.pos.x + Math.sin(cinTime) * cinDist,
                heli.pos.y + 15 + Math.sin(cinTime * 0.5) * 5,
                heli.pos.z + Math.cos(cinTime) * cinDist
            );
            camera.position.lerp(targetCinPos, 2 * dt);
            camera.lookAt(heli.pos);
            break;
    }

    // Camera shake at high speed
    if (heli.speed > 200) {
        var shake = (heli.speed - 200) * 0.0002;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
    }
}

// ============================================================
// SCORING & WAYPOINTS
// ============================================================

function updateScoring(dt) {
    // Base flight score
    if (heli.speed > 10) {
        score += heli.speed * 0.01 * dt * scoreMultiplier;
    }

    // Speed bonus
    if (heli.speed > 300) {
        score += 5 * dt;
    }
    if (heli.speed > 600) {
        score += 15 * dt;
    }

    // Altitude bonus
    if (heli.altitude > 2000) {
        score += 3 * dt;
    }

    // Combo timer
    if (comboTimer > 0) {
        comboTimer -= dt;
        if (comboTimer <= 0) {
            comboCount = 0;
            scoreMultiplier = 1;
        }
    }

    // Low altitude flying bonus (risky)
    if (heli.altitude < 100 && heli.speed > 100) {
        score += 10 * dt;
        if (Math.random() < 0.01) {
            showMessage('LOW ALTITUDE BONUS +10', 600);
        }
    }

    // Check waypoints
    checkWaypoints();

    // Update HUD
    updateHUD();
}

function checkWaypoints() {
    waypoints.forEach(function(wp, idx) {
        if (wp.reached) return;

        var dx = heli.pos.x - wp.pos.x;
        var dy = heli.pos.y - wp.pos.y;
        var dz = heli.pos.z - wp.pos.z;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < wp.radius) {
            wp.reached = true;
            checkpointsHit++;

            // Score
            comboCount++;
            comboTimer = 10;
            scoreMultiplier = 1 + comboCount * 0.5;
            var points = wp.points * scoreMultiplier;
            score += points;

            // Effects
            showMessage(wp.name + ' +' + Math.floor(points), 2000);
            flashCheckpoint();
            playCheckpointSound();

            // Update checkpoint ring visual
            if (checkpointRings[idx]) {
                checkpointRings[idx].children.forEach(function(child) {
                    if (child.material) {
                        child.material.color.setHex(0x00ff00);
                        child.material.opacity = 0.3;
                    }
                });
            }

            // Move to next waypoint
            if (idx >= currentWaypointIndex) {
                currentWaypointIndex = idx + 1;
            }

            // Check if destination reached
            if (wp.type === 'destination') {
                endGame();
            }
        }
    });
}

// ============================================================
// HUD UPDATE
// ============================================================

function updateHUD() {
    document.getElementById('speed-val').textContent = Math.floor(heli.speed);
    document.getElementById('alt-val').textContent = Math.floor(heli.altitude);
    document.getElementById('heading-val').textContent = Math.floor(heli.heading).toString().padStart(3, '0') + '\u00B0';
    document.getElementById('score-val').textContent = Math.floor(score).toLocaleString();

    // Distance to destination
    var distToLondon = waypoints[waypoints.length - 1].pos.distanceTo(heli.pos) / WORLD_SCALE;
    document.getElementById('dist-val').textContent = Math.floor(distToLondon * KM_TO_NM);

    // Altitude bar
    var altPercent = Math.min((heli.altitude / 3000) * 100, 100);
    document.getElementById('alt-bar-fill').style.height = altPercent + '%';

    // Throttle bar
    document.getElementById('throttle-fill').style.height = (heli.throttle * 100) + '%';

    // Progress bar
    var totalDist = waypoints[waypoints.length - 1].pos.length();
    var currentProgress = Math.min(distanceTraveled / totalDist, 1);
    document.getElementById('progress-fill').style.width = (currentProgress * 100) + '%';

    // Compass
    var dirIdx = Math.round(heli.heading / 45) % 8;
    var dirIds = ['dir-w', 'dir-nw', 'dir-n', 'dir-ne', 'dir-e'];
    dirIds.forEach(function(id) {
        document.getElementById(id).className = 'dir';
    });

    var compassMap = { 0: 'dir-n', 1: 'dir-ne', 2: 'dir-e', 6: 'dir-w', 7: 'dir-nw' };
    if (compassMap[dirIdx]) {
        document.getElementById(compassMap[dirIdx]).className = 'dir active';
    }

    // Waypoint indicator
    if (currentWaypointIndex < waypoints.length) {
        var wp = waypoints[currentWaypointIndex];
        var distToWP = wp.pos.distanceTo(heli.pos) / WORLD_SCALE * KM_TO_NM;
        document.getElementById('waypoint-text').textContent =
            wp.name + ' - ' + distToWP.toFixed(1) + ' NM';
    } else {
        document.getElementById('waypoint-text').textContent = 'MISSION COMPLETE';
    }

    // Low altitude warning
    var warning = document.getElementById('alt-warning');
    if (heli.altitude < 50 && heli.speed > 50) {
        warning.classList.add('show');
    } else {
        warning.classList.remove('show');
    }
}

// ============================================================
// VISUAL EFFECTS
// ============================================================

function showMessage(text, duration) {
    var msg = document.getElementById('game-message');
    msg.textContent = text;
    msg.classList.add('show');
    setTimeout(function() { msg.classList.remove('show'); }, duration || 1500);
}

function flashCheckpoint() {
    var flash = document.getElementById('checkpoint-flash');
    flash.classList.add('active');
    setTimeout(function() { flash.classList.remove('active'); }, 400);
}

function updateCheckpointRings(dt) {
    checkpointRings.forEach(function(ring, idx) {
        if (waypoints[idx].reached) return;

        // Bobbing animation
        ring.position.y = ring.userData.baseY + Math.sin(flightTime * 2 + idx) * 5;

        // Rotate
        ring.children[0].rotation.y += 0.5 * dt;
        ring.children[1].rotation.y -= 0.3 * dt;

        // Pulse scale for next waypoint
        if (idx === currentWaypointIndex) {
            var pulse = 1 + Math.sin(flightTime * 4) * 0.1;
            ring.children[0].scale.setScalar(pulse);
        }
    });
}

// Speed lines effect
function updateSpeedLines() {
    var canvas = document.getElementById('speed-lines');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var speedRatio = heli.speed / modeSettings[gameMode].maxSpeed;
    canvas.style.opacity = Math.min(speedRatio * 0.8, 0.4);

    if (speedRatio > 0.3) {
        var numLines = Math.floor(speedRatio * 30);
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;

        for (var i = 0; i < numLines; i++) {
            var x = Math.random() * canvas.width;
            var y = Math.random() * canvas.height;
            var length = 20 + speedRatio * 80;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - length * 0.5, y + length);
            ctx.stroke();
        }
    }
}

// ============================================================
// WATER ANIMATION
// ============================================================

function updateWater(time) {
    scene.traverse(function(obj) {
        if (obj.material && obj.material.userData && obj.material.userData.isWater) {
            obj.material.uniforms.time.value = time;
        }
    });
}

// ============================================================
// GAME FLOW
// ============================================================

function simulateLoading() {
    var bar = document.getElementById('loading-bar');
    var text = document.getElementById('loading-text');
    var stages = [
        { pct: 15, text: 'LOADING 3D ENGINE...' },
        { pct: 30, text: 'BUILDING SAN FRANCISCO...' },
        { pct: 45, text: 'CONSTRUCTING GOLDEN GATE BRIDGE...' },
        { pct: 60, text: 'GENERATING FLIGHT ROUTE...' },
        { pct: 75, text: 'INITIALIZING HELICOPTER SYSTEMS...' },
        { pct: 90, text: 'CALIBRATING INSTRUMENTS...' },
        { pct: 100, text: 'READY FOR TAKEOFF' }
    ];

    var i = 0;
    var interval = setInterval(function() {
        if (i < stages.length) {
            bar.style.width = stages[i].pct + '%';
            text.textContent = stages[i].text;
            i++;
        } else {
            clearInterval(interval);
            setTimeout(function() {
                document.getElementById('loading-screen').classList.add('fade-out');
                setTimeout(function() {
                    document.getElementById('loading-screen').style.display = 'none';
                    document.getElementById('start-screen').style.display = 'flex';
                }, 1000);
            }, 500);
        }
    }, 400);
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

        heli.pos.set(0, 80, 100);
        heli.heading = 45;
        heli.speed = 50;
        heli.throttle = 0.3;
        heli.altitude = 500;
        heli.targetAltitude = 500;

        showMessage('LIFTOFF!', 2000);
        setTimeout(function() { showMessage('FLY THROUGH CHECKPOINTS', 2000); }, 2500);
    }, 1000);
};

window.restartGame = function() {
    score = 0;
    flightTime = 0;
    distanceTraveled = 0;
    checkpointsHit = 0;
    perfectManeuvers = 0;
    maxSpeedReached = 0;
    scoreMultiplier = 1;
    comboCount = 0;
    comboTimer = 0;
    currentWaypointIndex = 0;
    gameOver = false;

    waypoints.forEach(function(wp) { wp.reached = false; });

    heli.pos.set(0, 80, 100);
    heli.heading = 45;
    heli.speed = 50;
    heli.throttle = 0.3;
    heli.altitude = 500;
    heli.targetAltitude = 500;
    heli.pitch = 0;
    heli.roll = 0;
    heli.yaw = 0;

    checkpointRings.forEach(function(ring) {
        ring.children.forEach(function(child) {
            if (child.material) {
                child.material.color.setHex(ring.userData.color);
                child.material.opacity = 0.6;
            }
        });
    });

    document.getElementById('game-over').style.display = 'none';
    document.getElementById('hud').style.display = 'block';
    gameStarted = true;

    showMessage('LIFTOFF!', 2000);
};

function endGame() {
    gameOver = true;
    gameStarted = false;

    setTimeout(function() {
        document.getElementById('hud').style.display = 'none';
        var gameOverEl = document.getElementById('game-over');
        gameOverEl.style.display = 'flex';
        document.getElementById('final-score').textContent = Math.floor(score).toLocaleString();

        var minutes = Math.floor(flightTime / 60);
        var seconds = Math.floor(flightTime % 60);

        var statsGrid = document.getElementById('stats-grid');
        // Clear existing children safely
        while (statsGrid.firstChild) {
            statsGrid.removeChild(statsGrid.firstChild);
        }

        var statsData = [
            ['Flight Time', minutes + 'm ' + seconds + 's'],
            ['Max Speed', Math.floor(maxSpeedReached) + ' kts'],
            ['Checkpoints', checkpointsHit + '/' + waypoints.length],
            ['Distance', Math.floor(distanceTraveled / WORLD_SCALE) + ' km'],
            ['Mode', modeSettings[gameMode].label],
            ['Best Combo', 'x' + scoreMultiplier.toFixed(1)]
        ];

        statsData.forEach(function(stat) {
            var div = document.createElement('div');
            div.textContent = stat[0] + ': ';
            var span = document.createElement('span');
            span.className = 'stat-val';
            span.textContent = stat[1];
            div.appendChild(span);
            statsGrid.appendChild(div);
        });
    }, 2000);

    showMessage('WELCOME TO LONDON!', 3000);
}

// ============================================================
// PARTICLE EFFECTS
// ============================================================

function createExhaustParticles() {
    if (particles.length > 100) return;
    if (heli.speed < 30) return;

    var headingRad = heli.heading * DEG;
    var particle = new THREE.Mesh(
        new THREE.SphereGeometry(0.3 + Math.random() * 0.5, 4, 4),
        new THREE.MeshBasicMaterial({
            color: 0xccddee,
            transparent: true,
            opacity: 0.4
        })
    );

    particle.position.set(
        heli.pos.x - Math.sin(headingRad) * 4 + (Math.random() - 0.5) * 2,
        heli.pos.y + (Math.random() - 0.5),
        heli.pos.z + Math.cos(headingRad) * 4 + (Math.random() - 0.5) * 2
    );
    particle.userData = {
        life: 1,
        vel: new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            Math.random() * 2,
            (Math.random() - 0.5) * 2
        )
    };

    scene.add(particle);
    particles.push(particle);
}

function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
        var p = particles[i];
        p.userData.life -= dt * 2;
        p.position.add(p.userData.vel.clone().multiplyScalar(dt));
        p.material.opacity = p.userData.life * 0.3;
        p.scale.setScalar(1 + (1 - p.userData.life) * 2);

        if (p.userData.life <= 0) {
            scene.remove(p);
            p.geometry.dispose();
            p.material.dispose();
            particles.splice(i, 1);
        }
    }
}

// ============================================================
// FOG UPDATE BASED ON LOCATION
// ============================================================

function updateFog() {
    var progress = distanceTraveled / (TOTAL_DISTANCE * WORLD_SCALE);

    if (progress > 0.5) {
        scene.fog.color.setHex(0x5588aa);
        scene.fog.density = 0.00005;
    } else if (progress > 0.15 && progress < 0.25) {
        scene.fog.color.setHex(0x99aabb);
        scene.fog.density = 0.00003;
    } else {
        scene.fog.color.setHex(0x87CEEB);
        scene.fog.density = 0.00004;
    }
}

// ============================================================
// MAIN GAME LOOP
// ============================================================

function animate() {
    requestAnimationFrame(animate);

    var dt = Math.min(clock.getDelta(), 0.05);
    var elapsed = clock.getElapsedTime();

    if (gameStarted && !gameOver) {
        flightTime += dt;

        handleControls(dt);
        updateHelicopter(dt);
        updateCamera(dt);
        updateScoring(dt);
        updateTerrain();
        updateDynamicClouds();
        updateCheckpointRings(dt);
        updateWater(elapsed);
        updateAudio();
        updateSpeedLines();
        updateFog();
        updateMinimap();
        createExhaustParticles();
        updateParticles(dt);
    } else {
        // Idle camera rotation for menus
        if (!gameStarted) {
            camera.position.set(
                Math.sin(elapsed * 0.1) * 300,
                100 + Math.sin(elapsed * 0.2) * 30,
                Math.cos(elapsed * 0.1) * 300
            );
            camera.lookAt(0, 50, 0);
        }

        updateWater(elapsed);
    }

    renderer.render(scene, camera);
}

function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================================
// BOOT
// ============================================================

init();
animate();

})();
