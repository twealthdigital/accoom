// Property details page shows only agent-entered content.
// (header from home-media test)
// Agent photos are stored as "idb:<key>" references. The homepage cards must show the real photo,
// not the raw reference (which made cards blank). Uses the REAL home.html with a seeded media store.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0])); const b = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));


const BASE = { category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', price: 100000, priceValue: 100000,
  images: ['assets/images/home-properties/miniflat.webp'], agentName: 'Adeola', ownerId: 'a1', schemaVersion: 2, status: 'available',
  approval: { state: 'approved', published: true, verified: true }, dateAdded: 'Nov 7, 2026', views: '0' };
const FULL = Object.assign({}, BASE, { id: 'lst_full', name: 'Akungba Flat', location: 'Akungba, Ondo', area: 'Akungba', state: 'Ondo', address: '12 Test Street',
  beds: 3, baths: 1, kitchens: 1, livingRooms: 0, parking: 0, furnishing: 'Furnished', yearBuilt: '2021',
  description: ['First paragraph by the agent.', 'Second paragraph by the agent.'],
  amenities: ['Wardrobes', 'Water Heater'], quickFacts: [{ icon: 'check', text: 'Near the market' }] });
const BARE = Object.assign({}, BASE, { id: 'lst_bare', name: 'Bare Flat', location: 'Yaba, Lagos', beds: 1, baths: 1, description: [], amenities: [], quickFacts: [] });
const storage = { 'accoom-agent-listings': JSON.stringify([FULL, BARE]) };

async function open(path) {
  const vc = new VirtualConsole();
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.fetch = () => Promise.reject(new Error('no fetch'));
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    } });
  await sleep(3000);
  return dom.window.document;
}
const vis = (el) => !!el && el.style.display !== 'none' && !el.closest('[style*="display: none"]');
const textOf = (d) => [...d.querySelectorAll('.pd-content, .pd-overview-card, [data-pd-quickfact-beds]')].filter((e) => vis(e)).map((e) => e.textContent).join(' ');
const SAMPLE = [/24\/7 Security/, /Constant Power/, /Borehole Water/, /Pop Ceiling/, /Tiled Floor/, /Guest Toilet/, /CCTV/, /Electric Fence/, /beautifully built/, /Lekki Phase 1/, /Heat Extractor/, /Ideal for families/];

let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

console.log('Agent listing with details');
const d = await open('property.html?id=lst_full');
await test('shows only what the agent entered; no sample text anywhere', () => {
  const t = textOf(d);
  for (const re of SAMPLE) assert.ok(!re.test(t), 'sample text leaked: ' + re);
  assert.ok(/First paragraph by the agent/.test(t) && /Second paragraph by the agent/.test(t));
  assert.deepEqual([...d.querySelectorAll('.pd-amenity')].map((e) => e.textContent.trim()), ['Wardrobes', 'Water Heater']);
  assert.ok(/Near the market/.test(d.querySelector('.pd-quickfacts').textContent));
});
await test('counts follow the form: 3 bed, 1 bath, 1 kitchen; living room and parking (0) are hidden', () => {
  const shown = (sel) => vis(d.querySelector(sel).closest('.pd-quickfact'));
  assert.equal(d.querySelector('[data-pd-quickfact-beds]').textContent, '3 Bedrooms');
  assert.equal(d.querySelector('[data-pd-quickfact-baths]').textContent, '1 Bathroom');
  assert.ok(shown('[data-pd-quickfact-kitchens]')); assert.ok(!shown('[data-pd-quickfact-livingrooms]')); assert.ok(!shown('[data-pd-quickfact-parking]'));
  assert.ok(!vis(d.querySelector('[data-pd-overview-parking-row]')));
});
await test('overview, map and agent card use the listing', () => {
  const ov = d.querySelector('.pd-overview-card').textContent;
  assert.ok(/Furnished/.test(ov) && /2021/.test(ov) && /Nov 7, 2026/.test(ov));
  assert.ok(/12%20Test%20Street/.test(d.querySelector('[data-pd-map-iframe]').getAttribute('src')) && /Akungba/.test(d.querySelector('[data-pd-map-iframe]').getAttribute('src')));
  assert.ok(/12 Test Street, Akungba, Ondo/.test(d.querySelector('[data-pd-map-address]').textContent));
  assert.ok(!/Deals|David O/.test(d.querySelector('[data-pd-agent-stats]').textContent + d.querySelector('[data-pd-agent-name-text]').textContent));
  assert.equal(d.querySelector('[data-pd-agent-name-text]').textContent, 'Adeola');
});

console.log('\nAgent listing with nothing optional filled in');
const b = await open('property.html?id=lst_bare');
await test('empty description / amenities / facts are hidden, not replaced by samples', () => {
  assert.ok(!vis(b.querySelector('[data-pd-description-block]')));
  assert.ok(!vis(b.querySelector('[data-pd-amenities-block]')));
  const t = textOf(b); for (const re of SAMPLE) assert.ok(!re.test(t), 'sample text leaked: ' + re);
  assert.equal(b.querySelectorAll('.pd-quickfacts .pd-quickfact:not([data-pd-qf-count])').length, 0);
  assert.ok(!vis(b.querySelector('[data-pd-overview-furnishing-row]')) && !vis(b.querySelector('[data-pd-overview-year-row]')));
});

console.log('\nDemo listing');
const demo = await open('property.html?id=1');
await test('demo listings keep their sample content', () => {
  assert.ok(vis(demo.querySelector('[data-pd-amenities-block]')) && /Pop Ceiling/.test(demo.body.textContent));
});
console.log('\n' + p + ' passed, ' + f + ' failed');
server.close(); process.exit(f ? 1 : 0);
