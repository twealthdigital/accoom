import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { localResourceOptions } from './local-resources.mjs';
// Stage 2 page test: drives the REAL addlistings.html (served locally) with image decoding stubbed,
// because jsdom cannot decode images. Run: npm test
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
const ROOT = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0])); const b = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const errors = []; const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push((e.detail && e.detail.message) || e.message));
const dom = await JSDOM.fromURL(base + '/addlistings.html', { runScripts: 'dangerously', resources: localResourceOptions(base), pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
    w.Blob = NodeBlob; w.File = NodeFile; w.URL.createObjectURL = () => 'blob:x'; w.URL.revokeObjectURL = () => {};
    w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
    w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
    w.localStorage.setItem('accoom-user', JSON.stringify({ id: 'agent-1', role: 'agent', name: 'Test Agent', agentOnboarded: true, onboardingComplete: true }));
    w.fetch = () => Promise.reject(new Error('no fetch'));
    w.Image = class { constructor() { this.width = 10; this.height = 10; this.naturalWidth = 10; this.naturalHeight = 10; } set src(v) { this._s = v; setTimeout(() => this.onload && this.onload(), 0); } get src() { return this._s; } };
    w.HTMLCanvasElement.prototype.getContext = () => ({ drawImage() {}, fillRect() {}, fillStyle: '' });
    w.HTMLCanvasElement.prototype.toBlob = function (cb) { cb(new NodeBlob(['x'], { type: 'image/jpeg' })); };
    w.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/jpeg;base64,AAAA';
  } });
await new Promise((r) => setTimeout(r, 3000));
const d = dom.window.document; const out = {};
const docs = () => d.querySelector('[data-ml-docs]') ? d.querySelector('[data-ml-docs]').textContent : null;
out.url = dom.window.location.pathname;
out.mounts = [...d.querySelectorAll('[data-ml-select-mount]')].map((m) => m.getAttribute('data-ml-select-mount') + ':' + m.children.length).join(' ');
out.rentDocs = /ownership or landlord authorization/i.test(docs() || '');
out.hasAccoom = typeof dom.window.Accoom, out.hasUpload = typeof (dom.window.Accoom || {}).DocumentUpload;

const w = dom.window;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function pickOption(mount, labelRe) {
  const trig = d.querySelector('[data-ml-select-mount="' + mount + '"] .ml-select-trigger'); trig.click();
  const opt = [...d.querySelectorAll('[data-ml-select-mount="' + mount + '"] .ml-select-option')].find((o) => labelRe.test(o.textContent));
  opt.click();
}
function setVal(sel, v) { const el = d.querySelector(sel); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); el.dispatchEvent(new w.Event('change', { bubbles: true })); }
pickOption('propertyType', /Mini Flat/); pickOption('period', /^Day$/); pickOption('state', /Lagos/);
const inputs = [...d.querySelectorAll('input.ml-input, textarea.ml-input')].map((i) => (i.id || i.getAttribute('data-ml-field') || i.name));
out.inputs = inputs.join(',');
setVal('#ml-title', 'E2E Mini Flat'); 
for (const [k, v] of Object.entries({ beds: 1, baths: 1, kitchens: 1, livingRooms: 1, parking: 0 })) setVal('[data-ml-field="' + k + '"]', v);
const idOf = (re) => [...d.querySelectorAll('input.ml-input')].find((i) => re.test(i.id || ''));
for (const [re, v] of [[/area/i, 'Ikeja'], [/address/i, '12 Test Street'], [/price/i, '250000']]) { const el = idOf(re); if (el) { el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); } }
setVal('#ml-description', 'A clean mini flat with steady water supply and good access roads.');
const am = d.querySelector('[data-ml-amenities] input'); am.checked = true; am.dispatchEvent(new w.Event('change', { bubbles: true }));
const qf = d.querySelector('[data-ml-quickfacts] input'); if (qf) { qf.checked = true; qf.dispatchEvent(new w.Event('change', { bubbles: true })); }
// 3 property photos
const imgInput = d.querySelector('[data-ml-upload="images"] input[type=file]');
const png = () => new NodeFile([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')], 'p' + Math.random() + '.png', { type: 'image/png' });
Object.defineProperty(imgInput, 'files', { value: [png(), png(), png()], configurable: true });
imgInput.dispatchEvent(new w.Event('change', { bubbles: true }));
await sleep(1500);
out.photoCount = d.querySelector('[data-ml-upload="images"] [data-ml-upload-count]').textContent;

// --- Attempt 1: submit WITHOUT documents -> must be blocked, nothing saved
w.localStorage.removeItem('accoom-agent-listings');
d.querySelector('[data-ml-save]').click(); await sleep(800);
out.noDocsNote = d.querySelector('[data-ml-submit-note]').textContent.slice(0, 140);
out.savedAfterBlock = w.localStorage.getItem('accoom-agent-listings');

// --- Attempt 2: choose the ownership document, submit
const docBtn = d.querySelector('[data-ml-docs] [data-du-action="choose"][data-type="ownership_or_authorization"]'); docBtn.click();
const fin = [...d.querySelectorAll('input[type=file]')].find((i) => i.getAttribute('accept') && /pdf/.test(i.getAttribute('accept')));
const pdf = new NodeFile([Buffer.from('%PDF-1.4\nlandlord letter')], 'landlord-letter.pdf', { type: 'application/pdf' });
Object.defineProperty(fin, 'files', { value: [pdf], configurable: true }); fin.dispatchEvent(new w.Event('change'));
out.docStaged = /landlord-letter\.pdf/.test(d.querySelector('[data-ml-docs]').textContent);
let navigated = ''; 
d.querySelector('[data-ml-save]').click(); await sleep(2500);
const list = JSON.parse(w.localStorage.getItem('accoom-agent-listings') || '[]');
const rec = list.find((l) => l.name === 'E2E Mini Flat') || {};
out.saved = { verified: rec.approval && rec.approval.verified, status: rec.status, approval: rec.approval && rec.approval.state, period: rec.period, listingType: rec.listingType, documents: rec.documents, published: rec.approval && rec.approval.published };
out.note = d.querySelector('[data-ml-submit-note]').textContent.slice(0, 160);
// document really stored in IndexedDB?
const stored = await w.Accoom.DocumentStore.listForListing(rec.id || 'x');
out.storedDocs = stored.map((x) => x.docType + ' v' + x.version + ' ' + x.reviewStatus);
out.publicVisible = w.Accoom.ListingReview.isPubliclyVisible(rec);
const notes = (w.Accoom.NotificationService && w.Accoom.NotificationService.getAll ? w.Accoom.NotificationService.getAll() : []).map((n) => n.title);
out.notifications = notes.slice(0, 3);
const checks = [
  ['Day is offered as a billing period', () => assert.equal(out.rentDocs, true)],
  ['submit without documents is blocked and saves nothing', () => { assert.ok(/Add the required documents first/.test(out.noDocsNote)); assert.equal(out.savedAfterBlock, null); }],
  ['submit with ownership document is auto-approved, verified and published (testing flag on)', () => {
    assert.equal(out.saved.status, 'available'); assert.equal(out.saved.approval, 'approved');
    assert.equal(out.saved.period, 'day'); assert.equal(out.saved.listingType, 'rent');
    assert.equal(out.saved.published, true); assert.equal(out.saved.verified, true); assert.equal(out.publicVisible, true); assert.equal(out.saved.documents, 1);
  }],
  ['the document is stored in IndexedDB as version 1, not verified', () => assert.equal(JSON.stringify(out.storedDocs), JSON.stringify(['ownership_or_authorization v1 uploaded']))],
  ['the agent is notified', () => assert.ok(out.notifications.includes('Listing approved'))],
  ['no unexpected page errors', () => assert.equal(errors.filter((e) => !/Not implemented|navigation|fetch|iframe/i.test(e)).length, 0)]
];
let p = 0, f = 0;
console.log('\nPage test (real addlistings.html)');
for (const [n, fn] of checks) { try { fn(); p++; console.log('  PASS ' + n); } catch (e) { f++; console.log('  FAIL ' + n + '\n       ' + e.message); } }
console.log(p + ' passed, ' + f + ' failed');
dom.window.close(); server.close(); process.exit(f ? 1 : 0);
