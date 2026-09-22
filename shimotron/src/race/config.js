/**
 * Shimotron Rally — every tunable number lives here.
 * Sections: race rules, car physics, AI, camera, and the five island stages.
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
  flipResetTime: 2.2,
};

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
    water: { shallow: [0.05, 0.42, 0.42], deep: [0.004, 0.028, 0.055] },
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
    water: { shallow: [0.1, 0.45, 0.4], deep: [0.01, 0.05, 0.07] },
    sky: { time: 17.55, azimuth: 2.3, turbidity: 5.5, rayleigh: 1.6, clouds: 0.1, cloudDensity: 0.35, fog: 0.0012, wind: 1.3 },
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
    water: { shallow: [0.02, 0.62, 0.58], deep: [0.0, 0.08, 0.16] },
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
    water: { shallow: [0.1, 0.3, 0.36], deep: [0.01, 0.03, 0.06] },
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
    water: { shallow: [0.06, 0.18, 0.2], deep: [0.005, 0.015, 0.03] },
    sky: { time: 20.3, azimuth: 0.2, turbidity: 6, rayleigh: 1.4, clouds: 0.5, cloudDensity: 0.7, fog: 0.0016, wind: 1.1 },
    weather: 'ash',
    lavaLake: true,
    track: { radius: [0.52, 0.63], wiggle: 0.3, targetLength: [3100, 4300] },
  },
];
