import { useEffect, useRef } from "react";
import { ArrowUp, Globe } from "lucide-react";
import { Katex } from "../../lib/Katex";

/* Inline brand marks (lucide v1 dropped brand icons). currentColor, 15px. */
const brandProps = { width: 15, height: 15, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true } as const;
function GithubMark() {
  return (
    <svg {...brandProps}>
      <path d="M12 .5C5.7.5.5 5.7.5 12c0 5.1 3.3 9.4 7.9 10.9.6.1.8-.3.8-.6v-2c-3.2.7-3.9-1.5-3.9-1.5-.5-1.3-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.2 0-.3-.5-1.5.1-3.1 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17 5 18 5.3 18 5.3c.6 1.6.1 2.8.1 3.1.8.9 1.2 1.9 1.2 3.2 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6 4.6-1.5 7.9-5.8 7.9-10.9C23.5 5.7 18.3.5 12 .5z" />
    </svg>
  );
}
function YoutubeMark() {
  return (
    <svg {...brandProps}>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8zM9.6 15.6V8.4l6.2 3.6-6.2 3.6z" />
    </svg>
  );
}
function XMark() {
  return (
    <svg {...brandProps}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.66l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
import { scrollToSection } from "../../lib/scroll";
import { usePrefersReducedMotion } from "../../lib/hooks";
import { Eyebrow } from "../ui";

const ORBS = [
  {
    label: "2",
    sub: "a line",
    size: 120,
    color: "0,229,255",
    pos: { top: "16%", left: "12%" },
    anim: "orb-float-a 16s ease-in-out infinite",
    depth: 0.012,
  },
  {
    label: "~ dozens",
    sub: "a small net",
    size: 200,
    color: "46,107,255",
    pos: { top: "30%", right: "12%" },
    anim: "orb-float-b 20s ease-in-out infinite",
    depth: 0.022,
  },
  {
    label: "≈ 175,000,000,000",
    sub: "an LLM",
    size: 320,
    color: "155,48,255",
    pos: { bottom: "6%", left: "30%" },
    anim: "orb-float-c 24s ease-in-out infinite",
    depth: 0.03,
  },
];

export function SignalSection() {
  const reduced = usePrefersReducedMotion();
  const orbWrapRef = useRef<HTMLDivElement>(null);

  // subtle pointer parallax on the orbs (desktop, motion-on)
  useEffect(() => {
    if (reduced) return;
    const wrap = orbWrapRef.current;
    if (!wrap) return;
    const onMove = (e: MouseEvent) => {
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const orbs = Array.from(wrap.querySelectorAll<HTMLElement>("[data-depth]"));
      orbs.forEach((o) => {
        const d = parseFloat(o.dataset.depth || "0");
        o.style.setProperty("--px", `${dx * d}px`);
        o.style.setProperty("--py", `${dy * d}px`);
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [reduced]);

  return (
    <section id="signal" className="sec sec-signal">
      {/* drifting orbs */}
      <div ref={orbWrapRef} className="pointer-events-none absolute inset-0" aria-hidden="true">
        {ORBS.map((orb, i) => (
          <div
            key={i}
            data-depth={orb.depth}
            className="absolute"
            style={{
              ...orb.pos,
              translate: "var(--px, 0) var(--py, 0)",
            }}
          >
            <div
              style={{
                width: orb.size,
                height: orb.size,
                borderRadius: "999px",
                background: `radial-gradient(circle at 40% 35%, rgba(${orb.color},0.5), rgba(${orb.color},0.12) 55%, transparent 72%)`,
                mixBlendMode: "screen",
                filter: "blur(6px)",
                animation: reduced ? undefined : orb.anim,
              }}
            />
            <span
              className="mt-2 block text-center font-mono text-xs"
              style={{ color: `rgba(${orb.color},0.95)`, opacity: reduced ? 0 : 0.85 }}
            >
              {orb.label}
              <span className="block text-cream-3">{orb.sub}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="container relative z-[2] flex min-h-[88svh] flex-col items-center justify-center py-24 text-center">
        <Eyebrow className="text-cyan">one idea, three sizes</Eyebrow>
        <h2 className="neon">
          <span className="block">It's All</span>
          <span className="script">a line, a net, a mind — same nudge</span>
          <span className="block">The Same</span>
          <span className="block neon-purple">Idea</span>
        </h2>

        <p className="mx-auto mt-4 max-w-2xl text-cream-2">
          A straight line, a curve-fitting net, and a model with hundreds of billions of parameters all
          learn the very same way: measure how wrong you are, then nudge every number a little downhill.
          That nudge is the whole story.
        </p>

        {/* the one rule, one last time — with a looping downhill stroke */}
        <div className="glass-strong relative mx-auto mt-9 max-w-md overflow-hidden px-7 py-6">
          <div className="text-xs uppercase tracking-[0.16em] text-cream-3">the one rule, every scale</div>
          <div className="mt-2 text-xl">
            <Katex tex="\theta := \theta - \eta\,\dfrac{\partial L}{\partial \theta}" display />
          </div>
          <svg
            className="mt-1 h-8 w-full"
            viewBox="0 0 220 32"
            fill="none"
            aria-hidden="true"
            preserveAspectRatio="none"
          >
            <path
              d="M4 6 C 70 6, 90 26, 150 26 L 210 26"
              stroke="var(--pink)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="220"
              style={{ animation: reduced ? undefined : "nudge-draw 5s ease-in-out infinite" }}
            />
            <path
              d="M200 20 L 212 26 L 200 32"
              stroke="var(--pink)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ animation: reduced ? undefined : "nudge-draw 5s ease-in-out infinite" }}
            />
          </svg>
        </div>

        <button
          type="button"
          className="cta-primary mt-9"
          onClick={() => scrollToSection("linreg")}
        >
          Train one yourself <ArrowUp size={18} />
        </button>

        {/* footer handles */}
        <footer className="mt-16 w-full">
          <div className="hairline mb-6" />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-sm text-cream-2">
            <a
              href="https://yuv.ai"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-cyan"
            >
              <Globe size={15} /> yuv.ai
            </a>
            <a
              href="https://x.com/yuvalav"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-cyan"
            >
              <XMark /> @yuvalav
            </a>
            <a
              href="https://github.com/hoodini"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-cyan"
            >
              <GithubMark /> @hoodini
            </a>
            <a
              href="https://youtube.com/@yuv-ai"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-cyan"
            >
              <YoutubeMark /> @yuv-ai
            </a>
          </div>
          <p className="mt-5 text-center text-xs text-cream-3">
            Built as a hands-on lesson — every interactive runs real math in your browser.
          </p>
        </footer>
      </div>
    </section>
  );
}
