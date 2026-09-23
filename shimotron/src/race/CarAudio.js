/**
 * Procedural car sound on the engine's AudioContext: no samples.
 *  - player: three detuned oscillators through distortion and a throttle-
 *    driven low-pass (engine), band-passed noise (intake, tyre squeal),
 *    wind and off-road rumble, nitro hiss, shift blips and lift-off pops;
 *  - AI cars: one positional voice each (oscillator pair + filter).
 */
export class CarAudio {
  constructor(audio) {
    this.audio = audio;
    this.ctx = audio.ctx;
    this.voices = new Map();
    this.enabled = !!this.ctx;
    if (!this.enabled) return;
    const ctx = this.ctx;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(audio.master);
  }

  _shaper(amount) {
    const ws = this.ctx.createWaveShaper();
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
    }
    ws.curve = curve;
    return ws;
  }

  _noise(buffer, type, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start(0, Math.random() * 2);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g);
    return { src, f, g };
  }

  /** Full engine + chassis sound for the player's car. */
  attachPlayer(car) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 1;
    out.connect(this.bus);
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 3;
    const shaper = this._shaper(2.2);
    const oscs = [
      { type: 'sawtooth', mul: 1, gain: 0.42 },
      { type: 'square', mul: 0.5, gain: 0.3 },
      { type: 'sawtooth', mul: 2.01, gain: 0.14 },
    ].map((d) => {
      const o = ctx.createOscillator();
      o.type = d.type;
      const g = ctx.createGain();
      g.gain.value = d.gain;
      o.connect(g).connect(shaper);
      o.start();
      return { o, mul: d.mul };
    });
    shaper.connect(lp).connect(engineGain).connect(out);
    engineGain.connect(this.audio.reverbSend);
    const intake = this._noise(this.audio.noise, 'bandpass', 800, 1.2);
    intake.g.connect(out);
    const squeal = this._noise(this.audio.noise, 'bandpass', 1100, 5);
    squeal.g.connect(out);
    const wind = this._noise(this.audio.noise, 'lowpass', 600, 0.5);
    wind.g.connect(out);
    const rumble = this._noise(this.audio.brown, 'lowpass', 180, 0.8);
    rumble.g.connect(out);
    const nitro = this._noise(this.audio.noise, 'highpass', 2600, 0.6);
    nitro.g.connect(out);
    this.player = { car, out, engineGain, lp, oscs, intake, squeal, wind, rumble, nitro, lastThrottle: 0, popT: 0 };
    car.vehicle.onShift = (gear, up) => this._shift(up);
  }

  _shift(up) {
    const p = this.player;
    if (!p) return;
    const t = this.ctx.currentTime;
    p.engineGain.gain.cancelScheduledValues(t);
    p.engineGain.gain.setTargetAtTime(0.03, t, 0.012);
    p.engineGain.gain.setTargetAtTime(0.2, t + 0.09, 0.04);
    if (up) this.audio._burst(p.out, { dur: 0.06, freq: 3200, q: 2, gain: 0.05 });
  }

  /** A quieter positional voice for an opponent. */
  attachAI(car) {
    if (!this.enabled) return;
    const ctx = this.ctx;
    const panner = this.audio._panner(car.position, 6, 220);
    const g = ctx.createGain();
    g.gain.value = 0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const o1 = ctx.createOscillator();
    o1.type = 'sawtooth';
    const o2 = ctx.createOscillator();
    o2.type = 'square';
    const g2 = ctx.createGain();
    g2.gain.value = 0.4;
    o1.connect(lp);
    o2.connect(g2).connect(lp);
    lp.connect(g).connect(panner).connect(this.bus);
    o1.start();
    o2.start();
    this.voices.set(car, { panner, g, lp, o1, o2 });
  }

  update(dt) {
    if (!this.enabled || !this.audio.enabled) return;
    const t = this.ctx.currentTime;
    const p = this.player;
    if (p) {
      const veh = p.car.vehicle;
      const C = veh.controls;
      const rpm = veh.rpm;
      const f0 = rpm / 30;
      for (const o of p.oscs) o.o.frequency.setTargetAtTime(f0 * o.mul * (1 + (Math.random() - 0.5) * 0.004), t, 0.015);
      const thr = C.throttle;
      const load = veh.shift > 0 ? 0.05 : 0.08 + thr * 0.16 + (rpm / 8000) * 0.05;
      if (veh.shift <= 0) p.engineGain.gain.setTargetAtTime(load, t, 0.05);
      p.lp.frequency.setTargetAtTime(420 + thr * 2200 + rpm * 0.25, t, 0.05);
      p.intake.f.frequency.setTargetAtTime(f0 * 4, t, 0.05);
      p.intake.g.gain.setTargetAtTime(thr * 0.05 * (rpm / 8000), t, 0.06);
      const v = Math.abs(veh.speed);
      const slip = Math.max(veh.slip[0], veh.slip[1], veh.slip[2], veh.slip[3], Math.min(1, Math.max(0, (Math.abs(veh.lateralSpeed()) - 2.5) / 5)));
      const onAsphalt = p.car.offroad < 0.5;
      const sq = onAsphalt && v > 4 ? Math.max(0, slip - 0.15) * 0.22 : 0;
      p.squeal.g.gain.setTargetAtTime(sq, t, 0.04);
      p.squeal.f.frequency.setTargetAtTime(950 + slip * 500 + Math.sin(t * 13) * 60, t, 0.05);
      p.wind.g.gain.setTargetAtTime(Math.min(0.2, v * v * 0.00005), t, 0.2);
      p.wind.f.frequency.setTargetAtTime(400 + v * 18, t, 0.2);
      p.rumble.g.gain.setTargetAtTime(p.car.offroad * Math.min(1, v / 20) * 0.5, t, 0.08);
      p.nitro.g.gain.setTargetAtTime(veh.nitroActive ? 0.09 : 0, t, 0.08);
      // Lift-off pops at high revs.
      p.popT -= dt;
      if (p.lastThrottle > 0.7 && thr < 0.2 && rpm > 5200) p.popT = 0.6;
      if (p.popT > 0 && Math.random() < dt * 14) this.audio._burst(p.out, { dur: 0.05, freq: 180 + Math.random() * 200, q: 0.7, gain: 0.35, type: 'lowpass' });
      p.lastThrottle = thr;
    }
    for (const [car, v] of this.voices) {
      const veh = car.vehicle;
      const pos = car.position;
      v.panner.positionX.setTargetAtTime(pos.x, t, 0.03);
      v.panner.positionY.setTargetAtTime(pos.y, t, 0.03);
      v.panner.positionZ.setTargetAtTime(pos.z, t, 0.03);
      const f0 = veh.rpm / 30;
      v.o1.frequency.setTargetAtTime(f0, t, 0.03);
      v.o2.frequency.setTargetAtTime(f0 * 0.5, t, 0.03);
      v.lp.frequency.setTargetAtTime(500 + veh.controls.throttle * 1400, t, 0.05);
      v.g.gain.setTargetAtTime(0.06 + veh.controls.throttle * 0.1, t, 0.08);
    }
  }

  /** Countdown and finish cues. */
  beep(high = false) {
    if (!this.enabled || !this.audio.enabled) return;
    this.audio._tone(this.bus, { freq: high ? 1320 : 660, dur: high ? 0.7 : 0.25, gain: 0.18, type: 'square' });
  }

  fanfare() {
    if (!this.enabled || !this.audio.enabled) return;
    [523, 659, 784, 1047].forEach((f, i) => this.audio._tone(this.bus, { freq: f, dur: 0.5, gain: 0.12, type: 'triangle', when: i * 0.13 }));
  }

  mute(on) {
    if (!this.enabled) return;
    this.bus.gain.setTargetAtTime(on ? 0 : 0.9, this.ctx.currentTime, 0.1);
  }

  dispose() {
    if (!this.enabled) return;
    const stop = (n) => {
      try {
        n.stop();
      } catch {
        /* already stopped */
      }
    };
    if (this.player) {
      for (const o of this.player.oscs) stop(o.o);
      for (const k of ['intake', 'squeal', 'wind', 'rumble', 'nitro']) stop(this.player[k].src);
      this.player.out.disconnect();
      this.player = null;
    }
    for (const v of this.voices.values()) {
      stop(v.o1);
      stop(v.o2);
      v.g.disconnect();
    }
    this.voices.clear();
    this.bus.disconnect();
  }
}
