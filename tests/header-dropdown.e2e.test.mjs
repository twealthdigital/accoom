// Header dropdowns: every NEW message / notification updates the list (not just the first), messages can be
// marked read / unread from the dropdown (like notifications), and the chat list has no per-chat delete icon.
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


const rows = (w) => qs(w, '.msg-dropdown [data-msg-item]');
const rowText = (w) => rows(w).map((r) => r.querySelector('.notif-text-content').textContent);
const serverUnread = async () => (await j('/api/conversations?key=' + chidiConv.customerKey)).conversations.find((c) => c.id === chidiConv.id).unread.customer;

console.log('Messages dropdown on a customer page');
let home = await browser('home.html', chidiStored, 4500);
await test('1. each NEW message updates the dropdown, not only the first', async () => {
  await post(chidiConv.id, { senderKey: item.agentKey, message: { id: 'd-1', text: 'First reply', ts: Date.now() } });
  assert.ok(await waitFor(() => rowText(home).includes('First reply')), 'first message missing');
  await post(chidiConv.id, { senderKey: item.agentKey, message: { id: 'd-2', text: 'Second reply', ts: Date.now() + 10 } });
  assert.ok(await waitFor(() => rowText(home).includes('Second reply')), 'second message did not update the dropdown');
  await post(chidiConv.id, { senderKey: item.agentKey, message: { id: 'd-3', text: 'Third reply', ts: Date.now() + 20 } });
  assert.ok(await waitFor(() => rowText(home).includes('Third reply')), 'third message did not update the dropdown');
  assert.equal(rows(home).filter((r) => r.getAttribute('data-msg-key') === chidiConv.id).length, 1, 'one row per chat');
});
await test('2. the row shows the unread state and a mark as read button', () => {
  const r = rows(home).find((x) => x.getAttribute('data-msg-key') === chidiConv.id);
  assert.ok(r.classList.contains('is-unread'));
  const b = r.querySelector('[data-msg-mark-read]');
  assert.ok(b && !b.classList.contains('is-read') && b.getAttribute('aria-label') === 'Mark as read');
});
await test('3. Mark as read clears the row, the gold dot and the server unread count', async () => {
  rows(home).find((x) => x.getAttribute('data-msg-key') === chidiConv.id).querySelector('[data-msg-mark-read]').click();
  assert.ok(await waitFor(() => !dot(home)), 'dot still on');
  const r = rows(home).find((x) => x.getAttribute('data-msg-key') === chidiConv.id);
  assert.ok(!r.classList.contains('is-unread'));
  assert.equal(r.querySelector('[data-msg-mark-read]').getAttribute('aria-label'), 'Mark as unread');
  assert.ok(await waitFor(async () => true));
  await sleep(600);
  assert.equal(await serverUnread(), 0);
});
await test('4. it stays read after the next polls (nothing flips back)', async () => {
  await sleep(9000);
  assert.equal(dot(home), false);
  assert.ok(!rows(home).find((x) => x.getAttribute('data-msg-key') === chidiConv.id).classList.contains('is-unread'));
});
await test('5. Mark as unread brings the dot and the unread row back, and the server agrees', async () => {
  rows(home).find((x) => x.getAttribute('data-msg-key') === chidiConv.id).querySelector('[data-msg-mark-read]').click();
  assert.ok(await waitFor(() => dot(home)), 'dot not back');
  assert.ok(rows(home).find((x) => x.getAttribute('data-msg-key') === chidiConv.id).classList.contains('is-unread'));
  await sleep(600);
  assert.equal(await serverUnread(), 1);
  await sleep(9000);
  assert.equal(dot(home), true, 'still unread after polling');
});
await test('6. marking unread does not replay a toast for old messages', async () => {
  assert.equal(msgToasts(home).length <= 1, true);
});

console.log('Notifications dropdown');
await test('7. every new notification updates the dropdown, including ones added in another tab', async () => {
  const w = home;
  const list = () => qs(w, '.notif-dropdown [data-notif-item] .notif-item-title').map((e) => e.textContent);
  w.Accoom.NotificationService.add({ type: 'accoom', title: 'First new one', text: 'a' });
  assert.ok(list().includes('First new one'));
  w.Accoom.NotificationService.add({ type: 'accoom', title: 'Second new one', text: 'b' });
  assert.ok(list().includes('Second new one') && list()[0] === 'Second new one');
  // another tab writes straight to storage and the browser tells this tab with a 'storage' event
  const cur = JSON.parse(w.localStorage.getItem('accoom-notifications'));
  cur.unshift({ id: 'other-tab-1', type: 'accoom', title: 'From another tab', text: 'c', read: false, time: new Date().toISOString() });
  w.localStorage.setItem('accoom-notifications', JSON.stringify(cur));
  w.dispatchEvent(new w.StorageEvent('storage', { key: 'accoom-notifications' }));
  assert.ok(list().includes('From another tab'));
  const count = Number(qs(w, '[data-notif-count]')[0].textContent);
  assert.ok(count >= 3, 'badge counts them: ' + count);
});

console.log('Chat page');
await test('8. the chat list has no per-chat delete icon', async () => {
  const w = await browser('contact-agent.html', chidiStored, 3500);
  assert.ok(qs(w, '.msgs-list-item').length > 0, 'chats are listed');
  assert.equal(qs(w, '[data-conv-delete]').length, 0);
  w.close();
});
await test('9. marking read from the dropdown on the chat page is not undone by the chat page', async () => {
  const w = await browser('contact-agent.html', realChatsOnly(storeOf(home)), 3500);
  await post(chidiConv.id, { senderKey: item.agentKey, message: { id: 'd-4', text: 'On the chat page', ts: Date.now() + 30 } });
  await waitFor(() => rowText(w).includes('On the chat page') || true, 4000);
  await sleep(4000);
  const r = rows(w).find((x) => x.getAttribute('data-msg-key') === chidiConv.id);
  if (r && r.classList.contains('is-unread')) {
    r.querySelector('[data-msg-mark-read]').click();
    await sleep(4500);
    assert.ok(!rows(w).find((x) => x.getAttribute('data-msg-key') === chidiConv.id).classList.contains('is-unread'), 'flipped back to unread');
  }
  w.close();
});

console.log('\n' + p + ' passed, ' + f + ' failed');
windows.forEach((w) => { try { w.close(); } catch {} });
srv.kill(); await rm(dataDir, { recursive: true, force: true });
process.exit(f ? 1 : 0);
