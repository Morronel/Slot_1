# Starfall Spins

A play-money slot machine that runs entirely in the browser. No backend, no build step, no real money.

**Play:** https://morronel.github.io/slot_1/ (once GitHub Pages is on, see below)

## What's in it

- 5 reels, 3 rows, 20 paylines, with an original cosmic theme: hand-built SVG gems, moon, ringed planet, comet, gold star, a Wild Sun and a Nebula bonus symbol.
- Reels with wind-up, vertical motion blur, staggered stops and an overshoot bounce. Press Spin again to slam-stop.
- Two bonus symbols showing makes the remaining reels spin longer with a glowing frame and a rising tension sound.
- Three or more bonus symbols pay anywhere and start 8, 12 or 20 free spins where every win is doubled. Free spins can retrigger.
- Wins draw glowing paylines, pop the winning symbols, count up with ticking sounds and fountain coins. Wins of 10x, 25x and 50x the bet escalate through Big, Mega and Epic Win screens with coin rain, confetti and screen shake.
- Every sound is synthesized live with the Web Audio API (reel thunks, whirr, chimes, coin pings, fanfares), so there are no audio files.
- Warp-speed starfield while spinning, marquee bulbs that chase and flash, haptic taps on phones.
- Turbo mode, autoplay, sound toggle, paytable, and a free refill when you run out. Balance and settings are saved in `localStorage`.
- Works on desktop, phones in portrait and phones on their side.

Keyboard: `Space` spin or stop, `T` turbo, `A` autoplay, arrow keys change the bet.

The math is tuned by simulation to about 97% return with a win on roughly 37% of spins, free spins about every 115 spins, and a 10x+ win about every 70 spins.

## Starfall 21 (blackjack)

**Play:** https://morronel.github.io/slot_1/blackjack/

A blackjack table in the same cosmic style, sharing the slot's play-money balance.

- Six-deck shoe with a cut card, dealer stands on all 17s, blackjack pays 3 to 2, double on any two cards, split up to four hands (doubling after a split is allowed). About 99.4% return with perfect play, checked by simulation.
- Tap chips to stack your bet, Rebet repeats the last one and then doubles it. Deal with an empty spot rebets automatically.
- Cards fly out of the shoe and flip in mid-air, the dealer peeks under an ace or ten, totals pop as they change, and every hand gets a WIN, BUST, PUSH or BLACKJACK stamp.
- Payouts fly from the dealer onto your stack and then into your balance with coin fountains. Blackjacks, clean sweeps on split hands and huge wins get a banner, confetti and a fanfare. A streak badge counts wins in a row.
- Card, chip, shuffle and bust sounds are synthesized with the Web Audio API, reusing the slot's sound engine.
- Works on desktop, phones in portrait and phones on their side.

Keyboard: `Space` deal, `H` hit, `S` stand, `D` double, `P` split, `1` to `5` add chips, `R` rebet, `Backspace` clears the bet.

Files live in `blackjack/`: `engine.js` (shoe, rules, payouts, pure logic), `sfx.js` (table sounds), `main.js` (animation and game flow), `bj.css`, `index.html`.

## Run locally

It uses ES modules, so serve the folder rather than opening the file directly:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

## Turn on GitHub Pages

1. On GitHub, open the repository's **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Pick the `main` branch and the `/ (root)` folder, then **Save**.
4. After a minute the game is live at `https://morronel.github.io/slot_1/`.

## Files

- `index.html` markup and overlays
- `css/style.css` all styling and animations
- `js/engine.js` reel strips, paylines, win evaluation (pure logic, runs in Node too)
- `js/symbols.js` SVG symbol art
- `js/audio.js` Web Audio sound synthesis
- `js/fx.js` starfield and particles
- `js/main.js` reels animation, game flow, UI
