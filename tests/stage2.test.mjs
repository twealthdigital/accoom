// Stage 2 tests: document requirements, upload UI, review/approval flow, public visibility.
// Run: npm test
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import assert from 'node:assert/strict';

let passed = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  PASS ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}
async function rejects(promise, code) {
  try { await promise; } catch (e) { assert.equal(e.code, code, 'expected ' + code + ' got ' + e.code + ' (' + e.message + ')'); return e; }
  assert.fail('expected rejection ' + code);
}
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

const SCRIPTS = ['assets/js/data/schemas.js', 'assets/js/core/records.js', 'assets/js/core/document-store.js',
  'assets/js/data/document-requirements.js', 'assets/js/data/listing-review.js',
  'assets/js/modules/document-preview.js', 'assets/js/modules/document-upload.js'];

function boot(opts = {}) {
  const dom = new JSDOM('<!doctype html><body><div id="m"></div></body>', { url: 'https://accoom.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
  Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
  w.Blob = NodeBlob; w.File = NodeFile;
  w.URL.createObjectURL = () => 'blob:test/' + Math.random().toString(36).slice(2);
  w.URL.revokeObjectURL = () => {};
  w.Accoom = {};
  w.notes = [];
  w.Accoom.NotificationService = { add: (n) => w.notes.push(n) };
  if (opts.listings) w.localStorage.setItem('accoom-agent-listings', JSON.stringify(opts.listings));
  for (const s of SCRIPTS) w.eval(read(s));
  w.Accoom.ListingReview.AUTO_APPROVE.enabled = false; // these tests cover the real manual review workflow
  return w;
}

const PDF = (t = 'a', name = 'doc.pdf') => new NodeFile([Buffer.from('%PDF-1.4\n' + t)], name, { type: 'application/pdf' });
const PNG = (t = 'a', name = 'plan.png') => new NodeFile([Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]), Buffer.from(t)], name, { type: 'image/png' });
const ADMIN = { role: 'admin', id: 'demo-admin' };
const AGENT = { role: 'agent', id: 'a1' };

const listing = (over = {}) => Object.assign({
  id: 'L1', name: 'Test flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'day',
  status: 'in_review', schemaVersion: 2, approval: { state: 'draft', published: false, history: [] }, documentation: { answers: {} }
}, over);

const ids = (r) => r.spec.items.map((i) => i.id);

console.log('\nDocument requirements');

await test('rent set: ownership required, others optional or conditional', () => {
  const w = boot(); const spec = w.Accoom.DocRequirements.forListing('rent', 'Mini Flat', {});
  const by = Object.fromEntries(spec.items.map((i) => [i.id, i]));
  assert.equal(by.ownership_or_authorization.blocking, true);
  assert.equal(by.agent_authorization.blocking, false); // owner by default
  assert.equal(by.rent_receipt.blocking, false);
  assert.equal(by.tenancy_agreement.blocking, false);
  assert.equal(by.inventory_report.blocking, false);
  assert.equal(by.additional_supporting.level, 'optional');
  assert.equal(by.ownership_or_authorization.badge, 'Required');
  assert.equal(by.rent_receipt.badge, 'Optional');
  assert.equal(by.inventory_report.badge, 'Required where applicable');
});

await test('rent: acting for the landlord makes agent authorization required', () => {
  const w = boot(); const spec = w.Accoom.DocRequirements.forListing('rent', 'Mini Flat', { representation: 'agent' });
  const a = spec.items.find((i) => i.id === 'agent_authorization');
  assert.equal(a.blocking, true); assert.equal(a.badge, 'Required for your listing');
});

await test('sale set: no single title document is mandatory, but one title document is', () => {
  const w = boot(); const R = w.Accoom.DocRequirements;
  const spec = R.forListing('sale', 'Detached Duplex', {});
  for (const id of ['certificate_of_occupancy', 'deed_of_assignment', 'governors_consent', 'land_registry_search']) {
    assert.equal(spec.items.find((i) => i.id === id).blocking, false, id + ' must not be mandatory on its own');
  }
  assert.equal(spec.groups[0].min, 1);
  const none = R.evaluate('sale', 'Detached Duplex', {}, []);
  assert.equal(none.complete, false);
  assert.equal(none.groupIssues.length, 1);
  const docs = [{ docType: 'deed_of_assignment' }, { docType: 'survey_plan' }, { docType: 'seller_ownership_proof' }];
  assert.equal(R.evaluate('sale', 'Detached Duplex', {}, docs).complete, true);
  // any ONE title document works
  const docs2 = [{ docType: 'governors_consent' }, { docType: 'survey_plan' }, { docType: 'seller_ownership_proof' }];
  assert.equal(R.evaluate('sale', 'Detached Duplex', {}, docs2).complete, true);
});

await test('sale: Power of Attorney only required when selling for the owner', () => {
  const w = boot(); const R = w.Accoom.DocRequirements;
  assert.equal(R.forListing('sale', 'Bungalow', {}).items.find((i) => i.id === 'power_of_attorney').blocking, false);
  assert.equal(R.forListing('sale', 'Bungalow', { representation: 'representative' }).items.find((i) => i.id === 'power_of_attorney').blocking, true);
});

await test('land / plot hides building approval (sale) and inventory (rent)', () => {
  const w = boot(); const R = w.Accoom.DocRequirements;
  assert.ok(!ids({ spec: R.forListing('sale', 'Land / Plot', {}) }).includes('building_approval'));
  assert.ok(ids({ spec: R.forListing('sale', 'Bungalow', {}) }).includes('building_approval'));
  assert.ok(!ids({ spec: R.forListing('rent', 'Land / Plot', {}) }).includes('inventory_report'));
});

await test('rejected and superseded documents do not count as submitted', () => {
  const w = boot(); const R = w.Accoom.DocRequirements;
  const r = R.evaluate('rent', 'Mini Flat', {}, [{ docType: 'ownership_or_authorization', reviewStatus: 'rejected', isCurrent: true }]);
  assert.equal(r.complete, false);
  const r2 = R.evaluate('rent', 'Mini Flat', {}, [{ docType: 'ownership_or_authorization', reviewStatus: 'uploaded', isCurrent: true }]);
  assert.equal(r2.complete, true);
});

await test('admin overrides: agents are refused, admin changes apply, additional stays optional', () => {
  const w = boot(); const R = w.Accoom.DocRequirements;
  assert.throws(() => R.setOverride(AGENT, { listingType: 'rent', docType: 'rent_receipt', level: 'required' }), (e) => e.code === 'forbidden');
  R.setOverride(ADMIN, { listingType: 'rent', docType: 'rent_receipt', level: 'required' });
  assert.equal(R.forListing('rent', 'Mini Flat', {}).items.find((i) => i.id === 'rent_receipt').blocking, true);
  // property-type specific override beats the general one
  R.setOverride(ADMIN, { listingType: 'rent', docType: 'rent_receipt', level: 'hidden', propertyType: 'shop' });
  assert.ok(!ids({ spec: R.forListing('rent', 'Commercial Space / Shop', {}) }).includes('rent_receipt'));
  assert.ok(ids({ spec: R.forListing('rent', 'Mini Flat', {}) }).includes('rent_receipt'));
  assert.throws(() => R.setOverride(ADMIN, { listingType: 'rent', docType: 'additional_supporting', level: 'required' }), (e) => e.code === 'bad_input');
  assert.throws(() => R.setOverride(ADMIN, { listingType: 'rent', docType: 'nope', level: 'required' }), (e) => e.code === 'bad_input');
});

console.log('\nReview flow and public visibility');

async function addDocs(w, id, types) {
  for (const [i, t] of types.entries()) await w.Accoom.DocumentStore.add({ file: PDF('x' + i + t), listingId: id, ownerId: 'a1', docType: t });
}

await test('submitting without required documents is refused and changes nothing', async () => {
  const w = boot({ listings: [listing()] });
  const e = await rejects(w.Accoom.ListingReview.submitForReview('L1', AGENT), 'documents_incomplete');
  assert.equal(e.report.missing[0].id, 'ownership_or_authorization');
  const rec = JSON.parse(w.localStorage.getItem('accoom-agent-listings'))[0];
  assert.equal(rec.approval.state, 'draft');
});

await test('submit with documents -> Pending Review, still private, agent notified', async () => {
  const w = boot({ listings: [listing()] });
  await addDocs(w, 'L1', ['ownership_or_authorization']);
  const rec = await w.Accoom.ListingReview.submitForReview('L1', AGENT);
  assert.equal(rec.approval.state, 'pending_review');
  assert.equal(rec.status, 'in_review');
  assert.equal(w.Accoom.ListingReview.isPubliclyVisible(rec), false);
  assert.ok(w.notes.some((n) => /submitted/i.test(n.title)));
  await rejects(w.Accoom.ListingReview.submitForReview('L1', AGENT), 'already_submitted');
});

await test('sale listing: submit needs a title document + survey plan + seller proof', async () => {
  const w = boot({ listings: [listing({ id: 'S1', category: 'sale', listingType: 'sale', typeLabel: 'Detached Duplex', period: 'sale' })] });
  await addDocs(w, 'S1', ['survey_plan', 'seller_ownership_proof']);
  const e = await rejects(w.Accoom.ListingReview.submitForReview('S1', AGENT), 'documents_incomplete');
  assert.equal(e.report.groupIssues.length, 1);
  await addDocs(w, 'S1', ['certificate_of_occupancy']);
  const rec = await w.Accoom.ListingReview.submitForReview('S1', AGENT);
  assert.equal(rec.approval.state, 'pending_review');
});

await test('agents cannot approve; admin must route through review; nothing skips a step', async () => {
  const w = boot({ listings: [listing()] }); const RV = w.Accoom.ListingReview;
  await addDocs(w, 'L1', ['ownership_or_authorization']);
  await RV.submitForReview('L1', AGENT);
  await rejects(RV.approve('L1', AGENT), 'forbidden');
  await rejects(RV.approve('L1', ADMIN), 'not_allowed'); // pending_review cannot jump to approved
  await RV.transition('L1', 'manual_review', { role: 'system' });
  const rec = await RV.approve('L1', ADMIN);
  assert.equal(rec.status, 'available'); assert.equal(rec.approval.state, 'approved');
  assert.equal(RV.isPubliclyVisible(rec), true);
  assert.equal(RV.labelOf(rec), 'Available');
  assert.equal(RV.filterPublic([rec, listing({ id: 'X' })]).length, 1);
});

await test('request changes and reject both need a reason the agent can read', async () => {
  const w = boot({ listings: [listing()] }); const RV = w.Accoom.ListingReview;
  await addDocs(w, 'L1', ['ownership_or_authorization']);
  await RV.submitForReview('L1', AGENT);
  await RV.transition('L1', 'manual_review', { role: 'system' });
  await rejects(RV.requestChanges('L1', ADMIN, '  '), 'reason_required');
  const rec = await RV.requestChanges('L1', ADMIN, 'The ownership document is blurry.');
  assert.equal(rec.approval.state, 'changes_required');
  assert.equal(rec.approval.reason, 'The ownership document is blurry.');
  assert.equal(RV.isPubliclyVisible(rec), false);
  // agent resubmits after correcting
  const again = await RV.submitForReview('L1', AGENT);
  assert.equal(again.approval.state, 'pending_review');
  assert.equal(again.approval.reason, '');
});

await test('rejected is final for the agent; only an admin can reopen', async () => {
  const w = boot({ listings: [listing()] }); const RV = w.Accoom.ListingReview;
  await addDocs(w, 'L1', ['ownership_or_authorization']);
  await RV.submitForReview('L1', AGENT);
  await RV.transition('L1', 'manual_review', { role: 'system' });
  await rejects(RV.reject('L1', ADMIN, ''), 'reason_required');
  await RV.reject('L1', ADMIN, 'Documents could not be matched to the property.');
  await rejects(RV.submitForReview('L1', AGENT), 'not_allowed');
  const reopened = await RV.transition('L1', 'manual_review', ADMIN);
  assert.equal(reopened.approval.state, 'manual_review');
});

await test('replacing a critical document pulls an approved listing out of public view', async () => {
  const w = boot({ listings: [listing()] }); const RV = w.Accoom.ListingReview;
  await addDocs(w, 'L1', ['ownership_or_authorization']);
  await RV.submitForReview('L1', AGENT);
  await RV.transition('L1', 'manual_review', { role: 'system' });
  await RV.approve('L1', ADMIN);
  const out = await RV.documentReplaced('L1', 'ownership_or_authorization', AGENT);
  assert.equal(out.reviewRequired, true);
  const rec = RV.get('L1');
  assert.equal(rec.approval.state, 'pending_review'); assert.equal(rec.status, 'in_review');
  assert.equal(RV.isPubliclyVisible(rec), false);
  assert.ok(/replaced/i.test(rec.approval.reason));
});

await test('replacing a non-critical document keeps an approved listing live', async () => {
  const w = boot({ listings: [listing()] }); const RV = w.Accoom.ListingReview;
  await addDocs(w, 'L1', ['ownership_or_authorization']);
  await RV.submitForReview('L1', AGENT);
  await RV.transition('L1', 'manual_review', { role: 'system' });
  await RV.approve('L1', ADMIN);
  const out = await RV.documentReplaced('L1', 'rent_receipt', AGENT);
  assert.equal(out.reviewRequired, false);
  assert.equal(RV.isPubliclyVisible(RV.get('L1')), true);
});

await test('a listing put on hold is never public, even when approved', async () => {
  const w = boot({ listings: [listing({ status: 'hold', approval: { state: 'approved', published: true, history: [] } })] });
  assert.equal(w.Accoom.ListingReview.isPubliclyVisible(w.Accoom.ListingReview.get('L1')), false);
});

await test('legacy / unreviewed listings are never public', async () => {
  const w = boot({ listings: [{ id: 'OLD', name: 'Old', status: 'available' }, listing({ id: 'OLD2', status: 'available', approval: { state: 'legacy_unreviewed' } })] });
  const all = JSON.parse(w.localStorage.getItem('accoom-agent-listings'));
  assert.equal(w.Accoom.ListingReview.filterPublic(all).length, 0);
});

await test('approved but status changed to sold / delisted is not public', async () => {
  const w = boot();
  for (const status of ['sold', 'delisted', 'rented', 'in_dispute', 'reported', 'in_progress']) {
    assert.equal(w.Accoom.ListingReview.isPubliclyVisible({ status, approval: { state: 'approved', published: true } }), false, status);
  }
});

await test('syncDocumentation keeps the document count honest', async () => {
  const w = boot({ listings: [listing({ documents: 0 })] });
  await addDocs(w, 'L1', ['ownership_or_authorization', 'rent_receipt']);
  await w.Accoom.ListingReview.syncDocumentation('L1');
  const rec = JSON.parse(w.localStorage.getItem('accoom-agent-listings'))[0];
  assert.equal(rec.documents, 2); assert.equal(rec.documentation.submittedCount, 2);
});

await test('review steps are written to the audit trail', async () => {
  const w = boot({ listings: [listing()] });
  await addDocs(w, 'L1', ['ownership_or_authorization']);
  await w.Accoom.ListingReview.submitForReview('L1', AGENT);
  const events = await w.Accoom.Records.collection('auditEvents').all();
  assert.ok(events.some((e) => e.action === 'listing.pending_review' && e.entityId === 'L1'));
});

console.log('\nUpload interface');

function mountUI(w, state = { type: 'rent', label: 'Mini Flat' }, extra = {}) {
  const el = w.document.getElementById('m');
  const ctrl = w.Accoom.DocumentUpload.mount(el, Object.assign({ ownerId: 'a1', getType: () => state.type, getTypeLabel: () => state.label }, extra));
  return { el, ctrl, state };
}
function pick(w, el, type, file) {
  // a slot that already holds a saved file offers "Replace" instead of "Choose"
  const btn = el.querySelector('[data-du-action="choose"][data-type="' + type + '"]') || el.querySelector('[data-du-action="replace"][data-type="' + type + '"]');
  btn.click();
  const input = w.document.querySelector('input[type=file]');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new w.Event('change'));
}

await test('rent view shows labels, accepted types and max size', () => {
  const w = boot(); const { el } = mountUI(w);
  const t = el.textContent;
  assert.ok(/Required/.test(t) && /Optional/.test(t) && /Required where applicable/.test(t));
  assert.ok(/PDF, JPG, JPEG or PNG/.test(t) && /10\.0 MB/.test(t));
  assert.ok(/ownership or landlord authorization/i.test(t));
  assert.ok(!/Certificate of Occupancy/.test(t)); // sale-only
});

await test('switching to sale swaps the requirement set and shows the title group', () => {
  const w = boot(); const { el, ctrl, state } = mountUI(w);
  state.type = 'sale'; state.label = 'Detached Duplex'; ctrl.refresh();
  const t = el.textContent;
  assert.ok(/Certificate of Occupancy/.test(t) && /Survey Plan/.test(t) && /At least one title document/.test(t));
  assert.ok(!/inventory or condition report/i.test(t));
});

await test('choosing a file shows name, size, preview and remove; remove works', () => {
  const w = boot(); const { el, ctrl } = mountUI(w);
  pick(w, el, 'ownership_or_authorization', PDF('hello', 'landlord-letter.pdf'));
  assert.ok(el.textContent.includes('landlord-letter.pdf'));
  assert.ok(/\d+(\.\d)? (B|KB)/.test(el.textContent));
  assert.ok(el.querySelector('[data-du-action="preview-staged"]') && el.querySelector('[data-du-action="remove"]'));
  assert.equal(ctrl.readiness().complete, true);
  el.querySelector('[data-du-action="remove"]').click();
  assert.ok(!el.textContent.includes('landlord-letter.pdf'));
  assert.equal(ctrl.readiness().complete, false);
});

await test('wrong type, empty and oversized files are refused with a useful message', () => {
  const w = boot(); const { el } = mountUI(w);
  pick(w, el, 'ownership_or_authorization', new NodeFile([Buffer.from('MZ')], 'virus.exe', { type: 'application/x-msdownload' }));
  assert.ok(/Only PDF, JPG, JPEG and PNG/.test(el.textContent));
  pick(w, el, 'ownership_or_authorization', new NodeFile([], 'empty.pdf', { type: 'application/pdf' }));
  assert.ok(/empty/i.test(el.textContent));
  pick(w, el, 'ownership_or_authorization', new NodeFile([Buffer.alloc(11 * 1024 * 1024, 65)], 'huge.pdf', { type: 'application/pdf' }));
  assert.ok(/maximum is 10\.0 MB/.test(el.textContent));
});

await test('the same file cannot be chosen twice', () => {
  const w = boot(); const { el } = mountUI(w);
  const f = PDF('same', 'a.pdf');
  pick(w, el, 'additional_supporting', f);
  pick(w, el, 'additional_supporting', f);
  assert.ok(/already chosen/.test(el.textContent));
  assert.equal(el.querySelectorAll('.du-file--staged').length, 1);
});

await test('commit saves files to the document store and is protected against double clicks', async () => {
  const w = boot({ listings: [listing()] }); const { el, ctrl } = mountUI(w);
  pick(w, el, 'ownership_or_authorization', PDF('own', 'own.pdf'));
  pick(w, el, 'additional_supporting', PNG('x', 'extra.png'));
  const p1 = ctrl.commit('L1'); const p2 = ctrl.commit('L1');
  assert.equal(p1, p2, 'second click returns the same operation');
  const res = await p1;
  assert.equal(res.uploaded.length, 2); assert.equal(res.failed.length, 0);
  const docs = await w.Accoom.DocumentStore.listForListing('L1');
  assert.equal(docs.length, 2);
  assert.ok(/Version 1/.test(el.textContent) && /Uploaded \(not yet reviewed\)/.test(el.textContent));
  assert.ok(!/Verified/.test(el.textContent.replace(/Verified, Verification/g, '')), 'never shows verified for an upload');
  assert.equal(ctrl.hasPending(), false);
});

await test('a failed upload stays on screen with its reason and does not block the others', async () => {
  const w = boot({ listings: [listing()] }); const { el, ctrl } = mountUI(w);
  await w.Accoom.DocumentStore.add({ file: PDF('dup', 'first.pdf'), listingId: 'L1', ownerId: 'a1', docType: 'rent_receipt' });
  pick(w, el, 'ownership_or_authorization', PDF('fresh', 'fresh.pdf'));
  pick(w, el, 'additional_supporting', PDF('dup', 'copy-of-receipt.pdf')); // same bytes as an existing file
  const res = await ctrl.commit('L1');
  assert.equal(res.uploaded.length, 1); assert.equal(res.failed.length, 1);
  assert.equal(res.failed[0].code, 'duplicate');
  assert.ok(/already uploaded/.test(el.textContent));
  assert.equal(ctrl.hasPending(), true);
});

await test('edit mode: saved documents show with status and Replace; replacing keeps the old version', async () => {
  const w = boot({ listings: [listing({ approval: { state: 'changes_required', reason: 'Upload a clearer copy.', published: false, history: [] } })] });
  await addDocs(w, 'L1', ['ownership_or_authorization']);
  const { el, ctrl } = mountUI(w);
  await ctrl.loadExisting('L1', JSON.parse(w.localStorage.getItem('accoom-agent-listings'))[0].approval);
  assert.ok(/Changes required/.test(el.textContent) && /Upload a clearer copy/.test(el.textContent));
  assert.ok(el.querySelector('[data-du-action="replace"]'));
  pick(w, el, 'ownership_or_authorization', PDF('newer', 'clearer.pdf'));
  const res = await ctrl.commit('L1');
  assert.equal(JSON.stringify(res.replacedTypes), JSON.stringify(['ownership_or_authorization']));
  const all = await w.Accoom.DocumentStore.listForListing('L1', { includeHistory: true });
  assert.equal(all.length, 2);
  assert.equal(all.filter((d) => d.isCurrent).length, 1);
  assert.equal(all.find((d) => !d.isCurrent).reviewStatus, 'superseded');
});

await test('documents are locked while ACCOOM is reviewing, and after rejection', async () => {
  for (const state of ['pending_review', 'manual_review', 'rejected']) {
    const w = boot({ listings: [listing({ approval: { state, published: false, reason: 'r', history: [] } })] });
    await addDocs(w, 'L1', ['ownership_or_authorization']);
    const { el, ctrl } = mountUI(w);
    await ctrl.loadExisting('L1', { state, reason: 'r' });
    assert.ok(!el.querySelector('[data-du-action="replace"]'), state + ': no replace');
    assert.ok(!el.querySelector('[data-du-action="choose"]'), state + ': no choose');
  }
});

await test('approved listing warns that replacing a key document sends it back to review', async () => {
  const w = boot({ listings: [listing()] });
  const { el, ctrl } = mountUI(w);
  await ctrl.loadExisting('L1', { state: 'approved' });
  assert.ok(/sends it back for review/.test(el.textContent));
});

await test('missing stored file gives a clear message when previewing', async () => {
  const w = boot({ listings: [listing()] });
  const rec = await w.Accoom.DocumentStore.add({ file: PDF('gone', 'gone.pdf'), listingId: 'L1', ownerId: 'a1', docType: 'ownership_or_authorization' });
  await w.Accoom.DocumentStore._removeFileForTest(rec.id);
  await w.Accoom.DocumentPreview.open({ docId: rec.id, name: 'gone.pdf', mimeType: 'application/pdf' });
  assert.ok(/no longer stored in this browser/.test(w.document.querySelector('.dp-modal').textContent));
  w.Accoom.DocumentPreview.close();
});

await test('preview opens an image inline and closes cleanly', async () => {
  const w = boot();
  await w.Accoom.DocumentPreview.open({ file: PNG('p', 'p.png') });
  assert.ok(w.document.querySelector('.dp-img'));
  w.Accoom.DocumentPreview.close();
  assert.equal(w.document.querySelector('.dp-modal').hidden, true);
  assert.equal(w.document.querySelector('.dp-body').innerHTML, '');
});

console.log('\nWiring (source checks)');

await test('listing form offers Day, Week, Month and Year', () => {
  const s = read('assets/js/pages/my-listings.js');
  for (const v of ["'day'", "'week'", "'month'", "'year'"]) assert.ok(s.includes('value: ' + v), v);
});

await test('new listings are saved as in_review, never as available', () => {
  const s = read('assets/js/pages/my-listings.js');
  assert.ok(s.includes("status: existing ? existing.status : 'in_review'"));
  assert.ok(!s.includes("existing.status : 'available'"));
});

await test('addlistings.html loads every Stage 2 script, in dependency order', () => {
  const h = read('addlistings.html');
  const order = ['schemas.js', 'records.js', 'document-store.js', 'document-requirements.js', 'listing-review.js', 'document-preview.js', 'document-upload.js', 'my-listings.js'];
  let last = -1;
  for (const f of order) { const i = h.indexOf(f + '"'); assert.ok(i > last, f + ' missing or out of order'); last = i; }
  assert.ok(h.includes('data-ml-docs') && h.includes('property-documents.css') && h.includes('data-ml-save-draft'));
});

await test('dashboard has an In Review tab and make-available is blocked for unapproved listings', () => {
  assert.ok(read('my-listings.html').includes('data-ag-listing-tab="in_review"'));
  assert.ok(read('assets/js/pages/agent-dashboard.js').includes("in_review: 'In Review'"));
  const la = read('assets/js/modules/listing-actions.js');
  assert.ok(la.includes('reviewBlock(info.id)'));
  assert.ok(la.includes("'/ week'") && la.includes("'/ day'"));
});

await test('no public page reads agent listings without the review guard', () => {
  for (const f of ['home', 'filter-accommodation', 'property', 'saved-properties', 'messages', 'agent-profile', 'agent-details']) {
    const s = read('assets/js/pages/' + f + '.js');
    if (s.includes('accoom-agent-listings')) assert.ok(s.includes('ListingReview'), f + '.js reads listings without ListingReview');
  }
  assert.ok(!read('assets/js/data/properties.js').includes('accoom-agent-listings') || read('assets/js/data/properties.js').includes('ListingReview'));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
