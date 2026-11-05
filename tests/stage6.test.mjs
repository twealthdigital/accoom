// Stage 6 tests: tenancy records, progress maths, reminders (idempotent), renewal decisions/offers/payment.
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
async function until(fn, ms = 2500) { const t = Date.now(); while (Date.now() - t < ms) { if (await fn()) return true; await sleep(20); } return false; }
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const SCRIPTS = ['assets/js/vendor/qrcode-generator.js', 'assets/js/data/schemas.js', 'assets/js/core/records.js', 'assets/js/core/identity.js', 'assets/js/core/document-store.js',
  'assets/js/data/document-requirements.js', 'assets/js/data/listing-review.js', 'assets/js/data/document-verification.js', 'assets/js/data/tenancy-dates.js',
  'assets/js/data/actd.js', 'assets/js/data/transactions.js', 'assets/js/modules/pdf-writer.js', 'assets/js/modules/actd-generator.js', 'assets/js/modules/admin-demo.js',
  'assets/js/data/receipts.js', 'assets/js/data/agreements.js', 'assets/js/modules/receipt-generator.js', 'assets/js/data/tenancy.js'];

const mk = (id, name, period, price, extra = {}) => Object.assign({ id, name, category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period, price, agencyFee: 0, legalFee: 0, address: '1 Test Road', area: 'Lekki', state: 'Lagos',
  description: 'x', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } }, extra);
const LISTINGS = [mk('YR', 'Yearly flat', 'year', 1200000, { occupancyExtension: { mode: 'days', days: 60 } }), mk('MO', 'Monthly flat', 'month', 100000), mk('WK', 'Weekly room', 'week', 25000), mk('DY', 'Daily room', 'day', 5000),
  { id: 'S1', name: 'Duplex', category: 'sale', listingType: 'sale', typeLabel: 'Duplex', price: 185000000, agencyFee: 0, legalFee: 0, status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } }];

function boot() {
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://accoom.test/tenancies.html', runScripts: 'outside-only' }).window;
  w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
  w.Blob = NodeBlob; w.File = NodeFile; w.Accoom = {}; w.notes = [];
  w.Accoom.NotificationService = { add: (n) => w.notes.push(n) };
  w.localStorage.setItem('accoom-agent-listings', JSON.stringify(LISTINGS));
  for (const s of SCRIPTS) w.eval(read(s));
  return w;
}
const AGENT = { role: 'agent', id: 'agent-77' }, CUST = { role: 'customer', id: 'cust-1' }, OTHER = { role: 'customer', id: 'cust-2' }, OTHER_AGENT = { role: 'agent', id: 'agent-99' };
async function rent(w, id, start, count = 1, over = {}) {
  const r = await w.Accoom.Transactions.recordDemoPayment(Object.assign({ eventId: 'e-' + Math.random(), listingId: id, customerId: 'cust-1', customerName: 'Chinedu Eze', periodCount: count, startDate: start }, over));
  assert.ok(await until(async () => !!(await w.Accoom.Records.collection('tenancies').get('ten_' + r.transaction.id))), 'tenancy created');
  return { tx: r.transaction, ten: await w.Accoom.Records.collection('tenancies').get('ten_' + r.transaction.id) };
}
const D = (w, s) => w.Accoom.Tenancy.dayStartMs(s);
const ms = 86400000;
const notesFor = async (w, who, pred = () => true) => (await w.Accoom.Records.collection('notifications').where((n) => n.recipientId === who && /^tenancy_/.test(n.category) && n.category !== 'tenancy_started' && pred(n)));

console.log('\nProgress and reminder times (real start/expiry instants, not fixed days)');
await test('thresholds sit at exactly 70/80/90/100% of the agreed term for daily, weekly, monthly and yearly rentals', async () => {
  const w = boot();
  for (const [id, start, period, count] of [['DY', '2026-03-01', 'day', 1], ['DY', '2026-03-01', 'day', 3], ['WK', '2026-03-02', 'week', 2], ['MO', '2026-06-10', 'month', 1], ['YR', '2026-01-01', 'year', 1]]) {
    const { ten } = await rent(w, id, start, count);
    const s = D(w, ten.startDate), e = D(w, ten.expiryDate), th = w.Accoom.Tenancy.thresholds(ten);
    for (const p of [70, 80, 90, 100]) assert.ok(Math.abs((th[p] - s) / (e - s) - p / 100) < 1e-9, id + ' ' + count + ' ' + p);
    assert.equal(th[100], e);
  }
});
await test('uneven month lengths: 31 Jan + 1 month = 28 days, so 70% falls after 19.6 days (not "21 days")', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-01-31');
  assert.equal(ten.expiryDate, '2026-02-28');
  const s = D(w, '2026-01-31'); assert.equal(w.Accoom.Tenancy.thresholdMs(ten, 70) - s, Math.round(19.6 * ms));
});
await test('leap-year yearly rental 29 Feb 2024 -> 28 Feb 2025 (365 days) and a 366-day year give different 70% points', async () => {
  const w = boot(); const a = await rent(w, 'YR', '2024-02-29'); const b = await rent(w, 'YR', '2024-01-01');
  assert.equal(a.ten.expiryDate, '2025-02-28'); assert.equal(b.ten.expiryDate, '2025-01-01');
  assert.equal(w.Accoom.Tenancy.thresholdMs(a.ten, 70) - D(w, '2024-02-29'), Math.round(365 * 0.7 * ms)); assert.equal(w.Accoom.Tenancy.thresholdMs(b.ten, 70) - D(w, '2024-01-01'), Math.round(366 * 0.7 * ms));
});
await test('a one-day rental has its 70% point 16 hours 48 minutes after midnight Nigerian time', async () => {
  const w = boot(); const { ten } = await rent(w, 'DY', '2026-03-01');
  assert.equal(w.Accoom.Tenancy.thresholdMs(ten, 70) - D(w, '2026-03-01'), 16 * 3600000 + 48 * 60000);
  assert.equal(new Date(w.Accoom.Tenancy.thresholdMs(ten, 70)).toISOString(), '2026-03-01T15:48:00.000Z');
});
await test('progress(): 0% before start, exact percentages mid-way, clamped to 100% after expiry, window flag at 70%', async () => {
  const w = boot(); const { ten } = await rent(w, 'WK', '2026-04-06'); const T = w.Accoom.Tenancy, s = D(w, ten.startDate);
  assert.equal(T.progress(ten, s - 1000).percent, 0); assert.equal(T.progress(ten, s - 1000).started, false);
  assert.equal(T.progress(ten, s + 3.5 * ms).percent, 50); assert.equal(T.progress(ten, s + 3.5 * ms).renewalWindowOpen, false);
  assert.equal(T.progress(ten, s + 4.9 * ms).renewalWindowOpen, true); assert.equal(T.progress(ten, s + 4.9 * ms).rounded, 70);
  const after = T.progress(ten, s + 99 * ms); assert.equal(after.percent, 100); assert.equal(after.expiryReached, true); assert.equal(after.daysLeft, 0);
  assert.equal(T.progress(ten, s).totalDays, 7);
});

console.log('\nTenancy record');
await test('a successful rental creates a tenancy with every required field and links the ACTD', async () => {
  const w = boot(); const { tx, ten } = await rent(w, 'YR', '2026-01-01');
  const actd = (await w.Accoom.ACTD.versionsOf(tx.id))[0];
  assert.equal(ten.id, 'ten_' + tx.id); assert.equal(ten.propertyId, 'YR'); assert.equal(ten.customerId, 'cust-1'); assert.equal(ten.agentId, 'agent-77'); assert.ok('landlordId' in ten);
  assert.equal(ten.actdId, actd.id); assert.equal(ten.actdNumber, actd.actdNumber); assert.equal(ten.rentAmount, 1200000); assert.equal(ten.billingPeriod, 'year'); assert.equal(ten.periodCount, 1);
  assert.equal(ten.startDate, '2026-01-01'); assert.equal(ten.expiryDate, '2027-01-01'); assert.equal(ten.status, 'active'); assert.equal(ten.renewalDecision, 'none');
  assert.equal(ten.occupancyExtension.days, 60); assert.equal(ten.paymentHistory.length, 1); assert.equal(ten.paymentHistory[0].receiptRef, tx.receiptRef); assert.ok(Array.isArray(ten.notificationHistory)); assert.ok('agreementId' in ten);
});
await test('a sale creates no tenancy; repeated payment events create exactly one tenancy; unpaid transactions are refused', async () => {
  const w = boot(); const s = await w.Accoom.Transactions.recordDemoPayment({ eventId: 's1', listingId: 'S1', customerId: 'cust-1', customerName: 'C' });
  await rejects(w.Accoom.Tenancy.ensureForTransaction(s.transaction.id), 'not_rental'); await sleep(150);
  assert.equal((await w.Accoom.Records.collection('tenancies').all()).length, 0);
  const a = await rent(w, 'MO', '2026-05-01'); await w.Accoom.Transactions.recordDemoPayment({ eventId: 'same', listingId: 'WK', customerId: 'cust-1', customerName: 'C' });
  await Promise.all([1, 2, 3].map(() => w.Accoom.Tenancy.ensureForTransaction(a.tx.id))); await sleep(200);
  assert.equal((await w.Accoom.Records.collection('tenancies').all()).filter((t) => t.propertyId === 'MO').length, 1);
  await rejects(w.Accoom.Tenancy.ensureForTransaction('txn_nope'), 'not_found');
});
await test('access: tenant sees own, agent sees own listings, strangers nothing', async () => {
  const w = boot(); await rent(w, 'MO', '2026-05-01');
  assert.equal((await w.Accoom.Tenancy.listFor(CUST)).length, 1); assert.equal((await w.Accoom.Tenancy.listFor(AGENT)).length, 1);
  assert.equal((await w.Accoom.Tenancy.listFor(OTHER)).length, 0); assert.equal((await w.Accoom.Tenancy.listFor(OTHER_AGENT)).length, 0); assert.equal((await w.Accoom.Tenancy.listFor(null)).length, 0);
  assert.equal((await w.Accoom.Tenancy.listFor({ role: 'admin', id: 'x' })).length, 0);
  await rejects(w.Accoom.Tenancy.getFor(OTHER, 'ten_x'), 'not_found');
});
await test('backfill makes tenancies for older rental payments, once', async () => {
  const w = boot(); const { tx } = await rent(w, 'MO', '2026-05-01'); w.localStorage.setItem('accoom-rec-tenancies', '[]');
  assert.equal(await w.Accoom.Tenancy.backfill(AGENT), 1); assert.equal(await w.Accoom.Tenancy.backfill(AGENT), 0);
});

console.log('\nReminders at 70, 80, 90, 100% (each sent once)');
const TEXT = { 70: 'Your ACCOOM tenancy is approaching its renewal period. You can now review your tenancy details and discuss renewal arrangements.', 80: 'Your tenancy is progressing towards its scheduled expiry date. Please review your renewal options.',
  90: 'Your tenancy will soon expire. Please confirm your renewal intentions.', 100: 'Your scheduled tenancy expiry date has arrived. Please review your tenancy status and any agreed occupancy extension.' };
for (const [label, id, start, count] of [['daily', 'DY', '2026-03-01', 1], ['weekly', 'WK', '2026-03-02', 1], ['monthly', 'MO', '2026-06-10', 1], ['yearly', 'YR', '2026-01-01', 1]]) {
  await test(label + ' tenancy: nothing before a threshold, then exactly one reminder as each of 70/80/90/100% is reached, with the exact wording', async () => {
    const w = boot(); const { ten } = await rent(w, id, start, count); const T = w.Accoom.Tenancy, th = T.thresholds(ten);
    await T.checkAll(D(w, start) - 1000); assert.equal((await notesFor(w, 'cust-1')).length, 0);
    let n = 0;
    for (const p of [70, 80, 90, 100]) {
      await T.checkAll(th[p] - 1); assert.equal((await notesFor(w, 'cust-1')).length, n, 'not yet at ' + p);
      await T.checkAll(th[p]); n++; const got = await notesFor(w, 'cust-1'); assert.equal(got.length, n, 'sent at ' + p);
      assert.ok(got.some((x) => x.message.startsWith(TEXT[p])), 'wording ' + p);
    }
    const cats = (await notesFor(w, 'cust-1')).map((x) => x.category).sort().join(); assert.equal(cats, 'tenancy_70,tenancy_80,tenancy_90,tenancy_expiry');
    assert.ok((await notesFor(w, 'cust-1')).every((x) => x.link.startsWith('tenancies.html#ten_') && x.channels.find((c) => c.channel === 'sms').state === 'unavailable'));
  });
}
await test('reloading the page, running the check again, or running it in parallel never sends a reminder twice', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-06-10'); const T = w.Accoom.Tenancy, at = T.thresholds(ten)[80] + 1000;
  await Promise.all([1, 2, 3, 4, 5, 6].map(() => T.checkAll(at))); await T.checkAll(at); await T.checkAll(at + 5000);
  const mine = await notesFor(w, 'cust-1'); assert.equal(mine.length, 1); assert.equal(mine[0].category, 'tenancy_80');
  const t = await w.Accoom.Records.collection('tenancies').get(ten.id); assert.equal(t.notificationHistory.length, 1); assert.equal(t.reminders[80].state, 'sent');
  const keys = (await w.Accoom.Records.collection('notifications').all()).map((n) => n.dedupeKey); assert.equal(new Set(keys).size, keys.length);
});
await test('if nobody opened ACCOOM for a long time only the latest reminder is sent; earlier ones are recorded as skipped', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-06-10'); const T = w.Accoom.Tenancy;
  await T.checkAll(T.thresholds(ten)[100] + 10 * ms);
  const mine = await notesFor(w, 'cust-1'); assert.equal(mine.length, 1); assert.equal(mine[0].category, 'tenancy_expiry');
  const t = await w.Accoom.Records.collection('tenancies').get(ten.id);
  assert.equal([70, 80, 90].map((p) => t.reminders[p].state).join(), 'skipped_late,skipped_late,skipped_late'); assert.equal(t.reminders[100].state, 'sent');
  await T.checkAll(T.thresholds(ten)[100] + 20 * ms); assert.equal((await notesFor(w, 'cust-1')).length, 1);
});
await test('agent is told at 90% and 100% only; 70% and 80% go to the tenant', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-06-10'); const T = w.Accoom.Tenancy, th = T.thresholds(ten);
  for (const p of [70, 80]) { await T.checkAll(th[p]); } assert.equal((await notesFor(w, 'agent-77')).length, 0);
  await T.checkAll(th[90]); await T.checkAll(th[100]); assert.equal((await notesFor(w, 'agent-77')).map((n) => n.category).sort().join(), 'tenancy_90,tenancy_expiry');
});
await test('a tenancy that has not started sends nothing; one that has been renewed or ended is left alone', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2027-01-01'); const T = w.Accoom.Tenancy;
  await T.checkAll(Date.now()); assert.equal((await notesFor(w, 'cust-1')).length, 0);
  await w.Accoom.Records.collection('tenancies').put(Object.assign({}, ten, { status: 'renewed' })); await T.checkAll(T.thresholds(ten)[100] + ms); assert.equal((await notesFor(w, 'cust-1')).length, 0);
});
await test('reminders reach the existing ACCOOM inbox once per person', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-06-10'); await w.Accoom.Tenancy.checkAll(w.Accoom.Tenancy.thresholds(ten)[70]);
  const before = w.notes.length; assert.equal(await w.Accoom.Tenancy.deliverInbox(CUST), 2, 'started + 70% reminder'); assert.equal(w.notes.length, before + 2); assert.equal(await w.Accoom.Tenancy.deliverInbox(CUST), 0);
});

console.log('\nTenant renewal decision');
await test('decision is closed until 70% has passed, then open; shows the date it opens', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-06-10'); const T = w.Accoom.Tenancy, th = T.thresholds(ten);
  const e = await rejects(T.decide(CUST, ten.id, 'renew', '', th[70] - 1), 'too_early'); assert.match(e.message, /70%/);
  assert.equal((await T.decide(CUST, ten.id, 'renew', 'Happy here', th[70])).renewalDecision, 'renew');
});
await test('all three options are recorded with time and note, can be changed, and the agent is told each time', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-06-10'); const T = w.Accoom.Tenancy, at = T.thresholds(ten)[80];
  await T.decide(CUST, ten.id, 'discuss', 'Can we talk about the price?', at); await T.decide(CUST, ten.id, 'not_renew', '', at); const t = await T.decide(CUST, ten.id, 'renew', '', at);
  assert.equal(t.renewalHistory.map((h) => h.decision).join(), 'discuss,not_renew,renew'); assert.ok(t.renewalHistory.every((h) => h.at && h.by === 'cust-1'));
  const a = await w.Accoom.Records.collection('notifications').where((n) => n.recipientId === 'agent-77' && n.category === 'renewal_requested'); assert.equal(a.length, 3);
  assert.match(a[0].message, /needs to discuss renewal.*Can we talk about the price/);
});
await test('only the tenant decides; strangers and agents cannot; bad choices refused; no silent renewal', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-06-10'); const T = w.Accoom.Tenancy, at = T.thresholds(ten)[90];
  await rejects(T.decide(OTHER, ten.id, 'renew', '', at), 'forbidden'); await rejects(T.decide(AGENT, ten.id, 'renew', '', at), 'forbidden'); await rejects(T.decide(CUST, ten.id, 'maybe', '', at), 'bad_decision');
  await T.decide(CUST, ten.id, 'renew', '', at);
  const t = await w.Accoom.Records.collection('tenancies').get(ten.id); assert.equal(t.status, 'active'); assert.equal(t.expiryDate, ten.expiryDate); assert.equal((await w.Accoom.Records.collection('tenancies').all()).length, 1);
});

console.log('\nMessages through ACCOOM');
await test('tenant and agent can message each other; the other side is notified; strangers cannot', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-06-10'); const T = w.Accoom.Tenancy;
  await T.sendMessage(CUST, ten.id, 'Can I renew for 6 months?'); const t = await T.sendMessage(AGENT, ten.id, 'Yes, I will send terms.');
  assert.equal(t.messages.length, 2); assert.equal(t.messages[0].role, 'customer'); assert.equal(t.messages[1].name, 'Ada Obi');
  assert.equal((await w.Accoom.Records.collection('notifications').where((n) => n.category === 'message_tenancy' && n.recipientId === 'agent-77')).length, 1);
  await rejects(T.sendMessage(OTHER, ten.id, 'hello there'), 'forbidden'); await rejects(T.sendMessage(OTHER_AGENT, ten.id, 'hello there'), 'forbidden');
});
await test('phone numbers and email addresses are refused; normal numbers, dates and money are fine', async () => {
  const w = boot(); const { ten } = await rent(w, 'MO', '2026-06-10'); const T = w.Accoom.Tenancy;
  for (const bad of ['call me on 08012345678', 'my number is +234 801 234 5678', 'mail me chinedu@example.com', 'reach me 0801-234-5678']) await rejects(T.sendMessage(CUST, ten.id, bad), 'contact_details');
  for (const ok of ['Rent is 150,000 due 2026-07-01', 'Flat 12, 3 bedrooms', 'I will pay 1,200,000 in two parts']) await T.sendMessage(CUST, ten.id, ok);
  await rejects(T.sendMessage(CUST, ten.id, ''), 'empty'); await rejects(T.sendMessage(CUST, ten.id, 'x'.repeat(501)), 'too_long');
});

console.log('\nRenewal offer, agreement, payment, new ACTD');
async function toOffer(w, id = 'MO', start = '2026-06-10') {
  const { tx, ten } = await rent(w, id, start); const T = w.Accoom.Tenancy;
  await T.decide(CUST, ten.id, 'renew', '', T.thresholds(ten)[80]);
  return { tx, ten, T };
}
const TERMS = { amount: 120000, billingPeriod: 'month', periodCount: 6, startDate: '2026-07-10' };
await test('agent can offer only after the tenant asks; terms are validated; renewal cannot overlap the current term', async () => {
  const w = boot(); const { tx, ten } = await rent(w, 'MO', '2026-06-10'); const T = w.Accoom.Tenancy;
  await rejects(T.offerRenewal(AGENT, ten.id, TERMS), 'no_request'); await T.decide(CUST, ten.id, 'discuss', '', T.thresholds(ten)[70]);
  await rejects(T.offerRenewal(CUST, ten.id, TERMS), 'forbidden'); await rejects(T.offerRenewal(OTHER_AGENT, ten.id, TERMS), 'forbidden');
  await rejects(T.offerRenewal(AGENT, ten.id, Object.assign({}, TERMS, { amount: 0 })), 'bad_amount'); await rejects(T.offerRenewal(AGENT, ten.id, Object.assign({}, TERMS, { billingPeriod: 'decade' })), 'bad_period');
  await rejects(T.offerRenewal(AGENT, ten.id, Object.assign({}, TERMS, { periodCount: 1.5 })), 'bad_count'); await rejects(T.offerRenewal(AGENT, ten.id, Object.assign({}, TERMS, { startDate: '2026-07-09' })), 'overlap');
  await rejects(T.offerRenewal(AGENT, ten.id, Object.assign({}, TERMS, { startDate: 'tomorrow' })), 'bad_date');
});
await test('offer records new amount, period, start and a correctly calculated expiry, and sends a renewal agreement to sign', async () => {
  const w = boot(); const { ten, T } = await toOffer(w);
  const r = await T.offerRenewal(AGENT, ten.id, Object.assign({}, TERMS, { startDate: '2026-07-31', periodCount: 1 }));
  assert.equal(r.status, 'offered'); assert.equal(r.newAmount, 120000); assert.equal(r.newBillingPeriod, 'month'); assert.equal(r.newStartDate, '2026-07-31'); assert.equal(r.newExpiryDate, '2026-08-31');
  const agr = await w.Accoom.Agreements.getFor(CUST, r.agreementId); assert.equal(agr.kind, 'renewal_agreement'); assert.equal(agr.status, 'awaiting_client'); assert.match(agr.body, /New rent: NGN 120,000 per month/); assert.match(agr.body, /New expiry date: 2026-08-31/); assert.match(agr.body, /not automatic/);
  assert.ok((await w.Accoom.Records.collection('notifications').where((n) => n.recipientId === 'cust-1' && n.title === 'Renewal offer')).length === 1);
  await rejects(T.offerRenewal(AGENT, ten.id, TERMS), 'offer_open');
});
await test('agent can withdraw an offer (reason needed); tenant saying "do not renew" declines an open offer', async () => {
  const w = boot(); const { ten, T } = await toOffer(w); const r = await T.offerRenewal(AGENT, ten.id, TERMS);
  await rejects(T.withdrawOffer(AGENT, r.id, ''), 'reason_required'); await rejects(T.withdrawOffer(CUST, r.id, 'I will withdraw it'), 'forbidden');
  assert.equal((await T.withdrawOffer(AGENT, r.id, 'Terms changed')).status, 'withdrawn'); assert.equal((await w.Accoom.Agreements.getFor(AGENT, r.agreementId)).status, 'cancelled');
  const r2 = await T.offerRenewal(AGENT, ten.id, TERMS); await T.decide(CUST, ten.id, 'not_renew', '', T.thresholds(ten)[90]);
  assert.equal((await w.Accoom.Records.collection('renewals').get(r2.id)).status, 'declined');
});
await test('renewal cannot be paid before the tenant signs the renewal agreement', async () => {
  const w = boot(); const { ten, T } = await toOffer(w); const r = await T.offerRenewal(AGENT, ten.id, TERMS);
  await rejects(T.payRenewalDemo(CUST, r.id), 'sign_first'); await rejects(T.payRenewalDemo(OTHER, r.id), 'forbidden'); await rejects(T.payRenewalDemo(AGENT, r.id), 'forbidden');
  assert.equal((await w.Accoom.Records.collection('transactions').all()).filter((t) => t.type === 'renewal_payment').length, 0);
});
async function signAndPay(w, T, r) {
  await w.Accoom.Agreements.markViewed(CUST, r.agreementId); await w.Accoom.Agreements.sign(CUST, r.agreementId, { typedName: 'Chinedu Eze', agreedRead: true });
  return T.payRenewalDemo(CUST, r.id);
}
await test('paying creates a NEW transaction, NEW ACTD and NEW receipt, and a NEW tenancy linked to the old one', async () => {
  const w = boot(); const { tx, ten, T } = await toOffer(w); const r = await T.offerRenewal(AGENT, ten.id, TERMS); const res = await signAndPay(w, T, r);
  assert.equal(res.transaction.type, 'renewal_payment'); assert.equal(res.transaction.paymentSource, 'demo'); assert.notEqual(res.transaction.id, tx.id); assert.equal(res.transaction.amounts.total, 720000);
  assert.notEqual(res.actd.actdNumber, ten.actdNumber); assert.equal(res.actd.content.s1.transactionType, 'Rental renewal payment'); assert.equal(res.actd.content.s4.startDate, '2026-07-10'); assert.equal(res.actd.content.s4.expiryDate, '2027-01-10');
  assert.ok(await until(async () => !!(await w.Accoom.Records.collection('receipts').get('rcp_' + res.transaction.id)))); assert.equal((await w.Accoom.Records.collection('receipts').all()).length, 2);
  const nt = res.tenancy; assert.equal(nt.previousTenancyId, ten.id); assert.equal(nt.startDate, '2026-07-10'); assert.equal(nt.expiryDate, '2027-01-10'); assert.equal(nt.rentAmount, 120000); assert.equal(nt.periodCount, 6); assert.equal(nt.actdNumber, res.actd.actdNumber); assert.equal(nt.paymentHistory[0].kind, 'renewal'); assert.equal(nt.status, 'active'); assert.equal(nt.renewalDecision, 'none');
  const rr = await w.Accoom.Records.collection('renewals').get(r.id); assert.equal(rr.status, 'completed'); assert.equal(rr.newTransactionId, res.transaction.id); assert.equal(rr.newTenancyId, nt.id);
});
await test('the ORIGINAL tenancy, transaction and ACTD are preserved exactly; the old tenancy is only marked renewed', async () => {
  const w = boot(); const { tx, ten, T } = await toOffer(w); const r = await T.offerRenewal(AGENT, ten.id, TERMS); const before = await w.Accoom.ACTD.versionsOf(tx.id); await signAndPay(w, T, r);
  const old = await w.Accoom.Records.collection('tenancies').get(ten.id);
  for (const k of ['startDate', 'expiryDate', 'rentAmount', 'billingPeriod', 'periodCount', 'actdId', 'actdNumber', 'transactionId', 'customerId']) assert.equal(old[k], ten[k], k);
  assert.equal(old.paymentHistory.length, 1); assert.equal(old.status, 'renewed'); assert.ok(old.renewedByTenancyId);
  const after = await w.Accoom.ACTD.versionsOf(tx.id); assert.equal(after[0].seal, before[0].seal, 'version 1 untouched'); assert.ok((await w.Accoom.ACTD.verify(before[0].actdNumber, 1)).sealMatches);
  assert.equal(JSON.stringify(after[after.length - 1].content.s2), JSON.stringify(before[0].content.s2), 'payment section never changes'); assert.equal(JSON.stringify(after[after.length - 1].content.s4.startDate) + after[after.length - 1].content.s4.expiryDate, JSON.stringify(before[0].content.s4.startDate) + before[0].content.s4.expiryDate, 'old term dates unchanged');
  for (const v of after.slice(before.length)) assert.match(v.updateReason, /agreement/i, 'later versions only record the renewal agreement');
  assert.equal((await w.Accoom.Records.collection('transactions').get(tx.id)).amounts.total, tx.amounts.total);
});
await test('paying twice (double click / repeated event) never makes a second transaction, ACTD, receipt or tenancy', async () => {
  const w = boot(); const { ten, T } = await toOffer(w); const r = await T.offerRenewal(AGENT, ten.id, TERMS); await w.Accoom.Agreements.markViewed(CUST, r.agreementId); await w.Accoom.Agreements.sign(CUST, r.agreementId, { typedName: 'Chinedu Eze', agreedRead: true });
  const all = await Promise.all([1, 2, 3].map(() => T.payRenewalDemo(CUST, r.id))); await T.payRenewalDemo(CUST, r.id); await sleep(200);
  assert.equal(new Set(all.map((x) => x.transaction.id)).size, 1);
  assert.equal((await w.Accoom.Records.collection('transactions').all()).filter((t) => t.type === 'renewal_payment').length, 1); assert.equal((await w.Accoom.Records.collection('tenancies').all()).length, 2);
  assert.equal((await w.Accoom.Records.collection('receipts').all()).length, 2); assert.equal((await w.Accoom.Records.collection('actds').all()).filter((a) => a.transactionId === all[0].transaction.id).length, 1);
});
await test('after renewal: old tenancy stops reminding, the new one runs its own 70/80/90/100% schedule; the chain links both', async () => {
  const w = boot(); const { ten, T } = await toOffer(w); const r = await T.offerRenewal(AGENT, ten.id, TERMS); const res = await signAndPay(w, T, r);
  const n0 = (await notesFor(w, 'cust-1')).length; await T.checkAll(T.thresholds(ten)[100] + ms); assert.equal((await notesFor(w, 'cust-1')).length, n0, 'old tenancy silent');
  const th = T.thresholds(res.tenancy); await T.checkAll(th[70]); assert.equal((await notesFor(w, 'cust-1')).length, n0 + 1);
  const ch = await T.chain(CUST, ten.id); assert.equal(ch.map((c) => c.id).join(), ten.id + ',' + res.tenancy.id); assert.equal((await T.chain(AGENT, res.tenancy.id)).length, 2);
  await rejects(T.decide(CUST, ten.id, 'renew', '', th[70]), 'bad_state');
});
await test('a renewal payment is only a demonstration event and says so; real gateway confirmation is still refused', async () => {
  const w = boot(); const { ten, T } = await toOffer(w); const r = await T.offerRenewal(AGENT, ten.id, TERMS); const res = await signAndPay(w, T, r);
  assert.equal(res.actd.content.demo, true); assert.match(res.actd.content.s2.status, /No real money was moved/); await rejects(w.Accoom.Transactions.handleGatewayWebhook({}), 'backend_required');
});
await test('privacy: nothing an agent can read in tenancies, offers or messages contains an email or phone number', async () => {
  const w = boot(); const { ten, T } = await toOffer(w); await T.sendMessage(CUST, ten.id, 'Please send the terms'); await T.offerRenewal(AGENT, ten.id, TERMS);
  const seen = JSON.stringify([await T.listFor(AGENT), await w.Accoom.Records.collection('renewals').all()]).replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '').replace(/[0-9a-f]{40,}/g, '').replace(/"(ACR|ACTD)-[^"]+"/g, '').replace(/"[a-z]+_[a-z0-9_]+"/g, '');
  assert.ok(!/@/.test(seen)); assert.ok(!/(?:\+?\d[\s().-]?){10,}/.test(seen)); assert.ok(!/"(phone|email|mobile)/i.test(seen));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
