// Background starfield (with warp during spins) and a particle layer for
// coins, sparks and confetti.

const rand = (a, b) => a + Math.random() * (b - a);

function fitCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

export class Starfield {
  constructor(canvas) {
    this.canvas = canvas;
    this.warp = 0; // 0 idle, 1 full warp
    this.warpTarget = 0;
    this.hue = 0; // shifts during free spins
    this.hueTarget = 0;
    this.shooting = [];
    this.resize();
  }

  resize() {
    Object.assign(this, fitCanvas(this.canvas));
    const count = Math.round((this.w * this.h) / 3500);
    this.stars = Array.from({ length: Math.min(count, 600) }, () => this.makeStar());
  }

  makeStar() {
    return { x: rand(0, this.w), y: rand(0, this.h), z: rand(0.15, 1), tw: rand(0, Math.PI * 2), hue: rand(190, 320) };
  }

  update(dt, t) {
    const { ctx, w, h } = this;
    this.warp += (this.warpTarget - this.warp) * Math.min(1, dt * 4);
    this.hue += (this.hueTarget - this.hue) * Math.min(1, dt * 1.5);
    ctx.clearRect(0, 0, w, h);
    const speed = 8 + this.warp * 900;
    ctx.lineCap = 'round';
    for (const s of this.stars) {
      s.y += speed * s.z * dt;
      if (s.y > h + 20) { s.y = -20; s.x = rand(0, w); }
      const tw = 0.55 + 0.45 * Math.sin(t * 2 + s.tw);
      const a = (0.35 + 0.65 * s.z) * tw;
      const len = this.warp * 40 * s.z;
      ctx.strokeStyle = `hsla(${s.hue + this.hue},90%,85%,${a})`;
      ctx.lineWidth = s.z * 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x, s.y - len - 0.01);
      ctx.stroke();
    }
    // The occasional shooting star.
    if (Math.random() < dt * 0.25) {
      this.shooting.push({ x: rand(w * 0.2, w), y: rand(-20, h * 0.4), vx: rand(-900, -500), vy: rand(250, 450), life: 1 });
    }
    this.shooting = this.shooting.filter((s) => {
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt * 1.2;
      if (s.life <= 0) return false;
      const g = ctx.createLinearGradient(s.x, s.y, s.x - s.vx * 0.15, s.y - s.vy * 0.15);
      g.addColorStop(0, `rgba(255,255,255,${s.life})`);
      g.addColorStop(1, 'rgba(160,200,255,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - s.vx * 0.15, s.y - s.vy * 0.15); ctx.stroke();
      return true;
    });
  }
}

export class Particles {
  constructor(canvas) {
    this.canvas = canvas;
    this.list = [];
    this.onCoinBounce = null;
    this.resize();
  }

  resize() { Object.assign(this, fitCanvas(this.canvas)); }

  coins(x, y, n, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = rand(-Math.PI * 0.85, -Math.PI * 0.15);
      const v = rand(350, 800) * power;
      this.list.push({
        kind: 'coin', x: x + rand(-20, 20), y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: rand(9, 15), spin: rand(6, 14), phase: rand(0, 6), life: rand(1.6, 2.6), bounced: false,
      });
    }
  }

  // Coins raining from the top for big wins.
  coinRain(n) {
    for (let i = 0; i < n; i++) {
      this.list.push({
        kind: 'coin', x: rand(0, this.w), y: rand(-200, -20), vx: rand(-60, 60), vy: rand(100, 400),
        r: rand(10, 18), spin: rand(6, 14), phase: rand(0, 6), life: rand(2.5, 3.5), bounced: true,
      });
    }
  }

  sparks(x, y, n, color = '#fff', speed = 300) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), v = rand(speed * 0.3, speed);
      this.list.push({ kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(1.5, 3.5), color, life: rand(0.4, 0.9), max: 0.9 });
    }
  }

  confetti(n) {
    const colors = ['#ff4dd8', '#ffd84a', '#5ff6ff', '#2bff9a', '#ff7a3d', '#a98bff'];
    for (let i = 0; i < n; i++) {
      this.list.push({
        kind: 'confetti', x: rand(0, this.w), y: rand(-this.h * 0.3, -10), vx: rand(-80, 80), vy: rand(80, 260),
        w: rand(6, 12), h: rand(3, 6), rot: rand(0, 6), vr: rand(-8, 8), wob: rand(0, 6), color: colors[i % colors.length], life: rand(3, 5),
      });
    }
  }

  get active() { return this.list.length > 0; }

  update(dt) {
    const { ctx, w, h } = this;
    ctx.clearRect(0, 0, w, h);
    const g = 1400;
    this.list = this.list.filter((p) => {
      p.life -= dt;
      if (p.life <= 0) return false;
      if (p.kind === 'coin') {
        p.vy += g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.y > h - p.r && p.vy > 0) {
          p.y = h - p.r; p.vy *= -0.45; p.vx *= 0.7;
          if (!p.bounced && this.onCoinBounce) this.onCoinBounce();
          p.bounced = true;
        }
        const sx = Math.cos(p.phase + p.life * p.spin);
        const alpha = Math.min(1, p.life * 2);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.scale(Math.max(0.12, Math.abs(sx)), 1);
        const grad = ctx.createRadialGradient(-p.r * 0.3, -p.r * 0.3, 1, 0, 0, p.r);
        const face = sx > 0;
        grad.addColorStop(0, '#fff8d0');
        grad.addColorStop(0.45, face ? '#ffd23f' : '#f0b020');
        grad.addColorStop(1, '#b86e00');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#fff1a8'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0, 0, p.r * 0.68, 0, Math.PI * 2); ctx.stroke();
        if (face) {
          ctx.fillStyle = '#a35c00';
          ctx.font = `900 ${p.r}px Arial Black, Arial, sans-serif`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText('★', 0, 1);
        }
        ctx.restore();
      } else if (p.kind === 'spark') {
        p.vx *= 1 - dt * 2; p.vy *= 1 - dt * 2; p.vy += 200 * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      } else {
        p.vy = Math.min(p.vy + 200 * dt, 280);
        p.wob += dt * 5;
        p.x += (p.vx + Math.sin(p.wob) * 60) * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life);
        ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.wob));
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      return p.y < h + 60;
    });
  }
}
