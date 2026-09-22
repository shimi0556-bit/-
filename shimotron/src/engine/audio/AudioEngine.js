import * as THREE from 'three';

/**
 * Fully procedural sound: no audio files. Ambience layers (wind, surf,
 * birds by day, crickets by night), positional fire crackle and
 * physically-driven impact sounds per material, through a shared
 * convolution reverb and a master compressor.
 */
export class AudioEngine {
  constructor(engine) {
    this.engine = engine;
    this.ctx = null;
    this.enabled = false;
    this.volume = 0.8;
    this._birdTimer = 2;
    this._lastImpact = 0;
    this.sources = []; // positional loops: { panner, gain, position }
  }

  /** Must be called from a user gesture. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.enabled = true;
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this._impulse(2.6, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.28;
    this.reverbSend.connect(this.reverb).connect(this.master);
    this.noise = this._noiseBuffer(4, 'pink');
    this.brown = this._noiseBuffer(4, 'brown');
    this._ambience();
    this.enabled = true;
    this.engine.events.on('impact', (e) => this.impact(e));
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setEnabled(on) {
    if (on) this.unlock();
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.08);
  }

  _noiseBuffer(seconds, color) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else if (color === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }

  _impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  _loop(buffer) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = true;
    s.start(0, Math.random() * buffer.duration);
    return s;
  }

  _ambience() {
    const ctx = this.ctx;
    // Wind: pink noise through a wandering band-pass.
    const wind = this._loop(this.noise);
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    this.windGain.connect(this.reverbSend);
    // Surf: brown noise low-passed with a slow swell.
    const surf = this._loop(this.brown);
    this.surfFilter = ctx.createBiquadFilter();
    this.surfFilter.type = 'lowpass';
    this.surfFilter.frequency.value = 700;
    this.surfGain = ctx.createGain();
    this.surfGain.gain.value = 0;
    surf.connect(this.surfFilter).connect(this.surfGain).connect(this.master);
    // Crickets: amplitude-pulsed high sine pair.
    const osc = ctx.createOscillator();
    osc.frequency.value = 4400;
    const osc2 = ctx.createOscillator();
    osc2.frequency.value = 4630;
    const am = ctx.createOscillator();
    am.frequency.value = 28;
    const amGain = ctx.createGain();
    amGain.gain.value = 0.5;
    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0;
    const cricketMix = ctx.createGain();
    cricketMix.gain.value = 0.5;
    am.connect(amGain).connect(cricketMix.gain);
    osc.connect(cricketMix);
    osc2.connect(cricketMix);
    cricketMix.connect(this.cricketGain).connect(this.master);
    this.cricketGain.connect(this.reverbSend);
    osc.start();
    osc2.start();
    am.start();
  }

  /** Positional looping crackle (campfire). Returns a handle with .position. */
  addFire(position) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const panner = this._panner(position, 4, 40);
    const g = ctx.createGain();
    g.gain.value = 0.9;
    const roar = this._loop(this.brown);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    const roarGain = ctx.createGain();
    roarGain.gain.value = 0.5;
    roar.connect(lp).connect(roarGain).connect(g);
    g.connect(panner).connect(this.master);
    const handle = { panner, gain: g, position: position.clone(), crackle: 0 };
    this.sources.push(handle);
    return handle;
  }

  _panner(position, ref = 3, max = 80) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = max;
    p.rolloffFactor = 1.3;
    p.positionX.value = position.x;
    p.positionY.value = position.y;
    p.positionZ.value = position.z;
    return p;
  }

  _burst(dest, { dur = 0.08, freq = 1200, q = 1, gain = 0.5, type = 'bandpass', when = 0 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 3, dur + 0.05);
  }

  _tone(dest, { freq = 440, dur = 0.4, gain = 0.2, type = 'sine', when = 0, slide = 1 }) {
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide !== 1) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  /** Material-aware impact at a world point. */
  impact({ speed, point, material }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this._lastImpact < 0.025) return; // voice limiting
    this._lastImpact = now;
    const v = Math.min(1, (speed - 1) / 9);
    const panner = this._panner(point, 3, 90);
    const out = this.ctx.createGain();
    out.gain.value = 0.25 + v * 0.9;
    out.connect(panner).connect(this.master);
    out.connect(this.reverbSend);
    if (material === 'metal') {
      for (const f of [523, 1307, 2310, 3389]) this._tone(out, { freq: f * (0.95 + Math.random() * 0.1), dur: 0.9, gain: 0.06, type: 'sine' });
      this._burst(out, { dur: 0.03, freq: 5000, gain: 0.25, type: 'highpass' });
    } else if (material === 'rubber') {
      this._tone(out, { freq: 140, dur: 0.18, gain: 0.5, slide: 0.5 });
      this._burst(out, { dur: 0.05, freq: 300, gain: 0.25 });
    } else if (material === 'wood') {
      this._burst(out, { dur: 0.09, freq: 700 + Math.random() * 300, q: 2.5, gain: 0.7 });
      this._tone(out, { freq: 230 + Math.random() * 60, dur: 0.12, gain: 0.25, type: 'triangle' });
    } else {
      this._burst(out, { dur: 0.12, freq: 350, q: 0.8, gain: 0.7, type: 'lowpass' });
      this._burst(out, { dur: 0.04, freq: 2500, gain: 0.2 });
    }
  }

  /** Soft footstep; surface picks the colour (grass, stone, wood, sand, water). */
  step(surface = 'grass', speed = 4) {
    if (!this.enabled || !this.ctx) return;
    const g = 0.12 + Math.min(speed, 9) * 0.015;
    const f = { grass: 900, stone: 1900, wood: 700, sand: 1200, water: 600 }[surface] || 1000;
    this._burst(this.master, { dur: surface === 'water' ? 0.22 : 0.07, freq: f * (0.85 + Math.random() * 0.3), q: surface === 'stone' ? 2.5 : 0.9, gain: g });
    if (surface === 'wood' || surface === 'stone') this._tone(this.master, { freq: surface === 'wood' ? 160 : 240, dur: 0.06, gain: g * 0.5, type: 'triangle' });
  }

  ui(kind = 'click') {
    if (!this.enabled || !this.ctx) return;
    if (kind === 'click') this._tone(this.master, { freq: 1800, dur: 0.05, gain: 0.05, type: 'triangle' });
    else if (kind === 'spawn') {
      this._tone(this.master, { freq: 420, dur: 0.18, gain: 0.08, slide: 2.2 });
      this._tone(this.master, { freq: 840, dur: 0.14, gain: 0.04, slide: 1.8, when: 0.03 });
    } else if (kind === 'shoot') {
      this._burst(this.master, { dur: 0.22, freq: 900, q: 0.7, gain: 0.35 });
      this._tone(this.master, { freq: 220, dur: 0.2, gain: 0.15, slide: 0.4 });
    } else if (kind === 'delete') this._tone(this.master, { freq: 600, dur: 0.16, gain: 0.07, slide: 0.4 });
    else if (kind === 'boom') {
      this._burst(this.master, { dur: 1.2, freq: 180, q: 0.5, gain: 1, type: 'lowpass' });
      this._tone(this.master, { freq: 70, dur: 1.0, gain: 0.5, slide: 0.35 });
    }
  }

  _chirp() {
    const ctx = this.ctx;
    const pos = this.engine.camera.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 60, 8 + Math.random() * 10, (Math.random() - 0.5) * 60));
    const panner = this._panner(pos, 6, 120);
    const g = ctx.createGain();
    g.gain.value = 0.12 * this.engine.atmosphere.dayFactor;
    g.connect(panner).connect(this.master);
    g.connect(this.reverbSend);
    const base = 2200 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) this._tone(g, { freq: base * (0.9 + Math.random() * 0.25), dur: 0.09 + Math.random() * 0.06, gain: 0.35, when: i * (0.11 + Math.random() * 0.05), slide: 1.35 + Math.random() * 0.3 });
  }

  update(dt) {
    if (!this.ctx || !this.enabled) return;
    const eng = this.engine;
    const cam = eng.camera;
    const t = this.ctx.currentTime;
    const L = this.ctx.listener;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    if (L.positionX) {
      L.positionX.setTargetAtTime(cam.position.x, t, 0.02);
      L.positionY.setTargetAtTime(cam.position.y, t, 0.02);
      L.positionZ.setTargetAtTime(cam.position.z, t, 0.02);
      L.forwardX.setTargetAtTime(fwd.x, t, 0.02);
      L.forwardY.setTargetAtTime(fwd.y, t, 0.02);
      L.forwardZ.setTargetAtTime(fwd.z, t, 0.02);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    }
    const atm = eng.atmosphere;
    const w = atm.wind.strength;
    const h = Math.max(0, cam.position.y);
    const gust = 0.6 + 0.4 * Math.sin(eng.time.elapsed * 0.31) * Math.sin(eng.time.elapsed * 0.17 + 1);
    this.windGain.gain.setTargetAtTime((0.05 + w * 0.12 + Math.min(h, 80) * 0.002) * gust, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(350 + gust * 500 * w + h * 4, t, 0.4);
    const distCenter = Math.hypot(cam.position.x, cam.position.z);
    // Games can say how close the listener is to the shore (0..1); default: distance from the island centre.
    const coast = this.coastFactor ? this.coastFactor(cam.position) : Math.min(1, Math.max(0, (distCenter - 150) / 250));
    const swell = 0.6 + 0.4 * Math.sin(eng.time.elapsed * 0.45);
    this.surfGain.gain.setTargetAtTime((0.05 + coast * 0.35) * swell * (h < 60 ? 1 : 0.4), t, 0.4);
    this.cricketGain.gain.setTargetAtTime(atm.nightFactor * 0.016 * (0.6 + 0.4 * Math.sin(eng.time.elapsed * 0.7)), t, 0.5);
    this._birdTimer -= dt;
    if (this._birdTimer <= 0) {
      this._birdTimer = 1.5 + Math.random() * 5;
      if (atm.dayFactor > 0.5 && h < 60) this._chirp();
    }
    for (const s of this.sources) {
      // Random crackles on the fire loop.
      if (Math.random() < dt * 9) this._burst(s.gain, { dur: 0.02 + Math.random() * 0.04, freq: 1500 + Math.random() * 3500, q: 3, gain: 0.3 + Math.random() * 0.5 });
    }
  }
}
