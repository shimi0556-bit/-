import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";
import { gsap, ScrollTrigger } from "../../lib/gsap";
import { FrameScrubber } from "../../lib/frameScrubber";
import { MLP } from "../../lib/ml";
import type { Point } from "../../lib/ml";
import { usePrefersReducedMotion, useIsMobile } from "../../lib/hooks";
import { asset } from "../../lib/asset";
import { Eyebrow, EqnRow, Reveal, TeachList } from "../ui";

const FRAME_COUNT = 121;

// Fixed sine dataset (deterministic). x in [-3,3] (tanh-friendly), y = sin(x).
function makeSineData(n = 40): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const x = -3 + (6 * i) / (n - 1);
    pts.push({ x, y: Math.sin(x) });
  }
  return pts;
}
const DATA = makeSineData(40);

const X_MIN = -3.4;
const X_MAX = 3.4;
const Y_MIN = -1.45;
const Y_MAX = 1.45;

const BEATS = [
  {
    title: "A network adjusts itself.",
    body: "No human turns the knobs. The network runs, sees how wrong it is, and corrects — over and over.",
  },
  {
    title: "Forward, then measure.",
    body: "It pushes each input through to a guess, then scores the guess with the same squared-error loss as the line.",
  },
  {
    title: "Backprop sends the error backward.",
    body: "Every weight learns its share of the blame — then takes the same tiny downhill step. Repeat thousands of times.",
  },
];

export function MlpSection() {
  const reduced = usePrefersReducedMotion();
  const isMobile = useIsMobile();

  // scrub-intro refs
  const introRef = useRef<HTMLDivElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const scrubCanvasRef = useRef<HTMLCanvasElement>(null);
  const [beat, setBeat] = useState(0);

  // lab refs
  const plotRef = useRef<HTMLCanvasElement>(null);
  const lossRef = useRef<HTMLCanvasElement>(null);
  const netRef = useRef<HTMLCanvasElement>(null);
  const plotWrapRef = useRef<HTMLDivElement>(null);

  const [h, setH] = useState(6);
  const [lr, setLr] = useState(0.1);
  const [training, setTraining] = useState(false);
  const [epoch, setEpoch] = useState(0);
  const [curLoss, setCurLoss] = useState(1);

  const mlpRef = useRef<MLP>(new MLP([1, 6, 6, 1], 42));
  const historyRef = useRef<number[]>([]);
  const rafRef = useRef(0);
  const epochRef = useRef(0);
  const lrRef = useRef(0.1);
  const seedRef = useRef(42);

  useEffect(() => {
    lrRef.current = lr;
  }, [lr]);

  /* ---------- nn2 scrub intro ---------- */
  useEffect(() => {
    if (reduced) return;
    const intro = introRef.current;
    const pin = pinRef.current;
    const canvas = scrubCanvasRef.current;
    if (!intro || !pin || !canvas) return;

    const scrubber = new FrameScrubber({
      basePath: asset("/frames/nn2"),
      frameCount: FRAME_COUNT,
      padWidth: 3,
      stride: isMobile ? 2 : 1,
    });
    scrubber.attach(canvas);
    scrubber.start();
    // lazy-load the 11MB of frames only when the section approaches the viewport
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          scrubber.preload();
          io.disconnect();
        }
      },
      { rootMargin: "800px" },
    );
    io.observe(intro);
    const onResize = () => scrubber.resize();
    const rafId = requestAnimationFrame(() => scrubber.resize());
    window.addEventListener("resize", onResize);

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: intro,
        start: "top top",
        end: "+=320%",
        pin,
        scrub: 0.6,
        onUpdate: (self) => {
          const p = self.progress;
          scrubber.setProgress(p);
          const nb = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
          setBeat((prev) => (prev === nb ? prev : nb));
        },
      });
    }, intro);

    return () => {
      cancelAnimationFrame(rafId);
      io.disconnect();
      ctx.revert();
      window.removeEventListener("resize", onResize);
      scrubber.destroy();
    };
  }, [reduced, isMobile]);

  /* ---------- lab drawing ---------- */
  const sizeCanvas = (canvas: HTMLCanvasElement, w: number, hgt: number) => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(hgt * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = hgt + "px";
    }
    const ctx = canvas.getContext("2d");
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    return ctx;
  };

  const drawPlot = useCallback(() => {
    const canvas = plotRef.current;
    const wrap = plotWrapRef.current;
    if (!canvas || !wrap) return;
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const ctx = sizeCanvas(canvas, W, H);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const padL = 30,
      padR = 14,
      padT = 12,
      padB = 22;
    const pw = W - padL - padR;
    const ph = H - padT - padB;
    const tx = (x: number) => padL + ((x - X_MIN) / (X_MAX - X_MIN)) * pw;
    const ty = (y: number) => padT + (1 - (y - Y_MIN) / (Y_MAX - Y_MIN)) * ph;

    // grid + zero axis
    ctx.strokeStyle = "rgba(238,241,255,0.06)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let gx = -3; gx <= 3; gx++) {
      ctx.moveTo(tx(gx), padT);
      ctx.lineTo(tx(gx), padT + ph);
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(238,241,255,0.22)";
    ctx.beginPath();
    ctx.moveTo(padL, ty(0));
    ctx.lineTo(padL + pw, ty(0));
    ctx.stroke();

    // target points (the sine the net must learn)
    ctx.fillStyle = "rgba(155,48,255,0.85)";
    for (const p of DATA) {
      ctx.beginPath();
      ctx.arc(tx(p.x), ty(p.y), 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // the network's current fitted curve
    ctx.save();
    ctx.strokeStyle = "rgba(0,229,255,0.95)";
    ctx.lineWidth = 2.6;
    ctx.shadowColor = "rgba(0,229,255,0.7)";
    ctx.shadowBlur = 12;
    ctx.beginPath();
    const STEPS = 160;
    for (let i = 0; i <= STEPS; i++) {
      const x = X_MIN + ((X_MAX - X_MIN) * i) / STEPS;
      const y = mlpRef.current.predict(x);
      const px = tx(x);
      const py = ty(Math.max(Y_MIN, Math.min(Y_MAX, y)));
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }, []);

  const drawLoss = useCallback(() => {
    const canvas = lossRef.current;
    if (!canvas) return;
    const W = canvas.clientWidth || 240;
    const H = canvas.clientHeight || 90;
    const ctx = sizeCanvas(canvas, W, H);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const hist = historyRef.current;
    if (hist.length < 2) return;
    const maxL = Math.max(...hist, 0.001);
    const pad = 6;
    ctx.save();
    ctx.strokeStyle = "rgba(255,45,155,0.9)";
    ctx.lineWidth = 2;
    ctx.shadowColor = "rgba(255,45,155,0.6)";
    ctx.shadowBlur = 8;
    ctx.beginPath();
    for (let i = 0; i < hist.length; i++) {
      const x = pad + (i / (hist.length - 1)) * (W - pad * 2);
      const y = pad + (1 - hist[i] / maxL) * (H - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }, []);

  const drawNet = useCallback(() => {
    const canvas = netRef.current;
    if (!canvas) return;
    const W = canvas.clientWidth || 240;
    const H = canvas.clientHeight || 150;
    const ctx = sizeCanvas(canvas, W, H);
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const net = mlpRef.current;
    const sizes = net.sizes;
    const acts = net.meanAbsActivations(DATA); // [layer1(H), layer2(H)]
    let maxA = 0.0001;
    for (const layer of acts) for (const v of layer) maxA = Math.max(maxA, v);

    const colX = (c: number) => 24 + (c * (W - 48)) / (sizes.length - 1);
    const nodeY = (count: number, i: number) => (H * (i + 1)) / (count + 1);
    const positions = sizes.map((count, c) =>
      Array.from({ length: count }, (_, i) => ({ x: colX(c), y: nodeY(count, i) })),
    );

    // edges
    ctx.strokeStyle = "rgba(155,48,255,0.14)";
    ctx.lineWidth = 0.6;
    for (let c = 0; c < positions.length - 1; c++) {
      for (const a of positions[c])
        for (const b of positions[c + 1]) {
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
    }
    // nodes (hidden layers glow by activation)
    positions.forEach((col, c) => {
      col.forEach((nd, i) => {
        let glow = 0.35;
        let color = "0,229,255";
        if (c === 0) color = "46,107,255";
        else if (c === sizes.length - 1) color = "255,45,155";
        else {
          glow = acts[c - 1] ? Math.min(1, acts[c - 1][i] / maxA) : 0.4;
          color = "155,48,255";
        }
        ctx.beginPath();
        ctx.fillStyle = `rgba(${color}, ${0.4 + glow * 0.6})`;
        ctx.shadowColor = `rgba(${color}, ${glow})`;
        ctx.shadowBlur = 4 + glow * 16;
        ctx.arc(nd.x, nd.y, 4 + glow * 3, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }, []);

  const redrawAll = useCallback(() => {
    drawPlot();
    drawLoss();
    drawNet();
  }, [drawPlot, drawLoss, drawNet]);

  const rebuild = useCallback(
    (hidden: number) => {
      seedRef.current += 1;
      mlpRef.current = new MLP([1, hidden, hidden, 1], seedRef.current);
      historyRef.current = [];
      epochRef.current = 0;
      setEpoch(0);
      setCurLoss(mlpRef.current.loss(DATA));
      redrawAll();
    },
    [redrawAll],
  );

  // init + on H change
  useEffect(() => {
    rebuild(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h]);

  useEffect(() => {
    const onResize = () => redrawAll();
    window.addEventListener("resize", onResize);
    requestAnimationFrame(redrawAll);
    return () => window.removeEventListener("resize", onResize);
  }, [redrawAll]);

  const stop = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
  };

  const toggleTrain = () => {
    if (training) {
      stop();
      setTraining(false);
      return;
    }
    setTraining(true);
    const EPOCHS_PER_FRAME = reduced ? 0 : isMobile ? 2 : 4;
    const run = () => {
      let last = 0;
      const k = EPOCHS_PER_FRAME;
      for (let i = 0; i < k; i++) {
        last = mlpRef.current.trainEpoch(DATA, lrRef.current);
        epochRef.current += 1;
      }
      historyRef.current.push(last);
      if (historyRef.current.length > 600) historyRef.current.shift();
      setEpoch(epochRef.current);
      setCurLoss(last);
      redrawAll();
      if (epochRef.current < 6000) rafRef.current = requestAnimationFrame(run);
      else {
        setTraining(false);
        stop();
      }
    };
    if (reduced) {
      // run a bounded batch synchronously, no animation
      for (let i = 0; i < 2500; i++) {
        const l = mlpRef.current.trainEpoch(DATA, lrRef.current);
        epochRef.current += 1;
        if (i % 25 === 0) historyRef.current.push(l);
      }
      setEpoch(epochRef.current);
      setCurLoss(mlpRef.current.loss(DATA));
      redrawAll();
      setTraining(false);
      return;
    }
    rafRef.current = requestAnimationFrame(run);
  };

  const reset = () => {
    stop();
    setTraining(false);
    rebuild(h);
  };

  useEffect(() => () => stop(), []);

  const teach = [
    {
      heading: "A straight line can only tilt.",
      body: (
        <>
          One slope, one height — that's all a line has. A wave rises, falls, and rises again; no
          single straight line can follow it. It will always cut across. To fit a curve, we need
          something that can <i>bend</i>.
        </>
      ),
    },
    {
      heading: "Each hidden neuron adds one bend.",
      body: (
        <>
          A neuron does the same <b>w·x + b</b> mix as the line, then bends it with a smooth squish
          (here <b>tanh</b>, an S-curve). One neuron = one gentle bend. Add many bends and stack two
          layers, and the network can shape almost any smooth curve.
        </>
      ),
    },
    {
      heading: "Backprop, then the same nudge.",
      body: (
        <>
          The net guesses (forward), scores the error (MSE), then <b>backprop</b> walks that error
          backward, giving every weight its share of the blame. Each weight then takes the very same
          step as the line — <b>w := w − η·∂L/∂w</b>. Thousands of tiny identical nudges, and the
          curve bends to fit.
        </>
      ),
    },
  ];

  return (
    <>
      {/* ---------- nn2 scrub intro ---------- */}
      {reduced ? (
        <section id="mlp" className="sec sec-mlp">
          <div className="container">
            <Eyebrow>now it tunes itself</Eyebrow>
            <h2 className="neon">
              <span className="block">The Network</span>
              <span className="block neon-purple">Adjusts</span>
            </h2>
            <img
              src={asset("/frames/nn2/frame-061.jpg")}
              alt="A neural network adjusting its weights"
              className="mt-6 w-full rounded-2xl"
              loading="lazy"
            />
            <div className="mt-6 grid gap-4 md:grid-cols-3">
              {BEATS.map((b) => (
                <div key={b.title} className="glass p-5">
                  <h3 className="mb-1 text-lg text-cream">{b.title}</h3>
                  <p className="m-0 text-cream-2">{b.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <section id="mlp" className="sec-mlp relative">
          <div ref={introRef}>
            <div ref={pinRef} className="relative h-screen w-full overflow-hidden">
              {/* the footage — full opacity, fully visible */}
              <canvas
                ref={scrubCanvasRef}
                className="absolute inset-0 block h-full w-full"
                aria-hidden="true"
              />
              {/* light edge scrims only: top (header) + left (beats). Centre/right stays clear. */}
              <div className="scrim-t pointer-events-none absolute inset-x-0 top-0 h-[30%]" aria-hidden="true" />
              <div className="scrim-l pointer-events-none absolute inset-0" aria-hidden="true" />

              {/* header — top-left, no panel */}
              <div className="absolute inset-x-0 top-0 z-10 px-5 pt-20 sm:px-8">
                <div className="mx-auto max-w-content">
                  <Eyebrow className="legible">now it tunes itself</Eyebrow>
                  <h2 className="neon legible text-[clamp(1.8rem,4.5vw,3.2rem)]">
                    The Network <span className="neon-purple">Adjusts</span>
                  </h2>
                </div>
              </div>

              {/* beats — bottom-LEFT, compact, crossfading, just shadow (no panel) */}
              <div className="absolute inset-x-0 bottom-16 z-[5] px-5 sm:px-8">
                <div className="relative mx-auto h-[180px] max-w-content sm:h-[150px]">
                  {BEATS.map((b, i) => (
                    <div
                      key={i}
                      className="absolute bottom-0 left-0 max-w-md transition-all duration-500 ease-out-expo"
                      style={{
                        opacity: beat === i ? 1 : 0,
                        transform: `translateY(${beat === i ? 0 : 12}px)`,
                        pointerEvents: "none",
                      }}
                    >
                      <span className="legible mb-1 block font-mono text-xs text-cream-3">
                        step {i + 1} of 3
                      </span>
                      <h3 className="neon-purple legible mb-1.5 text-2xl sm:text-3xl">{b.title}</h3>
                      <p className="legible m-0 text-cream">{b.body}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 text-center">
                <span className="pill no-dot legible">scroll — watch it learn</span>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ---------- the live MLP lab ---------- */}
      <section className="sec sec-mlp">
        <div className="container">
          <Reveal>
            <Eyebrow>let it fit a curve</Eyebrow>
            <h2 className="neon">
              <span className="block">Bend, Don't</span>
              <span className="block neon-purple">Just Tilt</span>
            </h2>
            <p className="max-w-2xl text-cream-2">
              A 1→6→6→1 network, learning to trace a sine wave a straight line could never follow.
              Press train — every weight runs real forward passes and backprop, and the cyan curve
              bends toward the purple data.
            </p>
          </Reveal>

          <div className="mt-10 grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
            <Reveal>
              <div className="glass p-5 sm:p-6">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-cream-3">cyan = network · purple = target (sin x)</span>
                  <span className="text-right" aria-live="polite">
                    <span className="block text-xs uppercase tracking-[0.14em] text-cream-3">
                      Loss (MSE)
                    </span>
                    <span
                      className="font-display text-2xl tabular-nums"
                      style={{ color: "var(--cyan)", textShadow: "0 0 16px rgba(0,229,255,0.6)" }}
                    >
                      {curLoss.toFixed(4)}
                    </span>
                  </span>
                </div>
                <div
                  ref={plotWrapRef}
                  className="relative h-[260px] w-full overflow-hidden rounded-xl sm:h-[320px]"
                  style={{ background: "rgba(5,0,8,0.5)", border: "1px solid rgba(155,48,255,0.18)" }}
                >
                  <canvas ref={plotRef} className="block h-full w-full" />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-[0.12em] text-cream-3">
                      loss curve
                    </div>
                    <div
                      className="h-[90px] w-full overflow-hidden rounded-lg"
                      style={{ background: "rgba(5,0,8,0.5)", border: "1px solid rgba(255,45,155,0.18)" }}
                    >
                      <canvas ref={lossRef} className="block h-full w-full" />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs uppercase tracking-[0.12em] text-cream-3">
                      neurons glow by activity
                    </div>
                    <div
                      className="h-[90px] w-full overflow-hidden rounded-lg"
                      style={{ background: "rgba(5,0,8,0.5)", border: "1px solid rgba(155,48,255,0.18)" }}
                    >
                      <canvas ref={netRef} className="block h-full w-full" />
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <div className="mb-0.5 flex justify-between text-sm">
                      <span className="text-cream-2">learning rate η</span>
                      <span className="tabular-nums text-cyan">{lr.toFixed(3)}</span>
                    </div>
                    <input
                      className="slider slider-cyan"
                      type="range"
                      min={0.01}
                      max={0.3}
                      step={0.005}
                      value={lr}
                      aria-label="learning rate"
                      onChange={(e) => setLr(parseFloat(e.target.value))}
                    />
                  </label>
                  <label className="block">
                    <div className="mb-0.5 flex justify-between text-sm">
                      <span className="text-cream-2">neurons per layer</span>
                      <span className="tabular-nums text-cream">{h}</span>
                    </div>
                    <input
                      className="slider slider-purple"
                      type="range"
                      min={2}
                      max={12}
                      step={1}
                      value={h}
                      disabled={training}
                      aria-label="neurons per hidden layer"
                      onChange={(e) => setH(parseInt(e.target.value, 10))}
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <span className="font-mono text-sm text-cream-3">
                    epoch <span className="tabular-nums text-cream">{epoch}</span>{" "}
                    <span className="text-cream-3">(one full pass over the points)</span> · 1→{h}→{h}→1
                  </span>
                  <div className="flex gap-2">
                    <button type="button" className="cta-primary px-5 py-2.5 text-sm" onClick={toggleTrain}>
                      {training ? <Pause size={15} /> : <Play size={15} />}
                      {training ? "Pause" : "Train"}
                    </button>
                    <button type="button" className="cta-ghost px-4 py-2.5 text-sm" onClick={reset}>
                      <RotateCcw size={15} /> Reset
                    </button>
                  </div>
                </div>
              </div>
            </Reveal>

            <div>
              <TeachList beats={teach} hue="purple" />
              <Reveal className="mt-6">
                <EqnRow
                  label="forward — one dense layer (then a smooth squish)"
                  tex="\mathbf{z} = \mathbf{W}\mathbf{a} + \mathbf{b}, \quad \mathbf{a}' = \tanh(\mathbf{z})"
                  plain="exactly Level 1's w·x+b, but with many weights at once; tanh bends the straight mix into a curve. The output layer skips the squish so it can reach any value."
                />
                <EqnRow
                  label="loss — still mean squared error"
                  tex="L = \dfrac{1}{N}\sum_{s}\left(\hat{y}_s - y_s\right)^2"
                  plain="the same squared-gap average as the line, now over the whole batch of points."
                />
                <EqnRow
                  label="backprop — blame flows backward (tanh derivative = 1 − a²)"
                  tex="\delta^{(l)} = \big({\mathbf{W}^{(l+1)}}^{\top}\delta^{(l+1)}\big)\odot\left(1 - {\mathbf{a}^{(l)}}^{2}\right)"
                  plain="each layer's blame δ is the next layer's blame pulled back through the weights, scaled by how sensitive the squish was."
                />
                <EqnRow
                  label="the update — unchanged from Level 1"
                  tex="\theta := \theta - \eta\,\dfrac{\partial L}{\partial \theta}"
                  plain="every weight and bias θ takes the same downhill step. Only the count of numbers grew."
                />
              </Reveal>
            </div>
          </div>

          <Reveal className="mt-10">
            <p className="max-w-2xl text-lg text-cream">
              Same update rule, more knobs composed —{" "}
              <b className="neon-purple">so it can bend, not just tilt.</b>
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
