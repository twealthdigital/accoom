// Permissions Stage 5C: direct payment-page URLs enforce ownership before payment.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1);
    const body = await readFile(join(ROOT, pathname));
    res.writeHead(200, { 'content-type': types[extname(pathname)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const errors = [];
const LISTINGS = JSON.stringify([
  { id: 'own-listing', name: 'Own listing', typeLabel: 'Flat', category: 'rent', period: 'month', price: 150000, ownerId: 'agent-self', status: 'available', approval: { state: 'approved', published: true } },
  { id: 'other-listing', name: 'Other listing', typeLabel: 'Flat', category: 'rent', period: 'month', price: 150000, ownerId: 'agent-other', status: 'available', approval: { state: 'approved', published: true } },
  { id: 'unknown-owner', name: 'Unknown owner listing', typeLabel: 'Flat', category: 'rent', period: 'month', price: 150000, ownerId: '', status: 'available', approval: { state: 'approved', published: true } }
]);

async function open(query, user, expectedReason) {
  const path = 'payment.html' + (query ? '?' + query : '');
  const vc = new VirtualConsole();
  vc.on('jsdomError', (error) => errors.push(error.message));
  const dom = await JSDOM.fromURL(base + '/' + path, {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window) {
      window.indexedDB = new IDBFactory();
      window.IDBKeyRange = IDBKeyRange;
      Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true });
      window.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      window.scrollTo = () => {};
      window.Element.prototype.scrollIntoView = () => {};
      window.fetch = (url, options) => fetch(new URL(url, base), options);
      window.localStorage.setItem('accoom-agent-listings', LISTINGS);
      if (user) window.localStorage.setItem('accoom-user', JSON.stringify(user));
    }
  });
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const card = dom.window.document.querySelector('[data-payment-card]');
    const sync = dom.window.Accoom && dom.window.Accoom.Sync;
    const paymentReady = sync && sync.available !== null && !dom.window.document.documentElement.classList.contains('payment-checking');
    if (card && (card.getAttribute('data-payment-blocked') === expectedReason || (!expectedReason && paymentReady))) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return { dom, window: dom.window, card: dom.window.document.querySelector('[data-payment-card]') };
}

const agent = { id: 'agent-self', role: 'agent', name: 'Agent' };
const customer = { id: 'customer-1', role: 'customer', name: 'Customer' };
let passed = 0;
let failed = 0;
const windows = [];

async function test(name, query, user, expectedReason) {
  let page;
  try {
    page = await open(query, user, expectedReason);
    windows.push(page.window);
    if (expectedReason) {
      assert.equal(page.card.getAttribute('data-payment-blocked'), expectedReason);
      assert.equal(page.card.querySelector('[data-payment-form]'), null, 'blocked page must not retain a submit form');
    } else {
      assert.equal(page.card.hasAttribute('data-payment-blocked'), false, 'allowed page should retain its payment UI');
      assert.ok(page.card.querySelector('[data-payment-submit]'), 'allowed page should have a submit button');
    }
    passed++;
    console.log('  PASS ' + name);
  } catch (error) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + error.message);
  }
}

console.log('\nStage 5C: direct payment-page URLs');
await test('agent opening own listing is blocked', 'id=own-listing&amount=1000', agent, 'own-listing');
await test('wallet context cannot bypass own-listing check', 'id=own-listing&context=wallet&mode=deposit', agent, 'own-listing');
await test('agent opening another agent listing is allowed', 'property=other-listing&amount=1000', agent, null);
await test('agent opening a real listing with unknown owner is blocked', 'id=unknown-owner', agent, 'unverifiable');
await test('agent opening an unlisted property id is blocked', 'id=not-in-catalogue', agent, 'unverifiable');
await test('customer can still open property payment', 'id=own-listing&amount=1000', customer, null);
await test('signed-in agent can still open wallet top-up without property id', 'context=wallet&mode=deposit', agent, null);
await test('guest is blocked from direct payment URL', 'id=other-listing', null, 'guest');

windows.forEach((window) => window.close());
server.close();
const unexpectedErrors = errors.filter((error) => !/Not implemented|navigation/i.test(error));
if (unexpectedErrors.length) {
  failed++;
  console.log('  FAIL unexpected page errors\n       ' + unexpectedErrors.join('\n       '));
} else {
  console.log('  PASS no unexpected page errors');
  passed++;
}
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
