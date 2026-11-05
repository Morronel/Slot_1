// Home page: builds the game picker from the list in js/nav.js and
// runs the shared starfield behind it.
import { Starfield } from './fx.js';

const lobby = window.StarfallGames;
const grid = document.getElementById('lobby-grid');
const balanceEl = document.getElementById('lobby-balance');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = (n) => Math.round(n).toLocaleString('en-US');

const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16l13-8z" fill="currentColor"/></svg>';
const last = lobby.last();

grid.innerHTML = lobby.games.map((g, i) => `
  <a class="game-card" href="${g.href}" data-game="${g.id}" style="--i:${i}">
    ${g.id === last ? '<span class="game-last">Last played</span>' : ''}
    <span class="game-art" aria-hidden="true">${g.art}</span>
    <span class="game-kind">${g.kind}</span>
    <h2 class="game-name">${g.name}</h2>
    <p class="game-blurb">${g.blurb}</p>
    <ul class="game-tags">${g.tags.map((t) => `<li>${t}</li>`).join('')}</ul>
    <span class="game-play">${PLAY}Play</span>
  </a>`).join('');

// Balance counts up from zero on arrival, like a win.
function showBalance(animate) {
  const target = lobby.balance();
  if (!animate || reduceMotion) { balanceEl.textContent = fmt(target); return; }
  const start = performance.now(), dur = 900;
  const step = (now) => {
    const p = Math.min(1, (now - start) / dur);
    balanceEl.textContent = fmt(target * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
showBalance(true);
// Coming back from a game (or another tab) refreshes the number.
addEventListener('pageshow', (e) => { if (e.persisted) showBalance(false); });
addEventListener('storage', (e) => { if (e.key === 'starfall-spins.v1') showBalance(false); });

// Cards tilt toward the pointer and a spotlight follows it.
if (!reduceMotion) {
  for (const card of grid.querySelectorAll('.game-card')) {
    card.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      card.style.setProperty('--mx', `${x * 100}%`);
      card.style.setProperty('--my', `${y * 100}%`);
      card.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
      card.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
    });
    card.addEventListener('pointerleave', () => {
      card.style.removeProperty('--rx');
      card.style.removeProperty('--ry');
    });
    // A short warp as you pick a game, then go.
    card.addEventListener('click', (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      stars.warpTarget = 1;
      card.style.setProperty('--lift', '-10px');
      setTimeout(() => { location.href = card.href; }, 280);
    });
  }
}

const stars = new Starfield(document.getElementById('stars'));
addEventListener('resize', () => stars.resize());
let prev = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - prev) / 1000);
  prev = now;
  stars.update(dt, now / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// Back from a game via bfcache: drop the warp.
addEventListener('pageshow', () => { stars.warpTarget = 0; stars.warp = 0; });
