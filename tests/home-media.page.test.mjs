// Agent photos are stored as "idb:<key>" references. The homepage cards must show the real photo,
// not the raw reference (which made cards blank). Uses the REAL home.html with a seeded media store.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { localResourceOptions } from './local-resources.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0])); const b = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const LISTING = { id: 'lst_img', name: 'Photo Flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'day', price: 360000, priceValue: 360000,
  location: 'Akungba, Ondo', beds: 3, baths: 1, images: ['idb:k1', 'idb:k2'], cover: 'idb:k1', agentName: 'Adeola', ownerId: 'a1', schemaVersion: 2,
  status: 'available', approval: { state: 'approved', published: true, verified: true } };

const vc = new VirtualConsole();
const dom = await JSDOM.fromURL(base + '/home.html', { runScripts: 'dangerously', resources: localResourceOptions(base), pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    const idb = new IDBFactory(); w.indexedDB = idb; w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
    w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.fetch = () => Promise.reject(new Error('no fetch'));
    let n = 0; w.URL.createObjectURL = () => 'blob:test/photo-' + (++n); w.URL.revokeObjectURL = () => {};
    w.localStorage.setItem('accoom-agent-listings', JSON.stringify([LISTING]));
    // seed the media store the way the listing form does
    const req = idb.open('accoom-media', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('videos');
    req.onsuccess = () => { const tx = req.result.transaction('videos', 'readwrite'); ['k1', 'k2'].forEach((k) => tx.objectStore('videos').put(new w.Blob(['img-' + k], { type: 'image/jpeg' }), k)); };
  } });
await sleep(3500);
const w = dom.window, d = w.document;
w.Accoom.showSkeleton = () => {}; w.Accoom.clearSkeleton = () => {}; w.Accoom.hideSkeleton = (el, cb) => cb();
w.Accoom.setListingsSearch(''); await sleep(1000);

let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
console.log('Homepage card photos');
await test('card for an agent listing shows real photos, never an idb: reference', () => {
  const card = d.querySelector('[data-listing-id="lst_img"]');
  assert.ok(card, 'card rendered');
  const srcs = [...card.querySelectorAll('img.media-slide')].map((i) => i.getAttribute('src'));
  assert.equal(srcs.length, 2);
  for (const s of srcs) assert.ok(/^blob:/.test(s), 'slide src should be a displayable address, got ' + s);
  assert.ok(!/idb:/.test(card.outerHTML), 'no raw idb: reference left in the card');
});
await test('demo listings keep their normal image paths', () => {
  const demo = [...d.querySelectorAll('.listing-card')].find((c) => /^\d+$/.test(c.getAttribute('data-listing-id')));
  assert.ok(/assets\/images\/home-properties\//.test(demo.querySelector('img.media-slide').getAttribute('src')));
});
console.log('\n' + p + ' passed, ' + f + ' failed');
server.close(); process.exit(f ? 1 : 0);
