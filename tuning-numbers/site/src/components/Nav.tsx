import { useEffect, useState } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { scrollToSection } from "../lib/scroll";
import { cn } from "./ui";

const NAV: { label: string; target: string }[] = [
  { label: "The Line", target: "linreg" },
  { label: "Inside", target: "fpv" },
  { label: "It Adjusts", target: "mlp" },
  { label: "The LLM", target: "llm" },
];

const SPY_IDS = ["top", "linreg", "fpv", "mlp", "llm", "signal"];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [active, setActive] = useState("top");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sections = SPY_IDS.map((id) => document.getElementById(id)).filter(
      (el): el is HTMLElement => !!el,
    );
    if (sections.length === 0) return;
    const io = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 1] },
    );
    sections.forEach((s) => io.observe(s));
    return () => io.disconnect();
  }, []);

  const go = (target: string) => {
    setOpen(false);
    scrollToSection(target);
  };

  return (
    <>
      <nav
        className={cn(
          "fixed inset-x-0 top-0 z-50 transition-all duration-500 ease-out-expo",
          scrolled ? "py-2" : "py-4",
        )}
      >
        <div
          className={cn(
            "mx-auto flex max-w-content items-center justify-between gap-4 px-4 sm:px-6",
            scrolled && "rounded-b-2xl",
          )}
          style={
            scrolled
              ? {
                  background: "rgba(5,0,8,0.55)",
                  backdropFilter: "blur(14px) saturate(160%)",
                  WebkitBackdropFilter: "blur(14px) saturate(160%)",
                  borderBottom: "1px solid rgba(var(--cream-rgb)/0.08)",
                }
              : undefined
          }
        >
          {/* brand */}
          <button
            type="button"
            onClick={() => go("top")}
            className="flex items-center gap-2.5 py-2"
            aria-label="Back to top"
          >
            <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden="true">
              <g stroke="currentColor" strokeWidth="2" className="text-cyan" fill="none">
                <line x1="16" y1="32" x2="32" y2="18" stroke="var(--cyan)" />
                <line x1="16" y1="32" x2="32" y2="46" stroke="var(--blue)" />
                <line x1="32" y1="18" x2="48" y2="32" stroke="var(--purple)" />
                <line x1="32" y1="46" x2="48" y2="32" stroke="var(--pink)" />
              </g>
              <g>
                <circle cx="16" cy="32" r="4" fill="var(--cyan)" />
                <circle cx="32" cy="18" r="4" fill="var(--blue)" />
                <circle cx="32" cy="46" r="4" fill="var(--purple)" />
                <circle cx="48" cy="32" r="4.5" fill="var(--pink)" />
              </g>
            </svg>
            <span className="font-display text-lg uppercase tracking-tight text-cream">
              Tune<span className="text-cyan">·</span>Numbers
            </span>
          </button>

          {/* desktop links */}
          <div className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <button
                key={item.target}
                type="button"
                onClick={() => go(item.target)}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  active === item.target ? "text-cream" : "text-cream-3 hover:text-cream-2",
                )}
                style={
                  active === item.target
                    ? { background: "rgba(var(--cyan-rgb)/0.1)" }
                    : undefined
                }
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => go("linreg")}
              className="cta-primary ml-2 px-5 py-2.5 text-sm"
            >
              Train one <ArrowRight size={16} />
            </button>
          </div>

          {/* mobile toggle */}
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full text-cream md:hidden"
            style={{ background: "rgba(var(--cream-rgb)/0.06)" }}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </nav>

      {/* mobile menu */}
      {open && (
        <div className="fixed inset-x-3 top-[68px] z-40 md:hidden">
          <div className="glass-strong flex flex-col gap-1 p-3">
            {NAV.map((item) => (
              <button
                key={item.target}
                type="button"
                onClick={() => go(item.target)}
                className={cn(
                  "rounded-xl px-4 py-3 text-left text-base font-medium transition-colors",
                  active === item.target ? "text-cream" : "text-cream-2",
                )}
                style={
                  active === item.target ? { background: "rgba(var(--cyan-rgb)/0.1)" } : undefined
                }
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => go("linreg")}
              className="cta-primary mt-1 w-full"
            >
              Train one yourself <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
