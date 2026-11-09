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
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
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

const agentA = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Adeola Fortune', email: 'adeola@example.com', agentProfileCompleted: true }), 'accoom-agent-listings': JSON.stringify([LST_A]) };
const agentB = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Bola Agent', email: 'bola@example.com', agentProfileCompleted: true }), 'accoom-agent-listings': JSON.stringify([LST_B]) };
const customer = { 'accoom-user': JSON.stringify({ role: 'customer', name: 'Chidi Okeke', email: 'chidi@example.com' }) };

// Both agents publish a listing; this also gives us their real owner keys.
let w = await browser('home.html', agentA); await sleep(2500); w.close();
w = await browser('home.html', agentB); await sleep(2500); w.close();
const listings = (await j('/api/listings')).listings;
const keyA = listings.filter((l) => l.id === 'lst_a')[0].agentKey;
const keyB = listings.filter((l) => l.id === 'lst_b')[0].agentKey;
assert.ok(keyA && keyB && keyA !== keyB, 'two different agent keys');


// visible = no element from the button up to <body> is hidden (class or computed display)
const shown = (w, sel) => { let el = w.document.querySelector(sel); if (!el) return false;
  for (; el && el !== w.document.body; el = el.parentElement) { if (el.classList.contains('is-hidden') || el.hidden || w.getComputedStyle(el).display === 'none') return false; }
  return true; };
const usable = (w, sel) => shown(w, sel) && !w.document.querySelector(sel).disabled;
const PAY = ['[data-msgs-property-pay-btn]', '[data-msgs-pay-btn]'];
const modalOpen = (w) => !!w.document.querySelector('.msgs-payment-modal-overlay.is-open');
const log = (w) => JSON.parse(w.localStorage.getItem('accoom-purchases-log') || '[]');
const convs = (w) => JSON.parse(w.localStorage.getItem('accoom-conversations') || '[]');

const reqToB = { agentName: 'Bola Agent', agentKey: keyB, ownerId: keyB, verified: true, property: { id: 'lst_b', name: 'Bola Duplex', price: '120000', image: '' }, agentProperties: [] };

console.log('Sender (Agent A) sees the payment feature');
let a = await browser('messages.html', { ...agentA, 'accoom-contact-request': JSON.stringify(reqToB) });
a.Accoom.creditWallet(1000000, 'test funds'); await sleep(500);
await test('A, who started the chat with B, sees Make Payment and Pay Now', () => {
  assert.ok(a.document.body.classList.contains('is-agent-chat'));
  assert.ok(a.document.body.classList.contains('is-agent-payer'), 'payer mode off');
  for (const s of PAY) assert.ok(usable(a, s), s + ' not usable');
  assert.ok(shown(a, '[data-msgs-property-status]'), 'status hidden');
});
await test('A\'s report/block/profile controls stay hidden (only payment parts were opened up)', () => {
  for (const s of ['[data-msgs-block]', '[data-msgs-property-review-btn]', '[data-msgs-view-profile]']) assert.ok(!shown(a, s), s + ' visible');
});
await test('A sends a message (initiating the contact): still no payment is triggered by it', async () => {
  send(a, 'Hi Bola, I would like to rent the duplex');
  await sleep(900);
  assert.equal(log(a).length, 0, 'purchase record created by sending a message');
  const st = convs(a)[0].propertyState;
  assert.ok(!st || !st.lst_b || st.lst_b.paymentStatus === 'idle');
});
await test('A clicks Make Payment: the payment dialog opens for the listing price', () => {
  clickEv(a, a.document.querySelector('[data-msgs-property-pay-btn]'));
  assert.ok(modalOpen(a), 'modal closed');
  assert.match(a.document.querySelector('[data-msgs-payment-amount]').textContent, /120,000/);
  assert.equal(a.document.querySelector('[data-msgs-payment-confirm]').textContent, 'Proceed');
});
await test('account switching to the listing owner during processing prevents the debit', async () => {
  const balance = a.Accoom.getWalletBalance();
  clickEv(a, a.document.querySelector('[data-msgs-payment-confirm]'));
  a.localStorage.setItem('accoom-user', agentB['accoom-user']);
  await sleep(3300);
  assert.equal(a.Accoom.getWalletBalance(), balance);
  assert.equal(log(a).length, 0);
  assert.ok(!modalOpen(a));
  assert.ok(!convs(a)[0].propertyState || !convs(a)[0].propertyState.lst_b ||
    convs(a)[0].propertyState.lst_b.paymentStatus === 'idle');

  a.localStorage.setItem('accoom-user', agentA['accoom-user']);
  clickEv(a, a.document.querySelector('[data-msgs-property-pay-btn]'));
  assert.ok(modalOpen(a), 'legitimate payer could not retry after restoring their account');
});
await test('A proceeds: payment goes to review, tied to A (payer), this chat and B (recipient)', async () => {
  clickEv(a, a.document.querySelector('[data-msgs-payment-confirm]'));
  await sleep(3500);
  assert.ok(!modalOpen(a));
  assert.equal(convs(a)[0].propertyState.lst_b.paymentStatus, 'review');
  const rec = log(a);
  assert.equal(rec.length, 1);
  assert.equal(rec[0].payerKey, keyA);
  assert.equal(rec[0].recipientKey, keyB);
  assert.equal(rec[0].convId, 'c-lst_b-' + keyA);
  assert.ok(shown(a, '[data-msgs-property-approve-btn]'), 'approve not shown to the payer');
  assert.ok(!shown(a, '[data-msgs-property-pay-btn]'), 'pay button still shown after paying');
});

console.log('Recipient (Agent B) never sees it');
let b = await browser('messages.html', agentB);
await sleep(1200);
await test('B opens the chat A started: the message is there but NO payment parts', () => {
  const d = b.document;
  assert.match(d.querySelector('[data-msgs-thread]').textContent, /rent the duplex/);
  assert.ok(!d.body.classList.contains('is-agent-payer'), 'payer mode on for the recipient');
  for (const s of ['[data-msgs-property-pay-btn]', '[data-msgs-pay-btn]', '[data-msgs-property-approve-btn]', '[data-msgs-property-decline-btn]', '[data-msgs-property-status]', '[data-msgs-review-strip]', '.msgs-property-extra-actions', '.msgs-pay-menu'])
    assert.ok(!shown(b, s), s + ' visible to the recipient');
  for (const s of PAY) assert.ok(b.document.querySelector(s).disabled, s + ' not disabled');
});
await test('B still has normal messaging: composer present, reply works', async () => {
  assert.ok(shown(b, '[data-msgs-input]'));
  send(b, 'Yes it is available');
  await sleep(900);
  const c = (await j('/api/conversations?key=' + keyB)).conversations[0];
  assert.equal(c.messages[c.messages.length - 1].from, 'agent');
});
await test('B forcing the hidden buttons visible and clicking them opens nothing', () => {
  for (const s of ['[data-msgs-property-pay-btn]', '[data-msgs-pay-btn]']) {
    const el = b.document.querySelector(s); el.classList.remove('is-hidden'); el.disabled = false; el.style.display = 'inline-flex'; clickEv(b, el);
  }
  assert.ok(!modalOpen(b), 'payment dialog opened for the recipient');
  assert.equal(log(b).length, 0);
});
await test('nothing about A\'s payment reached the server conversation or B\'s browser', async () => {
  const c = (await j('/api/conversations?key=' + keyB)).conversations[0];
  assert.ok(!/payment|paid|review|propertyState/i.test(JSON.stringify(Object.keys(c))), JSON.stringify(Object.keys(c)));
  assert.ok(!JSON.stringify(convs(b)).includes('"paymentStatus":"review"'));
  assert.equal(b.localStorage.getItem('accoom-purchases-log'), null);
});
b.close();

console.log('Recipient cannot be made to pay through URLs or stored state');
b = await browser('messages.html?paid=lst_b', agentB);
await sleep(1200);
await test('messages.html?paid=<listing> does not mark the recipient\'s chat paid or create a purchase record', () => {
  assert.ok(!JSON.stringify(convs(b)).includes('"paymentStatus":"review"'));
  assert.equal(b.localStorage.getItem('accoom-purchases-log'), null);
  assert.ok(!shown(b, '[data-msgs-property-approve-btn]'));
});
b.close();
b = await browser('messages.html', { ...agentB, 'accoom-paid-properties': JSON.stringify({ lst_b: true }) });
await sleep(1200);
await test('a stale paid-properties map does not turn the recipient\'s chat into a paid chat', () => {
  assert.ok(!JSON.stringify(convs(b)).includes('"paymentStatus":"review"'));
  assert.equal(b.localStorage.getItem('accoom-purchases-log'), null);
  assert.ok(!shown(b, '[data-msgs-property-approve-btn]'));
});
b.close();

console.log('Sender continues; state survives a refresh');
const keep = stash(a);
a.close();
a = await browser('messages.html', keep);
await sleep(1200);
await test('after a fresh load A still sees the Approve/Decline state of the payment', () => {
  assert.ok(a.document.body.classList.contains('is-agent-payer'));
  assert.ok(shown(a, '[data-msgs-property-approve-btn]') && shown(a, '[data-msgs-property-decline-btn]'));
  assert.ok(!shown(a, '[data-msgs-property-pay-btn]'));
  assert.equal(log(a).length, 1, 'no duplicate purchase record');
});
await test('A approves: payment completes for A', async () => {
  clickEv(a, a.document.querySelector('[data-msgs-property-approve-btn]'));
  await sleep(2600);
  assert.equal(convs(a)[0].propertyState.lst_b.paymentStatus, 'approved');
  assert.equal(log(a)[0].status, 'completed');
});
a.close();

console.log('Own listing and other roles');
a = await browser('property.html?id=lst_a', agentA);
await test('central rule: own listing -> no payment; another agent\'s listing -> allowed', () => {
  const O = a.Accoom.Ownership;
  assert.equal(O.canInitiatePaymentForListingId('lst_a'), false);
  assert.equal(O.canInitiatePaymentForListingId('lst_b'), true);
  assert.equal(O.canInitiatePaymentForListingId('does-not-exist'), false, 'unknown listing must not allow payment');
});
a.close();
let g = await browser('property.html?id=lst_b', {});
await test('central rule: guest -> no payment', () => assert.equal(g.Accoom.Ownership.canInitiatePaymentForListingId('lst_b'), false));
g.close();

console.log('Customer flow is unchanged');
let c = await browser('contact-agent.html', { ...customer, 'accoom-contact-request': JSON.stringify(reqToB) });
c.Accoom.creditWallet(1000000, 'test funds'); await sleep(500);
await test('customer sees Make Payment + Pay Now and can open the payment dialog', () => {
  assert.ok(!c.document.body.classList.contains('is-agent-chat'));
  for (const s of PAY) assert.ok(usable(c, s), s + ' not usable');
  clickEv(c, c.document.querySelector('[data-msgs-property-pay-btn]'));
  assert.ok(modalOpen(c), 'customer payment dialog did not open');
});
c.close();

srv.kill();
windows.forEach((x) => { try { x.close(); } catch { /* ignore */ } });
await rm(dataDir, { recursive: true, force: true });
console.log('\n' + p + ' passed, ' + f + ' failed');
process.exit(f ? 1 : 0);
