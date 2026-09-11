/* ============================================================
   ml.ts — REAL machine-learning math, computed honestly in JS.
   Source of truth: /tmp/nn_specs/ml-spec.md (gradient-checked).

   Three operations are kept strictly separate everywhere:
     forward()  — input -> prediction
     backward() — gradients only (output -> input); changes nothing
     step()     — apply  p := p - eta * dL/dp
   ============================================================ */

export interface Point {
  x: number;
  y: number;
}

/* ---------------------------------------------------------------
   LEVEL 1 — Linear regression  y_hat = w*x + b,  loss = MSE
   --------------------------------------------------------------- */

export function linPredict(w: number, b: number, x: number): number {
  return w * x + b;
}

/** Mean Squared Error: L = (1/n) Σ (y_hat_i - y_i)^2 */
export function mse(points: Point[], w: number, b: number): number {
  const n = points.length;
  if (n === 0) return 0;
  let s = 0;
  for (const p of points) {
    const e = w * p.x + b - p.y;
    s += e * e;
  }
  return s / n;
}

/** Exact gradients (factor of 2 kept): dL/dw = (2/n)Σ e_i x_i, dL/db = (2/n)Σ e_i */
export function linGradients(
  points: Point[],
  w: number,
  b: number,
): { dw: number; db: number } {
  const n = points.length;
  if (n === 0) return { dw: 0, db: 0 };
  let gw = 0;
  let gb = 0;
  for (const p of points) {
    const e = w * p.x + b - p.y;
    gw += e * p.x;
    gb += e;
  }
  return { dw: (2 / n) * gw, db: (2 / n) * gb };
}

/** One gradient-descent step. Returns new params AND the gradients used. */
export function linStep(
  points: Point[],
  w: number,
  b: number,
  eta: number,
): { w: number; b: number; dw: number; db: number } {
  const { dw, db } = linGradients(points, w, b);
  return { w: w - eta * dw, b: b - eta * db, dw, db };
}

/* ---------------------------------------------------------------
   Deterministic RNG (mulberry32) so weight init is reproducible.
   --------------------------------------------------------------- */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller standard normal from a uniform generator. */
function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* ---------------------------------------------------------------
   LEVEL 2 — MLP for regression. sizes e.g. [1,6,6,1].
   tanh on hidden layers, LINEAR output. Trained by the same GD.

   Index convention (matches ml-spec §B.3/B.6):
     a[0]        = input activations            (length sizes[0])
     a[l]        = activations of layer l        (length sizes[l]), l = 1..L
     z[l]        = pre-activations of layer l     (length sizes[l]), l = 1..L
     W[l]        = weights mapping a[l] -> z[l+1] (sizes[l+1] x sizes[l]), l = 0..L-1
     B[l]        = biases for z[l+1]              (length sizes[l+1]),     l = 0..L-1
   --------------------------------------------------------------- */

export interface ForwardCache {
  a: number[][]; // a[0..nLayers-1]
  z: number[][]; // z[0..nLayers-1]  (z[0] unused, kept for index alignment)
  y: number; // scalar prediction (single output)
}

export class MLP {
  readonly sizes: number[];
  W: number[][][]; // W[l][i][j]
  B: number[][]; // B[l][i]
  private rng: () => number;

  constructor(sizes: number[], seed = 1234) {
    this.sizes = sizes.slice();
    this.rng = mulberry32(seed);
    this.W = [];
    this.B = [];
    this.initWeights();
  }

  /** Xavier-ish init: std = sqrt(1/fan_in); biases zero. Breaks symmetry. */
  initWeights(): void {
    this.W = [];
    this.B = [];
    for (let l = 0; l < this.sizes.length - 1; l++) {
      const fanIn = this.sizes[l];
      const fanOut = this.sizes[l + 1];
      const std = Math.sqrt(1 / fanIn);
      const wl: number[][] = [];
      const bl: number[] = [];
      for (let i = 0; i < fanOut; i++) {
        const row: number[] = [];
        for (let j = 0; j < fanIn; j++) row.push(gaussian(this.rng) * std);
        wl.push(row);
        bl.push(0);
      }
      this.W.push(wl);
      this.B.push(bl);
    }
  }

  /** FORWARD PASS (input -> output). Fills and returns activation caches. */
  forward(x: number): ForwardCache {
    const nLayers = this.sizes.length;
    const a: number[][] = new Array(nLayers);
    const z: number[][] = new Array(nLayers);
    a[0] = [x];
    z[0] = [x];
    for (let l = 1; l < nLayers; l++) {
      const isOutput = l === nLayers - 1;
      const zl: number[] = new Array(this.sizes[l]);
      const al: number[] = new Array(this.sizes[l]);
      const Wl = this.W[l - 1];
      const Bl = this.B[l - 1];
      const aPrev = a[l - 1];
      for (let i = 0; i < this.sizes[l]; i++) {
        let s = Bl[i];
        const row = Wl[i];
        for (let j = 0; j < aPrev.length; j++) s += row[j] * aPrev[j];
        zl[i] = s;
        al[i] = isOutput ? s : Math.tanh(s); // LINEAR output, tanh hidden
      }
      z[l] = zl;
      a[l] = al;
    }
    return { a, z, y: a[nLayers - 1][0] };
  }

  predict(x: number): number {
    return this.forward(x).y;
  }

  /** MSE over the batch (no update). */
  loss(points: Point[]): number {
    let s = 0;
    for (const p of points) {
      const e = this.predict(p.x) - p.y;
      s += e * e;
    }
    return points.length ? s / points.length : 0;
  }

  /** Mean |activation| per HIDDEN layer over the dataset (for the glow viz). */
  meanAbsActivations(points: Point[]): number[][] {
    const nLayers = this.sizes.length;
    const sums: number[][] = [];
    for (let l = 1; l < nLayers - 1; l++) sums.push(new Array(this.sizes[l]).fill(0));
    if (points.length === 0) return sums;
    for (const p of points) {
      const { a } = this.forward(p.x);
      for (let l = 1; l < nLayers - 1; l++) {
        for (let i = 0; i < this.sizes[l]; i++) sums[l - 1][i] += Math.abs(a[l][i]);
      }
    }
    return sums.map((layer) => layer.map((v) => v / points.length));
  }

  /**
   * BACKPROP (gradients only) accumulated over the batch, then the GD STEP.
   * Returns the pre-update MSE so a learning curve can be plotted.
   */
  trainEpoch(points: Point[], eta: number): number {
    const N = points.length;
    if (N === 0) return 0;
    const nLayers = this.sizes.length;

    // zero gradient accumulators (same shape as W, B)
    const dW: number[][][] = this.W.map((wl) => wl.map((row) => row.map(() => 0)));
    const dB: number[][] = this.B.map((bl) => bl.map(() => 0));

    let lossSum = 0;

    for (const p of points) {
      const { a, z, y } = this.forward(p.x);
      const err = y - p.y;
      lossSum += err * err;

      // delta[l] = dL/dz[l]
      const delta: number[][] = new Array(nLayers);
      // output layer (linear): delta = dL/da = 2*(y_hat - y)
      delta[nLayers - 1] = [2 * err];

      // hidden layers: delta[l][j] = (Σ_i W[l][i][j]·delta[l+1][i]) · (1 - a[l][j]^2)
      for (let l = nLayers - 2; l >= 1; l--) {
        const Wnext = this.W[l]; // maps a[l] -> z[l+1]
        const dNext = delta[l + 1];
        const dl: number[] = new Array(this.sizes[l]);
        for (let j = 0; j < this.sizes[l]; j++) {
          let s = 0;
          for (let i = 0; i < this.sizes[l + 1]; i++) s += Wnext[i][j] * dNext[i];
          const aj = a[l][j];
          dl[j] = s * (1 - aj * aj); // tanh'(z) = 1 - a^2
        }
        delta[l] = dl;
      }
      // silence the "z computed but only a used in hidden delta" — z drives nothing extra
      void z;

      // accumulate parameter gradients:
      // dW[l][i][j] += delta[l+1][i] * a[l][j] ; dB[l][i] += delta[l+1][i]
      for (let l = 0; l < nLayers - 1; l++) {
        const dOut = delta[l + 1];
        const aPrev = a[l];
        for (let i = 0; i < this.sizes[l + 1]; i++) {
          const di = dOut[i];
          const dWl = dW[l][i];
          for (let j = 0; j < this.sizes[l]; j++) dWl[j] += di * aPrev[j];
          dB[l][i] += di;
        }
      }
    }

    // average gradients over the batch and APPLY the update step
    const invN = 1 / N;
    for (let l = 0; l < nLayers - 1; l++) {
      for (let i = 0; i < this.sizes[l + 1]; i++) {
        const Wl = this.W[l][i];
        const dWl = dW[l][i];
        for (let j = 0; j < this.sizes[l]; j++) Wl[j] -= eta * (dWl[j] * invN);
        this.B[l][i] -= eta * (dB[l][i] * invN);
      }
    }

    return lossSum * invN; // pre-update MSE
  }
}

/* ---------------------------------------------------------------
   LEVEL 3 — Softmax + Cross-entropy (next-token).
   --------------------------------------------------------------- */

/** Numerically-stable softmax (max-subtraction). */
export function softmax(logits: number[]): number[] {
  if (logits.length === 0) return [];
  let m = -Infinity;
  for (const z of logits) if (z > m) m = z;
  const ex = logits.map((z) => Math.exp(z - m));
  let s = 0;
  for (const e of ex) s += e;
  return ex.map((e) => e / s);
}

/** Cross-entropy = -log(p_true) = "how surprised the model was by the truth". */
export function crossEntropy(probs: number[], trueIdx: number): number {
  return -Math.log(Math.max(probs[trueIdx] ?? 1e-12, 1e-12));
}

/** The clean gradient dL/dz_k = p_k - onehot_t(k). */
export function softmaxCrossEntropyGrad(probs: number[], trueIdx: number): number[] {
  return probs.map((p, k) => p - (k === trueIdx ? 1 : 0));
}

/* ---------------------------------------------------------------
   Finite-difference gradient checks (runtime evidence of correctness).
   runMathSelfTest() returns a report; call it once in DEV.
   --------------------------------------------------------------- */

function maxRelError(analytic: number[], numeric: number[]): number {
  let m = 0;
  for (let i = 0; i < analytic.length; i++) {
    const denom = Math.max(1e-8, Math.abs(analytic[i]) + Math.abs(numeric[i]));
    m = Math.max(m, Math.abs(analytic[i] - numeric[i]) / denom);
  }
  return m;
}

export interface SelfTestReport {
  ok: boolean;
  checks: { name: string; maxRelError: number; pass: boolean }[];
}

export function runMathSelfTest(): SelfTestReport {
  const eps = 1e-6;
  const checks: SelfTestReport["checks"] = [];

  // 1) Linear-regression gradient vs central differences
  {
    const pts: Point[] = [
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7.5 },
      { x: 4, y: 9 },
    ];
    const w = 0.4;
    const b = -0.2;
    const { dw, db } = linGradients(pts, w, b);
    const numDw = (mse(pts, w + eps, b) - mse(pts, w - eps, b)) / (2 * eps);
    const numDb = (mse(pts, w, b + eps) - mse(pts, w, b - eps)) / (2 * eps);
    checks.push({
      name: "linreg gradient",
      maxRelError: maxRelError([dw, db], [numDw, numDb]),
      pass: maxRelError([dw, db], [numDw, numDb]) < 1e-4,
    });
  }

  // 2) MLP backprop vs central differences on a tiny [1,3,3,1] tanh net
  {
    const pts: Point[] = [
      { x: -1.2, y: Math.sin(-1.2) },
      { x: 0.3, y: Math.sin(0.3) },
      { x: 1.7, y: Math.sin(1.7) },
    ];
    const net = new MLP([1, 3, 3, 1], 7);

    // analytic gradients (re-derive without stepping): clone, accumulate
    const nLayers = net.sizes.length;
    const dW = net.W.map((wl) => wl.map((row) => row.map(() => 0)));
    const dB = net.B.map((bl) => bl.map(() => 0));
    for (const p of pts) {
      const { a, y } = net.forward(p.x);
      const err = y - p.y;
      const delta: number[][] = new Array(nLayers);
      delta[nLayers - 1] = [2 * err];
      for (let l = nLayers - 2; l >= 1; l--) {
        const Wnext = net.W[l];
        const dNext = delta[l + 1];
        const dl: number[] = new Array(net.sizes[l]);
        for (let j = 0; j < net.sizes[l]; j++) {
          let s = 0;
          for (let i = 0; i < net.sizes[l + 1]; i++) s += Wnext[i][j] * dNext[i];
          dl[j] = s * (1 - a[l][j] * a[l][j]);
        }
        delta[l] = dl;
      }
      for (let l = 0; l < nLayers - 1; l++) {
        const dOut = delta[l + 1];
        for (let i = 0; i < net.sizes[l + 1]; i++) {
          for (let j = 0; j < net.sizes[l]; j++) dW[l][i][j] += dOut[i] * a[l][j];
          dB[l][i] += dOut[i];
        }
      }
    }
    const invN = 1 / pts.length;

    const analytic: number[] = [];
    const numeric: number[] = [];
    for (let l = 0; l < nLayers - 1; l++) {
      for (let i = 0; i < net.sizes[l + 1]; i++) {
        for (let j = 0; j < net.sizes[l]; j++) {
          analytic.push(dW[l][i][j] * invN);
          const orig = net.W[l][i][j];
          net.W[l][i][j] = orig + eps;
          const lp = net.loss(pts);
          net.W[l][i][j] = orig - eps;
          const lm = net.loss(pts);
          net.W[l][i][j] = orig;
          numeric.push((lp - lm) / (2 * eps));
        }
      }
    }
    const mre = maxRelError(analytic, numeric);
    checks.push({ name: "mlp backprop", maxRelError: mre, pass: mre < 1e-3 });
  }

  // 3) Softmax + cross-entropy gradient vs central differences
  {
    const logits = [2.0, 3.0, 1.0, 0.0];
    const t = 0;
    const grad = softmaxCrossEntropyGrad(softmax(logits), t);
    const numeric = logits.map((_, k) => {
      const lp = logits.slice();
      lp[k] += eps;
      const lm = logits.slice();
      lm[k] -= eps;
      return (crossEntropy(softmax(lp), t) - crossEntropy(softmax(lm), t)) / (2 * eps);
    });
    const mre = maxRelError(grad, numeric);
    checks.push({ name: "softmax x-entropy gradient", maxRelError: mre, pass: mre < 1e-4 });
  }

  return { ok: checks.every((c) => c.pass), checks };
}
