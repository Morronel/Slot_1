// Canvas roulette wheel: a pre-rendered rotor that keeps turning, a ball that
// orbits the track, drops past the deflectors, rattles across the frets and
// settles in a pocket chosen in advance.
import { WHEEL, POCKETS, colorOf } from './rules.js';

const TAU = Math.PI * 2;
const STEP = TAU / POCKETS;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (x) => { const u = clamp(x, 0, 1); return u * u * (3 - 2 * u); };
const mod = (a, m) => ((a % m) + m) % m;
const IDLE = 0.22; // rad/s the rotor drifts when nobody is playing

// Radii as fractions of the wheel radius.
const RIM = 0.985, TRACK_OUT = 0.935, TRACK_IN = 0.79, BALL_TRACK = 0.865;
const NUM_OUT = 0.775, NUM_IN = 0.655, POCKET_IN = 0.53, BALL_POCKET = 0.592, CONE = 0.5, HUB = 0.19;
const BALL_R = 0.033;

const COLORS = {
  red: ['#ff3d6e', '#b5103f', '#6e0626'],
  black: ['#3a2c7a', '#1d1450', '#0c0830'],
  green: ['#3dffb0', '#0aa56b', '#04502f'],
};

export class Wheel {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.rotor = 0; // rotor angle, clockwise
    this.omega = IDLE;
    this.ball = { psi: WHEEL.indexOf(0) * STEP, r: BALL_POCKET, visible: true, speed: 0 };
    this.spinState = null;
    this.result = null; // { n, t0 }
    this.lastPocket = null;
    this.trail = [];
    this.onFret = null;
    this.onBounce = null;
    this.onSettle = null;
    this.onRoll = null;
    this.size = 0;
  }

  // px is the largest CSS size the wheel will ever be shown at.
  resize(px) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const S = Math.round(px * dpr);
    if (S === this.size) return;
    this.size = S;
    this.canvas.width = this.canvas.height = S;
    this.base = this.renderBase(S);
    this.rotorImg = this.renderRotor(S);
  }

  setRestingNumber(n) {
    this.ball.psi = WHEEL.indexOf(n) * STEP;
    this.ball.r = BALL_POCKET;
    this.ball.visible = true;
  }

  // ---------------------------------------------------------- pre-rendering

  renderBase(S) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const R = S / 2;
    g.translate(R, R);

    // Outer glow and gold rim.
    g.shadowColor = 'rgba(255, 77, 216, 0.55)';
    g.shadowBlur = R * 0.08;
    g.beginPath(); g.arc(0, 0, R * RIM, 0, TAU);
    const rim = g.createLinearGradient(-R, -R, R, R);
    rim.addColorStop(0, '#fff3b8'); rim.addColorStop(0.25, '#ffd84a'); rim.addColorStop(0.5, '#a8620a');
    rim.addColorStop(0.75, '#ffcf4a'); rim.addColorStop(1, '#7a3c00');
    g.fillStyle = rim; g.fill();
    g.shadowBlur = 0;

    // Bowl / ball track: dark glassy indigo, lit from the top-left.
    g.beginPath(); g.arc(0, 0, R * TRACK_OUT, 0, TAU);
    const bowl = g.createRadialGradient(-R * 0.25, -R * 0.3, R * 0.2, 0, 0, R * TRACK_OUT);
    bowl.addColorStop(0, '#3a1c82'); bowl.addColorStop(0.75, '#1a0848'); bowl.addColorStop(0.93, '#0d0330'); bowl.addColorStop(1, '#2b1166');
    g.fillStyle = bowl; g.fill();
    // The groove the ball runs in.
    g.lineWidth = R * 0.012;
    g.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    g.beginPath(); g.arc(0, 0, R * (BALL_TRACK + BALL_R + 0.01), 0, TAU); g.stroke();
    g.strokeStyle = 'rgba(0, 0, 0, 0.45)';
    g.beginPath(); g.arc(0, 0, R * (TRACK_IN + 0.005), 0, TAU); g.stroke();
    // Faint star-dust speckles on the bowl.
    for (let i = 0; i < 90; i++) {
      const a = rand(0, TAU), r = R * rand(TRACK_IN + 0.02, TRACK_OUT - 0.01);
      g.fillStyle = `rgba(${200 + rand(0, 55)}, ${180 + rand(0, 75)}, 255, ${rand(0.08, 0.35)})`;
      g.beginPath(); g.arc(Math.sin(a) * r, -Math.cos(a) * r, rand(0.4, 1.4) * (R / 300), 0, TAU); g.fill();
    }

    // Eight gold deflector diamonds, alternating upright and sideways.
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate(i * TAU / 8 + TAU / 16);
      g.translate(0, -R * (TRACK_IN + 0.045));
      if (i % 2) g.rotate(Math.PI / 2);
      const w = R * 0.025, h = R * 0.05;
      const d = g.createLinearGradient(-w, -h, w, h);
      d.addColorStop(0, '#fff6c8'); d.addColorStop(0.5, '#ffc93a'); d.addColorStop(1, '#8a4a00');
      g.fillStyle = d;
      g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = R * 0.02; g.shadowOffsetY = R * 0.008;
      g.beginPath(); g.moveTo(0, -h); g.lineTo(w, 0); g.lineTo(0, h); g.lineTo(-w, 0); g.closePath(); g.fill();
      g.restore();
    }
    return c;
  }

  renderRotor(S) {
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const R = S / 2;
    g.translate(R, R);

    // Thin gold lip around the rotor.
    g.beginPath(); g.arc(0, 0, R * (NUM_OUT + 0.012), 0, TAU);
    g.fillStyle = '#ffcf4a'; g.fill();

    for (let i = 0; i < POCKETS; i++) {
      const n = WHEEL[i];
      const [hi, mid, lo] = COLORS[colorOf(n)];
      const a0 = i * STEP - STEP / 2 - Math.PI / 2, a1 = a0 + STEP;
      // Number band.
      g.beginPath(); g.arc(0, 0, R * NUM_OUT, a0, a1); g.arc(0, 0, R * NUM_IN, a1, a0, true); g.closePath();
      const band = g.createRadialGradient(0, 0, R * NUM_IN, 0, 0, R * NUM_OUT);
      band.addColorStop(0, lo); band.addColorStop(0.55, mid); band.addColorStop(1, hi);
      g.fillStyle = band; g.fill();
      // Pocket (darker, deeper).
      g.beginPath(); g.arc(0, 0, R * NUM_IN, a0, a1); g.arc(0, 0, R * POCKET_IN, a1, a0, true); g.closePath();
      const pk = g.createRadialGradient(0, 0, R * POCKET_IN, 0, 0, R * NUM_IN);
      pk.addColorStop(0, lo); pk.addColorStop(0.5, '#08021c'); pk.addColorStop(1, lo);
      g.fillStyle = pk; g.fill();
      // Number, upright with its top facing out.
      g.save();
      g.rotate(i * STEP);
      g.fillStyle = '#fff';
      g.shadowColor = hi; g.shadowBlur = R * 0.02;
      g.font = `400 ${Math.round(R * 0.068)}px Bungee, "Arial Black", Impact, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(n), 0, -R * (NUM_IN + NUM_OUT) / 2);
      g.restore();
    }

    // Frets between pockets and the ring between numbers and pockets.
    g.lineCap = 'round';
    for (let i = 0; i < POCKETS; i++) {
      const a = i * STEP - STEP / 2;
      const s = Math.sin(a), co = -Math.cos(a);
      g.strokeStyle = '#ffe58a'; g.lineWidth = R * 0.008;
      g.beginPath(); g.moveTo(s * R * POCKET_IN, co * R * POCKET_IN); g.lineTo(s * R * NUM_OUT, co * R * NUM_OUT); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = R * 0.003;
      g.beginPath(); g.moveTo(s * R * POCKET_IN, co * R * POCKET_IN); g.lineTo(s * R * NUM_IN, co * R * NUM_IN); g.stroke();
    }
    g.strokeStyle = '#ffd84a'; g.lineWidth = R * 0.01;
    g.beginPath(); g.arc(0, 0, R * NUM_IN, 0, TAU); g.stroke();

    // Cone: brushed violet metal with radial spokes.
    g.beginPath(); g.arc(0, 0, R * POCKET_IN, 0, TAU);
    const cone = g.createRadialGradient(-R * 0.12, -R * 0.15, R * 0.05, 0, 0, R * POCKET_IN);
    cone.addColorStop(0, '#b79cff'); cone.addColorStop(0.45, '#5b33c9'); cone.addColorStop(0.9, '#25106b'); cone.addColorStop(1, '#ffcf4a');
    g.fillStyle = cone; g.fill();
    for (let i = 0; i < 4; i++) {
      g.save(); g.rotate(i * TAU / 4 + TAU / 8);
      const sp = g.createLinearGradient(0, -R * HUB, 0, -R * CONE);
      sp.addColorStop(0, '#fff3b8'); sp.addColorStop(1, '#b06a00');
      g.fillStyle = sp;
      g.beginPath(); g.moveTo(-R * 0.03, -R * HUB * 0.9); g.lineTo(R * 0.03, -R * HUB * 0.9); g.lineTo(R * 0.008, -R * CONE); g.lineTo(-R * 0.008, -R * CONE); g.closePath(); g.fill();
      g.beginPath(); g.arc(0, -R * CONE * 0.97, R * 0.022, 0, TAU); g.fill();
      g.restore();
    }
    // Hub: a gold four-point star turret.
    g.beginPath(); g.arc(0, 0, R * HUB, 0, TAU);
    const hub = g.createRadialGradient(-R * 0.05, -R * 0.06, R * 0.01, 0, 0, R * HUB);
    hub.addColorStop(0, '#4b2aa8'); hub.addColorStop(1, '#170650');
    g.fillStyle = hub; g.fill();
    g.lineWidth = R * 0.012; g.strokeStyle = '#ffd84a'; g.stroke();
    g.save();
    g.shadowColor = '#ffd84a'; g.shadowBlur = R * 0.05;
    const st = g.createRadialGradient(0, 0, 0, 0, 0, R * HUB * 0.9);
    st.addColorStop(0, '#fffbe0'); st.addColorStop(0.5, '#ffd84a'); st.addColorStop(1, '#c27a00');
    g.fillStyle = st;
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = k * TAU / 8, r = R * HUB * (k % 2 ? 0.28 : 0.85);
      g.lineTo(Math.sin(a) * r, -Math.cos(a) * r);
    }
    g.closePath(); g.fill();
    g.restore();
    return c;
  }

  // ---------------------------------------------------------- spinning

  // Spin so the ball lands on n. Resolves when it has settled.
  spin(n, duration = 7) {
    const T = duration;
    const target = WHEEL.indexOf(n) * STEP;
    const psi0 = this.ball.psi;
    const revs = T > 5 ? 9 : 5;
    const D = revs * TAU + mod(psi0 - target, TAU);
    const uS = 0.84; // share of the time spent travelling before the rattle
    const main = uS * T;
    const m0 = -2.6 * D, m1 = -0.12 * D; // Hermite tangents: fast start, still sliding at the end
    const endVel = Math.abs(m1) / main; // rad/s relative to the rotor
    const w = Math.random() < 0.5 ? 2 * Math.PI : 3 * Math.PI;
    const rattleT = T - main;
    const A = (endVel * rattleT) / w;
    // A few deflector hits on the way down.
    const hits = [];
    let v = rand(0.6, 0.66);
    while (v < 0.93) { hits.push({ v, h: rand(0.025, 0.06), d: rand(0.03, 0.05), fired: false }); v += rand(0.07, 0.13); }
    this.result = null;
    this.trail = [];
    this.lastPocket = null;
    this.omega = 1.6;
    this.ball.visible = true;
    return new Promise((resolve) => {
      this.spinState = { t: 0, T, psi0, D, target, main, m0, m1, w, A, rattleT, hits, lift: this.ball.r, resolve, n, settled: false };
    });
  }

  ballAt(st) {
    const t = st.t;
    if (t < st.main) {
      const v = t / st.main;
      const v2 = v * v, v3 = v2 * v;
      const p1 = st.psi0 - st.D;
      const psi = (2 * v3 - 3 * v2 + 1) * st.psi0 + (v3 - 2 * v2 + v) * st.m0 + (-2 * v3 + 3 * v2) * p1 + (v3 - v2) * st.m1;
      // Radius: flick out to the track, orbit, spiral down with deflector hops.
      let r;
      if (v < 0.04) r = st.lift + (BALL_TRACK - st.lift) * smooth(v / 0.04);
      else if (v < 0.6) r = BALL_TRACK + Math.sin(v * 40) * 0.002;
      else r = BALL_TRACK + (BALL_POCKET + 0.025 - BALL_TRACK) * smooth((v - 0.6) / 0.36);
      for (const h of st.hits) {
        if (v >= h.v && v < h.v + h.d) r += h.h * Math.sin(Math.PI * (v - h.v) / h.d);
        if (v >= h.v && !h.fired) { h.fired = true; this.onBounce?.(1 - (h.v - 0.6) * 1.8); }
      }
      if (v > 0.96) r = BALL_POCKET + 0.025 * (1 - smooth((v - 0.96) / 0.04));
      return { psi, r, phase: v < 0.6 ? 'track' : 'drop' };
    }
    const s = (t - st.main) / st.rattleT;
    const decay = Math.exp(-4 * s);
    const psi = st.target - st.A * decay * Math.sin(st.w * s);
    const r = BALL_POCKET + 0.02 * decay * Math.abs(Math.sin(st.w * s * 1.5));
    return { psi, r, phase: 'rattle' };
  }

  update(dt, t) {
    // Rotor eases back toward its idle drift.
    this.omega += (IDLE - this.omega) * Math.min(1, dt * 0.18);
    this.rotor = mod(this.rotor + this.omega * dt, TAU);

    const st = this.spinState;
    if (st) {
      const prevPsi = this.ball.psi;
      st.t = Math.min(st.t + dt, st.T);
      const b = this.ballAt(st);
      this.ball.psi = b.psi;
      this.ball.r = b.r;
      const rel = Math.abs(b.psi - prevPsi) / Math.max(dt, 1e-3);
      this.ball.speed = rel;
      this.onRoll?.(clamp(rel / 30, 0, 1), b.phase === 'track');
      // Fret clicks once the ball is down among the pockets.
      if (b.r < NUM_IN + 0.02) {
        const pocket = Math.round(b.psi / STEP);
        if (this.lastPocket !== null && pocket !== this.lastPocket) this.onFret?.(clamp(rel / 8, 0.15, 1));
        this.lastPocket = pocket;
      }
      if (st.t >= st.T && !st.settled) {
        st.settled = true;
        this.ball.psi = st.target;
        this.ball.r = BALL_POCKET;
        this.ball.speed = 0;
        this.spinState = null;
        this.result = { n: st.n, t0: t };
        this.onRoll?.(0, false);
        this.onSettle?.(st.n);
        st.resolve(st.n);
      }
    }
    this.draw(t);
  }

  ballXY(psi = this.ball.psi, r = this.ball.r) {
    const a = this.rotor + psi;
    return { x: Math.sin(a) * r, y: -Math.cos(a) * r, a };
  }

  // Ball position in CSS pixels relative to the canvas's top-left corner.
  ballClientPos() {
    const rect = this.canvas.getBoundingClientRect();
    const { x, y } = this.ballXY();
    return { x: rect.left + rect.width / 2 + x * rect.width / 2, y: rect.top + rect.height / 2 + y * rect.height / 2 };
  }

  draw(t) {
    const g = this.ctx, S = this.size, R = S / 2;
    if (!S) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.drawImage(this.base, 0, 0);
    g.save();
    g.translate(R, R);
    g.rotate(this.rotor);
    g.drawImage(this.rotorImg, -R, -R);
    g.restore();
    g.save();
    g.translate(R, R);

    // Winning pocket glows and pulses.
    if (this.result) {
      const age = t - this.result.t0;
      const i = WHEEL.indexOf(this.result.n);
      const a0 = this.rotor + i * STEP - STEP / 2 - Math.PI / 2;
      const pulse = 0.55 + 0.45 * Math.sin(age * 6);
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.beginPath(); g.arc(0, 0, R * NUM_OUT, a0, a0 + STEP); g.arc(0, 0, R * POCKET_IN, a0 + STEP, a0, true); g.closePath();
      g.fillStyle = `rgba(255, 230, 140, ${0.25 + 0.3 * pulse})`;
      g.shadowColor = '#ffd84a'; g.shadowBlur = R * 0.08;
      g.fill();
      g.restore();
    }

    // Ball trail when moving fast, then the ball itself.
    if (this.ball.visible) {
      const p = this.ballXY();
      const fast = clamp(this.ball.speed / 25, 0, 1);
      this.trail.unshift({ x: p.x, y: p.y });
      if (this.trail.length > 10) this.trail.length = 10;
      if (fast > 0.05) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        for (let k = 1; k < this.trail.length; k++) {
          const q = this.trail[k];
          g.globalAlpha = fast * 0.35 * (1 - k / this.trail.length);
          g.fillStyle = '#bff8ff';
          g.beginPath(); g.arc(q.x * R, q.y * R, R * BALL_R * (1 - k * 0.05), 0, TAU); g.fill();
        }
        g.restore();
      }
      const bx = p.x * R, by = p.y * R, br = R * BALL_R;
      g.fillStyle = 'rgba(0, 0, 0, 0.45)';
      g.beginPath(); g.ellipse(bx + br * 0.35, by + br * 0.5, br * 1.05, br * 0.9, 0, 0, TAU); g.fill();
      const ball = g.createRadialGradient(bx - br * 0.35, by - br * 0.4, br * 0.1, bx, by, br);
      ball.addColorStop(0, '#ffffff'); ball.addColorStop(0.5, '#e8ecff'); ball.addColorStop(1, '#8c92b8');
      g.fillStyle = ball;
      g.shadowColor = 'rgba(190, 240, 255, 0.9)'; g.shadowBlur = br * (this.result ? 1.6 : 0.8);
      g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
      g.shadowBlur = 0;
    }

    // Marquee bulbs around the rim: slow chase idle, fast while spinning, flashing on a result.
    const bulbs = 36;
    const spinning = !!this.spinState;
    for (let k = 0; k < bulbs; k++) {
      const a = k * TAU / bulbs;
      let on;
      if (spinning) on = (k + Math.floor(t * 18)) % 4 === 0;
      else if (this.result && t - this.result.t0 < 2.5) on = Math.floor(t * 8) % 2 === k % 2;
      else on = (k + Math.floor(t * 4)) % 6 < 2;
      const x = Math.sin(a) * R * (RIM - 0.024), y = -Math.cos(a) * R * (RIM - 0.024);
      g.fillStyle = on ? '#fff6c8' : '#6b4a10';
      if (on) { g.shadowColor = '#ffb030'; g.shadowBlur = R * 0.03; }
      g.beginPath(); g.arc(x, y, R * 0.011, 0, TAU); g.fill();
      g.shadowBlur = 0;
    }

    // Result disc popping out of the hub.
    if (this.result) {
      const age = t - this.result.t0;
      const u = clamp(age / 0.45, 0, 1);
      const c1 = 2.4, c3 = c1 + 1;
      const pop = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
      const n = this.result.n;
      const [hi, mid, lo] = COLORS[colorOf(n)];
      const rr = R * 0.25 * pop;
      g.save();
      g.shadowColor = hi; g.shadowBlur = R * 0.12;
      const disc = g.createRadialGradient(-rr * 0.3, -rr * 0.35, rr * 0.1, 0, 0, rr);
      disc.addColorStop(0, hi); disc.addColorStop(0.6, mid); disc.addColorStop(1, lo);
      g.fillStyle = disc;
      g.beginPath(); g.arc(0, 0, rr, 0, TAU); g.fill();
      g.shadowBlur = 0;
      g.lineWidth = R * 0.014; g.strokeStyle = '#ffd84a'; g.stroke();
      g.fillStyle = '#fff';
      g.font = `400 ${Math.round(R * 0.2 * pop)}px Bungee, "Arial Black", Impact, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowOffsetY = R * 0.01;
      g.fillText(String(n), 0, R * 0.012);
      g.restore();
    }
    g.restore();
  }

  clearResult() { this.result = null; }
}
