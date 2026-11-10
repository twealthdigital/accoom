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



// Permissions Stage 6: the header messages dropdown never lists a chat with myself.
const PROP_OWN = { id: 'lst_e2e', name: 'Akungba Flat' };
const mk = (id, extra) => ({ id, name: 'Someone', property: { id: 'ACCOM-24567', name: 'Sample Flat' }, unread: true, messages: [{ from: 'them', text: 'hello ' + id, time: '9:00 AM', day: 'Today' }], ...extra });
const convs = [
  mk('ok-incoming', { name: 'Real Customer', customerKey: 'someone-else', agentKey: 'me-placeholder' }),
  mk('self-own-listing', { name: 'Self Own Listing', property: PROP_OWN, outgoing: true }),
  mk('self-same-keys', { name: 'Self Same Keys', customerKey: 'k1', agentKey: 'k1' }),
];
const agentA = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Adeola Fortune', email: 'adeola@example.com', agentProfileCompleted: true }), 'accoom-agent-listings': JSON.stringify([LISTING]), 'accoom-conversations': JSON.stringify(convs) };
const customer = { 'accoom-user': JSON.stringify({ role: 'customer', name: 'Chidi Okeke', email: 'chidi@example.com' }), 'accoom-conversations': JSON.stringify([convs[0], convs[2]]) };
const names = (w) => [...w.document.querySelectorAll('[data-msg-item] .notif-item-title')].map((e) => e.textContent);

console.log('Header messages dropdown');
let a = await browser('home.html', agentA); a.document.querySelector('.msg-trigger') && a.document.querySelector('.msg-trigger').dispatchEvent(new a.MouseEvent('click', { bubbles: true }));
await test('1. agent: self chats are not listed, real chat is', () => {
  const n = names(a);
  assert.ok(n.includes('Real Customer'), 'real chat shown: ' + n);
  assert.ok(!n.includes('Self Own Listing'), 'own-listing chat hidden');
  assert.ok(!n.includes('Self Same Keys'), 'same-key chat hidden');
});
await test('2. Ownership.isSelfConversation agrees', () => {
  const O = a.Accoom.Ownership;
  assert.equal(O.isSelfConversation(convs[1]), true);
  assert.equal(O.isSelfConversation(convs[2]), true);
  assert.equal(O.isSelfConversation(convs[0]), false);
  assert.equal(O.isSelfConversation(null), false);
});
a.close();

console.log('Customer (unchanged)');
let c = await browser('home.html', customer); c.document.querySelector('.msg-trigger') && c.document.querySelector('.msg-trigger').dispatchEvent(new c.MouseEvent('click', { bubbles: true }));
await test('3. customer still sees their chat with a normal agent', () => { assert.ok(names(c).includes('Real Customer')); });
await test('4. customer: a stored chat whose two sides share a key is dropped, others untouched', () => { assert.ok(!names(c).includes('Self Same Keys')); });
c.close();

console.log('\n' + p + ' passed, ' + f + ' failed');
windows.forEach((w) => { try { w.close(); } catch {} });
srv.kill(); await rm(dataDir, { recursive: true, force: true });
process.exit(f ? 1 : 0);
