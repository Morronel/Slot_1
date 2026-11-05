// Pure game logic: reel strips, spin outcome, and win evaluation.
// No DOM here, so it can be simulated in Node to tune the math.

export const REELS = 5;
export const ROWS = 3;

// pays[n] = multiplier of the line bet for n matching symbols (3, 4 or 5).
export const SYMBOLS = {
  topaz:    { name: 'Topaz',    tier: 'low',  pays: { 3: 14, 4: 40,  5: 100 } },
  emerald:  { name: 'Emerald',  tier: 'low',  pays: { 3: 14, 4: 40,  5: 100 } },
  sapphire: { name: 'Sapphire', tier: 'low',  pays: { 3: 18, 4: 50,  5: 125 } },
  amethyst: { name: 'Amethyst', tier: 'low',  pays: { 3: 18, 4: 50,  5: 125 } },
  moon:     { name: 'Moon',     tier: 'mid',  pays: { 3: 30, 4: 100, 5: 250 } },
  planet:   { name: 'Planet',   tier: 'mid',  pays: { 3: 40, 4: 125, 5: 400 } },
  comet:    { name: 'Comet',    tier: 'high', pays: { 3: 60, 4: 200, 5: 750 } },
  star:     { name: 'Star',     tier: 'high', pays: { 3: 100, 4: 400, 5: 2000 } },
  wild:     { name: 'Wild Sun', tier: 'wild', pays: {} },
  scatter:  { name: 'Nebula',   tier: 'scatter', pays: {} },
};

// Scatter pays are multiples of the TOTAL bet, anywhere on screen.
export const SCATTER_PAYS = { 3: 2, 4: 10, 5: 50 };
export const SCATTER_SPINS = { 3: 8, 4: 12, 5: 20 };
export const FREE_SPIN_MULT = 2;

// Rows are 0 (top), 1 (middle), 2 (bottom).
export const PAYLINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2],
  [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2], [0, 1, 0, 1, 0], [2, 1, 2, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0], [2, 2, 0, 2, 2], [0, 2, 0, 2, 0],
];

// Symbol weights per reel. Wild never appears on reel 1.
const WEIGHTS = [
  { topaz: 10, emerald: 10, sapphire: 9, amethyst: 9, moon: 6, planet: 5, comet: 4, star: 3, wild: 0, scatter: 2 },
  { topaz: 10, emerald: 10, sapphire: 9, amethyst: 9, moon: 6, planet: 5, comet: 4, star: 3, wild: 2, scatter: 2 },
  { topaz: 10, emerald: 10, sapphire: 9, amethyst: 9, moon: 6, planet: 5, comet: 4, star: 3, wild: 2, scatter: 2 },
  { topaz: 10, emerald: 10, sapphire: 9, amethyst: 9, moon: 6, planet: 5, comet: 4, star: 3, wild: 2, scatter: 2 },
  { topaz: 10, emerald: 10, sapphire: 9, amethyst: 9, moon: 6, planet: 5, comet: 4, star: 3, wild: 2, scatter: 2 },
];

export const SYMBOL_IDS = Object.keys(SYMBOLS);

// Small deterministic PRNG so the strips are the same on every load.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildStrip(weights, rand) {
  const strip = [];
  for (const [id, w] of Object.entries(weights)) for (let i = 0; i < w; i++) strip.push(id);
  // Shuffle, then nudge apart scatters so one never shows twice in a column.
  for (let i = strip.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [strip[i], strip[j]] = [strip[j], strip[i]];
  }
  const n = strip.length;
  for (let pass = 0; pass < 50; pass++) {
    let clean = true;
    for (let i = 0; i < n; i++) {
      if (strip[i] !== 'scatter') continue;
      for (let d = 1; d < ROWS; d++) {
        const k = (i + d) % n;
        if (strip[k] === 'scatter') {
          const swap = (k + 3 + Math.floor(rand() * (n - 6))) % n;
          [strip[k], strip[swap]] = [strip[swap], strip[k]];
          clean = false;
        }
      }
    }
    if (clean) break;
  }
  return strip;
}

const seeded = mulberry32(0x5eed5);
export const STRIPS = WEIGHTS.map((w) => buildStrip(w, seeded));

export function defaultRandom() {
  if (globalThis.crypto?.getRandomValues) {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}

// Returns grid[reel][row] of symbol ids.
export function spinGrid(rand = defaultRandom) {
  return STRIPS.map((strip) => {
    const stop = Math.floor(rand() * strip.length);
    return Array.from({ length: ROWS }, (_, r) => strip[(stop + r) % strip.length]);
  });
}

export function randomSymbol(reel, rand = Math.random) {
  const strip = STRIPS[reel];
  return strip[Math.floor(rand() * strip.length)];
}

export function evaluate(grid, totalBet, mult = 1) {
  const lineBet = totalBet / PAYLINES.length;
  const lines = [];
  PAYLINES.forEach((rows, lineIndex) => {
    const syms = rows.map((r, reel) => grid[reel][r]);
    let base = null;
    for (const s of syms) {
      if (s === 'scatter') break;
      if (s !== 'wild') { base = s; break; }
    }
    if (!base) return;
    let count = 0;
    for (const s of syms) {
      if (s === base || s === 'wild') count++;
      else break;
    }
    const pay = SYMBOLS[base].pays[count];
    if (!pay) return;
    lines.push({
      lineIndex,
      symbol: base,
      count,
      win: pay * lineBet * mult,
      positions: rows.slice(0, count).map((r, reel) => [reel, r]),
    });
  });

  const scatterPositions = [];
  grid.forEach((col, reel) => col.forEach((s, row) => { if (s === 'scatter') scatterPositions.push([reel, row]); }));
  const sc = scatterPositions.length;
  const scatter = {
    count: sc,
    positions: scatterPositions,
    win: (SCATTER_PAYS[Math.min(sc, 5)] || 0) * totalBet * mult,
    freeSpins: SCATTER_SPINS[Math.min(sc, 5)] || 0,
  };

  const total = lines.reduce((a, l) => a + l.win, 0) + scatter.win;
  return { lines, scatter, total };
}
