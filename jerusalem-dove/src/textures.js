// Procedural canvas textures — no external image files needed.
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function rand(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function finish(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Jerusalem stone blocks, warm beige.
export function stoneTexture(seed = 1, base = [226, 204, 168]) {
  const [c, g] = canvas(256, 256);
  const r = rand(seed);
  g.fillStyle = `rgb(${base})`; g.fillRect(0, 0, 256, 256);
  const rows = 8;
  for (let y = 0; y < rows; y++) {
    const bh = 256 / rows;
    let x = y % 2 ? -20 : 0;
    while (x < 256) {
      const bw = 34 + r() * 30;
      const v = (r() - 0.5) * 34;
      g.fillStyle = `rgb(${base[0] + v},${base[1] + v},${base[2] + v * 0.8})`;
      g.fillRect(x + 1, y * bh + 1, bw - 2, bh - 2);
      for (let i = 0; i < 18; i++) {
        g.fillStyle = `rgba(90,70,40,${r() * 0.12})`;
        g.fillRect(x + r() * bw, y * bh + r() * bh, 2, 2);
      }
      x += bw;
    }
  }
  g.strokeStyle = 'rgba(120,98,70,0.55)'; g.lineWidth = 2;
  for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * 32); g.lineTo(256, y * 32); g.stroke(); }
  return finish(c);
}

// Building facade: stone with windows. One texture tile = 4m wide x 3.5m floor.
export function facadeTexture(seed = 2) {
  const [c, g] = canvas(256, 256);
  const r = rand(seed);
  const stone = stoneTexture(seed + 7).image;
  g.drawImage(stone, 0, 0);
  for (let fy = 0; fy < 2; fy++) {
    for (let fx = 0; fx < 2; fx++) {
      const x = fx * 128 + 34, y = fy * 128 + 30;
      const lit = r() < 0.35;
      g.fillStyle = 'rgba(80,60,40,0.5)'; g.fillRect(x - 5, y - 5, 70, 80);
      g.fillStyle = lit ? '#ffd48a' : `rgb(${40 + r() * 20},${55 + r() * 20},${70 + r() * 25})`;
      g.fillRect(x, y, 60, 70);
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, 60, 8);
      g.fillStyle = 'rgba(60,45,30,0.9)'; g.fillRect(x + 28, y, 4, 70);
      // Arched top — typical Jerusalem window.
      g.fillStyle = 'rgba(200,180,150,1)';
      g.beginPath(); g.arc(x + 30, y + 2, 30, Math.PI, 0); g.lineTo(x + 60, y - 6); g.lineTo(x, y - 6); g.fill();
      g.fillStyle = lit ? '#ffcf7a' : '#3d4d5e';
      g.beginPath(); g.arc(x + 30, y + 2, 26, Math.PI, 0); g.fill();
      g.fillStyle = 'rgba(140,110,80,0.9)'; g.fillRect(x - 6, y + 70, 72, 6);
    }
  }
  return finish(c);
}

export function roofTexture(seed = 3) {
  const [c, g] = canvas(128, 128);
  const r = rand(seed);
  g.fillStyle = '#b9a88d'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 400; i++) {
    const v = 150 + r() * 60;
    g.fillStyle = `rgba(${v},${v * 0.92},${v * 0.8},0.35)`;
    g.fillRect(r() * 128, r() * 128, 3, 3);
  }
  return finish(c);
}

// Blue/turquoise tile pattern for the Dome of the Rock octagon.
export function tileTexture() {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#1f5fa8'; g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
    const cx = x * 32 + 16, cy = y * 32 + 16;
    g.fillStyle = (x + y) % 2 ? '#2f86c9' : '#174a86';
    g.beginPath(); g.moveTo(cx, cy - 14); g.lineTo(cx + 14, cy); g.lineTo(cx, cy + 14); g.lineTo(cx - 14, cy); g.fill();
    g.fillStyle = '#e8d9a8'; g.beginPath(); g.arc(cx, cy, 3, 0, Math.PI * 2); g.fill();
  }
  // Arched windows band.
  g.fillStyle = '#e9e0c4'; g.fillRect(0, 150, 256, 6); g.fillRect(0, 100, 256, 4);
  for (let x = 0; x < 256; x += 64) {
    g.fillStyle = '#0d2a4d';
    g.fillRect(x + 22, 112, 20, 32);
    g.beginPath(); g.arc(x + 32, 112, 10, Math.PI, 0); g.fill();
  }
  // Calligraphy-like band on top.
  g.fillStyle = '#12356b'; g.fillRect(0, 0, 256, 28);
  g.fillStyle = '#f2e6b8';
  for (let x = 4; x < 256; x += 12) g.fillRect(x, 8 + Math.sin(x) * 3, 7, 10);
  return finish(c);
}

export function groundDetailTexture() {
  const [c, g] = canvas(256, 256);
  const r = rand(11);
  g.fillStyle = '#808080'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 5000; i++) {
    const v = 100 + r() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.4)`;
    g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
  }
  return finish(c, true, false);
}

export function cloudTexture() {
  const [c, g] = canvas(256, 256);
  const r = rand(5);
  for (let i = 0; i < 28; i++) {
    const x = 60 + r() * 136, y = 90 + r() * 70, rad = 30 + r() * 50;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  }
  return finish(c, false);
}

export function glowTexture(color = '255,220,140') {
  const [c, g] = canvas(128, 128);
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, `rgba(${color},1)`);
  grd.addColorStop(0.3, `rgba(${color},0.5)`);
  grd.addColorStop(1, `rgba(${color},0)`);
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  return finish(c, false);
}

export function letterTexture(ch) {
  const [c, g] = canvas(256, 256);
  const grd = g.createRadialGradient(128, 128, 20, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,230,160,0.55)');
  grd.addColorStop(1, 'rgba(255,200,90,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  g.font = 'bold 170px "Frank Ruhl Libre", "David Libre", serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = '#7a4a08'; g.strokeText(ch, 128, 138);
  const lg = g.createLinearGradient(0, 50, 0, 210);
  lg.addColorStop(0, '#fff6c8'); lg.addColorStop(0.5, '#ffc93c'); lg.addColorStop(1, '#c47f0c');
  g.fillStyle = lg; g.fillText(ch, 128, 138);
  return finish(c, false);
}

export function labelTexture(text) {
  const [c, g] = canvas(512, 96);
  g.font = 'bold 44px Rubik, Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(20,14,8,0.55)';
  const w = Math.min(500, g.measureText(text).width + 40);
  g.beginPath(); g.roundRect(256 - w / 2, 14, w, 68, 34); g.fill();
  g.fillStyle = '#fff3d6'; g.fillText(text, 256, 50);
  return finish(c, false);
}
