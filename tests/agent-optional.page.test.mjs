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

await test('the agent side panel Account Settings link opens the AGENT settings page on every agent page', () => {
  for (const n of ['agent-dashboard.html', 'my-listings.html', 'addlistings.html', 'payout.html']) {
    const h = readFileSync(join(ROOT, n), 'utf8');
    const m = h.match(/<a href="([^"]*)"[^>]*class="ag-dash-nav-link"[^>]*>(?:(?!<\/a>)[\s\S])*?<span>Account Settings<\/span>/);
    assert.ok(m && m[1] === 'agent-account-settings.html', n + ' Account Settings link is ' + (m && m[1]));
  }
});

await test('customer account settings has nothing agent related, and sends agents to their own page', () => {
  const h = readFileSync(join(ROOT, 'account-settings.html'), 'utf8');
  assert.ok(!/agent-details|data-agent-form|aad-|languages\.js|account-agent|agent-account/.test(h.replace("window.location.replace('agent-account-settings.html')", '')), 'agent markup leaked into the customer page');
  assert.ok(h.includes("window.location.replace('agent-account-settings.html')"), 'agents must be sent to their own settings page');
});

await test('agent settings page uses the agent layout and shares no customer profile markup or css', () => {
  const h = readFileSync(join(ROOT, 'agent-account-settings.html'), 'utf8');
  assert.ok(h.includes('ag-dash-sidebar') && h.includes('agent-dashboard.css'));
  assert.ok(!/profile\.css|profile-sidebar|profile-page|profile-layout|class="[^"]*\bas-/.test(h), 'customer profile markup/css found');
  const js = readFileSync(join(ROOT, 'assets/js/pages/agent-account-settings.js'), 'utf8');
  assert.ok(!js.includes('.profile-page') && !js.includes("'accoom-notification-prefs'"));
});

await test('agent settings page: agent sees every card, agent details optional and prefilled, identity comes from signup', async () => {
  const w = await open('agent-account-settings.html', { ...freshAgent, city: 'Lagos', businessName: 'Bola Realty' });
  const d = w.document;
  assert.ok(w.location.pathname.endsWith('agent-account-settings.html'));
  assert.equal(d.querySelector('[data-ag-name]').textContent, 'Bola Agent');
  assert.equal(d.querySelector('[data-aas-info="email"]').textContent, 'bola@example.com');
  assert.equal(d.querySelector('[data-aas-info="accountType"]').textContent, 'Agent');
  assert.ok(!d.querySelector('[data-details-form]') && !d.querySelector('[data-notif-settings]'), 'agent page has no personal details or notification cards');
  const card = d.getElementById('agent-details');
  assert.ok(card && !card.hidden);
  assert.equal(d.getElementById('aad-city').value, 'Lagos');
  assert.equal(d.getElementById('aad-business').value, 'Bola Realty');
  assert.equal(card.querySelectorAll('[required]').length, 0, 'nothing in the agent details card may be required');
  assert.ok(!card.querySelector('[data-aad-field="name"], [data-aad-field="email"], [data-aad-field="phone"]'), 'name/email/phone are not asked again');
});

await test('saving agent details with every field empty works and keeps the signed-in identity', async () => {
  const w = await open('agent-account-settings.html', freshAgent);
  w.document.querySelector('[data-agent-form]').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await sleep(300);
  const u = JSON.parse(w.localStorage.getItem('accoom-user'));
  assert.equal(u.email, 'bola@example.com'); assert.equal(u.name, 'Bola Agent'); assert.equal(u.role, 'agent');
  assert.equal(u.ninVerified, false);
  assert.ok(!w.document.querySelector('[data-aad-success]').hidden, 'success message shown');
});

await test('a customer opening the agent settings page is not shown it (gate script sends them away)', () => {
  const h = readFileSync(join(ROOT, 'agent-account-settings.html'), 'utf8');
  assert.ok(h.includes("user.role === 'customer'"));
  const js = readFileSync(join(ROOT, 'assets/js/pages/agent-account-settings.js'), 'utf8');
  assert.ok(js.includes("window.location.replace(user.role === 'customer' ? 'account-settings.html'"));
});

console.log('\n' + p + ' passed, ' + f + ' failed');
server.close();
process.exit(f ? 1 : 0);
