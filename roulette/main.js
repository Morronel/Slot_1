import { SPOTS, settle, randomNumber, colorOf } from './rules.js';
import { Wheel } from './wheel.js';
import { RouletteSound } from './sfx.js';
import { Starfield, Particles } from '../js/fx.js';

// The balance is shared with the other games through the slot's storage key.
// Only `balance` and `sound` are touched there; everything else is preserved.
const SHARED_KEY = 'starfall-spins.v1';
const OWN_KEY = 'nova-roulette.v1';
const START_BALANCE = 10000;
const CHIPS = [10, 50, 100, 500, 1000, 5000];
const TIERS = [
  { at: 8, name: 'BIG WIN', cls: '' },
  { at: 18, name: 'MEGA WIN', cls: 't2' },
  { at: 30, name: 'EPIC WIN', cls: 't3' },
];

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const short = (n) => (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${+(n / 1000).toFixed(n % 1000 ? 1 : 0)}K` : String(n));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const now = () => performance.now() / 1000;
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);
const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };
const COLOR_NAME = { red: 'Red', black: 'Black', green: 'Green' };
const COLOR_CLS = { red: 'r', black: 'k', green: 'g' };

// ---------------------------------------------------------------- state & storage

const readJSON = (k) => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const shared = readJSON(SHARED_KEY);
const own = readJSON(OWN_KEY);

const state = {
  balance: Number.isFinite(shared.balance) ? shared.balance : START_BALANCE, // excludes chips on the table
  bets: {},
  actions: [], // undo stack
  lastBets: own.lastBets && typeof own.lastBets === 'object' ? own.lastBets : null,
  chipIndex: clamp(own.chipIndex ?? 1, 0, CHIPS.length - 1),
  turbo: !!own.turbo,
  sound: shared.sound ?? true,
  history: Array.isArray(own.history) ? own.history.slice(0, 14) : [],
  phase: 'idle', // idle | spinning | presenting
  skip: false,
};
const staked = () => Object.values(state.bets).reduce((a, b) => a + b, 0);

function save(balance = state.balance + staked()) {
  try {
    const cur = readJSON(SHARED_KEY);
    localStorage.setItem(SHARED_KEY, JSON.stringify({ ...cur, balance, sound: state.sound }));
    localStorage.setItem(OWN_KEY, JSON.stringify({ chipIndex: state.chipIndex, turbo: state.turbo, history: state.history, lastBets: state.lastBets }));
  } catch { /* private mode */ }
}

const sound = new RouletteSound();
sound.enabled = state.sound;
addEventListener('pointerdown', () => sound.unlock(), { capture: true });

// ---------------------------------------------------------------- canvases

const wheel = new Wheel($('wheel'));
const stars = new Starfield($('stars'));
const particles = new Particles($('fx'));
let lastCoin = 0;
particles.onCoinBounce = () => { const t = now(); if (t - lastCoin > 0.045) { lastCoin = t; sound.coin(); } };
wheel.onFret = (k) => { sound.fret(k); if (k > 0.5) buzz(4); };
wheel.onBounce = (k) => { sound.bounce(k); buzz(10); };
wheel.onRoll = (speed, onTrack) => sound.setRoll(speed, onTrack);
if (state.history.length) wheel.setRestingNumber(state.history[0]);

// ---------------------------------------------------------------- table

const felt = $('felt');
const spotEls = {};
let orientation = '';

function gridPos(id, o) {
  // Returns [col, colSpan, row, rowSpan] for the horizontal (h) or vertical (v) table.
  const m = /^n(\d+)$/.exec(id);
  if (m) {
    const n = +m[1];
    if (n === 0) return o === 'h' ? [1, 1, 1, 3] : [3, 3, 1, 1];
    const c = Math.ceil(n / 3), r = (n - 1) % 3;
    return o === 'h' ? [1 + c, 1, 3 - r, 1] : [3 + r, 1, 1 + c, 1];
  }
  const k = +id.slice(-1);
  if (id.startsWith('col')) return o === 'h' ? [14, 1, 4 - k, 1] : [2 + k, 1, 14, 1];
  if (id.startsWith('doz')) return o === 'h' ? [2 + (k - 1) * 4, 4, 4, 1] : [2, 1, 2 + (k - 1) * 4, 4];
  const i = ['low', 'even', 'red', 'black', 'odd', 'high'].indexOf(id);
  return o === 'h' ? [2 + i * 2, 2, 5, 1] : [1, 1, 2 + i * 2, 2];
}

function buildTable() {
  const ids = ['n0'];
  for (let n = 1; n <= 36; n++) ids.push(`n${n}`);
  ids.push('col1', 'col2', 'col3', 'doz1', 'doz2', 'doz3', 'low', 'even', 'red', 'black', 'odd', 'high');
  for (const id of ids) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'spot';
    el.dataset.id = id;
    const spot = SPOTS[id];
    if (id.startsWith('n')) {
      const n = +id.slice(1);
      el.classList.add('num', colorOf(n));
      el.innerHTML = `<span class="lbl">${n}</span>`;
      el.setAttribute('aria-label', `Bet on ${n}`);
    } else {
      el.classList.add('out', id.startsWith('col') ? 'col' : id.startsWith('doz') ? 'dozen' : 'even');
      el.innerHTML = id === 'red' || id === 'black' ? '<span class="diamond"></span>' : `<span class="lbl">${spot.label}</span>`;
      el.setAttribute('aria-label', `Bet on ${id.startsWith('col') ? `column ${id.slice(-1)}, ` : ''}${id === 'red' || id === 'black' ? id : spot.label}, pays ${spot.pays} to 1`);
      el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') showCover(id, true); });
      el.addEventListener('pointerleave', () => showCover(id, false));
    }
    el.addEventListener('click', () => placeChip(id));
    felt.appendChild(el);
    spotEls[id] = el;
  }
  // Decorative corners where a real table has no bet.
  for (let i = 0; i < 2; i++) {
    const f = document.createElement('div');
    f.className = 'filler';
    f.textContent = '✦';
    felt.appendChild(f);
    fillers.push(f);
  }
}
const fillers = [];

function setOrientation(o) {
  if (o === orientation) return;
  orientation = o;
  felt.classList.toggle('h', o === 'h');
  felt.classList.toggle('v', o === 'v');
  for (const [id, el] of Object.entries(spotEls)) {
    const [c, cs, r, rs] = gridPos(id, o);
    el.style.gridColumn = `${c} / span ${cs}`;
    el.style.gridRow = `${r} / span ${rs}`;
  }
  const fp = o === 'h' ? [[1, 4, 2], [14, 4, 2]] : [[1, 1, 1], [1, 14, 1]];
  fillers.forEach((f, i) => {
    const [c, r, rs] = fp[i];
    f.style.gridColumn = o === 'h' ? `${c} / span 1` : '1 / span 2';
    f.style.gridRow = `${r} / span ${rs}`;
  });
  // The zero takes the rounded corner(s) on the end of the table it sits at.
  spotEls.n0.style.borderRadius = o === 'h' ? '12px 0 0 12px' : '12px 12px 0 0';
}

function showCover(id, on) {
  for (let n = 0; n <= 36; n++) if (SPOTS[id].covers(n)) spotEls[`n${n}`].classList.toggle('cover', on);
}

// Draw the chip stack sitting on a spot.
function chipFor(amount) {
  let v = CHIPS[0];
  for (const c of CHIPS) if (amount >= c) v = c;
  return v;
}
function stackDepth(amount) {
  let n = 0, rest = amount;
  for (let i = CHIPS.length - 1; i >= 0 && n < 6; i--) while (rest >= CHIPS[i] && n < 6) { rest -= CHIPS[i]; n++; }
  return Math.max(1, n);
}
function chipEl(amount, cls = '') {
  const el = document.createElement('div');
  el.className = `chip ${cls}`;
  el.dataset.v = chipFor(amount);
  el.innerHTML = `<span>${short(amount)}</span>`;
  return el;
}
function renderStack(id, { land = false } = {}) {
  const spot = spotEls[id];
  spot.querySelector('.stack:not(.payout):not(.lose)')?.remove();
  const amount = state.bets[id];
  if (!amount) return;
  const wrap = document.createElement('div');
  wrap.className = 'stack' + (land ? ' land' : '');
  const chip = chipEl(amount);
  const depth = stackDepth(amount);
  const shadows = [];
  for (let k = 1; k < depth; k++) shadows.push(`0 ${k * 2.5}px 0 var(--c2)`, `0 ${k * 2.5 + 1}px 0 rgba(0,0,0,0.35)`);
  if (shadows.length) chip.style.setProperty('--stack', shadows.join(','));
  wrap.style.marginTop = `${-(depth - 1) * 1.25}px`;
  wrap.appendChild(chip);
  spot.appendChild(wrap);
}

// ---------------------------------------------------------------- layout

const mqWide = matchMedia('(min-width: 880px) and (min-height: 600px)');
const mqSide = matchMedia('(max-height: 540px) and (orientation: landscape)');
let wheelPx = 150, zoomPx = 150;

function layout() {
  const W = innerWidth, H = innerHeight;
  if (mqWide.matches) wheelPx = Math.min(W * 0.36, H - 290, 470);
  else if (mqSide.matches) wheelPx = Math.min(H - 124, W * 0.32, 260);
  else wheelPx = Math.min(W * 0.32, H * 0.19, 170);
  wheelPx = Math.max(96, Math.floor(wheelPx));
  zoomPx = wheelPx < 300 ? Math.floor(Math.min(W, H) * 0.9) : wheelPx;
  document.documentElement.style.setProperty('--wheel', `${wheelPx}px`);
  wheel.resize(Math.max(wheelPx, zoomPx));
  if (document.body.classList.contains('zoomed')) zoomIn();

  // Table: wide and short gets the classic horizontal layout, tall gets vertical.
  felt.style.width = felt.style.height = '0px';
  const area = $('table-area').getBoundingClientRect();
  const o = area.width >= 560 || area.width > area.height * 1.5 ? 'h' : 'v';
  setOrientation(o);
  let fw, fh;
  if (o === 'h') {
    const ratio = 2.55;
    fw = Math.min(area.width, area.height * ratio);
    fh = fw / ratio;
  } else {
    fw = Math.min(area.width, 520);
    fh = area.height;
  }
  felt.style.width = `${Math.floor(fw)}px`;
  felt.style.height = `${Math.floor(fh)}px`;
  const cellW = o === 'h' ? fw / 14.3 : fw / 4.75;
  const cellH = o === 'h' ? fh / 4.6 : fh / 14;
  felt.style.setProperty('--chip', `${Math.round(clamp(Math.min(cellW, cellH) * 0.82, 18, 44))}px`);
}
addEventListener('resize', layout);
mqWide.addEventListener?.('change', layout);
mqSide.addEventListener?.('change', layout);

// Big, centred wheel while the ball is rolling on small screens.
function zoomIn() {
  if (zoomPx <= wheelPx) return;
  const r = $('wheel-dock').getBoundingClientRect();
  const s = zoomPx / wheelPx;
  const tx = (innerWidth - zoomPx) / 2 - r.left, ty = (innerHeight - zoomPx) / 2 - r.top;
  $('wheel-wrap').style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
  document.body.classList.add('zoomed');
}
function zoomOut() {
  $('wheel-wrap').style.transform = '';
  document.body.classList.remove('zoomed');
}

// ---------------------------------------------------------------- HUD

const balanceEl = $('balance'), stakedEl = $('staked'), winEl = $('win'), msgEl = $('msg');
const spinBtn = $('btn-spin');
let shownBalance = state.balance;

function setMsg(html) {
  msgEl.innerHTML = html;
  msgEl.classList.remove('bump');
  void msgEl.offsetWidth;
  msgEl.classList.add('bump');
}

let balanceAnim = 0;
function animateBalance(to, dur = 0.5) {
  const from = shownBalance, id = ++balanceAnim, t0 = now();
  balanceEl.classList.toggle('up', to > from);
  balanceEl.classList.toggle('down', to < from);
  const step = () => {
    if (id !== balanceAnim) return;
    const u = clamp((now() - t0) / dur, 0, 1);
    shownBalance = from + (to - from) * easeOutCubic(u);
    balanceEl.textContent = fmt(shownBalance);
    if (u < 1) requestAnimationFrame(step);
    else balanceEl.classList.remove('up', 'down');
  };
  step();
}

function countUp(el, to, dur, { onProgress } = {}) {
  return new Promise((resolve) => {
    const t0 = now();
    let lastTick = 0;
    const step = () => {
      const t = now();
      const u = state.skip ? 1 : clamp((t - t0) / dur, 0, 1);
      const v = to * (u < 1 ? easeOutCubic(u) * 0.3 + u * 0.7 : 1);
      el.textContent = fmt(v);
      onProgress?.(v, u);
      if (t - lastTick > 0.06 && u < 1) { lastTick = t; sound.tick(u); }
      if (u < 1) requestAnimationFrame(step);
      else resolve();
    };
    step();
  });
}

function updateHud() {
  const idle = state.phase === 'idle';
  const s = staked();
  stakedEl.textContent = fmt(s);
  $('btn-undo').disabled = !idle || !state.actions.length;
  $('btn-clear').disabled = !idle || !s;
  $('btn-double').disabled = !idle || !s || state.balance < s;
  const canRebet = idle && !s && state.lastBets && sum(state.lastBets) <= state.balance;
  $('btn-rebet').disabled = !canRebet;
  $('btn-rebet').classList.toggle('glow', !!canRebet);
  spinBtn.disabled = !idle || (!s && !canRebet);
  spinBtn.classList.toggle('spinning', state.phase === 'spinning');
  spinBtn.querySelector('.spin-label').textContent = !s && canRebet ? 'REBET' : 'SPIN';
  felt.classList.toggle('locked', !idle);
  $('btn-turbo').setAttribute('aria-pressed', String(state.turbo));
  $('btn-sound').setAttribute('aria-pressed', String(state.sound));
  document.querySelectorAll('#chips .chip').forEach((el, i) => {
    el.setAttribute('aria-checked', String(i === state.chipIndex));
    el.disabled = !idle;
  });
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

function renderHistory(fresh = false) {
  const ol = $('history');
  ol.innerHTML = '';
  state.history.forEach((n, i) => {
    const li = document.createElement('li');
    li.className = colorOf(n) + (fresh && i === 0 ? ' new' : '');
    li.textContent = n;
    ol.appendChild(li);
  });
}

// ---------------------------------------------------------------- chips

function buildChipRack() {
  const rack = $('chips');
  CHIPS.forEach((v, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.dataset.v = v;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', `${fmt(v)} chip`);
    b.innerHTML = `<span>${short(v)}</span>`;
    b.addEventListener('click', () => selectChip(i));
    rack.appendChild(b);
  });
}

function selectChip(i) {
  if (state.phase !== 'idle') return;
  state.chipIndex = i;
  sound.chipSelect(i);
  buzz(5);
  save();
  updateHud();
}

// A chip flies along an arc from one rect to another.
function fly(from, to, amount, { dur = 0.32, size } = {}) {
  const el = chipEl(amount, 'fly');
  const sz = size || parseFloat(getComputedStyle(felt).getPropertyValue('--chip')) || 26;
  el.style.setProperty('--chip', `${sz}px`);
  $('flyers').appendChild(el);
  const x0 = from.left + from.width / 2 - sz / 2, y0 = from.top + from.height / 2 - sz / 2;
  const x1 = to.left + to.width / 2 - sz / 2, y1 = to.top + to.height / 2 - sz / 2;
  const lift = Math.min(80, Math.hypot(x1 - x0, y1 - y0) * 0.25);
  const anim = el.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(1.25)` },
    { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2 - lift}px) scale(1.35) rotate(180deg)`, offset: 0.5 },
    { transform: `translate(${x1}px, ${y1}px) scale(1) rotate(360deg)` },
  ], { duration: dur * 1000, easing: 'cubic-bezier(.3, .6, .4, 1)' });
  return anim.finished.then(() => el.remove(), () => el.remove());
}

function clearResultMarks() {
  felt.querySelectorAll('.spot.hit, .spot.dolly').forEach((el) => el.classList.remove('hit', 'dolly'));
  felt.querySelectorAll('.stack.payout, .stack.lose, .float-label').forEach((el) => el.remove());
  wheel.clearResult();
  winEl.classList.remove('hot');
}

function placeChip(id) {
  if (state.phase !== 'idle') return;
  clearResultMarks();
  let v = CHIPS[state.chipIndex];
  if (state.balance < v) {
    // Fall back to the biggest chip the player can still afford.
    const affordable = CHIPS.filter((c) => c <= state.balance);
    if (!affordable.length) { sound.denied(); setMsg('Not enough balance for a chip'); checkBroke(); return; }
    v = affordable[affordable.length - 1];
  }
  state.balance -= v;
  state.bets[id] = (state.bets[id] || 0) + v;
  state.actions.push([{ id, v }]);
  const spot = spotEls[id];
  spot.classList.remove('press'); void spot.offsetWidth; spot.classList.add('press');
  const rackChip = $('chips').children[CHIPS.indexOf(v)];
  fly(rackChip.getBoundingClientRect(), spot.getBoundingClientRect(), v).then(() => {
    renderStack(id, { land: true });
    sound.chip(stackDepth(state.bets[id] || 0));
    buzz(8);
  });
  animateBalance(state.balance, 0.25);
  if (staked() === v) setMsg('Place more chips or <b>spin</b>');
  save();
  updateHud();
}

// Apply a batch of chips (rebet, double) with staggered landings.
function placeBatch(items) {
  const cost = items.reduce((a, it) => a + it.v, 0);
  if (cost > state.balance) { sound.denied(); setMsg('Not enough balance for that'); return false; }
  clearResultMarks();
  state.balance -= cost;
  items.forEach((it, k) => {
    state.bets[it.id] = (state.bets[it.id] || 0) + it.v;
    const spot = spotEls[it.id];
    setTimeout(() => {
      fly($('chips').getBoundingClientRect(), spot.getBoundingClientRect(), it.v, { dur: 0.28 }).then(() => {
        renderStack(it.id, { land: true });
        sound.chip(k);
      });
    }, k * 55);
  });
  state.actions.push(items);
  animateBalance(state.balance, 0.4);
  save();
  updateHud();
  return true;
}

function undo() {
  if (state.phase !== 'idle' || !state.actions.length) return;
  const items = state.actions.pop();
  for (const { id, v } of items) {
    state.bets[id] -= v;
    state.balance += v;
    if (state.bets[id] <= 0) delete state.bets[id];
    renderStack(id);
  }
  sound.chip(0);
  sound.whoosh();
  animateBalance(state.balance, 0.3);
  save();
  updateHud();
}

function clearBets() {
  if (state.phase !== 'idle' || !staked()) return;
  const rack = $('chips').getBoundingClientRect();
  for (const [id, v] of Object.entries(state.bets)) {
    const spot = spotEls[id];
    fly(spot.getBoundingClientRect(), rack, v, { dur: 0.35 });
    spot.querySelector('.stack')?.remove();
  }
  state.balance += staked();
  state.bets = {};
  state.actions = [];
  sound.sweep();
  animateBalance(state.balance, 0.4);
  setMsg('Place your chips');
  save();
  updateHud();
}

function double() {
  if (state.phase !== 'idle' || !staked()) return;
  if (placeBatch(Object.entries(state.bets).map(([id, v]) => ({ id, v })))) setMsg('Doubled up');
}

function rebet() {
  if (state.phase !== 'idle' || staked() || !state.lastBets) return false;
  const ok = placeBatch(Object.entries(state.lastBets).map(([id, v]) => ({ id, v })));
  if (ok) setMsg('Same bets again');
  return ok;
}

// ---------------------------------------------------------------- spin

const forced = []; // test hook: push a number here to rig the next spin

async function spin() {
  if (state.phase !== 'idle') return;
  sound.unlock();
  if (!staked()) {
    if (!rebet()) { sound.denied(); setMsg('Tap the table to place a chip'); shakeEl($('chips')); return; }
    await wait(0.45);
  }
  clearResultMarks();
  const bets = { ...state.bets };
  const n = forced.length ? forced.shift() : randomNumber();
  const res = settle(bets, n);
  // The outcome is decided and saved now, so leaving mid-spin changes nothing.
  state.lastBets = bets;
  state.bets = {};
  state.actions = [];
  state.balance += res.returned;
  save(state.balance);
  state.phase = 'spinning';
  winEl.textContent = '0';
  updateHud();
  setMsg('No more bets');

  zoomIn();
  document.body.classList.add('spinning');
  stars.warpTarget = 0.35;
  sound.launch();
  sound.startRoll();
  buzz(15);
  await wheel.spin(n, state.turbo ? 3.6 : 7.2);
  sound.stopRoll();
  sound.settle();
  buzz([30, 30, 20]);
  const bp = wheel.ballClientPos();
  particles.sparks(bp.x, bp.y, 30, '#fff3b0', 260);
  stars.warpTarget = 0;
  setTimeout(() => document.body.classList.remove('spinning'), state.turbo ? 600 : 1100);
  await present(res, bets);
}

function shakeEl(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

async function present(res, bets) {
  state.phase = 'presenting';
  const { n, color } = res;
  sound.reveal(color);
  state.history.unshift(n);
  state.history.length = Math.min(state.history.length, 14);
  renderHistory(true);
  save(state.balance);
  setMsg(`<span class="${COLOR_CLS[color]}">${n} ${COLOR_NAME[color]}</span>`);
  await wait(state.turbo ? 0.6 : 1.1);
  zoomOut();
  await wait(0.35);

  // Light up the number and every spot that won.
  const numEl = spotEls[`n${n}`];
  numEl.classList.add('hit', 'dolly');
  const winIds = new Set(res.wins.map((w) => w.id));
  for (const id of winIds) spotEls[id].classList.add('hit');

  // Losing chips get swept toward the wheel.
  const dock = $('wheel-dock').getBoundingClientRect();
  let swept = 0;
  for (const id of res.losses) {
    const st = spotEls[id].querySelector('.stack');
    if (!st) continue;
    const r = st.getBoundingClientRect();
    st.style.transform = `translate(calc(-50% + ${dock.left + dock.width / 2 - r.left}px), calc(-50% + ${dock.top + dock.height / 2 - r.top}px)) scale(0.4)`;
    st.classList.add('lose');
    setTimeout(() => st.remove(), 500);
    swept++;
  }
  if (swept) sound.sweep();

  if (!res.returned) {
    sound.miss();
    setMsg(`<span class="${COLOR_CLS[color]}">${n} ${COLOR_NAME[color]}</span> · no win this time`);
    animateBalance(state.balance, 0.3);
    await wait(0.6);
    return finish();
  }

  // Winners: pulse the stake, drop the payout beside it, fountain coins.
  await wait(0.25);
  for (const w of res.wins) {
    const spot = spotEls[w.id];
    const st = spot.querySelector('.stack');
    st?.classList.add('won');
    const pay = document.createElement('div');
    pay.className = 'stack payout';
    pay.style.marginLeft = 'calc(var(--chip) * 0.45)';
    pay.style.marginTop = 'calc(var(--chip) * -0.35)';
    pay.appendChild(chipEl(w.back - w.stake));
    spot.appendChild(pay);
    const lab = document.createElement('div');
    lab.className = 'float-label';
    lab.textContent = `+${short(w.back - w.stake)}`;
    spot.appendChild(lab);
    const r = spot.getBoundingClientRect();
    particles.coins(r.left + r.width / 2, r.top + r.height / 2, Math.min(28, 4 + Math.round((w.back / res.staked) * 3)), 0.8);
    particles.sparks(r.left + r.width / 2, r.top + r.height / 2, 16, '#ffd84a', 220);
  }
  const ratio = res.returned / res.staked;
  sound.win(ratio >= 8 ? 3 : ratio >= 3 ? 2 : ratio > 1.5 ? 1 : 0);
  buzz([20, 30, 20]);
  winEl.classList.add('hot');

  if (ratio >= TIERS[0].at) await bigWin(res);
  else {
    setMsg(`<span class="${COLOR_CLS[color]}">${n} ${COLOR_NAME[color]}</span> · you win <b>${fmt(res.returned)}</b>`);
    await countUp(winEl, res.returned, clamp(0.5 + ratio * 0.15, 0.6, 1.6));
  }

  // Collect: the chips fly into the balance.
  await wait(state.turbo ? 0.3 : 0.7);
  const target = balanceEl.getBoundingClientRect();
  const flights = [];
  felt.querySelectorAll('.stack:not(.lose)').forEach((st, k) => {
    const r = st.getBoundingClientRect();
    const v = +st.querySelector('.chip').dataset.v;
    st.style.visibility = 'hidden';
    flights.push(wait(k * 0.06).then(() => fly(r, target, v, { dur: 0.45 })).then(() => { sound.chip(2); st.remove(); }));
  });
  animateBalance(state.balance, 0.9);
  await Promise.all(flights);
  particles.sparks(target.left + target.width / 2, target.top + target.height / 2, 24, '#8dffb8', 200);
  return finish();
}

function finish() {
  state.phase = 'idle';
  shownBalance = state.balance;
  balanceEl.textContent = fmt(state.balance);
  updateHud();
  checkBroke();
}

function waitTap(el, timeout) {
  return new Promise((resolve) => {
    let done = false;
    const end = () => { if (done) return; done = true; el.removeEventListener('pointerdown', end); document.removeEventListener('keydown', key); resolve(); };
    const key = (e) => { if (['Space', 'Enter', 'Escape'].includes(e.code)) { e.preventDefault(); end(); } };
    el.addEventListener('pointerdown', end);
    document.addEventListener('keydown', key);
    if (timeout) setTimeout(end, timeout * 1000);
  });
}

async function bigWin(res) {
  const overlay = $('bigwin'), title = $('bigwin-title'), amount = $('bigwin-amount'), num = $('bigwin-num');
  const ratio = res.returned / res.staked;
  const reached = TIERS.filter((t) => ratio >= t.at);
  title.textContent = TIERS[0].name;
  title.className = 'bigwin-title';
  num.textContent = res.n;
  num.className = `bigwin-num ${res.color}`;
  amount.textContent = '0';
  overlay.hidden = false;
  sound.tierUp(1);
  shakeEl($('app'));
  buzz([30, 40, 60]);
  particles.confetti(80);
  setMsg(`${reached[reached.length - 1].name}! · <b>${fmt(res.returned)}</b>`);

  state.skip = false;
  const skipper = () => { state.skip = true; };
  overlay.addEventListener('pointerdown', skipper);
  const keySkip = (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); state.skip = true; } };
  document.addEventListener('keydown', keySkip);
  let shown = 0, lastRain = 0;
  const dur = (2.6 + reached.length * 1.4) * (state.turbo ? 0.6 : 1);
  await countUp(amount, res.returned, dur, {
    onProgress: (v) => {
      winEl.textContent = fmt(v);
      const t = now();
      if (t - lastRain > 0.12) { lastRain = t; particles.coinRain(3 + shown * 2); }
      const next = reached[shown + 1];
      if (next && v >= next.at * res.staked) {
        shown++;
        title.textContent = next.name;
        title.className = `bigwin-title ${next.cls}`;
        void title.offsetWidth;
        title.classList.add('tier');
        sound.tierUp(shown + 1);
        shakeEl($('app'));
        buzz([40, 30, 80]);
        particles.confetti(100);
      }
    },
  });
  overlay.removeEventListener('pointerdown', skipper);
  document.removeEventListener('keydown', keySkip);
  const fin = reached[reached.length - 1];
  title.textContent = fin.name;
  title.className = `bigwin-title ${fin.cls}`;
  amount.textContent = fmt(res.returned);
  winEl.textContent = fmt(res.returned);
  particles.coins(innerWidth / 2, innerHeight * 0.6, 40, 1.4);
  sound.win(3);
  state.skip = false;
  await wait(0.3);
  await waitTap(overlay, 6);
  overlay.hidden = true;
}

// ---------------------------------------------------------------- broke / refill

function checkBroke() {
  if (state.phase === 'idle' && state.balance + staked() < CHIPS[0]) $('broke').hidden = false;
}
$('btn-refill').addEventListener('click', (e) => {
  e.stopPropagation();
  $('broke').hidden = true;
  state.balance += START_BALANCE;
  sound.win(3);
  const r = balanceEl.getBoundingClientRect();
  particles.coins(r.left + r.width / 2, r.top, 40, 1.2);
  animateBalance(state.balance, 1.2);
  save();
  updateHud();
});

// Another tab (or game) changed the shared balance.
addEventListener('storage', (e) => {
  if (e.key !== SHARED_KEY || state.phase !== 'idle') return;
  const b = readJSON(SHARED_KEY).balance;
  if (!Number.isFinite(b)) return;
  state.balance = Math.max(0, b - staked());
  animateBalance(state.balance, 0.4);
  updateHud();
});

// ---------------------------------------------------------------- wiring

spinBtn.addEventListener('click', spin);
$('btn-undo').addEventListener('click', undo);
$('btn-clear').addEventListener('click', clearBets);
$('btn-double').addEventListener('click', double);
$('btn-rebet').addEventListener('click', () => { sound.unlock(); rebet(); });
$('btn-turbo').addEventListener('click', () => { state.turbo = !state.turbo; sound.click(); save(); updateHud(); });
$('btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  sound.setEnabled(state.sound);
  if (state.sound) { sound.unlock(); sound.click(); }
  save(); updateHud();
});
$('btn-info').addEventListener('click', () => { sound.click(); $('help').showModal(); });

document.addEventListener('keydown', (e) => {
  if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || $('help').open) return;
  if (!$('bigwin').hidden || !$('broke').hidden) return;
  if (document.querySelector('.games-nav-sheet:not([hidden])')) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); spin(); }
  else if (k === 'z' || e.code === 'Backspace') { e.preventDefault(); undo(); }
  else if (k === 'c') clearBets();
  else if (k === 'd') double();
  else if (k === 'r') rebet();
  else if (k === 't') $('btn-turbo').click();
  else if (/^[1-6]$/.test(k)) selectChip(+k - 1);
});

let lastFrame = now();
function frame() {
  const t = now();
  const dt = Math.min(t - lastFrame, 0.05);
  lastFrame = t;
  wheel.update(dt, t);
  stars.update(dt, t);
  particles.update(dt);
  requestAnimationFrame(frame);
}
addEventListener('resize', () => { stars.resize(); particles.resize(); });

buildTable();
buildChipRack();
renderHistory();
balanceEl.textContent = fmt(state.balance);
layout();
updateHud();
// Re-measure once the display font has loaded, and redraw the wheel numbers in it.
document.fonts?.ready.then(() => { wheel.size = 0; layout(); });
requestAnimationFrame(frame);
checkBroke();

window.__roulette = { forced, state, wheel };
