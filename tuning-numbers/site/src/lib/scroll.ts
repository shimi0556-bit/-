import Lenis from "lenis";
import { gsap, ScrollTrigger } from "./gsap";

let activeLenis: Lenis | null = null;

const NAV_OFFSET = 72;

/**
 * Wire Lenis smooth scrolling to GSAP's ticker and ScrollTrigger so pinned /
 * scrubbed timelines stay in sync. No-op (returns a noop cleanup) under reduced
 * motion — the page then uses native scrolling. Returns a cleanup function.
 */
export function setupSmoothScroll(): () => void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return () => {};
  }

  const lenis = new Lenis({
    duration: 1.1,
    smoothWheel: true,
    wheelMultiplier: 1,
    touchMultiplier: 1.2,
  });
  activeLenis = lenis;

  lenis.on("scroll", ScrollTrigger.update);

  const onTick = (time: number) => {
    lenis.raf(time * 1000); // gsap ticker time is seconds; Lenis wants ms
  };
  gsap.ticker.add(onTick);
  gsap.ticker.lagSmoothing(0);

  return () => {
    gsap.ticker.remove(onTick);
    lenis.destroy();
    if (activeLenis === lenis) activeLenis = null;
  };
}

/** Smooth-scroll to a section id ("top" = page top). Routes through Lenis when active. */
export function scrollToSection(target: string): void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (target === "top") {
    if (activeLenis) activeLenis.scrollTo(0, { offset: 0 });
    else window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    return;
  }
  const el = document.getElementById(target);
  if (!el) return;
  if (activeLenis) {
    activeLenis.scrollTo(el, { offset: -NAV_OFFSET });
  } else {
    const y = el.getBoundingClientRect().top + window.scrollY - NAV_OFFSET;
    window.scrollTo({ top: y, behavior: reduced ? "auto" : "smooth" });
  }
}
