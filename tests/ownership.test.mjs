// Permission system Stage 1: listing ownership detection (Accoom.Ownership).
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  PASS ' + name); }
  catch (e) { failed++; console.log('  FAIL ' + name + '\n       ' + (e && e.message)); }
}

function boot(user, catalogue) {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://accoom.test/', runScripts: 'outside-only' });
  const w = dom.window;
  if (user) w.localStorage.setItem('accoom-user', JSON.stringify(user));
  w.Accoom = {};
  w.fetch = () => Promise.reject(new Error('offline'));
  w.eval(readFileSync(new URL('../assets/js/core/sync.js', import.meta.url), 'utf8').replace(/Sync\.ready = pullListings\(\);/, 'Sync.ready = Promise.resolve(true);'));
  if (catalogue) w.Accoom.PropertyService = { getAll: () => catalogue };
  w.eval(readFileSync(new URL('../assets/js/core/ownership.js', import.meta.url), 'utf8'));
  return w.Accoom;
}

// Same hash as the server-side owner key so both agents have a realistic ownerId.
const keyOf = (email) => boot({ role: 'agent', email }).Sync.userKey();
const A = { role: 'agent', email: 'a@x.com', name: 'Agent A' };
const B = { role: 'agent', email: 'b@x.com', name: 'Agent B' };
const keyA = keyOf(A.email), keyB = keyOf(B.email);

console.log('\nOwnership check');
test('guest -> state guest, never own', () => {
  const r = boot(null).Ownership.check({ ownerId: keyA, agentListing: true });
  assert.equal(r.state, 'guest'); assert.equal(r.isOwn, false);
});
test('agent A on A listing (userKey match) -> own', () => {
  assert.equal(boot(A).Ownership.check({ ownerId: keyA, agentListing: true }).state, 'own');
});
test('agent A on B listing -> other', () => {
  const r = boot(A).Ownership.check({ ownerId: keyB, agentListing: true });
  assert.equal(r.state, 'other'); assert.equal(r.isOwn, false);
});
test('legacy local listing ownerId "local-agent" is the signed-in agent\'s own', () => {
  assert.equal(boot(A).Ownership.check({ ownerId: 'local-agent', agentListing: true }).state, 'own');
});
test('legacy "local-agent" is NOT own for a customer', () => {
  assert.equal(boot({ role: 'customer', email: 'c@x.com' }).Ownership.check({ ownerId: 'local-agent', agentListing: true }).state, 'other');
});
test('matches via nested agent.ownerId / agentKey (property page agent object)', () => {
  const O = boot(A).Ownership;
  assert.equal(O.check({ agent: { real: true, agentKey: keyA } }).state, 'own');
  assert.equal(O.check({ agent: { real: true, ownerId: keyB } }).state, 'other');
});
test('account id fields match (id / userId / agentId)', () => {
  assert.equal(boot({ role: 'agent', email: 'q@x.com', id: 'ag-77' }).Ownership.check({ ownerId: 'ag-77', agentListing: true }).state, 'own');
  assert.equal(boot({ role: 'agent', email: 'q@x.com', agentId: 'ag-78' }).Ownership.check({ ownerId: 'ag-78', agentListing: true }).state, 'own');
});
test('synced agentKey overrides a stale local-agent owner marker', () => {
  const O = boot(A).Ownership;
  assert.equal(O.check({ agentListing: true, ownerId: 'local-agent', agentKey: keyB }).state, 'other');
  assert.equal(O.check({ agentListing: true, ownerId: 'local-agent', agentKey: keyA }).state, 'own');
  assert.equal(O.check({ agentListing: true, ownerId: 'local-agent', agent: { ownerId: 'local-agent', agentKey: keyB } }).state, 'other');
});
test('sample (hardcoded) listing with no owner -> other, not own', () => {
  const r = boot(A).Ownership.check({ id: 1, name: 'Sample', agent: { name: 'David O.' } });
  assert.equal(r.state, 'other'); assert.equal(r.isOwn, false);
});
test('real listing with missing ownerId -> unknown (fails safe, not own)', () => {
  const r = boot(A).Ownership.check({ agentListing: true, ownerId: '' });
  assert.equal(r.state, 'unknown'); assert.equal(r.isOwn, false);
});
test('agents cannot contact a real listing or profile whose owner is unverified', () => {
  const O = boot(A, [
    { id: 'a1', agentListing: true, ownerId: keyA },
    { id: 'b1', agentListing: true, ownerId: keyB },
    { id: 'unknown', agentListing: true, ownerId: '' }
  ]).Ownership;
  assert.equal(O.canContact({ real: true }), false);
  assert.equal(O.canContactListingId('unknown'), false);
  assert.equal(O.canContactListingId('not-found'), false);
  assert.equal(O.canContactListingId('a1'), false);
  assert.equal(O.canContactListingId('b1'), true);
});
test('customers and guests retain contact routing for unknown listings', () => {
  const customer = boot({ role: 'customer', email: 'c@x.com' }, []).Ownership;
  const guest = boot(null, []).Ownership;
  assert.equal(customer.canContactListingId('not-found'), true);
  assert.equal(guest.canContactListingId('not-found'), true);
});
test('missing / odd inputs never throw and are never own', () => {
  const O = boot(A).Ownership;
  for (const bad of [null, undefined, {}, [], '', 0, 'undefined', { ownerId: 'null', agentListing: true }]) {
    assert.equal(O.check(bad).isOwn, false);
  }
});
test('plain owner id string (profile link ?owner=...)', () => {
  const O = boot(A).Ownership;
  assert.equal(O.check(keyA).state, 'own');
  assert.equal(O.check(keyB).state, 'other');
});
test('corrupt accoom-user in storage -> guest, no throw', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://accoom.test/', runScripts: 'outside-only' });
  dom.window.localStorage.setItem('accoom-user', '{not json');
  dom.window.Accoom = {};
  dom.window.eval(readFileSync(new URL('../assets/js/core/ownership.js', import.meta.url), 'utf8'));
  assert.equal(dom.window.Accoom.Ownership.check({ ownerId: 'x', agentListing: true }).state, 'guest');
});

console.log('\nCatalogue cards / listing details / profile');
const catalogue = [
  { id: 'a1', agentListing: true, ownerId: keyA, agent: { real: true, ownerId: keyA } },
  { id: 'b1', agentListing: true, ownerId: keyB, agent: { real: true, ownerId: keyB } },
  { id: 7, name: 'Sample card', agent: { name: 'David O.' } }
];
test('checkListingId on catalogue cards: own / other / sample / not found', () => {
  const O = boot(A, catalogue).Ownership;
  assert.equal(O.checkListingId('a1').state, 'own');
  assert.equal(O.checkListingId('b1').state, 'other');
  assert.equal(O.checkListingId(7).state, 'other');
  assert.equal(O.checkListingId('zzz').state, 'unknown');
  assert.equal(O.isOwnListingId('a1'), true);
  assert.equal(O.isOwnListingId('b1'), false);
});
test('no stale state: switching signed-in agent in the same page gives the new answer', () => {
  const dom = new JSDOM('<!doctype html><body></body>', { url: 'https://accoom.test/', runScripts: 'outside-only' });
  const w = dom.window; w.Accoom = {};
  w.eval(readFileSync(new URL('../assets/js/core/ownership.js', import.meta.url), 'utf8'));
  const l = { ownerId: 'ag-1', agentListing: true };
  w.localStorage.setItem('accoom-user', JSON.stringify({ role: 'agent', email: 'a@x.com', id: 'ag-1' }));
  assert.equal(w.Accoom.Ownership.check(l).state, 'own');
  w.localStorage.setItem('accoom-user', JSON.stringify({ role: 'agent', email: 'b@x.com', id: 'ag-2' }));
  assert.equal(w.Accoom.Ownership.check(l).state, 'other');
  w.localStorage.removeItem('accoom-user');
  assert.equal(w.Accoom.Ownership.check(l).state, 'guest');
});

console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
