// Permissions Stage 3: agent-to-agent messaging against the REAL test server and real pages.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 3700 + Math.floor(Math.random() * 250);
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
      w.fetch = (u, o) => fetch(new URL(u, base), o);
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

console.log('Agent A starts a chat with Agent B');
let a = await browser('property.html?id=lst_b', agentA);
let request;
await test('A on B\'s listing: Contact Agent is available and the request names B', () => {
  const btn = a.document.querySelector('[data-pd-contact-agent]');
  assert.ok(btn && !btn.hidden && btn.style.display !== 'none', 'button hidden');
  clickEv(a, btn);
  request = JSON.parse(a.localStorage.getItem('accoom-contact-request'));
  assert.equal(request.property.id, 'lst_b');
  assert.equal(request.agentKey, keyB);
});
a.close();

a = await browser('messages.html', { ...agentA, 'accoom-contact-request': JSON.stringify(request) });
await test('A\'s messages screen opens a chat with B for that listing (request consumed)', () => {
  const d = a.document;
  assert.equal(a.localStorage.getItem('accoom-contact-request'), null);
  assert.ok(!d.querySelector('[data-msgs-chat]').classList.contains('is-hidden'), 'chat not open');
  assert.equal(d.querySelector('[data-msgs-chat-name]').textContent, 'Bola Agent');
  assert.equal(d.querySelector('[data-msgs-chat-status]').textContent, 'Real Estate Agent');
  assert.equal(d.querySelector('[data-msgs-property-name]').textContent, 'Bola Duplex');
});
await test('the local chat records A as the sender side and B as the recipient', () => {
  const local = JSON.parse(a.localStorage.getItem('accoom-conversations'));
  assert.equal(local.length, 1);
  assert.equal(local[0].outgoing, true);
  assert.equal(local[0].customerKey, keyA);
  assert.equal(local[0].agentKey, keyB);
  assert.equal(local[0].id, 'c-lst_b-' + keyA);
});
await test('A sends a message: the server stores sender A, recipient B, role agent', async () => {
  send(a, 'Hi Bola, is the duplex still available?');
  await sleep(900);
  const { conversations } = await j('/api/conversations?key=' + keyB);
  assert.equal(conversations.length, 1);
  const c = conversations[0];
  assert.equal(c.customerKey, keyA); assert.equal(c.agentKey, keyB);
  assert.equal(c.customerRole, 'agent');
  assert.equal(c.propertyId, 'lst_b');
  assert.equal(c.messages.length, 1); assert.equal(c.messages[0].from, 'customer');
  assert.equal(c.unread.agent, 1, 'B has one unread');
  assert.equal(c.unread.customer, 0, 'A has nothing unread');
});

console.log('Agent B receives and responds');
let b = await browser('messages.html', agentB);
await sleep(1200);
await test('B\'s inbox shows A as an AGENT with A\'s message as incoming and no self/payment controls', () => {
  const d = b.document;
  const row = d.querySelector('.msgs-list-item');
  assert.ok(row, 'no conversation in B\'s list');
  assert.match(row.textContent, /Adeola Fortune/);
  assert.match(row.textContent, /is the duplex still available/);
  assert.equal(d.querySelector('[data-msgs-chat-name]').textContent, 'Adeola Fortune');
  assert.equal(d.querySelector('[data-msgs-chat-status]').textContent, 'Agent');
  assert.equal(d.querySelectorAll('.msgs-row--agent').length, 1, 'A\'s message shown as incoming');
  assert.equal(d.querySelectorAll('.msgs-row--me').length, 0);
  assert.ok(d.body.classList.contains('is-agent-chat'), 'recipient keeps the agent screen (payment parts hidden)');
});
await test('B replies; the server stores it as from the agent side', async () => {
  send(b, 'Yes it is. When can you inspect?');
  await sleep(900);
  const c = (await j('/api/conversations?key=' + keyB)).conversations[0];
  assert.equal(c.messages.length, 2); assert.equal(c.messages[1].from, 'agent');
  assert.equal(c.unread.agent, 0); assert.equal(c.unread.customer, 1);
});
await test('A (still open) receives B\'s reply as INCOMING, and A\'s own message stays on A\'s side', async () => {
  await sleep(3500);
  const d = a.document;
  assert.match(d.querySelector('[data-msgs-thread]').textContent, /When can you inspect\?/);
  assert.equal(d.querySelectorAll('.msgs-row--me').length, 1);
  assert.equal(d.querySelectorAll('.msgs-row--agent').length, 1);
  const local = JSON.parse(a.localStorage.getItem('accoom-conversations'));
  assert.equal(local.length, 1, 'still one chat on A\'s side');
  assert.equal(local[0].unread, 0, 'open chat counts as read');
});
await test('B sees both messages with correct sides after another poll', async () => {
  await sleep(3200);
  const d = b.document;
  assert.equal(d.querySelectorAll('.msgs-row--agent').length, 1);
  assert.equal(d.querySelectorAll('.msgs-row--me').length, 1);
});

console.log('History kept, no duplicate chats');
const keep = stash(a);
a.close();
const again = { ...keep, 'accoom-contact-request': JSON.stringify(request) };
a = await browser('messages.html', again);
await test('contacting B about the same listing again reuses the chat and keeps its history', async () => {
  const local = JSON.parse(a.localStorage.getItem('accoom-conversations'));
  assert.equal(local.length, 1, 'no duplicate local chat');
  assert.ok(local[0].messages.length >= 2, 'history kept: ' + local[0].messages.length);
  assert.equal((await j('/api/conversations?key=' + keyA)).conversations.length, 1, 'no duplicate on the server');
  assert.match(a.document.querySelector('[data-msgs-thread]').textContent, /still available/);
});
await test('after a page refresh (fresh load, saved state only) A\'s chat is still there and correct', () => {
  assert.equal(a.document.querySelectorAll('.msgs-list-item').length, 1);
  assert.equal(a.document.querySelectorAll('.msgs-row--me').length, 1);
  assert.equal(a.document.querySelectorAll('.msgs-row--agent').length, 1);
});
await test('A\'s header unread/notification data is not corrupted (other person\'s message is the incoming one)', () => {
  const local = JSON.parse(a.localStorage.getItem('accoom-conversations'))[0];
  const incoming = local.messages.filter((m) => m.from !== 'me');
  assert.equal(incoming.length, 1);
  assert.match(incoming[0].text, /When can you inspect/);
});

console.log('Customers still work, and B can also start a chat with A');
let c = await browser('contact-agent.html', { ...customer, 'accoom-contact-request': JSON.stringify({ agentName: 'Bola Agent', agentAvatar: 'assets/images/agent-images/agenticonimg.webp', verified: true, online: false, level: 'AL1',
  property: { id: 'lst_b', name: 'Bola Duplex', image: 'assets/images/home-properties/miniflat.webp' }, agentProperties: [] }) });
await test('a customer can still message B (customer role recorded)', async () => {
  send(c, 'Hello from a customer');
  await sleep(900);
  const convs = (await j('/api/conversations?key=' + keyB)).conversations;
  assert.equal(convs.length, 2);
  const cust = convs.filter((x) => x.customerRole === 'customer')[0];
  assert.ok(cust && cust.customerName === 'Chidi Okeke');
});
c.close();
b.close();
b = await browser('messages.html', agentB);
await sleep(1200);
await test('B\'s inbox labels the customer chat "Customer" and the agent chat "Agent"', () => {
  const d = b.document;
  const rows = Array.from(d.querySelectorAll('.msgs-list-item'));
  assert.equal(rows.length, 2);
  const local = JSON.parse(b.localStorage.getItem('accoom-conversations'));
  const roles = local.map((x) => x.role).sort();
  assert.deepEqual(roles, ['Agent', 'Customer']);
});
b.close();

const reqB = { ...request, agentName: 'Adeola Fortune', agentKey: keyA, ownerId: keyA, property: { id: 'lst_a', name: 'Akungba Flat', image: '' }, agentProperties: [] };
b = await browser('messages.html', { ...agentB, 'accoom-contact-request': JSON.stringify(reqB) });
await test('B can start a separate chat with A about A\'s listing (works in both directions)', async () => {
  send(b, 'Hi Adeola, I have a client for Akungba Flat');
  await sleep(900);
  const convs = (await j('/api/conversations?key=' + keyA)).conversations;
  const fromB = convs.filter((x) => x.customerKey === keyB)[0];
  assert.ok(fromB && fromB.agentKey === keyA && fromB.propertyId === 'lst_a' && fromB.customerRole === 'agent');
});
b.close();

console.log('Self-chat is impossible through every route');
const selfReq = { agentName: 'Adeola Fortune', agentKey: keyA, ownerId: keyA, property: { id: 'lst_a', name: 'Akungba Flat', image: '' }, agentProperties: [] };
const before = (await j('/api/conversations?key=' + keyA)).conversations.length;
let s = await browser('messages.html', { ...agentA, 'accoom-contact-request': JSON.stringify(selfReq) });
await test('contact request pointing at the agent themselves creates no chat and is discarded', async () => {
  assert.equal(s.localStorage.getItem('accoom-contact-request'), null);
  const local = JSON.parse(s.localStorage.getItem('accoom-conversations') || '[]');
  assert.ok(!local.some((x) => x.outgoing && x.property && x.property.id === 'lst_a'), 'a self chat was created');
});
await test('typing into any open chat on A\'s own listing is not possible (no self chat on the server)', async () => {
  const convs = (await j('/api/conversations?key=' + keyA)).conversations;
  assert.equal(convs.length, before);
  assert.ok(!convs.some((x) => x.agentKey === x.customerKey));
});
s.close();
const planted = [{ id: 'conv-self', agentView: true, outgoing: true, remote: true, remoteId: 'c-lst_a-' + keyA, name: 'Me', role: 'Real Estate Agent', agentKey: keyA, customerKey: keyA,
  property: { id: 'lst_a', name: 'Akungba Flat', image: '' }, allProperties: [], messages: [] }];
s = await browser('messages.html', { ...agentA, 'accoom-conversations': JSON.stringify(planted) });
await test('a self chat planted in browser storage is dropped, not shown', () => {
  const local = JSON.parse(s.localStorage.getItem('accoom-conversations') || '[]');
  assert.ok(!local.some((x) => x.id === 'conv-self'));
  // A legitimately has two chats (A->B and B->A); the planted self chat must not be a third.
  assert.equal(s.document.querySelectorAll('.msgs-list-item').length, 2, 'only the two real chats are listed');
  assert.ok(!Array.from(s.document.querySelectorAll('.msgs-list-item')).some((r) => /^\s*Me\b/.test(r.textContent)), 'the planted self chat is listed');
});
s.close();
s = await browser('messages.html?open=lst_a', agentA);
await test('direct route messages.html?open=<own listing> does not create a chat', async () => {
  assert.equal((await j('/api/conversations?key=' + keyA)).conversations.filter((x) => x.agentKey === x.customerKey).length, 0);
  assert.ok(!(JSON.parse(s.localStorage.getItem('accoom-conversations') || '[]')).some((x) => x.outgoing && x.property && x.property.id === 'lst_a'));
});
s.close();

await test('server: same person on both sides -> 400', async () => {
  const r = await post('c-lst_a-' + keyA, { senderKey: keyA, message: { id: 's1', text: 'me' }, meta: { agentKey: keyA, customerKey: keyA, propertyId: 'lst_a' } });
  assert.equal(r.status, 400);
});
await test('server: writing to someone who is not a sharing agent -> 400, nothing stored', async () => {
  const r = await post('c-lst_x-' + keyA, { senderKey: keyA, message: { id: 's2', text: 'x' }, meta: { agentKey: 'u-nobody', customerKey: keyA, propertyId: 'lst_x', customerRole: 'agent' } });
  assert.equal(r.status, 400);
});
await test('server: listing that the recipient does not share -> 400', async () => {
  const r = await post('c-lst_b-' + keyB, { senderKey: keyB, message: { id: 's3', text: 'x' }, meta: { agentKey: keyA, customerKey: keyB, propertyId: 'lst_b' } });
  assert.equal(r.status, 400);
});
await test('server: cannot pre-register a conversation id that belongs to someone else', async () => {
  // 'u-victim' has no chat yet: the squatter tries to register the id that victim's chat would use.
  const r = await post('c-lst_b-u-victim', { senderKey: 'u-squatter', message: { id: 's4', text: 'x' }, meta: { agentKey: keyB, customerKey: 'u-squatter', propertyId: 'lst_b' } });
  assert.equal(r.status, 400);
  assert.ok(!(await j('/api/conversations?key=' + keyB)).conversations.some((x) => x.id === 'c-lst_b-u-victim'));
});
await test('server: a stranger cannot write into A and B\'s existing chat (403)', async () => {
  const id = 'c-lst_b-' + keyA;
  const r = await post(id, { senderKey: 'u-third', message: { id: 's5', text: 'x' } });
  assert.equal(r.status, 403);
});
await test('server: the starter can keep writing in their existing chat (normal follow-up)', async () => {
  const r = await post('c-lst_b-' + keyA, { senderKey: keyA, message: { id: 's6', text: 'again' } });
  assert.equal(r.status, 200);
});

srv.kill();
windows.forEach((x) => { try { x.close(); } catch { /* ignore */ } });
await rm(dataDir, { recursive: true, force: true });
console.log('\n' + p + ' passed, ' + f + ' failed');
process.exit(f ? 1 : 0);
