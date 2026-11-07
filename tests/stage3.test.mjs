// Stage 3 tests: provider abstraction, demo analyzer honesty, cross-document checks, admin decisions.
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
  'assets/js/data/document-requirements.js', 'assets/js/data/listing-review.js', 'assets/js/data/document-verification.js'];

function boot(listings) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://accoom.test/', runScripts: 'outside-only' });
  const w = dom.window;
  w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
  Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
  w.Blob = NodeBlob; w.File = NodeFile;
  w.Accoom = {}; w.notes = [];
  w.Accoom.NotificationService = { add: (n) => w.notes.push(n) };
  if (listings) w.localStorage.setItem('accoom-agent-listings', JSON.stringify(listings));
  for (const s of SCRIPTS) w.eval(read(s));
  if (w.Accoom && w.Accoom.ListingReview) w.Accoom.ListingReview.AUTO_APPROVE.enabled = false; // these tests cover the real manual review workflow
  return w;
}
const PDF = (t = 'a', name = 'doc.pdf', pages = 1) => new NodeFile([Buffer.from('%PDF-1.4\n' + Array.from({ length: pages }, () => '<< /Type /Page >>\n').join('') + t)], name, { type: 'application/pdf' });
const ADMIN = { role: 'admin', id: 'demo-admin' }, AGENT = { role: 'agent', id: 'a1' };
const L = (id = 'L1', over = {}) => Object.assign({ id, name: 'Flat ' + id, category: 'sale', listingType: 'sale', typeLabel: 'Detached Duplex', address: '12 Test Street',
  status: 'in_review', schemaVersion: 2, approval: { state: 'pending_review', published: false, history: [] }, documentation: { answers: {} } }, over);
const add = (w, id, type, file) => w.Accoom.DocumentStore.add({ file, listingId: id, ownerId: 'a1', docType: type });
const check = (rep, id) => rep.checks.find((c) => c.id === id);

console.log('\nDemo analyzer honesty');

await test('demo report is labelled demo, extracted values are marked simulated, nothing is claimed as read', async () => {
  const w = boot([L()]); const d = await add(w, 'L1', 'survey_plan', PDF('s', 'survey.pdf'));
  const rep = await w.Accoom.DocVerification.analyzeDocument(d.id);
  assert.equal(rep.mode, 'demo'); assert.equal(rep.verificationSource, 'demo_analysis');
  assert.equal(rep.extracted.simulated, true);
  assert.ok(/NOT read/.test(rep.text));
  assert.ok(/DEMO/.test(w.Accoom.DocVerification.MODE_LABEL[rep.mode]));
  assert.ok(/Demo recommendation/.test(rep.aiRecommendation));
  assert.ok(rep.providers.every((p) => p.kind === 'demo'));
});

await test('checks are tagged local / simulated / not_performed, and issuer confirmation is never claimed', async () => {
  const w = boot([L()]); const d = await add(w, 'L1', 'survey_plan', PDF('s', 'survey.pdf'));
  const rep = await w.Accoom.DocVerification.analyzeDocument(d.id);
  assert.equal(check(rep, 'file_readable').source, 'local');
  assert.equal(check(rep, 'text_readable').source, 'simulated');
  assert.equal(check(rep, 'issuer_confirmation').result, 'not_performed');
  assert.equal(check(rep, 'issuer_confirmation').source, 'not_performed');
  assert.ok(rep.checks.every((c) => ['local', 'simulated', 'not_performed', 'provider'].includes(c.source)));
});

await test('analysis never marks a document VERIFIED, and there is no authenticity percentage', async () => {
  const w = boot([L()]); await add(w, 'L1', 'survey_plan', PDF('s', 'survey.pdf')); await add(w, 'L1', 'seller_ownership_proof', PDF('o', 'owner.pdf'));
  await w.Accoom.DocVerification.analyzeListing('L1');
  const docs = await w.Accoom.DocumentStore.listForListing('L1');
  assert.ok(docs.every((d) => d.reviewStatus === 'analysis_complete'), docs.map((d) => d.reviewStatus).join());
  assert.ok(docs.every((d) => w.Accoom.DocVerification.displayStatus(d).headline === 'NEEDS REVIEW'));
  const reps = await w.Accoom.Records.collection('analysisReports').all();
  const json = JSON.stringify(reps);
  assert.ok(!/authenticity score\W*\d|\d+\s?%|percent/i.test(json.replace(/NOT an authenticity score/g, '')), 'no percentage or score');
  assert.ok(reps.every((r) => /NOT an authenticity score/.test(r.risk.explanation)));
});

await test('real local checks: PDF page count, file-name hint, duplicate file on another listing', async () => {
  const w = boot([L('L1'), L('L2')]);
  const a = await add(w, 'L1', 'survey_plan', PDF('same', 'survey.pdf', 3));
  const b = await add(w, 'L2', 'survey_plan', PDF('same', 'survey.pdf', 3));
  const r1 = await w.Accoom.DocVerification.analyzeDocument(a.id), r2 = await w.Accoom.DocVerification.analyzeDocument(b.id);
  assert.ok(/3 pages/.test(check(r1, 'page_count').detail));
  assert.equal(check(r1, 'duplicate_file').result, 'warn'); assert.equal(check(r2, 'duplicate_file').result, 'warn');
  const c = await add(w, 'L1', 'survey_plan', PDF('r', 'receipt-2020.pdf'));
  const r3 = await w.Accoom.DocVerification.analyzeDocument(c.id);
  assert.equal(check(r3, 'filename_hint').result, 'warn');
  assert.ok(/Receipt/i.test(check(r3, 'filename_hint').detail));
});

await test('demo trigger words produce the matching flags and raise the risk level', async () => {
  const w = boot([L()]);
  const d = await add(w, 'L1', 'survey_plan', PDF('x', 'survey-blurry-altered-nosig.pdf'));
  const rep = await w.Accoom.DocVerification.analyzeDocument(d.id);
  assert.equal(check(rep, 'text_readable').result, 'warn');
  assert.equal(check(rep, 'text_alterations').result, 'warn');
  assert.equal(check(rep, 'signature').result, 'warn');
  assert.equal(check(rep, 'field_ownerName').result, 'warn');
  assert.equal(rep.risk.level, 'high'); assert.ok(rep.warnings.length >= 4);
  assert.ok(/demo analysis/i.test(rep.risk.explanation));
});

await test('a missing stored file fails the readable check, raises risk, and nothing stays stuck in processing', async () => {
  const w = boot([L()]); const d = await add(w, 'L1', 'survey_plan', PDF('m', 'gone.pdf'));
  await w.Accoom.DocumentStore._removeFileForTest(d.id);
  const rep = await w.Accoom.DocVerification.analyzeDocument(d.id);
  assert.equal(check(rep, 'file_readable').result, 'fail'); assert.equal(rep.risk.level, 'high');
  const now = await w.Accoom.Records.collection('documents').get(d.id);
  assert.notEqual(now.reviewStatus, 'processing');
});

await test('a crashing provider leaves the document in its previous status', async () => {
  const w = boot([L()]); const d = await add(w, 'L1', 'survey_plan', PDF('c', 'c.pdf'));
  w.Accoom.DocVerification.registerProvider('ocr', { id: 'boom', label: 'boom', kind: 'remote', extract: () => Promise.reject(new Error('service down')) });
  await assert.rejects(w.Accoom.DocVerification.analyzeDocument(d.id), /service down/);
  assert.equal((await w.Accoom.Records.collection('documents').get(d.id)).reviewStatus, 'uploaded');
});

console.log('\nCross-document comparison and listing flow');

await test('inconsistent names across documents are flagged with an explanation', async () => {
  const w = boot([L()]);
  await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  await add(w, 'L1', 'deed_of_assignment', PDF('2', 'deed-mismatch-name.pdf'));
  await add(w, 'L1', 'seller_ownership_proof', PDF('3', 'owner.pdf'));
  const res = await w.Accoom.DocVerification.analyzeListing('L1');
  const name = res.crossDocument.find((c) => c.field === 'ownerName');
  assert.equal(name.status, 'inconsistent'); assert.equal(name.values.length, 3);
  assert.ok(/different values/.test(name.explanation));
  assert.equal(res.crossDocument.find((c) => c.field === 'address').status, 'consistent');
  const reps = (await w.Accoom.DocVerification.latestReports('L1')).reports;
  assert.ok(reps.every((r) => r.crossDocument.some((c) => c.field === 'ownerName' && c.status === 'inconsistent')));
  const ver = await w.Accoom.Records.collection('verifications').all();
  assert.equal(ver.length, 1); assert.equal(ver[0].inconsistencies >= 1, true);
});

await test('documents that disagree with the listing address are flagged', async () => {
  const w = boot([L()]);
  await add(w, 'L1', 'survey_plan', PDF('1', 'survey-mismatch-address.pdf'));
  await add(w, 'L1', 'seller_ownership_proof', PDF('2', 'owner.pdf'));
  const res = await w.Accoom.DocVerification.analyzeListing('L1');
  assert.equal(res.crossDocument.find((c) => c.field === 'listing_address').status, 'inconsistent');
});

await test('a single document cannot be compared; the report says so', async () => {
  const w = boot([L()]); await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  const res = await w.Accoom.DocVerification.analyzeListing('L1');
  assert.ok(res.crossDocument.filter((c) => c.field !== 'listing_address').every((c) => c.status === 'insufficient'));
});

await test('listing moves Pending Review -> AI Review -> Manual Review and agent is told', async () => {
  const w = boot([L()]); await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  await w.Accoom.DocVerification.analyzeListing('L1');
  const rec = w.Accoom.ListingReview.get('L1');
  assert.equal(rec.approval.state, 'manual_review');
  assert.equal(rec.approval.history.map((h) => h.to).slice(-2).join('>'), 'ai_review>manual_review');
  assert.ok(w.notes.some((n) => /review started/i.test(n.title)) && w.notes.some((n) => /review completed/i.test(n.title)));
  assert.equal(w.Accoom.ListingReview.isPubliclyVisible(rec), false);
});

await test('re-running analysis keeps old reports and does not change an approved listing\'s state', async () => {
  const w = boot([L('L1', { approval: { state: 'approved', published: true, history: [] }, status: 'available' })]);
  await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  await w.Accoom.DocVerification.analyzeListing('L1'); await w.Accoom.DocVerification.analyzeListing('L1');
  assert.equal((await w.Accoom.Records.collection('analysisReports').all()).length, 2);
  assert.equal(w.Accoom.ListingReview.get('L1').approval.state, 'approved');
});

console.log('\nAdministrator decisions');

await test('only an administrator can decide on a document', async () => {
  const w = boot([L()]); const d = await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  await rejects(w.Accoom.DocVerification.decideDocument(AGENT, d.id, 'verify'), 'forbidden');
  await rejects(w.Accoom.DocVerification.decideDocument(null, d.id, 'verify'), 'forbidden');
});

await test('admin verify records source "admin_manual" and says it was not confirmed with the issuer', async () => {
  const w = boot([L()]); const d = await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  await w.Accoom.DocVerification.analyzeDocument(d.id);
  const saved = await w.Accoom.DocVerification.decideDocument(ADMIN, d.id, 'verify', { notes: 'Checked against the original.' });
  assert.equal(saved.reviewStatus, 'verified'); assert.equal(saved.verification.source, 'admin_manual');
  const st = w.Accoom.DocVerification.displayStatus(saved);
  assert.equal(st.headline, 'VERIFIED'); assert.ok(/not confirmed with the issuer/.test(st.stage));
  const rep = await w.Accoom.DocVerification.latestReportFor(d.id);
  assert.equal(rep.adminDecision.decision, 'verify'); assert.equal(rep.verificationSource, 'admin_manual');
  // analysing again must not undo the human decision
  await w.Accoom.DocVerification.analyzeDocument(d.id);
  assert.equal((await w.Accoom.Records.collection('documents').get(d.id)).reviewStatus, 'verified');
});

await test('reject and needs-review need a reason; pending stages are available', async () => {
  const w = boot([L()]); const d = await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  await rejects(w.Accoom.DocVerification.decideDocument(ADMIN, d.id, 'reject', { notes: ' ' }), 'reason_required');
  await rejects(w.Accoom.DocVerification.decideDocument(ADMIN, d.id, 'needs_review', {}), 'reason_required');
  for (const [dec, st] of [['issuer_pending', 'issuer_confirmation_pending'], ['ownership_pending', 'ownership_verification_pending'], ['human_review', 'human_review_required']]) {
    assert.equal((await w.Accoom.DocVerification.decideDocument(ADMIN, d.id, dec)).reviewStatus, st);
  }
  const r = await w.Accoom.DocVerification.decideDocument(ADMIN, d.id, 'reject', { notes: 'Stamp is missing.' });
  assert.equal(r.reviewStatus, 'rejected'); assert.equal(r.rejectionReason, 'Stamp is missing.');
  assert.equal(w.Accoom.DocVerification.displayStatus(r).headline, 'REJECTED');
});

await test('a replaced (superseded) version cannot be decided on; history is preserved', async () => {
  const w = boot([L()]); const d = await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  const v2 = await w.Accoom.DocumentStore.replace(d.id, PDF('2', 'survey-v2.pdf'), { reason: 'clearer' });
  await rejects(w.Accoom.DocVerification.decideDocument(ADMIN, d.id, 'verify'), 'superseded');
  await rejects(w.Accoom.DocVerification.analyzeDocument(d.id), 'superseded');
  assert.equal((await w.Accoom.DocumentStore.history(v2.groupId)).length, 2);
});

await test('reviewer notes are admin-only and stay off the agent-facing fields', async () => {
  const w = boot([L()]);
  await rejects(w.Accoom.ListingReview.addNote('L1', AGENT, 'hi'), 'forbidden');
  await rejects(w.Accoom.ListingReview.addNote('L1', ADMIN, ' '), 'empty');
  const rec = await w.Accoom.ListingReview.addNote('L1', ADMIN, 'Call the landlord about the survey.');
  assert.equal(rec.reviewNotes.length, 1);
  assert.ok(!JSON.stringify(rec.approval).includes('Call the landlord'));
});

await test('full flow: analyse -> admin verifies docs -> approve -> listing becomes public', async () => {
  const w = boot([L()]); const RV = w.Accoom.ListingReview;
  const d1 = await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  await w.Accoom.DocVerification.analyzeListing('L1');
  await w.Accoom.DocVerification.decideDocument(ADMIN, d1.id, 'verify', { notes: 'ok' });
  assert.equal(RV.isPubliclyVisible(RV.get('L1')), false);
  const rec = await RV.approve('L1', ADMIN);
  assert.equal(RV.isPubliclyVisible(rec), true);
});

console.log('\nProvider abstraction');

await test('providers can be swapped; bad registrations are refused', () => {
  const w = boot(); const V = w.Accoom.DocVerification;
  assert.throws(() => V.registerProvider('nope', {}), (e) => e.code === 'bad_kind');
  assert.throws(() => V.registerProvider('ocr', { id: 'x', kind: 'remote' }), (e) => e.code === 'bad_provider');
  assert.throws(() => V.registerProvider('ocr', { id: 'x', kind: 'weird', extract() {} }), (e) => e.code === 'bad_provider');
});

await test('with remote providers the report is "ai" mode, not demo, and still never verified', async () => {
  const w = boot([L()]); const V = w.Accoom.DocVerification;
  V.registerProvider('ocr', { id: 'r-ocr', label: 'Remote OCR', kind: 'remote', extract: async () => ({ simulated: false, text: 'real text', fields: { ownerName: 'Ada Obi', address: '12 Test Street', certificateNumber: 'C123', issueDate: '2020-01-01' }, hasSignature: true, hasStamp: true }) });
  V.registerProvider('documentAI', { id: 'r-ai', label: 'Remote AI', kind: 'remote', identify: async (i) => ({ simulated: false, identifiedType: i.doc.docType }) });
  V.registerProvider('authenticity', { id: 'r-auth', label: 'Remote auth', kind: 'remote', assess: async () => ({ simulated: false, findings: [] }) });
  V.registerProvider('external', { id: 'r-ext', label: 'No issuer', kind: 'remote', verify: async () => ({ performed: false, outcome: 'unavailable', detail: 'n/a' }) });
  const d = await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  const rep = await V.analyzeDocument(d.id);
  assert.equal(rep.mode, 'ai'); assert.equal(rep.extracted.simulated, false); assert.equal(rep.extracted.ownerName, 'Ada Obi');
  assert.equal((await w.Accoom.Records.collection('documents').get(d.id)).reviewStatus, 'analysis_complete');
});

await test('only a remote provider that actually confirmed with the issuer can verify automatically', async () => {
  const w = boot([L()]); const V = w.Accoom.DocVerification;
  const d = await add(w, 'L1', 'survey_plan', PDF('1', 'survey.pdf'));
  // a DEMO external provider claiming success is ignored
  V.registerProvider('external', { id: 'liar', label: 'liar', kind: 'demo', verify: async () => ({ performed: true, outcome: 'confirmed', source: 'Registry' }) });
  const r1 = await V.analyzeDocument(d.id);
  assert.notEqual(r1.mode, 'issuer');
  assert.notEqual((await w.Accoom.Records.collection('documents').get(d.id)).reviewStatus, 'verified');
  V.registerProvider('external', { id: 'lagos-registry', label: 'Registry', kind: 'remote', verify: async () => ({ performed: true, outcome: 'confirmed', source: 'Land Registry', detail: 'Matched record 123' }) });
  const r2 = await V.analyzeDocument(d.id);
  assert.equal(r2.mode, 'issuer');
  const doc = await w.Accoom.Records.collection('documents').get(d.id);
  assert.equal(doc.reviewStatus, 'verified'); assert.equal(doc.verification.source, 'independent_issuer');
  assert.ok(/Confirmed by the issuing authority/.test(V.displayStatus(doc).stage));
});

console.log('\nWiring (source checks)');

await test('no API keys or external AI endpoints appear in browser code', () => {
  const s = read('assets/js/data/document-verification.js');
  assert.ok(!/api[_-]?key|sk-[a-z0-9]{10}|bearer |fetch\(|XMLHttpRequest|openai\.com|googleapis|azure/i.test(s));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
