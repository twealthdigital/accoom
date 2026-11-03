/* ==========================================================================
   ACCOOM build: makes a minified copy of the site in ./dist

   Usage:   npm install   (first time only)
            npm run build

   - Minifies every .js and .css file, except third-party files in vendor/ (same file names, same load order, so
     the HTML does not change).
   - Copies .html, partials, images, videos and everything else as they are.
   - Your source files are never modified. Deploy the ./dist folder.
   ========================================================================== */
import { build, transform } from 'esbuild';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'dist');
const SKIP = new Set(['node_modules', 'dist', '.git', '.vscode', 'package.json', 'package-lock.json', 'build.mjs', 'README.md', '.gitignore']);

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

await fs.rm(OUT, { recursive: true, force: true });
await fs.mkdir(OUT, { recursive: true });
await walk(ROOT);
console.log(`Built ./dist  (JS+CSS: ${(before / 1024).toFixed(0)} KB -> ${((before - saved) / 1024).toFixed(0)} KB, saved ${(saved / 1024).toFixed(0)} KB)`);
