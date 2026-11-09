// Permissions Stage 2: self-contact prevention against the REAL test server and real pages.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 3400 + Math.floor(Math.random() * 250);
const base = 'http://127.0.0.1:' + PORT;
const dataDir = await mkdtemp(join(tmpdir(), 'accoom-e2e-'));
const srv = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), ACCOOM_DATA: dataDir }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/api/ping')).ok) break; } catch { /* starting */ } await sleep(100); }

const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const LISTING = { id: 'lst_e2e', name: 'Akungba Flat', location: 'Akungba, Ondo', area: 'Akungba', state: 'Ondo', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month',
  price: 100000, priceValue: 100000, serviceCharge: 10000, agencyFee: 5000, legalFee: 5000, totalPayable: 120000,
  images: [PNG, 'assets/images/home-properties/miniflat.webp'], cover: PNG, agentName: 'Adeola Fortune', ownerId: 'local-agent', schemaVersion: 2, status: 'available',
  approval: { state: 'approved', published: true, verified: true, history: [{ secret: 'internal' }] }, documentation: { answers: { secret: 1 } },
  beds: 2, baths: 1, description: [], amenities: [], quickFacts: [], dateAdded: 'Nov 8, 2026', views: '0' };

const windows = [];
async function browser(path, storage) {
  const vc = new VirtualConsole();
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
      w.fetch = (u, o) => fetch(new URL(u, base), o);      // jsdom has no fetch
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    } });
  windows.push(dom.window);
  await sleep(2500);
  return dom.window;
}
let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const j = async (path) => (await fetch(base + path)).json();


const agentA = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Adeola Fortune', email: 'adeola@example.com', agentProfileCompleted: true }), 'accoom-agent-listings': JSON.stringify([LISTING]) };
const agentB = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Bola Agent', email: 'bola@example.com', agentProfileCompleted: true }) };
const customer = { 'accoom-user': JSON.stringify({ role: 'customer', name: 'Chidi Okeke', email: 'chidi@example.com' }) };
const blocked = (w, sel) => { const el = w.document.querySelector(sel); return !el || el.hidden || el.style.display === 'none' || el.getAttribute('data-self-contact') === 'blocked'; };

// Agent A shares the listing (also gives us A's real owner key).
let a = await browser('home.html', agentA);
await sleep(2500);
const keyA = (await j('/api/listings')).listings[0].agentKey;
a.close();

console.log('Property page');
a = await browser('property.html?id=lst_e2e', agentA);
await test('1. agent A on A\'s own listing: no Contact Agent', () => {
  assert.ok(a.document.querySelector('[data-pd-contact-agent]'), 'button should exist in markup');
  assert.ok(blocked(a, '[data-pd-contact-agent]'), 'button visible');
  assert.equal(a.Accoom.currentProperty.ownership.state, 'own');
});
await test('1b. View Profile stays available on own listing (not a contact action)', () => {
  assert.ok(!blocked(a, '[data-pd-view-profile]'));
});
await test('10a. account switched in another tab (agent -> customer -> agent): gate re-runs, no stale state', async () => {
  a.localStorage.setItem('accoom-user', customer['accoom-user']);
  a.dispatchEvent(new a.StorageEvent('storage', { key: 'accoom-user' }));
  assert.ok(!blocked(a, '[data-pd-contact-agent]'), 'button should show once a customer is signed in');
  a.localStorage.setItem('accoom-user', agentA['accoom-user']);
  a.dispatchEvent(new a.StorageEvent('storage', { key: 'accoom-user' }));
  assert.ok(blocked(a, '[data-pd-contact-agent]'), 'button should hide again when agent A signs back in');
});
await test('forced click on the hidden button (edited page) creates no contact request', () => {
  const btn = a.document.querySelector('[data-pd-contact-agent]');
  btn.hidden = false; btn.style.display = '';
  btn.dispatchEvent(new a.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(a.localStorage.getItem('accoom-contact-request'), null);
});
a.close();

let b = await browser('property.html?id=lst_e2e', agentB);
await test('3. agent B on A\'s listing: Contact Agent available, request names the owner', () => {
  assert.ok(!blocked(b, '[data-pd-contact-agent]'));
  assert.equal(b.Accoom.currentProperty.ownership.state, 'other');
  b.document.querySelector('[data-pd-contact-agent]').dispatchEvent(new b.MouseEvent('click', { bubbles: true, cancelable: true }));
  const req = JSON.parse(b.localStorage.getItem('accoom-contact-request'));
  assert.ok(req && req.property.id === 'lst_e2e');
  assert.equal(req.ownerId, keyA);
});
b.close();
let c = await browser('property.html?id=lst_e2e', customer);
await test('customer on any real listing: Contact Agent available', () => assert.ok(!blocked(c, '[data-pd-contact-agent]')));
c.close();

console.log('Agent profile');
const profile = { name: 'Adeola Fortune', avatar: 'assets/images/agent-images/agenticonimg.webp', verified: true, stats: '1 Property', rating: 'No reviews yet', level: 'AL1', real: true, ownerId: keyA,
  property: { id: 'lst_e2e', name: 'Akungba Flat', location: 'Akungba, Ondo', price: '120000', image: '' } };
a = await browser('agent-profile.html', { ...agentA, 'accoom-active-agent': JSON.stringify(profile) });
await test('2. agent A on A\'s own profile: no contact action', () => assert.ok(blocked(a, '[data-ap-contact]')));
a.close();
b = await browser('agent-profile.html', { ...agentB, 'accoom-active-agent': JSON.stringify(profile) });
await test('4. agent B on A\'s profile: can initiate contact', () => {
  assert.ok(!blocked(b, '[data-ap-contact]'));
  b.document.querySelector('[data-ap-contact]').dispatchEvent(new b.MouseEvent('click', { bubbles: true, cancelable: true }));
  const req = JSON.parse(b.localStorage.getItem('accoom-contact-request'));
  assert.equal(req.ownerId, keyA);
});
b.close();

console.log('Alternative paths');
const selfRequest = { ownerId: keyA, agentName: 'Adeola Fortune', property: { id: 'lst_e2e', name: 'Akungba Flat', image: '' }, agentProperties: [] };
a = await browser('messages.html', { ...agentA, 'accoom-contact-request': JSON.stringify(selfRequest) });
await test('8a. stored self contact request is discarded by the chat page', () => assert.equal(a.localStorage.getItem('accoom-contact-request'), null));
a.close();
const sneaky = { agentName: 'Adeola Fortune', property: { id: 'lst_e2e', name: 'Akungba Flat', image: '' }, agentProperties: [] };   // no owner fields: caught by listing id
a = await browser('messages.html', { ...agentA, 'accoom-contact-request': JSON.stringify(sneaky) });
await test('8b. self request with no owner fields is caught through the listing id', () => assert.equal(a.localStorage.getItem('accoom-contact-request'), null));
a.close();
await test('8c. no conversation exists on the server after all that', async () => assert.equal((await j('/api/conversations?key=' + keyA)).conversations.length, 0));

console.log('Server refuses self-chat');
const post = (id, body) => fetch(base + '/api/conversations/' + id + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
await test('8d. same agentKey and customerKey -> 400, nothing stored', async () => {
  const r = await post('c-self', { senderKey: keyA, message: { id: 'm1', text: 'hi me' }, meta: { agentKey: keyA, customerKey: keyA, propertyId: 'lst_e2e' } });
  assert.equal(r.status, 400);
  assert.equal((await j('/api/conversations?key=' + keyA)).conversations.length, 0);
});
await test('a normal chat from a different person is still accepted', async () => {
  const r = await post('c-ok', { senderKey: 'u-someoneelse', message: { id: 'm2', text: 'hello' }, meta: { agentKey: keyA, customerKey: 'u-someoneelse', propertyId: 'lst_e2e' } });
  assert.equal(r.status, 200);
});

srv.kill();
windows.forEach((w) => { try { w.close(); } catch { /* ignore */ } });
await rm(dataDir, { recursive: true, force: true });
console.log('\n' + p + ' passed, ' + f + ' failed');
process.exit(f ? 1 : 0);
