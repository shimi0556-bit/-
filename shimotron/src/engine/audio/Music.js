/**
 * Procedural music, synthesised live (no audio files): a look-ahead
 * sixteenth-note sequencer drives pads, bass, arpeggios, a simple lead
 * and a drum kit, all built from oscillators and filtered noise.
 *
 * Each style has its own key, scale, chord loop, tempo range and
 * timbres. The game steers two things while it plays:
 *   intensity 0..1  layers come in with it (pad → bass → kick → arp →
 *                   hats → snare → lead) and the filters open;
 *   pace 0..1       the tempo follows it, from the style's slow end to
 *                   its fast end, so the music runs with the race.
 */

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10], // Phrygian dominant
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
};

/** chords: scale degrees (0-based) of each bar's root; the chord is stacked in thirds from the scale. */
export const MUSIC_STYLES = {
  menu: { root: 57, scale: 'minor', chords: [0, 5, 2, 6], bpm: [88, 96], kick: 'none', arp: 'up', arpWave: 'triangle', pad: 'sawtooth', lead: false, swing: 0 },
  world: { root: 55, scale: 'lydian', chords: [0, 1, 4, 3], bpm: [84, 92], kick: 'none', arp: 'bells', arpWave: 'sine', pad: 'sawtooth', lead: false, swing: 0 },
  pines: { root: 57, scale: 'major', chords: [0, 4, 5, 3], bpm: [118, 148], kick: 'four', arp: 'updown', arpWave: 'square', pad: 'sawtooth', lead: true, swing: 0 },
  dunes: { root: 50, scale: 'hijaz', chords: [0, 1, 0, 6], bpm: [112, 142], kick: 'darbuka', arp: 'trill', arpWave: 'sawtooth', pad: 'triangle', lead: true, swing: 0.12 },
  lagoon: { root: 53, scale: 'major', chords: [0, 5, 3, 4], bpm: [108, 132], kick: 'four', arp: 'marimba', arpWave: 'sine', pad: 'triangle', lead: true, swing: 0.18 },
  ice: { root: 52, scale: 'minor', chords: [0, 5, 3, 6], bpm: [96, 128], kick: 'half', arp: 'bells', arpWave: 'sine', pad: 'sawtooth', lead: false, swing: 0 },
  lava: { root: 48, scale: 'phrygian', chords: [0, 1, 5, 6], bpm: [128, 162], kick: 'four', arp: 'up', arpWave: 'sawtooth', pad: 'sawtooth', lead: true, swing: 0 },
  city: { root: 54, scale: 'minor', chords: [0, 5, 2, 6], bpm: [116, 148], kick: 'four', arp: 'gated', arpWave: 'sawtooth', pad: 'sawtooth', lead: true, swing: 0 },
  canyon: { root: 52, scale: 'dorian', chords: [0, 6, 3, 0], bpm: [120, 152], kick: 'rock', arp: 'updown', arpWave: 'square', pad: 'triangle', lead: true, swing: 0.08 },
  sea: { root: 53, scale: 'lydian', chords: [0, 1, 4, 3], bpm: [100, 128], kick: 'half', arp: 'marimba', arpWave: 'sine', pad: 'triangle', lead: true, swing: 0.1 },
  deep: { root: 45, scale: 'dorian', chords: [0, 3, 5, 4], bpm: [80, 104], kick: 'half', arp: 'bells', arpWave: 'sine', pad: 'sawtooth', lead: false, swing: 0 },
  sky: { root: 55, scale: 'lydian', chords: [0, 4, 1, 5], bpm: [110, 140], kick: 'four', arp: 'updown', arpWave: 'triangle', pad: 'sawtooth', lead: true, swing: 0 },
  space: { root: 50, scale: 'minor', chords: [0, 5, 6, 4], bpm: [104, 144], kick: 'four', arp: 'gated', arpWave: 'sawtooth', pad: 'sawtooth', lead: true, swing: 0 },
};

export class Music {
  constructor(audio) {
    this.audio = audio;
    this.intensity = 0.3;
    this.pace = 0;
    this.bpm = 100;
    this.step = 0;
    this.bar = 0;
    this.playing = false;
    this.styleId = 'menu';
    this.style = MUSIC_STYLES.menu;
    this._riser = 0;
  }

  get ctx() {
    return this.audio.ctx;
  }

  _ensure() {
    const ctx = this.ctx;
    if (!ctx || this.out) return !!ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0.34;
    this.out.connect(this.audio.buses ? this.audio.buses.music : this.audio.master);
    // A touch of the shared reverb for space.
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.35;
    this.out.connect(this.wet).connect(this.audio.reverbSend);
    // Filtered buses so intensity can open the sound up.
    this.padFilter = ctx.createBiquadFilter();
    this.padFilter.type = 'lowpass';
    this.padFilter.frequency.value = 900;
    this.padFilter.Q.value = 0.7;
    this.padFilter.connect(this.out);
    this.bassFilter = ctx.createBiquadFilter();
    this.bassFilter.type = 'lowpass';
    this.bassFilter.frequency.value = 500;
    this.bassFilter.Q.value = 4;
    this.bassFilter.connect(this.out);
    // Side-chain duck: the kick dips pads and bass for the pumping feel.
    this.duck = ctx.createGain();
    this.duck.connect(this.padFilter);
    return true;
  }

  /** Switches style (key, tempo, timbres); the change lands on the next bar. */
  setStyle(id) {
    if (!MUSIC_STYLES[id] || id === this.styleId) return;
    this._nextStyle = id;
  }

  play(id = this.styleId) {
    if (!this._ensure()) return;
    this.styleId = id;
    this.style = MUSIC_STYLES[id] || MUSIC_STYLES.menu;
    this.bpm = this.style.bpm[0];
    if (this.playing) return;
    this.playing = true;
    this.step = 0;
    this.bar = 0;
    this.next = this.ctx.currentTime + 0.1;
    this.timer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    this.playing = false;
    clearInterval(this.timer);
    this.timer = null;
  }

  /** intensity and pace in 0..1 (smoothed here). */
  drive(intensity, pace = this.pace) {
    this.targetIntensity = Math.max(0, Math.min(1, intensity));
    this.targetPace = Math.max(0, Math.min(1, pace));
  }

  /** A rising sweep into the next downbeat (nitro, last lap, launch). */
  riser() {
    this._riser = 1;
  }

  _schedule() {
    const ctx = this.ctx;
    if (!ctx || !this.playing) return;
    if (ctx.state !== 'running') {
      this.next = ctx.currentTime + 0.1;
      return;
    }
    // Ease intensity and tempo.
    const ti = this.targetIntensity ?? this.intensity;
    const tp = this.targetPace ?? this.pace;
    this.intensity += (ti - this.intensity) * 0.04;
    this.pace += (tp - this.pace) * 0.02;
    const [lo, hi] = this.style.bpm;
    this.bpm = lo + (hi - lo) * this.pace;
    const t0 = ctx.currentTime;
    const I = this.intensity;
    this.padFilter.frequency.setTargetAtTime(500 + I * I * 4200, t0, 0.3);
    this.bassFilter.frequency.setTargetAtTime(260 + I * 1600, t0, 0.3);
    while (this.next < t0 + 0.14) {
      this._play(this.step, this.next);
      const sixteenth = 60 / this.bpm / 4;
      const sw = this.style.swing * sixteenth;
      this.next += sixteenth + (this.step % 2 === 0 ? sw : -sw);
      this.step = (this.step + 1) % 16;
      if (this.step === 0) {
        this.bar++;
        if (this._nextStyle) {
          this.styleId = this._nextStyle;
          this.style = MUSIC_STYLES[this._nextStyle];
          this._nextStyle = null;
          this.bar = 0;
        }
      }
    }
  }

  /** Chord tones (MIDI) for the current bar. */
  _chord() {
    const st = this.style;
    const sc = SCALES[st.scale];
    const deg = st.chords[this.bar % st.chords.length];
    const note = (d) => st.root + sc[((d % 7) + 7) % 7] + 12 * Math.floor(d / 7);
    return [note(deg), note(deg + 2), note(deg + 4), note(deg + 6)];
  }

  _play(step, t) {
    const st = this.style;
    const I = this.intensity;
    const chord = this._chord();
    const beat = step % 4 === 0;
    // Pad: a new chord every bar.
    if (step === 0) this._pad(chord, t, (60 / this.bpm) * 4, I);
    // Bass.
    if (I > 0.12) {
      const pattern = st.kick === 'darbuka' ? [0, 3, 6, 10, 12] : st.kick === 'rock' ? [0, 2, 6, 8, 10, 14] : [0, 3, 6, 8, 11, 14];
      if (pattern.includes(step)) this._bass(chord[0] - 12 + (step === 14 && I > 0.6 ? 7 : 0), t, I);
    }
    // Drums.
    if (I > 0.28) {
      const k = st.kick;
      const kick = k === 'four' ? beat : k === 'half' ? step === 0 || step === 10 : k === 'rock' ? step === 0 || step === 6 || step === 8 : k === 'darbuka' ? step === 0 || step === 7 || step === 10 : false;
      if (kick) this._kick(t, I);
      if (k === 'darbuka' && [3, 4, 12, 14, 15].includes(step)) this._tom(t, step % 3 ? 420 : 300, 0.12 + I * 0.1);
    }
    if (I > 0.45 && step % 2 === 0) this._hat(t, step % 4 === 2 ? 0.07 : 0.035);
    if (I > 0.72 && step % 2 === 1) this._hat(t, 0.025);
    if (I > 0.52 && (step === 4 || step === 12)) this._snare(t, 0.16 + I * 0.08);
    // Arpeggio.
    if (I > 0.38) this._arp(step, chord, t, I);
    // Lead: a short motif answering itself every two bars.
    if (st.lead && I > 0.78) {
      const motif = [0, -1, 2, -1, 4, -1, 2, 1, 0, -1, -1, 4, 2, -1, 1, -1];
      const m = motif[(step + (this.bar % 2) * 3) % 16];
      if (m >= 0) this._lead(chord[m % 4] + 12, t, (60 / this.bpm) * 0.5, I);
    }
    // Riser into the next bar.
    if (this._riser > 0 && step === 0) {
      this._sweep(t, (60 / this.bpm) * 4);
      this._riser = 0;
    }
  }

  _env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  _pad(chord, t, dur, I) {
    const ctx = this.ctx;
    for (const n of chord.slice(0, 3)) {
      for (const det of [-6, 6]) {
        const o = ctx.createOscillator();
        o.type = this.style.pad;
        o.frequency.value = midi(n);
        o.detune.value = det;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.035 * (1 - I * 0.35), t + dur * 0.3);
        g.gain.setTargetAtTime(0.0001, t + dur * 0.85, dur * 0.12);
        o.connect(g).connect(this.duck);
        o.start(t);
        o.stop(t + dur * 1.25);
      }
    }
  }

  _bass(n, t, I) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = midi(n);
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = midi(n - 12);
    const g = ctx.createGain();
    this._env(g, t, 0.006, 0.09 + I * 0.05, 60 / this.bpm / 2.2);
    o.connect(g);
    sub.connect(g);
    g.connect(this.bassFilter);
    o.start(t);
    sub.start(t);
    o.stop(t + 0.6);
    sub.stop(t + 0.6);
  }

  _kick(t, I) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    this._env(g, t, 0.002, 0.5 + I * 0.25, 0.32);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.45);
    // Pump the pads.
    this.duck.gain.setValueAtTime(0.35, t);
    this.duck.gain.setTargetAtTime(1, t + 0.02, 0.09);
  }

  _noise(t, dur, type, freq, gain, q = 0.8) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this._env(g, t, 0.001, gain, dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, Math.random() * 3, dur + 0.05);
  }

  _hat(t, gain) {
    this._noise(t, 0.045, 'highpass', 7200, gain);
  }

  _snare(t, gain) {
    this._noise(t, 0.16, 'bandpass', 1900, gain, 0.7);
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(160, t + 0.08);
    const g = this.ctx.createGain();
    this._env(g, t, 0.001, gain * 0.6, 0.1);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.15);
  }

  _tom(t, freq, gain) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + 0.15);
    const g = this.ctx.createGain();
    this._env(g, t, 0.002, gain, 0.18);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + 0.25);
    this._noise(t, 0.03, 'bandpass', freq * 4, gain * 0.4, 2);
  }

  _arp(step, chord, t, I) {
    const st = this.style;
    const kind = st.arp;
    let n = null;
    const up = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3];
    const ud = [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3];
    if (kind === 'up') n = chord[up[step]] + 12;
    else if (kind === 'updown') n = step % 2 === 0 ? chord[ud[step]] + 12 : null;
    else if (kind === 'gated') n = chord[up[step] % 3] + 24 - (step % 4 === 3 ? 12 : 0);
    else if (kind === 'trill') n = step % 2 ? chord[0] + 13 : chord[0] + 12 + (step % 8 < 4 ? 0 : 1);
    else if (kind === 'marimba') n = [0, 3, 6, 9, 11, 14].includes(step) ? chord[step % 4] + 12 : null;
    else if (kind === 'bells') n = step % 4 === 0 ? chord[(step / 4) % 4] + 24 : null;
    if (n === null) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = st.arpWave;
    o.frequency.value = midi(n);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900 + I * 4000;
    const g = ctx.createGain();
    const bell = kind === 'bells' || kind === 'marimba';
    this._env(g, t, 0.003, (bell ? 0.07 : 0.035) * (0.6 + I * 0.4), bell ? 0.6 : 60 / this.bpm / 4.5);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    o.stop(t + (bell ? 0.7 : 0.25));
  }

  _lead(n, t, dur, I) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = midi(n);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vg = ctx.createGain();
    vg.gain.value = 6;
    vib.connect(vg).connect(o.detune);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 2200;
    const g = ctx.createGain();
    this._env(g, t, 0.01, 0.028 * I, dur);
    o.connect(f).connect(g).connect(this.out);
    o.start(t);
    vib.start(t);
    o.stop(t + dur + 0.1);
    vib.stop(t + dur + 0.1);
  }

  _sweep(t, dur) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.audio.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 3;
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(6000, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + dur * 0.95);
    g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f).connect(g).connect(this.out);
    s.start(t, 0, dur + 0.1);
  }
}
