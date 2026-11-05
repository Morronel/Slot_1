import { Shoe, handValue, isBlackjack, canSplit, canDouble, dealerShouldHit, settle, cardValue } from './engine.js';
import { TableSound } from './sfx.js';
import { Starfield, Particles } from '../js/fx.js';

// Balance is shared with the slot (and every other game) through its storage key.
const SHARED_KEY = 'starfall-spins.v1';
const LOCAL_KEY = 'starfall-21.v1';
const START_BALANCE = 10000;
const CHIPS = [10, 25, 100, 500, 1000];
const MIN_BET = CHIPS[0];
const MAX_BET = 5000;
const SUIT = { S: '♠︎', H: '♥︎', D: '♦︎', C: '♣︎' };

const $ = (id) => document.getElementById(id);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const now = () => performance.now() / 1000;
const easeOutCubic = (u) => 1 - Math.pow(1 - u, 3);
const buzz = (p) => { try { navigator.vibrate?.(p); } catch { /* not supported */ } };
const center = (r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

// ---------------------------------------------------------------- storage

const readJSON = (key) => { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } };
// Read, merge, write: only touch our fields so the slot's own settings survive.
const writeShared = (patch) => { try { localStorage.setItem(SHARED_KEY, JSON.stringify({ ...readJSON(SHARED_KEY), ...patch })); } catch { /* private mode */ } };

const shared = readJSON(SHARED_KEY);
const local = readJSON(LOCAL_KEY);

const state = {
  balance: Number.isFinite(shared.balance) ? shared.balance : START_BALANCE,
  sound: shared.sound ?? true,
  lastBet: Number.isFinite(local.lastBet) ? local.lastBet : 0,
  pending: 0,         // chips on the spot while betting, not yet taken from the balance
  phase: 'bet',       // bet | deal | player | dealer | settle
  busy: false,
  hands: [],
  active: 0,
  dealer: null,
  streak: 0,
  speed: 1,           // animation time multiplier (tests set it low)
};
const saveBalance = () => writeShared({ balance: state.balance });
const saveLocal = () => { try { localStorage.setItem(LOCAL_KEY, JSON.stringify({ lastBet: state.lastBet })); } catch { /* private mode */ } };
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000 * state.speed));

const sound = new TableSound();
sound.enabled = state.sound;
const shoe = new Shoe();

// Another tab (the slot, say) changed the balance: follow it while no chips are in play.
addEventListener('storage', (e) => {
  if (e.key !== SHARED_KEY || state.phase !== 'bet') return;
  const s = readJSON(SHARED_KEY);
  if (Number.isFinite(s.balance)) {
    state.balance = s.balance;
    if (state.pending > state.balance) clearBet(true);
    updateHud();
  }
});

// ---------------------------------------------------------------- fx

const stars = new Starfield($('stars'));
const particles = new Particles($('fx'));
let lastCoinSound = 0;
particles.onCoinBounce = () => { const t = now(); if (t - lastCoinSound > 0.05) { lastCoinSound = t; sound.coin(); } };
let prevT = now();
function frame() {
  const t = now(), dt = Math.min(0.05, t - prevT);
  prevT = t;
  stars.update(dt, t);
  particles.update(dt);
  requestAnimationFrame(frame);
}

function floater(text, x, y, cls = '') {
  const el = document.createElement('div');
  el.className = 'floater ' + cls;
  el.textContent = text;
  el.style.left = x + 'px'; el.style.top = y + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1400);
}

function banner(title, sub = '', tone = '') {
  const el = $('banner');
  $('banner-title').textContent = title;
  $('banner-sub').textContent = sub;
  el.className = 'banner ' + tone;
  void el.offsetWidth;
  el.classList.add('show');
}

function pulse(el, cls, ms = 600) {
  el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
  setTimeout(() => el.classList.remove(cls), ms);
}

// ---------------------------------------------------------------- layout

const table = $('table'), handsEl = $('hands');
let CW = 84;
function applyCW(cw) {
  CW = Math.floor(clamp(cw, 40, 104));
  const root = document.documentElement.style;
  root.setProperty('--cw', CW + 'px');
  root.setProperty('--chip', Math.round(clamp(CW * 0.56, 30, 46)) + 'px');
}

function layout() {
  const w = innerWidth, h = innerHeight;
  const sideways = h <= 540 && w > h;
  const narrow = w <= 520;
  const tw = sideways ? w - 24 - clamp(w * 0.32, 200, 270) - 14 : Math.min(w - (narrow ? 16 : 24), 680);
  document.documentElement.style.setProperty('--tw', Math.floor(tw) + 'px');
  const n = Math.max(1, state.hands.length);
  const byWidth = n === 1 ? (tw - 24) / 4.2 : (tw - 24) / (n * 1.85 + 0.3);
  // The table grows by about two card heights per pixel of card width, so measure
  // how much room is left and solve for the card width (twice, for the chip clamp).
  const app = $('bj-app');
  const pad = parseFloat(getComputedStyle(app).paddingTop) + parseFloat(getComputedStyle(app).paddingBottom);
  for (let k = 0; k < 2; k++) {
    const tableH = table.offsetHeight;
    const others = sideways ? 0 : app.scrollHeight - pad - tableH;
    const avail = h - pad - others - (sideways ? 0 : 4);
    applyCW(Math.min(byWidth, CW + (avail - tableH) / 2.8));
  }
  if (state.dealer) fitHand(state.dealer);
  state.hands.forEach(fitHand);
  if (state.betHand) fitHand(state.betHand);
  stars.resize();
  particles.resize();
}

// Spread a hand's cards so it never grows wider than its share of the table.
function fitHand(hand) {
  const k = hand.els.length;
  const n = hand.dealer ? 1 : Math.max(1, state.hands.length);
  const tw = table.clientWidth - 24;
  const room = hand.dealer ? tw - CW * 1.8 : tw / n - 12;
  const fan = k > 1 ? Math.min(CW * 0.36, Math.max(CW * 0.14, (room - CW) / (k - 1))) : 0;
  hand.cardsEl.style.width = (CW + fan * Math.max(0, k - 1)) + 'px';
  hand.els.forEach((el, i) => { el.style.left = (fan * i) + 'px'; el.style.zIndex = i + 1; });
}

// ---------------------------------------------------------------- cards & hands

function makeCardEl(c) {
  const el = document.createElement('div');
  el.className = 'pc down';
  const red = c.s === 'H' || c.s === 'D';
  const s = SUIT[c.s];
  const mid = c.r === 'A' ? `<div class="pip ace">${s}</div>`
    : 'JQK'.includes(c.r) ? `<div class="face" data-s="${s}">${c.r}</div>`
    : `<div class="pip">${s}</div>`;
  el.innerHTML = `<div class="pc-in"><div class="pc-front${red ? ' red' : ''}">
    <div class="corner tl">${c.r}<small>${s}</small></div>${mid}<div class="corner br">${c.r}<small>${s}</small></div>
    <div class="shine"></div></div><div class="pc-back"></div></div>`;
  el.setAttribute('aria-label', `${c.r} of ${{ S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' }[c.s]}`);
  return el;
}

function makeHand({ dealer = false, bet = 0 } = {}) {
  let el, cardsEl, totalEl, stampEl, spotEl = null;
  if (dealer) {
    el = $('dealer');
    el.className = 'hand dealer';
    cardsEl = el.querySelector('.cards'); cardsEl.innerHTML = '';
    totalEl = el.querySelector('.total'); stampEl = el.querySelector('.stamp');
  } else {
    el = document.createElement('div');
    el.className = 'hand';
    el.innerHTML = '<div class="cards"></div><div class="total" hidden></div><div class="stamp" hidden></div><div class="spot"><div class="stack"></div><span class="amt"></span></div>';
    cardsEl = el.querySelector('.cards'); totalEl = el.querySelector('.total');
    stampEl = el.querySelector('.stamp'); spotEl = el.querySelector('.spot');
  }
  totalEl.hidden = true; totalEl.className = 'total';
  stampEl.hidden = true;
  return { dealer, el, cardsEl, totalEl, stampEl, spotEl, cards: [], els: [], bet, hole: false, done: false, busted: false, fromSplit: false, splitAces: false };
}

function visibleValue(hand) {
  const cards = hand.hole ? hand.cards.slice(0, 1) : hand.cards;
  return handValue(cards);
}

function showTotal(hand) {
  if (!hand.cards.length) { hand.totalEl.hidden = true; return; }
  const { total, soft } = visibleValue(hand);
  const natural = !hand.hole && isBlackjack(hand.cards) && !hand.fromSplit;
  const text = natural ? 'BJ ★' : soft && total < 21 ? `${total - 10} / ${total}` : String(total);
  const el = hand.totalEl;
  el.hidden = false;
  if (el.textContent !== text) {
    el.textContent = text;
    pulse(el, 'pop', 340);
    sound.total(total);
  }
  el.classList.toggle('bj', natural);
  el.classList.toggle('t21', !natural && total === 21);
  el.classList.toggle('over', total > 21);
}

// Fly a card from the shoe into a hand.
async function dealTo(hand, { faceUp = true, hole = false } = {}) {
  const c = shoe.draw();
  hand.cards.push(c);
  if (hole) hand.hole = true;
  const el = makeCardEl(c);
  hand.els.push(el);
  hand.cardsEl.appendChild(el);
  fitHand(hand);
  const to = center(el.getBoundingClientRect());
  const from = center($('shoe').getBoundingClientRect());
  const rot = (Math.random() * 5 - 2.5).toFixed(1);
  sound.cardSlide();
  const anim = el.animate([
    { transform: `translate(${from.x - to.x}px, ${from.y - to.y}px) rotate(-70deg) scale(0.55)` },
    { transform: `translate(0, 0) rotate(${rot}deg) scale(1.06)`, offset: 0.85 },
    { transform: `translate(0, 0) rotate(${rot}deg) scale(1)` },
  ], { duration: 420 * state.speed, easing: 'cubic-bezier(.2,.8,.3,1)' });
  el.style.transform = `rotate(${rot}deg)`;
  if (faceUp) setTimeout(() => { el.classList.remove('down'); sound.cardFlip(); }, 170 * state.speed);
  await anim.finished.catch(() => {});
  sound.cardLand();
  showTotal(hand);
  return el;
}

async function revealHole(hand) {
  const el = hand.els[1];
  hand.hole = false;
  el.classList.add('slow');
  el.classList.remove('down');
  sound.cardFlip();
  el.animate([{ transform: el.style.transform + ' translateY(0) scale(1)' }, { transform: el.style.transform + ' translateY(-14px) scale(1.12)' }, { transform: el.style.transform + ' scale(1)' }],
    { duration: 600 * state.speed, easing: 'ease-out' });
  await wait(0.5);
  showTotal(hand);
}

// ---------------------------------------------------------------- chips

function chipHTML(v) {
  return `<div class="chip" data-v="${v}"><span>${v >= 1000 ? v / 1000 + 'K' : v}</span></div>`;
}

function breakdown(amount) {
  const out = [];
  let left = Math.round(amount);
  for (let i = CHIPS.length - 1; i >= 0 && out.length < 14; i--) {
    while (left >= CHIPS[i] && out.length < 14) { out.push(CHIPS[i]); left -= CHIPS[i]; }
  }
  if (left > 0 && out.length < 14) out.push(CHIPS[0]); // odd remainders from 3:2 payouts
  return out.reverse(); // biggest on top
}

function renderStack(spot, amount) {
  if (!spot) return;
  const stack = spot.querySelector('.stack');
  const chips = amount > 0 ? breakdown(amount) : [];
  stack.innerHTML = chips.map((v, i) => chipHTML(v).replace('class="chip"', `class="chip" style="transform: translateY(${-i * 3}px)"`)).join('');
  spot.querySelector('.amt').textContent = amount > 0 ? fmt(amount) : '';
  spot.classList.toggle('filled', amount > 0);
  spot.classList.toggle('empty', amount <= 0 && state.phase === 'bet');
}

// Animate chips flying between two screen points.
function flyChips(from, to, values, { dur = 0.38, stagger = 0.05, onLand } = {}) {
  const chipPx = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--chip')) || 44;
  const promises = values.map((v, i) => new Promise((resolve) => {
    const el = document.createElement('div');
    el.className = 'fly';
    el.innerHTML = chipHTML(v);
    document.body.appendChild(el);
    const sx = from.x - chipPx / 2 + (Math.random() - 0.5) * 10, sy = from.y - chipPx / 2;
    const ex = to.x - chipPx / 2, ey = to.y - chipPx / 2 - i * 2;
    const lift = Math.min(120, Math.abs(ex - sx) * 0.3 + 40);
    const a = el.animate([
      { transform: `translate(${sx}px, ${sy}px) scale(0.9) rotate(0deg)` },
      { transform: `translate(${(sx + ex) / 2}px, ${Math.min(sy, ey) - lift}px) scale(1.15) rotate(180deg)`, offset: 0.5 },
      { transform: `translate(${ex}px, ${ey}px) scale(1) rotate(360deg)` },
    ], { duration: dur * 1000 * state.speed, delay: i * stagger * 1000 * state.speed, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
    a.finished.catch(() => {}).then(() => { el.remove(); onLand?.(v, i); resolve(); });
  }));
  return Promise.all(promises);
}

// ---------------------------------------------------------------- HUD

const balanceEl = $('balance'), betEl = $('bet'), winEl = $('win'), msgEl = $('msg');
let shownBalance = state.balance - state.pending;
let balanceAnim = 0;
function animateBalance(to, dur = 0.5) {
  const from = shownBalance, id = ++balanceAnim, t0 = now();
  balanceEl.classList.toggle('up', to > from);
  const step = () => {
    if (id !== balanceAnim) return;
    const u = clamp((now() - t0) / (dur * state.speed || 0.001), 0, 1);
    shownBalance = from + (to - from) * easeOutCubic(u);
    balanceEl.textContent = fmt(shownBalance);
    if (u < 1) requestAnimationFrame(step); else balanceEl.classList.remove('up');
  };
  step();
}

function setMsg(html) {
  if (msgEl.innerHTML === html) return;
  msgEl.innerHTML = html;
  pulse(msgEl, 'bump', 360);
}

const totalStake = () => state.hands.reduce((s, h) => s + h.bet, 0);

function updateHud() {
  const inBet = state.phase === 'bet';
  const target = inBet ? state.balance - state.pending : state.balance;
  if (Math.round(target) !== Math.round(shownBalance)) animateBalance(target, 0.35);
  betEl.textContent = fmt(inBet ? state.pending : totalStake());
  $('bet-panel').hidden = !inBet;
  $('play-panel').hidden = inBet;
  const free = state.balance - state.pending;
  document.querySelectorAll('#rack .chip').forEach((b) => {
    const v = Number(b.dataset.v);
    b.disabled = !inBet || v > free || state.pending + v > MAX_BET;
  });
  $('btn-clear').disabled = !inBet || state.pending === 0;
  const rebet = $('btn-rebet');
  if (state.pending > 0) {
    rebet.querySelector('span').textContent = '×2';
    rebet.disabled = !inBet || state.pending * 2 > Math.min(MAX_BET, state.balance);
  } else {
    rebet.querySelector('span').textContent = 'Rebet';
    rebet.disabled = !inBet || !state.lastBet || state.lastBet > state.balance;
  }
  $('btn-deal').disabled = !inBet || state.busy || (state.pending === 0 && !(state.lastBet && state.lastBet <= state.balance));
  const h = state.hands[state.active];
  const canAct = state.phase === 'player' && !state.busy && h && !h.done;
  $('btn-hit').disabled = !canAct;
  $('btn-stand').disabled = !canAct;
  $('btn-double').disabled = !canAct || !canDouble(h) || state.balance < h.bet;
  $('btn-split').disabled = !canAct || !canSplit(h, state.hands.length) || state.balance < h.bet;
  const multi = state.hands.length > 1;
  handsEl.classList.toggle('multi', multi && state.phase === 'player');
  state.hands.forEach((hh, i) => hh.el.classList.toggle('active', i === state.active && state.phase === 'player'));
  $('btn-sound').setAttribute('aria-pressed', String(state.sound));
  const st = $('streak');
  st.hidden = state.streak < 2;
  st.textContent = `★ ${state.streak} IN A ROW`;
}

// ---------------------------------------------------------------- betting

function newBetSpot() {
  handsEl.innerHTML = '';
  handsEl.className = 'zone player-zone';
  const h = makeHand();
  h.spotEl.classList.add('hint', 'empty');
  handsEl.appendChild(h.el);
  state.betHand = h;
  fitHand(h);
  renderStack(h.spotEl, state.pending);
}

const spotCenter = () => center(state.betHand.spotEl.getBoundingClientRect());

function addChip(v, fromEl) {
  sound.unlock();
  if (state.phase !== 'bet' || state.busy) return;
  if (state.pending + v > MAX_BET || state.pending + v > state.balance) {
    sound.denied();
    setMsg(state.pending + v > MAX_BET ? `Table limit is <b>${fmt(MAX_BET)}</b>` : 'Not enough balance for that chip');
    return;
  }
  clearLeftovers();
  state.pending += v;
  const amount = state.pending;
  const spot = state.betHand.spotEl;
  updateHud();
  setMsg(`Bet <b>${fmt(amount)}</b>, press Deal`);
  flyChips(center(fromEl.getBoundingClientRect()), spotCenter(), [v], {
    dur: 0.32,
    onLand: () => {
      if (state.betHand?.spotEl === spot) renderStack(spot, state.pending);
      sound.chip(breakdown(state.pending).length);
      buzz(8);
    },
  });
}

async function setBet(amount) {
  sound.unlock();
  if (state.phase !== 'bet' || state.busy) return;
  amount = Math.min(amount, MAX_BET, state.balance);
  amount = Math.floor(amount / MIN_BET) * MIN_BET;
  if (amount <= state.pending || amount < MIN_BET) { sound.denied(); return; }
  clearLeftovers();
  const add = amount - state.pending;
  state.pending = amount;
  updateHud();
  setMsg(`Bet <b>${fmt(amount)}</b>, press Deal`);
  const from = center(balanceEl.getBoundingClientRect());
  const spot = state.betHand.spotEl;
  await flyChips(from, spotCenter(), breakdown(add).slice(0, 6), {
    dur: 0.36, stagger: 0.06,
    onLand: (v, i) => { sound.chip(i + 2); },
  });
  if (state.betHand?.spotEl === spot) renderStack(spot, state.pending);
}

function clearBet(silent = false) {
  if (state.phase !== 'bet' || !state.pending) return;
  const chips = breakdown(state.pending).slice(0, 6);
  state.pending = 0;
  renderStack(state.betHand.spotEl, 0);
  updateHud();
  if (silent) return;
  sound.chipsRake(4);
  setMsg('Place your bet');
  flyChips(spotCenter(), center(balanceEl.getBoundingClientRect()), chips, { dur: 0.35, stagger: 0.03 });
}

// ---------------------------------------------------------------- round flow

let leftovers = null;     // cards from the last round still on the table
let leftoverTimer = 0;

async function deal() {
  sound.unlock();
  if (state.phase !== 'bet' || state.busy) return;
  if (state.pending === 0) {
    if (state.lastBet && state.lastBet <= state.balance) await setBet(state.lastBet);
    else { sound.denied(); setMsg('Tap a chip to place a bet'); return; }
  }
  if (state.pending < MIN_BET) return;
  clearLeftovers();
  state.busy = true;
  sound.click();

  const stake = state.pending;
  state.balance -= stake;
  state.pending = 0;
  state.lastBet = stake;
  saveBalance(); saveLocal();

  const hand = state.betHand;
  hand.bet = stake;
  hand.spotEl.classList.remove('hint', 'empty');
  renderStack(hand.spotEl, stake);
  state.betHand = null;
  state.hands = [hand];
  state.active = 0;
  state.dealer = makeHand({ dealer: true });
  state.phase = 'deal';
  $('win').textContent = '0';
  winEl.classList.remove('hot');
  updateHud();

  if (shoe.needsShuffle) await shuffleShoe();
  setMsg('Good luck!');

  const d = state.dealer;
  await dealTo(hand); await wait(0.08);
  await dealTo(d); await wait(0.08);
  await dealTo(hand); await wait(0.08);
  await dealTo(d, { faceUp: false, hole: true });

  const up = d.cards[0];
  const playerBJ = isBlackjack(hand.cards);
  if (cardValue(up) >= 10) {
    // Dealer peeks under the hole card.
    setMsg('Dealer checks for blackjack…');
    await wait(0.25);
    d.els[1].classList.add('peek');
    sound.whoosh();
    await wait(0.55);
    d.els[1].classList.remove('peek');
    await wait(0.25);
    if (isBlackjack(d.cards)) {
      await revealHole(d);
      sound.denied();
      pulse(table, 'shake', 500);
      await finishRound();
      return;
    }
    if (!playerBJ) setMsg('No blackjack. Your move');
  }
  if (playerBJ) {
    hand.done = true;
    setMsg('<b>Blackjack!</b>');
    await revealHole(d);
    await finishRound();
    return;
  }
  state.phase = 'player';
  state.busy = false;
  if (cardValue(up) < 10) setMsg(hintFor(hand));
  updateHud();
}

function hintFor(hand) {
  const { total, soft } = handValue(hand.cards);
  return soft ? `Soft <b>${total}</b>. Hit or stand?` : `You have <b>${total}</b>. Hit or stand?`;
}

async function shuffleShoe() {
  setMsg('Shuffling a fresh shoe…');
  sound.shuffle();
  const s = $('shoe');
  s.animate([{ transform: 'rotate(-12deg)' }, { transform: 'rotate(-4deg) translateY(-6px)' }, { transform: 'rotate(-20deg)' }, { transform: 'rotate(-12deg)' }],
    { duration: 800 * state.speed, easing: 'ease-in-out' });
  $('discard').classList.remove('has');
  shoe.reshuffle();
  await wait(0.9);
}

async function act(kind) {
  sound.unlock();
  if (state.phase !== 'player' || state.busy) return;
  const h = state.hands[state.active];
  if (!h || h.done) return;
  if (kind === 'double' && (!canDouble(h) || state.balance < h.bet)) { sound.denied(); return; }
  if (kind === 'split' && (!canSplit(h, state.hands.length) || state.balance < h.bet)) { sound.denied(); return; }
  state.busy = true;
  updateHud();
  if (kind === 'hit') {
    await dealTo(h);
    await afterCard(h);
  } else if (kind === 'stand') {
    sound.click();
    h.done = true;
    pulse(h.totalEl, 'pop', 340);
  } else if (kind === 'double') {
    const add = h.bet;
    state.balance -= add;
    saveBalance();
    h.bet += add;
    h.doubled = true;
    updateHud();
    sound.bet(5, true);
    await flyChips(center(balanceEl.getBoundingClientRect()), center(h.spotEl.getBoundingClientRect()), breakdown(add).slice(0, 4), {
      dur: 0.32, stagger: 0.05, onLand: (v, i) => sound.chip(6 + i),
    });
    renderStack(h.spotEl, h.bet);
    floater('×2', center(h.spotEl.getBoundingClientRect()).x, center(h.spotEl.getBoundingClientRect()).y - 30);
    await dealTo(h);
    await afterCard(h);
    h.done = true;
  } else if (kind === 'split') {
    await splitHand(h);
  }
  await advance();
}

// After a card lands on a player hand: bust, 21, or carry on.
async function afterCard(h) {
  const { total } = handValue(h.cards);
  if (total > 21) {
    h.done = true; h.busted = true;
    h.el.classList.add('busted', 'lost');
    stamp(h, 'BUST', 'bust');
    sound.bust();
    pulse(table, 'shake', 500);
    buzz([30, 40, 60]);
    setMsg('Bust!');
    await wait(0.6);
  } else if (total === 21) {
    h.done = true;
    const r = center(h.cardsEl.getBoundingClientRect());
    particles.sparks(r.x, r.y, 30, '#8dffb8', 380);
    sound.win(0);
    setMsg('<b>21!</b>');
    await wait(0.35);
  } else if (!h.done) {
    setMsg(hintFor(h));
  }
}

async function splitHand(h) {
  const add = h.bet;
  state.balance -= add;
  saveBalance();
  const nh = makeHand({ bet: add });
  nh.fromSplit = h.fromSplit = true;
  nh.splitAces = h.splitAces = h.cards[0].r === 'A';
  const idx = state.hands.indexOf(h);
  state.hands.splice(idx + 1, 0, nh);
  h.el.after(nh.el);
  // Move the second card across with a FLIP so it slides instead of jumping.
  const cardEl = h.els.pop();
  const card = h.cards.pop();
  const before = cardEl.getBoundingClientRect();
  nh.cards.push(card); nh.els.push(cardEl);
  nh.cardsEl.appendChild(cardEl);
  layout();
  renderStack(nh.spotEl, nh.bet);
  const after = cardEl.getBoundingClientRect();
  cardEl.animate([{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` }, { transform: cardEl.style.transform }],
    { duration: 380 * state.speed, easing: 'cubic-bezier(.2,1.2,.4,1)' });
  sound.whoosh();
  showTotal(h); showTotal(nh);
  updateHud();
  await flyChips(center(balanceEl.getBoundingClientRect()), center(nh.spotEl.getBoundingClientRect()), breakdown(add).slice(0, 4), {
    dur: 0.32, stagger: 0.05, onLand: (v, i) => sound.chip(3 + i),
  });
  setMsg('Split! Playing hand 1');
  await wait(0.15);
  await dealTo(h);
  if (h.splitAces) h.done = true;
  else await afterCard(h);
}

// Move to the next hand that still needs playing, or to the dealer.
async function advance() {
  let i = state.active;
  while (i < state.hands.length && state.hands[i].done) {
    i++;
    if (i < state.hands.length) {
      const h = state.hands[i];
      state.active = i;
      updateHud();
      if (h.cards.length < 2) {
        if (state.hands.length > 1) setMsg(`Playing hand ${i + 1}`);
        await wait(0.2);
        await dealTo(h);
        if (h.splitAces) h.done = true;
        else await afterCard(h);
      }
    }
  }
  if (i >= state.hands.length) {
    await dealerTurn();
    return;
  }
  state.active = i;
  state.busy = false;
  updateHud();
}

async function dealerTurn() {
  state.phase = 'dealer';
  state.busy = true;
  updateHud();
  const d = state.dealer;
  await wait(0.25);
  await revealHole(d);
  const live = state.hands.some((h) => !h.busted && !(isBlackjack(h.cards) && !h.fromSplit));
  if (live) {
    while (dealerShouldHit(d.cards)) {
      setMsg(`Dealer has <b>${handValue(d.cards).total}</b>, draws…`);
      await wait(0.45);
      await dealTo(d);
    }
    const dt = handValue(d.cards).total;
    if (dt > 21) {
      d.el.classList.add('busted', 'lost');
      stamp(d, 'BUST', 'bust');
      sound.dealerBust();
      const r = center(d.cardsEl.getBoundingClientRect());
      particles.sparks(r.x, r.y, 60, '#ffd84a', 520);
      particles.sparks(r.x, r.y, 30, '#ff4dd8', 400);
      setMsg('Dealer busts!');
      await wait(0.6);
    } else {
      setMsg(`Dealer stands on <b>${dt}</b>`);
      await wait(0.45);
    }
  }
  await finishRound();
}

function stamp(hand, text, cls) {
  const el = hand.stampEl;
  el.textContent = text;
  el.className = 'stamp ' + cls;
  el.hidden = false;
}

async function finishRound() {
  state.phase = 'settle';
  state.busy = true;
  if (state.dealer.hole) await revealHole(state.dealer);
  handsEl.classList.remove('multi');
  handsEl.classList.add('settled');
  updateHud();

  const d = state.dealer;
  const dealerPt = center(d.cardsEl.getBoundingClientRect());
  const balPt = center(balanceEl.getBoundingClientRect());
  let stake = 0, paid = 0, wins = 0, bj = false;
  const results = state.hands.map((h) => ({ h, ...settle(h, d.cards) }));

  for (const { h, result, payout } of results) {
    stake += h.bet;
    paid += payout;
    const spot = center(h.spotEl.getBoundingClientRect());
    if (!h.busted) {
      const label = { win: 'WIN', blackjack: 'BLACKJACK', push: 'PUSH', lose: 'LOSE' }[result];
      stamp(h, label, result);
    }
    if (result === 'win' || result === 'blackjack') {
      wins++;
      if (result === 'blackjack') bj = true;
      h.el.classList.add(result === 'blackjack' ? 'bj' : 'won');
      sound.win(result === 'blackjack' ? 2 : 1);
      buzz(20);
      const profit = payout - h.bet;
      floater('+' + fmt(profit), spot.x, spot.y - 40, 'green');
      // Dealer pays out onto the spot.
      await flyChips(dealerPt, spot, breakdown(profit).slice(0, 6), { dur: 0.4, stagger: 0.06, onLand: (v, i) => sound.chip(4 + i) });
      renderStack(h.spotEl, payout);
    } else if (result === 'push') {
      sound.push();
    } else {
      h.el.classList.add('lost');
      if (!h.busted) sound.lose();
    }
    await wait(0.15);
  }

  const profit = paid - stake;
  if (bj) {
    banner('BLACKJACK!', '+' + fmt(profit));
    sound.blackjack();
    particles.confetti(90);
    particles.coinRain(40);
    pulse(table, 'flash', 900);
    stars.warpTarget = 0.6;
    setTimeout(() => { stars.warpTarget = 0; }, 700);
    buzz([40, 60, 40, 60, 120]);
  } else if (wins >= 2 && wins === results.length) {
    banner('CLEAN SWEEP', '+' + fmt(profit), 'pink');
    sound.fanfare(2);
    particles.confetti(70);
  } else if (profit >= 2000) {
    banner('HUGE WIN', '+' + fmt(profit), 'cyan');
    sound.fanfare(2);
    particles.coinRain(50);
  }

  // Collect: winners and pushes go to the balance, losers go to the dealer.
  await wait(0.25);
  const flights = [];
  for (const { h, payout } of results) {
    const spot = center(h.spotEl.getBoundingClientRect());
    const chips = breakdown(payout > 0 ? payout : h.bet).slice(0, 6);
    renderStack(h.spotEl, 0);
    if (payout > 0) flights.push(flyChips(spot, balPt, chips, { dur: 0.5, stagger: 0.05 }));
    else flights.push(flyChips(spot, dealerPt, chips, { dur: 0.45, stagger: 0.03 }));
  }
  if (paid > 0) sound.chipsRake(8); else sound.chipsRake(3);
  await Promise.all(flights);

  state.balance += paid;
  saveBalance();
  if (paid > 0) {
    const r = balanceEl.getBoundingClientRect();
    particles.coins(r.left + r.width / 2, r.top, Math.min(40, 6 + Math.round(profit / 25)), 0.9);
  }
  animateBalance(state.balance, paid > stake ? 0.9 : 0.4);
  if (profit > 0) {
    winEl.textContent = fmt(profit);
    winEl.classList.add('hot');
  }

  if (profit > 0) state.streak++;
  else if (profit < 0) state.streak = 0;
  if (profit > 0) setMsg(`${bj ? 'Blackjack! ' : 'You win '}<b>+${fmt(profit)}</b>`);
  else if (profit === 0) setMsg(stake ? 'Push. Your bet comes back' : '');
  else if (isBlackjack(d.cards)) setMsg('Dealer has blackjack');
  else setMsg(results.every((r) => r.result === 'bust') ? 'Bust. Dealer takes it' : 'Dealer wins this one');

  // Back to betting. The old cards stay until the next bet or a short timeout.
  leftovers = { dealer: state.dealer, hands: state.hands };
  state.hands = [];
  state.dealer = null;
  state.betHand = null;
  state.phase = 'bet';
  state.busy = false;
  updateHud();
  clearTimeout(leftoverTimer);
  leftoverTimer = setTimeout(clearLeftovers, 2600 * state.speed);
  if (state.balance < MIN_BET) setTimeout(() => { $('broke').hidden = false; }, 900 * state.speed);
}

// Sweep the finished round's cards into the discard pile and lay out a fresh bet spot.
function clearLeftovers() {
  clearTimeout(leftoverTimer);
  if (!leftovers) return;
  const { dealer, hands } = leftovers;
  leftovers = null;
  const disc = center($('discard').getBoundingClientRect());
  const all = [...dealer.els, ...hands.flatMap((h) => h.els)];
  const ch = CW * 1.4;
  // Lift every card out to a fixed layer first so the table can reset under them.
  const lifted = all.map((el) => {
    const c = center(el.getBoundingClientRect());
    el.querySelector('.shine')?.remove();
    el.style.position = 'fixed';
    el.style.left = (c.x - CW / 2) + 'px';
    el.style.top = (c.y - ch / 2) + 'px';
    el.style.zIndex = 20;
    return { el, c };
  });
  lifted.forEach(({ el }) => document.body.appendChild(el));
  dealer.cardsEl.innerHTML = '';
  dealer.totalEl.hidden = true;
  dealer.stampEl.hidden = true;
  dealer.el.className = 'hand dealer';
  newBetSpot();
  lifted.forEach(({ el, c }, k) => {
    el.classList.add('down');
    const a = el.animate([
      { transform: el.style.transform || 'none', opacity: 1 },
      { transform: `translate(${disc.x - c.x}px, ${disc.y - c.y}px) rotate(${80 + Math.random() * 20}deg) scale(0.6)`, opacity: 0.5 },
    ], { duration: 380 * state.speed, delay: k * 25 * state.speed, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'forwards' });
    a.finished.catch(() => {}).then(() => { el.remove(); $('discard').classList.add('has'); });
  });
  if (all.length) sound.cardSlide();
}

// ---------------------------------------------------------------- input

const rack = $('rack');
rack.innerHTML = CHIPS.map((v) => chipHTML(v).replace('<div', '<button').replace(/<\/div>$/, '</button>').replace('class="chip"', `class="chip" aria-label="Add ${v} chip"`)).join('');
rack.querySelectorAll('.chip').forEach((b) => b.addEventListener('click', () => addChip(Number(b.dataset.v), b)));
$('btn-clear').addEventListener('click', () => { sound.unlock(); clearBet(); });
$('btn-rebet').addEventListener('click', () => {
  if (state.pending > 0) setBet(state.pending * 2);
  else if (state.lastBet) setBet(state.lastBet);
});
$('btn-deal').addEventListener('click', deal);
$('btn-hit').addEventListener('click', () => act('hit'));
$('btn-stand').addEventListener('click', () => act('stand'));
$('btn-double').addEventListener('click', () => act('double'));
$('btn-split').addEventListener('click', () => act('split'));
$('btn-sound').addEventListener('click', () => {
  state.sound = !state.sound;
  sound.unlock();
  sound.setEnabled(state.sound);
  sound.click();
  writeShared({ sound: state.sound });
  updateHud();
});
const rules = $('rules');
$('btn-info').addEventListener('click', () => { sound.unlock(); sound.click(); rules.showModal(); });
rules.addEventListener('click', (e) => { if (e.target === rules) rules.close(); });

$('btn-refill').addEventListener('click', (e) => {
  e.stopPropagation();
  sound.unlock();
  $('broke').hidden = true;
  state.balance += START_BALANCE;
  saveBalance();
  sound.win(3);
  const r = balanceEl.getBoundingClientRect();
  particles.coins(r.left + r.width / 2, r.top, 40, 1.2);
  animateBalance(state.balance - state.pending, 1.2);
  updateHud();
});

document.addEventListener('keydown', (e) => {
  if (rules.open || !$('broke').hidden || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.code;
  if (k === 'Space' || k === 'Enter') { e.preventDefault(); if (state.phase === 'bet') deal(); }
  else if (k === 'KeyH') act('hit');
  else if (k === 'KeyS') act('stand');
  else if (k === 'KeyD') act('double');
  else if (k === 'KeyP') act('split');
  else if (k === 'Backspace' || k === 'KeyC') clearBet();
  else if (k === 'KeyR') $('btn-rebet').click();
  else if (/^Digit[1-5]$/.test(k)) { const i = Number(k.slice(5)) - 1; addChip(CHIPS[i], rack.children[i]); }
});
document.addEventListener('pointerdown', () => sound.unlock(), { once: true });

let resizeTimer;
addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(layout, 80); });

// ---------------------------------------------------------------- boot

balanceEl.textContent = fmt(state.balance);
shownBalance = state.balance;
newBetSpot();
layout();
updateHud();
requestAnimationFrame(frame);
if (state.balance < MIN_BET) $('broke').hidden = false;

// Test hook: __bj.force('AS', 'KH', ...) stacks the next cards dealt, in deal order
// (player, dealer up, player, dealer hole, then hits).
window.__bj = {
  state, shoe, deal, act, addChip, setBet,
  force: (...codes) => { shoe.forced.push(...codes.map((c) => ({ r: c.slice(0, -1), s: c.slice(-1) }))); },
};
