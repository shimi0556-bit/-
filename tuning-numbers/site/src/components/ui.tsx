import { useEffect, useState } from "react";
import type { ReactNode, CSSProperties } from "react";
import { ArrowUp } from "lucide-react";
import { Katex } from "../lib/Katex";
import { scrollToSection } from "../lib/scroll";

export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Reveal-on-scroll wrapper (uses global .reveal observer) ---------- */
export function Reveal({
  children,
  className = "",
  index,
}: {
  children: ReactNode;
  className?: string;
  index?: number;
}) {
  const style = index != null ? ({ "--i": index } as CSSProperties) : undefined;
  return (
    <div className={cn("reveal", className)} style={style}>
      {children}
    </div>
  );
}

/* ---------- Caveat handwritten eyebrow ---------- */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={cn("eyebrow", className)}>{children}</span>;
}

/* ---------- status pill ---------- */
export function Pill({
  children,
  noDot = false,
  className = "",
}: {
  children: ReactNode;
  noDot?: boolean;
  className?: string;
}) {
  return <span className={cn("pill", noDot && "no-dot", className)}>{children}</span>;
}

/* ---------- section header: eyebrow + Anton headline lines + subhead ---------- */
export function SectionHeader({
  eyebrow,
  lines,
  subhead,
  align = "left",
  className = "",
}: {
  eyebrow?: string;
  lines: string[];
  subhead?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <header className={cn(align === "center" && "text-center", className)}>
      {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
      <h2 className="neon">
        {lines.map((l, i) => (
          <span key={i} className="block">
            {l}
          </span>
        ))}
      </h2>
      {subhead && (
        <p
          className={cn(
            "max-w-2xl text-cream-2 text-[1.05rem] leading-relaxed",
            align === "center" && "mx-auto",
          )}
        >
          {subhead}
        </p>
      )}
    </header>
  );
}

/* ---------- teaching beats ---------- */
export interface TeachBeat {
  heading: string;
  body: ReactNode;
}

export function TeachList({ beats, hue = "cyan" }: { beats: TeachBeat[]; hue?: string }) {
  return (
    <ol className="m-0 grid list-none gap-4 p-0 sm:gap-5">
      {beats.map((b, i) => (
        <Reveal key={i} index={i}>
          <li className="glass flex items-start gap-4 p-5">
            <span
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-bold"
              style={{
                color: "var(--cream)",
                background: `rgba(var(--${hue}-rgb) / 0.14)`,
                border: `1px solid rgba(var(--${hue}-rgb) / 0.45)`,
                boxShadow: `0 0 16px -4px rgba(var(--${hue}-rgb) / 0.7)`,
              }}
            >
              {i + 1}
            </span>
            <div>
              <h3 className="mb-1 text-[1.15rem] tracking-tight text-cream">{b.heading}</h3>
              <p className="m-0 text-cream-2">{b.body}</p>
            </div>
          </li>
        </Reveal>
      ))}
    </ol>
  );
}

/* ---------- equation row: KaTeX + plain-words gloss ---------- */
export function EqnRow({
  tex,
  plain,
  label,
  display = true,
}: {
  tex: string;
  plain?: ReactNode;
  label?: string;
  display?: boolean;
}) {
  return (
    <div className="eqn-card my-3">
      {label && (
        <div className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-cream-3">
          {label}
        </div>
      )}
      <Katex tex={tex} display={display} />
      {plain && <p className="mb-0 mt-2 text-sm text-cream-2">{plain}</p>}
    </div>
  );
}

/* ---------- decorative layered-network motif (aria-hidden) ---------- */
export function NeuralMotif({ className = "" }: { className?: string }) {
  const layers = [3, 5, 5, 2];
  const w = 240;
  const h = 200;
  const colX = (c: number) => 30 + (c * (w - 60)) / (layers.length - 1);
  const nodeY = (count: number, i: number) => (h * (i + 1)) / (count + 1);
  const nodes = layers.map((count, c) =>
    Array.from({ length: count }, (_, i) => ({ x: colX(c), y: nodeY(count, i) })),
  );
  const edges: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (let c = 0; c < nodes.length - 1; c++) {
    for (const a of nodes[c]) for (const b of nodes[c + 1]) edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return (
    <svg
      className={className}
      viewBox={`0 0 ${w} ${h}`}
      fill="none"
      aria-hidden="true"
      style={{ color: "var(--sec-hue, var(--cyan))" }}
    >
      <g stroke="currentColor" strokeOpacity="0.18" strokeWidth="0.6">
        {edges.map((e, i) => (
          <line key={i} x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} />
        ))}
      </g>
      <g>
        {nodes.flat().map((nd, i) => (
          <circle key={i} cx={nd.x} cy={nd.y} r="3.4" fill="currentColor" fillOpacity="0.5" />
        ))}
      </g>
    </svg>
  );
}

/* ---------- scroll-to-top (appears after 60% viewport, bottom-right LTR) ---------- */
export function ScrollToTopButton() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <button
      type="button"
      aria-label="Back to top"
      onClick={() => scrollToSection("top")}
      className={cn(
        "fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full px-4 py-3 transition-all duration-300",
        "glass-strong text-sm font-semibold text-cream",
        show ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <ArrowUp size={16} />
      <span className="hidden sm:inline">Top</span>
    </button>
  );
}
