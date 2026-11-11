// Permissions Stage 5A: no payment UI on an agent's own listing (real server + real property page).
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
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: localResourceOptions(base), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
      w.fetch = (u, o) => { const options = Object.assign({}, o); delete options.signal; return fetch(new URL(u, base), options); }; // jsdom has no fetch
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    } });
  windows.push(dom.window);
  await sleep(2500);
  if (path.indexOf('property.html') === 0) {
    const deadline = Date.now() + 10000;
    while (!dom.window.Accoom || !dom.window.Accoom.currentProperty) {
      if (Date.now() >= deadline) throw new Error('Property page did not initialize: ' + path);
      await sleep(50);
    }
  }
  return dom.window;
}
let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const j = async (path) => (await fetch(base + path)).json();


const agentA = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Adeola Fortune', email: 'adeola@example.com', agentProfileCompleted: true }), 'accoom-agent-listings': JSON.stringify([LISTING]) };
const agentB = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Bola Agent', email: 'bola@example.com', agentProfileCompleted: true }) };
const customer = { 'accoom-user': JSON.stringify({ role: 'customer', name: 'Chidi Okeke', email: 'chidi@example.com' }) };

const hidden = (w, sel) => { const el = w.document.querySelector(sel); return !el || el.hidden || el.style.display === 'none'; };
const cardHidden = (w) => hidden(w, '.pd-price-details-card');
const btnHidden = (w) => hidden(w, '[data-pd-payment]') || cardHidden(w);

// Agent A shares the listing
let a = await browser('home.html', agentA);
await sleep(2500);
a.close();

console.log('Property page');
a = await browser('property.html?id=lst_e2e', agentA);
await test('1. agent A on own listing: ownership is own', () => assert.equal(a.Accoom.currentProperty.ownership.state, 'own'));
await test('2. own listing: Price Details card (Total + Make Payment) hidden', () => assert.ok(cardHidden(a)));
await test('3. own listing: Make Payment button hidden and disabled', () => {
  const b = a.document.querySelector('[data-pd-payment]');
  assert.ok(b, 'button in markup'); assert.ok(btnHidden(a)); assert.equal(b.disabled, true);
});
await test('4. own listing: forced click opens no payment dialog and does not navigate', () => {
  const card = a.document.querySelector('.pd-price-details-card'); const b = a.document.querySelector('[data-pd-payment]');
  card.hidden = false; card.style.display = ''; b.hidden = false; b.style.display = ''; b.disabled = false;
  b.dispatchEvent(new a.MouseEvent('click', { bubbles: true, cancelable: true }));
  const m = a.document.querySelector('[data-pay-modal]');
  assert.ok(!m || !m.classList.contains('is-open'), 'dialog opened');
});
await test('5. own listing: Share, Overview and Contact-related areas still render (nothing else hidden)', () => {
  assert.ok(!hidden(a, '.pd-share-card')); assert.ok(!hidden(a, '.pd-overview-card'));
});
await test('6. account switched agent -> customer -> agent: gate follows, no stale state', () => {
  a.localStorage.setItem('accoom-user', customer['accoom-user']);
  a.dispatchEvent(new a.StorageEvent('storage', { key: 'accoom-user' }));
  assert.ok(!cardHidden(a), 'customer should see payment card');
  a.localStorage.setItem('accoom-user', agentA['accoom-user']);
  a.dispatchEvent(new a.StorageEvent('storage', { key: 'accoom-user' }));
  assert.ok(cardHidden(a), 'agent A should not');
});
a.close();

let b = await browser('property.html?id=lst_e2e', agentB);
await test('7. agent B on A\'s listing: ownership other, payment card + button visible', () => {
  assert.equal(b.Accoom.currentProperty.ownership.state, 'other');
  assert.ok(!cardHidden(b)); assert.ok(!btnHidden(b)); assert.equal(b.document.querySelector('[data-pd-payment]').disabled, false);
});
await test('8. agent B: Make Payment still opens the payment dialog (existing logic intact)', () => {
  b.document.querySelector('[data-pd-payment]').dispatchEvent(new b.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.ok(b.document.querySelector('[data-pay-modal]').classList.contains('is-open'));
});
b.close();

let c = await browser('property.html?id=lst_e2e', customer);
await test('9. customer on a real listing: payment card visible', () => assert.ok(!cardHidden(c)));
c.close();

let s = await browser('property.html?id=1', agentA);
await test('10. agent A on a sample (non-own) listing: payment card visible', () => assert.ok(!cardHidden(s)));
s.close();

console.log('\n' + p + ' passed, ' + f + ' failed');
windows.forEach((w) => { try { w.close(); } catch {} });
srv.kill(); await rm(dataDir, { recursive: true, force: true });
process.exit(f ? 1 : 0);
