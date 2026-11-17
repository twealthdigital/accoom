// Permissions Stage 4: sender-side payment visibility against the REAL test server and real pages.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { localResourceOptions } from './local-resources.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const PORT = 3950 + Math.floor(Math.random() * 250);
const base = 'http://127.0.0.1:' + PORT;
const dataDir = await mkdtemp(join(tmpdir(), 'accoom-e2e-'));
const srv = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), ACCOOM_DATA: dataDir }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/api/ping')).ok) break; } catch { /* starting */ } await sleep(100); }

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const mk = (id, name, agentName) => ({ id, name, location: 'Akungba, Ondo', area: 'Akungba', state: 'Ondo', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month',
  price: 100000, priceValue: 100000, serviceCharge: 10000, agencyFee: 5000, legalFee: 5000, totalPayable: 120000,
  images: [PNG, 'assets/images/home-properties/miniflat.webp'], cover: PNG, agentName, ownerId: 'local-agent', schemaVersion: 2, status: 'available',
  approval: { state: 'approved', published: true, verified: true, history: [] }, documentation: { answers: {} },
  beds: 2, baths: 1, description: [], amenities: [], quickFacts: [], dateAdded: 'Nov 8, 2026', views: '0' });
const LST_A = mk('lst_a', 'Akungba Flat', 'Adeola Fortune');
const LST_B = mk('lst_b', 'Bola Duplex', 'Bola Agent');

const windows = [];
async function browser(path, storage) {
  const vc = new VirtualConsole();
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: localResourceOptions(base), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
      w.fetch = (u, o) => { const options = Object.assign({}, o); delete options.signal; return fetch(new URL(u, base), options); };
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    } });
  windows.push(dom.window);
  await sleep(2500);
  return dom.window;
}
let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const j = async (path) => (await fetch(base + path)).json();
const post = (id, body) => fetch(base + '/api/conversations/' + id + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const stash = (w) => Object.fromEntries(Array.from({ length: w.localStorage.length }, (_, i) => w.localStorage.key(i)).map((k) => [k, w.localStorage.getItem(k)]));
const send = (w, text) => { const d = w.document; d.querySelector('[data-msgs-input]').value = text; d.querySelector('[data-msgs-composer]').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); };
const clickEv = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
// Agent offers, "paid and pending approval", automatic credit to the seller on approval, and SOLD handling.
const agentA = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Adeola Fortune', email: 'adeola@example.com', agentProfileCompleted: true }), 'accoom-agent-listings': JSON.stringify([LST_A]) };
const customer = { 'accoom-user': JSON.stringify({ role: 'customer', name: 'Chidi Okeke', email: 'chidi@example.com' }) };
const customer2 = { 'accoom-user': JSON.stringify({ role: 'customer', name: 'Dayo Bello', email: 'dayo@example.com' }) };

let w = await browser('home.html', agentA); await sleep(2500); w.close();
const keyA = (await j('/api/listings')).listings.filter((l) => l.id === 'lst_a')[0].agentKey;
assert.ok(keyA);
const reqToA = { agentName: 'Adeola Fortune', agentKey: keyA, ownerId: keyA, verified: true, property: { id: 'lst_a', name: 'Akungba Flat', price: '120000', image: '' }, agentProperties: [] };
const text = (win, sel) => (win.document.querySelector(sel) || { textContent: '' }).textContent;
const visible = (win, sel) => { const el = win.document.querySelector(sel); return !!el && !el.classList.contains('is-hidden') && !el.hidden; };

let cust = await browser('contact-agent.html', { ...customer, 'accoom-contact-request': JSON.stringify(reqToA) });
cust.Accoom.creditWallet(500000, 'test funds'); await sleep(300);
send(cust, 'Hello, is the flat still available?'); await sleep(1200);
let seller = await browser('messages.html', agentA); await sleep(1500);
const walletBefore = seller.Accoom.getWalletBalance();

console.log('Seller creates an offer');
await test('seller sees the Create offer bar; customer does not', () => {
  assert.ok(visible(seller, '[data-msgs-deal-bar]'), 'deal bar hidden for seller');
  assert.ok(!visible(cust, '[data-msgs-deal-bar]'), 'deal bar visible for customer');
});
await test('seller sends a 90,000 offer', async () => {
  clickEv(seller, seller.document.querySelector('[data-msgs-offer-btn]'));
  const ov = seller.document.querySelector('.msgs-payment-modal-overlay.is-open [data-offer-amount]');
  assert.ok(ov, 'offer dialog missing');
  ov.value = '90000';
  clickEv(seller, seller.document.querySelector('[data-offer-send]'));
  await sleep(1200);
  const c = (await j('/api/conversations?key=' + keyA)).conversations[0];
  const last = c.messages[c.messages.length - 1];
  assert.equal(last.kind, 'offer'); assert.equal(last.data.amount, 90000);
  assert.match(text(seller, '[data-msgs-deal-status]'), /Offer sent/);
});
await test('customer receives the offer card and accepts it: dialog shows the offer price, not the listing price', async () => {
  await sleep(3500);
  const card = cust.document.querySelector('[data-offer-card]');
  assert.ok(card, 'offer card missing'); assert.match(card.textContent, /90,000/);
  clickEv(cust, cust.document.querySelector('[data-offer-accept]'));
  assert.ok(cust.document.querySelector('.msgs-payment-modal-overlay.is-open'));
  assert.match(text(cust, '[data-msgs-payment-amount]'), /90,000/);
});
const custBefore = cust.Accoom.getWalletBalance();
await test('customer pays: debited 90,000 and the seller sees Paid · pending approval (no credit yet)', async () => {
  clickEv(cust, cust.document.querySelector('[data-msgs-payment-confirm]'));
  await sleep(3800);
  assert.equal(cust.Accoom.getWalletBalance(), custBefore - 90000);
  await sleep(3500);
  assert.match(text(seller, '[data-msgs-deal-status]'), /pending approval/i);
  assert.ok(visible(seller, '[data-msgs-deal-bar]'));
  assert.equal(seller.Accoom.getWalletBalance(), walletBefore, 'seller credited before approval');
  assert.ok(!seller.document.querySelector('[data-msgs-offer-btn]').offsetParent === false || seller.document.querySelector('[data-msgs-offer-btn]').hidden, 'offer button still offered while paid');
});
await test('customer approves: seller is credited 90,000 automatically, once', async () => {
  clickEv(cust, cust.document.querySelector('[data-msgs-property-approve-btn]'));
  await sleep(2600);
  assert.equal(cust.Accoom.getWalletBalance(), custBefore - 90000, 'customer money should stay gone');
  await sleep(3800);
  assert.equal(seller.Accoom.getWalletBalance(), walletBefore + 90000);
  assert.match(text(seller, '[data-msgs-deal-status]'), /Approved/);
  await sleep(3500);
  assert.equal(seller.Accoom.getWalletBalance(), walletBefore + 90000, 'credited twice');
  const tx = seller.Accoom.getWalletTransactions().filter((t) => t.category === 'sale');
  assert.equal(tx.length, 1);
});
await test('the listing is sold: server, seller storage, marketplace', async () => {
  const l = (await j('/api/listings')).listings.filter((x) => x.id === 'lst_a')[0];
  assert.equal(l.status, 'sold');
  assert.ok((await j('/api/sold')).sold.includes('lst_a'));
  const mine = JSON.parse(seller.localStorage.getItem('accoom-agent-listings')).filter((x) => x.id === 'lst_a')[0];
  assert.equal(mine.status, 'sold');
  const other = await browser('home.html', customer2); await sleep(2000);
  const onMarket = other.Accoom.PropertyService.getAll().some((x) => String(x.id) === 'lst_a');
  const byId = other.Accoom.PropertyService.getById('lst_a');
  other.close();
  assert.ok(!onMarket, 'sold listing still on the marketplace');
  assert.ok(byId && byId.sold, 'sold listing lost its details page');
});
await test('after the sale the buyer and seller can still message each other (chat is kept)', async () => {
  assert.ok(cust.document.querySelectorAll('[data-msgs-thread] .msgs-row').length > 3, 'buyer chat was cleared');
  assert.ok(!cust.document.querySelector('[data-msgs-composer]').classList.contains('is-hidden'), 'buyer composer hidden');
  send(cust, 'Thanks, when can I collect the keys?'); await sleep(1200);
  send(seller, 'Tomorrow morning works.'); await sleep(1200);
  await sleep(3500);
  assert.match(cust.document.querySelector('[data-msgs-thread]').textContent, /Tomorrow morning/);
  assert.match(seller.document.querySelector('[data-msgs-thread]').textContent, /collect the keys/);
});
await test('another customer cannot pay for it (server refuses)', async () => {
  const r = await post('c-lst_a-someone', { senderKey: 'someone', message: { id: 'x1', text: 'paid', kind: 'paid', data: { propertyId: 'lst_a', amount: 90000 } }, meta: { agentKey: keyA, customerKey: 'someone', propertyId: 'lst_a', propertyName: 'Akungba Flat' } });
  assert.equal(r.status, 409);
});
await test('property page shows Sold and no payment button', async () => {
  const pg = await browser('property.html?id=lst_a', customer2); await sleep(1500);
  const note = pg.document.querySelector('[data-pd-sold-note]');
  const pay = pg.document.querySelector('[data-pd-payment]');
  const contact = pg.document.querySelector('[data-pd-contact-agent]');
  const ok = !!note && (!pay || pay.style.display === 'none') && !!contact && contact.style.display !== 'none';
  pg.close();
  assert.ok(ok, 'sold state missing on property page');
});
await test('agent profile lists it under Sold, with a Sold tag', async () => {
  const pr = await browser('agent-profile.html', { ...customer2, 'accoom-active-agent': JSON.stringify({ real: true, name: 'Adeola Fortune', ownerId: keyA, agentKey: keyA, verified: true, avatar: '', stats: '', rating: '', level: 'AL1' }) }); await sleep(1500);
  const html = pr.document.querySelector('[data-ap-panel="sold"]') ? pr.document.querySelector('[data-ap-panel="sold"]').innerHTML : '';
  const avail = pr.document.querySelector('[data-ap-panel="available"]') ? pr.document.querySelector('[data-ap-panel="available"]').innerHTML : '';
  pr.close();
  assert.match(html, /Akungba Flat/); assert.ok(!/Akungba Flat/.test(avail));
});

srv.kill();
windows.forEach((x) => { try { x.close(); } catch { /* ignore */ } });
await rm(dataDir, { recursive: true, force: true });
console.log('\n' + p + ' passed, ' + f + ' failed');
process.exit(f ? 1 : 0);
