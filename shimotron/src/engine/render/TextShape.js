import * as THREE from 'three';

/**
 * Turns any text in any installed or web font (Hebrew included) into
 * THREE.Shapes: the text is rasterised on a canvas, traced with marching
 * squares, simplified, and holes are resolved by nesting depth. Feed the
 * result to ExtrudeGeometry for real 3D lettering.
 */
export function textToShapes(text, { font = '900 220px sans-serif', direction = 'rtl', height = 1, tolerance = 0.7 } = {}) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = font;
  probe.direction = direction;
  probe.textAlign = 'left';
  const m = probe.measureText(text);
  const pad = 12;
  const ascent = Math.ceil(m.actualBoundingBoxAscent || 180);
  const descent = Math.ceil(m.actualBoundingBoxDescent || 40);
  const W = Math.ceil(Math.abs(m.actualBoundingBoxLeft || 0) + Math.abs(m.actualBoundingBoxRight || m.width)) + pad * 2;
  const H = ascent + descent + pad * 2;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#000';
  g.fillRect(0, 0, W, H);
  g.fillStyle = '#fff';
  g.font = font;
  g.direction = direction;
  g.textBaseline = 'alphabetic';
  g.textAlign = 'left';
  g.fillText(text, pad + (m.actualBoundingBoxLeft || 0), pad + ascent);
  const img = g.getImageData(0, 0, W, H).data;
  const v = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) v[i] = img[i * 4] / 255;

  const loops = marchingSquares(v, W, H, 0.5).map((l) => simplify(l, tolerance)).filter((l) => l.length >= 3);
  // Nesting depth decides outer (even) vs hole (odd).
  const info = loops.map((pts) => ({ pts, area: signedArea(pts), depth: 0, holes: [] }));
  for (const a of info) {
    for (const b of info) if (a !== b && Math.abs(b.area) > Math.abs(a.area) && pointInPolygon(a.pts[0], b.pts)) a.depth++;
  }
  const scale = height / (ascent + descent);
  const cx = W / 2;
  const cy = pad + ascent; // baseline
  const toV = (p) => new THREE.Vector2((p[0] - cx) * scale, (cy - p[1]) * scale);
  const outers = info.filter((l) => l.depth % 2 === 0);
  for (const h of info.filter((l) => l.depth % 2 === 1)) {
    let best = null;
    for (const o of outers) if (o.depth === h.depth - 1 && pointInPolygon(h.pts[0], o.pts) && (!best || Math.abs(o.area) < Math.abs(best.area))) best = o;
    if (best) best.holes.push(h);
  }
  const shapes = outers.map((o) => {
    const shape = new THREE.Shape(o.pts.map(toV));
    for (const h of o.holes) shape.holes.push(new THREE.Path(h.pts.map(toV)));
    return shape;
  });
  return { shapes, width: W * scale, height: (ascent + descent) * scale, baseline: descent * scale };
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) a += (pts[j][0] - pts[i][0]) * (pts[j][1] + pts[i][1]);
  return a / 2;
}

function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function simplify(pts, tol) {
  if (pts.length < 8) return pts;
  // Douglas–Peucker on a closed loop: split at the farthest pair.
  const rdp = (arr) => {
    if (arr.length < 3) return arr;
    const [ax, ay] = arr[0];
    const [bx, by] = arr[arr.length - 1];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let maxD = 0;
    let idx = 0;
    for (let i = 1; i < arr.length - 1; i++) {
      const d = Math.abs(dy * arr[i][0] - dx * arr[i][1] + bx * ay - by * ax) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD <= tol) return [arr[0], arr[arr.length - 1]];
    const l = rdp(arr.slice(0, idx + 1));
    const r = rdp(arr.slice(idx));
    return l.slice(0, -1).concat(r);
  };
  const half = Math.floor(pts.length / 2);
  const a = rdp(pts.slice(0, half + 1));
  const b = rdp(pts.slice(half).concat([pts[0]]));
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/** Iso-contours of a scalar grid as closed loops of [x, y] points. */
function marchingSquares(v, W, H, iso) {
  const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0 : v[y * W + x]);
  const lerpT = (a, b) => (iso - a) / (b - a || 1e-9);
  // Edge point keys: horizontal edge (x,y)-(x+1,y) = 'h', vertical (x,y)-(x,y+1) = 'v'.
  const pointCache = new Map();
  const point = (type, x, y) => {
    const key = `${type}${x},${y}`;
    if (!pointCache.has(key)) {
      let p;
      if (type === 'h') p = [x + lerpT(at(x, y), at(x + 1, y)), y];
      else p = [x, y + lerpT(at(x, y), at(x, y + 1))];
      pointCache.set(key, { key, p });
    }
    return pointCache.get(key);
  };
  const next = new Map();
  for (let y = -1; y < H; y++) {
    for (let x = -1; x < W; x++) {
      const a = at(x, y) > iso ? 1 : 0; // top-left
      const b = at(x + 1, y) > iso ? 1 : 0; // top-right
      const c = at(x + 1, y + 1) > iso ? 1 : 0; // bottom-right
      const d = at(x, y + 1) > iso ? 1 : 0; // bottom-left
      const idx = a | (b << 1) | (c << 2) | (d << 3);
      if (idx === 0 || idx === 15) continue;
      const T = () => point('h', x, y);
      const R = () => point('v', x + 1, y);
      const B = () => point('h', x, y + 1);
      const L = () => point('v', x, y);
      const seg = (p, q) => next.set(p.key, q);
      // Oriented so the inside is always on the same side.
      switch (idx) {
        case 1: seg(L(), T()); break;
        case 2: seg(T(), R()); break;
        case 3: seg(L(), R()); break;
        case 4: seg(R(), B()); break;
        case 5: {
          const center = (at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1)) / 4 > iso;
          if (center) { seg(L(), B()); seg(R(), T()); } else { seg(L(), T()); seg(R(), B()); }
          break;
        }
        case 6: seg(T(), B()); break;
        case 7: seg(L(), B()); break;
        case 8: seg(B(), L()); break;
        case 9: seg(B(), T()); break;
        case 10: {
          const center = (at(x, y) + at(x + 1, y) + at(x + 1, y + 1) + at(x, y + 1)) / 4 > iso;
          if (center) { seg(T(), L()); seg(B(), R()); } else { seg(T(), R()); seg(B(), L()); }
          break;
        }
        case 11: seg(B(), R()); break;
        case 12: seg(R(), L()); break;
        case 13: seg(R(), T()); break;
        case 14: seg(T(), L()); break;
      }
    }
  }
  const loops = [];
  const visited = new Set();
  for (const startKey of next.keys()) {
    if (visited.has(startKey)) continue;
    const loop = [];
    let k = startKey;
    let guard = 0;
    while (k && !visited.has(k) && guard++ < 200000) {
      visited.add(k);
      loop.push(pointCache.get(k).p);
      k = next.get(k)?.key;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops;
}
