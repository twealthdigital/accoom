// Real agents (new listings) show no dummy rating, reviews, bio, sample cards or suggested agents.
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



const L = { id: 'lst_a', name: 'Akungba Flat', location: 'Akungba, Ondo', area: 'Akungba', state: 'Ondo', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month',
  price: 100000, priceValue: 100000, images: ['assets/images/home-properties/miniflat.webp','assets/images/home-properties/selfcon1.webp','assets/images/home-properties/selfcon2.webp'], video: 'assets/videos/home-properties/selfcon2.mp4', videosAll: ['assets/videos/home-properties/selfcon2.mp4'], agentName: 'Adeola Fortune', ownerId: 'local-agent', schemaVersion: 2, status: 'available',
  approval: { state: 'approved', published: true, verified: true }, beds: 2, baths: 1, description: [], amenities: [], quickFacts: [], dateAdded: 'Nov 7, 2026', views: '0' };
const storage = { 'accoom-agent-listings': JSON.stringify([L]),
  'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Adeola Fortune', about: 'I list homes in Ondo.', languages: ['English', 'Yoruba'], agentProfileCompleted: true }) };

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
  return dom.window;
}
let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const txt = (d, sel) => (d.querySelector(sel) || {}).textContent || '';

console.log('Real agent: property page');
let w = await open('property.html?id=lst_a'); let d = w.document;
await test('agent card shows real name, 1 Property, No reviews yet; no sample agents', () => {
  assert.equal(txt(d, '[data-pd-agent-name-text]').trim(), 'Adeola Fortune');
  assert.match(txt(d, '[data-pd-agent-stats]'), /^1 Property$/);
  assert.match(txt(d, '[data-pd-agent-rating]'), /No reviews yet/);
  assert.equal(d.querySelector('.pd-suggested'), null);
});

console.log('Real agent: profile page');
storage['accoom-active-agent'] = JSON.stringify({ name: 'Adeola Fortune', real: true, ownerId: 'local-agent', verified: true, avatar: 'assets/images/agent-images/agenticonimg.webp', level: 'AL1', property: { id: 'lst_a', name: 'Akungba Flat' } });
w = await open('agent-profile.html');
d = w.document;
await test('no dummy stats, rating, reviews, sample cards or sample bio', () => {
  const page = d.body.textContent;
  for (const re of [/David O\./, /12 Properties/, /24 Deals/, /4\.8 \(120/, /Akin M\./, /Tolu B\./, /Lekki Phase 1/, /Dedicated to helping you find/, /professional real estate agent with years/]) assert.ok(!re.test(page), 'dummy leaked: ' + re);
  assert.match(txt(d, '[data-ap-name]'), /Adeola Fortune/);
  assert.match(txt(d, '[data-ap-stats]'), /^1 Property$/);
  assert.match(txt(d, '[data-ap-rating]'), /No reviews yet/);
});
await test('shows the agent\'s real listing and real details only', () => {
  assert.equal(d.querySelectorAll('[data-ap-panel="available"] .ap-listing-card').length, 1);
  assert.equal(d.querySelector('[data-ap-tab="inprogress"]'), null, 'In Progress tab should be gone');
  assert.equal(d.querySelectorAll('[data-ap-panel="sold"] .ap-listing-card').length, 0);
  assert.match(d.body.textContent, /I list homes in Ondo\./);
  assert.match(txt(d, '[data-ap-languages]'), /English, Yoruba/);
});

await test('card carries every photo and video; Contact button sits under the description', () => {
  assert.equal(d.querySelectorAll('[data-ap-panel="available"] .media-slide').length, 4);
  assert.equal(d.querySelectorAll('[data-ap-panel="available"] video.media-slide').length, 1);
  const main = d.querySelector('.ap-header-main');
  assert.ok(main && main.querySelector('.ap-about') && main.querySelector('[data-ap-contact]'));
});

console.log('Reviews');
storage['accoom-agent-reviews'] = JSON.stringify([
  { id: 'r1', agentKey: 'id:local-agent', agentName: 'Adeola Fortune', propertyId: 'lst_a', reviewerId: 'x', reviewerName: 'Tunde B.', rating: 5, text: 'Honest and quick.', createdAt: new Date().toISOString() },
  { id: 'r2', agentKey: 'id:local-agent', agentName: 'Adeola Fortune', propertyId: 'lst_a', reviewerId: 'y', reviewerName: 'Ngozi A.', rating: 4, text: '', createdAt: new Date().toISOString() }]);
w = await open('agent-profile.html'); d = w.document;
await test('profile shows average rating and written reviews', () => {
  assert.match(txt(d, '[data-ap-rating]'), /4\.5 \(2 reviews\)/);
  assert.match(d.querySelector('.ap-reviews-list').textContent, /Honest and quick\./);
  assert.equal(d.querySelectorAll('.ap-reviews-list .ap-review').length, 2);
});
w = await open('home.html'); d = w.document;
await test('home card shows the real rating after reviews', () => {
  assert.match(d.querySelector('[data-listing-id="lst_a"]').textContent, /4\.5 \(2\)/);
});
await test('Reviews.save keeps one review per customer per property (edit, not duplicate)', () => {
  const R = w.Accoom.Reviews;
  const a = R.save({ agentKey: 'id:z', agentName: 'Z', propertyId: 'p1', rating: 3, text: 'ok' });
  const b = R.save({ agentKey: 'id:z', agentName: 'Z', propertyId: 'p1', rating: 5, text: 'better' });
  assert.equal(a.id, b.id); assert.equal(R.forAgent('id:z').length, 1); assert.equal(R.summary('id:z').avg, 5);
  assert.equal(R.save({ agentKey: 'id:z', propertyId: 'p2', rating: 0 }), null);
});

await test('review dialog: needs stars, then saves rating + text', () => {
  const R = w.Accoom.Reviews; let saved = null;
  R.openModal({ agentKey: 'id:q', agentName: 'Q', propertyId: 'p9', propertyName: 'Flat', onSaved: (r) => { saved = r; } });
  const doc = w.document;
  doc.querySelector('[data-rv-send]').click();
  assert.match(doc.querySelector('.rv-err').textContent, /star rating/);
  doc.querySelector('.rv-star[data-v="4"]').click();
  doc.querySelector('.rv-text').value = 'Smooth deal';
  doc.querySelector('[data-rv-send]').click();
  assert.ok(saved && saved.rating === 4 && saved.text === 'Smooth deal');
  assert.ok(doc.querySelector('.rv-modal.is-success .rv-check'), 'shows the animated success tick');
  assert.match(doc.querySelector('.rv-modal.is-success').textContent, /will be updated/);
  doc.querySelector('.rv-overlay').remove();
});

await test('review dialog opens with the star the customer tapped already selected', () => {
  w.Accoom.Reviews.openModal({ agentKey: 'id:q2', agentName: 'Q2', propertyId: 'p10', rating: 3 });
  const on = [...w.document.querySelectorAll('.rv-star.is-on')].length;
  w.document.querySelector('[data-rv-later]').click();
  assert.equal(on, 3);
});

delete storage['accoom-agent-reviews'];
console.log('Real agent: homepage card');
w = await open('home.html'); d = w.document;
await test('card shows No reviews yet instead of 0 (0)', () => {
  const card = d.querySelector('[data-listing-id="lst_a"]');
  assert.ok(card, 'card missing');
  assert.match(card.textContent, /No reviews yet/);
  assert.ok(!/0 \(0\)/.test(card.textContent));
});

console.log('\n' + p + ' passed, ' + f + ' failed');
server.close(); process.exit(f ? 1 : 0);
