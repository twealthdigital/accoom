// Stage 3 page test: drives the REAL admin-review.html (served locally) through the demo gate,
// analysis, document decisions and listing approval.
import http from 'node:http';
import { readFile, readdir } from 'node:fs/promises';
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
const errors = []; const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push((e.detail && e.detail.message) || e.message));
const dom = await JSDOM.fromURL(base + '/admin-review.html', { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
    w.Blob = NodeBlob; w.File = NodeFile; w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
    w.localStorage.setItem('accoom-user', JSON.stringify({ id: 'agent-1', role: 'agent', name: 'Test Agent' }));
    w.fetch = () => Promise.reject(new Error('no fetch'));
  } });
const w = dom.window, d = w.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await sleep(2500);

let p = 0, f = 0;
async function test(n, fn) { try { await fn(); p++; console.log('  PASS ' + n); } catch (e) { f++; console.log('  FAIL ' + n + '\n       ' + e.message); } }
const vis = (el) => !el.hidden;
const pdf = (t, name) => new NodeFile([Buffer.from('%PDF-1.4\n<< /Type /Page >>\n' + t)], name, { type: 'application/pdf' });

console.log('\nAdmin review page (real HTML)');

await test('without demo mode the review screen is hidden and explains it is not real security', () => {
  assert.equal(vis(d.querySelector('[data-adm-gate]')), true);
  assert.equal(vis(d.querySelector('[data-adm-app]')), false);
  assert.ok(/not security/i.test(d.querySelector('[data-adm-gate]').textContent));
  assert.ok(/no real administrator login/i.test(d.querySelector('[data-adm-gate]').textContent));
});

await test('a wrong phrase is refused', () => {
  d.querySelector('[data-adm-phrase]').value = 'let me in'; d.querySelector('[data-adm-enter]').click();
  assert.equal(vis(d.querySelector('[data-adm-app]')), false);
  assert.ok(!d.querySelector('[data-adm-gate-error]').hidden);
});

// seed one listing awaiting review with three documents (two disagree on the owner name)
w.localStorage.setItem('accoom-agent-listings', JSON.stringify([{
  id: 'L1', name: 'Test Duplex', category: 'sale', listingType: 'sale', typeLabel: 'Detached Duplex', address: '12 Test Street', area: 'Ikeja', state: 'Lagos',
  price: 85000000, description: 'A duplex.', status: 'in_review', documents: 3, schemaVersion: 2,
  approval: { state: 'pending_review', published: false, submittedAt: new Date().toISOString(), history: [] }, documentation: { answers: {} }
}]));
for (const [t, n] of [['survey_plan', 'survey.pdf'], ['deed_of_assignment', 'deed-mismatch-name.pdf'], ['seller_ownership_proof', 'owner.pdf']]) {
  await w.Accoom.DocumentStore.add({ file: pdf(n, n), listingId: 'L1', propertyId: 'L1', ownerId: 'agent-77', docType: t });
}

await test('the right phrase opens the screen with a demonstration banner', () => {
  d.querySelector('[data-adm-phrase]').value = 'demo admin'; d.querySelector('[data-adm-enter]').click();
  assert.equal(vis(d.querySelector('[data-adm-app]')), true);
  assert.ok(/LOCAL DEMONSTRATION MODE/.test(d.querySelector('.adm-banner').textContent));
  assert.ok(/no AI has read any document/i.test(d.querySelector('.adm-banner').textContent));
});

await test('the queue lists the listing awaiting review', () => {
  const items = d.querySelectorAll('.adm-q-item'); assert.equal(items.length, 1);
  assert.ok(/Test Duplex/.test(items[0].textContent) && /Pending Review/.test(items[0].textContent));
});

await test('opening it shows property, agent ID only, and documents with NEEDS REVIEW (never VERIFIED)', async () => {
  d.querySelector('.adm-q-item').click(); await sleep(600);
  const t = d.querySelector('[data-adm-detail]').textContent;
  assert.ok(/Detached Duplex/.test(t) && /agent-77/.test(t));
  assert.ok(!/@|\+234|080\d{8}/.test(t), 'no email or phone');
  assert.ok(/Phone numbers and email addresses are not shown/.test(t));
  const pills = [...d.querySelectorAll('.adm-doc .adm-pill')].map((x) => x.textContent);
  assert.equal(pills.length, 3); assert.ok(pills.every((x) => x === 'NEEDS REVIEW'), pills.join());
});

await test('approving before any analysis is not possible', () => {
  assert.equal(d.querySelector('[data-adm-action="approve"]').disabled, true);
});

await test('demo analysis shows a DEMO label, simulated and not-performed tags, cross-document mismatch', async () => {
  d.querySelector('[data-adm-action="analyze"]').click(); await sleep(1800);
  const t = d.querySelector('[data-adm-detail]').textContent;
  assert.ok(/DEMO ANALYSIS/.test(t));
  assert.ok(/Simulated/.test(t) && /Not performed/.test(t) && /Real check/.test(t));
  assert.ok(/Owner name/.test(t) && /inconsistent/.test(t));
  assert.ok(/NOT an authenticity score/.test(t));
  assert.ok(!/\d\s?%/.test(t), 'no percentage');
  assert.ok(/Manual Review/.test(d.querySelector('.adm-head').textContent));
  const pills = [...d.querySelectorAll('.adm-doc .adm-pill')].map((x) => x.textContent);
  assert.ok(pills.every((x) => x === 'NEEDS REVIEW'), 'analysis alone never verifies: ' + pills.join());
});

await test('a document can be opened in the report view and compared side by side', async () => {
  d.querySelector('[data-adm-action="report"]').click(); await sleep(100);
  assert.ok(/Document identification/.test(d.querySelector('[data-adm-detail]').textContent));
  assert.ok(d.querySelector('.adm-table .adm-diff'), 'a differing detail is highlighted');
  assert.ok(/demo sample values/.test(d.querySelector('[data-adm-detail]').textContent));
});

await test('request changes and approve are blocked without a reason / confirmation', async () => {
  d.querySelector('[data-adm-action="changes"]').click(); await sleep(100);
  assert.ok(/Write a reason/.test(d.querySelector('[data-adm-msg]').textContent));
  d.querySelector('[data-adm-action="approve"]').click(); await sleep(100);
  assert.ok(/Tick the box/.test(d.querySelector('[data-adm-msg]').textContent));
  assert.equal(JSON.parse(w.localStorage.getItem('accoom-agent-listings'))[0].status, 'in_review');
});

await test('admin marks a document verified: it shows VERIFIED with the honest source', async () => {
  const btn = d.querySelector('[data-adm-action="decide"][data-dec="verify"]'); btn.click(); await sleep(900);
  const doc = d.querySelector('.adm-doc');
  assert.equal(doc.querySelector('.adm-pill').textContent, 'VERIFIED');
  assert.ok(/not confirmed with the issuer/.test(doc.textContent));
});

await test('request changes with a reason: agent sees it, listing stays private', async () => {
  d.querySelector('[data-adm-reason]').value = 'The deed name does not match the survey.';
  d.querySelector('[data-adm-confirm]').checked = true;
  d.querySelector('[data-adm-action="changes"]').click(); await sleep(900);
  const rec = JSON.parse(w.localStorage.getItem('accoom-agent-listings'))[0];
  assert.equal(rec.approval.state, 'changes_required'); assert.equal(rec.approval.reason, 'The deed name does not match the survey.');
  assert.equal(w.Accoom.ListingReview.isPubliclyVisible(rec), false);
});

await test('after the agent resubmits, the admin can approve and the listing becomes public', async () => {
  await w.Accoom.ListingReview.submitForReview('L1', { role: 'agent', id: 'agent-77' });
  d.querySelector('.adm-q-item') || (d.querySelector('[data-adm-filter]').value = 'action', d.querySelector('[data-adm-filter]').dispatchEvent(new w.Event('change')));
  await sleep(100);
  d.querySelector('[data-adm-filter]').value = 'action'; d.querySelector('[data-adm-filter]').dispatchEvent(new w.Event('change'));
  d.querySelector('.adm-q-item').click(); await sleep(600);
  d.querySelector('[data-adm-action="manual"]').click(); await sleep(700);
  d.querySelector('[data-adm-confirm]').checked = true;
  d.querySelector('[data-adm-action="approve"]').click(); await sleep(900);
  const rec = JSON.parse(w.localStorage.getItem('accoom-agent-listings'))[0];
  assert.equal(rec.approval.state, 'approved'); assert.equal(rec.status, 'available');
  assert.equal(w.Accoom.ListingReview.isPubliclyVisible(rec), true);
});

await test('internal notes are saved for reviewers', async () => {
  d.querySelector('[data-adm-note]').value = 'Landlord confirmed by phone.';
  d.querySelector('[data-adm-action="note"]').click(); await sleep(600);
  assert.ok(/Landlord confirmed by phone/.test(d.querySelector('[data-adm-detail]').textContent));
});

await test('leaving demo mode hides the screen again', () => {
  d.querySelector('[data-adm-exit]').click();
  assert.equal(vis(d.querySelector('[data-adm-app]')), false); assert.equal(vis(d.querySelector('[data-adm-gate]')), true);
});

await test('no other page links to the admin screen, and no unexpected page errors', async () => {
  const files = (await readdir(ROOT)).filter((x) => x.endsWith('.html') && x !== 'admin-review.html');
  for (const x of files) assert.ok(!(await readFile(join(ROOT, x), 'utf8')).includes('admin-review.html'), x + ' links to admin-review.html');
  for (const x of ['partials/header.html', 'partials/footer.html']) assert.ok(!(await readFile(join(ROOT, x), 'utf8')).includes('admin-review'));
  assert.equal(errors.filter((e) => !/Not implemented|navigation|fetch|iframe/i.test(e)).length, 0, errors.join(' | '));
});

console.log(p + ' passed, ' + f + ' failed');
dom.window.close(); server.close(); process.exit(f ? 1 : 0);
