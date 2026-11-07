// Auto-approve test (TESTING-ONLY flag in listing-review.js): a successfully submitted agent listing
// is approved + verified + published at once and shows on the homepage, Browse, Search and its details page,
// at its inclusive price, next to the 25 demo listings. Unsubmitted / unapproved listings stay private.
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

const mk = (over) => Object.assign({ category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', location: 'Lekki, Lagos',
  beds: 2, baths: 1, images: ['assets/images/home-properties/miniflat.webp'], agentName: 'Ada Obi', ownerId: 'agent-77',
  price: 100000, priceValue: 100000, serviceCharge: 20000, legalFee: 10000, agencyFee: 20000, schemaVersion: 2,
  status: 'in_review', approval: { state: 'draft', published: false, history: [] }, documentation: { answers: {} } }, over);
const NEW = mk({ id: 'lst_new', name: 'Fresh Agent Flat' });
const DRAFT = mk({ id: 'lst_draft', name: 'Draft Only Flat' });
const PENDING = mk({ id: 'lst_pending', name: 'Pending Flat', approval: { state: 'pending_review', published: false, history: [] } });
const REJECTED = mk({ id: 'lst_rej', name: 'Rejected Flat', approval: { state: 'rejected', published: false, history: [] } });
const HELD = mk({ id: 'lst_hold', name: 'Approved But Unpublished Flat', status: 'hold', approval: { state: 'approved', published: false, history: [] } });
const storage = { 'accoom-agent-listings': JSON.stringify([NEW, DRAFT, PENDING, REJECTED, HELD]) };

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
  await sleep(Number(process.env.WAIT || 3500));
  return { w: dom.window, d: dom.window.document, errors };
}

let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

console.log('Before submitting: nothing unapproved is public');
const doc = await open('document-centre.html');
const RV = doc.w.Accoom.ListingReview;
await test('draft / pending / rejected / approved-but-unpublished listings are not in the catalogue', () => {
  const ids = doc.w.Accoom.PropertyService.getAll().map((i) => String(i.id));
  for (const id of ['lst_new', 'lst_draft', 'lst_pending', 'lst_rej', 'lst_hold']) assert.ok(!ids.includes(id), id + ' leaked');
  assert.equal(ids.filter((i) => /^\d+$/.test(i)).length, 25, 'demo listings still there');
});

console.log('\nSubmitting an agent listing (documents complete)');
await test('auto-approve is a single flag, on for testing', () => assert.equal(RV.AUTO_APPROVE.enabled, true));
let saved;
await test('submitForReview approves, verifies and publishes the listing; history shows each step', async () => {
  await doc.w.Accoom.DocumentStore.add({ file: new doc.w.File(['%PDF-1.4\nx'], 'own.pdf', { type: 'application/pdf' }), listingId: 'lst_new', ownerId: 'agent-77', docType: 'ownership_or_authorization' });
  saved = await RV.submitForReview('lst_new', { role: 'agent', id: 'agent-77' });
  assert.equal(saved.approval.state, 'approved'); assert.equal(saved.approval.published, true); assert.equal(saved.approval.verified, true);
  assert.equal(saved.status, 'available'); assert.ok(RV.isPubliclyVisible(saved));
  assert.equal(JSON.stringify(saved.approval.history.map((h) => h.to)), JSON.stringify(['pending_review', 'manual_review', 'approved']));
  assert.equal(saved.approval.approvedBy, 'auto-approve-testing');
  assert.ok(!doc.w.Accoom.PropertyService.getAll().some((i) => i.id === 'lst_draft'), 'other listings stay private');
});
await test('with the flag off, a submission waits for a real admin (future workflow)', async () => {
  RV.AUTO_APPROVE.enabled = false;
  const rec = JSON.parse(doc.w.localStorage.getItem('accoom-agent-listings')); const i = rec.findIndex((l) => l.id === 'lst_draft');
  await doc.w.Accoom.DocumentStore.add({ file: new doc.w.File(['%PDF-1.4\ny'], 'own2.pdf', { type: 'application/pdf' }), listingId: 'lst_draft', ownerId: 'agent-77', docType: 'ownership_or_authorization' });
  const r = await RV.submitForReview('lst_draft', { role: 'agent', id: 'agent-77' });
  assert.equal(r.approval.state, 'pending_review'); assert.equal(RV.isPubliclyVisible(r), false);
  await RV.transition('lst_draft', 'manual_review', { role: 'system' }); // real review step first
  const a = await RV.approve('lst_draft', { role: 'admin', id: 'real-admin' });
  assert.equal(a.approval.published, true); assert.ok(!a.approval.verified, 'plain admin approve does not mark verified');
  RV.AUTO_APPROVE.enabled = true;
});

// carry the saved state into fresh page loads (draft listing was approved by the admin step above, drop it again)
const stored = JSON.parse(doc.w.localStorage.getItem('accoom-agent-listings')).filter((l) => l.id !== 'lst_draft');
storage['accoom-agent-listings'] = JSON.stringify(stored);

console.log('\nHomepage');
const home = await open('home.html');
await test('homepage shows the new listing at N150,000 / mo and keeps demo listings', async () => {
  const w = home.w;
  w.Accoom.showSkeleton = () => {}; w.Accoom.clearSkeleton = () => {}; w.Accoom.hideSkeleton = (el, cb) => cb();
  w.Accoom.setListingsSearch(''); await sleep(600);
  const card = home.d.querySelector('[data-listing-id="lst_new"]');
  assert.ok(card, 'new listing card on homepage');
  const price = card.querySelector('.listing-price').textContent;
  assert.ok(/150,000/.test(price) && !/100,000/.test(price) && /\/mo/.test(price), price);
  assert.ok([...home.d.querySelectorAll('.listing-card')].some((c) => /^\d+$/.test(c.getAttribute('data-listing-id'))), 'demo cards still render');
  for (const id of ['lst_pending', 'lst_rej', 'lst_hold']) assert.ok(!home.d.querySelector('[data-listing-id="' + id + '"]'), id + ' must not render');
});

console.log('\nSearch, filters, sorting (shared catalogue)');
await test('search finds it by name; price / verified / sort filters behave', async () => {
  const S = home.w.Accoom.PropertyService;
  assert.ok(S.searchList(S.getAll(), 'Fresh Agent Flat').items.some((i) => i.id === 'lst_new'));
  assert.ok(S.searchList(S.getAll(), 'mini flat lekki').items.some((i) => i.id === 'lst_new'));
  const ids = async (flt, sort) => (await S.fetchPage(1, 100, sort || 'newest', flt)).items.map((i) => i.id);
  assert.ok((await ids({ priceMin: 140000, priceMax: 160000 })).includes('lst_new'));
  assert.ok(!(await ids({ priceMin: 100000, priceMax: 140000 })).includes('lst_new'));
  assert.ok((await ids({ verifiedOnly: true })).includes('lst_new'), 'verified listing passes the verified filter');
  assert.ok((await ids({ beds: [2] })).includes('lst_new'));
  assert.equal((await ids({}))[0], 'lst_new', 'newest first');
  assert.equal(S.getAll().find((i) => i.id === 'lst_new').verified, true);
});

console.log('\nBrowse page');
const browse = await open('filter-accommodation.html');
await test('Browse filters count the new listing with the 25 demo ones (same catalogue), none unapproved', async () => {
  const r = await browse.w.Accoom.PropertyService.fetchPage(1, 100, 'newest', {});
  assert.ok(r.items.some((i) => i.id === 'lst_new') && r.items.some((i) => i.id === 1));
  assert.equal(r.total, 26);
  assert.equal(browse.d.querySelector('[data-filter-result-count]').textContent.trim(), '26');
  assert.ok(/Mini Flat/.test(browse.d.querySelector('[data-filter-sections]').textContent), 'its type is offered as a filter');
});

console.log('\nDetails page');
const prop = await open('property.html?id=lst_new');
await test('details page opens the right listing at the inclusive price', () => {
  const t = (sel) => prop.d.querySelector(sel).textContent.trim();
  assert.ok(/Fresh Agent Flat/.test(prop.d.body.textContent));
  assert.equal(t('[data-pd-price]'), '\u20A6150,000'); assert.equal(t('[data-pd-price-total]'), '\u20A6150,000');
  for (const k of ['service', 'legal', 'agency']) assert.equal(t('[data-pd-price-' + k + ']'), 'Included');
});
const hidden = await open('property.html?id=lst_pending');
await test('an unapproved listing id does not open as a public property', () => {
  assert.ok(!/Pending Flat/.test(hidden.d.body.textContent));
});

console.log('\n' + p + ' passed, ' + f + ' failed');
server.close();
process.exit(f ? 1 : 0);
