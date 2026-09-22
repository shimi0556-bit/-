/**
 * Quality presets plus dynamic-resolution scaling. Every subsystem reads
 * its knobs from `engine.quality.settings`; changing a preset emits
 * 'quality' so passes and world systems can rebuild what they own.
 */
export const PRESETS = {
  low: {
    label: 'נמוכה',
    maxDpr: 1,
    msaa: 0,
    fxaa: true,
    shadows: true,
    shadowMapSize: 1024,
    shadowRadius: 1.5,
    ao: false,
    aoHalfRes: true,
    bloom: true,
    godRays: false,
    dof: false,
    grassDensity: 0.3,
    treeDensity: 0.6,
    waterDetail: 0.5,
    envSize: 128,
    particlesScale: 0.5,
    anisotropy: 2,
  },
  medium: {
    label: 'בינונית',
    maxDpr: 1.25,
    msaa: 0,
    fxaa: true,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 2,
    ao: false,
    aoHalfRes: true,
    bloom: true,
    godRays: true,
    dof: false,
    grassDensity: 0.6,
    treeDensity: 0.85,
    waterDetail: 0.75,
    envSize: 256,
    particlesScale: 0.8,
    anisotropy: 4,
  },
  high: {
    label: 'גבוהה',
    maxDpr: 1.5,
    msaa: 4,
    fxaa: false,
    shadows: true,
    shadowMapSize: 2048,
    shadowRadius: 2.5,
    ao: true,
    aoHalfRes: true,
    bloom: true,
    godRays: true,
    dof: false,
    grassDensity: 1,
    treeDensity: 1,
    waterDetail: 1,
    envSize: 256,
    particlesScale: 1,
    anisotropy: 8,
  },
  ultra: {
    label: 'אולטרה',
    maxDpr: 2,
    msaa: 4,
    fxaa: false,
    shadows: true,
    shadowMapSize: 4096,
    shadowRadius: 3,
    ao: true,
    aoHalfRes: false,
    bloom: true,
    godRays: true,
    dof: false,
    grassDensity: 1.5,
    treeDensity: 1.2,
    waterDetail: 1.25,
    envSize: 512,
    particlesScale: 1.2,
    anisotropy: 16,
  },
};

export const PRESET_ORDER = ['low', 'medium', 'high', 'ultra'];

export class Quality {
  constructor(engine, presetName) {
    this.engine = engine;
    this.presetName = presetName || Quality.detect(engine.renderer);
    this.settings = { ...PRESETS[this.presetName] };
    this.dynamicResolution = true;
    this.renderScale = 1;
    this.minScale = 0.55;
    this.targetFps = 58;
    this._acc = 0;
    this._frames = 0;
    this._cooldown = 2;
  }

  /** Picks a starting preset from the GPU string and device class. */
  static detect(renderer) {
    let gpu = '';
    try {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = (ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
    } catch {
      /* ignore */
    }
    const g = gpu.toLowerCase();
    const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
    if (/swiftshader|llvmpipe|software|basic render/.test(g)) return 'low';
    if (mobile) return /apple gpu|adreno \(tm\) 7|mali-g7|xclipse/.test(g) ? 'medium' : 'low';
    if (/rtx|radeon rx|radeon pro|apple m[2-9]|apple m1 (pro|max|ultra)|arc a|quadro/.test(g)) return 'ultra';
    if (/intel|iris|uhd|hd graphics|apple m1|vega/.test(g)) return 'medium';
    return 'high';
  }

  get dpr() {
    return Math.min(window.devicePixelRatio || 1, this.settings.maxDpr) * this.renderScale;
  }

  setPreset(name) {
    if (!PRESETS[name]) return;
    this.presetName = name;
    this.settings = { ...PRESETS[name] };
    this.renderScale = 1;
    this._cooldown = 2;
    this.engine.events.emit('quality', this.settings);
  }

  /** Tweaks a single knob (e.g. from the graphics panel) and notifies listeners. */
  set(key, value) {
    this.settings[key] = value;
    this.engine.events.emit('quality', this.settings);
  }

  /** Called once per frame with the raw frame time; adjusts renderScale in steps. */
  sample(dt) {
    if (!this.dynamicResolution) {
      if (this.renderScale !== 1) {
        this.renderScale = 1;
        this.engine.resize();
      }
      return;
    }
    this._acc += dt;
    this._frames++;
    this._cooldown -= dt;
    if (this._acc < 1) return;
    const fps = this._frames / this._acc;
    this._acc = 0;
    this._frames = 0;
    if (this._cooldown > 0 || document.hidden) return;
    let next = this.renderScale;
    if (fps < this.targetFps - 14) next -= 0.12;
    else if (fps < this.targetFps - 4) next -= 0.06;
    else if (fps > this.targetFps + 0.5 && this.renderScale < 1) next += 0.05;
    next = Math.min(1, Math.max(this.minScale, next));
    if (Math.abs(next - this.renderScale) > 0.001) {
      this.renderScale = next;
      this._cooldown = 1.5;
      this.engine.resize();
    }
  }
}
