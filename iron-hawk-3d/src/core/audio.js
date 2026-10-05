// Sound. Explosions, monster roars, the missile, fireballs, impacts, the flyby and the
// ambience use recorded effects (generated with ElevenLabs, embedded by the build as
// window.__SOUNDS). Everything else is synthesised with WebAudio at run time: the jet
// engine and wind (they follow the throttle), the cannon, alarms, interface blips and an
// instrumental soundtrack per region that gets more intense in battle. If a recording is
// missing or fails to decode, the synthesised version plays instead.
import { clamp } from './util.js';

const mtof = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Each bar plays one chord (semitones from the root). Layers fade in with intensity.
const TRACKS = {
  menu: { bpm: 84, root: 52, chords: [[0, 3, 7], [-4, 0, 3], [3, 7, 10], [-2, 2, 5]], bass: '1000000010000000', kick: '', snare: '', hat: '', arp: '1010101010101010', stab: '' },
  0: { bpm: 112, root: 50, chords: [[0, 4, 7], [5, 9, 12], [9, 12, 16], [7, 11, 14]], bass: '1000101010001010', kick: '1000000010100000', snare: '0000100000001000', hat: '1010101010101010', arp: '1011101110111011', stab: '' },
  1: { bpm: 124, root: 45, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -2, 2]], bass: '1010101010101010', kick: '1000001010000010', snare: '0000100000001000', hat: '1111111111111111', arp: '1101101101101101', stab: '' },
  2: { bpm: 136, root: 50, chords: [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [-5, -1, 2]], bass: '1110111011101110', kick: '1010001010100010', snare: '0000100000001001', hat: '1011101110111011', arp: '1111111111111111', stab: '1000000000100000' },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.8, music: 0.55, sfx: 0.9 };
    this.listener = { pos: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 } };
    this.intensity = 0.3;
    this.trackId = null;
    this.lock = 0;
    this.lockTimer = 0;
    this.alarmOn = false;
    this.alarmTimer = 0;
    this.lastShot = 0;
    this.samples = {};
    this.lastPick = {};
    this.voices = 0;
    this.ambId = null;
    this.ambTimer = 5;
  }

  get ready() { return !!this.ctx && this.ctx.state === 'running'; }

  unlock() {
    try {
      if (!this.ctx) this.init();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* audio is optional */ }
  }

  init() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC({ latencyHint: 'interactive' });
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp).connect(ctx.destination);
    this.musicBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    // reverb
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.4, 2.2);
    const rv = ctx.createGain(); rv.gain.value = 0.5;
    this.reverb.connect(rv).connect(this.master);
    // echo for the arpeggios
    this.delay = ctx.createDelay(1.5);
    const fb = ctx.createGain(); fb.gain.value = 0.32;
    const dl = ctx.createGain(); dl.gain.value = 0.35;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(dl).connect(this.musicBus);
    // noise
    this.white = this.noiseBuffer(2, false);
    this.brown = this.noiseBuffer(3, true);
    this.applyVolumes();
    this.buildEngine();
    this.loadSamples();
  }

  // ---------------------------------------------------------------- recorded effects
  loadSamples() {
    const src = window.__SOUNDS;
    if (!src) return;
    const ctx = this.ctx;
    const decode = (buf) => new Promise((res, rej) => {
      const p = ctx.decodeAudioData(buf, res, rej); // callback form for older Safari
      if (p && p.catch) p.catch(rej);
    });
    for (const [key, list] of Object.entries(src)) {
      this.samples[key] = [];
      for (const url of list) {
        try {
          const bin = atob(url.slice(url.indexOf(',') + 1));
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          decode(bytes.buffer).then((b) => this.samples[key].push(b), () => {});
        } catch (e) { /* keep the synth fallback */ }
      }
    }
  }

  has(key) { const l = this.samples[key]; return !!(l && l.length); }

  // play one take of a recorded effect; returns false when it isn't available
  sample(key, { vol = 1, pan = 0, rate = 1, verb = 0.15, delay = 0, filter = 0 } = {}) {
    if (!this.ready || !this.has(key)) return false;
    if (this.voices > 28) return true; // too busy: drop it quietly rather than fall back
    const list = this.samples[key];
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === this.lastPick[key]) i = (i + 1) % list.length;
    this.lastPick[key] = i;
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const s = ctx.createBufferSource();
    s.buffer = list[i];
    s.playbackRate.value = rate;
    const o = this.out(vol, pan, verb);
    if (filter > 0) { // muffle distant sounds
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filter;
      s.connect(f).connect(o);
    } else s.connect(o);
    this.voices++;
    s.onended = () => { this.voices--; };
    s.start(t);
    return true;
  }

  // distance muffling: far-away sounds lose their top end
  muffle(sp) { return sp.vol < 0.5 ? 1200 + sp.vol * 9000 : 0; }

  flyby(vol = 0.6, pan = 0) { this.sample('flyby', { vol, pan, verb: 0.2, rate: 0.95 + Math.random() * 0.1 }); }

  // regional ambience one-shots (gusts, volcanic rumbles) played at random moments
  ambience(levelId) { this.ambId = levelId; this.ambTimer = 3 + Math.random() * 4; }

  updateAmbience(dt) {
    if (!this.ambId) return;
    this.ambTimer -= dt;
    if (this.ambTimer > 0) return;
    const pan = (Math.random() - 0.5) * 1.2;
    if (this.ambId === 'volcano') {
      this.sample('rumble', { vol: 0.5 + Math.random() * 0.3, pan, rate: 0.7 + Math.random() * 0.25, verb: 0.5 });
      this.ambTimer = 5 + Math.random() * 7;
    } else {
      this.sample('wind', { vol: this.ambId === 'canyon' ? 0.45 : 0.3, pan, rate: 0.85 + Math.random() * 0.3, verb: 0.3 });
      this.ambTimer = 7 + Math.random() * 9;
    }
  }

  impulse(seconds, decay) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  noiseBuffer(seconds, brown) {
    const ctx = this.ctx, len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  setVolumes(v) { Object.assign(this.vol, v); this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.vol.master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.7, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx, t, 0.05);
  }

  setListener(pos, right) {
    this.listener.pos = pos; this.listener.right = right;
  }

  // volume and pan for a sound at a world position
  spatial(pos, range = 220) {
    if (!pos) return { vol: 1, pan: 0 };
    const L = this.listener;
    const dx = pos.x - L.pos.x, dy = pos.y - L.pos.y, dz = pos.z - L.pos.z;
    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d > range * 25) return null;
    const vol = 1 / (1 + Math.pow(d / range, 1.4));
    const pan = d > 1 ? clamp((dx * L.right.x + dy * L.right.y + dz * L.right.z) / d, -1, 1) * 0.8 : 0;
    return { vol, pan };
  }

  // gain -> panner -> sfx bus (+ reverb send). Returns the input node.
  out(vol, pan = 0, verb = 0.15, bus = this.sfxBus) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = vol;
    let node = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    node.connect(bus);
    if (verb > 0) {
      const s = ctx.createGain(); s.gain.value = verb;
      node.connect(s).connect(this.reverb);
    }
    return g;
  }

  noise(brown = false, t = this.ctx.currentTime, dur = 1) {
    const src = this.ctx.createBufferSource();
    src.buffer = brown ? this.brown : this.white;
    src.loop = true;
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return src;
  }

  env(param, t, a, peak, d, end = 0.0001) {
    param.setValueAtTime(0.0001, t);
    param.linearRampToValueAtTime(peak, t + a);
    param.exponentialRampToValueAtTime(Math.max(end, 0.0001), t + a + d);
  }

  // ---------------------------------------------------------------- jet engine (continuous)
  buildEngine() {
    const ctx = this.ctx;
    this.eng = {};
    const E = this.eng;
    E.out = ctx.createGain(); E.out.gain.value = 0;
    E.out.connect(this.sfxBus);
    // turbine rumble
    E.rumble = ctx.createBufferSource(); E.rumble.buffer = this.brown; E.rumble.loop = true;
    E.rumbleF = ctx.createBiquadFilter(); E.rumbleF.type = 'lowpass'; E.rumbleF.frequency.value = 400;
    E.rumbleG = ctx.createGain(); E.rumbleG.gain.value = 0.5;
    E.rumble.connect(E.rumbleF).connect(E.rumbleG).connect(E.out);
    // jet roar (bandpassed white noise)
    E.roar = ctx.createBufferSource(); E.roar.buffer = this.white; E.roar.loop = true;
    E.roarF = ctx.createBiquadFilter(); E.roarF.type = 'bandpass'; E.roarF.frequency.value = 900; E.roarF.Q.value = 0.8;
    E.roarG = ctx.createGain(); E.roarG.gain.value = 0.08;
    E.roar.connect(E.roarF).connect(E.roarG).connect(E.out);
    // turbine whine
    E.whine = ctx.createOscillator(); E.whine.type = 'sine'; E.whine.frequency.value = 2200;
    E.whineG = ctx.createGain(); E.whineG.gain.value = 0.012;
    E.whine.connect(E.whineG).connect(E.out);
    E.whine2 = ctx.createOscillator(); E.whine2.type = 'triangle'; E.whine2.frequency.value = 3300;
    E.whine2G = ctx.createGain(); E.whine2G.gain.value = 0.005;
    E.whine2.connect(E.whine2G).connect(E.out);
    // wind
    E.wind = ctx.createBufferSource(); E.wind.buffer = this.white; E.wind.loop = true;
    E.windF = ctx.createBiquadFilter(); E.windF.type = 'lowpass'; E.windF.frequency.value = 800;
    E.windG = ctx.createGain(); E.windG.gain.value = 0.05;
    E.wind.connect(E.windF).connect(E.windG).connect(E.out);
    // cannon spin hum
    E.gun = ctx.createOscillator(); E.gun.type = 'sawtooth'; E.gun.frequency.value = 80;
    E.gunF = ctx.createBiquadFilter(); E.gunF.type = 'lowpass'; E.gunF.frequency.value = 500;
    E.gunG = ctx.createGain(); E.gunG.gain.value = 0;
    E.gun.connect(E.gunF).connect(E.gunG).connect(this.sfxBus);
    // lock tone
    E.lock = ctx.createOscillator(); E.lock.type = 'square'; E.lock.frequency.value = 1000;
    E.lockF = ctx.createBiquadFilter(); E.lockF.type = 'lowpass'; E.lockF.frequency.value = 2500;
    E.lockG = ctx.createGain(); E.lockG.gain.value = 0;
    E.lock.connect(E.lockF).connect(E.lockG).connect(this.sfxBus);
    for (const s of [E.rumble, E.roar, E.whine, E.whine2, E.wind, E.gun, E.lock]) s.start();
  }

  engine(state) { // { throttle, speed, boosting, alive, active, cockpit }
    if (!this.ctx || !this.eng) return;
    const E = this.eng, t = this.ctx.currentTime, k = 0.08;
    const on = state.active && state.alive;
    const th = state.throttle, sp = clamp(state.speed / 200, 0, 1.4);
    E.out.gain.setTargetAtTime(on ? (state.cockpit ? 0.55 : 0.8) : 0, t, on ? 0.1 : 0.25);
    E.rumbleF.frequency.setTargetAtTime(200 + th * 500 + (state.boosting ? 400 : 0), t, k);
    E.rumbleG.gain.setTargetAtTime(0.35 + th * 0.35 + (state.boosting ? 0.35 : 0), t, k);
    E.roarF.frequency.setTargetAtTime(500 + th * 900 + (state.boosting ? 600 : 0), t, k);
    E.roarG.gain.setTargetAtTime(0.03 + th * 0.06 + (state.boosting ? 0.12 : 0), t, k);
    E.whine.frequency.setTargetAtTime(1500 + th * 1400 + (state.boosting ? 500 : 0), t, 0.3);
    E.whine2.frequency.setTargetAtTime(2400 + th * 1900, t, 0.3);
    E.whineG.gain.setTargetAtTime(0.006 + th * 0.012, t, k);
    E.windF.frequency.setTargetAtTime(300 + sp * 1600, t, k);
    E.windG.gain.setTargetAtTime(0.03 + sp * sp * 0.12, t, k);
  }

  cannon(on) {
    if (!this.ctx || !this.eng) return;
    const E = this.eng, t = this.ctx.currentTime;
    E.gunG.gain.setTargetAtTime(on ? 0.06 : 0, t, on ? 0.02 : 0.08);
    E.gun.frequency.setTargetAtTime(on ? 120 : 60, t, 0.15);
  }

  gunshot() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (t - this.lastShot < 0.03) return;
    this.lastShot = t;
    const o = this.out(0.22, (Math.random() - 0.5) * 0.2, 0.05);
    const n = this.noise(false, t, 0.08);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300 + Math.random() * 400; f.Q.value = 1.2;
    const g = ctx.createGain();
    this.env(g.gain, t, 0.002, 1, 0.06);
    n.connect(f).connect(g).connect(o);
    const s = ctx.createOscillator(); s.type = 'sine';
    s.frequency.setValueAtTime(160, t); s.frequency.exponentialRampToValueAtTime(50, t + 0.07);
    const sg = ctx.createGain(); this.env(sg.gain, t, 0.002, 0.9, 0.07);
    s.connect(sg).connect(o);
    s.start(t); s.stop(t + 0.1);
  }

  missile() {
    if (!this.ready) return;
    const rec = this.sample('missile', { vol: 0.85, rate: 0.95 + Math.random() * 0.1, verb: 0.25 });
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(rec ? 0.3 : 0.5, 0, 0.25);
    const n = this.noise(false, t, 1.6);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.5;
    f.frequency.setValueAtTime(300, t); f.frequency.exponentialRampToValueAtTime(2600, t + 0.35); f.frequency.exponentialRampToValueAtTime(700, t + 1.5);
    const g = ctx.createGain(); this.env(g.gain, t, 0.03, 0.9, 1.45);
    n.connect(f).connect(g).connect(o);
    const r = this.noise(true, t, 1.2);
    const rg = ctx.createGain(); this.env(rg.gain, t, 0.02, 0.8, 1.1);
    r.connect(rg).connect(o);
  }

  lockState(level) { this.lock = level; }
  lockTone() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(0.12, 0, 0);
    for (let i = 0; i < 2; i++) {
      const s = ctx.createOscillator(); s.type = 'square'; s.frequency.value = 1400 + i * 400;
      const g = ctx.createGain(); this.env(g.gain, t + i * 0.07, 0.005, 0.8, 0.06);
      s.connect(g).connect(o); s.start(t + i * 0.07); s.stop(t + i * 0.07 + 0.08);
    }
  }

  explosion(size = 1, pos) {
    if (!this.ready) return;
    const sp = this.spatial(pos, 260);
    if (!sp) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const big = size >= 1.2;
    const rec = this.sample(big ? 'boom_big' : 'boom_small', {
      vol: clamp(0.55 + size * 0.25, 0, 1.4) * sp.vol, pan: sp.pan, verb: 0.35, filter: this.muffle(sp),
      rate: clamp((big ? 1.12 : 1.15) - size * 0.08, 0.72, 1.2) * (0.94 + Math.random() * 0.12),
    });
    if (rec) {
      if (size >= 2) { // sub-bass punch under the biggest blasts
        const o = this.out(0.6 * sp.vol, sp.pan, 0);
        const s = ctx.createOscillator(); s.type = 'sine';
        s.frequency.setValueAtTime(70, t); s.frequency.exponentialRampToValueAtTime(26, t + 0.7);
        const sg = ctx.createGain(); this.env(sg.gain, t, 0.005, 1, 0.8);
        s.connect(sg).connect(o); s.start(t); s.stop(t + 0.9);
      }
      return;
    }
    const dur = 0.7 + size * 0.45;
    const o = this.out(clamp(0.35 + size * 0.22, 0, 1.2) * sp.vol, sp.pan, 0.35);
    const n = this.noise(false, t, dur);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(3500 / Math.sqrt(size), t); f.frequency.exponentialRampToValueAtTime(120, t + dur);
    const g = ctx.createGain(); this.env(g.gain, t, 0.004, 1, dur);
    n.connect(f).connect(g).connect(o);
    const b = this.noise(true, t, dur * 1.2);
    const bg = ctx.createGain(); this.env(bg.gain, t, 0.01, 1.4, dur * 1.2);
    b.connect(bg).connect(o);
    const s = ctx.createOscillator(); s.type = 'sine';
    s.frequency.setValueAtTime(90 / Math.sqrt(size) + 30, t); s.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const sg = ctx.createGain(); this.env(sg.gain, t, 0.005, 1.2, 0.7);
    s.connect(sg).connect(o); s.start(t); s.stop(t + 0.8);
  }

  roar(sound = { pitch: 1, rough: 0.5 }, pos, vol = 1, death = false) {
    if (!this.ready) return;
    const sp = this.spatial(pos, 300);
    if (!sp) return;
    // recorded roars: flyers shriek, small runners screech, the rest bellow. Playback rate
    // follows the species pitch so a lava king sounds far deeper than a horned grazer.
    const p = sound.pitch;
    const key = p >= 2.2 ? 'shriek' : p >= 1.4 ? 'roar_small' : 'roar_big';
    const pr = key === 'shriek' ? p / 2.4 : key === 'roar_small' ? p / 1.9 : 0.55 + p * 0.55;
    const rate = clamp(pr * (death ? 0.82 : 1) * (0.94 + Math.random() * 0.12), 0.5, 1.4);
    if (this.sample(key, { vol: 0.75 * vol * sp.vol, pan: sp.pan, rate, verb: 0.3, filter: this.muffle(sp) })) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const dur = (death ? 1.9 : 1.3) / Math.sqrt(sound.pitch) * (0.9 + Math.random() * 0.2);
    const base = 95 * sound.pitch * (0.92 + Math.random() * 0.16);
    const o = this.out(0.55 * vol * sp.vol, sp.pan, 0.3);
    // throat: two detuned saws, gliding
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(256), k = 2 + sound.rough * 18;
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); }
    shaper.curve = curve;
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 520 * sound.pitch; f1.Q.value = 3;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1250 * sound.pitch; f2.Q.value = 4;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400 * Math.min(1.5, sound.pitch);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 0.12);
    g.gain.setValueAtTime(1, t + dur * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    for (const det of [-1, 1]) {
      const s = ctx.createOscillator(); s.type = 'sawtooth';
      s.frequency.setValueAtTime(base * 0.8, t);
      s.frequency.linearRampToValueAtTime(base * (1.15 + det * 0.02), t + dur * 0.25);
      s.frequency.exponentialRampToValueAtTime(base * (death ? 0.4 : 0.7), t + dur);
      // growl: fast vibrato
      const lfo = ctx.createOscillator(); lfo.frequency.value = 22 + Math.random() * 10;
      const lg = ctx.createGain(); lg.gain.value = base * 0.06 * (0.5 + sound.rough);
      lfo.connect(lg).connect(s.frequency);
      s.connect(shaper);
      s.start(t); s.stop(t + dur + 0.05); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const n = this.noise(false, t, dur);
    const ng = ctx.createGain(); ng.gain.value = 0.25 + sound.rough * 0.3;
    n.connect(ng).connect(shaper);
    shaper.connect(f1); shaper.connect(f2);
    const mix = ctx.createGain(); mix.gain.value = 0.5;
    f1.connect(mix); f2.connect(mix);
    mix.connect(lp).connect(g).connect(o);
  }

  thud(size = 1, pos) {
    if (!this.ready) return;
    const sp = this.spatial(pos, 260);
    if (!sp) return;
    if (this.sample('thud', { vol: clamp(0.6 + size * 0.2, 0, 1.2) * sp.vol, pan: sp.pan, rate: clamp(1.15 - size * 0.12, 0.65, 1.1), verb: 0.3 })) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(clamp(0.4 + size * 0.15, 0, 1) * sp.vol, sp.pan, 0.25);
    const s = ctx.createOscillator(); s.type = 'sine';
    s.frequency.setValueAtTime(70, t); s.frequency.exponentialRampToValueAtTime(30, t + 0.5);
    const g = ctx.createGain(); this.env(g.gain, t, 0.005, 1.2, 0.6);
    s.connect(g).connect(o); s.start(t); s.stop(t + 0.7);
    const n = this.noise(true, t, 0.8);
    const ng = ctx.createGain(); this.env(ng.gain, t, 0.01, 1, 0.7);
    n.connect(ng).connect(o);
  }

  fireball(pos) {
    if (!this.ready) return;
    const sp = this.spatial(pos, 300);
    if (!sp) return;
    if (this.sample('fire', { vol: 0.7 * sp.vol, pan: sp.pan, rate: 0.9 + Math.random() * 0.2, verb: 0.2, filter: this.muffle(sp) })) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(0.45 * sp.vol, sp.pan, 0.2);
    const n = this.noise(false, t, 0.9);
    const f = ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(2200, t + 0.15); f.frequency.exponentialRampToValueAtTime(300, t + 0.8);
    const g = ctx.createGain(); this.env(g.gain, t, 0.03, 1, 0.8);
    n.connect(f).connect(g).connect(o);
  }

  hit(kind) {
    if (!this.ready) return;
    if (kind !== 'acid') this.sample('clang', { vol: 0.65, pan: (Math.random() - 0.5) * 0.4, rate: 0.85 + Math.random() * 0.3, verb: 0.15 });
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(0.5, (Math.random() - 0.5) * 0.4, 0.15);
    const n = this.noise(false, t, 0.4);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'acid' ? 4200 : 2300; f.Q.value = 6;
    const g = ctx.createGain(); this.env(g.gain, t, 0.002, 1.2, 0.35);
    n.connect(f).connect(g).connect(o);
    const s = ctx.createOscillator(); s.type = 'square'; s.frequency.setValueAtTime(240, t); s.frequency.exponentialRampToValueAtTime(90, t + 0.25);
    const sg = ctx.createGain(); this.env(sg.gain, t, 0.002, 0.35, 0.25);
    s.connect(sg).connect(o); s.start(t); s.stop(t + 0.3);
  }

  overheat() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(0.25, 0, 0.1);
    const n = this.noise(false, t, 1.1);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500;
    const g = ctx.createGain(); this.env(g.gain, t, 0.02, 0.8, 1.0);
    n.connect(f).connect(g).connect(o);
  }

  pickup() {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(0.22, 0, 0.3);
    [72, 76, 79, 84].forEach((m, i) => {
      const s = ctx.createOscillator(); s.type = 'triangle'; s.frequency.value = mtof(m);
      const g = ctx.createGain(); this.env(g.gain, t + i * 0.06, 0.005, 0.9, 0.3);
      s.connect(g).connect(o); s.start(t + i * 0.06); s.stop(t + i * 0.06 + 0.35);
    });
  }

  horn() { // new wave / boss phase
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(0.3, 0, 0.45);
    for (const m of [38, 45, 50]) {
      for (const d of [-0.07, 0.07]) {
        const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = mtof(m + d);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass';
        f.frequency.setValueAtTime(300, t); f.frequency.linearRampToValueAtTime(1400, t + 0.5); f.frequency.linearRampToValueAtTime(500, t + 1.6);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 0.25); g.gain.setValueAtTime(0.35, t + 1.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        s.connect(f).connect(g).connect(o); s.start(t); s.stop(t + 1.9);
      }
    }
  }

  alarm(on) { this.alarmOn = on; }

  beep(freq, dur, vol = 0.12, type = 'square') {
    if (!this.ready) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(vol, 0, 0);
    const s = ctx.createOscillator(); s.type = type; s.frequency.value = freq;
    const g = ctx.createGain(); this.env(g.gain, t, 0.004, 1, dur);
    s.connect(g).connect(o); s.start(t); s.stop(t + dur + 0.02);
  }

  ui(kind = 'click') {
    if (!this.ready) return;
    switch (kind) {
      case 'hover': this.beep(1600, 0.03, 0.03, 'sine'); break;
      case 'click': this.beep(900, 0.06, 0.08, 'triangle'); this.beep(1350, 0.05, 0.05, 'triangle'); break;
      case 'deny': this.beep(220, 0.12, 0.1, 'square'); break;
      case 'reload': this.beep(1200, 0.05, 0.05, 'triangle'); break;
      case 'win': this.fanfare(true); break;
      case 'lose': this.fanfare(false); break;
      default: this.beep(1000, 0.05, 0.05);
    }
  }

  fanfare(win) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = this.out(0.25, 0, 0.4);
    const notes = win ? [[62, 0], [66, 0.15], [69, 0.3], [74, 0.45], [74, 0.75]] : [[62, 0], [61, 0.3], [60, 0.6], [55, 0.9]];
    for (const [m, dt] of notes) {
      for (const d of [-0.06, 0.06]) {
        const s = ctx.createOscillator(); s.type = 'sawtooth'; s.frequency.value = mtof(m + d);
        const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1800;
        const g = ctx.createGain(); this.env(g.gain, t + dt, 0.02, 0.4, win && dt > 0.7 ? 1.4 : 0.5);
        s.connect(f).connect(g).connect(o); s.start(t + dt); s.stop(t + dt + 1.6);
      }
    }
  }

  // ---------------------------------------------------------------- per-frame
  update(dt) {
    if (!this.ctx || !this.eng) return;
    const E = this.eng, t = this.ctx.currentTime;
    // lock tone: beeping while acquiring, steady when locked
    if (this.lock === 2) {
      E.lock.frequency.setTargetAtTime(1500, t, 0.01);
      E.lockG.gain.setTargetAtTime(0.035, t, 0.01);
    } else if (this.lock === 1) {
      this.lockTimer -= dt;
      E.lock.frequency.setTargetAtTime(950, t, 0.01);
      if (this.lockTimer <= 0) {
        this.lockTimer = 0.16;
        E.lockG.gain.cancelScheduledValues(t);
        E.lockG.gain.setValueAtTime(0.035, t);
        E.lockG.gain.setValueAtTime(0, t + 0.06);
      }
    } else E.lockG.gain.setTargetAtTime(0, t, 0.01);
    if (this.alarmOn) {
      this.alarmTimer -= dt;
      if (this.alarmTimer <= 0) { this.alarmTimer = 0.5; this.beep(740, 0.18, 0.06, 'square'); }
    }
    this.updateAmbience(dt);
  }

  // ---------------------------------------------------------------- music
  music(id) {
    if (!this.ctx) return;
    if (this.trackId === id) return;
    this.trackId = id;
    this.track = id === null ? null : TRACKS[id];
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.15;
    if (!this.timer) this.timer = setInterval(() => this.schedule(), 25);
  }

  setIntensity(x) { this.intensity = clamp(x, 0, 1); }

  schedule() {
    if (!this.ctx || !this.track || this.ctx.state !== 'running') return;
    const T = this.track, stepDur = 60 / T.bpm / 4;
    if (this.nextTime < this.ctx.currentTime - 0.2) this.nextTime = this.ctx.currentTime + 0.05;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      this.playStep(T, this.step, this.nextTime, stepDur);
      this.nextTime += stepDur;
      this.step++;
    }
  }

  playStep(T, step, t, sd) {
    const I = this.intensity;
    const s = step % 16, bar = Math.floor(step / 16);
    const chord = T.chords[bar % T.chords.length];
    const on = (pat) => pat && pat[s] === '1';
    if (s === 0) this.pad(chord.map((c) => T.root + 12 + c), t, sd * 16);
    if (on(T.bass)) this.bass(T.root - 12 + chord[0] + (s === 14 && bar % 2 ? 7 : 0), t, sd * 1.8);
    if (I > 0.25 && on(T.hat)) this.hat(t, s % 4 === 2 ? 0.6 : 0.35);
    if (I > 0.45 && on(T.kick)) this.kick(t);
    if (I > 0.45 && on(T.snare)) this.snare(t);
    if (I > 0.6 && on(T.arp)) {
      const notes = chord.concat(chord.map((c) => c + 12));
      const idx = [0, 1, 2, 3, 4, 3, 2, 1][(step >> 0) % 8];
      this.arp(T.root + 24 + notes[idx], t, sd);
    } else if (T === TRACKS.menu && on(T.arp) && s % 4 === 0) this.arp(T.root + 24 + chord[(s >> 2) % 3], t, sd * 2);
    if (I > 0.8 && on(T.stab)) this.stab(chord.map((c) => T.root + c), t);
  }

  voice(type, freq, t, dur, vol, cutoff, attack = 0.01, dest = this.musicBus) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + Math.max(attack, dur * 0.7));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(dest);
    o.start(t); o.stop(t + dur + 0.05);
    return g;
  }

  pad(notes, t, dur) {
    for (const n of notes) for (const d of [-0.08, 0.08]) {
      const g = this.voice('sawtooth', mtof(n + d), t, dur, 0.035, 1100, 0.6);
      const s = this.ctx.createGain(); s.gain.value = 0.5;
      g.connect(s).connect(this.reverb);
    }
  }

  bass(n, t, dur) { this.voice('sawtooth', mtof(n), t, dur, 0.13, 380, 0.005); this.voice('sine', mtof(n - 12), t, dur, 0.12, 200, 0.005); }

  arp(n, t, dur) {
    const g = this.voice('square', mtof(n), t, dur * 0.9, 0.03, 2600, 0.004);
    const s = this.ctx.createGain(); s.gain.value = 0.6;
    g.connect(s).connect(this.delay);
  }

  stab(notes, t) {
    for (const n of notes) for (const d of [-0.1, 0.1]) this.voice('sawtooth', mtof(n + 12 + d), t, 0.35, 0.05, 1600, 0.01);
  }

  kick(t) {
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain(); this.env(g.gain, t, 0.002, 0.55, 0.32);
    o.connect(g).connect(this.musicBus); o.start(t); o.stop(t + 0.4);
  }

  snare(t) {
    const ctx = this.ctx;
    const n = this.noise(false, t, 0.25);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.9;
    const g = ctx.createGain(); this.env(g.gain, t, 0.002, 0.3, 0.18);
    n.connect(f).connect(g).connect(this.musicBus);
    const s = ctx.createGain(); s.gain.value = 0.3; g.connect(s).connect(this.reverb);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    const og = ctx.createGain(); this.env(og.gain, t, 0.002, 0.2, 0.1);
    o.connect(og).connect(this.musicBus); o.start(t); o.stop(t + 0.15);
  }

  hat(t, vol = 0.4) {
    const ctx = this.ctx;
    const n = this.noise(false, t, 0.06);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = ctx.createGain(); this.env(g.gain, t, 0.001, 0.12 * vol, 0.045);
    n.connect(f).connect(g).connect(this.musicBus);
  }
}
