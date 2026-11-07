// Stage 4 tests: tenancy dates, transactions, ACTD issue/versioning/access, PDF output.
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import assert from 'node:assert/strict';

let passed = 0, failed = 0, skipped = 0;
async function test(name, fn) {
  try { await fn(); passed++; console.log('  PASS ' + name); }
  catch (e) { if (e && e.skip) { skipped++; console.log('  SKIP ' + name + ' (' + e.message + ')'); } else { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
}
async function rejects(promise, code) {
  try { await promise; } catch (e) { assert.equal(e.code, code, 'expected ' + code + ' got ' + e.code + ' (' + e.message + ')'); return e; }
  assert.fail('expected rejection ' + code);
}
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SCRIPTS = ['assets/js/vendor/qrcode-generator.js', 'assets/js/data/schemas.js', 'assets/js/core/records.js', 'assets/js/core/identity.js', 'assets/js/core/document-store.js',
  'assets/js/data/document-requirements.js', 'assets/js/data/listing-review.js', 'assets/js/data/document-verification.js', 'assets/js/data/tenancy-dates.js',
  'assets/js/data/actd.js', 'assets/js/data/transactions.js', 'assets/js/modules/pdf-writer.js', 'assets/js/modules/actd-generator.js', 'assets/js/modules/admin-demo.js'];

const RENT = { id: 'R1', name: 'Lekki Mini Flat', category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', price: 150000, agencyFee: 15000, legalFee: 10000,
  address: '12 Admiralty Way', area: 'Lekki Phase 1', state: 'Lagos', description: 'A clean flat.', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } };
const SALE = { id: 'S1', name: 'Duplex', category: 'sale', listingType: 'sale', typeLabel: 'Detached Duplex', price: 185000000, agencyFee: 9250000, legalFee: 0,
  address: '4 Oba Akinjobi Way', area: 'Ikeja GRA', state: 'Lagos', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } };

function boot(listings) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://accoom.test/document-centre.html', runScripts: 'outside-only' });
  const w = dom.window;
  w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
  w.Blob = NodeBlob; w.File = NodeFile; w.Accoom = {}; w.notes = [];
  w.Accoom.NotificationService = { add: (n) => w.notes.push(n) };
  w.localStorage.setItem('accoom-agent-listings', JSON.stringify(listings || [RENT, SALE]));
  for (const s of SCRIPTS) w.eval(read(s));
  if (w.Accoom && w.Accoom.ListingReview) w.Accoom.ListingReview.AUTO_APPROVE.enabled = false; // these tests cover the real manual review workflow
  return w;
}
const pay = (w, id, over = {}) => w.Accoom.Transactions.recordDemoPayment(Object.assign({ eventId: 'e-' + Math.random(), listingId: id, customerId: 'cust-1', customerName: 'Chinedu Eze' }, over));
const AGENT = { role: 'agent', id: 'agent-77' };

console.log('\nTenancy date maths');
await test('month-end and leap-year handling', () => {
  const w = boot(); const T = w.Accoom.TenancyDates;
  assert.equal(T.expiryDate('2026-01-31', 'month', 1), '2026-02-28');
  assert.equal(T.expiryDate('2024-01-31', 'month', 1), '2024-02-29');
  assert.equal(T.expiryDate('2024-02-29', 'year', 1), '2025-02-28');
  assert.equal(T.expiryDate('2024-02-29', 'year', 4), '2028-02-29');
  assert.equal(T.expiryDate('2026-01-31', 'month', 12), '2027-01-31');
  assert.equal(T.expiryDate('2026-03-31', 'month', 1), '2026-04-30');
  assert.equal(T.expiryDate('2026-03-10', 'month', 1), '2026-04-10');
  assert.equal(T.expiryDate('2026-12-31', 'month', 2), '2027-02-28');
  assert.equal(T.expiryDate('2026-11-30', 'month', 3), '2027-02-28');
  assert.equal(T.expiryDate('2026-01-01', 'year', 1), '2027-01-01');
});
await test('day and week periods, year boundaries, counts', () => {
  const T = boot().Accoom.TenancyDates;
  assert.equal(T.expiryDate('2026-12-31', 'day', 1), '2027-01-01');
  assert.equal(T.expiryDate('2026-02-27', 'day', 3), '2026-03-02');
  assert.equal(T.expiryDate('2026-12-30', 'week', 1), '2027-01-06');
  assert.equal(T.expiryDate('2026-01-01', 'week', 4), '2026-01-29');
  assert.equal(T.expiryDate('2024-02-28', 'day', 2), '2024-03-01');
  assert.equal(T.daysBetween('2026-01-01', '2027-01-01'), 365); assert.equal(T.daysBetween('2024-01-01', '2025-01-01'), 366);
  assert.equal(T.addDays('2026-02-28', 1), '2026-03-01');
});
await test('invalid dates, periods and counts are refused', () => {
  const T = boot().Accoom.TenancyDates;
  for (const bad of ['2026-02-30', '2026-13-01', 'nope', '', '2026-1-1']) assert.throws(() => T.expiryDate(bad, 'month', 1), /valid date/);
  assert.throws(() => T.expiryDate('2026-01-01', 'decade', 1), /billing period/);
  for (const c of [0, -1, 1.5, NaN]) assert.throws(() => T.expiryDate('2026-01-01', 'month', c), /whole number/);
});

console.log('\nSeal / hashing');
await test('JS SHA-256 matches the known vector and Web Crypto', async () => {
  const w = boot(); const A = w.Accoom.ACTD;
  assert.equal(A._sha256Js('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(A._sha256Js(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  const long = 'x'.repeat(1000) + '\u20A6 caf\u00E9';
  assert.equal(A._sha256Js(long), await A.sha256Hex(long));
});
await test('canonical form ignores key order', () => {
  const A = boot().Accoom.ACTD;
  assert.equal(A.canonical({ b: 1, a: { d: [2, { z: 1, y: 2 }], c: null } }), A.canonical({ a: { c: null, d: [2, { y: 2, z: 1 }] }, b: 1 }));
});

console.log('\nTransactions and ACTD issue');
await test('rental demo payment: totals, dates, ACTD v1 linked, marked as demo', async () => {
  const w = boot(); const r = await pay(w, 'R1', { periodCount: 12, startDate: '2026-01-31' });
  const t = r.transaction;
  assert.equal(t.status, 'succeeded'); assert.equal(t.paymentSource, 'demo'); assert.equal(t.type, 'rent_payment');
  assert.equal(t.amounts.price, 2100000); assert.equal(t.amounts.total, 2100000);
  assert.equal(t.expiryDate, '2027-01-31'); assert.equal(t.billingPeriod, 'month');
  assert.match(r.actd.actdNumber, /^ACTD-\d{4}-[A-Z2-9]{10}$/);
  assert.equal(r.actd.version, 1); assert.equal(t.actdId, r.actd.id); assert.equal(r.actd.content.demo, true);
  assert.ok(/No real money was moved/.test(r.actd.content.s2.status));
  assert.match(t.receiptRef, /^ACR-\d{4}-/); assert.equal(r.actd.content.s2.receiptRef, t.receiptRef);
});
await test('sale demo payment: inclusive price, no rental fields, no separate fee lines', async () => {
  const w = boot(); const r = await pay(w, 'S1'); const c = r.actd.content;
  assert.equal(r.transaction.type, 'sale_payment'); assert.equal(r.transaction.amounts.total, 194250000);
  assert.equal(c.s4.startDate, ''); assert.equal(c.s4.expiryDate, ''); assert.equal(c.s4.rentalDuration, ''); assert.equal(c.s4.renewalConditions, '');
  assert.equal(JSON.stringify(c.s2.lines.map((l) => l.label)), JSON.stringify(['Property price']));
});
await test('daily, weekly and yearly rentals use their own period maths', async () => {
  const mk = (id, period, price) => Object.assign({}, RENT, { id, period, price });
  const w = boot([mk('D', 'day', 5000), mk('W', 'week', 25000), mk('Y', 'year', 1200000)]);
  assert.equal((await pay(w, 'D', { periodCount: 3, startDate: '2026-02-27' })).transaction.expiryDate, '2026-03-02');
  assert.equal((await pay(w, 'W', { periodCount: 2, startDate: '2026-12-25' })).transaction.expiryDate, '2027-01-08');
  const y = await pay(w, 'Y', { periodCount: 1, startDate: '2024-02-29' });
  assert.equal(y.transaction.expiryDate, '2025-02-28'); assert.equal(y.transaction.amounts.price, 1225000);
});
await test('a repeated event id returns the same transaction and ACTD', async () => {
  const w = boot(); const a = await pay(w, 'R1', { eventId: 'same' }), b = await pay(w, 'R1', { eventId: 'same' });
  assert.equal(a.created, true); assert.equal(b.created, false);
  assert.equal(a.transaction.id, b.transaction.id); assert.equal(a.actd.id, b.actd.id);
  assert.equal((await w.Accoom.Records.collection('transactions').all()).length, 1);
  assert.equal((await w.Accoom.Records.collection('actds').all()).length, 1);
});
await test('simultaneous duplicate events (double click) still make exactly one ACTD', async () => {
  const w = boot();
  const rs = await Promise.all([1, 2, 3, 4, 5].map(() => pay(w, 'R1', { eventId: 'dbl' })));
  assert.equal(rs.filter((x) => x.created).length, 1);
  assert.equal(new Set(rs.map((x) => x.actd.id)).size, 1);
  assert.equal((await w.Accoom.Records.collection('actds').all()).length, 1);
  assert.equal(w.notes.filter((n) => n.title === 'ACTD generated').length, 1, 'announced once');
});
await test('a different event is a different transaction with its own ACTD number', async () => {
  const w = boot(); const a = await pay(w, 'R1'), b = await pay(w, 'R1');
  assert.notEqual(a.actd.actdNumber, b.actd.actdNumber); assert.notEqual(a.transaction.paymentReference, b.transaction.paymentReference);
});
await test('every amount gets an ACTD, even a very small one', async () => {
  const w = boot([Object.assign({}, RENT, { id: 'T', period: 'day', price: 500, agencyFee: 0, legalFee: 0 })]);
  const r = await pay(w, 'T'); assert.equal(r.transaction.amounts.total, 500); assert.ok(r.actd.actdNumber);
  assert.equal(JSON.stringify(r.actd.content.s2.lines.map((l) => l.label.slice(0, 4))), JSON.stringify(['Rent']));
});
await test('listings that cannot be paid for are refused', async () => {
  const w = boot([Object.assign({}, RENT, { id: 'A', status: 'sold' }), Object.assign({}, RENT, { id: 'B', status: 'in_review', approval: { state: 'pending_review' } }),
    Object.assign({}, RENT, { id: 'C', price: 0 }), Object.assign({}, RENT, { id: 'D', approval: { state: 'approved', published: true } }),
    Object.assign({}, RENT, { id: 'E', approval: { state: 'approved', published: false } }), Object.assign({}, RENT, { id: 'F', period: '' })]);
  for (const id of ['A', 'B', 'C', 'E']) await rejects(pay(w, id), 'not_payable');
  await rejects(pay(w, 'F'), 'bad_period');
  await rejects(pay(w, 'NOPE'), 'not_payable');
  assert.equal((await pay(w, 'D')).transaction.status, 'succeeded'); // approved + published is fine
  assert.equal((await w.Accoom.Records.collection('transactions').all()).length, 1);
});
await test('bad input: missing event id, missing customer, bad start date', async () => {
  const w = boot();
  await rejects(w.Accoom.Transactions.recordDemoPayment({ listingId: 'R1', customerId: 'c' }), 'event_id_required');
  await rejects(w.Accoom.Transactions.recordDemoPayment({ eventId: 'x', listingId: 'R1' }), 'customer_required');
  await rejects(pay(w, 'R1', { startDate: '2026-02-30' }), 'bad_date');
});
await test('the real-payment entry point is closed in the frontend', async () => {
  await rejects(boot().Accoom.Transactions.handleGatewayWebhook({ verified: true }), 'backend_required');
});
await test('an ACTD is only issued for a SUCCEEDED transaction', async () => {
  const w = boot(); const T = w.Accoom.Records.collection('transactions');
  const pending = await T.create(w.Accoom.Schemas.make.transaction({ idempotencyKey: 'p1', type: 'rent_payment', status: 'pending', listingId: 'R1', customerId: 'c' }));
  await rejects(w.Accoom.ACTD.generateForTransaction(pending.id), 'not_paid');
  await rejects(w.Accoom.ACTD.generateForTransaction('missing'), 'not_found');
  assert.equal((await w.Accoom.Records.collection('actds').all()).length, 0);
});

console.log('\nACTD content');
await test('all six sections carry the required details (rental)', async () => {
  const w = boot(); const c = (await pay(w, 'R1', { periodCount: 6, startDate: '2026-03-10' })).actd.content;
  for (const k of ['actdNumber', 'transactionId', 'propertyId', 'propertyName', 'propertyLocation', 'transactionType', 'dateTime', 'status', 'client', 'agent', 'landlord']) assert.ok(k in c.s1, 's1.' + k);
  for (const k of ['amountPaid', 'price', 'agencyFee', 'legalFee', 'total', 'method', 'provider', 'reference', 'confirmedAt', 'status', 'receiptRef']) assert.ok(k in c.s2, 's2.' + k);
  for (const k of ['propertyType', 'address', 'state', 'area', 'description', 'listingRef', 'agent', 'landlord', 'documents', 'verification']) assert.ok(k in c.s3, 's3.' + k);
  for (const k of ['terms', 'rentalDuration', 'startDate', 'expiryDate', 'renewalConditions', 'occupancyExtension', 'confirmations', 'signingRecords', 'agreementRefs']) assert.ok(k in c.s4, 's4.' + k);
  for (const k of ['receiptDelivery', 'documentsIssued', 'deliveryDates', 'agentConfirmation', 'clientAcknowledgement', 'outstanding', 'reportedProblems']) assert.ok(k in c.s5, 's5.' + k);
  for (const k of ['verifyUrl', 'history', 'statement']) assert.ok(k in c.s6, 's6.' + k);
  assert.equal(c.s4.expiryDate, '2026-09-10'); assert.equal(c.s4.rentalDuration, '6 months');
  assert.ok(/No Occupancy Extension/.test(c.s4.occupancyExtension));
  assert.ok(/never automatic/.test(c.s4.renewalConditions));
});
await test('the required statement is word-for-word', async () => {
  const w = boot(); const c = (await pay(w, 'R1')).actd.content;
  assert.equal(c.s6.statement, 'This document is an ACCOOM-generated transaction record. It records information and confirmations available to ACCOOM at the time of issue. It does not replace original property title documents, government-issued certificates or legally required agreements.');
});
await test('property documents and their (honest) verification outcomes are listed', async () => {
  const w = boot();
  await w.Accoom.DocumentStore.add({ file: new NodeFile([Buffer.from('%PDF-1.4\nx')], 'deed.pdf', { type: 'application/pdf' }), listingId: 'S1', ownerId: 'agent-77', docType: 'deed_of_assignment' });
  const d = (await pay(w, 'S1')).actd.content.s3.documents;
  assert.equal(d.length, 1); assert.equal(d[0].label, 'Deed of Assignment'); assert.match(d[0].outcome, /^NEEDS REVIEW/);
  assert.ok(!/VERIFIED/.test(d[0].outcome.replace('NEEDS REVIEW', '')));
});
await test('no phone numbers or email addresses are ever stored in an ACTD', async () => {
  const w = boot(); const r = await pay(w, 'R1', { customerName: 'Chinedu Eze' });
  const json = JSON.stringify(r.actd);
  assert.ok(!/@/.test(json) && !/\+?234\d{8,}|\b0[789]\d{9}\b/.test(json));
  assert.ok(!/phone|email/i.test(Object.keys(r.actd.content.s1.client).join()));
});

console.log('\nSeal, immutability, versions');
await test('verify(): matches for an untouched record and reveals no personal data', async () => {
  const w = boot(); const r = await pay(w, 'R1');
  const v = await w.Accoom.ACTD.verify(r.actd.actdNumber, 1);
  assert.equal(v.found, true); assert.equal(v.sealMatches, true); assert.equal(v.isLatest, true); assert.equal(v.demo, true);
  const json = JSON.stringify(v);
  assert.ok(!/Chinedu|Lekki|Admiralty|150000|2100000|cust-1|agent-77|Ada/.test(json));
  assert.equal((await w.Accoom.ACTD.verify('ACTD-2026-NOPENOPENO')).found, false);
  assert.equal((await w.Accoom.ACTD.verify(r.actd.actdNumber, 9)).found, false);
});
await test('any change to an issued record breaks its seal', async () => {
  const w = boot(); const r = await pay(w, 'R1'); const A = w.Accoom.ACTD;
  assert.equal(await A.sealOf(r.actd), r.actd.seal);
  const t1 = JSON.parse(JSON.stringify(r.actd)); t1.content.s2.total = 1; assert.notEqual(await A.sealOf(t1), r.actd.seal);
  const t2 = JSON.parse(JSON.stringify(r.actd)); t2.content.s1.client.name = 'Someone Else'; assert.notEqual(await A.sealOf(t2), r.actd.seal);
  const t3 = JSON.parse(JSON.stringify(r.actd)); t3.version = 2; assert.notEqual(await A.sealOf(t3), r.actd.seal);
});
await test('issued ACTDs cannot be edited in storage', async () => {
  const w = boot(); const r = await pay(w, 'R1');
  await rejects(w.Accoom.Records.collection('actds').put(Object.assign({}, r.actd, { seal: 'x' })), 'immutable');
});
await test('addendum: new version, old one untouched, history and reason kept', async () => {
  const w = boot(); const r = await pay(w, 'R1'); const A = w.Accoom.ACTD;
  const before = JSON.stringify(r.actd);
  const v2 = await A.addendum(AGENT, r.transaction.id, { reason: 'Agreement signed by both parties.', changes: { s4: { agreementRefs: ['AGR-1'], signingRecords: [{ party: 'Tenant', level: 'electronic signing record', at: new Date().toISOString() }] } } });
  assert.equal(v2.version, 2); assert.equal(v2.actdNumber, r.actd.actdNumber); assert.equal(v2.supersedes, r.actd.id); assert.equal(v2.updateReason, 'Agreement signed by both parties.');
  assert.equal(JSON.stringify(v2.content.s4.agreementRefs), JSON.stringify(['AGR-1']));
  assert.equal(v2.content.s6.history.length, 2); assert.equal(v2.content.s6.history[1].reason, 'Agreement signed by both parties.');
  assert.ok(v2.content.s6.verifyUrl.endsWith('&v=2'));
  const vs = await A.versionsOf(r.transaction.id);
  assert.equal(vs.length, 2); assert.equal(JSON.stringify(vs[0]), before, 'version 1 is byte-for-byte unchanged');
  const old = await A.verify(r.actd.actdNumber, 1), cur = await A.verify(r.actd.actdNumber);
  assert.equal(old.isLatest, false); assert.equal(old.sealMatches, true); assert.equal(cur.version, 2); assert.equal(cur.sealMatches, true);
  assert.equal(v2.content.s2.total, r.actd.content.s2.total);
});
await test('addendum refuses money fields, original facts, empty reasons and strangers', async () => {
  const w = boot(); const r = await pay(w, 'R1'); const A = w.Accoom.ACTD, id = r.transaction.id;
  await rejects(A.addendum(AGENT, id, { reason: '', changes: { s4: { agreementRefs: [] } } }), 'reason_required');
  await rejects(A.addendum(AGENT, id, { reason: 'x', changes: {} }), 'nothing_to_change');
  await rejects(A.addendum(AGENT, id, { reason: 'fix price', changes: { s2: { total: 1 } } }), 'immutable_section');
  await rejects(A.addendum(AGENT, id, { reason: 'fix client', changes: { s1: { client: {} } } }), 'immutable_section');
  await rejects(A.addendum(AGENT, id, { reason: 'move dates', changes: { s4: { expiryDate: '2030-01-01' } } }), 'immutable_field');
  await rejects(A.addendum({ role: 'agent', id: 'other' }, id, { reason: 'x', changes: { s5: { agentConfirmation: 'ok' } } }), 'forbidden');
  await rejects(A.addendum({ role: 'customer', id: 'someone' }, id, { reason: 'x', changes: { s5: { agentConfirmation: 'ok' } } }), 'forbidden');
  await rejects(A.addendum(null, id, { reason: 'x', changes: { s5: {} } }), 'forbidden');
  await rejects(A.addendum(AGENT, 'missing', { reason: 'x', changes: { s5: { a: 1 } } }), 'not_found');
  assert.equal((await A.versionsOf(id)).length, 1);
});
await test('two simultaneous addenda: one wins, the other is told to reload', async () => {
  const w = boot(); const r = await pay(w, 'R1'); const A = w.Accoom.ACTD;
  const mk = (n) => A.addendum(AGENT, r.transaction.id, { reason: 'update ' + n, changes: { s5: { agentConfirmation: 'Delivered ' + n } } });
  const res = await Promise.allSettled([mk(1), mk(2)]);
  assert.equal(res.filter((x) => x.status === 'fulfilled').length, 1);
  assert.equal(res.find((x) => x.status === 'rejected').reason.code, 'version_conflict');
  assert.equal((await A.versionsOf(r.transaction.id)).length, 2);
});

console.log('\nAccess control');
await test('customers see only their own ACTDs; agents only their own transactions', async () => {
  const w = boot([RENT, Object.assign({}, SALE, { ownerId: 'agent-99' })]); const A = w.Accoom.ACTD;
  const a = await pay(w, 'R1', { customerId: 'cust-A' }), b = await pay(w, 'S1', { customerId: 'cust-B' });
  const ids = async (actor) => (await A.listFor(actor)).map((x) => x.actd.actdNumber);
  assert.equal(JSON.stringify(await ids({ role: 'customer', id: 'cust-A' })), JSON.stringify([a.actd.actdNumber]));
  assert.equal(JSON.stringify(await ids({ role: 'customer', id: 'cust-B' })), JSON.stringify([b.actd.actdNumber]));
  assert.equal((await ids({ role: 'customer', id: 'cust-C' })).length, 0);
  assert.equal(JSON.stringify(await ids({ role: 'agent', id: 'agent-77' })), JSON.stringify([a.actd.actdNumber]));
  assert.equal(JSON.stringify(await ids({ role: 'agent', id: 'agent-99' })), JSON.stringify([b.actd.actdNumber]));
  assert.equal((await ids({ role: 'agent', id: 'agent-1' })).length, 0);
  assert.equal((await ids(null)).length, 0);
  assert.equal((await ids({ role: 'customer', id: '' })).length, 0, 'an empty id never matches');
  await rejects(A.getFor({ role: 'customer', id: 'cust-B' }, a.actd.actdNumber), 'not_found');
  assert.equal((await A.getFor({ role: 'customer', id: 'cust-A' }, a.actd.actdNumber)).actd.id, a.actd.id);
});
await test('an administrator sees everything only while local demo admin mode is on', async () => {
  const w = boot(); await pay(w, 'R1', { customerId: 'x' }); await pay(w, 'S1', { customerId: 'y' });
  const admin = { role: 'admin', id: 'demo-admin' };
  assert.equal((await w.Accoom.ACTD.listFor(admin)).length, 0, 'not in demo mode');
  assert.ok(w.Accoom.AdminDemo.enter('DEMO ADMIN'));
  assert.equal((await w.Accoom.ACTD.listFor(admin)).length, 2);
  assert.equal((await w.Accoom.Transactions.listFor(admin)).length, 2);
  w.Accoom.AdminDemo.exit(); assert.equal((await w.Accoom.ACTD.listFor(admin)).length, 0);
});
await test('Identity gives agents "local-agent" and customers "local-customer" when accounts have no id', () => {
  const w = boot();
  assert.equal(w.Accoom.Identity.current(), null);
  w.localStorage.setItem('accoom-user', JSON.stringify({ role: 'agent', fullName: 'Ada' })); assert.equal(w.Accoom.Identity.current().id, 'local-agent');
  w.localStorage.setItem('accoom-user', JSON.stringify({ role: 'customer', name: 'Chi' })); assert.equal(w.Accoom.Identity.current().id, 'local-customer');
  w.localStorage.setItem('accoom-user', JSON.stringify({ id: 'u-5', role: 'customer' })); assert.equal(w.Accoom.Identity.current().id, 'u-5');
});

console.log('\nPDF output');
function pdfText(bytes) {
  const s = Buffer.from(bytes).toString('latin1'); const out = [];
  s.replace(/\((.*?)(?<!\\)\) Tj/g, (_, t) => { out.push(t.replace(/\\([()\\])/g, '$1')); return ''; });
  return out;
}
await test('PDF is structurally valid: header, xref offsets, trailer, EOF', async () => {
  const w = boot(); const r = await pay(w, 'R1'); const out = w.Accoom.ACTDGenerator.render(r.actd);
  const s = Buffer.from(out.bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4')); assert.ok(s.trimEnd().endsWith('%%EOF'));
  const sx = Number(/startxref\n(\d+)\n%%EOF/.exec(s)[1]); assert.equal(s.slice(sx, sx + 4), 'xref');
  const n = Number(/xref\n0 (\d+)\n/.exec(s)[1]); const offs = [...s.slice(sx).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
  assert.equal(offs.length, n - 1);
  offs.forEach((o, i) => assert.ok(s.slice(o).startsWith((i + 1) + ' 0 obj'), 'object ' + (i + 1) + ' is where the xref says'));
  assert.match(out.fileName, /^ACTD-\d{4}-[A-Z2-9]{10}-v1\.pdf$/);
  assert.equal(out.blob.type, 'application/pdf');
});
await test('PDF contains every section, the statement, the QR URL, the seal and the demo banner', async () => {
  const w = boot(); const r = await pay(w, 'R1', { periodCount: 12, startDate: '2026-01-31' }); const t = pdfText(w.Accoom.ACTDGenerator.render(r.actd).bytes);
  const all = t.join(' ');
  for (const h of ['SECTION 1 - TRANSACTION SUMMARY', 'SECTION 2 - PAYMENT CONFIRMATION', 'SECTION 3 - PROPERTY INFORMATION', 'SECTION 4 - AGREEMENT AND CONFIRMATION', 'SECTION 5 - DOCUMENT DELIVERY', 'SECTION 6 - ACCOOM AUTHENTICATION']) assert.ok(t.includes(h), h);
  assert.ok(all.includes('ACCOOM CERTIFICATE TRANSACTION DOCUMENT (ACTD)') && all.includes(r.actd.actdNumber));
  assert.ok(all.includes('DEMONSTRATION RECORD - NO REAL PAYMENT WAS MADE'));
  assert.ok(all.includes('NGN 2,100,000') && all.includes('NGN 2,100,000') && all.includes('31 Jan 2027'));
  assert.ok(all.includes(r.actd.seal.slice(0, 40)) || t.includes(r.actd.seal));
  const norm = (x) => x.replace(/\s+/g, ' ');
  assert.ok(norm(all).includes(norm(w.Accoom.ACTD.STATEMENT.slice(0, 80))));
  assert.ok(norm(all).includes('not a digital signature'));
  assert.ok(!/\u20A6/.test(Buffer.from(w.Accoom.ACTDGenerator.render(r.actd).bytes).toString('latin1')), 'no Naira sign (fonts lack it)');
});
await test('PDF is deterministic and an old version still renders exactly as issued', async () => {
  const w = boot(); const r = await pay(w, 'R1'); const G = w.Accoom.ACTDGenerator;
  const a = Buffer.from(G.render(r.actd).bytes);
  const v2 = await w.Accoom.ACTD.addendum(AGENT, r.transaction.id, { reason: 'Receipt delivered.', changes: { s5: { agentConfirmation: 'Delivered by agent' } } });
  const b = Buffer.from(G.render((await w.Accoom.ACTD.versionsOf(r.transaction.id))[0]).bytes);
  assert.ok(Buffer.compare(a, b) === 0, 'version 1 re-renders identically after version 2 exists');
  const c = Buffer.from(G.render(v2).bytes);
  assert.ok(Buffer.compare(a, c) !== 0); assert.ok(pdfText(c).join(' ').includes('Reason for this version: Receipt delivered.'));
  assert.ok(pdfText(c).join(' ').includes('Delivered by agent'));
});
await test('sale PDF has no rental dates; long text and odd characters never break the file', async () => {
  const w = boot([Object.assign({}, SALE, { name: 'Villa (\u201CThe Palms\u201D) \\ caf\u00E9 \u20A6 \u4E2D', description: 'word '.repeat(400) + 'https://x.test/' + 'a'.repeat(300) })]);
  const r = await pay(w, 'S1'); const out = w.Accoom.ACTDGenerator.render(r.actd); const all = pdfText(out.bytes).join(' ');
  assert.ok(!all.includes('Rental duration') && !all.includes('Occupancy Extension'));
  assert.ok(Buffer.from(out.bytes).toString('latin1').trimEnd().endsWith('%%EOF'));
});
await test('external validation: qpdf accepts the files', async () => {
  try { execFileSync('qpdf', ['--version'], { stdio: 'ignore' }); } catch { const e = new Error('qpdf not installed'); e.skip = true; throw e; }
  const w = boot(); const r = await pay(w, 'R1'); writeFileSync('/tmp/_actd_test.pdf', w.Accoom.ACTDGenerator.render(r.actd).bytes);
  const out = execFileSync('qpdf', ['--check', '/tmp/_actd_test.pdf'], { encoding: 'utf8' });
  assert.ok(/No syntax or stream encoding errors/.test(out));
});

console.log('\nWiring (source checks)');
await test('pages, scripts and profile link exist', () => {
  assert.ok(read('profile.html').includes('href="document-centre.html"'));
  const dc = read('document-centre.html');
  for (const f of ['qrcode-generator.js', 'actd.js', 'transactions.js', 'pdf-writer.js', 'actd-generator.js', 'document-centre.js']) assert.ok(dc.includes(f), f);
  assert.ok(read('verify-document.html').includes('verify-document.js'));
  assert.ok(!/api[_-]?key|fetch\(/i.test(read('assets/js/data/actd.js') + read('assets/js/data/transactions.js') + read('assets/js/modules/actd-generator.js')));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed' + (skipped ? ', ' + skipped + ' skipped' : ''));
process.exit(failed ? 1 : 0);
