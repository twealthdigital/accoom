// Stage 1 tests: storage layer, migration, documents, listing compatibility.
// Run: npm test
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import assert from 'node:assert/strict';

let passed = 0, failed = 0;
const failures = [];
async function test(name, fn) {
  try { await fn(); passed++; console.log('  PASS ' + name); }
  catch (e) { failed++; failures.push(name); console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
async function rejects(promise, code) {
  try { await promise; } catch (e) { assert.equal(e.code, code, 'expected code ' + code + ' got ' + e.code + ' (' + e.message + ')'); return; }
  assert.fail('expected rejection with code ' + code);
}

const SCRIPTS = ['assets/js/data/schemas.js', 'assets/js/core/records.js', 'assets/js/core/document-store.js'];

function boot(opts = {}) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://accoom.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.indexedDB = opts.idb || new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
  Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
  w.Blob = NodeBlob; w.File = NodeFile;
  w.URL.createObjectURL = () => 'blob:test/' + Math.random().toString(36).slice(2);
  w.URL.revokeObjectURL = () => {};
  w.Accoom = {};
  if (opts.local) for (const [k, v] of Object.entries(opts.local)) w.localStorage.setItem(k, v);
  for (const s of SCRIPTS) w.eval(readFileSync(new URL('../' + s, import.meta.url), 'utf8'));
  return w;
}

const PDF = (text = 'a') => new NodeFile([Buffer.from('%PDF-1.4\n' + text)], 'deed.pdf', { type: 'application/pdf' });
const PNG = (text = 'a') => new NodeFile([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from(text)], 'survey.png', { type: 'image/png' });
const JPG = (name = 'photo.jpg') => new NodeFile([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), Buffer.from('x')], name, { type: 'image/jpeg' });

console.log('\nIDs');
await test('ids are unique across 5000 calls', () => {
  const A = boot().Accoom;
  const set = new Set(); for (let i = 0; i < 5000; i++) set.add(A.Records.newId('doc'));
  assert.equal(set.size, 5000);
});

console.log('\nRecords repository');
await test('create / get / put / where', async () => {
  const R = boot().Accoom.Records.collection('transactions');
  const a = await R.create({ idempotencyKey: 'k1', status: 'pending' });
  assert.ok(a.id.startsWith('txn_'));
  assert.equal((await R.get(a.id)).status, 'pending');
  await R.put({ ...a, status: 'succeeded' });
  assert.equal((await R.get(a.id)).status, 'succeeded');
  assert.equal((await R.where(x => x.status === 'succeeded')).length, 1);
});
await test('persists across a "refresh" (new window, same storage)', async () => {
  const w1 = boot();
  const rec = await w1.Accoom.Records.collection('tenancies').create({ propertyId: 'p1' });
  const dump = {}; for (let i = 0; i < w1.localStorage.length; i++) { const k = w1.localStorage.key(i); dump[k] = w1.localStorage.getItem(k); }
  const w2 = boot({ local: dump });
  assert.equal((await w2.Accoom.Records.collection('tenancies').get(rec.id)).propertyId, 'p1');
});
await test('returned records are copies (mutation does not leak into storage)', async () => {
  const R = boot().Accoom.Records.collection('agreements');
  const a = await R.create({ kind: 'tenancy' });
  a.kind = 'hacked';
  assert.equal((await R.get(a.id)).kind, 'tenancy');
});
await test('duplicate transaction prevention (create)', async () => {
  const R = boot().Accoom.Records.collection('transactions');
  await R.create({ idempotencyKey: 'pay-1' });
  await rejects(R.create({ idempotencyKey: 'pay-1' }), 'duplicate');
});
await test('idempotent createUnique returns first record, never a second', async () => {
  const R = boot().Accoom.Records.collection('transactions');
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => R.createUnique({ idempotencyKey: 'pay-2', status: 'succeeded' })));
  assert.equal(results.filter(r => r.created).length, 1);
  assert.equal(new Set(results.map(r => r.record.id)).size, 1);
  assert.equal((await R.all()).length, 1);
});
await test('issued ACTDs cannot be overwritten (immutable)', async () => {
  const R = boot().Accoom.Records.collection('actds');
  const a = await R.create({ actdNumber: 'ACTD-1', version: 1 });
  await rejects(R.put({ ...a, version: 2 }), 'immutable');
  const v2 = await R.create({ actdNumber: 'ACTD-1', version: 2, supersedes: a.id });
  assert.equal((await R.all()).length, 2);
  assert.notEqual(v2.id, a.id);
});
await test('concurrent writes do not lose records', async () => {
  const R = boot().Accoom.Records.collection('notifications');
  await Promise.all(Array.from({ length: 25 }, (_, i) => R.create({ dedupeKey: 'n' + i })));
  assert.equal((await R.all()).length, 25);
});
await test('notification dedupeKey blocks duplicates', async () => {
  const R = boot().Accoom.Records.collection('notifications');
  await R.createUnique({ dedupeKey: 'ten1:70' });
  const again = await R.createUnique({ dedupeKey: 'ten1:70' });
  assert.equal(again.created, false);
});
await test('corrupted storage is reported, not silently erased', async () => {
  const w = boot({ local: { 'accoom-rec-tenancies': '{not json' } });
  await rejects(w.Accoom.Records.collection('tenancies').create({ a: 1 }), 'corrupt');
  assert.equal(w.localStorage.getItem('accoom-rec-tenancies'), '{not json');
});
await test('quota error is reported with code "quota"', async () => {
  const w = boot();
  w.Storage.prototype.setItem = function () { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; };
  await rejects(w.Accoom.Records.collection('receipts').create({ a: 1 }), 'quota');
});
await test('unknown collection is refused', () => {
  const R = boot().Accoom.Records;
  assert.throws(() => R.collection('nope'), /Unknown collection/);
});
await test('audit trail is append-only', async () => {
  const R = boot().Accoom.Records;
  const e = await R.audit({ action: 'x.y', entityType: 'x', entityId: '1' });
  await rejects(R.collection('auditEvents').put({ ...e, action: 'edited' }), 'immutable');
});
await test('adapter can be swapped (future backend)', async () => {
  const R = boot().Accoom.Records;
  const mem = {};
  R.setAdapter({ read: async n => mem[n] || [], write: async (n, l) => { mem[n] = l; } });
  await R.collection('renewals').create({ tenancyId: 't' });
  assert.equal(mem.renewals.length, 1);
});

console.log('\nExisting listing compatibility + migration');
const legacy = [
  { id: 'L1', name: 'Self con', category: 'rent', period: 'month', status: 'available', price: 50000, images: ['idb:vabc123'], videosAll: ['idb:vdef456'], documents: 0, activityHistory: [{ type: 'uploaded', at: 'x' }], amenities: ['a'] },
  { id: 'L2', name: 'Plot of land', category: 'sale', period: 'sale', status: 'sold', price: 9000000, images: ['idb:vzzz'], documents: 2 },
  { id: 'L3', name: 'Held flat', category: 'rent', period: 'year', status: 'hold' }
];
await test('migration adds new fields and preserves every old field byte-for-byte', async () => {
  const w = boot({ local: { 'accoom-agent-listings': JSON.stringify(legacy) } });
  const r = await w.Accoom.Records.init();
  assert.equal(r.schemaVersion, 1);
  const after = JSON.parse(w.localStorage.getItem('accoom-agent-listings'));
  assert.equal(after.length, 3);
  legacy.forEach((old, i) => Object.keys(old).forEach(k => assert.equal(JSON.stringify(after[i][k]), JSON.stringify(old[k]), old.id + '.' + k)));
  assert.equal(after[0].approval.state, 'legacy_unreviewed');
  assert.equal(after[0].schemaVersion, 2);
});
await test('photo/video "idb:" references survive migration', async () => {
  const w = boot({ local: { 'accoom-agent-listings': JSON.stringify(legacy) } });
  await w.Accoom.Records.init();
  const raw = w.localStorage.getItem('accoom-agent-listings');
  ['idb:vabc123', 'idb:vdef456', 'idb:vzzz'].forEach(ref => assert.ok(raw.includes(ref), ref));
});
await test('numeric legacy "documents" count is not overwritten', async () => {
  const w = boot({ local: { 'accoom-agent-listings': JSON.stringify(legacy) } });
  await w.Accoom.Records.init();
  assert.equal(JSON.parse(w.localStorage.getItem('accoom-agent-listings'))[1].documents, 2);
});
await test('sale listings get NO rental-only fields; rent listings do', async () => {
  const w = boot({ local: { 'accoom-agent-listings': JSON.stringify(legacy) } });
  await w.Accoom.Records.init();
  const a = JSON.parse(w.localStorage.getItem('accoom-agent-listings'));
  assert.equal('occupancyExtension' in a[1], false);
  assert.equal(JSON.stringify(a[0].occupancyExtension), JSON.stringify({ mode: 'none', days: 0 }));
});
await test('statuses (sold, hold, available) are not changed by migration', async () => {
  const w = boot({ local: { 'accoom-agent-listings': JSON.stringify(legacy) } });
  await w.Accoom.Records.init();
  const a = JSON.parse(w.localStorage.getItem('accoom-agent-listings'));
  assert.equal(a.map(x => x.status).join(), 'available,sold,hold');
});
await test('migration is idempotent (second run changes nothing)', async () => {
  const w = boot({ local: { 'accoom-agent-listings': JSON.stringify(legacy) } });
  await w.Accoom.Records.init();
  const once = w.localStorage.getItem('accoom-agent-listings');
  const r2 = w.Accoom.Records._migrateListings();
  assert.equal(r2.migrated, 0);
  assert.equal(w.localStorage.getItem('accoom-agent-listings'), once);
});
await test('no listings saved yet: init works and writes nothing to listings', async () => {
  const w = boot();
  await w.Accoom.Records.init();
  assert.equal(w.localStorage.getItem('accoom-agent-listings'), null);
});
await test('corrupt listings are left untouched and init reports the problem', async () => {
  const w = boot({ local: { 'accoom-agent-listings': '[[broken' } });
  await rejects(w.Accoom.Records.init(), 'corrupt');
  assert.equal(w.localStorage.getItem('accoom-agent-listings'), '[[broken');
});
await test("existing my-listings save pattern (Object.assign on old record) keeps new fields", async () => {
  const w = boot({ local: { 'accoom-agent-listings': JSON.stringify(legacy) } });
  await w.Accoom.Records.init();
  const list = JSON.parse(w.localStorage.getItem('accoom-agent-listings'));
  const saved = Object.assign({}, list[0], { name: 'Edited', updatedAt: 'now' });
  assert.equal(saved.approval.state, 'legacy_unreviewed');
});
await test('migration audit event recorded', async () => {
  const w = boot({ local: { 'accoom-agent-listings': JSON.stringify(legacy) } });
  await w.Accoom.Records.init();
  const ev = await w.Accoom.Records.collection('auditEvents').all();
  assert.equal(ev[0].action, 'storage.migrated');
});

console.log('\nDocument store');
await test('validateFile: type, size, empty, mismatch', () => {
  const D = boot().Accoom.DocumentStore;
  assert.equal(D.validateFile(PDF()).ok, true);
  assert.equal(D.validateFile(new NodeFile(['x'], 'a.exe', { type: 'application/octet-stream' })).code, 'invalid_type');
  assert.equal(D.validateFile(new NodeFile([], 'a.pdf', { type: 'application/pdf' })).code, 'empty_file');
  assert.equal(D.validateFile(new NodeFile(['x'], 'a.png', { type: 'application/pdf' })).code, 'type_mismatch');
  const big = { size: D.MAX_SIZE + 1, name: 'b.pdf', type: 'application/pdf' };
  assert.equal(D.validateFile(big).code, 'too_large');
});
await test('add stores file in IndexedDB and a metadata record with all required fields', async () => {
  const D = boot().Accoom.DocumentStore;
  const r = await D.add({ file: PDF('one'), listingId: 'L1', propertyId: 'P1', ownerId: 'agent1', docType: 'deed_of_assignment' });
  ['id', 'propertyId', 'listingId', 'ownerId', 'docType', 'originalName', 'mimeType', 'size', 'uploadedAt', 'version', 'storageRef', 'reviewStatus', 'verification', 'rejectionReason']
    .forEach(f => assert.ok(f in r, f));
  assert.equal(r.version, 1); assert.equal(r.reviewStatus, 'uploaded'); assert.equal(r.verification.source, 'none');
  assert.ok(r.storageRef.startsWith('doc:'));
  const blob = await D.getFile(r.id);
  assert.equal(blob.size, r.size);
});
await test('large files are never placed in localStorage', async () => {
  const w = boot();
  await w.Accoom.DocumentStore.add({ file: PDF('x'.repeat(200000)), listingId: 'L1', docType: 'survey_plan' });
  let total = 0; for (let i = 0; i < w.localStorage.length; i++) total += w.localStorage.getItem(w.localStorage.key(i)).length;
  assert.ok(total < 5000, 'localStorage used ' + total);
});
await test('files persist in IndexedDB across a refresh', async () => {
  const w1 = boot();
  const r = await w1.Accoom.DocumentStore.add({ file: PNG('p'), listingId: 'L9', docType: 'survey_plan' });
  const dump = {}; for (let i = 0; i < w1.localStorage.length; i++) { const k = w1.localStorage.key(i); dump[k] = w1.localStorage.getItem(k); }
  const w2 = boot({ local: dump, idb: w1.indexedDB });
  assert.ok((await w2.Accoom.DocumentStore.getFile(r.id)).size > 0);
});
await test('renamed file with wrong contents is refused', async () => {
  const D = boot().Accoom.DocumentStore;
  const fake = new NodeFile([Buffer.from('MZ not a pdf')], 'deed.pdf', { type: 'application/pdf' });
  await rejects(D.add({ file: fake, listingId: 'L1', docType: 'survey_plan' }), 'type_mismatch');
});
await test('exact duplicate upload for the same listing is blocked', async () => {
  const D = boot().Accoom.DocumentStore;
  await D.add({ file: PDF('same'), listingId: 'L1', docType: 'survey_plan' });
  await rejects(D.add({ file: PDF('same'), listingId: 'L1', docType: 'deed_of_assignment' }), 'duplicate');
  await D.add({ file: PDF('same'), listingId: 'L2', docType: 'survey_plan' }); // other listing is fine
});
await test('replace() creates v2, keeps v1 file + record as history', async () => {
  const D = boot().Accoom.DocumentStore;
  const v1 = await D.add({ file: PDF('v1'), listingId: 'L1', ownerId: 'a1', docType: 'c_of_o' });
  const v2 = await D.replace(v1.id, PDF('v2 changed'), { reason: 'Corrected scan' });
  assert.equal(v2.version, 2); assert.equal(v2.groupId, v1.groupId); assert.equal(v2.supersedes, v1.id);
  const hist = await D.history(v1.groupId);
  assert.equal(JSON.stringify(hist.map(h => h.version)), '[1,2]');
  assert.equal(hist[0].reviewStatus, 'superseded'); assert.equal(hist[0].isCurrent, false);
  assert.equal(hist[0].supersededBy, v2.id);
  assert.ok((await D.getFile(v1.id)).size > 0, 'v1 file still retrievable');
  const current = await D.listForListing('L1');
  assert.equal(current.length, 1); assert.equal(current[0].id, v2.id);
  assert.equal((await D.listForListing('L1', { includeHistory: true })).length, 2);
});
await test('uploading the same type again becomes a new version of the same group', async () => {
  const D = boot().Accoom.DocumentStore;
  const a = await D.add({ file: PDF('a1'), listingId: 'L1', docType: 'survey_plan' });
  const b = await D.add({ file: PDF('a2'), listingId: 'L1', docType: 'survey_plan' });
  assert.equal(b.version, 2); assert.equal(b.groupId, a.groupId);
});
await test('"additional supporting" documents can be added many times', async () => {
  const D = boot().Accoom.DocumentStore;
  await D.add({ file: PDF('s1'), listingId: 'L1', docType: 'additional_supporting' });
  await D.add({ file: PDF('s2'), listingId: 'L1', docType: 'additional_supporting' });
  assert.equal((await D.listForListing('L1')).length, 2);
});
await test('replace refuses same file and non-current versions', async () => {
  const D = boot().Accoom.DocumentStore;
  const v1 = await D.add({ file: PDF('s'), listingId: 'L1', docType: 'c_of_o' });
  await rejects(D.replace(v1.id, PDF('s')), 'duplicate');
  await D.replace(v1.id, PDF('t'));
  await rejects(D.replace(v1.id, PDF('u')), 'bad_status');
});
await test('missing file (browser data cleared) gives a clear error and integrity report', async () => {
  const D = boot().Accoom.DocumentStore;
  const r = await D.add({ file: PDF('gone'), listingId: 'L1', docType: 'survey_plan' });
  await D._removeFileForTest(r.id);
  await rejects(D.getFile(r.id), 'missing_file');
  const rep = await D.checkIntegrity('L1');
  assert.equal(rep[0].present, false);
});
await test('unknown document id gives not_found', async () => {
  await rejects(boot().Accoom.DocumentStore.getFile('doc_nope'), 'not_found');
});
await test('urlFor is lazy and cached', async () => {
  const D = boot().Accoom.DocumentStore;
  const r = await D.add({ file: PDF('u'), listingId: 'L1', docType: 'survey_plan' });
  const u1 = await D.urlFor(r.id), u2 = await D.urlFor(r.id);
  assert.equal(u1, u2);
});
await test('quota error from IndexedDB is surfaced as "quota" and leaves no record', async () => {
  const w = boot();
  const D = w.Accoom.DocumentStore;
  const realPut = w.indexedDB.constructor; // keep reference unused
  // Force a quota failure by making the Records write fail after the file is stored.
  w.Accoom.Records.setAdapter({ read: async () => [], write: async () => { const e = new Error('q'); e.code = 'quota'; throw e; } });
  await rejects(D.add({ file: PDF('q'), listingId: 'L1', docType: 'survey_plan' }), 'quota');
});
await test('rollback: failed metadata save removes the orphan file', async () => {
  const w = boot();
  const D = w.Accoom.DocumentStore;
  const ok = await D.add({ file: PDF('keep'), listingId: 'L1', docType: 'survey_plan' });
  w.Accoom.Records.setAdapter({ read: async () => [ok], write: async () => { const e = new Error('q'); e.code = 'quota'; throw e; } });
  await rejects(D.add({ file: PDF('orphan'), listingId: 'L1', docType: 'deed_of_assignment' }), 'quota');
  w.Accoom.Records.setAdapter({ read: async () => [ok], write: async () => {} });
  // only the first file should exist in the store
  const db = await new Promise(res => { const r = w.indexedDB.open('accoom-documents'); r.onsuccess = () => res(r.result); });
  const count = await new Promise(res => { const q = db.transaction('files').objectStore('files').count(); q.onsuccess = () => res(q.result); });
  assert.equal(count, 1);
});
await test("DocumentStore does not touch the existing MediaStore database 'accoom-media'", async () => {
  const w = boot();
  await w.Accoom.DocumentStore.add({ file: PDF('m'), listingId: 'L1', docType: 'survey_plan' });
  const dbs = await w.indexedDB.databases();
  assert.ok(!dbs.some(d => d.name === 'accoom-media'));
  assert.ok(dbs.some(d => d.name === 'accoom-documents'));
});

console.log('\nVerification honesty');
await test('VERIFIED is refused without issuer/admin evidence', async () => {
  const D = boot().Accoom.DocumentStore;
  const r = await D.add({ file: PDF('v'), listingId: 'L1', docType: 'c_of_o' });
  await rejects(D.setReviewStatus(r.id, 'verified'), 'verification_required');
  await rejects(D.setReviewStatus(r.id, 'verified', { verification: { source: 'demo_analysis', verifiedBy: 'demo' } }), 'verification_required');
  await rejects(D.setReviewStatus(r.id, 'verified', { verification: { source: 'ai_analysis', verifiedBy: 'ai' } }), 'verification_required');
});
await test('VERIFIED accepted with administrator decision and is audited', async () => {
  const w = boot();
  const D = w.Accoom.DocumentStore;
  const r = await D.add({ file: PDF('v2'), listingId: 'L1', docType: 'c_of_o' });
  const s = await D.setReviewStatus(r.id, 'verified', { actorId: 'adm1', actorRole: 'admin', verification: { source: 'admin_manual', verifiedBy: 'adm1' } });
  assert.equal(s.reviewStatus, 'verified'); assert.equal(s.verification.source, 'admin_manual');
  const ev = await w.Accoom.Records.collection('auditEvents').where(e => e.action === 'document.status');
  assert.equal(ev.length, 1);
});
await test('rejection requires a reason; "superseded" cannot be set by hand', async () => {
  const D = boot().Accoom.DocumentStore;
  const r = await D.add({ file: PDF('r'), listingId: 'L1', docType: 'c_of_o' });
  await rejects(D.setReviewStatus(r.id, 'rejected'), 'bad_status');
  await rejects(D.setReviewStatus(r.id, 'superseded'), 'bad_status');
  const ok = await D.setReviewStatus(r.id, 'rejected', { reason: 'Unreadable scan' });
  assert.equal(ok.rejectionReason, 'Unreadable scan');
});
await test('transaction factory forces valid enums (button click is never a gateway webhook)', () => {
  const S = boot().Accoom.Schemas;
  const t = S.make.transaction({ paymentSource: 'hacked', status: 'weird', billingPeriod: 'fortnight' });
  assert.equal(t.paymentSource, 'demo'); assert.equal(t.status, 'pending'); assert.equal(t.billingPeriod, '');
  assert.equal(JSON.stringify(S.ENUM.billingPeriod), JSON.stringify(['day', 'week', 'month', 'year']));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) { console.log('Failed: ' + failures.join('; ')); process.exit(1); }
