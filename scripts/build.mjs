#!/usr/bin/env node
// Build the deployable site into _site/ with cache-busted asset URLs.
//
// Problem it solves: after a deploy, a browser can keep some old JS/CSS in its
// cache and fetch some new files, and the mix breaks the games. GitHub Pages
// does not let us set Cache-Control headers, so instead every local .js/.css
// reference gets a ?v=<hash> query:
//   - HTML <script src> / <link href>
//   - ES module imports (static `from '...'`, `import '...'` and `import('...')`)
//   - CSS @import and url()
// The hash covers a file's own content plus the hashes of everything it
// imports, so changing engine.js also changes the URL of main.js that imports
// it. Unchanged files keep their URLs and stay cached.
//
// HTML itself cannot be renamed. Pages caches it for up to 10 minutes, so each
// page also gets a tiny inline check: it asks for version.json with no-store,
// and if the live build is newer than the page, it reloads once onto a fresh URL.
//
// Source files are untouched; opening the repo locally still works without a build.
// Usage: node scripts/build.mjs [outDir]   (BUILD_ID env sets the build id)

import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.resolve(ROOT, process.argv[2] || '_site');
const SKIP = new Set(['.git', '.github', 'scripts', 'node_modules', '_site', path.basename(OUT)]);

function buildId() {
  if (process.env.BUILD_ID) return process.env.BUILD_ID.slice(0, 12);
  try { return execSync('git rev-parse --short=12 HEAD', { cwd: ROOT }).toString().trim(); }
  catch { return Date.now().toString(36); }
}

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const isLocal = (u) => !/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(u);
const stripQuery = (u) => u.replace(/[?#].*$/, '');

// Each rewriter takes (text, fn) and calls fn(url) for every reference, replacing
// it with the return value. fn returns the url unchanged when it should not be touched.
const REWRITERS = {
  '.js': (text, fn) => text
    .replace(/(\bfrom\s*|\bimport\s*\(?\s*)(['"])([^'"\n]+)\2/g, (m, pre, q, u) => pre + q + fn(u) + q),
  '.css': (text, fn) => text
    .replace(/(@import\s+)(['"])([^'"\n]+)\2/g, (m, pre, q, u) => pre + q + fn(u) + q)
    .replace(/url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g, (m, q, u) => 'url(' + q + fn(u) + q + ')'),
  '.html': (text, fn) => text
    .replace(/(<(?:script|link)\b[^>]*?\s(?:src|href)=)(["'])([^"']+)\2/gi, (m, pre, q, u) => pre + q + fn(u) + q),
};

const files = walk(ROOT);
const byPath = new Map(files.map((f) => [f, fs.readFileSync(f)]));

function resolveRef(from, u) {
  if (!isLocal(u)) return null;
  const clean = stripQuery(u);
  if (!/\.(m?js|css)$/i.test(clean)) return null;
  const target = path.resolve(path.dirname(from), clean);
  return byPath.has(target) ? target : null;
}

// Hash = own bytes + hashes of local deps (memoised, cycle-safe).
const hashes = new Map();
function hashOf(file, stack = new Set()) {
  if (hashes.has(file)) return hashes.get(file);
  const h = createHash('sha256').update(byPath.get(file));
  const rw = REWRITERS[path.extname(file)];
  if (rw && !stack.has(file)) {
    stack.add(file);
    const deps = [];
    rw(byPath.get(file).toString('utf8'), (u) => { const t = resolveRef(file, u); if (t) deps.push(t); return u; });
    for (const d of deps.sort()) if (!stack.has(d)) h.update(hashOf(d, stack));
    stack.delete(file);
  }
  const v = h.digest('hex').slice(0, 10);
  hashes.set(file, v);
  return v;
}

const BUILD = buildId();
const versionCheck = (id) => `<meta name="build-id" content="${id}">
  <script>
  // Pages may serve this HTML from cache for a few minutes after a deploy. If a
  // newer build is live, reload once onto a fresh URL so HTML, JS and CSS match.
  (function () {
    var me = '${id}', KEY = 'starfall-build-reload';
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('_b')) { u.searchParams.delete('_b'); history.replaceState(history.state, '', u.href); }
    } catch (e) {}
    var root = new URL('${'__ROOT__'}', location.href);
    fetch(new URL('version.json', root).href + '?t=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (v) {
        if (!v || !v.build || v.build === me) return;
        try { if (sessionStorage.getItem(KEY) === v.build) return; sessionStorage.setItem(KEY, v.build); } catch (e) { return; }
        var u = new URL(location.href);
        u.searchParams.set('_b', v.build);
        location.replace(u.href);
      })
      .catch(function () {});
  })();
  </script>`;

fs.rmSync(OUT, { recursive: true, force: true });
let stamped = 0;
for (const [file, buf] of byPath) {
  const rel = path.relative(ROOT, file);
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const ext = path.extname(file);
  const rw = REWRITERS[ext];
  if (!rw) { fs.writeFileSync(dest, buf); continue; }
  let text = rw(buf.toString('utf8'), (u) => {
    const t = resolveRef(file, u);
    if (!t) return u;
    stamped++;
    const hashIdx = u.indexOf('#');
    const frag = hashIdx >= 0 ? u.slice(hashIdx) : '';
    const base = stripQuery(u);
    return base + '?v=' + hashOf(t) + frag;
  });
  if (ext === '.html') {
    let rootRel = path.relative(path.dirname(file), ROOT).split(path.sep).join('/');
    rootRel = rootRel ? rootRel + '/' : './';
    const snippet = versionCheck(BUILD).replace('__ROOT__', rootRel);
    if (!/<meta charset[^>]*>/i.test(text)) throw new Error(rel + ': no <meta charset> to anchor the version check');
    text = text.replace(/(<meta charset[^>]*>)/i, '$1\n  ' + snippet);
  }
  fs.writeFileSync(dest, text);
}
fs.writeFileSync(path.join(OUT, 'version.json'), JSON.stringify({ build: BUILD }) + '\n');

console.log(`Built ${byPath.size} files into ${path.relative(ROOT, OUT) || '.'} (build ${BUILD}, ${stamped} asset URLs stamped)`);
