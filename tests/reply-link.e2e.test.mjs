// Reply-to-message: the recipient must see the reply linked to the original message (quote preview),
// on both ends. Two "browsers" talk through the REAL test server (server/server.js).
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


const qs = (w, sel) => [...w.document.querySelectorAll(sel)];
const post = (cid, body) => fetch(base + '/api/conversations/' + cid + '/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json().then((b) => ({ status: r.status, body: b })));
const send = async (w, text) => { const d = w.document; d.querySelector('[data-msgs-input]').value = text; d.querySelector('[data-msgs-composer]').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true })); await sleep(900); };
const rowWith = (w, text) => qs(w, '.msgs-row').find((r) => r.querySelector('.msgs-bubble') && r.querySelector('.msgs-bubble').textContent.includes(text));
const replyTo = (w, text) => { const row = rowWith(w, text); assert.ok(row, 'no message containing: ' + text); row.querySelector('[data-row-reply]').dispatchEvent(new w.MouseEvent('click', { bubbles: true })); };

let agent = await browser('home.html', agentStore);
await sleep(2500);
let customer = await browser('home.html', customerStore);
const item = customer.Accoom.PropertyService.getById('lst_e2e');
const request = { agentName: 'Adeola Fortune', agentAvatar: 'assets/images/agent-images/agenticonimg.webp', verified: true, online: false, level: 'AL1',
  property: { id: 'lst_e2e', name: 'Akungba Flat', image: 'assets/images/home-properties/miniflat.webp', beds: 2, baths: 1 }, agentProperties: [] };
customer.close();
customer = await browser('contact-agent.html', { ...customerStore, 'accoom-contact-request': JSON.stringify(request) });
const Q1 = 'Hello, is Akungba Flat still available?';
await send(customer, Q1);
agent.close();
agent = await browser('messages.html', agentStore);
await sleep(1200);

console.log('Agent replies to the customer\'s message');
await test('1. a normal message (no reply) shows no quote, as before', () => {
  assert.equal(qs(agent, '.msgs-reply-quote').length, 0);
  assert.equal(qs(customer, '.msgs-reply-quote').length, 0);
});
await test('2. agent picks Reply: the composer preview shows the original; sending stores a link on the server', async () => {
  replyTo(agent, Q1);
  const prev = agent.document.querySelector('[data-msgs-reply-preview]');
  assert.ok(!prev.classList.contains('is-hidden'), 'reply preview not shown');
  assert.match(prev.textContent, /Hello, is Akungba Flat/);
  await send(agent, 'Yes it is. When can you inspect?');
  const { conversations } = await j('/api/conversations?key=' + item.agentKey);
  const m = conversations[0].messages;
  assert.equal(m.length, 2);
  assert.ok(!('replyTo' in m[0]), 'first message has no reply link');
  assert.equal(m[1].replyTo.id, m[0].id, 'linked to the original message id');
  assert.equal(m[1].replyTo.text, Q1);
  assert.ok(agent.document.querySelector('[data-msgs-reply-preview]').classList.contains('is-hidden'), 'preview closed after send');
});
await test('3. SENDER sees the quote in their own reply bubble (original was the customer)', () => {
  const q = qs(agent, '.msgs-reply-quote');
  assert.equal(q.length, 1);
  assert.equal(q[0].querySelector('b').textContent, 'Chidi Okeke');
  assert.equal(q[0].querySelector('span').textContent, Q1);
});
await test('4. RECIPIENT (customer, other browser) receives the reply WITH the quote of their own message', async () => {
  await sleep(3500);
  const q = qs(customer, '.msgs-reply-quote');
  assert.equal(q.length, 1, 'customer sees one quote');
  assert.equal(q[0].querySelector('b').textContent, 'You', 'the original is the customer\'s own message');
  assert.equal(q[0].querySelector('span').textContent, Q1);
  const bubble = q[0].closest('.msgs-bubble-col').querySelector('.msgs-bubble');
  assert.match(bubble.textContent, /When can you inspect/);
});
await test('5. tapping the quote jumps to (highlights) the original message', () => {
  const q = qs(customer, '.msgs-reply-quote')[0];
  q.dispatchEvent(new customer.MouseEvent('click', { bubbles: true }));
  const orig = rowWith(customer, Q1);
  assert.ok(orig.classList.contains('is-reply-flash'), 'original not highlighted');
});

console.log('Customer replies to the agent\'s message');
await test('6. customer replies to the agent\'s message; sender sees the agent\'s name on the quote', async () => {
  replyTo(customer, 'When can you inspect');
  await send(customer, 'Tomorrow at 10am works.');
  const mine = qs(customer, '.msgs-reply-quote').find((q) => /When can you inspect/.test(q.textContent) && q.closest('.msgs-row--me'));
  assert.ok(mine, 'customer own reply bubble has the quote');
  assert.equal(mine.querySelector('b').textContent, 'Adeola Fortune');
});
await test('7. RECIPIENT (agent) sees it linked to the agent\'s own earlier message as "You"', async () => {
  await sleep(3500);
  const q = qs(agent, '.msgs-reply-quote').find((x) => x.closest('.msgs-row--agent'));
  assert.ok(q, 'agent sees the quote on the incoming reply');
  assert.equal(q.querySelector('b').textContent, 'You');
  assert.equal(q.querySelector('span').textContent, 'Yes it is. When can you inspect?');
  assert.match(q.closest('.msgs-bubble-col').textContent, /Tomorrow at 10am/);
});

console.log('Safety and server rules');
await test('8. quoted text is shown as text, never as HTML', async () => {
  await send(customer, '<b>bold</b> <i>thanks</i> a lot');
  replyTo(customer, 'thanks');
  await send(customer, 'ok');
  await sleep(3500);
  for (const w of [customer, agent]) {
    
    const q = qs(w, '.msgs-reply-quote').find((x) => x.textContent.includes('<b>bold</b>'));
    assert.ok(q, 'quote with the literal text is shown');
    assert.equal(q.querySelectorAll('b').length, 1, 'only the name label is a <b>; nothing injected');
  }
});
await test('9. server uses the STORED original for the preview, so it cannot be spoofed; snapshots are capped', async () => {
  const { conversations } = await j('/api/conversations?key=' + item.agentKey);
  const c = conversations[0];
  const first = c.messages[0];
  const r = await post(c.id, { senderKey: c.agentKey, message: { id: 'spoof1', text: 'x', ts: Date.now(), replyTo: { id: first.id, text: 'FAKE TEXT' } } });
  assert.equal(r.status, 200);
  const spoof = r.body.conversation.messages.find((m) => m.id === 'spoof1');
  assert.equal(spoof.replyTo.text, Q1);
  const r2 = await post(c.id, { senderKey: c.agentKey, message: { id: 'long1', text: 'y', ts: Date.now(), replyTo: { id: 'does-not-exist', text: 'z'.repeat(900) } } });
  const long = r2.body.conversation.messages.find((m) => m.id === 'long1');
  assert.equal(long.replyTo.id, '');
  assert.equal(long.replyTo.text.length, 200);
  const r3 = await post(c.id, { senderKey: c.agentKey, message: { id: 'plain1', text: 'no reply', ts: Date.now() } });
  assert.ok(!('replyTo' in r3.body.conversation.messages.find((m) => m.id === 'plain1')));
});
await test('10. a message with a reply link is still refused for someone outside the chat', async () => {
  const { conversations } = await j('/api/conversations?key=' + item.agentKey);
  const c = conversations[0];
  const r = await post(c.id, { senderKey: 'u-stranger', message: { id: 'bad1', text: 'hi', ts: Date.now(), replyTo: { id: c.messages[0].id, text: 'x' } } });
  assert.equal(r.status, 403);
});

console.log('\n' + p + ' passed, ' + f + ' failed');
windows.forEach((w) => { try { w.close(); } catch {} });
srv.kill(); await rm(dataDir, { recursive: true, force: true });
process.exit(f ? 1 : 0);
