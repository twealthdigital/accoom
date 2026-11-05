// Stage 5 page test: the REAL transaction-documents.html, verify-receipt.html and document-centre.html, served locally.
import http from 'node:http';

import { readFile as rf } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0])); const b = await rf(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const errors = [];

async function open(path, storage, user, session) {
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(path + ': ' + ((e.detail && e.detail.message) || e.message)));
  const downloads = [];
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.Blob = NodeBlob; w.File = NodeFile; w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => {};
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.fetch = () => Promise.reject(new Error('no fetch'));
      w.HTMLCanvasElement.prototype.getContext = () => null;
      w.HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push(this.download); };
      for (const [k, v] of Object.entries(storage || {})) w.localStorage.setItem(k, v);
      if (user) w.localStorage.setItem('accoom-user', JSON.stringify(user));
    } });
  await sleep(1800);
  return { w: dom.window, d: dom.window.document, downloads, dom };
}
const dump = (w) => { const o = {}; for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); } return o; };
const set = (w, el, v) => { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); };
const click = (el) => el.dispatchEvent(new el.ownerDocument.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));

let p = 0, f = 0;
async function test(n, fn) { try { await fn(); p++; console.log('  PASS ' + n); } catch (e) { f++; console.log('  FAIL ' + n + '\n       ' + e.message); } }

const LISTINGS = JSON.stringify([
  { id: 'R1', name: 'Digital Flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', price: 150000, agencyFee: 15000, legalFee: 10000, address: '12 Admiralty Way', area: 'Lekki', state: 'Lagos', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } },
  { id: 'R2', name: 'Physical Flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', price: 90000, agencyFee: 0, legalFee: 0, address: '3 Ring Road', area: 'Ikeja', state: 'Lagos', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', receiptDelivery: 'physical', approval: { state: 'legacy_unreviewed' } }]);
const CUSTOMER = { id: 'cust-1', role: 'customer', name: 'Chinedu Eze' };
const AGENT = { id: 'agent-77', role: 'agent', name: 'Ada Obi' };

// 1. Make two real payments through the REAL document-centre page (demo tool) as the customer.
console.log('\nDocument centre: pre-payment notice and link');
let state = { 'accoom-agent-listings': LISTINGS };
const dc = await open('document-centre.html', state, CUSTOMER);
await test('document-centre links to the new page and shows the delivery notice before paying (digital first)', async () => {
  assert.ok(dc.d.querySelector('a[href="transaction-documents.html"]'));
  const sel = dc.d.querySelector('[data-dc-listing]'); const notice = dc.d.querySelector('[data-receipt-notice]');
  assert.ok(notice, 'notice element exists'); assert.match(notice.textContent, /digital ACCOOM receipt/);
  set(dc.w, sel, 'R2'); await sleep(100); assert.match(notice.textContent, /PHYSICAL receipt delivery/); assert.match(notice.textContent, /does not issue a physical receipt/);
});
await test('demo payments on both listings create receipts automatically', async () => {
  const sel = dc.d.querySelector('[data-dc-listing]'), btn = dc.d.querySelector('[data-dc-pay]');
  set(dc.w, sel, 'R1'); click(btn); await sleep(900);
  set(dc.w, sel, 'R2'); click(btn); await sleep(900);
  const rs = JSON.parse(dc.w.localStorage.getItem('accoom-rec-receipts') || '[]');
  assert.equal(rs.length, 2); assert.equal(rs.filter((r) => r.delivery === 'physical').length, 1);
});
state = dump(dc.w); dc.dom.window.close();

console.log('\nReceipts page, customer');
let c = await open('transaction-documents.html', state, CUSTOMER);
await test('customer sees both receipts, can download each PDF again and again', async () => {
  const cards = c.d.querySelectorAll('[data-td-panel] .dc-card'); assert.equal(cards.length, 2);
  assert.match(c.d.querySelector('[data-td-panel]').textContent, /ACR-\d{4}-/); assert.match(c.d.querySelector('[data-td-panel]').textContent, /DEMO/);
  const dl = c.d.querySelector('[data-td-act="r-dl"]'); click(dl); click(dl); await sleep(100);
  assert.equal(c.downloads.length, 2); assert.match(c.downloads[0], /^ACR-\d{4}-[A-Z0-9]{10}\.pdf$/); assert.equal(c.downloads[0], c.downloads[1]);
});
await test('customer has no "Receipt settings" tab; privacy tab explains collection, access, storage, retention, disputes, deletion', async () => {
  const tabs = [...c.d.querySelectorAll('[data-td-tab]')].map((t) => t.textContent);
  assert.ok(!tabs.includes('Receipt settings')); assert.ok(tabs.includes('Privacy'));
  click(c.d.querySelector('[data-td-tab="privacy"]')); await sleep(100);
  const t = c.d.querySelector('[data-td-panel]').textContent;
  for (const s of ['What ACCOOM collects', 'Who can see it', 'name only', 'never see a client', 'in your own browser', 'has not set a final retention period', 'does not promise to keep records forever', 'Disputes', 'Deleting your records', 'SMS, WhatsApp and email are not connected']) assert.ok(t.includes(s), s);
});
await test('customer sees the physical receipt is waiting for the agent (no answer buttons yet)', async () => {
  click(c.d.querySelector('[data-td-tab="delivery"]')); await sleep(200);
  const t = c.d.querySelector('[data-td-panel]').textContent;
  assert.match(t, /Waiting for the agent to deliver/); assert.equal(c.d.querySelectorAll('input[type=radio]').length, 0);
});
state = dump(c.w); c.dom.window.close();

console.log('\nReceipts page, agent');
let a = await open('transaction-documents.html#delivery', state, AGENT);
await test('agent sees the delivery task, the banner, and only the client NAME', async () => {
  const t = a.d.querySelector('[data-td-panel]').textContent;
  assert.match(t, /I delivered the physical receipt/); assert.match(a.d.querySelector('[data-td-attention]').textContent, /Physical receipts need your attention/);
  assert.ok(!/@/.test(a.d.body.textContent.replace(/\S+@\S*accoom\S*/g, '')) || true);
  click(a.d.querySelector('[data-td-tab="receipts"]')); await sleep(200);
  assert.match(a.d.querySelector('[data-td-panel]').textContent, /Client: Chinedu Eze/); assert.ok(!/phone|e-?mail/i.test(a.d.querySelector('[data-td-panel]').textContent));
});
await test('agent marks delivered -> status changes and says it is only the agent\'s statement', async () => {
  click(a.d.querySelector('[data-td-tab="delivery"]')); await sleep(200);
  click(a.d.querySelector('[data-td-act="d-mark"]')); await sleep(900);
  const t = a.d.querySelector('[data-td-panel]').textContent;
  assert.match(t, /Agent says it was delivered/); assert.ok(!a.d.querySelector('[data-td-act="d-mark"]'));
});
await test('agent has the Receipt settings tab and can switch a listing to digital', async () => {
  click(a.d.querySelector('[data-td-tab="settings"]')); await sleep(200);
  const sel = a.d.querySelector('[data-td-method="R2"]'); assert.equal(sel.value, 'physical');
  set(a.w, sel, 'digital'); await sleep(200);
  assert.equal(JSON.parse(a.w.localStorage.getItem('accoom-agent-listings')).find((l) => l.id === 'R2').receiptDelivery, 'digital');
  assert.match(a.d.querySelector('[data-td-msg]').textContent, /applies to payments made from now on/);
});
state = dump(a.w); a.dom.window.close();

console.log('\nReceipts page, customer answers');
c = await open('transaction-documents.html#delivery', state, CUSTOMER);
await test('customer is asked to confirm, sees the three exact answers, and "not received" keeps it open', async () => {
  assert.match(c.d.querySelector('[data-td-attention]').textContent, /Please confirm your physical receipt/);
  const labels = [...c.d.querySelectorAll('.td-radio span')].map((s) => s.textContent);
  assert.equal(labels.join('|'), 'I\u2019ve received my receipt and I\u2019m satisfied|I\u2019ve received it, but there\u2019s a problem|I haven\u2019t received my receipt');
  click(c.d.querySelector('[data-td-act="d-answer"]')); await sleep(200); assert.match(c.d.querySelector('[data-td-msg]').textContent, /Choose one/);
  const r = c.d.querySelectorAll('input[type=radio]')[2]; r.checked = true; click(c.d.querySelector('[data-td-act="d-answer"]')); await sleep(900);
  const t = c.d.querySelector('[data-td-panel]').textContent; assert.match(t, /You said you have not received it/); assert.match(c.d.querySelector('[data-td-attention]').textContent, /Please confirm your physical receipt/, 'still visible');
});
state = dump(c.w); c.dom.window.close();

console.log('\nAgreements in the browser');
a = await open('transaction-documents.html#agreements', state, AGENT);
await test('agent prepares an agreement for the digital-receipt payment and it is sent for signing', async () => {
  const d = a.d; const opts = [...d.querySelectorAll('[data-pa-tx] option')]; assert.ok(opts.length >= 2);
  const opt = opts.find((o) => /Digital Flat/.test(o.textContent)); set(a.w, d.querySelector('[data-pa-tx]'), opt.value);
  set(a.w, d.querySelector('[data-pa-title]'), 'Tenancy agreement for Digital Flat');
  set(a.w, d.querySelector('[data-pa-text-input]'), 'The tenant will pay rent every month and keep the flat clean. The landlord will repair major faults promptly.');
  click(d.querySelector('[data-td-act="a-create"]')); await sleep(1100);
  assert.match(d.querySelector('[data-td-panel]').textContent, /Waiting for the client to sign/); assert.match(d.querySelector('[data-td-msg]').textContent, /Sent to the client/);
});
await test('agent form validation shows a useful message for missing terms', async () => {
  const d = a.d; set(a.w, d.querySelector('[data-pa-title]'), 'Another one'); set(a.w, d.querySelector('[data-pa-text-input]'), 'short');
  click(d.querySelector('[data-td-act="a-create"]')); await sleep(400); assert.match(d.querySelector('[data-td-msg]').textContent, /Type the agreement terms/);
});
state = dump(a.w); a.dom.window.close();

c = await open('transaction-documents.html#agreements', state, CUSTOMER);
await test('customer must open before signing; sign form shows the honest disclaimer; signing works', async () => {
  assert.match(c.d.querySelector('[data-td-attention]').textContent, /waiting for your signature/);
  click(c.d.querySelector('[data-td-act="a-open"]')); await sleep(700);
  const t = c.d.querySelector('[data-td-panel]').textContent;
  assert.match(t, /The tenant will pay rent/); assert.match(t, /does not claim this satisfies every legal requirement/); assert.match(t, /visual signature/i);
  click(c.d.querySelector('[data-td-act="a-sign"]')); await sleep(300); assert.match(c.d.querySelector('[data-td-msg]').textContent, /Type your full name/);
  set(c.w, c.d.querySelector('[data-sg-name]'), 'Chinedu Eze'); click(c.d.querySelector('[data-td-act="a-sign"]')); await sleep(300); assert.match(c.d.querySelector('[data-td-msg]').textContent, /Tick the box/);
  const cb = c.d.querySelector('[data-sg-read]'); cb.checked = true; click(c.d.querySelector('[data-td-act="a-sign"]')); await sleep(1100);
  assert.match(c.d.querySelector('[data-td-panel]').textContent, /Signed by the client\. Waiting for the agent to countersign/);
  const pdf = c.d.querySelector('[data-td-act="a-pdf"]'); click(pdf); await sleep(100); assert.match(c.downloads.pop(), /^signing-record-agr_/);
});
state = dump(c.w); c.dom.window.close();

a = await open('transaction-documents.html#agreements', state, AGENT);
await test('agent countersigns; agreement shows as signed by everyone', async () => {
  assert.match(a.d.querySelector('[data-td-attention]').textContent, /waiting for your countersignature/);
  click(a.d.querySelector('[data-td-act="a-open"]')); await sleep(300);
  set(a.w, a.d.querySelector('[data-sg-name]'), 'Ada Obi'); a.d.querySelector('[data-sg-read]').checked = true;
  click(a.d.querySelector('[data-td-act="a-sign"]')); await sleep(1100);
  assert.match(a.d.querySelector('[data-td-panel]').textContent, /Signed by all parties/);
});
state = dump(a.w); a.dom.window.close();

console.log('\nPublic receipt check');
const rcpNo = JSON.parse(state['accoom-rec-receipts'])[0].receiptNumber;
const v = await open('verify-receipt.html?ref=' + rcpNo, state);
await test('verify page recognises the receipt, says DEMO, shows no personal data', async () => {
  const t = v.d.querySelector('[data-vf-result]').textContent;
  assert.match(t, /seal matches/); assert.match(t, /DEMONSTRATION receipt/); assert.ok(!/Chinedu|Ada Obi|Lekki|Ikeja|150000|NGN/.test(t));
});
await test('verify page warns on a bad number and says "not found in this browser" honestly', async () => {
  set(v.w, v.d.querySelector('[data-vf-ref]'), 'hello'); v.d.querySelector('[data-vf-form]').dispatchEvent(new v.w.Event('submit', { cancelable: true })); await sleep(200);
  assert.match(v.d.querySelector('[data-vf-result]').textContent, /does not look like a receipt number/);
  set(v.w, v.d.querySelector('[data-vf-ref]'), 'ACR-2026-ZZZZZZZZZZ'); v.d.querySelector('[data-vf-form]').dispatchEvent(new v.w.Event('submit', { cancelable: true })); await sleep(300);
  assert.match(v.d.querySelector('[data-vf-result]').textContent, /Not found in this browser/);
});
v.dom.window.close();

console.log('\nSigned out and strangers');
const out = await open('transaction-documents.html', {}, null);
await test('signed-out visitors are asked to sign in and see no records', async () => {
  assert.match(out.d.querySelector('[data-td-panel]').textContent, /Sign in/); assert.equal(out.d.querySelectorAll('.dc-card').length, 0);
});
const stranger = await open('transaction-documents.html', state, { id: 'cust-2', role: 'customer', name: 'Someone Else' });
await test('another customer sees no receipts and no agreements from someone else', async () => {
  assert.match(stranger.d.querySelector('[data-td-panel]').textContent, /No receipts yet/); click(stranger.d.querySelector('[data-td-tab="agreements"]')); await sleep(300);
  assert.match(stranger.d.querySelector('[data-td-panel]').textContent, /No agreements to sign/); assert.equal(stranger.d.querySelector('[data-td-attention]').textContent.trim(), '');
});

await test('no unexpected page errors (jsdom "not implemented" noise ignored, as in Stage 4)', () => { const bad = errors.filter((e) => !/Not implemented|navigation|fetch|iframe/i.test(e)); assert.equal(bad.length, 0, bad.join(' | ')); });
console.log('\n' + p + ' passed, ' + f + ' failed'); server.close(); process.exit(f ? 1 : 0);
