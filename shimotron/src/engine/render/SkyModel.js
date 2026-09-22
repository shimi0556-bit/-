/**
 * CPU port of the Preetham sky used by Three's Sky shader (r186). The engine
 * uses it to derive physically consistent sun colour, sky irradiance, fog
 * colour and auto-exposure, so the lighting always matches the rendered sky.
 */
const TOTAL_RAYLEIGH = [5.804542996261093e-6, 1.3562911419845635e-5, 3.0265902468824876e-5];
const MIE_CONST = [1.8399918514433978e14, 2.7798023919660528e14, 4.0790479543861094e14];
const CUTOFF = 1.6110731556870734;
const STEEPNESS = 1.5;
const EE = 1000;

export class SkyModel {
  constructor() {
    this.turbidity = 2.5;
    this.rayleigh = 1.2;
    this.mieCoefficient = 0.005;
    this.mieDirectionalG = 0.8;
  }

  _coeffs(sun) {
    const sunE = EE * Math.max(0, 1 - Math.exp(-((CUTOFF - Math.acos(Math.max(-1, Math.min(1, sun.y)))) / STEEPNESS)));
    const betaR = TOTAL_RAYLEIGH.map((v) => v * this.rayleigh);
    const c = 0.2 * this.turbidity * 10e-18;
    const betaM = MIE_CONST.map((v) => 0.434 * c * v * this.mieCoefficient);
    return { sunE, betaR, betaM };
  }

  /** Optical-depth extinction for a view direction (per channel). */
  _fex(dirY, betaR, betaM) {
    const zen = Math.acos(Math.max(0, dirY));
    const inv = 1 / (Math.cos(zen) + 0.15 * Math.pow(93.885 - (zen * 180) / Math.PI, -1.253));
    const sR = 8400 * inv;
    const sM = 1250 * inv;
    return [0, 1, 2].map((i) => Math.exp(-(betaR[i] * sR + betaM[i] * sM)));
  }

  /** Linear radiance of the sky (no clouds, no sun disc) in direction dir. */
  radiance(dir, sun, out = [0, 0, 0]) {
    const { sunE, betaR, betaM } = this._coeffs(sun);
    const fex = this._fex(dir.y, betaR, betaM);
    const cosT = dir.x * sun.x + dir.y * sun.y + dir.z * sun.z;
    const rPhase = 0.05968310365946075 * (1 + Math.pow(cosT * 0.5 + 0.5, 2));
    const g = this.mieDirectionalG;
    const g2 = g * g;
    const mPhase = (0.07957747154594767 * (1 - g2)) / Math.pow(1 - 2 * g * cosT + g2, 1.5);
    const t = Math.min(1, Math.max(0, Math.pow(1 - sun.y, 5)));
    const add = [0, 0.0003, 0.00075];
    for (let i = 0; i < 3; i++) {
      const r = (betaR[i] * rPhase + betaM[i] * mPhase) / (betaR[i] + betaM[i]);
      let lin = Math.pow(sunE * r * (1 - fex[i]), 1.5);
      lin *= 1 - t + t * Math.pow(sunE * r * fex[i], 0.5);
      out[i] = (lin + 0.1 * fex[i]) * 0.04 + add[i];
    }
    return out;
  }

  /** Atmospheric transmittance towards the sun (drives the sunlight colour). */
  sunTransmittance(sun) {
    const { betaR, betaM } = this._coeffs(sun);
    return this._fex(Math.max(sun.y, 0.0), betaR, betaM);
  }

  /** Cosine-weighted sky irradiance on an upward-facing surface. */
  irradiance(sun) {
    const acc = [0, 0, 0];
    const tmp = [0, 0, 0];
    const dir = { x: 0, y: 0, z: 0 };
    let wsum = 0;
    const rings = 5;
    const segs = 10;
    for (let r = 0; r < rings; r++) {
      const el = ((r + 0.5) / rings) * (Math.PI / 2);
      const cy = Math.sin(el);
      const cr = Math.cos(el);
      for (let s = 0; s < segs; s++) {
        const az = (s / segs) * Math.PI * 2;
        dir.x = Math.cos(az) * cr;
        dir.y = cy;
        dir.z = Math.sin(az) * cr;
        this.radiance(dir, sun, tmp);
        const w = cy * cr; // cos(theta) * solid-angle weight
        acc[0] += tmp[0] * w;
        acc[1] += tmp[1] * w;
        acc[2] += tmp[2] * w;
        wsum += w;
      }
    }
    return acc.map((v) => (v / wsum) * Math.PI);
  }

  /** Average horizon colour and the colour looking toward the sun (for fog). */
  horizon(sun) {
    const tmp = [0, 0, 0];
    const avg = [0, 0, 0];
    // Sample slightly above the horizon: the last few degrees are a thin,
    // heavily extinct band that would tint all fog brown at sunset.
    const dir = { x: 0, y: 0.12, z: 0 };
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      dir.x = Math.cos(a) * 0.993;
      dir.z = Math.sin(a) * 0.993;
      this.radiance(dir, sun, tmp);
      avg[0] += tmp[0] / n;
      avg[1] += tmp[1] / n;
      avg[2] += tmp[2] / n;
    }
    const h = Math.hypot(sun.x, sun.z) || 1;
    const toward = this.radiance({ x: (sun.x / h) * 0.993, y: 0.12, z: (sun.z / h) * 0.993 }, sun, [0, 0, 0]);
    return { average: avg, toward };
  }
}

export const luminance = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
