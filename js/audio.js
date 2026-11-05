// Every sound is synthesized live with the Web Audio API. No audio files.

const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Sound {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.loop = null;
  }

  // Must be called from a user gesture (browsers block audio until then).
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      this.master = ctx.createGain();
      this.master.gain.value = this.enabled ? 0.8 : 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4;
      comp.attack.value = 0.003; comp.release.value = 0.2;
      this.master.connect(comp).connect(ctx.destination);
      this.dry = ctx.createGain();
      this.dry.connect(this.master);
      // Cheap generated-impulse reverb for space and sparkle.
      this.verb = ctx.createConvolver();
      this.verb.buffer = this.impulse(2.2, 2.8);
      this.wet = ctx.createGain();
      this.wet.gain.value = 0.32;
      this.verb.connect(this.wet).connect(this.master);
      this.noiseBuf = this.makeNoise();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.8 : 0, this.ctx.currentTime, 0.02);
  }

  get ok() { return this.ctx && this.enabled; }
  get now() { return this.ctx.currentTime; }

  impulse(seconds, decay) {
    const rate = this.ctx.sampleRate, len = rate * seconds;
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Route a node to dry output plus an optional reverb send.
  out(node, send = 0.2) {
    node.connect(this.dry);
    if (send > 0) {
      const g = this.ctx.createGain();
      g.gain.value = send;
      node.connect(g).connect(this.verb);
    }
  }

  tone({ freq, to, type = 'sine', dur = 0.2, gain = 0.3, attack = 0.005, when = 0, send = 0.2, detune = 0, curve = 'exp' }) {
    const t = this.now + when;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (to) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(to, t + dur);
      else o.frequency.linearRampToValueAtTime(to, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    this.out(g, send);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noise({ dur = 0.2, type = 'bandpass', freq = 1000, to, q = 1, gain = 0.3, attack = 0.005, when = 0, send = 0.1 }) {
    const t = this.now + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g);
    this.out(g, send);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  // ---------- game sounds ----------

  click() {
    if (!this.ok) return;
    this.tone({ freq: 1800, to: 900, type: 'square', dur: 0.04, gain: 0.08, send: 0 });
  }

  bet(level, up) {
    if (!this.ok) return;
    const n = 64 + level * 2;
    this.tone({ freq: midi(n), type: 'triangle', dur: 0.12, gain: 0.25, send: 0.15 });
    this.tone({ freq: midi(n + (up ? 7 : -5)), type: 'triangle', dur: 0.14, gain: 0.18, when: 0.05, send: 0.15 });
  }

  spinStart() {
    if (!this.ok) return;
    this.tone({ freq: 2200, to: 700, type: 'square', dur: 0.05, gain: 0.08, send: 0 });
    this.noise({ dur: 0.45, type: 'bandpass', freq: 300, to: 3200, q: 1.2, gain: 0.35, attack: 0.08, send: 0.2 });
    this.tone({ freq: 90, to: 220, type: 'sawtooth', dur: 0.35, gain: 0.08, attack: 0.05, send: 0 });
  }

  // A mechanical "whirr" while reels spin. intensity 0..1 follows reels still moving.
  startLoop() {
    if (!this.ok || this.loop) return;
    const ctx = this.ctx, t = this.now;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 1.5;
    const am = ctx.createGain(); am.gain.value = 0.5;
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 22;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 0.5;
    lfo.connect(lfoGain).connect(am.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.15);
    src.connect(bp).connect(am).connect(g);
    this.out(g, 0);
    src.start(); lfo.start();
    this.loop = { src, lfo, g };
  }

  setLoopIntensity(x) {
    if (!this.loop) return;
    this.loop.g.gain.setTargetAtTime(Math.max(0.0001, 0.09 * x), this.now, 0.05);
  }

  stopLoop() {
    if (!this.loop) return;
    const { src, lfo, g } = this.loop;
    g.gain.setTargetAtTime(0.0001, this.now, 0.04);
    src.stop(this.now + 0.3); lfo.stop(this.now + 0.3);
    this.loop = null;
  }

  reelStop(i) {
    if (!this.ok) return;
    this.tone({ freq: 190, to: 50, type: 'sine', dur: 0.18, gain: 0.55, send: 0 });
    this.noise({ dur: 0.05, type: 'highpass', freq: 2500, gain: 0.25, send: 0 });
    const n = 60 + PENTA[i * 2];
    this.tone({ freq: midi(n), type: 'triangle', dur: 0.12, gain: 0.22, send: 0.25 });
    this.tone({ freq: midi(n) * 2.7, type: 'sine', dur: 0.06, gain: 0.06, send: 0.25 });
  }

  scatterLand(n) {
    if (!this.ok) return;
    const f = midi(76 + PENTA[Math.min(n, 6) + 1] - 2);
    [1, 2.76, 5.4].forEach((m, k) =>
      this.tone({ freq: f * m, type: 'sine', dur: 1.4 / (k + 1), gain: 0.22 / (k + 1), send: 0.6 }));
    this.tone({ freq: f / 2, type: 'triangle', dur: 0.5, gain: 0.15, send: 0.4 });
  }

  // Rising tension tone for a reel that might complete a bonus.
  anticipation(seconds) {
    if (!this.ok) return;
    const ctx = this.ctx, t = this.now;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(440, t + seconds);
    const o2 = ctx.createOscillator(); o2.type = 'sawtooth'; o2.detune.value = 14;
    o2.frequency.setValueAtTime(110 * 1.5, t);
    o2.frequency.exponentialRampToValueAtTime(440 * 1.5, t + seconds);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 6;
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(3200, t + seconds);
    const trem = ctx.createGain(); trem.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.setValueAtTime(6, t); lfo.frequency.linearRampToValueAtTime(18, t + seconds);
    const lg = ctx.createGain(); lg.gain.value = 0.4;
    lfo.connect(lg).connect(trem.gain);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.2);
    g.gain.setValueAtTime(0.09, t + seconds - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds + 0.1);
    o.connect(lp); o2.connect(lp); lp.connect(trem).connect(g);
    this.out(g, 0.3);
    [o, o2, lfo].forEach((x) => { x.start(t); x.stop(t + seconds + 0.15); });
  }

  // Quick sparkling arpeggio; size 0..3 scales length.
  win(size = 0) {
    if (!this.ok) return;
    const base = 72;
    const notes = [0, 4, 7, 12, 16, 19, 24].slice(0, 3 + size * 2);
    notes.forEach((n, i) => {
      this.tone({ freq: midi(base + n), type: 'triangle', dur: 0.35, gain: 0.2, when: i * 0.06, send: 0.4 });
      this.tone({ freq: midi(base + n + 12), type: 'sine', dur: 0.25, gain: 0.07, when: i * 0.06 + 0.01, send: 0.5 });
    });
  }

  tick(progress) {
    if (!this.ok) return;
    const f = 700 + progress * 1400;
    this.tone({ freq: f, type: 'square', dur: 0.035, gain: 0.05, send: 0.05 });
    this.tone({ freq: f * 1.5, type: 'sine', dur: 0.05, gain: 0.05, send: 0.1 });
  }

  coin() {
    if (!this.ok) return;
    const f = 2400 + Math.random() * 900;
    this.tone({ freq: f, type: 'sine', dur: 0.25, gain: 0.08, send: 0.3 });
    this.tone({ freq: f * 1.34, type: 'square', dur: 0.08, gain: 0.025, send: 0.3, when: 0.035 });
  }

  // Brassy chord stabs for big wins. tier 1..3.
  fanfare(tier = 1) {
    if (!this.ok) return;
    const roots = [60, 65, 67, 72];
    const chords = tier >= 3 ? [[0, 4, 7], [5, 9, 12], [7, 11, 14], [12, 16, 19]] : tier === 2 ? [[0, 4, 7], [7, 11, 14], [12, 16, 19]] : [[0, 4, 7], [12, 16, 19]];
    chords.forEach((c, i) => {
      const when = i * 0.18;
      const last = i === chords.length - 1;
      c.forEach((n) => {
        const f = midi(roots[0] + n);
        [-8, 8].forEach((det) => this.brass(f, last ? 1.1 : 0.22, when, det));
      });
    });
    this.noise({ dur: 1.2, type: 'lowpass', freq: 180, gain: 0.5, attack: 0.3, send: 0.2 });
    this.tone({ freq: 55, to: 40, type: 'sine', dur: 0.8, gain: 0.5, when: (chords.length - 1) * 0.18, send: 0 });
    for (let i = 0; i < 10; i++) this.tone({ freq: midi(96 + PENTA[i % 8]), type: 'sine', dur: 0.2, gain: 0.04, when: 0.3 + i * 0.05, send: 0.6 });
  }

  brass(f, dur, when, detune) {
    const t = this.now + when;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = detune;
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(400, t);
    lp.frequency.exponentialRampToValueAtTime(3500, t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.02);
    g.gain.setValueAtTime(0.05, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp).connect(g);
    this.out(g, 0.35);
    o.start(t); o.stop(t + dur + 0.05);
  }

  tierUp(tier) {
    if (!this.ok) return;
    this.noise({ dur: 0.6, type: 'highpass', freq: 800, to: 8000, gain: 0.25, attack: 0.01, send: 0.4 });
    this.tone({ freq: 80, to: 30, type: 'sine', dur: 0.6, gain: 0.7, send: 0 });
    this.fanfare(tier);
  }

  bonusTrigger() {
    if (!this.ok) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31];
    scale.forEach((n, i) => {
      this.tone({ freq: midi(67 + n), type: 'triangle', dur: 0.4, gain: 0.16, when: i * 0.045, send: 0.6 });
    });
    this.noise({ dur: 1.4, type: 'bandpass', freq: 2000, to: 9000, q: 3, gain: 0.15, attack: 0.3, send: 0.6 });
    this.fanfare(2);
  }

  whoosh() {
    if (!this.ok) return;
    this.noise({ dur: 0.5, type: 'bandpass', freq: 400, to: 4000, q: 0.8, gain: 0.3, attack: 0.15, send: 0.3 });
  }

  denied() {
    if (!this.ok) return;
    this.tone({ freq: 180, to: 120, type: 'square', dur: 0.2, gain: 0.1, send: 0 });
  }
}
