import { useCallback, useEffect, useRef, useState } from "react";
import { Play, RotateCcw, Trophy, AlertTriangle } from "lucide-react";
import type { Point } from "../../lib/ml";
import { mse, linGradients, linStep, linPredict } from "../../lib/ml";
import { usePrefersReducedMotion } from "../../lib/hooks";
import { Eyebrow, EqnRow, Reveal, TeachList, Pill } from "../ui";

// fixed, seeded data around the true line y = 2x + 1 (OLS best fit ~ w 1.99, b 1.11, MSE ~0.15)
const PTS: Point[] = [
  { x: 0.5, y: 2.3 },
  { x: 1.0, y: 2.7 },
  { x: 1.5, y: 4.4 },
  { x: 2.0, y: 4.6 },
  { x: 2.5, y: 6.5 },
  { x: 3.0, y: 6.8 },
  { x: 3.5, y: 8.6 },
  { x: 4.0, y: 8.7 },
];

const ETA_PRESETS = [
  { v: 0.005, label: "slow" },
  { v: 0.02, label: "just right" },
  { v: 0.12, label: "overshoot" },
];

const X_MIN = -0.5;
const X_MAX = 5;
const Y_MIN = -1;
const Y_MAX = 11;

interface LiveStep {
  fromW: number;
  fromB: number;
  dw: number;
  db: number;
  eta: number;
  w: number;
  b: number;
}

export function LinRegLab() {
  const reduced = usePrefersReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [w, setW] = useState(0);
  const [b, setB] = useState(0);
  const [eta, setEta] = useState(0.02);
  const [training, setTraining] = useState(false);
  const [won, setWon] = useState(false);
  const [status, setStatus] = useState<"idle" | "running" | "converged" | "diverged">("idle");
  const [live, setLive] = useState<LiveStep | null>(null);

  const wRef = useRef(0);
  const bRef = useRef(0);
  const etaRef = useRef(0.02);
  const rafRef = useRef(0);
  const stepsRef = useRef(0);

  useEffect(() => {
    wRef.current = w;
  }, [w]);
  useEffect(() => {
    bRef.current = b;
  }, [b]);
  useEffect(() => {
    etaRef.current = eta;
  }, [eta]);

  const loss = mse(PTS, w, b);

  useEffect(() => {
    if (loss < 0.5 && !won) setWon(true);
  }, [loss, won]);

  /* ---------- canvas drawing ---------- */
  const draw = useCallback((cw: number, cb: number) => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const padL = 34;
    const padR = 14;
    const padT = 14;
    const padB = 26;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const toX = (x: number) => padL + ((x - X_MIN) / (X_MAX - X_MIN)) * plotW;
    const toY = (y: number) => padT + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * plotH;

    // grid
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(238,241,255,0.06)";
    ctx.beginPath();
    for (let gx = 0; gx <= 5; gx++) {
      ctx.moveTo(toX(gx), padT);
      ctx.lineTo(toX(gx), padT + plotH);
    }
    for (let gy = 0; gy <= 10; gy += 2) {
      ctx.moveTo(padL, toY(gy));
      ctx.lineTo(padL + plotW, toY(gy));
    }
    ctx.stroke();

    // axes
    ctx.strokeStyle = "rgba(238,241,255,0.28)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(toX(0), padT);
    ctx.lineTo(toX(0), padT + plotH);
    ctx.moveTo(padL, toY(0));
    ctx.lineTo(padL + plotW, toY(0));
    ctx.stroke();

    ctx.fillStyle = "rgba(139,147,196,0.85)";
    ctx.font = "11px Inter, sans-serif";
    ctx.fillText("x", padL + plotW - 8, toY(0) - 6);
    ctx.fillText("y", toX(0) + 6, padT + 10);

    // error sticks (squared terms made visible) — drawn under points
    ctx.save();
    ctx.strokeStyle = "rgba(255,45,155,0.55)"; // pink residual highlight
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255,45,155,0.6)";
    ctx.shadowBlur = 8;
    for (const p of PTS) {
      const yhat = linPredict(cw, cb, p.x);
      ctx.beginPath();
      ctx.moveTo(toX(p.x), toY(p.y));
      ctx.lineTo(toX(p.x), toY(yhat));
      ctx.stroke();
    }
    ctx.restore();

    // line y = w x + b
    ctx.save();
    ctx.strokeStyle = "rgba(0,229,255,0.95)";
    ctx.lineWidth = 2.5;
    ctx.shadowColor = "rgba(0,229,255,0.7)";
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(toX(X_MIN), toY(linPredict(cw, cb, X_MIN)));
    ctx.lineTo(toX(X_MAX), toY(linPredict(cw, cb, X_MAX)));
    ctx.stroke();
    ctx.restore();

    // points
    ctx.save();
    for (const p of PTS) {
      ctx.beginPath();
      ctx.fillStyle = "rgba(0,229,255,0.9)";
      ctx.shadowColor = "rgba(0,229,255,0.9)";
      ctx.shadowBlur = 12;
      ctx.arc(toX(p.x), toY(p.y), 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.fillStyle = "#ffffff";
      ctx.shadowBlur = 0;
      ctx.arc(toX(p.x), toY(p.y), 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }, []);

  useEffect(() => {
    draw(w, b);
  }, [w, b, draw]);

  useEffect(() => {
    const onResize = () => draw(wRef.current, bRef.current);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [draw]);

  /* ---------- training ---------- */
  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  const startTrain = () => {
    if (training) return;
    stepsRef.current = 0;
    setStatus("running");
    setTraining(true);

    if (reduced) {
      // jump to convergence without per-frame animation
      let cw = wRef.current;
      let cbb = bRef.current;
      let last: LiveStep | null = null;
      for (let i = 0; i < 4000; i++) {
        const r = linStep(PTS, cw, cbb, etaRef.current);
        if (!isFinite(r.w) || !isFinite(r.b) || !isFinite(mse(PTS, r.w, r.b))) {
          setStatus("diverged");
          setTraining(false);
          return;
        }
        last = { fromW: cw, fromB: cbb, dw: r.dw, db: r.db, eta: etaRef.current, w: r.w, b: r.b };
        cw = r.w;
        cbb = r.b;
        if (Math.abs(r.dw) < 1e-3 && Math.abs(r.db) < 1e-3) break;
      }
      wRef.current = cw;
      bRef.current = cbb;
      setW(cw);
      setB(cbb);
      setLive(last);
      setStatus("converged");
      setTraining(false);
      return;
    }

    const tick = () => {
      const cw = wRef.current;
      const cbb = bRef.current;
      const r = linStep(PTS, cw, cbb, etaRef.current);
      if (!isFinite(r.w) || !isFinite(r.b) || !isFinite(mse(PTS, r.w, r.b))) {
        setStatus("diverged");
        setTraining(false);
        stop();
        return;
      }
      wRef.current = r.w;
      bRef.current = r.b;
      setW(r.w);
      setB(r.b);
      setLive({ fromW: cw, fromB: cbb, dw: r.dw, db: r.db, eta: etaRef.current, w: r.w, b: r.b });
      stepsRef.current += 1;
      if ((Math.abs(r.dw) < 1e-3 && Math.abs(r.db) < 1e-3) || stepsRef.current > 600) {
        setStatus("converged");
        setTraining(false);
        stop();
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const reset = () => {
    stop();
    setTraining(false);
    setStatus("idle");
    setLive(null);
    setWon(false);
    wRef.current = 0;
    bRef.current = 0;
    setW(0);
    setB(0);
  };

  useEffect(() => () => stop(), []);

  const grads = linGradients(PTS, w, b);

  const teach = [
    {
      heading: "A line is just two numbers.",
      body: (
        <>
          Any straight line is fully described by a slope <b>w</b> (how steep) and an intercept{" "}
          <b>b</b> (where it crosses the vertical axis). Change those two numbers and you can aim the
          line anywhere. Training will mean: find the two numbers that make the line hug the points.
        </>
      ),
    },
    {
      heading: "Loss = one number for “how wrong.”",
      body: (
        <>
          For each point, the gap between the line's height and the point's real height is the{" "}
          <i>error</i>. We boil all those gaps into a single score so we can tell if a change helped.
          That score is <b>MSE</b>: square each gap (so + and − can't cancel, and big misses hurt
          more), then average. Lower loss = better fit.
        </>
      ),
    },
    {
      heading: "The gradient = the downhill direction.",
      body: (
        <>
          Picture the loss as a landscape: each (w, b) is a spot, and the height is the loss. You
          want the lowest point. The <b>gradient</b> answers “which way is downhill, and how steep?”
          for each knob. Step the opposite way and the loss drops. The two partial derivatives below
          are exactly that slope (the factor of 2 comes from differentiating the square).
        </>
      ),
    },
    {
      heading: "Eta (η) = how big a step you take.",
      body: (
        <>
          The gradient says which way; <b>η</b> (the learning rate) says how far. Too small → correct
          but slow. Too big → you leap clear over the valley to a worse spot, the next slope is
          steeper, and the loss explodes. Try the <b>overshoot</b> preset and watch it happen.
        </>
      ),
    },
  ];

  return (
    <section id="linreg" className="sec sec-linreg">
      <div className="grid-bg" aria-hidden="true" />
      <div className="container">
        <Reveal>
          <Eyebrow>start with two numbers</Eyebrow>
          <h2 className="neon">
            <span className="block">Solve It</span>
            <span className="block neon-cyan">By Training</span>
          </h2>
          <p className="max-w-2xl text-cream-2">
            A straight line hides two numbers. Find them by hand, then let the math find them for you
            — the exact move that trains everything bigger.
          </p>
        </Reveal>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
          {/* ---------- the lab ---------- */}
          <Reveal>
            <div className="glass p-5 sm:p-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <span className="text-sm text-cream-3">The line, fit to 8 points</span>
                <span aria-live="polite" className="text-right">
                  <span className="block text-xs uppercase tracking-[0.14em] text-cream-3">
                    Loss (MSE)
                  </span>
                  <span
                    className="font-display text-3xl tabular-nums"
                    style={{
                      color: loss < 0.5 ? "var(--cyan)" : "var(--cream)",
                      textShadow:
                        loss < 0.5 ? "0 0 18px rgba(0,229,255,0.7)" : "0 0 14px rgba(238,241,255,0.25)",
                    }}
                  >
                    {loss.toFixed(3)}
                  </span>
                </span>
              </div>

              <div
                ref={wrapRef}
                className="relative h-[280px] w-full overflow-hidden rounded-xl sm:h-[340px]"
                style={{ background: "rgba(5,0,8,0.5)", border: "1px solid rgba(0,229,255,0.16)" }}
              >
                <canvas ref={canvasRef} className="block h-full w-full" />
              </div>

              {/* mini-game pill */}
              <div className="mt-4">
                {won ? (
                  <span
                    className="pill no-dot"
                    style={{
                      color: "var(--cream)",
                      background: "rgba(0,229,255,0.16)",
                      border: "1px solid rgba(0,229,255,0.6)",
                      boxShadow: "0 0 22px -4px rgba(0,229,255,0.8)",
                    }}
                  >
                    <Trophy size={14} /> Nice — 0.5 beaten. Now let the math do it.
                  </span>
                ) : (
                  <Pill noDot>🎯 Beat 0.5 — drag the sliders to get MSE under 0.5</Pill>
                )}
              </div>

              {/* sliders */}
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <div className="mb-0.5 flex items-center justify-between text-sm">
                    <span className="text-cream-2">
                      slope <b className="text-cream">w</b>
                    </span>
                    <span className="tabular-nums text-cyan">{w.toFixed(2)}</span>
                  </div>
                  <input
                    className="slider slider-cyan"
                    type="range"
                    min={-1}
                    max={4}
                    step={0.01}
                    value={w}
                    disabled={training}
                    aria-label="slope w"
                    onChange={(e) => setW(parseFloat(e.target.value))}
                  />
                </label>
                <label className="block">
                  <div className="mb-0.5 flex items-center justify-between text-sm">
                    <span className="text-cream-2">
                      intercept <b className="text-cream">b</b>
                    </span>
                    <span className="tabular-nums" style={{ color: "#7fa6ff" }}>
                      {b.toFixed(2)}
                    </span>
                  </div>
                  <input
                    className="slider slider-blue"
                    type="range"
                    min={-2}
                    max={4}
                    step={0.01}
                    value={b}
                    disabled={training}
                    aria-label="intercept b"
                    onChange={(e) => setB(parseFloat(e.target.value))}
                  />
                </label>
              </div>

              {/* eta + buttons */}
              <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="mb-1.5 text-sm text-cream-2">
                    learning rate <b className="text-cream">η</b>
                  </div>
                  <div className="flex gap-2" role="group" aria-label="learning rate presets">
                    {ETA_PRESETS.map((p) => (
                      <button
                        key={p.v}
                        type="button"
                        disabled={training}
                        onClick={() => setEta(p.v)}
                        className="inline-flex min-h-[44px] items-center rounded-full px-3.5 text-xs font-semibold transition-colors"
                        style={
                          eta === p.v
                            ? {
                                color: "var(--bg)",
                                background:
                                  p.v >= 0.12 ? "var(--orange)" : "var(--cyan)",
                                boxShadow: `0 0 18px -4px ${p.v >= 0.12 ? "rgba(255,122,26,0.8)" : "rgba(0,229,255,0.8)"}`,
                              }
                            : {
                                color: "var(--cream-2)",
                                background: "rgba(238,241,255,0.05)",
                                border: "1px solid rgba(238,241,255,0.16)",
                              }
                        }
                      >
                        {p.v} · {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="cta-primary px-5 py-2.5 text-sm"
                    onClick={startTrain}
                    disabled={training}
                  >
                    <Play size={15} /> {training ? "Training…" : "Train it"}
                  </button>
                  <button
                    type="button"
                    className="cta-ghost px-4 py-2.5 text-sm"
                    onClick={reset}
                  >
                    <RotateCcw size={15} /> Reset
                  </button>
                </div>
              </div>

              {/* live update-rule readout */}
              <div
                className="mt-5 rounded-xl p-4 font-mono text-[0.82rem] leading-relaxed"
                style={{ background: "rgba(5,0,8,0.55)", border: "1px solid rgba(238,241,255,0.1)" }}
                aria-live="polite"
              >
                {status === "diverged" ? (
                  <span className="flex items-center gap-2" style={{ color: "var(--orange)" }}>
                    <AlertTriangle size={15} /> η too big — overshooting. The step jumped past the
                    valley and the loss blew up. Reset and try “just right”.
                  </span>
                ) : live ? (
                  <div className="space-y-1">
                    <div className="text-cream-3">w := w − η · ∂L/∂w</div>
                    <div className="text-cream">
                      w := {live.fromW.toFixed(3)} − {live.eta} × ({live.dw.toFixed(2)}) ={" "}
                      <span className="text-cyan">{live.w.toFixed(3)}</span>
                    </div>
                    <div className="text-cream">
                      b := {live.fromB.toFixed(3)} − {live.eta} × ({live.db.toFixed(2)}) ={" "}
                      <span style={{ color: "#7fa6ff" }}>{live.b.toFixed(3)}</span>
                    </div>
                    {status === "converged" && (
                      <div className="pt-1 text-cyan">
                        converged — the gradients are ~0, so the line stopped moving. That's the
                        best fit.
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-cream-3">
                    current gradients: ∂L/∂w = {grads.dw.toFixed(2)}, ∂L/∂b = {grads.db.toFixed(2)} —
                    press <b className="text-cream">Train it</b> to step downhill.
                  </span>
                )}
              </div>
            </div>
          </Reveal>

          {/* ---------- teaching column ---------- */}
          <div className="accent-rule">
            <TeachList beats={teach} hue="cyan" />
            <Reveal className="mt-6">
              <EqnRow
                label="the model (a line)"
                tex="\hat{y}_i = w\,x_i + b"
                plain={
                  <>
                    the line's predicted height at input <i>xᵢ</i>; <b>w</b> is slope, <b>b</b> is
                    intercept, ŷ ("y-hat") is the prediction.
                  </>
                }
              />
              <EqnRow
                label="loss — mean squared error"
                tex="L = \dfrac{1}{n}\sum_{i=1}^{n}\left(\hat{y}_i - y_i\right)^2"
                plain="the average over n points of the squared gap between prediction and truth. The live number above IS this L."
              />
              <div className="grid gap-0 sm:grid-cols-2 sm:gap-3">
                <EqnRow
                  label="gradient w.r.t. w"
                  tex="\dfrac{\partial L}{\partial w} = \dfrac{2}{n}\sum_{i}(\hat{y}_i - y_i)\,x_i"
                  plain="each gap times its x, averaged, times two."
                />
                <EqnRow
                  label="gradient w.r.t. b"
                  tex="\dfrac{\partial L}{\partial b} = \dfrac{2}{n}\sum_{i}(\hat{y}_i - y_i)"
                  plain="just the averaged gaps, times two."
                />
              </div>
              <EqnRow
                label="the one mechanism — gradient descent"
                tex="w := w - \eta\,\dfrac{\partial L}{\partial w} \qquad b := b - \eta\,\dfrac{\partial L}{\partial b}"
                plain="replace each number with itself minus η times its downhill slope. Subtract, because we go downhill."
              />
            </Reveal>
          </div>
        </div>

        <Reveal className="mt-10">
          <p className="accent-rule max-w-2xl text-lg text-cream">
            You just trained a 2-parameter model.{" "}
            <b className="neon-cyan">Same idea — now scale it.</b>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
