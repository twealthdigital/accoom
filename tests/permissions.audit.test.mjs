// Permissions Stage 6: static audit. Every place that can start a contact or a payment must go through
// Accoom.Ownership, so a NEW button or page cannot quietly bypass the rules.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';

const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const htmlFiles = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
const jsFiles = [];
(function walk(dir) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor') walk(rel); } else if (e.name.endsWith('.js')) jsFiles.push(rel);
  }
})('assets/js');

let p = 0, f = 0;
function test(name, fn) { try { fn(); p++; console.log('  PASS ' + name); } catch (e) { f++; console.log('  FAIL ' + name + '\n       ' + e.message); } }

const CONTACT_ATTR = /data-(pd-contact-agent|ap-contact|contact-agent|message-agent|chat-agent)/;

console.log('Pages');
test('1. a page with a "Contact Agent" control marks it with a gated contact attribute', () => {
  for (const h of htmlFiles) {
    const src = read(h);
    if (/>\s*Contact Agent\s*</.test(src.replace(/<[^>]+>/g, '><'))) assert.ok(CONTACT_ATTR.test(src), h + ' has a Contact Agent control without a data-*-contact attribute');
  }
});
test('2. "Make Payment" / pay buttons exist only on the property page and the two chat pages', () => {
  const allowed = new Set(['property.html', 'contact-agent.html', 'messages.html']);
  for (const h of htmlFiles) {
    if (/Make Payment|data-pd-payment|data-msgs-pay-btn/.test(read(h))) assert.ok(allowed.has(h), h + ' has a payment control that is not covered by an ownership gate');
  }
});
test('3. no page other than payment.html links straight to payment.html in markup', () => {
  for (const h of htmlFiles) if (h !== 'payment.html') assert.ok(!/href="payment\.html/.test(read(h)), h + ' links to payment.html');
});

console.log('Scripts');
test('4. every script that stores a contact request checks ownership first', () => {
  for (const j of jsFiles) {
    const src = read(j);
    if (/setStorage\('accoom-contact-request'/.test(src)) assert.ok(/Ownership\./.test(src), j + ' stores a contact request without Accoom.Ownership');
  }
});
test('5. every script that opens payment.html with a listing id checks ownership', () => {
  for (const j of jsFiles) {
    const src = read(j);
    if (/payment\.html\?id=|'payment\.html'\s*\n?\s*\+/.test(src)) assert.ok(/Ownership\./.test(src), j + ' opens payment.html without Accoom.Ownership');
  }
});
test('6. payment.js fails closed: page access check, and the check also runs before money moves', () => {
  const src = read('assets/js/pages/payment.js');
  assert.ok(/canAccessPaymentPage/.test(src));
  assert.ok((src.match(/accessNow\(\)/g) || []).length >= 2, 'accessNow() should be called on load and again before wallet changes');
});
test('7. the chat pages gate every payment path through canPayInChat', () => {
  const src = read('assets/js/pages/contact-agent.js');
  assert.ok((src.match(/canPayInChat\(/g) || []).length >= 8);
});
test('8. every screen that lists stored conversations skips self chats', () => {
  for (const j of ['assets/js/main.js', 'assets/js/pages/contact-agent.js']) assert.ok(/isSelfConversation/.test(read(j)), j);
});
test('9. ownership.js loads on every page that loads properties.js or sync.js', () => {
  for (const h of htmlFiles) {
    const src = read(h);
    if (/core\/sync\.js|data\/properties\.js/.test(src)) assert.ok(/core\/ownership\.js/.test(src), h + ' is missing ownership.js');
  }
});

console.log('\n' + p + ' passed, ' + f + ' failed');
process.exit(f ? 1 : 0);
