// Stage 4 page test: the REAL document-centre.html and verify-document.html, served locally.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0])); const b = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

async function open(path, storage, user) {
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push((e.detail && e.detail.message) || e.message));
  const downloads = [];
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.Blob = NodeBlob; w.File = NodeFile; w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.fetch = () => Promise.reject(new Error('no fetch'));
      w.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); };
      for (const [k, v] of Object.entries(storage || {})) w.localStorage.setItem(k, v);
      if (user) w.localStorage.setItem('accoom-user', JSON.stringify(user));
    } });
  await sleep(1800);
  return { w: dom.window, d: dom.window.document, downloads, dom };
}
const dump = (w) => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };

let p = 0, f = 0;
async function test(n, fn) { try { await fn(); p++; console.log('  PASS ' + n); } catch (e) { f++; console.log('  FAIL ' + n + '\n       ' + e.message); } }

const LISTINGS = JSON.stringify([
  { id: 'R1', name: 'Lekki Mini Flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', price: 150000, agencyFee: 15000, legalFee: 10000, address: '12 Admiralty Way', area: 'Lekki', state: 'Lagos', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } },
  { id: 'X1', name: 'Pending flat', category: 'rent', period: 'month', price: 90000, status: 'in_review', ownerId: 'agent-77', approval: { state: 'pending_review' } }]);
const CUSTOMER = { id: 'cust-1', role: 'customer', name: 'Chinedu Eze' };

console.log('\nDocument centre page (real HTML)');
const cust = await open('document-centre.html', { 'accoom-agent-listings': LISTINGS }, CUSTOMER);
const cd = cust.d;
let actdNumber = '';

await test('a customer with no transactions sees a clear empty state', () => {
  assert.ok(/No documents yet/.test(cd.querySelector('[data-dc-list]').textContent));
  assert.ok(/Document centre/.test(cd.querySelector('.dc-title').textContent));
});
await test('demo tools are clearly labelled and list only payable properties', () => {
  assert.ok(/DEMONSTRATION ONLY/.test(cd.querySelector('.dc-demo').textContent));
  assert.ok(/no payment gateway/i.test(cd.querySelector('.dc-demo').textContent));
  const opts = [...cd.querySelectorAll('[data-dc-listing] option')].map((o) => o.textContent);
  assert.equal(opts.length, 1); assert.ok(/Lekki Mini Flat/.test(opts[0]) && !/Pending flat/.test(opts[0]));
  assert.ok(/months/.test(cd.querySelector('[data-dc-count-label]').textContent));
});
await test('a demo payment (double-clicked) creates exactly one ACTD card marked DEMO', async () => {
  cd.querySelector('[data-dc-count]').value = '12'; cd.querySelector('[data-dc-start]').value = '2026-01-31';
  const b = cd.querySelector('[data-dc-pay]'); b.click(); b.click(); b.click(); await sleep(1800);
  const cards = cd.querySelectorAll('.dc-card'); assert.equal(cards.length, 1);
  actdNumber = cards[0].getAttribute('data-actd');
  assert.match(actdNumber, /^ACTD-\d{4}-[A-Z2-9]{10}$/);
  const t = cards[0].textContent;
  assert.ok(/DEMO/.test(t) && /Lekki Mini Flat/.test(t) && /Rental payment/.test(t) && /2,100,000/.test(t) && /Version 1/.test(t));
  assert.ok(/ready/.test(cd.querySelector('[data-dc-msg]').textContent));
  const all = await cust.w.Accoom.Records.collection('transactions').all(); assert.equal(all.length, 1);
});
await test('View opens the PDF in the preview dialog', async () => {
  cd.querySelector('[data-dc-action="view"]').click(); await sleep(300);
  const m = cd.querySelector('.dp-modal'); assert.equal(m.hidden, false);
  assert.ok(m.querySelector('iframe.dp-frame')); assert.ok(m.textContent.includes(actdNumber));
  cd.querySelector('.dp-close').click(); assert.equal(m.hidden, true);
});
await test('Download saves a PDF named after the ACTD and version', () => {
  cd.querySelector('[data-dc-action="download"]').click();
  assert.equal(cust.downloads.length, 1); assert.equal(cust.downloads[0], actdNumber + '-v1.pdf');
});
await test('Download works again later (repeatable)', () => {
  cd.querySelector('[data-dc-action="download"]').click(); assert.equal(cust.downloads.length, 2);
});
await test('a payment made for a different customer is NOT shown to this customer', async () => {
  cd.querySelector('[data-dc-cid]').value = 'cust-OTHER'; cd.querySelector('[data-dc-name]').value = 'Someone Else';
  cd.querySelector('[data-dc-pay]').click(); await sleep(1800);
  assert.equal(cd.querySelectorAll('.dc-card').length, 1, 'still only my own ACTD');
  assert.ok(/belongs to customer "cust-OTHER"/.test(cd.querySelector('[data-dc-msg]').textContent));
  assert.equal((await cust.w.Accoom.Records.collection('actds').all()).length, 2);
});
await test('no reviewer tab is offered unless demo admin mode is on', () => {
  assert.equal(cd.querySelector('[data-dc-tabs]').hidden, true);
});
const saved = dump(cust.w);
cust.dom.window.close();

await test('persistence: after a reload the customer still sees the ACTD', async () => {
  const again = await open('document-centre.html', saved, CUSTOMER);
  assert.equal(again.d.querySelectorAll('.dc-card').length, 1);
  assert.equal(again.d.querySelector('.dc-card').getAttribute('data-actd'), actdNumber);
  again.dom.window.close();
});

await test('a different customer sees none of it', async () => {
  const other = await open('document-centre.html', saved, { id: 'cust-2', role: 'customer', name: 'Nobody' });
  assert.equal(other.d.querySelectorAll('.dc-card').length, 0); assert.ok(/No documents yet/.test(other.d.body.textContent), 'GOT: ' + other.d.querySelector('[data-dc-list]').textContent.slice(0,150) + ' | URL ' + other.w.location.href);
  other.dom.window.close();
});

await test('the listing agent sees both ACTDs, with the client name but no contact details', async () => {
  const ag = await open('document-centre.html', saved, { id: 'agent-77', role: 'agent', name: 'Ada Obi' });
  assert.equal(ag.d.querySelectorAll('.dc-card').length, 2);
  const t = ag.d.querySelector('[data-dc-list]').textContent;
  assert.ok(/Client: Chinedu Eze/.test(t)); assert.ok(!/@|\+234|phone|email/i.test(t));
  assert.ok(/Documents for my listings/.test(ag.d.body.textContent), 'GOT: ' + ag.d.querySelector('.dc-sub').textContent + ' | tabs ' + ag.d.querySelector('[data-dc-tabs]').innerHTML.slice(0,200));
  ag.dom.window.close();
});

await test('another agent sees nothing', async () => {
  const ag = await open('document-centre.html', saved, { id: 'agent-99', role: 'agent', name: 'Other Agent' });
  assert.equal(ag.d.querySelectorAll('.dc-card').length, 0); ag.dom.window.close();
});

await test('a signed-out visitor is asked to sign in and cannot see documents', async () => {
  const noUser = Object.assign({}, saved); delete noUser['accoom-user'];
  const g = await open('document-centre.html', noUser, null);
  assert.ok(/Sign in/.test(g.d.querySelector('[data-dc-list]').textContent), 'GOT: ' + g.d.querySelector('[data-dc-list]').textContent.slice(0,150) + ' | URL ' + g.w.location.href); assert.equal(g.d.querySelectorAll('.dc-card').length, 0); g.dom.window.close();
});

await test('a version update shows as "Version 2 of 2" with its history, and both versions download', async () => {
  const ag = await open('document-centre.html', saved, { id: 'agent-77', role: 'agent', name: 'Ada Obi' });
  const tx = (await ag.w.Accoom.Records.collection('transactions').all()).find((t) => t.customerId === 'cust-1');
  await ag.w.Accoom.ACTD.addendum({ role: 'agent', id: 'agent-77' }, tx.id, { reason: 'Receipt delivered to client.', changes: { s5: { agentConfirmation: 'Delivered by agent' } } });
  ag.d.querySelector('[data-dc-tab]').click(); await sleep(600);
  const card = [...ag.d.querySelectorAll('.dc-card')].find((c) => c.getAttribute('data-actd') === actdNumber);
  assert.ok(/Version 2 of 2/.test(card.textContent) && /Receipt delivered to client/.test(card.textContent));
  card.querySelector('[data-dc-action="versions"]').click(); await sleep(500);
  const card2 = [...ag.d.querySelectorAll('.dc-card')].find((c) => c.getAttribute('data-actd') === actdNumber);
  const dl = [...card2.querySelectorAll('.dc-versions [data-dc-action="download"]')]; assert.equal(dl.length, 2);
  dl.forEach((b) => b.click());
  assert.equal(JSON.stringify(ag.downloads.sort()), JSON.stringify([actdNumber + '-v1.pdf', actdNumber + '-v2.pdf']));
  Object.assign(saved, dump(ag.w)); ag.dom.window.close();
});

console.log('\nACTD check page (real HTML)');
await test('an issued ACTD checks out: seal matches, no personal data shown, demo flagged', async () => {
  const anon = Object.assign({}, saved); delete anon['accoom-user'];
  const v = await open('verify-document.html?ref=' + actdNumber + '&v=1', anon, null);
  const t = v.d.querySelector('[data-vf-result]').textContent;
  assert.ok(t.includes(actdNumber) && /seal matches/i.test(t) && /DEMONSTRATION record/i.test(t));
  assert.ok(/A newer version \(2\) exists/.test(t));
  assert.ok(!/Chinedu|Lekki|2,100,000|cust-1|agent-77|Ada/.test(t));
  assert.ok(/not a digital signature/i.test(t));
  v.dom.window.close();
});
await test('an unknown number says "not found in this browser" and does not call it fake', async () => {
  const v = await open('verify-document.html?ref=ACTD-2026-ABCDEFGHJK', saved, null);
  const t = v.d.querySelector('[data-vf-result]').textContent; assert.ok(/Not found in this browser/.test(t) && /does not mean the document is fake/.test(t)); v.dom.window.close();
});
await test('a malformed number is rejected politely; the page explains it has no server', async () => {
  const v = await open('verify-document.html', saved, null);
  v.d.querySelector('[data-vf-ref]').value = 'hello'; v.d.querySelector('[data-vf-form]').dispatchEvent(new v.w.Event('submit', { cancelable: true })); await sleep(200);
  assert.ok(/does not look like an ACTD number/.test(v.d.querySelector('[data-vf-result]').textContent));
  assert.ok(/does not have a server yet/.test(v.d.body.textContent), 'GOT: ' + v.d.querySelector('main').textContent.slice(0,400)); v.dom.window.close();
});
await test('a tampered record is reported as changed', async () => {
  const tampered = Object.assign({}, saved);
  const key = Object.keys(saved).find((k) => saved[k].includes(actdNumber) && saved[k].includes('"versionKey"'));
  assert.ok(key, 'found where ACTDs are stored: ' + Object.keys(saved).join());
  tampered[key] = saved[key].replace('"total":2100000', '"total":1');
  assert.notEqual(tampered[key], saved[key], 'tamper applied');
  const v = await open('verify-document.html?ref=' + actdNumber + '&v=1', tampered, null);
  const t = v.d.querySelector('[data-vf-result]').textContent; assert.ok(/does NOT match/.test(t), t); v.dom.window.close();
});
await test('no unexpected page errors', () => {
  const bad = errors.filter((e) => !/Not implemented|navigation|fetch|iframe/i.test(e)); assert.equal(bad.length, 0, bad.join(' | '));
});

console.log(p + ' passed, ' + f + ' failed');
server.close(); process.exit(f ? 1 : 0);
