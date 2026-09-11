import { useEffect, useRef, useState } from "react";
import { MousePointer2, ChevronDown, Play } from "lucide-react";
import { Katex } from "../lib/Katex";
import { Eyebrow } from "./ui";
import { usePrefersReducedMotion, useIsTouch } from "../lib/hooks";
import { asset } from "../lib/asset";

const CHIPS = [
  { tex: "z = Wx + b", caption: "mix the inputs" },
  { tex: "a = f(z)", caption: "squish it — bend the line" },
  { tex: "\\hat{y}", caption: "out comes the prediction" },
];

export function Hero() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hairRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef({ targetTime: 0, isSeeking: false });
  const applyPRef = useRef<(p: number) => void>(() => {});
  const [zone, setZone] = useState(1);
  const reduced = usePrefersReducedMotion();
  const touch = useIsTouch();

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const st = stateRef.current;

    // Set video time from a normalized cursor/sweep position p in [0,1].
    const applyP = (p: number) => {
      const d = video.duration;
      if (!d || isNaN(d)) return;
      st.targetTime = Math.max(0, Math.min(d, p * d));
      // isSeeking guard: never queue a seek while one is in flight, or the
      // decoder backs up and the scrub stutters (cinematic-scrub hard rule).
      if (!st.isSeeking) {
        st.isSeeking = true;
        video.currentTime = st.targetTime;
      }
      const z = p < 0.34 ? 0 : p < 0.67 ? 1 : 2;
      setZone((prev) => (prev === z ? prev : z));
      if (hairRef.current) hairRef.current.style.transform = `scaleX(${Math.max(0, Math.min(1, p))})`;
    };
    applyPRef.current = applyP;

    const onSeeked = () => {
      st.isSeeking = false;
      if (Math.abs(st.targetTime - video.currentTime) > 0.01) {
        st.isSeeking = true;
        video.currentTime = st.targetTime;
      }
    };
    const onLoaded = () => {
      video.pause();
      applyP(0.5);
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("seeked", onSeeked);
    if (video.readyState >= 1) onLoaded();

    let rafId = 0;
    let cleanupMove: (() => void) | undefined;

    if (reduced) {
      applyP(0.5);
    } else if (touch) {
      // No cursor on touch: gently sweep the signal back and forth.
      const start = performance.now();
      const loop = () => {
        const t = (performance.now() - start) / 1000;
        applyP(0.5 + 0.5 * Math.sin(t * 0.5));
        rafId = requestAnimationFrame(loop);
      };
      rafId = requestAnimationFrame(loop);
    } else {
      const onMove = (e: MouseEvent) => applyP(e.clientX / window.innerWidth);
      window.addEventListener("mousemove", onMove);
      cleanupMove = () => window.removeEventListener("mousemove", onMove);
    }

    return () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("seeked", onSeeked);
      if (rafId) cancelAnimationFrame(rafId);
      cleanupMove?.();
    };
  }, [reduced, touch]);

  // keyboard / click affordance: sweep the neuron's signal 0 -> 1
  const sweep = () => {
    const start = performance.now();
    const dur = 2600;
    const tick = () => {
      const e = Math.min(1, (performance.now() - start) / dur);
      applyPRef.current(e);
      if (e < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  return (
    <>
      {/* fixed full-page backdrop — shows through the transparent hero only.
          metadata preload on touch (the 21MB clip shouldn't eagerly buffer on cellular). */}
      <video
        ref={videoRef}
        src={asset("/hero.mp4")}
        muted
        playsInline
        preload={touch ? "metadata" : "auto"}
        aria-hidden="true"
        className="fixed inset-0 -z-20 h-full w-full object-cover"
      />

      <section id="top" className="hero">
        {/* localized scrims: darken ONLY the left band (where the text sits) + a soft
            bottom — the network footage stays fully visible on the right/centre. */}
        <div className="scrim-l pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />
        <div className="scrim-b pointer-events-none absolute inset-0 -z-10" aria-hidden="true" />

        <div className="container w-full">
          <div className="max-w-2xl">
            <Eyebrow className="legible">start here</Eyebrow>
            <h1 className="neon legible">
              <span className="block">Training Is</span>
              <span className="block">Just Tuning</span>
              <span className="block neon-cyan">Numbers</span>
            </h1>
            <p className="legible mt-2 max-w-md text-lg text-cream">
              Watch it happen — then do it yourself.
            </p>

            {/* three forward-pass chips, timed to cursor L / C / R — kept to the left,
                light, so the network stays visible behind them. */}
            <div className="mt-7 flex max-w-lg flex-col gap-2.5 sm:flex-row sm:items-stretch">
              {CHIPS.map((chip, i) => {
                const active = zone === i;
                return (
                  <div
                    key={i}
                    className="flex flex-1 items-center gap-3 rounded-2xl px-3.5 py-3 transition-all duration-300 ease-out-expo sm:flex-col sm:items-start sm:gap-1.5"
                    style={{
                      minWidth: 0,
                      background: active ? "rgba(0,229,255,0.1)" : "rgba(5,0,8,0.3)",
                      border: active
                        ? "1px solid rgba(0,229,255,0.5)"
                        : "1px solid rgba(238,241,255,0.12)",
                      backdropFilter: "blur(5px)",
                      WebkitBackdropFilter: "blur(5px)",
                      opacity: active ? 1 : 0.6,
                      boxShadow: active ? "0 0 28px -8px rgba(0,229,255,0.7)" : undefined,
                    }}
                  >
                    <span className="shrink-0 font-mono text-xs text-cream-3">{i + 1}</span>
                    <div className="flex flex-col">
                      <div className={active ? "neon-cyan legible" : "legible"}>
                        <Katex tex={chip.tex} display={false} />
                      </div>
                      <span
                        className="legible text-xs text-cream-2"
                        aria-live={active ? "polite" : "off"}
                      >
                        {chip.caption}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* progress hairline tinted cyan->blue->purple */}
            <div
              className="mt-6 h-[3px] w-full max-w-lg overflow-hidden rounded-full"
              style={{ background: "rgba(238,241,255,0.1)" }}
              aria-hidden="true"
            >
              <div
                ref={hairRef}
                className="h-full w-full origin-left"
                style={{
                  transform: "scaleX(0.5)",
                  background: "linear-gradient(90deg, var(--cyan), var(--blue), var(--purple))",
                  boxShadow: "0 0 14px rgba(0,229,255,0.6)",
                }}
              />
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              {touch ? (
                <span className="pill no-dot">
                  <Play size={13} /> watch the signal travel
                </span>
              ) : (
                <span className="pill no-dot">
                  <MousePointer2 size={13} /> move your cursor left → right
                </span>
              )}
              <button type="button" className="cta-ghost text-sm" onClick={sweep}>
                <Play size={15} /> Play the neuron
              </button>
            </div>

            <p className="legible mt-8 max-w-md text-sm text-cream-2">
              Before a whole network, master the smallest version: a single straight line with just two
              numbers to tune. Scroll — we'll fit one by hand.
            </p>
          </div>
        </div>

        <ChevronDown
          className="legible absolute bottom-6 left-1/2 -translate-x-1/2 animate-bounce text-cream-2"
          size={26}
          aria-hidden="true"
        />
      </section>
    </>
  );
}
