import { useEffect } from "react";
import { Nav } from "./components/Nav";
import { Hero } from "./components/Hero";
import { LinRegLab } from "./components/sections/LinRegLab";
import { FpvSection } from "./components/sections/FpvSection";
import { MlpSection } from "./components/sections/MlpSection";
import { LlmSection } from "./components/sections/LlmSection";
import { SignalSection } from "./components/sections/SignalSection";
import { ScrollToTopButton } from "./components/ui";
import { setupSmoothScroll } from "./lib/scroll";
import { ScrollTrigger } from "./lib/gsap";
import { usePrefersReducedMotion, useScrollReveals } from "./lib/hooks";
import { runMathSelfTest } from "./lib/ml";

export default function App() {
  const reduced = usePrefersReducedMotion();
  useScrollReveals(reduced);

  useEffect(() => {
    const cleanup = setupSmoothScroll();
    const refresh = () => ScrollTrigger.refresh();
    const t = window.setTimeout(refresh, 350);
    window.addEventListener("load", refresh);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("load", refresh);
      cleanup();
    };
  }, []);

  // runtime evidence that the interactive math is correct (dev only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      const r = runMathSelfTest();
      console.log(
        `%c[ml self-test] ${r.ok ? "PASS" : "FAIL"}`,
        `color:${r.ok ? "#00e5ff" : "#ff2d9b"};font-weight:bold`,
        r.checks,
      );
    }
  }, []);

  // NOTE: the outer wrapper MUST NOT have a background color — the hero video
  // lives at -z-20 behind it; any bg here would paint over it (cinematic-scrub
  // hard rule #1).
  return (
    <div className="relative">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:bg-cyan focus:px-4 focus:py-2 focus:font-semibold focus:text-bg"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">
        <Hero />
        <LinRegLab />
        <FpvSection />
        <MlpSection />
        <LlmSection />
        <SignalSection />
      </main>
      <ScrollToTopButton />
    </div>
  );
}
