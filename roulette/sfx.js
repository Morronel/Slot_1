// Roulette-specific sounds layered on the slot's Web Audio synth. No files.
import { Sound } from '../js/audio.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class RouletteSound extends Sound {
  // Clay chip landing on felt: two quick clacks and a tiny ring.
  chip(size = 0) {
    if (!this.ok) return;
    const p = 1 - Math.min(size, 8) * 0.03 + Math.random() * 0.06;
    this.noise({ dur: 0.035, type: 'bandpass', freq: 4200 * p, q: 3, gain: 0.5, attack: 0.001, send: 0.05 });
    this.noise({ dur: 0.03, type: 'bandpass', freq: 3000 * p, q: 4, gain: 0.32, attack: 0.001, when: 0.028, send: 0.05 });
    this.tone({ freq: 2350 * p, type: 'sine', dur: 0.07, gain: 0.07, send: 0.1 });
    this.tone({ freq: 260 * p, to: 140, type: 'sine', dur: 0.06, gain: 0.18, send: 0 });
  }

  // Chips swept off the table.
  sweep() {
    if (!this.ok) return;
    this.noise({ dur: 0.35, type: 'bandpass', freq: 5000, to: 1200, q: 1.4, gain: 0.18, attack: 0.04, send: 0.15 });
    for (let i = 0; i < 4; i++) this.noise({ dur: 0.025, type: 'bandpass', freq: 3600 - i * 300, q: 4, gain: 0.12, when: 0.05 + i * 0.045, send: 0 });
  }

  // Ball flicked onto the track.
  launch() {
    if (!this.ok) return;
    this.noise({ dur: 0.7, type: 'bandpass', freq: 500, to: 5000, q: 1, gain: 0.3, attack: 0.05, send: 0.3 });
    this.tone({ freq: 1500, to: 600, type: 'triangle', dur: 0.08, gain: 0.12, send: 0.1 });
  }

  // Continuous rolling rumble. Call setRoll(speed 0..1, onTrack) every frame.
  startRoll() {
    if (!this.ok || this.roll) return;
    const ctx = this.ctx, t = this.now;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 0.9; bp.frequency.value = 1800;
    const hum = ctx.createOscillator(); hum.type = 'triangle'; hum.frequency.value = 70;
    const humG = ctx.createGain(); humG.gain.value = 0.0001;
    const am = ctx.createGain(); am.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 9;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.35;
    lfo.connect(lfoG).connect(am.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    src.connect(bp).connect(am).connect(g);
    hum.connect(humG).connect(g);
    this.out(g, 0.12);
    src.start(); lfo.start(); hum.start();
    this.roll = { src, bp, lfo, g, hum, humG };
  }

  setRoll(speed, onTrack) {
    const r = this.roll;
    if (!r) return;
    const t = this.now, s = Math.max(0, Math.min(1, speed));
    r.g.gain.setTargetAtTime(Math.max(0.0001, (onTrack ? 0.16 : 0.07) * Math.sqrt(s)), t, 0.06);
    r.bp.frequency.setTargetAtTime(500 + s * 2600, t, 0.08);
    r.lfo.frequency.setTargetAtTime(3 + s * 22, t, 0.08);
    r.hum.frequency.setTargetAtTime(50 + s * 60, t, 0.08);
    r.humG.gain.setTargetAtTime(onTrack ? 0.25 * s : 0.0001, t, 0.08);
  }

  stopRoll() {
    const r = this.roll;
    if (!r) return;
    r.g.gain.setTargetAtTime(0.0001, this.now, 0.05);
    [r.src, r.lfo, r.hum].forEach((x) => x.stop(this.now + 0.4));
    this.roll = null;
  }

  // Ball clipping a pocket divider.
  fret(intensity = 1) {
    if (!this.ok) return;
    const k = Math.max(0.15, Math.min(1, intensity));
    const f = 2600 + Math.random() * 900;
    this.tone({ freq: f, to: f * 0.7, type: 'square', dur: 0.022, gain: 0.05 * k, send: 0.08 });
    this.noise({ dur: 0.02, type: 'highpass', freq: 5000, gain: 0.16 * k, attack: 0.001, send: 0.05 });
  }

  // Ball hitting a deflector diamond.
  bounce(strength = 1) {
    if (!this.ok) return;
    const k = Math.max(0.3, Math.min(1, strength));
    this.tone({ freq: 1250, to: 520, type: 'sine', dur: 0.09, gain: 0.3 * k, send: 0.2 });
    this.noise({ dur: 0.04, type: 'bandpass', freq: 3200, q: 2, gain: 0.3 * k, attack: 0.001, send: 0.1 });
  }

  // The ball drops in for good.
  settle() {
    if (!this.ok) return;
    this.tone({ freq: 180, to: 70, type: 'sine', dur: 0.25, gain: 0.5, send: 0 });
    this.noise({ dur: 0.06, type: 'bandpass', freq: 2400, q: 2, gain: 0.35, attack: 0.001, send: 0.15 });
    this.tone({ freq: 1900, type: 'triangle', dur: 0.12, gain: 0.08, when: 0.03, send: 0.2 });
  }

  // Bell-like reveal; pitch follows the colour so it becomes familiar.
  reveal(color) {
    if (!this.ok) return;
    const root = color === 'red' ? 76 : color === 'black' ? 71 : 79;
    [0, 7, 12].forEach((n, i) => {
      const f = midi(root + n);
      [1, 2.76, 5.4].forEach((m, k) => this.tone({ freq: f * m, type: 'sine', dur: 1.1 / (k + 1), gain: 0.14 / (k + 1), when: i * 0.07, send: 0.55 }));
    });
  }

  // Gentle "no luck" so losing never feels punishing.
  miss() {
    if (!this.ok) return;
    this.tone({ freq: midi(64), to: midi(60), type: 'triangle', dur: 0.35, gain: 0.12, send: 0.3 });
    this.tone({ freq: midi(57), type: 'sine', dur: 0.5, gain: 0.08, when: 0.12, send: 0.4 });
  }

  chipSelect(i) {
    if (!this.ok) return;
    this.tone({ freq: midi(72 + [0, 2, 4, 7, 9, 12][i % 6]), type: 'triangle', dur: 0.1, gain: 0.18, send: 0.2 });
    this.noise({ dur: 0.02, type: 'bandpass', freq: 4000, q: 3, gain: 0.15, attack: 0.001, send: 0 });
  }
}
