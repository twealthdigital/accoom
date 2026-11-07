// Stage 7 tests: Occupancy Extension configuration, timeline, milestones, vacancy, handover, disputes, reactivation eligibility.
import { JSDOM } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { readFileSync, readdirSync, statSync } from 'node:fs';
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
  'assets/js/data/receipts.js', 'assets/js/data/agreements.js', 'assets/js/modules/receipt-generator.js', 'assets/js/data/tenancy.js', 'assets/js/data/occupancy.js'];

const mk = (id, name, period, price, oe, extra = {}) => Object.assign({ id, name, category: 'rent', listingType: 'rent', typeLabel: 'Mini Flat', period, price, agencyFee: 0, legalFee: 0, address: '1 Test Road', area: 'Lekki', state: 'Lagos',
  description: 'x', status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } }, oe === undefined ? {} : { occupancyExtension: oe }, extra);
const LISTINGS = [mk('YR', 'Yearly flat', 'year', 1200000, { mode: 'days', days: 60 }), mk('MO', 'Monthly flat', 'month', 100000, { mode: 'none', days: 0 }), mk('WK', 'Weekly room', 'week', 25000, { mode: 'days', days: 7 }),
  mk('CU', 'Custom flat', 'month', 90000, { mode: 'custom', days: 45, milestones: [20, 5] }), mk('DY', 'Daily room', 'day', 5000, { mode: 'days', days: 14 }),
  { id: 'S1', name: 'Duplex', category: 'sale', listingType: 'sale', typeLabel: 'Duplex', price: 185000000, status: 'available', ownerId: 'agent-77', agentName: 'Ada Obi', approval: { state: 'legacy_unreviewed' } }];

function boot() {
  const w = new JSDOM('<!doctype html><body></body>', { url: 'https://accoom.test/tenancies.html', runScripts: 'outside-only' }).window;
  w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
  w.Blob = NodeBlob; w.File = NodeFile; w.Accoom = {}; w.notes = [];
  w.Accoom.NotificationService = { add: (n) => w.notes.push(n) };
  w.localStorage.setItem('accoom-agent-listings', JSON.stringify(LISTINGS));
  for (const s of SCRIPTS) w.eval(read(s));
  if (w.Accoom && w.Accoom.ListingReview) w.Accoom.ListingReview.AUTO_APPROVE.enabled = false; // these tests cover the real manual review workflow
  return w;
}
const AGENT = { role: 'agent', id: 'agent-77' }, CUST = { role: 'customer', id: 'cust-1' }, OTHER = { role: 'customer', id: 'cust-2' }, OTHER_AGENT = { role: 'agent', id: 'agent-99' };
async function rent(w, id, start, count = 1) {
  const r = await w.Accoom.Transactions.recordDemoPayment({ eventId: 'e-' + Math.random(), listingId: id, customerId: 'cust-1', customerName: 'Chinedu Eze', periodCount: count, startDate: start });
  assert.ok(await until(async () => !!(await w.Accoom.Records.collection('tenancies').get('ten_' + r.transaction.id))));
  return { tx: r.transaction, ten: await w.Accoom.Records.collection('tenancies').get('ten_' + r.transaction.id) };
}
const D = (w, s) => w.Accoom.Tenancy.dayStartMs(s), DAY = 86400000;
const get = (w, id) => w.Accoom.Records.collection('tenancies').get(id);
const listing = (w, id) => JSON.parse(w.localStorage.getItem('accoom-agent-listings')).find((l) => l.id === id);
const notes = (w, who, cat) => w.Accoom.Records.collection('notifications').where((n) => n.recipientId === who && (!cat || n.category === cat));
const admin = (w) => { w.sessionStorage.setItem('accoom-demo-admin', '1'); };

console.log('\nConfiguration (None, 7, 14, 30, 60, 90, custom)');
await test('all preset options and a custom number of days are accepted; they are stored consistently', () => {
  const O = boot().Accoom.Occupancy;
  for (const d of [0, 7, 14, 30, 60, 90]) assert.equal(O.normalizeConfig({ days: d }).days, d);
  assert.equal(O.normalizeConfig({ days: 0 }).mode, 'none'); assert.equal(O.normalizeConfig({ days: 30 }).mode, 'days'); assert.equal(O.normalizeConfig({ days: '45' }).mode, 'custom'); assert.equal(O.normalizeConfig({ days: 365 }).days, 365);
  assert.equal(O.normalizeConfig({}).days, 0); assert.equal(O.normalizeConfig({ days: '' }).mode, 'none');
});
await test('bad values are refused with a clear message: negative, fractions, text, over 365 days', () => {
  const O = boot().Accoom.Occupancy;
  for (const bad of [-1, 1.5, 'abc', 366, 1000]) assert.throws(() => O.normalizeConfig({ days: bad }), (e) => e.code === 'bad_days' || e.code === 'too_long');
  assert.throws(() => O.normalizeConfig({ days: 30, milestones: '30' }), (e) => e.code === 'bad_milestones'); assert.throws(() => O.normalizeConfig({ days: 30, milestones: '0,5' }), (e) => e.code === 'bad_milestones');
  assert.throws(() => O.normalizeConfig({ days: 30, milestones: 'x' }), (e) => e.code === 'bad_milestones');
  assert.equal(JSON.stringify(O.normalizeConfig({ days: 30, milestones: '5, 20,10,5' }).milestones), '[20,10,5]'); assert.equal(O.normalizeConfig({ days: 0, milestones: '5' }).milestones, undefined);
});
await test('agent saves the setting on a rental listing; it is audited; sale listings and other agents are refused', async () => {
  const w = boot(), O = w.Accoom.Occupancy;
  assert.equal((await O.setListingConfig(AGENT, 'MO', { days: 90 })).mode, 'days'); assert.equal(listing(w, 'MO').occupancyExtension.days, 90);
  assert.equal((await O.setListingConfig(AGENT, 'MO', { days: 21, milestones: '10, 2' })).mode, 'custom'); assert.equal(listing(w, 'MO').occupancyExtension.milestones.join(), '10,2');
  await rejects(O.setListingConfig(AGENT, 'S1', { days: 30 }), 'not_rental'); assert.ok(!('occupancyExtension' in listing(w, 'S1')), 'no rental fields leak into a sale');
  await rejects(O.setListingConfig(OTHER_AGENT, 'MO', { days: 30 }), 'forbidden'); await rejects(O.setListingConfig(CUST, 'MO', { days: 30 }), 'forbidden');
  await rejects(O.setListingConfig(AGENT, 'nope', { days: 30 }), 'not_found'); await rejects(O.setListingConfig(AGENT, 'MO', { days: 999 }), 'too_long');
  await sleep(40); assert.ok((await w.Accoom.Records.collection('auditEvents').all()).some((e) => e.action === 'listing.occupancy_extension'));
});
await test('the setting is copied into the tenancy and the ACTD; changing the listing later only affects NEW tenancies', async () => {
  const w = boot(); const a = await rent(w, 'YR', '2026-01-01');
  assert.equal(a.ten.occupancyExtension.days, 60); const actd = (await w.Accoom.ACTD.versionsOf(a.tx.id))[0]; assert.match(actd.content.s4.occupancyExtension, /Occupancy Extension of 60 days/);
  await w.Accoom.Occupancy.setListingConfig(AGENT, 'YR', { days: 14 });
  assert.equal((await get(w, a.ten.id)).occupancyExtension.days, 60, 'existing tenancy keeps what was agreed');
  const b = await rent(w, 'YR', '2026-02-01'); assert.equal(b.ten.occupancyExtension.days, 14); assert.match((await w.Accoom.ACTD.versionsOf(b.tx.id))[0].content.s4.occupancyExtension, /14 days/);
  const c = await rent(w, 'MO', '2026-02-01'); assert.equal(c.ten.occupancyExtension.days, 0); assert.match((await w.Accoom.ACTD.versionsOf(c.tx.id))[0].content.s4.occupancyExtension, /No Occupancy Extension/);
});

console.log('\nTimeline: expiry -> Occupancy Extension -> end');
await test('before the scheduled expiry nothing changes; at expiry the extension starts and tenant, agent are told once', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01'); const exp = D(w, '2027-01-01');
  await O.advanceAll(exp - 1); assert.equal((await get(w, ten.id)).status, 'active');
  await O.advanceAll(exp); const t = await get(w, ten.id);
  assert.equal(t.status, 'occupancy_extension'); assert.equal(t.extension.state, 'running'); assert.equal(t.extension.endDate, '2027-03-02'); assert.equal(t.extension.daysTotal, 60);
  const c = await notes(w, 'cust-1', 'tenancy_extension_started'), a = await notes(w, 'agent-77', 'tenancy_extension_started');
  assert.equal(c.length, 1); assert.equal(a.length, 1); assert.match(c[0].message, /Occupancy Extension of 60 days has started and runs until 2027-03-02/); assert.match(c[0].message, /has not assumed you have left or renewed/); assert.match(a[0].message, /acting for the landlord/);
});
await test('running the check again, on reload, or in parallel never repeats the start notice or changes the record twice', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01'); const at = D(w, '2027-01-01') + 1000;
  await Promise.all([1, 2, 3, 4, 5].map(() => O.advanceAll(at))); await O.advanceAll(at + 5000);
  assert.equal((await notes(w, 'cust-1', 'tenancy_extension_started')).length, 1); assert.equal((await notes(w, 'agent-77', 'tenancy_extension_started')).length, 1);
  const keys = (await w.Accoom.Records.collection('notifications').all()).map((n) => n.dedupeKey); assert.equal(new Set(keys).size, keys.length);
});
await test('an expired tenancy NEVER silently becomes a renewed one, and the tenant is never assumed to have left', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01');
  for (const at of [D(w, '2027-01-01'), D(w, '2027-02-01'), D(w, '2027-03-02') + DAY, D(w, '2028-01-01')]) await O.advanceAll(at);
  const t = await get(w, ten.id); assert.notEqual(t.status, 'renewed'); assert.notEqual(t.status, 'vacated'); assert.equal(t.vacancy.tenantVacated, null); assert.equal(t.vacancy.agentVacancyConfirmed, null);
  assert.equal((await w.Accoom.Records.collection('tenancies').all()).length, 1); assert.equal((await w.Accoom.Records.collection('renewals').all()).length, 0);
  assert.equal(t.renewalDecision, 'none'); assert.equal(t.vacancy.relist.eligible, false);
});
await test('the ACTD records the extension starting and ending as new versions (original kept)', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { tx, ten } = await rent(w, 'YR', '2026-01-01');
  await O.advanceAll(D(w, '2027-01-01')); await O.advanceAll(D(w, '2027-03-02'));
  const vs = await w.Accoom.ACTD.versionsOf(tx.id); assert.ok(vs.length >= 3);
  assert.match(vs[0].content.s4.occupancyExtension, /Occupancy Extension of 60 days after the scheduled expiry date/); assert.match(vs[1].content.s4.occupancyExtension, /started on 2027-01-01 and ends on 2027-03-02/);
  assert.match(vs[2].content.s4.occupancyExtension, /ended on 2027-03-02.*Nobody has been assumed to have left/); assert.ok((await w.Accoom.ACTD.verify(vs[0].actdNumber, 1)).sealMatches);
});
await test('default milestones (14, 7, 3, 1 days left): each one is sent once, to tenant AND agent, with the end date', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01'); const end = D(w, '2027-03-02');
  await O.advanceAll(D(w, '2027-01-01')); let n = 0;
  for (const m of [14, 7, 3, 1]) {
    await O.advanceAll(end - m * DAY - 1); assert.equal((await notes(w, 'cust-1', 'tenancy_extension_ending')).length, n, 'not yet at ' + m);
    await O.advanceAll(end - m * DAY); await O.advanceAll(end - m * DAY + 5000); n++;
    assert.equal((await notes(w, 'cust-1', 'tenancy_extension_ending')).length, n); assert.equal((await notes(w, 'agent-77', 'tenancy_extension_ending')).length, n);
  }
  const last = (await notes(w, 'cust-1', 'tenancy_extension_ending')).at(-1); assert.match(last.title, /1 day left/); assert.match(last.message, /ends on 2027-03-02/);
  const t = await get(w, ten.id); assert.equal([14, 7, 3, 1].map((m) => t.extension.milestones[m].state).join(), 'sent,sent,sent,sent');
});
await test('milestones are configurable per listing and have sensible defaults for short extensions (7 days -> 3 and 1)', async () => {
  const w = boot(), O = w.Accoom.Occupancy;
  const wk = await rent(w, 'WK', '2026-03-02'); assert.equal(O.milestonesFor(wk.ten).join(), '3,1');
  const cu = await rent(w, 'CU', '2026-03-01'); assert.equal(O.milestonesFor(cu.ten).join(), '20,5'); assert.equal(cu.ten.occupancyExtension.days, 45); assert.equal(cu.ten.occupancyExtension.mode, 'custom');
  const dy = await rent(w, 'DY', '2026-03-01'); assert.equal(O.milestonesFor(dy.ten).join(), '7,3,1');
  await O.advanceAll(D(w, cu.ten.expiryDate)); const end = D(w, cu.ten.extension ? cu.ten.extension.endDate : (await get(w, cu.ten.id)).extension.endDate);
  await O.advanceAll(end - 20 * DAY); assert.equal((await notes(w, 'cust-1', 'tenancy_extension_ending')).length, 1); assert.match((await notes(w, 'cust-1', 'tenancy_extension_ending'))[0].title, /20 days left/);
});
await test('if ACCOOM was not opened for a long time, only the latest milestone is sent and earlier ones are recorded as skipped', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01'); const end = D(w, '2027-03-02');
  await O.advanceAll(D(w, '2027-01-01')); await O.advanceAll(end - 2 * DAY);
  const c = await notes(w, 'cust-1', 'tenancy_extension_ending'); assert.equal(c.length, 1); assert.match(c[0].title, /3 days left/);
  const t = await get(w, ten.id); assert.equal([14, 7].map((m) => t.extension.milestones[m].state).join(), 'skipped_late,skipped_late');
});
await test('when the extension ends: tenant, agent (for the landlord) are told, vacancy confirmation starts, status "awaiting vacancy confirmation"', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01'); await O.advanceAll(D(w, '2027-01-01')); await O.advanceAll(D(w, '2027-03-02'));
  const t = await get(w, ten.id); assert.equal(t.status, 'awaiting_vacancy_confirmation'); assert.equal(t.extension.state, 'ended'); assert.ok(t.vacancy.requestedAt);
  const c = await notes(w, 'cust-1', 'tenancy_vacancy'), a = await notes(w, 'agent-77', 'tenancy_vacancy');
  assert.equal(c.length, 1); assert.equal(a.length, 1); assert.match(c[0].message, /Occupancy Extension of 60 days ended on 2027-03-02/); assert.match(c[0].message, /has not assumed you have left/); assert.match(a[0].message, /inspect the property/);
  assert.equal(JSON.stringify(O.relistState(t).eligible), 'false'); assert.equal((await O.advanceAll(D(w, '2028-01-01'))), 0);
});
await test('no Occupancy Extension: the vacancy process starts at the scheduled expiry date', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'MO', '2026-06-10');
  await O.advanceAll(D(w, ten.expiryDate) - 1); assert.equal((await get(w, ten.id)).status, 'active'); await O.advanceAll(D(w, ten.expiryDate));
  const t = await get(w, ten.id); assert.equal(t.status, 'awaiting_vacancy_confirmation'); assert.equal(t.extension.state, 'none'); assert.equal((await notes(w, 'cust-1', 'tenancy_extension_started')).length, 0);
  assert.match((await notes(w, 'cust-1', 'tenancy_vacancy'))[0].message, /no Occupancy Extension was agreed/);
});
await test('opening ACCOOM for the first time after the extension already ended skips the start and goes straight to vacancy confirmation', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01'); await O.advanceAll(D(w, '2027-06-01'));
  const t = await get(w, ten.id); assert.equal(t.status, 'awaiting_vacancy_confirmation'); assert.equal((await notes(w, 'cust-1', 'tenancy_extension_started')).length, 0); assert.equal((await notes(w, 'cust-1', 'tenancy_vacancy')).length, 1);
});
await test('daily, weekly, monthly and yearly tenancies all follow the same path with their own extension lengths', async () => {
  const w = boot(), O = w.Accoom.Occupancy;
  for (const [id, start, endDate] of [['DY', '2026-03-01', '2026-03-16'], ['WK', '2026-03-02', '2026-03-16'], ['CU', '2026-03-01', '2026-05-16'], ['YR', '2026-01-01', '2027-03-02']]) {
    const { ten } = await rent(w, id, start); await O.advanceAll(D(w, ten.expiryDate)); const t = await get(w, ten.id);
    assert.equal(t.status, 'occupancy_extension', id); assert.equal(t.extension.endDate, endDate, id);
  }
});

console.log('\nOccupancy status, vacancy and handover');
async function ended(w, id = 'YR', start = '2026-01-01') { const r = await rent(w, id, start); await w.Accoom.Occupancy.advanceAll(D(w, r.ten.expiryDate)); const t0 = await get(w, r.ten.id); await w.Accoom.Occupancy.advanceAll(D(w, t0.extension && t0.extension.endDate ? t0.extension.endDate : r.ten.expiryDate)); return { ...r, end: D(w, (await get(w, r.ten.id)).extension.endDate || r.ten.expiryDate) }; }
const GOOD = { date: '2027-03-03', condition: 'good', keysReturned: true, occupied: false, notes: '' };
await test('not available before the scheduled expiry date', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01'); const early = D(w, '2026-06-01');
  await rejects(O.reportOccupancy(CUST, ten.id, { status: 'vacant' }, early), 'bad_status'); await rejects(O.reportOccupancy(CUST, ten.id, { status: 'vacated' }, early), 'bad_state'); await rejects(O.reportOccupancy(CUST, ten.id, { status: 'still_occupying' }, early), 'bad_state');
  await rejects(O.confirmVacated(CUST, ten.id, {}, early), 'bad_state'); await rejects(O.recordInspection(AGENT, ten.id, GOOD, early), 'bad_state'); await rejects(O.raiseDispute(CUST, ten.id, 'too early to dispute', early), 'bad_state');
});
await test('tenant and agent are asked and can state the occupancy status during and after the extension; the other side is told', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01'); const mid = D(w, '2027-02-01');
  const a = await O.reportOccupancy(CUST, ten.id, { status: 'vacating', plannedDate: '2027-02-20' }, mid); assert.equal(a.status, 'occupancy_extension'); assert.equal(a.occupancyReports[0].plannedDate, '2027-02-20');
  await rejects(O.reportOccupancy(CUST, ten.id, { status: 'vacating', plannedDate: 'soon' }, mid), 'bad_date'); await rejects(O.reportOccupancy(CUST, ten.id, { status: 'vacant' }, mid), 'bad_status'); await rejects(O.reportOccupancy(AGENT, ten.id, { status: 'vacated' }, mid), 'bad_status');
  await O.reportOccupancy(AGENT, ten.id, { status: 'occupied' }, mid);
  assert.equal((await notes(w, 'agent-77', 'tenancy_vacancy')).filter((n) => /plans to move out on 2027-02-20/.test(n.message)).length, 1); assert.equal((await notes(w, 'cust-1', 'tenancy_vacancy')).filter((n) => /still occupied/.test(n.message)).length, 1);
  assert.equal((await get(w, ten.id)).status, 'occupancy_extension', 'a report never ends the tenancy');
});
await test('a tenant who is still in the property after the extension blocks vacancy confirmation and reactivation', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten, end } = await ended(w);
  const t = await O.reportOccupancy(CUST, ten.id, { status: 'still_occupying', note: 'Need two more weeks' }, end); assert.equal(t.vacancy.stillOccupying, true);
  await O.recordInspection(AGENT, ten.id, Object.assign({}, GOOD, { occupied: false }), end); await rejects(O.confirmVacancy(AGENT, ten.id, {}, end), 'still_occupied');
  const r = O.relistState(await get(w, ten.id)); assert.equal(r.eligible, false); assert.ok(r.reasons.some((x) => /still in the property/.test(x)));
});
await test('inspection records the date, condition, keys, whether it is occupied and notes; rules are enforced', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten, end } = await ended(w);
  await rejects(O.recordInspection(CUST, ten.id, GOOD, end), 'forbidden'); await rejects(O.recordInspection(OTHER_AGENT, ten.id, GOOD, end), 'forbidden');
  await rejects(O.recordInspection(AGENT, ten.id, Object.assign({}, GOOD, { condition: 'great' }), end), 'bad_condition'); await rejects(O.recordInspection(AGENT, ten.id, Object.assign({}, GOOD, { occupied: undefined }), end), 'bad_occupied');
  await rejects(O.recordInspection(AGENT, ten.id, Object.assign({}, GOOD, { condition: 'major_issues' }), end), 'notes_required'); await rejects(O.recordInspection(AGENT, ten.id, Object.assign({}, GOOD, { date: 'yesterday' }), end), 'bad_date');
  const t = await O.recordInspection(AGENT, ten.id, Object.assign({}, GOOD, { condition: 'minor_issues', notes: 'Scratched wall in the hall' }), end);
  assert.equal(t.vacancy.handover.condition, 'minor_issues'); assert.equal(t.vacancy.handover.keysReturned, true); assert.equal(t.vacancy.handover.occupied, false);
  assert.equal((await notes(w, 'cust-1', 'tenancy_vacancy')).filter((n) => /Handover inspection/.test(n.title)).length, 1);
});
await test('the agent cannot confirm vacancy without an inspection, or when it found the property occupied', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten, end } = await ended(w);
  await rejects(O.confirmVacancy(AGENT, ten.id, {}, end), 'no_inspection'); await O.recordInspection(AGENT, ten.id, Object.assign({}, GOOD, { occupied: true }), end); await rejects(O.confirmVacancy(AGENT, ten.id, {}, end), 'still_occupied');
});
await test('if the tenant stays silent, the agent can confirm only 7 days after the request, and it is flagged as "without the tenant"', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten, end } = await ended(w); await O.recordInspection(AGENT, ten.id, GOOD, end);
  const e = await rejects(O.confirmVacancy(AGENT, ten.id, {}, end + 2 * DAY), 'wait_for_tenant'); assert.match(e.message, /7 days after the request/);
  const t = await O.confirmVacancy(AGENT, ten.id, { note: 'Property empty, keys with me' }, end + 8 * DAY);
  assert.equal(t.vacancy.agentVacancyConfirmed.withoutTenant, true); assert.equal(t.status, 'vacated'); assert.equal(t.vacancy.relist.eligible, false, 'still needs "ready for a new tenant"');
  assert.match((await notes(w, 'cust-1', 'tenancy_vacancy')).at(-1).message, /raise a dispute/);
});
await test('full happy path: tenant moved out + inspection + vacancy confirmed + ready for a new tenant => ELIGIBLE (listing marked, status and approval untouched)', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { tx, ten, end } = await ended(w); const before = listing(w, 'YR');
  await rejects(O.confirmReady(AGENT, ten.id, {}, end), 'not_vacated');
  await O.confirmVacated(CUST, ten.id, { movedOutOn: '2027-03-01' }, end); assert.equal((await get(w, ten.id)).status, 'awaiting_vacancy_confirmation', 'tenant alone is not enough');
  await O.recordInspection(AGENT, ten.id, GOOD, end); await O.acknowledgeHandover(CUST, ten.id, { answer: 'agree' }, end);
  let t = await O.confirmVacancy(AGENT, ten.id, {}, end); assert.equal(t.status, 'vacated'); assert.equal(O.relistState(t).eligible, false); assert.equal(listing(w, 'YR').reactivation, undefined, 'not marked yet');
  await rejects(O.confirmReady(CUST, ten.id, {}, end), 'forbidden'); await rejects(O.confirmReady(OTHER_AGENT, ten.id, {}, end), 'forbidden');
  t = await O.confirmReady(AGENT, ten.id, { note: 'Painted and cleaned' }, end);
  assert.equal(t.vacancy.relist.eligible, true); assert.equal(O.relistState(t).eligible, true);
  const l = listing(w, 'YR'); assert.equal(l.reactivation.eligible, true); assert.equal(l.reactivation.tenancyId, ten.id);
  assert.equal(l.status, before.status, 'ACCOOM does not relist by itself'); assert.equal(JSON.stringify(l.approval), JSON.stringify(before.approval)); assert.equal(w.Accoom.ListingReview.isPubliclyVisible(l), false);
  assert.equal((await notes(w, 'agent-77', 'tenancy_relist_ready')).length, 1); assert.match((await w.Accoom.ACTD.latestOf(tx.id)).content.s4.occupancyExtension, /Vacancy was confirmed/);
  await O.confirmReady(AGENT, ten.id, {}, end); assert.equal((await notes(w, 'agent-77', 'tenancy_relist_ready')).length, 1, 'sent once');
});
await test('the tenant leaving early during the extension and the agent confirming ends it early (no more milestone reminders)', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten } = await rent(w, 'YR', '2026-01-01'); const mid = D(w, '2027-01-20'); await O.advanceAll(D(w, '2027-01-01'));
  await O.confirmVacated(CUST, ten.id, { movedOutOn: '2027-01-18' }, mid); await O.recordInspection(AGENT, ten.id, GOOD, mid);
  const t = await O.confirmVacancy(AGENT, ten.id, {}, mid); assert.equal(t.status, 'vacated'); assert.equal(t.extension.state, 'ended_early');
  await O.advanceAll(D(w, '2027-03-01')); assert.equal((await notes(w, 'cust-1', 'tenancy_extension_ending')).length, 0);
});
await test('tenant disagreeing with the inspection opens a dispute: no confirmation, no reactivation, listing marker removed', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten, end } = await ended(w); await O.confirmVacated(CUST, ten.id, {}, end); await O.recordInspection(AGENT, ten.id, GOOD, end);
  await rejects(O.acknowledgeHandover(CUST, ten.id, { answer: 'disagree', note: '' }, end), 'note_required'); await rejects(O.acknowledgeHandover(CUST, ten.id, { answer: 'maybe' }, end), 'bad_answer');
  let t = await O.acknowledgeHandover(CUST, ten.id, { answer: 'disagree', note: 'The wall was already scratched' }, end); assert.equal(t.status, 'disputed'); assert.equal(t.vacancy.dispute.open, true);
  await rejects(O.confirmVacancy(AGENT, ten.id, {}, end), 'bad_state'); await rejects(O.confirmReady(AGENT, ten.id, {}, end), 'not_vacated');
  assert.equal(listing(w, 'YR').reactivation, undefined); assert.equal((await notes(w, 'agent-77', 'tenancy_vacancy')).filter((n) => /Dispute raised/.test(n.title)).length, 1);
  assert.equal(await O.advanceAll(D(w, '2030-01-01')), 0, 'a disputed tenancy is left alone');
});
await test('a dispute raised AFTER the property was marked ready withdraws the eligibility', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten, end } = await ended(w); await O.confirmVacated(CUST, ten.id, {}, end); await O.recordInspection(AGENT, ten.id, GOOD, end); await O.confirmVacancy(AGENT, ten.id, {}, end); await O.confirmReady(AGENT, ten.id, {}, end);
  assert.equal(listing(w, 'YR').reactivation.eligible, true);
  const t = await O.raiseDispute(CUST, ten.id, 'My deposit was not returned', end); assert.equal(t.status, 'disputed'); assert.equal(listing(w, 'YR').reactivation, undefined); assert.equal(O.relistState(t).eligible, false);
});
await test('disputes: only the person who raised it (or an ACCOOM reviewer in demo mode) can close it; closing restores the process; a reason is always needed', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten, end } = await ended(w); await rejects(O.raiseDispute(CUST, ten.id, 'no', end), 'reason_required'); await rejects(O.raiseDispute(OTHER, ten.id, 'not my tenancy', end), 'forbidden');
  await O.raiseDispute(AGENT, ten.id, 'Tenant left the flat damaged', end); await rejects(O.raiseDispute(CUST, ten.id, 'another dispute', end), 'bad_state');
  await rejects(O.resolveDispute(CUST, ten.id, 'I say it is resolved now'), 'forbidden'); await rejects(O.resolveDispute(OTHER_AGENT, ten.id, 'I say it is resolved now'), 'forbidden'); await rejects(O.resolveDispute({ role: 'admin', id: 'x' }, ten.id, 'I say it is resolved now'), 'forbidden');
  await rejects(O.resolveDispute(AGENT, ten.id, ''), 'note_required');
  let t = await O.resolveDispute(AGENT, ten.id, 'Repairs agreed and paid'); assert.equal(t.status, 'awaiting_vacancy_confirmation'); assert.equal(t.vacancy.dispute.open, false); assert.equal(t.vacancy.dispute.resolution, 'Repairs agreed and paid');
  await O.raiseDispute(CUST, ten.id, 'Deposit not returned', end); admin(w); t = await O.resolveDispute({ role: 'admin', id: 'demo-admin' }, ten.id, 'Reviewer: deposit was returned'); assert.equal(t.status, 'awaiting_vacancy_confirmation');
});
await test('wrong people are refused everywhere: other tenants, other agents, wrong role', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten, end } = await ended(w);
  await rejects(O.confirmVacated(OTHER, ten.id, {}, end), 'forbidden'); await rejects(O.confirmVacated(AGENT, ten.id, {}, end), 'forbidden'); await rejects(O.confirmVacated(null, ten.id, {}, end), 'forbidden');
  await rejects(O.recordInspection(OTHER_AGENT, ten.id, GOOD, end), 'forbidden'); await rejects(O.confirmVacancy(CUST, ten.id, {}, end), 'forbidden'); await rejects(O.acknowledgeHandover(AGENT, ten.id, { answer: 'agree' }, end), 'forbidden');
  await rejects(O.confirmVacated(CUST, 'ten_missing', {}, end), 'not_found');
});
await test('renewal during the Occupancy Extension still works (tenant asks, agent offers, tenant signs and pays); after the extension ended it does not', async () => {
  const w = boot(), O = w.Accoom.Occupancy, T = w.Accoom.Tenancy; const { ten } = await rent(w, 'YR', '2026-01-01'); await O.advanceAll(D(w, '2027-01-01')); const mid = D(w, '2027-02-01');
  await T.decide(CUST, ten.id, 'renew', 'Staying', mid); const r = await T.offerRenewal(AGENT, ten.id, { amount: 1300000, billingPeriod: 'year', periodCount: 1, startDate: '2027-01-01' });
  await w.Accoom.Agreements.markViewed(CUST, r.agreementId); await w.Accoom.Agreements.sign(CUST, r.agreementId, { typedName: 'Chinedu Eze', agreedRead: true }); await T.payRenewalDemo(CUST, r.id);
  assert.equal((await get(w, ten.id)).status, 'renewed'); assert.equal(await O.advanceAll(D(w, '2028-06-01')) >= 0, true); assert.equal((await get(w, ten.id)).status, 'renewed');
  const w2 = boot(); const b = await ended(w2); await rejects(w2.Accoom.Tenancy.decide(CUST, b.ten.id, 'renew', '', b.end), 'bad_state');
});

console.log('\nWording and privacy');
await test('"grace period" appears nowhere in the product: pages, scripts, styles, notifications', async () => {
  const bad = []; const walk = (dir) => { for (const f of readdirSync(dir)) { if (['node_modules', 'dist', '.git', 'tests'].includes(f)) continue; const p = dir + '/' + f, st = statSync(p); if (st.isDirectory()) walk(p); else if (/\.(html|js|css|json|md)$/.test(f) && /grace[ -_]?period/i.test(readFileSync(p, 'utf8'))) bad.push(p); } };
  walk(new URL('..', import.meta.url).pathname.replace(/\/$/, '')); assert.deepEqual(bad.map(String), []);
  const w = boot(), O = w.Accoom.Occupancy; await ended(w); const all = JSON.stringify(await w.Accoom.Records.collection('notifications').all()); assert.ok(!/grace/i.test(all)); assert.ok(/Occupancy Extension/.test(all));
});
await test('nothing an agent can read in the extension, vacancy or handover records contains an email or phone number', async () => {
  const w = boot(), O = w.Accoom.Occupancy; const { ten, end } = await ended(w); await O.confirmVacated(CUST, ten.id, { note: 'moved' }, end); await O.recordInspection(AGENT, ten.id, GOOD, end);
  const seen = JSON.stringify(await w.Accoom.Tenancy.listFor(AGENT)).replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '').replace(/[0-9a-f]{40,}/g, '').replace(/"(ACR|ACTD)-[^"]+"/g, '').replace(/"[a-z]+_[a-z0-9_]+"/g, '');
  assert.ok(!/@/.test(seen)); assert.ok(!/(?:\+?\d[\s().-]?){10,}/.test(seen)); assert.ok(!/"(phone|email|mobile)/i.test(seen));
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
if (failed) process.exit(1);
