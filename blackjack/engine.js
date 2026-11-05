// Blackjack rules and shoe. Pure logic with no DOM, so it runs in Node too.
//
// Rules: 6 decks, dealer stands on soft 17, blackjack pays 3 to 2,
// double on any first two cards (also after a split), split up to 4 hands,
// split aces get one card each, dealer peeks for blackjack with an ace or ten up.

export const SUITS = ['S', 'H', 'D', 'C'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const DECKS = 6;
export const MAX_HANDS = 4;
export const BJ_PAYS = 1.5;

export const cardValue = (c) => (c.r === 'A' ? 11 : 'JQK'.includes(c.r) || c.r === '10' ? 10 : Number(c.r));

export function handValue(cards) {
  let total = 0, aces = 0;
  for (const c of cards) {
    total += cardValue(c);
    if (c.r === 'A') aces++;
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return { total, soft: aces > 0 && total <= 21 };
}

export const isBlackjack = (cards) => cards.length === 2 && handValue(cards).total === 21;

export function shuffle(arr, rnd = Math.random) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export class Shoe {
  constructor(decks = DECKS, rnd = Math.random) {
    this.decks = decks;
    this.rnd = rnd;
    this.forced = []; // cards to deal next, for tests
    this.reshuffle();
  }

  reshuffle() {
    const cards = [];
    let id = 0;
    for (let d = 0; d < this.decks; d++) for (const s of SUITS) for (const r of RANKS) cards.push({ r, s, id: id++ });
    this.cards = shuffle(cards, this.rnd);
    // Cut card about three quarters of the way in.
    this.cut = Math.floor(this.cards.length * (0.22 + this.rnd() * 0.06));
    this.justShuffled = true;
  }

  get needsShuffle() { return this.cards.length <= this.cut; }
  get remaining() { return this.cards.length; }

  draw() {
    if (this.forced.length) {
      const f = this.forced.shift();
      return { r: f.r, s: f.s, id: 'f' + Math.random().toString(36).slice(2) };
    }
    if (!this.cards.length) this.reshuffle();
    return this.cards.pop();
  }
}

export const canSplit = (hand, handsCount) =>
  hand.cards.length === 2 && handsCount < MAX_HANDS && cardValue(hand.cards[0]) === cardValue(hand.cards[1]);

export const canDouble = (hand) => hand.cards.length === 2 && !hand.splitAces;

export const dealerShouldHit = (cards) => handValue(cards).total < 17;

// Outcome for one player hand once the dealer is done.
// Returns { result, payout } where payout is the total returned to the player (stake included).
export function settle(hand, dealerCards) {
  const p = handValue(hand.cards).total;
  const d = handValue(dealerCards).total;
  const pBJ = isBlackjack(hand.cards) && !hand.fromSplit;
  const dBJ = isBlackjack(dealerCards);
  if (p > 21) return { result: 'bust', payout: 0 };
  if (pBJ && dBJ) return { result: 'push', payout: hand.bet };
  if (pBJ) return { result: 'blackjack', payout: hand.bet * (1 + BJ_PAYS) };
  if (dBJ) return { result: 'lose', payout: 0 };
  if (d > 21) return { result: 'win', payout: hand.bet * 2, dealerBust: true };
  if (p > d) return { result: 'win', payout: hand.bet * 2 };
  if (p === d) return { result: 'push', payout: hand.bet };
  return { result: 'lose', payout: 0 };
}

// Basic strategy for S17, double after split. Used only by the simulator below
// to sanity check the rules and return.
export function basicStrategy(hand, up, handsCount) {
  const { total, soft } = handValue(hand.cards);
  const u = cardValue(up);
  const two = hand.cards.length === 2;
  if (two && canSplit(hand, handsCount)) {
    const v = cardValue(hand.cards[0]);
    if (v === 11 || v === 8) return 'split';
    if (v === 9 && ![7, 10, 11].includes(u)) return 'split';
    if ((v === 7 || v === 2 || v === 3) && u <= 7) return 'split';
    if (v === 6 && u <= 6) return 'split';
    if (v === 4 && (u === 5 || u === 6)) return 'split';
  }
  if (soft) {
    if (total >= 19) return total === 19 && u === 6 && two ? 'double' : 'stand';
    if (total === 18) {
      if (two && u >= 2 && u <= 6) return 'double';
      return u >= 9 ? 'hit' : 'stand';
    }
    const lo = { 17: 3, 16: 4, 15: 4, 14: 5, 13: 5 }[total] ?? 7;
    if (two && u >= lo && u <= 6) return 'double';
    return 'hit';
  }
  if (total >= 17) return 'stand';
  if (total >= 13) return u <= 6 ? 'stand' : 'hit';
  if (total === 12) return u >= 4 && u <= 6 ? 'stand' : 'hit';
  if (total === 11) return two ? 'double' : 'hit';
  if (total === 10) return two && u <= 9 ? 'double' : 'hit';
  if (total === 9) return two && u >= 3 && u <= 6 ? 'double' : 'hit';
  return 'hit';
}
