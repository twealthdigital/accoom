// Global message notifications: gold dot, sliding toast, View opens the exact chat, sync across pages,
// read clears, no duplicates, never my own messages, agents and customers.
// Browsers talk through the REAL test server (server/server.js), like the other e2e tests.
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
async function browser(path, storage, wait = 2500) {
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
  await sleep(wait);
  return dom.window;
}
let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }
const j = async (path) => (await fetch(base + path)).json();
const qs = (w, sel) => [...w.document.querySelectorAll(sel)];
const post = (cid, body) => fetch(base + '/api/conversations/' + cid + '/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json().then((b) => ({ status: r.status, body: b })));
const send = async (w, text) => { const d = w.document; d.querySelector('[data-msgs-input]').value = text; d.querySelector('[data-msgs-composer]').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await sleep(900); };
const storeOf = (w) => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };
// The customer chat page ships sample chats (with unread counters) for every new customer. They are not what
// these tests are about, so the copied browser data keeps only the real chats that came from the server.
const realChatsOnly = (o) => { const out = { ...o }; try { out['accoom-conversations'] = JSON.stringify(JSON.parse(o['accoom-conversations'] || '[]').filter((c) => c.remote || c.agentView)); } catch { /* none */ } return out; };
async function waitFor(fn, ms = 9000) { const end = Date.now() + ms; while (Date.now() < end) { try { if (fn()) return true; } catch { /* not yet */ } await sleep(250); } return false; }
// records every toast a page asks for, without changing what it shows
function spy(w) { const calls = []; const orig = w.Accoom.showToast; w.Accoom.showToast = function (o) { calls.push(o); return orig.call(this, o); }; return calls; }
const msgToasts = (w) => qs(w, '.accoom-toast--message').filter((t) => !t.classList.contains('is-leaving'));
const dot = (w) => qs(w, '.msg-trigger').some((b) => b.classList.contains('has-unread'));

const agentStore = { 'accoom-user': JSON.stringify({ role: 'agent', fullName: 'Adeola Fortune', email: 'adeola@example.com', agentProfileCompleted: true }), 'accoom-agent-listings': JSON.stringify([LISTING]) };
const chidiStore = { 'accoom-user': JSON.stringify({ role: 'customer', name: 'Chidi Okeke', email: 'chidi@example.com' }) };
const adaStore = { 'accoom-user': JSON.stringify({ role: 'customer', name: 'Ada Obi', email: 'ada@example.com' }) };
const request = { agentName: 'Adeola Fortune', agentAvatar: 'assets/images/agent-images/agenticonimg.webp', verified: true, online: false, level: 'AL1',
  property: { id: 'lst_e2e', name: 'Akungba Flat', image: 'assets/images/home-properties/miniflat.webp', beds: 2, baths: 1 }, agentProperties: [] };

// Setup: agent publishes a listing; two customers (Chidi, Ada) each write about it.
let agent = await browser('home.html', agentStore);
await sleep(2500);
let tmp = await browser('home.html', chidiStore);
const item = tmp.Accoom.PropertyService.getById('lst_e2e');
tmp.close();
let chidi = await browser('contact-agent.html', { ...chidiStore, 'accoom-contact-request': JSON.stringify(request) });
await send(chidi, 'Hello, is Akungba Flat still available?');
let ada = await browser('contact-agent.html', { ...adaStore, 'accoom-contact-request': JSON.stringify(request) });
await send(ada, 'Good day, can I see it on Saturday?');
const convs = (await j('/api/conversations?key=' + item.agentKey)).conversations;
const chidiConv = convs.find((c) => c.customerName === 'Chidi Okeke');
const adaConv = convs.find((c) => c.customerName === 'Ada Obi');
assert.ok(chidiConv && adaConv && chidiConv.id !== adaConv.id, 'two separate chats exist on the server');
const chidiStored = realChatsOnly(storeOf(chidi));
chidi.close(); ada.close();

console.log('Customer: new message from the agent');
// Chidi is on the HOME page (not the chat page) when the agent replies
let chidiHome = await browser('home.html', chidiStored, 4500);
const chidiToasts = spy(chidiHome);
await test('1. on load nothing is announced and no dot (everything is read, no old message replayed)', () => {
  assert.equal(chidiToasts.length, 0);
  assert.equal(dot(chidiHome), false);
});
await test('2. agent replies: a sliding toast shows the agent name and a short preview, with a View action', async () => {
  const long = 'Yes it is still available. ' + 'The inspection can be done tomorrow morning at ten. '.repeat(6);
  await post(chidiConv.id, { senderKey: item.agentKey, message: { id: 'a-1', text: long, ts: Date.now() } });
  assert.ok(await waitFor(() => msgToasts(chidiHome).length === 1), 'no message toast appeared');
  const t = msgToasts(chidiHome)[0];
  assert.equal(t.querySelector('.accoom-toast-title').textContent, 'Adeola Fortune');
  const body = t.querySelector('.accoom-toast-body').textContent;
  assert.match(body, /^Yes it is still available/);
  assert.ok(body.length <= 90 && body.endsWith('\u2026'), 'preview is short: ' + body.length);
  const view = t.querySelector('.accoom-toast-view');
  assert.equal(view.textContent, 'View');
  assert.equal(view.getAttribute('href'), 'contact-agent.html?chat=' + encodeURIComponent(chidiConv.id));
  assert.ok(await waitFor(() => t.classList.contains('is-open'), 2000), 'toast slid in');
});
await test('3. the gold dot is on the header message icon', () => {
  assert.equal(dot(chidiHome), true);
});
await test('4. no duplicate: the same message is announced once, even after several poll cycles', async () => {
  await sleep(9000);
  assert.equal(chidiToasts.filter((o) => o.variant === 'message').length, 1);
});
await test('5. a second message in the same chat gets its own toast (once)', async () => {
  await post(chidiConv.id, { senderKey: item.agentKey, message: { id: 'a-2', text: 'Please bring a valid ID', ts: Date.now() } });
  assert.ok(await waitFor(() => chidiToasts.filter((o) => o.variant === 'message').length === 2), 'second toast missing');
  assert.equal(chidiToasts[chidiToasts.length - 1].message, 'Please bring a valid ID');
});
await test('6. my own messages never notify (customer posts as himself from another device)', async () => {
  const before = chidiToasts.filter((o) => o.variant === 'message').length;
  await post(chidiConv.id, { senderKey: chidiConv.customerKey, message: { id: 'c-own', text: 'Thanks, I will come', ts: Date.now() } });
  await sleep(6500);
  assert.equal(chidiToasts.filter((o) => o.variant === 'message').length, before);
});

console.log('View opens the exact conversation, reading clears the notification');
const chidiStoredHome = realChatsOnly(storeOf(chidiHome));
chidiHome.close();
await test('7. another page (property) in the same browser: dot is there, the old message is NOT announced again', async () => {
  const w = await browser('property.html?id=lst_e2e', chidiStoredHome, 4500);
  const calls = spy(w);
  await sleep(3000);
  assert.equal(dot(w), true, 'dot follows the person to every page');
  assert.equal(calls.filter((o) => o.variant === 'message').length, 0, 'no repeat toast on another page');
  w.close();
});
let chidiChat;
await test('8. View link: contact-agent.html?chat=<id> opens that chat and shows its messages', async () => {
  chidiChat = await browser('contact-agent.html?chat=' + encodeURIComponent(chidiConv.id), chidiStoredHome, 4500);
  assert.equal(chidiChat.document.querySelector('[data-msgs-chat-name]').textContent, 'Adeola Fortune');
  const text = qs(chidiChat, '.msgs-bubble').map((b) => b.textContent).join(' | ');
  assert.match(text, /Please bring a valid ID/);
});
await test('9. opening the chat marks it read on the server and clears the dot on the chat page', async () => {
  await sleep(1500);
  const { conversations } = await j('/api/conversations?key=' + chidiConv.customerKey);
  const rc = conversations.find((c) => c.id === chidiConv.id);
  assert.equal(rc.unread.customer, 0);
  assert.equal(dot(chidiChat), false);
});
await test('10. after reading, another page shows no dot and no toast', async () => {
  const s = storeOf(chidiChat);
  chidiChat.close();
  const w = await browser('home.html', s, 4500);
  const calls = spy(w);
  await sleep(2500);
  assert.equal(dot(w), false);
  assert.equal(calls.filter((o) => o.variant === 'message').length, 0);
  w.close();
});
await test('11. a toast closes by itself when the chat is read elsewhere (storage updated by another page)', async () => {
  const w = await browser('home.html', chidiStoredHome, 4500);
  await post(chidiConv.id, { senderKey: item.agentKey, message: { id: 'a-3', text: 'Are you still interested?', ts: Date.now() } });
  assert.ok(await waitFor(() => msgToasts(w).length === 1), 'toast shown');
  assert.equal(dot(w), true);
  // the chat is read in another tab: that tab zeroes the unread counter in the shared storage
  const list = JSON.parse(w.localStorage.getItem('accoom-conversations') || '[]');
  list.forEach((c) => { c.unread = 0; });
  w.localStorage.setItem('accoom-conversations', JSON.stringify(list));
  await post(chidiConv.id, { senderKey: chidiConv.customerKey, message: { id: 'c-reply', text: 'Yes I am', ts: Date.now() } });
  await fetch(base + '/api/conversations/' + chidiConv.id + '/read', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: chidiConv.customerKey }) });
  assert.ok(await waitFor(() => msgToasts(w).length === 0, 8000), 'toast removed after read');
  assert.ok(await waitFor(() => !dot(w), 8000), 'dot cleared after read');
  w.close();
});

console.log('Agent: messages from two customers about the same listing');
await test('12. agent (on home) gets one toast per customer, each with that customer\'s name and its own link', async () => {
  agent.close();
  agent = await browser('home.html', agentStore, 4500);
  const calls = spy(agent);
  await post(chidiConv.id, { senderKey: chidiConv.customerKey, message: { id: 'c-9', text: 'Is the price negotiable?', ts: Date.now() } });
  await post(adaConv.id, { senderKey: adaConv.customerKey, message: { id: 'ad-9', text: 'Is Saturday 2pm okay for you?', ts: Date.now() + 1 } });
  assert.ok(await waitFor(() => calls.filter((o) => o.variant === 'message').length === 2, 14000), 'two toasts expected, got ' + calls.filter((o) => o.variant === 'message').length);
  const byTitle = Object.fromEntries(calls.filter((o) => o.variant === 'message').map((o) => [o.title, o]));
  assert.equal(byTitle['Chidi Okeke'].link, 'messages.html?chat=' + encodeURIComponent(chidiConv.id));
  assert.equal(byTitle['Ada Obi'].link, 'messages.html?chat=' + encodeURIComponent(adaConv.id));
  assert.equal(byTitle['Ada Obi'].message, 'Is Saturday 2pm okay for you?');
  assert.equal(dot(agent), true);
});
await test('13. the agent\'s View link opens the CORRECT customer chat (Ada, not Chidi) and clears her unread', async () => {
  const s = storeOf(agent);
  agent.close();
  agent = await browser('messages.html?chat=' + encodeURIComponent(adaConv.id), s, 5000);
  assert.equal(agent.document.querySelector('[data-msgs-chat-name]').textContent, 'Ada Obi');
  const text = qs(agent, '.msgs-bubble').map((b) => b.textContent).join(' | ');
  assert.match(text, /Is Saturday 2pm okay for you/);
  assert.doesNotMatch(text, /price negotiable/);
  await sleep(1500);
  const { conversations } = await j('/api/conversations?key=' + item.agentKey);
  assert.equal(conversations.find((c) => c.id === adaConv.id).unread.agent, 0, 'Ada read');
  assert.ok(conversations.find((c) => c.id === chidiConv.id).unread.agent > 0, 'Chidi still unread');
  assert.equal(dot(agent), true, 'Chidi is still unread, so the dot stays');
});
await test('14. agent on the chat page: a toast for ANOTHER chat opens it in place when View is clicked', async () => {
  const calls = spy(agent);
  await post(adaConv.id, { senderKey: adaConv.customerKey, message: { id: 'ad-10', text: 'Hello?', ts: Date.now() } });
  await post(chidiConv.id, { senderKey: chidiConv.customerKey, message: { id: 'c-10', text: 'Are you there?', ts: Date.now() + 1 } });
  assert.ok(await waitFor(() => calls.some((o) => o.title === 'Chidi Okeke'), 9000), 'toast for the chat that is not open');
  assert.ok(!calls.some((o) => o.title === 'Ada Obi'), 'no toast for the chat that is open and being read');
  const view = msgToasts(agent)[0] ? msgToasts(agent)[0].querySelector('.accoom-toast-view') : null;
  assert.ok(view, 'View action present');
  view.dispatchEvent(new agent.MouseEvent('click', { bubbles: true, cancelable: true }));
  assert.equal(agent.document.querySelector('[data-msgs-chat-name]').textContent, 'Chidi Okeke');
});

await test('14b. "Mark all as read" on the chat page tells the server and clears the dot', async () => {
  await post(adaConv.id, { senderKey: adaConv.customerKey, message: { id: 'ad-11', text: 'Still waiting', ts: Date.now() } });
  await sleep(4000);
  const btn = agent.document.querySelector('[data-msgs-mark-read]');
  assert.ok(btn, 'mark all read control');
  btn.dispatchEvent(new agent.MouseEvent('click', { bubbles: true, cancelable: true }));
  await sleep(1500);
  const { conversations } = await j('/api/conversations?key=' + item.agentKey);
  assert.ok(conversations.every((c) => c.unread.agent === 0), 'server shows everything read');
  assert.equal(dot(agent), false);
});

console.log('Guests and self chats');
await test('15. a signed out visitor gets no dot and no toast', async () => {
  const w = await browser('home.html', {}, 3500);
  const calls = spy(w);
  await sleep(5000);
  assert.equal(dot(w), false);
  assert.equal(calls.length, 0);
  w.close();
});
await test('16. a chat with myself never notifies and never lights the dot (local data)', async () => {
  const selfChat = { id: 'self-1', name: 'Me Myself', property: { id: 'lst_e2e', name: 'Akungba Flat' }, outgoing: true, unread: 2,
    messages: [{ id: 's1', from: 'agent', text: 'note to self', time: '9:00 AM', day: 'Today' }] };
  const w = await browser('home.html', { ...agentStore, 'accoom-conversations': JSON.stringify([selfChat]) }, 4500);
  const calls = spy(w);
  await sleep(5000);
  assert.equal(dot(w), false);
  assert.equal(calls.length, 0);
  w.close();
});
await test('17. local only: a new incoming message written into the shared storage is announced once; old unread ones are not', async () => {
  const conv = { id: 'conv-local-1', name: 'Local Agent', property: { id: 'ACCOM-24567', name: 'Sample Flat' }, unread: 1,
    messages: [{ id: 'old1', from: 'agent', text: 'old unread message', time: '9:00 AM', day: 'Today', ts: 1 }] };
  const w = await browser('home.html', { ...chidiStore, 'accoom-conversations': JSON.stringify([conv]) }, 4500);
  const calls = spy(w);
  assert.equal(dot(w), true, 'old unread still lights the dot');
  assert.equal(calls.length, 0, 'but it is not announced again as new');
  const next = JSON.parse(w.localStorage.getItem('accoom-conversations'));
  next[0].messages.push({ id: 'new1', from: 'agent', text: 'Fresh message', time: '9:05 AM', day: 'Today', ts: 2 });
  next[0].unread = 2;
  w.localStorage.setItem('accoom-conversations', JSON.stringify(next));
  assert.ok(await waitFor(() => calls.length === 1, 3000));
  assert.equal(calls[0].message, 'Fresh message');
  assert.equal(calls[0].link, 'contact-agent.html?chat=conv-local-1');
  // own message and a muted chat stay silent
  next[0].messages.push({ id: 'mine1', from: 'me', text: 'my own', time: '9:06 AM', day: 'Today', ts: 3 });
  w.localStorage.setItem('accoom-conversations', JSON.stringify(next));
  next[0].muted = true;
  next[0].messages.push({ id: 'new2', from: 'agent', text: 'while muted', time: '9:07 AM', day: 'Today', ts: 4 });
  w.localStorage.setItem('accoom-conversations', JSON.stringify(next));
  await sleep(1500);
  assert.equal(calls.length, 1);
  w.close();
});

console.log('\n' + p + ' passed, ' + f + ' failed');
windows.forEach((w) => { try { w.close(); } catch {} });
srv.kill(); await rm(dataDir, { recursive: true, force: true });
process.exit(f ? 1 : 0);
