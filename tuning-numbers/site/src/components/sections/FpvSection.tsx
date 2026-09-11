import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, ArrowDown, RotateCw } from "lucide-react";
import { gsap, ScrollTrigger } from "../../lib/gsap";
import { FrameScrubber } from "../../lib/frameScrubber";
import { usePrefersReducedMotion, useIsMobile } from "../../lib/hooks";
import { Katex } from "../../lib/Katex";
import { asset } from "../../lib/asset";
import { Eyebrow } from "../ui";

type Dir = "forward" | "turn" | "backprop" | "apply";

interface Station {
  n: number;
  dir: Dir;
  title: string;
  caption: string;
  tex: string;
  note?: string;
}

const STATIONS: Station[] = [
  {
    n: 1,
    dir: "forward",
    title: "A neuron mixes inputs",
    caption: "Blend the inputs with weights, add a bias.",
    tex: "z = \\mathbf{w}^{\\top}\\mathbf{x} + b",
    note: "w=[2,−1], x=[3,4], b=0.5 → z = 6 − 4 + 0.5 = 2.5",
  },
  {
    n: 2,
    dir: "forward",
    title: "Squish it — ReLU",
    caption: "Keep the positive part, zero the rest — one bend that lets the net curve.",
    tex: "a = \\max(0,\\, z)",
    note: "a = max(0, 2.5) = 2.5  ·  if z = −2.5, a = 0",
  },
  {
    n: 3,
    dir: "forward",
    title: "A whole layer of neurons",
    caption: "Stack many neurons — the parameter counter climbs fast.",
    tex: "\\mathbf{a} = \\max\\!\\big(\\mathbf{0},\\ \\mathbf{W}\\mathbf{x} + \\mathbf{b}\\big)",
    note: "params = (inputs × neurons) + neurons",
  },
  {
    n: 4,
    dir: "forward",
    title: "Scores → probabilities",
    caption: "If the task is a choice, softmax turns scores into chances that sum to 1.",
    tex: "p_k = \\dfrac{e^{z_k}}{\\sum_j e^{z_j}}",
    note: "z=[2,1,0] → p=[0.665, 0.245, 0.090], sum = 1.000",
  },
  {
    n: 5,
    dir: "turn",
    title: "The turn: measure the error",
    caption: "Forward pass done. Now score the guess — how wrong was it?",
    tex: "L = \\dfrac{1}{n}\\sum_{i=1}^{n}(\\hat{y}_i - y_i)^2",
    note: "squared error for a number; cross-entropy for a choice like the softmax above. Either way, one number.",
  },
  {
    n: 6,
    dir: "backprop",
    title: "Backprop: blame flows back",
    caption: "Walk the path backward, asking each weight how much it caused the error.",
    tex: "\\dfrac{\\partial L}{\\partial w}",
    note: "gradients only — backprop changes no numbers yet",
  },
  {
    n: 7,
    dir: "apply",
    title: "The update step",
    caption: "NOW the numbers change — every weight steps downhill.",
    tex: "w := w - \\eta\\,\\dfrac{\\partial L}{\\partial w}",
    note: "byte-for-byte the same line that trained Level 1",
  },
];

const FRAME_COUNT = 121;

function dirColorOf(dir: Dir): string {
  if (dir === "backprop") return "var(--pink)";
  if (dir === "apply") return "var(--cyan)";
  if (dir === "turn") return "var(--cream)";
  return "var(--blue)";
}

function DirBanner({ dir }: { dir: Dir }) {
  const map: Record<Dir, { icon: React.ReactNode; label: string }> = {
    forward: { icon: <ArrowRight size={16} />, label: "FORWARD PASS · INPUT → OUTPUT" },
    turn: { icon: <RotateCw size={16} />, label: "FORWARD DONE — MEASURING ERROR" },
    backprop: { icon: <ArrowLeft size={16} />, label: "BACKPROP · OUTPUT → INPUT · GRADIENTS ONLY" },
    apply: { icon: <ArrowDown size={16} />, label: "UPDATE STEP · NOW THE NUMBERS CHANGE" },
  };
  const c = dirColorOf(dir);
  const { icon, label } = map[dir];
  return (
    <span
      className="legible inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 font-display text-xs tracking-[0.12em] sm:text-sm"
      style={{
        color: "var(--cream)",
        background: `color-mix(in srgb, ${c} 14%, rgba(5,0,8,0.55))`,
        border: `1px solid ${c}`,
        boxShadow: `0 0 22px -6px ${c}`,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
      }}
    >
      <span style={{ color: c }}>{icon}</span>
      {label}
    </span>
  );
}

/** Compact station card for the bottom band — small + light so the flythrough shows above it. */
function StationCard({ s, paramCount }: { s: Station; paramCount: number }) {
  const c = dirColorOf(s.dir);
  return (
    <div
      className="flex w-[82vw] max-w-[330px] shrink-0 flex-col gap-2 rounded-2xl px-4 py-3.5 sm:w-[44vw] lg:w-[296px]"
      style={{
        background: "rgba(5,0,8,0.5)",
        border: `1px solid color-mix(in srgb, ${c} 45%, transparent)`,
        backdropFilter: "blur(7px)",
        WebkitBackdropFilter: "blur(7px)",
        boxShadow: `0 12px 40px -22px rgba(0,0,0,0.9), 0 0 30px -16px ${c}`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-7 w-7 place-items-center rounded-full font-display text-sm"
          style={{ color: "var(--cream)", background: `color-mix(in srgb, ${c} 20%, transparent)`, border: `1px solid ${c}` }}
        >
          {s.n}
        </span>
        <span className="text-[0.62rem] font-semibold uppercase tracking-[0.16em]" style={{ color: c }}>
          {s.dir}
        </span>
      </div>
      <h3 className="legible text-base leading-tight text-cream">{s.title}</h3>
      <p className="legible m-0 text-sm text-cream-2">{s.caption}</p>
      <div
        className="eqn-card flex items-center justify-center py-2"
        style={{ background: "rgba(5,0,8,0.45)" }}
      >
        <Katex tex={s.tex} display />
      </div>
      {s.n === 3 ? (
        <div className="legible font-mono text-xs text-cream-2">
          params ={" "}
          <span
            className="tabular-nums text-xl"
            style={{ color: "var(--blue)", textShadow: "0 0 16px rgba(46,107,255,0.8)" }}
          >
            {paramCount}
          </span>{" "}
          <span className="text-cream-3">(6×6 + 6)</span>
        </div>
      ) : (
        s.note && <div className="legible m-0 font-mono text-[0.7rem] leading-snug text-cream-3">{s.note}</div>
      )}
    </div>
  );
}

export function FpvSection() {
  const reduced = usePrefersReducedMotion();
  const isMobile = useIsMobile();

  const sectionRef = useRef<HTMLElement>(null);
  const pinRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const starRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [dir, setDir] = useState<Dir>("forward");
  const [paramCount, setParamCount] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const section = sectionRef.current;
    const pin = pinRef.current;
    const track = trackRef.current;
    const star = starRef.current;
    const canvas = canvasRef.current;
    if (!section || !pin || !track || !canvas) return;

    const scrubber = new FrameScrubber({
      basePath: asset("/frames/fpv"),
      frameCount: FRAME_COUNT,
      padWidth: 3,
      stride: isMobile ? 2 : 1,
    });
    scrubber.attach(canvas);
    scrubber.start();

    // lazy-load the 13MB of frames only when the section approaches the viewport
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          scrubber.preload();
          io.disconnect();
        }
      },
      { rootMargin: "800px" },
    );
    io.observe(section);

    const onResize = () => scrubber.resize();
    let rafId = requestAnimationFrame(() => scrubber.resize());
    window.addEventListener("resize", onResize);

    let maxShift = 0;
    const measure = () => {
      maxShift = Math.max(0, track.scrollWidth - pin.clientWidth + 48);
    };
    measure();
    // re-measure once web fonts settle so the last station is always reachable
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => {
        measure();
        ScrollTrigger.refresh();
      });
    }

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "+=520%",
        pin,
        scrub: 0.6,
        invalidateOnRefresh: true,
        onRefresh: measure,
        onUpdate: (self) => {
          const p = self.progress;
          const pe = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          const burst = p >= 0.6 && p <= 0.66 ? Math.sin(((p - 0.6) / 0.06) * Math.PI) * 40 : 0;
          const base = -pe * maxShift - burst;
          track.style.transform = `translateX(${base}px)`;
          if (star) star.style.transform = `translateX(${base * 0.2}px)`;

          scrubber.setProgress(p);

          const nextDir: Dir =
            p < 0.58 ? "forward" : p < 0.66 ? "turn" : p < 0.9 ? "backprop" : "apply";
          setDir((prev) => (prev === nextDir ? prev : nextDir));

          const c = Math.round(Math.max(0, Math.min(1, (p - 0.22) / 0.18)) * 42);
          setParamCount((prev) => (prev === c ? prev : c));
        },
      });
    }, section);

    return () => {
      cancelAnimationFrame(rafId);
      io.disconnect();
      ctx.revert();
      window.removeEventListener("resize", onResize);
      scrubber.destroy();
    };
  }, [reduced, isMobile]);

  /* ---------- reduced-motion: static vertical stack ---------- */
  if (reduced) {
    return (
      <section id="fpv" className="sec sec-fpv">
        <div className="container">
          <Eyebrow>let's fly inside one</Eyebrow>
          <h2 className="neon">
            <span className="block">Inside</span>
            <span className="block">A Real</span>
            <span className="block neon-blue">Network</span>
          </h2>
          <p className="max-w-2xl text-cream-2">
            The same nudge from the line, now riding through a whole network — forward to make a
            guess, backward to assign blame.
          </p>
          <img
            src={asset("/frames/fpv/frame-061.jpg")}
            alt="A flythrough inside a neural network"
            className="mt-6 w-full rounded-2xl"
            loading="lazy"
          />
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STATIONS.map((s) => (
              <StationCard key={s.n} s={s} paramCount={42} />
            ))}
          </div>
          <p className="mt-8 max-w-2xl text-lg text-cream">
            You flew the whole loop — guess forward, blame backward, nudge.{" "}
            <b className="neon-blue">Now watch a network do it on its own.</b>
          </p>
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} id="fpv" className="sec-fpv relative">
      <div ref={pinRef} className="relative h-screen w-full overflow-hidden">
        {/* the flythrough — full opacity, fully visible */}
        <canvas ref={canvasRef} className="absolute inset-0 block h-full w-full" aria-hidden="true" />
        <div ref={starRef} className="starfield" aria-hidden="true" style={{ opacity: 0.35 }} />
        {/* light edge scrims ONLY — top (header) + bottom (station band); centre stays clear */}
        <div className="scrim-t pointer-events-none absolute inset-x-0 top-0 h-[34%]" aria-hidden="true" />
        <div className="scrim-b pointer-events-none absolute inset-x-0 bottom-0 h-[48%]" aria-hidden="true" />

        {/* header + direction banner — top-left, no panel, just shadow */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 px-5 pt-20 sm:px-8">
          <div className="mx-auto max-w-content">
            <Eyebrow className="legible">let's fly inside one</Eyebrow>
            <h2 className="neon legible mb-3 text-[clamp(1.8rem,4.5vw,3.2rem)]">
              Inside A Real <span className="neon-blue">Network</span>
            </h2>
            <DirBanner dir={dir} />
          </div>
        </div>

        {/* near: compact station track in the BOTTOM band */}
        <div className="absolute inset-x-0 bottom-0 z-[5] pb-14">
          <div
            ref={trackRef}
            className="flex items-end gap-4 px-[6vw] will-change-transform sm:gap-6"
          >
            {STATIONS.map((s) => (
              <StationCard key={s.n} s={s} paramCount={paramCount} />
            ))}
            {/* trailing bridge card */}
            <div
              className="flex w-[82vw] max-w-[330px] shrink-0 flex-col justify-center gap-2 rounded-2xl px-5 py-5 sm:w-[44vw] lg:w-[300px]"
              style={{
                background: "rgba(5,0,8,0.5)",
                border: "1px solid rgba(46,107,255,0.4)",
                backdropFilter: "blur(7px)",
                WebkitBackdropFilter: "blur(7px)",
              }}
            >
              <p className="legible m-0 text-lg leading-snug text-cream">
                You flew the whole loop — guess forward, blame backward, nudge.
              </p>
              <p className="legible m-0 text-sm text-cream-2">
                Now watch a real network run it on its own and bend itself to fit a curve a line never
                could.
              </p>
            </div>
          </div>
        </div>

        {/* scroll hint */}
        <div className="pointer-events-none absolute inset-x-0 bottom-4 z-10 text-center">
          <span className="pill no-dot legible">scroll to fly →</span>
        </div>
      </div>
    </section>
  );
}
