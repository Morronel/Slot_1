import {
  REELS, ROWS, SYMBOLS, PAYLINES, SCATTER_PAYS, SCATTER_SPINS, FREE_SPIN_MULT,
  spinGrid, evaluate, randomSymbol,
} from './engine.js';
import { SYMBOL_URL, SYMBOL_COLOR } from './symbols.js';
import { Sound } from './audio.js';
import { Starfield, Particles } from './fx.js';

const BETS = [20, 40, 100, 200, 400, 1000, 2000];
const START_BALANCE = 10000;
const STORE_KEY = 'starfall-spins.v1';
const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const now = () => performance.now() / 1000;
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const easeOutBack = (u) => { const c1 = 2.2, c3 = c1 + 1; return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2); };
const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);
const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };

// ---------------------------------------------------------------- state

const saved = (() => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch { return {}; } })();
const state = {
  balance: Number.isFinite(saved.balance) ? saved.balance : START_BALANCE,
  betIndex: clamp(saved.betIndex ?? 1, 0, BETS.length - 1),
  sound: saved.sound ?? true,
  turbo: saved.turbo ?? false,
  auto: false,
  phase: 'idle', // idle | spinning | presenting | overlay
  freeSpins: 0,
  fsTotal: 0,
  fsWin: 0,
  skip: false,
  queuedSpin: false,
};
const save = () => {
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ balance: state.balance, betIndex: state.betIndex, sound: state.sound, turbo: state.turbo })); } catch { /* private mode */ }
};
const bet = () => BETS[state.betIndex];
const timing = () => state.turbo
  ? { speed: 40, base: 0.3, gap: 0.09, wind: 0.07, acc: 0.12, present: 0.5 }
  : { speed: 27, base: 0.75, gap: 0.2, wind: 0.13, acc: 0.2, present: 1 };

const sound = new Sound();
sound.enabled = state.sound;

// Preload symbol images so the first spin never flashes empty cells.
for (const url of Object.values(SYMBOL_URL)) { const i = new Image(); i.src = url; }

// ---------------------------------------------------------------- layout

let CELL = 120;
function layout() {
  const narrow = innerWidth <= 520;
  const sideways = innerHeight <= 540 && innerWidth > innerHeight;
  const overhead = narrow ? 64 : 92;
  const byWidth = sideways
    ? (innerWidth - 24 - 270 - 76) / 5
    : (Math.min(innerWidth - 24, 780) - overhead) / 5;
  const byHeight = sideways
    ? (innerHeight - 112) / 3
    : (innerHeight - (narrow ? 360 : 340)) / 3;
  CELL = Math.floor(clamp(Math.min(byWidth, byHeight), 50, 140));
  document.documentElement.style.setProperty('--cell', CELL + 'px');
  reels.forEach((r) => r.render());
  sizeLines();
  placeBulbs();
  stars.resize();
  particles.resize();
}

// ---------------------------------------------------------------- reels

class Reel {
  constructor(index, parent) {
    this.index = index;
    this.el = document.createElement('div');
    this.el.className = 'reel';
    this.strip = document.createElement('div');
    this.strip.className = 'strip';
    this.el.appendChild(this.strip);
    parent.appendChild(this.el);
    // 5 cells: one hidden above, three visible, one hidden below.
    this.cells = [];
    this.symbols = [];
    for (let k = 0; k < ROWS + 2; k++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      const img = document.createElement('img');
      img.alt = '';
      img.draggable = false;
      cell.appendChild(img);
      this.strip.appendChild(cell);
      this.cells.push(cell);
      this.symbols.push(null);
      this.setCell(k, randomSymbol(index));
    }
    this.offset = 0;
    this.mode = 'idle';
  }

  setCell(k, sym) {
    this.symbols[k] = sym;
    const cell = this.cells[k];
    const img = cell.firstChild;
    img.src = SYMBOL_URL[sym];
    img.alt = SYMBOLS[sym].name;
    cell.style.setProperty('--glow', SYMBOL_COLOR[sym]);
  }

  visible() { return this.symbols.slice(1, 1 + ROWS); }
  cellAt(row) { return this.cells[row + 1]; }

  render() {
    for (let k = 0; k < this.cells.length; k++) {
      this.cells[k].style.transform = `translateY(${((k - 1 + this.offset) * CELL).toFixed(2)}px)`;
    }
  }

  // Scroll everything down one cell, recycling the bottom cell to the top.
  shift(sym) {
    const cell = this.cells.pop();
    this.cells.unshift(cell);
    this.symbols.pop();
    this.symbols.unshift(null);
    this.setCell(0, sym);
    cell.classList.remove('land', 'win', 'scatter-hit');
  }

  start(t, delay, finalSyms, stopAt) {
    const tm = timing();
    this.final = finalSyms;
    this.t0 = t + delay;
    this.stopAt = stopAt;
    this.travel = 0;
    this.mode = 'wait';
    this.speed = tm.speed;
    this.wind = tm.wind;
    this.acc = tm.acc;
    this.wantLand = false;
    this.cells.forEach((c) => c.classList.remove('land', 'win', 'scatter-hit'));
  }

  advance(delta) {
    this.offset += delta;
    while (this.offset >= 1) {
      this.offset -= 1;
      let sym;
      if (this.mode === 'land') sym = this.feed.shift() ?? randomSymbol(this.index);
      else if (this.wantLand) {
        sym = this.final[ROWS - 1];
        this.beginLanding();
      } else sym = randomSymbol(this.index);
      this.shift(sym);
    }
  }

  beginLanding() {
    this.mode = 'land';
    this.feed = [this.final[1], this.final[0], randomSymbol(this.index)];
    this.landStart = now();
    // Distance to perfect alignment after the shift that is happening right now.
    this.landFrom = this.offset;
    this.landDist = ROWS - this.offset;
    this.landDur = (4.4 * this.landDist) / this.speed;
    this.landP = 0;
    this.thudded = false;
    this.el.classList.remove('blur');
  }

  update(t) {
    switch (this.mode) {
      case 'wait':
        if (t >= this.t0) this.mode = 'wind';
        break;
      case 'wind': {
        const u = clamp((t - this.t0) / this.wind, 0, 1);
        const target = -0.3 * easeOutCubic(u);
        this.advance(target - this.travel);
        this.travel = target;
        if (u >= 1) { this.mode = 'accel'; this.tA = t; }
        break;
      }
      case 'accel': {
        const dt = clamp(t - this.tA, 0, this.acc);
        const target = -0.3 + 0.5 * (this.speed / this.acc) * dt * dt;
        this.advance(target - this.travel);
        this.travel = target;
        if (dt > this.acc * 0.4) this.el.classList.add('blur');
        if (dt >= this.acc) { this.mode = 'spin'; this.last = t; }
        break;
      }
      case 'spin': {
        const dt = Math.min(t - this.last, 0.05);
        this.last = t;
        if (t >= this.stopAt) this.wantLand = true;
        this.advance(this.speed * dt);
        break;
      }
      case 'land': {
        const u = clamp((t - this.landStart) / this.landDur, 0, 1);
        const p = this.landDist * easeOutBack(u);
        this.advance(p - this.landP);
        this.landP = p;
        if (!this.thudded && p >= this.landDist) {
          this.thudded = true;
          this.onThud?.(this);
        }
        if (u >= 1) {
          this.offset = 0;
          this.mode = 'idle';
          this.onStop?.(this);
        }
        break;
      }
    }
    this.render();
  }

  get moving() { return this.mode !== 'idle'; }
}

const reelsEl = $('reels');
const reels = Array.from({ length: REELS }, (_, i) => new Reel(i, reelsEl));

// ---------------------------------------------------------------- paylines canvas

const linesCanvas = $('lines');
const lctx = linesCanvas.getContext('2d');
let lineShow = null; // { lines: [...], start, single }

function sizeLines() {
  const frame = linesCanvas.parentElement;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = frame.clientWidth, h = frame.clientHeight;
  linesCanvas.width = w * dpr; linesCanvas.height = h * dpr;
  linesCanvas.style.width = w + 'px'; linesCanvas.style.height = h + 'px';
  lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function cellCenter(reel, row) {
  const frame = linesCanvas.getBoundingClientRect();
  const r = reels[reel].el.getBoundingClientRect();
  return [r.left - frame.left + r.width / 2, r.top - frame.top + CELL * (row + 0.5)];
}

const LINE_COLORS = ['#ffd84a', '#5ff6ff', '#ff4dd8', '#2bff9a', '#ff9a2e', '#a98bff', '#ff6b6b', '#7dffea', '#ffe27a', '#ff8af0'];

function drawLines(t) {
  const w = linesCanvas.clientWidth, h = linesCanvas.clientHeight;
  lctx.clearRect(0, 0, w, h);
  if (!lineShow) return;
  const prog = clamp((t - lineShow.start) / 0.35, 0, 1);
  const pulse = 0.75 + 0.25 * Math.sin(t * 8);
  lctx.lineCap = 'round'; lctx.lineJoin = 'round';
  for (const line of lineShow.lines) {
    const rows = PAYLINES[line.lineIndex];
    const pts = rows.map((r, reel) => cellCenter(reel, r));
    const [x0] = pts[0];
    // extend a bit past both edges
    pts.unshift([x0 - CELL * 0.55, pts[0][1]]);
    pts.push([pts[pts.length - 1][0] + CELL * 0.55, pts[pts.length - 1][1]]);
    const color = LINE_COLORS[line.lineIndex % LINE_COLORS.length];
    const limitX = pts[0][0] + (pts[pts.length - 1][0] - pts[0][0]) * easeOutCubic(prog);
    const pass = (width, style, blur) => {
      lctx.strokeStyle = style; lctx.lineWidth = width; lctx.shadowColor = color; lctx.shadowBlur = blur;
      lctx.beginPath();
      lctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
        if (bx <= limitX) lctx.lineTo(bx, by);
        else { const k = (limitX - ax) / (bx - ax); lctx.lineTo(ax + (bx - ax) * k, ay + (by - ay) * k); break; }
      }
      lctx.stroke();
    };
    lctx.globalAlpha = pulse;
    pass(lineShow.single ? 9 : 6, color, 18);
    lctx.globalAlpha = 1;
    pass(2, 'rgba(255,255,255,0.9)', 0);
  }
  lctx.shadowBlur = 0;
}

// ---------------------------------------------------------------- bulbs

const machine = $('machine');
const bulbsEl = $('bulbs');
let bulbs = [];
function placeBulbs() {
  bulbsEl.innerHTML = '';
  const w = machine.offsetWidth, h = machine.offsetHeight, r = 26;
  const per = 2 * (w + h) - 8 * r + 2 * Math.PI * r;
  const n = Math.round(per / 22);
  bulbs = [];
  for (let i = 0; i < n; i++) {
    let d = (i / n) * per;
    let x, y;
    const segs = [w - 2 * r, Math.PI * r / 2, h - 2 * r, Math.PI * r / 2, w - 2 * r, Math.PI * r / 2, h - 2 * r, Math.PI * r / 2];
    let s = 0;
    while (d > segs[s]) { d -= segs[s]; s++; }
    const arc = (cx, cy, a0) => { const a = a0 + d / r; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    switch (s) {
      case 0: [x, y] = [r + d, 0]; break;
      case 1: [x, y] = arc(w - r, r, -Math.PI / 2); break;
      case 2: [x, y] = [w, r + d]; break;
      case 3: [x, y] = arc(w - r, h - r, 0); break;
      case 4: [x, y] = [w - r - d, h]; break;
      case 5: [x, y] = arc(r, h - r, Math.PI / 2); break;
      case 6: [x, y] = [0, h - r - d]; break;
      default: [x, y] = arc(r, r, Math.PI); break;
    }
    const b = document.createElement('i');
    b.className = 'bulb';
    b.style.left = x + 'px'; b.style.top = y + 'px';
    bulbsEl.appendChild(b);
    bulbs.push(b);
  }
}

let bulbMode = 'idle';
let lastBulbStep = -1;
function updateBulbs(t) {
  const rate = bulbMode === 'spin' ? 22 : bulbMode === 'win' ? 8 : 5;
  const step = Math.floor(t * rate);
  if (step === lastBulbStep) return;
  lastBulbStep = step;
  bulbs.forEach((b, i) => {
    let on;
    if (bulbMode === 'win') on = (i + step) % 2 === 0;
    else if (bulbMode === 'spin') on = (i + step) % 4 === 0;
    else on = (i + step) % 6 < 2;
    b.classList.toggle('on', on);
  });
}

// ---------------------------------------------------------------- FX + main loop

const stars = new Starfield($('stars'));
const particles = new Particles($('fx'));
let lastCoinSound = 0;
particles.onCoinBounce = () => {
  const t = now();
  if (t - lastCoinSound > 0.045) { lastCoinSound = t; sound.coin(); }
};

let lastFrame = now();
function frame() {
  const t = now();
  const dt = Math.min(t - lastFrame, 0.05);
  lastFrame = t;
  for (const r of reels) if (r.moving) r.update(t);
  stars.update(dt, t);
  particles.update(dt);
  drawLines(t);
  updateBulbs(t);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- HUD

const balanceEl = $('balance'), betEl = $('bet'), winEl = $('win'), msgEl = $('win-msg');
const spinBtn = $('btn-spin');
let shownBalance = state.balance;

function setMsg(html) {
  msgEl.innerHTML = html;
  msgEl.classList.remove('bump');
  void msgEl.offsetWidth;
  msgEl.classList.add('bump');
}

function updateHud() {
  betEl.textContent = fmt(bet());
  $('bet-down').disabled = state.betIndex === 0 || state.phase !== 'idle' || state.freeSpins > 0;
  $('bet-up').disabled = state.betIndex === BETS.length - 1 || state.phase !== 'idle' || state.freeSpins > 0;
  $('btn-auto').setAttribute('aria-pressed', String(state.auto));
  $('btn-turbo').setAttribute('aria-pressed', String(state.turbo));
  $('btn-sound').setAttribute('aria-pressed', String(state.sound));
  const spinning = state.phase === 'spinning';
  spinBtn.classList.toggle('spinning', spinning);
  spinBtn.classList.toggle('stop', spinning && !state.auto && state.freeSpins === 0);
  spinBtn.querySelector('.spin-label').textContent = state.freeSpins > 0 || state.inFree ? 'FREE' : spinning ? 'STOP' : 'SPIN';
  $('fs-banner').hidden = !state.inFree;
  $('fs-count').textContent = state.freeSpins;
}

let balanceAnim = 0;
function animateBalance(to, dur = 0.5) {
  const from = shownBalance;
  const id = ++balanceAnim;
  const t0 = now();
  balanceEl.classList.toggle('up', to > from);
  const step = () => {
    if (id !== balanceAnim) return;
    const u = clamp((now() - t0) / dur, 0, 1);
    shownBalance = from + (to - from) * easeOutCubic(u);
    balanceEl.textContent = fmt(shownBalance);
    if (u < 1) requestAnimationFrame(step);
    else balanceEl.classList.remove('up');
  };
  step();
}

// Count a number up with ticking sounds. Resolves early if the player skips.
function countUp(el, to, dur, { from = 0, onProgress } = {}) {
  return new Promise((resolve) => {
    const t0 = now();
    let lastTick = 0;
    const step = () => {
      const t = now();
      const u = state.skip ? 1 : clamp((t - t0) / dur, 0, 1);
      const v = from + (to - from) * (u < 1 ? easeOutCubic(u) * 0.3 + u * 0.7 : 1);
      el.textContent = fmt(v);
      onProgress?.(v, u);
      if (t - lastTick > 0.06 && u < 1) { lastTick = t; sound.tick(u); }
      if (u < 1) requestAnimationFrame(step);
      else resolve();
    };
    step();
  });
}

// ---------------------------------------------------------------- spin flow

const forced = []; // test hook: push a grid here to rig the next spin

function startReels(grid) {
  const tm = timing();
  const t = now();
  state.landedScatters = 0;
  let stopped = 0;
  sound.startLoop();
  stars.warpTarget = 1;
  bulbMode = 'spin';
  return new Promise((resolve) => {
    reels.forEach((r, i) => {
      r.onThud = (reel) => onReelThud(reel, grid);
      r.onStop = () => {
        stopped++;
        sound.setLoopIntensity((REELS - stopped) / REELS);
        if (stopped === REELS) {
          sound.stopLoop();
          stars.warpTarget = 0;
          bulbMode = 'idle';
          resolve();
        }
      };
    });
    // Work out stop times up front. Once two bonus symbols are showing, every
    // later reel gets dragged out for suspense.
    let tStop = t + tm.base, sc = 0;
    const extra = state.turbo ? 0.8 : 1.3;
    reels.forEach((r, i) => {
      r.anticip = i > 0 && sc >= 2;
      if (r.anticip) tStop += extra;
      r.start(t, i * 0.06, grid[i], tStop);
      tStop += tm.gap;
      sc += grid[i].filter((s) => s === 'scatter').length;
    });
  });
}

function onReelThud(reel, grid) {
  const i = reel.index;
  sound.reelStop(i);
  buzz(8);
  reel.el.classList.remove('anticipate');
  for (let row = 0; row < ROWS; row++) {
    const cell = reel.cellAt(row);
    cell.classList.remove('land'); void cell.offsetWidth; cell.classList.add('land');
    if (grid[i][row] === 'scatter') {
      state.landedScatters++;
      sound.scatterLand(state.landedScatters);
      cell.classList.add('scatter-hit');
      const rect = cell.getBoundingClientRect();
      particles.sparks(rect.left + rect.width / 2, rect.top + rect.height / 2, 24, '#ff8af0', 320);
    }
  }
  const next = reels[i + 1];
  if (next?.anticip && !state.slammed) {
    next.el.classList.add('anticipate');
    sound.anticipation(Math.max(0.3, next.stopAt - now() + 0.25));
  }
}

function slamStop() {
  if (state.phase !== 'spinning' || state.slammed) return;
  state.slammed = true;
  const t = now();
  reels.forEach((r, i) => {
    r.anticip = false;
    r.el.classList.remove('anticipate');
    if (r.mode !== 'land' && r.mode !== 'idle') r.stopAt = Math.min(r.stopAt, t + i * 0.05);
  });
}

function clearWinDisplay() {
  lineShow = null;
  cycleId++;
  reelsEl.classList.remove('showing');
  machine.classList.remove('winning');
  reels.forEach((r) => r.cells.forEach((c) => c.classList.remove('win', 'scatter-hit')));
}

async function spin() {
  sound.unlock();
  if (state.phase === 'spinning') { if (state.freeSpins === 0 && !state.inFree) slamStop(); return; }
  if (state.phase === 'presenting') { state.skip = true; state.queuedSpin = true; return; }
  if (state.phase !== 'idle') return;

  const free = state.inFree && state.freeSpins > 0;
  const b = bet();
  if (!free) {
    if (state.balance < b) {
      state.auto = false;
      if (state.balance < BETS[0]) showBroke();
      else { sound.denied(); setMsg('Not enough credits for that bet. Lower it to keep playing.'); }
      updateHud();
      return;
    }
    state.balance -= b;
    animateBalance(state.balance, 0.25);
  } else {
    state.freeSpins--;
  }
  save();

  state.phase = 'spinning';
  state.slammed = false;
  state.skip = false;
  clearWinDisplay();
  winEl.textContent = '0';
  winEl.classList.remove('hot');
  setMsg(free ? `Free spin · wins ×${FREE_SPIN_MULT}` : pick(SPIN_LINES));
  spinBtn.classList.add('pressed');
  setTimeout(() => spinBtn.classList.remove('pressed'), 120);
  sound.spinStart();
  updateHud();

  const grid = forced.shift() || spinGrid();
  const result = evaluate(grid, b, free ? FREE_SPIN_MULT : 1);
  await startReels(grid);

  state.phase = 'presenting';
  updateHud();
  await present(result, b, free);
  state.skip = false;

  if (result.scatter.freeSpins) await triggerFreeSpins(result.scatter.freeSpins);

  if (state.inFree && state.freeSpins === 0) await endFreeSpins();

  state.phase = 'idle';
  updateHud();
  save();
  if (state.balance < BETS[0] && !state.inFree) { state.auto = false; updateHud(); showBroke(); return; }
  scheduleNext(result.total > 0);
}

function scheduleNext(hadWin) {
  const tm = timing();
  if (state.queuedSpin) { state.queuedSpin = false; spin(); return; }
  if (state.inFree && state.freeSpins > 0) { setTimeout(spin, (hadWin ? 0.9 : 0.5) * tm.present * 1000); return; }
  if (state.auto) setTimeout(() => { if (state.auto && state.phase === 'idle') spin(); }, (hadWin ? 1.1 : 0.35) * tm.present * 1000);
}

const SPIN_LINES = ['Good luck!', 'Reach for the stars…', 'Here we go!', 'Feeling lucky?', 'Spinning the cosmos…'];
const MISS_LINES = ['So close…', 'The stars are aligning…', 'Next one!', 'Keep reaching!', 'Almost a constellation…'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

async function present(result, b, free) {
  const tm = timing();
  if (result.total <= 0) {
    if (!free) setMsg(pick(MISS_LINES));
    return;
  }
  const ratio = result.total / b;
  // Highlight winning cells.
  reelsEl.classList.add('showing');
  machine.classList.add('winning');
  bulbMode = 'win';
  const winCells = new Set();
  for (const l of result.lines) for (const [reel, row] of l.positions) winCells.add(reels[reel].cellAt(row));
  if (result.scatter.win > 0) for (const [reel, row] of result.scatter.positions) winCells.add(reels[reel].cellAt(row));
  winCells.forEach((c) => {
    c.classList.add('win');
    const r = c.getBoundingClientRect();
    particles.sparks(r.left + r.width / 2, r.top + r.height / 2, 10, getComputedStyle(c).getPropertyValue('--glow') || '#fff', 260);
  });
  lineShow = { lines: result.lines, start: now(), single: false };

  const winRect = winEl.getBoundingClientRect();
  const wx = winRect.left + winRect.width / 2, wy = winRect.top + winRect.height / 2;

  if (ratio >= 10) {
    await bigWin(result.total, b);
  } else {
    sound.win(ratio >= 5 ? 3 : ratio >= 2 ? 2 : ratio >= 1 ? 1 : 0);
    winEl.classList.add('hot');
    const coins = Math.round(clamp(ratio * 5, 4, 40));
    particles.coins(wx, wy, coins, ratio >= 3 ? 1.2 : 0.9);
    setMsg(winText(result));
    const dur = (ratio >= 3 ? 1.4 : ratio >= 1 ? 0.9 : 0.6) * tm.present;
    await countUp(winEl, result.total, dur);
  }
  winEl.classList.add('hot');
  winEl.textContent = fmt(result.total);
  state.balance += result.total;
  if (state.inFree) state.fsWin += result.total;
  animateBalance(state.balance, 0.6);
  save();
  bulbMode = 'idle';
  if (!state.inFree || state.freeSpins === 0) cycleLines(result);
}

function winText(result) {
  if (result.lines.length === 1 && !result.scatter.win) {
    const l = result.lines[0];
    return `${l.count} × ${SYMBOLS[l.symbol].name} on line ${l.lineIndex + 1} · <b>${fmt(l.win)}</b>`;
  }
  const n = result.lines.length;
  return `${n ? `${n} line${n > 1 ? 's' : ''}` : ''}${n && result.scatter.win ? ' + ' : ''}${result.scatter.win ? 'Bonus' : ''} · <b>${fmt(result.total)}</b>`;
}

// After the main celebration, show each winning line in turn until the next spin.
let cycleId = 0;
async function cycleLines(result) {
  const id = ++cycleId;
  const items = [...result.lines];
  if (result.scatter.win) items.push({ scatter: true });
  if (items.length < 2) return;
  await wait(1.2);
  for (let k = 0; id === cycleId; k = (k + 1) % items.length) {
    const it = items[k];
    reels.forEach((r) => r.cells.forEach((c) => c.classList.remove('win')));
    const pos = it.scatter ? result.scatter.positions : it.positions;
    pos.forEach(([reel, row]) => {
      const c = reels[reel].cellAt(row);
      c.classList.remove('win'); void c.offsetWidth; c.classList.add('win');
    });
    if (it.scatter) { lineShow = null; msgEl.innerHTML = `${result.scatter.count} × Bonus · <b>${fmt(result.scatter.win)}</b>`; }
    else { lineShow = { lines: [it], start: now(), single: true }; msgEl.innerHTML = `Line ${it.lineIndex + 1} · ${it.count} × ${SYMBOLS[it.symbol].name} · <b>${fmt(it.win)}</b>`; }
    await wait(1.4);
  }
}

// ---------------------------------------------------------------- big win

const TIERS = [
  { at: 10, name: 'BIG WIN', cls: '' },
  { at: 25, name: 'MEGA WIN', cls: 't2' },
  { at: 50, name: 'EPIC WIN', cls: 't3' },
];

function waitTap(el, timeout) {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => { if (done) return; done = true; el.removeEventListener('pointerdown', finish); document.removeEventListener('keydown', key); resolve(); };
    const key = (e) => { if (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape') { e.preventDefault(); finish(); } };
    el.addEventListener('pointerdown', finish);
    document.addEventListener('keydown', key);
    if (timeout) setTimeout(finish, timeout * 1000);
  });
}

async function bigWin(total, b) {
  const tm = timing();
  const overlay = $('bigwin'), title = $('bigwin-title'), amount = $('bigwin-amount');
  const ratio = total / b;
  const reached = TIERS.filter((t) => ratio >= t.at);
  title.textContent = TIERS[0].name;
  title.className = 'bigwin-title';
  amount.textContent = '0';
  overlay.hidden = false;
  state.phase = 'overlay';
  sound.tierUp(1);
  shake();
  buzz([30, 40, 60]);
  particles.confetti(80);
  winEl.classList.add('hot');
  setMsg(`${reached[reached.length - 1].name}! · <b>${fmt(total)}</b>`);

  // Pressing during the count jumps to the end.
  state.skip = false;
  const skipper = () => { state.skip = true; };
  overlay.addEventListener('pointerdown', skipper);
  const keySkip = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); state.skip = true; } };
  document.addEventListener('keydown', keySkip);

  let tierShown = 0;
  let lastRain = 0;
  const dur = (3 + reached.length * 1.6) * (state.turbo ? 0.6 : 1);
  await countUp(amount, total, dur, {
    onProgress: (v) => {
      winEl.textContent = fmt(v);
      const t = now();
      if (t - lastRain > 0.12) { lastRain = t; particles.coinRain(3 + tierShown * 2); }
      const nextTier = reached[tierShown + 1];
      if (nextTier && v >= nextTier.at * b) {
        tierShown++;
        title.textContent = nextTier.name;
        title.className = `bigwin-title ${nextTier.cls}`;
        void title.offsetWidth;
        title.classList.add('tier');
        sound.tierUp(tierShown + 1);
        shake();
        buzz([40, 30, 80]);
        particles.confetti(100);
      }
    },
  });
  overlay.removeEventListener('pointerdown', skipper);
  document.removeEventListener('keydown', keySkip);
  const finalTier = reached[reached.length - 1];
  if (title.textContent !== finalTier.name) { title.textContent = finalTier.name; title.className = `bigwin-title ${finalTier.cls}`; }
  amount.textContent = fmt(total);
  particles.coins(innerWidth / 2, innerHeight * 0.6, 40, 1.4);
  sound.win(3);
  state.skip = false;
  await waitTap(overlay, state.auto || state.inFree ? 2.5 * tm.present + 0.5 : 6);
  overlay.hidden = true;
  state.phase = 'presenting';
}

function shake() {
  machine.classList.remove('shake');
  void machine.offsetWidth;
  machine.classList.add('shake');
}

// ---------------------------------------------------------------- free spins

async function triggerFreeSpins(n) {
  const retrigger = state.inFree;
  state.phase = 'overlay';
  sound.bonusTrigger();
  buzz([50, 50, 100]);
  shake();
  particles.confetti(120);
  const el = $('bonus');
  $('bonus-title').textContent = retrigger ? 'MORE SPINS!' : 'FREE SPINS';
  $('bonus-sub').innerHTML = retrigger
    ? `<b>+${n}</b> free spins added`
    : `<b>${n}</b> free spins · every win <b>×${FREE_SPIN_MULT}</b>`;
  el.hidden = false;
  await waitTap(el, state.auto ? 3 : 8);
  el.hidden = true;
  sound.whoosh();
  if (!retrigger) {
    state.inFree = true;
    state.fsWin = 0;
    document.body.classList.add('freespins');
    stars.hueTarget = -70;
  }
  state.freeSpins += n;
  updateHud();
}

async function endFreeSpins() {
  state.phase = 'overlay';
  await wait(0.6);
  const el = $('bonus');
  $('bonus-title').textContent = 'BONUS OVER';
  $('bonus-sub').innerHTML = `You collected <b>${fmt(state.fsWin)}</b>`;
  el.hidden = false;
  sound.fanfare(state.fsWin >= bet() * 10 ? 3 : 1);
  if (state.fsWin > 0) particles.coinRain(60);
  await waitTap(el, state.auto ? 3 : 8);
  el.hidden = true;
  state.inFree = false;
  document.body.classList.remove('freespins');
  stars.hueTarget = 0;
  setMsg(`Free spins paid <b>${fmt(state.fsWin)}</b>`);
}

// ---------------------------------------------------------------- broke / refill

function showBroke() {
  $('broke').hidden = false;
}
$('btn-refill').addEventListener('click', (e) => {
  e.stopPropagation();
  sound.unlock();
  $('broke').hidden = true;
  state.balance += START_BALANCE;
  state.betIndex = Math.min(state.betIndex, 2);
  sound.win(3);
  const r = balanceEl.getBoundingClientRect();
  particles.coins(r.left + r.width / 2, r.top, 40, 1.2);
  animateBalance(state.balance, 1.2);
  save();
  updateHud();
});

// ---------------------------------------------------------------- paytable

function buildPaytable() {
  const b = bet(), lb = b / PAYLINES.length;
  const order = ['star', 'comet', 'planet', 'moon', 'amethyst', 'sapphire', 'emerald', 'topaz'];
  $('pt-grid').innerHTML = order.map((id) => `
    <div class="pt-item"><img src="${SYMBOL_URL[id]}" alt=""><ul>
      ${[5, 4, 3].map((n) => `<li><b>${n}</b> ${fmt(SYMBOLS[id].pays[n] * lb)}</li>`).join('')}
    </ul></div>`).join('');
  $('pt-bonus').innerHTML = `<img src="${SYMBOL_URL.scatter}" alt=""><div><b>Bonus</b> pays anywhere: 3 = ${fmt(SCATTER_PAYS[3] * b)}, 4 = ${fmt(SCATTER_PAYS[4] * b)}, 5 = ${fmt(SCATTER_PAYS[5] * b)}, and starts <b>${SCATTER_SPINS[3]}, ${SCATTER_SPINS[4]} or ${SCATTER_SPINS[5]} free spins</b> where every win is doubled.</div>`;
  $('pt-lines').innerHTML = PAYLINES.map((rows, i) => {
    let cells = '';
    for (let c = 0; c < 5; c++) for (let r = 0; r < 3; r++) cells += `<rect x="${c * 10 + 1}" y="${r * 10 + 1}" width="8" height="8" rx="1.5" fill="${rows[c] === r ? LINE_COLORS[i % LINE_COLORS.length] : 'rgba(255,255,255,.12)'}"/>`;
    return `<div class="pt-line"><svg viewBox="0 0 50 30">${cells}</svg>${i + 1}</div>`;
  }).join('');
}

// ---------------------------------------------------------------- input

spinBtn.addEventListener('click', () => spin());
$('bet-down').addEventListener('click', () => changeBet(-1));
$('bet-up').addEventListener('click', () => changeBet(1));
function changeBet(d) {
  sound.unlock();
  if (state.phase !== 'idle' || state.inFree) return;
  const n = clamp(state.betIndex + d, 0, BETS.length - 1);
  if (n === state.betIndex) { sound.denied(); return; }
  state.betIndex = n;
  sound.bet(n, d > 0);
  betEl.classList.remove('bump'); void betEl.offsetWidth;
  save();
  updateHud();
}
$('btn-auto').addEventListener('click', toggleAuto);
function toggleAuto() {
  sound.unlock(); sound.click();
  state.auto = !state.auto;
  updateHud();
  if (state.auto && state.phase === 'idle') spin();
}
$('btn-turbo').addEventListener('click', toggleTurbo);
function toggleTurbo() {
  sound.unlock(); sound.click();
  state.turbo = !state.turbo;
  save(); updateHud();
}
$('btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  sound.unlock();
  sound.setEnabled(state.sound);
  sound.click();
  save(); updateHud();
});
const pt = $('paytable');
$('btn-info').addEventListener('click', () => { sound.unlock(); sound.click(); buildPaytable(); pt.showModal(); });
pt.addEventListener('click', (e) => { if (e.target === pt) pt.close(); });

document.addEventListener('keydown', (e) => {
  if (pt.open || !$('bigwin').hidden || !$('bonus').hidden || !$('broke').hidden) return;
  if (e.repeat && e.code !== 'Space') return;
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) spin(); }
  else if (e.code === 'KeyT') toggleTurbo();
  else if (e.code === 'KeyA') toggleAuto();
  else if (e.code === 'ArrowUp' || e.code === 'Equal') changeBet(1);
  else if (e.code === 'ArrowDown' || e.code === 'Minus') changeBet(-1);
});
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });

let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 80); });

// ---------------------------------------------------------------- boot

balanceEl.textContent = fmt(state.balance);
layout();
updateHud();
requestAnimationFrame(frame);
if (document.fonts?.ready) document.fonts.ready.then(() => { placeBulbs(); sizeLines(); });
if (state.balance < BETS[0]) showBroke();

// Handy for testing in the console.
window.__slot = { state, reels, evaluate, spin, forced };
