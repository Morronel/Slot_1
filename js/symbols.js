// Hand-built SVG art for every symbol. Each SVG is self-contained (its own
// gradient ids) so it can be turned into an <img> data URL and cached by the browser.

const V = 100;

function poly(pts) {
  return pts.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

function ring(n, cx, cy, rx, ry, rot = -Math.PI / 2) {
  return Array.from({ length: n }, (_, i) => {
    const a = rot + (i / n) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  });
}

function hsl(h, s, l, a = 1) {
  return `hsla(${h},${s}%,${Math.max(0, Math.min(100, l))}%,${a})`;
}

// A faceted gem: outer outline, inner "table", quads between them shaded by
// facing direction against a light from the top-left.
function gem({ id, outer, scale = 0.52, hue, sat = 85, light = 52, glow }) {
  const cx = outer.reduce((a, p) => a + p[0], 0) / outer.length;
  const cy = outer.reduce((a, p) => a + p[1], 0) / outer.length;
  const inner = outer.map(([x, y]) => [cx + (x - cx) * scale, cy + (y - cy) * scale - 3]);
  const lightDir = Math.atan2(-1, -0.8);
  let facets = '';
  for (let i = 0; i < outer.length; i++) {
    const j = (i + 1) % outer.length;
    const mx = (outer[i][0] + outer[j][0]) / 2 - cx;
    const my = (outer[i][1] + outer[j][1]) / 2 - cy;
    const k = Math.cos(Math.atan2(my, mx) - lightDir);
    const l = light + k * 22;
    facets += `<polygon points="${poly([outer[i], outer[j], inner[j], inner[i]])}" fill="${hsl(hue, sat, l)}" stroke="${hsl(hue, sat, Math.min(95, l + 18), 0.55)}" stroke-width="0.8"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${V} ${V}">
  <defs>
    <radialGradient id="${id}t" cx="35%" cy="30%" r="80%">
      <stop offset="0" stop-color="${hsl(hue, sat, 92)}"/>
      <stop offset="0.45" stop-color="${hsl(hue, sat, light + 14)}"/>
      <stop offset="1" stop-color="${hsl(hue, sat, light - 10)}"/>
    </radialGradient>
    <radialGradient id="${id}g" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="${glow}" stop-opacity="0.55"/>
      <stop offset="1" stop-color="${glow}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="50" cy="52" r="48" fill="url(#${id}g)"/>
  <polygon points="${poly(outer.map(([x, y]) => [x, y + 3]))}" fill="${hsl(hue, sat, 12, 0.55)}"/>
  ${facets}
  <polygon points="${poly(inner)}" fill="url(#${id}t)" stroke="${hsl(hue, 60, 96, 0.8)}" stroke-width="1"/>
  <polygon points="${poly(outer)}" fill="none" stroke="${hsl(hue, 70, 96, 0.9)}" stroke-width="1.6" stroke-linejoin="round"/>
  <path d="M${inner[0][0] - 6},${inner[0][1] + 8} l4,-6 l3,2 z" fill="#fff" opacity="0.85"/>
  ${sparkle(cx + 18, cy - 20, 7)}
</svg>`;
}

function sparkle(x, y, r, color = '#fff') {
  return `<path d="M${x},${y - r} Q${x + r * 0.15},${y - r * 0.15} ${x + r},${y} Q${x + r * 0.15},${y + r * 0.15} ${x},${y + r} Q${x - r * 0.15},${y + r * 0.15} ${x - r},${y} Q${x - r * 0.15},${y - r * 0.15} ${x},${y - r} Z" fill="${color}" opacity="0.95"/>`;
}

function starPts(cx, cy, R, r, n = 5) {
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i / (n * 2)) * Math.PI * 2;
    const rad = i % 2 ? r : R;
    pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]);
  }
  return pts;
}

function bevelStar(cx, cy, R, r, hue, n = 5) {
  const pts = starPts(cx, cy, R, r, n);
  const lightDir = Math.atan2(-1, -0.7);
  let out = '';
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    // Alternate halves of each point catch the light differently.
    const k = Math.cos(Math.atan2(my, mx) - lightDir) * 0.6 + (i % 2 ? -0.25 : 0.25);
    out += `<polygon points="${poly([[cx, cy], a, b])}" fill="${hsl(hue, 95, 55 + k * 25)}"/>`;
  }
  out += `<polygon points="${poly(pts)}" fill="none" stroke="${hsl(hue, 100, 88)}" stroke-width="1.6" stroke-linejoin="round"/>`;
  return out;
}

const topaz = gem({
  id: 'tz', hue: 32, light: 55, glow: '#ff9a2e',
  outer: [[50, 90], [12, 26], [30, 12], [70, 12], [88, 26]],
});

const emerald = gem({
  id: 'em', hue: 145, light: 42, glow: '#2bff9a',
  outer: [[30, 12], [70, 12], [84, 26], [84, 74], [70, 88], [30, 88], [16, 74], [16, 26]],
  scale: 0.56,
});

const sapphire = gem({
  id: 'sa', hue: 215, light: 50, glow: '#3d8bff',
  outer: ring(10, 50, 50, 40, 40),
});

const amethyst = gem({
  id: 'am', hue: 282, light: 52, glow: '#c04dff',
  outer: [[50, 7], [80, 34], [80, 62], [50, 93], [20, 62], [20, 34]],
  scale: 0.5,
});

const moon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="mg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#8fd3ff" stop-opacity=".6"/><stop offset="1" stop-color="#8fd3ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="mf" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#cfe6ff"/><stop offset="1" stop-color="#7b9fd6"/></linearGradient>
    <mask id="mm"><rect width="100" height="100" fill="#fff"/><circle cx="66" cy="40" r="33" fill="#000"/></mask>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#mg)"/>
  <g mask="url(#mm)">
    <circle cx="48" cy="52" r="38" fill="url(#mf)"/>
    <circle cx="30" cy="62" r="6" fill="#9cb7e0" opacity=".7"/>
    <circle cx="40" cy="78" r="4" fill="#9cb7e0" opacity=".7"/>
    <circle cx="22" cy="46" r="3.5" fill="#9cb7e0" opacity=".7"/>
    <circle cx="48" cy="52" r="38" fill="none" stroke="#fff" stroke-width="1.5" opacity=".8"/>
  </g>
  ${sparkle(76, 70, 6)}${sparkle(84, 24, 4)}
</svg>`;

const planet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="pg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff7ab8" stop-opacity=".55"/><stop offset="1" stop-color="#ff7ab8" stop-opacity="0"/></radialGradient>
    <radialGradient id="pb" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#ffe3a8"/><stop offset=".45" stop-color="#ff8a5c"/><stop offset="1" stop-color="#a3246b"/></radialGradient>
    <linearGradient id="pr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffd38a" stop-opacity=".2"/><stop offset=".5" stop-color="#fff2cf"/><stop offset="1" stop-color="#ffd38a" stop-opacity=".2"/></linearGradient>
    <clipPath id="pc"><circle cx="50" cy="50" r="27"/></clipPath>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#pg)"/>
  <g transform="rotate(-18 50 50)">
    <path d="M8,50 A42,12 0 0 1 92,50" fill="none" stroke="url(#pr)" stroke-width="5"/>
    <circle cx="50" cy="50" r="27" fill="url(#pb)"/>
    <g clip-path="url(#pc)" opacity=".35">
      <rect x="20" y="40" width="60" height="4" fill="#fff"/><rect x="20" y="55" width="60" height="6" fill="#7a1650"/>
    </g>
    <path d="M8,50 A42,12 0 0 0 92,50" fill="none" stroke="url(#pr)" stroke-width="5"/>
  </g>
  ${sparkle(30, 30, 5)}
</svg>`;

const comet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="cg" cx="62%" cy="62%" r="50%"><stop offset="0" stop-color="#5ff6ff" stop-opacity=".6"/><stop offset="1" stop-color="#5ff6ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="ct" x1="1" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffffff"/><stop offset=".25" stop-color="#7ff9ff"/><stop offset=".7" stop-color="#3a6bff" stop-opacity=".5"/><stop offset="1" stop-color="#7a2cff" stop-opacity="0"/></linearGradient>
    <radialGradient id="ch" cx="38%" cy="35%" r="70%"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#b5fcff"/><stop offset="1" stop-color="#1690ff"/></radialGradient>
  </defs>
  <circle cx="58" cy="58" r="44" fill="url(#cg)"/>
  <path d="M60,82 C40,60 18,34 4,6 C30,22 52,40 80,58 Z" fill="url(#ct)"/>
  <path d="M74,76 C50,60 30,48 10,40 C36,40 58,46 82,62 Z" fill="url(#ct)" opacity=".7"/>
  <path d="M56,74 C50,52 44,30 40,6 C54,26 62,44 72,62 Z" fill="url(#ct)" opacity=".6"/>
  <circle cx="68" cy="68" r="21" fill="url(#ch)" stroke="#e8feff" stroke-width="2"/>
  <ellipse cx="61" cy="60" rx="7" ry="4.5" fill="#fff" opacity=".85" transform="rotate(-35 61 60)"/>
  ${sparkle(88, 40, 5)}${sparkle(30, 70, 4)}
</svg>`;

const star = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs><radialGradient id="sg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffd84a" stop-opacity=".75"/><stop offset="1" stop-color="#ffd84a" stop-opacity="0"/></radialGradient></defs>
  <circle cx="50" cy="52" r="49" fill="url(#sg)"/>
  <polygon points="${poly(starPts(50, 55, 44, 19))}" fill="#7a4300" opacity=".5"/>
  ${bevelStar(50, 52, 44, 19, 44)}
  ${sparkle(72, 22, 7)}${sparkle(22, 70, 4)}
</svg>`;

const rays = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * 360;
  return `<polygon points="50,4 56,24 44,24" fill="${i % 2 ? '#ffb21f' : '#ffe259'}" transform="rotate(${a} 50 46)"/>`;
}).join('');

const wild = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="wg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffcf3f" stop-opacity=".9"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient>
    <radialGradient id="wc" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fffbe0"/><stop offset=".5" stop-color="#ffcc33"/><stop offset="1" stop-color="#ff6a00"/></radialGradient>
    <linearGradient id="wb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3d7f"/><stop offset="1" stop-color="#b3005a"/></linearGradient>
  </defs>
  <circle cx="50" cy="48" r="49" fill="url(#wg)"/>
  ${rays}
  <circle cx="50" cy="46" r="24" fill="url(#wc)" stroke="#fff6c2" stroke-width="2"/>
  <rect x="10" y="62" width="80" height="24" rx="8" fill="url(#wb)" stroke="#ffd0e4" stroke-width="2"/>
  <text x="50" y="81" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="19" fill="#fff" letter-spacing="1.5">WILD</text>
</svg>`;

const arms = [0, 120, 240].map((a) =>
  `<path d="M50,50 C62,42 70,30 60,16 C74,28 74,46 50,50 Z" fill="url(#sa)" transform="rotate(${a} 50 50)"/>`
).join('');

const scatter = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <defs>
    <radialGradient id="sx" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff4dd8" stop-opacity=".85"/><stop offset=".6" stop-color="#7a2cff" stop-opacity=".45"/><stop offset="1" stop-color="#2a00ff" stop-opacity="0"/></radialGradient>
    <linearGradient id="sa" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".4" stop-color="#ff8af0"/><stop offset="1" stop-color="#6a1bff"/></linearGradient>
    <radialGradient id="sc" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#ffe0fb"/><stop offset="1" stop-color="#ff4dd8" stop-opacity="0"/></radialGradient>
    <linearGradient id="sb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d3dff"/><stop offset="1" stop-color="#3a0b9e"/></linearGradient>
  </defs>
  <circle cx="50" cy="46" r="49" fill="url(#sx)"/>
  <g transform="translate(0,-4)">${arms}</g>
  <circle cx="50" cy="46" r="11" fill="url(#sc)"/>
  ${sparkle(22, 22, 5)}${sparkle(80, 30, 4)}${sparkle(76, 12, 3)}
  <rect x="8" y="64" width="84" height="24" rx="8" fill="url(#sb)" stroke="#e6c8ff" stroke-width="2"/>
  <text x="50" y="83" text-anchor="middle" font-family="Arial Black, Arial, sans-serif" font-weight="900" font-size="17" fill="#fff" letter-spacing="1">BONUS</text>
</svg>`;

export const SYMBOL_SVG = { topaz, emerald, sapphire, amethyst, moon, planet, comet, star, wild, scatter };

export const SYMBOL_URL = Object.fromEntries(
  Object.entries(SYMBOL_SVG).map(([k, svg]) => [k, 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)])
);

// Glow color used for win highlights and paylines.
export const SYMBOL_COLOR = {
  topaz: '#ff9a2e', emerald: '#2bff9a', sapphire: '#4d9bff', amethyst: '#c04dff',
  moon: '#9fdcff', planet: '#ff7ab8', comet: '#5ff6ff', star: '#ffd84a',
  wild: '#ffb21f', scatter: '#ff4dd8',
};
