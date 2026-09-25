/**
 * Shimotron Rally — every tunable number lives here.
 * Sections: race rules, car physics, car types, AI, camera, and the seven island stages.
 */

export const RACE = {
  roadHalfWidth: 7, // metres from centre line to each edge
  laps: 3,
  opponents: 5,
  sectors: [0.25, 0.5, 0.75], // must pass these before a lap counts
  points: [10, 8, 6, 5, 4, 3], // championship points by position
  finishGrace: 25, // seconds the others may keep racing after the player finishes
  respawnHeight: 0.9,
};

/** Winners' podium: a ceremony for the top three on points every `every` races. */
export const PODIUM = { every: 4 };

/**
 * Career ("מצב מתמשך"): prize money by finishing position, bonuses, and
 * the price of a surprise bought in the garage. Each lap of all the
 * islands raises the rivals one difficulty level and the purses by 25%.
 */
export const CAREER = {
  startMoney: 3000,
  prizes: [6000, 4200, 3000, 2000, 1400, 900],
  fastestLap: 800, // fastest lap of the race
  hit: 250, // per shot or mine that connected
  clean: 400, // no respawns
  itemPrices: { shots: 900, mine: 700, turbo: 600, shield: 800 },
  countdown: 15, // seconds in the garage before the next island loads
};

export const CAR = {
  mass: 1250,
  // Chassis collision boxes (half extents / offsets from the centre of mass).
  body: { half: [0.92, 0.3, 2.12], offset: [0, -0.16, 0] },
  cabin: { half: [0.72, 0.24, 1.05], offset: [0, 0.34, -0.15] },
  wheel: {
    radius: 0.36,
    width: 0.27,
    front: 1.34,
    rear: -1.3,
    track: 0.82, // half distance between left and right wheels
    height: 0.02,
    restLength: 0.32,
    stiffness: 40,
    dampCompression: 4.6,
    dampRelaxation: 3.0,
    travel: 0.26,
    rollInfluence: 0.03,
    grip: 1.6,
  },
  engine: {
    accel: 10.2, // m/s² at low speed
    topSpeed: 63, // m/s (~227 km/h)
    reverseTop: 12,
    frontShare: 0.34, // AWD split, rest to the rear
    gears: [0, 3.1, 2.2, 1.65, 1.28, 1.02, 0.84],
    idleRpm: 900,
    redline: 7800,
  },
  brake: { decel: 13, frontBias: 0.62 }, // m/s² at full pedal
  handbrake: { decel: 5, grip: 0.55 }, // rear wheels only; grip multiplier while held
  // Steering lock shrinks with speed toward the angle that just saturates the tyres.
  steer: { max: 0.56, min: 0.016, gripAngle: 50, rate: 3.4, returnRate: 6 },
  downforce: 0.55, // extra normal load (g) at top speed
  drag: 0.00075, // aerodynamic deceleration per (m/s)²
  rolling: 0.18, // m/s² rolling resistance
  shiftTime: 0.14,
  assist: { yaw: 0.55, antiRoll: 6 }, // stability help (keyboard friendly)
  nitro: { accel: 6.5, topSpeed: 74, drain: 0.26, refill: 0.02, driftRefill: 0.1 },
  flipResetTime: 1.2,
};

/**
 * Car types. `spec` is merged over CAR (physics); `shape` drives the
 * procedural body in CarModel.js. Prices apply in career mode only.
 */
export const CAR_TYPES = [
  {
    id: 'gt',
    name: 'GT ספורט',
    desc: 'מאוזנת: מהירה, יציבה וסלחנית, טובה בכל מסלול',
    price: 0,
    spec: {},
    shape: {},
  },
  {
    id: 'rally',
    name: 'ראלי',
    desc: 'תאוצה חדה, מתלים גבוהים ואחיזה מעולה בחצץ, בחול ובשלג',
    price: 6000,
    spec: {
      mass: 1150,
      body: { half: [0.9, 0.34, 1.95], offset: [0, -0.1, 0] },
      cabin: { half: [0.72, 0.28, 1.1], offset: [0, 0.4, -0.3] },
      wheel: { radius: 0.35, front: 1.25, rear: -1.22, track: 0.8, restLength: 0.38, travel: 0.32, stiffness: 32, dampCompression: 4.2, grip: 1.62 },
      engine: { accel: 11.2, topSpeed: 58, frontShare: 0.5 },
      downforce: 0.35,
      offroad: 1.45,
    },
    shape: { halfL: 2.0, w: 0.84, flare: 0.1, floor: -0.36, belt: 0.14, hoodDrop: 0.12, roof: 0.66, cabin: [0.72, 0.22, -0.95, -1.62], tailLen: 0.12, duck: 0, wing: 'rally', extras: ['lightbar', 'mudflaps'] },
  },
  {
    id: 'muscle',
    name: 'מאסל',
    desc: 'מנוע ענק ומהירות שיא גבוהה, הנעה אחורית — הזנב אוהב לברוח',
    price: 9000,
    spec: {
      mass: 1520,
      body: { half: [0.95, 0.3, 2.32], offset: [0, -0.16, 0] },
      cabin: { half: [0.74, 0.26, 1.0], offset: [0, 0.36, -0.45] },
      wheel: { radius: 0.38, width: 0.3, front: 1.5, rear: -1.4, track: 0.84, grip: 1.55 },
      engine: { accel: 10.4, topSpeed: 67, frontShare: 0.06 },
      handbrake: { grip: 0.45 },
      downforce: 0.25,
      drag: 0.0007,
      offroad: 0.9,
    },
    shape: { halfL: 2.4, w: 0.9, flare: 0.05, belt: 0.15, hoodDrop: 0.08, roof: 0.58, cabin: [0.3, -0.25, -0.85, -1.55], cabinW: 0.8, duck: 0.07, wing: 'none', lights: 'round', extras: ['hoodScoop'] },
  },
  {
    id: 'buggy',
    name: 'באגי שטח',
    desc: 'גלגלים ענקיים וכלוב גלגול: לא מפחד מחול ודשא, איטי יותר על אספלט',
    price: 7000,
    spec: {
      mass: 900,
      body: { half: [0.9, 0.32, 1.7], offset: [0, -0.02, 0] },
      cabin: { half: [0.62, 0.3, 0.72], offset: [0, 0.45, -0.2] },
      wheel: { radius: 0.45, width: 0.34, front: 1.2, rear: -1.15, track: 0.88, height: 0.08, restLength: 0.44, travel: 0.4, stiffness: 26, dampCompression: 3.6, dampRelaxation: 2.6, grip: 1.52 },
      engine: { accel: 12, topSpeed: 59, frontShare: 0.45 },
      downforce: 0.15,
      drag: 0.0009,
      offroad: 1.75,
    },
    shape: { open: true, halfL: 1.75, w: 0.6, flare: 0, arches: false, floor: -0.28, belt: 0.04, hoodDrop: 0.1, tailRise: 0, noseLen: 0.28, wing: 'none', lights: 'round', skirts: false, splitter: false, diffuser: false, mirrors: false, extras: ['cage', 'helmet', 'spare', 'lightbar'] },
  },
  {
    id: 'formula',
    name: 'פורמולה',
    desc: 'אחיזה והצמדה מטורפות על אספלט — ומחוץ לכביש היא אבודה',
    price: 14000,
    spec: {
      mass: 780,
      body: { half: [0.95, 0.24, 2.3], offset: [0, -0.2, 0] },
      cabin: { half: [0.3, 0.2, 0.6], offset: [0, 0.18, -0.35] },
      wheel: { radius: 0.34, width: 0.36, front: 1.62, rear: -1.32, track: 0.82, restLength: 0.22, travel: 0.14, stiffness: 58, dampCompression: 5.5, grip: 1.9 },
      engine: { accel: 12, topSpeed: 71, frontShare: 0 },
      downforce: 1.25,
      drag: 0.00068,
      offroad: 0.6,
    },
    shape: { open: true, formula: true, halfL: 2.35, w: 0.28, flare: 0, arches: false, floor: -0.44, belt: 0.0, hoodDrop: 0.08, tailRise: 0.12, noseLen: 1.0, pods: 0.34, wing: 'formula', lights: 'none', skirts: false, splitter: false, mirrors: false, extras: ['helmet', 'airbox', 'halo'] },
  },
  {
    id: 'hyper',
    name: 'היפרקאר',
    desc: 'הכי מהירה שיש, עם כנף ענקית ומיכל ניטרו גדול',
    price: 22000,
    spec: {
      mass: 1380,
      body: { half: [1.0, 0.28, 2.22], offset: [0, -0.18, 0] },
      cabin: { half: [0.7, 0.22, 0.9], offset: [0, 0.3, -0.1] },
      wheel: { radius: 0.37, width: 0.31, front: 1.4, rear: -1.38, track: 0.86, grip: 1.72 },
      engine: { accel: 12.4, topSpeed: 75, frontShare: 0.3 },
      downforce: 0.85,
      drag: 0.0007,
      nitro: { drain: 0.16 },
    },
    shape: { halfL: 2.3, w: 0.97, flare: 0.09, floor: -0.45, belt: 0.04, hoodDrop: 0.22, roof: 0.5, cabin: [0.95, 0.2, -0.35, -1.5], cabinW: 0.7, wing: 'big', extras: ['fins'] },
  },
  {
    // The motocross bike (the dirt-trail race only: not in the garage).
    id: 'moto',
    name: 'אופנוע מוטוקרוס',
    desc: 'קל, זריז ומזנק — עשוי לעפר, לקפיצות ולפניות חדות',
    price: 0,
    hidden: true,
    spec: {
      bike: true,
      mass: 260,
      body: { half: [0.24, 0.3, 0.95], offset: [0, 0.02, 0] },
      cabin: { half: [0.22, 0.32, 0.3], offset: [0, 0.55, -0.1] },
      wheel: { radius: 0.37, width: 0.14, front: 0.74, rear: -0.72, track: 0.3, height: 0.12, restLength: 0.5, travel: 0.42, stiffness: 28, dampCompression: 3.6, dampRelaxation: 2.6, rollInfluence: 0, grip: 1.5 },
      engine: { accel: 9.4, topSpeed: 36, reverseTop: 5, frontShare: 0, gears: [0, 2.9, 2.1, 1.6, 1.27, 1.03], idleRpm: 1700, redline: 11800 },
      brake: { decel: 9.8, frontBias: 0.66 },
      handbrake: { decel: 4, grip: 0.5 },
      // Half a car's wheelbase: the same wheel angle turns twice as tight, so a much smaller angle at speed
      // (~1.6 g at the limit), and the angle builds up as the bike banks into the turn (lag, seconds).
      steer: { max: 0.55, min: 0.02, gripAngle: 24, rate: 3, returnRate: 4.5, lag: 0.12 },
      downforce: 0,
      drag: 0.0028,
      rolling: 0.25,
      shiftTime: 0.08,
      assist: { yaw: 0.6, antiRoll: 10 },
      nitro: { accel: 5, drain: 0.3 },
      offroad: 1.35,
      exhaust: [-0.19, 0.2, -0.95],
    },
    shape: {},
  },
];

const merge = (a, b) => {
  const out = Array.isArray(a) ? [...a] : { ...a };
  for (const [k, v] of Object.entries(b || {})) out[k] = v && typeof v === 'object' && !Array.isArray(v) && a && typeof a[k] === 'object' ? merge(a[k], v) : v;
  return out;
};

/** Physics spec for a car type: CAR with the type's overrides and derived values. */
export function carSpec(typeId = 'gt') {
  const t = CAR_TYPES.find((c) => c.id === typeId) || CAR_TYPES[0];
  const s = merge(CAR, t.spec);
  s.id = t.id;
  s.offroad = s.offroad || 1;
  s.nitro = { ...s.nitro, topSpeed: s.engine.topSpeed * 1.17 };
  // Steering lock that just saturates the tyres scales with grip and wheelbase.
  const wb = s.wheel.front - s.wheel.rear;
  s.steer = { ...s.steer, gripAngle: CAR.steer.gripAngle * (s.wheel.grip / CAR.wheel.grip) * (wb / (CAR.wheel.front - CAR.wheel.rear)) };
  return s;
}

/** 0–10 ratings for the garage cards. */
export function carRatings(typeId) {
  const s = carSpec(typeId);
  const clamp10 = (v) => Math.max(1, Math.min(10, Math.round(v)));
  return {
    speed: clamp10((s.engine.topSpeed - 45) / 3),
    accel: clamp10((s.engine.accel - 8.5) * 2.6),
    grip: clamp10((s.wheel.grip + s.downforce * 0.35 - 1.2) * 11),
    offroad: clamp10(s.offroad * 5.6),
  };
}

export const AI = {
  names: ['אריאל', 'נועה', 'יונתן', 'שירה', 'עומר', 'מאיה', 'איתי'],
  colors: ['#1f6fe0', '#1faa59', '#f2c230', '#8a4dff', '#ff7a1a', '#e8e8ea', '#18b8c9'],
  difficulty: {
    easy: { skill: [0.78, 0.86], rubber: 0.12, label: 'קל' },
    normal: { skill: [0.88, 0.95], rubber: 0.08, label: 'רגיל' },
    pro: { skill: [0.95, 1.01], rubber: 0.04, label: 'מקצוען' },
  },
  lookahead: [9, 0.55], // metres + seconds of speed
  grip: 1.18, // mu used for the speed profile
  brakeDecel: 8.5,
};

export const CAMERA = {
  modes: [
    { id: 'chase', label: 'מרדף', distance: 7.2, height: 2.4, lookAhead: 6, fov: 62 },
    { id: 'far', label: 'רחוק', distance: 11.5, height: 3.9, lookAhead: 8, fov: 58 },
    { id: 'hood', label: 'מכסה מנוע', distance: -0.6, height: 1.05, lookAhead: 30, fov: 72 },
    { id: 'bumper', label: 'פגוש', distance: -2.3, height: 0.55, lookAhead: 30, fov: 78 },
  ],
  fovBoost: 14, // extra FOV at top speed + nitro
};

/**
 * Stages: each is its own island. `island` drives the terrain generator,
 * `biome` its look, `flora` the vegetation mix, `sky` the atmosphere and
 * `track` the procedural circuit (seeded, validated, 3–4.5 km).
 */
export const STAGES = [
  {
    id: 'pines',
    name: 'אי האורנים',
    tagline: 'יערות מחטניים, רכסים בצפון וחוף ארוך',
    color: '#3f8f4a',
    seed: 11,
    size: 2400,
    segments: 460,
    island: { radius: 820, stretch: [1.08, 0.92], base: 9, hills: 10, ranges: [{ angle: -1.57, from: 0.15, to: 0.7, weight: 1 }], mountainHeight: 120 },
    biome: { grassTint: [0.95, 1.0, 0.92], rockTint: [0.95, 0.95, 1.0] },
    flora: { pine: 1, oak: 0.45, palm: 0, cactus: 0, deadTree: 0, trees: 1500, grass: 1, flowers: 1, foliageTint: '#ffffff' },
    water: { shallow: [0.05, 0.42, 0.42], deep: [0.004, 0.028, 0.055], clarity: 0.16 },
    life: { balloons: 5, cows: 46, sheep: 70, boats: 7, reef: 0.5, fish: 1 },
    sky: { time: 16.3, azimuth: 0.62, turbidity: 2.5, rayleigh: 1.2, clouds: 0.36, cloudDensity: 0.55, fog: 0.0009, wind: 1 },
    weather: null,
    track: { radius: [0.5, 0.64], wiggle: 0.36, targetLength: [3300, 4300] },
  },
  {
    id: 'dunes',
    name: 'אי הדיונות',
    tagline: 'חולות כתומים, קניונים וקקטוסים בשעת זהב',
    color: '#d98a3a',
    seed: 23,
    size: 2400,
    segments: 460,
    island: { radius: 800, stretch: [1.15, 0.9], base: 7, hills: 7, ranges: [{ angle: 0.9, from: 0.25, to: 0.75, weight: 0.8 }], mountainHeight: 85, ridgeFreq: 0.005, dunes: { angle: 0.5, height: 7, wavelength: 85 } },
    biome: { grassTint: [1.55, 1.18, 0.62], sandTint: [1.25, 1.0, 0.72], dirtTint: [1.3, 0.95, 0.7], rockTint: [1.35, 0.95, 0.72] },
    flora: { pine: 0, oak: 0, palm: 0.35, cactus: 1, deadTree: 0.25, trees: 900, grass: 0.35, flowers: 0, foliageTint: '#d9e0a0' },
    water: { shallow: [0.1, 0.45, 0.4], deep: [0.01, 0.05, 0.07], clarity: 0.12 },
    life: { balloons: 8, camels: 18, boats: 5, reef: 0.7, fish: 1 },
    sky: { time: 16.7, azimuth: 3.6, turbidity: 3.8, rayleigh: 1.5, clouds: 0.12, cloudDensity: 0.35, fog: 0.0008, wind: 1.3 },
    weather: 'dust',
    track: { radius: [0.5, 0.66], wiggle: 0.4, targetLength: [3400, 4500] },
  },
  {
    id: 'lagoon',
    name: 'אי הלגונה',
    tagline: 'חוף לבן, מים טורקיז ודקלים סביב לגונה',
    color: '#19b5c2',
    seed: 37,
    size: 2400,
    segments: 460,
    island: { radius: 840, stretch: [1, 1], base: 4, hills: 6, ranges: [{ angle: 2.6, from: 0.3, to: 0.8, weight: 0.5 }], mountainHeight: 60, coastRough: 0.1, lagoon: { inner: 0.26, outer: 0.4, depth: 4 } },
    biome: { grassTint: [0.9, 1.15, 0.8], sandTint: [1.3, 1.25, 1.12], dirtTint: [1.1, 1.0, 0.85] },
    flora: { pine: 0, oak: 0.25, palm: 1, cactus: 0, deadTree: 0, trees: 1300, grass: 1, flowers: 1, foliageTint: '#ffffff' },
    water: { shallow: [0.02, 0.62, 0.58], deep: [0.0, 0.08, 0.16], clarity: 0.1 },
    life: { balloons: 4, cows: 20, sheep: 34, boats: 10, reef: 1.2, fish: 1.5, dolphins: 2 },
    sky: { time: 12.6, azimuth: 1.1, turbidity: 2, rayleigh: 1.1, clouds: 0.3, cloudDensity: 0.45, fog: 0.0006, wind: 0.8 },
    weather: null,
    track: { radius: [0.56, 0.7], wiggle: 0.28, targetLength: [3300, 4400] },
  },
  {
    id: 'ice',
    name: 'אי הקרח',
    tagline: 'פסגות מושלגות, אורנים קפואים ושלג יורד',
    color: '#8fc6ff',
    seed: 53,
    size: 2400,
    segments: 460,
    island: { radius: 820, stretch: [0.95, 1.1], base: 8, hills: 12, ranges: [{ angle: 0.2, from: 0.2, to: 0.7, weight: 1 }, { angle: 3.3, from: 0.35, to: 0.8, weight: 0.7 }], mountainHeight: 140 },
    biome: { grassTint: [0.85, 0.95, 1.0], sandTint: [0.9, 0.93, 1.0], rockTint: [0.85, 0.9, 1.0], snowLine: 3, snowAmount: 1 },
    flora: { pine: 1, oak: 0, palm: 0, cactus: 0, deadTree: 0.1, trees: 1500, grass: 0, flowers: 0, foliageTint: '#dfeaf2' },
    water: { shallow: [0.1, 0.3, 0.36], deep: [0.01, 0.03, 0.06], clarity: 0.2 },
    life: { boats: 3, reef: 0.08, fish: 0.6, dolphins: 0.4 },
    sky: { time: 10.8, azimuth: -0.4, turbidity: 3.5, rayleigh: 1.0, clouds: 0.78, cloudDensity: 0.85, fog: 0.0024, wind: 1.5 },
    weather: 'snow',
    track: { radius: [0.48, 0.62], wiggle: 0.38, targetLength: [3200, 4200] },
  },
  {
    id: 'lava',
    name: 'אי הלבה',
    tagline: 'הר געש פעיל, סלע שחור ומירוץ לילה לאור הלבה',
    color: '#ff4a1a',
    seed: 71,
    size: 2400,
    segments: 460,
    island: { radius: 820, stretch: [1.05, 1], base: 6, hills: 8, ranges: [], mountainHeight: 60, volcano: { x: -60, z: -40, radius: 380, height: 170, craterRadius: 0.2, craterDepth: 55 } },
    biome: { grassTint: [0.55, 0.55, 0.42], sandTint: [0.32, 0.3, 0.3], dirtTint: [0.55, 0.42, 0.38], rockTint: [0.42, 0.38, 0.38] },
    flora: { pine: 0.25, oak: 0, palm: 0, cactus: 0, deadTree: 1, trees: 800, grass: 0.35, flowers: 0, foliageTint: '#8f9a78' },
    water: { shallow: [0.06, 0.18, 0.2], deep: [0.005, 0.015, 0.03], clarity: 0.24 },
    life: { boats: 2, reef: 0.25, fish: 0.7 },
    sky: { time: 20.3, azimuth: 0.2, turbidity: 6, rayleigh: 1.4, clouds: 0.5, cloudDensity: 0.7, fog: 0.0016, wind: 1.1 },
    weather: 'ash',
    lavaLake: true,
    track: { radius: [0.52, 0.63], wiggle: 0.3, targetLength: [3100, 4300] },
  },
  {
    id: 'city',
    name: 'העיר הסואנת',
    tagline: 'מירוץ רחוב בשקיעה: מגדלי זכוכית, בתי באוהאוס, מנהרה מתחת למלון, גשר הולכי רגל וקהל מאחורי הגדר',
    color: '#ffb020',
    seed: 83,
    size: 2400,
    segments: 460,
    island: { radius: 860, stretch: [1.06, 1], base: 5, hills: 1.2, ranges: [], mountainHeight: 0, coastRough: 0.05 },
    biome: { grassTint: [0.5, 0.52, 0.5], sandTint: [0.95, 0.92, 0.86], dirtTint: [0.55, 0.55, 0.57], rockTint: [0.7, 0.7, 0.72] },
    flora: { pine: 0, oak: 0.7, palm: 0.55, cactus: 0, deadTree: 0, trees: 220, grass: 0.35, flowers: 0.35, rocks: 0, foliageTint: '#ffffff' },
    water: { shallow: [0.05, 0.3, 0.36], deep: [0.004, 0.02, 0.05], clarity: 0.18 },
    life: { balloons: 2, boats: 12, reef: 0.35, fish: 0.9 },
    sky: { time: 17.92, azimuth: 0.9, turbidity: 3.2, rayleigh: 1.3, clouds: 0.35, cloudDensity: 0.5, fog: 0.0011, wind: 0.8 },
    weather: null,
    city: true,
    barrier: 'concrete',
    roadGrip: 1,
    track: { radius: [0.45, 0.64], wiggle: 0.34, targetLength: [3200, 4300] },
  },
  {
    id: 'canyon',
    name: 'קניון הגעש',
    tagline: 'נקיקים צרים בין קירות אבן אדומה, קשתות סלע, גשר חבלים ושלושה הרי געש בוערים',
    color: '#e0582a',
    seed: 97,
    size: 2400,
    segments: 460,
    island: {
      radius: 880,
      stretch: [1.08, 0.96],
      base: 9,
      hills: 4,
      ranges: [],
      mountainHeight: 0,
      dunes: { angle: 1.2, height: 2.5, wavelength: 70 },
      mesas: { freq: 0.0042, threshold: 0.12, height: 38 },
      volcanoes: [
        { x: -30, z: 20, radius: 220, height: 180, craterRadius: 0.2, craterDepth: 42 },
        { x: 470, z: -470, radius: 190, height: 240, craterRadius: 0.22, craterDepth: 34 },
        { x: -520, z: 400, radius: 180, height: 220, craterRadius: 0.24, craterDepth: 30 },
      ],
    },
    biome: { grassTint: [2.3, 1.15, 0.95], sandTint: [1.38, 0.9, 0.62], dirtTint: [1.28, 0.78, 0.54], rockTint: [1.3, 0.74, 0.52], strata: 1, desert: 0.85 },
    flora: { pine: 0, oak: 0, palm: 0.12, cactus: 0.9, deadTree: 0.6, trees: 440, grass: 0.2, flowers: 0, foliageTint: '#d8c890' },
    water: { shallow: [0.1, 0.4, 0.38], deep: [0.01, 0.04, 0.06], clarity: 0.13 },
    life: { balloons: 6, camels: 12, boats: 4, reef: 0.6, fish: 1 },
    sky: { time: 17.1, azimuth: 1.8, turbidity: 4.2, rayleigh: 1.5, clouds: 0.15, cloudDensity: 0.35, fog: 0.0009, wind: 1.2 },
    weather: 'dust',
    cut: 0.3, // steep canyon walls where the road is carved through rock
    gorge: { count: 3, length: 400, height: 36, ledge: 6.5 }, // the twistiest stretches run between sheer walls
    lavaLake: true,
    lavaGain: 0.3, // daylight: keep the lakes orange instead of blown out
    roadGrip: 0.97,
    track: { radius: [0.38, 0.58], wiggle: 0.36, targetLength: [3100, 4400] },
    trail: true, // a motocross trail through the mesas (the motorbike race)
  },
];
