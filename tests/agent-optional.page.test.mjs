// Agent details are OPTIONAL and live in Account Settings. Agents are never forced through a details screen.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { JSDOM, VirtualConsole } from 'jsdom';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { webcrypto } from 'node:crypto';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { localResourceOptions } from './local-resources.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = http.createServer(async (req, res) => {
  try { const p = join(ROOT, decodeURIComponent(req.url.split('?')[0])); const b = await readFile(p); res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream' }); res.end(b); }
  catch { res.writeHead(404); res.end('nf'); }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = 'http://127.0.0.1:' + server.address().port;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// A freshly signed-up agent: only what signup + onboarding gave us. NO agentProfileCompleted.
const freshAgent = { role: 'agent', name: 'Bola Agent', email: 'bola@example.com', agentType: 'agent', createdAt: '2026-11-01T10:00:00.000Z' };
const customer = { role: 'customer', name: 'Cee Customer', email: 'cee@example.com' };

async function open(path, user) {
  const vc = new VirtualConsole();
  const dom = await JSDOM.fromURL(base + '/' + path, { runScripts: 'dangerously', resources: localResourceOptions(base), pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange; Object.defineProperty(w, 'crypto', { value: webcrypto, configurable: true });
      w.matchMedia = () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
      w.HTMLMediaElement.prototype.play = () => Promise.resolve(); w.HTMLMediaElement.prototype.pause = () => {};
      w.scrollTo = () => {}; w.Element.prototype.scrollIntoView = () => {}; w.fetch = () => Promise.reject(new Error('no fetch'));
      if (user) w.localStorage.setItem('accoom-user', JSON.stringify(user));
    } });
  await sleep(2500);
  return dom.window;
}
let p = 0, f = 0;
async function test(name, fn) { try { await fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

console.log('Agent details are optional');

await test('the old agent-details screen is gone and nothing links to it', () => {
  assert.ok(!existsSync(join(ROOT, 'agent-details.html')));
  const files = readdirSync(ROOT).filter((n) => n.endsWith('.html'));
  for (const n of files) assert.ok(!/href="agent-details\.html|replace\('agent-details\.html'\)/.test(readFileSync(join(ROOT, n), 'utf8')), n + ' still points at agent-details.html');
  for (const js of ['auth', 'onboarding']) assert.ok(!readFileSync(join(ROOT, 'assets/js/pages/' + js + '.js'), 'utf8').includes('agent-details.html'), js + '.js still routes to agent-details.html');
});

await test('no page bounces an agent for an unfinished profile', () => {
  for (const n of readdirSync(ROOT).filter((x) => x.endsWith('.html'))) {
    assert.ok(!/!user\.agentProfileCompleted/.test(readFileSync(join(ROOT, n), 'utf8')), n + ' still gates on agentProfileCompleted');
  }
});

await test('a fresh agent can open the agent dashboard', async () => {
  const w = await open('agent-dashboard.html', freshAgent);
  assert.ok(w.location.pathname.endsWith('agent-dashboard.html'), 'ended on ' + w.location.pathname);
});

await test('a fresh agent can open add listing and my listings', async () => {
  for (const page of ['addlistings.html', 'my-listings.html']) {
    const w = await open(page, freshAgent);
    assert.ok(w.location.pathname.endsWith(page), page + ' redirected to ' + w.location.pathname);
  }
});

await test('login, Google sign-in and onboarding send an agent to the agent dashboard (jsdom cannot navigate, so the routing code is checked)', () => {
  const auth = readFileSync(join(ROOT, 'assets/js/pages/auth.js'), 'utf8');
  assert.ok(auth.includes("goAfterDelay(msg, back || 'agent-dashboard.html')"));
  const authHtml = readFileSync(join(ROOT, 'auth.html'), 'utf8');
  assert.ok(authHtml.includes("window.location.replace(back || 'agent-dashboard.html')"));
  const onb = readFileSync(join(ROOT, 'assets/js/pages/onboarding.js'), 'utf8');
  assert.ok(onb.includes("state.role === 'agent' ? (back || 'agent-dashboard.html')"));
  // an agent who has not finished onboarding (no role yet) still goes to onboarding first
  assert.ok(auth.includes("goAfterDelay(msg, 'onboarding.html')"));
});

await test('the agent side panel Account Settings link opens the Agent Details card on every agent page', () => {
  for (const n of ['agent-dashboard.html', 'my-listings.html', 'addlistings.html', 'payout.html']) {
    const h = readFileSync(join(ROOT, n), 'utf8');
    const m = h.match(/<a href="([^"]*)"[^>]*class="ag-dash-nav-link"[^>]*>(?:(?!<\/a>)[\s\S])*?<span>Account Settings<\/span>/);
    assert.ok(m && m[1] === 'account-settings.html#agent-details', n + ' Account Settings link is ' + (m && m[1]));
  }
});

await test('account settings shows the optional Agent Details card to an agent, prefilled and not required', async () => {
  const w = await open('account-settings.html', { ...freshAgent, city: 'Lagos', businessName: 'Bola Realty' });
  const card = w.document.querySelector('[data-agent-only]');
  assert.ok(card && !card.hidden, 'card should be visible for an agent');
  assert.equal(w.document.getElementById('aad-city').value, 'Lagos');
  assert.equal(w.document.getElementById('aad-business').value, 'Bola Realty');
  assert.equal(card.querySelectorAll('[required]').length, 0, 'nothing in the card may be required');
  assert.ok(!card.querySelector('[data-aad-field="name"], [data-aad-field="email"], [data-aad-field="phone"]'), 'name/email/phone are not asked again');
});

await test('saving with every field empty works and keeps the signed-in identity', async () => {
  const w = await open('account-settings.html', freshAgent);
  w.document.querySelector('[data-agent-form]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(300);
  const u = JSON.parse(w.localStorage.getItem('accoom-user'));
  assert.equal(u.email, 'bola@example.com'); assert.equal(u.name, 'Bola Agent'); assert.equal(u.role, 'agent');
  assert.equal(u.ninVerified, false);
  assert.ok(!w.document.querySelector('[data-aad-success]').hidden, 'success message shown');
});

await test('a customer never sees the Agent Details card', async () => {
  const w = await open('account-settings.html', customer);
  assert.ok(w.document.querySelector('[data-agent-only]').hidden);
});

console.log('\n' + p + ' passed, ' + f + ' failed');
server.close();
process.exit(f ? 1 : 0);
