// Pricing page test: REAL home / filter / about / property pages served locally.
// Agent listing: N100,000 accommodation + N50,000 fees (20k service, 10k legal, 20k agency) must show N150,000 everywhere.
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

const LISTING = { id: 'lst_test1', name: 'Test Mini Flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month',
  price: 100000, priceValue: 100000, serviceCharge: 20000, legalFee: 10000, agencyFee: 20000, totalPayable: 150000,
  location: 'Lekki, Lagos', beds: 2, baths: 1, images: ['assets/images/home-properties/miniflat.webp'], agentName: 'Ada Obi', ownerId: 'agent-77',
  status: 'available', approval: { state: 'approved', published: true } };
const HIDDEN = Object.assign({}, LISTING, { id: 'lst_hidden', name: 'Hidden Flat', status: 'in_review', approval: { state: 'pending_review' } });
const SALE = Object.assign({}, LISTING, { id: 'lst_sale', name: 'Big Duplex', category: 'sale', listingType: 'sale', period: '', price: 185000000, priceValue: 185000000, serviceCharge: 0, legalFee: 0, agencyFee: 9250000 });
const storage = { 'accoom-agent-listings': JSON.stringify([LISTING, HIDDEN, SALE]) };

async function open(path) {
  const vc = new VirtualConsole(); const errors = [];
  vc.on('jsdomError', (e) => errors.push((e.detail && e.detail.message) || e.message));
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.fetch = () => Promise.reject(new Error('no fetch'));
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    } });
  await sleep(Number(process.env.WAIT||3500));
  return { w: dom.window, d: dom.window.document, errors };
}

let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

console.log('Catalogue service (the one source every grid reads)');
const home = await open('home.html');
await test('agent listing is in the catalogue at N150,000, unapproved listing is not', () => {
  const all = home.w.Accoom.PropertyService.getAll();
  const mine = all.find((i) => i.id === 'lst_test1');
  assert.equal(mine.price, 150000); assert.equal(mine.priceLabel, '/ month');
  assert.ok(!all.find((i) => i.id === 'lst_hidden'), 'in-review listing must not be public');
  assert.ok(!('agencyFee' in mine) && !('serviceCharge' in mine) && !('legalFee' in mine), 'fees must not travel with the catalogue item');
});
await test('mock listings are unchanged (no invented fees)', () => {
  const m = home.w.Accoom.PropertyService.getById(1);
  assert.equal(m.price, 120000); assert.equal(home.w.Accoom.PropertyService.getAll().filter((i) => typeof i.id === 'number').length, 25);
});
await test('homepage default filters do not hide an inclusive price above the slider (N185,000,000 sale + fees)', async () => {
  const r = await home.w.Accoom.PropertyService.fetchPage(1, 100, 'newest', { priceMin: 100000, priceMax: 1000000, levels: [], beds: [] });
  assert.ok(r.items.find((i) => i.id === 'lst_test1') && r.items.find((i) => i.id === 'lst_sale'));
  assert.equal(r.items.find((i) => i.id === 'lst_sale').price, 194250000);
});
await test('price filters and sorting use the final price', async () => {
  const s = home.w.Accoom.PropertyService;
  const ids = async (f) => (await s.fetchPage(1, 100, 'newest', f)).items.map((i) => i.id);
  assert.ok((await ids({ priceMin: 140000, priceMax: 160000 })).includes('lst_test1'));
  assert.ok(!(await ids({ priceMin: 100000, priceMax: 140000 })).includes('lst_test1'), 'N100,000 base price must not match');
  assert.equal((await ids({}))[0], 'lst_sale'); // newest first still works with text ids
});

console.log('\nHomepage cards');
await test('homepage card shows N150,000 (never N100,000) with its billing period', async () => {
  const w = home.w;
  w.Accoom.showSkeleton = () => {}; w.Accoom.clearSkeleton = () => {}; w.Accoom.hideSkeleton = (el, cb) => cb(); // skip only the loading-skeleton delay; the real home.js card code renders
  w.Accoom.setListingsSearch(''); await sleep(600);
  const card = home.d.querySelector('[data-listing-id="lst_test1"]');
  assert.ok(card, 'agent listing card rendered on the homepage');
  const price = card.querySelector('.listing-price').textContent;
  assert.ok(/150,000/.test(price) && !/100,000/.test(price) && /\/mo/.test(price), price);
  const mockRes = await w.Accoom.PropertyService.fetchPage(1, 100, 'newest', {});
  assert.ok(mockRes.items.some((i) => i.id === 1), 'mock listings still listed');
  w.Accoom.setListingsSearch(''); await sleep(600);
  const mock = [...home.d.querySelectorAll('.listing-card')].filter((c) => /^\d+$/.test(c.getAttribute('data-listing-id'))).map((c) => c.querySelector('.listing-price'))[0];
  assert.ok(mock && /\/yr/.test(mock.textContent) && !/\/mo/.test(mock.textContent), 'mock card keeps its /yr label: ' + (mock && mock.textContent));
});

console.log('\nProperty page (details + payment total)');
const prop = await open('property.html?id=lst_test1');
await test('details page: price N150,000, fees say Included, total N150,000, month period', () => {
  const t = (sel) => prop.d.querySelector(sel).textContent.trim();
  assert.equal(t('[data-pd-price]'), '\u20A6150,000'); assert.equal(t('[data-pd-price-rent]'), '\u20A6150,000'); assert.equal(t('[data-pd-price-total]'), '\u20A6150,000');
  for (const k of ['service', 'legal', 'agency']) assert.equal(t('[data-pd-price-' + k + ']'), 'Included');
  assert.ok(/month/i.test(prop.d.querySelector('.pd-price-details-card').textContent) && !/100,000|20,000|10,000/.test(prop.d.querySelector('.pd-price-details-card').textContent));
});

console.log('\nCheckout record');
await test('a payment for the listing is N150,000 (fees not added again)', async () => {
  const doc = await open('document-centre.html');
  const r = await doc.w.Accoom.Transactions.recordDemoPayment({ eventId: 'e1', listingId: 'lst_test1', customerId: 'c1', customerName: 'Chinedu', periodCount: 1, startDate: '2026-01-31' });
  assert.equal(r.transaction.amounts.total, 150000); assert.equal(r.transaction.amounts.price, 150000);
  assert.equal(r.transaction.amounts.agencyFee, 0); assert.equal(r.transaction.amounts.legalFee, 0);
});

console.log('\n' + p + ' passed, ' + f + ' failed');
server.close();
process.exit(f ? 1 : 0);
