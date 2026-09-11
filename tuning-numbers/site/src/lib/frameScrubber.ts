/* ============================================================
   frameScrubber.ts — canvas frame-by-frame scrubber.

   Ported from the parallax-landing-page skill's FrameScrubber:
   preload images, cover-fit draw with DPR<=2, RAF lerp (0.22)
   toward a scroll-derived target, redraw only when the rounded
   frame index changes. The DIFFERENCE from the skill: target is
   driven by GSAP ScrollTrigger progress (an embedded section),
   NOT a page-locking virtual scroll.
   ============================================================ */

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const pad = (n: number, w: number) => String(n).padStart(w, "0");

export interface FrameScrubberOptions {
  basePath: string; // e.g. "/frames/fpv"
  frameCount: number; // total source frames available
  prefix?: string; // default "frame-"
  ext?: string; // default "jpg"
  padWidth?: number; // default 3
  stride?: number; // load every Nth source frame (1 = all). For mobile, 2.
  lerp?: number; // RAF smoothing factor (default 0.22)
}

export class FrameScrubber {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private readonly basePath: string;
  private readonly prefix: string;
  private readonly ext: string;
  private readonly padWidth: number;
  private readonly lerpFactor: number;
  private readonly srcIndices: number[]; // which source frames we actually load
  private readonly frames: HTMLImageElement[];
  private readonly count: number; // = srcIndices.length

  private loaded = 0;
  private target = 0; // in [0, count-1]
  private current = 0;
  private lastDrawn = -1;
  private dpr = 1;
  private rafId: number | null = null;
  private preloadStarted = false;

  constructor(opts: FrameScrubberOptions) {
    this.basePath = opts.basePath.replace(/\/$/, "");
    this.prefix = opts.prefix ?? "frame-";
    this.ext = opts.ext ?? "jpg";
    this.padWidth = opts.padWidth ?? 3;
    this.lerpFactor = opts.lerp ?? 0.22;
    const stride = Math.max(1, opts.stride ?? 1);

    const indices: number[] = [];
    for (let i = 0; i < opts.frameCount; i += stride) indices.push(i);
    // always include the last frame so the end of scroll lands on the final image
    if (indices[indices.length - 1] !== opts.frameCount - 1) indices.push(opts.frameCount - 1);
    this.srcIndices = indices;
    this.count = indices.length;
    this.frames = new Array(this.count);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
  }

  attach(canvas: HTMLCanvasElement): void {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
  }

  private framePath(loadIndex: number): string {
    const srcIdx = this.srcIndices[loadIndex];
    return `${this.basePath}/${this.prefix}${pad(srcIdx + 1, this.padWidth)}.${this.ext}`;
  }

  get loadedFraction(): number {
    return this.count ? this.loaded / this.count : 1;
  }

  preload(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (this.preloadStarted) return Promise.resolve();
    this.preloadStarted = true;
    const tasks: Promise<void>[] = [];
    for (let i = 0; i < this.count; i++) {
      tasks.push(
        new Promise<void>((resolve) => {
          const img = new Image();
          img.decoding = "async";
          const done = () => {
            this.loaded += 1;
            onProgress?.(this.loaded, this.count);
            resolve();
          };
          img.onload = done;
          img.onerror = done;
          img.src = this.framePath(i);
          this.frames[i] = img;
        }),
      );
    }
    return Promise.all(tasks).then(() => undefined);
  }

  resize(): void {
    if (!this.canvas || !this.ctx) return;
    const parent = this.canvas.parentElement;
    const w = parent ? parent.clientWidth : window.innerWidth;
    const h = parent ? parent.clientHeight : window.innerHeight;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.lastDrawn = -1;
    this.draw(this.current);
  }

  private draw(frameIdx: number): void {
    if (!this.canvas || !this.ctx) return;
    const i = clamp(Math.round(frameIdx), 0, this.count - 1);
    if (i === this.lastDrawn) return;
    const img = this.frames[i];
    if (!img || !img.complete || !img.naturalWidth) return;
    const cw = this.canvas.width / this.dpr;
    const ch = this.canvas.height / this.dpr;
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    const dx = (cw - dw) * 0.5;
    const dy = (ch - dh) * 0.5;
    this.ctx.clearRect(0, 0, cw, ch);
    this.ctx.drawImage(img, dx, dy, dw, dh);
    this.lastDrawn = i;
  }

  /** progress in [0,1] -> target frame */
  setProgress(p: number): void {
    this.target = clamp(p, 0, 1) * (this.count - 1);
  }

  snapToProgress(p: number): void {
    const v = clamp(p, 0, 1) * (this.count - 1);
    this.target = v;
    this.current = v;
    this.draw(v);
  }

  private tick = (): void => {
    const diff = this.target - this.current;
    if (Math.abs(diff) < 0.005) {
      if (this.current !== this.target) {
        this.current = this.target;
        this.draw(this.current);
      }
    } else {
      this.current += diff * this.lerpFactor;
      this.draw(this.current);
    }
    this.rafId = requestAnimationFrame(this.tick);
  };

  start(): void {
    if (this.rafId == null) this.rafId = requestAnimationFrame(this.tick);
  }

  destroy(): void {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    this.frames.length = 0;
  }
}
