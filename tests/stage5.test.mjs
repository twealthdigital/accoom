// Stage 5 tests: receipts, delivery workflow, agreements/signing, privacy, PDFs.
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { Blob as NodeBlob, File as NodeFile } from 'node:buffer';
import assert from 'node:assert/strict';

let passed = 0, failed = 0;
async function test(name, fn) { try { await fn(); passed++; console.log('  PASS ' + name); } catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); } }
async function rejects(p, code) { try { await p; } catch (e) { assert.equal(e.code, code, 'expected ' + code + ' got ' + e.code + ' (' + e.message + ')'); return e; } assert.fail('expected rejection ' + code); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 2000) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(20); } return false; }
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SCRIPTS = ['assets/js/vendor/qrcode-generator.js', 'assets/js/data/schemas.js', 'assets/js/core/records.js', 'assets/js/core/identity.js', 'assets/js/core/document-store.js',
  'assets/js/data/document-requirements.js', 'assets/js/data/listing-review.js', 'assets/js/data/document-verification.js', 'assets/js/data/tenancy-dates.js',
  'assets/js/data/actd.js', 'assets/js/data/transactions.js', 'assets/js/modules/pdf-writer.js', 'assets/js/modules/actd-generator.js', 'assets/js/modules/admin-demo.js',
  'assets/js/data/receipts.js', 'assets/js/data/agreements.js', 'assets/js/modules/receipt-generator.js'];

const base = { category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period: 'month', price: 150000, agencyFee: 15000, legalFee: 10000, address: '12 Admiralty Way', area: 'Lekki Phase 1', state: 'Lagos',
  description: 'A clean flat.', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } };
const DIGITAL = Object.assign({}, base, { id: 'R1', name: 'Digital flat' });
const PHYSICAL = Object.assign({}, base, { id: 'R2', name: 'Physical flat', receiptDelivery: 'physical' });
const SALE = { id: 'S1', name: 'Duplex', category: 'sale', listingType: 'sale', typeLabel: 'Detached Duplex', price: 185000000, agencyFee: 9250000, legalFee: 0, address: '4 Oba Akinjobi Way', area: 'Ikeja GRA', state: 'Lagos', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } };

function boot(listings) {
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://accoom.test/document-centre.html', runScripts: 'outside-only' }).window;
  w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
  w.Blob = NodeBlob; w.File = NodeFile; w.Accoom = {}; w.notes = [];
  w.Accoom.NotificationService = { add: (n) => w.notes.push(n) };
  w.localStorage.setItem('accoom-agent-listings', JSON.stringify(listings || [DIGITAL, PHYSICAL, SALE]));
  for (const s of SCRIPTS) w.eval(read(s));
  return w;
}
const AGENT = { role: 'agent', id: 'agent-77' }, CUST = { role: 'customer', id: 'cust-1' }, OTHER = { role: 'customer', id: 'cust-2' }, OTHER_AGENT = { role: 'agent', id: 'agent-99' };
const pay = (w, id, over = {}) => w.Accoom.Transactions.recordDemoPayment(Object.assign({ eventId: 'e-' + Math.random(), listingId: id, customerId: 'cust-1', customerName: 'Chinedu Eze' }, over));
async function paid(w, id, over) { const r = await pay(w, id, over); await until(async () => !!(await w.Accoom.Records.collection('receipts').get('rcp_' + r.transaction.id))); return r.transaction; }
const text = (bytes) => Buffer.from(bytes).toString('latin1');
const pdfText = (out) => text(out.bytes).replace(/\\\(/g, '(').replace(/\\\)/g, ')');

console.log('\nReceipts');
await test('a successful payment automatically issues exactly one receipt, with the ACTD referencing the same number', async () => {
  const w = boot(); const tx = await paid(w, 'R1');
  const rs = await w.Accoom.Records.collection('receipts').all();
  assert.equal(rs.length, 1); assert.equal(rs[0].receiptNumber, tx.receiptRef); assert.match(rs[0].receiptNumber, /^ACR-\d{4}-[A-Z0-9]{10}$/);
  const actd = (await w.Accoom.ACTD.versionsOf(tx.id))[0];
  assert.ok(JSON.stringify(actd.content).includes(tx.receiptRef), 'ACTD refers to receipt number');
});
await test('repeating the payment event or calling ensure again never makes a second receipt', async () => {
  const w = boot(); const r = await pay(w, 'R1', { eventId: 'same' }); await until(async () => !!(await w.Accoom.Records.collection('receipts').get('rcp_' + r.transaction.id)));
  await pay(w, 'R1', { eventId: 'same' });
  await Promise.all([1, 2, 3, 4].map(() => w.Accoom.Receipts.ensureForTransaction(r.transaction.id)));
  await sleep(100);
  assert.equal((await w.Accoom.Records.collection('receipts').all()).length, 1);
  assert.equal((await w.Accoom.Records.collection('deliveryAcks').all()).length, 1);
});
await test('no receipt for a transaction that is not a confirmed success', async () => {
  const w = boot();
  await rejects(w.Accoom.Receipts.ensureForTransaction('txn_nope'), 'not_found');
  await w.Accoom.Records.collection('transactions').create({ id: 'txn_p', idempotencyKey: 'k', status: 'pending', receiptRef: 'ACR-2026-AAAAAAAAAA', amounts: {} });
  await rejects(w.Accoom.Receipts.ensureForTransaction('txn_p'), 'not_paid');
});
await test('receipt content: purpose, parties, breakdown, reference, method, status, QR url, demo flag', async () => {
  const w = boot(); const tx = await paid(w, 'R1', { periodCount: 2 });
  const r = await w.Accoom.Records.collection('receipts').get('rcp_' + tx.id), c = r.content;
  assert.equal(c.purpose, 'Rental payment'); assert.equal(c.client.name, 'Chinedu Eze'); assert.equal(c.agent.name, 'Ada Obi'); assert.equal(c.property.name, 'Digital flat');
  assert.equal(c.total, 350000); assert.equal(c.lines.length, 1); assert.equal(c.payment.reference, tx.paymentReference); assert.ok(c.payment.method);
  assert.equal(c.demo, true); assert.match(c.payment.status, /No real money was moved/); assert.match(c.verifyUrl, /verify-receipt\.html\?ref=ACR-/);
});
await test('a sale receipt says "Purchase payment" and only lists fees that apply', async () => {
  const w = boot(); const tx = await paid(w, 'S1');
  const c = (await w.Accoom.Records.collection('receipts').get('rcp_' + tx.id)).content;
  assert.equal(c.purpose, 'Purchase payment'); assert.equal(c.lines.map((l) => l.label).join('|'), 'Property price'); assert.equal(c.total, 194250000);
});
await test('issued receipts cannot be edited (immutable) and the seal detects tampering', async () => {
  const w = boot(); const tx = await paid(w, 'R1');
  const R = w.Accoom.Records.collection('receipts'), r = await R.get('rcp_' + tx.id);
  await rejects(R.put(Object.assign({}, r, { content: Object.assign({}, r.content, { total: 1 }) })), 'immutable');
  const v = await w.Accoom.Receipts.verify(r.receiptNumber); assert.equal(v.found, true); assert.equal(v.sealMatches, true);
  const raw = JSON.parse(w.localStorage.getItem('accoom-rec-receipts')); raw[0].content.total = 1; w.localStorage.setItem('accoom-rec-receipts', JSON.stringify(raw));
  assert.equal((await w.Accoom.Receipts.verify(r.receiptNumber)).sealMatches, false);
});
await test('public verify returns no personal data and says "not found" honestly for unknown numbers', async () => {
  const w = boot(); const tx = await paid(w, 'R1');
  const v = await w.Accoom.Receipts.verify(tx.receiptRef.toLowerCase());
  const s = JSON.stringify(v); assert.ok(!s.includes('Chinedu') && !s.includes('Ada Obi') && !s.includes('Lekki') && !/150000/.test(s));
  assert.equal((await w.Accoom.Receipts.verify('ACR-2026-ZZZZZZZZZZ')).found, false);
});
await test('older transactions without a receipt are backfilled once', async () => {
  const w = boot(); const r = await pay(w, 'R1');
  await until(async () => !!(await w.Accoom.Records.collection('receipts').get('rcp_' + r.transaction.id)));
  const raw = JSON.parse(w.localStorage.getItem('accoom-rec-receipts')); w.localStorage.setItem('accoom-rec-receipts', '[]'); w.localStorage.setItem('accoom-rec-deliveryAcks', '[]');
  assert.equal(await w.Accoom.Receipts.backfill(AGENT), 1); assert.equal(await w.Accoom.Receipts.backfill(AGENT), 0);
});

console.log('\nAccess control and privacy');
await test('customer sees only their own receipts; agent only their own transactions; strangers see nothing', async () => {
  const w = boot(); await paid(w, 'R1'); await paid(w, 'S1', { customerId: 'cust-2', customerName: 'Other Person' });
  assert.equal((await w.Accoom.Receipts.listFor(CUST)).length, 1); assert.equal((await w.Accoom.Receipts.listFor(OTHER)).length, 1);
  assert.equal((await w.Accoom.Receipts.listFor(AGENT)).length, 2); assert.equal((await w.Accoom.Receipts.listFor(OTHER_AGENT)).length, 0);
  assert.equal((await w.Accoom.Receipts.listFor(null)).length, 0);
  assert.equal((await w.Accoom.Receipts.listFor({ role: 'admin', id: 'demo-admin' })).length, 0, 'admin needs demo mode');
});
await test('getFor refuses another customer\'s receipt', async () => {
  const w = boot(); const tx = await paid(w, 'R1');
  await rejects(w.Accoom.Receipts.getFor(OTHER, 'rcp_' + tx.id), 'not_found'); await rejects(w.Accoom.Receipts.getFor(OTHER_AGENT, 'rcp_' + tx.id), 'not_found');
  assert.ok(await w.Accoom.Receipts.getFor(CUST, 'rcp_' + tx.id));
});
await test('no phone numbers or email addresses exist anywhere in the records an agent can read', async () => {
  const w = boot(); const tx = await paid(w, 'R2'); const ag = await w.Accoom.Agreements.create(AGENT, tx.id, { kind: 'tenancy_agreement', title: 'Tenancy', text: 'The tenant agrees to pay the rent on time and keep the flat clean.' });
  const seen = JSON.stringify([await w.Accoom.Receipts.listFor(AGENT), await w.Accoom.Receipts.deliveriesFor(AGENT), await w.Accoom.Agreements.listFor(AGENT)]);
  assert.ok(!/@/.test(seen), 'email-like text'); const stripped = seen.replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '').replace(/"(ACR|ACTD)-[^"]+"/g, '').replace(/"[a-z]+_[a-z0-9_]+"/g, '').replace(/[0-9a-f]{40,}/g, ''); const m = /\+?\d[\d\s-]{8,}\d/.exec(stripped); assert.ok(!m, 'phone-like digits: ' + (m && stripped.slice(Math.max(0, m.index - 40), m.index + 40)));
  for (const k of ['phone', 'email', 'mobile']) assert.ok(!new RegExp('"' + k, 'i').test(seen), k);
});

console.log('\nDelivery: digital');
await test('digital receipt: nothing to deliver, client told it is ready, repeated PDF downloads are identical', async () => {
  const w = boot(); const tx = await paid(w, 'R1');
  const ack = await w.Accoom.Receipts.getAck(tx.id); assert.equal(ack.state, 'not_applicable'); assert.equal(ack.delivery, 'digital');
  assert.equal((await w.Accoom.Receipts.deliveriesFor(CUST)).length, 0);
  const n = await w.Accoom.Records.collection('notifications').where((x) => x.recipientId === 'cust-1'); assert.ok(n.some((x) => x.title === 'Digital receipt available'));
  const r = await w.Accoom.Records.collection('receipts').get('rcp_' + tx.id);
  const a = w.Accoom.ReceiptGenerator.renderReceipt(r), b = w.Accoom.ReceiptGenerator.renderReceipt(r);
  assert.equal(text(a.bytes), text(b.bytes)); assert.equal(a.fileName, tx.receiptRef + '.pdf');
});
await test('only the client or an agent can\'t mark a digital receipt as delivered', async () => {
  const w = boot(); const tx = await paid(w, 'R1');
  await rejects(w.Accoom.Receipts.markDelivered(AGENT, tx.id), 'not_physical'); await rejects(w.Accoom.Receipts.clientRespond(CUST, tx.id, 'ok'), 'not_physical');
});

console.log('\nDelivery: physical workflow (the exact 8 steps)');
await test('step 1-3: payment -> client told physical was chosen, agent gets a reminder, state pending_agent', async () => {
  const w = boot(); const tx = await paid(w, 'R2');
  assert.equal((await w.Accoom.Receipts.getAck(tx.id)).state, 'pending_agent');
  const n = await w.Accoom.Records.collection('notifications').all();
  const c = n.find((x) => x.recipientId === 'cust-1'), a = n.find((x) => x.recipientId === 'agent-77');
  assert.match(c.message, /ACCOOM has not issued a physical receipt/); assert.match(a.title, /Deliver the physical receipt/);
  assert.equal(c.channels.find((x) => x.channel === 'sms').state, 'unavailable'); assert.equal(c.channels.find((x) => x.channel === 'whatsapp').state, 'unavailable'); assert.equal(c.channels.find((x) => x.channel === 'in_app').state, 'delivered');
  assert.equal((await w.Accoom.Receipts.outstandingFor(AGENT)).length, 1);
});
await test('client cannot answer before the agent marks delivery; agent marking is NOT client acknowledgement', async () => {
  const w = boot(); const tx = await paid(w, 'R2');
  await rejects(w.Accoom.Receipts.clientRespond(CUST, tx.id, 'ok'), 'bad_state');
  const s = await w.Accoom.Receipts.markDelivered(AGENT, tx.id, 'Handed over at the flat');
  assert.equal(s.state, 'agent_marked_delivered'); assert.notEqual(s.state, 'client_ok');
  const out = await w.Accoom.Receipts.outstandingFor(CUST); assert.equal(out.length, 1, 'still outstanding for the client');
  const actd = await w.Accoom.ACTD.latestOf(tx.id);
  assert.match(actd.content.s5.agentConfirmation, /not the client/i); assert.equal(actd.content.s5.clientAcknowledgement, 'Not recorded');
});
await test('step 5-6: client gets a confirmation request and can answer "received and satisfied" -> closed', async () => {
  const w = boot(); const tx = await paid(w, 'R2'); await w.Accoom.Receipts.markDelivered(AGENT, tx.id);
  const n = await w.Accoom.Records.collection('notifications').where((x) => /Did you receive/.test(x.title)); assert.equal(n.length, 1); assert.equal(n[0].recipientId, 'cust-1');
  const s = await w.Accoom.Receipts.clientRespond(CUST, tx.id, 'ok'); assert.equal(s.state, 'client_ok');
  assert.equal((await w.Accoom.Receipts.outstandingFor(CUST)).length, 0); assert.equal((await w.Accoom.Receipts.outstandingFor(AGENT)).length, 0);
  assert.match((await w.Accoom.ACTD.latestOf(tx.id)).content.s5.clientAcknowledgement, /satisfied/);
});
await test('outcome 2: "received but there is a problem" needs a description, stays open, agent is told, ACTD records it', async () => {
  const w = boot(); const tx = await paid(w, 'R2'); await w.Accoom.Receipts.markDelivered(AGENT, tx.id);
  await rejects(w.Accoom.Receipts.clientRespond(CUST, tx.id, 'problem', ''), 'note_required');
  const s = await w.Accoom.Receipts.clientRespond(CUST, tx.id, 'problem', 'My name is spelled wrongly'); assert.equal(s.state, 'client_problem');
  assert.equal((await w.Accoom.Receipts.outstandingFor(CUST)).length, 1); assert.equal((await w.Accoom.Receipts.outstandingFor(AGENT)).length, 1);
  const a = await w.Accoom.ACTD.latestOf(tx.id); assert.equal(a.content.s5.reportedProblems.length, 1); assert.match(a.content.s5.outstanding[0], /Open until resolved/);
  assert.ok((await w.Accoom.Records.collection('notifications').where((x) => x.recipientId === 'agent-77' && /needs attention/.test(x.title))).length >= 1);
});
await test('outcome 3: "I haven\'t received it" stays open; agent can deliver again and client is asked again', async () => {
  const w = boot(); const tx = await paid(w, 'R2'); await w.Accoom.Receipts.markDelivered(AGENT, tx.id);
  assert.equal((await w.Accoom.Receipts.clientRespond(CUST, tx.id, 'not_received')).state, 'client_not_received');
  assert.equal((await w.Accoom.Receipts.outstandingFor(CUST)).length, 1);
  assert.equal((await w.Accoom.Receipts.markDelivered(AGENT, tx.id, 'Second attempt')).state, 'agent_marked_delivered');
  assert.equal((await w.Accoom.Records.collection('notifications').where((x) => /Did you receive/.test(x.title))).length, 2, 'a fresh request each time');
  assert.equal((await w.Accoom.Receipts.clientRespond(CUST, tx.id, 'ok')).state, 'client_ok');
});
await test('issues stay visible until formally resolved; only the client or a reviewer can resolve, with a reason', async () => {
  const w = boot(); const tx = await paid(w, 'R2'); await w.Accoom.Receipts.markDelivered(AGENT, tx.id); await w.Accoom.Receipts.clientRespond(CUST, tx.id, 'not_received');
  await rejects(w.Accoom.Receipts.resolve(AGENT, tx.id, 'Everything fine now'), 'forbidden'); await rejects(w.Accoom.Receipts.resolve(OTHER, tx.id, 'Everything fine now'), 'forbidden');
  await rejects(w.Accoom.Receipts.resolve(CUST, tx.id, ''), 'note_required');
  assert.equal((await w.Accoom.Receipts.outstandingFor(CUST)).length, 1);
  assert.equal((await w.Accoom.Receipts.resolve(CUST, tx.id, 'Agent brought it today')).state, 'resolved');
  assert.equal((await w.Accoom.Receipts.outstandingFor(CUST)).length, 0); assert.equal((await w.Accoom.Receipts.outstandingFor(AGENT)).length, 0);
  assert.equal((await w.Accoom.ACTD.latestOf(tx.id)).content.s5.outstanding.length, 0);
});
await test('step 7: every step is recorded with who/when, and ACTD versions keep the originals', async () => {
  const w = boot(); const tx = await paid(w, 'R2'); await w.Accoom.Receipts.markDelivered(AGENT, tx.id); await w.Accoom.Receipts.clientRespond(CUST, tx.id, 'ok');
  const ack = await w.Accoom.Receipts.getAck(tx.id); assert.equal(ack.history.map((h) => h.state).join(), 'pending_agent,agent_marked_delivered,client_ok');
  assert.ok(ack.history.every((h) => h.at && h.by && h.role));
  const vs = await w.Accoom.ACTD.versionsOf(tx.id); assert.equal(vs.length, 3); assert.equal(vs[0].content.s5.agentConfirmation, 'Not recorded');
  await sleep(30); const audit = await w.Accoom.Records.collection('auditEvents').all();
  for (const a of ['receipt.issued', 'receipt.delivery.agent_marked_delivered', 'receipt.delivery.client_ok']) assert.ok(audit.some((e) => e.action === a), a);
});
await test('wrong people are refused: other agent, other customer, agent answering for client, client marking delivery', async () => {
  const w = boot(); const tx = await paid(w, 'R2');
  await rejects(w.Accoom.Receipts.markDelivered(OTHER_AGENT, tx.id), 'forbidden'); await rejects(w.Accoom.Receipts.markDelivered(CUST, tx.id), 'forbidden');
  await w.Accoom.Receipts.markDelivered(AGENT, tx.id);
  await rejects(w.Accoom.Receipts.clientRespond(OTHER, tx.id, 'ok'), 'forbidden'); await rejects(w.Accoom.Receipts.clientRespond(AGENT, tx.id, 'ok'), 'forbidden');
  await rejects(w.Accoom.Receipts.clientRespond(CUST, tx.id, 'maybe'), 'bad_outcome');
  await w.Accoom.Receipts.clientRespond(CUST, tx.id, 'ok'); await rejects(w.Accoom.Receipts.clientRespond(CUST, tx.id, 'problem', 'changed my mind'), 'bad_state');
});
await test('client is told BEFORE payment which delivery applies; agent can change it for future payments only', async () => {
  const w = boot(); const R = w.Accoom.Receipts;
  assert.match(R.noticeFor(PHYSICAL).text, /PHYSICAL.*ACCOOM does not issue a physical receipt/s); assert.match(R.noticeFor(DIGITAL).text, /digital ACCOOM receipt/);
  const tx = await paid(w, 'R2'); await R.setListingDelivery(AGENT, 'R2', 'digital');
  assert.equal((await R.getAck(tx.id)).delivery, 'physical', 'past payment keeps its method');
  assert.equal(JSON.parse(w.localStorage.getItem('accoom-agent-listings')).find((l) => l.id === 'R2').receiptDelivery, 'digital');
  await rejects(R.setListingDelivery(CUST, 'R2', 'physical'), 'forbidden'); await rejects(R.setListingDelivery(AGENT, 'R2', 'carrier-pigeon'), 'bad_method'); await rejects(R.setListingDelivery(AGENT, 'nope', 'digital'), 'not_found');
});
await test('inbox delivery pushes each notification into the existing ACCOOM inbox once only', async () => {
  const w = boot(); await paid(w, 'R2'); const before = w.notes.length;
  assert.equal(await w.Accoom.Receipts.deliverInbox(AGENT), 1); assert.equal(w.notes.length, before + 1); assert.equal(await w.Accoom.Receipts.deliverInbox(AGENT), 0); assert.equal(w.notes.length, before + 1);
});

console.log('\nAgreements and signing');
async function setup(w, listing = 'R1', input = {}) {
  const tx = await paid(w, listing);
  const ag = await w.Accoom.Agreements.create(AGENT, tx.id, Object.assign({ kind: 'tenancy_agreement', title: 'Tenancy agreement', text: 'The tenant will pay rent monthly and keep the flat in good order. The landlord will repair major faults.' }, input));
  return { tx, ag };
}
const signIn = { typedName: 'Chinedu Eze', agreedRead: true };
await test('step 1-2: agent prepares typed terms; client gets a signing request; status awaiting_client', async () => {
  const w = boot(); const { ag } = await setup(w);
  assert.equal(ag.status, 'awaiting_client'); assert.equal(ag.events[0].type, 'prepared'); assert.match(ag.contentSha256, /^[0-9a-f]{64}$/);
  assert.ok((await w.Accoom.Records.collection('notifications').where((n) => n.recipientId === 'cust-1' && /ready to sign/.test(n.title))).length === 1);
  assert.equal((await w.Accoom.Agreements.listFor(CUST)).length, 1); assert.equal((await w.Accoom.Agreements.listFor(OTHER)).length, 0); assert.equal((await w.Accoom.Agreements.listFor(OTHER_AGENT)).length, 0);
});
await test('agent can also upload an agreement file (stored separately from the listing\'s property documents)', async () => {
  const w = boot(); const tx = await paid(w, 'R1');
  const f = new NodeFile([Buffer.from('%PDF-1.4\nagreement bytes')], 'agreement.pdf', { type: 'application/pdf' });
  const ag = await w.Accoom.Agreements.create(AGENT, tx.id, { kind: 'tenancy_agreement', title: 'Uploaded agreement', file: f });
  assert.equal(ag.fileName, 'agreement.pdf'); assert.match(ag.contentSha256, /^[0-9a-f]{64}$/);
  assert.equal((await w.Accoom.DocumentStore.listForListing('R1')).length, 0, 'the listing\'s own documents are untouched');
  const got = await w.Accoom.Agreements.getFile(CUST, ag.id); assert.equal(got.fileName, 'agreement.pdf'); assert.ok(got.blob.size > 10);
  await rejects(w.Accoom.Agreements.getFile(OTHER, ag.id), 'not_found');
  await rejects(w.Accoom.Agreements.create(AGENT, tx.id, { kind: 'tenancy_agreement', title: 'Bad', file: new NodeFile(['x'], 'a.exe', { type: 'application/x-msdownload' }) }), 'invalid_type');
});
await test('preparing is only for the transaction\'s own agent, a paid transaction, with a title and terms', async () => {
  const w = boot(); const tx = await paid(w, 'R1'); const ok = { kind: 'tenancy_agreement', title: 'T', text: 'x'.repeat(60) };
  await rejects(w.Accoom.Agreements.create(CUST, tx.id, ok), 'forbidden'); await rejects(w.Accoom.Agreements.create(OTHER_AGENT, tx.id, Object.assign({}, ok, { title: 'Title ok' })), 'forbidden');
  await rejects(w.Accoom.Agreements.create(AGENT, tx.id, Object.assign({}, ok, { title: 'x' })), 'title_required'); await rejects(w.Accoom.Agreements.create(AGENT, tx.id, { kind: 'tenancy_agreement', title: 'Title ok', text: 'short' }), 'content_required');
  await rejects(w.Accoom.Agreements.create(AGENT, tx.id, { kind: 'nope', title: 'Title ok', text: 'x'.repeat(60) }), 'bad_kind'); await rejects(w.Accoom.Agreements.create(AGENT, 'txn_missing', Object.assign({}, ok, { title: 'Title ok' })), 'not_paid');
});
await test('step 3: the client must open and read the agreement before signing; the review is recorded', async () => {
  const w = boot(); const { ag } = await setup(w);
  await rejects(w.Accoom.Agreements.sign(CUST, ag.id, signIn), 'review_first');
  await w.Accoom.Agreements.markViewed(CUST, ag.id); await w.Accoom.Agreements.markViewed(CUST, ag.id);
  const a = await w.Accoom.Agreements.getFor(CUST, ag.id); assert.equal(a.events.filter((e) => e.type === 'client_reviewed').length, 1, 'recorded once');
});
await test('step 4-5: client signs, then the agent countersigns; each step recorded with a timestamp', async () => {
  const w = boot(); const { ag } = await setup(w); await w.Accoom.Agreements.markViewed(CUST, ag.id);
  await rejects(w.Accoom.Agreements.sign(AGENT, ag.id, { typedName: 'Ada Obi', agreedRead: true }), 'bad_state');
  const s1 = await w.Accoom.Agreements.sign(CUST, ag.id, signIn); assert.equal(s1.status, 'client_signed');
  await rejects(w.Accoom.Agreements.sign(CUST, ag.id, signIn), 'bad_state');
  assert.ok((await w.Accoom.Records.collection('notifications').where((n) => n.recipientId === 'agent-77' && /Client signed/.test(n.title))).length === 1);
  const s2 = await w.Accoom.Agreements.sign(AGENT, ag.id, { typedName: 'Ada Obi', agreedRead: true }); assert.equal(s2.status, 'completed');
  assert.equal(s2.events.map((e) => e.type).join(), 'prepared,signing_requested,client_reviewed,client_signed,agent_countersigned'); assert.ok(s2.events.every((e) => e.at));
  assert.match(s2.finalSeal, /^[0-9a-f]{64}$/); assert.equal(s2.signatures.length, 2); assert.equal(s2.signatures[0].contentSha256, ag.contentSha256);
});
await test('signature honesty: always "visual_signature" + electronic record, never "legally_validated", with the disclaimer', async () => {
  const w = boot(); const { ag } = await setup(w); await w.Accoom.Agreements.markViewed(CUST, ag.id);
  const s = await w.Accoom.Agreements.sign(CUST, ag.id, Object.assign({ level: 'legally_validated' }, signIn));
  assert.equal(s.signatures[0].level, 'visual_signature'); assert.equal(s.signatures[0].electronicRecord, true); assert.match(s.signatures[0].statement, /does not claim this satisfies every legal requirement/);
  assert.match(w.Accoom.Agreements.LEVEL_TEXT.legally_validated, /NOT available/); assert.ok(!JSON.stringify(s).includes('"legally_validated"'));
});
await test('signing needs a typed name and the "I have read it" tick; drawn marks must be a small PNG', async () => {
  const w = boot(); const { ag } = await setup(w); await w.Accoom.Agreements.markViewed(CUST, ag.id);
  await rejects(w.Accoom.Agreements.sign(CUST, ag.id, { typedName: 'Al', agreedRead: true }), 'name_required'); await rejects(w.Accoom.Agreements.sign(CUST, ag.id, { typedName: 'Chinedu Eze' }), 'confirm_required');
  const s = await w.Accoom.Agreements.sign(CUST, ag.id, { typedName: 'Chinedu Eze', agreedRead: true, drawnImage: 'data:text/html;base64,PHNjcmlwdD4=' });
  assert.equal(s.signatures[0].drawnImage, ''); assert.equal(s.signatures[0].method, 'typed');
  const w2 = boot(); const b = await setup(w2); await w2.Accoom.Agreements.markViewed(CUST, b.ag.id);
  const s2 = await w2.Accoom.Agreements.sign(CUST, b.ag.id, { typedName: 'Chinedu Eze', agreedRead: true, drawnImage: 'data:image/png;base64,iVBORw0KGgo=' }); assert.equal(s2.signatures[0].method, 'drawn_and_typed');
});
await test('only the named client signs; strangers and other agents cannot', async () => {
  const w = boot(); const { ag } = await setup(w);
  await rejects(w.Accoom.Agreements.markViewed(OTHER, ag.id), 'forbidden'); await rejects(w.Accoom.Agreements.sign(OTHER, ag.id, signIn), 'forbidden'); await rejects(w.Accoom.Agreements.sign(null, ag.id, signIn), 'forbidden');
  await w.Accoom.Agreements.markViewed(CUST, ag.id); await w.Accoom.Agreements.sign(CUST, ag.id, signIn);
  await rejects(w.Accoom.Agreements.sign(OTHER_AGENT, ag.id, { typedName: 'Eve Mallory', agreedRead: true }), 'forbidden');
});
await test('countersign can be switched off; client signature then completes the agreement', async () => {
  const w = boot(); const { ag } = await setup(w, 'R1', { requireCountersign: false }); await w.Accoom.Agreements.markViewed(CUST, ag.id);
  assert.equal((await w.Accoom.Agreements.sign(CUST, ag.id, signIn)).status, 'completed');
});
await test('client can decline (with a reason); agent can cancel; closed agreements cannot be signed', async () => {
  const w = boot(); const { ag } = await setup(w);
  await rejects(w.Accoom.Agreements.decline(CUST, ag.id, ''), 'reason_required'); await rejects(w.Accoom.Agreements.decline(AGENT, ag.id, 'not mine to decline'), 'forbidden');
  assert.equal((await w.Accoom.Agreements.decline(CUST, ag.id, 'The rent is wrong')).status, 'declined');
  await w.Accoom.Agreements.markViewed(CUST, ag.id).catch(() => {}); await rejects(w.Accoom.Agreements.sign(CUST, ag.id, signIn), 'bad_state');
  const w2 = boot(); const b = await setup(w2); await rejects(w2.Accoom.Agreements.cancel(AGENT, b.ag.id, ''), 'reason_required');
  assert.equal((await w2.Accoom.Agreements.cancel(AGENT, b.ag.id, 'Terms changed')).status, 'cancelled'); await rejects(w2.Accoom.Agreements.cancel(AGENT, b.ag.id, 'again again'), 'bad_state');
});
await test('step 6: signing is written into the ACTD (new versions; original kept) as agreement refs and signing records', async () => {
  const w = boot(); const { tx, ag } = await setup(w); await w.Accoom.Agreements.markViewed(CUST, ag.id);
  await w.Accoom.Agreements.sign(CUST, ag.id, signIn); await w.Accoom.Agreements.sign(AGENT, ag.id, { typedName: 'Ada Obi', agreedRead: true });
  const vs = await w.Accoom.ACTD.versionsOf(tx.id); const last = vs[vs.length - 1];
  assert.ok(vs.length >= 4); assert.equal(vs[0].content.s4.agreementRefs.length, 0, 'v1 untouched');
  assert.equal(last.content.s4.agreementRefs[0].id, ag.id); assert.equal(last.content.s4.signingRecords.length, 2); assert.match(last.content.s4.signingRecords[0].text, /Visual signature/);
  assert.match(last.content.s4.confirmations[0].state, /^Signed/); assert.match(last.content.s4.confirmations[1].state, /^Countersigned/);
  assert.ok((await w.Accoom.ACTD.verify(last.actdNumber, last.version)).sealMatches);
});
await test('both parties can download the final agreement; others cannot read it', async () => {
  const w = boot(); const { ag } = await setup(w); await w.Accoom.Agreements.markViewed(CUST, ag.id); await w.Accoom.Agreements.sign(CUST, ag.id, signIn); await w.Accoom.Agreements.sign(AGENT, ag.id, { typedName: 'Ada Obi', agreedRead: true });
  for (const who of [CUST, AGENT]) { const a = await w.Accoom.Agreements.getFor(who, ag.id); const out = w.Accoom.ReceiptGenerator.renderSigning(a, false); assert.ok(out.bytes.length > 1000); assert.equal(text(out.bytes).slice(0, 5), '%PDF-'); }
  await rejects(w.Accoom.Agreements.getFor(OTHER, ag.id), 'not_found'); await rejects(w.Accoom.Agreements.getFor(OTHER_AGENT, ag.id), 'not_found');
});
await test('tampering with a completed agreement changes its seal', async () => {
  const w = boot(); const { ag } = await setup(w); await w.Accoom.Agreements.markViewed(CUST, ag.id); await w.Accoom.Agreements.sign(CUST, ag.id, signIn); const done = await w.Accoom.Agreements.sign(AGENT, ag.id, { typedName: 'Ada Obi', agreedRead: true });
  assert.equal(await w.Accoom.Agreements.sealOf(done), done.finalSeal);
  assert.notEqual(await w.Accoom.Agreements.sealOf(Object.assign({}, done, { contentSha256: 'f'.repeat(64) })), done.finalSeal);
});

console.log('\nPDF output');
await test('receipt PDF contains receipt number, breakdown, delivery wording, demo banner, QR + seal and the honest note', async () => {
  const w = boot(); const tx = await paid(w, 'R2'); const r = await w.Accoom.Records.collection('receipts').get('rcp_' + tx.id);
  const out = w.Accoom.ReceiptGenerator.renderReceipt(r), t = pdfText(out);
  assert.equal(text(out.bytes).slice(0, 5), '%PDF-'); assert.ok(text(out.bytes).trimEnd().endsWith('%%EOF'));
  for (const s of [tx.receiptRef, 'RENTAL PAYMENT', 'DEMONSTRATION RECORD', 'Chinedu Eze', 'Ada Obi', 'NGN 175,000', 'ACCOOM has not issued a physical receipt', 'verify-receipt.html', r.seal.slice(0, 16), 'not a digital signature'])
    assert.ok(t.includes(s), 'missing: ' + s);
});
await test('signing-record PDF states what a signature is and is not', async () => {
  const w = boot(); const { ag } = await setup(w); const t = pdfText(w.Accoom.ReceiptGenerator.renderSigning(ag, false));
  for (const s of ['SIGNATURES', 'No one has signed yet', 'visual signature', 'does not claim this satisfies every legal requirement', ag.contentSha256.slice(0, 16)]) assert.ok(t.includes(s), 'missing: ' + s);
});
await test('Naira amounts are printed as "NGN" (PDF fonts have no Naira sign) and nothing breaks on odd characters', async () => {
  const w = boot([Object.assign({}, DIGITAL, { name: 'Flat \u20A6 caf\u00E9 \u201Cquoted\u201D' })]); const tx = await paid(w, 'R1');
  const r = await w.Accoom.Records.collection('receipts').get('rcp_' + tx.id); const out = w.Accoom.ReceiptGenerator.renderReceipt(r); assert.ok(out.bytes.length > 1000);
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
