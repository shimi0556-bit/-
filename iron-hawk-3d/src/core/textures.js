// Textures: the Gemini-generated art embedded by the build (window.__ASSETS), with
// procedural, seamlessly tiling canvas fallbacks so the game always has every surface.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const ASSETS = (typeof window !== 'undefined' && window.__ASSETS) || {};

export function hasAsset(name) { return !!ASSETS[name]; }
export function assetURL(name) { return ASSETS[name] || null; }

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// ---------- tileable noise on a periodic lattice ----------
function periodicValueNoise(seed, period) {
  const rand = mulberry32(seed);
  const grid = new Float32Array(period * period);
  for (let i = 0; i < grid.length; i++) grid[i] = rand();
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = grid[y0 * period + x0], b = grid[y0 * period + x1];
    const c = grid[y1 * period + x0], d = grid[y1 * period + x1];
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v;
  };
}

function tileFbm(seed, baseCells, octaves) {
  const layers = [];
  for (let o = 0; o < octaves; o++) layers.push(periodicValueNoise(seed + o * 101, baseCells << o));
  return (u, v) => { // u, v in 0..1
    let sum = 0, amp = 0.5, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const cells = baseCells << o;
      sum += layers[o](u * cells, v * cells) * amp;
      norm += amp; amp *= 0.5;
    }
    return sum / norm;
  };
}

// Worley (cellular) noise that wraps; returns [F1, F2, cellId]
function tileWorley(seed, cells, jitter = 0.9) {
  const rand = mulberry32(seed);
  const pts = new Float32Array(cells * cells * 2);
  const ids = new Float32Array(cells * cells);
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 2] = 0.5 + (rand() - 0.5) * jitter;
    pts[i * 2 + 1] = 0.5 + (rand() - 0.5) * jitter;
    ids[i] = rand();
  }
  const out = [0, 0, 0];
  return (u, v) => {
    const x = u * cells, y = v * cells;
    const xi = Math.floor(x), yi = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx, cy = yi + dy;
        const wx = ((cx % cells) + cells) % cells, wy = ((cy % cells) + cells) % cells;
        const k = wy * cells + wx;
        const px = cx + pts[k * 2], py = cy + pts[k * 2 + 1];
        const d = Math.hypot(px - x, py - y);
        if (d < f1) { f2 = f1; f1 = d; id = ids[k]; } else if (d < f2) f2 = d;
      }
    }
    out[0] = f1; out[1] = f2; out[2] = id;
    return out;
  };
}

function paint(size, fn) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const rgb = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, rgb);
      const i = (y * size + x) * 4;
      d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const mix = (a, b, t) => a + (b - a) * t;
function mixRGB(out, c1, c2, t) { out[0] = mix(c1[0], c2[0], t); out[1] = mix(c1[1], c2[1], t); out[2] = mix(c1[2], c2[2], t); }
const sat = (x) => Math.max(0, Math.min(1, x));

const RECIPES = {
  tex_grass(size) {
    const n = tileFbm(11, 4, 6), m = tileFbm(23, 16, 4), w = tileWorley(5, 40, 1);
    return paint(size, (u, v, o) => {
      const a = n(u, v), b = m(u, v), c = w(u, v);
      const blade = sat((c[1] - c[0]) * 3);
      mixRGB(o, [52, 82, 30], [104, 130, 50], sat(a * 1.4 - 0.2));
      const t = sat(b * 1.6 - 0.5);
      o[0] = mix(o[0], 120, t * 0.35); o[1] = mix(o[1], 110, t * 0.3); o[2] = mix(o[2], 60, t * 0.3);
      const k = 0.75 + blade * 0.35 + c[2] * 0.12;
      o[0] *= k; o[1] *= k; o[2] *= k;
    });
  },
  tex_dirt(size) {
    const n = tileFbm(31, 4, 6), w = tileWorley(7, 26, 1);
    return paint(size, (u, v, o) => {
      const a = n(u, v), c = w(u, v);
      const pebble = sat(1 - c[0] * 2.4);
      mixRGB(o, [88, 66, 44], [134, 104, 72], sat(a * 1.5 - 0.25));
      const k = 0.85 + pebble * 0.35 * (c[2] > 0.55 ? 1 : 0) - sat((c[1] - c[0]) < 0.06 ? 0.15 : 0);
      o[0] *= k; o[1] *= k; o[2] *= k;
    });
  },
  tex_rock(size) {
    const n = tileFbm(41, 3, 7), w = tileWorley(9, 9, 1), s = tileFbm(43, 2, 3);
    return paint(size, (u, v, o) => {
      const a = n(u, v), c = w(u, v), st = s(u, v);
      const crack = sat((c[1] - c[0]) * 9);
      const strata = 0.5 + 0.5 * Math.sin((v + st * 0.25) * Math.PI * 18);
      mixRGB(o, [96, 92, 88], [150, 146, 138], sat(a * 1.6 - 0.3 + strata * 0.15));
      const k = 0.55 + 0.45 * crack;
      o[0] *= k; o[1] *= k; o[2] *= k;
      if (a > 0.62) { o[0] = mix(o[0], 140, 0.3); o[1] = mix(o[1], 150, 0.3); o[2] = mix(o[2], 90, 0.25); }
    });
  },
  tex_sand(size) {
    const n = tileFbm(51, 4, 6), w = tileWorley(13, 14, 1), r = tileFbm(57, 8, 2);
    return paint(size, (u, v, o) => {
      const a = n(u, v), c = w(u, v), rip = 0.5 + 0.5 * Math.sin((u * 22 + r(u, v) * 4) * Math.PI * 2);
      mixRGB(o, [168, 96, 56], [214, 148, 96], sat(a * 1.5 - 0.25 + rip * 0.08));
      const crack = sat((c[1] - c[0]) * 14);
      const k = 0.8 + 0.2 * crack;
      o[0] *= k; o[1] *= k; o[2] *= k;
    });
  },
  tex_ash(size) {
    const n = tileFbm(61, 4, 6), w = tileWorley(17, 30, 1);
    return paint(size, (u, v, o) => {
      const a = n(u, v), c = w(u, v);
      const pore = sat(1 - c[0] * 3.2);
      mixRGB(o, [28, 26, 27], [74, 70, 68], sat(a * 1.6 - 0.3));
      const k = 1 - pore * 0.45 * (c[2] > 0.4 ? 1 : 0.3);
      o[0] *= k; o[1] *= k; o[2] *= k;
    });
  },
  tex_lava(size) {
    const n = tileFbm(71, 3, 6), w = tileWorley(19, 7, 1);
    return paint(size, (u, v, o) => {
      const a = n(u, v), c = w(u, v);
      const gap = sat(1 - (c[1] - c[0]) * 5 + (a - 0.5) * 0.8);
      const hot = gap * gap;
      mixRGB(o, [24, 18, 16], [255, 150, 40], hot);
      if (hot > 0.7) { o[1] = mix(o[1], 230, (hot - 0.7) * 2); o[2] = mix(o[2], 120, (hot - 0.7) * 2); }
    });
  },
  tex_scales(size) {
    const w = tileWorley(23, 34, 0.85), n = tileFbm(81, 6, 4);
    return paint(size, (u, v, o) => {
      const c = w(u, v), a = n(u, v);
      const edge = sat((c[1] - c[0]) * 4.5);
      const dome = sat(1 - c[0] * 1.6);
      const g = 70 + 120 * edge * (0.6 + 0.4 * dome) + 30 * (c[2] - 0.5) + 30 * (a - 0.5);
      o[0] = g * 0.95; o[1] = g; o[2] = g * 0.92;
    });
  },
  tex_hide(size) {
    const n = tileFbm(91, 6, 6), w = tileWorley(29, 48, 1), f = tileFbm(93, 3, 4);
    return paint(size, (u, v, o) => {
      const c = w(u, v), a = n(u, v), fold = Math.abs(Math.sin((u + f(u, v) * 0.6) * Math.PI * 9));
      const g = 90 + 90 * sat((c[1] - c[0]) * 3) + 40 * (a - 0.5) - 35 * (1 - fold) ;
      o[0] = g; o[1] = g * 0.98; o[2] = g * 0.95;
    });
  },
};

// Panel-line / camo texture for the jet hull (u around the fuselage, v along it).
export function makeJetTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  const n = tileFbm(301, 3, 5);
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const a = n(x / size, y / size);
    const camo = a > 0.56 ? 0.84 : a > 0.46 ? 0.93 : 1.0;
    const base = 150 * camo + (a - 0.5) * 14;
    const i = (y * size + x) * 4;
    img.data[i] = base * 0.93; img.data[i + 1] = base * 0.97; img.data[i + 2] = base * 1.03; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const rand = mulberry32(7);
  g.strokeStyle = 'rgba(30,34,40,0.55)';
  g.lineWidth = Math.max(1, size / 700);
  for (let i = 0; i < 26; i++) { // panel seams along the length
    const y = Math.floor(rand() * size);
    g.beginPath(); g.moveTo(0, y); g.lineTo(size, y); g.stroke();
  }
  for (let i = 0; i < 40; i++) { // rectangular access panels
    const x = rand() * size, y = rand() * size, w = 20 + rand() * size * 0.12, h = 16 + rand() * size * 0.08;
    g.strokeRect(x, y, w, h);
  }
  g.fillStyle = 'rgba(25,28,34,0.5)';
  for (let i = 0; i < 900; i++) { // rivets
    g.fillRect(rand() * size, rand() * size, size / 512, size / 512);
  }
  return canvas;
}

// Soft round sprite for particles (white, alpha falloff).
export function makeSoftSprite(size = 128, hard = 0) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25 + hard * 0.5, 'rgba(255,255,255,0.7)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  return c;
}

// Billowy smoke / cloud puff sprite with noise.
export function makePuffSprite(size = 256, seed = 3) {
  const n = tileFbm(seed, 4, 5);
  return paint2(size, (u, v, o) => {
    const dx = u - 0.5, dy = v - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const a = sat((1 - r) * 1.6) * sat(n(u, v) * 1.8 - 0.25);
    o[0] = o[1] = o[2] = 255; o[3] = a * 255;
  });
}

function paint2(size, fn) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const o = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    fn(x / size, y / size, o);
    const i = (y * size + x) * 4;
    img.data[i] = o[0]; img.data[i + 1] = o[1]; img.data[i + 2] = o[2]; img.data[i + 3] = o[3];
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

const cache = new Map();

// Returns a repeating sRGB texture: the generated art if it was embedded, otherwise the recipe.
export async function getSurfaceTexture(name, renderer, size = 512) {
  if (cache.has(name)) return cache.get(name);
  let source = null;
  if (ASSETS[name]) {
    try { source = await loadImage(ASSETS[name]); } catch (e) { source = null; }
  }
  if (!source) source = RECIPES[name](size);
  const tex = source instanceof HTMLCanvasElement ? new THREE.CanvasTexture(source) : new THREE.Texture(source);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer ? Math.min(8, renderer.capabilities.getMaxAnisotropy()) : 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  cache.set(name, tex);
  return tex;
}

export function canvasTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
