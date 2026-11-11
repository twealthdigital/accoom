// Stage 7 page test: the REAL tenancies.html (Occupancy Extension, vacancy, handover) and the listing form field, served locally.
import http from 'node:http';

import { readFile as rf } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import assert from 'node:assert/strict';
import { localResourceOptions } from './local-resources.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
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
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: localResourceOptions(base), pretendToBeVisual: true, virtualConsole: vc,
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
const sel = (d, s) => d.querySelector(s);
const LISTINGS = JSON.stringify([
  { id: 'MO', name: 'Monthly Flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', price: 100000, agencyFee: 0, legalFee: 0, address: '1 Test Road', area: 'Lekki', state: 'Lagos', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', occupancyExtension: { mode: 'days', days: 30 }, approval: { state: 'legacy_unreviewed' } },
  { id: 'SALE1', name: 'A Duplex', category: 'sale', listingType: 'sale', typeLabel: 'Duplex', price: 90000000, status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } }]);
const CUSTOMER = { id: 'cust-1', role: 'customer', name: 'Chinedu Eze' };
const AGENT = { id: 'agent-77', role: 'agent', name: 'Ada Obi' };

// A monthly tenancy that started 40 days ago: the month ended ~9-12 days ago, so it is inside its 30-day Occupancy Extension.
console.log('\nTenancy inside its Occupancy Extension');
let state = { 'accoom-agent-listings': LISTINGS };
const dc = await open('document-centre.html', state, CUSTOMER);
set(dc.w, sel(dc.d, '[data-dc-listing]'), 'MO'); set(dc.w, sel(dc.d, '[data-dc-start]'), daysAgo(40)); click(sel(dc.d, '[data-dc-pay]')); await sleep(1500);
state = dump(dc.w); dc.dom.window.close();

let c = await open('tenancies.html', state, CUSTOMER);
await test('status shows "In Occupancy Extension" with days left, the end date and milestone boxes; no "grace period" wording', async () => {
  const t = sel(c.d, '[data-tn-list]').textContent;
  assert.match(t, /In Occupancy Extension/); assert.match(t, /Agreed: 30 days after the scheduled expiry date/); assert.match(t, /Running now\. \d+ days? left/); assert.ok(!/grace/i.test(c.d.body.textContent));
  const boxes = [...c.d.querySelectorAll('.tn-steps')][1].querySelectorAll('.tn-step'); assert.equal(boxes.length, 4); assert.match(boxes[0].textContent, /14 days left/);
});
await test('the tenant and agent were told the extension started, exactly once', async () => {
  const n = JSON.parse(c.w.localStorage.getItem('accoom-rec-notifications')).filter((x) => x.category === 'tenancy_extension_started');
  assert.equal(n.length, 2); assert.equal(new Set(n.map((x) => x.recipientId)).size, 2); await c.w.Accoom.Occupancy.advanceAll(); await c.w.Accoom.Occupancy.advanceAll();
  assert.equal(JSON.parse(c.w.localStorage.getItem('accoom-rec-notifications')).filter((x) => x.category === 'tenancy_extension_started').length, 2);
});
await test('the tenant can state the occupancy status: still living here, plan to move out, moved out; vacating needs a date', async () => {
  assert.match(sel(c.d, '[data-tn-list]').textContent, /Occupancy and handover/); assert.match(sel(c.d, '[data-tn-list]').textContent, /has not assumed the tenant has left or renewed/);
  click(sel(c.d, '[data-tn-act="occ-still"]')); await sleep(900); assert.match(sel(c.d, '[data-tn-msg]').textContent, /told you are still in the property/); assert.match(sel(c.d, '[data-tn-list]').textContent, /still living in the property/);
  click(sel(c.d, '[data-tn-act="occ-vacating"]')); await sleep(500); assert.match(sel(c.d, '[data-tn-msg]').textContent, /planned move-out date|Enter the date/i);
  set(c.w, sel(c.d, '[data-oc-date]'), iso(new Date(Date.now() + 5 * 86400000))); click(sel(c.d, '[data-tn-act="occ-vacating"]')); await sleep(900); assert.match(sel(c.d, '[data-tn-list]').textContent, /plans to move out on/);
  assert.equal(JSON.parse(c.w.localStorage.getItem('accoom-rec-tenancies'))[0].status, 'occupancy_extension', 'a report never ends the tenancy');
});
state = dump(c.w); c.dom.window.close();

console.log('\nAgent: settings, inspection, vacancy, readiness');
let a = await open('tenancies.html', state, AGENT);
await test('agent sees the Occupancy Extension settings with all options and plain-language explanation (rental listings only)', async () => {
  const s = sel(a.d, '[data-tn-settings]'); assert.ok(s); assert.match(s.textContent, /agreed number of days after the scheduled tenancy expiry date/); assert.match(s.textContent, /applies to new tenancies only|apply to new tenancies only|applies to \w*new\w* tenancies/i);
  const opts = [...s.querySelectorAll('[data-cfg="MO"] [data-cfg-sel] option')].map((o) => o.textContent); assert.equal(opts.join('|'), 'No Occupancy Extension|7 days|14 days|30 days|60 days|90 days|Custom number of days');
  assert.equal(s.querySelector('[data-cfg="SALE1"]'), null, 'no rental settings for a sale'); assert.equal(s.querySelector('[data-cfg="MO"] [data-cfg-sel]').value, '30');
});
await test('agent changes it to a custom number of days with custom reminders; bad values show a clear message', async () => {
  const row = sel(a.d, '[data-cfg="MO"]'); set(a.w, row.querySelector('[data-cfg-sel]'), 'custom'); assert.equal(row.querySelector('[data-cfg-custom]').hidden, false);
  set(a.w, row.querySelector('[data-cfg-custom]'), '400'); click(row.querySelector('[data-tn-act="cfg-save"]')); await sleep(500); assert.match(sel(a.d, '[data-tn-msg]').textContent, /at most 365 days/);
  const row2 = sel(a.d, '[data-cfg="MO"]'); set(a.w, row2.querySelector('[data-cfg-sel]'), 'custom'); set(a.w, row2.querySelector('[data-cfg-custom]'), '45'); set(a.w, row2.querySelector('[data-cfg-ms]'), '20, 5'); click(row2.querySelector('[data-tn-act="cfg-save"]')); await sleep(900);
  assert.match(sel(a.d, '[data-tn-msg]').textContent, /applies to new tenancies/); const l = JSON.parse(a.w.localStorage.getItem('accoom-agent-listings')).find((x) => x.id === 'MO');
  assert.equal(l.occupancyExtension.days, 45); assert.equal(l.occupancyExtension.mode, 'custom'); assert.equal(l.occupancyExtension.milestones.join(), '20,5');
  assert.equal(JSON.parse(a.w.localStorage.getItem('accoom-rec-tenancies'))[0].occupancyExtension.days, 30, 'the running tenancy keeps its agreed 30 days');
});
await test('agent records an inspection: issues need notes; "tenant still in the property" blocks confirming vacancy', async () => {
  const f = sel(a.d, '[data-ins]'); set(a.w, f.querySelector('[data-in-cond]'), 'major_issues'); click(f.querySelector('[data-tn-act="ins-save"]')); await sleep(500); assert.match(sel(a.d, '[data-tn-msg]').textContent, /Describe the issues/);
  const f2 = sel(a.d, '[data-ins]'); set(a.w, f2.querySelector('[data-in-cond]'), 'good'); f2.querySelector('[data-in-occ]').checked = true; click(f2.querySelector('[data-tn-act="vac-confirm"]')); await sleep(900);
  assert.match(sel(a.d, '[data-tn-msg]').textContent, /still occupied|still in the property/i); assert.match(sel(a.d, '[data-tn-list]').textContent, /Not eligible to be listed again yet/);
});
state = dump(a.w); a.dom.window.close();

console.log('\nTenant moves out, agent confirms, property becomes eligible');
c = await open('tenancies.html', state, CUSTOMER);
await test('tenant confirms moving out; agent is told', async () => {
  click(sel(c.d, '[data-tn-act="occ-moved"]')); await sleep(1000); assert.match(sel(c.d, '[data-tn-msg]').textContent, /asked to inspect/); assert.match(sel(c.d, '[data-tn-list]').textContent, /Tenant says they moved out: Yes/);
  assert.ok(JSON.parse(c.w.localStorage.getItem('accoom-rec-notifications')).some((n) => n.recipientId === 'agent-77' && /moved out of/.test(n.message)));
});
state = dump(c.w); c.dom.window.close();
a = await open('tenancies.html', state, AGENT);
await test('agent inspects (property empty) and confirms vacancy; then confirms ready; eligibility appears and the listing stays NOT public', async () => {
  let f = sel(a.d, '[data-ins]'); f.querySelector('[data-in-keys]').checked = true; click(f.querySelector('[data-tn-act="vac-confirm"]')); await sleep(1200);
  assert.match(sel(a.d, '[data-tn-msg]').textContent, /Vacancy confirmed/); assert.match(sel(a.d, '[data-tn-list]').textContent, /Vacated/);
  const ready = sel(a.d, '[data-tn-act="ready-confirm"]'); assert.ok(ready && !ready.disabled); assert.match(sel(a.d, '[data-tn-list]').textContent, /Not eligible to be listed again yet[\s\S]*not confirmed the property is ready/);
  click(ready); await sleep(1200);
  assert.match(sel(a.d, '[data-tn-list]').textContent, /Eligible for reactivation/); assert.match(sel(a.d, '[data-tn-list]').textContent, /does not go public until it is relisted/);
  const l = JSON.parse(a.w.localStorage.getItem('accoom-agent-listings')).find((x) => x.id === 'MO'); assert.equal(l.reactivation.eligible, true); assert.equal(l.status, 'available'); assert.equal(a.w.Accoom.ListingReview.isPubliclyVisible(l), false);
});
await test('a dispute can be raised and closed from the page; while open it blocks eligibility', async () => {
  a.w.prompt = () => 'Deposit not returned';
  click(sel(a.d, '[data-tn-act="dispute-open"]')); await sleep(1000); assert.match(sel(a.d, '[data-tn-list]').textContent, /Dispute open/); assert.match(sel(a.d, '[data-tn-list]').textContent, /In dispute/);
  assert.equal(JSON.parse(a.w.localStorage.getItem('accoom-agent-listings')).find((x) => x.id === 'MO').reactivation, undefined);
  a.w.prompt = () => 'Settled in person'; click(sel(a.d, '[data-tn-act="dispute-close"]')); await sleep(1000); assert.doesNotMatch(sel(a.d, '[data-tn-list]').textContent, /Dispute open/);
});
state = dump(a.w); a.dom.window.close();

const stranger = await open('tenancies.html', state, { id: 'cust-2', role: 'customer', name: 'Someone Else' });
await test('another customer sees nothing of this tenancy', async () => { assert.equal(stranger.d.querySelectorAll('.tn-card').length, 0); });
await test('the page never uses the old wording anywhere', async () => { assert.ok(!/grace/i.test(stranger.d.documentElement.outerHTML)); });

console.log('\nListing form (real addlistings.html)');
const form = await open('addlistings.html', { 'accoom-agent-listings': '[]' }, { id: 'agent-1', role: 'agent', name: 'Test Agent', agentOnboarded: true, onboardingComplete: true });
await test('the form has an Occupancy Extension field for rentals with all options, explanation, and hides for sales', async () => {
  const fld = sel(form.d, '[data-ml-oe-field]'); assert.ok(fld); assert.equal(fld.hidden, false);
  assert.equal([...fld.querySelectorAll('option')].map((o) => o.textContent).join('|'), 'No Occupancy Extension|7 days|14 days|30 days|60 days|90 days|Custom number of days');
  assert.match(fld.textContent, /agreed number of days after the scheduled tenancy expiry date/); assert.match(fld.textContent, /part of the tenancy terms and the ACTD/); assert.ok(!/grace/i.test(fld.textContent));
  assert.equal(sel(form.d, '[data-ml-oe-custom]').hidden, true); set(form.w, sel(form.d, '[data-ml-oe]'), 'custom'); assert.equal(sel(form.d, '[data-ml-oe-custom]').hidden, false);
  click(sel(form.d, '[data-ml-field-category] [data-value="sale"], [data-value="sale"]')); await sleep(200); assert.equal(fld.hidden, true, 'sale listings have no Occupancy Extension');
  click(sel(form.d, '[data-value="rent"]')); await sleep(200); assert.equal(fld.hidden, false);
});

await test('no unexpected page errors', () => { const bad = errors.filter((e) => !/Not implemented|navigation|fetch|iframe|Could not load|image/i.test(e)); assert.equal(bad.length, 0, bad.join(' | ')); });
console.log('\n' + p + ' passed, ' + f + ' failed'); server.close(); process.exit(f ? 1 : 0);
