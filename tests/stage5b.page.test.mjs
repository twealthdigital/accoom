// Permissions Stage 5B: payment UI only for the initiating agent / customers (not own, guest or unknown owner) (real server + real property page).
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

const hidden = (w, sel) => { const el = w.document.querySelector(sel); return !el || el.hidden || el.style.display === 'none'; };
const cardHidden = (w) => hidden(w, '.pd-price-details-card');
const btnOff = (w) => cardHidden(w) || hidden(w, '[data-pd-payment]') || w.document.querySelector('[data-pd-payment]').disabled;
const click = (w, sel) => w.document.querySelector(sel).dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
const dialogOpen = (w) => { const m = w.document.querySelector('[data-pay-modal]'); return !!(m && m.classList.contains('is-open')); };
const NOOWNER = { ...LISTING, id: 'lst_noowner', ownerId: undefined, agentKey: undefined, agent: undefined, agentListing: true };
const noOwner = { 'accoom-active-listing': JSON.stringify(NOOWNER) };

let a = await browser('home.html', agentA); await sleep(2500); a.close();

console.log('Initiating agent (agent B on agent A\'s listing)');
let b = await browser('property.html?id=lst_e2e', agentB);
await test('1. payment card + Make Payment visible and enabled', () => {
  assert.equal(b.Accoom.currentProperty.ownership.state, 'other');
  assert.ok(!cardHidden(b)); assert.ok(!btnOff(b));
  assert.match(b.document.querySelector('.pd-price-details-card').textContent, /Total/);
});
await test('2. Make Payment opens the payment dialog with an amount', () => {
  click(b, '[data-pd-payment]');
  assert.ok(dialogOpen(b));
  assert.ok(b.document.querySelector('[data-pay-amount]').textContent.trim().length > 0);
  assert.ok(b.document.querySelector('[data-pay-confirm]').textContent.trim().length > 0);
});
await test('3. dialog Cancel closes it (existing behaviour intact)', () => { click(b, '[data-pay-cancel]'); assert.ok(!dialogOpen(b)); });
b.close();

console.log('Own listing');
a = await browser('property.html?id=lst_e2e', agentA);
await test('4. agent A on own listing: card hidden, button disabled, forced click opens nothing', () => {
  assert.equal(a.Accoom.currentProperty.ownership.state, 'own');
  assert.ok(cardHidden(a));
  const card = a.document.querySelector('.pd-price-details-card'); const btn = a.document.querySelector('[data-pd-payment]');
  card.hidden = false; card.style.display = ''; btn.hidden = false; btn.style.display = ''; btn.disabled = false;
  click(a, '[data-pd-payment]'); assert.ok(!dialogOpen(a));
});
a.close();

console.log('Guests');
let g = await browser('property.html?id=lst_e2e', {});
await test('5. guest on a real listing: no payment card, button disabled, forced click opens nothing', () => {
  assert.equal(g.Accoom.currentProperty.ownership.state, 'guest');
  assert.ok(cardHidden(g));
  const card = g.document.querySelector('.pd-price-details-card'); const btn = g.document.querySelector('[data-pd-payment]');
  card.hidden = false; card.style.display = ''; btn.hidden = false; btn.style.display = ''; btn.disabled = false;
  click(g, '[data-pd-payment]'); assert.ok(!dialogOpen(g));
});
await test('5b. guest who signs in (other tab) as customer: payment appears; signs out: hidden again', () => {
  g.localStorage.setItem('accoom-user', customer['accoom-user']);
  g.dispatchEvent(new g.StorageEvent('storage', { key: 'accoom-user' }));
  assert.ok(!cardHidden(g));
  g.localStorage.removeItem('accoom-user');
  g.dispatchEvent(new g.StorageEvent('storage', { key: 'accoom-user' }));
  assert.ok(cardHidden(g));
});
g.close();
let gs = await browser('property.html?id=1', {});
await test('6. guest on a sample listing: no payment card', () => assert.ok(cardHidden(gs)));
gs.close();

console.log('Unknown ownership');
let u = await browser('property.html?id=lst_noowner', { ...agentB, ...noOwner });
await test('7. agent on a real listing with no owner info: state unknown, payment hidden, forced click opens nothing', () => {
  assert.equal(u.Accoom.currentProperty.ownership.state, 'unknown');
  assert.ok(cardHidden(u));
  const card = u.document.querySelector('.pd-price-details-card'); const btn = u.document.querySelector('[data-pd-payment]');
  card.hidden = false; card.style.display = ''; btn.hidden = false; btn.style.display = ''; btn.disabled = false;
  click(u, '[data-pd-payment]'); assert.ok(!dialogOpen(u));
});
u.close();

console.log('Customers (existing experience)');
let c = await browser('property.html?id=lst_e2e', customer);
await test('8. customer on a real listing: card visible, dialog opens', () => {
  assert.ok(!cardHidden(c)); assert.ok(!btnOff(c)); click(c, '[data-pd-payment]'); assert.ok(dialogOpen(c));
});
c.close();
let cs = await browser('property.html?id=1', customer);
await test('9. customer on a sample listing: card visible, dialog opens', () => {
  assert.ok(!cardHidden(cs)); click(cs, '[data-pd-payment]'); assert.ok(dialogOpen(cs));
});
cs.close();
let cu = await browser('property.html?id=lst_noowner', { ...customer, ...noOwner });
await test('10. customer on a listing with no owner info: card still visible (unchanged)', () => assert.ok(!cardHidden(cu)));
cu.close();
let as = await browser('property.html?id=1', agentA);
await test('11. agent on a sample (ownerless) listing: card visible', () => assert.ok(!cardHidden(as)));
as.close();

console.log('\n' + p + ' passed, ' + f + ' failed');
windows.forEach((w) => { try { w.close(); } catch {} });
srv.kill(); await rm(dataDir, { recursive: true, force: true });
process.exit(f ? 1 : 0);
