// The REAL way a listing is born: saved as draft with idb: photo, submitted, auto-approved, then a
// customer in another browser must see it. (sync.e2e.test.mjs seeds an already-approved listing.)
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const PORT = 3800 + Math.floor(Math.random() * 150);
const base = 'http://127.0.0.1:' + PORT;
const dataDir = await mkdtemp(join(tmpdir(), 'accoom-flow-'));
const srv = spawn(process.execPath, ['server/server.js'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT), ACCOOM_DATA: dataDir }, stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (let i = 0; i < 40; i++) { try { if ((await fetch(base + '/api/ping')).ok) break; } catch {} await sleep(100); }

async function browser(path, storage, errors = []) {
  const vc = new VirtualConsole(); vc.on('jsdomError', (e) => errors.push(e.message)); vc.on('warn', (...a) => errors.push(a.join(' ')));
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {};
      const blobs = new Map(); let n = 0;
      w.URL.createObjectURL = (b) => { const u = 'blob:fake/' + (++n); blobs.set(u, b); return u; }; w.URL.revokeObjectURL = () => {};
      w.fetch = (u, o) => String(u).startsWith('blob:') ? Promise.resolve({ blob: async () => blobs.get(String(u)) }) : fetch(new URL(u, base), o);
      for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
    } });
  await sleep(2500);
  return dom.window;
}
let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

const errs = [];
const agentUser = { name: 'Adeola Fortune', email: 'adeola@example.com', role: 'agent', agentProfileCompleted: true };
const draft = { id: 'lst_real', name: 'Real Flow Flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', location: 'Akungba, Ondo',
  beds: 2, baths: 1, images: [], agentName: 'Adeola Fortune', ownerId: 'local-agent', price: 100000, priceValue: 100000, serviceCharge: 10000, legalFee: 5000, agencyFee: 5000, schemaVersion: 2,
  status: 'in_review', approval: { state: 'draft', published: false, history: [] }, documentation: { answers: {} } };

const agent = await browser('document-centre.html', { 'accoom-user': JSON.stringify(agentUser), 'accoom-agent-listings': JSON.stringify([draft]) }, errs);
const A = agent.Accoom;

await test('agent stores a photo like the real form (IndexedDB ref) and submits the listing', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const key = A.MediaStore.newKey();
  await A.MediaStore.put(key, new Blob([png], { type: 'image/png' }));
  const url = await A.MediaStore.urlFor(A.MediaStore.refOf(key));
  const list = JSON.parse(agent.localStorage.getItem('accoom-agent-listings'));
  list[0].images = [url]; list[0].cover = url;
  agent.localStorage.setItem('accoom-agent-listings', JSON.stringify(list));   // converted to idb: ref by media-store
  await A.DocumentStore.add({ file: new agent.File(['%PDF-1.4\nx'], 'own.pdf', { type: 'application/pdf' }), listingId: 'lst_real', ownerId: 'local-agent', docType: 'ownership_or_authorization' });
  const saved = await A.ListingReview.submitForReview('lst_real', { role: 'agent', id: 'local-agent' });
  assert.ok(A.ListingReview.isPubliclyVisible(saved), 'not public after submit');
  assert.match(agent.localStorage.getItem('accoom-agent-listings').replace(/blob:[^"]+/g, 'BLOB'), /BLOB|idb:/);
});
await sleep(5000);
await test('the server received that listing (with its uploaded photo)', async () => {
  const { listings } = await (await fetch(base + '/api/listings')).json();
  assert.equal(listings.length, 1, 'server has no listing. page errors: ' + errs.slice(0, 3).join(' | '));
  assert.equal(listings[0].price, 120000);
  assert.match(listings[0].images[0] || '', /^\/uploads\//);
});
const customer = await browser('home.html', { 'accoom-user': JSON.stringify({ name: 'Chidi', email: 'chidi@example.com', role: 'customer' }) });
await test('a customer in another browser sees it on the home page', () => {
  assert.ok(customer.Accoom.PropertyService.getAll().some((i) => i.id === 'lst_real'), 'not in catalogue');
  assert.match(customer.document.body.textContent, /Real Flow Flat/);
});
srv.kill();
[agent, customer].forEach((w) => w.close());
await rm(dataDir, { recursive: true, force: true });
console.log('\n' + p + ' passed, ' + f + ' failed'); process.exit(f ? 1 : 0);
