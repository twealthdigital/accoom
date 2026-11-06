// Stage 6 page test: the REAL tenancies.html (and document-centre.html demo payment), served locally.
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

const iso = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => iso(new Date(Date.now() - n * 86400000));
const LISTINGS = JSON.stringify([
  { id: 'MO', name: 'Monthly Flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', price: 100000, agencyFee: 0, legalFee: 0, address: '1 Test Road', area: 'Lekki', state: 'Lagos', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', occupancyExtension: { mode: 'days', days: 30 }, approval: { state: 'legacy_unreviewed' } }]);
const CUSTOMER = { id: 'cust-1', role: 'customer', name: 'Chinedu Eze' };
const AGENT = { id: 'agent-77', role: 'agent', name: 'Ada Obi' };
const sel = (d, s) => d.querySelector(s);

console.log('\nStart a tenancy through the real demo payment (started 25 days ago)');
let state = { 'accoom-agent-listings': LISTINGS };
const dc = await open('document-centre.html', state, CUSTOMER);
await test('a demo rental payment on the document centre starts a tenancy automatically', async () => {
  set(dc.w, sel(dc.d, '[data-dc-listing]'), 'MO'); set(dc.w, sel(dc.d, '[data-dc-start]'), daysAgo(25)); click(sel(dc.d, '[data-dc-pay]')); await sleep(1500);
  const ts = JSON.parse(dc.w.localStorage.getItem('accoom-rec-tenancies') || '[]'); assert.equal(ts.length, 1); assert.equal(ts[0].billingPeriod, 'month'); assert.equal(ts[0].occupancyExtension.days, 30);
  assert.ok(dc.d.querySelector('a[href="tenancies.html"]'));
});
state = dump(dc.w); dc.dom.window.close();

console.log('\nTenant view');
let c = await open('tenancies.html', state, CUSTOMER);
await test('tenant sees dates, rent, progress bar, reminders and Occupancy Extension', async () => {
  const t = c.d.querySelector('[data-tn-list]').textContent;
  assert.equal(c.d.querySelectorAll('.tn-card').length, 1); assert.match(t, /Monthly Flat/); assert.match(t, /1 month/); assert.match(t, /\u20A6100,000 per month/);
  const now = Number(sel(c.d, '.tn-bar').getAttribute('aria-valuenow')); assert.ok(now >= 70 && now < 100, 'progress ' + now); assert.match(t, new RegExp(now + '% of this tenancy has passed'));
  assert.equal(c.d.querySelector('.tn-steps').querySelectorAll('.tn-step').length, 4, 'the first row is the 70/80/90/100% reminders'); assert.match(t, /70%[\s\S]*Reminder sent/); assert.match(t, /30 days after the scheduled expiry date/); assert.match(t, /DEMO/);
});
await test('the 70% reminder was sent once and is not repeated by reloading', async () => {
  const n = JSON.parse(c.w.localStorage.getItem('accoom-rec-notifications')).filter((x) => /^tenancy_(70|80|90|expiry)$/.test(x.category) && x.recipientId === 'cust-1');
  assert.ok(n.length >= 1 && n.length <= 2, 'reminders: ' + n.map((x) => x.category)); const keys = n.map((x) => x.dedupeKey); assert.equal(new Set(keys).size, keys.length);
  const before = n.length; await c.w.Accoom.Tenancy.checkAll(); await c.w.Accoom.Tenancy.checkAll();
  assert.equal(JSON.parse(c.w.localStorage.getItem('accoom-rec-notifications')).filter((x) => /^tenancy_(70|80|90|expiry)$/.test(x.category) && x.recipientId === 'cust-1').length, before);
});
await test('tenant sees the three renewal choices; choosing one tells the agent and says nothing is renewed yet', async () => {
  const labels = [...c.d.querySelectorAll('.tn-decision')].map((b) => b.textContent); assert.equal(labels.join('|'), 'I want to renew|I do not want to renew|I need to discuss renewal');
  click(c.d.querySelector('.tn-decision[data-d="renew"]')); await sleep(900);
  assert.match(sel(c.d, '[data-tn-msg]').textContent, /Nothing is renewed yet/); assert.equal(sel(c.d, '.tn-decision[data-d="renew"]').getAttribute('aria-pressed'), 'true'); assert.match(sel(c.d, '[data-tn-list]').textContent, /Wants to renew/);
  assert.equal(c.d.querySelectorAll('.tn-card').length, 1, 'no second tenancy');
});
await test('messages work; phone numbers and emails are refused with a clear reason', async () => {
  const inp = sel(c.d, '[data-tn-msgtext]'); set(c.w, inp, 'call me on 08012345678'); click(sel(c.d, '[data-tn-act="send"]')); await sleep(500);
  assert.match(sel(c.d, '[data-tn-msg]').textContent, /do not share phone numbers or email/);
  set(c.w, sel(c.d, '[data-tn-msgtext]'), 'Can we keep the same rent?'); click(sel(c.d, '[data-tn-act="send"]')); await sleep(900);
  assert.match(sel(c.d, '.tn-chat').textContent, /Can we keep the same rent/);
});
state = dump(c.w); c.dom.window.close();

console.log('\nAgent view');
let a = await open('tenancies.html', state, AGENT);
await test('agent sees the tenant name only, the decision, the message, and an offer form', async () => {
  const t = sel(a.d, '[data-tn-list]').textContent; assert.match(t, /Tenant: Chinedu Eze/); assert.match(t, /Wants to renew/); assert.match(t, /Can we keep the same rent/); assert.ok(!/@|08012345678/.test(t));
  assert.ok(sel(a.d, '[data-tn-offer]')); assert.equal(a.d.querySelectorAll('.tn-decision').length, 0, 'agent cannot make the tenant\u2019s choice');
});
await test('agent offers renewal terms; offer and agreement status appear', async () => {
  const f = sel(a.d, '[data-tn-offer]'); set(a.w, f.querySelector('[data-of-amount]'), '110000'); set(a.w, f.querySelector('[data-of-count]'), '3');
  const st = f.querySelector('[data-of-start]'); const old = st.value; click(sel(a.d, '[data-tn-act="offer"]')); await sleep(1500);
  const t = sel(a.d, '[data-tn-list]').textContent; assert.match(t, /Renewal offer/); assert.match(t, /\u20A6110,000 per month for 3 months/); assert.match(t, new RegExp('From ' + old)); assert.match(t, /Total \u20A6330,000/); assert.match(t, /Waiting for the client to sign/);
  assert.ok(sel(a.d, '[data-tn-act="withdraw"]')); assert.equal(a.d.querySelector('[data-tn-offer]'), null, 'no second offer while one is open');
});
state = dump(a.w); a.dom.window.close();

console.log('\nTenant signs and pays for the renewal');
c = await open('tenancies.html', state, CUSTOMER);
await test('pay button is disabled until the renewal agreement is signed', async () => {
  const b = sel(c.d, '[data-tn-act="pay"]'); assert.ok(b.disabled); assert.match(sel(c.d, '[data-tn-list]').textContent, /pay after you have signed/);
  assert.ok(sel(c.d, 'a[href="transaction-documents.html#agreements"]'));
});
const agrId = JSON.parse(state['accoom-rec-agreements'])[0].id;
await c.w.Accoom.Agreements.markViewed({ role: 'customer', id: 'cust-1' }, agrId); await c.w.Accoom.Agreements.sign({ role: 'customer', id: 'cust-1' }, agrId, { typedName: 'Chinedu Eze', agreedRead: true });
state = dump(c.w); c.dom.window.close();
c = await open('tenancies.html', state, CUSTOMER);
await test('after signing, paying (demo) creates a new tenancy; the old one shows as Renewed and is kept', async () => {
  const b = sel(c.d, '[data-tn-act="pay"]'); assert.ok(!b.disabled); assert.match(sel(c.d, '[data-tn-list]').textContent, /DEMONSTRATION payment/);
  click(b); await sleep(2000);
  assert.match(sel(c.d, '[data-tn-msg]').textContent, /new ACTD, receipt and tenancy were created/); assert.equal(c.d.querySelectorAll('.tn-card').length, 2);
  const t = sel(c.d, '[data-tn-list]').textContent; assert.match(t, /Renewed/); assert.match(t, /original record and its ACTD are kept/); assert.match(t, /Renewal \u00B7 \u20A6330,000/);
  const ts = JSON.parse(c.w.localStorage.getItem('accoom-rec-tenancies')); assert.equal(ts.length, 2); assert.equal(JSON.parse(c.w.localStorage.getItem('accoom-rec-actds')).filter((x) => x.version === 1).length, 2);
  assert.equal(JSON.parse(c.w.localStorage.getItem('accoom-rec-transactions')).length, 2);
});
await test('clicking pay again cannot create anything more (the button is gone)', async () => {
  assert.equal(c.d.querySelectorAll('[data-tn-act="pay"]').length, 0);
});
state = dump(c.w); c.dom.window.close();

console.log('\nOthers');
const stranger = await open('tenancies.html', state, { id: 'cust-2', role: 'customer', name: 'Someone Else' });
await test('another customer sees no tenancies', async () => { assert.match(sel(stranger.d, '[data-tn-list]').textContent, /No tenancies yet/); assert.equal(stranger.d.querySelectorAll('.tn-card').length, 0); });
const out = await open('tenancies.html', {}, null);
await test('signed-out visitors are asked to sign in', async () => { assert.match(sel(out.d, '[data-tn-list]').textContent, /Sign in/); });
const future = await open('document-centre.html', { 'accoom-agent-listings': LISTINGS }, CUSTOMER);
set(future.w, sel(future.d, '[data-dc-listing]'), 'MO'); set(future.w, sel(future.d, '[data-dc-start]'), iso(new Date(Date.now() + 20 * 86400000))); click(sel(future.d, '[data-dc-pay]')); await sleep(1500);
const fs = dump(future.w); future.dom.window.close();
const fv = await open('tenancies.html', fs, CUSTOMER);
await test('a tenancy that has not started yet says so, shows 0% and the date the renewal window will open', async () => {
  const t = sel(fv.d, '[data-tn-list]').textContent; assert.match(t, /has not started yet/); assert.match(t, /Starts on/); assert.equal(sel(fv.d, '.tn-bar').getAttribute('aria-valuenow'), '0'); assert.match(t, /renewal window opens on \d{4}-\d{2}-\d{2}/); assert.equal(fv.d.querySelectorAll('.tn-decision').length, 0);
});
await test('the page explains honestly that reminders run when ACCOOM is opened and nothing external is sent', async () => { assert.match(sel(fv.d, '[data-tn-note]').textContent, /cannot send reminders while the app is closed.*never sends SMS, WhatsApp or email/); });

await test('no unexpected page errors', () => { const bad = errors.filter((e) => !/Not implemented|navigation|fetch|iframe/i.test(e)); assert.equal(bad.length, 0, bad.join(' | ')); });
console.log('\n' + p + ' passed, ' + f + ' failed'); server.close(); process.exit(f ? 1 : 0);
