/* ==========================================================================
   ACCOOM build: makes a minified copy of the site in ./dist

   Usage:   npm install   (first time only)
            npm run build

   - Bundles main.css (its @imports) into one file and minifies every .js and .css file, except third-party files in vendor/ (same file names, same load order, so
     the HTML does not change).
   - Merges each page's run of <script src="assets/js/..."> tags into a few hashed bundle files
     (assets/bundles/b-xxxx.js) in the SAME order, so a page makes 2 script requests instead of ~17.
     Each file is wrapped in try/catch so one failing file cannot stop the others (same as before).
     Inline <script> blocks stay exactly where they are and split the bundles, so load order is unchanged.
   - Copies .html, partials, images, videos and everything else as they are.
   - Your source files are never modified. Deploy the ./dist folder.
   ========================================================================== */
import { build, transform } from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'dist');
const SKIP = new Set(['node_modules', 'dist', '.git', '.vscode', 'package.json', 'package-lock.json', 'build.mjs', 'README.md', '.gitignore', 'server']);

let saved = 0, before = 0;

async function walk(dir, rel = '') {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (rel === '' && SKIP.has(entry.name)) continue;
    const src = path.join(dir, entry.name);
    const dst = path.join(OUT, rel, entry.name);
    if (entry.isDirectory()) {
      await fs.mkdir(dst, { recursive: true });
      await walk(src, path.join(rel, entry.name));
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if ((ext === '.js' || ext === '.css') && !entry.name.endsWith('.min.js') && !rel.includes('vendor')) {
      const code = await fs.readFile(src, 'utf8');
      if (!code.trim()) { await fs.writeFile(dst, code); continue; }
      // CSS with @import lines (main.css) is bundled into ONE file, so the
      // browser needs one request instead of a chain of 16 before it can paint.
      if (ext === '.css' && /@import\s/.test(code)) {
        await build({ entryPoints: [src], bundle: true, minify: true, outfile: dst, legalComments: 'none', logLevel: 'error' });
        const outCode = await fs.readFile(dst, 'utf8');
        before += Buffer.byteLength(code);
        saved += Buffer.byteLength(code) - Buffer.byteLength(outCode);
        continue;
      }
      const out = await transform(code, {
        loader: ext === '.js' ? 'js' : 'css',
        minify: true,
        legalComments: 'none',
      });
      before += Buffer.byteLength(code);
      saved += Buffer.byteLength(code) - Buffer.byteLength(out.code);
      await fs.writeFile(dst, out.code);
    } else {
      await fs.copyFile(src, dst);
    }
  }
}


// ---------------------------------------------------------------------------
// Script bundling (dist only). HTML in the repo is never modified.
// ---------------------------------------------------------------------------
const SCRIPT_RE = /<script\s+src="([^"]+\.js)"\s*><\/script>/g;
const GAP_OK = /^\s*(?:<!--(?:(?!-->)[\s\S])*-->\s*)*$/;   // only whitespace / HTML comments between tags (a comment can never contain "-->")
const BUNDLE_DIR = path.join(OUT, 'assets', 'bundles');
const bundleCache = new Map();                    // content hash -> file name
let bundledPages = 0, requestsBefore = 0, requestsAfter = 0;

async function makeBundle(srcs) {
  const parts = [];
  for (const src of srcs) {
    let code = await fs.readFile(path.join(OUT, src), 'utf8');
    if (/^\s*(['"])use strict\1/.test(code)) {
      // A top-level "use strict" would be lost inside try{}: keep strictness by wrapping in a function.
      code = `(function(){${code}\n}).call(this)`;
    }
    parts.push(`try{${code}\n}catch(e){console.error(${JSON.stringify(src)},e)}`);
  }
  const body = parts.join('\n;\n');
  const hash = createHash('sha1').update(body).digest('hex').slice(0, 10);
  const name = `b-${hash}.js`;
  if (!bundleCache.has(hash)) {
    await fs.mkdir(BUNDLE_DIR, { recursive: true });
    await fs.writeFile(path.join(BUNDLE_DIR, name), body);
    bundleCache.set(hash, name);
  }
  return `assets/bundles/${name}`;
}

async function bundlePage(file) {
  const html = await fs.readFile(file, 'utf8');
  const matches = [...html.matchAll(SCRIPT_RE)].filter(m => !/^(https?:)?\/\//.test(m[1]));
  if (matches.length < 2) return;

  // Group neighbouring tags (only whitespace/comments between them).
  const groups = [];
  let cur = null;
  for (const m of matches) {
    const start = m.index, end = m.index + m[0].length;
    if (cur && GAP_OK.test(html.slice(cur.end, start))) { cur.items.push(m[1]); cur.end = end; }
    else { cur = { start, end, items: [m[1]] }; groups.push(cur); }
  }

  let out = '', last = 0;
  for (const g of groups) {
    requestsBefore += g.items.length;
    out += html.slice(last, g.start);
    if (g.items.length < 2) { out += `<script src="${g.items[0]}"></script>`; requestsAfter += 1; }
    else { out += `<script src="${await makeBundle(g.items)}"></script>`; requestsAfter += 1; }
    last = g.end;
  }
  out += html.slice(last);

  // Safety net: bundling may only swap <script src> tags. Every inline <script> must survive untouched.
  const inline = (h) => (h.match(/<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/g) || []).join('\n');
  if (inline(html) !== inline(out)) {
    throw new Error(`Bundling would change inline <script> blocks in ${path.basename(file)}. Aborting build.`);
  }
  await fs.writeFile(file, out);
  bundledPages++;
}

async function bundleAllPages() {
  for (const entry of await fs.readdir(OUT, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html')) await bundlePage(path.join(OUT, entry.name));
  }
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await walk(ROOT);
await bundleAllPages();

// Stylesheet cache-busting: CSS is cached by browsers for a day, so a returning visitor could get NEW html
// with OLD css (unstyled new elements). Add ?v=<hash of all css> to every local stylesheet link.
async function versionCss() {
  const files = [];
  async function list(dir) {
    for (const e of await fs.readdir(dir, { withFileTypes: true })) {
      const f = path.join(dir, e.name);
      if (e.isDirectory()) await list(f); else if (e.name.endsWith('.css')) files.push(f);
    }
  }
  await list(path.join(OUT, 'assets', 'css'));
  files.sort();
  const h = createHash('sha1');
  for (const f of files) h.update(await fs.readFile(f));
  const v = h.digest('hex').slice(0, 10);
  for (const entry of await fs.readdir(OUT, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.html')) continue;
    const file = path.join(OUT, entry.name);
    const html = await fs.readFile(file, 'utf8');
    const out = html.replace(/(<link\b[^>]*\bhref=")((?!https?:|\/\/)[^"?#]*\.css)(")/g, `$1$2?v=${v}$3`);
    if (out !== html) await fs.writeFile(file, out);
  }
}
await versionCss();
console.log(`Bundled scripts on ${bundledPages} pages: ${requestsBefore} script requests -> ${requestsAfter}`);
console.log(`Built ./dist  (JS+CSS: ${(before / 1024).toFixed(0)} KB -> ${((before - saved) / 1024).toFixed(0)} KB, saved ${(saved / 1024).toFixed(0)} KB)`);
