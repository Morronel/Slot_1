// Shared game switcher. Include on any game page with a classic deferred script:
//   <script src="(path to)/js/nav.js" defer></script>
// It finds the site root from its own URL, so it works from the root or a subfolder.
// Put an empty element with a data-games-nav attribute where the button should
// go; without one the button floats in the top-left corner.
(function () {
  var script = document.currentScript;
  var base = new URL('../', script ? script.src : location.href);
  var KEY = 'starfall-spins.v1';

  // A page restored from the back/forward cache still holds its old in-memory
  // balance. Reload so it reads the shared balance fresh instead of overwriting it.
  window.addEventListener('pageshow', function (e) { if (e.persisted) location.reload(); });

  var GAMES = [
    { path: '', name: 'Starfall Spins', kind: 'Slots', art: 'slots' },
    { path: 'roulette/', name: 'Nova Roulette', kind: 'Roulette', art: 'roulette' },
    { path: 'blackjack/', name: 'Blackjack', kind: 'Cards', art: 'cards' },
  ];

  var ART = {
    slots: '<svg viewBox="0 0 48 48"><rect x="5" y="9" width="38" height="30" rx="6" fill="#2b0f6b" stroke="#ffd84a" stroke-width="2.5"/><rect x="10" y="15" width="8" height="18" rx="2" fill="#0c0326"/><rect x="20" y="15" width="8" height="18" rx="2" fill="#0c0326"/><rect x="30" y="15" width="8" height="18" rx="2" fill="#0c0326"/><path d="M14 20l1.2 2.6 2.8.3-2.1 1.9.6 2.8L14 26l-2.5 1.6.6-2.8-2.1-1.9 2.8-.3zM24 20l1.2 2.6 2.8.3-2.1 1.9.6 2.8L24 26l-2.5 1.6.6-2.8-2.1-1.9 2.8-.3zM34 20l1.2 2.6 2.8.3-2.1 1.9.6 2.8L34 26l-2.5 1.6.6-2.8-2.1-1.9 2.8-.3z" fill="#ffd84a"/></svg>',
    roulette: '<svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="19" fill="#ffd84a"/><circle cx="24" cy="24" r="16" fill="#b5103f"/><path d="M24 8a16 16 0 0 1 8 2.1L24 24zM24 40a16 16 0 0 1-8-2.1L24 24zM8 24a16 16 0 0 1 2.1-8L24 24zM40 24a16 16 0 0 1-2.1 8L24 24z" fill="#241a5c"/><circle cx="24" cy="24" r="7" fill="#5b33c9" stroke="#ffd84a" stroke-width="2"/><circle cx="33" cy="13" r="3" fill="#fff"/></svg>',
    cards: '<svg viewBox="0 0 48 48"><rect x="9" y="10" width="20" height="28" rx="3" transform="rotate(-12 19 24)" fill="#f4ecff" stroke="#ffd84a" stroke-width="1.5"/><rect x="19" y="10" width="20" height="28" rx="3" transform="rotate(10 29 24)" fill="#fff" stroke="#ffd84a" stroke-width="1.5"/><path d="M29 18c-2.5 3-6 5-6 8a3 3 0 0 0 5 2l-1 4h4l-1-4a3 3 0 0 0 5-2c0-3-3.5-5-6-8z" fill="#241a5c" transform="rotate(10 29 24)"/></svg>',
  };

  var css = [
    '.games-nav-btn{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.2);background:rgba(255,255,255,.06);color:#f4ecff;cursor:pointer;display:grid;place-items:center;padding:0;transition:transform .12s,background .2s;-webkit-tap-highlight-color:transparent}',
    '.games-nav-btn:hover{background:rgba(255,255,255,.14)}.games-nav-btn:active{transform:scale(.9)}',
    '.games-nav-btn svg{width:18px;height:18px}',
    '.games-nav-btn.float{position:fixed;left:max(10px,env(safe-area-inset-left));top:max(10px,env(safe-area-inset-top));z-index:45;background:rgba(28,10,66,.85);box-shadow:0 4px 14px rgba(0,0,0,.4)}',
    '.games-nav-sheet{position:fixed;inset:0;z-index:90;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(5,0,20,.78);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);animation:gnfade .2s ease-out;font-family:Outfit,system-ui,-apple-system,"Segoe UI",sans-serif}',
    '.games-nav-sheet[hidden]{display:none}',
    '@keyframes gnfade{from{opacity:0}}',
    '@keyframes gnpop{from{transform:translateY(16px) scale(.96);opacity:0}}',
    '.games-nav-card{width:100%;max-width:440px;padding:20px;border-radius:22px;background:linear-gradient(180deg,#2c0f66,#170540);border:2px solid rgba(255,216,74,.5);box-shadow:0 0 40px rgba(255,77,216,.4),0 20px 60px rgba(0,0,0,.6);color:#f4ecff;animation:gnpop .28s cubic-bezier(.2,1.5,.4,1)}',
    '.games-nav-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}',
    '.games-nav-head h2{margin:0;font:400 22px Bungee,"Arial Black",Impact,sans-serif;color:#ffd84a;letter-spacing:.5px}',
    '.games-nav-bal{font-size:12px;color:#b9a6e6;text-align:right;line-height:1.2}.games-nav-bal b{display:block;font:400 18px Bungee,"Arial Black",Impact,sans-serif;color:#fff}',
    '.games-nav-list{display:grid;gap:10px}',
    '.games-nav-item{display:flex;align-items:center;gap:14px;padding:12px 14px;border-radius:16px;text-decoration:none;color:#f4ecff;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);transition:background .15s,transform .12s,border-color .15s}',
    '.games-nav-item:hover{background:rgba(255,255,255,.1);border-color:rgba(255,216,74,.6)}.games-nav-item:active{transform:scale(.98)}',
    '.games-nav-item svg{width:46px;height:46px;flex:none;filter:drop-shadow(0 0 8px rgba(255,216,74,.35))}',
    '.games-nav-item strong{display:block;font:400 17px Bungee,"Arial Black",Impact,sans-serif;letter-spacing:.3px}',
    '.games-nav-item small{color:#b9a6e6;font-size:12px;text-transform:uppercase;letter-spacing:1.2px}',
    '.games-nav-item[aria-current=page]{border-color:#ff4dd8;box-shadow:0 0 18px rgba(255,77,216,.45);background:rgba(255,77,216,.12)}',
    '.games-nav-item[aria-current=page] small::after{content:" \\00b7  playing now";color:#ff9af0}',
    '.games-nav-note{margin:12px 0 0;font-size:11.5px;color:rgba(185,166,230,.75);text-align:center}',
  ].join('');

  function balance() {
    try { var b = JSON.parse(localStorage.getItem(KEY) || '{}').balance; return Number.isFinite(b) ? b : 10000; } catch (e) { return 10000; }
  }

  function init() {
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var here = location.pathname.replace(/index\.html$/, '');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'games-nav-btn';
    btn.setAttribute('aria-label', 'All games');
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.title = 'All games';
    btn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7.5" height="7.5" rx="2" fill="currentColor"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="2" fill="currentColor"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="2" fill="currentColor"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" fill="currentColor"/></svg>';
    var slot = document.querySelector('[data-games-nav]');
    if (slot) slot.replaceWith(btn);
    else { btn.classList.add('float'); document.body.appendChild(btn); }

    var sheet = document.createElement('div');
    sheet.className = 'games-nav-sheet';
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-label', 'Choose a game');
    var items = GAMES.map(function (g) {
      var url = new URL(g.path, base);
      var current = url.pathname === here;
      return '<a class="games-nav-item" href="' + url.href + '"' + (current ? ' aria-current="page"' : '') + '>' + ART[g.art] +
        '<span><strong>' + g.name + '</strong><small>' + g.kind + '</small></span></a>';
    }).join('');
    sheet.innerHTML = '<div class="games-nav-card"><div class="games-nav-head"><h2>Games</h2><div class="games-nav-bal">Balance<b></b></div></div>' +
      '<nav class="games-nav-list" aria-label="Games">' + items + '</nav>' +
      '<p class="games-nav-note">One play-money balance across every game.</p></div>';
    document.body.appendChild(sheet);
    var card = sheet.firstChild;

    function open() {
      sheet.querySelector('.games-nav-bal b').textContent = Math.round(balance()).toLocaleString('en-US');
      sheet.hidden = false;
      var cur = sheet.querySelector('[aria-current]') || sheet.querySelector('a');
      if (cur) cur.focus({ preventScroll: true });
    }
    function close() { sheet.hidden = true; btn.focus({ preventScroll: true }); }
    btn.addEventListener('click', function (e) { e.stopPropagation(); open(); });
    sheet.addEventListener('click', function (e) {
      if (!card.contains(e.target)) close();
      else if (e.target.closest('[aria-current]')) { e.preventDefault(); close(); }
    });
    // Capture so game keyboard shortcuts (Space to spin and so on) never fire behind the sheet.
    document.addEventListener('keydown', function (e) {
      if (sheet.hidden) return;
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      // Enter still follows the focused link: that is the default action, not a listener.
      if (e.key !== 'Tab') e.stopImmediatePropagation();
    }, true);
    // Keep the button from stealing focus-driven Space presses from the game.
    btn.addEventListener('keydown', function (e) { if (e.code === 'Space') { e.preventDefault(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
