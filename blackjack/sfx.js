// Table sounds for blackjack, built on the slot's synthesized Sound engine.
import { Sound } from '../js/audio.js';

const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class TableSound extends Sound {
  // Card sliding off the shoe across the felt.
  cardSlide() {
    if (!this.ok) return;
    this.noise({ dur: 0.16, type: 'bandpass', freq: 2600, to: 900, q: 0.9, gain: 0.32, attack: 0.01, send: 0.05 });
    this.noise({ dur: 0.05, type: 'highpass', freq: 5000, gain: 0.12, when: 0.12, send: 0 });
  }

  // Card landing on the felt.
  cardLand() {
    if (!this.ok) return;
    this.noise({ dur: 0.06, type: 'lowpass', freq: 1800, gain: 0.35, send: 0 });
    this.tone({ freq: 160, to: 70, type: 'sine', dur: 0.08, gain: 0.18, send: 0 });
  }

  // Card turning over: a crisp snap.
  cardFlip() {
    if (!this.ok) return;
    this.noise({ dur: 0.07, type: 'bandpass', freq: 3800, to: 1800, q: 2, gain: 0.3, send: 0.05 });
    this.tone({ freq: 1400, to: 600, type: 'triangle', dur: 0.05, gain: 0.08, send: 0.1 });
  }

  // Ceramic chip clack. n is the stack height, pitch climbs as it grows.
  chip(n = 0) {
    if (!this.ok) return;
    const f = 2900 + Math.min(n, 12) * 120 + Math.random() * 200;
    this.tone({ freq: f, type: 'sine', dur: 0.09, gain: 0.16, send: 0.12 });
    this.tone({ freq: f * 1.52, type: 'sine', dur: 0.05, gain: 0.08, send: 0.1 });
    this.noise({ dur: 0.03, type: 'highpass', freq: 4500, gain: 0.18, send: 0 });
    this.tone({ freq: f * 0.98, type: 'sine', dur: 0.06, gain: 0.08, when: 0.035, send: 0.12 });
  }

  // A pile of chips sliding together.
  chipsRake(count = 6) {
    if (!this.ok) return;
    for (let i = 0; i < count; i++) {
      const f = 2600 + Math.random() * 1400;
      const when = i * 0.035 + Math.random() * 0.02;
      this.tone({ freq: f, type: 'sine', dur: 0.07, gain: 0.09, when, send: 0.15 });
      this.noise({ dur: 0.025, type: 'highpass', freq: 5000, gain: 0.08, when, send: 0 });
    }
  }

  // Total ticking up on a hand: little pitched blip.
  total(v) {
    if (!this.ok) return;
    const n = 60 + Math.min(Math.max(v - 4, 0), 17) * 1.2;
    this.tone({ freq: midi(n), type: 'triangle', dur: 0.09, gain: 0.08, send: 0.15 });
  }

  bust() {
    if (!this.ok) return;
    this.tone({ freq: 220, to: 55, type: 'sawtooth', dur: 0.5, gain: 0.12, send: 0.1 });
    this.tone({ freq: 110, to: 40, type: 'sine', dur: 0.5, gain: 0.5, send: 0 });
    this.noise({ dur: 0.35, type: 'lowpass', freq: 600, to: 120, gain: 0.35, send: 0.1 });
  }

  push() {
    if (!this.ok) return;
    this.tone({ freq: midi(67), type: 'triangle', dur: 0.2, gain: 0.14, send: 0.3 });
    this.tone({ freq: midi(67), type: 'triangle', dur: 0.25, gain: 0.12, when: 0.12, send: 0.3 });
  }

  lose() {
    if (!this.ok) return;
    [64, 60].forEach((n, i) => this.tone({ freq: midi(n), type: 'triangle', dur: 0.25, gain: 0.12, when: i * 0.13, send: 0.25 }));
  }

  dealerBust() {
    if (!this.ok) return;
    this.noise({ dur: 0.5, type: 'bandpass', freq: 500, to: 5000, q: 0.8, gain: 0.25, attack: 0.05, send: 0.4 });
    [0, 7, 12, 19].forEach((n, i) => this.tone({ freq: midi(67 + n), type: 'square', dur: 0.14, gain: 0.05, when: i * 0.05, send: 0.3 }));
  }

  // Shuffle riffle: a burst of fast little clicks.
  shuffle() {
    if (!this.ok) return;
    for (let i = 0; i < 26; i++) {
      this.noise({ dur: 0.02, type: 'bandpass', freq: 2500 + Math.random() * 2500, q: 3, gain: 0.12, when: i * 0.028 + Math.random() * 0.01, send: 0.05 });
    }
  }

  // Shimmering sweep under a blackjack.
  blackjack() {
    if (!this.ok) return;
    const scale = [0, 4, 7, 11, 12, 16, 19, 23, 24];
    scale.forEach((n, i) => {
      this.tone({ freq: midi(69 + n), type: 'triangle', dur: 0.5, gain: 0.14, when: i * 0.04, send: 0.6 });
      this.tone({ freq: midi(81 + n), type: 'sine', dur: 0.35, gain: 0.05, when: i * 0.04 + 0.01, send: 0.7 });
    });
    this.fanfare(2);
  }
}
