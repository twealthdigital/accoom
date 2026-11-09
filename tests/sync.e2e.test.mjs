// Two "browsers" (agent + customer, separate localStorage) share listings and chat
// through the REAL test server (server/server.js). Real home.html / property.html / messages.html.
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

const agentStore = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Adeola Fortune', email: 'adeola@example.com', agentProfileCompleted: true }), 'accoom-agent-listings': JSON.stringify([LISTING]) };
const customerStore = { 'accoom-user': JSON.stringify({ role: 'customer', name: 'Chidi Okeke', email: 'chidi@example.com' }) };

console.log('Laptop server: agent browser shares the listing');
let agent = await browser('home.html', agentStore);
await sleep(2500);
await test('agent public listing reaches the server without fees, history or documents', async () => {
  const { listings } = await j('/api/listings');
  assert.equal(listings.length, 1);
  const l = listings[0];
  assert.equal(l.id, 'lst_e2e');
  assert.equal(l.price, 120000, 'inclusive price');
  for (const k of ['serviceCharge', 'agencyFee', 'legalFee', 'documentation']) assert.ok(!(k in l), k + ' leaked');
  assert.ok(!JSON.stringify(l).includes('internal'), 'approval history leaked');
  assert.match(l.agentKey, /^u-/);
  assert.equal(l.ownerId, l.agentKey);
});
await test('photo was uploaded once to the server and the listing points at it', async () => {
  const { listings } = await j('/api/listings');
  const imgs = listings[0].images;
  assert.match(imgs[0], /^\/uploads\/[0-9a-f]{40}\.png$/);
  assert.equal(imgs[1], 'assets/images/home-properties/miniflat.webp');
  const r = await fetch(base + imgs[0]);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
});

console.log('Laptop server: customer browser sees it and starts a chat');
let customer = await browser('home.html', customerStore);
await test('customer catalogue includes the agent listing (other browser) at the final price', () => {
  const item = customer.Accoom.PropertyService.getById('lst_e2e');
  assert.ok(item && item.agentListing, 'listing missing');
  assert.equal(item.price, 120000);
  assert.ok(item.agentKey);
});
const item = customer.Accoom.PropertyService.getById('lst_e2e');
const request = { agentName: 'Adeola Fortune', agentAvatar: 'assets/images/agent-images/agenticonimg.webp', verified: true, online: false, level: 'AL1',
  property: { id: 'lst_e2e', name: 'Akungba Flat', image: 'assets/images/home-properties/miniflat.webp', beds: 2, baths: 1 }, agentProperties: [] };
customer.close();
customer = await browser('contact-agent.html', { ...customerStore, 'accoom-contact-request': JSON.stringify(request) });
await test('customer opens a chat with the real agent and sends a message', async () => {
  const d = customer.document;
  assert.ok(!d.querySelector('[data-msgs-chat]').classList.contains('is-hidden'), 'chat not open');
  assert.equal(d.querySelector('[data-msgs-chat-name]').textContent, 'Adeola Fortune');
  const input = d.querySelector('[data-msgs-input]');
  input.value = 'Hello, is Akungba Flat still available?';
  d.querySelector('[data-msgs-composer]').dispatchEvent(new customer.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(800);
  const { conversations } = await j('/api/conversations?key=' + item.agentKey);
  assert.equal(conversations.length, 1);
  const c = conversations[0];
  assert.equal(c.customerName, 'Chidi Okeke');
  assert.equal(c.propertyId, 'lst_e2e');
  assert.equal(c.messages[0].from, 'customer');
  assert.equal(c.unread.agent, 1);
});

console.log('Agent reply screen');
agent.close();
agent = await browser('messages.html', agentStore);
await sleep(1200);
await test('agent inbox lists the customer and the property, with an unread badge', () => {
  const d = agent.document;
  const row = d.querySelector('.msgs-list-item');
  assert.ok(row, 'no conversation in agent list');
  assert.match(row.textContent, /Chidi Okeke/);
  assert.match(row.textContent, /Hello, is Akungba Flat still available\?/);
});
await test('agent opens it on desktop, sees the property and the customer message, composer says reply', () => {
  const d = agent.document;
  assert.ok(!d.querySelector('[data-msgs-chat]').classList.contains('is-hidden'), 'agent chat not open');
  assert.equal(d.querySelector('[data-msgs-chat-name]').textContent, 'Chidi Okeke');
  assert.equal(d.querySelector('[data-msgs-chat-status]').textContent, 'Customer');
  assert.equal(d.querySelector('[data-msgs-property-name]').textContent, 'Akungba Flat', 'property card shows what they asked about');
  assert.ok(d.body.classList.contains('is-agent-chat'));
  assert.match(d.querySelector('[data-msgs-thread]').textContent, /still available/);
  assert.equal(d.querySelector('[data-msgs-input]').getAttribute('placeholder'), 'Type a reply...');
  assert.equal(d.querySelectorAll('.msgs-row--agent').length, 1, 'customer message shown as incoming');
});
await test('agent replies and it is stored on the server as from the agent', async () => {
  const d = agent.document;
  d.querySelector('[data-msgs-input]').value = 'Yes it is. When can you inspect?';
  d.querySelector('[data-msgs-composer]').dispatchEvent(new agent.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(800);
  const { conversations } = await j('/api/conversations?key=' + item.agentKey);
  const m = conversations[0].messages;
  assert.equal(m.length, 2);
  assert.equal(m[1].from, 'agent');
  assert.equal(conversations[0].unread.agent, 0, 'agent read it');
  assert.equal(conversations[0].unread.customer, 1);
});
await test('customer page (still open in the other browser) receives the reply by itself', async () => {
  await sleep(3500);   // poll interval
  const d = customer.document;
  assert.match(d.querySelector('[data-msgs-thread]').textContent, /When can you inspect\?/);
  assert.equal(d.querySelectorAll('.msgs-row--me').length, 1);
  assert.equal(d.querySelectorAll('.msgs-row--agent').length, 1);
  const local = JSON.parse(customer.localStorage.getItem('accoom-conversations'));
  assert.equal(local[0].unread, 0, 'open chat counts as read');
});
await test('someone who is not in the chat cannot post into it', async () => {
  const { conversations } = await j('/api/conversations?key=' + item.agentKey);
  const r = await fetch(base + '/api/conversations/' + conversations[0].id + '/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senderKey: 'u-stranger', message: { id: 'x', text: 'hi' } }) });
  assert.equal(r.status, 403);
});
await test('names with HTML are cleaned before they can reach another person\'s header', async () => {
  // Recipient must be a real agent sharing the listing (Permissions Stage 3), so use the agent from above.
  const r = await fetch(base + '/api/conversations/c-lst_e2e-u1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senderKey: 'u1', message: { id: 'a', text: 'hi' }, meta: { agentKey: item.agentKey, customerKey: 'u1', customerName: '<img src=x onerror=alert(1)>Eve', agentName: 'A', propertyId: 'lst_e2e', propertyName: 'P' } }) });
  assert.equal(r.status, 200);
  const { conversations } = await (await fetch(base + '/api/conversations?key=' + item.agentKey)).json();
  const eve = conversations.filter((c) => c.id === 'c-lst_e2e-u1')[0];
  assert.ok(eve && !/[<>\"']/.test(eve.customerName), eve && eve.customerName);
});

srv.kill();

windows.forEach((w) => { try { w.close(); } catch { /* ignore */ } });
await rm(dataDir, { recursive: true, force: true });
console.log('\n' + p + ' passed, ' + f + ' failed');
process.exit(f ? 1 : 0);
