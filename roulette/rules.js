// European single-zero roulette rules. Pure logic, runs in Node too.

// Pocket order around the wheel, clockwise from zero.
export const WHEEL = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
export const POCKETS = WHEEL.length;
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export const colorOf = (n) => (n === 0 ? 'green' : RED.has(n) ? 'red' : 'black');

// Every bet spot on the table: which numbers it covers and what it pays (to 1).
export const SPOTS = {};
for (let n = 0; n <= 36; n++) SPOTS[`n${n}`] = { label: String(n), pays: 35, covers: (x) => x === n };
for (let c = 1; c <= 3; c++) SPOTS[`col${c}`] = { label: '2 to 1', pays: 2, covers: (x) => x > 0 && (x - 1) % 3 === c - 1 };
for (let d = 1; d <= 3; d++) SPOTS[`doz${d}`] = { label: ['1st 12', '2nd 12', '3rd 12'][d - 1], pays: 2, covers: (x) => x > (d - 1) * 12 && x <= d * 12 };
Object.assign(SPOTS, {
  low: { label: '1 to 18', pays: 1, covers: (x) => x >= 1 && x <= 18 },
  high: { label: '19 to 36', pays: 1, covers: (x) => x >= 19 },
  even: { label: 'Even', pays: 1, covers: (x) => x > 0 && x % 2 === 0 },
  odd: { label: 'Odd', pays: 1, covers: (x) => x % 2 === 1 },
  red: { label: 'Red', pays: 1, covers: (x) => RED.has(x) },
  black: { label: 'Black', pays: 1, covers: (x) => x > 0 && !RED.has(x) },
});

// bets: { spotId: stake }. Returns what comes back to the player (stakes on
// winning spots plus winnings) and the per-spot breakdown.
export function settle(bets, n) {
  let returned = 0, staked = 0;
  const wins = [], losses = [];
  for (const [id, stake] of Object.entries(bets)) {
    if (!stake) continue;
    staked += stake;
    const spot = SPOTS[id];
    if (spot.covers(n)) {
      const back = stake * (spot.pays + 1);
      returned += back;
      wins.push({ id, stake, back });
    } else losses.push(id);
  }
  return { n, color: colorOf(n), staked, returned, net: returned - staked, wins, losses };
}

// Unbiased random pocket using the browser's crypto RNG when available.
export function randomNumber() {
  const c = globalThis.crypto;
  if (c?.getRandomValues) {
    const buf = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / POCKETS) * POCKETS;
    do c.getRandomValues(buf); while (buf[0] >= limit);
    return buf[0] % POCKETS;
  }
  return Math.floor(Math.random() * POCKETS);
}
