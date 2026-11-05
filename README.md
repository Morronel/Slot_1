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

## Nova Roulette

**Play:** https://morronel.github.io/slot_1/roulette/

- European single-zero wheel drawn on canvas: gold rim with chasing bulbs, deflector diamonds, a rotor that never stops drifting.
- The ball is flicked onto the track, slows, bounces off deflectors, rattles across the frets with a click per pocket and settles into a pocket drawn in advance by `crypto.getRandomValues`.
- On phones the wheel zooms up to fill the screen while the ball rolls, then shrinks back so you can watch the payout.
- Chips fly from the rack to the table and stack up. Losing chips get swept to the wheel; winners pulse, get a payout stack beside them, fountain coins and fly into your balance. 8x, 18x and 30x the stake bring Big, Mega and Epic Win screens.
- Straight up (35:1), dozens and columns (2:1), red/black, odd/even, 1–18/19–36 (1:1). Undo, clear, double, rebet, turbo, and a history of the last 14 numbers.
- Table switches between a classic horizontal layout and a vertical one for phones in portrait.
- Keyboard: `Space` spin (or rebet and spin), `Z` undo, `C` clear, `D` double, `R` rebet, `T` turbo, `1`–`6` pick a chip.

All games share one play-money balance (localStorage key `starfall-spins.v1`). The grid button in each game's header opens a lobby to switch games (`js/nav.js`).

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
- `js/nav.js` shared game switcher and lobby (include it on any game page)
- `roulette/` Nova Roulette: `rules.js` (bets and payouts, runs in Node), `wheel.js` (canvas wheel and ball physics), `sfx.js` (extra sounds), `main.js` (table and game flow)
